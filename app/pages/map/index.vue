<script setup lang="ts">
import type { GeoPoint, MapArea, MapPoi } from '~~/map/core/types'
import type {
  MapBaseStyle,
  MapDisplayOptions,
  MapLabelSize,
  MapProvider,
  MapProviderId
} from '~~/map/core/provider'
import { officialSources } from '~~/data/seeds/public-content'
import { haversineMeters } from '~~/shared/utils/bus-route-progress'
import { gcj02ToWgs84 } from '~~/shared/utils/coordinate-convert'
import { safeExternalHref } from '~/utils/safe-external-href'
import { markPanelOriginFromPoint, readTriggerPoint } from '~/utils/panel-origin'
import { parsePublicPhoneContacts } from '~/utils/public-phone-contact'
import type { GlassTarget } from '~/composables/useMapGlassRefraction'
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'
import { amapImportedPlaces } from '~~/data/seeds/amap-imported-places'
import { amapImportedAreas } from '~~/data/seeds/amap-imported-areas'
import type { PublicMapPlace } from '~/utils/public-catalog'
import { mergeAmapImportedPlacesWithDrafts, mergePublicMapPlaces } from '~/utils/public-catalog'
import { mapQueryValue, mapRouteScope } from '~/utils/map-route-state'
import {
  filterOwnerMapPlacesInScope,
  filterPublicMapPlacesByScope,
  formatMapAreaSquareMeters,
  formatMapPerimeter,
  MAP_LOAD_ERROR_MESSAGE,
  canPlanMapWalkingRoute,
  defaultMapDisplayOptions,
  canShowOfficialCampusPlan,
  resolveMapViewModeSwitchDecision,
  resolveAutoSelectSearchDecision,
  resolveAutoSelectSearchApply,
  resolveActivitySheetAnchors,
  resolveBusSheetAnchors,
  resolveBusSheetHeightClass,
  resolveSheetBackAction,
  resolveSheetHistorySync,
  resolveDockClearSheetAction,
  resolvePinReselect,
  resolveSearchQueryChangeReset,
  resolveInitialMapViewMode,
  resolveInitialSelectedMapPoiId,
  resolveMapUnsupportedBaseStyleMessage,
  resolveDockSearchMobileSheetState,
  resolveMobileSheetAnchors,
  resolveMobileSheetHeightClass,
  resolveTransitSheetAnchors,
  resolveTransitSheetHeightClass,
  resolveMobileSheetStateFromHeight,
  toggleMapDisplayOption,
  withMapLabelSize,
  type MapDisplayToggleKey,
  type MapSheetBackAction,
  type MobileSheetState
} from '~~/app/utils/map-presentation'

