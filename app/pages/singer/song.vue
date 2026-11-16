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
  return data?.data?.message ?? data?.message ?? '出错了，稍后再试。'
}

async function lookup() {
  if (loading.value) return
  error.value = ''
  state.value = null
  loading.value = true
  try {
    const data = await $fetch<SongState>('/api/public/competition/song/lookup', {
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

/** 伴奏不是必填；传过也可以再传一次覆盖旧的。 */
async function uploadAccompaniment(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !state.value) return
  if (file.size > 15 * 1024 * 1024) {
    toast.add({ title: '伴奏别超过 15MB', color: 'warning' })
    return
  }
  accompanimentBusy.value = true
  try {
    const data = await readFileAsBase64(file)
    const result = await $fetch<SongState>('/api/public/competition/song/accompaniment', {
      method: 'POST',
      body: {
        name: name.value.trim(),
        studentNo: studentNo.value.trim(),
        contact: contact.value.trim(),
        filename: file.name,
        data
      }
    })
    state.value = result
    toast.add({ title: '伴奏收到了', description: file.name, color: 'success' })
  } catch (caught) {
    toast.add({ title: messageOf(caught), color: 'error' })
  } finally {
    accompanimentBusy.value = false
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
    const data = await $fetch<SongState>('/api/public/competition/song/submit', {
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
            <button
              type="button"
              :disabled="accompanimentBusy"
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
              {{ accompanimentBusy ? '上传中…' : (state.accompaniment ? '换一个伴奏' : '上传伴奏') }}
            </button>
            <p class="mt-1 text-[11px] text-[var(--muted-ink)]">
              支持 mp3 / m4a / wav / aac / ogg / flac，15MB 以内。微信里点开可以直接从聊天文件或手机里选。
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
