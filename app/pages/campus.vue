<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import {
  parsePublicPhoneContacts,
  resolvePublicEmailHref
} from '~/utils/public-phone-contact'
import { officialClubs, officialDepartments, officialSources } from '~~/data/seeds/public-content'
import {
  campusFallbackMessages,
  campusFreshmanDates,
  campusMilitaryPreparation,
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
import { safeNoticeActionHref } from '~~/shared/utils/notice-actions'

useSeoMeta({
  title: '校园与部门',
  description: '校园地图、常用部门、学生社团入口。'
})

const { data: publicContentResponse, error: publicContentError, refresh } = await usePublicContentList()
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

function departmentPhoneContacts(phone?: string | null) {
  return parsePublicPhoneContacts(phone)
}

function departmentEmailHref(email?: string | null) {
  return resolvePublicEmailHref(email)
}

const fallbackMessage = computed(() => resolveCampusFallbackMessage({
  hasError: Boolean(publicContentError.value),
  response: publicContentResponse.value,
  allowStaticDepartmentFallback: allowStaticDepartmentFallback.value
}))
</script>

<template>
  <div>
    <section
      v-if="notices.length"
      id="notices"
      class="page-shell scroll-mt-20 pt-8"
    >
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="section-kicker">
            公告
          </p>
          <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
            新生近期需要留意
          </h1>
          <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            共 {{ notices.length }} 条 · 更新于 {{ notices[0]?.updatedAt }}
          </p>
        </div>
        <UButton
          to="/notices"
          icon="i-lucide-megaphone"
          label="全部公告"
          color="primary"
          variant="soft"
          size="sm"
        />
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
            <span class="text-xs text-zinc-400 dark:text-zinc-500">更新于 {{ notice.updatedAt }}</span>
          </div>
          <h3 class="mt-4 font-bold text-zinc-950 dark:text-zinc-100">
            {{ notice.title }}
          </h3>
          <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {{ notice.summary }}
          </p>
          <PublicNoticeBody
            v-if="notice.body"
            :body="notice.body"
            class="mt-3 border-t border-zinc-100 pt-3 dark:border-zinc-800"
          />
          <div
            v-if="notice.actions.length"
            class="mt-4 flex flex-wrap gap-2"
          >
            <UButton
              v-for="action in notice.actions"
              :key="`${action.label}-${action.href}`"
              :to="safeNoticeActionHref(action.href) || undefined"
              :icon="action.icon || 'i-lucide-arrow-up-right'"
              :label="action.label"
              color="primary"
              variant="soft"
              size="sm"
            />
          </div>
          <div class="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{{ notice.audience }}</span>
            <span v-if="notice.validUntil">有效至 {{ notice.validUntil.slice(0, 10) }}</span>
            <a
              v-if="notice.sources[0]"
              :href="safeExternalHref(notice.sources[0]?.url) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              class="font-medium text-green-700 dark:text-green-400 hover:underline"
            >查看学校原文</a>
          </div>
        </article>
      </div>
    </section>

    <section class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-12">
        <div class="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
          <div class="max-w-3xl">
            <p class="section-kicker">
              校园概览
            </p>
            <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-4xl">
              从这里认识校园
            </h1>
            <p class="mt-4 text-sm leading-7 text-zinc-600 dark:text-zinc-300 md:text-base">
              学校位于福建省泉州市洛江区马甲镇。
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

          <aside
            id="freshman-dates"
            class="overflow-hidden rounded-lg border border-green-100 dark:border-green-900 bg-green-50/70 dark:bg-green-950/70 lg:row-span-2"
          >
            <div class="flex items-start justify-between gap-4 px-4 pb-3 pt-4">
              <div>
                <p class="text-xs font-semibold text-green-700 dark:text-green-400">
                  2026 级开学时间
                </p>
                <h2 class="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-100">
                  先记住这四个安排
                </h2>
              </div>
              <a
                :href="safeExternalHref(officialSources.academicCalendar2026Fall.url) || undefined"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-h-10 shrink-0 items-center gap-1 text-xs font-semibold text-green-700 dark:text-green-400 hover:underline"
              >
                2026 年校历
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3.5"
                />
              </a>
            </div>
            <ol class="grid grid-cols-2 border-t border-green-100 dark:border-green-900 bg-white/80 dark:bg-zinc-900/80">
              <li
                v-for="item in campusFreshmanDates"
                :key="item.title"
                class="border-b border-r border-green-100 dark:border-green-900 even:border-r-0"
              >
                <NuxtLink
                  :to="item.to"
                  class="group relative block min-h-32 p-4 transition-colors hover:bg-green-50 dark:hover:bg-green-950 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-700"
                >
                  <UIcon
                    :name="item.icon"
                    class="size-4 text-green-700 dark:text-green-400"
                  />
                  <UIcon
                    name="i-lucide-arrow-up-right"
                    class="absolute right-3 top-3 size-3.5 text-green-300 transition group-hover:text-green-700 dark:group-hover:text-green-400"
                  />
                  <p class="mt-3 text-xs font-semibold text-green-700 dark:text-green-400">
                    {{ item.date }}
                  </p>
                  <h3 class="mt-1 text-sm font-bold text-zinc-950 dark:text-zinc-100">
                    {{ item.title }}
                  </h3>
                  <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    {{ item.description }}
                  </p>
                </NuxtLink>
              </li>
            </ol>
          </aside>
          <div class="mt-6 border-y border-zinc-200 dark:border-zinc-800 py-4 lg:mt-0 lg:self-end">
            <dl class="grid grid-cols-3 divide-x divide-zinc-200 dark:divide-zinc-800">
              <div
                v-for="stat in campusStats"
                :key="stat.label"
                class="min-w-0 px-2 first:pl-0 last:pr-0 sm:px-3"
              >
                <dt class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <UIcon
                    :name="stat.icon"
                    class="size-4 text-green-700 dark:text-green-400"
                  />
                  <span>{{ stat.label }}</span>
                </dt>
                <dd class="mt-2 whitespace-nowrap text-lg font-bold text-zinc-950 dark:text-zinc-100 sm:text-xl md:text-2xl">
                  {{ stat.value }}<span class="ml-0.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{{ stat.unit }}</span>
                </dd>
              </div>
            </dl>
            <p class="mt-3 text-xs leading-5 text-zinc-400 dark:text-zinc-500">
              以学校官网为准
            </p>
          </div>
        </div>
        <nav
          aria-label="校园概览入口"
          class="mt-6 grid grid-cols-2 gap-2 sm:flex"
        >
          <a
            href="#departments"
            class="group flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100 transition hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-800 dark:hover:text-green-300"
          >
            <span>找常用部门</span>
            <UIcon
              name="i-lucide-arrow-down"
              class="size-4 text-zinc-400 dark:text-zinc-500 transition group-hover:text-green-700 dark:group-hover:text-green-400"
            />
          </a>
          <a
            href="#clubs"
            class="group flex min-h-11 items-center justify-between gap-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 text-sm font-semibold text-zinc-800 dark:text-zinc-100 transition hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-800 dark:hover:text-green-300"
          >
            <span>看学生社团</span>
            <UIcon
              name="i-lucide-arrow-down"
              class="size-4 text-zinc-400 dark:text-zinc-500 transition group-hover:text-green-700 dark:group-hover:text-green-400"
            />
          </a>
        </nav>
      </div>
    </section>

    <section
      id="military-training"
      class="page-shell scroll-mt-20 pt-8"
    >
      <div class="overflow-hidden rounded-lg border border-lime-200 bg-gradient-to-br from-lime-50 via-white to-emerald-50 dark:from-lime-950 dark:via-zinc-900 dark:to-emerald-950 shadow-sm">
        <div class="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_15rem] md:p-7">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="campusMilitaryPreparation.badge"
                color="warning"
                variant="soft"
              />
              <span class="text-sm font-bold text-lime-800">{{ campusMilitaryPreparation.date }}</span>
            </div>
            <h2 class="mt-3 text-xl font-bold text-zinc-950 dark:text-zinc-100 md:text-2xl">
              {{ campusMilitaryPreparation.title }}
            </h2>
            <p class="mt-2 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              {{ campusMilitaryPreparation.description }}
            </p>
          </div>

          <div class="flex flex-wrap gap-2 self-start md:justify-end">
            <UButton
              :to="safeExternalHref(officialSources.academicCalendar2026Fall.url) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-calendar-days"
              label="查看 2026 年校历"
              color="neutral"
              variant="outline"
              class="min-h-11"
            />
            <UButton
              to="/departments/military-theory-department"
              icon="i-lucide-landmark"
              label="查看武装部"
              color="neutral"
              variant="ghost"
              class="min-h-11"
            />
          </div>
        </div>

        <div class="grid border-t border-lime-100 bg-white/70 dark:bg-zinc-900/70 sm:grid-cols-2">
          <article
            v-for="(item, index) in campusMilitaryPreparation.items"
            :key="item.title"
            class="border-lime-100 p-5 sm:min-h-40 sm:border-r sm:even:border-r-0"
            :class="[
              index < 3 ? 'border-b' : '',
              index < 2 ? 'sm:border-b' : 'sm:border-b-0'
            ]"
          >
            <span class="grid size-9 place-items-center rounded-lg bg-lime-100 text-lime-800">
              <UIcon
                :name="item.icon"
                class="size-4"
              />
            </span>
            <h3 class="mt-3 text-sm font-bold text-zinc-950 dark:text-zinc-100">
              {{ item.title }}
            </h3>
            <p class="mt-1.5 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              {{ item.description }}
            </p>
          </article>
        </div>

        <div class="flex flex-col gap-2 border-t border-lime-100 px-5 py-4 text-xs leading-5 text-zinc-600 dark:text-zinc-300 sm:flex-row sm:items-center sm:justify-between md:px-7">
          <p>想了解往年形式可以参考学校报道，但不要把往年安排当成今年通知。</p>
          <a
            :href="safeExternalHref(officialSources.militaryTrainingReport2025.url) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-10 shrink-0 items-center gap-1 font-semibold text-green-700 dark:text-green-400 hover:underline"
          >
            看2025年学校报道
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5"
            />
          </a>
        </div>
      </div>
    </section>

    <div
      v-if="publicContentError"
      class="page-shell pt-6"
    >
      <div
        class="border-l-2 border-amber-500 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3"
        role="status"
      >
        <div class="flex items-start gap-3">
          <UIcon
            name="i-lucide-info"
            class="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-300"
          />
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-bold text-amber-950 dark:text-amber-200">
              校园里的部分内容还没更新出来
            </h2>
            <p class="mt-1 text-xs leading-5 text-amber-900 dark:text-amber-300">
              {{ campusFallbackMessages.serviceUnavailable }}
            </p>
            <UButton
              icon="i-lucide-refresh-cw"
              label="重新试一次"
              color="neutral"
              variant="outline"
              class="mt-3 min-h-11"
              @click="refresh()"
            />
          </div>
        </div>
      </div>
    </div>

    <div
      v-else-if="fallbackMessage"
      class="page-shell pt-6"
    >
      <div
        class="flex items-start gap-2 border-l-2 border-blue-500 bg-blue-50 dark:bg-blue-950 px-3 py-2 text-xs leading-5 text-blue-900 dark:text-blue-300"
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
      id="departments"
      class="page-shell page-section scroll-mt-20"
    >
      <div class="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p class="section-kicker">
            办事去哪里
          </p>
          <h2 class="mt-2 text-xl font-bold text-zinc-950 dark:text-zinc-100 md:text-2xl">
            新生常用入口
          </h2>
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
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
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
              class="grid size-11 place-items-center rounded-md text-zinc-400 dark:text-zinc-500 hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-700 dark:hover:text-green-400"
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
          <h3 class="mt-4 font-bold text-zinc-950 dark:text-zinc-100">
            {{ department.name }}
          </h3>
          <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            {{ department.featuredSummary || department.summary }}
          </p>
          <div
            v-if="department.phone || department.email || department.officeHours"
            class="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
          >
            <div
              v-if="departmentPhoneContacts(department.phone).length"
              class="flex flex-col items-start gap-2"
            >
              <a
                v-for="phone in departmentPhoneContacts(department.phone)"
                :key="phone.href"
                :href="phone.href"
                class="inline-flex min-h-11 items-center gap-2 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-3 text-sm font-semibold text-green-800 dark:text-green-300 transition-colors hover:border-green-300 dark:hover:border-green-700 hover:bg-green-100 dark:hover:bg-green-900/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
              >
                <UIcon
                  name="i-lucide-phone"
                  class="size-4 shrink-0"
                />
                <span>{{ phone.label }}</span>
              </a>
            </div>
            <p
              v-else-if="department.phone"
              class="text-zinc-500 dark:text-zinc-400"
            >
              {{ department.phone }}
            </p>
            <p
              v-if="department.email"
              class="mt-2"
            >
              <a
                v-if="departmentEmailHref(department.email)"
                :href="departmentEmailHref(department.email)"
                class="inline-flex min-h-11 items-center break-all font-medium text-green-700 dark:text-green-400 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
              >{{ department.email }}</a>
              <span v-else>{{ department.email }}</span>
            </p>
            <p
              v-if="department.officeHours"
              class="mt-2"
            >
              {{ department.officeHours }}
            </p>
          </div>
          <NuxtLink
            v-if="department.isApiPublished"
            :to="`/departments/${encodeURIComponent(department.slug)}`"
            class="mt-3 inline-flex min-h-10 items-center gap-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-2 text-xs font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
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
      class="scroll-mt-20 border-y border-[var(--line)] bg-white dark:bg-zinc-900"
    >
      <div class="page-shell py-10 md:py-14">
        <div class="grid gap-8 lg:grid-cols-[20rem_minmax(0,1fr)] lg:gap-14">
          <div>
            <p class="section-kicker">
              学生社团
            </p>
            <h2 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100">
              按兴趣认识校园社团
            </h2>
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
            <div class="flex items-start gap-3 border-l-2 border-orange-500 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 px-4 py-3 text-sm leading-6 text-orange-900 dark:text-orange-300">
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
          class="mt-10 border-t border-zinc-200 dark:border-zinc-800 pt-8"
        >
          <div class="flex items-center justify-between gap-4">
            <h3 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
              先看看这些方向
            </h3>
            <NuxtLink
              to="/clubs"
              class="inline-flex min-h-10 items-center text-xs font-medium text-green-700 dark:text-green-400 hover:underline"
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
                <span class="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                  <img
                    v-if="club.iconUrl"
                    :src="club.iconUrl"
                    :alt="`${club.name}图标`"
                    class="size-full object-cover"
                  >
                  <UIcon
                    v-else
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
              <h4 class="mt-4 font-bold text-zinc-950 dark:text-zinc-100">
                {{ club.name }}
              </h4>
              <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {{ club.featuredSummary || resolveClubDirection(club.summary, club.direction || clubDirectionBySlug.get(club.slug)) }}
              </p>
              <NuxtLink
                :to="`/clubs/${encodeURIComponent(club.slug)}`"
                class="mt-3 inline-flex min-h-10 items-center gap-1.5 border-t border-zinc-100 dark:border-zinc-800 pt-2 text-xs font-semibold text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300"
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
