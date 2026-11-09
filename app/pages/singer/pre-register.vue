<script setup lang="ts">
import type { CompetitionFormFieldKey, CompetitionRegistrationStatus } from '~~/shared/types'

definePageMeta({ layout: false })

useSeoMeta({
  title: '新声歌手大赛 · 预报名 | 仰恩大学音乐协会',
  robots: 'noindex, nofollow'
})

const status = ref<CompetitionRegistrationStatus | null>(null)
const statusError = ref('')
const submitting = ref(false)
const succeeded = ref<string | null>(null)
const errorMessage = ref('')

const form = reactive({
  name: '',
  className: '',
  studentNo: '',
  phone: '',
  email: '',
  song: '',
  preferredDay: null as number | null
})

const ROUND_LABELS: Record<string, string> = { prelim: '初赛', semi: '复赛', final: '决赛' }

const schedule = computed(() => status.value?.schedule ?? [])

/** 初赛那两行，用来做「打算哪天来」的选项。 */
const prelimDays = computed(() => schedule.value.filter(item => item.key === 'prelim'))

const formFields = computed(() => (status.value?.formFields ?? []).filter(field => field.enabled))

const fieldMeta = computed(() => {
  const map = new Map<CompetitionFormFieldKey, { label: string, required: boolean }>()
  for (const field of formFields.value) map.set(field.key, { label: field.label, required: field.required })
  return map
})

function labelOf(key: CompetitionFormFieldKey, fallback: string): string {
  return fieldMeta.value.get(key)?.label ?? fallback
}

function requiredOf(key: CompetitionFormFieldKey): boolean {
  return fieldMeta.value.get(key)?.required === true
}

function has(key: CompetitionFormFieldKey): boolean {
  return fieldMeta.value.has(key)
}

function dayLabel(index: number): string {
  const item = prelimDays.value[index - 1]
  if (!item) return index === 1 ? '第一天' : '第二天'
  return `${item.dateLabel}${item.venue ? ` · ${item.venue}` : ''}`
}

function serverErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback
  const data = (error as { data?: { data?: { message?: string, issues?: Array<{ message?: string }>, code?: string } } }).data?.data
  if (data?.message) return data.message
  const issue = data?.issues?.find(item => item?.message)
  return issue?.message ?? fallback
}

async function loadStatus(): Promise<void> {
  try {
    status.value = await $fetch<CompetitionRegistrationStatus>('/api/public/competition/register')
  } catch {
    statusError.value = '报名状态获取失败，请刷新重试。'
  }
}

async function submit(): Promise<void> {
  if (submitting.value) return
  const missing: Array<[CompetitionFormFieldKey, string, boolean]> = [
    ['name', form.name.trim(), true],
    ['className', form.className.trim(), false],
    ['studentNo', form.studentNo.trim(), false],
    ['phone', form.phone.trim(), false],
    ['email', form.email.trim(), false],
    ['song', form.song.trim(), false]
  ]
  for (const [key, value, isName] of missing) {
    if (!has(key)) continue
    if (!requiredOf(key)) continue
    if (value) continue
    errorMessage.value = isName
      ? `请填写${labelOf(key, '姓名')}`
      : `请填写${labelOf(key, key)}`
    return
  }
  if (has('preferredDay') && requiredOf('preferredDay') && !form.preferredDay) {
    errorMessage.value = '请选择打算哪天来'
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    await $fetch<{ id: string }>('/api/public/competition/pre-register', {
      method: 'POST',
      body: {
        ...(has('name') ? { name: form.name.trim() } : {}),
        ...(has('className') && form.className.trim() ? { className: form.className.trim() } : {}),
        ...(has('studentNo') && form.studentNo.trim() ? { studentNo: form.studentNo.trim() } : {}),
        ...(has('phone') && form.phone.trim() ? { phone: form.phone.trim() } : {}),
        ...(has('email') && form.email.trim() ? { email: form.email.trim() } : {}),
        ...(has('song') && form.song.trim() ? { song: form.song.trim() } : {}),
        ...(has('preferredDay') && form.preferredDay ? { preferredDay: form.preferredDay } : {})
      }
    })
    succeeded.value = form.name.trim() || '报名成功'
  } catch (error) {
    const code = typeof error === 'object' && error !== null
      ? (error as { data?: { data?: { code?: string } } }).data?.data?.code
      : undefined
    const httpStatus = typeof error === 'object' && error !== null
      ? (error as { statusCode?: number }).statusCode
      : undefined
    if (code === 'ALREADY_PRE_REGISTERED') {
      errorMessage.value = serverErrorMessage(error, '该学号已预报名过，请勿重复提交。')
    } else if (code === 'COMPETITION_REGISTRATION_CLOSED') {
      errorMessage.value = serverErrorMessage(error, '报名已结束，请联系音乐协会工作人员。')
    } else if (code === 'RATE_LIMITED' || httpStatus === 429) {
      errorMessage.value = '提交过于频繁，请稍后再试。'
    } else {
      errorMessage.value = serverErrorMessage(error, '提交失败，请检查网络后重试。')
    }
  } finally {
    submitting.value = false
  }
}

