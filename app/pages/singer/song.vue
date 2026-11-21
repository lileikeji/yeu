<script setup lang="ts">
interface SongAccompaniment {
  name: string
  url: string
  size: number | null
}

interface SongState {
  singerName: string
  song: string
  accompaniment: SongAccompaniment | null
  stageTitle: string
  editable: boolean
  reason: string
}

definePageMeta({ layout: false })

const toast = useToast()

const name = ref('')
const studentNo = ref('')
const contact = ref('')
const song = ref('')
const state = ref<SongState | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')

useSeoMeta({ title: '填写参赛曲目', robots: 'noindex, nofollow' })

function messageOf(caught: unknown): string {
  const data = (caught as { data?: { data?: { message?: string }, message?: string } })?.data
  const serverSide = data?.data?.message ?? data?.message
  if (serverSide) return serverSide
  const plain = (caught as { message?: string })?.message
  return plain && plain.trim() ? plain : '出错了，稍后再试。'
}

async function lookup() {
  if (loading.value) return
  error.value = ''
  state.value = null
  loading.value = true
  try {
    const data = await plainFetch<SongState>('/api/public/competition/song/lookup', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        studentNo: studentNo.value.trim(),
        contact: contact.value.trim()
      }
    })
    state.value = data
    song.value = data.song ?? ''
  } catch (caught) {
    error.value = messageOf(caught)
  } finally {
    loading.value = false
  }
}

const accompanimentInput = ref<HTMLInputElement | null>(null)
const accompanimentBusy = ref(false)
/** 上传进度：0-100；null 表示还没开始。大文件必须让选手看到在动。 */
const uploadPercent = ref<number | null>(null)
const uploadPhase = ref<'read' | 'upload' | 'confirm' | null>(null)

function formatSize(size: number | null): string {
  if (!size) return ''
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    }
    reader.onerror = () => reject(new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

/** 直传到 COS：走 XHR 才能拿到上传进度，fetch 没有 progress 事件。 */
/**
 * 浏览器的 file.type 不可靠：.m4a 有时报 audio/x-m4a、有时报 video/mp4，
 * 而 COS 的预签名把 content-type 算进签名，两边不一致就会 403。
 * 所以统一按扩展名定一个固定值，签名和 PUT 都用它。
 */
function uploadMimeFor(file: File): string {
  const extension = (file.name.split('.').at(-1) || '').toLowerCase()
  if (extension === 'm4a' || extension === 'mp4') return 'audio/mp4'
  if (extension === 'wav') return 'audio/wav'
  if (extension === 'aac') return 'audio/aac'
  if (extension === 'ogg') return 'audio/ogg'
  if (extension === 'flac') return 'audio/flac'
  return 'audio/mpeg'
}

function putFileWithProgress(url: string, file: File, contentType: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url, true)
    request.setRequestHeader('Content-Type', contentType)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        uploadPercent.value = Math.min(99, Math.round((event.loaded / event.total) * 100))
      }
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        uploadPercent.value = 100
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

const GENERIC_SONG_WORDS = new Set(['伴奏', '纯音乐', '音乐', '未知', '录音', '新录音', 'audio', 'track', 'demo', '未命名'])

/** 从文件名里猜歌名：去掉扩展名、去掉「伴奏 / (伴奏) / 纯音乐」等字样。 */
function guessSongFromFilename(filename: string): string {
  let title = String(filename || '').split('/').at(-1) || ''
  title = title.replace(/\.[a-z0-9]{2,5}$/i, '')
  title = title.replace(/[（(【[][^）)】\]]{0,12}[）)】\]]/g, ' ')
  title = title.replace(/(伴奏|纯音乐|消音|和声|karaoke|instrumental)/gi, ' ')
  title = title.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (title.length < 2 || title.length > 40) return ''
  if (GENERIC_SONG_WORDS.has(title.toLowerCase())) return ''
  return title
}

/** 伴奏不是必填；传过也可以再传一次覆盖旧的。 */
async function uploadAccompaniment(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !state.value) return
  if (file.size > 400 * 1024 * 1024) {
    toast.add({ title: '伴奏别超过 400MB', color: 'warning' })
    return
  }
  // 文件名里往往就是真歌名：输入框还是旧歌（没手改过）时按文件名纠正，
  // 免得换歌后伴奏被记到上一首名下。
  const guessed = guessSongFromFilename(file.name)
  const current = (song.value || '').trim()
  if (guessed && current && guessed !== current) {
    song.value = guessed
    toast.add({ title: `已按文件名改成《${guessed}》`, description: '不对就在输入框里改回来', color: 'warning' })
  }
  const songValue = (song.value || '').trim()
  if (!songValue) {
    toast.add({ title: '先把曲目填上，再传伴奏', color: 'warning' })
    return
  }
  accompanimentBusy.value = true
  uploadPercent.value = null
  uploadPhase.value = null
  try {
    // 优先直传对象存储：字节不经过服务器，400MB 也不会把内存顶爆
    const ticket = await plainFetch<{ key: string, uploadUrl: string }>(
      '/api/public/competition/song/accompaniment-ticket',
      {
        method: 'POST',
        body: {
          name: name.value.trim(),
          studentNo: studentNo.value.trim(),
          contact: contact.value.trim(),
          filename: file.name,
          mime: uploadMimeFor(file),
          song: songValue
        }
      }
    ).catch(() => null)
    if (ticket?.uploadUrl) {
      uploadPhase.value = 'upload'
      uploadPercent.value = 0
      await putFileWithProgress(ticket.uploadUrl, file, uploadMimeFor(file))
      uploadPhase.value = 'confirm'
      const committed = await plainFetch<SongState>('/api/public/competition/song/accompaniment-commit', {
        method: 'POST',
        body: {
          name: name.value.trim(),
          studentNo: studentNo.value.trim(),
          contact: contact.value.trim(),
          key: ticket.key,
          filename: file.name,
          song: songValue
        }
      })
      state.value = committed
      toast.add({ title: '伴奏收到了', description: `${songValue || '当前曲目'}：${file.name}`, color: 'success' })
      return
    }
    uploadPhase.value = 'read'
    uploadPercent.value = 0
    const data = await readFileAsBase64(file)
    uploadPhase.value = 'upload'
    uploadPercent.value = 95
    const result = await plainFetch<SongState>('/api/public/competition/song/accompaniment', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        studentNo: studentNo.value.trim(),
        contact: contact.value.trim(),
        filename: file.name,
        song: songValue,
        data
      }
    })
    state.value = result
    toast.add({ title: '伴奏收到了', description: file.name, color: 'success' })
  } catch (caught) {
    toast.add({ title: messageOf(caught), color: 'error' })
  } finally {
    accompanimentBusy.value = false
    uploadPhase.value = null
    uploadPercent.value = null
  }
}

