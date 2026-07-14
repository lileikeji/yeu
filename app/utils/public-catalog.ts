import type {
  FreshmanGuide,
  GuideSection,
  OfficialDepartment,
  PublicSource
} from '~~/data/seeds/public-content'
import type { GeoPoint, MapPoi } from '~~/map/core/types'
import type { CampusMapReferencePlace } from '~~/data/seeds/preview-places'
import type { AmapImportedPlace } from '~~/data/seeds/amap-imported-places'
import type { ContentKind } from '~~/shared/constants/server'
import type { ApiContent, ApiListResponse, ApiPlace } from '~~/shared/types/server'

type GuideCategory = FreshmanGuide['category']

const guideCategoryDefaults: Record<GuideCategory, { icon: string, statusText: string }> = {
  arrival: { icon: 'i-lucide-clipboard-check', statusText: '已发布并核验' },
  campus: { icon: 'i-lucide-school', statusText: '已发布并核验' },
  life: { icon: 'i-lucide-coffee', statusText: '已发布并核验' },
  community: { icon: 'i-lucide-users-round', statusText: '已发布并核验' }
}

const audienceLabels: Record<string, Array<'本科新生' | '专升本新生'>> = {
  all: ['本科新生', '专升本新生'],
  undergraduate: ['本科新生'],
  upgrade: ['专升本新生'],
  top_up: ['专升本新生']
}
const defaultAudience: FreshmanGuide['audience'] = ['本科新生', '专升本新生']

const mapCategories = new Set([
  'campus-building',
  'dorm',
  'food',
  'service',
  'express',
  'gate',
  'nearby'
])

const mapCategoryAliases: Record<string, string> = {
  building: 'campus-building',
  teaching: 'campus-building',
  classroom: 'campus-building',
  dormitory: 'dorm',
  accommodation: 'dorm',
  canteen: 'food',
  restaurant: 'food',
  dining: 'food',
  office: 'service',
  department: 'service',
  clinic: 'service',
  delivery: 'express',
  courier: 'express',
  entrance: 'gate',
  shop: 'nearby',
  store: 'nearby',
  merchant: 'nearby'
}

export interface PublicGuideView extends FreshmanGuide {
  contentId: string | null
  body: string
  isApiPublished: boolean
}

export interface PublicDepartmentView {
  slug: string
  name: string
  summary: string
  body: string
  website: string | null
  phone: string | null
  email: string | null
  officeHours: string | null
  isApiPublished: boolean
}

export interface PublicClubView {
  id: string
  slug: string
  name: string
  summary: string
  body: string
  category: string | null
  recruitmentPeriod: string | null
  activitySchedule: string | null
  contactMethod: string | null
  updatedAt: string
  sources: PublicSource[]
}

export interface PublicNoticeView {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  audience: string
  validFrom: string | null
  validUntil: string | null
  updatedAt: string
  sources: PublicSource[]
}

export interface PublicMapPlace {
  id: string
  slug: string | null
  name: string
  scope: 'campus' | 'nearby'
  category: string
  summary: string
  address: string | null
  campusArea: string | null
  openingHours: string | null
  phone: string | null
  point: GeoPoint | null
  pointIsVerified: boolean
  usesPreviewPoint: boolean
  referenceLabel: string | null
  coordinateVerification: ApiPlace['coordinateVerification'] | 'preview' | 'owner-map-only'
  coordinateSystem: ApiPlace['coordinateSystem']
  navigationUrl: string | null
  isApiPublished: boolean
  searchText: string
}

