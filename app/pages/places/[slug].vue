<script setup lang="ts">
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

const route = useRoute()
const { copyText, isWechat } = useShareActions()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')
const { data: place, error } = await usePublicPlace(slug)
if (error.value) throwPublicDetailError(error.value, '地点')
if (!place.value) throw createError({ statusCode: 404, statusMessage: '地点不存在' })

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

function copyPlaceLocation(): void {
  if (!place.value) return
  void copyText(buildPlaceLocationCopyText(place.value), '地点信息')
}
</script>

<template>
  <div v-if="place">
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="当前位置"
        >
          <NuxtLink
            to="/map"
            class="inline-flex min-h-10 items-center hover:text-green-700"
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
            <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
              {{ place.name }}
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
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
              v-if="place.navigationAvailable && safeExternalHref(place.externalMapUrl)"
              :to="safeExternalHref(place.externalMapUrl) || undefined"
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
            v-if="isWechat && place.navigationAvailable && place.externalMapUrl"
            class="text-xs leading-5 text-zinc-500 md:text-right"
          >
            微信内若未唤起地图，可复制位置后在地图应用中搜索。
          </p>
        </div>
      </div>
    </header>

    <div class="page-shell py-7 md:py-10">
      <article class="mx-auto min-w-0 max-w-4xl">
        <section class="border-b border-zinc-200 pb-8">
          <h2 class="text-lg font-bold text-zinc-950">
            详细位置
          </h2>
          <dl class="mt-4 divide-y divide-zinc-100 border-y border-zinc-200 text-sm">
            <div
              v-if="place.campusArea"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                区域
              </dt>
              <dd class="text-right text-zinc-900">
                {{ place.campusArea }}
              </dd>
            </div>
            <div
              v-if="place.address"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                地址
              </dt>
              <dd class="text-right text-zinc-900">
                {{ place.address }}
              </dd>
            </div>
            <div
              v-if="place.floor || place.room"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                楼层 / 房间
              </dt>
              <dd class="text-right text-zinc-900">
                {{ floorRoomLabel }}
              </dd>
            </div>
          </dl>
        </section>

        <section class="border-b border-zinc-200 py-8">
          <h2 class="text-lg font-bold text-zinc-950">
            到这里前先确认
          </h2>
          <ul class="mt-4 space-y-2 text-sm leading-6 text-zinc-700">
            <li
              v-for="item in fallbackUseChecklist"
              :key="item"
              class="flex gap-2"
            >
              <UIcon
                name="i-lucide-check-circle-2"
                class="mt-0.5 size-4 shrink-0 text-green-700"
              />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>

        <section
          v-if="studentBody"
          class="border-b border-zinc-200 py-8"
        >
          <h2 class="text-lg font-bold text-zinc-950">
            到达与服务说明
          </h2>
          <p class="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-600">
            {{ studentBody }}
          </p>
        </section>

        <section
          v-if="place.openingHours || place.phone || safeExternalHref(place.website)"
          class="py-8"
        >
          <h2 class="text-lg font-bold text-zinc-950">
            服务信息
          </h2>
          <dl class="mt-4 divide-y divide-zinc-100 border-y border-zinc-200 text-sm">
            <div
              v-if="place.openingHours"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                开放时间
              </dt>
              <dd class="text-right text-zinc-900">
                {{ place.openingHours }}
              </dd>
            </div>
            <div
              v-if="phoneContacts.length"
              class="flex items-start justify-between gap-6 py-3"
            >
              <dt class="shrink-0 text-zinc-500">
                公开电话
              </dt>
              <dd class="min-w-0 text-right">
                <div class="flex flex-col items-end gap-2">
                  <a
                    v-for="phone in phoneContacts"
                    :key="phone.href"
                    :href="phone.href"
                    class="inline-flex min-h-11 items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 text-sm font-semibold text-green-800 transition-colors hover:border-green-300 hover:bg-green-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
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
              <dt class="text-zinc-500">
                网站
              </dt>
              <dd class="text-right">
                <a
                  :href="safeExternalHref(place.website) || undefined"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex min-h-10 items-center font-medium text-green-700 hover:underline"
                >打开官网</a>
              </dd>
            </div>
          </dl>
        </section>

        <PublicSourceDetails
          :sources="detailSources"
          :verified-at="place.lastVerifiedAt?.slice(0, 10)"
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
