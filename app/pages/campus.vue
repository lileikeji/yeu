<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import { officialClubs, officialDepartments, officialSources } from '~~/data/seeds/public-content'
import {
  campusStats,
  resolveCampusFallbackMessage,
  selectFeaturedClubs,
  selectFeaturedDepartments
} from '~~/app/utils/campus-presentation'
import {
  resolveClubDirection,
  resolveClubGroup
} from '~~/app/utils/club-list-presentation'
import {
  canUseStaticContentKindFallback,
  mergePublicDepartments,
  publicClubs,
  publicNotices
} from '~/utils/public-catalog'

useSeoMeta({
  title: '校园与部门',
  description: '快速了解仰恩大学校园，找到新生常用部门和学生社团入口。'
})

const { data: publicContentResponse, error: publicContentError } = await usePublicContentList()
const publicContents = computed(() => publicContentResponse.value?.items ?? [])
const clubDirectionBySlug = new Map(officialClubs.map(club => [club.slug, club.direction]))
const allowStaticDepartmentFallback = computed(() => !publicContentError.value
  && canUseStaticContentKindFallback(publicContentResponse.value, 'department'))
const departments = computed(() => mergePublicDepartments(
  officialDepartments,
  publicContents.value,
  allowStaticDepartmentFallback.value
))
const clubs = computed(() => publicClubs(publicContents.value, officialClubs))
const featuredDepartments = computed(() => selectFeaturedDepartments(departments.value))
const featuredClubs = computed(() => selectFeaturedClubs(clubs.value))
const notices = computed(() => publicNotices(publicContents.value))
const fallbackMessage = computed(() => resolveCampusFallbackMessage({
  hasError: Boolean(publicContentError.value),
  response: publicContentResponse.value,
  allowStaticDepartmentFallback: allowStaticDepartmentFallback.value
}))
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-12">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-end">
          <div class="max-w-3xl">
            <p class="section-kicker">
              仰恩大学
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-4xl">
              从这里认识仰恩校园
            </h1>
            <p class="mt-4 text-sm leading-7 text-zinc-600 md:text-base">
              学校位于福建省泉州市洛江区马甲镇。先看校园地图，再从常用部门和学生社团入口找到你需要的信息。
            </p>
            <div class="mt-6 flex flex-wrap gap-2">
              <UButton
                to="/map"
                icon="i-lucide-map-pinned"
                label="查看校园地图"
                class="min-h-11"
              />
              <UButton
                :to="safeExternalHref(officialSources.university.url) || undefined"
                target="_blank"
                rel="noopener noreferrer"
                icon="i-lucide-external-link"
                label="学校官网"
                color="neutral"
                variant="outline"
                class="min-h-11"
              />
            </div>
          </div>

          <dl class="grid grid-cols-3 divide-x divide-zinc-200 border-y border-zinc-200 py-4">
            <div
              v-for="stat in campusStats"
              :key="stat.label"
              class="min-w-0 px-3 first:pl-0 last:pr-0"
            >
              <dt class="flex items-center gap-1.5 text-xs text-zinc-500">
                <UIcon
                  :name="stat.icon"
                  class="size-4 text-green-700"
                />
                <span>{{ stat.label }}</span>
              </dt>
              <dd class="mt-2 text-xl font-bold text-zinc-950 md:text-2xl">
                {{ stat.value }}<span class="ml-0.5 text-xs font-medium text-zinc-500">{{ stat.unit }}</span>
              </dd>
            </div>
          </dl>
        </div>
        <p class="mt-4 text-xs text-zinc-400">
          校园规模会随建设和统计时间变化，具体请以学校官网最新介绍为准。
        </p>
      </div>
    </section>

    <div
      v-if="fallbackMessage"
      class="page-shell pt-6"
    >
      <div
        class="flex items-start gap-2 border-l-2 border-blue-500 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900"
        role="status"
      >
        <UIcon
          name="i-lucide-info"
          class="mt-0.5 size-3.5 shrink-0"
        />
        <span>{{ fallbackMessage }}</span>
      </div>
    </div>

    <section
      v-if="notices.length"
      id="notices"
      class="page-shell scroll-mt-20 pt-8"
    >
      <div>
        <p class="section-kicker">
          当前公告
        </p>
        <h2 class="mt-2 text-xl font-bold text-zinc-950 md:text-2xl">
          新生近期需要留意
        </h2>
      </div>
      <div class="mt-5 grid gap-3 md:grid-cols-2">
        <article
          v-for="notice in notices"
          :id="`notice-${notice.slug}`"
          :key="notice.id"
          class="surface-panel p-5"
        >
          <div class="flex flex-wrap items-center justify-between gap-2">
            <UBadge
              color="warning"
              variant="soft"
            >
              近期提醒
            </UBadge>
            <span class="text-xs text-zinc-400">更新于 {{ notice.updatedAt }}</span>
          </div>
          <h3 class="mt-4 font-bold text-zinc-950">
            {{ notice.title }}
          </h3>
          <p class="mt-2 text-sm leading-6 text-zinc-600">
            {{ notice.summary }}
          </p>
          <p
            v-if="notice.body"
            class="mt-3 whitespace-pre-line border-t border-zinc-100 pt-3 text-sm leading-7 text-zinc-700"
          >
            {{ notice.body }}
          </p>
          <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
            <span>{{ notice.audience }}</span>
            <span v-if="notice.validUntil">有效至 {{ notice.validUntil.slice(0, 10) }}</span>
            <a
              v-if="notice.sources[0]"
              :href="safeExternalHref(notice.sources[0]?.url) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium text-green-700 hover:underline"
            >查看来源</a>
          </div>
        </article>
      </div>
    </section>

    <section
      id="departments"
      class="page-shell page-section scroll-mt-20"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="section-kicker">
            办事去哪里
          </p>
          <h2 class="mt-2 text-xl font-bold text-zinc-950 md:text-2xl">
            新生常用入口
          </h2>
          <p class="mt-2 text-sm leading-6 text-zinc-600">
            学籍、住宿、资助、就医等事情可以先从对应部门查起。办公地点和时间可能调整，出发前建议再看一次官网。
          </p>
        </div>
        <UButton
          :to="safeExternalHref(officialSources.organizations.url) || undefined"
          target="_blank"
          rel="noopener noreferrer"
          icon="i-lucide-external-link"
          label="学校组织机构"
          color="neutral"
          variant="ghost"
          class="min-h-11 self-start"
        />
      </div>

      <div class="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="department in featuredDepartments"
          :id="`department-${department.slug}`"
          :key="department.name"
          class="surface-panel flex min-h-48 flex-col p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700">
              <UIcon
                name="i-lucide-landmark"
                class="size-4"
              />
            </span>
            <a
              v-if="department.website"
              :href="safeExternalHref(department.website) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="grid size-9 place-items-center rounded-md text-zinc-400 hover:bg-green-50 hover:text-green-700"
              :aria-label="`打开${department.name}官网`"
            >
              <UIcon
                name="i-lucide-external-link"
                class="size-4"
              />
            </a>
            <UBadge
              v-else-if="department.isApiPublished"
              color="success"
              variant="soft"
              size="sm"
            >
              可查看详情
            </UBadge>
          </div>
          <h3 class="mt-4 font-bold text-zinc-950">
            {{ department.name }}
          </h3>
          <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600">
            {{ department.summary }}
          </p>
          <div
            v-if="department.phone || department.email || department.officeHours"
            class="mt-4 border-t border-zinc-100 pt-3 text-xs leading-5 text-zinc-500"
          >
            <p v-if="department.phone">
              {{ department.phone }}
            </p>
            <p v-if="department.email">
              {{ department.email }}
            </p>
            <p v-if="department.officeHours">
              {{ department.officeHours }}
            </p>
          </div>
          <NuxtLink
            v-if="department.isApiPublished"
            :to="`/departments/${encodeURIComponent(department.slug)}`"
            class="mt-3 inline-flex min-h-10 items-center gap-1.5 border-t border-zinc-100 pt-2 text-xs font-semibold text-green-700 hover:text-green-800"
          >
            查看部门详情
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3.5"
            />
          </NuxtLink>
        </article>
      </div>

      <div class="mt-6 flex justify-center">
        <UButton
          to="/departments"
          icon="i-lucide-layout-list"
          label="查看全部部门与学院"
          color="neutral"
          variant="outline"
          class="min-h-11"
        />
      </div>
    </section>

    <section
      id="clubs"
      class="scroll-mt-20 border-y border-[var(--line)] bg-white"
    >
      <div class="page-shell py-10 md:py-14">
        <div class="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-14">
          <div>
            <p class="section-kicker">
              学生社团
            </p>
            <h2 class="mt-2 text-2xl font-bold text-zinc-950">
              按兴趣认识校园社团
            </h2>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              这里先推荐几个不同方向。完整名单可以按兴趣筛选，2026 级招新安排请留意校团委和各社团的最新通知。
            </p>
            <div class="mt-5 flex flex-wrap gap-2">
              <UButton
                to="/clubs"
                icon="i-lucide-compass"
                label="浏览全部社团"
                class="min-h-11"
              />
              <UButton
                to="/guides/clubs"
                icon="i-lucide-notebook-tabs"
                label="招新指南"
                color="neutral"
                variant="outline"
                class="min-h-11"
              />
            </div>
          </div>

          <div>
            <div class="flex items-start gap-3 border-l-2 border-orange-500 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-900">
              <UIcon
                name="i-lucide-calendar-clock"
                class="mt-0.5 size-4 shrink-0"
              />
              <p>2026 级招新时间、地点和群聊入口还没公布。开学后请认准校团委、社团负责人或现场摊位发布的信息。</p>
            </div>
          </div>
        </div>

        <div
          v-if="clubs.length"
          class="mt-10 border-t border-zinc-200 pt-8"
        >
          <div class="flex items-center justify-between gap-4">
            <h3 class="text-lg font-bold text-zinc-950">
              先看看这些方向
            </h3>
            <NuxtLink
              to="/clubs"
              class="inline-flex min-h-10 items-center text-xs font-medium text-green-700 hover:underline"
            >共 {{ clubs.length }} 个社团</NuxtLink>
          </div>
          <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="club in featuredClubs"
              :id="`club-${club.slug}`"
              :key="club.id"
              class="surface-panel p-5"
            >
              <div class="flex items-start justify-between gap-3">
                <span class="grid size-9 shrink-0 place-items-center rounded-md bg-violet-50 text-violet-700">
                  <UIcon
                    name="i-lucide-users-round"
                    class="size-4"
                  />
                </span>
                <UBadge
                  v-if="resolveClubGroup(club.category)"
                  color="neutral"
                  variant="soft"
                  size="sm"
                >
                  {{ resolveClubGroup(club.category) }}
                </UBadge>
              </div>
              <h4 class="mt-4 font-bold text-zinc-950">
                {{ club.name }}
              </h4>
              <p class="mt-2 text-sm leading-6 text-zinc-600">
                {{ resolveClubDirection(club.summary, clubDirectionBySlug.get(club.slug)) }}
              </p>
              <NuxtLink
                :to="`/clubs/${encodeURIComponent(club.slug)}`"
                class="mt-3 inline-flex min-h-10 items-center gap-1.5 border-t border-zinc-100 pt-2 text-xs font-semibold text-green-700 hover:text-green-800"
              >
                查看介绍
                <UIcon
                  name="i-lucide-arrow-right"
                  class="size-3.5"
                />
              </NuxtLink>
            </article>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
