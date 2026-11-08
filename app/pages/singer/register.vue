<script setup lang="ts">
definePageMeta({ layout: false })

useSeoMeta({
  title: '新生歌手大赛 · 现场登记 | 仰恩大学音乐协会',
  robots: 'noindex, nofollow'
})

interface RegistrationStatus {
  open: boolean
  title: string
}

const status = ref<RegistrationStatus | null>(null)
const statusError = ref('')
const submitting = ref(false)
const succeeded = ref<{ name: string, sortOrder: number } | null>(null)
const errorMessage = ref('')

const form = reactive({
  className: '',
  name: '',
  studentNo: '',
  phone: '',
  email: '',
  song: ''
})

function serverErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback
  const data = (error as { data?: { data?: { message?: string, issues?: Array<{ message?: string }>, code?: string } } }).data?.data
  if (data?.message) return data.message
  const issue = data?.issues?.find(item => item?.message)
  return issue?.message ?? fallback
}

async function loadStatus(): Promise<void> {
  try {
    status.value = await $fetch<RegistrationStatus>('/api/public/competition/register')
  } catch {
    statusError.value = '登记状态获取失败，请刷新重试；如持续失败请联系现场工作人员。'
  }
}

function validateLocally(): string {
  if (!form.name.trim()) return '请填写姓名'
  if (!form.className.trim()) return '请填写班级'
  if (!/^[0-9A-Za-z-]{4,20}$/.test(form.studentNo.trim())) return '请填写正确的学号'
  if (!/^1\d{10}$/.test(form.phone.trim())) return '请填写正确的手机号'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return '请填写正确的邮箱'
  return ''
}

async function submit(): Promise<void> {
  if (submitting.value) return
  const localError = validateLocally()
  if (localError) {
    errorMessage.value = localError
    return
  }

  submitting.value = true
  errorMessage.value = ''
  try {
    const result = await $fetch<{ id: string, sortOrder: number }>('/api/public/competition/register', {
      method: 'POST',
      body: {
        className: form.className.trim(),
        name: form.name.trim(),
        studentNo: form.studentNo.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        song: form.song.trim()
      }
    })
    succeeded.value = { name: form.name.trim(), sortOrder: result.sortOrder }
  } catch (error) {
    const code = typeof error === 'object' && error !== null
      ? (error as { data?: { data?: { code?: string } } }).data?.data?.code
      : undefined
    const status = typeof error === 'object' && error !== null
      ? (error as { statusCode?: number }).statusCode
      : undefined
    if (code === 'SINGER_ALREADY_REGISTERED') {
      errorMessage.value = serverErrorMessage(error, '该学号已完成登记，请勿重复提交。')
    } else if (code === 'COMPETITION_REGISTRATION_CLOSED') {
      errorMessage.value = serverErrorMessage(error, '登记已结束，请联系现场工作人员。')
    } else if (code === 'RATE_LIMITED' || status === 429) {
      errorMessage.value = '提交过于频繁，请稍后再试；如急用请联系现场工作人员代录。'
    } else {
      errorMessage.value = serverErrorMessage(error, '提交失败，请检查网络后重试。')
    }
  } finally {
    submitting.value = false
  }
}

onMounted(loadStatus)
</script>

