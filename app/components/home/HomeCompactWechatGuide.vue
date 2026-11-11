<script setup lang="ts">
import type {
  ApiContent,
  ApiListResponse,
  ApiNoticeAction,
  ApiPlace,
  ApiPublicHomeEntry
} from '~~/shared/types/server'
import type { FrontendFeatureKey } from '~~/shared/config/frontend-features'
import {
  buildHomeEssentialActions,
  homeMoreEntries,
  homeTimelineStages
} from '~~/app/utils/home-presentation'
import { majorCollegeCount, majorProfiles } from '~~/data/major-profiles'
import {
  nearbyGuideCategoryLabels,
  nearbyGuideItems
} from '~~/data/nearby-guide'
import { compactPreviewContentByPath } from '~~/data/compact-preview-content'
import { safeNoticeActionHref } from '~~/shared/utils/notice-actions'

type CompactPlacement = 'quick' | 'timeline' | 'services' | 'more'

interface PublicNotice extends ApiContent {
  pinned: boolean
  autoPopup: boolean
  actions: ApiNoticeAction[]
  confirmationCount: number
  confirmed: boolean
}

interface ConfirmNoticeResponse {
  confirmed: boolean
  confirmationCount: number
}

interface CompactHomeEntry {
  id: string
  title: string
  summary: string
  detailContent?: string | null
  to: string
  sourceUrl?: string | null
  icon: string
  placement: CompactPlacement
  sortOrder: number
  featureKey?: FrontendFeatureKey
  external?: boolean
  linkPreviewOnly?: boolean
}

interface ManagedEntryDefinition extends Omit<CompactHomeEntry, 'placement' | 'sortOrder'> {
  featureKey: FrontendFeatureKey
  defaultPlacement: CompactPlacement
  defaultOrder: number
}

interface BannerItem {
  title: string
  summary: string
  image: string
  to: string
}

type CompactCatalogId = 'guides' | 'procedures' | 'places' | 'clubs' | 'departments'

interface CompactCatalogItem {
  id: string
  title: string
  summary: string
  to: string
}

interface CompactCatalog {
  id: CompactCatalogId
  label: string
  icon: string
  to: string
  items: CompactCatalogItem[]
}

interface CompactEntryContentBlock {
  title: string
  body: string
}

const searchQuery = ref('')
const activeBannerIndex = ref(0)
const activeCatalogId = ref<CompactCatalogId>('guides')
const expandedCatalogId = ref<CompactCatalogId | null>(null)
const selectedNotice = ref<PublicNotice | null>(null)
const noticeOpen = ref(false)
const selectedEntry = ref<CompactHomeEntry | null>(null)
const entrySheetOpen = ref(false)
const runtimeConfig = useRuntimeConfig()
const miniProgramUrl = 'https://doc.sourl.cc/jkyxfu'
let bannerTimer: ReturnType<typeof setInterval> | undefined

const noticeRequest = useFetch<ApiListResponse<PublicNotice>>('/api/public/notices', {
  key: 'compact-guide-notices'
})
const featureRequest = usePublicFrontendFeatures()
const homeEntryRequest = usePublicHomeEntries()
const procedureRequest = usePublicProcedureList()
const guideRequest = usePublicGuideList()
const clubRequest = usePublicClubList()
const departmentRequest = usePublicDepartmentList()
const campusPlaceRequest = usePublicPlaceList('campus')

await Promise.all([
  noticeRequest,
  featureRequest,
  homeEntryRequest,
  procedureRequest,
  guideRequest,
  clubRequest,
  departmentRequest,
  campusPlaceRequest
])

const { data: noticeResponse } = noticeRequest
const { data: featureResponse } = featureRequest
const { data: homeEntryResponse } = homeEntryRequest
const { data: procedureResponse } = procedureRequest
const { data: guideResponse } = guideRequest
const { data: clubResponse } = clubRequest
const { data: departmentResponse } = departmentRequest
const { data: campusPlaceResponse } = campusPlaceRequest

const banners: BannerItem[] = [
  {
    title: '迎新指南，先看重点',
    summary: '报到、住宿、地图和校园生活，一页看完',
    image: '/images/intro/yeu-campus-hero.webp',
    to: '/procedures/arrival'
  },
  {
    title: '宿舍什么样，提前看看',
    summary: '普通型和舒适型宿舍都有实拍',
    image: '/images/panorama/comfort-dorm-poster.jpg',
    to: '/dorms'
  },
  {
    title: '到校以后，不怕找路',
    summary: '查楼栋、服务点和步行路线',
    image: '/images/nearby/citywalk.webp',
    to: '/map'
  },
  {
    title: '周末进城，先把路线存好',
    summary: '交通、吃喝、泉州市区怎么走',
    image: '/images/nearby/city-night.webp',
    to: '/nearby'
  }
]

const serviceEntryCoverById: Record<string, string> = {
  'compact-panorama': '/images/intro/yeu-campus-hero.webp',
  'compact-map': '/images/posters/freshman-guide-campus-map.png',
  'compact-delivery': '/images/nearby/city-food.webp',
  'compact-procedures': '/images/promo/new-student-guide-no-qr.png'
}

