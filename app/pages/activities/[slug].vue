<script setup lang="ts">
import type { ApiPublicActivity } from '~~/shared/types/server'
import { throwPublicDetailError } from '~/utils/public-errors'

const route = useRoute()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')

const { data: activity, error } = await useFetch<ApiPublicActivity>(
  `/api/public/activities/${encodeURIComponent(slug)}`,
  { key: `public-activity-${slug}` }
)

if (error.value) throwPublicDetailError(error.value, '活动')
if (!activity.value) throw createError({ statusCode: 404, statusMessage: '活动不存在' })

const organizationPath = computed(() => {
  const organization = activity.value?.organization
  if (!organization) return ''
  return organization.kind === 'club'
    ? `/clubs/${organization.slug}`
    : `/departments/${organization.slug}`
})

const mapTarget = computed(() => {
  const place = activity.value?.place
  if (!place) return ''
  return `/map?place=${encodeURIComponent(place.slug)}`
})

const extraPhotos = computed(() => (activity.value?.photos ?? []).slice(1))

const timeRange = computed(() => {
  const item = activity.value
  if (!item) return ''
  const start = formatDateTime(item.startsAt)
  if (!item.endsAt) return start
  const end = formatDateTime(item.endsAt)
  const sameDay = new Date(item.startsAt).toDateString() === new Date(item.endsAt).toDateString()
  return sameDay
    ? `${start} – ${formatTime(item.endsAt)}`
    : `${start} – ${end}`
})

function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(date)
}

function formatKind(kind: 'club' | 'department' | undefined): string {
  return kind === 'department' ? '部门活动' : '社团活动'
}

useSeoMeta({
  title: () => activity.value?.title ?? '活动',
  description: () => activity.value?.summary ?? '',
  ogTitle: () => activity.value?.title ?? '活动',
  ogDescription: () => activity.value?.summary ?? '',
  ogImage: () => activity.value?.photos[0] ?? undefined,
  ogType: 'article'
})
</script>

<template>
  <main
    v-if="activity"
    class="min-h-screen bg-zinc-50 pb-16 dark:bg-zinc-950"
  >
    <div class="page-shell pt-5">
      <nav
        class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
        aria-label="面包屑"
      >
        <NuxtLink
          to="/"
          class="hover:text-emerald-700 dark:hover:text-emerald-300"
        >
          首页
        </NuxtLink>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3"
        />
        <span>活动</span>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3"
        />
        <span class="truncate text-zinc-700 dark:text-zinc-300">{{ activity.title }}</span>
      </nav>
    </div>

    <article class="page-shell mt-4">
      <div class="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-zinc-200 bg-[var(--surface)] shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div
          v-if="activity.photos[0]"
          class="relative aspect-[16/8] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800"
        >
          <img
            :src="activity.photos[0]"
            :alt="`${activity.title} 活动照片`"
            class="size-full object-cover"
          >
        </div>

        <div class="p-6 md:p-9">
          <div class="flex flex-wrap items-center gap-2">
            <UBadge
              color="success"
              variant="subtle"
            >
              {{ formatKind(activity.organization?.kind) }}
            </UBadge>
            <NuxtLink
              v-if="organizationPath"
              :to="organizationPath"
              class="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-300"
            >
              {{ activity.organization?.title }}
            </NuxtLink>
          </div>

          <h1 class="mt-3 text-2xl font-bold leading-tight text-zinc-950 dark:text-zinc-50 md:text-3xl">
            {{ activity.title }}
          </h1>
          <p class="mt-3 text-base leading-7 text-zinc-600 dark:text-zinc-300">
            {{ activity.summary }}
          </p>

          <dl class="mt-6 grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-zinc-950/60 sm:grid-cols-2">
            <div class="flex items-start gap-2">
              <UIcon
                name="i-lucide-calendar-clock"
                class="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
              />
              <div>
                <dt class="text-xs text-zinc-500 dark:text-zinc-400">
                  活动时间
                </dt>
                <dd class="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">
                  {{ timeRange }}
                </dd>
              </div>
            </div>
            <div class="flex items-start gap-2">
              <UIcon
                name="i-lucide-map-pin"
                class="mt-0.5 size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
              />
              <div>
                <dt class="text-xs text-zinc-500 dark:text-zinc-400">
                  活动地点
                </dt>
                <dd class="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">
                  <template v-if="activity.place">
                    {{ activity.place.name }}{{ activity.room ? ` · ${activity.room}` : '' }}
                  </template>
                  <template v-else>
                    {{ activity.room || '地点待定' }}
                  </template>
                </dd>
              </div>
            </div>
          </dl>

          <div class="mt-5 flex flex-wrap gap-2">
            <UButton
              v-if="mapTarget"
              :to="mapTarget"
              icon="i-lucide-map"
              color="primary"
            >
              在地图中查看地点
            </UButton>
            <UButton
              v-if="organizationPath"
              :to="organizationPath"
              icon="i-lucide-users"
              color="neutral"
              variant="soft"
            >
              返回{{ activity.organization?.kind === 'department' ? '部门' : '社团' }}主页
            </UButton>
          </div>

          <div
            v-if="activity.body"
            class="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800"
          >
            <h2 class="text-lg font-semibold text-zinc-950 dark:text-zinc-100">
              活动详情
            </h2>
            <p class="mt-3 whitespace-pre-line text-[15px] leading-8 text-zinc-700 dark:text-zinc-300">
              {{ activity.body }}
            </p>
          </div>

          <div
            v-if="extraPhotos.length"
            class="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800"
          >
            <h2 class="text-lg font-semibold text-zinc-950 dark:text-zinc-100">
              活动照片
            </h2>
            <div class="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <img
                v-for="(photo, index) in extraPhotos"
                :key="photo"
                :src="photo"
                :alt="`${activity.title} 活动照片 ${index + 2}`"
                class="aspect-[4/3] w-full rounded-lg object-cover"
                loading="lazy"
              >
            </div>
          </div>

          <ActivityComments
            id="comments"
            :activity-slug="slug"
          />

          <p class="mt-8 text-xs text-zinc-400 dark:text-zinc-500">
            活动信息由{{ activity.organization?.title || '组织' }}发布，经校方审核后展示。
          </p>
        </div>
      </div>
    </article>
  </main>
</template>
