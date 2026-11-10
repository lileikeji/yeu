<script setup lang="ts">
import { officialClubs } from '~~/data/seeds/public-content'
import {
  clubListMessages,
  countRecentClubs,
  filterClubListItems,
  hasClubContactMethod,
  hasRecentClubActivity,
  listClubGroups,
  resolveClubContactStatusText,
  resolveClubDirection,
  resolveClubGroup
} from '~~/app/utils/club-list-presentation'
import { publicClubs } from '~/utils/public-catalog'
import {
  directoryListBatchSize,
  directoryListToggleLabel,
  nextDirectoryVisibleCount,
  previewDirectoryItems
} from '~~/app/utils/directory-list-presentation'

useSeoMeta({
  title: '学生社团',
  description: '按兴趣浏览学生社团，查看活动方向与最新招新提醒。'
})

const searchQuery = ref('')
const selectedGroup = ref<string>(clubListMessages.allGroups)
const visibleCount = ref(directoryListBatchSize)
const clubDirectionBySlug = new Map(officialClubs.map(club => [club.slug, club.direction]))
const { data: response, error, refresh } = await usePublicClubList()
const clubs = computed(() => publicClubs(response.value?.items ?? [], officialClubs))
const recentClubCount = computed(() => countRecentClubs(clubs.value))
const clubGroups = computed(() => [clubListMessages.allGroups, ...listClubGroups(clubs.value)])
const filteredClubs = computed(() => filterClubListItems(
  clubs.value,
  searchQuery.value,
  selectedGroup.value
))
const isFiltering = computed(() => Boolean(searchQuery.value.trim())
  || selectedGroup.value !== clubListMessages.allGroups)
const visibleClubs = computed(() => previewDirectoryItems(filteredClubs.value, {
  filtered: isFiltering.value,
  visibleCount: visibleCount.value
}))
const showListToggle = computed(() => !isFiltering.value
  && filteredClubs.value.length > directoryListBatchSize)
const listToggleLabel = computed(() => directoryListToggleLabel(
  visibleClubs.value.length,
  filteredClubs.value.length
))

watch([searchQuery, selectedGroup], () => {
  visibleCount.value = directoryListBatchSize
})

function toggleClubList() {
  visibleCount.value = nextDirectoryVisibleCount(
    visibleClubs.value.length,
    filteredClubs.value.length
  )
}

