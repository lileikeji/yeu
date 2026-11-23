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
      <p class="mt-2 text-center text-sm text-[var(--muted-ink)]">
        一次提交两首，自己决定哪首第一轮唱、哪首第二轮唱；第一轮进前六才会唱第二首。
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
            两首歌都要填具体歌名，不能填「待定」，也不能和初赛、复赛唱过的歌重复。
            提交后还能改，直到决赛第一轮结束；每次提交都会带版本号，
            如果别人（或你另一个窗口）先改过，这里会提示你先载入最新版本，不会直接覆盖。
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
      </div>

      <div class="mt-6 flex justify-center gap-4 text-xs">
        <NuxtLink
          to="/singer/song"
          class="text-[var(--color-green-700)] underline"
        >
          上传决赛背景视频
        </NuxtLink>
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
