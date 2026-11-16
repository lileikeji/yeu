<script setup lang="ts">
interface SongFormState {
  singerName: string
  song: string
  roundKey: string
  roundTitle: string
}

definePageMeta({ layout: false })

const route = useRoute()
const toast = useToast()
const token = String(route.query.token ?? '').trim()

const state = ref<SongFormState | null>(null)
const song = ref('')
const loading = ref(true)
const saving = ref(false)
const done = ref(false)
const error = ref('')

onMounted(async () => {
  if (!token) {
    error.value = '请用邮件里的按钮打开这个页面。'
    loading.value = false
    return
  }
  try {
    const data = await $fetch<SongFormState>('/api/public/competition/result/song', { query: { token } })
    state.value = data
    song.value = data.song ?? ''
  } catch (caught) {
    error.value = catchMessage(caught)
  } finally {
    loading.value = false
  }
})

function catchMessage(caught: unknown): string {
  const data = (caught as { data?: { data?: { message?: string }, message?: string } })?.data
  return data?.data?.message ?? data?.message ?? '打不开这个链接，请用邮件里的按钮重试。'
}

async function submit() {
  if (saving.value) return
  const value = song.value.trim()
  if (!value) {
    toast.add({ title: '先填一下歌名', color: 'warning' })
    return
  }
  saving.value = true
  try {
    const data = await $fetch<SongFormState>('/api/public/competition/result/song', {
      method: 'POST',
      body: { token, song: value }
    })
    state.value = data
    song.value = data.song
    done.value = true
  } catch (caught) {
    toast.add({ title: catchMessage(caught), color: 'error' })
  } finally {
    saving.value = false
  }
}

useSeoMeta({ title: '填写参赛曲目', robots: 'noindex' })
</script>

<template>
  <div class="singer-canvas min-h-dvh text-[var(--ink)]">
    <div class="mx-auto w-full max-w-md px-4 py-8">
      <p class="text-center text-xs tracking-[0.2em] text-[var(--accent-warm)]">仰恩大学音乐协会 · 新声歌手大赛</p>
      <h1 class="mt-2 text-center text-2xl font-black">填写参赛曲目</h1>

      <div v-if="loading" class="mt-8 rounded-2xl bg-white/80 p-6 text-center text-sm text-[var(--muted-ink)]">加载中…</div>

      <div v-else-if="error" class="mt-8 rounded-2xl bg-white/80 p-6 text-center text-sm text-[var(--color-red-600)]">{{ error }}</div>

      <div v-else-if="done" class="mt-8 rounded-2xl bg-white/90 p-6 text-center">
        <p class="text-lg font-semibold text-[var(--color-green-700)]">记下了</p>
        <p class="mt-2 text-sm text-[var(--ink)]">{{ state?.singerName }}，你报的是《{{ state?.song }}》。</p>
        <p class="mt-1 text-xs text-[var(--muted-ink)]">要改就重新填一次。</p>
        <UButton class="mt-5" color="neutral" variant="soft" label="再改一次" @click="done = false" />
      </div>

      <div v-else class="mt-6 rounded-2xl bg-white/90 p-5 shadow-sm">
        <p class="text-sm text-[var(--ink)]">
          {{ state?.singerName }}，{{ state?.roundTitle }}要换一首新歌。填歌名就行，伴奏自己准备。
        </p>
        <label class="mt-4 block text-sm font-medium text-[var(--ink)]" for="song">参赛曲目</label>
        <UInput
          id="song"
          v-model="song"
          class="mt-2 w-full"
          size="lg"
          maxlength="100"
          placeholder="写具体歌名，如 晴天"
          @keyup.enter="submit"
        />
        <UButton class="mt-4 w-full" size="lg" :loading="saving" label="提交" @click="submit" />
      </div>

      <p class="mt-8 text-center text-xs text-[var(--muted-ink)]">主办：仰恩大学音乐协会</p>
    </div>
  </div>
</template>
