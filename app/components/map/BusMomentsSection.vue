<script setup lang="ts">
import { userFetch } from '~~/app/utils/user-request'
import { getRequestMessage } from '~~/app/utils/request-error'

interface BusMomentView {
  id: string
  busName: string
  routeName: string
  body: string
  displayName: string
  createdAt: string
}

interface BusMomentsPayload {
  busName: string
  moments: BusMomentView[]
}

const props = defineProps<{
  busName: string
  routeName: string
}>()

const BODY_MAX = 300

const payload = ref<BusMomentsPayload | null>(null)
const loading = ref(false)
const body = ref('')
const composerOpen = ref(false)
const submitting = ref(false)
const feedback = ref('')
const error = ref('')

function formatWhen(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

async function load(): Promise<void> {
  loading.value = true
  try {
    payload.value = await userFetch<BusMomentsPayload>('/api/public/bus-moments', {
      query: { busName: props.busName }
    })
  } catch (err) {
    // 留言是辅助互动内容：加载失败只提示一行，不影响跟车卡片本身
    error.value = getRequestMessage(err, '留言加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function submit(): Promise<void> {
  const content = body.value.trim()
  if (!content) {
    error.value = '写点什么再发吧'
    return
  }
  submitting.value = true
  error.value = ''
  try {
    await userFetch('/api/bus-moments', {
      method: 'POST',
      body: {
        busName: props.busName,
        routeName: props.routeName,
        body: content
      }
    })
    feedback.value = '发布成功'
    body.value = ''
    composerOpen.value = false
    await load()
  } catch (err) {
    error.value = getRequestMessage(err, '发布失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="mt-3 border-t border-zinc-100 pt-2.5 dark:border-zinc-800">
    <div class="flex items-center justify-between gap-2">
      <h3 class="text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
        车上留言
      </h3>
      <span
        v-if="payload && payload.moments.length > 0"
        class="text-[10px] text-zinc-400 dark:text-zinc-500"
      >
        {{ payload.moments.length }} 条
      </span>
    </div>

    <p
      v-if="error"
      class="mt-1 text-[11px] text-red-600 dark:text-red-400"
    >
      {{ error }}
    </p>
    <p
      v-else-if="feedback"
      class="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400"
    >
      {{ feedback }}
    </p>

    <button
      v-if="!composerOpen"
      type="button"
      class="mt-1.5 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-left text-[11px] text-zinc-400 transition hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-500"
      @click="composerOpen = true"
    >
      说说这辆车（司机、车况、挤不挤）…
    </button>

    <div
      v-else
      class="mt-1.5 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"
    >
      <textarea
        v-model="body"
        :maxlength="BODY_MAX"
        rows="2"
        placeholder="对大家有用的信息：等车多久、空调、师傅态度"
        class="w-full resize-none bg-transparent text-[12px] leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
      />
      <div class="mt-1.5 flex items-center justify-between">
        <span class="text-[10px] text-zinc-400">{{ body.length }}/{{ BODY_MAX }}</span>
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="rounded-md px-2 py-1 text-[11px] text-zinc-500 dark:text-zinc-400"
            @click="composerOpen = false"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
            :disabled="submitting"
            @click="submit"
          >
            {{ submitting ? '发布中…' : '发布' }}
          </button>
        </div>
      </div>
    </div>

    <ul
      v-if="payload && payload.moments.length"
      class="mt-2 space-y-1.5"
    >
      <li
        v-for="moment in payload.moments"
        :key="moment.id"
        class="rounded-lg bg-zinc-50 px-2 py-1.5 dark:bg-zinc-800/60"
      >
        <div class="flex items-center gap-1.5">
          <span class="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
            {{ moment.displayName }}
          </span>
          <span
            v-if="moment.routeName"
            class="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[9px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
          >
            {{ moment.routeName }}
          </span>
          <span class="ml-auto text-[9px] text-zinc-400 dark:text-zinc-500">
            {{ formatWhen(moment.createdAt) }}
          </span>
        </div>
        <p class="mt-0.5 whitespace-pre-line text-[11px] leading-4 text-zinc-700 dark:text-zinc-200">
          {{ moment.body }}
        </p>
      </li>
    </ul>
    <p
      v-else-if="payload && !loading"
      class="mt-1.5 text-[10px] text-zinc-400 dark:text-zinc-500"
    >
      还没有留言，说说这辆车吧。
    </p>
  </section>
</template>