useSeoMeta({
  title: '校园地图',
  description: '查找教学楼、宿舍、食堂、服务点与校园周边地点。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
// Temporarily keep the official floor-plan data available without exposing a
// public entry point. Re-enable this switch when the plan is ready to return.
const OFFICIAL_PLAN_ENTRY_VISIBLE = false
const initialPlace = mapQueryValue(route.query.place)
const { data: publicPlaceResponse, error: publicPlaceError } = await usePublicPlaceList()
const { data: amapOwnerDraftResponse } = await usePublicAmapOwnerDraftPlaces()
interface MapActivityHotspot {
  placeId: string
  title: string
  startsAt: string
  endsAt: string | null
  /** 该地点的在期活动总数：接口每个地点只给前 6 条，界面上的场次必须用这个真值。 */
  placeTotal: number
}

const { data: activityPlaceResponse } = await useFetch<{
  placeIds: string[]
  hotspots: MapActivityHotspot[]
}>(
  '/api/public/activity-place-markers',
  { key: 'public-activity-place-markers' }
)
const activityPlaceIds = computed(() => new Set(activityPlaceResponse.value?.placeIds ?? []))
const geoCipherKey = __GEO_CIPHER_KEY__
const ownerMapSeeds = computed(() => mergeAmapImportedPlacesWithDrafts(
  amapImportedPlaces,
  amapOwnerDraftResponse.value?.items,
  geoCipherKey
))
const catalogPlaces = computed(() => mergePublicMapPlaces(
  campusMapReferencePlaces,
  publicPlaceResponse.value?.items ?? [],
  ownerMapSeeds.value,
  geoCipherKey
).map(place => activityPlaceIds.value.has(place.id)
  ? { ...place, hasActivities: true }
  : place
))
const places = computed(() => catalogPlaces.value)
const activeScope = computed(() => mapRouteScope(route.query))
const publishedPlacesInScope = computed(() => filterPublicMapPlacesByScope(
  publicPlaceResponse.value?.items ?? [],
  activeScope.value
))
const ownerMapPlacesInScope = computed(() => filterOwnerMapPlacesInScope(
  places.value,
  activeScope.value
))
const initialSelectedPoiId = resolveInitialSelectedMapPoiId(places.value, initialPlace)
const canShowOfficialPlan = computed(() => OFFICIAL_PLAN_ENTRY_VISIBLE
  && canShowOfficialCampusPlan(activeScope.value))
const mapViewMode = ref<'geographic' | 'official-plan'>(
  canShowOfficialPlan.value
    ? resolveInitialMapViewMode({
        activeScope: activeScope.value,
        publishedCount: publishedPlacesInScope.value.length,
        ownerMapCount: ownerMapPlacesInScope.value.length
      })
    : 'geographic'
)
// 手机端一进来先把地点栏收起来：半屏面板会把地图压到两百多像素，
// 楼栋图标全在面板底下，点了当然没反应。收起来后地图全屏可点，列表往上拖就有。
// SSR 拿不到 window，先按桌面给 half；挂载后再在手机端收起（见 onMounted），
// 否则 SSR 出来的半屏会被 hydration 原样保留，地图只剩两百多像素高。
const mobileSheetState = ref<MobileSheetState>(initialSelectedPoiId ? 'collapsed' : 'half')
// 首帧防闪烁：SSR 拿不到 window，mobileSheetState 初值是 half，手机上一进页面
// 面板会先整个展开、等 hydration 完再收起（用户 2026-11-15 截图：地图还在转圈，面板已经张开）。
// 这里用 sheetHydrated 把「挂载前的手机面板」按折叠态渲染，桌面 md+ 不受影响。
const sheetHydrated = ref(false)
const mobileSheetElement = ref<HTMLElement | null>(null)
const mobileSheetDragHeight = ref<number | null>(null)
const mobileSheetDragPointerId = ref<number | null>(null)
const mobileSheetDragStartY = ref(0)
const mobileSheetDragStartHeight = ref(0)
const mobileSheetDragging = ref(false)
/** T-031 B1：本次按下后是否真的移动过（>6px）。没移动就是轻点，折叠条轻点等于抬到半屏。 */
const mobileSheetDragMoved = ref(false)
// 2026-11-23：指针是从手柄（那条 8px 横杠）按下的 —— 轻点它 = 半屏↔展开。
// 只能在这里判，因为 pointerdown 里的 preventDefault 会把随后的 click 吃掉。
const mobileSheetDragFromHandle = ref(false)
/**
 * T-033 R4（F-32）：面板从搜索栏长出来。
 * 离散切换（collapsed → half/expanded）先把面板高度无过渡地钉在 dock 区高度（100 + inset 10 = 110px，
 * 这一刻它整块藏在合成块后面），下一帧再放开走既有 320ms 过渡到 326 / 548。
 * 手指拖拽走 mobileSheetDragHeight 的跟手路径，不经过这里；bus 的 84px 折叠条也不套。
 */
const sheetBlooming = ref(false)
let sheetBloomFrame: number | null = null
let sheetDragEndedAt = 0
/**
 * 2026-11-23（用户 m04135）：面板要「从被点的那个按钮长出来、再缩回那个按钮里」，
 * 所以动效原点必须是真实指针位置 —— 原来固定写 50% calc(100% - 84px) + scale(0.86)，
 * 只有 14% 的缩放差异，读起来是「往底下沉」。只记最后一次可信按下的坐标；
 * 键盘触发 / 程序化点击读不到指针，就回落到面板底边中点。
 */
const sheetMotionAnchor = shallowRef<{ x: number, y: number } | null>(null)
function rememberSheetMotionAnchor(event: PointerEvent): void {
  if (!event.isTrusted) return
  // 2026-11-26（用户 m06364）：锚点不是「最后一次点击的任意位置」，而是那个真正的触发控件。
  // 只认按钮 / 链接这类可点击目标，取它的中心；点空白地图不该改锚点。
  const target = event.target as HTMLElement | null
  const trigger = target?.closest?.('button, [role="button"], a, [data-sheet-anchor]') as HTMLElement | null
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  if (!rect.width && !rect.height) return
  sheetMotionAnchor.value = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  sheetMotionAnchorAt = Date.now()
}
/** 入场时那一刻的锚点：收起必须回到同一个锚点，而不是最后点的那个按钮。 */
const sheetBloomAnchor = shallowRef<{ x: number, y: number } | null>(null)
/** 入场那一刻算出的原点（px）；收起直接复用同一组数值，两相才是同一个点。 */
const sheetBloomOrigin = shallowRef<{ x: number | null, y: number | null, tx: number } | null>(null)
/** 入场那一刻的「视口坐标」：收起时按当时的盒子重新折算，不能直接复用入场时的局部坐标。 */
const sheetBloomPoint = shallowRef<{ x: number, y: number } | null>(null)
/** 指针锚点的时间戳：键盘 / 程序化打开时不能沿用上一次点击的位置。 */
let sheetMotionAnchorAt = 0
/** 动效原点在面板内的坐标（px）；null = 没有指针信息，CSS 回落到 50% / 100%。 */
const sheetOriginX = ref<number | null>(null)
const sheetOriginY = ref<number | null>(null)
const sheetTranslateX = ref(0)
/** 收起那一刻的高度：收起期间把它钉住，height 不再向 0 过渡（否则 bottom 锚定会让顶边下滑 = 「往下沉」）。 */
const sheetCollapseHeight = ref<number | null>(null)
/** 入场缩到 0.62：旧值 0.86 肉眼几乎看不出。CSS 里的 scale(...) 必须与它同值。 */
const SHEET_MOTION_SCALE = 0.74
/** 收起缩到 0.22：入场 0.62 是为了「看着长出来」，回收必须小到像被按钮吸走，否则读成淡出。 */
const SHEET_EXIT_SCALE = 0.12
/** 起点整体往底边压 16px，配合底边 origin，面板才像从底栏那条里钻出来。 */
const SHEET_MOTION_DRIFT_Y = 24
const SHEET_MOTION_SCALE_Y = 0.68
const SHEET_EXIT_SCALE_Y = 0.12
function syncSheetMotionOrigin(anchor?: { x: number, y: number } | null): void {
  const element = mobileSheetElement.value
  if (!element || typeof window === 'undefined') return
  // 布局盒而不是 getBoundingClientRect：收起/入场那一刻面板可能正带着 transform，
  // rect 已经是缩放后的（半屏量出 133px 宽），算出来的原点会偏到面板外面去。
  const parent = element.offsetParent as HTMLElement | null
  const parentRect = parent?.getBoundingClientRect()
  const boxLeft = (parentRect?.left ?? 0) + element.offsetLeft
  const boxTop = (parentRect?.top ?? 0) + element.offsetTop
  const width = element.offsetWidth || Math.max(0, window.innerWidth - 20)
  // 显式传 null（键盘 / 程序化打开）必须清掉旧锚点，只有省略参数时才回落到最近一次指针位置。
  const point = arguments.length > 0 ? anchor : sheetMotionAnchor.value
  if (!point || !width) {
    sheetOriginX.value = null
    sheetOriginY.value = null
    sheetTranslateX.value = 0
    return
  }
  sheetOriginX.value = Math.round(Math.min(Math.max(point.x - boxLeft, 24), width - 24))
  // 纵向同样跟锚点：从底栏箭头长出来，就缩回底边那一带（高度 0 时交给 CSS 的 100%）。
  const height = element.offsetHeight || 0
  // 折叠态里点胶囊开始 bloom 时高度还是 0，早先退成 100% → 纵向永远落底边，收起就成了「往下沉」。
  // 改用目标高度反推面板落地后的上边缘，原点仍是那个按钮的纵向位置。
  const anchors = mobileSheetAnchors()
  const targetHeight = height > 0
    ? height
    : (mobileSheetState.value === 'expanded' ? anchors.expanded : anchors.half)
  const restingTop = boxTop + height - targetHeight
  sheetOriginY.value = Math.round(Math.min(Math.max(point.y - restingTop, 24), Math.max(24, targetHeight - 24)))
  const offset = point.x - (boxLeft + width / 2)
  sheetTranslateX.value = Math.round(Math.max(-22, Math.min(22, offset * 0.18)))
}

function bloomSheetFromDock(): void {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  // 1 秒内的指针锚点才算这次动作的锚点：键盘或程序化打开时清空，回落底边中点。
  const freshAnchor = Date.now() - sheetMotionAnchorAt < 1000 ? sheetMotionAnchor.value : null
  sheetBloomAnchor.value = freshAnchor
  sheetBloomPoint.value = freshAnchor
  syncSheetMotionOrigin(freshAnchor)
  sheetBloomOrigin.value = { x: sheetOriginX.value, y: sheetOriginY.value, tx: sheetTranslateX.value }
  if (sheetBloomFrame !== null) window.cancelAnimationFrame(sheetBloomFrame)
  sheetBlooming.value = true
  sheetBloomFrame = window.requestAnimationFrame(() => {
    // 先把目标高度提交成一次布局并画出去，下一帧再放开高度过渡。
    void mobileSheetElement.value?.offsetHeight
    sheetBloomFrame = window.requestAnimationFrame(() => {
      sheetBloomFrame = null
      sheetBlooming.value = false
    })
  })
}

// 只有「折叠 → 非折叠」的离散切换才 bloom：拖拽松手带时间戳跳过；叮叮车也走这条路（从搜索条长出来）。
watch(mobileSheetState, (state, previous) => {
  if (!sheetHydrated.value) return
  if (previous !== 'collapsed' || state === 'collapsed') return
  if (Date.now() - sheetDragEndedAt < 240) return
  bloomSheetFromDock()
})

/**
 * 2026-11-26（用户 m06190）：收起要「缩进右下角那枚箭头」，动效全部交给 CSS ——
 * 单相 transition（transform + opacity + height 同时跑），不再用 rAF 三相位定高。
 */
type SheetCollapsePhase = 'off' | 'on'
const sheetCollapsePhase = ref<SheetCollapsePhase>('off')
/** 2026-11-26：进页面时把初始 half 直接落成 collapsed 不是用户操作，不能播收起动效 ——
 *  否则首帧面板先被钉成 326 再缩没，看起来就是「一进来面板张开又收回去」。 */
const skipInitialSheetCollapse = ref(false)

function collapseSheetToDock(): void {
  if (typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  // R9（F-52）：收起相位只服务手机底栏上的面板；桌面侧栏没有 dock 可收，跑相位会让侧栏闪缩一下。
  if (window.matchMedia?.(PANEL_DESKTOP_MEDIA_QUERY).matches) return
  if (sheetCollapsePhase.value === 'on') return
  // 回到「长出来」的那个锚点：从箭头长出来就缩回箭头，从详情按钮长出来就缩回详情按钮。
  // 入场坐标是「当时盒子里的局部坐标」，半屏→展开后盒子高了 200 多像素就偏了：
  // 用存下来的视口点按当前几何重新折算，旧局部坐标作废。
  if (sheetBloomPoint.value) {
    syncSheetMotionOrigin(sheetBloomPoint.value)
    sheetBloomOrigin.value = null
  }
  const bloomed = sheetBloomOrigin.value
  if (bloomed) {
    sheetOriginX.value = bloomed.x
    sheetOriginY.value = bloomed.y
    sheetTranslateX.value = bloomed.tx
  } else {
    syncSheetMotionOrigin(sheetBloomAnchor.value ?? sheetMotionAnchor.value)
  }
  sheetCollapseHeight.value = mobileSheetElement.value?.offsetHeight || null
  sheetCollapsePhase.value = 'on'
}

// 收起方向同样只在离散切换里播：拖拽松手、bus 视图、水合未完成、reduce 都跳过。
watch(mobileSheetState, (state, previous) => {
  if (!sheetHydrated.value) return
  if (skipInitialSheetCollapse.value) {
    skipInitialSheetCollapse.value = false
    return
  }
  if (state === 'collapsed' && previous !== 'collapsed') {
    if (Date.now() - sheetDragEndedAt < 240) return
    if (mapSheetView.value === 'bus') return
    collapseSheetToDock()
    return
  }
  if (state !== 'collapsed' && sheetCollapsePhase.value !== 'off') {
    sheetCollapsePhase.value = 'off'
  }
})

/** T-031 B3：320ms 高度过渡进行中。过渡期摘掉站列 mask、冻结 ETA 文案，避免每帧重建合成层。 */
const sheetTransitioning = ref(false)
/** T-031 B4：胶囊层 DOM 句柄，逐帧定位器直接写 style，不再走 Vue patch。 */
const busEtaLayerElement = ref<HTMLElement | null>(null)
const sidebarCollapsed = ref(false)
const displaySettingsOpen = ref(false)
// 2026-11-23：面板「从按钮长出来」需要按钮现场几何，所以在打开那一刻把 currentTarget 记下来。
const displaySettingsTriggerPoint = shallowRef<{ x: number, y: number } | null>(null)

function toggleDisplaySettings(event?: MouseEvent): void {
  const nextOpen = !displaySettingsOpen.value
  // 齿轮按钮在面板标题行，面板一开面板就会收起，按钮跟着消失 —— 所以位移原点的坐标必须在这一刻量。
  if (nextOpen && event) displaySettingsTriggerPoint.value = readTriggerPoint(event.currentTarget as Element)
  displaySettingsOpen.value = nextOpen
  if (nextOpen) mobileSheetState.value = 'collapsed'
}

/** 显示设置面板的入场原点 = 刚才那个齿轮按钮。 */
function applyDisplaySettingsOrigin(element: Element): void {
  markPanelOriginFromPoint(element, displaySettingsTriggerPoint.value, { horizontal: true })
}
const mapBaseStyle = ref<MapBaseStyle>('standard')
const mapDisplayOptions = ref<MapDisplayOptions>({ ...defaultMapDisplayOptions })
const mobileSheetHeightClass = computed(() => resolveMobileSheetHeightClass(mobileSheetState.value))
// 半屏固定 326：手机活动视图与普通半屏共用同一个类串，抽成常量避免两条分支各写一份
// （守门会数这个字面量出现次数，必须为 1）。
const SHEET_HALF_326 = 'max-md:!h-[326px]'
// 活动视图的半屏也要跟着展开上限收：横屏这类矮容器里 326 会压过锚点算出的 half/expanded，
// 拖到半屏反而判成展开。上限与 resolveActivitySheetAnchors 的 80px 让位同源。
const SHEET_ACTIVITY_HALF = 'max-md:!h-[min(326px,calc(100%_-_5.75rem))]'
/** 动效原点写进 .map-workspace 的自定义属性，面板与底栏共用同一套坐标。 */
const sheetOriginCss = computed(() => (sheetOriginX.value === null ? '50%' : `${sheetOriginX.value}px`))
const sheetOriginYCss = computed(() => (sheetOriginY.value === null ? '100%' : `${sheetOriginY.value}px`))
const sheetTranslateXCss = computed(() => `${sheetTranslateX.value}px`)
const mobileSheetStyle = computed(() => mobileSheetDragHeight.value === null
  ? undefined
  : {
      height: `${mobileSheetDragHeight.value}px`,
      transition: 'none'
    })

/*
 * T-019：移动端浮动件（校车胶囊 / 浏览数 / 高德 attribution）统一贴在面板上沿之上 12px。
 * 用 ResizeObserver 量面板实际高度，而不是按状态查表——面板高度有 200ms 过渡、还能手指拖，
 * 查表只拿得到终值，胶囊会在动画期间穿进面板里。
 */
const mobileSheetLiveHeightPx = ref(152)
// 2026-11-23：面板改悬浮卡片（离屏底 10px）后，面板上沿同步 +10，浮动带才不会被压住。
const MOBILE_FLOAT_GAP = 10
const mobileDockBottom = computed(() => Math.max(0, Math.round(mobileSheetLiveHeightPx.value + MOBILE_FLOAT_GAP + 12)))
let mobileSheetResizeObserver: ResizeObserver | null = null

const mapElement = ref<HTMLElement | null>(null)
const mapProvider = shallowRef<MapProvider | null>(null)

/*
 * 移动端玻璃折射（T-018 接 useMapGlassRefraction）
 * - 底图 canvas 每帧整张重传，玻璃层按 5 个浮层元素的实时矩形画折射；
 * - 桌面（≥768px）不启用：浮层本身 md:hidden，画布容器也 md:hidden，量到 0×0 就空转不画；
 * - 起不来（无 WebGL2 / 上下文丢失 / iOS PWA）时 ready 一直是 false，
 *   模板回落到 .map-glass-surface 的 backdrop-filter，不报错也不塌；
 * - 开关状态存 localStorage；P-004 notes-E 当时还没落盘，键名在这里自定并写进回执。
 */
// 键名沿用项目既有约定（`yeu-palette` / `yeu-admin-sidebar-collapsed`），不用冒号分段。
const MAP_GLASS_STORAGE_KEY = 'yeu-map-glass-refraction'
const MAP_GLASS_LOW_FPS = 40
const glassLayerElement = ref<HTMLElement | null>(null)
// T-033：搜索入口搬进底部合成块（ShellDock），本页不再持有独立搜索胶囊元素。
const glassChipsElement = ref<HTMLElement | null>(null)
/** 点位浮窗自己也是折射 target：组件暴露根元素，卡不在时 ref 为 null（target 列表自然少一项）。 */
const pinPopoverElement = ref<{ rootElement?: HTMLElement | null } | null>(null)
const glassSourceElement = ref<HTMLElement | null>(null)
const glassEnabled = ref(true)
/** 低帧降级档：1 → 0.4 → 0（0 = 停渲染，回退 CSS blur）。 */
const glassStrengthScale = ref(1)
let glassLowFpsSamples = 0

/**
 * 4 个玻璃目标。参数按 T-018 spec 起步值，用 390×844 截图校对后定稿（见回执）。
 * T-020 起底部面板不再是 target：折射画布在地图 z-18、面板 z-30，面板里 header 与提示行
 * 会被折射出来的楼栋标注顶穿（半屏态实测可读性不达标），面板改用 66% 白纱 + blur(2px)（T-033 R7 已与折射态统一）。
 * 返回空数组等于不渲染，所以关开关 / 降级到 0 都不需要另写停机分支。
 */
function resolveGlassTargets(): GlassTarget[] {
  if (!glassEnabled.value || glassStrengthScale.value <= 0) return []
  const targets: GlassTarget[] = []
  const push = (element: HTMLElement | null, radius: number, strengthMul: number, frost: number, rim = 1, bandEdges: 'all' | 'top' = 'all', radiusPx?: number, band = 0): void => {
    if (element) targets.push({ element, radius, radiusPx, strengthMul: strengthMul * glassStrengthScale.value, frost, rim, bandEdges, band })
  }
  push(glassChipsElement.value, 0.5, 2, 0.25)
  // T-030：面板左右那两条乳白竖带来自边缘 band（0.043 原先是圆角半径，被 band 一起吃了）。
  // radius 收到 0.008，band 交给 bandEdges='top' 只由上边驱动：左右是屏幕边，没有水切面语义。
  // 圆角的裁切在外壳 CSS，rim 仍为 0；顶边高光与折射保留。
  // 2026-11-23 用户「左上角右上角还有白色的亮条」：quad 只按 0.008 比例算圆角（≈2.6px），
  // 比 CSS 的 26px 圆角小一圈，方角就从面板圆弧外露出来变成白色小亮条。按 CSS 圆角实传 26px。
  // frost 归 0：96% 白纱下这层雾化本来也看不见，但它会在面板圆角外缘叠出一圈白亮边。
  push(mobileSheetElement.value, 0.008, 3, 1, 0, 'top', 26, 16)
  // 点位浮窗：圆角 14 CSS px 按短边换算（T-035）。比例 0.055 是按 262 宽度猜的，卡片变高后
  // 折算出的圆角只有 8px，与 CSS 的 14px 不同心，四角露出白月牙。四边都有水切面 → bandEdges='all' + rim 1。
  push(pinPopoverElement.value?.rootElement ?? null, 0.055, 2.2, 0.16, 1, 'all', 14)
  // T-033：搜索胶囊已并入底部合成块，这里不再单独注册 target。
  return targets
}

const {
  attach: attachMapGlass,
  start: startMapGlass,
  stop: stopMapGlass,
  setUploadFrozen: setMapGlassUploadFrozen,
  ready: mapGlassReady,
  fps: mapGlassFps
} = useMapGlassRefraction({
  strength: 36,
  // 底图 canvas 由 provider 建在 mapElement 里（maplibre 的 getCanvas 就是它）；
  // 换 provider 时如果拿不到 canvas，source 返回 null，玻璃层只清屏不画。
  source: () => {
    const canvas = mapElement.value?.querySelector('canvas')
    return canvas instanceof HTMLCanvasElement ? canvas : null
  },
  targets: resolveGlassTargets
})

/** 真折射跑起来了才去掉 DOM 上的 blur；否则一律走兜底。 */
const mapGlassActive = computed(() => glassEnabled.value && mapGlassReady.value && glassStrengthScale.value > 0)

/**
 * 展开/收起这 320ms 里玻璃层一直在画：面板在动，底图没动，所以只冻结底图纹理上传，
 * 四边形照常每帧重算，折射边缘跟着面板走。渲染类始终保持 map-glass-refracting，
 * 不做 90% 白纱 ↔ 66% 玻璃的切换——那一步就是用户看到的「收起时闪一下」。
 */
let glassTransitionTimer: ReturnType<typeof setTimeout> | null = null

function clearGlassTransitionTimer(): void {
  if (glassTransitionTimer === null) return
  clearTimeout(glassTransitionTimer)
  glassTransitionTimer = null
}

function endGlassTransition(): void {
  clearGlassTransitionTimer()
  setMapGlassUploadFrozen(false)
  sheetTransitioning.value = false
}

function beginGlassTransition(): void {
  setMapGlassUploadFrozen(true)
  sheetTransitioning.value = true
  // transitionend 可能被吞掉（快速连点、中途反向拖拽、tab 切走）：
  // 用略长于动画的兜底定时器保证一定能恢复，不让折射卡在暂停态。
  clearGlassTransitionTimer()
  glassTransitionTimer = setTimeout(endGlassTransition, 420)
}

function handleSheetTransitionStart(event: TransitionEvent): void {
  if (event.propertyName !== 'height') return
  beginGlassTransition()
}

function handleSheetTransitionEnd(event: TransitionEvent): void {
  if (event.propertyName !== 'height') return
  endGlassTransition()
}

function readGlassPreference(): boolean {
  try {
    return window.localStorage.getItem(MAP_GLASS_STORAGE_KEY) !== 'off'
  } catch {
    // Safari 隐私模式下 localStorage 会抛：默认开，只是记不住
    return true
  }
}

function persistGlassPreference(): void {
  try {
    window.localStorage.setItem(MAP_GLASS_STORAGE_KEY, glassEnabled.value ? 'on' : 'off')
  } catch {
    // 同上：存不住就算了，本次会话内仍然生效
  }
}

function setGlassRefraction(enabled: boolean): void {
  glassEnabled.value = enabled
}

async function syncMapGlass(): Promise<void> {
  if (!import.meta.client) return
  if (!glassEnabled.value || window.innerWidth >= 768) {
    stopMapGlass()
    sheetCollapsePhase.value = 'off'
    return
  }
  await nextTick()
  const layer = glassLayerElement.value
  if (!layer) return
  try {
    attachMapGlass(layer)
    startMapGlass()
  } catch {
    // 有些 WebGL2 实现（软件渲染、PWA 壳、旧版 iOS）getContext 能过但缺 VAO 等入口，
    // buildPipeline 里会抛。这里兜住：撤掉半成品画布，页面继续用 .map-glass-surface 的
    // backdrop-filter，不弹错误、不影响地图交互。
    layer.replaceChildren()
    stopMapGlass()
  }
}

// fps 连续 3 个 500ms 窗口低于 40 → 强度乘 0.4；再连续 3 个 → 停渲染回退 blur。
// 不自动回升：回升会在边界来回抖，用户看到的是「一会儿有折射一会儿没有」。
watch(mapGlassFps, (value) => {
  if (!mapGlassReady.value || value <= 0) return
  if (value >= MAP_GLASS_LOW_FPS) {
    glassLowFpsSamples = 0
    return
  }
  glassLowFpsSamples += 1
  if (glassLowFpsSamples >= 6) {
    stopMapGlass()
    return
  }
  if (glassLowFpsSamples >= 3 && glassStrengthScale.value > 0.4) glassStrengthScale.value = 0.4
})

watch(glassEnabled, () => {
  persistGlassPreference()
  void syncMapGlass()
})

/** 顶部来源条文案：只报当前真的开着的图层，避免写成固定广告词。 */
function resolveMobileSourceSummary(): string {
  const parts = [activeMapProviderId.value === 'amap' ? '高德' : '参考底图']
  if (transitLinesOpen.value) parts.push('公交')
  if (speedBumpsVisible.value) parts.push('减速带 27')
  return parts.join(' · ')
}

const activeMapProviderId = ref<MapProviderId | null>(null)
const mapStatus = ref<'loading' | 'ready' | 'error'>('loading')
const mapErrorMessage = ref(MAP_LOAD_ERROR_MESSAGE)
const selectedPoiId = ref<string | null>(initialSelectedPoiId)
const selectedArea = ref<MapArea | null>(null)
const selectedNativePlace = ref<PublicMapPlace | null>(null)
const {
  categories,
  categoryIds,
  deepLinkSearchQuery,
  searchQuery,
  activeCategory,
  filteredPois,
  filteredMapPois,
  filteredAreas,
  providerAreas,
  mapDataLabel,
  mapFallbackMessage,
  onSearchQueryInput,
  onSearchCompositionStart,
  onSearchCompositionEnd,
  clearSearchQuery,
  setCategory,
  fitToVisiblePois
} = useMapFilter({
  places,
  activeScope,
  publishedPlacesInScope,
  ownerMapPlacesInScope,
  hasPublicPlaceError: computed(() => Boolean(publicPlaceError.value)),
  selectedPoiId,
  selectedNativePlace,
  selectedArea,
  mapProvider
})
const deepLinkAutoSelectFired = ref(false)

const toast = useToast()
const manualStartPick = ref<{ destinationName: string, destination: MapPoi['point'] } | null>(null)
const manualStartOpen = computed({
  get: () => manualStartPick.value !== null,
  set: (open: boolean) => {
    if (!open) manualStartPick.value = null
  }
})
const routeStepsOpen = ref(false)
/** 手动起点锚点：校门与公交/交通站是最自然的“出发点”。 */
const startAnchors = computed(() => {
  const categories = new Set(['gate', 'transit-stop'])
  return places.value.filter(poi => categories.has(poi.category)).slice(0, 8)
})
const {
  locating,
  routePlanning,
  routeSummary,
  routeSteps,
  routeDestinationName,
  routeSummaryText,
  tracking,
  following,
  remainingSummary,
  userLocation,
  locateUser,
  startLocateDisplay,
  startWalkingRoute,
  startWalkingRouteFrom,
  clearWalkingRoute,
  toggleTracking,
  toggleFollowing
} = useMapGeolocation({
  mapProvider,
  activeMapProviderId,
  notify: notice => toast.add(notice),
  onWalkingRouteLocationFailed: (destinationName, destination) => {
    if (!destination) return
    manualStartPick.value = { destinationName, destination }
  }
})

function openManualStartPicker(): void {
  const place = selectedPoi.value
  if (!place?.point) return
  manualStartPick.value = { destinationName: place.name, destination: place.point }
}

function planFromAnchor(anchorName: string, anchorPoint: MapPoi['point'] | null): void {
  if (!anchorPoint) return
  const pick = manualStartPick.value
  if (!pick) return
  manualStartPick.value = null
  routeStepsOpen.value = false
  startWalkingRouteFrom(anchorName, anchorPoint, pick.destinationName, pick.destination)
}
const {
  nativeSearchResults,
  nativeSearchLoading,
  queueNativeSearch,
  cancelNativeSearch
} = useMapNativeSearch({
  mapProvider,
  mapViewMode,
  activeScope,
  searchQuery,
  catalogPlaces,
  onResultsReady: maybeAutoSelectDeepLink
})
const { copyText, isWechat } = useShareActions()
let lastAutoLocatedSearchKey = ''

const {
  selectedPoi,
  selectedMapPoiId,
  selectedAreaId,
  returnPath,
  selectPoi,
  clearPoi,
  handlePoiSelected,
  handleAreaSelected,
  selectArea,
  closeAreaDetails,
  categoryLabel,
  categoryIcon,
  poiStatusText,
  poiUseChecklist,
  copyPoiLocation,
  placeDetailsTarget,
  placeFeedbackTarget,
  selectedOfficialPlanNumber,
  selectOfficialPlanNumber,
  poiRowRef,
  scrollToPoi
} = useMapPoi({
  places,
  activeScope,
  filteredPois,
  filteredMapPois,
  nativeSearchResults,
  searchQuery,
  activeCategory,
  selectedPoiId,
  selectedNativePlace,
  selectedArea,
  mapProvider,
  mapViewMode,
  canShowOfficialPlan,
  mobileSheetState,
  sidebarCollapsed,
  copyText
})

// 地点详情面板只挂一份：variant 跟着 md 断点切换，避免同一个地点把整棵面板渲染两遍。
const PANEL_DESKTOP_MEDIA_QUERY = '(min-width: 768px)'
const panelMediaQuery: MediaQueryList | null = import.meta.client
  ? window.matchMedia(PANEL_DESKTOP_MEDIA_QUERY)
  : null
const panelIsDesktop = ref(panelMediaQuery?.matches ?? true)
function syncPanelVariant(event?: MediaQueryListEvent): void {
  panelIsDesktop.value = event ? event.matches : Boolean(panelMediaQuery?.matches)
}
onMounted(() => {
  panelMediaQuery?.addEventListener('change', syncPanelVariant)
  // 面板动效原点要真实坐标：capture 阶段被动记录，不拦事件。
  window.addEventListener('pointerdown', rememberSheetMotionAnchor, { capture: true, passive: true })
})
onBeforeUnmount(() => {
  panelMediaQuery?.removeEventListener('change', syncPanelVariant)
  window.removeEventListener('pointerdown', rememberSheetMotionAnchor, { capture: true })
})

function toggleDisplayOption(option: MapDisplayToggleKey): void {
  mapDisplayOptions.value = toggleMapDisplayOption(mapDisplayOptions.value, option)
}

function setLabelSize(size: MapLabelSize): void {
  mapDisplayOptions.value = withMapLabelSize(mapDisplayOptions.value, size)
}

function setMapBaseStyle(style: MapBaseStyle): void {
  if (!mapProvider.value?.setBaseStyle(style)) {
    toast.add({ title: resolveMapUnsupportedBaseStyleMessage(), color: 'warning' })
    return
  }
  mapBaseStyle.value = style
}

function formatAreaSquareMeters(value: number | null): string {
  return formatMapAreaSquareMeters(value)
}

function formatPerimeter(value: number | null): string {
  return formatMapPerimeter(value)
}

function setMapViewMode(nextMode: 'geographic' | 'official-plan') {
  if (nextMode === 'official-plan' && !canShowOfficialPlan.value) return

  const decision = resolveMapViewModeSwitchDecision({
    nextMode,
    currentMode: mapViewMode.value,
    selectedPoi: selectedPoi.value,
    mobileSheetState: mobileSheetState.value
  })
  mapViewMode.value = decision.mapViewMode
  if (decision.mobileSheetState) {
    // 手机端不回到半屏：半屏会把地图压到两百多像素，楼栋全被面板盖住、点不动。
    mobileSheetState.value = window.innerWidth < 768 && decision.mobileSheetState === 'half'
      ? 'collapsed'
      : decision.mobileSheetState
  }
  if (decision.keepSelection && selectedPoi.value) {
    // Keep the floating place panel open; re-sync geographic selection when returning to map.
    if (decision.mapViewMode === 'geographic') {
      mapProvider.value?.setSelectedPoi(decision.providerSelectedPoiId ?? selectedPoi.value.id)
      if (decision.cameraAction === 'fly-to-point' && selectedPoi.value.point) {
        mapProvider.value?.flyToPoint(selectedPoi.value.point, 18)
      } else if (decision.cameraAction === 'fly-to-poi') {
        mapProvider.value?.flyToPoi(selectedPoi.value.id)
      }
    }
  }
}

function maybeAutoSelectDeepLink(): void {
  if (!deepLinkSearchQuery || deepLinkAutoSelectFired.value) return
  deepLinkAutoSelectFired.value = true
  autoSelectSearchResult()
}

function autoSelectSearchResult(): void {
  const decision = resolveAutoSelectSearchDecision({
    query: searchQuery.value,
    activeCategory: activeCategory.value,
    lastAutoLocatedSearchKey,
    visiblePois: filteredPois.value,
    visibleAreas: filteredAreas.value,
    selectedAreaId: selectedAreaId.value,
    selectedPoiId: selectedPoiId.value,
    nativeSearchResults: nativeSearchResults.value
  })
  const apply = resolveAutoSelectSearchApply(decision)

  if (apply.kind === 'clear-key') {
    lastAutoLocatedSearchKey = ''
    return
  }
  if (apply.kind === 'noop') return

  lastAutoLocatedSearchKey = apply.autoKey
  if (apply.expandSidebar) sidebarCollapsed.value = false
  if (apply.kind === 'select-poi') {
    selectPoi(apply.target)
    if (apply.scrollToPoiId) {
      const scrollToPoiId = apply.scrollToPoiId
      void nextTick(() => scrollToPoi(scrollToPoiId))
    }
    return
  }

  selectArea(apply.targetArea)
}

function openBusSheet(): void {
  mapSheetView.value = 'bus'
  mobileSheetState.value = 'half'
}

/** 收起叮叮车＝彻底收掉：回到地点列表折叠态，不留 84px 残条。 */
function hideBusSheet(): void {
  mapSheetView.value = 'sections'
  mobileSheetState.value = 'collapsed'
}

function mobileSheetAnchors() {
  const sheet = mobileSheetElement.value
  const containerHeight = sheet?.parentElement?.getBoundingClientRect().height ?? 0
  const viewportHeight = typeof window === 'undefined' ? containerHeight : window.innerHeight
  const anchors = resolveMobileSheetAnchors(containerHeight, viewportHeight)
  if (mapSheetView.value === 'bus') return resolveBusSheetAnchors(anchors)
  if (mapSheetView.value === 'activity') return resolveActivitySheetAnchors(anchors)
  if (mapSheetView.value === 'transit') return resolveTransitSheetAnchors(anchors)
  return anchors
}

// 系统取消（来电、手势被打断）不是轻点：清拖拽态、回到原高度，不切高度。
function cancelMobileSheetDrag(pointerId?: number): void {
  const sheet = mobileSheetElement.value
  if (pointerId !== undefined && sheet?.hasPointerCapture(pointerId)) {
    sheet.releasePointerCapture(pointerId)
  }
  if (!mobileSheetDragging.value) return
  sheetDragEndedAt = Date.now()
  mobileSheetDragging.value = false
  mobileSheetDragPointerId.value = null
  mobileSheetDragHeight.value = null
  mobileSheetDragMoved.value = false
  mobileSheetDragFromHandle.value = false
}

function finishMobileSheetDrag(pointerId?: number): void {
  const sheet = mobileSheetElement.value
  if (pointerId !== undefined && sheet?.hasPointerCapture(pointerId)) {
    sheet.releasePointerCapture(pointerId)
  }

  if (!mobileSheetDragging.value) return
  const anchors = mobileSheetAnchors()
  // 折叠条按下没移动 = 轻点：直接抬到半屏，不依赖随后的 click，避免 pointer capture 把 click 吃掉。
  const tappedCollapsedBar = !mobileSheetDragMoved.value && mobileSheetDragStartHeight.value <= 120
  // 手柄轻点（半屏/展开态）：在两种高度之间来回，替代已隐藏的搜索行箭头。
  const tappedHandle = !mobileSheetDragMoved.value
    && mobileSheetDragFromHandle.value
    && mobileSheetDragStartHeight.value > 120
  if (tappedHandle) {
    sheetDragEndedAt = Date.now()
    mobileSheetDragging.value = false
    mobileSheetDragPointerId.value = null
    mobileSheetDragHeight.value = null
    mobileSheetDragFromHandle.value = false
    toggleMobileSheetHeight()
    return
  }
  const nextState = tappedCollapsedBar
    ? 'half'
    : resolveMobileSheetStateFromHeight(mobileSheetDragHeight.value ?? mobileSheetDragStartHeight.value, anchors)
  sheetDragEndedAt = Date.now()
  mobileSheetDragging.value = false
  mobileSheetDragPointerId.value = null
  mobileSheetDragHeight.value = null
  if (mapSheetView.value === 'bus' && nextState === 'collapsed') {
    hideBusSheet()
    return
  }
  // 活动视图没有折叠残条：拖到底同样是彻底收起。
  if (mapSheetView.value === 'activity' && nextState === 'collapsed') {
    hideActivitySheet()
    return
  }
  mobileSheetState.value = nextState
}

/**
 * 2026-11-23：半屏起底栏搜索行整条隐藏（用户「就算在半屏的时候搜索框也应该隐藏」），
 * 原来搜索框旁那条上下箭头也就没了入口 —— 改由面板手柄承担：点一下半屏↔展开。
 * 拖拽刚结束时 240ms 内不响应，避免松手瞬间被当成点击。
 */
function toggleMobileSheetHeight(): void {
  if (!sheetHydrated.value) return
  mobileSheetState.value = mobileSheetState.value === 'half' ? 'expanded' : 'half'
}

function handleMobileSheetPointerDown(event: PointerEvent): void {
  if (!event.isPrimary || mobileSheetDragging.value) return
  // 叮叮车折叠后是 84px 常驻条，这是它唯一的抬手势入口；其余视图折叠即无面板，仍拒绝起拖。
  if (mobileSheetState.value === 'collapsed' && mapSheetView.value !== 'bus') return
  const target = event.target
  const explicitDragHandle = target instanceof HTMLElement
    ? target.closest('[data-sheet-drag-handle]')
    : null
  if (
    !explicitDragHandle
    && target instanceof HTMLElement
    && target.closest('button, a, input, textarea, select')
  ) return
  const sheet = mobileSheetElement.value
  if (!sheet) return

  mobileSheetDragFromHandle.value = Boolean(explicitDragHandle)
  mobileSheetDragPointerId.value = event.pointerId
  mobileSheetDragStartY.value = event.clientY
  mobileSheetDragStartHeight.value = sheet.getBoundingClientRect().height
  mobileSheetDragging.value = true
  mobileSheetDragMoved.value = false
  mobileSheetDragHeight.value = mobileSheetDragStartHeight.value
  event.preventDefault()
  sheet.setPointerCapture(event.pointerId)
}

function handleMobileSheetPointerMove(event: PointerEvent): void {
  if (!mobileSheetDragging.value || mobileSheetDragPointerId.value !== event.pointerId) return
  const anchors = mobileSheetAnchors()
  const maxHeight = anchors.expanded
  const height = mobileSheetDragStartHeight.value + (mobileSheetDragStartY.value - event.clientY)
  if (Math.abs(event.clientY - mobileSheetDragStartY.value) > 6) mobileSheetDragMoved.value = true
  mobileSheetDragHeight.value = Math.min(maxHeight, Math.max(0, height))
  event.preventDefault()
}

// 只在「从空到有」的那一次重置面板；逐字输入时不再改面板状态，否则手机端每敲一个字布局就跳一次。
let searchWasEmpty = !searchQuery.value.trim()
watch(searchQuery, (value) => {
  const nowEmpty = !value.trim()
  if (searchWasEmpty && !nowEmpty) {
    const reset = resolveSearchQueryChangeReset({ mobileSheetState: mobileSheetState.value })
    lastAutoLocatedSearchKey = reset.lastAutoLocatedSearchKey
    selectedNativePlace.value = reset.selectedNativePlace
    // 不要再顺手改 mobileSheetState：手机端一改就会重建浮层，
    // 正在输入的 input 被销毁，表现为「打一个字就被清空」。
  }
  searchWasEmpty = nowEmpty
  queueNativeSearch()
})
watch(mapViewMode, queueNativeSearch)
const mapLayoutSignal = computed(() => [
  sidebarCollapsed.value ? 'sidebar-collapsed' : 'sidebar-open',
  mobileSheetState.value,
  mapViewMode.value
].join(':'))
const { mountMap } = useMapProviderLifecycle({
  mapElement,
  mapProvider,
  activeMapProviderId,
  mapStatus,
  mapErrorMessage,
  displayOptions: mapDisplayOptions,
  baseStyle: mapBaseStyle,
  areas: providerAreas,
  pois: filteredMapPois,
  selectedPoiId: selectedMapPoiId,
  selectedAreaId,
  resizeSignal: mapLayoutSignal,
  onPoiSelected: handlePoiSelected,
  onAreaSelected: handleAreaSelected,
  beforeMount: clearWalkingRoute,
  onReady: () => {
    queueNativeSearch()
    // 分享/直达链接带 ?q= 时：地图就绪后再自动定位一次
    maybeAutoSelectDeepLink()
  }
})

/* ---- 地图点位浮窗（T-028）----
 * 图钉 / 车辆 / 站点都在 canvas 图层里，没有 DOM 可挂 anchor-name：
 * 用 projectToScreen(point) 把业务坐标换成容器像素，喂给 MapPinPopover 的 0 尺寸锚点宿主。
 * guide: hovercard / position-aware-tooltips（不抢焦点、light dismiss、翻转换箭头）。
 */
interface PinSelection {
  kind: 'poi' | 'cluster' | 'bus' | 'bus-stop' | 'bus-terminal' | 'transit-terminal' | 'transit-vehicle'
  id: string
  /** 要素自带显示名（provider 从图层属性带出来），标题优先用它。 */
  name?: string
  /** 平面图编号地点没有坐标：这时不指图钉，贴着地图下沿居中显示。 */
  point?: GeoPoint
  count?: number
}

const pinSelection = shallowRef<PinSelection | null>(null)
const pinAnchor = shallowRef<{ x: number, y: number } | null>(null)
/** 锚点是合成的（地点没有坐标 / 地图未就绪）：不画箭头。 */
const pinDetached = shallowRef(false)
let pinAnchorRaf = 0

/** 图钉是按 WGS84 画上去的（provider 建 feature 前统一换算），投影也必须先归一化。 */
function pinProjectionPoint(point: GeoPoint): GeoPoint {
  if (point.crs !== 'GCJ-02') return point
  const wgs = gcj02ToWgs84(point.lng, point.lat)
  return { lng: wgs.longitude, lat: wgs.latitude, crs: 'WGS84' }
}

/**
 * 车辆会移动：锚点重投影必须取最新坐标，否则浮窗会停在点击时那个点。
 * 实时数据来自 useMapTransit（在本文件更下方初始化），这里用可后置挂载的读取器，
 * 避免 setup 早期（深链的 immediate watch）就摸到还没初始化的 const。
 */
let pinLivePointReader: ((selection: PinSelection) => GeoPoint | undefined) | null = null

// 跟车没有别的出口（T-028 删掉手机车辆卡后）：关闭叮叮车 / 校外公交卡时要能顺带停跟。
// 用「后可置挂载的读取器」：closePinPopover 在 setup 早期就会被 immediate watch 调到，
// 那时 useMapTransit 还没调用（解构在文件后半段），直接引用会踩 TDZ。
let vehicleFollowStopper: (() => void) | null = null

function pinSelectionPoint(selection: PinSelection): GeoPoint | undefined {
  return pinLivePointReader?.(selection) ?? selection.point
}

function refreshPinAnchor(): void {
  const selection = pinSelection.value
  if (!selection) {
    pinAnchor.value = null
    pinDetached.value = false
    return
  }
  const point = pinSelectionPoint(selection)
  const projected = point
    ? mapProvider.value?.projectToScreen?.(pinProjectionPoint(point)) ?? null
    : null
  const box = mapElement.value?.getBoundingClientRect()
  // 投影点落在可视地图之外（相机没跟过去）时不能把卡片甩到屏幕外，退回贴底居中。
  const onScreen = projected && box
    ? projected.x >= 0 && projected.y >= 0 && projected.x <= box.width && projected.y <= box.height
    : false
  if (projected && onScreen) {
    pinDetached.value = false
    pinAnchor.value = projected
    return
  }
  // 没有坐标、地图还没就绪或锚点在图外：卡片贴着地图下沿居中，箭头隐藏
  pinDetached.value = true
  pinAnchor.value = box
    ? { x: Math.round(box.width / 2), y: Math.round(box.height - 108) }
    : { x: 180, y: 560 }
}

/** 地图在动（飞相机 / 拖拽 / 缩放）时锚点必须跟着重投影，否则卡片会停在老位置。 */
let pinFollowRaf = 0
function stopPinFollow(): void {
  if (!pinFollowRaf) return
  cancelAnimationFrame(pinFollowRaf)
  pinFollowRaf = 0
}
function startPinFollow(): void {
  if (pinFollowRaf) return
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return
  const step = (): void => {
    if (!pinSelection.value) {
      pinFollowRaf = 0
      return
    }
    refreshPinAnchor()
    pinFollowRaf = window.requestAnimationFrame(step)
  }
  pinFollowRaf = window.requestAnimationFrame(step)
}
watch(pinSelection, (selection) => {
  if (selection) startPinFollow()
  else stopPinFollow()
})

function schedulePinAnchorRefresh(): void {
  if (pinAnchorRaf) return
  pinAnchorRaf = requestAnimationFrame(() => {
    pinAnchorRaf = 0
    refreshPinAnchor()
  })
}

function closePinPopover(): void {
  const closed = pinSelection.value
  pinSelection.value = null
  pinAnchor.value = null
  // 关掉车辆卡等于「不再跟随」：镜头每 5s / 20s 抢回去的源头就是这份 focus。
  if (closed?.kind === 'bus' || closed?.kind === 'transit-vehicle') vehicleFollowStopper?.()
}

/** CR-4：浮窗刚被 light dismiss 关掉时记一笔 —— 紧接着的 marker click 不该把它又开回来。 */
let pinDismissedToggle: { kind: string, id: string, at: number } | null = null

/**
 * 同一点位连点：pointerdown 先被 light dismiss 关掉浮窗，松手后的 click 又选中同一点位，
 * 400ms 内保持关闭并清记录；窗口外或换了点位就是正常打开。
 */
function swallowDismissedPinSelection(selection: PinSelection): boolean {
  const record = pinDismissedToggle
  if (!record) return false
  const decision = resolvePinReselect(record, selection, Date.now())
  if (decision === 'expired') {
    pinDismissedToggle = null
    return false
  }
  if (decision !== 'swallow') return false
  pinDismissedToggle = null
  if (pinSelection.value) return false
  closePinPopover()
  return true
}
function handlePinFeatureSelected(selection: PinSelection | null): void {
  // CR-4：light dismiss 刚关掉的同一点位，这次选中要吞掉，否则一按一放就是「关了又开」。
  if (selection && swallowDismissedPinSelection(selection)) return
  // 桌面沿用左下详情卡与两块大面板：点位浮窗只在手机分支出现。
  if (panelIsDesktop.value) {
    closePinPopover()
    return
  }
  if (!selection) {
    closePinPopover()
    return
  }
  const current = pinSelection.value
  if (current && current.kind === selection.kind && current.id === selection.id) {
    closePinPopover()
    return
  }
  pinSelection.value = selection
  refreshPinAnchor()
}

watch(pinSelection, () => {
  void nextTick(refreshPinAnchor)
})
watch(mapProvider, (provider) => {
  if (!provider) {
    closePinPopover()
    return
  }
  // 深链进来时 pinSelection 在 setup 阶段就定了，那时候 provider 还没准备好，
  // refreshPinAnchor 只能拿到空锚点。provider 到位后补投影，并给地图首帧留几次重试。
  if (pinSelection.value && !pinAnchor.value) {
    refreshPinAnchor()
    for (const delay of [120, 300, 700, 1200]) {
      window.setTimeout(() => {
        if (pinSelection.value && !pinAnchor.value) refreshPinAnchor()
      }, delay)
    }
  }
  provider.onFeatureSelect?.((selection) => {
    handlePinFeatureSelected(selection as unknown as PinSelection | null)
  })
  provider.onViewportChange?.(() => {
    schedulePinAnchorRefresh()
  })
}, { immediate: true })

// POI 走原有 selectedPoi 通道：选中即弹窗，清空即关窗
watch(selectedPoi, (poi) => {
  // 桌面保留左下详情卡，浮窗只在手机分支出现。
  if (panelIsDesktop.value) {
    if (pinSelection.value) closePinPopover()
    return
  }
  if (!poi) {
    if (pinSelection.value?.kind === 'poi') closePinPopover()
    return
  }
  pinSelection.value = { kind: 'poi', id: poi.id, point: poi.point ?? undefined }
  refreshPinAnchor()
}, { immediate: true })
// immediate：深链 /map?place=… 在 setup 时 selectedPoi 就已经有值，不加 immediate 就永远等不到这次变化。

// 窗口拉宽到桌面分支时浮窗退场，桌面侧栏接管详情。
watch(() => panelIsDesktop.value, (desktop) => {
  if (desktop) closePinPopover()
})

// 面板一抬起来就收浮窗（进 sheet / 看全线 / 看实时都走这条路）
watch(mobileSheetState, (state) => {
  if (state !== 'collapsed') closePinPopover()
})

interface PinCardModel {
  kind: string
  tone: 'place' | 'gate' | 'cluster' | 'bus' | 'transit'
  icon: string
  title: string
  subtitle?: string
  chips: { label: string, icon?: string }[]
  rows: { badge?: string, label: string, meta?: string, href?: string }[]
  eta?: { value: string, caption: string, progress?: number, from?: string, to?: string } | null
  actions: { key: string, label: string, icon?: string, variant?: 'primary' | 'ghost' | 'icon' }[]
  meta?: string
  metaAction?: string
}

/** 米数：<1 km 用整数米，超出用一位小数公里。 */
function pinMetersText(meters: number): string {
  return meters >= 1000 ? (meters / 1000).toFixed(1) + ' km' : Math.round(meters) + ' m'
}

/** 距我多远：没有定位就不写，不猜。 */
function pinDistanceText(point?: { lng: number, lat: number } | null): string {
  const origin = userLocation.value
  if (!origin || !point) return ''
  return pinMetersText(haversineMeters(origin, point))
}

/** GPS 年龄：校外公交是拉取时间，校内校车是快照时间。 */
function pinAgeText(iso?: string | null): string {
  const at = Date.parse(iso ?? '')
  if (!Number.isFinite(at)) return ''
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  return seconds < 60 ? seconds + ' 秒前定位' : Math.round(seconds / 60) + ' 分钟前定位'
}

// 地图点位（MapPoi）没有 usageChecklist 字段，这里补空数组走兜底文案，
// 否则 buildMapPoiUseChecklist 会读 undefined.length 直接抛错。
function pinPoiChecklist(poi: object): string[] {
  const usage = (poi as { usageChecklist?: string[] }).usageChecklist
  const checklist = Array.isArray(usage) ? usage : []
  return poiUseChecklist({ ...poi, usageChecklist: checklist } as unknown as PublicMapPlace)
}

/** 地点浮窗的电话入口：复用公共电话解析，多号只显示第一个，其余折成「等 N 个」。 */
function pinPhoneRows(phone?: string | null): PinCardModel['rows'] {
  const contacts = parsePublicPhoneContacts(phone)
  const first = contacts[0]
  if (!first) return []
  // parsePublicPhoneContacts 已给出 tel: 链接，这里再兜一层，避免上游改格式后变死链
  const href = first.href.startsWith('tel:') ? first.href : `tel:${first.href.replace(/[^\d+]/g, '')}`
  return [{
    badge: '电话',
    label: first.label,
    href,
    meta: contacts.length > 1 ? `等 ${contacts.length} 个` : undefined
  }]
}

/**
 * 浮窗指向的地点有两种来源：地图图钉（catalog 或高德原生搜索）与完整地点（带 slug / phone）。
 * 原生搜索结果不进 catalog，只能靠 selectedPoi / nativeSearchResults 兜住，
 * 否则点自己的搜索结果会退化成一张没有详情、没有导航的通用「地点」卡。
 */
function resolvePinPlace(selection: PinSelection): { poi?: MapPoi, place?: PublicMapPlace } {
  const poi = filteredMapPois.value.find(item => item.id === selection.id)
  const place = poi
    ? catalogPlaces.value.find(item => item.id === poi.id)
    : (selectedPoi.value?.id === selection.id
        ? selectedPoi.value
        : nativeSearchResults.value.find(item => item.id === selection.id))
  return { poi, place }
}

const pinCard = computed<PinCardModel | null>(() => {
  const selection = pinSelection.value
  if (!selection) return null

  if (selection.kind === 'poi') {
    const { poi, place } = resolvePinPlace(selection)
    if (!poi && !place) {
      return { kind: 'poi', tone: 'place', icon: 'i-lucide-map-pin', title: '地点', chips: [], rows: [], actions: [], meta: '' }
    }
    const name = poi?.name ?? place!.name
    const category = poi?.category ?? place!.category
    const point = poi?.point ?? place!.point
    const detail = (poi ?? place!) as unknown as PublicMapPlace
    const distance = pinDistanceText(point)
    // 未发布的地点没有详情页（slug 为空），别摆一个点了会跳首页的入口。
    const detailsTarget = place ? placeDetailsTarget(place) : undefined
    return {
      kind: 'poi',
      tone: category === 'gate' ? 'gate' : 'place',
      icon: categoryIcon(category),
      title: name,
      subtitle: [
        categoryLabel(category),
        distance,
        // 有图钉就不写「暂时没有地图位置」，否则和箭头所指的图钉自相矛盾。
        point ? '' : poiStatusText(detail)
      ].filter(Boolean).join(' · '),
      chips: pinPoiChecklist(detail).slice(0, 3).map(label => ({ label })),
      rows: place ? pinHotspotRows(place.id, place.name, place.phone) : pinPhoneRows(undefined),
      actions: [
        { key: 'route', label: '导航', icon: 'i-lucide-navigation', variant: 'primary' },
        { key: 'favorite', label: '', icon: 'i-lucide-star', variant: 'icon' }
      ],
      // 未发布的地点没有详情页，别摆一个点了会跳首页的入口。
      meta: detailsTarget ? '详情' : undefined,
      metaAction: detailsTarget ? 'details' : undefined
    }
  }

  if (selection.kind === 'cluster') {
    const count = selection.count ?? 0
    return {
      kind: 'cluster',
      tone: 'cluster',
      icon: 'i-lucide-layers',
      title: count ? '这一带 ' + count + ' 个地点' : '这一带的地点',
      subtitle: '点开放大后逐个查看',
      chips: [],
      rows: [],
      actions: [
        { key: 'cluster-all', label: count ? '查看这 ' + count + ' 个' : '查看全部', icon: 'i-lucide-list', variant: 'primary' },
        { key: 'cluster-zoom', label: '', icon: 'i-lucide-zoom-in', variant: 'icon' }
      ]
    }
  }

  if (selection.kind === 'bus') {
    const bus = busVehicles.value.find(item => item.busId === selection.id)
    const route = bus?.routeId ? busRoutes.value.find(item => item.routeId === bus.routeId) : undefined
    const stops = route?.stops ?? []
    const stopIndex = bus ? stops.findIndex(stop => stop.siteId === bus.siteId) : -1
    const remaining = stopIndex >= 0 ? Math.max(0, stops.length - 1 - stopIndex) : null
    const pill = busEtaPills.value.find(item => item.id === bus?.busId)
    const etaMinutes = pill?.etaMinutes ?? 0
    return {
      kind: 'bus',
      tone: 'bus',
      icon: 'i-lucide-tram-front',
      title: bus?.busName || '叮叮车',
      subtitle: [
        bus?.routeName || route?.routeName || '',
        bus?.isAtSite ? '已到站' : '在途',
        remaining !== null ? '还剩 ' + remaining + ' 站' : ''
      ].filter(Boolean).join(' · '),
      chips: [],
      rows: [],
      eta: etaMinutes > 0
        ? {
            value: '约 ' + etaMinutes + ' 分',
            caption: pill?.label ? '到 ' + pill.label.replace(/^到/, '') : '到下一站',
            progress: stopIndex >= 0 && stops.length > 1 ? stopIndex / (stops.length - 1) : undefined,
            from: stops[0]?.siteName,
            to: stops[stops.length - 1]?.siteName
          }
        : null,
      actions: [
        { key: 'bus-route', label: '看全线', icon: 'i-lucide-route', variant: 'primary' },
        { key: 'follow-stop', label: '停止跟随', variant: 'ghost' }
      ],
      meta: pinAgeText(bus?.updatedAt)
    }
  }

  if (selection.kind === 'bus-stop' || selection.kind === 'bus-terminal') {
    const matched = busRoutes.value
      .map(route => ({ route, index: route.stops.findIndex(stop => stop.siteId === selection.id) }))
      .filter(item => item.index >= 0)
    const first = matched[0]
    const stop = first ? first.route.stops[first.index] : undefined
    return {
      kind: selection.kind,
      tone: 'bus',
      icon: 'i-lucide-tram-front',
      title: stop?.siteName || selection.name || selection.id,
      subtitle: [
        first ? '第 ' + (first.index + 1) + ' 站 / 共 ' + first.route.stops.length + ' 站' : '',
        stop ? pinDistanceText({ lng: stop.lng, lat: stop.lat }) : ''
      ].filter(Boolean).join(' · '),
      chips: [],
      rows: matched.slice(0, 2).map(({ route, index }) => ({
        badge: route.isBack ? '回程' : '去程',
        label: '往 ' + (route.stops[route.stops.length - 1]?.siteName || route.routeName),
        meta: '第 ' + (index + 1) + ' 站'
      })),
      actions: [{ key: 'bus-route', label: '看全线', icon: 'i-lucide-route', variant: 'primary' }],
      meta: stop?.isOrigin ? '起点站' : stop?.isDestination ? '终点站' : ''
    }
  }

  if (selection.kind === 'transit-terminal') {
    const terminalName = selection.name || selection.id
    const matched = transitDirections.value.filter(direction => direction.stops.some(stop => stop.name === terminalName))
    const name = terminalName
    return {
      kind: 'transit-terminal',
      tone: 'transit',
      icon: 'i-lucide-bus-front',
      title: name + ' · 校外公交',
      subtitle: matched.length + ' 条线路',
      chips: [],
      rows: matched.slice(0, 2).map(direction => ({
        badge: direction.line,
        label: '往 ' + direction.to
      })),
      actions: [{ key: 'transit-live', label: '看实时', icon: 'i-lucide-activity', variant: 'primary' }],
      meta: ''
    }
  }

  const live = transitLive.value
  for (const direction of live?.directions ?? []) {
    const vehicle = (direction.vehicles as unknown as { id?: string, plate?: string, nextStation?: string, distanceToNext?: number }[])
      .find(item => item.id === selection.id || item.plate === selection.id)
    if (vehicle) {
      return {
        kind: 'transit-vehicle',
        tone: 'transit',
        icon: 'i-lucide-bus',
        title: direction.line + ' · ' + (vehicle.plate || selection.id),
        subtitle: [
          '开往 ' + direction.to,
          vehicle.nextStation ? '下一站 ' + vehicle.nextStation : ''
        ].filter(Boolean).join(' · '),
        chips: [],
        rows: vehicle.nextStation
          ? [{
              badge: direction.line,
              label: '距 ' + vehicle.nextStation + (vehicle.distanceToNext ? ' 还有 ' + pinMetersText(vehicle.distanceToNext) : ''),
              meta: pinAgeText(live?.fetchedAt)
            }]
          : [],
        actions: [
          { key: 'transit-live', label: '看线路', icon: 'i-lucide-route', variant: 'primary' },
          { key: 'follow-stop', label: '停止跟随', variant: 'ghost' }
        ],
        meta: vehicle.nextStation || ''
      }
    }
  }

  // 车辆没匹配到实时帧（刚开走 / 还没定位）：只给标题与在途状态。
  if (selection.kind === 'transit-vehicle') {
    return {
      kind: 'transit-vehicle',
      tone: 'transit',
      icon: 'i-lucide-bus',
      title: selection.id || '车辆',
      subtitle: '在途',
      chips: [],
      rows: [],
      actions: [
        { key: 'transit-live', label: '看线路', variant: 'primary' },
        { key: 'follow-stop', label: '停止跟随', variant: 'ghost' }
      ],
      meta: ''
    }
  }

  return null
})

function handlePinAction(key: string): void {
  const selection = pinSelection.value
  if (!selection) return

  if (key === 'details' && selection.kind === 'poi') {
    // 手机端详情卡已由浮窗取代，详情动作直接进地点详情页（与桌面卡「详情」同一个目标）。
    // 目标按「这张卡指向的地点」算，不读 selectedPoi：原生搜索选中的卡也能跳。
    const { place } = resolvePinPlace(selection)
    const target = place ? placeDetailsTarget(place) : undefined
    if (target) void navigateTo(target)
    return
  }
  if (key === 'cluster-all') {
    mobileSheetState.value = 'half'
    mapSheetView.value = 'all'
    return
  }
  if (key === 'cluster-zoom') {
    const zoom = mapProvider.value?.getZoom?.() ?? 12
    if (selection.point) mapProvider.value?.flyToPoint(selection.point, zoom + 2)
    closePinPopover()
    return
  }
  if (key === 'follow-stop') {
    // 停止跟随：清掉 focus（后续轮询不再 flyToPoint），再把卡收掉。
    vehicleFollowStopper?.()
    closePinPopover()
    return
  }

  if (key === 'bus-route') {
    openBusSheet()
    return
  }
  if (key === 'transit-live') {
    mapSheetView.value = 'transit'
    mobileSheetState.value = 'half'
    return
  }
  if (key === 'route' && selection.kind === 'poi') {
    const { poi, place } = resolvePinPlace(selection)
    const point = poi?.point ?? place?.point
    if (point) startWalkingRoute(poi?.name ?? place!.name, point)
    return
  }
  if (key === 'favorite' && selection.kind === 'poi') {
    const { place } = resolvePinPlace(selection)
    toggleFavorite(place?.id ?? selection.id)
  }
}

/** 关窗后把焦点收回地图容器（tabindex=-1）：卡片里的按钮还在就不抢。 */
function restoreMapFocus(): void {
  if (typeof document === 'undefined') return
  const active = document.activeElement as HTMLElement | null
  // 卡片里的按钮（关闭叉、动作按钮）随之卸载，焦点不能留在原地；其余触发者还在原位时不抢焦点。
  const insideCard = Boolean(active?.closest?.('.pin-popover'))
  const lostFocus = !active || active === document.body || active.offsetParent === null || insideCard
  if (!lostFocus) return
  // 原生 popover 关闭后浏览器会把焦点还给「打开前」的元素，晚一帧再收焦点到地图容器。
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      // CR-5：这两帧之间用户可能已经在 dock 里打字；输入框/可编辑区拿到焦点就不抢。
      const activeNow = document.activeElement as HTMLElement | null
      if (
        activeNow instanceof HTMLInputElement
        || activeNow instanceof HTMLTextAreaElement
        || activeNow?.isContentEditable
      ) return
      mapElement.value?.focus({ preventScroll: true })
    })
  })
}/** 浮窗被 Esc / 点空白关掉时，焦点不回任何按钮。 */
function handlePinPopoverClosed(): void {
  // CR-4：记下被关掉的那一个点位，给紧接着的 click 用；其它关闭路径不写记录。
  const dismissed = pinSelection.value
  if (dismissed) pinDismissedToggle = { kind: dismissed.kind, id: dismissed.id, at: Date.now() }
  closePinPopover()
  restoreMapFocus()
}
/** Esc 只关浮窗：先收起卡片并把焦点交回地图，面板三态保持原样。 */
function dismissPinPopover(): void {
  if (!pinSelection.value) return
  closePinPopover()
  restoreMapFocus()
}