function clearClubFilters() {
  searchQuery.value = ''
  selectedGroup.value = clubListMessages.allGroups
}
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          发现同好
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          找到你感兴趣的社团
        </h1>
        <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span class="inline-flex items-center gap-1.5">
            <UIcon
              name="i-lucide-compass"
              class="size-4 text-green-700 dark:text-green-400"
            />
            {{ clubs.length }} 个社团
          </span>
          <span class="inline-flex items-center gap-1.5">
            <span class="size-2 rounded-full bg-emerald-500" />
            {{ recentClubCount }} 个近期有活动
          </span>
        </div>
        <div class="mt-6 max-w-2xl">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="搜索社团或兴趣"
            aria-label="搜索学生社团"
            size="lg"
            class="min-h-11 w-full"
            :ui="{ base: 'min-h-11' }"
          />
          <USelect
            v-model="selectedGroup"
            :items="clubGroups"
            aria-label="按兴趣分类筛选"
            size="lg"
            class="mt-3 min-h-11 w-full md:hidden"
          />
          <div
            class="mt-3 hidden flex-wrap gap-2 md:flex"
            aria-label="按兴趣分类筛选"
          >
            <button
              v-for="group in clubGroups"
              :key="group"
              type="button"
              class="inline-flex min-h-10 shrink-0 items-center rounded-md px-3 text-xs font-medium transition"
              :class="selectedGroup === group
                ? 'bg-green-700 text-white'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'"
              :aria-pressed="selectedGroup === group"
              @click="selectedGroup = group"
            >
              {{ group }}
            </button>
          </div>
        </div>
      </div>
    </header>

    <div class="page-shell page-section">
      <div
        v-if="error"
        class="mb-5 border-l-2 border-amber-500 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3"
        role="status"
      >
        <div class="flex items-start gap-3">
          <UIcon
            name="i-lucide-info"
            class="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
          />
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-bold text-amber-950">
              部分社团信息还没更新出来
            </h2>
            <p class="mt-1 text-xs leading-5 text-amber-900 dark:text-amber-300">
              {{ clubListMessages.serviceUnavailable }}
            </p>
            <UButton
              icon="i-lucide-refresh-cw"
              label="重新试一次"
              color="neutral"
              variant="outline"
              class="mt-3 min-h-11"
              @click="refresh()"
            />
          </div>
        </div>
      </div>

      <div
        class="mb-4"
      >
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            找到 {{ filteredClubs.length }} 个社团
          </h2>
          <UButton
            to="/guides/clubs"
            icon="i-lucide-notebook-tabs"
            label="招新指南"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>

      <div
        v-if="filteredClubs.length"
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <NuxtLink
          v-for="club in visibleClubs"
          :key="club.id"
          :to="`/clubs/${club.slug}`"
          class="surface-panel group flex min-h-48 flex-col p-5 transition hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              <img
                v-if="club.iconUrl"
                :src="club.iconUrl"
                :alt="`${club.name}图标`"
                class="size-full object-cover"
              >
              <UIcon
                v-else
                name="i-lucide-users-round"
                class="size-5"
              />
            </span>
            <UBadge
              :label="resolveClubGroup(club.category)"
              color="neutral"
              variant="soft"
            />
          </div>
          <h2 class="mt-4 font-bold text-zinc-950 dark:text-zinc-100">
            {{ club.name }}
          </h2>
          <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {{ resolveClubDirection(club.summary, club.direction || clubDirectionBySlug.get(club.slug)) }}
          </p>
          <div class="mt-4 space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs text-zinc-500 dark:text-zinc-400">
            <div class="flex items-center gap-2">
              <span
                class="size-2 rounded-full"
                :class="hasRecentClubActivity(club) ? 'bg-emerald-500' : 'bg-amber-400'"
              />
              {{ hasRecentClubActivity(club)
                ? clubListMessages.recentActivity
                : clubListMessages.recruitmentPending }}
            </div>
            <div class="flex items-center gap-2">
              <span
                class="size-2 rounded-full"
                :class="hasClubContactMethod(club.contactMethod, club.contactPhone, club.groupQrUrl, club.contactQrUrl) ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'"
              />
              {{ resolveClubContactStatusText(club.contactMethod, club.contactPhone, club.groupQrUrl, club.contactQrUrl) }}
            </div>
          </div>
          <span class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-green-700 dark:text-green-400">
            打开介绍
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3.5"
            />
          </span>
        </NuxtLink>
      </div>

      <div
        v-if="showListToggle"
        class="mt-6 flex justify-center"
      >
        <UButton
          :icon="visibleClubs.length >= filteredClubs.length ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :label="listToggleLabel"
          color="neutral"
          variant="ghost"
          class="min-h-11"
          @click="toggleClubList"
        />
      </div>

      <div
        v-if="!error && !filteredClubs.length"
        class="border-y border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-12 text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-6 text-zinc-400 dark:text-zinc-500"
        />
        <p class="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
          {{ clubListMessages.emptyMatch }}
        </p>
        <UButton
          v-if="isFiltering"
          icon="i-lucide-x"
          label="清除筛选"
          color="neutral"
          variant="outline"
          class="mt-4 min-h-11"
          @click="clearClubFilters"
        />
      </div>

      <section class="mt-8 border-t border-zinc-200 dark:border-zinc-800 pt-4">
        <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          近期活动与招新
        </h2>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            to="/singer"
            icon="i-lucide-mic-vocal"
            label="新声歌手大赛"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
          <UButton
            to="/competition"
            icon="i-lucide-trophy"
            label="赛事与招新总览"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
        </div>
      </section>
    </div>
  </div>
</template>
