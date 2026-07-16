<script setup lang="ts">
import type { ApiSource } from '~~/shared/types/server'
import {
  collectActiveLinkedSources,
  dateOnly,
  sourceLevelGuides,
  sourceLevelLabels
} from '~~/app/utils/sources-presentation'

useSeoMeta({
  title: '来源说明',
  description: '查看仰恩新生指南的资料来源、确认范围和已发布内容引用记录。'
})

const contentRequest = usePublicContentList()
const placeRequest = usePublicPlaceList()
await Promise.all([contentRequest, placeRequest])

const { data: contentResponse, error: contentError } = contentRequest
const { data: placeResponse, error: placeError } = placeRequest

const sources = computed<ApiSource[]>(() => collectActiveLinkedSources(
  contentResponse.value?.items,
  placeResponse.value?.items
))

const loadError = computed(() => contentError.value || placeError.value)
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          信息可追溯
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          来源、确认范围与使用说明
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          重要事实优先采用学校和主管部门当前公开资料。页面会保留来源、发布主体和访问日期；无法确认的安排继续标记为待通知，不用旧年份信息填空。
        </p>
      </div>
    </section>

    <section class="page-shell page-section">
      <div class="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:gap-10">
        <div>
          <p class="section-kicker">
            来源怎么用
          </p>
          <h2 class="mt-2 text-xl font-bold text-zinc-950">
            发布时如何判断可信度
          </h2>
          <p class="mt-3 text-sm leading-7 text-zinc-600">
            这里用学生能理解的方式说明“哪些资料能直接采用，哪些只能当线索”。报到、交通、快递、商铺和招新仍需按有效期复核。
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
          地图数据
        </p>
        <h2 class="mt-2 text-xl font-bold text-zinc-950">
          校界不等于楼栋坐标
        </h2>
        <div class="mt-4 grid gap-5 text-sm leading-7 text-zinc-600 md:grid-cols-2">
          <p>
            绿色虚线校界来自 OpenStreetMap 社区数据，只用于校园范围参考和坐标异常检查。它不是学校发布的法定或官方校界，也不能证明任何楼栋入口位置。
          </p>
          <p>
            你提供的高德地图数据已经导入 76 个标记点和 8 个绘制区域。标记点可以在高德地图上查看和导航；绘制区域只显示边界，方便查看范围，同时不挡住区域内原有商铺。
          </p>
        </div>
        <div class="mt-5 flex flex-wrap gap-2">
          <UButton
            to="https://www.openstreetmap.org/copyright"
            target="_blank"
            icon="i-lucide-external-link"
            label="OpenStreetMap 许可与署名"
            color="neutral"
            variant="outline"
          />
          <UButton
            to="https://www.openstreetmap.org/relation/17685756"
            target="_blank"
            icon="i-lucide-pentagon"
            label="查看地图原始范围"
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
            当前引用
          </p>
          <h2 class="mt-2 text-xl font-bold text-zinc-950">
            已发布内容关联来源
          </h2>
        </div>
        <span class="text-sm text-zinc-500">{{ sources.length }} 条去重来源</span>
      </div>

      <div
        v-if="loadError"
        class="mt-5 border-l-2 border-orange-500 bg-orange-50 px-3 py-2 text-sm text-orange-900"
        role="status"
      >
        动态来源暂时无法加载；各指南详情仍保留自身的来源链接。
      </div>

      <div
        v-if="sources.length"
        class="divide-y divide-zinc-100"
      >
        <a
          v-for="source in sources"
          :key="source.id"
          :href="source.url"
          target="_blank"
          rel="noopener noreferrer"
          class="group grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_12rem_8rem_auto] sm:items-center"
        >
          <span class="min-w-0">
            <span class="block font-semibold text-zinc-900 group-hover:text-green-700">{{ source.title }}</span>
            <span class="mt-1 block text-xs text-zinc-500">{{ source.platform }}</span>
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

      <p
        v-else-if="!loadError"
        class="py-10 text-center text-sm text-zinc-500"
      >
        暂无已发布内容来源。
      </p>
    </section>
  </div>
</template>