/** 手机列表点行：先把面板收起来，再选中并弹浮窗（桌面照旧）。 */
function selectPoiFromSheet(poi: PublicMapPlace): void {
  if (panelIsDesktop.value) {
    selectPoi(poi)
    return
  }
  mobileSheetState.value = 'collapsed'
  void nextTick(() => {
    // 同一个地点再点一次（卡片已被 Esc 关掉）也要把卡弹回来：
    // selectedPoiId 没变就不重跑飞镜头，只补回浮窗选择。
    if (selectedPoiId.value === poi.id) {
      if (pinSelection.value?.kind !== 'poi' || pinSelection.value.id !== poi.id)
        pinSelection.value = { kind: 'poi', id: poi.id, point: poi.point ?? undefined }
      return
    }
    selectPoi(poi)
  })
  // 面板收起时地图容器在变尺寸，首帧投影可能拿不到值；补齐几次重投影，箭头才对得准。
  // 只补投影、不重放选中：用户在这几百毫秒里换了地点，旧回调不能把新选择顶掉。
  for (const delay of [120, 300, 700, 1200]) {
    window.setTimeout(() => {
      if (pinSelection.value?.kind !== 'poi' || pinSelection.value.id !== poi.id) return
      if (pinDetached.value) refreshPinAnchor()
    }, delay)
  }
}

