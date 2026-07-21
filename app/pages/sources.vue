<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import type { ApiSource } from '~~/shared/types/server'
import {
  buildSourcePreview,
  collectActiveLinkedSources,
  filterSourceList,
  sourcePreviewLimit,
  sourceListMessages,
  sourceAccessedLabel,
  sourcePlatformLabel,
  sourceLevelAppearances,
  sourceLevelGuides,
  sourceLevelLabels,
  studentFacingSourcePublisher,
  studentFacingSourceTitle
} from '~~/app/utils/sources-presentation'
import type { SourceTone } from '~~/app/utils/sources-presentation'

const sourceToneClasses: Record<SourceTone, {
  border: string
  soft: string
  text: string
}> = {
  blue: {
    border: 'border-blue-200',
    soft: 'bg-blue-50',
    text: 'text-blue-700'
  },
  green: {
    border: 'border-green-200',
    soft: 'bg-green-50',
    text: 'text-green-700'
  },
  amber: {
    border: 'border-amber-200',
    soft: 'bg-amber-50',
    text: 'text-amber-700'
  },
  zinc: {
    border: 'border-zinc-200',
    soft: 'bg-zinc-100',
    text: 'text-zinc-700'
  }
}

useSeoMeta({
  title: '信息从哪里来',
  description: '了解仰恩新生指南引用的参考页面，以及新生查看不同消息时应该注意什么。'
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

function clearSourceSearch(): void {
  sourceQuery.value = ''
}

async function refreshSources(): Promise<void> {
  await Promise.all([contentRequest.refresh(), placeRequest.refresh()])
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
          校园消息，<span class="block sm:inline">先看能不能直接用</span>
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          报到、缴费和学籍等重要事项，请优先看学校和主管部门的最新通知。地图、商铺和社团消息变化较快，页面会保留参考链接，方便你自己再看一眼。
        </p>
        <a
          href="#source-list"
          class="mt-5 inline-flex min-h-11 items-center gap-2 rounded-md bg-green-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
        >
          <UIcon
            name="i-lucide-search"
            class="size-4"
          />
          查找参考页面
        </a>
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

        <ul class="grid gap-3 sm:grid-cols-2">
          <li
            v-for="item in sourceLevelGuides"
            :key="item.level"
            class="rounded-md border bg-white p-4 shadow-sm"
            :class="sourceToneClasses[item.tone].border"
          >
            <div class="flex items-center gap-3">
              <span
                class="grid size-9 shrink-0 place-items-center rounded-md"
                :class="[sourceToneClasses[item.tone].soft, sourceToneClasses[item.tone].text]"
                aria-hidden="true"
              >
                <UIcon
                  :name="item.icon"
                  class="size-4"
                />
              </span>
              <div>
                <span class="block text-xs font-semibold text-zinc-500">{{ item.level }}</span>
                <span class="mt-0.5 block text-sm font-bold text-zinc-950">{{ item.title }}</span>
              </div>
            </div>
            <p class="mt-3 text-sm leading-6 text-zinc-600">
              {{ item.description }}
            </p>
          </li>
        </ul>
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
            地图上的绿色虚线来自公开社区地图，只帮助辨认校园大致范围，不代表学校公布的正式边界。找楼栋和入口时，请继续看地图标点与现场指示牌。
          </p>
          <p>
            点开地点可以查看位置和导航；绿色虚线区域只用来认方向，不会挡住里面的商铺和建筑。
          </p>
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <UButton
            to="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-external-link"
            label="了解社区地图"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
          <UButton
            to="https://www.openstreetmap.org/relation/17685756"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-pentagon"
            label="看看虚线从哪里来"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>
    </section>

    <section
      id="source-list"
      class="page-shell page-section scroll-mt-20"
    >
      <div class="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div>
          <p class="section-kicker">
            参考页面
          </p>
          <h2 class="mt-2 text-xl font-bold text-zinc-950">
            查看页面引用的参考链接
          </h2>
        </div>
        <span class="text-sm text-zinc-500">共 {{ sources.length }} 个参考页面</span>
      </div>

      <div class="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <UInput
          v-model="sourceQuery"
          icon="i-lucide-search"
          placeholder="搜索学校、部门或信息名称"
          aria-label="搜索参考页面"
          size="lg"
          class="min-h-11 w-full sm:max-w-md"
          :ui="{ base: 'min-h-11' }"
        />
        <span class="text-xs text-zinc-500">
          {{ sourceFilterActive ? `找到 ${filteredSources.length} 条` : '可按学校、部门或信息名称查找' }}
        </span>
      </div>

      <div
        v-if="loadError"
        class="mt-5 border-y border-amber-200 bg-amber-50 px-5 py-8 text-center"
        role="alert"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="mx-auto size-6 text-amber-700"
        />
        <h3 class="mt-3 text-base font-bold text-amber-950">
          参考页面暂时没有显示出来
        </h3>
        <p class="mt-2 text-sm leading-6 text-amber-900">
          {{ sourceListMessages.serviceUnavailable }}
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <UButton
            icon="i-lucide-refresh-cw"
            label="重新试一次"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="refreshSources"
          />
          <UButton
            to="/guides"
            icon="i-lucide-notebook-tabs"
            label="查看入学指南"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>

      <ul
        v-if="!loadError && visibleSources.length"
        class="divide-y divide-zinc-100"
      >
        <li
          v-for="source in visibleSources"
          :key="source.id"
        >
          <a
            :href="safeExternalHref(source.url) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="group flex items-start gap-3 py-4 sm:py-5"
          >
            <span
              class="grid size-9 shrink-0 place-items-center rounded-md"
              :class="[
                sourceToneClasses[sourceLevelAppearances[source.sourceLevel].tone].soft,
                sourceToneClasses[sourceLevelAppearances[source.sourceLevel].tone].text
              ]"
              aria-hidden="true"
            >
              <UIcon
                :name="sourceLevelAppearances[source.sourceLevel].icon"
                class="size-4"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold leading-6 text-zinc-900 group-hover:text-green-700">
                {{ studentFacingSourceTitle(source.title) }}
              </span>
              <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                <span>{{ sourcePlatformLabel(source.platform) }}</span>
                <span aria-hidden="true">·</span>
                <span>{{ studentFacingSourcePublisher(source.publisherName) }}</span>
              </span>
              <span class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span
                  class="rounded px-2 py-1 text-xs font-semibold"
                  :class="[
                    sourceToneClasses[sourceLevelAppearances[source.sourceLevel].tone].soft,
                    sourceToneClasses[sourceLevelAppearances[source.sourceLevel].tone].text
                  ]"
                >
                  {{ sourceLevelLabels[source.sourceLevel] }}
                </span>
                <span class="text-xs text-zinc-500">
                  <UIcon
                    name="i-lucide-calendar-clock"
                    class="mr-1 inline-block size-3.5 align-[-2px]"
                  />
                  {{ sourceAccessedLabel(source.accessedAt) }}
                </span>
              </span>
            </span>
            <UIcon
              name="i-lucide-external-link"
              class="mt-1 size-4 shrink-0 text-zinc-400 group-hover:text-green-700"
            />
          </a>
        </li>
      </ul>

      <div
        v-if="!loadError && !sourceFilterActive && filteredSources.length > sourcePreviewLimit"
        class="mt-5 flex justify-center"
      >
        <UButton
          :icon="sourcesExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :label="sourcesExpanded ? '收起参考页面' : `查看其余 ${sourcePreview.hiddenCount} 个参考页面`"
          color="neutral"
          variant="soft"
          class="min-h-11"
          :aria-expanded="sourcesExpanded"
          @click="toggleSourcePreview"
        />
      </div>

      <div
        v-if="!loadError && !visibleSources.length"
        class="mt-5 border-y border-zinc-200 bg-white px-5 py-10 text-center"
        role="status"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-6 text-zinc-400"
        />
        <h3 class="mt-3 text-base font-bold text-zinc-900">
          {{ sourceFilterActive ? sourceListMessages.emptyMatch : sourceListMessages.emptyList }}
        </h3>
        <p class="mt-2 text-sm leading-6 text-zinc-600">
          {{ sourceFilterActive ? '换个学校、部门或信息名称试试。' : '可以先从各篇指南中查看对应通知和链接。' }}
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <UButton
            v-if="sourceFilterActive"
            icon="i-lucide-x"
            label="清空搜索"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="clearSourceSearch"
          />
          <UButton
            to="/guides"
            icon="i-lucide-notebook-tabs"
            label="查看入学指南"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>
    </section>
  </div>
</template>
