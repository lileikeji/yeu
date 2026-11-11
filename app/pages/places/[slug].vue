<script setup lang="ts">
import type { ApiPlace } from '~~/shared/types/server'
import { formatOfflineSnapshotTime, useOfflineSnapshot } from '~/composables/useOfflineSnapshot'
import { buildDetailFeedbackLink } from '~/utils/feedback-context'
import { throwPublicDetailError } from '~/utils/public-errors'
import { safeLocalPath } from '~/utils/safe-navigation'
import { safeExternalHref } from '~/utils/safe-external-href'
import {
  buildPlaceDetailSources,
  buildPlaceFallbackUseChecklist,
  buildPlaceLocationCopyText,
  buildPlaceMapTarget,
  isPlaceCoordinateVerified,
  resolvePlaceCategoryLabel,
  resolvePlaceFloorRoomLabel,
  resolvePlaceNavigationStatusLabel,
  resolvePlaceScopeLabel,
  resolvePlaceStudentBody,
  resolvePlaceStudentSummary,
  resolvePlaceUseChecklist
} from '~~/app/utils/place-detail-presentation'
import { parsePublicPhoneContacts } from '~~/app/utils/public-phone-contact'
import { decodePlacePoint } from '~~/shared/utils/geo-obfuscation'
import { buildAmapMarkerNavigationUrl } from '~/utils/map-native-search'

const route = useRoute()
const { copyText, isWechat } = useShareActions()
// SSR 期间内部请求必须带上原始请求上下文，否则会被 /api 的 origin guard 判成无来源请求。
const requestFetch = useRequestFetch()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')
const { data: place, stale, savedAt, error } = await useOfflineSnapshot<ApiPlace>(
  `place:${slug}`,
  loadPlacePayload
)
if (error.value) throwPublicDetailError(error.value, '地点')
if (!place.value) throw createError({ statusCode: 404, statusMessage: '地点不存在' })

async function loadPlacePayload(): Promise<ApiPlace> {
  const payload = await requestFetch<ApiPlace>(`/api/public/places/${encodeURIComponent(slug)}`)
  // 服务端照旧过一遍公开字段清洗；客户端原样用，别把展示层工具带进客户端包。
  if (import.meta.client) return payload
  const { sanitizePublicPlace } = await import('~/utils/public-api-presentation')
  return sanitizePublicPlace(payload)
}

const offlineSavedAtLabel = computed(() => formatOfflineSnapshotTime(savedAt.value))

const studentSummary = computed(() => resolvePlaceStudentSummary(
  place.value?.summary,
  place.value?.name ?? '这里',
  place.value?.category,
  place.value?.type
))

useSeoMeta({
  title: () => place.value?.name ?? '地点',
  description: () => studentSummary.value
})

const returnPath = computed(() => safeLocalPath(route.query.from))
const coordinateIsVerified = computed(() => isPlaceCoordinateVerified(place.value))
const navigationStatusLabel = computed(() => resolvePlaceNavigationStatusLabel(coordinateIsVerified.value))
const mapTarget = computed(() => buildPlaceMapTarget(
  place.value?.slug ?? slug,
  returnPath.value
))
const feedbackLink = computed(() => buildDetailFeedbackLink({
  targetType: 'place',
  targetId: place.value!.id,
  targetName: place.value!.name,
  reasonType: 'place_error',
  from: route.fullPath
}))

const placeUseChecklist = computed(() => resolvePlaceUseChecklist(place.value?.body))
const studentBody = computed(() => {
  const body = resolvePlaceStudentBody(
    place.value?.body,
    place.value?.name,
    place.value?.category,
    place.value?.type
  )
  return body === studentSummary.value ? '' : body
})
const detailSources = computed(() => buildPlaceDetailSources(place.value?.sources))
// F2「来源与核验时间」：地点接口本来就下发 place.sources（ApiSource[]），这里只做字段改名。
// 不补造来源、不调 /api/public/evidence 拼假 claimId；核验时间只认 accessedAt（sources.accessed_at）。
const placeCitationSources = computed(() => (place.value?.sources ?? []).map(source => ({
  title: source.title,
  url: source.url,
  level: source.sourceLevel,
  official: source.isOfficial,
  verifiedAt: source.accessedAt
})))
const fallbackUseChecklist = computed(() => buildPlaceFallbackUseChecklist(
  placeUseChecklist.value,
  place.value?.category ?? place.value?.type
))
const categoryLabel = computed(() => resolvePlaceCategoryLabel(
  place.value?.category,
  place.value?.type
))
const scopeLabel = computed(() => resolvePlaceScopeLabel(place.value?.scope))
const floorRoomLabel = computed(() => resolvePlaceFloorRoomLabel(
  place.value?.floor,
  place.value?.room
))

const phoneContacts = computed(() => parsePublicPhoneContacts(place.value?.phone))

// 公共出口不再下发 externalMapUrl（内嵌明文坐标）；导航链接由解码后的坐标前端拼装。
// SSR 阶段返回 null：否则含坐标的 href 会打进 SSR HTML，混淆被架空。
const geoCipherKey = __GEO_CIPHER_KEY__
const navigationUrl = computed(() => {
  if (import.meta.server) return null
  if (!place.value?.navigationAvailable || !place.value.encodedPoint) return null
  const decoded = decodePlacePoint(place.value.encodedPoint, geoCipherKey)
  if (!decoded) return null
  return buildAmapMarkerNavigationUrl(
    { lng: decoded.longitude, lat: decoded.latitude },
    place.value.name
  )
})

function copyPlaceLocation(): void {
  if (!place.value) return
  void copyText(buildPlaceLocationCopyText(place.value), '地点信息')
}
</script>