/** 面板里点车：面板收到半屏，浮窗贴到车上（桌面面板保持原行为）。 */
function handleTransitVehicleFocusFromPanel(payload: { plate: string, point: [number, number], nextStation: string, distanceToNext?: number }): void {
  focusTransitVehicleFromPanel(payload)
  if (panelIsDesktop.value) return
  mobileSheetState.value = 'half'
  void nextTick(() => {
    pinSelection.value = {
      kind: 'transit-vehicle',
      id: payload.plate,
      // 校外公交车辆坐标是从接口原样带过来的 GCJ-02，标成 WGS84 会让锚点整体偏几十米。
      point: { lng: payload.point[0], lat: payload.point[1], crs: 'GCJ-02' }
    }
    refreshPinAnchor()
  })
}

// 面板撤层还要让路由同步闭嘴：那次 popstate 只是把 URL 退回压层前的样子。
let ignoreRouteApplyAfterDrop = false
const { cancelMapRouteSync } = useMapRouteSync({
  consumeSelfNavigation: () => {
    if (!ignoreRouteApplyAfterDrop) return false
    ignoreRouteApplyAfterDrop = false
    return true
  },
  categoryIds,
  places,
  areas: amapImportedAreas,
  filteredPois,
  mapProvider,
  mapViewMode,
  searchQuery,
  activeCategory,
  selectedPoiId,
  selectedArea,
  selectedAreaId,
  scrollToPoi
})

// 校车/校外公交图层：线路、实时车位置、减速带与底图注记的状态和逻辑都在 useMapTransit。
const {
  busSelectedRouteId,
  busPanelOpen,
  busRoutes,
  busVehicles,
  busFetchedAt,
  transitLinesOpen,
  transitPanelOpen,
  transitLoading,
  transitDirections,
  transitFetchedAt,
  transitLive,
  transitDepartures,
  transitLiveError,
  transitSelectedDirection,
  transitVehicleFocus,
  transitMyLocation,
  speedBumpsVisible,
  basemapLabelsVisible,
  toggleBasemapLabels,
  toggleSpeedBumps,
  toggleTransitLines,
  changeTransitLine,
  changeTransitDirection,
  focusTransitStop,
  focusTransitVehicleFromPanel,
  startTransitLive,
  stopTransitLive,
  closeVehicleDetails
} = useMapTransit({
  mapProvider,
  userLocation,
  notify: notice => toast.add(notice),
  // 桌面分支保持跟车（点面板里的车全靠轮询把镜头带过去）；手机只在面板折叠时跟，一抬起就让位。
  canFollowVehicle: () => panelIsDesktop.value || mobileSheetState.value === 'collapsed'
})

// 跟车停跟的真实落点：上面那份读取器在这里拿到实现。
vehicleFollowStopper = closeVehicleDetails

// 校车给的是插值显示位（没有自己的 crs，沿用点击时那份）；校外公交给实时 GCJ-02 GPS 点。
pinLivePointReader = (selection) => {
  if (selection.kind === 'bus') {
    const bus = busVehicles.value.find(item => item.busId === selection.id)
    return bus ? { lng: bus.lng, lat: bus.lat, crs: selection.point?.crs ?? 'WGS84' } : undefined
  }
  if (selection.kind === 'transit-vehicle') {
    for (const direction of transitLive.value?.directions ?? []) {
      for (const vehicle of direction.vehicles) {
        const id = `${direction.line}-${direction.direction}-${vehicle.plate}`
        if (id === selection.id || vehicle.plate === selection.id || vehicle.plate === selection.name)
          return { lng: vehicle.point[0], lat: vehicle.point[1], crs: 'GCJ-02' }
      }
    }
  }
  return undefined
}

// 折叠态地图上的校车 ETA 胶囊：位置来自 provider.projectToScreen 投影 seam。
// 拖动 / 高度过渡期间冻结 ETA：文本与首帧位移都不再随 150ms 车辆 tick 重算，
// 避免响应式 patch 插进拖动帧。松手或过渡结束 frozen 转 false，立刻回到实时值。
const sheetInteractionActive = computed(() => mobileSheetDragging.value || sheetTransitioning.value)

// 折叠态地图上的校车 ETA 胶囊：位置来自 provider.projectToScreen 投影 seam。
const busEtaPills = useMapBusEta({
  buses: busVehicles,
  routes: busRoutes,
  provider: mapProvider,
  activeRouteId: busSelectedRouteId,
  frozen: sheetInteractionActive
})

// T-031 B4：胶囊位移改为 rAF 逐帧直写 style.transform（不经过 Vue patch），
// 拖动地图时与车点同帧；旧实现只在 150ms 车辆 tick 上挪一次，实测落后 64.9px。
// 定位器接管后模板不再绑 :style，否则每次重渲染都会用冻结快照把逐帧写入覆盖回去。
const busEtaLayerVisible = computed(() => mobileSheetState.value === 'collapsed')
const busEtaPositionerActive = ref(false)
const busEtaPositioner = useMapBusEtaPositioner({
  layer: busEtaLayerElement,
  pills: busEtaPills,
  buses: busVehicles,
  provider: mapProvider,
  enabled: busEtaLayerVisible
})
watch(busEtaLayerVisible, (visible) => {
  if (!visible) {
    busEtaPositionerActive.value = false
    busEtaPositioner.stop()
    return
  }
  busEtaPositionerActive.value = true
  nextTick(() => {
    busEtaPositioner.syncOnce()
    busEtaPositioner.start()
  })
}, { immediate: true })
onBeforeUnmount(() => busEtaPositioner.stop())
onBeforeUnmount(() => stopPinFollow())

// 个人定位接入校车定位：进图即静默显示「我的位置」蓝点（不飞相机）
onMounted(() => {
  // R8：水合完成前用户点过 dock 的抬起钮时，watcher 已把手机面板抬到半屏（属性要等水合后才反映）。
  // 这里的产品默认收起不能覆盖掉这次抬起：只有本次访问还没收到任何 dock 命令时才按默认收起。
  // R9（F-51）：比较的是 mount 时记下的快照，不是字面量 0（seq 跨访问累加）。
  // 顺序很关键：先把状态落成 collapsed 再打开 sheetHydrated。反过来的话，hydrated=true 那一帧面板会按
  // half 渲染出 326px，下一帧状态才变 collapsed，用户看到的就是「一进页面面板张开又收回去」。
  if (window.innerWidth < 768 && shellDockCommand.value.seq === dockCommandSeqOnMount) {
    skipInitialSheetCollapse.value = true
    mobileSheetState.value = 'collapsed'
    // watcher 是 pre-flush：这一轮 flush 结束后就该把开关清掉，别让它吞掉用户后面的第一次收起。
    void nextTick(() => {
      skipInitialSheetCollapse.value = false
    })
  }
  sheetHydrated.value = true
  if (transitLinesOpen.value) startTransitLive()
  startLocateDisplay()
  // 手机上公交列表默认收起，免得和校车浮层叠在一起
  if (window.innerWidth < 768) transitPanelOpen.value = false
  refreshActivityClock()
  document.addEventListener('visibilitychange', handleActivityVisibility)
  window.addEventListener('popstate', handleSheetPopState)
  window.addEventListener('keydown', handleSheetKeydown)
  // 玻璃开关按上次的选择恢复；移动端才 attach（桌面浮层是 md:hidden，不需要这一层）
  glassEnabled.value = readGlassPreference()
  void syncMapGlass()
  // 面板高度实时回流给浮动件基线（拖动、三态过渡、窗口旋转都走这一条）
  if (typeof ResizeObserver !== 'undefined' && mobileSheetElement.value) {
    mobileSheetResizeObserver = new ResizeObserver((entries) => {
      const height = entries[0]?.contentRect.height ?? 0
      // CR-8：折叠态高度是 0，也要记进基线，否则 dock 还按初值 152 抬着。
      mobileSheetLiveHeightPx.value = height
    })
    mobileSheetResizeObserver.observe(mobileSheetElement.value)
  }
})
watch(mapProvider, (provider, previous) => {
  if (provider && !previous && userLocation.value) {
    provider.setUserLocation({ point: userLocation.value })
  }
})

onBeforeUnmount(() => {
  mobileSheetResizeObserver?.disconnect()
  mobileSheetResizeObserver = null
  stopTransitLive()
  cancelMapRouteSync()
  cancelNativeSearch()
  clearWalkingRoute()
  stopMapGlass()
  if (activityClockTimer) clearTimeout(activityClockTimer)
  activityClockTimer = null
  document.removeEventListener('visibilitychange', handleActivityVisibility)
  window.removeEventListener('popstate', handleSheetPopState)
  window.removeEventListener('keydown', handleSheetKeydown)
  sheetHistoryPushed = false
  suppressNextPop = false
})

// ── P-002/impl/04：抽屉首屏 = 收藏 / 最近去过 / 分类；98 个地点列表降级为「全部地点」二级视图 ──
type MapSheetView = 'sections' | 'all' | 'activity' | 'bus' | 'transit'
const mapSheetView = ref<MapSheetView>('sections')
// 校外公交面板一收成折叠就退回地点视图：它在折叠态高度为 0，第 8 格入口也跟着消失，
// 视图若留在 transit，用户只能刷新页面才回得来（选地点、按返回、把面板拖到底都会走到这里）。
// 叮叮车不在此列：它折叠后是一条 84px 的常驻条，本身就是拖拽把手。
watch(mobileSheetState, (state) => {
  if (state !== 'collapsed') return
  if (mapSheetView.value !== 'transit') return
  mapSheetView.value = 'sections'
})
// T-029：校外公交面板里的「时刻表」抽屉，展开时也是返回栈的一层。
const transitDrawerOpen = ref(false)
// 返回栈是否已经在浏览器历史里压过一层（popstate 与桌面 Esc 共用 handleSheetBack）。
let sheetHistoryPushed = false
// 自己撤层时置位：紧随其后的那次 popstate 是撤层回弹，不能当成用户按返回。
let suppressNextPop = false
const {
  favorites,
  recent,
  isFavorite,
  toggleFavorite,
  touchRecent,
  clearRecent
} = useMapShortcuts()

const mapPlaceLookup = computed(() => new Map(places.value.map(place => [place.id, place])))
const favoritePois = computed<PublicMapPlace[]>(() => favorites.value
  .map(id => mapPlaceLookup.value.get(id))
  .filter((place): place is PublicMapPlace => Boolean(place))
  .slice(0, 6))
const recentPois = computed<PublicMapPlace[]>(() => recent.value
  .map(entry => mapPlaceLookup.value.get(entry.id))
  .filter((place): place is PublicMapPlace => Boolean(place))
  .slice(0, 8))

// 打开任意地点详情就记一条最近访问：地图点选与列表点选都收敛到 selectedPoiId 这一条状态
watch(selectedPoiId, (id) => {
  if (id) touchRecent(id)
})

const mapSheetSearching = computed(() => searchQuery.value.trim().length > 0)
// CR-11：手机 dock 里的搜索框不在面板内，搜索有词了就把面板抬到半屏，结果块才有地方显示。
// CR-14：只认提交后的 searchQuery —— 中文输入法组词期间 searchQuery 不变，若跟着原始 input 抬面板，
// 半屏会把 dock（连同正在组词的输入框）按 v-show 一起隐藏，组词就断了。
/**
 * T-036 D2：dock 的 × 或退格把词清干净后，把手机面板收回折叠（T-026 定下的「清空搜索回折叠」）。
 * T-037 CR-8：判定抽到 map-presentation 的 resolveDockClearSheetAction；previous 的推进放到
 * 桌面早退之前，否则「桌面输入 → 切回手机 → 清空」会被看成空→空，面板收不回去。
 */
let lastDockSearchQuery = ''

watch(searchQuery, (query) => {
  const previous = lastDockSearchQuery
  lastDockSearchQuery = query
  if (panelIsDesktop.value) return
  const action = resolveDockClearSheetAction(previous, query)
  // 2026-11-24 用户：「在搜索框敲下任何字符都会呼出面板」。半屏/展开态已经把搜索行藏起来了，
  // 打字就抬面板等于把正在输入的框当场收走，所以输入期一律不动面板 —— 抬升只认显式提交
  // （回车 / 输入法搜索键），见 raiseMobileSheetForSearch()。
  if (action === 'rise') return
  if (action === 'collapse') mobileSheetState.value = 'collapsed'
})

function onMobileDockSearchInput(value: string): void {
  onSearchQueryInput(value)
}

/**
 * 2026-11-24：手机 dock 的搜索只在用户显式提交时才把面板抬起来（回车 / 输入法搜索键）。
 * 打字期不抬 —— 半屏与展开态都隐藏了搜索行，跟着 input 抬会把输入框一起藏掉。
 */
function raiseMobileSheetForSearch(): void {
  if (panelIsDesktop.value || !searchQuery.value.trim()) return
  mobileSheetState.value = resolveDockSearchMobileSheetState(mobileSheetState.value)
}

// ── T-033：底部 dock 的共享状态 ──
// ShellDock 挂在 layout 里，够不到本页的 ref，只能走 useState。方向固定：本页写 sheet/glass，
// dock 写 search/command，谁都不回写对方，避免环形更新。
// 'detached' 是第四态：面板是独立浮卡（叮叮车 / 附近活动），不贴 dock —— 底栏回不透明、只收搜索行，
// 卡片自己浮在底栏上方（用户 2026-11-24）。
const shellDockSheet = useState<'collapsed' | 'half' | 'expanded' | 'detached'>('shell-dock-sheet', () => 'collapsed')
const shellDockSearch = useState<string>('shell-dock-search', () => deepLinkSearchQuery)
// T-033 R2：定位钮的只读态回流给 dock（dock 只渲染）。
const shellDockTracking = useState<boolean>('shell-dock-tracking', () => false)
const shellDockLocating = useState<boolean>('shell-dock-locating', () => false)
const shellDockCommand = useState<{ kind: 'idle' | 'raise-sheet' | 'search-submit' | 'locate', seq: number }>(
  'shell-dock-command',
  () => ({ kind: 'idle', seq: 0 })
)

watch([mobileSheetState, mapSheetView], ([state, view]) => {
  // 叮叮车与附近活动都是独立浮卡：dock 不跟面板合体（透明底会把地图透上来），
  // 只收搜索行、保持不透明（用户 2026-11-24「跟叮叮车面板一样的形式」）。
  shellDockSheet.value = view === 'bus' || view === 'activity' ? 'detached' : state
}, { immediate: true })

// 合成块搜索行是本页搜索的唯一输入口：dock 写共享 state，这里落到真正的 searchQuery。
watch(shellDockSearch, (value) => {
  if (value !== searchQuery.value) onMobileDockSearchInput(value)
})

// R8：反向镜像 —— 深链 q、页面内改词与清空都要回到 dock 输入框。
// dock 先于本页 setup 注册同一个 useState 键（默认空串），本页的初值会被覆盖，
// 所以必须 immediate 再灌一次；等值护栏保证与上面那条不成回环。
watch(searchQuery, (value) => {
  if (value !== shellDockSearch.value) shellDockSearch.value = value
}, { immediate: true })

// R9（F-51）：dock 命令是布局级的 useState，一条 seq 贯穿整个应用会话；进页面时记下当时的值，
// 之后只跟这个快照比 —— 否则在别的页面点过一次定位，再回到 /map 就永远不按产品默认收起。
const dockCommandSeqOnMount = shellDockCommand.value.seq

// 定位钮的按下态与加载态：本页 ref 是唯一真相，dock 只读。
watch(tracking, (value) => {
  shellDockTracking.value = value
}, { immediate: true })

watch(locating, (value) => {
  shellDockLocating.value = value
}, { immediate: true })

// D1：点搜索条/聚焦 → 抬面板到半屏，沿用现有抬升语义（不新造函数）。
watch(() => shellDockCommand.value.seq, () => {
  const kind = shellDockCommand.value.kind
  if (kind === 'locate') {
    if (tracking.value) toggleTracking()
    else locateUser()
    return
  }
  // 2026-11-24：搜索框回车/搜索键才算提交，输入期不抬面板（见上面 watch(searchQuery)）。
  if (kind === 'search-submit') {
    raiseMobileSheetForSearch()
    return
  }
  if (kind !== 'raise-sheet') return
  if (panelIsDesktop.value) return
  // 用户 2026-11-23：箭头不是「永远抬到半屏」——折叠时抬到半屏，半屏时再点直接展开，
  // 展开态搜索行整行收起（没有这个按钮），所以不会来回弹。
  mobileSheetState.value = mobileSheetState.value === 'half' ? 'expanded' : 'half'
})

onBeforeUnmount(() => {
  shellDockSheet.value = 'collapsed'
  shellDockSearch.value = ''
  shellDockTracking.value = false
  shellDockLocating.value = false
})

const mapSheetShowsSections = computed(() => mobileSheetState.value !== 'collapsed'
  && mapSheetView.value === 'sections'
  && !mapSheetSearching.value)
const mapSheetShowsFullList = computed(() => {
  if (panelIsDesktop.value) return true
  if (mobileSheetState.value === 'collapsed') return false
  if (mapSheetSearching.value) return nativeSearchResults.value.length === 0
  return mapSheetView.value === 'all'
})

function backToMapSections(): void {
  mapSheetView.value = 'sections'
  mobileSheetState.value = 'half'
}

// ── T-029：手机面板里的「校外公交」视图（桌面浮层行为保持不变）──
// 面板内还有抽屉、half、collapsed 三层，一次浏览器返回只退一层，所以要自己维护一层守卫历史。
function sheetHasBackLayer(): boolean {
  return mapSheetView.value === 'transit' || transitDrawerOpen.value || mobileSheetState.value !== 'collapsed'
}

function pushSheetHistoryLayer(): void {
  if (typeof window === 'undefined' || sheetHistoryPushed || !sheetHasBackLayer()) return
  window.history.pushState({ mapSheet: mapSheetView.value === 'transit' ? 'transit' : 'sheet' }, '')
  sheetHistoryPushed = true
}

/** 用户自己把面板收起来时撤掉守卫层；这次 history.back() 的 popstate 由 suppressNextPop 吞掉。 */
function dropSheetHistoryLayer(): void {
  if (typeof window === 'undefined' || !sheetHistoryPushed) return
  sheetHistoryPushed = false
  suppressNextPop = true
  ignoreRouteApplyAfterDrop = true
  window.history.back()
}

/** 半屏 / 展开 / transit / 抽屉：任一非折叠态都保持恰好一层守卫；收起到 collapsed 就撤层。 */
function syncSheetHistoryGuard(): void {
  if (panelIsDesktop.value) return
  const action = resolveSheetHistorySync({ hasLayer: sheetHasBackLayer(), pushed: sheetHistoryPushed })
  if (action === 'push') pushSheetHistoryLayer()
  else if (action === 'drop') dropSheetHistoryLayer()
}

// 首屏 half、拖到半屏/展开、进 transit、拉开抽屉都会走到这里，不只在 openTransitSheet 里压层。
watch([mobileSheetState, mapSheetView, transitDrawerOpen], () => {
  syncSheetHistoryGuard()
})

function openTransitSheet(): void {
  if (!transitLinesOpen.value) toggleTransitLines()
  // 手机上面板内已经有 transit 视图；原浮层是 absolute z-50，留着会把地图整块盖住。
  if (!panelIsDesktop.value) transitPanelOpen.value = false
  mapSheetView.value = 'transit'
  mobileSheetState.value = 'half'
  transitDrawerOpen.value = false
  if (transitLinesOpen.value && !transitLive.value) startTransitLive()
  pushSheetHistoryLayer()
}

/** popstate 与桌面 Esc 共用这一条判定：关抽屉 → 回 sections → 收 collapsed → 离开页面。 */
function handleSheetBack(): MapSheetBackAction {
  if (transitPanelOpen.value && panelIsDesktop.value) {
    transitPanelOpen.value = false
    return 'leave'
  }

  const action = resolveSheetBackAction({
    view: mapSheetView.value,
    drawerOpen: transitDrawerOpen.value,
    sheetState: mobileSheetState.value
  })

  if (action === 'close-drawer') {
    transitDrawerOpen.value = false
  } else if (action === 'to-sections') {
    mapSheetView.value = 'sections'
    mobileSheetState.value = 'half'
    transitDrawerOpen.value = false
  } else if (action === 'collapse') {
    mapSheetView.value = 'sections'
    mobileSheetState.value = 'collapsed'
    transitDrawerOpen.value = false
  } else {
    sheetHistoryPushed = false
  }
  return action
}

function handleSheetPopState(): void {
  if (suppressNextPop) {
    suppressNextPop = false
    syncSheetHistoryGuard()
    return
  }
  if (!sheetHistoryPushed) {
    // 层丢了但面板还开着（例如撤层回弹与再次抬起撞在一起）：补齐，别让下一次返回直接离开。
    syncSheetHistoryGuard()
    return
  }
  sheetHistoryPushed = false
  const action = handleSheetBack()
  if (action !== 'leave') pushSheetHistoryLayer()
}

function handleSheetKeydown(event: KeyboardEvent): void {
  // 别的控件（手动起点弹层、显示设置、输入法组词）先吃掉 Esc 时不再连带收面板。
  if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing) return
  if (manualStartOpen.value || displaySettingsOpen.value) return
  // 点位浮窗优先吃掉 Esc：否则面板会被抬回半屏，卡片随 watcher 直接消失且焦点丢在 body。
  if (pinSelection.value) {
    event.preventDefault()
    dismissPinPopover()
    return
  }
  handleSheetBack()
}

// 离开地图页时把守卫层标记作废：SPA 删不掉已压入的历史条目，但可以让它退化成一条普通记录，
// 下次回到地图不会被当成「面板已经压过一层」，否则每来一次都会再压一条同 URL 的记录。
onBeforeRouteLeave(() => {
  if (!sheetHistoryPushed) return
  sheetHistoryPushed = false
  suppressNextPop = false
  if (typeof window !== 'undefined') window.history.replaceState({ ...window.history.state, mapSheet: 'consumed' }, '')
})

/** 点地图空白只关抽屉：面板与地图是兄弟节点，点面板不会走到这里。 */
const transitDrawerRaised = ref(false)