const managedEntryDefinitions: ManagedEntryDefinition[] = [
  {
    id: 'compact-checklist',
    featureKey: 'home.more.checklist',
    title: '新生待办',
    summary: '按阶段勾选准备事项',
    to: '/checklist',
    icon: 'i-lucide-clipboard-list',
    defaultPlacement: 'quick',
    defaultOrder: 0
  },
  {
    id: 'compact-dorms',
    featureKey: 'home.more.dorms',
    title: '宿舍实拍',
    summary: '普通型与舒适型宿舍',
    to: '/dorms',
    icon: 'i-lucide-bed-double',
    defaultPlacement: 'quick',
    defaultOrder: 10
  },
  {
    id: 'compact-transport',
    featureKey: 'home.more.transport',
    title: '到校与返校',
    summary: '车站、机场和市区路线',
    to: '/transport',
    icon: 'i-lucide-bus-front',
    defaultPlacement: 'quick',
    defaultOrder: 20
  },
  {
    id: 'compact-network',
    featureKey: 'home.essential.network',
    title: '校园网络',
    summary: '连接、账号与常见问题',
    to: '/procedures/campus-network',
    icon: 'i-lucide-wifi',
    defaultPlacement: 'quick',
    defaultOrder: 30
  },
  {
    id: 'compact-nearby',
    featureKey: 'home.more.nearby',
    title: '吃喝玩乐',
    summary: '学校周边与泉州市区',
    to: '/nearby',
    icon: 'i-lucide-utensils',
    defaultPlacement: 'quick',
    defaultOrder: 40
  },
  {
    id: 'compact-arrival',
    featureKey: 'home.essential.arrival',
    title: '报到流程',
    summary: '时间、材料与现场步骤',
    to: '/procedures/arrival',
    icon: 'i-lucide-calendar-check-2',
    defaultPlacement: 'quick',
    defaultOrder: 50
  },
  {
    id: 'compact-rules',
    featureKey: 'home.more.student-rules',
    title: '学生手册与奖助',
    summary: '绩点、综测和奖助规则',
    to: '/student-rules',
    icon: 'i-lucide-notebook-tabs',
    defaultPlacement: 'quick',
    defaultOrder: 80
  },
  {
    id: 'compact-map',
    featureKey: 'home.essential.map',
    title: '校园地图',
    summary: '旧区、新区和常去的地方',
    to: '/map',
    icon: 'i-lucide-map-pinned',
    defaultPlacement: 'services',
    defaultOrder: 10
  },
  {
    id: 'compact-delivery',
    featureKey: 'home.essential.delivery',
    title: '快递与外卖',
    summary: '取件站点、外卖送达和取餐说明',
    to: '/guides/express-delivery',
    icon: 'i-lucide-package-open',
    defaultPlacement: 'services',
    defaultOrder: 15
  },
  {
    id: 'compact-panorama',
    featureKey: 'home.more.panorama',
    title: '全景云游校园',
    summary: '先看校园环境和宿舍实景',
    to: '/panorama',
    icon: 'i-lucide-orbit',
    defaultPlacement: 'services',
    defaultOrder: 0
  },
  {
    id: 'compact-before-arrival',
    featureKey: 'home.timeline.before-arrival',
    title: '到校前准备',
    summary: '确认时间、材料、交通和住宿',
    to: '/procedures/arrival',
    icon: 'i-lucide-luggage',
    defaultPlacement: 'timeline',
    defaultOrder: 0
  },
  {
    id: 'compact-arrival-day',
    featureKey: 'home.timeline.arrival-day',
    title: '报到当天',
    summary: '定位报到点并按步骤办理',
    to: '/map',
    icon: 'i-lucide-map-pin-check',
    defaultPlacement: 'timeline',
    defaultOrder: 10
  },
  {
    id: 'compact-first-week',
    featureKey: 'home.timeline.first-week',
    title: '入学第一周',
    summary: '补齐学习与校园生活入口',
    to: '/guides',
    icon: 'i-lucide-calendar-range',
    defaultPlacement: 'timeline',
    defaultOrder: 20
  },
  {
    id: 'compact-safety',
    featureKey: 'home.more.safety',
    title: '安全与健康',
    summary: '医疗、心理支持和应急信息',
    to: '/guides/safety-health',
    icon: 'i-lucide-shield-plus',
    defaultPlacement: 'more',
    defaultOrder: 30
  },
  {
    id: 'compact-clubs',
    featureKey: 'home.more.clubs',
    title: '学生社团',
    summary: '按兴趣看社团和招新',
    to: '/clubs',
    icon: 'i-lucide-users-round',
    defaultPlacement: 'more',
    defaultOrder: 0
  },
  {
    id: 'compact-departments',
    featureKey: 'home.more.departments',
    title: '校内部门',
    summary: '按职责找到办事部门',
    to: '/departments',
    icon: 'i-lucide-building-2',
    defaultPlacement: 'more',
    defaultOrder: 10
  },
  {
    id: 'compact-welearn',
    featureKey: 'home.more.welearn',
    title: 'WeLearn 学习工具',
    summary: '查看版本说明与下载入口',
    to: 'https://dz.lileikeji.top/uploads/releases/download.php',
    icon: 'i-lucide-download',
    external: true,
    defaultPlacement: 'more',
    defaultOrder: 40
  }
]

const supplementalQuickEntries: CompactHomeEntry[] = [
  {
    id: 'compact-search',
    title: '校园问答',
    summary: '查资料、找功能入口',
    to: '/search?mode=ai',
    icon: 'i-lucide-circle-question-mark',
    placement: 'quick',
    sortOrder: 60
  },
  {
    id: 'compact-contact',
    title: '联系整理者',
    summary: '反馈问题或咨询新生群',
    to: '/contact',
    icon: 'i-lucide-message-square-text',
    placement: 'quick',
    sortOrder: 70
  },
  {
    id: 'compact-major',
    title: '专业与住宿片区',
    summary: '查学院、新区和旧区',
    to: '/major-lookup',
    icon: 'i-lucide-graduation-cap',
    placement: 'quick',
    sortOrder: 90
  }
]

const supplementalMoreEntries: CompactHomeEntry[] = [
  {
    id: 'compact-sources',
    title: '信息来源',
    summary: '先看正式通知，再参考整理内容',
    to: '/sources',
    icon: 'i-lucide-shield-check',
    placement: 'more',
    sortOrder: 50
  },
  {
    id: 'compact-feedback',
    title: '反馈纠错',
    summary: '提交过期、错误或缺失的信息',
    to: '/feedback',
    icon: 'i-lucide-message-square-warning',
    placement: 'more',
    sortOrder: 60
  },
  {
    id: 'compact-about',
    title: '关于这份指南',
    summary: '个人公益整理说明',
    to: '/about',
    icon: 'i-lucide-info',
    placement: 'more',
    sortOrder: 70
  }
]

// Keep compact cards aligned with the definitions used by the full homepage.
// The backend still controls enabled state, placement and ordering; this map
// only prevents the two views from drifting in title, description or route.
const liveGuideSummaries = (guideResponse.value?.items ?? [])
  .filter(item => item.kind === 'guide' && item.status === 'published')
  .map(item => ({ slug: item.slug, summary: item.summary }))
const sharedHomeEntryByFeature = new Map<FrontendFeatureKey, Partial<CompactHomeEntry>>([
  ...buildHomeEssentialActions(liveGuideSummaries).map(entry => [entry.featureKey, {
    title: entry.title,
    summary: entry.description,
    to: entry.to,
    icon: entry.icon
  }] as const),
  ...homeTimelineStages.map(entry => [entry.featureKey, {
    title: entry.title,
    summary: entry.items.join(' · '),
    to: entry.to
  }] as const),
  ...homeMoreEntries.map(entry => [entry.featureKey, {
    title: entry.title,
    summary: entry.description,
    to: entry.to,
    icon: entry.icon,
    external: entry.external
  }] as const)
])

