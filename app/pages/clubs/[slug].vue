<script setup lang="ts">
import { findOfficialClub, officialClubs } from '~~/data/seeds/public-content'
import { publicClubs } from '~/utils/public-catalog'
import { buildDetailFeedbackLink } from '~/utils/feedback-context'
import { throwPublicDetailError } from '~/utils/public-errors'
import {
  buildClubDetailSources,
  buildClubOverviewItems,
  clubSectionLabels,
  clubSignupQuestionChecklist,
  clubSourceStatusMessages,
  resolveClubSourceStatusText
} from '~~/app/utils/club-detail-presentation'
import {
  resolveClubDirection,
  resolveClubGroup
} from '~~/app/utils/club-list-presentation'

const route = useRoute()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')
const { data: content, error } = await usePublicClub(slug)
const seedClub = computed(() => findOfficialClub(slug))
if (error.value && !seedClub.value) throwPublicDetailError(error.value, '社团')

const club = computed(() => {
  const seed = seedClub.value
  return publicClubs(content.value ? [content.value] : [], seed ? [seed] : officialClubs)
    .find(item => item.slug === slug) ?? null
})
if (!club.value) throw createError({ statusCode: 404, statusMessage: '社团不存在' })

useSeoMeta({
  title: () => club.value?.name ?? '学生社团',
  description: () => club.value
    ? `${club.value.name}：${resolveClubDirection(club.value.summary, seedClub.value?.direction)}`
    : ''
})
const feedbackLink = computed(() => buildDetailFeedbackLink({
  targetType: 'content',
  targetId: content.value?.id ?? `static-club-${slug}`,
  targetName: club.value!.name,
  reasonType: 'missing_information',
  from: route.fullPath
}))

const sourceStatusText = computed(() => resolveClubSourceStatusText(club.value?.sources))
const hasRecentActivity = computed(() => sourceStatusText.value === clubSourceStatusMessages.recentActivity)
const clubGroup = computed(() => seedClub.value?.group ?? resolveClubGroup(club.value?.category))
const clubDirection = computed(() => resolveClubDirection(
  club.value?.summary ?? '',
  seedClub.value?.direction
))
const overviewItems = computed(() => buildClubOverviewItems(clubDirection.value))
const hasRecruitmentDetails = computed(() => Boolean(
  club.value?.recruitmentPeriod || club.value?.activitySchedule || club.value?.contactMethod
))
const detailSources = computed(() => buildClubDetailSources(club.value?.sources))
</script>

<template>
  <div v-if="club">
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="当前位置"
        >
          <NuxtLink
            to="/clubs"
            class="inline-flex min-h-10 items-center hover:text-green-700"
          >学生社团</NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span>{{ club.name }}</span>
        </nav>
        <div class="mt-5 flex flex-wrap items-center gap-2">
          <span class="mr-1 grid size-11 place-items-center rounded-md bg-emerald-50 text-emerald-700">
            <UIcon
              name="i-lucide-users-round"
              class="size-5"
            />
          </span>
          <UBadge
            :label="clubGroup"
            color="neutral"
            variant="soft"
          />
          <UBadge
            v-if="hasRecentActivity"
            :label="sourceStatusText"
            color="success"
            variant="soft"
          />
          <UBadge
            v-else
            :label="sourceStatusText"
            color="warning"
            variant="soft"
          />
        </div>
        <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
          {{ club.name }}
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 md:text-base">
          {{ clubDirection }}
        </p>
      </div>
    </header>

    <div class="page-shell py-7 md:py-10">
      <article class="mx-auto min-w-0 max-w-4xl">
        <div
          v-if="!hasRecruitmentDetails"
          class="border-l-4 border-orange-500 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-950"
          role="status"
        >
          <div class="flex items-start gap-2">
            <UIcon
              name="i-lucide-calendar-clock"
              class="mt-0.5 size-4 shrink-0"
            />
            <p>{{ clubSectionLabels.recruitmentNotice }}</p>
          </div>
        </div>

        <section class="border-b border-zinc-200 py-8">
          <h2 class="text-lg font-bold text-zinc-950">
            {{ clubSectionLabels.overview }}
          </h2>
          <div class="mt-5 grid gap-5 md:grid-cols-3">
            <div
              v-for="item in overviewItems"
              :key="item.title"
              class="border-l-2 border-emerald-200 pl-4"
            >
              <div class="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                <UIcon
                  :name="item.icon"
                  class="size-4 text-emerald-700"
                />
                {{ item.title }}
              </div>
              <p class="mt-2 text-sm leading-6 text-zinc-600">
                {{ item.text }}
              </p>
            </div>
          </div>
        </section>

        <section class="border-b border-zinc-200 py-8">
          <h2 class="text-lg font-bold text-zinc-950">
            {{ clubSectionLabels.signupChecklist }}
          </h2>
          <ul class="mt-4 divide-y divide-zinc-200 border-y border-zinc-200 md:grid md:grid-cols-2 md:divide-y-0">
            <li
              v-for="item in clubSignupQuestionChecklist"
              :key="item"
              class="flex gap-3 py-4 text-sm leading-6 text-zinc-700 md:border-b md:border-zinc-200 md:odd:pr-4 md:even:pl-4"
            >
              <UIcon
                name="i-lucide-circle-help"
                class="mt-0.5 size-4 shrink-0 text-emerald-700"
              />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>

        <section
          v-if="hasRecruitmentDetails"
          class="border-b border-zinc-200 py-7"
        >
          <h2 class="text-lg font-bold text-zinc-950">
            {{ clubSectionLabels.recruitmentDetails }}
          </h2>
          <dl class="mt-3 divide-y divide-zinc-100 border-y border-zinc-200 text-sm">
            <div
              v-if="club.recruitmentPeriod"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                招新时间
              </dt>
              <dd class="text-right text-zinc-900">
                {{ club.recruitmentPeriod }}
              </dd>
            </div>
            <div
              v-if="club.activitySchedule"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                活动安排
              </dt>
              <dd class="text-right text-zinc-900">
                {{ club.activitySchedule }}
              </dd>
            </div>
            <div
              v-if="club.contactMethod"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                联系方式
              </dt>
              <dd class="text-right text-zinc-900">
                {{ club.contactMethod }}
              </dd>
            </div>
          </dl>
        </section>

        <PublicSourceDetails
          :sources="detailSources"
          :verified-at="club.updatedAt"
          :title="clubSectionLabels.sourceDetails"
        />

        <UButton
          :to="feedbackLink"
          icon="i-lucide-message-square-warning"
          :label="clubSectionLabels.feedback"
          color="neutral"
          variant="outline"
          class="mt-6 min-h-11"
        />
      </article>
    </div>
  </div>
</template>