function handleTransitDrawerChange(open: boolean): void {
  transitDrawerOpen.value = open
}

// 抽屉被返回键 / 点地图关掉时也要把面板放回半屏。
watch(transitDrawerOpen, (open) => {
  if (!open && transitDrawerRaised.value) {
    transitDrawerRaised.value = false
    mobileSheetState.value = 'half'
  }
})

function handleMapSurfaceClick(): void {
  if (transitDrawerOpen.value) transitDrawerOpen.value = false
}

// 手机上点「清空搜索」时顺手把面板收回折叠：面板停在半屏、查询又空了时，
// dock 的 v-show 条件两个都不成立，输入框会连同整条 dock 一起消失，用户得先收面板才能再搜。
// 桌面侧栏没有三态，直接交给 clearSearchQuery。
function onClearSearch(): void {
  clearSearchQuery()
  if (panelIsDesktop.value || mobileSheetState.value === 'collapsed') return
  mobileSheetState.value = 'collapsed'
}

function focusMapSheetSection(section: 'favorites' | 'recent' | 'category'): void {
  mapSheetView.value = 'sections'
  if (mobileSheetState.value === 'collapsed') {
    mobileSheetState.value = 'half'
  }
  void nextTick(() => {
    document.getElementById('map-sheet-' + section)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  })
}

// 分类 4×2：六个主分类 + 全部地点 + 校外公交（图标取自 map-presentation 的分类真值）
const mapSheetCategoryEntries = [
  { id: 'all', label: '全部地点', icon: 'i-lucide-layout-list' },
  { id: 'hotspot', label: '热点', icon: 'i-lucide-flame' },
  { id: 'campus-building', label: '教学', icon: 'i-lucide-school' },
  { id: 'dorm', label: '宿舍', icon: 'i-lucide-bed-single' },
  { id: 'food', label: '食堂', icon: 'i-lucide-utensils' },
  { id: 'service', label: '服务', icon: 'i-lucide-landmark' },
  { id: 'nearby', label: '周边', icon: 'i-lucide-store' }
] as const

type MapSheetCategoryId = (typeof mapSheetCategoryEntries)[number]['id']

