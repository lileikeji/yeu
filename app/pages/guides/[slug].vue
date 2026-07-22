<script setup lang="ts">
import { findFreshmanGuide } from '~~/data/seeds/public-content'
import { buildDetailFeedbackLink, buildGeneralFeedbackLink } from '~/utils/feedback-context'
import {
  publicResponseErrorCode,
  throwPublicDetailError
} from '~/utils/public-errors'
import { resolvePublicGuide } from '~/utils/public-catalog'
import { safeExternalHref } from '~/utils/safe-external-href'
import {
  buildGuideDetailSources,
  guideStatePresentation,
  resolveGuideFallbackMessage,
  resolveGuideOfficialSource,
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
const officialSourceHref = computed(() => safeExternalHref(
  resolveGuideOfficialSource(detailSources.value)?.url
))

const contentsDetails = ref<HTMLDetailsElement | null>(null)
const sourceArea = ref<HTMLElement | null>(null)
const showContentsShortcut = ref(false)
let contentsShortcutFrame = 0

function updateContentsShortcut() {
  if (contentsShortcutFrame) return

  contentsShortcutFrame = window.requestAnimationFrame(() => {
    contentsShortcutFrame = 0
    const contents = contentsDetails.value
    const source = sourceArea.value

    if (!contents || !source || guide.value.sections.length < 5) {
      showContentsShortcut.value = false
      return
    }

    const contentsRect = contents.getBoundingClientRect()
    const sourceRect = source.getBoundingClientRect()
    const sourceDetails = source.querySelector('details')
    const mobileNav = document.querySelector<HTMLElement>('[aria-label="移动端主导航"]')
    const mobileNavHeight = mobileNav?.getBoundingClientRect().height || 72
    const shortcutBottom = window.innerHeight - mobileNavHeight - 12
    const shortcutTop = shortcutBottom - 44
    const sourceOverlapsShortcut = sourceRect.top < shortcutBottom
      && sourceRect.bottom > shortcutTop

    showContentsShortcut.value = contentsRect.bottom < 72
      && !sourceDetails?.open
      && !sourceOverlapsShortcut
  })
}

function openContents() {
  if (contentsDetails.value) {
    contentsDetails.value.open = true
  }
}

onMounted(() => {
  updateContentsShortcut()
  window.addEventListener('scroll', updateContentsShortcut, { passive: true })
  window.addEventListener('resize', updateContentsShortcut, { passive: true })
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateContentsShortcut)
  window.removeEventListener('resize', updateContentsShortcut)
  if (contentsShortcutFrame) {
    window.cancelAnimationFrame(contentsShortcutFrame)
  }
})
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
            class="inline-flex min-h-10 items-center hover:text-green-700"
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

          <div class="flex flex-wrap gap-2 self-start md:max-w-xs md:justify-end">
            <UButton
              :to="relatedAction.to"
              :icon="relatedAction.icon"
              :label="relatedAction.label"
              size="lg"
              class="min-h-11"
            />
            <UButton
              v-if="officialSourceHref"
              :to="officialSourceHref"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-external-link"
              label="查看学校原文"
              color="neutral"
              variant="outline"
              size="lg"
              class="min-h-11"
            />
          </div>
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

        <details
          v-if="guide.sections.length > 1"
          id="guide-contents"
          ref="contentsDetails"
          class="group mt-5 overflow-hidden rounded-md border border-zinc-200 bg-white"
        >
          <summary
            class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3.5 text-sm font-semibold text-zinc-800 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-700"
          >
            <span class="flex items-center gap-2">
              <UIcon
                name="i-lucide-list"
                class="size-4 text-green-700"
              />
              快速跳到
            </span>
            <span class="flex items-center gap-2 text-xs font-normal text-zinc-500">
              共 {{ guide.sections.length }} 个部分
              <UIcon
                name="i-lucide-chevron-down"
                class="size-4 transition-transform group-open:rotate-180"
              />
            </span>
          </summary>
          <nav
            class="grid grid-cols-2 gap-2 border-t border-zinc-200 bg-zinc-50/70 p-2.5 sm:grid-cols-3"
            aria-label="本页内容"
          >
            <a
              v-for="(section, index) in guide.sections"
              :key="section.title"
              :href="`#guide-section-${index}`"
              class="inline-flex min-h-11 min-w-0 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium leading-5 text-zinc-700 transition-colors hover:border-green-300 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            >
              <span class="line-clamp-2">{{ section.title }}</span>
            </a>
          </nav>
        </details>

        <section
          v-for="(section, index) in guide.sections"
          :id="`guide-section-${index}`"
          :key="section.title"
          class="group relative scroll-mt-24 border-b border-[var(--line)] py-7 pl-12 last:border-b-0"
        >
          <span
            v-if="index < guide.sections.length - 1"
            aria-hidden="true"
            class="absolute -bottom-7 left-4 top-16 w-px bg-zinc-200"
          />
          <div class="min-w-0">
            <span class="absolute left-0 top-7 grid size-8 place-items-center rounded-md border border-zinc-200 bg-white text-green-700 shadow-sm transition-colors group-hover:border-green-300 group-hover:bg-green-50">
              <UIcon
                :name="section.icon"
                class="size-4"
              />
            </span>
            <p class="text-xs font-medium text-zinc-400">
              {{ String(index + 1).padStart(2, '0') }}
            </p>
            <h2 class="text-lg font-bold text-zinc-950">
              {{ section.title }}
            </h2>
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

        <div
          ref="sourceArea"
          @toggle.capture="updateContentsShortcut"
        >
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
              class="min-h-11"
            />
            <UButton
              to="/guides"
              icon="i-lucide-arrow-left"
              label="返回全部指南"
              color="neutral"
              variant="ghost"
              class="min-h-11"
            />
          </div>
        </div>
      </article>
    </div>

    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-2 opacity-0"
    >
      <a
        v-if="showContentsShortcut"
        href="#guide-contents"
        class="fixed bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+0.75rem)] right-4 z-30 inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-800 shadow-lg shadow-zinc-950/10 hover:border-green-300 hover:text-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 md:hidden"
        aria-label="返回本页目录"
        @click="openContents"
      >
        <UIcon
          name="i-lucide-list"
          class="size-4 text-green-700"
        />
        查看目录
      </a>
    </Transition>
  </div>
</template>