<template>
  <div v-if="place">
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400"
          aria-label="当前位置"
        >
          <NuxtLink
            to="/map"
            class="inline-flex min-h-10 items-center hover:text-green-700 dark:hover:text-green-400"
          >校园地图</NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span>{{ place.name }}</span>
        </nav>
        <div class="mt-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div class="max-w-3xl">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="categoryLabel"
                color="neutral"
                variant="soft"
              />
              <UBadge
                :label="scopeLabel"
                color="neutral"
                variant="soft"
              />
              <UBadge
                :label="navigationStatusLabel"
                :color="coordinateIsVerified ? 'success' : 'warning'"
                variant="soft"
              />
            </div>
            <h1 class="mt-4 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
              {{ place.name }}
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300 md:text-base">
              {{ studentSummary }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              :to="mapTarget"
              icon="i-lucide-map-pinned"
              label="查看地图"
              size="lg"
              class="min-h-11"
            />
            <UButton
              v-if="place.address || place.campusArea || place.floor || place.room"
              icon="i-lucide-copy"
              label="复制位置"
              color="neutral"
              variant="outline"
              size="lg"
              class="min-h-11"
              @click="copyPlaceLocation"
            />
            <UButton
              v-if="place.navigationAvailable && safeExternalHref(navigationUrl)"
              :to="safeExternalHref(navigationUrl) || undefined"
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-navigation"
              label="开始导航"
              color="neutral"
              variant="outline"
              size="lg"
              class="min-h-11"
            />
          </div>
          <p
            v-if="isWechat && place.navigationAvailable && navigationUrl"
            class="text-xs leading-5 text-zinc-500 dark:text-zinc-400 md:text-right"
          >
            微信内可复制位置再搜。
          </p>
        </div>
      </div>
    </header>

    <div class="page-shell py-7 md:py-10">
      <article class="mx-auto min-w-0 max-w-4xl">
        <div
          v-if="stale"
          role="status"
          class="surface-panel mb-5 flex items-start gap-2.5 px-3.5 py-2.5 text-sm text-zinc-600 dark:text-zinc-300"
        >
          <UIcon
            name="i-lucide-cloud-off"
            class="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
          />
          <p>
            现在连不上网，显示 {{ offlineSavedAtLabel }} 保存的内容。恢复网络后刷新。
          </p>
        </div>
        <section class="border-b border-zinc-200 dark:border-zinc-800 pb-8">
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
            详细位置
          </h2>
          <dl class="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800 text-sm">
            <div
              v-if="place.campusArea"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500 dark:text-zinc-400">
                区域
              </dt>
              <dd class="text-right text-zinc-900 dark:text-zinc-100">
                {{ place.campusArea }}
              </dd>
            </div>
            <div
              v-if="place.address"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500 dark:text-zinc-400">
                地址
              </dt>
              <dd class="text-right text-zinc-900 dark:text-zinc-100">
                {{ place.address }}
              </dd>
            </div>
            <div
              v-if="place.floor || place.room"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500 dark:text-zinc-400">
                楼层 / 房间
              </dt>
              <dd class="text-right text-zinc-900 dark:text-zinc-100">
                {{ floorRoomLabel }}
              </dd>
            </div>
          </dl>
        </section>

        <section class="border-b border-zinc-200 dark:border-zinc-800 py-8">
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
            到这里前先确认
          </h2>
          <ul class="mt-4 space-y-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200">
            <li
              v-for="item in fallbackUseChecklist"
              :key="item"
              class="flex gap-2"
            >
              <UIcon
                name="i-lucide-circle-check-big"
                class="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400"
              />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>

        <section
          v-if="studentBody"
          class="border-b border-zinc-200 dark:border-zinc-800 py-8"
        >
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
            到达与服务说明
          </h2>
          <p class="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-600 dark:text-zinc-300">
            {{ studentBody }}
          </p>
        </section>

        <section
          v-if="place.openingHours || place.phone || safeExternalHref(place.website)"
          class="py-8"
        >
          <h2 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
            服务信息
          </h2>
          <dl class="mt-4 divide-y divide-zinc-100 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800 text-sm">
            <div
              v-if="place.openingHours"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500 dark:text-zinc-400">
                开放时间
              </dt>
              <dd class="text-right text-zinc-900 dark:text-zinc-100">
                {{ place.openingHours }}
              </dd>
            </div>
            <div
              v-if="phoneContacts.length"
              class="flex items-start justify-between gap-6 py-3"
            >
              <dt class="shrink-0 text-zinc-500 dark:text-zinc-400">
                公开电话
              </dt>
              <dd class="min-w-0 text-right">
                <div class="flex flex-col items-end gap-2">
                  <a
                    v-for="phone in phoneContacts"
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
              </dd>
            </div>
            <div
              v-if="safeExternalHref(place.website)"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500 dark:text-zinc-400">
                网站
              </dt>
              <dd class="text-right">
                <a
                  :href="safeExternalHref(place.website) || undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex min-h-10 items-center font-medium text-green-700 dark:text-green-400 hover:underline"
                >打开官网</a>
              </dd>
            </div>
          </dl>
        </section>

        <PublicSourceDetails
          :sources="detailSources"
          :verified-at="place.lastVerifiedAt?.slice(0, 10)"
        />

        <SourceCitationBlock
          :sources="placeCitationSources"
          :target-id="place.id"
        />

        <div class="mt-6 flex flex-wrap gap-2">
          <UButton
            :to="feedbackLink"
            icon="i-lucide-message-square-warning"
            label="告诉我们哪里不对"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
          <UButton
            v-if="returnPath"
            :to="returnPath"
            icon="i-lucide-undo-2"
            label="返回上一页"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </article>
    </div>
  </div>
</template>
