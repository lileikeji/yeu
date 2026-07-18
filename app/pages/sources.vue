<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import type { ApiSource } from '~~/shared/types/server'
import {
  buildSourcePreview,
  collectActiveLinkedSources,
  dateOnly,
  filterSourceList,
  sourcePreviewLimit,
  sourcePlatformLabel,
  sourceLevelGuides,
  sourceLevelLabels
} from '~~/app/utils/sources-presentation'

useSeoMeta({
  title: '来源说明',
  description: '了解仰恩新生指南的信息出处，以及新生查看不同消息时应该注意什么。'
})

const sourceQuery = ref('')
const sourcesExpanded = ref(false)

const contentRequest = usePublicContentList()
const placeRequest = usePublicPlaceList()
await Promise.all([contentRequest, placeRequest])

const { data: contentResponse, error: contentError } = contentRequest
const { data: placeResponse, error: placeError } = placeRequest

const sources = computed<ApiSource[]>(() => collectActiveLinkedSources(
  contentResponse.value?.items,
  placeResponse.value?.items
))
const filteredSources = computed(() => filterSourceList(sources.value, sourceQuery.value))
const sourceFilterActive = computed(() => Boolean(sourceQuery.value.trim()))
const sourcePreview = computed(() => buildSourcePreview(filteredSources.value, {
  expanded: sourcesExpanded.value,
  filterActive: sourceFilterActive.value
}))
const visibleSources = computed(() => sourcePreview.value.items)

const loadError = computed(() => contentError.value || placeError.value)

watch(sourceQuery, () => {
  sourcesExpanded.value = false
})

function toggleSourcePreview(): void {
  sourcesExpanded.value = !sourcesExpanded.value
}
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          信息从哪里来
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          看到校园消息，先判断能不能直接用
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          报到、缴费和学籍等重要事项，请优先看学校和主管部门的最新通知。地图、商铺和社团消息变化较快，页面会保留出处，方便你自己再看一眼。
        </p>
      </div>
    </section>

    <section class="page-shell page-section">
      <div class="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-10">
        <div>
          <p class="section-kicker">
            怎么判断
          </p>
          <h2 class="mt-2 text-xl font-bold text-zinc-950">
            不同消息，适合用在不同地方
          </h2>
          <p class="mt-3 text-sm leading-7 text-zinc-600">
            同一件事可能同时出现在官网、群聊和地图上。下面四类提醒可以帮你快速决定先看哪一个。
          </p>
        </div>

        <dl class="divide-y divide-zinc-100 border-y border-[var(--line)]">
          <div
            v-for="item in sourceLevelGuides"
            :key="item.level"
            class="grid gap-1 py-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4"
          >
            <dt class="text-sm font-bold text-zinc-900">
              {{ item.level }} · {{ item.title }}
            </dt>
            <dd class="text-sm leading-6 text-zinc-600">
              {{ item.description }}
            </dd>
          </div>
        </dl>
      </div>
    </section>

    <section class="border-y border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          地图怎么用
        </p>
        <h2 class="mt-2 text-xl font-bold text-zinc-950">
          地图边界只帮助你辨认方向
        </h2>
        <div class="mt-4 grid gap-5 text-sm leading-7 text-zinc-600 md:grid-cols-2">
          <p>
            绿色虚线来自公开社区地图，只帮助辨认校园大致范围，不代表学校公布的正式边界。找楼栋和入口时，请继续看地图标点与现场指示牌。
          </p>
          <p>
            当前地图包含 76 个地点和 8 个范围。地点可以查看和导航；范围只画边界，方便辨认区域，不会挡住里面的商铺和建筑。
          </p>
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <UButton
            to="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-external-link"
            label="社区地图说明"
            color="neutral"
            variant="outline"
          />
          <UButton
            to="https://www.openstreetmap.org/relation/17685756"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-pentagon"
            label="查看范围出处"
            color="neutral"
            variant="ghost"
          />
        </div>
      </div>
    </section>

    <section class="page-shell page-section">
      <div class="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div>
          <p class="section-kicker">
            具体出处
          </p>
          <h2 class="mt-2 text-xl font-bold text-zinc-950">
            查看页面引用的信息出处
          </h2>
        </div>
        <span class="text-sm text-zinc-500">共 {{ sources.length }} 条</span>
      </div>

      <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UInput
          v-model="sourceQuery"
          icon="i-lucide-search"
          placeholder="搜索学校、部门或信息名称"
          aria-label="搜索信息出处"
          class="w-full sm:max-w-md"
        />
        <span class="text-xs text-zinc-500">找到 {{ filteredSources.length }} 条</span>
      </div>

      <div
        v-if="loadError"
        class="mt-5 border-l-2 border-orange-500 bg-orange-50 px-3 py-2 text-sm text-orange-900"
        role="status"
      >
        信息出处暂时无法加载，各指南详情页仍可以查看对应链接。
      </div>

      <div
        v-if="visibleSources.length"
        class="divide-y divide-zinc-100"
      >
        <a
          v-for="source in visibleSources"
          :key="source.id"
          :href="safeExternalHref(source.url) || undefined"
          target="_blank"
          rel="noopener noreferrer"
          class="group grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_12rem_8rem_auto] sm:items-center"
        >
          <span class="min-w-0">
            <span class="block font-semibold text-zinc-900 group-hover:text-green-700">{{ source.title }}</span>
            <span class="mt-1 block text-xs text-zinc-500">{{ sourcePlatformLabel(source.platform) }}</span>
          </span>
          <span class="text-sm text-zinc-600">{{ source.publisherName }}</span>
          <span class="text-xs text-zinc-500">
            {{ sourceLevelLabels[source.sourceLevel] }}
          </span>
          <span class="flex items-center justify-between gap-3 text-xs text-zinc-400 sm:justify-end">
            {{ dateOnly(source.accessedAt) }}
            <UIcon
              name="i-lucide-external-link"
              class="size-4 shrink-0 group-hover:text-green-700"
            />
          </span>
        </a>
      </div>

      <div
        v-if="!sourceFilterActive && filteredSources.length > sourcePreviewLimit"
        class="mt-5 flex justify-center"
      >
        <UButton
          :icon="sourcesExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :label="sourcesExpanded ? '收起出处' : `查看其余 ${sourcePreview.hiddenCount} 条出处`"
          color="neutral"
          variant="soft"
          :aria-expanded="sourcesExpanded"
          @click="toggleSourcePreview"
        />
      </div>

      <p
        v-if="!loadError && !visibleSources.length"
        class="py-10 text-center text-sm text-zinc-500"
      >
        没有找到匹配的信息出处。
      </p>
    </section>
  </div>
</template>
