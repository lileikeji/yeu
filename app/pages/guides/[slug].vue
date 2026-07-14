<script setup lang="ts">
import { findFreshmanGuide } from '~~/data/seeds/public-content'
import { buildDetailFeedbackLink, buildGeneralFeedbackLink } from '~/utils/feedback-context'
import { resolvePublicGuide } from '~/utils/public-catalog'

const route = useRoute()
const slug = Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug
const normalizedSlug = String(slug ?? '')
const seedGuide = findFreshmanGuide(normalizedSlug)
const { data: publicGuide, error: publicGuideError } = await usePublicGuide(normalizedSlug)

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function responseErrorCode(error: unknown): string | null {
  if (!isObject(error)) return null
  if (typeof error.code === 'string') return error.code

  const data = isObject(error.data) ? error.data : null
  if (typeof data?.code === 'string') return data.code
  if (isObject(data?.data) && typeof data.data.code === 'string') return data.data.code

  const response = isObject(error.response) ? error.response : null
  const responseData = isObject(response?._data) ? response._data : null
  if (typeof responseData?.code === 'string') return responseData.code
  if (isObject(responseData?.data) && typeof responseData.data.code === 'string') return responseData.data.code
  return null
}

function responseStatusCode(error: unknown): number | null {
  if (!isObject(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  const response = isObject(error.response) ? error.response : null
  if (typeof response?.status === 'number') return response.status
  const responseData = isObject(response?._data) ? response._data : null
  if (typeof responseData?.statusCode === 'number') return responseData.statusCode
  return null
}

const guideErrorCode = responseErrorCode(publicGuideError.value)
const catalogIsUnmanaged = guideErrorCode === 'CONTENT_CATALOG_UNMANAGED'

if (publicGuideError.value && !catalogIsUnmanaged) {
  const statusCode = responseStatusCode(publicGuideError.value)
  throw createError({
    statusCode: statusCode === 404 ? 404 : 503,
    statusMessage: statusCode === 404 ? '指南不存在' : '指南服务暂时不可用'
  })
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
const fallbackMessage = computed(() => {
  if (guide.value.isApiPublished) return null
  return '后台尚未接管指南目录，当前显示内置基础指南。'
})
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

const relatedAction = computed(() => {
  if (guide.value.slug === 'arrival') {
    return { label: '打开可勾选报到流程', to: '/procedures/arrival', icon: 'i-lucide-list-checks' }
  }
  if (guide.value.slug === 'find-campus') {
    return { label: '打开校园地图', to: '/map', icon: 'i-lucide-map' }
  }
  if (guide.value.slug === 'clubs') {
    return { label: '查看校园与社团', to: '/campus#clubs', icon: 'i-lucide-users-round' }
  }
  return { label: '返回全部指南', to: '/guides', icon: 'i-lucide-layout-grid' }
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-7 md:py-10">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="面包屑"
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
                :color="guide.status === 'verified' ? 'success' : 'warning'"
                variant="soft"
              >
                {{ guide.statusText }}
              </UBadge>
            </div>
            <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
              {{ guide.title }}
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
              {{ guide.summary }}
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

    <div class="page-shell grid gap-8 py-8 md:grid-cols-[minmax(0,1fr)_17rem] md:py-12">
      <article class="min-w-0">
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

        <section
          v-for="(section, index) in guide.sections"
          :key="section.title"
          class="border-b border-[var(--line)] py-8 first:pt-9"
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
            class="mt-5 space-y-3"
          >
            <li
              v-for="item in section.items"
              :key="item"
              class="flex items-start gap-3 text-sm leading-7 text-zinc-700"
            >
              <UIcon
                name="i-lucide-circle-dot"
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

        <div class="mt-8 flex flex-wrap gap-2">
          <UButton
            :to="feedbackLink"
            icon="i-lucide-message-square-warning"
            label="反馈错误或补充资料"
            color="neutral"
            variant="outline"
          />
          <UButton
            to="/guides"
            icon="i-lucide-arrow-left"
            label="全部指南"
            color="neutral"
            variant="ghost"
          />
        </div>
      </article>

      <aside class="min-w-0">
        <div class="surface-panel p-4 md:sticky md:top-24">
          <h2 class="text-sm font-bold text-zinc-950">
            信息状态
          </h2>
          <dl class="mt-4 space-y-3 text-xs">
            <div class="flex items-start justify-between gap-4">
              <dt class="text-zinc-500">
                适用人群
              </dt>
              <dd class="text-right font-medium text-zinc-800">
                {{ guide.audience.join('、') }}
              </dd>
            </div>
            <div class="flex items-start justify-between gap-4">
              <dt class="text-zinc-500">
                预计阅读
              </dt>
              <dd class="font-medium text-zinc-800">
                {{ guide.readMinutes }} 分钟
              </dd>
            </div>
            <div class="flex items-start justify-between gap-4">
              <dt class="text-zinc-500">
                最后整理
              </dt>
              <dd class="font-medium text-zinc-800">
                {{ guide.updatedAt }}
              </dd>
            </div>
          </dl>

          <div class="mt-5 border-t border-zinc-100 pt-4">
            <h3 class="text-xs font-bold text-zinc-800">
              参考来源
            </h3>
            <ul
              v-if="guide.sources.length"
              class="mt-3 space-y-3"
            >
              <li
                v-for="source in guide.sources"
                :key="source.url"
              >
                <a
                  :href="source.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="group flex items-start gap-2 text-xs leading-5 text-zinc-600 hover:text-green-700"
                >
                  <UIcon
                    name="i-lucide-external-link"
                    class="mt-0.5 size-3.5 shrink-0"
                  />
                  <span>
                    <span class="font-medium">{{ source.title }}</span>
                    <span class="block text-zinc-400">访问于 {{ source.accessedAt }}</span>
                  </span>
                </a>
              </li>
            </ul>
            <p
              v-else
              class="mt-3 text-xs leading-5 text-zinc-500"
            >
              暂无足以支持具体事实的公开来源，因此页面仅展示核验计划。
            </p>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