<template>
  <div class="min-h-screen bg-gradient-to-b from-[#ffe8d9] via-[#fdf6ec] to-[#ddf3ea] text-[#33413a]">
    <main class="mx-auto max-w-lg px-4 py-8 sm:py-12">
      <header class="text-center">
        <NuxtLink
          to="/singer"
          class="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold tracking-wider text-[#b4552f] shadow-sm"
        >
          仰恩大学音乐协会 · 新生歌手大赛
        </NuxtLink>
        <h1 class="mt-5 text-2xl font-black text-[#2f3a34]">
          参赛信息登记
        </h1>
        <p class="mt-2 text-sm leading-6 text-[#6b7a70]">
          现场扫码填写即可完成登记，登记顺序即初赛出场顺序。
          歌曲可先留空（待定），赛前告知工作人员补充即可。
        </p>
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
          登记已结束
        </p>
        <p class="mt-1 leading-6">
          本期登记已关闭。如有特殊情况，请直接联系现场工作人员。
        </p>
      </div>

      <!-- 登记成功 -->
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
          登记成功！
        </h2>
        <p class="mt-2 text-sm leading-6 text-[#4a564e]">
          {{ succeeded.name }}，你的出场序号为
          <span class="font-bold text-[#c2543c]">{{ succeeded.sortOrder }}</span>。
          比赛顺序以现场签到顺序为主，请留意叫号；
          工作人员会通过 QQ / 电话联系，结果也会发送到你的邮箱。
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
            @click="succeeded = null"
          >
            继续登记下一位
          </button>
        </div>
      </div>

      <!-- 登记表单 -->
      <form
        v-else
        class="mt-6 space-y-4 rounded-2xl bg-white/90 p-5 shadow-md ring-1 ring-[#f2d8c4] sm:p-6"
        @submit.prevent="submit"
      >
        <div>
          <label
            class="block text-sm font-semibold text-[#33413a]"
            for="reg-name"
          >
            姓名 <span class="text-[#c2543c]">*</span>
          </label>
          <input
            id="reg-name"
            v-model="form.name"
            required
            maxlength="40"
            name="name"
            autocomplete="name"
            class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
            placeholder="你的姓名"
          >
        </div>

        <div>
          <label
            class="block text-sm font-semibold text-[#33413a]"
            for="reg-class"
          >
            班级 <span class="text-[#c2543c]">*</span>
          </label>
          <input
            id="reg-class"
            v-model="form.className"
            required
            maxlength="60"
            name="className"
            class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
            placeholder="如 26工商管理1班"
          >
        </div>

        <div>
          <label
            class="block text-sm font-semibold text-[#33413a]"
            for="reg-student-no"
          >
            学号 <span class="text-[#c2543c]">*</span>
          </label>
          <input
            id="reg-student-no"
            v-model="form.studentNo"
            required
            maxlength="20"
            name="studentNo"
            inputmode="text"
            class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
            placeholder="录取通知书 / 学生证上的学号"
          >
        </div>

        <div>
          <label
            class="block text-sm font-semibold text-[#33413a]"
            for="reg-phone"
          >
            电话 <span class="text-[#c2543c]">*</span>
          </label>
          <input
            id="reg-phone"
            v-model="form.phone"
            required
            maxlength="11"
            name="phone"
            type="tel"
            inputmode="numeric"
            autocomplete="tel"
            class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
            placeholder="常用手机号"
          >
        </div>

        <div>
          <label
            class="block text-sm font-semibold text-[#33413a]"
            for="reg-email"
          >
            邮箱 <span class="text-[#c2543c]">*</span>
          </label>
          <input
            id="reg-email"
            v-model="form.email"
            required
            maxlength="120"
            name="email"
            type="email"
            autocomplete="email"
            class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
            placeholder="用于接收比赛结果通知"
          >
          <p class="mt-1 text-xs text-[#8b968c]">
            比赛结果会发送到该邮箱，请确认填写无误。
          </p>
        </div>

        <div>
          <label
            class="block text-sm font-semibold text-[#33413a]"
            for="reg-song"
          >
            参赛歌曲 <span class="text-xs font-normal text-[#8b968c]">（可待定）</span>
          </label>
          <input
            id="reg-song"
            v-model="form.song"
            maxlength="80"
            name="song"
            class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
            placeholder="想唱的歌；没想好可留空"
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
          {{ submitting ? '提交中…' : '完成登记' }}
        </button>

        <p class="text-center text-xs leading-5 text-[#8b968c]">
          提交即视为同意主办方按大赛规则使用以上信息进行赛事通知与安排。
        </p>
      </form>

      <p class="mt-6 pb-6 text-center text-xs text-[#a8b0a6]">
        主办：仰恩大学音乐协会 · 咨询请在初赛群内联系工作人员
      </p>
    </main>
  </div>
</template>
