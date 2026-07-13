<script setup lang="ts">
import { freshmanGuides } from '~~/data/seeds/public-content'
import type { ApiContent, ApiPlace } from '~~/shared/types/server'
import {
  canUseStaticContentKindFallback,
  mergePublicGuides
} from '~/utils/public-catalog'

useSeoMeta({
  title: '首页',
  description: '仰恩大学本科与专升本新生的校园地图、入学流程与校园生活指南。'
})

const placeQuery = ref('')
const contentRequest = usePublicContentList()
const placeRequest = usePublicPlaceList()
await Promise.all([contentRequest, placeRequest])

const { data: publicContentResponse, error: publicContentError } = contentRequest
const { data: publicPlaceResponse, error: publicPlaceError } = placeRequest
const allowStaticGuideFallback = computed(() => !publicContentError.value
  && canUseStaticContentKindFallback(publicContentResponse.value, 'guide'))
const guides = computed(() => mergePublicGuides(
  freshmanGuides,
  publicContentResponse.value?.items ?? [],
  allowStaticGuideFallback.value
))
const primaryGuides = computed(() => guides.value.slice(0, 6))
const fallbackMessage = computed(() => {
  const messages: string[] = []
  if (publicContentError.value) {
    messages.push('动态指南与校园内容暂时不可用。')
  } else if (allowStaticGuideFallback.value) {
    messages.push('后台尚未接管内容目录，当前显示内置基础指南。')
  } else if (publicContentResponse.value && !publicContentResponse.value.items.length) {
    messages.push('后台已有内容记录，但目前没有已发布内容。')
  }

  if (publicPlaceError.value) {
    messages.push('动态地点暂时不可用。')
  }

  return messages.length ? messages.join(' ') : null
})

interface HomePublishedItem {
  id: string
  title: string
  summary: string
  label: string
  icon: string
  to: string
  updatedAt: string
}

const contentPresentation: Record<ApiContent['kind'], { label: string, icon: string }> = {
  guide: { label: '指南', icon: 'i-lucide-notebook-tabs' },
  department: { label: '部门', icon: 'i-lucide-landmark' },
  club: { label: '社团', icon: 'i-lucide-users-round' },
  notice: { label: '公告', icon: 'i-lucide-megaphone' }
}

function contentTarget(content: ApiContent): string {
  if (content.kind === 'guide') {
    return content.slug === 'arrival'
      ? '/procedures/arrival'
      : `/guides/${encodeURIComponent(content.slug)}`
  }
  if (content.kind === 'department') return `/departments/${encodeURIComponent(content.slug)}`
  if (content.kind === 'club') return `/clubs/${encodeURIComponent(content.slug)}`
  return '/campus#notices'
}

function contentHomeItem(content: ApiContent): HomePublishedItem {
  const presentation = contentPresentation[content.kind]
  return {
    id: `content-${content.id}`,
    title: content.title,
    summary: content.summary,
    label: presentation.label,
    icon: presentation.icon,
    to: contentTarget(content),
    updatedAt: content.updatedAt
  }
}

function placeHomeItem(place: ApiPlace): HomePublishedItem {
  return {
    id: `place-${place.id}`,
    title: place.name,
    summary: place.summary,
    label: place.scope === 'nearby' ? '周边地点' : '校园地点',
    icon: place.scope === 'nearby' ? 'i-lucide-store' : 'i-lucide-map-pin',
    to: `/map?place=${encodeURIComponent(place.slug)}`,
    updatedAt: place.updatedAt
  }
}

const latestPublishedItems = computed(() => [
  ...(publicContentResponse.value?.items ?? []).map(contentHomeItem),
  ...(publicPlaceResponse.value?.items ?? []).map(placeHomeItem)
].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 6))

const iconTone: Record<string, string> = {
  arrival: 'bg-green-50 text-green-700',
  campus: 'bg-blue-50 text-blue-700',
  life: 'bg-orange-50 text-orange-700',
  community: 'bg-violet-50 text-violet-700'
}

