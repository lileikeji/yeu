<script setup lang="ts">
interface DrawResult {
  position: number
  singerName: string
  roundTitle: string
  checkedInAt: number
}

definePageMeta({ layout: false })

const name = ref('')
const studentNo = ref('')
const contact = ref('')
const drawNumber = ref('')
const result = ref<DrawResult | null>(null)
const saving = ref(false)
const error = ref('')

const toast = useToast()

/* 现场抽签接口：显式窄签名，绕开 Nuxt 生成的路由联合类型在类型检查时的深度爆炸（TS2589/TS2321）。
   注意不能把 $fetch 整个强转成单参函数——那样 URL 就丢了，请求会打到一个不存在的地址。 */
const submitDraw = (payload: {
  name: string
  studentNo: string
  contact: string
  sortOrder: number
}): Promise<DrawResult> =>
  plainFetch<DrawResult>('/api/public/competition/draw', { method: 'POST', body: payload })

useSeoMeta({ title: '现场抽签登记', robots: 'noindex, nofollow' })

function messageOf(caught: unknown): string {
  const data = (caught as { data?: { data?: { message?: string }, message?: string } })?.data
  const serverSide = data?.data?.message ?? data?.message
  if (serverSide) return serverSide
  const plain = (caught as { message?: string })?.message
  return plain && plain.trim() ? plain : '出错了，稍后再试。'
}

async function submit() {
  if (saving.value) return
  error.value = ''
  const position = Number(drawNumber.value)
  if (!name.value.trim() || !studentNo.value.trim() || !contact.value.trim()) {
    error.value = '姓名、学号和 QQ 或邮箱三项都要填'
    return
  }
  if (!Number.isInteger(position) || position < 1 || position > 999) {
    error.value = '出场顺序要填 1-999 的整数'
    return
  }
  saving.value = true
  try {
    result.value = await submitDraw({
      name: name.value.trim(),
      studentNo: studentNo.value.trim(),
      contact: contact.value.trim(),
      sortOrder: position
    })
    toast.add({ title: `登记好了，你是第 ${result.value.position} 位`, color: 'success' })
  } catch (caught) {
    error.value = messageOf(caught)
  } finally {
    saving.value = false
  }
}

function reset() {
  result.value = null
  drawNumber.value = ''
  error.value = ''
}
</script>

<template>
  <div class="singer-canvas min-h-dvh bg-[var(--page-bg)] px-4 py-8">
    <div class="mx-auto w-full max-w-md space-y-4">
      <div class="text-center">
        <p class="text-xs font-medium tracking-wide text-[var(--muted-ink)]">
          仰恩大学音乐协会 · 新声歌手大赛
        </p>
        <h1 class="mt-1 text-2xl font-black tracking-tight">
          现场抽签登记
        </h1>
        <p class="mt-2 text-xs leading-relaxed text-[var(--muted-ink)]">
          抽到几号就填几号，填完点下面的按钮——登记成功就算签到，评委那边才会看到你。号被别人先登记了会提示你换一个。
        </p>
      </div>

      <div
        v-if="result"
        class="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-6 text-center"
      >
        <p class="text-sm text-[var(--muted-ink)]">
          {{ result.singerName }} · {{ result.roundTitle }}
        </p>
        <p class="mt-3 text-4xl font-black tabular-nums">
          第 {{ result.position }} 位
        </p>
        <p class="mt-3 text-xs text-[var(--muted-ink)]">
          已签到。记住这个号，叫到号就上场；要改号直接重新填一次。
        </p>
        <button
          type="button"
          class="mt-5 w-full rounded-xl bg-[var(--color-green-600)] px-4 py-3 text-sm font-bold text-white"
          @click="reset"
        >
          再登记一个人
        </button>
      </div>

      <form
        v-else
        class="space-y-3 rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] p-5"
        @submit.prevent="submit"
      >
        <label class="block">
          <span class="text-sm font-medium">姓名</span>
          <input
            v-model="name"
            type="text"
            placeholder="你的姓名"
            class="mt-1 w-full rounded-xl border border-[var(--hairline)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--color-green-600)]"
          >
        </label>
        <label class="block">
          <span class="text-sm font-medium">学号</span>
          <input
            v-model="studentNo"
            type="text"
            placeholder="录取通知书 / 学生证上的学号"
            class="mt-1 w-full rounded-xl border border-[var(--hairline)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--color-green-600)]"
          >
        </label>
        <label class="block">
          <span class="text-sm font-medium">QQ 或邮箱</span>
          <input
            v-model="contact"
            type="text"
            placeholder="QQ 号或 QQ 邮箱"
            class="mt-1 w-full rounded-xl border border-[var(--hairline)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--color-green-600)]"
          >
        </label>
        <label class="block">
          <span class="text-sm font-medium">你抽到的号</span>
          <input
            v-model="drawNumber"
            type="text"
            inputmode="numeric"
            placeholder="例如 7"
            class="mt-1 w-full rounded-xl border border-[var(--hairline)] bg-transparent px-3 py-2.5 text-2xl font-black tabular-nums outline-none focus:border-[var(--color-green-600)]"
          >
        </label>

        <p
          v-if="error"
          class="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950/40"
        >
          {{ error }}
        </p>

        <button
          type="submit"
          class="w-full rounded-xl bg-[var(--color-green-600)] px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          :disabled="saving"
        >
          {{ saving ? '登记中…' : '登记这个号并签到' }}
        </button>
      </form>

      <p class="text-center text-xs text-[var(--muted-ink)]">
        主办：仰恩大学音乐协会
      </p>
    </div>
  </div>
</template>
