<script setup lang="ts">
import { userFetch } from '~~/app/utils/user-request'
import { getRequestMessage } from '~~/app/utils/request-error'

interface MomentView {
  id: string
  kind: 'comment' | 'checkin'
  body: string
  images: string[]
  displayName: string
  createdAt: string
  dayKey: string
}

interface PlaceMomentsPayload {
  placeId: string
  moments: MomentView[]
  checkins: number
  checkedInToday: boolean
}

const props = defineProps<{
  placeId: string
  placeName: string
}>()

const BODY_MAX = 300
const IMAGE_MAX = 3

const payload = ref<PlaceMomentsPayload | null>(null)
const loading = ref(false)
const loadError = ref('')

const body = ref('')
const images = ref<string[]>([])
const uploading = ref(false)
const submitting = ref(false)
const feedback = ref('')
const error = ref('')
const aiPending = ref(false)
const composerOpen = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

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
  loadError.value = ''
  try {
    payload.value = await userFetch<PlaceMomentsPayload>('/api/public/place-moments', {
      query: { placeId: props.placeId }
    })
  } catch (err) {
    loadError.value = getRequestMessage(err, '留言加载失败')
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.placeId, () => {
  body.value = ''
  images.value = []
  feedback.value = ''
  error.value = ''
  aiPending.value = false
  composerOpen.value = false
  void load()
})

function pickImages(): void {
  fileInput.value?.click()
}

async function onFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (files.length === 0) return
  error.value = ''
  uploading.value = true
  try {
    for (const file of files) {
      if (images.value.length >= IMAGE_MAX) break
      const form = new FormData()
      form.append('file', file)
      const stored = await userFetch<{ url: string }>('/api/place-moments/images', {
        method: 'POST',
        body: form
      })
      images.value = [...images.value, stored.url]
    }
  } catch (err) {
    error.value = getRequestMessage(err, '图片上传失败')
  } finally {
    uploading.value = false
  }
}

function removeImage(url: string): void {
  images.value = images.value.filter(item => item !== url)
}

const gallery = computed<string[]>(() => {
  const seen: string[] = []
  for (const moment of payload.value?.moments ?? []) {
    for (const url of moment.images) {
      if (!seen.includes(url)) seen.push(url)
    }
  }
  return seen
})

const photoInput = ref<HTMLInputElement | null>(null)

function pickPhotos(): void {
  photoInput.value?.click()
}

/**
 * 「上传照片」是独立入口：选完直接传完就发，不用先写字。
 * 走同一条 /api/place-moments，kind=comment、body 留空，列表里照样显示成图文。
 */
async function uploadPlacePhotos(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? []).slice(0, IMAGE_MAX)
  input.value = ''
  if (files.length === 0) return
  uploading.value = true
  error.value = ''
  feedback.value = ''
  try {
    const uploaded: string[] = []
    for (const file of files) {
      const form = new FormData()
      form.append('file', file)
      const stored = await userFetch<{ url: string }>('/api/place-moments/images', {
        method: 'POST',
        body: form
      })
      uploaded.push(stored.url)
    }
    await userFetch('/api/place-moments', {
      method: 'POST',
      body: { placeId: props.placeId, kind: 'comment', body: '', images: uploaded }
    })
    feedback.value = `已上传 ${uploaded.length} 张照片`
    await load()
  } catch (err) {
    error.value = getRequestMessage(err, '照片上传失败')
  } finally {
    uploading.value = false
  }
}

