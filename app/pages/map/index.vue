<script setup lang="ts">
import type { GeoPoint, MapPoi } from '~~/map/core/types'
import type { MapProvider, MapProviderId } from '~~/map/core/provider'
import { officialSources } from '~~/data/seeds/public-content'
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'
import { createRuntimeMapProvider } from '~~/map/providers/factory'
import { buildDetailFeedbackLink } from '~/utils/feedback-context'
import type { PublicMapPlace } from '~/utils/public-catalog'
import { mergePublicMapPlaces, toMapPoi } from '~/utils/public-catalog'
import { safeLocalPath } from '~/utils/safe-navigation'

useSeoMeta({
  title: '校园地图',
  description: '查找仰恩大学教学楼、宿舍、食堂、服务点与校园周边地点。',
  robots: 'noindex, nofollow'
})

interface MapCategory {
  id: string
  label: string
  icon: string
}

const categories: MapCategory[] = [
  { id: 'all', label: '全部', icon: 'i-lucide-layout-grid' },
  { id: 'campus-building', label: '教学', icon: 'i-lucide-school' },
  { id: 'dorm', label: '宿舍', icon: 'i-lucide-bed-single' },
  { id: 'food', label: '餐饮', icon: 'i-lucide-utensils' },
  { id: 'service', label: '服务', icon: 'i-lucide-landmark' },
  { id: 'express', label: '快递', icon: 'i-lucide-package' },
  { id: 'gate', label: '校门', icon: 'i-lucide-door-open' },
  { id: 'nearby', label: '周边', icon: 'i-lucide-store' }
]

const categoryKeywords: Record<string, string> = {
  'campus-building': '教学 建筑 校内',
  'dorm': '宿舍 寝室 住宿 生活区',
  'food': '食堂 餐厅 吃饭 餐饮',
  'service': '服务 办事',
  'express': '快递 驿站 取件 寄件 包裹',
  'gate': '校门 入口 出入口',
  'nearby': '周边 商铺 洗衣'
}

const poiKeywords: Record<string, string> = {
  'preview-library': '借书 自习 阅读',
  'preview-network-information-center': '校园网 网络认证 wifi 信息化',
  'preview-new-campus-clinic': '看病 生病 医疗 药品',
  'preview-old-campus-clinic': '看病 生病 医疗 药品',
  'preview-yunda-express': '取件 寄件 包裹',
  'preview-express-alliance-zto': '取件 寄件 包裹 中通'
}

