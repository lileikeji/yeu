<script setup lang="ts">
import { publicClubs } from '~/utils/public-catalog'

useSeoMeta({
  title: '学生社团',
  description: '查看仰恩大学近期活动可核验的学生社团及招新信息状态。'
})

const searchQuery = ref('')
const { data: response, error } = await usePublicClubList()
const clubs = computed(() => publicClubs(response.value?.items ?? []))
const filteredClubs = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('zh-CN')
  if (!query) return clubs.value
  return clubs.value.filter(club => [club.name, club.summary, club.category]
    .filter(Boolean).join(' ').toLocaleLowerCase('zh-CN').includes(query))
})
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
          当前名单来自校团委2026年活动报道，不代表完整注册名册，也不代表2026级正在招新。
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
        社团资料暂时不可用，请稍后重试。
      </div>

      <div
        v-else
        class="mb-4 flex items-center justify-between gap-4"
      >
        <h2 class="text-sm font-semibold text-zinc-900">
          {{ filteredClubs.length }} 个近期活动可核验社团
        </h2>
        <UButton
          to="/guides/clubs"
          icon="i-lucide-notebook-tabs"
          label="招新指南"
          color="neutral"
          variant="ghost"
        />
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
              label="招新待发布"
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
          没有匹配的社团
        </p>
      </div>
    </div>
  </div>
</template>