function metadataString(content: ApiContent, key: string): string | null {
  const value = content.metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function metadataNumber(content: ApiContent, key: string): number | null {
  const value = content.metadata[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function dateOnly(value: string | null): string {
  if (!value) return '待核验'
  return value.slice(0, 10)
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/[\s（）()\-_/]/g, '')
}

function isHttpUrl(value: string | null): value is string {
  return Boolean(value && /^https?:\/\//i.test(value))
}

function toPublicSources(content: ApiContent): PublicSource[] {
  return content.sources.map(source => ({
    title: source.title,
    publisher: source.publisherName,
    url: source.url,
    accessedAt: dateOnly(source.accessedAt)
  }))
}

function normalizeGuideCategory(value: string | null, fallback?: GuideCategory): GuideCategory {
  if (value === 'arrival' || value === 'campus' || value === 'life' || value === 'community') {
    return value
  }
  return fallback ?? 'campus'
}

function normalizeGuideStatus(content: ApiContent, fallback?: FreshmanGuide['status']): FreshmanGuide['status'] {
  const value = metadataString(content, 'verificationState')
  if (value === 'verified' || value === 'partial' || value === 'awaiting-notice') return value
  return fallback ?? 'partial'
}

function normalizeAudience(value: string | null, fallback?: FreshmanGuide['audience']): FreshmanGuide['audience'] {
  if (!value) return fallback ?? defaultAudience

  const normalized = value.trim().toLocaleLowerCase('zh-CN')
  const known = audienceLabels[normalized]
  if (known) return known

  const labels = value
    .split(/[、,，/|]/)
    .map(item => item.trim())
    .filter((item): item is '本科新生' | '专升本新生' => item === '本科新生' || item === '专升本新生')

  return labels.length ? labels : fallback ?? defaultAudience
}

function parseGuideSections(content: ApiContent): GuideSection[] {
  const value = content.metadata.sections
  if (!Array.isArray(value)) return []

  return value.flatMap((candidate): GuideSection[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const record = candidate as Record<string, unknown>
    const title = typeof record.title === 'string' ? record.title.trim() : ''
    if (!title) return []

    const items = Array.isArray(record.items)
      ? record.items.filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
      : []

    return [{
      title,
      icon: typeof record.icon === 'string' && record.icon.trim()
        ? record.icon.trim()
        : 'i-lucide-list-checks',
      ...(typeof record.description === 'string' && record.description.trim()
        ? { description: record.description.trim() }
        : {}),
      items,
      ...(typeof record.notice === 'string' && record.notice.trim()
        ? { notice: record.notice.trim() }
        : {})
    }]
  })
}

function apiGuideToView(content: ApiContent, seed?: FreshmanGuide): PublicGuideView {
  const category = normalizeGuideCategory(content.category, seed?.category)
  const metadataSections = parseGuideSections(content)
  const body = content.body.trim()
  const sections = metadataSections.length
    ? metadataSections
    : body
      ? [{
          title: metadataString(content, 'bodyHeading') ?? '正文',
          icon: 'i-lucide-file-text',
          description: body,
          items: []
        }]
      : seed?.sections ?? []
  const verifiedDate = dateOnly(content.lastVerifiedAt ?? content.updatedAt)

  return {
    slug: content.slug,
    title: content.title,
    shortTitle: metadataString(content, 'shortTitle') ?? seed?.shortTitle ?? content.title,
    summary: content.summary,
    icon: metadataString(content, 'icon') ?? seed?.icon ?? guideCategoryDefaults[category].icon,
    category,
    audience: normalizeAudience(content.audience, seed?.audience),
    readMinutes: Math.max(1, Math.round(metadataNumber(content, 'readMinutes') ?? seed?.readMinutes ?? Math.ceil(body.length / 400))),
    status: normalizeGuideStatus(content, seed?.status),
    statusText: metadataString(content, 'statusText') ?? `${guideCategoryDefaults[category].statusText} · ${verifiedDate}`,
    updatedAt: verifiedDate,
    leadNotice: metadataString(content, 'leadNotice')
      ?? `本页内容已通过后台发布流程，最后核验于 ${verifiedDate}；强时效事项仍以所列官方来源为准。`,
    sections,
    sources: toPublicSources(content),
    contentId: content.id,
    body,
    isApiPublished: true
  }
}

export function staticGuideToView(guide: FreshmanGuide): PublicGuideView {
  return {
    ...guide,
    contentId: null,
    body: '',
    isApiPublished: false
  }
}

export function canUseStaticContentKindFallback(
  response: Pick<ApiListResponse<ApiContent>, 'hasManagedRecords' | 'managedKinds'> | null | undefined,
  kind: ContentKind
): boolean {
  return Boolean(response?.managedKinds && !response.managedKinds.includes(kind))
}

export function mergePublicGuides(
  seedGuides: FreshmanGuide[],
  contents: ApiContent[],
  allowStaticFallback = true
): PublicGuideView[] {
  const apiGuides = contents.filter(content => content.kind === 'guide' && content.status === 'published')
  const apiBySlug = new Map(apiGuides.map(content => [content.slug, content]))
  const merged = seedGuides.flatMap((seed): PublicGuideView[] => {
    const content = apiBySlug.get(seed.slug)
    if (content) return [apiGuideToView(content, seed)]
    return allowStaticFallback ? [staticGuideToView(seed)] : []
  })
  const seedSlugs = new Set(seedGuides.map(guide => guide.slug))
  const additional = apiGuides
    .filter(content => !seedSlugs.has(content.slug))
    .map(content => apiGuideToView(content))

  return [...merged, ...additional]
}

export function resolvePublicGuide(
  seed: FreshmanGuide | undefined,
  content: ApiContent | null | undefined
): PublicGuideView | null {
  if (content?.kind === 'guide' && content.status === 'published') {
    return apiGuideToView(content, seed)
  }
  return seed ? staticGuideToView(seed) : null
}

function apiDepartmentToView(content: ApiContent, seed?: OfficialDepartment): PublicDepartmentView {
  const sourceWebsite = content.sources.find(source => source.status === 'active')?.url ?? null
  const metadataWebsite = metadataString(content, 'website')

  return {
    slug: content.slug,
    name: content.title,
    summary: content.summary,
    body: content.body,
    website: isHttpUrl(metadataWebsite) ? metadataWebsite : sourceWebsite ?? seed?.website ?? null,
    phone: metadataString(content, 'phone') ?? seed?.phone ?? null,
    email: metadataString(content, 'email') ?? seed?.email ?? null,
    officeHours: metadataString(content, 'officeHours'),
    isApiPublished: true
  }
}

export function mergePublicDepartments(
  seedDepartments: OfficialDepartment[],
  contents: ApiContent[],
  allowStaticFallback = true
): PublicDepartmentView[] {
  const apiDepartments = contents.filter(content => content.kind === 'department' && content.status === 'published')
  const apiByName = new Map(apiDepartments.map(content => [normalizeName(content.title), content]))
  const merged = seedDepartments.flatMap((seed, index): PublicDepartmentView[] => {
    const content = apiByName.get(normalizeName(seed.name))
    if (content) return [apiDepartmentToView(content, seed)]
    if (!allowStaticFallback) return []
    return [{
      slug: `static-department-${index + 1}`,
      name: seed.name,
      summary: seed.summary,
      body: '',
      website: seed.website,
      phone: seed.phone ?? null,
      email: seed.email ?? null,
      officeHours: null,
      isApiPublished: false
    }]
  })
  const seedNames = new Set(seedDepartments.map(department => normalizeName(department.name)))
  const additional = apiDepartments
    .filter(content => !seedNames.has(normalizeName(content.title)))
    .map(content => apiDepartmentToView(content))

  return [...merged, ...additional]
}

export function publicClubs(contents: ApiContent[]): PublicClubView[] {
  return contents
    .filter(content => content.kind === 'club' && content.status === 'published')
    .map(content => ({
      id: content.id,
      slug: content.slug,
      name: content.title,
      summary: content.summary,
      body: content.body,
      category: content.category === 'recent-activity' ? '近期活动可核验' : content.category,
      recruitmentPeriod: metadataString(content, 'recruitmentPeriod'),
      activitySchedule: metadataString(content, 'activitySchedule'),
      contactMethod: metadataString(content, 'contactMethod'),
      updatedAt: dateOnly(content.lastVerifiedAt ?? content.updatedAt),
      sources: toPublicSources(content)
    }))
}

export function publicNotices(contents: ApiContent[]): PublicNoticeView[] {
  const now = Date.now()

  return contents
    .filter((content) => {
      if (content.kind !== 'notice' || content.status !== 'published') return false
      const validFrom = metadataString(content, 'validFrom')
      const validUntil = metadataString(content, 'validUntil')
      const startsInFuture = validFrom && !Number.isNaN(Date.parse(validFrom)) && Date.parse(validFrom) > now
      const alreadyExpired = validUntil && !Number.isNaN(Date.parse(validUntil)) && Date.parse(validUntil) < now
      return !startsInFuture && !alreadyExpired
    })
    .map(content => ({
      id: content.id,
      slug: content.slug,
      title: content.title,
      summary: content.summary,
      body: content.body,
      audience: normalizeAudience(content.audience).join('、'),
      validFrom: metadataString(content, 'validFrom'),
      validUntil: metadataString(content, 'validUntil'),
      updatedAt: dateOnly(content.lastVerifiedAt ?? content.updatedAt),
      sources: toPublicSources(content)
    }))
}

function normalizeMapCategory(place: ApiPlace): string {
  const raw = (place.category ?? place.type).trim().toLocaleLowerCase('en-US')
  if (mapCategories.has(raw)) return raw
  if (mapCategoryAliases[raw]) return mapCategoryAliases[raw]
  return place.scope === 'nearby' ? 'nearby' : 'service'
}

// Preview fixtures contribute searchable names only; their approximate points never reach MapLibre.
function previewMapPlace(poi: CampusMapReferencePlace): PublicMapPlace {
  return {
    id: poi.id,
    slug: null,
    name: poi.name,
    scope: 'campus',
    category: poi.category,
    summary: `学校官网平面图编号 ${poi.mapNumber}。原图未提供可验证的版本日期、比例尺或经纬度，因此这里只作名称与相对位置索引。`,
    address: null,
    campusArea: null,
    openingHours: null,
    phone: null,
    point: null,
    pointIsVerified: false,
    usesPreviewPoint: true,
    referenceLabel: `官网平面图 ${poi.mapNumber}`,
    coordinateVerification: 'preview',
    coordinateSystem: null,
    navigationUrl: null,
    isApiPublished: false,
    searchText: [poi.mapNumber, poi.name, ...(poi.aliases ?? [])].join(' ')
  }
}

function ownerMapPlace(poi: AmapImportedPlace): PublicMapPlace {
  return {
    id: poi.id,
    slug: null,
    name: poi.name,
    scope: poi.category === 'nearby' ? 'nearby' : 'campus',
    category: poi.category,
    summary: poi.summary,
    address: poi.address || null,
    campusArea: null,
    openingHours: null,
    phone: null,
    point: poi.point,
    pointIsVerified: false,
    usesPreviewPoint: false,
    referenceLabel: '用户授权 WIA 工作地图标点',
    coordinateVerification: 'owner-map-only',
    coordinateSystem: 'WGS84',
    navigationUrl: null,
    isApiPublished: false,
    searchText: [poi.name, poi.summary, poi.address, poi.category].filter(Boolean).join(' ')
  }
}

function apiMapPlace(place: ApiPlace): PublicMapPlace {
  const hasRenderableVerifiedPoint = place.navigationAvailable
    && place.coordinateVerification === 'verified'
    && place.coordinateSystem === 'WGS84'
    && place.longitude !== null
    && place.latitude !== null
  const point: GeoPoint | null = hasRenderableVerifiedPoint
    ? { lng: place.longitude!, lat: place.latitude!, crs: 'WGS84' }
    : null

  return {
    id: place.id,
    slug: place.slug,
    name: place.name,
    scope: place.scope,
    category: normalizeMapCategory(place),
    summary: place.summary,
    address: place.address,
    campusArea: place.campusArea,
    openingHours: place.openingHours,
    phone: place.phone,
    point,
    pointIsVerified: hasRenderableVerifiedPoint,
    usesPreviewPoint: false,
    referenceLabel: null,
    coordinateVerification: place.coordinateVerification,
    coordinateSystem: place.coordinateSystem,
    navigationUrl: place.navigationAvailable && isHttpUrl(place.externalMapUrl)
      ? place.externalMapUrl
      : null,
    isApiPublished: true,
    searchText: [
      place.name,
      place.summary,
      place.address,
      place.campusArea,
      place.type,
      place.category
    ].filter(Boolean).join(' ')
  }
}

export function mergePublicMapPlaces(
  previewPois: CampusMapReferencePlace[],
  places: ApiPlace[],
  ownerMapPois: AmapImportedPlace[] = []
): PublicMapPlace[] {
  const published = places.filter(place => place.status === 'published')
  const apiNames = new Set(published.map(place => normalizeName(place.name)))
  const previewByName = new Map<string, CampusMapReferencePlace>()
  for (const preview of previewPois) {
    for (const name of [preview.name, ...(preview.aliases ?? [])]) {
      previewByName.set(normalizeName(name), preview)
    }
  }
  const apiViews = published.map((place) => {
    const view = apiMapPlace(place)
    const matchingPreview = previewByName.get(normalizeName(place.name))
    if (!matchingPreview) return view

    return {
      ...view,
      searchText: [
        view.searchText,
        matchingPreview.name,
        ...(matchingPreview.aliases ?? [])
      ].join(' ')
    }
  })
  const ownerViews = ownerMapPois
    .filter(poi => !apiNames.has(normalizeName(poi.name)))
    .map((poi) => {
      const view = ownerMapPlace(poi)
      const matchingPreview = previewByName.get(normalizeName(poi.name))
      if (!matchingPreview) return view
      return {
        ...view,
        searchText: [view.searchText, matchingPreview.name, ...(matchingPreview.aliases ?? [])].join(' ')
      }
    })
  const ownerNames = new Set(ownerViews.map(place => normalizeName(place.name)))
  const remainingPreviews = previewPois
    .filter(poi => ![poi.name, ...(poi.aliases ?? [])]
      .some(name => apiNames.has(normalizeName(name)) || ownerNames.has(normalizeName(name))))
    .map(previewMapPlace)

  return [...apiViews, ...ownerViews, ...remainingPreviews]
}

export function toMapPoi(place: PublicMapPlace): MapPoi | null {
  if (!place.point) return null
  return {
    id: place.id,
    name: place.name,
    category: place.category,
    point: place.point,
    status: place.pointIsVerified ? 'published' : 'draft'
  }
}