const guideToolDefinitions: CompactHomeEntry[] = [
  { id: 'tool-checklist', title: '新生清单', summary: '勾选任务并保存进度', to: '/checklist', icon: 'i-lucide-list-checks', placement: 'timeline', sortOrder: 0, featureKey: 'home.more.checklist', linkPreviewOnly: true },
  { id: 'tool-map', title: '校园地图', summary: '查地点、看详情和路线', to: '/map', icon: 'i-lucide-map-pinned', placement: 'timeline', sortOrder: 10, featureKey: 'home.essential.map', linkPreviewOnly: true },
  { id: 'tool-transport', title: '到校与离校交通', summary: '查公交、进城和返校方案', to: '/transport', icon: 'i-lucide-bus-front', placement: 'timeline', sortOrder: 20, featureKey: 'home.more.transport', linkPreviewOnly: true },
  { id: 'tool-arrival', title: '报到安排', summary: '按时间和材料逐项准备', to: '/procedures/arrival', icon: 'i-lucide-calendar-check-2', placement: 'timeline', sortOrder: 30, featureKey: 'home.essential.arrival', linkPreviewOnly: true },
  { id: 'tool-major', title: '专业住宿查询', summary: '查学院、专业和住宿片区', to: '/major-lookup', icon: 'i-lucide-graduation-cap', placement: 'timeline', sortOrder: 40, linkPreviewOnly: true },
  { id: 'tool-rules', title: '学生手册与资助', summary: '查看绩点、综测和奖助规则', to: '/student-rules', icon: 'i-lucide-book-open-check', placement: 'timeline', sortOrder: 50, featureKey: 'home.more.student-rules', linkPreviewOnly: true },
  { id: 'tool-search', title: '校园问答', summary: '查资料、找功能入口', to: '/search?mode=ai', icon: 'i-lucide-circle-question-mark', placement: 'timeline', sortOrder: 60, linkPreviewOnly: true }
]

const directEntryDefinitions: CompactHomeEntry[] = [
  { id: 'direct-campus', title: '校内全景', summary: '进入站内全景页查看校园实景', to: '/panorama?tour=campus', icon: 'i-lucide-camera', placement: 'services', sortOrder: 0, featureKey: 'home.more.panorama', linkPreviewOnly: true },
  { id: 'direct-history', title: 'VR 校史馆', summary: '进入站内全景页选择校史馆', to: '/panorama?tour=history', icon: 'i-lucide-landmark', placement: 'services', sortOrder: 10, featureKey: 'home.more.panorama', linkPreviewOnly: true },
  { id: 'direct-map', title: '互动校园地图', summary: '进入站内地图查地点和路线', to: '/map', icon: 'i-lucide-map', placement: 'services', sortOrder: 20, featureKey: 'home.essential.map', linkPreviewOnly: true },
  { id: 'direct-station', title: '泉州站到校', summary: '进入站内交通页查看泉州站方案', to: '/transport?origin=quanzhou-station', icon: 'i-lucide-route', placement: 'services', sortOrder: 30, featureKey: 'home.more.transport', linkPreviewOnly: true },
  { id: 'direct-east-station', title: '泉州东站到校', summary: '进入站内交通页查看东站方案', to: '/transport?origin=quanzhou-east', icon: 'i-lucide-route', placement: 'services', sortOrder: 40, featureKey: 'home.more.transport', linkPreviewOnly: true },
  { id: 'direct-airport', title: '晋江机场到校', summary: '进入站内交通页查看机场方案', to: '/transport?origin=jinjiang-airport', icon: 'i-lucide-plane', placement: 'services', sortOrder: 50, featureKey: 'home.more.transport', linkPreviewOnly: true },
  { id: 'direct-return', title: '市区返校', summary: '进入站内交通页查看市区返校方案', to: '/transport?origin=city-center', icon: 'i-lucide-bus-front', placement: 'services', sortOrder: 60, featureKey: 'home.more.transport', linkPreviewOnly: true },
  { id: 'direct-ordinary-dorm', title: '普通型宿舍实拍', summary: '进入站内宿舍页查看普通型实拍', to: '/dorms?type=ordinary', icon: 'i-lucide-bed-double', placement: 'services', sortOrder: 70, featureKey: 'home.more.dorms', linkPreviewOnly: true },
  { id: 'direct-comfort-dorm', title: '舒适型宿舍实拍', summary: '进入站内宿舍页查看舒适型实拍', to: '/dorms?type=comfort', icon: 'i-lucide-bed-single', placement: 'services', sortOrder: 80, featureKey: 'home.more.dorms', linkPreviewOnly: true },
  { id: 'direct-food', title: '泉州美食参考', summary: '进入站内吃喝玩乐攻略', to: '/nearby', icon: 'i-lucide-utensils', placement: 'services', sortOrder: 90, featureKey: 'home.more.nearby', linkPreviewOnly: true }
]

const notices = computed(() => noticeResponse.value?.items ?? [])
const procedures = computed(() => procedureResponse.value?.items ?? [])
const guides = computed(() => guideResponse.value?.items ?? [])
const clubs = computed(() => clubResponse.value?.items ?? [])
const departments = computed(() => departmentResponse.value?.items ?? [])
const campusPlaces = computed(() => campusPlaceResponse.value?.items ?? [])
const currentBanner = computed(() => banners[activeBannerIndex.value] ?? banners[0])

