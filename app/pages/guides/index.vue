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
  description: '仰恩大学本科与专升本新生的报到、校园地图、校园卡网络、学习图书馆、安全医疗、快递外卖及社团指南。'
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

watch([searchQuery, activeCategory], () => {
  showAllGuides.value = false
})

function toggleGuidePreview() {
  showAllGuides.value = !showAllGuides.value
}

function clearGuideSearch(): void {
  searchQuery.value = ''
}

function selectGuideCategory(category: GuideListCategoryId): void {
  activeCategory.value = category
}
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <div class="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div class="max-w-2xl">
            <p class="section-kicker">
              新生办事入口
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
              从到校前到开学后的常用事项
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              本科和专升本需要留意的内容会分别说明。时间、地点、材料和费用请以录取通知书及学校当年通知为准。
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
            placeholder="搜索报到、校园网、图书馆、安全、快递或社团"
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
                class="min-h-10 min-w-10"
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
      </div>
    </section>

    <section class="page-shell page-section">
      <div
        v-if="publicGuideError"
        class="mb-5 border-y border-amber-200 bg-amber-50 px-5 py-8 text-center"
        role="alert"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="mx-auto size-6 text-amber-700"
        />
        <h2 class="mt-3 text-base font-bold text-amber-950">
          指南暂时没有显示出来
        </h2>
        <p class="mt-2 text-sm leading-6 text-amber-900">
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
        class="mb-5 flex items-start gap-2 border-l-2 border-blue-500 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900"
        role="status"
      >
        <UIcon
          name="i-lucide-info"
          class="mt-0.5 size-3.5 shrink-0"
        />
        <span>{{ fallbackMessage }}</span>
      </div>

      <div class="mb-4 flex items-center justify-between gap-4">
        <h2 class="text-sm font-semibold text-zinc-900">
          {{ filteredGuides.length }} 篇指南
        </h2>
        <NuxtLink
          to="/campus"
          class="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800"
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
          class="surface-panel group flex min-h-0 flex-col p-4 transition hover:border-green-300 hover:shadow-sm md:min-h-56 md:p-5"
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

          <h2 class="mt-3 text-base font-bold text-zinc-950 md:mt-5">
            {{ guide.title }}
          </h2>
          <p class="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-zinc-600 md:mt-2 md:line-clamp-none">
            {{ guide.summary }}
          </p>
          <p class="mt-2 line-clamp-1 border-l-2 border-orange-300 pl-2.5 text-xs leading-5 text-zinc-600 md:mt-4 md:line-clamp-none md:pl-3">
            <span class="font-semibold text-zinc-800">目前：</span>
            {{ studentFacingGuideStatusText(guide.statusText) }}
          </p>
          <div class="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500 md:mt-5 md:border-t md:border-zinc-100 md:pt-4">
            <span class="truncate">{{ guide.audience.join(' · ') }}</span>
            <span class="inline-flex shrink-0 items-center text-green-700">
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
        class="border-y border-[var(--line)] bg-white px-5 py-12 text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-6 text-zinc-400"
        />
        <p class="mt-3 text-sm font-medium text-zinc-700">
          没有匹配的指南
        </p>
        <UButton
          label="清除筛选"
          color="neutral"
          variant="ghost"
          class="mt-3 min-h-11"
          @click="searchQuery = ''; activeCategory = 'all'"
        />
      </div>
    </section>
  </div>
</template>
