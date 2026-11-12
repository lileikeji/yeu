<script setup lang="ts">
definePageMeta({ layout: false })

useSeoMeta({
  title: '新声歌手大赛 · 现场登记 | 仰恩大学音乐协会',
  robots: 'noindex, nofollow'
})

interface RegistrationStatus {
  open: boolean
  title: string
}

interface PreRegistrationCandidate {
  id: string
  name: string
  className: string | null
  song: string | null
  preferredDay: 1 | 2 | null
  createdAt: number
  /** 只回传后四位，形如 `****0077`。 */
  studentNoMasked: string
  /** 预报名当时留过手机或邮箱。 */
  hasContact: boolean
}

const status = ref<RegistrationStatus | null>(null)
const statusError = ref('')
const submitting = ref(false)
interface QueuePosition {
  state: 'finished' | 'singing' | 'waiting' | 'idle' | 'unknown'
  ahead: number | null
  position: number | null
  total: number
}

const succeeded = ref<{ singerId: string, name: string, sortOrder: number, fromPre: boolean } | null>(null)

/** 登记过的人记住自己是谁，刷新或下次打开还能看排队进度。 */
const QUEUE_STORAGE_KEY = 'yeu:singer:queue'
interface QueueOwner { singerId: string, name: string, sortOrder: number | null }
const queueOwner = ref<QueueOwner | null>(null)
const queue = ref<QueuePosition | null>(null)
const queueUpdatedAt = ref(0)
const queueRefreshing = ref(false)
let queueTimer: ReturnType<typeof setInterval> | null = null