const successHint = computed(() => {
  const first = prelimDays.value[0]
  if (!first) return '到了现场扫码确认，信息会自动带出来。'
  const second = prelimDays.value[1]
  const dates = second
    ? `${first.dateLabel.replace(/（.*?）/g, '')} 或 ${second.dateLabel.replace(/（.*?）/g, '')} 任选一天`
    : first.dateLabel
  return `${dates}，${first.timeLabel.replace(' 开始', '')} ${first.venue}见。到了扫现场码确认，信息会自动带出来。`
})

onMounted(loadStatus)
</script>

<template>
  <div class="min-h-dvh bg-gradient-to-b from-[#ffe8d9] via-[#fdf6ec] to-[#ddf3ea] text-[#33413a]">
    <main class="mx-auto max-w-lg px-4 py-8 sm:py-12">
      <header class="text-center">
        <NuxtLink
          to="/singer"
          class="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold tracking-wider text-[#b4552f] shadow-sm"
        >
          仰恩大学音乐协会 · {{ status?.title ?? '新声歌手大赛' }}
        </NuxtLink>
        <h1 class="mt-5 text-2xl font-black text-[#2f3a34]">
          {{ status?.edition ? `${status.edition} 预报名` : '赛前预报名' }}
        </h1>
      </header>

      <div
        v-if="statusError"
        class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        role="alert"
      >
        {{ statusError }}
      </div>

      <div
        v-else-if="status && !status.open"
        class="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-center text-sm text-amber-900"
        role="status"
      >
        <UIcon
          name="i-lucide-clock"
          class="mx-auto size-6 text-amber-600"
          aria-hidden="true"
        />
        <p class="mt-2 font-bold">
          报名已结束
        </p>
        <p class="mt-1 leading-6">
          本期报名已关闭。如有特殊情况，请联系音乐协会工作人员。
        </p>
      </div>

      <div
        v-else-if="succeeded"
        class="mt-6 rounded-2xl bg-white/90 p-6 text-center shadow-md ring-1 ring-[#f2d8c4]"
      >
        <UIcon
          name="i-lucide-circle-check"
          class="mx-auto size-10 text-green-600"
          aria-hidden="true"
        />
        <h2 class="mt-3 text-xl font-black text-[#2f3a34]">
          报好名了！
        </h2>
        <p class="mt-2 text-sm leading-6 text-[#4a564e]">
          {{ succeeded }}，{{ successHint }} 通知在初赛群发。
        </p>
        <div class="mt-5 flex justify-center gap-2">
          <NuxtLink
            to="/singer"
            class="inline-flex items-center gap-2 rounded-xl bg-[#e2725b] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#d05f48]"
          >
            返回赛事介绍
          </NuxtLink>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-[#4a564e] ring-1 ring-zinc-200 transition hover:bg-zinc-50"
            @click="succeeded = null; form.name = ''; form.preferredDay = null"
          >
            继续帮同学报名
          </button>
        </div>
      </div>

      <form
        v-else
        class="mt-6 space-y-4 rounded-2xl bg-white/90 p-5 shadow-md ring-1 ring-[#f2d8c4] sm:p-6"
        @submit.prevent="submit"
      >
        <section
          v-if="schedule.length"
          class="rounded-xl bg-[#fff7ee] px-3.5 py-3 ring-1 ring-[#f3ddc9]"
        >
          <p class="text-xs font-bold tracking-wider text-[#b4552f]">
            比赛时间与地点
          </p>
          <ul class="mt-2 space-y-1.5">
            <li
              v-for="(item, index) in schedule"
              :key="`${item.key}-${index}`"
              class="flex flex-wrap items-baseline gap-x-2 text-xs leading-5 text-[#5b675d]"
            >
              <span class="rounded bg-white px-1.5 py-0.5 font-semibold text-[#b4552f] ring-1 ring-[#f0d6c1]">
                {{ ROUND_LABELS[item.key] ?? item.key }}
              </span>
              <span class="font-medium text-[#33413a]">{{ item.dateLabel }}</span>
              <span>{{ item.timeLabel }}</span>
              <span class="text-[#7a857c]">{{ item.venue }}</span>
              <span
                v-if="item.note"
                class="text-[#9aa39b]"
              >{{ item.note }}</span>
            </li>
          </ul>
        </section>

        <div v-if="has('name')">
          <label
            class="block text-sm font-semibold text-[#33413a]"
            for="pre-name"
          >
            {{ labelOf('name', '姓名') }}
            <span
              v-if="requiredOf('name')"
              class="text-[#c2543c]"
            >*</span>
          </label>
          <input
            id="pre-name"
            v-model="form.name"
            :required="requiredOf('name')"
            maxlength="40"
            name="name"
            autocomplete="name"
            class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
            placeholder="你的姓名"
          >
        </div>

        <div v-if="has('preferredDay')">
          <p class="block text-sm font-semibold text-[#33413a]">
            打算哪天来
            <span
              v-if="requiredOf('preferredDay')"
              class="text-[#c2543c]"
            >*</span>
          </p>
          <div class="mt-1.5 grid gap-2 sm:grid-cols-2">
            <button
              v-for="day in [1, 2]"
              :key="day"
              type="button"
              class="rounded-xl border px-3 py-2.5 text-left text-sm transition"
              :class="form.preferredDay === day
                ? 'border-[#e2725b] bg-[#fff1ea] text-[#a8452f] shadow-sm'
                : 'border-zinc-300 bg-white text-[#4a564e] hover:border-[#e6a48f]'"
              @click="form.preferredDay = form.preferredDay === day ? null : day"
            >
              <span class="block font-bold">{{ day === 1 ? '第一天' : '第二天' }}</span>
              <span class="mt-0.5 block text-xs text-[#7a857c]">{{ dayLabel(day) }}</span>
            </button>
          </div>
        </div>

        <template v-if="has('className') || has('studentNo') || has('phone') || has('email')">
          <p
            v-if="!requiredOf('className') || !requiredOf('studentNo') || !requiredOf('phone') || !requiredOf('email')"
            class="text-xs font-bold tracking-wider text-[#b4552f]"
          >
            选填
          </p>

          <div class="grid gap-4 sm:grid-cols-2">
            <div v-if="has('className')">
              <label
                class="block text-sm font-semibold text-[#33413a]"
                for="pre-class"
              >
                {{ labelOf('className', '班级') }}
                <span
                  v-if="!requiredOf('className')"
                  class="text-xs font-normal text-[#8b968c]"
                >（选填）</span>
                <span
                  v-else
                  class="text-[#c2543c]"
                >*</span>
              </label>
              <input
                id="pre-class"
                v-model="form.className"
                :required="requiredOf('className')"
                maxlength="60"
                name="className"
                class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
                placeholder="如 26工商管理1班"
              >
            </div>
            <div v-if="has('studentNo')">
              <label
                class="block text-sm font-semibold text-[#33413a]"
                for="pre-student-no"
              >
                {{ labelOf('studentNo', '学号') }}
                <span
                  v-if="!requiredOf('studentNo')"
                  class="text-xs font-normal text-[#8b968c]"
                >（选填）</span>
                <span
                  v-else
                  class="text-[#c2543c]"
                >*</span>
              </label>
              <input
                id="pre-student-no"
                v-model="form.studentNo"
                :required="requiredOf('studentNo')"
                maxlength="20"
                name="studentNo"
                class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
                placeholder="录取通知书 / 学生证上的学号"
              >
            </div>
            <div v-if="has('phone')">
              <label
                class="block text-sm font-semibold text-[#33413a]"
                for="pre-phone"
              >
                {{ labelOf('phone', '联系电话') }}
                <span
                  v-if="!requiredOf('phone')"
                  class="text-xs font-normal text-[#8b968c]"
                >（选填）</span>
                <span
                  v-else
                  class="text-[#c2543c]"
                >*</span>
              </label>
              <input
                id="pre-phone"
                v-model="form.phone"
                :required="requiredOf('phone')"
                maxlength="11"
                name="phone"
                type="tel"
                inputmode="numeric"
                class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
                placeholder="常用手机号"
              >
            </div>
            <div v-if="has('email')">
              <label
                class="block text-sm font-semibold text-[#33413a]"
                for="pre-email"
              >
                {{ labelOf('email', '邮箱') }}
                <span
                  v-if="!requiredOf('email')"
                  class="text-xs font-normal text-[#8b968c]"
                >（选填）</span>
                <span
                  v-else
                  class="text-[#c2543c]"
                >*</span>
              </label>
              <input
                id="pre-email"
                v-model="form.email"
                :required="requiredOf('email')"
                maxlength="120"
                name="email"
                type="email"
                class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
                placeholder="用于接收比赛结果通知"
              >
            </div>
          </div>
        </template>

        <div v-if="has('song')">
          <label
            class="block text-sm font-semibold text-[#33413a]"
            for="pre-song"
          >
            {{ labelOf('song', '想唱的歌') }}
            <span
              v-if="!requiredOf('song')"
              class="text-xs font-normal text-[#8b968c]"
            >（选填，可待定）</span>
            <span
              v-else
              class="text-[#c2543c]"
            >*</span>
          </label>
          <input
            id="pre-song"
            v-model="form.song"
            :required="requiredOf('song')"
            maxlength="80"
            name="song"
            class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
            placeholder="歌名"
          >
        </div>

        <p
          v-if="errorMessage"
          class="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700"
          role="alert"
        >
          {{ errorMessage }}
        </p>

        <button
          type="submit"
          :disabled="submitting || Boolean(status && !status.open)"
          class="flex w-full items-center justify-center gap-2 rounded-xl bg-[#e2725b] px-4 py-3 text-base font-bold text-white shadow transition hover:bg-[#d05f48] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <UIcon
            v-if="submitting"
            name="i-lucide-loader-circle"
            class="size-4 animate-spin"
            aria-hidden="true"
          />
          {{ submitting ? '提交中…' : '提交预报名' }}
        </button>
      </form>

      <p class="mt-6 pb-6 text-center text-xs text-[#a8b0a6]">
        主办：仰恩大学音乐协会 · 咨询请在初赛群内联系工作人员
      </p>
    </main>
  </div>
</template>
