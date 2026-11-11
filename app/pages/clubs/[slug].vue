<script setup lang="ts">
import { findOfficialClub, officialClubs } from '~~/data/seeds/public-content'
import { publicClubs } from '~/utils/public-catalog'
import { buildDetailFeedbackLink } from '~/utils/feedback-context'
import { throwPublicDetailError } from '~/utils/public-errors'
import {
  buildClubDetailSources,
  buildClubOverviewItems,
  clubSectionLabels,
  clubSourceStatusMessages,
  resolveClubContactSectionState,
  resolveClubSourceStatusText
} from '~~/app/utils/club-detail-presentation'
import {
  resolveClubDirection,
  resolveClubGroup
} from '~~/app/utils/club-list-presentation'
import { resolvePublicContactActions } from '~~/app/utils/public-phone-contact'

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

const requestUrl = useRequestURL()
const shareImage = computed(() => new URL(
  club.value?.iconUrl || '/icons/app-icon-512.png',
  requestUrl.origin
).toString())
useSeoMeta({
  title: () => club.value ? `${club.value.name}｜学生社团` : '学生社团',
  description: () => club.value
    ? `${club.value.name}：${resolveClubDirection(
      club.value.summary,
      club.value.direction || seedClub.value?.direction
    )}`
    : '',
  ogTitle: () => club.value ? `${club.value.name}｜迎新指南` : '学生社团｜迎新指南',
  ogDescription: () => club.value
    ? `${club.value.name}：${resolveClubDirection(club.value.summary, club.value.direction || seedClub.value?.direction)}`
    : '',
  ogType: 'website',
  ogImage: () => shareImage.value,
  twitterCard: 'summary',
  twitterImage: () => shareImage.value
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
  club.value?.direction || seedClub.value?.direction
))
const overviewItems = computed(() => buildClubOverviewItems(clubDirection.value, {
  suitableFor: club.value?.suitableFor,
  findingIt: club.value?.findingIt
}))
const overviewTitle = computed(() => club.value?.overviewTitle || clubSectionLabels.overview)
const hasRecruitmentDetails = computed(() => Boolean(
  club.value?.recruitmentPeriod
  || club.value?.activitySchedule
  || club.value?.contactMethod
))
const detailSources = computed(() => buildClubDetailSources(club.value?.sources))
const contactActions = computed(() => resolvePublicContactActions(club.value?.contactMethod))
const contactSection = computed(() => resolveClubContactSectionState(Boolean(
  contactActions.value.length
  || club.value?.groupQrUrls.length
  || club.value?.contactQrUrls.length
  || club.value?.contactPhones.length
)))
const { copyText, isWechat, sharePage } = useShareActions()

// Official online signup entry — only when the club opened its recruit form.
// Deliberately link WITHOUT any ?ref= invite parameter: entries from the club
// page must never credit a referrer.
const recruitSignupOpen = ref(false)
const recruitSignupPath = computed(() => `/recruit/${encodeURIComponent(slug)}`)
onMounted(async () => {
  try {
    const payload = await $fetch<{ available: boolean }>(`/api/public/recruit/${encodeURIComponent(slug)}?probe=1`)
    recruitSignupOpen.value = payload.available === true
  } catch {
    recruitSignupOpen.value = false
  }
})

async function copyContactAction(value: string): Promise<void> {
  await copyText(value, '联系方式')
}

function boxesAt(placement: string) {
  return club.value?.boxes.filter(box => box.placement === placement) ?? []
}

async function shareClub(): Promise<void> {
  if (!import.meta.client || !club.value) return
  if (isWechat.value) {
    await sharePage({
      title: `${club.value.name}｜迎新指南`,
      text: `${club.value.name}：${clubDirection.value}`,
      imageUrl: shareImage.value,
      url: window.location.href
    })
    return
  }
  await copyText(
    `${club.value.name}｜迎新指南\n查看社团介绍：${window.location.href}`,
    '社团分享内容'
  )
}
</script>