const contentCatalogs = computed<CompactCatalog[]>(() => [
  {
    id: 'guides',
    label: '校园指南',
    icon: 'i-lucide-book-open-text',
    to: '/guides',
    items: guides.value.map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      to: `/guides/${encodeURIComponent(item.slug)}`
    }))
  },
  {
    id: 'procedures',
    label: '办事流程',
    icon: 'i-lucide-list-checks',
    to: '/procedures',
    items: procedures.value.map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      to: `/procedures/${encodeURIComponent(item.slug)}`
    }))
  },
  {
    id: 'places',
    label: '校园地点',
    icon: 'i-lucide-map-pin',
    to: '/map',
    items: campusPlaces.value.map((item: ApiPlace) => ({
      id: item.id,
      title: item.name,
      summary: item.campusArea
        ? `${item.campusArea} · ${item.summary}`
        : item.summary,
      to: `/places/${encodeURIComponent(item.slug)}`
    }))
  },
  {
    id: 'clubs',
    label: '学生社团',
    icon: 'i-lucide-users-round',
    to: '/clubs',
    items: clubs.value.map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      to: `/clubs/${encodeURIComponent(item.slug)}`
    }))
  },
  {
    id: 'departments',
    label: '部门学院',
    icon: 'i-lucide-building-2',
    to: '/departments',
    items: departments.value.map(item => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      to: `/departments/${encodeURIComponent(item.slug)}`
    }))
  }
])
const activeCatalog = computed(() => (
  contentCatalogs.value.find(catalog => catalog.id === activeCatalogId.value)
  ?? contentCatalogs.value[0]
))
const visibleCatalogItems = computed(() => {
  const items = activeCatalog.value?.items ?? []
  return expandedCatalogId.value === activeCatalogId.value ? items : items.slice(0, 10)
})
const hiddenCatalogItemCount = computed(() => Math.max(
  0,
  (activeCatalog.value?.items.length ?? 0) - visibleCatalogItems.value.length
))
const nearbyHighlights = computed(() => [
  ...nearbyGuideItems.filter(item => item.image),
  ...nearbyGuideItems.filter(item => !item.image)
].slice(0, 8))

const disabledFeatureKeys = computed(() => new Set(featureResponse.value?.disabledKeys ?? []))
const featureEnabled = (key?: FrontendFeatureKey): boolean => !key || !disabledFeatureKeys.value.has(key)
const featurePlacement = (definition: ManagedEntryDefinition): CompactPlacement => {
  const configured = featureResponse.value?.placements?.[definition.featureKey]
  return configured === 'quick' || configured === 'timeline' || configured === 'services'
    ? configured
    : definition.defaultPlacement
}
const featureSortOrder = (definition: ManagedEntryDefinition): number => (
  featureResponse.value?.sortOrders?.[definition.featureKey] ?? definition.defaultOrder
)

const managedEntries = computed<CompactHomeEntry[]>(() => {
  const defaults = managedEntryDefinitions
    .filter(definition => featureEnabled(definition.featureKey))
    .map((definition) => {
      const shared = sharedHomeEntryByFeature.get(definition.featureKey)
      return {
        id: definition.id,
        title: shared?.title ?? definition.title,
        summary: shared?.summary ?? definition.summary,
        to: shared?.to ?? definition.to,
        icon: shared?.icon ?? definition.icon,
        featureKey: definition.featureKey,
        external: shared?.external ?? definition.external,
        placement: featurePlacement(definition),
        sortOrder: featureSortOrder(definition)
      }
    })
  const custom = (homeEntryResponse.value?.items ?? []).map((item: ApiPublicHomeEntry) => ({
    id: item.id,
    title: item.title,
    summary: item.description,
    detailContent: item.detailContent,
    to: item.to,
    sourceUrl: item.sourceUrl,
    icon: item.icon,
    placement: item.placement,
    sortOrder: item.sortOrder
  }))
  return [...defaults, ...custom]
})

function sortEntries(entries: CompactHomeEntry[]): CompactHomeEntry[] {
  return [...entries].sort((left, right) => (
    left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'zh-CN')
  ))
}

const quickEntries = computed(() => sortEntries([
  ...managedEntries.value.filter(entry => entry.placement === 'quick'),
  ...supplementalQuickEntries
]))
const serviceEntries = computed(() => sortEntries([
  ...managedEntries.value.filter(entry => entry.placement === 'services'),
  {
    id: 'compact-procedures',
    title: '全部办事流程',
    summary: `校园网、报修、图书馆等 ${procedures.value.length} 项办理说明`,
    to: '/procedures',
    icon: 'i-lucide-list-checks',
    placement: 'services',
    sortOrder: 20
  }
]))
const timelineEntries = computed(() => sortEntries(
  managedEntries.value.filter(entry => entry.placement === 'timeline')
))
const guideTools = computed(() => guideToolDefinitions.filter(entry => featureEnabled(entry.featureKey)))
const directEntries = computed(() => directEntryDefinitions.filter(entry => featureEnabled(entry.featureKey)))
const moreEntries = computed(() => sortEntries([
  ...managedEntries.value.filter(entry => entry.placement === 'more'),
  ...supplementalMoreEntries
]))

function serviceEntryImage(entry: CompactHomeEntry): string {
  const configuredCover = serviceEntryCoverById[entry.id]
  if (configuredCover) return configuredCover
  const path = entryPath(entry)
  if (path.includes('map')) return '/images/posters/freshman-guide-campus-map.png'
  if (/express|delivery|food/u.test(path)) return '/images/nearby/city-food.webp'
  if (path.includes('panorama')) return '/images/intro/yeu-campus-hero.webp'
  return '/images/intro/yeu-campus-hero.webp'
}

function selectCatalog(id: CompactCatalogId): void {
  activeCatalogId.value = id
  expandedCatalogId.value = null
}

function toggleCatalogExpansion(): void {
  expandedCatalogId.value = expandedCatalogId.value === activeCatalogId.value
    ? null
    : activeCatalogId.value
}

function noticeActionHref(action: ApiNoticeAction): string | undefined {
  return safeNoticeActionHref(action.href) ?? undefined
}