function searchMap() {
  const query = placeQuery.value.trim()
  void navigateTo({ path: '/map', query: query ? { q: query } : undefined })
}
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <div class="grid gap-7 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div class="max-w-3xl">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                color="neutral"
                variant="soft"
              >
                非官方学生指南
              </UBadge>
              <span class="text-xs text-zinc-500">本科 · 专升本</span>
            </div>
            <h1 class="mt-4 text-3xl font-bold text-zinc-950 md:text-4xl">
              仰恩新生指南
            </h1>
            <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 md:text-base">
              先找到宿舍、教学楼和服务点，再核对报到、校园网、快递与社团事项。每条重要信息都保留来源和核验状态。
            </p>

            <form
              class="mt-6 flex max-w-2xl gap-2"
              role="search"
              @submit.prevent="searchMap"
            >
              <UInput
                v-model="placeQuery"
                icon="i-lucide-search"
                size="xl"
                class="min-w-0 flex-1"
                placeholder="搜索教学楼、宿舍、快递或校园服务"
                aria-label="搜索校园地点"
              />
              <UButton
                type="submit"
                icon="i-lucide-map-pinned"
                label="在地图中找"
                size="xl"
                class="min-h-11 shrink-0"
              />
            </form>
          </div>

          <div class="border-l-2 border-orange-500 bg-orange-50 px-4 py-3">
            <div class="flex items-start gap-3">
              <UIcon
                name="i-lucide-calendar-clock"
                class="mt-0.5 size-4 shrink-0 text-orange-700"
              />
              <div>
                <p class="text-sm font-semibold text-orange-950">
                  2026 报到日期已确认
                </p>
                <p class="mt-1 text-xs leading-5 text-orange-800">
                  新生于 9 月 5 至 6 日报到；个人时段、报到点位、材料和接站安排仍以录取通知书及学校后续公告为准。
                </p>
                <NuxtLink
                  to="/procedures/arrival"
                  class="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-orange-900 hover:underline"
                >
                  查看当前可确认事项
                  <UIcon
                    name="i-lucide-arrow-right"
                    class="size-3.5"
                  />
                </NuxtLink>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="page-shell py-7 md:py-9">
      <div class="flex items-end justify-between gap-4">
        <div>
          <p class="section-kicker">
            常用事项
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            你现在可能要找
          </h2>
        </div>
        <NuxtLink
          to="/guides"
          class="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-green-700 hover:text-green-800"
        >
          全部指南
          <UIcon
            name="i-lucide-arrow-right"
            class="size-4"
          />
        </NuxtLink>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="guide in primaryGuides"
          :key="guide.slug"
          :to="guide.slug === 'arrival' ? '/procedures/arrival' : `/guides/${guide.slug}`"
          class="surface-panel group flex min-h-40 flex-col p-4 transition hover:border-green-300 hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <span
              class="grid size-9 shrink-0 place-items-center rounded-md"
              :class="iconTone[guide.category]"
            >
              <UIcon
                :name="guide.icon"
                class="size-4"
              />
            </span>
            <UIcon
              name="i-lucide-arrow-up-right"
              class="size-4 text-zinc-300 transition group-hover:text-green-700"
            />
          </div>
          <h3 class="mt-4 font-bold text-zinc-950">
            {{ guide.shortTitle }}
          </h3>
          <p class="mt-1.5 flex-1 text-sm leading-6 text-zinc-600">
            {{ guide.summary }}
          </p>
          <p class="mt-3 text-xs text-zinc-400">
            {{ guide.statusText }}
          </p>
        </NuxtLink>
      </div>

      <div
        v-if="fallbackMessage"
        class="mt-4 flex items-start gap-2 border-l-2 border-blue-500 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900"
        role="status"
      >
        <UIcon
          name="i-lucide-info"
          class="mt-0.5 size-3.5 shrink-0"
        />
        <span>{{ fallbackMessage }}</span>
      </div>
    </section>

    <section
      v-if="latestPublishedItems.length"
      class="border-y border-[var(--line)] bg-white"
    >
      <div class="page-shell py-8 md:py-10">
        <div>
          <p class="section-kicker">
            最新核验
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            后台已发布内容
          </h2>
        </div>
        <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <NuxtLink
            v-for="item in latestPublishedItems"
            :key="item.id"
            :to="item.to"
            class="surface-panel group flex min-h-32 items-start gap-3 p-4 transition hover:border-green-300 hover:shadow-sm"
          >
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700">
              <UIcon
                :name="item.icon"
                class="size-4"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="text-xs font-medium text-green-700">{{ item.label }}</span>
              <span class="mt-1 block font-bold text-zinc-950">{{ item.title }}</span>
              <span class="mt-1 line-clamp-2 block text-xs leading-5 text-zinc-500">{{ item.summary }}</span>
            </span>
            <UIcon
              name="i-lucide-arrow-up-right"
              class="size-4 shrink-0 text-zinc-300 transition group-hover:text-green-700"
            />
          </NuxtLink>
        </div>
      </div>
    </section>

    <section :class="latestPublishedItems.length ? 'border-b border-[var(--line)] bg-white' : 'border-y border-[var(--line)] bg-white'">
      <div class="page-shell grid gap-6 py-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div>
          <p class="section-kicker">
            地图数据状态
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            76 个标记点已进入核验目录
          </h2>
          <p class="mt-2 max-w-3xl text-sm leading-7 text-zinc-600">
            用户自有高德工作地图另含 8 个绘制区域。导出数据没有经纬度，因此名称和描述可以整理，导航会等到坐标经官方资料或现场复核后再开放。
          </p>
          <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-zinc-500">
            <span class="inline-flex items-center gap-1.5">
              <UIcon
                name="i-lucide-file-check-2"
                class="size-4 text-green-700"
              />
              原始字段已审计
            </span>
            <span class="inline-flex items-center gap-1.5">
              <UIcon
                name="i-lucide-navigation-off"
                class="size-4 text-orange-700"
              />
              未核验点位禁用导航
            </span>
            <span class="inline-flex items-center gap-1.5">
              <UIcon
                name="i-lucide-history"
                class="size-4 text-blue-700"
              />
              保留来源与核验时间
            </span>
          </div>
        </div>
        <UButton
          to="/map"
          icon="i-lucide-map"
          label="进入地图 Alpha"
          size="lg"
          class="min-h-11 self-start md:self-auto"
        />
      </div>
    </section>

    <section class="page-shell py-8 md:py-10">
      <div class="grid gap-3 md:grid-cols-3">
        <NuxtLink
          to="/campus#departments"
          class="flex min-h-24 items-center gap-4 border-b border-[var(--line)] px-1 py-4 hover:border-green-400"
        >
          <span class="grid size-10 shrink-0 place-items-center rounded-md bg-blue-50 text-blue-700">
            <UIcon
              name="i-lucide-landmark"
              class="size-5"
            />
          </span>
          <span>
            <span class="block text-sm font-bold text-zinc-950">校内部门</span>
            <span class="mt-1 block text-xs text-zinc-500">直达招生、学生事务与信息化等官网</span>
          </span>
        </NuxtLink>
        <NuxtLink
          to="/campus#clubs"
          class="flex min-h-24 items-center gap-4 border-b border-[var(--line)] px-1 py-4 hover:border-green-400"
        >
          <span class="grid size-10 shrink-0 place-items-center rounded-md bg-violet-50 text-violet-700">
            <UIcon
              name="i-lucide-users-round"
              class="size-5"
            />
          </span>
          <span>
            <span class="block text-sm font-bold text-zinc-950">学生社团</span>
            <span class="mt-1 block text-xs text-zinc-500">查看官方分类与招新核验状态</span>
          </span>
        </NuxtLink>
        <NuxtLink
          to="/feedback"
          class="flex min-h-24 items-center gap-4 border-b border-[var(--line)] px-1 py-4 hover:border-green-400"
        >
          <span class="grid size-10 shrink-0 place-items-center rounded-md bg-orange-50 text-orange-700">
            <UIcon
              name="i-lucide-message-square-warning"
              class="size-5"
            />
          </span>
          <span>
            <span class="block text-sm font-bold text-zinc-950">反馈纠错</span>
            <span class="mt-1 block text-xs text-zinc-500">提交位置错误、过期信息或资料来源</span>
          </span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
