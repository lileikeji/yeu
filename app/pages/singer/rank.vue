<script setup lang="ts">
import type { CompetitionRankBoard } from '~~/shared/types'

definePageMeta({ layout: false })

useSeoMeta({ title: '复赛排行', robots: 'noindex, nofollow' })

const round = ref<'prelim' | 'semi' | 'final'>('semi')
const board = ref<CompetitionRankBoard | null>(null)
const loading = ref(true)
const error = ref('')
const zoom = ref<{ name: string, url: string } | null>(null)

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const response = await fetch(`/api/public/competition/rank?round=${round.value}`, { headers: { Accept: 'application/json' } })
    const data = await response.json().catch(() => null) as CompetitionRankBoard | null
    if (!response.ok || !data) throw new Error('LOAD_FAILED')
    board.value = data
  } catch {
    error.value = '加载失败，稍后再试。'
  } finally {
    loading.value = false
  }
}

function openPhoto(row: { name: string, photoUrl: string | null }): void {
  if (!row.photoUrl) return
  zoom.value = { name: row.name, url: row.photoUrl }
}

onMounted(load)
watch(round, load)
</script>

<template>
  <div class="min-h-dvh bg-[#faf7f2] px-3 py-6 text-zinc-900">
    <div class="mx-auto w-full max-w-5xl space-y-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs tracking-[0.2em] text-[#b45c33]">
            仰恩大学音乐协会 · 新声歌手大赛
          </p>
          <h1 class="mt-1 text-2xl font-black">
            {{ board?.round.title ?? '比赛' }}排行
          </h1>
        </div>
        <select
          v-model="round"
          class="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        >
          <option value="prelim">
            初赛
          </option>
          <option value="semi">
            复赛
          </option>
          <option value="final">
            决赛
          </option>
        </select>
      </header>

      <p
        v-if="error"
        class="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600"
      >
        {{ error }}
      </p>

      <div
        v-if="loading"
        class="rounded-xl bg-white px-4 py-10 text-center text-sm text-zinc-400 shadow-sm"
      >
        加载中…
      </div>

      <div
        v-else-if="board && board.rows.length === 0"
        class="rounded-xl bg-white px-4 py-10 text-center text-sm text-zinc-400 shadow-sm"
      >
        这一轮还没有成绩。
      </div>

      <div
        v-else-if="board"
        class="overflow-hidden rounded-xl bg-white shadow-sm"
      >
        <table class="w-full text-sm">
          <thead class="bg-[#fff2e0] text-left text-xs text-[#a06a3c]">
            <tr>
              <th class="w-14 px-3 py-2 font-medium">
                名次
              </th>
              <th class="w-16 px-2 py-2 font-medium">
                照片
              </th>
              <th class="px-3 py-2 font-medium">
                选手
              </th>
              <th class="px-3 py-2 font-medium">
                歌曲
              </th>
              <th class="w-20 px-3 py-2 text-center font-medium">
                出场
              </th>
              <th class="w-24 px-3 py-2 text-right font-medium">
                平均分
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-100">
            <tr
              v-for="row in board.rows"
              :key="row.entryId"
            >
              <td class="px-3 py-2 text-base font-black tabular-nums text-[#b45c33]">
                {{ row.rank ?? '—' }}
              </td>
              <td class="px-2 py-2">
                <button
                  v-if="row.photoUrl"
                  type="button"
                  class="block size-12 overflow-hidden rounded-md border border-zinc-200"
                  :aria-label="`查看${row.name}的照片`"
                  @click="openPhoto(row)"
                >
                  <img
                    :src="row.photoUrl"
                    :alt="row.name"
                    class="size-12 object-cover"
                  >
                </button>
                <span
                  v-else
                  class="grid size-12 place-items-center rounded-md bg-zinc-100 text-[10px] text-zinc-400"
                >无照片</span>
              </td>
              <td class="px-3 py-2 font-semibold">
                {{ row.name }}
                <span class="ml-1 text-xs font-normal text-zinc-400">{{ row.className }}</span>
              </td>
              <td class="px-3 py-2 text-zinc-600">
                {{ row.song }}
              </td>
              <td class="px-3 py-2 text-center tabular-nums text-zinc-500">
                {{ row.position }}
              </td>
              <td class="px-3 py-2 text-right font-bold tabular-nums">
                {{ row.average == null ? '—' : row.average.toFixed(2) }}
                <span class="text-xs font-normal text-zinc-400">/ {{ board.maxTotal }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="text-center text-xs text-zinc-400">
        仰恩大学音乐协会
      </p>
    </div>

    <div
      v-if="zoom"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click="zoom = null"
    >
      <figure class="max-h-full w-full max-w-md text-center">
        <img
          :src="zoom.url"
          :alt="zoom.name"
          class="mx-auto max-h-[78vh] w-auto rounded-lg object-contain"
        >
        <figcaption class="mt-3 text-sm text-white/80">
          {{ zoom.name }}
        </figcaption>
      </figure>
    </div>
  </div>
</template>
