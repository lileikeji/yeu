<script setup lang="ts">
import type { CompetitionReceiptState, CompetitionResultLookup } from '~~/shared/types'

definePageMeta({ layout: false })

useSeoMeta({
  title: '查询比赛结果',
  robots: 'noindex, nofollow'
})

const route = useRoute()

const form = reactive({ name: '', studentNo: '', contact: '' })
const loading = ref(false)
const errorMessage = ref('')
const result = ref<CompetitionResultLookup | null>(null)
const tokenInUrl = computed(() => {
  const raw = route.query.token
  return Array.isArray(raw) ? String(raw[0] ?? '') : String(raw ?? '')
})
const receiptDone = ref(false)
const receipting = ref(false)
const receiptError = ref('')

function fillError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '查询失败，请稍后再试'
  const data = (error as { data?: { data?: { message?: string } } }).data?.data
  return data?.message ?? '查询失败，请稍后再试'
}

async function lookup(): Promise<void> {
  if (loading.value) return
  if (!form.name.trim() || !form.studentNo.trim() || !form.contact.trim()) {
    errorMessage.value = '姓名、学号和 QQ 或邮箱都要填'
    return
  }
  loading.value = true
  errorMessage.value = ''
  result.value = null
  receiptDone.value = false
  try {
    result.value = await $fetch<CompetitionResultLookup>('/api/public/competition/result/lookup', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        studentNo: form.studentNo.trim(),
        contact: form.contact.trim()
      }
    })
    receiptDone.value = Boolean(result.value.receipt.confirmedAt)
  } catch (error) {
    errorMessage.value = fillError(error)
  } finally {
    loading.value = false
  }
}

async function confirmReceipt(token: string): Promise<void> {
  if (receipting.value || !token) return
  receipting.value = true
  receiptError.value = ''
  try {
    const data = await $fetch<CompetitionReceiptState>('/api/public/competition/result/receipt', {
      method: 'POST',
      body: { token }
    })
    receiptDone.value = Boolean(data.confirmedAt)
  } catch (error) {
    receiptError.value = fillError(error)
  } finally {
    receipting.value = false
  }
}

const bodyLines = computed(() => (result.value?.body ?? '').split('\n').map(line => line.trim()).filter(Boolean))
</script>

<template>
  <div class="singer-canvas min-h-dvh px-4 py-8 text-[var(--ink)]">
    <div class="mx-auto w-full max-w-lg">
      <p class="text-center text-xs tracking-[0.2em] text-[var(--accent-warm)]">
        仰恩大学音乐协会 · 新声歌手大赛
      </p>
      <h1 class="mt-2 text-center text-2xl font-black">
        查询比赛结果
      </h1>

      <div
        v-if="tokenInUrl"
        class="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 text-center"
      >
        <template v-if="receiptDone">
          <p class="text-lg font-bold text-[var(--color-green-700)]">
            已经确认收到了
          </p>
          <p class="mt-1 text-sm text-[var(--muted-ink)]">
            谢谢，工作人员已经看到你的确认。
          </p>
        </template>
        <template v-else>
          <p class="text-sm text-[var(--muted-ink)]">
            点一下按钮，告诉工作人员你收到了通知。
          </p>
          <button
            type="button"
            class="mt-4 w-full rounded-xl bg-[var(--color-green-700)] px-4 py-3 text-base font-bold text-white disabled:opacity-60"
            :disabled="receipting"
            @click="confirmReceipt(tokenInUrl)"
          >
            {{ receipting ? '提交中…' : '我收到了' }}
          </button>
          <p
            v-if="receiptError"
            class="mt-2 text-sm text-red-600"
          >
            {{ receiptError }}
          </p>
        </template>
      </div>

      <template v-else>
        <div class="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4">
          <p class="text-sm text-[var(--muted-ink)]">
            填姓名、学号和 QQ 或邮箱，三项都对了才能查到。
          </p>
          <div class="mt-3 space-y-3">
            <input
              v-model="form.name"
              maxlength="40"
              placeholder="姓名"
              class="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-base outline-none focus:border-[var(--color-green-600)]"
            >
            <input
              v-model="form.studentNo"
              maxlength="30"
              inputmode="numeric"
              placeholder="学号"
              class="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-base outline-none focus:border-[var(--color-green-600)]"
            >
            <input
              v-model="form.contact"
              maxlength="120"
              placeholder="QQ 号或 QQ 邮箱"
              class="w-full rounded-xl border border-[var(--line)] px-3 py-2.5 text-base outline-none focus:border-[var(--color-green-600)]"
            >
          </div>
          <button
            type="button"
            class="mt-4 w-full rounded-xl bg-[var(--color-green-700)] px-4 py-3 text-base font-bold text-white disabled:opacity-60"
            :disabled="loading"
            @click="lookup"
          >
            {{ loading ? '查询中…' : '查询' }}
          </button>
          <p
            v-if="errorMessage"
            class="mt-2 text-sm text-red-600"
          >
            {{ errorMessage }}
          </p>
        </div>

        <div
          v-if="result"
          class="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"
        >
          <p class="text-xs text-[var(--accent-warm)]">
            {{ result.roundTitle }} · {{ result.singerName }}
          </p>
          <h2 class="mt-1 text-lg font-bold">
            {{ result.subject }}
          </h2>
          <div class="mt-2 space-y-1.5 text-sm leading-6 text-[var(--ink)]">
            <p
              v-for="(line, index) in bodyLines"
              :key="index"
            >
              {{ line }}
            </p>
          </div>
          <p
            v-if="receiptDone"
            class="mt-3 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--color-green-700)]"
          >
            已经确认收到了
          </p>
          <button
            v-else
            type="button"
            class="mt-3 w-full rounded-xl bg-[var(--color-green-700)] px-4 py-3 text-base font-bold text-white disabled:opacity-60"
            :disabled="receipting"
            @click="confirmReceipt(result.receiptToken)"
          >
            {{ receipting ? '提交中…' : '我收到了' }}
          </button>
          <NuxtLink
            v-if="result.roundKey !== 'prelim'"
            :to="`/singer/song?token=${result.receiptToken}`"
            class="mt-3 block w-full rounded-xl border border-[var(--color-green-700)] px-4 py-3 text-center text-base font-bold text-[var(--color-green-700)]"
          >
            填这一轮的参赛曲目
          </NuxtLink>
          <p
            v-if="receiptError"
            class="mt-2 text-sm text-red-600"
          >
            {{ receiptError }}
          </p>
        </div>
      </template>

      <p class="mt-6 text-center text-xs text-[var(--muted-ink)]">
        主办：仰恩大学音乐协会
      </p>
    </div>
  </div>
</template>
