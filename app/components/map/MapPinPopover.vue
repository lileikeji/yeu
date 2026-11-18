<script setup lang="ts">
/**
 * 地图点位浮窗：原生 popover + CSS anchor positioning。
 * guide: position-aware-tooltips / light-dismiss-a-dialog —— 不抢焦点、light dismiss、箭头随翻转换向。
 */
export interface PinCardAction {
  key: string
  label: string
  icon?: string
  variant?: 'primary' | 'ghost' | 'icon'
}
export interface PinCardChip {
  label: string
  icon?: string
}
export interface PinCardRow {
  badge?: string
  label: string
  meta?: string
  /** 有 href 时整行渲染成可点的 <a>（电话入口等），最小点击高度 44px */
  href?: string
}
export interface PinCardEta {
  value: string
  caption: string
  /** 0–1，缺省不画进度条 */
  progress?: number
  from?: string
  to?: string
}

const props = withDefaults(defineProps<{
  open: boolean
  anchor: { x: number, y: number } | null
  kind?: string
  tone?: 'place' | 'gate' | 'cluster' | 'bus' | 'transit'
  icon?: string
  title: string
  subtitle?: string
  chips?: PinCardChip[]
  rows?: PinCardRow[]
  eta?: PinCardEta | null
  actions?: PinCardAction[]
  meta?: string
  metaAction?: string
  /** 没有真实图钉可指时（平面图编号地点）不画箭头 */
  arrow?: boolean
  /** WebGL 折射可用时走折射态（半透明、去 backdrop-filter），否则回落表面态 */
  glass?: boolean
}>(), {
  kind: 'poi',
  tone: 'place',
  icon: '',
  subtitle: '',
  chips: () => [],
  rows: () => [],
  eta: null,
  actions: () => [],
  meta: '',
  metaAction: '',
  arrow: true,
  glass: false
})

const emit = defineEmits<{
  (e: 'action', key: string): void
  (e: 'close'): void
}>()

const popEl = ref<HTMLDivElement | null>(null)
const bodyEl = ref<HTMLElement | null>(null)
/**
 * 内容是否溢出：只用来给卡片挂一个布尔属性（决定要不要画上下渐隐）。
 * 判定交给 ResizeObserver，不在渲染里量高度，避免水合与 resize 抖动。
 */
const overflow = ref(false)
const titleId = useId()

/**
 * 两条能力检测：CSS 锚定定位（Chrome 125 / Safari 26 起）与原生 popover（Chrome 114 / Safari 17 起）。
 * 缺锚定时 `position-area` 整条失效，复位过 `inset` 的卡片会落到静态位置（容器左上角）；
 * 缺 popover 时 `showPopover` 不存在，直接调用会抛 TypeError，而 `[popover]` 在旧内核里也不隐藏。
 * 任一条缺失都退到「fixed 定位 + 自己管显隐」，定位由 pinAnchor 与卡片实测高度算。
 */
const ANCHOR_POSITIONING_SUPPORTED = typeof CSS !== 'undefined'
  && typeof CSS.supports === 'function'
  && CSS.supports('position-anchor: --pin-anchor')
const NATIVE_POPOVER_SUPPORTED = typeof HTMLElement !== 'undefined'
  && typeof HTMLElement.prototype.showPopover === 'function'
// SSR 与首帧先按「支持」渲染，避免水合前后属性不一致；挂载后按实测纠正。
const supportsAnchor = ref(true)
const supportsPopover = ref(true)
/** 降级路径要自己量卡片尺寸：fixed 定位没有锚点可依赖。 */
const cardBox = ref({ width: 262, height: 160 })

/** 页面的折射画布只认真实 DOM，根元素必须能从这里拿到。 */
defineExpose({ rootElement: popEl })

function syncOverflow(): void {
  const el = bodyEl.value
  if (el) overflow.value = el.scrollHeight - el.clientHeight > 1
  const card = popEl.value
  if (card) {
    const rect = card.getBoundingClientRect()
    // 收起态（display:none / 还没 showPopover）量到 0×0：保留上次尺寸，别把降级位置算成 0 高。
    if (rect.width > 0 && rect.height > 0) cardBox.value = { width: rect.width, height: rect.height }
  }
  if (!supportsAnchor.value) placeFallback()
}

