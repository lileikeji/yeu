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
  planRouteManual: []
}>()

// 楼栋类点位开放群聊（campus-building/dorm）：登录后进入对应楼栋群
const { isAuthenticated } = useUserSession()
const isBuildingPlace = computed(() =>
  props.place.category === 'campus-building' || props.place.category === 'dorm')
function goPlaceChat(): void {
  // 未登录直达登录页（登录后 redirect 回群聊）；已登录进聊天页
  if (!isAuthenticated.value) {
    void navigateTo({ path: '/login', query: { redirect: `/chat?place=${props.place.id}` } })
    return
  }
  void navigateTo({ path: '/chat', query: { place: props.place.id } })
}

const safeNavigationUrl = computed(() => safeExternalHref(props.place.navigationUrl))
const phoneContacts = computed(() => parsePublicPhoneContacts(props.place.phone))

// 卡片固定纸面底（bg-[var(--surface)]），而站点可能处于暗色主题：Nuxt UI neutral 按钮的
// bg-default/text-default 会解析成暗色，在白卡上变成黑底药丸（评价/纠错/
// 复制位置/高德导航均已线上复现）。卡片内控件一律显式浅色，不跟随站点主题。
const lightOutlineClass = '!bg-[var(--surface)] dark:!bg-zinc-800 !text-zinc-700 dark:!text-zinc-200 !ring-zinc-200 dark:!ring-zinc-700 hover:!bg-zinc-50 dark:hover:!bg-zinc-700/60 active:!bg-zinc-100 dark:active:!bg-zinc-700 disabled:!bg-[var(--surface)] dark:disabled:!bg-zinc-800'
const lightGhostClass = '!text-zinc-400 dark:!text-zinc-300 hover:!bg-zinc-100 dark:hover:!bg-zinc-800 hover:!text-zinc-600 dark:hover:!text-zinc-100'

const navigationTooltip = computed(() => {
  if (!safeNavigationUrl.value) return '暂无导航入口'
  return props.place.coordinateVerification === 'owner-map-only'
    ? '导航到这里，入口现场确认'
    : '外部导航'
})
</script>

