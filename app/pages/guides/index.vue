<script setup lang="ts">
import { freshmanGuides } from '~~/data/seeds/public-content'
import {
  canUseStaticContentKindFallback,
  mergePublicGuides
} from '~/utils/public-catalog'
import {
  filterGuideListItems,
  guideCategoryIconTones,
  guideListCategories,
  guideListFallbackMessages,
  guideListMessages,
  guideListReadMinutesLabel,
  guideListStatusDotClass,
  guideListStatusToneClass,
  guideNeedShortcuts,
  isGuideNeedShortcutActive,
  previewGuideListItems,
  resolveGuideListFallbackMessage,
  type GuideListCategoryId
} from '~~/app/utils/guide-list-presentation'
import {
  guideStatePresentation,
  studentFacingGuideStatusText
} from '~~/app/utils/guide-detail-presentation'

useSeoMeta({
  title: '新生指南',
  description: '本科与专升本新生的报到、校园地图、校园一卡通、校园网、学习图书馆、安全医疗、快递外卖及社团指南。'
})

const searchQuery = ref('')
const activeCategory = ref<GuideListCategoryId>('all')
const showAllGuides = ref(false)
const { data: publicGuideResponse, error: publicGuideError, refresh } = await usePublicGuideList()
const allowStaticFallback = computed(() => !publicGuideError.value
  && canUseStaticContentKindFallback(publicGuideResponse.value, 'guide'))
const guides = computed(() => mergePublicGuides(
  freshmanGuides,
  publicGuideResponse.value?.items ?? [],
  allowStaticFallback.value
))
const fallbackMessage = computed(() => resolveGuideListFallbackMessage({
  hasError: Boolean(publicGuideError.value),
  response: publicGuideResponse.value,
  allowStaticFallback: allowStaticFallback.value
}))

const filteredGuides = computed(() => filterGuideListItems(guides.value, {
  query: searchQuery.value,
  category: activeCategory.value
}))
const visibleGuides = computed(() => previewGuideListItems(filteredGuides.value, {
  expanded: showAllGuides.value,
  query: searchQuery.value,
  category: activeCategory.value
}))
const showGuideToggle = computed(() => !searchQuery.value.trim()
  && activeCategory.value === 'all'
  && filteredGuides.value.length > 6)
const isFiltering = computed(() => Boolean(searchQuery.value.trim()) || activeCategory.value !== 'all')

watch([searchQuery, activeCategory], () => {
  showAllGuides.value = false
})

function toggleGuidePreview() {
  showAllGuides.value = !showAllGuides.value
}

function clearGuideSearch(): void {
  searchQuery.value = ''
}

function clearGuideFilters(): void {
  searchQuery.value = ''
  activeCategory.value = 'all'
}

function selectGuideCategory(category: GuideListCategoryId): void {
  activeCategory.value = category
}