let overflowObserver: ResizeObserver | null = null

onMounted(() => {
  const el = bodyEl.value
  if (el && typeof ResizeObserver !== 'undefined') {
    overflowObserver = new ResizeObserver(syncOverflow)
    overflowObserver.observe(el)
    if (el.firstElementChild) overflowObserver.observe(el.firstElementChild)
    if (popEl.value) overflowObserver.observe(popEl.value)
  }
  syncOverflow()
})

onBeforeUnmount(() => {
  overflowObserver?.disconnect()
  overflowObserver = null
})

const hostStyle = computed(() => {
  const point = props.anchor
  if (!point) return { display: 'none' }
  return {
    display: 'block',
    transform: 'translate3d(' + Math.round(point.x) + 'px, ' + Math.round(point.y) + 'px, 0)'
  }
})

const progressStyle = computed(() => {
  const ratio = props.eta?.progress
  if (typeof ratio !== 'number') return undefined
  return { width: Math.max(4, Math.min(100, Math.round(ratio * 100))) + '%' }
})

/**
 * 箭头跟随锚点：卡片被 position-try-fallbacks（flip / shift-inline）挪位后，
 * 50% 不再是锚点所在列，所以把「锚点 x − 卡片 left」写进 --pin-arrow-x，
 * 并夹在 18px 内边距里，避免箭头贴到圆角外的直角边上。
 */
const ARROW_INSET = 18
/**
 * Chromium 目前不支持 position-try-fallbacks 的 shift-inline，锚点贴边时卡片会整块溢出屏幕。
 * 这里只兜「不许溢出视口」这一条（0 内缩）：多留内边距会把锚点推出箭头可夹取的范围，
 * 反而让箭头偏离锚点。
 */
const VIEWPORT_INSET = 0

/**
 * 已经写进卡片的横向修正。getBoundingClientRect() 会把 translate 算进矩形，
 * 所以要扣掉它再算绝对修正；否则 syncOpen() 连续两帧里第二帧看到「没有溢出」就把修正清掉，
 * reduced-motion（没有过渡兜底）下卡片会跳回屏外。
 */
let appliedShift = 0

/** 卡片此刻是否真的可见：popover 支持时看 `:popover-open`，降级时看 hidden 属性。 */
function isShown(): boolean {
  const el = popEl.value
  if (!el) return false
  if (supportsPopover.value) return el.matches(':popover-open')
  return !el.hidden
}

/**
 * 无锚定定位时的落位：fixed + 用 pinAnchor 与卡片实测尺寸算 left/top。
 * 优先放在锚点上方（留 10px），上方放不下就翻到下方；左右夹在视口 12px 内。
 */
function placeFallback(): void {
  const el = popEl.value
  const anchor = props.anchor
  if (!el || !anchor) return
  const EDGE = 12
  const GAP = 10
  const viewportWidth = window.innerWidth || 360
  const viewportHeight = window.innerHeight || 640
  const width = Math.min(cardBox.value.width, viewportWidth - EDGE * 2)
  const height = cardBox.value.height
  const maxLeft = Math.max(EDGE, viewportWidth - EDGE - width)
  const left = Math.round(Math.min(Math.max(anchor.x - width / 2, EDGE), maxLeft))
  const above = anchor.y - GAP - height
  const flipped = above < EDGE
  const top = flipped
    ? Math.min(anchor.y + GAP, Math.max(EDGE, viewportHeight - EDGE - height))
    : above
  el.style.left = left + 'px'
  el.style.top = Math.max(EDGE, Math.round(top)) + 'px'
  el.toggleAttribute('data-flipped', flipped)
  const arrowLimit = Math.max(ARROW_INSET, width - ARROW_INSET)
  const arrowX = Math.min(Math.max(anchor.x - left, ARROW_INSET), arrowLimit)
  el.style.setProperty('--pin-arrow-x', Math.round(arrowX) + 'px')
}