<template>
  <div v-if="club">
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400"
          aria-label="当前位置"
        >
          <NuxtLink
            to="/clubs"
            class="inline-flex min-h-10 items-center hover:text-green-700 dark:hover:text-green-400"
          >学生社团</NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span>{{ club.name }}</span>
        </nav>
        <div class="mt-5 flex flex-wrap items-center gap-2">
          <span class="mr-1 grid size-11 shrink-0 place-items-center overflow-hidden rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
            <img
              v-if="club.iconUrl"
              :src="club.iconUrl"
              :alt="`${club.name}图标`"
              class="size-full object-cover"
            >
            <UIcon
              v-else
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
        <div class="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 class="text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
            {{ club.name }}
          </h1>
          <UButton
            icon="i-lucide-share-2"
            :label="isWechat ? '微信分享' : '复制分享链接'"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="shareClub"
          />
        </div>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300 md:text-base">
          {{ clubDirection }}
        </p>
      </div>
    </header>

    <div class="page-shell py-7 md:py-10">
      <article class="mx-auto min-w-0 max-w-4xl">
        <div
          v-if="!hasRecruitmentDetails"
          class="border-l-4 border-orange-500 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 px-4 py-3 text-sm leading-6 text-orange-950"
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

        <section class="border-b border-zinc-200 dark:border-zinc-800 py-8">
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
            {{ overviewTitle }}
          </h2>
          <div class="mt-5 grid gap-5 md:grid-cols-3">
            <div
              v-for="item in overviewItems"
              :key="item.title"
              class="border-l-2 border-emerald-200 dark:border-emerald-900 pl-4"
            >
              <div class="flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                <UIcon
                  :name="item.icon"
                  class="size-4 text-emerald-700 dark:text-emerald-300"
                />
                {{ item.title }}
              </div>
              <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {{ item.text }}
              </p>
            </div>
          </div>
        </section>

        <PublicContentBoxes :boxes="boxesAt('after-overview')" />

        <section class="border-b border-zinc-200 dark:border-zinc-800 py-8">
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
            {{ clubSectionLabels.signupChecklist }}
          </h2>
          <div class="mt-4 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
            <details
              v-for="item in club.signupQa"
              :key="item.question"
              class="group"
            >
              <summary class="flex min-h-14 cursor-pointer list-none items-center gap-3 py-3.5 text-sm font-semibold leading-6 text-zinc-800 dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
                <UIcon
                  name="i-lucide-circle-question-mark"
                  class="size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
                />
                <span class="min-w-0 flex-1">{{ item.question }}</span>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="size-4 shrink-0 text-zinc-400 dark:text-zinc-500 transition-transform group-open:rotate-180"
                />
              </summary>
              <div class="pb-4 pl-7 pr-6 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                {{ item.answer || '该社团暂未补充这项回答。' }}
              </div>
            </details>
          </div>
        </section>

        <PublicContentBoxes :boxes="boxesAt('after-signup')" />

        <PublicContentBody
          :body="club.body"
          title="社团介绍"
        />

        <PublicContentBoxes :boxes="boxesAt('after-intro')" />

        <section
          v-if="hasRecruitmentDetails"
          class="border-b border-zinc-200 dark:border-zinc-800 py-7"
        >
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
            {{ clubSectionLabels.recruitmentDetails }}
          </h2>
          <NuxtLink
            v-if="recruitSignupOpen"
            :to="recruitSignupPath"
            class="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950 px-4 py-3 text-sm font-semibold text-emerald-900 dark:text-emerald-200 transition-colors hover:bg-emerald-100 dark:hover:bg-emerald-900"
          >
            <span class="flex items-center gap-2">
              <UIcon
                name="i-lucide-clipboard-list"
                class="size-4 shrink-0"
              />
              填写入会申请表
            </span>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-4 shrink-0"
            />
          </NuxtLink>
          <dl class="mt-3 divide-y divide-zinc-100 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800 text-sm">
            <div
              v-if="club.recruitmentPeriod"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500 dark:text-zinc-400">
                招新时间
              </dt>
              <dd class="text-right text-zinc-900 dark:text-zinc-100">
                {{ club.recruitmentPeriod }}
              </dd>
            </div>
            <div
              v-if="club.activitySchedule"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500 dark:text-zinc-400">
                活动安排
              </dt>
              <dd class="text-right text-zinc-900 dark:text-zinc-100">
                {{ club.activitySchedule }}
              </dd>
            </div>
            <div
              v-if="contactActions.length"
              class="flex items-start justify-between gap-6 py-3"
            >
              <dt class="shrink-0 text-zinc-500 dark:text-zinc-400">
                {{ clubSectionLabels.contactMethod }}
              </dt>
              <dd class="min-w-0 text-right">
                <div class="flex flex-col items-end gap-2">
                  <template
                    v-for="action in contactActions"
                    :key="`${action.kind}-${action.label}`"
                  >
                    <div
                      v-if="action.href"
                      class="flex flex-wrap justify-end gap-2"
                    >
                      <UButton
                        icon="i-lucide-copy"
                        label="复制"
                        color="neutral"
                        variant="outline"
                        class="min-h-11"
                        @click="copyContactAction(action.copyValue)"
                      />
                      <UButton
                        :to="action.href"
                        :icon="action.kind === 'email' ? 'i-lucide-mail' : 'i-lucide-phone'"
                        :label="action.actionLabel"
                        color="success"
                        variant="soft"
                        class="min-h-11"
                      />
                    </div>
                    <div
                      v-else
                      class="flex max-w-full flex-col items-end gap-2"
                    >
                      <p class="break-all text-sm font-medium leading-6 text-zinc-900 dark:text-zinc-100">
                        {{ action.label }}
                      </p>
                      <button
                        type="button"
                        class="inline-flex min-h-11 items-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
                        @click="copyContactAction(action.copyValue)"
                      >
                        <UIcon
                          name="i-lucide-copy"
                          class="size-4 shrink-0"
                        />
                        <span>{{ clubSectionLabels.copyContact }}</span>
                      </button>
                    </div>
                  </template>
                </div>
              </dd>
            </div>
          </dl>
        </section>

        <PublicContentBoxes :boxes="boxesAt('after-recruitment')" />
        <PublicContentBoxes :boxes="[...boxesAt('default'), ...boxesAt('before-community')]" />

        <section
          v-if="contactSection.kind === 'pending'"
          class="border-b border-zinc-200 dark:border-zinc-800 py-7"
        >
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
            {{ contactSection.title }}
          </h2>
          <div
            class="mt-3 border-l-4 border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm leading-6 text-amber-950"
            role="status"
          >
            <div class="flex items-start gap-2">
              <UIcon
                name="i-lucide-phone-off"
                class="mt-0.5 size-4 shrink-0"
              />
              <p>{{ contactSection.notice }}</p>
            </div>
          </div>
          <UButton
            :to="feedbackLink"
            icon="i-lucide-message-square-plus"
            :label="contactSection.actionLabel"
            color="neutral"
            variant="outline"
            class="mt-4 min-h-11"
          />
        </section>

        <PublicCommunityContactPanel
          :group-qr-url="club.groupQrUrl"
          :group-qr-urls="club.groupQrUrls"
          :group-qr-titles="club.groupQrTitles"
          :contact-qr-url="club.contactQrUrl"
          :contact-qr-urls="club.contactQrUrls"
          :contact-qr-titles="club.contactQrTitles"
          :contact-name="club.contactName"
          :contact-phone="club.contactPhone"
          :contact-phones="club.contactPhones"
        />

        <PublicSourceDetails
          :sources="detailSources"
          :verified-at="club.updatedAt"
          :title="clubSectionLabels.sourceDetails"
        />

        <div class="mt-6 flex flex-wrap gap-2">
          <UButton
            :to="feedbackLink"
            icon="i-lucide-message-square-warning"
            :label="clubSectionLabels.feedback"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
          <!-- Stable recruit entry: the recruit page itself explains when a club
               has no open form yet, so this link never dead-ends. -->
          <UButton
            :to="recruitSignupPath"
            icon="i-lucide-clipboard-list"
            label="纳新报名表"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
        </div>
      </article>
    </div>
  </div>
</template>
