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
const secondFileInput = ref<HTMLInputElement | null>(null)
const uploadDetail = ref('')
const resumable = ref<ResumeRecord | null>(null)

useSeoMeta({ title: '决赛两首歌提交', robots: 'noindex, nofollow' })

interface ResumeRecord {
  slot: 1 | 2
  key: string
  uploadId: string
  partSize: number
  size: number
  filename: string
  lastModified: number
  savedAt: number
}

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

function extensionOf(filename: string): string {
  return (filename.split('.').at(-1) || '').toLowerCase()
}

function isZip(name: string | null | undefined): boolean {
  return (name || '').toLowerCase().endsWith('.zip')
}

function canUpload(): boolean {
  if (videoBusy.value !== null) return false
  if (!state.value || state.value.revision < 1) {
    toast.add({ title: '先提交两首歌，再传伴奏或视频', color: 'warning' })
    return false
  }
  return state.value.editable
}

function pickMedia(slot: 1 | 2): void {
  if (!canUpload()) return
  const input = slot === 1 ? firstAudioInput.value : secondVideoInput.value
  input?.click()
}

/** 第二首也可以交压缩包：走「文件」入口，能选到 MP4 或 ZIP。 */
function pickSecondFile(): void {
  if (!canUpload()) return
  secondFileInput.value?.click()
}

interface MediaSession {
  key: string
  uploadId: string
  partSize: number
  expiresIn: number
  uploaded: Array<{ partNumber: number, size: number }>
}

const RESUME_PREFIX = 'yeu-final-media-upload-v1'
const SECOND_EXTENSIONS = ['mp4', 'zip'] as const
const SECOND_HINT = '第二首只收 MP4 视频或 ZIP 压缩包'

let progressBase = 0
const inflight = new Map<number, number>()
let speedSince = 0
let speedBytes = 0

function resumeStorageKey(slot: 1 | 2): string {
  return `${RESUME_PREFIX}:${slot}:${encodeURIComponent(name.value.trim())}:${encodeURIComponent(studentNo.value.trim())}`
}

function readResume(slot: 1 | 2): ResumeRecord | null {
  try {
    const raw = localStorage.getItem(resumeStorageKey(slot))
    if (!raw) return null
    const parsed = JSON.parse(raw) as ResumeRecord
    return parsed && parsed.slot === slot && parsed.key && parsed.uploadId ? parsed : null
  } catch {
    return null
  }
}

function writeResume(record: ResumeRecord): void {
  try {
    localStorage.setItem(resumeStorageKey(record.slot), JSON.stringify(record))
    resumable.value = record
  } catch {
    // 隐私模式或存储写满时忽略，只是没法跨刷新续传
  }
}

function clearResume(slot: 1 | 2): void {
  try {
    localStorage.removeItem(resumeStorageKey(slot))
  } catch {
    // 同上，清不掉也不影响本次上传
  }
  if (resumable.value?.slot === slot) resumable.value = null
}

function loadResumable(): void {
  resumable.value = readResume(1) ?? readResume(2)
}

function mediaMultipart<T>(body: Record<string, unknown>): Promise<T> {
  return plainFetch<T>('/api/public/competition/final-songs/media-multipart', {
    method: 'POST',
    body: {
      name: name.value.trim(),
      studentNo: studentNo.value.trim(),
      contact: contact.value.trim(),
      ...body
    }
  })
}

function refreshProgress(total: number): void {
  let loaded = progressBase
  for (const value of inflight.values()) loaded += value
  const percent = Math.max(0, Math.min(99, Math.floor((loaded / total) * 100)))
  videoPercent.value = percent
  const elapsed = speedSince ? (Date.now() - speedSince) / 1000 : 0
  const speed = elapsed > 0.5 ? (progressBase - speedBytes) / elapsed : 0
  const parts = [`已传 ${formatSize(loaded)} / ${formatSize(total)}`]
  if (speed > 0) {
    parts.push(`${(speed / 1024 / 1024).toFixed(1)} MB/s`)
    const remain = (total - loaded) / speed
    if (Number.isFinite(remain) && remain > 1) {
      parts.push(remain > 60 ? `剩余约 ${Math.ceil(remain / 60)} 分钟` : `剩余约 ${Math.ceil(remain)} 秒`)
    }
  }
  uploadDetail.value = parts.join(' · ')
}

function putPart(url: string, blob: Blob, partNumber: number, total: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url, true)
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      inflight.set(partNumber, event.loaded)
      refreshProgress(total)
    }
    request.onload = () => {
      inflight.delete(partNumber)
      if (request.status >= 200 && request.status < 300) {
        resolve()
        return
      }
      reject(new Error(`分片上传失败（${request.status}）`))
    }
    request.onerror = () => {
      inflight.delete(partNumber)
      reject(new Error('网络中断了'))
    }
    request.ontimeout = () => {
      inflight.delete(partNumber)
      reject(new Error('这一片超时了'))
    }
    // 单片 8MB，十分钟足够慢网跑完，也避免死连接一直挂着
    request.timeout = 10 * 60 * 1000
    request.send(blob)
  })
}