/** 定位入口：浏览器支持锚定就交给 CSS，不支持就自己算。 */
function layout(): void {
  if (!supportsAnchor.value) {
    placeFallback()
    return
  }
  alignArrow()
}

function alignArrow(): void {
  const el = popEl.value
  const anchor = props.anchor
  if (!el || !anchor) return
  if (!supportsAnchor.value || !isShown()) return
  const rect = el.getBoundingClientRect()
  if (rect.width === 0) return
  const baseLeft = rect.left - appliedShift
  const baseRight = rect.right - appliedShift
  const overflowRight = baseRight - (window.innerWidth - VIEWPORT_INSET)
  const overflowLeft = VIEWPORT_INSET - baseLeft
  const shift = overflowRight > 0
    ? -Math.round(overflowRight)
    : (overflowLeft > 0 ? Math.round(overflowLeft) : 0)
  // 本来就放得下时必须回到零修正，不能把上次的位移留在卡片上。
  if (shift !== appliedShift) {
    appliedShift = shift
    if (shift === 0) {
      el.style.translate = ''
    } else {
      // 纠偏不是动效：临时摘掉 translate 过渡再写位移，写完下一帧交还 CSS。
      el.style.transitionProperty = 'opacity'
      el.style.translate = shift + 'px 0'
      requestAnimationFrame(() => {
        if (popEl.value === el) el.style.transitionProperty = ''
      })
    }
  }
  // 卡片落到锚点下方即视为 flip-block（替代 lightningcss 不支持的 anchored() 容器查询）
  el.toggleAttribute('data-flipped', rect.top > anchor.y)

  const offset = anchor.x - (baseLeft + appliedShift)
  const limit = Math.max(0, rect.width / 2 - 8)
  const clamped = Math.min(Math.max(offset, Math.min(ARROW_INSET, limit)), rect.width - Math.min(ARROW_INSET, limit))
  el.style.setProperty('--pin-arrow-x', Math.round(clamped) + 'px')
}

function syncOpen(): void {
  const el = popEl.value
  if (!el) return
  const wantOpen = props.open && Boolean(props.anchor)
  // 没有原生 popover 时不碰 showPopover/hidePopover：显隐由模板上的 hidden 绑定接管。
  if (supportsPopover.value) {
    const visible = el.matches(':popover-open')
    if (wantOpen && !visible) el.showPopover()
    else if (!wantOpen && visible) el.hidePopover()
  }
  if (wantOpen) {
    requestAnimationFrame(() => {
      layout()
      requestAnimationFrame(layout)
    })
  }
}

function onViewportResize(): void {
  layout()
}

watch(() => [props.open, props.anchor] as const, () => nextTick(syncOpen), { deep: true })
onMounted(() => {
  // 能力检测放在挂载后：首帧按「支持」渲染保住水合一致性，随后按真实能力决定走哪条定位/显隐路径。
  supportsAnchor.value = ANCHOR_POSITIONING_SUPPORTED
  supportsPopover.value = NATIVE_POPOVER_SUPPORTED
  nextTick(syncOpen)
  window.addEventListener('resize', onViewportResize)
  window.addEventListener('scroll', onViewportResize, true)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', onViewportResize)
  window.removeEventListener('scroll', onViewportResize, true)
})

function onToggle(event: Event): void {
  const open = (event as ToggleEvent).newState === 'open'
  if (!open) emit('close')
}
</script>

