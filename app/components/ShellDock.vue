<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

/**
 * 全局底部 dock（T-033）。
 *
 * 两态互斥：
 * - `.shell-dock`（默认，N 态）—— 其他页的 52px 悬浮胶囊；
 * - `.shell-dock--map`（M 态）—— /map 的 100px 合成块（搜索行 36 + gap 4 + 导航行 52 + 上下 padding 4，R2 由 114 收窄）。
 *
 * 这里只做渲染与动效：搜索词、面板状态由页面写进共享 state，组件只读与派命令。
 * T-033 R4：dock 不再接 WebGL 折射（固定层采样对不上底图，会画出深灰带），上沿观感交给 95% 表面。
 * 几何/动效时长全部照 tasks/T-033-dock-slim/spec.md §2 §3，改之前先看 spec。
 */

interface ShellDockItem {
  to: string
  key: string
  label: string
  icon: string
}

const props = defineProps<{
  items: ShellDockItem[]
  activeKey?: string | null
}>()

const route = useRoute()

const isMapDock = computed(() => route.path === '/map' || route.path.startsWith('/map/'))

/** 面板三态：collapsed / half / expanded，由 /map 页面写。 */
const sheetState = useState<'collapsed' | 'half' | 'expanded'>('shell-dock-sheet', () => 'collapsed')
/**
 * T-033 R3：水合门。SSR 与客户端首帧必须同态 —— 页面在 setup 里写入的 sheetState（half/expanded）
 * 只在水合完成后才反映到 class 上，否则 Vue 报 Hydration class mismatch。
 */
const dockHydrated = ref(false)
const dockSheetState = computed<'collapsed' | 'half' | 'expanded'>(() =>
  dockHydrated.value ? sheetState.value : 'collapsed'
)

/** 合成块搜索行的词，页面 watch 它去驱动真正的搜索。 */
const searchQuery = useState<string>('shell-dock-search', () => '')
/** 实时定位的两个只读态：/map 页面写，dock 只按它渲染按钮外观（不持逻辑）。 */
const dockTracking = useState<boolean>('shell-dock-tracking', () => false)
const dockLocating = useState<boolean>('shell-dock-locating', () => false)
/** 派给页面的命令（点搜索条抬面板）：seq 递增即触发一次。 */
const dockCommand = useState<{ kind: 'idle' | 'raise-sheet' | 'locate', seq: number }>(
  'shell-dock-command',
  () => ({ kind: 'idle', seq: 0 })
)

/** 离开地图页的那 260ms 用 exit 的时长表，过后清掉，避免下一次进页面还带着旧曲线。 */
const dockPhase = ref<'idle' | 'exit'>('idle')
let phaseTimer: ReturnType<typeof setTimeout> | null = null

watch(isMapDock, (nowMap, wasMap) => {
  if (phaseTimer) {
    clearTimeout(phaseTimer)
    phaseTimer = null
  }
  if (wasMap && !nowMap) {
    dockPhase.value = 'exit'
    phaseTimer = setTimeout(() => {
      dockPhase.value = 'idle'
      phaseTimer = null
    }, 260)
    return
  }
  dockPhase.value = 'idle'
})

onBeforeUnmount(() => {
  if (phaseTimer) clearTimeout(phaseTimer)
})

const rootClass = computed(() => [
  isMapDock.value ? 'shell-dock--map' : 'shell-dock',
  dockPhase.value === 'exit' ? 'shell-dock--exit' : '',
  isMapDock.value ? `shell-dock--sheet-${dockSheetState.value}` : ''
])

/** T-033 R8（CR-3）：面板展开时 dock 视觉上消失，键盘焦点也必须离开 —— 否则 Tab 会走进看不见的按钮。 */
const dockInert = computed(() => isMapDock.value && dockSheetState.value === 'expanded')

watch(dockInert, (inert) => {
  if (!inert || typeof document === 'undefined') return
  const el = document.activeElement
  if (el instanceof HTMLElement && el.closest('.shell-dock-root')) el.blur()
})

function raiseSheet(): void {
  dockCommand.value = { kind: 'raise-sheet', seq: dockCommand.value.seq + 1 }
}

/** T-033 R2：搜索行定位钮只发命令；真正的 locateUser / toggleTracking 由 /map 页面执行。 */
function requestLocate(): void {
  dockCommand.value = { kind: 'locate', seq: dockCommand.value.seq + 1 }
}

const searchIsComposing = ref(false)

/** T-033 R8（CR-2）：拼音组词期间 input.value 只是中间拼音，不能发布给页面，否则地图侧边筛边闪。 */
function onSearchCompositionStart(): void {
  searchIsComposing.value = true
}

function onSearchCompositionEnd(event: Event): void {
  searchIsComposing.value = false
  onSearchInput(event)
}

function onSearchInput(event: Event): void {
  if (searchIsComposing.value) return
  searchQuery.value = (event.target as HTMLInputElement).value
}

function clearSearch(): void {
  searchQuery.value = ''
  searchIsComposing.value = false
}