async function putPartWithRetry(url: string, blob: Blob, partNumber: number, total: number): Promise<void> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await putPart(url, blob, partNumber, total)
      return
    } catch (caught) {
      lastError = caught
      // 1s / 3s / 9s 退避，切后台或信号弱的时候给它重连的机会
      await new Promise(resolve => setTimeout(resolve, 1000 * 3 ** attempt))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('分片上传失败')
}

async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, Math.max(1, items.length)) }, async () => {
    while (cursor < items.length) {
      const item = items[cursor]!
      cursor += 1
      await worker(item)
    }
  })
  await Promise.all(runners)
}

/**
 * 分片上传 + 断点续传：先问后端这个会话已经收下哪些分片（断线/切后台回来都靠它），
 * 只补缺的片，全部到位后由后端合并、校验、写库。
 */
async function runUpload(slot: 1 | 2, file: File, resume: ResumeRecord | null): Promise<void> {
  const total = file.size
  const session = resume
    ? await mediaMultipart<MediaSession>({ action: 'status', slot, key: resume.key, uploadId: resume.uploadId })
    : await mediaMultipart<MediaSession>({ action: 'init', slot, filename: file.name, size: total })
  const partSize = session.partSize
  const totalParts = Math.ceil(total / partSize)
  const uploaded = new Map(session.uploaded.map(part => [part.partNumber, part.size]))
  writeResume({
    slot,
    key: session.key,
    uploadId: session.uploadId,
    partSize,
    size: total,
    filename: file.name,
    lastModified: file.lastModified,
    savedAt: Date.now()
  })
  progressBase = [...uploaded.values()].reduce((sum, value) => sum + value, 0)
  speedSince = Date.now()
  speedBytes = progressBase
  inflight.clear()
  refreshProgress(total)
  const missing: number[] = []
  for (let partNumber = 1; partNumber <= totalParts; partNumber += 1) {
    if (!uploaded.has(partNumber)) missing.push(partNumber)
  }
  if (missing.length) uploadDetail.value = `还要补 ${missing.length} 片 · ${formatSize(progressBase)} 已就位`
  for (let offset = 0; offset < missing.length; offset += 12) {
    const batch = missing.slice(offset, offset + 12)
    const signed = await mediaMultipart<{ urls: Array<{ partNumber: number, url: string }> }>({
      action: 'sign',
      slot,
      key: session.key,
      uploadId: session.uploadId,
      partNumbers: batch
    })
    await runWithConcurrency(signed.urls, 3, async ({ partNumber, url }) => {
      const start = (partNumber - 1) * partSize
      const end = Math.min(total, start + partSize)
      await putPartWithRetry(url, file.slice(start, end), partNumber, total)
      progressBase += end - start
      refreshProgress(total)
    })
  }
  videoPercent.value = 99
  uploadDetail.value = '分片都传完了，正在合并校验…'
  const data = await mediaMultipart<CompetitionFinalSongsState>({
    action: 'complete',
    slot,
    key: session.key,
    uploadId: session.uploadId,
    size: total
  })
  clearResume(slot)
  fillFrom(data)
}

async function uploadMedia(slot: 1 | 2, event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !state.value) return
  const extension = extensionOf(file.name)
  if (slot === 1) {
    if (!(AUDIO_EXTENSIONS as readonly string[]).includes(extension)) {
      toast.add({ title: '第一首伴奏只收 mp3 / m4a / wav / aac / ogg / flac', color: 'warning' })
      return
    }
    if (file.size > 400 * 1024 * 1024) {
      toast.add({ title: '伴奏不能超过 400MB', color: 'warning' })
      return
    }
  } else {
    if (!(SECOND_EXTENSIONS as readonly string[]).includes(extension)) {
      toast.add({ title: SECOND_HINT, color: 'warning' })
      return
    }
    if (file.size > 1024 * 1024 * 1024) {
      toast.add({ title: '背景视频不能超过 1GB', color: 'warning' })
      return
    }
  }
  const existing = resumable.value?.slot === slot ? resumable.value : null
  const matches = existing !== null
    && existing.size === file.size
    && existing.filename === file.name
    && existing.lastModified === file.lastModified
  if (existing && !matches) {
    // 换了文件，旧会话作废，重新开一个
    try {
      await mediaMultipart({ action: 'abort', slot, key: existing.key, uploadId: existing.uploadId })
    } catch {
      // 旧会话取消失败不影响新上传
    }
    clearResume(slot)
  }
  videoBusy.value = slot
  videoPercent.value = 0
  uploadDetail.value = matches ? '正在核对已传分片…' : '正在开上传会话…'
  try {
    await runUpload(slot, file, matches ? existing : null)
    toast.add({ title: slot === 1 ? '第一首伴奏收到了' : '第二首背景视频收到了', color: 'success' })
  } catch (caught) {
    const message = messageOf(caught)
    toast.add({
      title: message,
      description: resumable.value ? '进度已经记下了，重新选同一个文件就能接着传。' : undefined,
      color: 'error'
    })
  } finally {
    videoBusy.value = null
    videoPercent.value = null
    uploadDetail.value = ''
    inflight.clear()
  }
}

