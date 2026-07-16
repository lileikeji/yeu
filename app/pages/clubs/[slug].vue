<script setup lang="ts">
import { findOfficialClub, officialClubs } from '~~/data/seeds/public-content'
import { publicClubs } from '~/utils/public-catalog'
import { buildDetailFeedbackLink } from '~/utils/feedback-context'
import { throwPublicDetailError } from '~/utils/public-errors'
import {
  buildClubDetailSources,
  clubSectionLabels,
  clubSignupQuestionChecklist,
  resolveClubSourceStatusText
} from '~~/app/utils/club-detail-presentation'

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
  description: () => club.value?.summary ?? ''
})
const feedbackLink = computed(() => buildDetailFeedbackLink({
  targetType: 'content',
  targetId: content.value?.id ?? `static-club-${slug}`,
  targetName: club.value!.name,
  reasonType: 'missing_information',
  from: route.fullPath
}))

const sourceStatusText = computed(() => resolveClubSourceStatusText(club.value?.sources))
const detailSources = computed(() => buildClubDetailSources(club.value?.sources))
</script>

<template>
  <div v-if="club">
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="面包屑"
        >
          <NuxtLink
            to="/clubs"
            class="hover:text-green-700"
          >学生社团</NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span>{{ club.name }}</span>
        </nav>
        <div class="mt-5 flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-md bg-violet-50 text-violet-700">
            <UIcon
              name="i-lucide-users-round"
              class="size-5"
            />
          </span>
          <UBadge
            :label="club.category ?? sourceStatusText"
            color="success"
            variant="soft"
          />
          <UBadge
            :label="clubSectionLabels.recruitmentPending"
            color="warning"
            variant="soft"
          />
        </div>
        <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
          {{ club.name }}
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 md:text-base">
          {{ club.summary }}
        </p>
      </div>
    </header>

    <div class="page-shell py-7 md:py-10">
      <article class="mx-auto min-w-0 max-w-4xl">
        <div
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
            {{ clubSectionLabels.confirmedInfo }}
          </h2>
          <div class="mt-4 rounded-lg bg-violet-50 px-4 py-3 text-sm leading-6 text-violet-950">
            <p>
              <span class="font-semibold">{{ clubSectionLabels.currentlyConfirmed }}</span>{{ sourceStatusText }}。
            </p>
            <p class="mt-1">
              <span class="font-semibold">{{ clubSectionLabels.suitableFor }}</span>{{ clubSectionLabels.suitableAudience }}
            </p>
          </div>
          <p
            v-if="club.body"
            class="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-600"
          >
            {{ club.body }}
          </p>
          <p
            v-else
            class="mt-4 text-sm leading-7 text-zinc-600"
          >
            {{ clubSectionLabels.bodyFallback }}
          </p>
        </section>

        <section class="border-b border-zinc-200 py-8">
          <h2 class="text-lg font-bold text-zinc-950">
            {{ clubSectionLabels.signupChecklist }}
          </h2>
          <ul class="mt-4 grid gap-2 md:grid-cols-2">
            <li
              v-for="item in clubSignupQuestionChecklist"
              :key="item"
              class="flex gap-3 rounded-lg border border-violet-100 bg-violet-50/60 p-3 text-sm leading-6 text-violet-950"
            >
              <UIcon
                name="i-lucide-circle-help"
                class="mt-0.5 size-4 shrink-0"
              />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>

        <dl
          v-if="club.recruitmentPeriod || club.activitySchedule || club.contactMethod"
          class="divide-y divide-zinc-100 border-b border-zinc-200 py-4 text-sm"
        >
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
              公开联系
            </dt>
            <dd class="text-right text-zinc-900">
              {{ club.contactMethod }}
            </dd>
          </div>
        </dl>

        <PublicSourceDetails
          :sources="detailSources"
          :verified-at="club.updatedAt"
        />

        <UButton
          :to="feedbackLink"
          icon="i-lucide-message-square-warning"
          label="补充社团资料"
          color="neutral"
          variant="outline"
          class="mt-6"
        />
      </article>
    </div>
  </div>
</template>