async function submit(kind: 'comment' | 'checkin'): Promise<void> {
  if (kind === 'comment' && !body.value.trim() && images.value.length === 0) {
    error.value = '写点什么再发吧'
    return
  }
  submitting.value = true
  error.value = ''
  feedback.value = ''
  try {
    const response = await userFetch<{ moment: { status?: 'pending' | 'approved' | 'rejected' } }>('/api/place-moments', {
      method: 'POST',
      body: {
        placeId: props.placeId,
        kind,
        body: body.value.trim(),
        images: images.value
      }
    })
    // 文字留言先审后放：AI 启用时提交进 pending，提示审核中动画。
    aiPending.value = kind === 'comment' && response.moment?.status === 'pending'
    feedback.value = kind === 'checkin' ? '打卡成功' : (aiPending.value ? 'AI 审核中…' : '发布成功')
    body.value = ''
    images.value = []
    composerOpen.value = false
    if (!aiPending.value) await load()
    if (aiPending.value) {
      // 提示挂 15 秒自动消失；判定完成（通常数秒）后刷新列表即可见
      setTimeout(() => {
        if (aiPending.value) {
          aiPending.value = false
          feedback.value = ''
        }
      }, 15_000)
    }
  } catch (err) {
    error.value = getRequestMessage(err, kind === 'checkin' ? '打卡失败' : '发布失败')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <section class="border-t border-zinc-100 pt-3 dark:border-zinc-800">
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <h3 class="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">
          留言与打卡
        </h3>
        <span
          v-if="payload && payload.checkins > 0"
          class="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          {{ payload.checkins }} 人打卡
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-1 text-[11px] font-medium text-zinc-600 transition hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-300"
          :disabled="uploading"
          aria-label="上传地点照片"
          @click="pickPhotos"
        >
          <UIcon
            name="i-lucide-camera"
            class="size-3.5"
          />
          {{ uploading ? '上传中…' : '上传照片' }}
        </button>
        <button
          type="button"
          class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition"
          :class="payload?.checkedInToday
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'bg-emerald-600 text-white hover:bg-emerald-700'"
          :disabled="submitting || payload?.checkedInToday"
          @click="submit('checkin')"
        >
          {{ payload?.checkedInToday ? '今天已打卡' : '打卡' }}
        </button>
      </div>
    </div>

    <p
      v-if="loadError"
      class="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400"
    >
      {{ loadError }}
    </p>
    <p
      v-if="feedback"
      class="mt-1 flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400"
    >
      <UIcon
        v-if="aiPending"
        name="i-lucide-loader-circle"
        class="size-3 animate-spin"
      />
      {{ feedback }}
    </p>
    <p
      v-if="error"
      class="mt-1 text-[11px] text-red-600 dark:text-red-400"
    >
      {{ error }}
    </p>

    <button
      v-if="!composerOpen"
      type="button"
      class="mt-2 w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-left text-[11px] text-zinc-400 transition hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-500"
      @click="composerOpen = true"
    >
      说说这里怎么样，或者传张图…
    </button>

    <div
      v-else
      class="mt-2 rounded-lg border border-zinc-200 p-2 dark:border-zinc-700"
    >
      <textarea
        v-model="body"
        :maxlength="BODY_MAX"
        rows="2"
        placeholder="写点具体的：几点关、哪个门近、值不值得来"
        class="w-full resize-none bg-transparent text-[12px] leading-5 text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
      />
      <div
        v-if="images.length"
        class="mt-1.5 flex flex-wrap gap-1.5"
      >
        <div
          v-for="url in images"
          :key="url"
          class="relative size-14 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
        >
          <img
            :src="url"
            alt=""
            class="size-full object-cover"
          >
          <button
            type="button"
            aria-label="移除图片"
            class="absolute right-0 top-0 size-4 rounded-bl bg-black/60 text-[10px] leading-4 text-white"
            @click="removeImage(url)"
          >
            ×
          </button>
        </div>
      </div>
      <div class="mt-1.5 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            :disabled="uploading || images.length >= IMAGE_MAX"
            @click="pickImages"
          >
            <UIcon
              name="i-lucide-image-plus"
              class="size-3.5"
            />
            {{ uploading ? '上传中…' : `图片 ${images.length}/${IMAGE_MAX}` }}
          </button>
          <span class="text-[10px] text-zinc-400">{{ body.length }}/{{ BODY_MAX }}</span>
        </div>
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
            @click="submit('comment')"
          >
            发布
          </button>
        </div>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        class="hidden"
        @change="onFiles"
      >
    </div>

    <input
      ref="photoInput"
      type="file"
      accept="image/png,image/jpeg,image/webp"
      multiple
      class="hidden"
      @change="uploadPlacePhotos"
    >

    <div
      v-if="gallery.length"
      class="mt-2"
    >
      <p class="mb-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        地点照片 · {{ gallery.length }}
      </p>
      <div class="flex gap-1.5 overflow-x-auto pb-1">
        <a
          v-for="url in gallery"
          :key="url"
          :href="url"
          target="_blank"
          rel="noopener noreferrer"
          class="block size-16 shrink-0 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
        >
          <img
            :src="url"
            alt=""
            loading="lazy"
            class="size-full object-cover"
          >
        </a>
      </div>
    </div>

    <div
      v-if="loading && !payload"
      class="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400"
    >
      加载中…
    </div>

    <ul
      v-else-if="payload?.moments.length"
      class="mt-2 space-y-2.5"
    >
      <li
        v-for="moment in payload.moments"
        :key="moment.id"
        class="rounded-lg bg-zinc-50 p-2 dark:bg-zinc-900/60"
      >
        <div class="flex items-center gap-1.5 text-[11px]">
          <span class="font-medium text-zinc-700 dark:text-zinc-200">{{ moment.displayName }}</span>
          <span
            v-if="moment.kind === 'checkin'"
            class="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
          >
            打卡
          </span>
          <span class="text-zinc-400 dark:text-zinc-500">{{ formatWhen(moment.createdAt) }}</span>
        </div>
        <p
          v-if="moment.body"
          class="mt-1 whitespace-pre-wrap text-[12px] leading-5 text-zinc-700 dark:text-zinc-300"
        >
          {{ moment.body }}
        </p>
        <div
          v-if="moment.images.length"
          class="mt-1.5 flex flex-wrap gap-1.5"
        >
          <a
            v-for="url in moment.images"
            :key="url"
            :href="url"
            target="_blank"
            rel="noopener noreferrer"
            class="block size-16 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
          >
            <img
              :src="url"
              alt=""
              loading="lazy"
              class="size-full object-cover"
            >
          </a>
        </div>
      </li>
    </ul>
    <p
      v-else-if="payload"
      class="mt-2 text-[11px] text-zinc-400 dark:text-zinc-500"
    >
      还没有人留言，来当第一个。
    </p>
  </section>
</template>
