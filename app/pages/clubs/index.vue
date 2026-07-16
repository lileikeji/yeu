<script setup lang="ts">
import { officialClubs } from '~~/data/seeds/public-content'
import {
  clubListMessages,
  countLeadClubs,
  countRecentClubs,
  filterClubListItems,
  joinClubNames
} from '~~/app/utils/club-list-presentation'
import { publicClubs } from '~/utils/public-catalog'

useSeoMeta({
  title: '学生社团',
  description: '查看仰恩大学近期活动可核验的学生社团及招新信息状态。'
})

const searchQuery = ref('')
const { data: response, error } = await usePublicClubList()
const clubs = computed(() => publicClubs(response.value?.items ?? [], officialClubs))
const recentClubCount = computed(() => countRecentClubs(clubs.value))
const leadClubCount = computed(() => countLeadClubs(clubs.value.length, recentClubCount.value))
const clubNamesText = computed(() => joinClubNames(clubs.value))
const filteredClubs = computed(() => filterClubListItems(clubs.value, searchQuery.value))
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          校园活动
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          学生社团
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          当前完整收录 {{ clubs.length }} 个可追溯社团条目：{{ recentClubCount }} 个能在校团委 2026 年活动报道中确认近期活跃，{{ leadClubCount }} 个来自校团委公开附件中的社团干部线索。这里先帮新生知道“学校里可能有哪些方向”，不把未发布的招新群、二维码或收费要求写成确定通知。
        </p>
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="搜索社团名称"
          aria-label="搜索学生社团"
          size="lg"
          class="mt-6 max-w-2xl"
        />
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
        class="mb-4 space-y-4"
      >
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold text-zinc-900">
            {{ filteredClubs.length }} 个社团条目
          </h2>
          <UButton
            to="/guides/clubs"
            icon="i-lucide-notebook-tabs"
            label="招新指南"
            color="neutral"
            variant="ghost"
          />
        </div>
        <div class="rounded-lg border border-violet-100 bg-violet-50/70 p-4 text-sm leading-7 text-violet-950">
          <p class="font-semibold">
            当前 23 个条目完整清单
          </p>
          <p class="mt-1">
            {{ clubNamesText }}
          </p>
          <p class="mt-2 text-xs leading-5 text-violet-800">
            标记为“名称线索待确认”的社团不是删除或漏写，而是只有公开附件线索；等校团委或社团负责人发布 2026 级招新信息后，再补入招新时间、地点、群号和报名方式。
          </p>
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
          class="surface-panel group flex min-h-52 flex-col p-5 transition hover:border-green-300 hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="grid size-10 place-items-center rounded-md bg-violet-50 text-violet-700">
              <UIcon
                name="i-lucide-users-round"
                class="size-5"
              />
            </span>
            <UBadge
              :label="club.category ?? clubListMessages.defaultCategory"
              color="warning"
              variant="soft"
            />
          </div>
          <h2 class="mt-4 font-bold text-zinc-950">
            {{ club.name }}
          </h2>
          <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600">
            {{ club.summary }}
          </p>
          <div class="mt-4 rounded-md bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600">
            <span class="font-semibold text-zinc-800">新生怎么看：</span>
            先按兴趣收藏，开学招新时再核对摊位、群号、例会频率和是否收费。
          </div>
          <span class="mt-4 inline-flex items-center gap-1 text-xs font-medium text-green-700">
            查看资料
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
