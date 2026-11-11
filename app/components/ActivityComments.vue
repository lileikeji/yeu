<script setup lang="ts">
import type { ApiActivityComment } from '~~/shared/types/server'
import { userFetch } from '~/utils/user-request'

const props = withDefaults(defineProps<{
  activitySlug: string
  compact?: boolean
}>(), {
  compact: false
})

interface CommentsPayload {
  items: ApiActivityComment[]
  total: number
}

const comments = ref<ApiActivityComment[]>([])
const total = ref(0)
const loading = ref(true)
const loadError = ref('')
const body = ref('')
const images = ref<string[]>([])
const uploading = ref(false)
const submitting = ref(false)
const feedback = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

const MAX_BODY = 300
const MAX_IMAGES = 3

// 地图卡片只有一屏高：先露出最新两条，把输入框留在可见范围内。
const shownComments = computed(() => (
  props.compact ? comments.value.slice(0, 2) : comments.value
))

async function load(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const payload = await userFetch<CommentsPayload>(
      `/api/public/activities/${encodeURIComponent(props.activitySlug)}/comments`
    )
    comments.value = payload.items ?? []
    total.value = payload.total ?? comments.value.length
  } catch {
    loadError.value = '留言加载失败，稍后再试'
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(() => props.activitySlug, () => {
  comments.value = []
  total.value = 0
  void load()
})

function errorMessage(error: unknown): string {
  const value = error as {
    data?: { statusMessage?: string, data?: { message?: string } }
    statusMessage?: string
  }
  return value?.data?.statusMessage || value?.statusMessage || '提交失败，请稍后再试'
}

function pickImages(): void {
  fileInput.value?.click()
}

async function onFiles(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? []).slice(0, MAX_IMAGES - images.value.length)
  input.value = ''
  if (!files.length) return

  uploading.value = true
  feedback.value = ''
  try {
    for (const file of files) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        feedback.value = '只支持 PNG、JPG、WebP 图片'
        continue
      }
      if (file.size > 5 * 1024 * 1024) {
        feedback.value = '单张图片不能超过 5MB'
        continue
      }
      const form = new FormData()
      form.append('image', file)
      const result = await userFetch<{ url: string }>('/api/activity-comments/images', {
        method: 'POST',
        body: form
      })
      if (result?.url) images.value.push(result.url)
    }
  } catch (error) {
    feedback.value = errorMessage(error)
  } finally {
    uploading.value = false
  }
}

function removeImage(url: string): void {
  images.value = images.value.filter(item => item !== url)
}

async function submit(): Promise<void> {
  if (submitting.value) return
  const text = body.value.trim()
  if (!text && images.value.length === 0) {
    feedback.value = '写点内容或加一张照片'
    return
  }
  submitting.value = true
  feedback.value = ''
  try {
    const result = await userFetch<{ comment: ApiActivityComment }>('/api/activity-comments', {
      method: 'POST',
      body: {
        activitySlug: props.activitySlug,
        body: text,
        images: images.value
      }
    })
    if (result?.comment) {
      comments.value.unshift(result.comment)
      total.value += 1
    }
    body.value = ''
    images.value = []
    feedback.value = '留言已发出'
  } catch (error) {
    feedback.value = errorMessage(error)
  } finally {
    submitting.value = false
  }
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  return `${date.getMonth() + 1}/${date.getDate()}`
}
</script>

<template>
  <section
    class="border-t border-zinc-200 pt-4 dark:border-zinc-800"
    :class="compact ? 'mt-2' : 'mt-8'"
  >
    <div class="flex items-center justify-between gap-2">
      <h2
        class="font-semibold text-zinc-900 dark:text-zinc-100"
        :class="compact ? 'text-sm' : 'text-lg'"
      >
        活动留言
        <span
          v-if="total"
          class="ml-1 text-xs font-normal text-zinc-400"
        >{{ total }}</span>
      </h2>
      <span class="text-[11px] text-zinc-400">可附照片</span>
    </div>

    <div
      v-if="loading"
      class="mt-3 text-xs text-zinc-400"
    >
      正在加载留言…
    </div>
    <p
      v-else-if="loadError"
      class="mt-3 text-xs text-amber-700 dark:text-amber-300"
    >
      {{ loadError }}
    </p>
    <ul
      v-else-if="comments.length"
      class="mt-3 space-y-3"
    >
      <li
        v-for="comment in shownComments"
        :key="comment.id"
        class="flex gap-2.5"
      >
        <span class="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-emerald-50 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {{ comment.displayName.slice(0, 1) }}
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-2">
            <span class="text-xs font-medium text-zinc-700 dark:text-zinc-200">
              {{ comment.displayName }}
            </span>
            <span class="text-[10px] text-zinc-400">{{ formatTime(comment.createdAt) }}</span>
          </div>
          <p
            v-if="comment.body"
            class="mt-0.5 whitespace-pre-line text-sm leading-6 text-zinc-600 dark:text-zinc-300"
          >
            {{ comment.body }}
          </p>
          <div
            v-if="comment.images.length"
            class="mt-1.5 flex flex-wrap gap-1.5"
          >
            <img
              v-for="image in comment.images"
              :key="image"
              :src="image"
              alt="活动留言照片"
              class="size-16 rounded-md object-cover"
              loading="lazy"
            >
          </div>
        </div>
      </li>
    </ul>
    <p
      v-if="compact && comments.length > shownComments.length"
      class="mt-1.5 text-[10px] text-zinc-400"
    >
      另有 {{ comments.length - shownComments.length }} 条留言，进入活动页查看全部
    </p>
    <p
      v-if="!loading && !loadError && !comments.length"
      class="mt-2 text-xs text-zinc-400"
    >
      还没有留言，来说两句。
    </p>

    <div class="mt-3 rounded-xl border border-zinc-200 p-2.5 dark:border-zinc-800">
      <UTextarea
        v-model="body"
        :rows="compact ? 2 : 3"
        :maxlength="MAX_BODY"
        placeholder="说点什么，或补充一张现场照片…"
        :ui="{ base: 'text-sm' }"
        class="w-full"
      />
      <div
        v-if="images.length"
        class="mt-2 flex flex-wrap gap-2"
      >
        <div
          v-for="image in images"
          :key="image"
          class="relative"
        >
          <img
            :src="image"
            alt="待发送的活动照片"
            class="size-14 rounded-md object-cover"
          >
          <button
            type="button"
            class="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-zinc-900 text-white"
            aria-label="移除照片"
            @click="removeImage(image)"
          >
            ×
          </button>
        </div>
      </div>
      <div class="mt-2 flex flex-wrap items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <input
            ref="fileInput"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            class="hidden"
            @change="onFiles"
          >
          <UButton
            type="button"
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-image-plus"
            :disabled="uploading || images.length >= MAX_IMAGES"
            @click="pickImages"
          >
            {{ uploading ? '上传中' : '加照片' }}
          </UButton>
          <span class="text-[10px] text-zinc-400">最多 3 张 · 5MB</span>
        </div>
        <UButton
          type="button"
          size="xs"
          color="primary"
          icon="i-lucide-send"
          :loading="submitting"
          :disabled="uploading"
          @click="submit"
        >
          发送留言
        </UButton>
      </div>
      <p
        v-if="feedback"
        class="mt-1.5 text-[11px]"
        :class="feedback.includes('已发出') ? 'text-emerald-700 dark:text-emerald-300' : 'text-amber-700 dark:text-amber-300'"
      >
        {{ feedback }}
      </p>
    </div>
  </section>
</template>
