<script setup lang="ts">
import type { CompetitionFinalSongsState } from '~~/shared/types'

definePageMeta({ layout: false })

const toast = useToast()

const name = ref('')
const studentNo = ref('')
const contact = ref('')
const firstSong = ref('')
const secondSong = ref('')
const state = ref<CompetitionFinalSongsState | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const conflict = ref(false)
const videoBusy = ref<1 | 2 | null>(null)
const videoPercent = ref<number | null>(null)
const firstAudioInput = ref<HTMLInputElement | null>(null)
const secondVideoInput = ref<HTMLInputElement | null>(null)

useSeoMeta({ title: '决赛两首歌提交', robots: 'noindex, nofollow' })

interface ServerError {
  data?: { data?: { code?: string, message?: string }, message?: string }
  message?: string
}

function messageOf(caught: unknown): string {
  const data = (caught as ServerError)?.data
  const serverSide = data?.data?.message ?? data?.message
  if (serverSide) return serverSide
  const plain = (caught as ServerError)?.message
  return plain && plain.trim() ? plain : '出错了，稍后再试。'
}

function codeOf(caught: unknown): string {
  return (caught as ServerError)?.data?.data?.code ?? ''
}

function fillFrom(data: CompetitionFinalSongsState): void {
  state.value = data
  firstSong.value = data.firstSong ?? ''
  secondSong.value = data.secondSong ?? ''
}

function formatSize(size: number | null): string {
  if (!size) return ''
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'] as const
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac'
}

function extensionOf(filename: string): string {
  return (filename.split('.').at(-1) || '').toLowerCase()
}

function pickMedia(slot: 1 | 2): void {
  if (videoBusy.value !== null) return
  if (!state.value || state.value.revision < 1) {
    toast.add({ title: '先提交两首歌，再传伴奏或视频', color: 'warning' })
    return
  }
  if (!state.value.editable) return
  const input = slot === 1 ? firstAudioInput.value : secondVideoInput.value
  input?.click()
}

function putMediaWithProgress(url: string, file: File, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url, true)
    request.setRequestHeader('Content-Type', contentType)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        videoPercent.value = Math.min(99, Math.round((event.loaded / event.total) * 100))
      }
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        videoPercent.value = 100
        resolve()
        return
      }
      reject(new Error(`直传失败（${request.status}）`))
    }
    request.onerror = () => reject(new Error('直传失败，检查网络后重试一次'))
    request.ontimeout = () => reject(new Error('直传超时，重试一次'))
    request.timeout = 30 * 60 * 1000
    request.send(file)
  })
}

async function uploadMedia(slot: 1 | 2, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !state.value) return
  const extension = extensionOf(file.name)
  let contentType = 'video/mp4'
  if (slot === 1) {
    if (!(AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
      toast.add({ title: '第一首伴奏只收 mp3 / m4a / wav / aac / ogg / flac', color: 'warning' })
      return
    }
    if (file.size > 400 * 1024 * 1024) {
      toast.add({ title: '伴奏不能超过 400MB', color: 'warning' })
      return
    }
    contentType = AUDIO_MIME[extension] ?? 'audio/mpeg'
  } else {
    if (extension !== 'mp4') {
      toast.add({ title: '第二首背景视频只收 MP4', color: 'warning' })
      return
    }
    if (file.size > 1024 * 1024 * 1024) {
      toast.add({ title: '背景视频不能超过 1GB', color: 'warning' })
      return
    }
  }
  videoBusy.value = slot
  videoPercent.value = 0
  try {
    const ticket = await plainFetch<{ key: string, uploadUrl: string }>(
      '/api/public/competition/final-songs/video-ticket',
      {
        method: 'POST',
        body: {
          name: name.value.trim(),
          studentNo: studentNo.value.trim(),
          contact: contact.value.trim(),
          slot,
          filename: file.name
        }
      }
    )
    await putMediaWithProgress(ticket.uploadUrl, file, contentType)
    const data = await plainFetch<CompetitionFinalSongsState>(
      '/api/public/competition/final-songs/video-commit',
      {
        method: 'POST',
        body: {
          name: name.value.trim(),
          studentNo: studentNo.value.trim(),
          contact: contact.value.trim(),
          slot,
          key: ticket.key,
          size: file.size
        }
      }
    )
    fillFrom(data)
    toast.add({ title: slot === 1 ? '第一首伴奏收到了' : '第二首背景视频收到了', color: 'success' })
  } catch (caught) {
    toast.add({ title: messageOf(caught), color: 'error' })
  } finally {
    videoBusy.value = null
    videoPercent.value = null
  }
}

async function lookup(): Promise<void> {
  if (loading.value) return
  error.value = ''
  conflict.value = false
  loading.value = true
  try {
    const data = await plainFetch<CompetitionFinalSongsState>('/api/public/competition/final-songs/lookup', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        studentNo: studentNo.value.trim(),
        contact: contact.value.trim()
      }
    })
    fillFrom(data)
  } catch (caught) {
    state.value = null
    error.value = messageOf(caught)
  } finally {
    loading.value = false
  }
}

