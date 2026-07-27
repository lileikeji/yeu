<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { PublicMapPlace } from '~/utils/public-catalog'
import { parsePublicPhoneContacts } from '~/utils/public-phone-contact'
import { safeExternalHref } from '~/utils/safe-external-href'

const props = defineProps<{
  place: PublicMapPlace
  variant: 'mobile' | 'desktop'
  categoryLabel: string
  categoryIcon: string
  statusText: string
  checklist: string[]
  detailsTarget?: RouteLocationRaw
  feedbackTarget?: RouteLocationRaw
  returnPath?: string | null
  routePlanning: boolean
  canPlanRoute: boolean
  isWechat: boolean
}>()

const emit = defineEmits<{
  close: []
  copy: []
  planRoute: []
}>()

const safeNavigationUrl = computed(() => safeExternalHref(props.place.navigationUrl))
const phoneContacts = computed(() => parsePublicPhoneContacts(props.place.phone))

const navigationTooltip = computed(() => {
  if (!safeNavigationUrl.value) return '这个地点暂时没有可用导航入口'
  return props.place.coordinateVerification === 'owner-map-only'
    ? '导航到这个地图位置，实际入口请现场确认'
    : '使用该地点提供的外部导航入口'
})
</script>

<template>
  <section
    :class="props.variant === 'mobile'
      ? 'absolute bottom-[calc(var(--mobile-nav-height)+0.75rem)] left-3 right-3 z-40 max-h-[min(38dvh,18rem)] overflow-y-auto overscroll-y-contain rounded-lg border border-zinc-200 bg-white p-4 shadow-xl md:hidden'
      : 'hidden md:absolute md:bottom-12 md:left-4 md:z-20 md:block md:max-h-[min(52vh,26rem)] md:w-[min(24rem,calc(100%-2rem))] md:overflow-y-auto md:rounded-lg md:border md:border-zinc-200 md:bg-white md:p-4 md:shadow-xl'"
    aria-live="polite"
  >
    <div
      class="flex items-start"
      :class="props.variant === 'mobile' ? 'justify-between gap-3' : 'justify-between gap-4'"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2 text-xs font-medium text-green-700">
          <UIcon
            :name="props.categoryIcon"
            class="size-4"
          />
          <span>{{ props.categoryLabel }}</span>
        </div>
        <h2
          class="mt-1 truncate font-bold text-zinc-950"
          :class="props.variant === 'desktop' ? 'text-base' : ''"
        >
          {{ props.place.name }}
        </h2>
      </div>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        class="size-11"
        aria-label="关闭地点详情"
        @click="emit('close')"
      />
    </div>

    <p
      class="text-zinc-600"
      :class="props.variant === 'mobile'
        ? 'mt-2 text-xs leading-5'
        : 'mt-3 whitespace-pre-line text-sm leading-6'"
    >
      {{ props.place.summary }}
    </p>

    <p
      v-if="props.variant === 'mobile' && props.place.address"
      class="mt-1 text-xs leading-5 text-zinc-500"
    >
      {{ props.place.address }}
    </p>

    <div
      v-if="props.variant === 'mobile' && (props.place.campusArea || props.place.openingHours || phoneContacts.length)"
      class="mt-2 space-y-2"
    >
      <p
        v-if="props.place.campusArea"
        class="text-xs leading-5 text-zinc-500"
      >
        片区：{{ props.place.campusArea }}
      </p>
      <p
        v-if="props.place.openingHours"
        class="text-xs leading-5 text-zinc-500"
      >
        开放时间：{{ props.place.openingHours }}
      </p>
      <div
        v-if="phoneContacts.length"
        class="flex flex-col items-start gap-2"
      >
        <a
          v-for="phone in phoneContacts"
          :key="phone.href"
          :href="phone.href"
          class="inline-flex min-h-11 items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 text-sm font-semibold text-green-800 transition-colors active:bg-green-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
        >
          <UIcon
            name="i-lucide-phone"
            class="size-4 shrink-0"
          />
          <span>拨打 {{ phone.label }}</span>
        </a>
      </div>
    </div>

    <dl
      v-if="props.variant === 'desktop' && (props.place.address || props.place.campusArea || props.place.openingHours || props.place.phone)"
      class="mt-3 space-y-2 border-t border-zinc-100 pt-3 text-xs"
    >
      <div v-if="props.place.address">
        <dt class="text-zinc-400">
          位置
        </dt>
        <dd class="mt-0.5 text-zinc-700">
          {{ props.place.address }}
        </dd>
      </div>
      <div v-if="props.place.campusArea">
        <dt class="text-zinc-400">
          片区
        </dt>
        <dd class="mt-0.5 text-zinc-700">
          {{ props.place.campusArea }}
        </dd>
      </div>
      <div v-if="props.place.openingHours">
        <dt class="text-zinc-400">
          开放时间
        </dt>
        <dd class="mt-0.5 text-zinc-700">
          {{ props.place.openingHours }}
        </dd>
      </div>
      <div v-if="phoneContacts.length">
        <dt class="text-zinc-400">
          公开电话
        </dt>
        <dd class="mt-0.5">
          <div class="flex flex-col items-start gap-2">
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
    </dl>

    <div
      class="border-t border-zinc-100 pt-3"
      :class="props.variant === 'mobile' ? 'mt-3' : 'mt-4'"
    >
      <span
        class="text-xs"
        :class="props.place.pointIsVerified ? 'text-green-700' : 'text-orange-700'"
      >{{ props.statusText }}</span>

      <div
        v-if="props.canPlanRoute || safeNavigationUrl"
        class="mt-3 grid grid-cols-2 gap-2"
      >
        <UTooltip
          v-if="props.variant === 'desktop'"
          text="在地图上规划从你所在位置到这里的步行路线"
        >
          <UButton
            icon="i-lucide-route"
            label="规划步行路线"
            color="primary"
            variant="solid"
            size="sm"
            class="min-h-11 w-full justify-center"
            :loading="props.routePlanning"
            :disabled="!props.canPlanRoute"
            @click="emit('planRoute')"
          />
        </UTooltip>
        <UButton
          v-else
          icon="i-lucide-route"
          label="规划步行路线"
          color="primary"
          variant="solid"
          size="sm"
          class="min-h-11 w-full justify-center"
          :loading="props.routePlanning"
          :disabled="!props.canPlanRoute"
          @click="emit('planRoute')"
        />

        <UTooltip
          v-if="props.variant === 'desktop'"
          :text="navigationTooltip"
        >
          <UButton
            :to="safeNavigationUrl ?? undefined"
            :target="safeNavigationUrl ? '_blank' : undefined"
            rel="noopener noreferrer"
            icon="i-lucide-navigation"
            label="高德导航"
            color="neutral"
            variant="outline"
            size="sm"
            class="min-h-11 w-full justify-center"
            :disabled="!safeNavigationUrl"
          />
        </UTooltip>
        <UButton
          v-else
          :to="safeNavigationUrl ?? undefined"
          :target="safeNavigationUrl ? '_blank' : undefined"
          rel="noopener noreferrer"
          icon="i-lucide-navigation"
          label="高德导航"
          color="neutral"
          variant="outline"
          size="sm"
          class="min-h-11 w-full justify-center"
          :disabled="!safeNavigationUrl"
        />
      </div>
      <p
        v-else
        class="mt-3 rounded-md bg-orange-50 px-3 py-2 text-xs leading-5 text-orange-800"
      >
        这个地点目前只能在学校平面图中查看，还不能直接规划路线。到校后请按编号和现场标识确认。
      </p>

      <span
        v-if="props.isWechat && safeNavigationUrl"
        class="mt-2 block text-xs leading-5 text-zinc-500"
      >微信内未唤起地图时，可复制位置后搜索。</span>

      <div class="mt-3 rounded-md bg-zinc-50 p-3">
        <p class="text-xs font-semibold text-zinc-900">
          到这里前先确认
        </p>
        <ul class="mt-2 space-y-1.5 text-xs leading-5 text-zinc-600">
          <li
            v-for="item in props.checklist"
            :key="item"
            class="flex gap-2"
          >
            <UIcon
              name="i-lucide-circle-check-big"
              class="mt-0.5 size-3.5 shrink-0 text-green-700"
            />
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <UButton
          v-if="props.detailsTarget"
          :to="props.detailsTarget"
          icon="i-lucide-info"
          label="详情"
          size="sm"
          class="min-h-11"
        />
        <UButton
          v-if="props.feedbackTarget"
          :to="props.feedbackTarget"
          icon="i-lucide-message-square-warning"
          label="纠错"
          color="neutral"
          variant="outline"
          size="sm"
          class="min-h-11"
        />
        <UButton
          icon="i-lucide-copy"
          label="复制位置"
          color="neutral"
          variant="outline"
          size="sm"
          class="min-h-11"
          @click="emit('copy')"
        />
        <UButton
          v-if="props.returnPath"
          :to="props.returnPath"
          icon="i-lucide-undo-2"
          label="返回上一页"
          color="neutral"
          variant="ghost"
          size="sm"
          class="min-h-11"
        />
      </div>
    </div>
  </section>
</template>