function selectGuideNeed(shortcut: (typeof guideNeedShortcuts)[number]): void {
  if (isGuideNeedShortcutActive(shortcut, {
    query: searchQuery.value,
    category: activeCategory.value
  })) {
    clearGuideFilters()
    return
  }
  searchQuery.value = shortcut.query
  activeCategory.value = shortcut.category
}
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <div class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div class="max-w-2xl">
            <p class="section-kicker">
              新生办事入口
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
              从报到到开学后的常用事项
            </h1>
            <p class="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
              本科与专升本分开整理 · 时间以录取通知书为准
            </p>
          </div>
          <UButton
            to="/map"
            icon="i-lucide-map"
            label="打开校园地图"
            size="lg"
            class="min-h-11 self-start md:self-auto"
          />
        </div>

        <div class="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            size="lg"
            placeholder="搜索报到、学费、食堂…"
            aria-label="搜索新生指南"
            class="min-h-11 w-full"
            :ui="{ base: 'min-h-11' }"
          >
            <template
              v-if="searchQuery"
              #trailing
            >
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="清空搜索"
                class="justify-center min-h-10 min-w-10"
                @click="clearGuideSearch"
              />
            </template>
          </UInput>

          <div
            class="grid grid-cols-5 gap-1 md:flex"
            aria-label="指南分类"
          >
            <UButton
              v-for="category in guideListCategories"
              :key="category.id"
              :icon="category.icon"
              :label="category.label"
              :color="activeCategory === category.id ? 'primary' : 'neutral'"
              :variant="activeCategory === category.id ? 'soft' : 'ghost'"
              class="min-h-11 min-w-0 justify-center px-1.5 md:w-auto md:shrink-0 md:px-2.5"
              :ui="{ leadingIcon: 'hidden md:block' }"
              :aria-pressed="activeCategory === category.id"
              @click="selectGuideCategory(category.id)"
            />
          </div>
        </div>

        <div class="mt-4 max-w-3xl">
          <p class="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            按要办的事找
          </p>
          <div class="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
            <button
              v-for="shortcut in guideNeedShortcuts"
              :key="shortcut.query"
              type="button"
              class="min-h-11 rounded-md border px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
              :class="isGuideNeedShortcutActive(shortcut, { query: searchQuery, category: activeCategory })
                ? 'border-green-700 bg-green-700 text-white'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50 dark:hover:bg-green-950'"
              :aria-label="`按${shortcut.label}查找指南`"
              :aria-pressed="isGuideNeedShortcutActive(shortcut, { query: searchQuery, category: activeCategory })"
              @click="selectGuideNeed(shortcut)"
            >
              {{ shortcut.label }}
            </button>
          </div>
        </div>
      </div>
    </section>

    <section class="page-shell page-section">
      <div
        v-if="publicGuideError"
        class="mb-5 border-y border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-5 py-8 text-center"
        role="alert"
      >
        <UIcon
          name="i-lucide-cloud-off"
          class="mx-auto size-6 text-amber-700 dark:text-amber-300"
        />
        <h2 class="mt-3 text-base font-bold text-amber-950">
          指南暂时没有显示出来
        </h2>
        <p class="mt-2 text-sm leading-6 text-amber-900 dark:text-amber-300">
          {{ guideListFallbackMessages.serviceUnavailable }}
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <UButton
            icon="i-lucide-refresh-cw"
            label="重新试一次"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="refresh()"
          />
          <UButton
            to="/map"
            icon="i-lucide-map"
            label="打开校园地图"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
          <UButton
            to="/departments"
            icon="i-lucide-landmark"
            label="查看常用部门"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>

      <div
        v-else-if="fallbackMessage"
        class="mb-5 flex items-start gap-2 border-l-2 border-blue-500 bg-blue-50 dark:bg-blue-950 px-3 py-2 text-xs leading-5 text-blue-900 dark:text-blue-300"
        role="status"
      >
        <UIcon
          name="i-lucide-info"
          class="mt-0.5 size-3.5 shrink-0"
        />
        <span>{{ fallbackMessage }}</span>
      </div>

      <div class="mb-4 flex items-center justify-between gap-4">
        <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {{ filteredGuides.length }} 篇指南
        </h2>
        <NuxtLink
          to="/campus"
          class="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
        >
          校园与部门
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4"
          />
        </NuxtLink>
      </div>

      <div
        v-if="filteredGuides.length"
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <NuxtLink
          v-for="guide in visibleGuides"
          :key="guide.slug"
          :to="`/guides/${guide.slug}`"
          class="surface-panel group flex min-h-0 flex-col p-4 transition hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm md:min-h-56 md:p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <span
              class="grid size-9 shrink-0 place-items-center rounded-md md:size-10"
              :class="guideCategoryIconTones[guide.category]"
            >
              <UIcon
                :name="guide.icon"
                class="size-5"
              />
            </span>
            <UBadge
              :color="guideStatePresentation(guide.status).color"
              variant="soft"
              size="sm"
            >
              <UIcon
                :name="guideStatePresentation(guide.status).icon"
                class="mr-1 size-3.5"
              />
              {{ guideStatePresentation(guide.status).label }}
            </UBadge>
          </div>

          <h2 class="mt-3 text-base font-bold text-zinc-950 dark:text-zinc-100 md:mt-5">
            {{ guide.title }}
          </h2>
          <p class="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300 md:mt-2 md:line-clamp-none">
            {{ guide.summary }}
          </p>
          <p
            class="mt-3 flex items-start gap-2 text-xs leading-5 md:mt-4"
            :class="guideListStatusToneClass(guide.status)"
          >
            <span
              class="mt-1.5 size-2 shrink-0 rounded-full"
              :class="guideListStatusDotClass(guide.status)"
            />
            <span class="line-clamp-2 md:line-clamp-none">
              <span class="font-semibold text-zinc-800 dark:text-zinc-100">目前：</span>
              {{ studentFacingGuideStatusText(guide.statusText) }}
            </span>
          </p>
          <div class="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400 md:mt-5 md:border-t md:border-zinc-100 dark:md:border-zinc-800 md:pt-4">
            <span class="truncate">{{ guideListReadMinutesLabel(guide.readMinutes) }} · {{ guide.audience.join(' · ') }}</span>
            <span class="inline-flex shrink-0 items-center gap-1 font-medium text-green-700 dark:text-green-400">
              {{ guideListMessages.openGuide }}
              <UIcon
                name="i-lucide-arrow-right"
                class="size-4 transition group-hover:translate-x-0.5"
              />
            </span>
          </div>
        </NuxtLink>
      </div>

      <div
        v-if="showGuideToggle"
        class="mt-6 flex justify-center"
      >
        <UButton
          :icon="showAllGuides ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :label="showAllGuides ? '收起' : `再看其他 ${filteredGuides.length - visibleGuides.length} 篇`"
          color="neutral"
          variant="ghost"
          class="min-h-11"
          @click="toggleGuidePreview"
        />
      </div>

      <div
        v-else-if="!publicGuideError && !filteredGuides.length"
        class="border-y border-[var(--line)] bg-white dark:bg-zinc-900 px-5 py-12 text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-6 text-zinc-400 dark:text-zinc-500"
        />
        <p class="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {{ guideListMessages.emptyMatchTitle }}
        </p>
        <div class="mt-4 flex flex-wrap justify-center gap-2">
          <UButton
            v-if="isFiltering"
            :label="guideListMessages.clearFilters"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="clearGuideFilters"
          />
          <UButton
            to="/map"
            icon="i-lucide-map"
            label="打开校园地图"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
          <UButton
            to="/procedures"
            icon="i-lucide-list-checks"
            label="查看办事流程"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>
    </section>
  </div>
</template>