async function refreshLatest(): Promise<void> {
  await lookup()
  if (state.value) toast.add({ title: '已载入服务器上的最新版本', color: 'success' })
}

async function submit(): Promise<void> {
  if (saving.value || !state.value) return
  const first = firstSong.value.trim()
  const second = secondSong.value.trim()
  if (!first || !second) {
    toast.add({ title: '两首歌都要填', color: 'warning' })
    return
  }
  if (first === second) {
    toast.add({ title: '两首歌不能是同一首', color: 'warning' })
    return
  }
  saving.value = true
  error.value = ''
  conflict.value = false
  try {
    const data = await plainFetch<CompetitionFinalSongsState>('/api/public/competition/final-songs/submit', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        studentNo: studentNo.value.trim(),
        contact: contact.value.trim(),
        firstSong: first,
        secondSong: second,
        revision: state.value.revision
      }
    })
    fillFrom(data)
    toast.add({ title: '两首歌都记下了', description: `第一首《${data.firstSong}》，第二首《${data.secondSong}》`, color: 'success' })
  } catch (caught) {
    const message = messageOf(caught)
    if (codeOf(caught) === 'COMPETITION_FINAL_SONGS_CONFLICT') {
      conflict.value = true
      error.value = message
      return
    }
    toast.add({ title: message, color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="singer-canvas min-h-dvh text-[var(--ink)]">
    <div class="mx-auto w-full max-w-md px-4 py-8">
      <p class="text-center text-xs tracking-[0.2em] text-[var(--accent-warm)]">
        仰恩大学音乐协会 · 新声歌手大赛
      </p>
      <h1 class="mt-2 text-center text-2xl font-black">
        决赛两首歌
      </h1>

      <div class="mt-6 rounded-2xl bg-[var(--surface)] p-5 shadow-sm">
        <label
          class="block text-sm font-medium"
          for="name"
        >姓名</label>
        <UInput
          id="name"
          v-model="name"
          class="mt-1 w-full"
          size="lg"
          placeholder="你的姓名"
        />

        <label
          class="mt-4 block text-sm font-medium"
          for="studentNo"
        >学号</label>
        <UInput
          id="studentNo"
          v-model="studentNo"
          class="mt-1 w-full"
          size="lg"
          placeholder="录取通知书 / 学生证上的学号"
        />

        <label
          class="mt-4 block text-sm font-medium"
          for="contact"
        >QQ 或邮箱</label>
        <UInput
          id="contact"
          v-model="contact"
          class="mt-1 w-full"
          size="lg"
          placeholder="QQ 号或 QQ 邮箱"
        />

        <button
          type="button"
          :disabled="loading"
          class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-green-600)] px-4 py-3 text-base font-bold text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          @click="lookup"
        >
          <UIcon
            v-if="loading"
            name="i-lucide-loader-circle"
            class="size-4 animate-spin"
            aria-hidden="true"
          />
          {{ loading ? '查一下…' : '下一步' }}
        </button>

        <p
          v-if="error && !state"
          class="mt-3 text-sm text-[var(--color-red-600)]"
        >
          {{ error }}
        </p>
      </div>

      <div
        v-if="state"
        class="mt-4 rounded-2xl bg-[var(--surface)] p-5 shadow-sm"
      >
        <p class="text-sm">
          {{ state.singerName }}<span v-if="state.stageTitle">，{{ state.stageTitle }}</span>
        </p>

        <div
          v-if="conflict"
          class="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p class="font-medium">
            先别急着再提交：服务器上的版本已经和这个页面对不上了。
          </p>
          <p class="mt-1 leading-relaxed">
            {{ error }}。你现在的输入框里还是旧内容，直接提交会覆盖别人刚改的版本。
          </p>
          <button
            type="button"
            class="mt-2 rounded-lg border border-amber-400 px-3 py-1.5 text-sm font-medium"
            @click="refreshLatest"
          >
            载入最新版本（会替换下面两个输入框）
          </button>
        </div>

        <p
          v-if="!state.editable"
          class="mt-2 text-sm text-[var(--muted-ink)]"
        >
          {{ state.reason }}
        </p>

        <template v-else>
          <label
            class="mt-4 block text-sm font-medium"
            for="firstSong"
          >第一首歌（决赛第一轮唱）</label>
          <UInput
            id="firstSong"
            v-model="firstSong"
            class="mt-1 w-full"
            size="lg"
            maxlength="100"
            placeholder="写具体歌名，如 晴天"
          />

          <label
            class="mt-4 block text-sm font-medium"
            for="secondSong"
          >第二首歌（进前六后第二轮唱）</label>
          <UInput
            id="secondSong"
            v-model="secondSong"
            class="mt-1 w-full"
            size="lg"
            maxlength="100"
            placeholder="写具体歌名，不能和第一首相同"
            @keyup.enter="submit"
          />

          <p class="mt-2 text-xs leading-relaxed text-[var(--muted-ink)]">
            禁填「待定」，不可与初赛、复赛曲目重复；决赛第一轮结束前可修改。
          </p>

          <button
            type="button"
            :disabled="saving"
            class="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-green-600)] px-4 py-3 text-base font-bold text-white shadow transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            @click="submit"
          >
            <UIcon
              v-if="saving"
              name="i-lucide-loader-circle"
              class="size-4 animate-spin"
              aria-hidden="true"
            />
            {{ saving ? '提交中…' : '提交两首歌' }}
          </button>

          <p class="mt-2 text-center text-[11px] text-[var(--muted-ink)]">
            当前版本：v{{ state.revision }}
          </p>
        </template>

        <div class="mt-5 border-t border-[var(--line)] pt-5">
          <h2 class="text-base font-bold">
            第一首伴奏 / 第二首背景视频
          </h2>
          <p class="mt-1 text-xs leading-relaxed text-[var(--muted-ink)]">
            第一首交伴奏音频（mp3 / m4a / wav / aac / ogg / flac，400MB 以内）；第二首交 MP4 背景视频（1GB 以内）。先提交歌名再上传。
          </p>

          <div class="mt-3 rounded-xl border border-[var(--line)] p-3">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  第一首伴奏{{ state.firstSong ? `《${state.firstSong}》` : '（未填）' }}
                </p>
                <p
                  v-if="state.firstAccompaniment"
                  class="truncate text-xs text-[var(--muted-ink)]"
                >
                  {{ state.firstAccompaniment.name }}<span v-if="state.firstAccompaniment.size"> · {{ formatSize(state.firstAccompaniment.size) }}</span>
                </p>
                <p
                  v-else
                  class="text-xs text-[var(--muted-ink)]"
                >
                  还没传
                </p>
              </div>
              <button
                v-if="state.editable"
                type="button"
                :disabled="videoBusy !== null || state.revision < 1"
                class="shrink-0 rounded-lg border border-[var(--color-green-600)] px-3 py-2 text-xs font-medium text-[var(--color-green-700)] disabled:cursor-not-allowed disabled:opacity-50"
                @click="pickMedia(1)"
              >
                {{ videoBusy === 1 ? `上传中 ${videoPercent ?? 0}%` : (state.firstAccompaniment ? '更换第一首伴奏' : '上传第一首伴奏') }}
              </button>
            </div>
            <audio
              v-if="state.firstAccompaniment"
              :src="state.firstAccompaniment.url"
              controls
              class="mt-3 w-full"
            />
            <input
              ref="firstAudioInput"
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
              class="hidden"
              @change="uploadMedia(1, $event)"
            >
          </div>

          <div class="mt-3 rounded-xl border border-[var(--line)] p-3">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  第二首背景视频{{ state.secondSong ? `《${state.secondSong}》` : '（未填）' }}
                </p>
                <p
                  v-if="state.secondVideo"
                  class="truncate text-xs text-[var(--muted-ink)]"
                >
                  {{ state.secondVideo.name }}<span v-if="state.secondVideo.size"> · {{ formatSize(state.secondVideo.size) }}</span>
                </p>
                <p
                  v-else
                  class="text-xs text-[var(--muted-ink)]"
                >
                  还没传
                </p>
              </div>
              <button
                v-if="state.editable"
                type="button"
                :disabled="videoBusy !== null || state.revision < 1"
                class="shrink-0 rounded-lg border border-[var(--color-green-600)] px-3 py-2 text-xs font-medium text-[var(--color-green-700)] disabled:cursor-not-allowed disabled:opacity-50"
                @click="pickMedia(2)"
              >
                {{ videoBusy === 2 ? `上传中 ${videoPercent ?? 0}%` : (state.secondVideo ? '更换第二首视频' : '上传第二首视频') }}
              </button>
            </div>
            <video
              v-if="state.secondVideo"
              :src="state.secondVideo.url"
              controls
              playsinline
              class="mt-3 max-h-56 w-full rounded-lg bg-black"
            />
            <input
              ref="secondVideoInput"
              type="file"
              accept="video/mp4,.mp4"
              class="hidden"
              @change="uploadMedia(2, $event)"
            >
          </div>

          <p
            v-if="state.editable && state.revision < 1"
            class="mt-2 text-xs text-amber-700"
          >
            先提交上面两首歌，伴奏和视频按钮才会启用。
          </p>
        </div>
      </div>

      <div class="mt-6 flex justify-center gap-4 text-xs">
        <NuxtLink
          to="/singer/song"
          class="text-[var(--muted-ink)] underline"
        >
          初赛/复赛填歌
        </NuxtLink>
      </div>

      <p class="mt-8 text-center text-xs text-[var(--muted-ink)]">
        主办：仰恩大学音乐协会
      </p>
    </div>
  </div>
</template>