const selectedEntrySourceHref = computed(() => (
  selectedEntry.value?.sourceUrl || selectedEntry.value?.to || ''
))
const selectedEntrySourceLabel = computed(() => {
  const href = selectedEntrySourceHref.value
  if (!href) return ''
  if (/^https?:\/\//i.test(href)) return href
  const origin = String(runtimeConfig.public.siteUrl || 'https://yx.huiliyill.cn').replace(/\/$/, '')
  return `${origin}${href.startsWith('/') ? href : `/${href}`}`
})
const selectedEntrySourceExternal = computed(() => /^https?:\/\//i.test(selectedEntrySourceHref.value))
const selectedEntryIsLinkPreview = computed(() => selectedEntry.value?.linkPreviewOnly === true)
const selectedEntryShowsContactQr = computed(() => (
  selectedEntry.value ? entryPath(selectedEntry.value) === '/contact' : false
))
const entryModalUi = computed(() => selectedEntryIsLinkPreview.value
  ? {
      content: 'left-1/2 right-auto top-1/2 bottom-auto flex h-auto max-h-[calc(100svh-2rem)] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl',
      header: 'relative shrink-0 px-5 pb-3 pt-5',
      body: 'px-5 py-5',
      footer: 'hidden'
    }
  : {
      content: 'left-1/2 right-auto top-auto bottom-0 flex h-[72svh] min-h-[72svh] w-full max-w-3xl -translate-x-1/2 translate-y-0 flex-col overflow-hidden rounded-t-2xl rounded-b-none',
      header: 'relative shrink-0 px-5 pb-4 pt-6 sm:px-6',
      body: 'scrollbar-none min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6',
      footer: 'shrink-0 flex-col items-stretch gap-2 px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4 sm:flex-row sm:px-6'
    })

function entryPath(entry: CompactHomeEntry): string {
  if (/^https?:\/\//i.test(entry.to)) return entry.to
  return entry.to.split(/[?#]/u, 1)[0] || entry.to
}

function defaultEntryDetailContent(entry: CompactHomeEntry): string {
  const path = entryPath(entry)
  const exact = compactPreviewContentByPath[path]
  if (exact) return exact
  if (path.startsWith('/guides/')) {
    return `先看这份指南\n${entry.summary}\n\n往下还能看\n完整页面有具体说明、入口和需要再确认的事项。`
  }
  if (path.startsWith('/procedures/')) {
    return `动手前先看\n${entry.summary}\n\n办理前\n按完整页面的步骤准备；当年安排有变化时，以负责部门最新通知为准。`
  }
  if (path.startsWith('/places/')) {
    return `地点简介\n${entry.summary}\n\n怎么走\n完整页面有地点信息和路线；开放入口和当天通行情况以现场为准。`
  }
  if (path.startsWith('/clubs/')) {
    return `社团简介\n${entry.summary}\n\n开学后\n完整页面有活动和联系方式；招新时间与群入口以当期发布为准。`
  }
  if (path.startsWith('/departments/')) {
    return `部门职责\n${entry.summary}\n\n联系前\n完整页面有办事范围和联系方式；先想清楚要问哪件事。`
  }
  return `主要内容\n${entry.summary}\n\n继续看\n完整页面有更细的信息和可用功能。`
}

const selectedEntryContentBlocks = computed<CompactEntryContentBlock[]>(() => {
  const entry = selectedEntry.value
  if (!entry) return []
  const raw = entry.detailContent?.trim() || defaultEntryDetailContent(entry)
  return raw.split(/\n\s*\n/u).map((block) => {
    const lines = block.split('\n').map(line => line.trim()).filter(Boolean)
    const title = lines.shift() || '主要内容'
    return {
      title,
      body: lines.join('\n') || entry.summary
    }
  }).filter(block => block.title || block.body)
})

function openEntry(entry: CompactHomeEntry): void {
  selectedEntry.value = entry
  entrySheetOpen.value = true
}

function openCatalogItem(item: CompactCatalogItem): void {
  openEntry({
    id: item.id,
    title: item.title,
    summary: item.summary,
    to: item.to,
    icon: activeCatalog.value?.icon || 'i-lucide-book-open-text',
    placement: 'more',
    sortOrder: 0
  })
}

function openNearbyItem(item: typeof nearbyGuideItems[number]): void {
  openEntry({
    id: item.id,
    title: item.title,
    summary: item.summary,
    to: `/nearby#guide-${encodeURIComponent(item.id)}`,
    icon: item.icon,
    placement: 'more',
    sortOrder: 0
  })
}

async function openNotice(notice: PublicNotice): Promise<void> {
  selectedNotice.value = notice
  noticeOpen.value = true
  if (notice.confirmed) return
  try {
    const result = await $fetch<ConfirmNoticeResponse>(
      `/api/public/notices/${encodeURIComponent(notice.id)}/confirm`,
      { method: 'POST' }
    )
    notice.confirmed = result.confirmed
    notice.confirmationCount = result.confirmationCount
  } catch {
    // The announcement remains readable if the view counter is unavailable.
  }
}

function submitSearch(): void {
  const query = searchQuery.value.trim()
  void navigateTo({ path: '/search', query: { mode: 'ai', ...(query ? { q: query } : {}) } })
}

onMounted(() => {
  bannerTimer = setInterval(() => {
    activeBannerIndex.value = (activeBannerIndex.value + 1) % banners.length
  }, 5_000)
})

onBeforeUnmount(() => {
  if (bannerTimer) clearInterval(bannerTimer)
})
</script>

<template>
  <div class="min-h-dvh bg-[#f3f6f8] dark:bg-zinc-950 pb-10 text-zinc-900 dark:text-zinc-100">
    <section class="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div class="mx-auto max-w-3xl px-4 py-2.5 sm:px-6 sm:py-3">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <h1 class="truncate text-base font-black text-zinc-950 dark:text-zinc-100 sm:text-lg">
              迎新指南
            </h1>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <UButton
              :to="miniProgramUrl"
              external
              target="_blank"
              rel="noopener noreferrer"
              icon="i-lucide-smartphone"
              label="打开小程序"
              size="xs"
              class="min-h-8 whitespace-nowrap"
            />
            <UButton
              to="/contact"
              icon="i-lucide-message-circle"
              color="neutral"
              variant="outline"
              aria-label="联系整理者"
              size="sm"
              class="min-h-8 shrink-0"
            />
          </div>
        </div>
        <form
          class="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2"
          role="search"
          @submit.prevent="submitSearch"
        >
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="搜专业、地点、办事，或直接提问"
            aria-label="搜索迎新信息"
            size="md"
            class="min-w-0 min-h-9"
            :ui="{ base: 'min-h-9' }"
          />
          <UButton
            type="submit"
            icon="i-lucide-arrow-right"
            aria-label="开始搜索"
            class="min-h-9 shrink-0"
          />
        </form>
      </div>
    </section>

    <main class="mx-auto max-w-3xl space-y-4 px-3 py-3 sm:space-y-5 sm:px-6 sm:py-6">
      <section
        v-if="currentBanner"
        class="relative isolate aspect-[16/7] overflow-hidden rounded-md bg-zinc-900 dark:bg-zinc-700 text-white sm:aspect-[16/6]"
        aria-label="焦点内容"
      >
        <img
          :src="currentBanner.image"
          :alt="currentBanner.title"
          class="absolute inset-0 size-full object-cover"
        >
        <div class="absolute inset-0 bg-black/45" />
        <NuxtLink
          :to="currentBanner.to"
          class="relative flex size-full flex-col justify-end p-4 sm:p-6"
        >
          <p class="text-xs font-semibold text-emerald-200">
            2026 级新生
          </p>
          <h2 class="mt-1 max-w-xl text-xl font-black leading-tight sm:text-2xl">
            {{ currentBanner.title }}
          </h2>
          <p class="mt-2 max-w-xl text-sm leading-6 text-white/90">
            {{ currentBanner.summary }}
          </p>
        </NuxtLink>
        <div
          class="absolute bottom-3 right-3 z-10 flex gap-1.5"
          aria-label="切换轮播图"
        >
          <button
            v-for="(_, index) in banners"
            :key="index"
            type="button"
            class="h-1.5 rounded-full bg-white/60 dark:bg-zinc-900/60 transition-all"
            :class="activeBannerIndex === index ? 'w-5 bg-white dark:bg-zinc-900' : 'w-1.5'"
            :aria-label="`查看第 ${index + 1} 张轮播图`"
            @click="activeBannerIndex = index"
          />
        </div>
      </section>

      <section
        v-if="notices.length"
        class="overflow-hidden rounded-md border border-amber-200 dark:border-amber-900 bg-white dark:bg-zinc-900"
        aria-labelledby="compact-notice-title"
      >
        <div class="flex items-center justify-between border-b border-amber-100 bg-amber-50 dark:bg-amber-950 px-4 py-2.5">
          <h2
            id="compact-notice-title"
            class="text-sm font-black text-amber-950 dark:text-amber-100"
          >
            最新公告
          </h2>
          <span class="text-xs text-amber-800 dark:text-amber-300">{{ notices.length }} 条</span>
        </div>
        <button
          v-for="notice in notices.slice(0, 3)"
          :key="notice.id"
          type="button"
          class="flex min-h-14 w-full items-center gap-3 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3 text-left last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
          @click="openNotice(notice)"
        >
          <span
            class="size-2 shrink-0 rounded-full"
            :class="notice.confirmed ? 'bg-zinc-300 dark:bg-zinc-700' : 'bg-amber-500'"
          />
          <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ notice.title }}</span>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-zinc-400 dark:text-zinc-500"
          />
        </button>
      </section>

      <section
        class="rounded-md bg-white dark:bg-zinc-900 p-4 shadow-sm"
        aria-labelledby="compact-quick-title"
      >
        <div class="flex items-center justify-between gap-3">
          <h2
            id="compact-quick-title"
            class="text-base font-black"
          >
            新生常用入口
          </h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-500">{{ quickEntries.length }} 项</span>
        </div>
        <div class="mt-3 grid grid-cols-5 gap-x-1 gap-y-4 sm:gap-x-3">
          <button
            v-for="entry in quickEntries"
            :key="`quick-${entry.id}`"
            type="button"
            class="flex min-w-0 flex-col items-center text-center"
            @click="openEntry(entry)"
          >
            <span class="grid size-10 place-items-center rounded-md bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 sm:size-11">
              <UIcon
                :name="entry.icon"
                class="size-5"
              />
            </span>
            <span class="mt-1.5 line-clamp-2 w-full text-[11px] font-semibold leading-4 text-zinc-700 dark:text-zinc-200 sm:text-xs">{{ entry.title }}</span>
          </button>
        </div>
      </section>

      <section
        class="rounded-md bg-white dark:bg-zinc-900 p-4 shadow-sm"
        aria-labelledby="compact-service-title"
      >
        <div class="flex items-center justify-between gap-3">
          <h2
            id="compact-service-title"
            class="text-base font-black"
          >
            校园服务
          </h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-500">{{ serviceEntries.length }} 项</span>
        </div>
        <div class="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 overscroll-x-contain">
          <button
            v-for="entry in serviceEntries"
            :key="`service-${entry.id}`"
            type="button"
            class="w-[48%] shrink-0 snap-start overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 sm:w-[32%]"
            @click="openEntry(entry)"
          >
            <img
              :src="serviceEntryImage(entry)"
              :alt="entry.title"
              class="aspect-[16/9] w-full object-cover"
              loading="lazy"
            >
            <div class="p-2.5">
              <h3 class="line-clamp-1 text-xs font-bold sm:text-sm">
                {{ entry.title }}
              </h3>
              <p class="mt-1 line-clamp-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">
                {{ entry.summary }}
              </p>
            </div>
          </button>
        </div>
      </section>

      <section
        class="rounded-md bg-white dark:bg-zinc-900 p-4 shadow-sm"
        aria-labelledby="compact-tools-title"
      >
        <div class="flex items-center justify-between gap-3">
          <h2
            id="compact-tools-title"
            class="text-base font-black"
          >
            迎新指南功能
          </h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-500">{{ guideTools.length }} 项</span>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            v-for="entry in guideTools"
            :key="entry.id"
            type="button"
            class="flex min-h-16 items-center gap-2 rounded-md border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5 text-left"
            @click="openEntry(entry)"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-bold">{{ entry.title }}</span>
              <span class="mt-0.5 line-clamp-1 block text-xs text-zinc-500 dark:text-zinc-400">{{ entry.summary }}</span>
            </span>
            <UIcon
              :name="entry.icon"
              class="size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
            />
          </button>
        </div>
        <div
          v-if="timelineEntries.length"
          class="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-4"
        >
          <h3 class="text-sm font-bold">
            入学三步
          </h3>
          <div class="mt-2 grid gap-2 sm:grid-cols-3">
            <button
              v-for="(entry, index) in timelineEntries"
              :key="`timeline-${entry.id}`"
              type="button"
              class="flex items-center gap-3 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-3 text-left"
              @click="openEntry(entry)"
            >
              <span class="grid size-7 shrink-0 place-items-center rounded-full bg-zinc-900 dark:bg-zinc-700 text-xs font-bold text-white">{{ index + 1 }}</span>
              <span class="min-w-0">
                <span class="block text-sm font-bold">{{ entry.title }}</span>
                <span class="mt-0.5 line-clamp-1 block text-xs text-zinc-500 dark:text-zinc-400">{{ entry.summary }}</span>
              </span>
            </button>
          </div>
        </div>
      </section>

      <section
        class="rounded-md bg-white dark:bg-zinc-900 p-4 shadow-sm"
        aria-labelledby="compact-direct-title"
      >
        <div class="flex items-center justify-between gap-3">
          <h2
            id="compact-direct-title"
            class="text-base font-black"
          >
            直接打开
          </h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-500">{{ directEntries.length }} 项</span>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            v-for="entry in directEntries"
            :key="entry.id"
            type="button"
            class="flex min-h-16 items-center gap-2 rounded-md border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5 text-left hover:border-emerald-300 dark:hover:border-emerald-800"
            @click="openEntry(entry)"
          >
            <span class="min-w-0 flex-1">
              <span class="block line-clamp-1 text-sm font-bold">{{ entry.title }}</span>
              <span class="mt-0.5 block line-clamp-1 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{{ entry.summary }}</span>
            </span>
            <UIcon
              :name="entry.icon"
              class="size-4 shrink-0 text-sky-700 dark:text-sky-300"
            />
          </button>
        </div>
        <div
          v-if="featureEnabled('home.more.dorms')"
          class="mt-4 grid gap-3 sm:grid-cols-2"
        >
          <article class="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
            <video
              class="aspect-video w-full bg-black dark:bg-zinc-900 object-cover"
              controls
              playsinline
              preload="metadata"
              poster="/images/panorama/ordinary-dorm-poster.jpg"
            >
              <source
                src="/media/ordinary-dorm-tour.mp4"
                type="video/mp4"
              >
            </video>
            <p class="px-3 py-2 text-sm font-bold">
              普通型宿舍实拍
            </p>
          </article>
          <article class="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
            <video
              class="aspect-video w-full bg-black dark:bg-zinc-900 object-cover"
              controls
              playsinline
              preload="metadata"
              poster="/images/panorama/comfort-dorm-poster.jpg"
            >
              <source
                src="/media/comfort-dorm-tour.mp4"
                type="video/mp4"
              >
            </video>
            <p class="px-3 py-2 text-sm font-bold">
              舒适型宿舍实拍
            </p>
          </article>
        </div>
      </section>

      <section
        class="rounded-md bg-white dark:bg-zinc-900 p-4 shadow-sm"
        aria-labelledby="compact-more-title"
      >
        <div class="flex items-center justify-between gap-3">
          <h2
            id="compact-more-title"
            class="text-base font-black"
          >
            了解与反馈
          </h2>
          <span class="text-xs text-zinc-400 dark:text-zinc-500">{{ moreEntries.length }} 项</span>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            v-for="entry in moreEntries"
            :key="`more-${entry.id}`"
            type="button"
            class="flex min-h-16 items-center gap-2 rounded-md border border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2.5 text-left hover:border-emerald-300 dark:hover:border-emerald-800"
            @click="openEntry(entry)"
          >
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-bold">{{ entry.title }}</span>
              <span class="mt-0.5 line-clamp-1 block text-xs text-zinc-500 dark:text-zinc-400">{{ entry.summary }}</span>
            </span>
            <UIcon
              :name="entry.icon"
              class="size-4 shrink-0 text-emerald-700 dark:text-emerald-300"
            />
          </button>
        </div>
      </section>

      <section
        class="rounded-md bg-white dark:bg-zinc-900 p-4 shadow-sm"
        aria-labelledby="compact-content-title"
      >
        <div class="flex items-center justify-between gap-3">
          <h2
            id="compact-content-title"
            class="text-base font-black"
          >
            已整理内容
          </h2>
          <NuxtLink
            :to="activeCatalog?.to || '/discover'"
            class="text-xs font-semibold text-emerald-700 dark:text-emerald-300"
          >查看全部 {{ activeCatalog?.items.length ?? 0 }} 项</NuxtLink>
        </div>
        <div
          class="mt-3 flex snap-x gap-2 overflow-x-auto pb-1 overscroll-x-contain"
          role="tablist"
          aria-label="选择已整理内容分类"
        >
          <button
            v-for="catalog in contentCatalogs"
            :key="catalog.id"
            type="button"
            role="tab"
            class="inline-flex min-h-11 shrink-0 snap-start items-center gap-2 rounded-md border px-3 text-left transition"
            :class="activeCatalogId === catalog.id
              ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950 text-emerald-900'
              : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'"
            :aria-selected="activeCatalogId === catalog.id"
            @click="selectCatalog(catalog.id)"
          >
            <UIcon
              :name="catalog.icon"
              class="size-4"
            />
            <span class="text-xs font-bold">{{ catalog.label }}</span>
            <span class="text-[11px] tabular-nums opacity-65">{{ catalog.items.length }}</span>
          </button>
        </div>

        <div
          :key="activeCatalogId"
          class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          <button
            v-for="item in visibleCatalogItems"
            :key="item.id"
            type="button"
            class="min-w-0 rounded-md border border-zinc-200 dark:border-zinc-800 px-3 py-3 text-left transition hover:border-emerald-300 dark:hover:border-emerald-800 hover:bg-emerald-50/30"
            @click="openCatalogItem(item)"
          >
            <p class="line-clamp-2 text-sm font-bold leading-5">
              {{ item.title }}
            </p>
            <p class="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {{ item.summary }}
            </p>
          </button>
        </div>
        <button
          v-if="(activeCatalog?.items.length ?? 0) > 10"
          type="button"
          class="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-emerald-300 dark:hover:border-emerald-800"
          @click="toggleCatalogExpansion"
        >
          <UIcon
            :name="expandedCatalogId === activeCatalogId ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
            class="size-4"
          />
          {{ expandedCatalogId === activeCatalogId ? '收起' : `展开其余 ${hiddenCatalogItemCount} 条` }}
        </button>
      </section>

      <section
        class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4"
        aria-labelledby="compact-major-title"
      >
        <div class="flex items-end justify-between gap-3">
          <div>
            <p class="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
              26 个专业 · {{ majorCollegeCount }} 个学院
            </p>
            <h2
              id="compact-major-title"
              class="mt-1 text-base font-black"
            >
              专业与住宿片区
            </h2>
          </div>
          <UButton
            to="/major-lookup"
            label="完整查询"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div
            v-for="major in majorProfiles.slice(0, 8)"
            :key="major.code"
            class="min-w-0 rounded-md bg-zinc-50 dark:bg-zinc-800/60 p-3"
          >
            <p class="truncate text-xs font-bold text-zinc-900 dark:text-zinc-100">
              {{ major.name }}
            </p>
            <p class="mt-1 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {{ major.dormLabel }}
            </p>
          </div>
        </div>
      </section>

      <section
        v-if="nearbyHighlights.length"
        class="rounded-md bg-white dark:bg-zinc-900 p-4 shadow-sm"
        aria-labelledby="compact-nearby-title"
      >
        <div class="flex items-center justify-between gap-3">
          <h2
            id="compact-nearby-title"
            class="text-base font-black"
          >
            吃喝玩乐推荐
          </h2>
          <UButton
            to="/nearby"
            label="完整攻略"
            color="neutral"
            variant="ghost"
            size="sm"
          />
        </div>
        <div class="mt-3 flex gap-2 overflow-x-auto pb-1 overscroll-x-contain">
          <button
            v-for="item in nearbyHighlights"
            :key="item.id"
            type="button"
            class="w-48 shrink-0 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-left"
            @click="openNearbyItem(item)"
          >
            <img
              v-if="item.image"
              :src="item.image.src"
              :alt="item.image.alt"
              class="aspect-[16/9] w-full object-cover"
              loading="lazy"
            >
            <span
              v-else
              class="grid aspect-[16/9] w-full place-items-center bg-gradient-to-br from-emerald-50 to-sky-50 text-emerald-700 dark:text-emerald-300"
            >
              <UIcon
                :name="item.icon"
                class="size-7"
              />
            </span>
            <span class="block p-3">
              <span class="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">{{ nearbyGuideCategoryLabels[item.category] }}</span>
              <span class="mt-1 line-clamp-2 block text-sm font-bold leading-5">{{ item.title }}</span>
              <span class="mt-1 line-clamp-2 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ item.summary }}</span>
            </span>
          </button>
        </div>
      </section>
    </main>

    <UModal
      v-model:open="entrySheetOpen"
      :title="selectedEntryIsLinkPreview ? '链接预览' : (selectedEntry?.title || '入口详情')"
      :ui="entryModalUi"
    >
      <template #body>
        <article
          v-if="selectedEntry && !selectedEntryIsLinkPreview"
          class="space-y-5"
        >
          <section
            class="space-y-3"
            aria-label="入口主要内容"
          >
            <article
              v-for="(block, index) in selectedEntryContentBlocks"
              :key="`${selectedEntry.id}-detail-${index}`"
              class="rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3"
            >
              <h3 class="text-sm font-black text-zinc-900 dark:text-zinc-100">
                {{ block.title }}
              </h3>
              <p class="mt-1.5 whitespace-pre-line text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                {{ block.body }}
              </p>
            </article>
          </section>

          <section
            v-if="selectedEntryShowsContactQr"
            class="rounded-md border border-emerald-100 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/60 px-4 py-4 text-center"
            aria-label="联系整理者二维码"
          >
            <h3 class="text-sm font-black text-zinc-900 dark:text-zinc-100">
              联系整理者
            </h3>
            <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              长按识别二维码
            </p>
            <NuxtLink
              to="/images/contact-wechat.png"
              external
              target="_blank"
              rel="noopener noreferrer"
              class="mx-auto mt-3 block w-fit rounded-md bg-white dark:bg-zinc-900 p-2 shadow-sm ring-1 ring-zinc-200 dark:ring-zinc-700"
              aria-label="打开联系整理者二维码原图"
            >
              <img
                src="/images/contact-wechat.png"
                alt="联系整理者二维码"
                class="size-48 max-w-full object-contain"
                loading="lazy"
              >
            </NuxtLink>
          </section>

          <div class="border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <p class="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
              来源地址
            </p>
            <NuxtLink
              :to="selectedEntrySourceHref"
              :external="selectedEntrySourceExternal"
              :target="selectedEntrySourceExternal ? '_blank' : undefined"
              :rel="selectedEntrySourceExternal ? 'noopener noreferrer' : undefined"
              class="mt-1 block break-all text-sm font-semibold leading-6 text-emerald-700 dark:text-emerald-300 underline decoration-emerald-200 underline-offset-4"
            >
              {{ selectedEntrySourceLabel }}
            </NuxtLink>
          </div>
        </article>

        <article
          v-else-if="selectedEntry"
          class="rounded-md bg-zinc-50 dark:bg-zinc-800/60 px-4 py-4"
        >
          <p class="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
            将跳转至：
          </p>
          <NuxtLink
            :to="selectedEntrySourceHref"
            :external="selectedEntrySourceExternal"
            :target="selectedEntrySourceExternal ? '_blank' : undefined"
            :rel="selectedEntrySourceExternal ? 'noopener noreferrer' : undefined"
            class="mt-3 block break-all rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-4 text-sm font-semibold leading-7 text-emerald-700 dark:text-emerald-300 underline decoration-emerald-200 underline-offset-4"
          >
            {{ selectedEntrySourceLabel }}
          </NuxtLink>
        </article>
      </template>

      <template #footer>
        <UButton
          v-if="selectedEntry && !selectedEntryIsLinkPreview"
          :to="selectedEntry.to"
          :external="selectedEntry.external"
          :target="selectedEntry.external ? '_blank' : undefined"
          :rel="selectedEntry.external ? 'noopener noreferrer' : undefined"
          icon="i-lucide-arrow-up-right"
          label="进入完整页面"
          block
        />
      </template>
    </UModal>

    <UModal
      v-model:open="noticeOpen"
      title="公告详情"
    >
      <template #body>
        <article
          v-if="selectedNotice"
          class="max-h-[70dvh] overflow-y-auto overscroll-contain"
        >
          <div class="flex items-center justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>{{ selectedNotice.confirmationCount }} 人已读</span>
            <span :class="selectedNotice.confirmed ? 'text-success-700 dark:text-success-400' : 'text-amber-700 dark:text-amber-300'">{{ selectedNotice.confirmed ? '已读' : '未读' }}</span>
          </div>
          <h2 class="mt-2 text-xl font-black text-zinc-950 dark:text-zinc-100">
            {{ selectedNotice.title }}
          </h2>
          <p
            v-if="selectedNotice.summary"
            class="mt-3 rounded-md bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm leading-6 text-amber-950 dark:text-amber-100"
          >
            {{ selectedNotice.summary }}
          </p>
          <div class="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-700 dark:text-zinc-200">
            {{ selectedNotice.body || selectedNotice.summary }}
          </div>
          <div
            v-if="selectedNotice.actions.length"
            class="mt-5 flex flex-wrap gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4"
          >
            <UButton
              v-for="action in selectedNotice.actions"
              :key="`${action.label}-${action.href}`"
              :to="noticeActionHref(action)"
              :icon="action.icon || 'i-lucide-arrow-up-right'"
              :label="action.label"
              variant="soft"
            />
          </div>
        </article>
      </template>
    </UModal>
  </div>
</template>