async function submit() {
  if (saving.value || !state.value) return
  const value = song.value.trim()
  if (!value) {
    toast.add({ title: '先填一下歌名', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const data = await plainFetch<SongState>('/api/public/competition/song/submit', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        studentNo: studentNo.value.trim(),
        contact: contact.value.trim(),
        song: value
      }
    })
    state.value = data
    song.value = data.song
    toast.add({ title: `记下了：《${data.song}》`, color: 'success' })
  } catch (caught) {
    toast.add({ title: messageOf(caught), color: 'error' })
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
        填写参赛曲目
      </h1>
      <p class="mt-2 text-center text-sm text-[var(--muted-ink)]">
        晋级了才需要填，填完想改再填一次。
      </p>

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
          v-if="error"
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
        <p
          v-if="!state.editable"
          class="mt-2 text-sm text-[var(--muted-ink)]"
        >
          {{ state.reason }}
        </p>
        <template v-else>
          <label
            class="mt-4 block text-sm font-medium"
            for="song"
          >新曲目</label>
          <UInput
            id="song"
            v-model="song"
            class="mt-1 w-full"
            size="lg"
            maxlength="100"
            placeholder="写具体歌名，如 晴天"
            @keyup.enter="submit"
          />
          <div class="mt-4 rounded-xl border border-dashed border-[var(--line)] p-3">
            <p class="text-sm font-medium">
              伴奏 <span class="text-xs font-normal text-[var(--muted-ink)]">选填，不传也行，之后还能再传</span>
            </p>
            <p class="mt-1 text-xs leading-relaxed text-[var(--muted-ink)]">
              支持 mp3 / m4a / wav / aac / ogg / flac，单个不超过 400MB。
              伴奏会记在当前曲目《{{ song.trim() || '未填' }}》名下：换了歌务必先把上面的曲目改成新歌名，再传伴奏。<br>
              iPhone 在微信里选不到聊天文件时：先长按文件「用其他应用打开 → 存储到文件」，再点下面的按钮从「文件」App 里选；实在不行把伴奏发给工作人员代传。
            </p>
            <p
              v-if="state.accompaniment"
              class="mt-1 truncate text-xs text-[var(--muted-ink)]"
            >
              已上传：{{ state.accompaniment.name }}<span v-if="state.accompaniment.size">（{{ formatSize(state.accompaniment.size) }}）</span>
            </p>
            <input
              ref="accompanimentInput"
              type="file"
              accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac"
              class="hidden"
              @change="uploadAccompaniment"
            >
            <p
              v-if="!song.trim() && !state.song"
              class="mt-1 text-xs text-[var(--color-orange-600)]"
            >
              先用上面的输入框把新曲目填上，才能选伴奏文件。
            </p>
            <button
              type="button"
              :disabled="accompanimentBusy || (!song.trim() && !state.song)"
              class="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-medium disabled:opacity-60"
              @click="accompanimentInput?.click()"
            >
              <UIcon
                v-if="accompanimentBusy"
                name="i-lucide-loader-circle"
                class="size-4 animate-spin"
                aria-hidden="true"
              />
              <UIcon
                v-else
                name="i-lucide-upload"
                class="size-4"
                aria-hidden="true"
              />
              {{ accompanimentBusy
                ? (uploadPhase === 'read' ? '读取文件…'
                  : uploadPhase === 'confirm' ? '确认中…'
                    : uploadPercent !== null ? `上传中 ${uploadPercent}%` : '上传中…')
                : (state.accompaniment ? '换一个伴奏' : '上传伴奏') }}
            </button>
            <div
              v-if="accompanimentBusy"
              class="mt-2"
            >
              <div class="h-1.5 w-full overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  class="h-full rounded-full bg-[var(--color-green-600)] transition-all duration-200"
                  :style="{ width: `${uploadPercent ?? 0}%` }"
                />
              </div>
              <p class="mt-1 text-[11px] text-[var(--muted-ink)]">
                {{ uploadPhase === 'confirm' ? '文件传完了，正在登记…' : uploadPercent === null ? '准备中…' : `${uploadPercent}%（别关页面，传完会自动跳提示）` }}
              </p>
            </div>
            <p class="mt-1 text-[11px] text-[var(--muted-ink)]">
              支持 mp3 / m4a / wav / aac / ogg / flac，400MB 以内。微信里点开可以直接从聊天文件或手机里选。
            </p>
          </div>

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
            {{ saving ? '提交中…' : '提交曲目' }}
          </button>
        </template>
      </div>

      <p class="mt-8 text-center text-xs text-[var(--muted-ink)]">
        主办：仰恩大学音乐协会
      </p>
    </div>
  </div>
</template>
