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
  resolveGuideListFallbackMessage
} from '~~/app/utils/guide-list-presentation'

useSeoMeta({
  title: '新生指南',
  description: '仰恩大学本科与专升本新生的报到、校园地图、校园卡网络、学习图书馆、安全医疗、快递外卖及社团指南。'
})

const searchQuery = ref('')
const activeCategory = ref('all')
const { data: publicGuideResponse, error: publicGuideError } = await usePublicGuideList()
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
              本科与专升本信息分开核对。涉及时间、地点、材料和费用时，以录取通知书及学校当年通知为准。
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
                @click="() => { searchQuery = '' }"
              />
            </template>
          </UInput>

          <div
            class="scrollbar-none flex gap-1 overflow-x-auto"
            aria-label="指南分类"
          >
            <UButton
              v-for="category in guideListCategories"
              :key="category.id"
              :icon="category.icon"
              :label="category.label"
              :color="activeCategory === category.id ? 'primary' : 'neutral'"
              :variant="activeCategory === category.id ? 'soft' : 'ghost'"
              class="min-h-11 shrink-0"
              :aria-pressed="activeCategory === category.id"
              @click="() => { activeCategory = category.id }"
            />
          </div>
        </div>
      </div>
    </section>

    <section class="page-shell page-section">
      <div
        v-if="fallbackMessage"
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
          {{ filteredGuides.length }} 项指南
        </h2>
        <NuxtLink
          to="/campus"
          class="inline-flex items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800"
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
          v-for="guide in filteredGuides"
          :key="guide.slug"
          :to="`/guides/${guide.slug}`"
          class="surface-panel group flex min-h-56 flex-col p-5 transition hover:border-green-300 hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <span
              class="grid size-10 shrink-0 place-items-center rounded-md"
              :class="guideCategoryIconTones[guide.category]"
            >
              <UIcon
                :name="guide.icon"
                class="size-5"
              />
            </span>
            <UBadge
              :color="guide.status === 'verified' ? 'success' : 'warning'"
              variant="soft"
              size="sm"
              class="max-w-[11rem] whitespace-normal text-right"
            >
              {{ guide.statusText }}
            </UBadge>
          </div>

          <h2 class="mt-5 text-base font-bold text-zinc-950">
            {{ guide.title }}
          </h2>
          <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600">
            {{ guide.summary }}
          </p>
          <div class="mt-5 flex items-center justify-between gap-3 border-t border-zinc-100 pt-4 text-xs text-zinc-500">
            <span>{{ guide.audience.join(' · ') }}</span>
            <span class="inline-flex shrink-0 items-center gap-1 font-medium text-green-700">
              查看
              <UIcon
                name="i-lucide-arrow-right"
                class="size-3.5 transition group-hover:translate-x-0.5"
              />
            </span>
          </div>
        </NuxtLink>
      </div>

      <div
        v-else
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
          class="mt-3"
          @click="searchQuery = ''; activeCategory = 'all'"
        />
      </div>
    </section>
  </div>
</template>