const queueTime = computed(() => {
  if (!queueUpdatedAt.value) return ''
  const date = new Date(queueUpdatedAt.value)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`
})

const queueText = computed(() => {
  const data = queue.value
  if (!data) return ''
  if (data.state === 'singing') return '现在轮到你上场了，加油！'
  if (data.state === 'finished') return '你已经唱完了，等结果就行。'
  if (data.state === 'waiting') {
    const ahead = data.ahead ?? 0
    return ahead > 0 ? `前面还有 ${ahead} 位` : '你是下一位，准备一下'
  }
  return '还没开始叫号。'
})

function readStoredOwner(): QueueOwner | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<QueueOwner>
    if (!parsed || typeof parsed.singerId !== 'string' || !parsed.singerId) return null
    return {
      singerId: parsed.singerId,
      name: typeof parsed.name === 'string' ? parsed.name : '',
      sortOrder: typeof parsed.sortOrder === 'number' ? parsed.sortOrder : null
    }
  } catch {
    return null
  }
}

function storeOwner(owner: QueueOwner | null): void {
  if (typeof localStorage === 'undefined') return
  if (!owner) {
    localStorage.removeItem(QUEUE_STORAGE_KEY)
    return
  }
  try {
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(owner))
  } catch {
    // 隐私模式下写不进去就算了，至少本次会话还能看。
  }
}

async function loadQueue(): Promise<void> {
  const owner = queueOwner.value
  if (!owner) return
  queueRefreshing.value = true
  try {
    const data = await $fetch<QueuePosition>('/api/public/competition/register/queue', {
      query: { singerId: owner.singerId }
    })
    if (data.state === 'unknown') {
      // 名单被清过或换了届，本地这条记录作废。
      queueOwner.value = null
      queue.value = null
      storeOwner(null)
      stopQueuePolling()
      return
    }
    queue.value = data
    queueUpdatedAt.value = Date.now()
  } catch {
    // 网络抖动就不更新，保留上一次的数字。
  } finally {
    queueRefreshing.value = false
  }
}

function stopQueuePolling(): void {
  if (queueTimer) {
    clearInterval(queueTimer)
    queueTimer = null
  }
}

function startQueuePolling(): void {
  stopQueuePolling()
  void loadQueue()
  queueTimer = setInterval(loadQueue, 15000)
}

/** 只有登记过（本机记住了身份）才刷新进度。 */
function refreshQueue(): void {
  if (queueOwner.value) void loadQueue()
}

function resetAfterSuccess(): void {
  stopQueuePolling()
  queue.value = null
  queueUpdatedAt.value = 0
  queueOwner.value = null
  storeOwner(null)
  succeeded.value = null
  preSelected.value = null
  preCandidates.value = []
  lookupDone.value = false
}

onBeforeUnmount(stopQueuePolling)
const errorMessage = ref('')

const form = reactive({
  className: '',
  name: '',
  studentNo: '',
  phone: '',
  email: '',
  song: ''
})

/** 命中的预报名；确认「是这个人」后自动填表并随提交关联。 */
const preCandidates = ref<PreRegistrationCandidate[]>([])
const preSelected = ref<PreRegistrationCandidate | null>(null)
const lookingUp = ref(false)
/** 学号后四位：查预报名必须与姓名一起填，避免拿姓名翻别人的联系方式。 */
const lookupTail = ref('')
const canLookup = computed(() => form.name.trim().length > 0 && /^\d{4}$/.test(lookupTail.value.trim()))
const lookupDone = ref(false)

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
    statusError.value = '登记状态获取失败，请刷新重试。'
  }
}

async function lookupPreRegistrations(): Promise<void> {
  const name = form.name.trim()
  const studentNoTail = lookupTail.value.trim()
  if (!name || !/^\d{4}$/.test(studentNoTail) || lookingUp.value) return
  lookingUp.value = true
  try {
    const result = await $fetch<{ candidates: PreRegistrationCandidate[] }>(
      '/api/public/competition/register/lookup',
      { method: 'POST', body: { name, studentNoTail } }
    )
    preCandidates.value = result.candidates
    lookupDone.value = true
  } catch {
    preCandidates.value = []
    lookupDone.value = true
  } finally {
    lookingUp.value = false
  }
}

function confirmCandidate(candidate: PreRegistrationCandidate): void {
  preSelected.value = candidate
  form.name = candidate.name
  form.className = candidate.className ?? ''
  form.song = candidate.song ?? ''
  // 手机、邮箱、学号不跟随下发，也不回填：本人填自己的联系方式，页面不留别人的。
  preCandidates.value = []
  nextTick(() => {
    document.getElementById('reg-student-no')?.focus()
  })
}

function clearCandidate(): void {
  preSelected.value = null
}

function validateLocally(): string {
  if (!form.name.trim()) return '请填写姓名'
  if (!form.className.trim()) return '请填写班级'
  if (!/^[0-9A-Za-z-]{4,20}$/.test(form.studentNo.trim())) return '请填写正确的学号'
  if (!/^1\d{10}$/.test(form.phone.trim())) return '请填写正确的手机号'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return '请填写正确的邮箱'
  const song = form.song.trim()
  if (!song) return '请填写参赛歌曲'
  if (/^(待定|未定|暂无|无|没有|还没定|没定|tbd|tba|na|n\/a)$/i.test(song.replace(/\s+/g, ''))) {
    return '参赛歌曲要填具体歌名，不能填「待定」'
  }
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
        song: form.song.trim(),
        ...(preSelected.value ? { preRegistrationId: preSelected.value.id } : {})
      }
    })
    succeeded.value = {
      singerId: result.id,
      name: form.name.trim(),
      sortOrder: result.sortOrder,
      fromPre: Boolean(preSelected.value)
    }
    queueOwner.value = {
      singerId: result.id,
      name: form.name.trim(),
      sortOrder: result.sortOrder
    }
    storeOwner(queueOwner.value)
    startQueuePolling()
  } catch (error) {
    const code = typeof error === 'object' && error !== null
      ? (error as { data?: { data?: { code?: string } } }).data?.data?.code
      : undefined
    const status = typeof error === 'object' && error !== null
      ? (error as { statusCode?: number }).statusCode
      : undefined
    if (code === 'SINGER_ALREADY_REGISTERED') {
      errorMessage.value = serverErrorMessage(error, '该学号已完成登记，请勿重复提交。')
    } else if (code === 'PRE_REGISTRATION_ALREADY_USED') {
      errorMessage.value = '该预报名刚被确认过，请直接手动填写。'
      clearCandidate()
    } else if (code === 'COMPETITION_REGISTRATION_CLOSED') {
      errorMessage.value = serverErrorMessage(error, '登记已结束，请联系现场工作人员。')
    } else if (code === 'RATE_LIMITED' || status === 429) {
      errorMessage.value = '提交过于频繁，请稍后再试。'
    } else {
      errorMessage.value = serverErrorMessage(error, '提交失败，请检查网络后重试。')
    }
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  await loadStatus()
  const stored = readStoredOwner()
  if (stored) {
    queueOwner.value = stored
    startQueuePolling()
  }
})
</script>

<template>
  <div class="min-h-dvh bg-gradient-to-b from-[#ffe8d9] via-[#fdf6ec] to-[#ddf3ea] text-[#33413a]">
    <main class="mx-auto max-w-lg px-4 py-8 sm:py-12">
      <header class="text-center">
        <NuxtLink
          to="/singer"
          class="inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-1.5 text-xs font-semibold tracking-wider text-[#b4552f] shadow-sm"
        >
          仰恩大学音乐协会 · 新声歌手大赛
        </NuxtLink>
        <h1 class="mt-5 text-2xl font-black text-[#2f3a34]">
          现场正式登记
        </h1>
      </header>

      <!-- 现场进度：只有登记过（本机记住了身份）才显示 -->
      <section
        v-if="queue"
        class="mt-6 rounded-2xl bg-white/90 p-4 shadow-md ring-1 ring-[#f2d8c4]"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-xs font-semibold tracking-wider text-[#b4552f]">
            我的现场进度<template v-if="queueOwner?.name">
              · {{ queueOwner.name }}
            </template>
          </p>
          <button
            type="button"
            class="shrink-0 text-xs font-semibold text-[#4a564e] underline disabled:opacity-60"
            :disabled="queueRefreshing"
            @click="refreshQueue"
          >
            {{ queueRefreshing ? '刷新中…' : '刷新' }}
          </button>
        </div>
        <p class="mt-1 text-xl font-black text-[#2f3a34]">
          {{ queueText }}
        </p>
        <p class="mt-1 text-xs text-[#6b7a70]">
          <template v-if="queue.position">
            今天第 {{ queue.position }} / {{ queue.total }} 位
          </template>
          <template v-else>
            今天共 {{ queue.total }} 位
          </template>
          <template v-if="queueTime">
            · 更新于 {{ queueTime }}
          </template>
        </p>
      </section>

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
          特殊情况请联系现场工作人员。
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
          登记好了！
        </h2>
        <p class="mt-2 text-sm leading-6 text-[#4a564e]">
          {{ succeeded.name }}，你是第
          <span class="font-bold text-[#c2543c]">{{ succeeded.sortOrder }}</span>
          位出场。
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
            @click="resetAfterSuccess"
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
          <div class="mt-1.5 flex gap-2">
            <input
              id="reg-name"
              v-model="form.name"
              required
              maxlength="40"
              name="name"
              autocomplete="name"
              class="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
              placeholder="你的姓名"
            >
            <input
              v-model="lookupTail"
              maxlength="4"
              inputmode="numeric"
              autocomplete="off"
              aria-label="学号后四位"
              class="w-28 shrink-0 rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base tabular-nums outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
              placeholder="学号后 4 位"
              @blur="lookupPreRegistrations"
            >
            <button
              type="button"
              class="shrink-0 rounded-xl bg-[#4a564e] px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-[#3a453e] disabled:opacity-60"
              :disabled="lookingUp || !canLookup"
              @click="lookupPreRegistrations"
            >
              {{ lookingUp ? '查一下…' : '查预报名' }}
            </button>
          </div>
          <p class="mt-1 text-xs text-[#8b968c]">
            姓名 + 学号后四位
          </p>
        </div>

        <!-- 预报名命中确认 -->
        <div
          v-if="preCandidates.length > 0"
          class="rounded-xl border border-[#f2d8c4] bg-[#fdf6ec] p-3"
        >
          <p class="text-sm font-bold text-[#33413a]">
            是不是这个人？
          </p>
          <div class="mt-2 space-y-2">
            <div
              v-for="candidate in preCandidates"
              :key="candidate.id"
              class="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-200"
            >
              <div class="min-w-0 text-sm">
                <p class="font-semibold text-[#33413a]">
                  {{ candidate.name }}
                  <span
                    v-if="candidate.className"
                    class="ml-1 text-xs font-normal text-[#6b7a70]"
                  >{{ candidate.className }}</span>
                </p>
                <p class="truncate text-xs text-[#8b968c]">
                  学号 {{ candidate.studentNoMasked }} · {{ candidate.song || '歌曲待定' }}
                  <span v-if="candidate.hasContact"> · 预报名里留过联系方式</span>
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-green-700"
                @click="confirmCandidate(candidate)"
              >
                是，就我
              </button>
            </div>
          </div>
          <button
            type="button"
            class="mt-2 text-xs text-[#8b968c] underline"
            @click="preCandidates = []"
          >
            都不是，自己填
          </button>
        </div>

        <div
          v-else-if="lookupDone && !preSelected"
          class="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-[#6b7a70]"
        >
          没查到预报名记录。
        </div>

        <div
          v-if="preSelected"
          class="flex items-center justify-between gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900"
        >
          <span>
            已带入姓名、班级与歌曲。
          </span>
          <button
            type="button"
            class="shrink-0 text-xs text-green-800 underline"
            @click="clearCandidate"
          >
            重新填
          </button>
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
        </div>

        <div>
          <label
            class="block text-sm font-semibold text-[#33413a]"
            for="reg-song"
          >
            参赛歌曲 <span class="text-[#c2543c]">*</span>
          </label>
          <input
            id="reg-song"
            v-model="form.song"
            required
            maxlength="80"
            name="song"
            class="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-base outline-none transition focus:border-[#e2725b] focus:ring-2 focus:ring-[#e2725b]/20"
            placeholder="写具体歌名，如 晴天"
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
          提交即同意以上信息用于比赛通知与安排。
        </p>
      </form>

      <p class="mt-6 pb-6 text-center text-xs text-[#a8b0a6]">
        主办：仰恩大学音乐协会 · 咨询请在初赛群内联系工作人员
      </p>
    </main>
  </div>
</template>