/** T-033：/map 合成块比胶囊多出 62px（114 - 52），页面里的浮动元素据此让开底栏；其他页 0。 */
function syncDockExtra(): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--mobile-dock-extra', isMapDock.value ? '3.875rem' : '0rem')
}

onMounted(syncDockExtra)
watch(isMapDock, syncDockExtra)
onBeforeUnmount(() => {
  document.documentElement.style.removeProperty('--mobile-dock-extra')
})

onMounted(() => {
  dockHydrated.value = true
})
</script>

<template>
  <nav
    class="shell-dock-root md:hidden"
    :inert="dockInert"
    :aria-hidden="dockInert ? 'true' : undefined"
    :class="rootClass"
  >
    <div class="shell-dock-body">
      <div
        v-if="isMapDock"
        class="shell-dock-search"
      >
        <div
          class="shell-search"
          role="search"
        >
          <UIcon
            name="i-lucide-search"
            class="size-[18px] shrink-0 text-zinc-500 dark:text-zinc-400"
          />
          <input
            :value="searchQuery"
            type="search"
            enterkeyhint="search"
            class="min-w-0 flex-1 appearance-none bg-transparent text-[15px] text-zinc-900 outline-none placeholder:text-zinc-500 dark:text-zinc-100 dark:placeholder:text-zinc-400"
            placeholder="搜索地点或附近商家"
            aria-label="搜索地点"
            @input="onSearchInput"
            @compositionstart="onSearchCompositionStart"
            @compositionend="onSearchCompositionEnd"
            @focus="raiseSheet"
          >
          <button
            v-show="searchQuery"
            type="button"
            class="shell-search-clear"
            aria-label="清空搜索"
            @click="clearSearch"
          >
            <UIcon
              name="i-lucide-x"
              class="size-[14px]"
            />
          </button>
          <button
            type="button"
            class="shell-search-locate"
            :class="dockTracking ? 'shell-search-locate--on' : ''"
            :aria-pressed="dockTracking ? 'true' : 'false'"
            :aria-label="dockTracking ? '停止实时定位' : '开启实时定位'"
            :disabled="dockLocating"
            @click="requestLocate"
          >
            <UIcon
              :name="dockTracking ? 'i-lucide-locate-fixed' : 'i-lucide-locate'"
              class="size-[16px]"
            />
          </button>
          <button
            type="button"
            class="shell-search-arrow"
            aria-label="拉起点位面板"
            @click="raiseSheet"
          >
            <UIcon
              name="i-lucide-chevron-up"
              class="size-[22px]"
            />
          </button>
        </div>
      </div>

      <div class="shell-dock-nav">
        <NuxtLink
          v-for="item in props.items"
          :key="item.to"
          :to="item.to"
          class="shell-dock-slot"
          :class="props.activeKey === item.key ? 'shell-dock-slot--active' : ''"
          :aria-current="props.activeKey === item.key ? 'page' : undefined"
        >
          <span class="shell-dock-icon">
            <UIcon
              :name="item.icon"
              class="size-[22px]"
            />
          </span>
          <span class="shell-dock-label">{{ item.label }}</span>
        </NuxtLink>
      </div>
    </div>
  </nav>
</template>

<style>
/*
 * T-033 §2 几何 / §3 动效。两态互斥，靠 .shell-dock / .shell-dock--map 切换。
 * 导航行零位移：N 态 bottom=inset(10px) + padding 0；M 态 bottom=inset-8px + padding 8px，
 * 两者 bottom+padding 都等于 10px，导航行 52px 高度不变，所以切换时 y 坐标一动不动。
 */
.shell-dock-root {
  position: fixed;
  right: var(--mobile-dock-inline, 0.625rem);
  bottom: calc(var(--mobile-dock-inset, 0.625rem) + env(safe-area-inset-bottom));
  left: var(--mobile-dock-inline, 0.625rem);
  z-index: 40;
  height: var(--mobile-nav-height, 3.25rem);
  padding: 0;
  overflow: hidden;
  border-radius: 20px;
  background: var(--surface);
  box-shadow:
    0 10px 26px rgb(0 0 0 / 14%),
    inset 0 0 0 0.5px color-mix(in srgb, var(--surface) 80%, transparent);
  contain: layout paint;
  transition:
    height 240ms cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 240ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 200ms cubic-bezier(0.24, 1, 0.32, 1),
    opacity 200ms linear;
}

html.dark .shell-dock-root {
  background: var(--surface);
}