<template>
  <section
    :class="props.variant === 'mobile'
      ? 'absolute bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+0.5rem)] inset-x-0 z-40 mx-2.5 max-h-[min(56dvh,30rem)] overflow-y-auto overscroll-y-contain rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-[var(--surface)]/95 dark:bg-zinc-900/95 px-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm md:hidden'
      : 'hidden md:absolute md:bottom-12 md:left-4 md:z-20 md:block md:max-h-[min(52vh,26rem)] md:w-[min(24rem,calc(100%-2rem))] md:overflow-y-auto md:rounded-lg md:border md:border-zinc-200 dark:md:border-zinc-800 md:bg-[var(--surface)] dark:md:bg-zinc-900 md:p-4 md:shadow-xl'"
    aria-live="polite"
    @pointerdown.stop
    @mousedown.stop
  >
    <div
      class="flex items-start"
      :class="props.variant === 'mobile' ? 'justify-between gap-3' : 'justify-between gap-4'"
    >
      <div class="min-w-0">
        <div
          class="inline-flex items-center gap-1 rounded-full py-0.5 pl-1 pr-2"
          :class="props.variant === 'mobile' ? 'bg-green-50 dark:bg-green-950 text-[10px] font-semibold text-green-700 dark:text-green-400' : 'bg-transparent text-[11px] font-medium text-green-700 dark:text-green-400'"
        >
          <UIcon
            :name="props.categoryIcon"
            :class="props.variant === 'mobile' ? 'size-3.5 text-green-600 dark:text-green-400' : 'size-4'"
          />
          <span>{{ props.categoryLabel }}</span>
        </div>
        <h2
          class="mt-0.5 truncate font-bold text-zinc-950 dark:text-zinc-100"
          :class="props.variant === 'mobile' ? 'text-[15px]' : 'text-base'"
        >
          {{ props.place.name }}
        </h2>
      </div>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        :class="['justify-center', lightGhostClass, props.variant === 'mobile' ? '-mr-1.5 size-8' : 'size-11']"
        aria-label="关闭地点详情"
        @click="emit('close')"
      />
    </div>

    <p
      class="text-zinc-600 dark:text-zinc-300"
      :class="props.variant === 'mobile'
        ? 'mt-2 line-clamp-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300'
        : 'mt-3 whitespace-pre-line text-sm leading-6'"
    >
      {{ props.place.summary }}
    </p>

    <p
      v-if="props.variant === 'mobile' && props.place.address"
      class="mt-1 flex items-start gap-1 text-[11px] leading-5 text-zinc-400 dark:text-zinc-500"
    >
      <UIcon
        name="i-lucide-map-pin"
        class="mt-0.5 size-3 shrink-0"
      />
      <span class="min-w-0">{{ props.place.address }}</span>
    </p>

    <div
      v-if="props.variant === 'mobile' && (props.place.campusArea || props.place.openingHours)"
      class="mt-2 flex flex-wrap items-center gap-1.5"
    >
      <span
        v-if="props.place.campusArea"
        class="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
      >
        <UIcon
          name="i-lucide-map-pin"
          class="size-3 text-zinc-400 dark:text-zinc-500"
        />
        {{ props.place.campusArea }}
      </span>
      <span
        v-if="props.place.openingHours"
        class="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-300"
      >
        <UIcon
          name="i-lucide-clock-3"
          class="size-3 text-zinc-400 dark:text-zinc-500"
        />
        {{ props.place.openingHours }}
      </span>
    </div>

    <template v-if="props.variant === 'mobile' && phoneContacts.length">
      <a
        v-for="phone in phoneContacts"
        :key="phone.href"
        :href="phone.href"
        class="mt-2 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-green-600 dark:bg-green-500 px-3 text-sm font-semibold text-white shadow-sm shadow-green-600/20 transition-transform active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
      >
        <UIcon
          name="i-lucide-phone"
          class="size-4 shrink-0"
        />
        <span>拨打 {{ phone.label }}</span>
      </a>
    </template>

    <dl
      v-if="props.variant === 'desktop' && (props.place.address || props.place.campusArea || props.place.openingHours || props.place.phone)"
      class="mt-3 space-y-2 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs"
    >
      <div v-if="props.place.address">
        <dt class="text-zinc-400 dark:text-zinc-500">
          位置
        </dt>
        <dd class="mt-0.5 text-zinc-700 dark:text-zinc-200">
          {{ props.place.address }}
        </dd>
      </div>
      <div v-if="props.place.campusArea">
        <dt class="text-zinc-400 dark:text-zinc-500">
          片区
        </dt>
        <dd class="mt-0.5 text-zinc-700 dark:text-zinc-200">
          {{ props.place.campusArea }}
        </dd>
      </div>
      <div v-if="props.place.openingHours">
        <dt class="text-zinc-400 dark:text-zinc-500">
          开放时间
        </dt>
        <dd class="mt-0.5 text-zinc-700 dark:text-zinc-200">
          {{ props.place.openingHours }}
        </dd>
      </div>
      <div v-if="phoneContacts.length">
        <dt class="text-zinc-400 dark:text-zinc-500">
          公开电话
        </dt>
        <dd class="mt-0.5">
          <div class="flex flex-col items-start gap-2">
            <a
              v-for="phone in phoneContacts"
              :key="phone.href"
              :href="phone.href"
              class="inline-flex min-h-11 items-center gap-2 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-3 text-sm font-semibold text-green-800 dark:text-green-300 transition-colors hover:border-green-300 hover:bg-green-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
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

    <MapPlaceFeedSection
      :place-id="props.place.id"
      :place-slug="props.place.slug"
      :place-name="props.place.name"
    />

    <div
      v-if="isBuildingPlace"
      class="mt-3"
    >
      <UButton
        color="neutral"
        variant="outline"
        size="xs"
        icon="i-lucide-messages-square"
        :label="`进入「${props.place.name}」楼栋群聊`"
        :class="['!bg-[var(--surface)] dark:!bg-zinc-800 !text-sky-700 dark:!text-sky-300 !ring-sky-200 dark:!ring-sky-800 hover:!bg-sky-50 dark:hover:!bg-sky-950/60', props.variant === 'mobile' ? 'min-h-9 w-full px-3' : 'w-full']"
        @click="goPlaceChat"
      />
    </div>

    <MapPlaceRatingSection
      :place-id="props.place.id"
      :place-name="props.place.name"
      :variant="props.variant"
    />

    <MapPlaceMomentsSection
      :place-id="props.place.id"
      :place-name="props.place.name"
    />

    <div
      class="border-t border-zinc-100 dark:border-zinc-800 pt-3"
      :class="props.variant === 'mobile' ? 'mt-3' : 'mt-4'"
    >
      <span
        class="inline-flex items-center gap-1 text-[11px] font-medium"
        :class="props.place.pointIsVerified ? 'text-green-700 dark:text-green-400' : 'text-orange-700 dark:text-orange-300'"
      >
        <UIcon
          :name="props.place.pointIsVerified ? 'i-lucide-badge-check' : 'i-lucide-circle-alert'"
          class="size-3.5"
        />
        {{ props.statusText }}
      </span>

      <div
        v-if="props.canPlanRoute || safeNavigationUrl"
        class="mt-3 grid grid-cols-2 gap-2"
      >
        <UTooltip
          v-if="props.variant === 'desktop'"
          text="从当前位置规划步行路线"
        >
          <UButton
            icon="i-lucide-route"
            label="规划步行路线"
            color="primary"
            variant="solid"
            size="sm"
            class="min-h-11 w-full justify-center"
            :loading="props.routePlanning"
            :disabled="props.routePlanning || !props.canPlanRoute"
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
          :disabled="props.routePlanning || !props.canPlanRoute"
          @click="emit('planRoute')"
        />

        <UButton
          icon="i-lucide-flag"
          label="选起点规划"
          color="neutral"
          variant="ghost"
          size="sm"
          class="min-h-11 w-full justify-center"
          :disabled="props.routePlanning"
          @click="emit('planRouteManual')"
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
            :class="['min-h-11 w-full justify-center', lightOutlineClass]"
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
          :class="['min-h-11 w-full justify-center', lightOutlineClass]"
          :disabled="!safeNavigationUrl"
        />
      </div>
      <p
        v-else
        class="mt-3 rounded-md bg-orange-50 dark:bg-orange-950 px-3 py-2 text-xs leading-5 text-orange-800 dark:text-orange-300"
      >
        平面图可看，暂不能导航
      </p>

      <span
        v-if="props.isWechat && safeNavigationUrl"
        class="mt-2 block text-[11px] leading-5 text-zinc-500 dark:text-zinc-400"
      >微信内可复制位置再搜。</span>

      <div
        class="mt-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-2"
        :class="props.variant === 'mobile' ? '' : 'mt-3 p-3'"
      >
        <p class="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          到这里前先确认
        </p>
        <ul
          class="mt-1.5 space-y-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300"
          :class="props.variant === 'mobile' ? '' : 'mt-2 space-y-1.5'"
        >
          <li
            v-for="item in props.checklist"
            :key="item"
            class="flex gap-2"
          >
            <UIcon
              name="i-lucide-circle-check-big"
              class="mt-0.5 size-3.5 shrink-0 text-green-700 dark:text-green-400"
            />
            <span>{{ item }}</span>
          </li>
        </ul>
      </div>

      <div
        class="flex flex-wrap gap-2"
        :class="props.variant === 'mobile' ? 'mt-2.5' : 'mt-3'"
      >
        <UButton
          v-if="props.detailsTarget"
          :to="props.detailsTarget"
          icon="i-lucide-info"
          label="详情"
          size="sm"
          :class="props.variant === 'mobile' ? 'min-h-9 px-2.5 text-xs' : 'min-h-11'"
        />
        <UButton
          v-if="props.feedbackTarget"
          :to="props.feedbackTarget"
          icon="i-lucide-message-square-warning"
          label="纠错"
          color="neutral"
          variant="outline"
          size="sm"
          :class="[lightOutlineClass, props.variant === 'mobile' ? 'min-h-9 px-2.5 text-xs' : 'min-h-11']"
        />
        <UButton
          icon="i-lucide-copy"
          label="复制位置"
          color="neutral"
          variant="outline"
          size="sm"
          :class="[lightOutlineClass, props.variant === 'mobile' ? 'min-h-9 px-2.5 text-xs' : 'min-h-11']"
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
          :class="[lightGhostClass, props.variant === 'mobile' ? 'min-h-9 px-2 text-xs' : 'min-h-11']"
        />
      </div>
    </div>
  </section>
</template>
