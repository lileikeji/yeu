<script setup lang="ts">
import { officialDepartments, officialSources } from '~~/data/seeds/public-content'
import {
  canUseStaticContentKindFallback,
  mergePublicDepartments,
  publicClubs,
  publicNotices
} from '~/utils/public-catalog'

useSeoMeta({
  title: '校园与部门',
  description: '仰恩大学校园概览、校内部门官方入口与学生社团信息。'
})

const campusStats = [
  { label: '校园占地', value: '2000+', unit: '亩', icon: 'i-lucide-map' },
  { label: '全日制学生', value: '1.3万+', unit: '人', icon: 'i-lucide-graduation-cap' },
  { label: '学院', value: '12', unit: '个', icon: 'i-lucide-school' }
]

const { data: publicContentResponse, error: publicContentError } = await usePublicContentList()
const publicContents = computed(() => publicContentResponse.value?.items ?? [])
const allowStaticDepartmentFallback = computed(() => !publicContentError.value
  && canUseStaticContentKindFallback(publicContentResponse.value, 'department'))
const departments = computed(() => mergePublicDepartments(
  officialDepartments,
  publicContents.value,
  allowStaticDepartmentFallback.value
))
const clubs = computed(() => publicClubs(publicContents.value))
const notices = computed(() => publicNotices(publicContents.value))
const fallbackMessage = computed(() => {
  if (publicContentError.value) return '校园内容服务暂时不可用，请稍后重试。'
  if (!publicContentResponse.value) return null
  if (allowStaticDepartmentFallback.value) {
    return '后台尚未接管校园内容，当前显示内置官网入口与基础资料。'
  }
  if (!publicContentResponse.value.items.length) return '后台已有校园内容记录，但目前没有已发布内容。'
  return null
})
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
              校园、服务部门与学生组织
            </h1>
            <p class="mt-4 text-sm leading-7 text-zinc-600 md:text-base">
              学校位于福建省泉州市洛江区马甲镇。这里汇总官网公开的校园概况和部门入口，便于新生直接找到信息主管方。
            </p>
            <div class="mt-6 flex flex-wrap gap-2">
              <UButton
                to="/map"
                icon="i-lucide-map-pinned"
                label="查看校园地图"
              />
              <UButton
                :to="officialSources.university.url"
                target="_blank"
                icon="i-lucide-external-link"
                label="学校官网"
                color="neutral"
                variant="outline"
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
          主值采用
          <a
            :href="officialSources.university.url"
            target="_blank"
            rel="noopener noreferrer"
            class="underline decoration-zinc-300 underline-offset-2 hover:text-green-700"
          >学校官网首页</a>（访问于 2026-07-13）。官网“学校概况”栏目仍显示 122 万平方米、14 个学院（部）的旧口径，两处数据待学校统一；请以官网最新说明为准。
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
              已发布公告
            </UBadge>
            <span class="text-xs text-zinc-400">核验于 {{ notice.updatedAt }}</span>
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
              :href="notice.sources[0].url"
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
            官方办事入口
          </p>
          <h2 class="mt-2 text-xl font-bold text-zinc-950 md:text-2xl">
            新生常用部门
          </h2>
          <p class="mt-2 text-sm leading-6 text-zinc-600">
            只收录官网组织机构页能够确认的部门入口，办公地点和时间待逐项核验。
          </p>
        </div>
        <UButton
          :to="officialSources.organizations.url"
          target="_blank"
          icon="i-lucide-external-link"
          label="完整组织机构"
          color="neutral"
          variant="ghost"
          class="self-start"
        />
      </div>

      <div class="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <article
          v-for="department in departments"
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
              :href="department.website"
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
              已发布
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
            class="mt-4 inline-flex items-center gap-1.5 border-t border-zinc-100 pt-3 text-xs font-semibold text-green-700 hover:text-green-800"
          >
            查看部门详情
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3.5"
            />
          </NuxtLink>
        </article>
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
              2026活动中可核验的社团
            </h2>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              校团委2026年活动报道可确认下列7个近期活跃社团，但它们不是完整名册。逐社团简介、联系方式和新生招新安排仍需当年确认。
            </p>
            <div class="mt-5 flex flex-wrap gap-2">
              <UButton
                to="/guides/clubs"
                icon="i-lucide-notebook-tabs"
                label="查看招新指南"
              />
              <UButton
                :to="officialSources.clubShowcase2026.url"
                target="_blank"
                icon="i-lucide-external-link"
                label="查看官方报道"
                color="neutral"
                variant="outline"
              />
            </div>
          </div>

          <div>
            <div class="flex items-start gap-3 border-l-2 border-orange-500 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-900">
              <UIcon
                name="i-lucide-calendar-clock"
                class="mt-0.5 size-4 shrink-0"
              />
              <p>2026 年招新时间、地点与二维码尚未发布；过期渠道不会作为当前招新入口展示。</p>
            </div>
          </div>
        </div>

        <div
          v-if="clubs.length"
          class="mt-10 border-t border-zinc-200 pt-8"
        >
          <div class="flex items-center justify-between gap-4">
            <h3 class="text-lg font-bold text-zinc-950">
              已发布社团资料
            </h3>
            <span class="text-xs text-zinc-500">{{ clubs.length }} 个</span>
          </div>
          <div class="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="club in clubs"
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
                  v-if="club.category"
                  color="neutral"
                  variant="soft"
                  size="sm"
                >
                  {{ club.category }}
                </UBadge>
              </div>
              <h4 class="mt-4 font-bold text-zinc-950">
                {{ club.name }}
              </h4>
              <p class="mt-2 text-sm leading-6 text-zinc-600">
                {{ club.summary }}
              </p>
              <p
                v-if="club.body"
                class="mt-3 line-clamp-4 whitespace-pre-line text-xs leading-6 text-zinc-600"
              >
                {{ club.body }}
              </p>
              <dl
                v-if="club.recruitmentPeriod || club.activitySchedule || club.contactMethod"
                class="mt-4 space-y-2 border-t border-zinc-100 pt-3 text-xs"
              >
                <div v-if="club.recruitmentPeriod">
                  <dt class="text-zinc-400">
                    招新时间
                  </dt>
                  <dd class="mt-0.5 text-zinc-700">
                    {{ club.recruitmentPeriod }}
                  </dd>
                </div>
                <div v-if="club.activitySchedule">
                  <dt class="text-zinc-400">
                    活动时间
                  </dt>
                  <dd class="mt-0.5 text-zinc-700">
                    {{ club.activitySchedule }}
                  </dd>
                </div>
                <div v-if="club.contactMethod">
                  <dt class="text-zinc-400">
                    公开联系
                  </dt>
                  <dd class="mt-0.5 text-zinc-700">
                    {{ club.contactMethod }}
                  </dd>
                </div>
              </dl>
              <div class="mt-4 flex items-center justify-between gap-3 text-xs text-zinc-400">
                <span>核验于 {{ club.updatedAt }}</span>
                <a
                  v-if="club.sources[0]"
                  :href="club.sources[0].url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-medium text-green-700 hover:underline"
                >查看来源</a>
              </div>
              <NuxtLink
                :to="`/clubs/${encodeURIComponent(club.slug)}`"
                class="mt-4 inline-flex items-center gap-1.5 border-t border-zinc-100 pt-3 text-xs font-semibold text-green-700 hover:text-green-800"
              >
                查看社团详情
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
