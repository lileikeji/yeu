<script setup lang="ts">
import { officialClubs } from '~~/data/seeds/public-content'
import {
  clubListMessages,
  countRecentClubs,
  filterClubListItems,
  hasRecentClubActivity,
  listClubGroups,
  resolveClubDirection,
  resolveClubGroup
} from '~~/app/utils/club-list-presentation'
import { publicClubs } from '~/utils/public-catalog'

useSeoMeta({
  title: '学生社团',
  description: '按兴趣浏览仰恩大学学生社团，查看活动方向与最新招新提醒。'
})

const searchQuery = ref('')
const selectedGroup = ref<string>(clubListMessages.allGroups)
const clubDirectionBySlug = new Map(officialClubs.map(club => [club.slug, club.direction]))
const { data: response, error } = await usePublicClubList()
const clubs = computed(() => publicClubs(response.value?.items ?? [], officialClubs))
const recentClubCount = computed(() => countRecentClubs(clubs.value))
const clubGroups = computed(() => [clubListMessages.allGroups, ...listClubGroups(clubs.value)])
const filteredClubs = computed(() => filterClubListItems(
  clubs.value,
  searchQuery.value,
  selectedGroup.value
))
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          发现同好
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          找到你感兴趣的社团
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          先按兴趣看看学校里有哪些社团。2026 级招新时间、地点和群聊入口还没公布，开学后记得留意校团委和现场通知。
        </p>
        <div class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-zinc-500">
          <span class="inline-flex items-center gap-1.5">
            <UIcon
              name="i-lucide-compass"
              class="size-4 text-green-700"
            />
            {{ clubs.length }} 个兴趣方向
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
            placeholder="搜索社团或兴趣，例如音乐、足球、编程"
            aria-label="搜索学生社团"
            size="lg"
            class="w-full"
          />
          <div
            class="mt-3 flex gap-2 overflow-x-auto pb-1"
            aria-label="按兴趣分类筛选"
          >
            <button
              v-for="group in clubGroups"
              :key="group"
              type="button"
              class="shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition"
              :class="selectedGroup === group
                ? 'bg-green-700 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'"
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
        class="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800"
        role="alert"
      >
        {{ clubListMessages.serviceUnavailable }}
      </div>

      <div
        v-else
        class="mb-4"
      >
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold text-zinc-900">
            找到 {{ filteredClubs.length }} 个社团
          </h2>
          <UButton
            to="/guides/clubs"
            icon="i-lucide-notebook-tabs"
            label="招新指南"
            color="neutral"
            variant="ghost"
          />
        </div>
      </div>

      <div
        v-if="filteredClubs.length"
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <NuxtLink
          v-for="club in filteredClubs"
          :key="club.id"
          :to="`/clubs/${club.slug}`"
          class="surface-panel group flex min-h-48 flex-col p-5 transition hover:border-green-300 hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="grid size-10 place-items-center rounded-md bg-emerald-50 text-emerald-700">
              <UIcon
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
          <h2 class="mt-4 font-bold text-zinc-950">
            {{ club.name }}
          </h2>
          <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600">
            {{ resolveClubDirection(club.summary, clubDirectionBySlug.get(club.slug)) }}
          </p>
          <div class="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            <span
              class="size-2 rounded-full"
              :class="hasRecentClubActivity(club) ? 'bg-emerald-500' : 'bg-amber-400'"
            />
            {{ hasRecentClubActivity(club)
              ? clubListMessages.recentActivity
              : clubListMessages.recruitmentPending }}
          </div>
          <span class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-green-700">
            查看介绍
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3.5"
            />
          </span>
        </NuxtLink>
      </div>

      <div
        v-else-if="!error"
        class="border-y border-zinc-200 bg-white px-5 py-12 text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-6 text-zinc-400"
        />
        <p class="mt-3 text-sm text-zinc-600">
          {{ clubListMessages.emptyMatch }}
        </p>
      </div>
    </div>
  </div>
</template>
