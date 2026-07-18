<script setup lang="ts">
import { findFreshmanGuide } from '~~/data/seeds/public-content'
import { buildDetailFeedbackLink, buildGeneralFeedbackLink } from '~/utils/feedback-context'
import {
  publicResponseErrorCode,
  throwPublicDetailError
} from '~/utils/public-errors'
import { resolvePublicGuide } from '~/utils/public-catalog'
import {
  buildGuideDetailSources,
  guideStatePresentation,
  resolveGuideFallbackMessage,
  resolveGuideRelatedAction,
  studentFacingGuideStatusText
} from '~~/app/utils/guide-detail-presentation'

const route = useRoute()
const slug = Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug
const normalizedSlug = String(slug ?? '')
const seedGuide = findFreshmanGuide(normalizedSlug)
const { data: publicGuide, error: publicGuideError } = await usePublicGuide(normalizedSlug)

const guideErrorCode = publicResponseErrorCode(publicGuideError.value)
const catalogIsUnmanaged = guideErrorCode === 'CONTENT_CATALOG_UNMANAGED'

if (publicGuideError.value && !catalogIsUnmanaged) {
  throwPublicDetailError(publicGuideError.value, '指南')
}

const initialGuide = resolvePublicGuide(
  catalogIsUnmanaged ? seedGuide : undefined,
  publicGuide.value
)

if (!initialGuide) {
  throw createError({ statusCode: 404, statusMessage: '指南不存在' })
}

const guide = computed(() => resolvePublicGuide(
  catalogIsUnmanaged ? seedGuide : undefined,
  publicGuide.value
) ?? initialGuide)
const fallbackMessage = computed(() => resolveGuideFallbackMessage(guide.value.isApiPublished))
const feedbackLink = computed(() => guide.value.contentId
  ? buildDetailFeedbackLink({
      targetType: 'content',
      targetId: guide.value.contentId,
      targetName: guide.value.title,
      reasonType: 'content_outdated',
      from: route.fullPath
    })
  : buildGeneralFeedbackLink({
      targetName: guide.value.title,
      reasonType: 'content_outdated',
      from: route.fullPath
    }))

useSeoMeta({
  title: () => guide.value.title,
  description: () => guide.value.summary
})

const relatedAction = computed(() => resolveGuideRelatedAction(guide.value.slug))

const detailSources = computed(() => buildGuideDetailSources(
  guide.value.sources,
  guide.value.sections
))
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-7 md:py-10">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="当前位置"
        >
          <NuxtLink
            to="/guides"
            class="hover:text-green-700"
          >
            新生指南
          </NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span class="truncate text-zinc-700">{{ guide.shortTitle }}</span>
        </nav>

        <div class="mt-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div class="max-w-3xl">
            <div class="flex items-center gap-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-md bg-green-50 text-green-700">
                <UIcon
                  :name="guide.icon"
                  class="size-5"
                />
              </span>
              <UBadge
                :color="guideStatePresentation(guide.status).color"
                variant="soft"
              >
                <UIcon
                  :name="guideStatePresentation(guide.status).icon"
                  class="mr-1 size-3.5"
                />
                {{ guideStatePresentation(guide.status).label }}
              </UBadge>
            </div>
            <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
              {{ guide.title }}
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
              {{ guide.summary }}
            </p>
            <p class="mt-4 flex max-w-2xl items-start gap-2 text-sm leading-6 text-zinc-600">
              <UIcon
                name="i-lucide-info"
                class="mt-1 size-4 shrink-0 text-orange-600"
              />
              <span><strong class="font-semibold text-zinc-800">目前：</strong>{{ studentFacingGuideStatusText(guide.statusText) }}</span>
            </p>
          </div>

          <UButton
            :to="relatedAction.to"
            :icon="relatedAction.icon"
            :label="relatedAction.label"
            size="lg"
            class="min-h-11 self-start"
          />
        </div>
      </div>
    </header>

    <div class="page-shell py-7 md:py-10">
      <article class="mx-auto min-w-0 max-w-4xl">
        <div
          v-if="fallbackMessage"
          class="mb-4 flex items-start gap-2 border-l-2 border-blue-500 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-900"
          role="status"
        >
          <UIcon
            name="i-lucide-info"
            class="mt-0.5 size-3.5 shrink-0"
          />
          <span>{{ fallbackMessage }}</span>
        </div>

        <div
          class="border-l-4 px-4 py-3 text-sm leading-6"
          :class="guide.status === 'verified' ? 'border-blue-600 bg-blue-50 text-blue-950' : 'border-orange-500 bg-orange-50 text-orange-950'"
          role="status"
        >
          <div class="flex items-start gap-2">
            <UIcon
              :name="guide.status === 'verified' ? 'i-lucide-info' : 'i-lucide-triangle-alert'"
              class="mt-0.5 size-4 shrink-0"
            />
            <p>{{ guide.leadNotice }}</p>
          </div>
        </div>

        <nav
          v-if="guide.sections.length > 1"
          class="scrollbar-none mt-5 flex gap-2 overflow-x-auto pb-1"
          aria-label="本页内容"
        >
          <a
            v-for="(section, index) in guide.sections"
            :key="section.title"
            :href="`#guide-section-${index}`"
            class="shrink-0 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:border-green-300 hover:text-green-700"
          >
            {{ section.title }}
          </a>
        </nav>

        <section
          v-for="(section, index) in guide.sections"
          :id="`guide-section-${index}`"
          :key="section.title"
          class="scroll-mt-24 border-b border-[var(--line)] py-6 first:pt-7"
        >
          <div class="flex items-center gap-3">
            <span class="grid size-8 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700">
              <UIcon
                :name="section.icon"
                class="size-4"
              />
            </span>
            <div>
              <p class="text-xs font-medium text-zinc-400">
                {{ String(index + 1).padStart(2, '0') }}
              </p>
              <h2 class="text-lg font-bold text-zinc-950">
                {{ section.title }}
              </h2>
            </div>
          </div>
          <p
            v-if="section.description"
            class="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-600"
          >
            {{ section.description }}
          </p>
          <ul
            v-if="section.items.length"
            class="mt-4 space-y-2.5"
          >
            <li
              v-for="item in section.items"
              :key="item"
              class="flex items-start gap-3 text-sm leading-7 text-zinc-700"
            >
              <UIcon
                name="i-lucide-check"
                class="mt-1.5 size-4 shrink-0 text-green-700"
              />
              <span>{{ item }}</span>
            </li>
          </ul>
          <p
            v-if="section.notice"
            class="mt-5 text-sm leading-6 text-orange-800"
          >
            {{ section.notice }}
          </p>
        </section>

        <PublicSourceDetails
          :sources="detailSources"
          :verified-at="guide.updatedAt"
        />

        <div class="mt-6 flex flex-wrap gap-2">
          <UButton
            :to="feedbackLink"
            icon="i-lucide-message-square-warning"
            label="告诉我们哪里需要修改"
            color="neutral"
            variant="outline"
          />
          <UButton
            to="/guides"
            icon="i-lucide-arrow-left"
            label="返回全部指南"
            color="neutral"
            variant="ghost"
          />
        </div>
      </article>
    </div>
  </div>
</template>