function queryValue(value: unknown) {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

const route = useRoute()
const router = useRouter()
const categoryIds = new Set(categories.map(category => category.id))
const initialCategory = queryValue(route.query.category)
const initialPlace = queryValue(route.query.place)
const { data: publicPlaceResponse, error: publicPlaceError } = await usePublicPlaceList()
const places = computed(() => mergePublicMapPlaces(
  campusMapReferencePlaces,
  publicPlaceResponse.value?.items ?? []
))
const activeScope = computed<'campus' | 'nearby' | null>(() => {
  const scope = queryValue(route.query.scope)
  return scope === 'campus' || scope === 'nearby' ? scope : null
})
const publishedPlacesInScope = computed(() => (publicPlaceResponse.value?.items ?? [])
  .filter(place => !activeScope.value || place.scope === activeScope.value))
const canShowOfficialPlan = computed(() => activeScope.value !== 'nearby')
const mapViewMode = ref<'geographic' | 'official-plan'>(
  activeScope.value === 'nearby' || publishedPlacesInScope.value.length
    ? 'geographic'
    : 'official-plan'
)
type MobileSheetState = 'collapsed' | 'half' | 'expanded'
const mobileSheetState = ref<MobileSheetState>('half')
const mobileSheetHeightClass = computed(() => ({
  collapsed: 'h-20',
  half: 'h-[44%]',
  expanded: 'h-[calc(100%_-_0.75rem)]'
})[mobileSheetState.value])
const mapDataLabel = computed(() => {
  if (publicPlaceError.value) return '静态目录'
  if (publishedPlacesInScope.value.length) return '已发布目录'
  if (activeScope.value === 'nearby') return '周边待核验'
  return '官网平面图索引'
})
const mapFallbackMessage = computed(() => {
  if (publicPlaceError.value) return '公开地点暂时不可用，当前显示内置文字目录，不绘制候选坐标。'
  if (activeScope.value === 'nearby' && !publishedPlacesInScope.value.length) {
    return '暂无完成位置、来源和营业状态核验的周边地点，因此不显示候选商铺或近似坐标。'
  }
  if (!publishedPlacesInScope.value.length) return '后台暂无已发布坐标，可使用学校官网平面图对照 47 项校内地点；原图没有地理控制点，不用于导航。'
  return null
})

const mapElement = ref<HTMLElement | null>(null)
const mapProvider = shallowRef<MapProvider | null>(null)
const activeMapProviderId = ref<MapProviderId | null>(null)
const mapStatus = ref<'loading' | 'ready' | 'error'>('loading')
const mapErrorMessage = ref('地图暂时无法加载，请检查网络和地图配置后重试。')
const searchQuery = ref(queryValue(route.query.q))
const activeCategory = ref(categoryIds.has(initialCategory) ? initialCategory : 'all')
const initialSelectedPoi = places.value.find(poi => poi.slug === initialPlace || poi.id === initialPlace)
const selectedPoiId = ref<string | null>(initialSelectedPoi?.id ?? null)
const locating = ref(false)
const toast = useToast()
const { copyText, isWechat } = useShareActions()
const poiRowElements = new Map<string, HTMLElement>()
let routeSyncTimer: ReturnType<typeof setTimeout> | null = null
let applyingRouteState = false

const filteredPois = computed(() => {
  const normalizedQuery = searchQuery.value.trim().toLocaleLowerCase('zh-CN')

  return places.value.filter((poi) => {
    const matchesScope = !activeScope.value || poi.scope === activeScope.value
    const matchesCategory = activeCategory.value === 'all' || poi.category === activeCategory.value
    const searchText = [
      poi.name,
      poi.searchText,
      categoryKeywords[poi.category] ?? '',
      poiKeywords[poi.id] ?? ''
    ].join(' ').toLocaleLowerCase('zh-CN')
    const matchesQuery = !normalizedQuery || searchText.includes(normalizedQuery)
    return matchesScope && matchesCategory && matchesQuery
  })
})

const filteredMapPois = computed<MapPoi[]>(() => filteredPois.value.flatMap((place) => {
  const poi = toMapPoi(place)
  return poi ? [poi] : []
}))

const selectedPoi = computed(() => (
  places.value.find(poi => poi.id === selectedPoiId.value) ?? null
))
const returnPath = computed(() => safeLocalPath(route.query.from))

function placeRouteValue(poi: PublicMapPlace) {
  return poi.slug ?? poi.id
}

function placeDetailsTarget(poi: PublicMapPlace) {
  if (!poi.isApiPublished || !poi.slug) return undefined
  return {
    path: `/places/${poi.slug}`,
    query: { from: returnPath.value ?? route.fullPath }
  }
}

function placeFeedbackTarget(poi: PublicMapPlace) {
  if (!poi.isApiPublished) return undefined
  return buildDetailFeedbackLink({
    targetType: 'place',
    targetId: poi.id,
    targetName: poi.name,
    reasonType: 'place_error',
    from: route.fullPath
  })
}

function copyPoiLocation(poi: PublicMapPlace): void {
  const text = [
    poi.name,
    poi.referenceLabel,
    poi.campusArea,
    poi.address
  ].filter((value): value is string => Boolean(value)).join(' · ')
  void copyText(text, '地点信息')
}

function categoryLabel(categoryId: string) {
  return categories.find(category => category.id === categoryId)?.label ?? '地点'
}

function categoryIcon(categoryId: string) {
  return categories.find(category => category.id === categoryId)?.icon ?? 'i-lucide-map-pin'
}

function poiStatusText(poi: PublicMapPlace) {
  if (poi.pointIsVerified) return 'WGS84 坐标已核验'
  if (poi.coordinateVerification === 'verified' && poi.coordinateSystem) {
    return `${poi.coordinateSystem} 坐标已核验 · 当前底图不兼容`
  }
  if (poi.usesPreviewPoint) return `${poi.referenceLabel ?? '官网平面图索引'} · 不绘制标点`
  return '地点已发布 · 坐标暂不显示'
}

function handlePoiSelected(poi: MapPoi | null) {
  selectedPoiId.value = poi?.id ?? null
  mapProvider.value?.setSelectedPoi(poi?.id ?? null)

  if (poi) {
    void nextTick(() => poiRowElements.get(poi.id)?.scrollIntoView({ block: 'nearest' }))
  }
}

function setPoiRowElement(id: string, element: unknown) {
  if (element instanceof HTMLElement) {
    poiRowElements.set(id, element)
    return
  }

  poiRowElements.delete(id)
}

function poiRowRef(id: string) {
  return (element: unknown) => setPoiRowElement(id, element)
}

function hasMapError() {
  return mapStatus.value === 'error'
}

function selectPoi(poi: PublicMapPlace) {
  selectedPoiId.value = poi.id
  if (mobileSheetState.value === 'collapsed') mobileSheetState.value = 'half'
  if (poi.usesPreviewPoint && canShowOfficialPlan.value) mapViewMode.value = 'official-plan'
  mapProvider.value?.setSelectedPoi(poi.point ? poi.id : null)
  if (poi.point) mapProvider.value?.flyToPoi(poi.id)
}

function selectedOfficialPlanNumber(poi: PublicMapPlace | null): string | null {
  return poi?.id.match(/^campus-map-(\d{2})$/)?.[1] ?? null
}

function selectOfficialPlanNumber(mapNumber: string): void {
  const poi = places.value.find(place => place.id === `campus-map-${mapNumber}`)
  if (!poi) return
  searchQuery.value = ''
  activeCategory.value = 'all'
  selectPoi(poi)
}

function closePoiDetails() {
  selectedPoiId.value = null
  mapProvider.value?.setSelectedPoi(null)
}

function setCategory(categoryId: string) {
  activeCategory.value = categoryId
  closePoiDetails()
}

function fitToVisiblePois() {
  closePoiDetails()
  mapProvider.value?.fitToPois()
}

function locateUser() {
  if (!navigator.geolocation) {
    toast.add({ title: '当前浏览器不支持定位', color: 'warning' })
    return
  }

  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (position) => {
      const point: GeoPoint = {
        lng: position.coords.longitude,
        lat: position.coords.latitude,
        crs: 'WGS84'
      }

      mapProvider.value?.flyToPoint(point, 17)
      locating.value = false
    },
    () => {
      locating.value = false
      toast.add({ title: '未能获取位置', description: '请检查浏览器定位权限。', color: 'warning' })
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  )
}

async function mountMap() {
  if (!mapElement.value) return

  mapStatus.value = 'loading'
  mapErrorMessage.value = '地图暂时无法加载，请检查网络和地图配置后重试。'
  mapProvider.value?.destroy()
  mapProvider.value = null
  activeMapProviderId.value = null

  try {
    const provider = await createRuntimeMapProvider()
    mapProvider.value = provider
    activeMapProviderId.value = provider.id
    provider.onPoiSelect(handlePoiSelected)
    provider.onError((error) => {
      if (mapProvider.value !== provider) return
      mapErrorMessage.value = error.message
      mapStatus.value = 'error'
    })
    await provider.mount(mapElement.value, { zoom: 15 })
    provider.setPois(filteredMapPois.value)

    const selectedPlace = filteredPois.value.find(poi => poi.id === selectedPoiId.value)
    if (selectedPlace?.point) {
      provider.setSelectedPoi(selectedPlace.id)
      provider.flyToPoi(selectedPlace.id)
    } else {
      if (!selectedPlace) selectedPoiId.value = null
      provider.fitToPois()
    }

    if (!hasMapError()) mapStatus.value = 'ready'
  } catch (error) {
    mapErrorMessage.value = error instanceof Error
      ? error.message
      : '地图暂时无法加载，请检查网络和地图配置后重试。'
    mapStatus.value = 'error'
  }
}

watch(filteredMapPois, (pois) => {
  mapProvider.value?.setPois(pois)
})

watch(filteredPois, (pois) => {
  if (selectedPoiId.value && !pois.some(poi => poi.id === selectedPoiId.value)) {
    closePoiDetails()
  }
})

watch([searchQuery, activeCategory, selectedPoiId], () => {
  if (applyingRouteState) return
  if (routeSyncTimer) clearTimeout(routeSyncTimer)

  routeSyncTimer = setTimeout(() => {
    const query = { ...route.query }

    if (searchQuery.value.trim()) query.q = searchQuery.value.trim()
    else delete query.q

    if (activeCategory.value !== 'all') query.category = activeCategory.value
    else delete query.category

    const selected = places.value.find(poi => poi.id === selectedPoiId.value)
    if (selected) query.place = placeRouteValue(selected)
    else delete query.place

    void router.replace({ query })
  }, 180)
})

watch(() => route.query, async (query, previousQuery) => {
  const filtersChanged = queryValue(query.q) !== queryValue(previousQuery?.q)
    || queryValue(query.category) !== queryValue(previousQuery?.category)
    || queryValue(query.scope) !== queryValue(previousQuery?.scope)

  applyingRouteState = true
  if (queryValue(query.scope) === 'nearby') mapViewMode.value = 'geographic'
  searchQuery.value = queryValue(query.q)

  const category = queryValue(query.category)
  activeCategory.value = categoryIds.has(category) ? category : 'all'

  const place = queryValue(query.place)
  const nextSelectedId = places.value.find(poi => poi.slug === place || poi.id === place)?.id ?? null
  selectedPoiId.value = nextSelectedId

  await nextTick()

  const nextSelected = places.value.find(poi => poi.id === selectedPoiId.value)
  const selectionIsVisible = Boolean(nextSelected && filteredPois.value.some(poi => poi.id === nextSelected.id))
  mapProvider.value?.setSelectedPoi(selectionIsVisible && nextSelected?.point ? nextSelected.id : null)

  if (filtersChanged || !selectionIsVisible || !nextSelected?.point) {
    mapProvider.value?.fitToPois()
  } else {
    mapProvider.value?.flyToPoi(nextSelected.id)
  }

  if (selectionIsVisible && nextSelected) {
    poiRowElements.get(nextSelected.id)?.scrollIntoView({ block: 'nearest' })
  }

  applyingRouteState = false
}, { deep: true })

onMounted(mountMap)

onBeforeUnmount(() => {
  if (routeSyncTimer) clearTimeout(routeSyncTimer)
  mapProvider.value?.destroy()
  mapProvider.value = null
})
</script>

<template>
  <div class="map-workspace relative h-[calc(100dvh-var(--header-height)-var(--mobile-nav-height))] min-h-[34rem] overflow-hidden bg-white md:grid md:h-[calc(100dvh-var(--header-height))] md:min-h-[40rem] md:grid-cols-[18rem_minmax(0,1fr)] md:grid-rows-1">
    <aside
      class="absolute inset-x-0 bottom-0 z-20 flex min-h-0 min-w-0 flex-col rounded-t-md border-t border-[var(--line)] bg-white shadow-[0_-6px_24px_rgb(0_0_0/12%)] transition-[height] duration-200 md:static md:order-1 md:h-auto md:rounded-none md:border-r md:border-t-0 md:shadow-none"
      :class="[
        mobileSheetHeightClass,
        selectedPoi && mobileSheetState !== 'collapsed' ? 'overflow-y-auto' : 'overflow-hidden'
      ]"
    >
      <div class="flex h-20 shrink-0 items-center justify-between gap-3 border-b border-[var(--line)] px-4 md:hidden">
        <div class="min-w-0">
          <div class="mx-auto mb-2 h-1 w-10 rounded-full bg-zinc-300" />
          <p class="truncate text-sm font-semibold text-zinc-900">
            {{ selectedPoi?.name ?? `地点列表 · ${filteredPois.length}` }}
          </p>
        </div>
        <div
          class="flex shrink-0 items-center gap-1"
          role="group"
          aria-label="地图面板高度"
        >
          <UTooltip text="收起地点面板">
            <UButton
              icon="i-lucide-chevrons-down"
              color="neutral"
              variant="ghost"
              class="size-9"
              aria-label="收起地点面板"
              :aria-pressed="mobileSheetState === 'collapsed'"
              @click="mobileSheetState = 'collapsed'"
            />
          </UTooltip>
          <UTooltip text="半屏显示地点面板">
            <UButton
              icon="i-lucide-minus"
              color="neutral"
              variant="ghost"
              class="size-9"
              aria-label="半屏显示地点面板"
              :aria-pressed="mobileSheetState === 'half'"
              @click="mobileSheetState = 'half'"
            />
          </UTooltip>
          <UTooltip text="展开地点面板">
            <UButton
              icon="i-lucide-chevrons-up"
              color="neutral"
              variant="ghost"
              class="size-9"
              aria-label="展开地点面板"
              :aria-pressed="mobileSheetState === 'expanded'"
              @click="mobileSheetState = 'expanded'"
            />
          </UTooltip>
        </div>
      </div>

      <div
        class="shrink-0 border-b border-[var(--line)] px-4 py-3 md:block md:px-5 md:py-4"
        :class="mobileSheetState === 'collapsed' ? 'hidden' : 'block'"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-xs font-semibold text-green-700">
              YEU CAMPUS
            </p>
            <h1 class="mt-1 text-lg font-bold text-zinc-950">
              校园与周边
            </h1>
          </div>
          <UBadge
            color="warning"
            variant="soft"
            size="sm"
          >
            {{ mapDataLabel }}
          </UBadge>
        </div>

        <UInput
          v-model="searchQuery"
          class="mt-3 w-full"
          icon="i-lucide-search"
          placeholder="搜索教学楼、宿舍或服务点"
          aria-label="搜索地图地点"
        >
          <template
            v-if="searchQuery"
            #trailing
          >
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              aria-label="清空搜索"
              @click="searchQuery = ''"
            />
          </template>
        </UInput>

        <div
          class="scrollbar-none mt-3 flex gap-1.5 overflow-x-auto pb-1"
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
            class="min-h-11 shrink-0"
            :aria-pressed="activeCategory === category.id"
            @click="setCategory(category.id)"
          />
        </div>

        <p
          v-if="mapFallbackMessage"
          class="mt-2 text-xs leading-5 text-blue-800"
          role="status"
        >
          {{ mapFallbackMessage }}
        </p>
      </div>

      <section
        v-if="selectedPoi && mobileSheetState !== 'collapsed'"
        class="shrink-0 border-b border-[var(--line)] p-4 md:hidden"
        aria-live="polite"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-xs font-medium text-green-700">
              <UIcon
                :name="categoryIcon(selectedPoi.category)"
                class="size-4"
              />
              <span>{{ categoryLabel(selectedPoi.category) }}</span>
            </div>
            <h2 class="mt-1 truncate font-bold text-zinc-950">
              {{ selectedPoi.name }}
            </h2>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            class="size-11"
            aria-label="关闭地点详情"
            @click="closePoiDetails"
          />
        </div>
        <p class="mt-2 text-xs leading-5 text-zinc-600">
          {{ selectedPoi.summary }}
        </p>
        <p
          v-if="selectedPoi.address"
          class="mt-1 text-xs leading-5 text-zinc-500"
        >
          {{ selectedPoi.address }}
        </p>
        <div class="mt-3 border-t border-zinc-100 pt-3">
          <span
            class="text-xs"
            :class="selectedPoi.pointIsVerified ? 'text-green-700' : 'text-orange-700'"
          >{{ poiStatusText(selectedPoi) }}</span>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              v-if="placeDetailsTarget(selectedPoi)"
              :to="placeDetailsTarget(selectedPoi)"
              icon="i-lucide-info"
              label="详情"
              size="sm"
            />
            <UButton
              v-if="placeFeedbackTarget(selectedPoi)"
              :to="placeFeedbackTarget(selectedPoi)"
              icon="i-lucide-message-square-warning"
              label="纠错"
              color="neutral"
              variant="outline"
              size="sm"
            />
            <UButton
              icon="i-lucide-copy"
              label="复制位置"
              color="neutral"
              variant="outline"
              size="sm"
              @click="copyPoiLocation(selectedPoi)"
            />
            <UButton
              :to="selectedPoi.navigationUrl ?? undefined"
              :target="selectedPoi.navigationUrl ? '_blank' : undefined"
              icon="i-lucide-navigation"
              label="导航"
              color="neutral"
              variant="outline"
              size="sm"
              :disabled="!selectedPoi.navigationUrl"
            />
            <span
              v-if="isWechat && selectedPoi.navigationUrl"
              class="w-full text-xs leading-5 text-zinc-500"
            >微信内未唤起地图时，可复制位置后搜索。</span>
            <UButton
              v-if="returnPath"
              :to="returnPath"
              icon="i-lucide-undo-2"
              label="返回来源"
              color="neutral"
              variant="ghost"
              size="sm"
            />
          </div>
        </div>
      </section>

      <div
        class="items-center justify-between border-b border-[var(--line)] px-4 py-2 text-xs text-zinc-500 md:flex md:px-5"
        :class="selectedPoi
          ? 'hidden'
          : mobileSheetState === 'collapsed'
            ? 'hidden md:flex'
            : 'flex'"
      >
        <span>{{ filteredPois.length }} 个地点</span>
        <button
          class="font-medium text-green-700 hover:text-green-800"
          type="button"
          @click="fitToVisiblePois"
        >
          查看全部
        </button>
      </div>

      <div
        class="min-h-0 flex-1 overflow-y-auto md:block"
        :class="selectedPoi
          ? 'hidden'
          : mobileSheetState === 'collapsed'
            ? 'hidden md:block'
            : 'block'"
        aria-label="地点列表"
      >
        <button
          v-for="poi in filteredPois"
          :key="poi.id"
          :ref="poiRowRef(poi.id)"
          type="button"
          class="flex w-full items-center gap-3 border-b border-zinc-100 px-4 py-3 text-left transition hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-green-700 md:px-5"
          :class="selectedPoiId === poi.id ? 'bg-green-50' : 'bg-white'"
          @click="selectPoi(poi)"
        >
          <span
            class="grid size-9 shrink-0 place-items-center rounded-md"
            :class="selectedPoiId === poi.id ? 'bg-green-700 text-white' : 'bg-zinc-100 text-zinc-600'"
          >
            <UIcon
              :name="categoryIcon(poi.category)"
              class="size-4"
            />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-semibold text-zinc-900">{{ poi.name }}</span>
            <span class="mt-0.5 block text-xs text-zinc-500">{{ categoryLabel(poi.category) }} · {{ poiStatusText(poi) }}</span>
          </span>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 shrink-0 text-zinc-400"
          />
        </button>

        <div
          v-if="filteredPois.length === 0"
          class="grid min-h-32 place-items-center p-6 text-center"
        >
          <div>
            <UIcon
              name="i-lucide-map-pin-off"
              class="mx-auto size-6 text-zinc-400"
            />
            <p class="mt-2 text-sm font-medium text-zinc-700">
              没有匹配的地点
            </p>
          </div>
        </div>
      </div>
    </aside>

    <section
      class="absolute inset-0 min-h-0 min-w-0 overflow-hidden bg-[#e5ebe7] md:relative md:inset-auto md:order-2"
      aria-label="校园地图"
    >
      <div
        v-show="mapViewMode === 'geographic'"
        ref="mapElement"
        class="absolute inset-0"
      />

      <MapOfficialCampusPlan
        v-if="mapViewMode === 'official-plan'"
        :selected-map-number="selectedOfficialPlanNumber(selectedPoi)"
        :selected-reference-label="selectedPoi?.referenceLabel"
        :selected-place-name="selectedPoi?.name"
        @select-number="selectOfficialPlanNumber"
      />

      <div class="pointer-events-none absolute inset-x-3 top-3 z-10 flex items-start justify-between gap-3 md:inset-x-4 md:top-4">
        <div class="flex flex-col items-start gap-1.5">
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
              ? '学校官网原图'
              : activeMapProviderId === 'amap'
                ? '高德地图'
                : 'OSM 预览底图' }}
          </UBadge>
          <UTooltip
            v-if="mapViewMode === 'geographic' && activeMapProviderId !== 'amap'"
            text="绿色虚线来自 OSM 社区测绘，只表示校园范围参考，不代表楼栋坐标已核验。"
          >
            <UBadge
              color="success"
              variant="solid"
              class="pointer-events-auto shadow-sm"
            >
              <UIcon
                name="i-lucide-pentagon"
                class="mr-1 size-3.5"
              />
              社区测绘校界
            </UBadge>
          </UTooltip>
        </div>
        <div
          v-if="canShowOfficialPlan"
          class="pointer-events-auto absolute left-1/2 top-0 flex -translate-x-1/2 overflow-hidden rounded-md border border-white/40 bg-white shadow-sm"
          role="group"
          aria-label="地图显示模式"
        >
          <UButton
            icon="i-lucide-map"
            label="地图"
            size="xs"
            :color="mapViewMode === 'geographic' ? 'primary' : 'neutral'"
            :variant="mapViewMode === 'geographic' ? 'solid' : 'ghost'"
            class="rounded-none"
            :aria-pressed="mapViewMode === 'geographic'"
            @click="mapViewMode = 'geographic'"
          />
          <UButton
            icon="i-lucide-image"
            label="平面图"
            size="xs"
            :color="mapViewMode === 'official-plan' ? 'primary' : 'neutral'"
            :variant="mapViewMode === 'official-plan' ? 'solid' : 'ghost'"
            class="rounded-none"
            :aria-pressed="mapViewMode === 'official-plan'"
            @click="mapViewMode = 'official-plan'"
          />
        </div>
        <div
          v-if="mapViewMode === 'geographic'"
          class="pointer-events-auto flex flex-col gap-2"
        >
          <UTooltip text="显示全部地点">
            <UButton
              icon="i-lucide-scan"
              color="neutral"
              variant="solid"
              class="size-11"
              aria-label="显示全部地点"
              @click="fitToVisiblePois"
            />
          </UTooltip>
          <UTooltip text="定位到我的位置">
            <UButton
              icon="i-lucide-locate-fixed"
              color="neutral"
              variant="solid"
              :loading="locating"
              class="size-11"
              aria-label="定位到我的位置"
              @click="locateUser"
            />
          </UTooltip>
        </div>
      </div>

      <div
        v-if="mapViewMode === 'geographic' && mapStatus !== 'ready'"
        class="absolute inset-0 z-20 grid place-items-center bg-[#e5ebe7]/95 p-6 text-center"
      >
        <div v-if="mapStatus === 'loading'">
          <UIcon
            name="i-lucide-loader-circle"
            class="mx-auto size-7 animate-spin text-green-700"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-800">
            正在载入地图
          </p>
        </div>
        <div
          v-else
          class="max-w-xs"
        >
          <UIcon
            name="i-lucide-map-off"
            class="mx-auto size-8 text-zinc-500"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-900">
            地图暂时无法载入
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500">
            {{ mapErrorMessage }}地点列表仍可继续浏览。
          </p>
          <UButton
            class="mt-4"
            icon="i-lucide-refresh-cw"
            label="重新载入"
            color="neutral"
            variant="outline"
            size="sm"
            @click="mountMap"
          />
        </div>
      </div>

      <div
        v-else-if="mapViewMode === 'geographic' && filteredMapPois.length === 0"
        class="pointer-events-none absolute inset-x-4 top-32 z-10 flex justify-center md:top-20"
        role="status"
      >
        <div class="max-w-sm border border-zinc-200 bg-white/95 px-4 py-3 text-center shadow-sm backdrop-blur-sm">
          <UIcon
            name="i-lucide-map-pin-off"
            class="mx-auto size-5 text-zinc-500"
          />
          <p class="mt-2 text-sm font-semibold text-zinc-900">
            暂无可在当前底图展示的已核验标点
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500">
            {{ activeMapProviderId === 'amap'
              ? '左侧文字目录仍可搜索；WGS84 转换失败、候选、未核验及其他坐标系的地点不会绘制为标点。'
              : '绿色虚线仅表示 OSM 社区测绘校界。左侧文字目录仍可搜索；候选、未核验及非 WGS84 坐标不会绘制为标点。' }}
          </p>
          <UButton
            :to="officialSources.campusMap.url"
            target="_blank"
            icon="i-lucide-external-link"
            label="查看官网平面图"
            color="neutral"
            variant="outline"
            size="sm"
            class="pointer-events-auto mt-3"
          />
        </div>
      </div>

      <section
        v-if="selectedPoi"
        class="absolute bottom-12 left-4 z-10 hidden w-[min(24rem,calc(100%-2rem))] rounded-md border border-zinc-200 bg-white p-4 shadow-lg md:block"
        aria-live="polite"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <div class="flex items-center gap-2 text-xs font-medium text-green-700">
              <UIcon
                :name="categoryIcon(selectedPoi.category)"
                class="size-4"
              />
              <span>{{ categoryLabel(selectedPoi.category) }}</span>
            </div>
            <h2 class="mt-1 truncate text-base font-bold text-zinc-950">
              {{ selectedPoi.name }}
            </h2>
          </div>
          <UButton
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            class="size-11"
            aria-label="关闭地点详情"
            @click="closePoiDetails"
          />
        </div>
        <p class="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-600">
          {{ selectedPoi.summary }}
        </p>
        <dl
          v-if="selectedPoi.address || selectedPoi.campusArea || selectedPoi.openingHours || selectedPoi.phone"
          class="mt-3 space-y-2 border-t border-zinc-100 pt-3 text-xs"
        >
          <div v-if="selectedPoi.address">
            <dt class="text-zinc-400">
              位置
            </dt>
            <dd class="mt-0.5 text-zinc-700">
              {{ selectedPoi.address }}
            </dd>
          </div>
          <div v-if="selectedPoi.campusArea">
            <dt class="text-zinc-400">
              片区
            </dt>
            <dd class="mt-0.5 text-zinc-700">
              {{ selectedPoi.campusArea }}
            </dd>
          </div>
          <div v-if="selectedPoi.openingHours">
            <dt class="text-zinc-400">
              开放时间
            </dt>
            <dd class="mt-0.5 text-zinc-700">
              {{ selectedPoi.openingHours }}
            </dd>
          </div>
          <div v-if="selectedPoi.phone">
            <dt class="text-zinc-400">
              公开电话
            </dt>
            <dd class="mt-0.5 text-zinc-700">
              {{ selectedPoi.phone }}
            </dd>
          </div>
        </dl>
        <div class="mt-4 border-t border-zinc-100 pt-3">
          <span
            class="text-xs"
            :class="selectedPoi.pointIsVerified ? 'text-green-700' : 'text-orange-700'"
          >{{ poiStatusText(selectedPoi) }}</span>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              v-if="placeDetailsTarget(selectedPoi)"
              :to="placeDetailsTarget(selectedPoi)"
              icon="i-lucide-info"
              label="详情"
              size="sm"
            />
            <UButton
              v-if="placeFeedbackTarget(selectedPoi)"
              :to="placeFeedbackTarget(selectedPoi)"
              icon="i-lucide-message-square-warning"
              label="纠错"
              color="neutral"
              variant="outline"
              size="sm"
            />
            <UButton
              icon="i-lucide-copy"
              label="复制位置"
              color="neutral"
              variant="outline"
              size="sm"
              @click="copyPoiLocation(selectedPoi)"
            />
            <UTooltip :text="selectedPoi.navigationUrl ? '使用已核验地点提供的外部导航入口' : '坐标未核验或未提供安全的导航入口'">
              <UButton
                :to="selectedPoi.navigationUrl ?? undefined"
                :target="selectedPoi.navigationUrl ? '_blank' : undefined"
                icon="i-lucide-navigation"
                label="导航"
                color="neutral"
                variant="outline"
                size="sm"
                :disabled="!selectedPoi.navigationUrl"
              />
            </UTooltip>
            <span
              v-if="isWechat && selectedPoi.navigationUrl"
              class="w-full text-xs leading-5 text-zinc-500"
            >微信内未唤起地图时，可复制位置后搜索。</span>
            <UButton
              v-if="returnPath"
              :to="returnPath"
              icon="i-lucide-undo-2"
              label="返回来源"
              color="neutral"
              variant="ghost"
              size="sm"
            />
          </div>
        </div>
      </section>
    </section>
  </div>
</template>

<style>
.map-workspace .maplibregl-map {
  position: absolute;
  inset: 0;
}

.map-workspace .maplibregl-ctrl-bottom-left,
.map-workspace .maplibregl-ctrl-bottom-right {
  bottom: 0.5rem;
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
  outline: 2px solid #176f46;
  outline-offset: -2px;
}
</style>