// ── 近期活动（T-040）──
// 图钉红点仍只认 placeIds；hotspots 只是同一批活动的可展示条目，用来填热点带、展开列表与浮窗。
const activityHotspots = computed(() => [...(activityPlaceResponse.value?.hotspots ?? [])].sort((a, b) => a.startsAt.localeCompare(b.startsAt)))
const hotspotsByPlaceId = computed(() => {
  const grouped = new Map<string, MapActivityHotspot[]>()
  for (const hotspot of activityHotspots.value) {
    const list = grouped.get(hotspot.placeId)
    if (!list) {
      grouped.set(hotspot.placeId, [hotspot])
      continue
    }
    // 单地点最多 3 条：卡片与浮窗都放得下，首条永远最早开始（服务端已按 startsAt 升序）。
    if (list.length < 3) list.push(hotspot)
  }
  return grouped
})
// 每个地点只列 6 条预览，场次标签用服务端给的地点真值，不能数列表行数。
const hotspotTotalByPlaceId = computed(() => {
  const totals = new Map<string, number>()
  for (const hotspot of activityHotspots.value) {
    totals.set(hotspot.placeId, hotspot.placeTotal || 1)
  }
  return totals
})
/** 在期活动总数（按地点去重累加）：列表可能被 6 条/地点的预览截断，这是真值。 */
const activityTotalCount = computed(() => {
  let total = 0
  for (const placeTotal of hotspotTotalByPlaceId.value.values()) total += placeTotal
  return total
})
const activityListTruncated = computed(() => activityHotspots.value.length < activityTotalCount.value)
const HOTSPOT_SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const HOTSPOT_DAY_MS = 24 * 60 * 60 * 1000
// 跨上海午夜后「今天 / 明天」得自己翻页：computed 读不到时间就不会失效，所以给它一个响应式的 now。
const activityNow = ref(Date.now())
let activityClockTimer: ReturnType<typeof setTimeout> | null = null
function scheduleActivityClock(): void {
  if (activityClockTimer) clearTimeout(activityClockTimer)
  if (typeof window === 'undefined') return
  const dayStart = Math.floor((activityNow.value + HOTSPOT_SHANGHAI_OFFSET_MS) / HOTSPOT_DAY_MS) * HOTSPOT_DAY_MS
  const nextMidnight = dayStart + HOTSPOT_DAY_MS - HOTSPOT_SHANGHAI_OFFSET_MS
  activityClockTimer = setTimeout(refreshActivityClock, Math.max(1000, nextMidnight - activityNow.value + 1000))
}
function refreshActivityClock(): void {
  activityNow.value = Date.now()
  scheduleActivityClock()
}
function handleActivityVisibility(): void {
  if (document.visibilityState === 'visible') refreshActivityClock()
}
// 活动时间是服务端 UTC ISO；徽标与分组一律按 Asia/Shanghai 算，换浏览器时区不该换天。
function hotspotShanghai(startsAt: string) {
  const shifted = new Date(Date.parse(startsAt) + HOTSPOT_SHANGHAI_OFFSET_MS)
  return {
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    dayIndex: Math.floor((Date.parse(startsAt) + HOTSPOT_SHANGHAI_OFFSET_MS) / HOTSPOT_DAY_MS)
  }
}
function hotspotDayDiff(startsAt: string): number {
  const todayIndex = Math.floor((activityNow.value + HOTSPOT_SHANGHAI_OFFSET_MS) / HOTSPOT_DAY_MS)
  return hotspotShanghai(startsAt).dayIndex - todayIndex
}
function hotspotDayLabel(startsAt: string): string {
  const diff = hotspotDayDiff(startsAt)
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  const parts = hotspotShanghai(startsAt)
  return `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}
function hotspotTimeLabel(startsAt: string): string {
  const parts = hotspotShanghai(startsAt)
  return `${String(parts.hours).padStart(2, '0')}:${String(parts.minutes).padStart(2, '0')}`
}
function hotspotPlaceName(placeId: string): string {
  return catalogPlaces.value.find(place => place.id === placeId)?.name ?? '校园地点'
}
const nextBusEtaMinutes = computed(() => {
  const values = busEtaPills.value
    .map(pill => pill.etaMinutes)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return values.length ? Math.min(...values) : null
})
// ── T-041：近期活动独立视图（半屏 326 / 展开 548），收起直接回 sections ──
const activityFilter = ref<'all' | 'today' | 'week' | 'later'>('all')
const activityFilterCounts = computed(() => {
  let today = 0
  let week = 0
  let later = 0
  for (const hotspot of activityHotspots.value) {
    const diff = hotspotDayDiff(hotspot.startsAt)
    if (diff <= 0) today += 1
    else if (diff <= 7) week += 1
    else later += 1
  }
  return { all: activityHotspots.value.length, today, week, later }
})
const activityFilterOptions = computed(() => [
  { id: 'all' as const, label: '全部', count: activityFilterCounts.value.all },
  { id: 'today' as const, label: '今天', count: activityFilterCounts.value.today },
  { id: 'week' as const, label: '本周', count: activityFilterCounts.value.week },
  { id: 'later' as const, label: '之后', count: activityFilterCounts.value.later }
])
const filteredActivityHotspots = computed(() => {
  if (activityFilter.value === 'all') return activityHotspots.value
  return activityHotspots.value.filter((hotspot) => {
    const diff = hotspotDayDiff(hotspot.startsAt)
    if (activityFilter.value === 'today') return diff <= 0
    if (activityFilter.value === 'week') return diff > 0 && diff <= 7
    return diff > 7
  })
})
function activityGroupLabel(startsAt: string): '今天' | '明天' | '本周' | '之后' {
  const diff = hotspotDayDiff(startsAt)
  if (diff <= 0) return '今天'
  if (diff === 1) return '明天'
  return diff <= 7 ? '本周' : '之后'
}
const activityGroups = computed(() => {
  const groups = [
    { label: '今天' as const, items: [] as MapActivityHotspot[] },
    { label: '明天' as const, items: [] as MapActivityHotspot[] },
    { label: '本周' as const, items: [] as MapActivityHotspot[] },
    { label: '之后' as const, items: [] as MapActivityHotspot[] }
  ]
  for (const hotspot of filteredActivityHotspots.value) {
    const group = groups.find(item => item.label === activityGroupLabel(hotspot.startsAt))
    if (group) group.items.push(hotspot)
  }
  return groups.filter(group => group.items.length)
})
function openActivitySheet(): void {
  if (!activityHotspots.value.length) return
  mapSheetView.value = 'activity'
  mobileSheetState.value = 'half'
}
function hideActivitySheet(): void {
  mapSheetView.value = 'sections'
  mobileSheetState.value = 'collapsed'
}
function openActivitySheetRow(hotspot: MapActivityHotspot): void {
  // 地点下架时不能先把浮卡收掉再什么都不发生。
  if (!catalogPlaces.value.some(item => item.id === hotspot.placeId)) return
  hideActivitySheet()
  openHotspotPlace(hotspot.placeId)
}
function openHotspotPlace(placeId: string, keepHalf = false): void {
  const place = catalogPlaces.value.find(item => item.id === placeId)
  if (!place) return
  // 复用图钉选中链路：selectPoi 在手机上会强制收面板，卡片要留在半屏看地图，这里再兜回半屏。
  selectPoi(place)
  if (keepHalf && !panelIsDesktop.value) mobileSheetState.value = 'half'
}
function pinHotspotRows(placeId: string, placeName: string, phone?: string | null): NonNullable<PinCardModel['rows']> {
  const phoneRows = pinPhoneRows(phone)
  const hotspots = hotspotsByPlaceId.value.get(placeId) ?? []
  if (!hotspots.length) return phoneRows
  const rows: NonNullable<PinCardModel['rows']> = hotspots.slice(0, 2).map(hotspot => ({
    badge: `${hotspotDayLabel(hotspot.startsAt)} ${hotspotTimeLabel(hotspot.startsAt)}`,
    label: hotspot.title,
    meta: placeName
  }))
  return [...rows, ...phoneRows]
}
function openMapSheetCategory(id: MapSheetCategoryId): void {
  // 「热点」走同一套分类通道：filteredPois 按 hasActivities 筛图钉。
  setCategory(id)
  // 用户 2026-11-23：点「热点」不该掉进「全部地点」整表（那时看到的是所有地点，不是活动）。
  // 有活动就直接进活动视图；一条活动都没有才退回整表，避免空面板。
  if (id === 'hotspot' && activityHotspots.value.length) {
    mapSheetView.value = 'activity'
    mobileSheetState.value = 'half'
    return
  }
  // CR-7：其它分类要真的看到该分类的地点，直接切整表视图；「全部地点」走 setCategory('all') 清分类。
  mapSheetView.value = 'all'
  mobileSheetState.value = 'half'
}
</script>

<template>
  <div
    class="map-workspace relative h-full min-h-0 overflow-hidden bg-[var(--surface)] overscroll-none md:grid md:grid-rows-1"
    :class="sidebarCollapsed ? 'md:grid-cols-1' : 'md:grid-cols-[18rem_minmax(0,1fr)]'"
    :data-glass-ready="mapGlassActive ? 'on' : 'off'"
    :data-glass-fps="mapGlassFps"
    :data-sheet-state="sheetHydrated ? mobileSheetState : 'collapsed'"
    :data-sheet-view="mapSheetView"
    :data-sheet-transition="sheetTransitioning ? 'on' : 'off'"
    :data-sheet-bloom="sheetBlooming ? 'on' : 'off'"
    :data-sheet-collapse="sheetCollapsePhase"
    :data-detached-dock="mapSheetView === 'bus' || mapSheetView === 'activity' ? 'on' : 'off'"
    :style="{ '--map-mobile-dock': `${mobileDockBottom}px`, '--sheet-origin-x': sheetOriginCss, '--sheet-origin-y': sheetOriginYCss, '--sheet-tx': sheetTranslateXCss, '--sheet-ty': `${SHEET_MOTION_DRIFT_Y}px`, '--sheet-scale': String(SHEET_MOTION_SCALE), '--sheet-scale-y': String(SHEET_MOTION_SCALE_Y), '--sheet-exit-scale': String(SHEET_EXIT_SCALE), '--sheet-exit-scale-y': String(SHEET_EXIT_SCALE_Y), '--sheet-collapse-h': sheetCollapseHeight ? `${sheetCollapseHeight}px` : '326px' }"
  >
    <aside
      ref="mobileSheetElement"
      class="map-glass-sheet absolute inset-x-0 bottom-[calc(var(--map-float-gap,0.625rem)+env(safe-area-inset-bottom))] z-[var(--z-sheet)] flex min-h-0 min-w-0 flex-col rounded-t-[26px] bg-[var(--surface)] shadow-[0_0_0_1px_var(--surface)] transition-[height] duration-[320ms] ease-[var(--ease-sheet)] [contain:layout] md:pointer-events-auto md:static md:order-1 md:h-auto md:rounded-none md:border-r md:border-t-0 md:shadow-none"
      :style="mobileSheetStyle"
      :class="[
        mapSheetView === 'bus'
          ? resolveBusSheetHeightClass(mobileSheetState)
          : mapSheetView === 'transit'
            ? resolveTransitSheetHeightClass(mobileSheetState)
            : mapSheetView === 'activity'
              ? (mobileSheetDragging
                // 拖拽时高度由 inline style 决定，挂 !important 高度类会把它按住不动。
                ? ''
                : mobileSheetState === 'expanded'
                  ? 'max-md:!h-[min(548px,calc(100%_-_5.75rem))]'
                  : SHEET_ACTIVITY_HALF)
              : mobileSheetHeightClass,
        // T-022 修正 01（R-010 F14）：高度只按 CSS 断点走，不再依赖 panelIsDesktop。
        // JS 的 matchMedia 与 CSS 的 md 断点不同源时（如 CDP emulate 视口），面板会卡在 58vh 而非 326。
        // activity 视图在上一条分支里已有自己的 326/548，这里不再叠一层（叠了会重复出两条高度类）。
        mapSheetView !== 'bus' && mapSheetView !== 'transit' && mapSheetView !== 'activity' && sheetHydrated && !mobileSheetDragging && mobileSheetState === 'half' ? SHEET_HALF_326 : '',
        // 挂载前一律按折叠渲染，避免手机上首帧先弹出一块面板再收回。
        mapSheetView !== 'bus' && (!sheetHydrated || mobileSheetState === 'collapsed') ? 'max-md:!h-0 max-md:border-t-0 max-md:shadow-none' : '',
        // 真折射跑起来时不要再叠 backdrop-filter：叠了等于把已经弯折的底图再糊一遍，
        // 08-WebGL全屏折射 里「楼在玻璃里折」的观感就没了。ready=false 才回落到 blur。
        mapGlassActive ? 'map-glass-refracting' : 'map-glass-surface',
        // 折叠态也要有视觉边界：没有边框和阴影，面板会和地图糊在一起，
        // 用户看不出「这里还有一列地点、可以上滑」。
        mobileSheetState === 'collapsed'
          ? 'border-t border-[var(--sheet-hairline)]'
          : 'border-t border-[var(--sheet-hairline)]',
        // Keep the sheet itself out of the scroll chain. The place list below
        // is the only scroll region on mobile.
        'overflow-hidden',
        mobileSheetDragging ? 'select-none' : '',
        sidebarCollapsed ? 'md:hidden' : ''
      ]"
      @transitionstart="handleSheetTransitionStart"
      @transitionend="handleSheetTransitionEnd"
      @transitioncancel="handleSheetTransitionEnd"
      @pointermove="handleMobileSheetPointerMove"
      @pointerup="finishMobileSheetDrag($event.pointerId)"
      @pointercancel="cancelMobileSheetDrag($event.pointerId)"
      @lostpointercapture="finishMobileSheetDrag()"
    >
      <template v-if="mapSheetView !== 'bus'">
        <div
          v-if="mapSheetView !== 'transit' && mapSheetView !== 'activity'"
          data-sheet-drag-zone
          class="relative flex h-14 shrink-0 touch-none cursor-ns-resize items-center justify-between gap-2 px-3 md:hidden"
          :class="mobileSheetState === 'half' ? '!h-10' : ''"
          @pointerdown="handleMobileSheetPointerDown"
        >
          <button
            type="button"
            data-sheet-drag-handle
            class="absolute left-1/2 top-1 flex h-5 w-16 -translate-x-1/2 touch-none items-center justify-center rounded-md text-zinc-400 dark:text-zinc-500 active:bg-zinc-100 dark:active:bg-zinc-800 active:text-zinc-700 dark:active:text-zinc-200"
            aria-label="上下拖动地点面板"
            @pointerdown="handleMobileSheetPointerDown"
          >
            <span
              aria-hidden="true"
              class="block h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700"
            />
          </button>
          <div class="flex min-w-0 flex-1 items-center gap-1 pt-3">
            <p class="truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
              我的地图
            </p>
            <!-- CR-12：桌面端的显示设置入口在右侧工具条（hidden md:flex），手机这里补一个图标按钮，开的是同一个面板。 -->
            <button
              type="button"
              class="flex size-8 shrink-0 items-center justify-center rounded-md text-zinc-500 dark:text-zinc-400"
              aria-label="打开地图显示设置"
              @click="toggleDisplaySettings($event)"
            >
              <UIcon
                name="i-lucide-sliders-horizontal"
                class="size-4"
              />
            </button>
          </div>
          <!-- 三态入口收成一个文字按钮：mockup（18-地图页-真折射手机.png）里只有「收起 / 展开」；
             三个 chevron 图标在 390px 宽下把标题挤掉，用户也分不清 minus 是三态里的哪个。 -->
          <button
            type="button"
            class="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-green-700 active:bg-green-50 dark:text-green-400 dark:active:bg-green-950"
            :aria-label="mobileSheetState === 'collapsed' ? '展开地点面板' : '收起地点面板'"
            :aria-pressed="mobileSheetState !== 'collapsed'"
            @click="() => { mobileSheetState = mobileSheetState === 'collapsed' ? 'half' : 'collapsed' }"
          >
            {{ mobileSheetState === 'collapsed' ? '展开' : '收起' }}
          </button>
        </div>

        <!-- F23：搜索结果块移出「展开/收起」按钮，与头部行同级——按钮里不能再套按钮。 -->
        <div
          v-show="mapSheetSearching && (nativeSearchLoading || nativeSearchResults.length > 0)"
          class="map-sheet-results min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-2 md:hidden"
          aria-label="地图搜索结果"
        >
          <p
            v-if="nativeSearchLoading"
            class="mt-2 text-xs text-zinc-500 dark:text-zinc-400"
            role="status"
          >
            正在搜索地图里的地点…
          </p>
          <template v-else-if="nativeSearchResults.length">
            <p
              class="mt-2 text-xs text-zinc-500 dark:text-zinc-400"
              role="status"
            >
              找到 {{ nativeSearchResults.length }} 个地点
            </p>
            <ul class="mt-1 space-y-0.5">
              <li
                v-for="place in nativeSearchResults"
                :key="place.id"
              >
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-[13px] text-zinc-900 dark:text-zinc-100"
                  @click="selectPoiFromSheet(place)"
                >
                  <UIcon
                    name="i-lucide-map-pin"
                    class="size-3.5 shrink-0 text-green-700 dark:text-green-400"
                  />
                  <span class="min-w-0 truncate">{{ place.name }}</span>
                </button>
              </li>
            </ul>
          </template>
        </div>
        <div
          v-if="mobileSheetState === 'collapsed'"
          class="grid min-h-0 flex-1 place-items-center px-3 text-[11px] text-zinc-400 dark:text-zinc-500 md:hidden"
          aria-hidden="true"
        >
          上滑展开 · 收藏 / 最近 / 分类
        </div>

        <div
          class="hidden shrink-0 border-b border-[var(--line)] px-3 py-2 md:block md:px-5 md:py-4"
        >
          <!-- 桌面端的搜索框与分类栏留在侧栏里（现状不变）；移动端这两块搬到顶部浮层，见下方 md:hidden 的浮层。 -->
          <div class="hidden md:block">
            <div class="hidden items-start justify-between gap-3 md:flex">
              <div class="min-w-0">
                <p class="text-xs font-semibold text-green-700 dark:text-green-400">
                  校园地图
                </p>
                <h1 class="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-100">
                  校园与周边
                </h1>
              </div>
              <div class="flex items-center gap-1">
                <UBadge
                  color="warning"
                  variant="soft"
                  size="sm"
                >
                  {{ mapDataLabel }}
                </UBadge>
                <UTooltip text="收起地点栏">
                  <UButton
                    icon="i-lucide-panel-left-close"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="justify-center hidden size-11 md:inline-flex"
                    aria-label="收起地点栏"
                    @click="() => { sidebarCollapsed = true }"
                  />
                </UTooltip>
              </div>
            </div>

            <UInput
              :model-value="searchQuery"
              size="md"
              class="min-h-10 w-full md:mt-3 md:min-h-11"
              :ui="{ base: 'min-h-10 md:min-h-11' }"
              icon="i-lucide-search"
              placeholder="搜索地点或附近商家"
              aria-label="搜索地图地点"
              @update:model-value="onSearchQueryInput"
              @compositionstart="onSearchCompositionStart"
              @compositionend="onSearchCompositionEnd"
            >
              <!-- 清空按钮不能按需挂载：第一个字出现时插槽一变，UInput 会把内部 input 重建，
               手机端焦点和值一起丢，表现就是「打一个字母就被清空」。这里常驻、只切可见性。 -->
              <template #trailing>
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :class="searchQuery ? '' : 'pointer-events-none opacity-0'"
                  :aria-hidden="searchQuery ? undefined : 'true'"
                  :tabindex="searchQuery ? undefined : -1"
                  aria-label="清空搜索"
                  @click="onClearSearch"
                />
              </template>
            </UInput>

            <div
              class="mt-2 grid grid-cols-4 gap-1 md:mt-3 md:flex md:overflow-x-auto md:pb-1"
              :class="mobileSheetState === 'collapsed' ? 'hidden md:flex' : ''"
              aria-label="地点分类"
            >
              <UButton
                v-for="category in categories"
                :key="category.id"
                :icon="category.icon"
                :label="category.label"
                :color="activeCategory === category.id ? 'primary' : 'neutral'"
                :variant="activeCategory === category.id ? 'soft' : 'ghost'"
                size="xs"
                class="min-h-9 min-w-0 justify-center px-1 text-[11px] md:min-h-11 md:shrink-0 md:px-2.5 md:text-xs"
                :aria-pressed="activeCategory === category.id"
                @click="setCategory(category.id)"
              />
            </div>
          </div>

          <p
            v-if="mapFallbackMessage"
            class="map-sheet-hint mt-2 text-xs leading-5 text-blue-800"
            role="status"
          >
            {{ mapFallbackMessage }}
          </p>
          <p
            v-if="nativeSearchLoading"
            class="mt-2 text-xs text-zinc-500 dark:text-zinc-400"
            role="status"
          >
            正在搜索地图里的地点…
          </p>
          <ul
            v-else-if="searchQuery.trim() && nativeSearchResults.length"
            class="mt-2 max-h-48 space-y-0.5 overflow-y-auto"
            role="status"
            aria-label="地图搜索找到的附近地点，点击查看"
          >
            <li
              v-for="place in nativeSearchResults"
              :key="place.id"
            >
              <button
                type="button"
                class="flex min-h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs leading-5 text-zinc-600 dark:text-zinc-300 transition-colors hover:bg-green-50 dark:hover:bg-green-950/60 hover:text-green-800 dark:hover:text-green-200"
                @click="selectPoiFromSheet(place)"
              >
                <UIcon
                  name="i-lucide-map-pin"
                  class="size-3.5 shrink-0 text-green-700 dark:text-green-400"
                />
                <span class="min-w-0 truncate">{{ place.name }}</span>
              </button>
            </li>
          </ul>
        </div>

        <div
          v-if="mapSheetShowsSections"
          class="shell-fade-bottom shell-fade-bottom--map scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3 pt-0 md:hidden"
          aria-label="收藏、最近去过与分类"
        >
          <section
            id="map-sheet-category"
            class="mt-0.5"
            aria-labelledby="map-sheet-category-title"
          >
            <div class="mt-0.5 grid grid-cols-2 gap-2">
              <button
                type="button"
                class="flex h-[74px] flex-col justify-between rounded-[18px] border border-white/70 bg-[color-mix(in_srgb,var(--surface)_50%,transparent)] px-3.5 py-3 text-left active:bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] dark:border-white/10 dark:bg-white/[0.06] dark:active:bg-white/[0.12]"
                aria-label="打开收藏列表"
                @click="focusMapSheetSection('favorites')"
              >
                <span class="flex items-center gap-1.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">
                  <UIcon
                    name="i-lucide-star"
                    class="size-3.5"
                  />
                  收藏
                </span>
                <span class="text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{{ favorites.length }}<small class="ml-1 text-[11px] font-normal text-zinc-400">个地点</small></span>
              </button>
              <button
                type="button"
                class="flex h-[74px] flex-col justify-between rounded-[18px] border border-white/70 bg-[color-mix(in_srgb,var(--surface)_50%,transparent)] px-3.5 py-3 text-left active:bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] dark:border-white/10 dark:bg-white/[0.06] dark:active:bg-white/[0.12]"
                aria-label="打开最近去过列表"
                @click="focusMapSheetSection('recent')"
              >
                <span class="flex items-center gap-1.5 text-[12.5px] text-zinc-500 dark:text-zinc-400">
                  <UIcon
                    name="i-lucide-history"
                    class="size-3.5"
                  />
                  最近
                </span>
                <span class="text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">{{ recent.length }}<small class="ml-1 text-[11px] font-normal text-zinc-400">个地点</small></span>
              </button>
            </div>
            <div class="map-sheet-categories mt-0.5 grid grid-cols-4 gap-1 pb-2">
              <button
                v-for="entry in mapSheetCategoryEntries"
                :key="entry.id"
                type="button"
                class="flex h-[62px] flex-col items-center justify-center gap-1 rounded-[18px] border border-white/70 bg-[color-mix(in_srgb,var(--surface)_50%,transparent)] px-1 text-center text-[12.5px] font-medium text-zinc-800 active:bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] dark:border-white/10 dark:bg-white/[0.06] dark:active:bg-white/[0.12] dark:text-zinc-100"
                :aria-label="'筛选分类 ' + entry.label"
                :class="entry.id === 'hotspot' ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200' : ''"
                @click="openMapSheetCategory(entry.id)"
              >
                <span
                  v-if="entry.id === 'hotspot'"
                  class="size-2 rounded-full bg-rose-500"
                  aria-hidden="true"
                />
                <UIcon
                  v-else
                  :name="entry.icon"
                  class="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                />
                {{ entry.label }}
              </button>

              <button
                type="button"
                class="map-sheet-transport flex h-[62px] flex-col items-center justify-center gap-1 rounded-[18px] border border-[#1a6cf5]/35 bg-[#1a6cf5]/10 text-[#1a6cf5] dark:border-[#1a6cf5]/45 dark:bg-[#1a6cf5]/15 dark:text-[#6ea8ff] px-1 text-[12.5px] font-medium"
                aria-label="打开校外公交"
                @click="openTransitSheet"
              >
                <UIcon
                  name="i-lucide-tram-front"
                  class="size-4 shrink-0"
                />
                校外公交
                <span class="text-[10px] font-normal text-[var(--muted-ink)]">K2 · K6</span>
              </button>
            </div>
          </section>
          <section
            id="map-sheet-favorites"
            aria-labelledby="map-sheet-favorites-title"
          >
            <div class="flex items-center justify-between">
              <h2
                id="map-sheet-favorites-title"
                class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400"
              >
                收藏
              </h2>
              <span class="text-[11px] text-zinc-400 dark:text-zinc-500">{{ favorites.length }} 个</span>
            </div>
            <p
              v-if="favoritePois.length === 0"
              class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
            >
              还没有收藏 · 在地点详情点 ★ 收藏
            </p>
            <ul
              v-else
              class="mt-2 grid grid-cols-2 gap-1.5"
            >
              <li
                v-for="poi in favoritePois"
                :key="poi.id"
              >
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center gap-2 rounded-md border border-[var(--line)] px-2 text-left active:bg-zinc-50 dark:active:bg-zinc-800"
                  :aria-label="'打开收藏地点 ' + poi.name"
                  @click="selectPoiFromSheet(poi)"
                >
                  <UIcon
                    :name="categoryIcon(poi.category)"
                    class="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                  />
                  <span class="min-w-0 truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{{ poi.name }}</span>
                </button>
              </li>
            </ul>
          </section>

          <section
            id="map-sheet-recent"
            class="mt-4"
            aria-labelledby="map-sheet-recent-title"
          >
            <div class="flex items-center justify-between">
              <h2
                id="map-sheet-recent-title"
                class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400"
              >
                最近去过
              </h2>
              <button
                v-if="recentPois.length > 0"
                type="button"
                class="rounded-md px-1.5 py-1 text-[11px] text-zinc-400 active:bg-zinc-100 dark:text-zinc-500 dark:active:bg-zinc-800"
                aria-label="清空最近去过"
                @click="clearRecent"
              >
                清空
              </button>
            </div>
            <p
              v-if="recentPois.length === 0"
              class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
            >
              还没有记录 · 打开任意地点就会出现在这里
            </p>
            <ul
              v-else
              class="mt-2 space-y-1"
            >
              <li
                v-for="poi in recentPois"
                :key="poi.id"
              >
                <button
                  type="button"
                  class="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left active:bg-zinc-50 dark:active:bg-zinc-800"
                  :aria-label="'打开最近地点 ' + poi.name"
                  @click="selectPoiFromSheet(poi)"
                >
                  <UIcon
                    :name="categoryIcon(poi.category)"
                    class="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
                  />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{{ poi.name }}</span>
                    <span class="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">{{ categoryLabel(poi.category) }}</span>
                  </span>
                </button>
              </li>
            </ul>
          </section>
        </div>

        <div
          class="hidden items-center justify-between border-b border-[var(--line)] px-3 py-1 text-xs text-zinc-500 dark:text-zinc-400 md:flex md:px-5 md:py-2"
        >
          <span>{{ filteredPois.length }} 个地点</span>
          <button
            class="min-h-9 min-w-11 px-2 font-medium text-green-700 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 md:min-h-11"
            type="button"
            @click="fitToVisiblePois"
          >
            查看全部
          </button>
        </div>

        <div
          v-show="mapSheetShowsFullList && mapSheetView === 'all' && !mapSheetSearching"
          class="flex shrink-0 items-center justify-between border-b border-[var(--line)] px-3 py-1 md:hidden"
        >
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-1 rounded-md pr-2 text-[13px] font-medium text-green-700 active:bg-green-50 dark:text-green-400 dark:active:bg-green-950"
            aria-label="返回收藏、最近去过与分类"
            @click="backToMapSections"
          >
            <UIcon
              name="i-lucide-chevron-left"
              class="size-4"
            />
            返回
          </button>
          <span class="text-[13px] text-zinc-500 dark:text-zinc-400">{{ filteredPois.length }} 个地点</span>
        </div>

        <div
          v-show="mapSheetShowsFullList"
          class="map-place-list min-h-0 flex-1 overflow-y-auto overscroll-y-contain md:block"
          :class="mobileSheetState === 'collapsed' ? 'hidden md:block' : 'block'"
          aria-label="地点列表"
          @wheel.stop
          @touchmove.stop
        >
          <button
            v-for="poi in filteredPois"
            :key="poi.id"
            :ref="poiRowRef(poi.id)"
            type="button"
            class="flex w-full items-center gap-2.5 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-800/60 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-700 md:gap-3 md:px-5 md:py-3"
            :class="selectedPoiId === poi.id ? 'bg-green-50 dark:bg-green-950' : 'bg-[var(--surface)] dark:bg-zinc-900'"
            @click="selectPoiFromSheet(poi)"
          >
            <span
              class="grid size-8 shrink-0 place-items-center rounded-md md:size-9"
              :class="selectedPoiId === poi.id ? 'bg-green-700 text-[var(--surface)]' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300'"
            >
              <UIcon
                :name="categoryIcon(poi.category)"
                class="size-4"
              />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ poi.name }}</span>
              <span class="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">{{ categoryLabel(poi.category) }} · {{ poiStatusText(poi) }}</span>
            </span>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
            />
          </button>

          <div
            v-if="filteredPois.length === 0"
            class="grid min-h-32 place-items-center p-6 text-center"
          >
            <div>
              <UIcon
                name="i-lucide-map-pin-off"
                class="mx-auto size-6 text-zinc-400 dark:text-zinc-500"
              />
              <p class="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
                没有匹配的地点
              </p>
            </div>
          </div>
        </div>
      </template>
      <div
        v-if="mapSheetView === 'activity'"
        class="flex min-h-0 flex-1 flex-col md:hidden"
        data-sheet-view="activity"
      >
        <div
          data-sheet-drag-zone
          class="relative flex h-11 shrink-0 touch-none items-end justify-between gap-2 px-3 pb-1.5"
          @pointerdown="handleMobileSheetPointerDown"
        >
          <button
            type="button"
            data-sheet-drag-handle
            class="absolute left-1/2 top-1.5 h-2 w-10 -translate-x-1/2 touch-none rounded-full bg-zinc-300 active:bg-zinc-400 dark:bg-zinc-700 dark:active:bg-zinc-600"
            aria-label="上下拖动活动面板"
            @keydown.enter.prevent="toggleMobileSheetHeight"
            @keydown.space.prevent="toggleMobileSheetHeight"
            @pointerdown="handleMobileSheetPointerDown"
          />
          <p class="flex min-w-0 flex-1 items-baseline gap-1.5">
            <span class="truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">近期活动</span>
            <span class="shrink-0 text-[12px] tabular-nums text-zinc-500 dark:text-zinc-400">{{ activityHotspots.length }}<template v-if="activityListTruncated"> / {{ activityTotalCount }}</template> 个</span>
          </p>
          <button
            type="button"
            class="shrink-0 rounded-md px-2 py-0.5 text-xs font-medium text-zinc-600 active:bg-zinc-100 dark:text-zinc-300 dark:active:bg-zinc-800"
            aria-label="收起活动面板"
            @click="hideActivitySheet"
          >
            收起
          </button>
        </div>
        <div class="flex shrink-0 gap-1.5 overflow-x-auto px-3 pb-2 scrollbar-none" role="group" aria-label="活动时间筛选">
          <button
            v-for="chip in activityFilterOptions"
            :key="chip.id"
            type="button"
            class="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12px] font-medium transition-colors"
            :class="activityFilter === chip.id
              ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-200'
              : 'border-zinc-200 text-zinc-600 active:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:active:bg-zinc-800'"
            :aria-pressed="activityFilter === chip.id"
            @click="activityFilter = chip.id"
          >
            <span>{{ chip.label }}</span>
            <span class="tabular-nums text-[11px] opacity-70">{{ chip.count }}</span>
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-2 scrollbar-none" aria-label="近期活动列表">
          <div v-if="!filteredActivityHotspots.length" class="grid min-h-24 place-items-center text-[12px] text-zinc-400 dark:text-zinc-500">
            这个时间段没有活动
          </div>
          <template v-for="group in activityGroups" :key="group.label">
            <h3 class="flex items-baseline justify-between px-1 pb-0.5 pt-1.5 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
              <span>{{ group.label }}</span>
              <span class="tabular-nums">{{ group.items.length }} 场</span>
            </h3>
            <button
              v-for="hotspot in group.items"
              :key="`${hotspot.placeId}-${hotspot.startsAt}-${hotspot.title}`"
              type="button"
              class="flex h-14 w-full items-center gap-3 rounded-xl px-1 text-left active:bg-zinc-100 dark:active:bg-zinc-800"
              @click="openActivitySheetRow(hotspot)"
            >
              <span class="flex w-11 shrink-0 flex-col items-start">
                <span
                  class="text-[13px] font-semibold tabular-nums"
                  :class="hotspotDayDiff(hotspot.startsAt) <= 0 ? 'text-[var(--rose-600,#e11d48)]' : 'text-zinc-700 dark:text-zinc-200'"
                >{{ hotspotTimeLabel(hotspot.startsAt) }}</span>
                <span class="text-[11px] text-zinc-500 dark:text-zinc-400">{{ hotspotDayLabel(hotspot.startsAt) }}</span>
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{{ hotspot.title }}</span>
                <span class="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span class="h-[4.5px] w-[4.5px] shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
                  <span class="min-w-0 truncate">{{ hotspotPlaceName(hotspot.placeId) }}</span>
                  <span v-if="(hotspotTotalByPlaceId.get(hotspot.placeId) ?? 0) > 1" class="shrink-0 tabular-nums">· {{ hotspotTotalByPlaceId.get(hotspot.placeId) }} 场活动</span>
                </span>
              </span>
              <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-zinc-400" />
            </button>
          </template>
          <p
            v-if="activityListTruncated"
            class="px-1 py-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500"
          >
            每个地点最多列出 6 场，共 {{ activityTotalCount }} 场在期活动
          </p>
        </div>
        <p
          v-if="mobileSheetState === 'expanded'"
          class="shrink-0 border-t border-[var(--sheet-hairline)] px-3 py-2 text-center text-[11px] text-zinc-500 dark:text-zinc-400"
        >
          共 {{ activityTotalCount }} 个活动 · 点任意一条在地图上定位
        </p>
      </div>
      <div
        v-if="mapSheetView === 'transit'"
        class="flex min-h-0 flex-1 flex-col md:hidden"
      >
        <LazyMapTransitPanel
          variant="sheet"
          :open="false"
          :directions="transitDirections"
          :fetched-at="transitFetchedAt"
          :live="transitLive"
          :departures="transitDepartures"
          :live-error="transitLiveError"
          :selected-direction="transitSelectedDirection"
          :location="transitMyLocation"
          :drawer-open="transitDrawerOpen"
          @back="handleSheetBack()"
          @update:drawer-open="handleTransitDrawerChange($event)"
          @focus-stop="focusTransitStop($event)"
          @focus-vehicle="handleTransitVehicleFocusFromPanel($event)"
          @select-direction="changeTransitDirection($event)"
          @change-line="changeTransitLine"
        />
      </div>
      <template v-if="mapSheetView === 'bus'">
        <LazyMapBusRoutePanel
          v-if="mapSheetView === 'bus'"
          variant="sheet"
          :state="mobileSheetState"
          :open="false"
          :routes="busRoutes"
          :buses="busVehicles"
          :fetched-at="busFetchedAt"
          class="md:hidden"
          @sheet-raise="mobileSheetState = 'half'"
          @sheet-expand="mobileSheetState = 'expanded'"
          @sheet-collapse="mobileSheetState = 'half'"
          @sheet-hide="hideBusSheet()"
          @sheet-back="mapSheetView = 'sections'"
          @sheet-drag-start="handleMobileSheetPointerDown($event)"
        />
        <div
          v-if="transitVehicleFocus?.source === 'campus'"
          class="shrink-0 border-t border-zinc-100 px-4 pb-2 pt-2 dark:border-zinc-800"
        >
          <MapBusMomentsSection
            :bus-name="transitVehicleFocus.plate"
            :route-name="transitVehicleFocus.routeName ?? ''"
          />
        </div>
      </template>
    </aside>

    <section
      class="absolute inset-0 isolate min-h-0 min-w-0 overflow-hidden bg-[var(--page-bg)] md:relative md:inset-auto md:order-2"
      aria-label="校园地图"
      @click="handleMapSurfaceClick"
    >
      <div
        v-show="mapViewMode === 'geographic'"
        class="absolute inset-0"
      >
        <div
          ref="mapElement"
          tabindex="-1"
          class="h-full w-full outline-none"
        />
      </div>
      <!-- 玻璃折射画布：由 useMapGlassRefraction.attach() 在这里建 canvas。
           必须在地图之上、所有浮层之下（z-18）；浮层自己只留白纱，弯折的底图由这一层画。 -->
      <div
        ref="glassLayerElement"
        class="pointer-events-none absolute inset-0 z-[var(--z-glass)] md:hidden"
        aria-hidden="true"
      />
      <!-- 校车 ETA 胶囊：只在折叠态浮在地图上方；位置由投影 seam 给出，半屏/展开不显示。 -->
      <div
        v-if="mobileSheetState === 'collapsed'"
        ref="busEtaLayerElement"
        class="pointer-events-none absolute inset-0 z-[var(--z-glass-top)] md:hidden"
        data-bus-eta-layer
      >
        <MapBusEtaPill
          v-for="pill in busEtaPills"
          :key="pill.id"
          :pill-id="pill.id"
          :label="pill.label"
          :eta-minutes="pill.etaMinutes"
          :style="busEtaPositionerActive ? undefined : { transform: pill.transform }"
        />
      </div>

      <!-- T-040：地图层浮钮带，只在面板收起时出现；不复用 ShellDock 内部。 -->
      <div
        v-show="sheetHydrated && mobileSheetState === 'collapsed' && mapSheetView !== 'bus'"
        class="pointer-events-none absolute inset-x-3 bottom-[calc(var(--shell-dock-map-height,6.25rem)+var(--mobile-dock-inset,0.625rem)+0.875rem)] z-[var(--z-glass-top)] flex items-end justify-between md:hidden"
      >
        <button
          v-if="activityHotspots.length"
          type="button"
          class="pointer-events-auto inline-flex h-11 items-center gap-1.5 rounded-full border border-white/70 bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] px-3.5 text-[13px] font-medium text-zinc-800 shadow-lg backdrop-blur-[18px] dark:border-white/10 dark:text-zinc-100"
          aria-label="查看附近活动"
          @click="openActivitySheet"
        >
          <span
            class="size-1.5 rounded-full bg-rose-500"
            aria-hidden="true"
          />
          附近 {{ activityHotspots.length }} 个活动
        </button>
        <button
          type="button"
          class="pointer-events-auto ml-auto inline-flex h-11 items-center gap-1.5 rounded-full border border-[var(--bus-accent-line)] bg-[var(--bus-accent-soft)] px-3.5 text-[13px] font-medium text-[color-mix(in_srgb,var(--bus-accent)_88%,black)] shadow-lg backdrop-blur-[18px] dark:text-[var(--bus-accent)]"
          aria-label="打开叮叮车"
          @click="openBusSheet"
        >
          <UIcon
            name="i-lucide-bus-front"
            class="size-4 shrink-0"
          />
          {{ nextBusEtaMinutes === null ? '叮叮车' : `叮叮车 ${nextBusEtaMinutes}′` }}
        </button>
      </div>
      <!-- 点位浮窗：原生 popover + CSS anchor positioning，压在 ETA 胶囊与玻璃层之上 -->
      <MapPinPopover
        v-if="pinCard"
        ref="pinPopoverElement"
        :open="Boolean(pinAnchor)"
        :glass="mapGlassActive"
        :anchor="pinAnchor"
        :arrow="!pinDetached"
        :kind="pinSelection?.kind"
        :tone="pinCard.tone"
        :icon="pinCard.icon"
        :title="pinCard.title"
        :subtitle="pinCard.subtitle"
        :chips="pinCard.chips"
        :rows="pinCard.rows"
        :eta="pinCard.eta"
        :actions="pinCard.actions"
        :meta="pinCard.meta"
        :meta-action="pinCard.metaAction"
        @action="handlePinAction"
        @close="handlePinPopoverClosed"
      />
      <!-- 移动端浮层（<768px）：搜索胶囊 / 分类 chips / 底图来源条 / 右侧定位与列表。
           桌面端整块 md:hidden，侧栏保持原样。 -->
      <div
        class="pointer-events-none absolute inset-x-0 top-0 z-[var(--z-overlay)] flex flex-col gap-2 px-[10px] pt-[calc(env(safe-area-inset-top)+8px)] md:hidden"
      >
        <div
          v-show="mobileSheetState === 'collapsed'"
          ref="glassChipsElement"
          class="map-glass-shell pointer-events-auto grid w-full grid-flow-col auto-cols-[calc((100%_-_28px)/5)] grid-rows-1 gap-[7px] overflow-x-auto overscroll-x-contain rounded-[17px] p-1"
          :class="mapGlassActive ? 'map-glass-refracting' : 'map-glass-surface'"
          aria-label="地点分类"
        >
          <button
            v-for="category in categories"
            :key="category.id"
            type="button"
            class="flex h-[34px] min-h-0 shrink-0 items-center justify-center gap-1 rounded-[17px] px-0 text-[13px] font-medium transition-colors"
            :class="activeCategory === category.id
              ? 'bg-[var(--ink)] text-[var(--surface)]'
              : 'text-zinc-700 dark:text-zinc-200'"
            :aria-pressed="activeCategory === category.id"
            @click="setCategory(category.id)"
          >
            <span
              v-if="activeCategory === category.id"
              class="size-1.5 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--surface)_90%,transparent)]"
              aria-hidden="true"
            />
            {{ category.label }}
          </button>
        </div>

        <div
          ref="glassSourceElement"
          class="map-glass-shell pointer-events-auto flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-700 dark:text-zinc-200"
          :class="mapGlassActive ? 'map-glass-refracting' : 'map-glass-surface'"
        >
          <span
            class="size-1.5 shrink-0 rounded-full bg-green-600 dark:bg-green-400"
            aria-hidden="true"
          />
          {{ resolveMobileSourceSummary() }}
        </div>
      </div>

      <PublicPageViewStats
        variant="map-dock"
        class="map-view-stats-mini"
      />

      <MapOfficialCampusPlan
        v-if="canShowOfficialPlan && mapViewMode === 'official-plan'"
        :selected-map-number="selectedOfficialPlanNumber(selectedPoi)"
        :selected-reference-label="selectedPoi?.referenceLabel"
        :selected-place-name="selectedPoi?.name"
        @select-number="selectOfficialPlanNumber"
      />

      <!-- 徽章区：移动端左上角竖排不动；桌面端右下角，flex-col-reverse 使「长在下短在上」、底部对齐 -->
      <!-- 移动端不再显示这排徽章：新浮层里的「来源条」已经报了同样三条信息（高德 / 公交 / 减速带），
           两处并存会在 390px 宽度下压住搜索胶囊（实测徽章 top=12 与搜索框 top=61 重叠）。
           桌面端位置与内容保持原样。 -->
      <div class="pointer-events-none absolute inset-x-3 top-3 z-[var(--z-overlay)] hidden flex-col items-start md:inset-x-auto md:right-4 md:top-auto md:bottom-14 md:flex md:items-end">
        <div class="map-provider-badges flex flex-col items-start gap-1.5 md:flex-col-reverse md:items-end">
          <!-- 桌面端 DOM 顺序按实测宽度从长到短排列：reverse 后视觉上短在上、长在下 -->
          <div
            v-if="mapViewMode === 'geographic' && transitLinesOpen"
            class="app-bar pointer-events-auto flex items-center gap-2.5 rounded-md border border-zinc-200/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:text-zinc-200"
          >
            <span class="flex items-center gap-1">
              <i class="size-2 rounded-full bg-[#1a6cf5]" />
              K2
            </span>
            <span class="flex items-center gap-1">
              <i class="size-2 rounded-full bg-[#e8590c]" />
              K6
            </span>
            <span class="text-zinc-500 dark:text-zinc-400">校外公交</span>
          </div>
          <UBadge
            color="neutral"
            variant="solid"
            class="pointer-events-auto shadow-sm"
          >
            <UIcon
              :name="mapViewMode === 'official-plan'
                ? 'i-lucide-image'
                : activeMapProviderId === 'amap'
                  ? 'i-lucide-map'
                  : 'i-lucide-flask-conical'"
              class="mr-1 size-3.5"
            />
            {{ mapViewMode === 'official-plan'
              ? '学校平面图'
              : activeMapProviderId === 'amap'
                ? '高德地图'
                : '校园范围参考底图' }}
          </UBadge>
          <UBadge
            v-if="mapViewMode === 'geographic' && activeMapProviderId !== 'amap'"
            color="success"
            variant="solid"
            class="pointer-events-auto shadow-sm"
          >
            <UIcon
              name="i-lucide-pentagon"
              class="mr-1 size-3.5"
            />
            校园范围参考
          </UBadge>
          <div
            v-if="mapViewMode === 'geographic' && speedBumpsVisible"
            class="app-bar pointer-events-auto flex items-center gap-1.5 rounded-md border border-zinc-200/90 px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm dark:border-zinc-700 dark:text-zinc-200"
          >
            <i class="h-2.5 w-4 rounded-sm border border-zinc-500 bg-[repeating-linear-gradient(135deg,#facc15_0_3px,#18181b_3px_6px)]" />
            减速带 27
          </div>
        </div>
      </div>

      <!-- 展开地点栏：侧栏收起后桌面的唯一入口，固定在左上角（不放右下角徽章堆里） -->
      <div class="pointer-events-none absolute left-3 top-3 z-[var(--z-overlay)] hidden md:left-4 md:top-4 md:block">
        <UTooltip
          v-if="sidebarCollapsed"
          text="展开地点栏"
        >
          <UButton
            icon="i-lucide-panel-left-open"
            color="neutral"
            variant="solid"
            class="justify-center pointer-events-auto size-11 shadow-sm"
            aria-label="展开地点栏"
            @click="() => { sidebarCollapsed = false }"
          />
        </UTooltip>
      </div>

      <!-- 视图切换 + 右侧工具栏：保持在顶部一行（工具栏靠右） -->
      <div class="pointer-events-none absolute inset-x-3 top-3 z-[var(--z-overlay)] flex items-start justify-end gap-3 md:inset-x-4 md:top-4">
        <div
          v-if="canShowOfficialPlan"
          class="pointer-events-auto absolute left-1/2 top-0 flex -translate-x-1/2 overflow-hidden rounded-md border border-white/40 bg-[var(--surface)] shadow-sm"
          role="group"
          aria-label="地图显示模式"
        >
          <UButton
            icon="i-lucide-map"
            label="地图"
            size="sm"
            :color="mapViewMode === 'geographic' ? 'primary' : 'neutral'"
            :variant="mapViewMode === 'geographic' ? 'solid' : 'ghost'"
            :class="['min-h-11 rounded-none px-3', mapViewMode === 'geographic' ? '!bg-green-800 !text-white' : '']"
            :aria-pressed="mapViewMode === 'geographic'"
            @click="setMapViewMode('geographic')"
          />
          <UButton
            icon="i-lucide-image"
            label="平面图"
            size="sm"
            :color="mapViewMode === 'official-plan' ? 'primary' : 'neutral'"
            :variant="mapViewMode === 'official-plan' ? 'solid' : 'ghost'"
            :class="['min-h-11 rounded-none px-3', mapViewMode === 'official-plan' ? '!bg-green-800 !text-white' : '']"
            :aria-pressed="mapViewMode === 'official-plan'"
            @click="setMapViewMode('official-plan')"
          />
        </div>
        <div
          v-if="mapViewMode === 'geographic'"
          class="app-bar pointer-events-auto flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800 overflow-hidden rounded-xl border border-zinc-200/90 shadow-lg hidden md:flex"
        >
          <UTooltip :text="transitLinesOpen ? '隐藏 K2 / K6 校外公交线路' : '显示 K2 / K6 校外公交线路'">
            <UButton
              icon="i-lucide-bus-front"
              color="neutral"
              variant="ghost"
              :loading="transitLoading"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="transitLinesOpen ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300' : ''"
              aria-label="显示 K2 / K6 校外公交线路"
              :aria-pressed="transitLinesOpen"
              @click="toggleTransitLines"
            />
          </UTooltip>
          <UTooltip :text="speedBumpsVisible ? '隐藏校园减速带（27 处）' : '显示校园减速带（27 处）'">
            <UButton
              icon="i-lucide-triangle-alert"
              color="neutral"
              variant="ghost"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="speedBumpsVisible ? 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300' : ''"
              aria-label="显示校园减速带"
              :aria-pressed="speedBumpsVisible"
              @click="toggleSpeedBumps"
            />
          </UTooltip>
          <UTooltip :text="basemapLabelsVisible ? '底图注记：全部显示（含校内）' : '底图注记：只显示校外'">
            <UButton
              icon="i-lucide-type"
              color="neutral"
              variant="ghost"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="basemapLabelsVisible ? 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300' : ''"
              aria-label="切换底图注记显示范围"
              :aria-pressed="basemapLabelsVisible"
              @click="toggleBasemapLabels"
            />
          </UTooltip>
          <UTooltip text="地图显示设置">
            <UButton
              icon="i-lucide-layers-3"
              color="neutral"
              variant="ghost"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="displaySettingsOpen ? 'bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-300' : ''"
              aria-label="地图显示设置"
              :aria-expanded="displaySettingsOpen"
              @click="toggleDisplaySettings($event)"
            />
          </UTooltip>
          <UTooltip text="显示全部地点">
            <UButton
              icon="i-lucide-scan"
              color="neutral"
              variant="ghost"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              aria-label="显示全部地点"
              @click="fitToVisiblePois"
            />
          </UTooltip>
          <UTooltip :text="tracking ? '停止实时定位' : '开启实时定位'">
            <UButton
              :icon="tracking ? 'i-lucide-locate-fixed' : 'i-lucide-locate'"
              color="neutral"
              variant="ghost"
              :loading="locating"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="tracking ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300' : ''"
              :aria-label="tracking ? '停止实时定位' : '开启实时定位'"
              :aria-pressed="tracking"
              @click="tracking ? toggleTracking() : locateUser()"
            />
          </UTooltip>
          <UTooltip :text="following ? '暂停相机跟随' : '相机跟随我的位置'">
            <UButton
              icon="i-lucide-crosshair"
              color="neutral"
              variant="ghost"
              :disabled="!tracking"
              class="justify-center map-control-btn size-10 rounded-none md:size-11"
              :class="following ? 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300' : ''"
              aria-label="相机跟随我的位置"
              :aria-pressed="following"
              @click="toggleFollowing"
            />
          </UTooltip>
        </div>
      </div>

      <Transition
        name="pv-origin"
        @before-enter="applyDisplaySettingsOrigin"
      >
        <MapDisplaySettingsPanel
          v-if="mapViewMode === 'geographic' && displaySettingsOpen"
          :base-style="mapBaseStyle"
          :display-options="mapDisplayOptions"
          :glass-refraction="glassEnabled"
          @close="displaySettingsOpen = false"
          @set-base-style="setMapBaseStyle"
          @toggle-option="toggleDisplayOption"
          @set-label-size="setLabelSize"
          @set-glass-refraction="setGlassRefraction"
        />
      </Transition>

      <div
        v-if="mapViewMode === 'geographic' && routeSummary"
        class="app-bar absolute left-1/2 z-[var(--z-overlay)] flex -translate-x-1/2 items-center gap-3 rounded-md border border-green-200 dark:border-green-800 px-4 py-3 shadow-lg md:bottom-14"
        :class="selectedPoi
          ? 'bottom-[calc(var(--mobile-nav-height)+var(--mobile-dock-inset)+var(--mobile-dock-extra,0rem)+min(56dvh,30rem)+1rem)]'
          : 'bottom-[calc(var(--mobile-nav-height)+var(--mobile-dock-inset)+var(--mobile-dock-extra,0rem)+5.5rem)]'"
        role="status"
      >
        <UIcon
          name="i-lucide-route"
          class="size-5 shrink-0 text-green-700 dark:text-green-400"
        />
        <button
          type="button"
          class="flex min-w-0 items-center gap-2 whitespace-nowrap text-left"
          :aria-expanded="routeStepsOpen"
          :aria-label="routeSteps.length ? '展开路口级步行指引' : undefined"
          @click="routeStepsOpen = !routeStepsOpen"
        >
          <span class="min-w-0">
            <span class="block max-w-48 truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              步行至 {{ routeDestinationName }}
            </span>
            <span class="mt-0.5 block text-xs text-zinc-600 dark:text-zinc-300">
              <template v-if="tracking && remainingSummary">
                距目的地 {{ routeSummaryText(remainingSummary) }}
                <span class="text-zinc-400 dark:text-zinc-500">（实时）</span>
              </template>
              <template v-else>
                {{ routeSummaryText(routeSummary) }}
              </template>
            </span>
          </span>
          <UIcon
            v-if="routeSteps.length"
            name="i-lucide-chevron-up"
            class="size-4 shrink-0 text-zinc-400 transition-transform dark:text-zinc-500"
            :class="routeStepsOpen ? '' : 'rotate-180'"
          />
        </button>
        <UButton
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="清除步行路线"
          @click="clearWalkingRoute"
        />
      </div>

      <!-- 手动选起点（定位被拒/不可用时的降级） -->
      <UModal
        v-model:open="manualStartOpen"
        title="选择出发地点"
        :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-md' }"
      >
        <template #body>
          <ul class="space-y-1">
            <li
              v-for="anchor in startAnchors"
              :key="anchor.id"
            >
              <button
                type="button"
                class="flex min-h-11 w-full items-center gap-2.5 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-2 text-left transition hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50 dark:hover:bg-green-950/60"
                @click="planFromAnchor(anchor.name, anchor.point)"
              >
                <UIcon
                  :name="categoryIcon(anchor.category)"
                  class="size-4 shrink-0 text-green-700 dark:text-green-400"
                />
                <span class="min-w-0">
                  <span class="block truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{{ anchor.name }}</span>
                  <span class="block text-[11px] text-zinc-500 dark:text-zinc-400">设为起点，步行至 {{ manualStartPick?.destinationName }}</span>
                </span>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="ml-auto size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
                />
              </button>
            </li>
          </ul>
        </template>
      </UModal>

      <!-- 路口级步行指引（点路线条展开） -->
      <div
        v-if="mapViewMode === 'geographic' && routeSummary && routeStepsOpen && routeSteps.length"
        class="app-bar absolute left-1/2 z-[var(--z-overlay)] w-72 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-md border border-green-200 dark:border-green-800 shadow-lg md:bottom-14"
        :class="selectedPoi
          ? 'bottom-[calc(var(--mobile-nav-height)+var(--mobile-dock-inset)+var(--mobile-dock-extra,0rem)+min(56dvh,30rem)+3.5rem)]'
          : 'bottom-[calc(var(--mobile-nav-height)+var(--mobile-dock-inset)+var(--mobile-dock-extra,0rem)+8rem)]'"
        role="list"
        aria-label="步行指引分段"
      >
        <ol class="max-h-52 overflow-y-auto">
          <li
            v-for="(step, index) in routeSteps"
            :key="index"
            class="flex items-start gap-2 border-b border-zinc-100 dark:border-zinc-800 px-3 py-2 text-xs leading-5 last:border-b-0"
          >
            <UIcon
              name="i-lucide-corner-down-right"
              class="mt-0.5 size-3.5 shrink-0 text-green-700 dark:text-green-400"
            />
            <span class="min-w-0 flex-1 text-zinc-700 dark:text-zinc-200">{{ step.instruction }}</span>
            <span class="shrink-0 text-zinc-400 dark:text-zinc-500">{{ step.distanceMeters >= 1000 ? (step.distanceMeters / 1000).toFixed(1) + ' 公里' : Math.round(step.distanceMeters) + ' 米' }}</span>
          </li>
        </ol>
      </div>

      <div
        v-if="mapViewMode === 'geographic' && mapStatus !== 'ready'"
        class="absolute inset-0 z-10 grid place-items-start p-4 pt-32 text-center md:place-items-center md:p-6"
        :class="mapStatus === 'loading' ? 'pointer-events-auto bg-[var(--page-bg)]/95' : 'pointer-events-none'"
        :role="mapStatus === 'loading' ? 'status' : 'alert'"
      >
        <div v-if="mapStatus === 'loading'">
          <UIcon
            name="i-lucide-loader-circle"
            class="mx-auto size-7 animate-spin text-green-700 dark:text-green-400"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            正在载入地图
          </p>
        </div>
        <div
          v-else
          class="app-bar pointer-events-auto max-w-sm rounded-lg border border-zinc-200 dark:border-zinc-800 p-5 shadow-lg"
        >
          <UIcon
            name="i-lucide-map-pin-off"
            class="mx-auto size-8 text-zinc-500 dark:text-zinc-400"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            地图画面暂时没有显示出来
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {{ mapErrorMessage }}
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <UButton
              icon="i-lucide-refresh-cw"
              label="重新试一次"
              color="neutral"
              variant="outline"
              size="sm"
              class="min-h-11"
              @click="mountMap"
            />
            <UButton
              v-if="canShowOfficialPlan"
              icon="i-lucide-map"
              label="查看学校平面图"
              color="neutral"
              variant="ghost"
              size="sm"
              class="min-h-11"
              @click="setMapViewMode('official-plan')"
            />
          </div>
        </div>
      </div>

      <div
        v-else-if="mapViewMode === 'geographic' && filteredMapPois.length === 0"
        class="pointer-events-none absolute inset-x-4 top-32 z-10 flex justify-center md:top-20"
        role="status"
      >
        <div class="app-bar max-w-sm border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-center shadow-sm">
          <UIcon
            name="i-lucide-map-pin-off"
            class="mx-auto size-5 text-zinc-500 dark:text-zinc-400"
          />
          <p class="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {{ mapSheetSearching ? '没有匹配的地点' : '当前地图还没有可直接显示的地点' }}
          </p>
          <UButton
            v-if="canShowOfficialPlan"
            :to="safeExternalHref(officialSources.campusMap.url) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-external-link"
            label="查看学校平面图"
            color="neutral"
            variant="outline"
            size="sm"
            class="pointer-events-auto mt-3"
          />
        </div>
      </div>

      <section
        v-if="selectedArea"
        class="absolute left-3 z-[var(--z-sheet)] w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] p-4 shadow-xl md:bottom-12 md:left-4"
        :class="mobileSheetState === 'collapsed' || selectedPoi
          ? 'bottom-[calc(var(--mobile-nav-height)+var(--mobile-dock-inset)+var(--mobile-dock-extra,0rem)+0.75rem)] md:bottom-12'
          : 'bottom-[calc(44%+1rem)] md:bottom-12'"
        aria-live="polite"
      >
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-400">
              <UIcon
                name="i-lucide-pentagon"
                class="size-4"
              />
              地图范围
            </div>
            <h2 class="mt-1 text-base font-bold text-zinc-950 dark:text-zinc-100">
              {{ selectedArea.name }}
            </h2>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            aria-label="关闭区域详情"
            @click="closeAreaDetails"
          />
        </div>
        <dl class="mt-3 grid grid-cols-2 gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs">
          <div>
            <dt class="text-zinc-400 dark:text-zinc-500">
              面积
            </dt>
            <dd class="mt-1 font-medium text-zinc-800 dark:text-zinc-100">
              {{ formatAreaSquareMeters(selectedArea.areaSquareMeters) }}
            </dd>
          </div>
          <div>
            <dt class="text-zinc-400 dark:text-zinc-500">
              周长
            </dt>
            <dd class="mt-1 font-medium text-zinc-800 dark:text-zinc-100">
              {{ formatPerimeter(selectedArea.perimeterMeters) }}
            </dd>
          </div>
        </dl>
      </section>

      <MapPlaceDetailsPanel
        v-if="selectedPoi && panelIsDesktop"
        variant="desktop"
        :place="selectedPoi"
        :category-label="categoryLabel(selectedPoi.category)"
        :category-icon="categoryIcon(selectedPoi.category)"
        :status-text="poiStatusText(selectedPoi)"
        :checklist="poiUseChecklist(selectedPoi)"
        :details-target="placeDetailsTarget(selectedPoi)"
        :feedback-target="placeFeedbackTarget(selectedPoi)"
        :return-path="returnPath"
        :route-planning="routePlanning"
        :can-plan-route="canPlanMapWalkingRoute(activeMapProviderId, selectedPoi.point)"
        :is-wechat="isWechat"
        :favorite="isFavorite(selectedPoi.id)"
        @close="clearPoi"
        @toggle-favorite="toggleFavorite(selectedPoi.id)"
        @copy="copyPoiLocation(selectedPoi)"
        @plan-route="startWalkingRoute(selectedPoi.name, selectedPoi.point)"
        @plan-route-manual="openManualStartPicker"
      />
    </section>

    <!-- 掌上公交式校车面板：线路总览 + 车辆进度 + 预计距离 -->
    <LazyMapBusRoutePanel
      v-model:open="busPanelOpen"
      :routes="busRoutes"
      :buses="busVehicles"
      :fetched-at="busFetchedAt"
      :left-offset="sidebarCollapsed ? '1rem' : '19rem'"
      :user-location="userLocation"
      @select-route="busSelectedRouteId = $event"
    />

    <!-- 校外公交面板：K2/K6 方向可展开看站序 -->

    <LazyMapTransitPanel
      v-if="transitLinesOpen && panelIsDesktop"
      v-model:open="transitPanelOpen"
      :directions="transitDirections"
      :fetched-at="transitFetchedAt"
      :live="transitLive"
      :departures="transitDepartures"
      :live-error="transitLiveError"
      :selected-direction="transitSelectedDirection"
      :location="transitMyLocation"
      :left-offset="sidebarCollapsed ? '1rem' : '19rem'"
      @focus-stop="focusTransitStop"
      @focus-vehicle="focusTransitVehicleFromPanel"
      @select-direction="changeTransitDirection"
      @change-line="changeTransitLine"
    />
  </div>
</template>

<style>
.map-workspace {
  height: 100%;
  min-height: 0;
  overscroll-behavior: none;
  contain: layout paint;
}

.map-workspace .maplibregl-map {
  position: absolute;
  inset: 0;
}

.map-workspace .maplibregl-ctrl-bottom-left,
.map-workspace .maplibregl-ctrl-bottom-right {
  bottom: 0.5rem;
}

/*
 * 缩放/指南针控件（.map-zoom-dock，挂 top-right）。
 * 桌面端下移到右侧工具栏正下方：工具栏 top-4(16px) 起、7×44px + 6×1px ≈ 310px，
 * 21rem(336px) = 16 + 310 + 10px 间隙；margin-right 1rem 让右边缘与工具栏对齐。
 * 移动端同样下移到工具栏正下方（右边缘对齐，button 收到 40×40 与工具栏一致）：
 * margin-top 相对 .maplibregl-ctrl-top-right（该容器内缩到地图顶边，实测 top=49px），
 * 与视口坐标差一个地图顶边，所以用实测算式
 *   工具栏 bottom(343) − ctrl 容器 top(49) + 8px 间隙 = 302px = 18.875rem
 * （390×844 下工具栏 282px 高 = 7×40px button + 2px 容器边框，分隔线是
 *  border-box 内含的 1px 不额外占高；工具栏自 top-3 起于 61、止于 343）。
 * 顶栏高度从 65 改到 49 后（P-009），工具栏与 ctrl 容器同步上移 16px，两者差值不变，
 * 所以上面的 302px 仍然成立。
 * margin-right 0.75rem 与工具栏右边缘（right-3 = 12px）对齐。
 */
.map-workspace .maplibregl-ctrl-top-right .map-zoom-dock {
  margin-top: 21rem;
  margin-right: 1rem;
}

@media (max-width: 767px) {
  /*
   * 窄屏：工具栏占着右上角，控件挪到它正下方并右边缘对齐。
   * 18.875rem(302px) = 工具栏 bottom(343) − ctrl 容器 top(49) + 8px 间隙。
   * ⚠️ 该值耦合了「移动端工具栏 = 7 个 40px 按钮 + 2px 边框」这一事实：
   * 工具栏按钮增减、或 .maplibregl-ctrl button 的移动端 40px 再调整，
   * 都需要重新量算这个 margin-top，否则控件会静默错位。
   */
  .map-workspace .maplibregl-ctrl-top-right .map-zoom-dock {
    margin-top: 18.875rem;
    margin-right: 0.75rem;
  }

  /* 覆盖后面 44px 的全局规则，与移动端工具栏 button（size-10）一致。 */
  .map-workspace .maplibregl-ctrl-top-right .map-zoom-dock button {
    width: 40px;
    height: 40px;
  }
}

/*
 * 宽 ≥768 但视口矮：桌面规则把 dock 顶边推到 409、底边 541，
 * 视口高 < 541 时会被地图 overflow 裁掉，844×390 下 visibleRatio 实测为 0。
 * 退回「贴右上、靠工具栏左侧」：桌面工具栏 right-4(16px) + 宽 46px → 左边缘 W−62，
 * 留 8px 间隙 → dock 右边缘 W−70 → margin-right 4.375rem。
 * 34.375rem(550px) 的由来：桌面 dock 底边 541 + 9px 余量，且不会误伤 1366×768 这类桌面。
 * 与下面的窄屏兜底块媒体条件互斥（min-width 768 vs max-width 767），互不覆盖。
 */
@media (min-width: 768px) and (max-height: 34.375rem) {
  .map-workspace .maplibregl-ctrl-top-right .map-zoom-dock {
    margin-top: 0.75rem;
    margin-right: 4.375rem;
  }
}

/*
 * 窄屏且极矮（≤559px 高）：工具栏占着右上角，302px 的下移量会把 dock 底边
 * 固定到 487，宽 <768 时地图底边 = 视口高 − 73，所以视口 <560 就开始裁切
 * （500px 高时 visibleRatio 只有 0.500）。此时同样退回「贴右上、靠工具栏左侧」。
 * 断点取 34.9375rem(559px) 而不是 480px：481–559 这条裁切带需要兜底；
 * 而 560px 恰好是「dock 底边 487 = 地图底边 487」的临界点，完全可见（ratio 1.000），
 * 所以 560 必须走正常规则。若写成 35rem(560px)，因 max-height 是闭区间，
 * 390×560 会被误判进兜底分支、位置退到 294,77，与验收表期望的 338,367 不符。
 * margin-right 3.5rem(56px) 按窄屏工具栏 right-3(12) + 宽 42 + 2px 间隙算。
 * 工具栏本身的收纳是另一个问题，不在这里处理。
 */
@media (max-width: 767px) and (max-height: 34.9375rem) {
  .map-workspace .maplibregl-ctrl-top-right .map-zoom-dock {
    margin-top: 0.75rem;
    margin-right: 3.5rem;
  }
}

/*
 * 版权条与比例尺现在都在左下角容器里：竖排（版权在上、比例尺在下）。
 * 版权条留在右下角会与「N 人看过」统计重叠（实测 168×20）。
 */
.map-workspace .maplibregl-ctrl-attrib {
  margin: 0;
}

.map-workspace .maplibregl-ctrl-bottom-left {
  display: flex;
  flex-direction: column-reverse;
  align-items: flex-start;
  gap: 4px;
}

.map-workspace .maplibregl-ctrl-group {
  border-radius: 6px;
  box-shadow: 0 1px 5px rgb(0 0 0 / 14%);
}

.map-workspace .maplibregl-ctrl button {
  width: 44px;
  height: 44px;
}

.map-workspace .maplibregl-canvas:focus-visible {
  outline: 2px solid var(--color-green-600);
  outline-offset: -2px;
}

.map-workspace .map-place-list {
  overscroll-behavior-y: contain;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable;
  touch-action: pan-y;
}

.map-workspace :deep(.map-float-btn),
.map-workspace :deep(button.map-float-btn) {
  background: var(--surface) !important;
  background-color: var(--surface) !important;
  color: var(--ink) !important;
  border: 1px solid var(--line) !important;
  box-shadow: 0 2px 12px rgb(0 0 0 / 18%) !important;
  --ui-bg: var(--surface);
  --ui-text: var(--ink);
  --ui-border: var(--line);
}

.map-workspace :deep(.map-float-btn:hover),
.map-workspace :deep(button.map-float-btn:hover) {
  background: var(--surface-sunken) !important;
  background-color: var(--surface-sunken) !important;
}

.map-workspace :deep(.map-float-btn:disabled),
.map-workspace :deep(button.map-float-btn:disabled) {
  background: var(--surface) !important;
  opacity: 0.75;
}

.map-workspace :deep(.map-control-btn),
.map-workspace :deep(button.map-control-btn) {
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  color: var(--ink) !important;
}

.map-workspace :deep(.map-control-btn:hover),
.map-workspace :deep(button.map-control-btn:hover) {
  background: var(--surface-sunken) !important;
}

.map-workspace :deep(.map-control-btn:focus-visible),
.map-workspace :deep(button.map-control-btn:focus-visible) {
  position: relative;
  z-index: 1;
  outline: 2px solid var(--color-green-600);
  outline-offset: -2px;
}

.map-workspace :deep(.map-float-btn .iconify),
.map-workspace :deep(.map-float-btn svg),
.map-workspace :deep(.map-float-btn [class*="i-lucide"]) {
  color: var(--ink) !important;
  opacity: 1 !important;
}

/* At 320px the provider badge and centered view switch share the same row. */
@media (max-width: 359px) {
  .map-workspace .map-provider-badges {
    padding-top: 3.25rem;
  }
}

/*
 * 移动端玻璃浮层（T-018）
 * 真折射由 useMapGlassRefraction 的 WebGL 层画（挂在地图 section 内、z-18），
 * DOM 这层只留一层白纱，所以 .map-glass-refracting 时不再叠 backdrop-filter ——
 * 叠了等于把弯折过的底图又糊一遍，08-WebGL全屏折射 那种「楼在玻璃里折」的观感就没了。
 * WebGL2 缺失 / 上下文丢失 / 用户关掉开关 → ready=false → 换回 .map-glass-surface。
 * 选择器都带 .map-workspace 前缀：这段 style 没有 scoped（原有的 .maplibregl-* 规则
 * 必须作用到 maplibre 自己建的 DOM），所以靠前缀把影响面锁在地图页。
 */
@media (max-width: 767px) {
  .map-workspace .map-glass-shell {
    border: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
    box-shadow: 0 6px 20px rgb(0 0 0 / 12%);
  }

  .map-workspace .map-glass-surface {
    background: color-mix(in srgb, var(--surface) 62%, transparent);
    backdrop-filter: blur(12px) saturate(1.15);
  }

  /* 分类条要横向滑动，但原生滚动条会压在玻璃下沿，看着像多出一条亮带。
     改成隐藏滚动条 + 右端自然截断（第 6 个只露一半），滑动提示交给内容本身。 */
  .map-workspace .map-glass-shell[aria-label='地点分类'] {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .map-workspace .map-glass-shell[aria-label='地点分类']::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .map-workspace .map-glass-refracting {
    background: color-mix(in srgb, var(--surface) 44%, transparent);
    backdrop-filter: none;
  }

  /* 底栏搜索框浮在地图上，占位文字要压得住底图（暗色尤其） */
  /* T-031 B3：高度过渡只有 320ms，站列底部渐隐的 mask 会在这段时间里对面积不断变化的
     整块面板重建合成层。过渡期先摘掉 mask，结束自动恢复；肉眼只差一条 24px 柔边。 */
  .map-workspace[data-sheet-transition='on'] [data-bus-stops-fade] {
    /* 面板的 mask 写在组件内联 style 上，普通声明会被内联压过，必须 !important 才真正摘掉 */
    mask-image: none !important;
    -webkit-mask-image: none !important;
  }

  .map-workspace input[aria-label='搜索地图地点']::placeholder {
    color: color-mix(in srgb, var(--muted-ink) 82%, transparent);
  }

  /* T-023：面板重新成为折射 target（见 resolveGlassTargets）。
     折射不可用（WebGL 缺 VAO / 用户关掉玻璃）时回落到下面同一条：66% 白纱 + blur(2px) saturate(1.05)。
     T-033 R7（F-44）：R4 之前这条是 90% + blur(16px)，玻璃没就绪时整块发雾，与折射态差一截，
     用户读成「有时候雾蒙蒙的」；现在两态同一条，跳变消失，.map-glass-refracting 只作语义标记。 */
  .map-workspace .map-glass-sheet {
    background: color-mix(in srgb, var(--surface) 96%, transparent);
    backdrop-filter: blur(2px) saturate(1.05);
  }

  /* T-023：面板重新成为折射 target，白纱降到 72%、blur 收到 2px，让弯折的底图色带透出来。
     72% 是 390×844 半屏态 13px 标签可读性实测值（72%–82% 区间取偏透一端）。 */
  .map-workspace .map-glass-sheet.map-glass-refracting {
    background: transparent;
    backdrop-filter: none;
  }

  /* 原生 search 的取消钮与自绘「清空搜索」会并成两个 ×；appearance:none 挡不住伪元素，只能显式隐藏。 */
  /* dock 的输入框在 layout 里（不在 .map-workspace 内），同样会多出一个原生叉，一起收进这条规则。 */
  .shell-dock-search input[type='search']::-webkit-search-cancel-button,
  .shell-dock-search input[type='search']::-webkit-search-decoration,
  .map-workspace input[type='search']::-webkit-search-cancel-button,
  .map-workspace input[type='search']::-webkit-search-decoration {
    display: none;
  }

  /*
   * T-019：面板上沿之上的浮动带。--map-mobile-dock 由页面按面板实测高度写进根节点（152+12=164 起）。
   * 三件（校车胶囊 / 浏览数 / 高德 attribution）共用同一条基线，确保零重叠：
   *   1 档 = 基线（浏览数靠左、校车胶囊靠右）
   *   2 档 = 基线上方 38px（高德 logo + 版权，抬出面板，避免被 72% 白纱压住）
   */
  .map-workspace .map-mobile-dock {
    position: absolute;
    left: 0.75rem;
    z-index: 20;
    bottom: var(--map-mobile-dock, 10.25rem);
  }

  /* 组件根自己是 absolute bottom-3 right-3，这里让它在包装层里静态排版；
     max-width 也要放开：它的 max-w-[calc(100%-7rem)] 原本按地图区宽度算，
     进了包装层会按包装层宽度再减 112px，把胶囊压成 70px、文字溢出。 */
  .map-workspace .map-mobile-dock > * {
    position: static;
    max-width: none;
  }

  .map-workspace .amap-logo {
    bottom: 3px;
    z-index: 40;
    opacity: 0.4;
    pointer-events: none;
  }

  .map-workspace .amap-copyright {
    bottom: 6px;
    z-index: 40;
    font-size: 9px;
    line-height: 1.2;
    opacity: 0.4;
    pointer-events: none;
    background: transparent;
  }

  /* impl/05：折叠态面板收起，底栏搜索块占住底部，校车浮标上移让位 */
  .map-workspace[data-sheet-state='collapsed'] .map-mobile-dock {
    bottom: calc(var(--map-mobile-dock, 0px) + 87px);
  }

  /* 搜索胶囊右侧的玻璃方块：与胶囊同色系，不再是白圆片 */
  .map-workspace .map-glass-square {
    background: color-mix(in srgb, var(--surface) 62%, transparent);
  }

  .map-workspace .map-glass-square:hover {
    background: color-mix(in srgb, var(--surface) 78%, transparent);
  }

  /* 面板展开（上沿已顶到搜索胶囊）时，浮动带没有空间，整条收起，避免穿模 */
  .map-workspace[data-sheet-state='expanded'] .map-mobile-dock {
    display: none;
  }

  /* 2026-11-23：面板变成浮起来的玻璃卡片后，压在它背后的两行小字会透过 66% 白纱显出来
     （右下「N 人看过」统计 + maplibre 原生 © 条），看起来像脏字。收起态才需要它们，面板一开就藏。 */
  .map-workspace[data-sheet-state='half'] .map-view-stats-mini,
  .map-workspace[data-sheet-state='expanded'] .map-view-stats-mini,
  .map-workspace[data-sheet-state='half'] .maplibregl-ctrl-bottom-left,
  .map-workspace[data-sheet-state='expanded'] .maplibregl-ctrl-bottom-left {
    visibility: hidden;
  }

  /* 用户 2026-11-23：展开态 dock 与面板合体（dock 成为面板底部一行导航），
     面板滚动区留出导航行高度，最后一排分类/活动不被压住。 */
  /* 用户 2026-11-23（D 方案）：「我下面要圆角呀，不要和屏幕底部接触」——
     面板左右内收 10px 与 dock 同宽，整块离屏幕底留 --map-float-gap（10px + 安全区），
     下两角交给 dock（0 0 26px 26px）：面板下沿必须是方的，否则两角会各留一个
     26px 的缺口，和底栏对不上（用户 m04559「你这对齐了吗」）。 */
  .map-workspace[data-sheet-state='half'] .map-glass-sheet,
  .map-workspace[data-sheet-state='expanded'] .map-glass-sheet {
    right: var(--mobile-dock-inline, 0.625rem);
    left: var(--mobile-dock-inline, 0.625rem);
    bottom: calc(var(--map-float-gap, 0.625rem) + env(safe-area-inset-bottom));
    border-bottom-right-radius: 26px;
    border-bottom-left-radius: 26px;
  }

  /* 用户 2026-11-23：dock 与面板是一整块，滚动区整块收在 dock 上沿，
     中间不留任何空白条（否则透明 dock 下面会露出一条面板与原内容的缝）。 */
  .map-workspace[data-sheet-state='half'] .shell-fade-bottom--map,
  .map-workspace[data-sheet-state='half'] .map-sheet-results,
  .map-workspace[data-sheet-state='half'] [aria-label='近期活动列表'] {
    padding-bottom: 0.5rem;
    /* 半屏起搜索行已隐藏，dock 只剩导航行（60px）；整块卡片已经离屏 10px，
       这里只按卡片内部的导航行高度收边，不再重复加 --map-float-gap。 */
    margin-bottom: calc(var(--mobile-nav-height, 3.25rem) + 0.5rem);
    /* 用户 2026-11-23「不论什么时候都要没缝」：半屏可视窗只有 185px，
       分类第二行必然被裁一半，被裁的那条硬边看起来就是一道缝。
       用 mask 让内容自己淡出，底图玻璃透上来，切边就没有了。
       guide: soft-edge-content-fade */
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 40px), transparent 100%);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 40px), transparent 100%);
  }

  .map-workspace[data-sheet-state='expanded'] .shell-fade-bottom--map,
  .map-workspace[data-sheet-state='expanded'] .map-sheet-results,
  .map-workspace[data-sheet-state='expanded'] [aria-label='近期活动列表'] {
    padding-bottom: 0.5rem;
    margin-bottom: calc(var(--mobile-nav-height, 3.25rem) + 0.5rem);
    /* 展开态同理：内容若还超一屏，底边也淡出而不是硬切（guide: soft-edge-content-fade）。 */
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 40px), transparent 100%);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 40px), transparent 100%);
  }

  /* 「可查找 76 个地点和 8 个区域」在移动端整条收起：折叠态已有一行
     「上滑展开 · 收藏 / 最近 / 分类」做入口提示，两行并列会顶出 152px 的折叠高度、
     压在底栏上；半屏 / 展开态它又占一行把 header 挤离列表。桌面不受影响。 */
  .map-workspace .map-sheet-hint {
    display: none;
  }

  /* 半屏 / 展开时右列（定位 + 列表）会整个被面板盖住：面板上沿之上只剩 83px / 12px 的
     地图带，塞不进 104px 的竖排，所以整列收起；折叠态恢复。列表按钮在半屏态本来就多余
     （列表就是面板本身）。 */
  .map-workspace[data-sheet-state='half'] .map-mobile-rail,
  .map-workspace[data-sheet-state='expanded'] .map-mobile-rail {
    display: none;
  }

  /* 展开态同理：attribution 抬到基线上方会被顶出地图区（负 y 被裁掉），回它自己的原位 */

}

  /* 浏览数：贴在搜索胶囊右下角，纯文字、无底色、不抢视线 */
  .map-workspace .map-view-stats-mini {
    position: absolute;
    right: 0.875rem;
    bottom: 2px;
    left: auto;
    z-index: 41;
    border: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
    padding: 0;
    font-size: 9px;
    line-height: 1;
    color: var(--muted-ink);
    pointer-events: none;
    white-space: nowrap;
  }

  /* T-033 R9（F-50）：两个结果滚动器滚到底时，最后一行要停在悬浮 dock 之上。
   dock 块高 6.25rem + 底部内缩 10px + 16px 呼吸位（≈126px）；变量取不到时按字面兜底。
   只在手机断点生效：md+ 的结果列表在侧栏里，不压 dock，保持改前的内距。
   guide: form-factor-adaptation —— 让可点击内容避开浮层与系统 UI 的遮挡区。 */
@media (max-width: 767.98px) {
  .map-workspace .map-sheet-results,
  .map-workspace .map-place-list {
    padding-bottom: calc(var(--shell-dock-map-height, 6.25rem) + var(--mobile-dock-inset, 0.625rem) + 1rem + env(safe-area-inset-bottom));
  }
}

  /* T-046 R2（用户 m04135）：面板的进出动效改成「从被点的按钮长出来 / 缩回那个按钮里」。
     原点横向取指针在面板内的 x（--sheet-origin-x，写在 .map-workspace 上），纵向钉在底边；
     入场从 scale(var(--sheet-scale)) + 下压 --sheet-ty + 全透明长到 1，回落只走合成层的 transform/opacity。
     旧实现（origin 50% calc(100% - 84px)、scale 0.86、opacity 0.72）只有 14% 缩放差异，读起来像没动。 */
  /* Tailwind v4：工具类在 @layer utilities 里，无层级规则在普通声明上优先于任何层 ——
     bloom 规则必须放在层外，否则 duration-[320ms] 会抢走「切换瞬间就是最终高度」。 */
    /* 2026-11-26（用户 m06662『太生硬，想要柔和的像液体一样』）：弹簧缓动。
       linear() 采样自 damping ζ≈0.6 的阻尼振子（约 9% 过冲后回稳），
       transform 不再是 cubic-bezier 的匀速段，读起来是「被推到位再轻轻坐实」。guide: physics-based-easing。 */
    .map-workspace {
      --ease-spring-sheet: linear(0, 0.1281 3%, 0.3931 6%, 0.6661 9%, 0.8804 12%, 1.0159 15%, 1.0805 18%, 1.0945 21%, 1.0799 24%, 1.0542 27%, 1.0287 30%, 1.0093 33%, 0.9974 36%, 0.992 39%, 0.9911 42%, 0.9927 45%, 0.9952 48%, 0.9975 52%, 0.9993 55%, 1);
  /* 收起相：先慢后快再轻坐实（加速曲线），配合「淡出只留末尾」＝缩进按钮里而不是原地消失 */
  --ease-liquid-out: linear(0, 0.004 8%, 0.02 16%, 0.06 24%, 0.14 32%, 0.27 40%, 0.45 48%, 0.65 56%, 0.83 64%, 0.94 72%, 0.995 80%, 1.004 86%, 1);
    }

    .map-workspace[data-sheet-bloom='on'] .map-glass-sheet {
      transform-origin: var(--sheet-origin-x, 50%) var(--sheet-origin-y, 100%);
      transform: translate3d(var(--sheet-tx, 0px), var(--sheet-ty, 24px), 0) scale(var(--sheet-scale, 0.74), var(--sheet-scale-y, 0.68));
      opacity: 0;
      border-radius: 40px;
      transition: none;
    }

    .map-workspace[data-sheet-bloom='off'] .map-glass-sheet {
      transform-origin: var(--sheet-origin-x, 50%) var(--sheet-origin-y, 100%);
      transform: translate3d(0, 0, 0) scale(1, 1);
      opacity: 1;
      border-radius: 26px;
      /* 旧内核（微信 X5 / Chromium < 113）不认 linear()：var() 替换失败按「计算值非法」处理，
         整条 transition 会退成 none，面板直接弹到位、没有「长出来」。所以兜底档先写成
         cubic-bezier，再用 @supports 把弹簧版覆盖上去，新老内核都拿得到一条能跑的过渡。 */
      transition:
        transform 300ms var(--ease-sheet),
        opacity 220ms var(--ease-sheet),
        border-radius 300ms var(--ease-sheet),
        height 320ms var(--ease-sheet);
    }

    @supports (transition-timing-function: linear(0, 1)) {
      .map-workspace[data-sheet-bloom='off'] .map-glass-sheet {
        transition:
          transform 560ms var(--ease-spring-sheet),
          opacity 200ms var(--ease-soft-fade),
          border-radius 560ms var(--ease-spring-sheet),
          height 320ms var(--ease-sheet);
      }
    }

@media (max-width: 767.98px) {
  /* 2026-11-26（用户 m06190 / m06364）：收起＝一相 CSS 过渡，缩回「面板长出来」的那个锚点（--sheet-origin-x/y，
     由 bloom 那一刻的触发控件中心算出）。transform / opacity / height 同时跑，不再分 rAF 三相。 */
  .map-workspace[data-sheet-collapse='on'] .map-glass-sheet {
    transform-origin: var(--sheet-origin-x, 50%) var(--sheet-origin-y, 100%);
    transform: translate3d(2px, 4px, 0) scale(var(--sheet-exit-scale, 0.12), var(--sheet-exit-scale-y, 0.12));
    opacity: 0;
    border-radius: 18px;
    /* 与 bloom 同理：linear() 失败不能让收起变成硬切。 */
    transition:
      transform 260ms var(--ease-sheet),
      opacity 140ms linear 200ms,
      border-radius 260ms var(--ease-sheet);
  }

  @supports (transition-timing-function: linear(0, 1)) {
    .map-workspace[data-sheet-collapse='on'] .map-glass-sheet {
      transition:
        transform 460ms var(--ease-liquid-out),
        opacity 140ms linear 330ms,
        border-radius 460ms var(--ease-liquid-out);
    }
  }
}

@layer utilities {
  @media (max-width: 767.98px) {
    .map-workspace[data-sheet-collapse='on'] .map-glass-sheet {
      height: var(--sheet-collapse-h, 326px) !important;
    }
  }
}

/* 独立浮卡（叮叮车 / 附近活动）底边让开底栏（2026-11-24 用户：「跟叮叮车面板一样的形式」）：
   卡片整体浮在底栏上方 10px，四周圆角自己负责，不跟底栏拼成一块。
   折叠 84 条、半屏 326、展开 548 都整块露出，不压导航行。
   浮卡与底栏之间留 --map-float-gap，底栏四种状态（含 detached）都是不透明底。
   层外声明（Tailwind 工具类在 @layer utilities 里），否则 bottom-0 会抢走底边。 */
.map-workspace[data-detached-dock='on'] > aside.map-glass-sheet {
  bottom: calc(var(--mobile-nav-height, 3.25rem) + 0.5rem + var(--mobile-dock-inset, 0.625rem) + var(--map-float-gap, 0.625rem) + env(safe-area-inset-bottom));
  border-radius: 26px;
}

/* 浮卡不压 dock 了，滚动区不必给导航行留位（半屏/展开那两条是给「贴住底栏」的形态用的）。 */
.map-workspace[data-detached-dock='on'] .shell-fade-bottom--map,
.map-workspace[data-detached-dock='on'] .map-sheet-results,
.map-workspace[data-detached-dock='on'] [aria-label='近期活动列表'] {
  margin-bottom: 0.5rem;
}

/* 稳态才给过渡：bloom 首帧与收起三相位要求瞬时，这条不能把它们的 transition: none 顶掉。
   展开 / 半屏切换时 bottom 与 height 一起动，否则顶边会先跳 110px 再长回去。 */
.map-workspace[data-sheet-bloom='off'][data-sheet-collapse='off'] > aside.map-glass-sheet {
  transition:
    bottom 220ms var(--ease-sheet),
    transform 300ms var(--ease-sheet),
    opacity 220ms var(--ease-sheet),
    height 320ms var(--ease-sheet);
}

@supports (transition-timing-function: linear(0, 1)) {
  .map-workspace[data-sheet-bloom='off'][data-sheet-collapse='off'] > aside.map-glass-sheet {
    transition:
      bottom 220ms var(--ease-sheet),
      transform 560ms var(--ease-spring-sheet), /* 弹簧曲线写这里：展开↔半屏是这条真正在动 */
      opacity 200ms var(--ease-soft-fade),
      height 320ms var(--ease-sheet);
  }
}
</style>