<template>
  <!-- 锚点宿主：0 尺寸、不吃事件，只提供 anchor-name -->
  <div
    class="pin-anchor-host"
    :style="hostStyle"
    aria-hidden="true"
  />
  <div
    ref="popEl"
    :popover="supportsPopover ? 'auto' : undefined"
    :hidden="!supportsPopover && !open"
    role="dialog"
    :aria-labelledby="titleId"
    class="pin-popover"
    :class="glass ? 'map-glass-refracting' : 'map-glass-surface'"
    :data-kind="kind"
    :data-tone="tone"
    :data-placement="supportsAnchor ? 'anchor' : 'fallback'"
    :data-overflow="overflow ? 'true' : 'false'"
    @toggle="onToggle"
  >
    <span
      v-if="arrow"
      class="pin-popover__arrow"
      aria-hidden="true"
    />
    <button
      type="button"
      class="pin-popover__close"
      aria-label="关闭点位浮窗"
      @click="emit('close')"
    >
      <UIcon
        name="i-lucide-x"
        class="size-3.5"
        aria-hidden="true"
      />
    </button>

    <div
      ref="bodyEl"
      class="pin-popover__body"
    >
      <div class="pin-popover__head">
        <span
          v-if="icon"
          class="pin-popover__icon"
          aria-hidden="true"
        >
          <UIcon
            :name="icon"
            class="size-4"
          />
        </span>
        <div class="pin-popover__headtext">
          <p
            :id="titleId"
            class="pin-popover__title"
          >
            {{ title }}
          </p>
          <p
            v-if="subtitle"
            class="pin-popover__sub"
          >
            {{ subtitle }}
          </p>
        </div>
      </div>

      <div
        v-if="rows.length"
        class="pin-popover__rows"
        role="list"
      >
        <component
          :is="row.href ? 'a' : 'div'"
          v-for="(row, index) in rows"
          :key="index"
          :href="row.href"
          role="listitem"
          class="pin-popover__row"
          :class="row.href ? 'pin-popover__row--link min-h-11' : ''"
        >
          <span
            v-if="row.badge"
            class="pin-popover__rowbadge"
          >{{ row.badge }}</span>
          <span class="pin-popover__rowlabel">{{ row.label }}</span>
          <span
            v-if="row.meta"
            class="pin-popover__rowmeta"
          >{{ row.meta }}</span>
        </component>
      </div>

      <div
        v-if="eta"
        class="pin-popover__eta"
      >
        <p class="pin-popover__etavalue">
          {{ eta.value }}
          <span class="pin-popover__etacaption">{{ eta.caption }}</span>
        </p>
        <div
          v-if="eta.progress !== undefined"
          class="pin-popover__bar"
        >
          <span
            class="pin-popover__barfill"
            :style="progressStyle"
          />
        </div>
        <div
          v-if="eta.from || eta.to"
          class="pin-popover__ends"
        >
          <span>{{ eta.from }}</span>
          <span>{{ eta.to }}</span>
        </div>
      </div>

      <ul
        v-if="chips.length"
        class="pin-popover__chips"
      >
        <li
          v-for="chip in chips"
          :key="chip.label"
          class="pin-popover__chip"
        >
          <UIcon
            v-if="chip.icon"
            :name="chip.icon"
            class="size-3"
            aria-hidden="true"
          />
          {{ chip.label }}
        </li>
      </ul>

      <div
        v-if="actions.length || meta"
        class="pin-popover__actions"
      >
        <button
          v-for="action in actions"
          :key="action.key"
          type="button"
          class="pin-popover__action"
          :class="{
            'pin-popover__action--primary': action.variant !== 'ghost' && action.variant !== 'icon',
            'pin-popover__action--icon': action.variant === 'icon'
          }"
          @click="emit('action', action.key)"
        >
          <UIcon
            v-if="action.icon"
            :name="action.icon"
            class="size-3.5"
            aria-hidden="true"
          />
          <span v-if="action.label">{{ action.label }}</span>
        </button>
        <button
          v-if="meta && metaAction"
          type="button"
          class="pin-popover__meta pin-popover__meta--action"
          @click="emit('action', metaAction)"
        >
          {{ meta }}
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3"
            aria-hidden="true"
          />
        </button>
        <span
          v-else-if="meta"
          class="pin-popover__meta"
        >{{ meta }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pin-anchor-host {
  position: absolute;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
  pointer-events: none;
  anchor-name: --pin-anchor;
}

/* 原生 popover 的 UA 样式带 inset:0 / margin:auto，会与锚定定位冲突（顶部会被夹住），按指南复位 */
.pin-popover {
  inset: auto;
  position-anchor: --pin-anchor;
  position-area: block-start;
  /* Chromium 未实现 shift-inline，整条声明会被丢弃；写成级联，支持的浏览器取最后一条 */
  position-try-fallbacks: flip-block;
  position-try-fallbacks: flip-block, flip-inline;
  position-try-fallbacks: flip-block, shift-inline;
  margin: 10px 0;
  width: 262px;
  max-width: calc(100vw - 24px);
  border-radius: 14px;
  border: 1px solid var(--color-zinc-200, #e4e4e7);
  background: var(--surface);
  padding: 10px 12px 11px;
  box-shadow: 0 12px 26px rgb(15 23 42 / 0.16), 0 2px 6px rgb(15 23 42 / 0.08);
  color: var(--color-zinc-900, #18181b);
  font-size: 12px;
  line-height: 1.35;
  container-type: anchored;
  /* 45° 箭头要伸出卡沿，所以外层永远不裁；滚动交给内层 body */
  overflow: visible;
  --pin-glass-tint: var(--surface);
  --pin-accent: var(--color-green-700, #15803d);
  --pin-accent-soft: color-mix(in srgb, var(--pin-accent) 14%, var(--surface));
}

/*
 * 降级定位：没有 CSS 锚定定位的浏览器（iOS 26 / Chrome 125 之前）走这一条。
 * 位置由 placeFallback() 按 pinAnchor 与卡片实测尺寸写成 inline left/top；
 * 这里只负责把 popover 的 UA 默认定位（fixed + inset:0 + margin:auto）清干净。
 */
.pin-popover[data-placement='fallback'] {
  position: fixed;
  inset: auto;
  margin: 0;
}

/*
 * 内容区：高度跟内容走（不设 min-height），只有真的放不下才滚；
 * 上限用视口算，半屏 sheet 展开时也不会顶到顶栏。
 * guide: scrollability-affordance-hints —— 滚动容器自己画渐隐提示，不塞额外装饰。
 */
.pin-popover__body {
  max-height: min(60dvh, calc(100dvh - var(--pin-card-safe, 180px)));
  overflow-y: auto;
  /* 一滑别把地图滚走 */
  overscroll-behavior: contain;
  /* 卡片只有 262 宽，原生滚动条太扎眼：藏条不藏滚动手感 */
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.pin-popover__body::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}

/* 只有内容真的溢出时才画上下渐隐（布尔属性由 ResizeObserver 维护） */
.pin-popover[data-overflow='true'] .pin-popover__body {
  mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 14px), transparent 100%);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 12px, #000 calc(100% - 14px), transparent 100%);
}

/*
 * D3 玻璃态：折射画布在地图 z-18、浮窗在 top layer，卡片必须半透明才看得见被弯折的底图。
 * 折射可用时去掉 backdrop-filter；不可用时回落表面态（保留 blur）。
 */
.pin-popover.map-glass-refracting {
  background: color-mix(in srgb, var(--pin-glass-tint) 66%, transparent);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.pin-popover.map-glass-surface {
  background: color-mix(in srgb, var(--pin-glass-tint) 88%, transparent);
  backdrop-filter: blur(14px) saturate(1.05);
  -webkit-backdrop-filter: blur(14px) saturate(1.05);
}

.pin-popover[data-tone='cluster'] {
  --pin-accent: var(--color-zinc-900, #18181b);
}

.pin-popover[data-tone='bus'] {
  --pin-accent: var(--bus-accent);
  --pin-accent-soft: var(--bus-accent-soft);
}

.pin-popover[data-tone='transit'] {
  --pin-accent: #1a6cf5;
  --pin-accent-soft: color-mix(in srgb, #1a6cf5 14%, var(--surface));
}

.pin-popover__arrow {
  position: absolute;
  /* 卡片被 flip / shift-inline 挪位后，箭头必须回到锚点所在列（--pin-arrow-x 由脚本按 anchor.x − 卡片 left 写入并夹取） */
  inset-inline-start: var(--pin-arrow-x, 50%);
  inset-block-end: -5px;
  translate: -50% 0;
  width: 10px;
  height: 10px;
  rotate: 45deg;
  border-inline-end: 1px solid var(--color-zinc-200, #e4e4e7);
  border-block-end: 1px solid var(--color-zinc-200, #e4e4e7);
  background: inherit;
}

/* 翻到下方时箭头换到上沿。lightningcss 1.33 解析不了 anchored() 容器查询（会直接打断生产构建），改由 alignArrow 写 data-flipped */
.pin-popover[data-flipped] .pin-popover__arrow {
  inset-block-end: auto;
  inset-block-start: -5px;
  border-inline-end: 0;
  border-block-end: 0;
  border-inline-start: 1px solid var(--color-zinc-200, #e4e4e7);
  border-block-start: 1px solid var(--color-zinc-200, #e4e4e7);
}

.pin-popover__close {
  position: absolute;
  inset-block-start: 7px;
  inset-inline-end: 8px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--color-zinc-400, #a1a1aa);
  cursor: pointer;
}

.pin-popover__close:active {
  background: var(--color-zinc-100, #f4f4f5);
}

.pin-popover__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-inline-end: 22px;
}

.pin-popover__icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: var(--pin-accent-soft);
  color: var(--pin-accent);
}

.pin-popover__headtext {
  min-width: 0;
}

.pin-popover__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.pin-popover__sub {
  margin-block-start: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: var(--color-zinc-500, #71717a);
}

.pin-popover__rows {
  margin: 8px 0 0;
  padding: 2px 0;
  list-style: none;
  border-radius: 10px;
  background: var(--color-zinc-100, #f4f4f5);
}

.pin-popover__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  font-size: 11.5px;
}

.pin-popover__row + .pin-popover__row {
  border-block-start: 1px solid var(--surface);
}

/* 电话这类可点行：整行命中区 ≥44px，颜色不外跳到浏览器默认蓝 */
.pin-popover__row--link {
  color: inherit;
  text-decoration: none;
  min-height: 44px;
  border-radius: 8px;
}

.pin-popover__row--link:active {
  background: var(--surface);
}

.pin-popover__row--link .pin-popover__rowlabel {
  color: var(--pin-accent, var(--color-zinc-800, #27272a));
  font-weight: 600;
}

.pin-popover__rowbadge {
  flex: none;
  border-radius: 5px;
  background: var(--surface);
  padding: 1px 5px;
  font-size: 10px;
  font-weight: 600;
  color: var(--color-zinc-600, #52525b);
}

.pin-popover__rowlabel {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-zinc-800, #27272a);
}

.pin-popover__rowmeta {
  margin-inline-start: auto;
  flex: none;
  font-size: 11px;
  color: var(--color-zinc-500, #71717a);
}

.pin-popover__eta {
  margin-block-start: 8px;
}

.pin-popover__etavalue {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-zinc-900, #18181b);
}

.pin-popover__etacaption {
  margin-inline-start: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-zinc-500, #71717a);
}

.pin-popover__bar {
  position: relative;
  margin-block-start: 6px;
  height: 3px;
  border-radius: 999px;
  background: var(--color-zinc-200, #e4e4e7);
}

.pin-popover__barfill {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  border-radius: 999px;
  background: var(--pin-accent);
}

.pin-popover__barfill::after {
  content: '';
  position: absolute;
  inset-block-start: 50%;
  inset-inline-end: -3px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--pin-accent);
  translate: 0 -50%;
}

.pin-popover__ends {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-block-start: 4px;
  font-size: 10px;
  color: var(--color-zinc-400, #a1a1aa);
}

.pin-popover__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}

.pin-popover__chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-radius: 999px;
  background: var(--color-zinc-100, #f4f4f5);
  padding: 2px 7px;
  font-size: 10.5px;
  color: var(--color-zinc-600, #52525b);
}

.pin-popover__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-block-start: 9px;
}

.pin-popover__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid var(--color-zinc-200, #e4e4e7);
  padding: 0 11px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--color-zinc-700, #3f3f46);
  background: transparent;
  cursor: pointer;
}

.pin-popover__action--primary {
  flex: 1 1 auto;
  border-color: transparent;
  background: var(--pin-accent);
  color: var(--surface);
}

.pin-popover[data-tone='bus'] .pin-popover__action--primary {
  color: var(--bus-accent-ink);
}

.pin-popover__action--icon {
  flex: none;
  width: 32px;
  padding: 0;
  background: var(--color-zinc-100, #f4f4f5);
  border-color: transparent;
  color: var(--color-zinc-700, #3f3f46);
}

.pin-popover__action:active {
  filter: brightness(0.96);
}

.pin-popover__meta {
  margin-inline-start: auto;
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 1px;
  border: 0;
  background: transparent;
  padding: 0;
  font-size: 10.5px;
  color: var(--color-zinc-500, #71717a);
}

.pin-popover__meta--action {
  cursor: pointer;
}

@media (prefers-reduced-motion: no-preference) {
  .pin-popover {
    transition: opacity 140ms ease, translate 140ms ease;
  }

  @starting-style {
    .pin-popover:popover-open {
      opacity: 0;
      translate: 0 4px;
    }
  }
}

:global(.dark .pin-popover) {
  background: var(--color-zinc-900, #1c1c1f);
  border-color: var(--color-zinc-700, #3f3f46);
  color: var(--color-zinc-50, #fafafa);
  --pin-glass-tint: var(--color-zinc-900, #1c1c1f);
}

:global(.dark .pin-popover[data-tone='place']),
:global(.dark .pin-popover[data-tone='gate']) {
  --pin-accent: var(--color-green-400, #4ade80);
  --pin-accent-soft: color-mix(in srgb, var(--pin-accent) 18%, var(--surface));
}

:global(.dark .pin-popover[data-tone='cluster']) {
  --pin-accent: var(--color-zinc-100, #f4f4f5);
}

:global(.dark .pin-popover[data-tone='transit']) {
  --pin-accent: #4d8dff;
}

:global(.dark .pin-popover__sub),
:global(.dark .pin-popover__rowmeta),
:global(.dark .pin-popover__etacaption),
:global(.dark .pin-popover__meta) {
  color: var(--color-zinc-400, #a1a1aa);
}

/* ETA 数字是卡片里最该先读到的信息：暗色卡底就是 zinc-900，必须换成亮前景。 */
:global(.dark .pin-popover__etavalue) {
  color: var(--color-zinc-50, #fafafa);
}

:global(.dark .pin-popover__rows) {
  background: var(--color-zinc-800, #27272a);
}

:global(.dark .pin-popover__row + .pin-popover__row) {
  border-block-start-color: var(--color-zinc-900, #1c1c1f);
}

:global(.dark .pin-popover__rowbadge) {
  background: var(--color-zinc-700, #3f3f46);
  color: var(--color-zinc-100, #f4f4f5);
}

:global(.dark .pin-popover__rowlabel) {
  color: var(--color-zinc-100, #f4f4f5);
}

:global(.dark .pin-popover__bar) {
  background: var(--color-zinc-700, #3f3f46);
}

:global(.dark .pin-popover__chip) {
  background: var(--color-zinc-800, #27272a);
  color: var(--color-zinc-300, #d4d4d8);
}

:global(.dark .pin-popover__action) {
  border-color: var(--color-zinc-700, #3f3f46);
  color: var(--color-zinc-200, #e4e4e7);
}

:global(.dark .pin-popover__action--icon) {
  background: var(--color-zinc-800, #27272a);
  border-color: transparent;
}

/* 深色：主按钮浅底深字，保证对比度 */
:global(.dark .pin-popover__action--primary) {
  background: var(--color-zinc-100, #f4f4f5);
  color: var(--color-zinc-900, #18181b);
}

:global(.dark .pin-popover__close:active) {
  background: var(--color-zinc-800, #27272a);
}
</style>