.shell-dock-root.shell-dock--map {
  /* 114px = padding 8 + 搜索行 40 + gap 6 + 导航行 52 */
  height: var(--shell-dock-map-height, 6.25rem);
  padding: 0.25rem;
  /* A3：padding 与 bottom 同步减 0.25rem，导航行 y 与 N 态一致（±0.5px）。 */
  bottom: calc(var(--mobile-dock-inset, 0.625rem) - 0.25rem + env(safe-area-inset-bottom));
  border-radius: 24px;
  background: var(--surface);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

html.dark .shell-dock-root.shell-dock--map {
  background: var(--surface);
}

/* B2：离开地图页回落 180ms，延迟 60ms（先让搜索行淡出）。 */
.shell-dock-root.shell-dock--exit {
  transition:
    height 180ms cubic-bezier(0.4, 0, 1, 1) 60ms,
    border-radius 180ms cubic-bezier(0.4, 0, 1, 1) 60ms,
    transform 200ms cubic-bezier(0.24, 1, 0.32, 1),
    opacity 200ms linear;
}

/* C1：面板半屏，块下沉 6px、淡到 0.9。 */
.shell-dock-root.shell-dock--sheet-half {
  transform: translateY(6px);
  /* T-033 R2：半屏时 dock 压在面板之上，半透明会把面板里的橙/蓝块透出来，所以只下沉不淡化。 */
  opacity: 1;
  transition:
    transform 200ms cubic-bezier(0.24, 1, 0.32, 1),
    opacity 200ms linear;
}

/* C2：面板展开，块下沉 12px 并淡出，彻底让位。 */
.shell-dock-root.shell-dock--sheet-expanded {
  transform: translateY(12px);
  opacity: 0;
  pointer-events: none;
  transition:
    transform 220ms cubic-bezier(0.24, 1, 0.32, 1),
    opacity 220ms linear;
}

/* C3：收回，延迟 80ms、260ms 复位。 */
.shell-dock-root.shell-dock--sheet-collapsed {
  transition:
    transform 260ms cubic-bezier(0.24, 1, 0.32, 1) 80ms,
    opacity 260ms cubic-bezier(0.24, 1, 0.32, 1) 80ms;
}

.shell-dock-body {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
}

/* A2 进场：translateY(10px) + opacity 0 + scale(.98)，200ms、延迟 60ms。 */
.shell-dock-search {
  display: flex;
  flex: none;
  height: 2.25rem;
  margin-bottom: 0.25rem;
  opacity: 0;
  transform: translateY(10px) scale(0.98);
  transition:
    opacity 90ms linear,
    transform 90ms linear;
}

.shell-dock--map .shell-dock-search {
  opacity: 1;
  transform: none;
  transition:
    opacity 200ms linear 60ms,
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1) 60ms;
}

.shell-search {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  height: 2.25rem;
  padding: 0 0.375rem 0 0.875rem;
  border-radius: 20px;
  background: rgb(120 120 128 / 12%);
}

.shell-search-arrow,
.shell-search-clear {
  display: grid;
  flex: none;
  place-items: center;
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 999px;
  color: var(--muted-ink, #6f6f6f);
}

.shell-search-arrow {
  width: 1.375rem;
  height: 1.375rem;
}

/* T-033 R2：搜索行里的实时定位钮（32px 圆钮，折叠箭头左边）。tracking 时用品牌底 + --surface 字。 */
.shell-search-locate {
  display: grid;
  flex: none;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 999px;
  color: var(--muted-ink, #6f6f6f);
  transition:
    background-color 160ms linear,
    color 160ms linear;
}

.shell-search-locate:disabled {
  opacity: 0.5;
}

.shell-search-locate--on {
  background: var(--color-green-600);
  color: var(--surface);
}

.shell-dock-nav {
  display: grid;
  flex: none;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  height: var(--mobile-nav-height, 3.25rem);
}

.shell-dock-slot {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.125rem;
  color: var(--muted-ink, #6f6f6f);
}

.shell-dock-label {
  font-size: 10.5px;
  line-height: 1.1;
}

/* T-033 R6（F-41）：选中槽＝实心墨圆 + 图标反白 + 文字视觉隐藏。
   实心墨圆全站唯一＝「当前页」；地图槽未选中改成描边圆，避免同时出现两个黑圆。
   颜色全走 token（--ink / --surface），四套配色 × 明暗都成立，不写死 hex。 */
.shell-dock-icon {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 999px;
  background: transparent;
  transition:
    background-color 180ms cubic-bezier(0.24, 1, 0.32, 1),
    color 180ms cubic-bezier(0.24, 1, 0.32, 1);
}

.shell-dock-slot--active .shell-dock-icon {
  background: var(--ink);
  color: var(--surface);
}

/* T-033 R7（F-42）：五个槽结构完全一致，label 一律常显；
选中项 label 用墨色，未选中用次文色（R7 撤销了 R6 的文字视觉隐藏）。 */
.shell-dock-slot--active .shell-dock-label {
  color: var(--ink);
}

/* T-033 R7（F-42）：地图槽不再有更大的实心/描边特例，五个槽共用 .shell-dock-icon 与同一条选中规则。 */

@media (prefers-reduced-motion: reduce) {
  .shell-dock-root,
  .shell-dock-root .shell-dock-search,
  .shell-dock-root * {
    transition-duration: 0ms !important;
    transition-delay: 0ms !important;
    animation-duration: 0ms !important;
    animation-delay: 0ms !important;
  }
}
</style>