async function resumeUpload(slot: 1 | 2): Promise<void> {
  if (videoBusy.value !== null) return
  const input = slot === 1 ? firstAudioInput.value : secondVideoInput.value
  toast.add({ title: '重新选中同一个文件，会从上次停下的一片继续', color: 'info' })
  input?.click()
}

async function dropResume(): Promise<void> {
  const record = resumable.value
  if (!record) return
  try {
    await mediaMultipart({ action: 'abort', slot: record.slot, key: record.key, uploadId: record.uploadId })
  } catch {
    // 会话可能已过期，忽略
  }
  clearResume(record.slot)
  toast.add({ title: '已放弃上次没传完的文件', color: 'success' })
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
    loadResumable()
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

/** 正在传文件时关页面/刷新会丢进度，先拦一下；已经传完的分片仍在服务器上。 */
function guardBeforeUnload(event: BeforeUnloadEvent): void {
  if (videoBusy.value === null) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', guardBeforeUnload)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', guardBeforeUnload)
})
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
            禁填「待定」，不可与初赛、复赛曲目重复。
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
            第一首交伴奏音频（mp3 / m4a / wav / aac / ogg / flac，400MB 以内）；第二首交 MP4 背景视频或 ZIP 压缩包（1GB 以内）。先提交歌名再上传。
          </p>
          <p class="mt-1 text-xs leading-relaxed text-[var(--muted-ink)]">
            大文件自动分片上传：网络断了、切到后台都不要紧，回来重新选同一个文件，会从断开的那一片接着传。
          </p>

          <div
            v-if="resumable"
            class="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
          >
            <p class="font-medium">
              上次没传完：{{ resumable.filename }}（{{ formatSize(resumable.size) }}）
            </p>
            <p class="mt-1 leading-relaxed">
              重新选中同一个文件就能接着传，已经传上去的分片不会白费。
            </p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                :disabled="videoBusy !== null"
                class="rounded-lg border border-amber-400 px-3 py-1.5 font-medium disabled:opacity-50"
                @click="resumeUpload(resumable.slot)"
              >
                继续上传
              </button>
              <button
                type="button"
                :disabled="videoBusy !== null"
                class="rounded-lg px-3 py-1.5 text-amber-800 underline disabled:opacity-50"
                @click="dropResume"
              >
                放弃
              </button>
            </div>
          </div>

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
            <p
              v-if="videoBusy === 1 && uploadDetail"
              class="mt-2 text-[11px] text-[var(--muted-ink)]"
            >
              {{ uploadDetail }}
            </p>
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
                  第二首背景视频 / 压缩包{{ state.secondSong ? `《${state.secondSong}》` : '（未填）' }}
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
              <div class="flex shrink-0 flex-col gap-1">
                <button
                  v-if="state.editable"
                  type="button"
                  :disabled="videoBusy !== null || state.revision < 1"
                  class="rounded-lg border border-[var(--color-green-600)] px-3 py-2 text-xs font-medium text-[var(--color-green-700)] disabled:cursor-not-allowed disabled:opacity-50"
                  @click="pickMedia(2)"
                >
                  {{ videoBusy === 2 ? `上传中 ${videoPercent ?? 0}%` : (state.secondVideo ? '换视频' : '从相册选视频') }}
                </button>
                <button
                  v-if="state.editable"
                  type="button"
                  :disabled="videoBusy !== null || state.revision < 1"
                  class="rounded-lg border border-[var(--line)] px-3 py-2 text-xs font-medium text-[var(--muted-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                  @click="pickSecondFile"
                >
                  选文件（MP4/ZIP）
                </button>
              </div>
            </div>
            <p
              v-if="videoBusy === 2 && uploadDetail"
              class="mt-2 text-[11px] text-[var(--muted-ink)]"
            >
              {{ uploadDetail }}
            </p>
            <video
              v-if="state.secondVideo && !isZip(state.secondVideo.name)"
              :src="state.secondVideo.url"
              controls
              playsinline
              class="mt-3 max-h-56 w-full rounded-lg bg-black"
            />
            <a
              v-else-if="state.secondVideo"
              :href="state.secondVideo.url"
              target="_blank"
              rel="noopener"
              class="mt-3 flex items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--color-green-700)] underline"
            >
              <UIcon
                name="i-lucide-file-archive"
                class="size-4"
                aria-hidden="true"
              />
              压缩包已上传，点这里下载核对
            </a>
            <input
              ref="secondVideoInput"
              type="file"
              accept="video/*,.mp4"
              class="hidden"
              @change="uploadMedia(2, $event)"
            >
            <input
              ref="secondFileInput"
              type="file"
              accept=".mp4,.zip,video/mp4,application/zip,application/x-zip-compressed"
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
