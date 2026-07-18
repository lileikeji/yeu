import { freshmanGuideBody, officialClubBody, officialDepartmentBody } from '../../data/seeds/public-content'
import type {
  FreshmanGuide,
  GuideSection,
  OfficialDepartment,
  OfficialClub,
  PublicSource
} from '~~/data/seeds/public-content'
import type { GeoPoint, MapPoi } from '~~/map/core/types'
import type { CampusMapReferencePlace } from '~~/data/seeds/preview-places'
import type { AmapImportedPlace } from '~~/data/seeds/amap-imported-places'
import type { ContentKind } from '~~/shared/constants/server'
import type { ApiAmapOwnerDraftPlace, ApiContent, ApiListResponse, ApiPlace } from '~~/shared/types/server'
import { isSafePublicHttpUrl } from '~~/shared/utils/public-http-url'

type GuideCategory = FreshmanGuide['category']

const guideCategoryDefaults: Record<GuideCategory, { icon: string, statusText: string }> = {
  arrival: { icon: 'i-lucide-clipboard-check', statusText: '内容已经整理' },
  campus: { icon: 'i-lucide-school', statusText: '内容已经整理' },
  life: { icon: 'i-lucide-coffee', statusText: '内容已经整理' },
  community: { icon: 'i-lucide-users-round', statusText: '内容已经整理' }
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

const ownerMapGenericSummary = '用户授权的高德工作地图标点，尚未经过独立现场核验。'

export function studentFacingGuideText(value: string): string {
  return value
    .replace(/高德导入标点可先导航，入口细节仍需现场确认。/g, '地图上的位置可先用来找方向，入口细节仍需现场确认。')
    .replace(/连接后通过浏览器认证。新生注册后以学号获得校园网和VPN账号，首次登录按官方通知操作并立即修改密码。/g, '连接后按页面提示登录。新生注册后会获得校园网和校外访问账号，第一次使用请按学校通知操作并及时修改密码。')
    .replace(/宿舍或校外访问教务等校内资源时，可按官方指南使用 https:\/\/vpn\.yeu\.edu\.cn:444。/g, '在宿舍或校外需要打开教务等校内资源时，请按学校指南使用校外访问入口（https://vpn.yeu.edu.cn:444）。')
    .replace(/信息网络管理规定禁止未经批准私设代理或DHCP、把校园网扩展到校外、向非校内用户提供接入，或利用校园网开展经营活动。/g, '学校规定不能私自搭建网络转接工具、把校园网分享给校外人员，或利用校园网做经营活动。')
    .replace(/查校园网、统一认证、网络故障、信息化服务和实验室信息。/g, '查校园网、账号登录、网络故障和实验室信息。')
    .replace(/新生处理校园网、统一认证、VPN、网络故障和信息化服务问题的主管部门入口。/g, '新生遇到校园网、在校外打开校内系统（VPN）、网络故障或校园系统问题时，可以找这个部门。')
    .replace(/专升本档案（2026已发布）/g, '专升本档案（2026年说明）')
    .replace(/资料状态：/g, '目前：')
    .replace(/强时效事项/g, '时间变化较快的事项')
    .replace(/工作地图的 76 个标点与 8 个原始不规则区域边界已按“未独立现场核验”状态显示，并支持地图内步行路线与外部高德导航；区域只绘制边界线，避免遮挡内部高德商铺。/g, '已整理 76 个高德地图地点和 8 个区域范围，可用于地图内路线规划和高德导航；具体入口仍请以现场标识为准。')
    .replace(/查看地点的数据状态、来源和最后核验日期。/g, '查看地点是否已经确认、参考来源和最后更新时间。')
    .replace(/地图目录已导入，坐标核验中/g, '地图地点已整理，入口仍在确认')
    .replace(/不要仅凭工作地图中的反向地址判断楼栋；部分地址会落到相邻建筑。/g, '不要只看地图自动显示的地址判断楼栋，部分地址可能指向相邻建筑。')
    .replace(/工作地图目前只有一个“创业园”标点，后续应拆分为A、B两个地点并分别核对入口坐标。/g, '地图目前只显示一个“创业园”地点；到达后请按现场标识确认 A、B 区入口。')
    .replace(/系统只在内部资料目录保存少量带来源和版权状态的核验图片，不在前台发布，也不复制完整正文或评论用户资料。/g, '部分图片只用于确认地点和设施信息，不会在公开页面展示，也不会复制原帖正文或评论中的个人信息。')
    .replace(/学生经验线索（待核验）/g, '学生经验参考')
    .replace(/宿舍实拍与答疑线索（待核验）/g, '宿舍实拍与答疑参考')
    .replace(/当期复核清单/g, '本学期确认清单')
    .replace(/现场核验清单/g, '现场确认清单')
    .replace(/待核验线索/g, '参考信息')
    .replace(/高德 POI/g, '高德地图地点')
    .replace(/工作地图/g, '地图')
    .replace(/精确坐标/g, '准确位置')
    .replace(/入口坐标/g, '入口位置')
    .replace(/最后核验日期/g, '最后确认日期')
    .replace(/两项独立核验/g, '两个独立来源确认')
    .replace(/当前可核验的/g, '目前能确认的')
    .replace(/重新现场核验/g, '重新到现场确认')
    .replace(/待现场核验/g, '还要到现场确认')
    .replace(/待实地核验/g, '还要到现场确认')
    .replace(/已核验/g, '已确认')
    .replace(/仍待核验/g, '还要再确认')
    .replace(/待核验/g, '还要再确认')
    .replace(/可核验/g, '可确认')
    .replace(/核验中/g, '正在确认')
    .replace(/现场核验/g, '现场确认')
    .replace(/独立核验/g, '独立确认')
    .replace(/核验/g, '确认')
    .replace(/复核/g, '再次确认')
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
  address: string | null
  officeHours: string | null
  verificationState: 'verified' | 'partial' | null
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
  body: string
  address: string | null
  campusArea: string | null
  openingHours: string | null
  phone: string | null
  usageChecklist: string[]
  point: GeoPoint | null
  pointIsVerified: boolean
  usesPreviewPoint: boolean
  referenceLabel: string | null
  officialPlanNumber: string | null
  coordinateVerification: ApiPlace['coordinateVerification'] | 'preview' | 'owner-map-only' | 'native-map-session'
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
  if (!value) return '待确认'
  return value.slice(0, 10)
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase('zh-CN').replace(/[\s（）()\-_/]/g, '')
}

function equivalentPlaceNames(value: string): string[] {
  const normalized = normalizeName(value)
  const names = new Set([normalized])

  if (normalized.includes('教学楼')) {
    names.add(normalized.replace(/教学楼/g, '楼'))
  }
  if (normalized.endsWith('楼') && !normalized.endsWith('教学楼')) {
    names.add(normalized.replace(/楼$/, '教学楼'))
  }

  return [...names]
}

function isHttpUrl(value: string | null): value is string {
  // Defense-in-depth: reject non-public/dangerous URLs before they reach href sinks.
  return Boolean(value && isSafePublicHttpUrl(value))
}

export function extractStudentUseChecklist(body: string): string[] {
  const lines = body.split('\n')
  const headingIndex = lines.findIndex(line => line.trim() === '【到这里前先确认】')
  if (headingIndex < 0) return []

  const items: string[] = []
  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('【')) break
    const match = trimmed.match(/^[-*•]\s*(.+)$/)
    if (!match) break
    items.push(match[1]!.trim())
    if (items.length >= 8) break
  }
  return items
}

export function studentFacingPlaceBody(body: string): string {
  return body
    .replace(/【到这里前先确认】[\s\S]*?(?=\n【|$)/g, '')
    .split('\n')
    .map(line => line.trim()
      .replace(/^(.*?)\s*已按用户授权的高德地图坐标导入后台草稿；?可用于地图定位和维护，?具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。?$/g, '$1的位置来自高德地图标点，可以先用来找方向；具体入口、楼层和开放时间请以现场标识或学校通知为准。')
      .replace(/已按用户授权的高德地图坐标导入后台草稿；?可用于地图定位和维护。?/g, '的位置来自高德地图标点，可以先用来找方向。')
      .replace(/后台草稿/g, '地图标点')
      .replace(/正式发布/g, '公开展示')
      .replace(/地图定位和维护/g, '找方向')
      .replace(/GCJ-02|WGS84|coordinate/gi, '')
      .replace(/\s+/g, ' ')
      .trim())
    .filter((line) => {
      if (!line) return true
      return !/resourceId|坐标来源|发布提醒|sourceRawRef/i.test(line)
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function studentFacingSourceContext(value: string | undefined): string | undefined {
  if (!value?.trim()) return undefined
  return value
    .replace(/社交平台待核验线索/g, '社交平台参考信息')
    .replace(/社交平台视频线索/g, '社交平台视频参考')
    .replace(/与高德 POI 交叉命中的商铺候选/g, '在高德地图和学生分享中都出现过的商铺')
    .replace(/候选/g, '参考')
    .replace(/仍待核验/g, '还要再确认')
    .replace(/待核验/g, '还要再确认')
    .replace(/原外链当前不可稳定访问，前台仅保留为归档线索。?/g, '原链接现在不稳定，先作为参考记录保留。')
    .replace(/归档线索/g, '参考记录')
    .trim()
}

function studentFacingSource(source: PublicSource): PublicSource {
  const context = studentFacingSourceContext(source.context)
  return {
    ...source,
    ...(context ? { context } : {})
  }
}

function normalizeOwnerMapNote(value: string): string {
  return value
    .split('\n')
    .map(line => line.trim().replace(/^\d+[.、]\s*/, ''))
    .filter(Boolean)
    .join('；')
    .replace(/用户授权的高德工作地图标点，?尚未经过独立现场确认。?/g, '')
    .replace(/用户授权的高德工作地图标点，?尚未经过独立现场核验。?/g, '')
    .replace(/已按用户授权的高德地图坐标导入后台草稿；?可用于地图定位和维护，?具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。?/g, '的位置来自高德地图标点，可以先用来找方向；具体入口、楼层和开放时间请以现场标识或学校通知为准。')
    .replace(/用户授权的高德工作地图导出/g, '高德地图标点')
    .replace(/高德工作地图导入草稿/g, '高德地图标点')
    .replace(/后台草稿/g, '地图标点')
    .replace(/草稿/g, '待确认信息')
    .replace(/可用于地图定位和维护/g, '可以先用来找方向')
    .replace(/正式发布/g, '公开展示')
    .replace(/核验/g, '确认')
    .replace(/待确认信息[，；、：:]?/g, '还要再确认，')
    .replace(/([\u4e00-\u9fa5A-Za-z0-9]+) 的位置/g, '$1的位置')
    .trim()
}

function ownerMapFriendlySummary(poi: AmapImportedPlace): string {
  const note = normalizeOwnerMapNote(poi.summary)
  const suffix = '位置来自你提供的高德地图标点，适合先用来找方向；具体入口、楼层、开放时间和当期用途仍以现场标识或学校通知为准。'
  if (note && note !== ownerMapGenericSummary) {
    if (/位置来自(?:你提供的)?高德地图标点/.test(note)) return note
    return `${note}。${suffix}`
  }

  if (poi.category === 'campus-building') {
    return `${poi.name} 是教学楼或校内楼栋标点。查课表、集合地点或部门通知时，可先用它确认楼名和大致方向；具体教室、楼层和入口以现场标识为准。`
  }
  if (poi.category === 'dorm') {
    return `${poi.name} 是宿舍楼标点。新生可用它判断住宿区方向；实际入住楼栋、门禁规则、访客和报修要求以辅导员、宿管或总务通知为准。`
  }
  if (poi.category === 'food') {
    return `${poi.name} 是校内餐厅或餐饮点标点。适合先判断吃饭方向；具体窗口、营业时间、支付方式和假期开放情况以现场为准。`
  }
  if (poi.category === 'express') {
    return `${poi.name} 是快递或取件相关标点。取件前先看短信、平台取件码和站点现场提示；不同快递品牌、营业时间和寄件范围可能会调整。`
  }
  if (poi.category === 'gate') {
    return `${poi.name} 是校门或出入口标点。到校、打车和步行导航可先用它判断入口方向；新生报到当天的通行口和车辆管控以学校现场安排为准。`
  }
  if (poi.category === 'nearby') {
    return `${poi.name} 是学生街或周边生活服务标点。它只说明位置线索，不代表当前一定营业；价格、优惠、取件品牌和服务范围需要到店或电话确认。`
  }
  if (/医务|卫生|诊所/.test(poi.name)) {
    return `${poi.name} 是校内基础医疗服务标点。普通不适可先按学校医务室说明处理；急症、夜间风险或严重症状应立即联系现场老师、医务人员或急救。`
  }
  if (/行政|校办|教务|资助|就业|财务|总务|保卫|网络|信息/.test(poi.name)) {
    return `${poi.name} 是校内办事服务标点。适合查找咨询、缴费、网络、报修、资助或安全相关入口；具体窗口、材料和办公时间以部门最新通知为准。`
  }
  if (/图书馆/.test(poi.name)) {
    return `${poi.name} 是借阅、自习和学习空间相关标点。开放时间、借阅规则、座位和节假日安排可能调整，进馆前先看图书馆最新通知。`
  }
  if (/公交|车站|上车|下车|叮叮车/.test(poi.name)) {
    return `${poi.name} 是交通或上下车相关标点。适合先判断候车方向；班次、停靠点、报到日接驳和临时交通管制以学校或现场安排为准。`
  }
  if (/礼堂|报告厅|体育|操场|篮球|排球|球场|舞池|运动|桥|广场|文体|校史馆|创业园/.test(poi.name)) {
    return `${poi.name} 是校内活动、运动或公共空间标点。集合、活动和上课安排要结合当次通知核对；临时封闭或借用以现场公告为准。`
  }

  return `${poi.name} 是校内服务点标点。可先用来判断位置方向；具体用途、入口和开放状态以现场标识或学校通知为准。`
}

export function mergeAmapImportedPlacesWithDrafts(
  seeds: AmapImportedPlace[],
  drafts: ApiAmapOwnerDraftPlace[] | null | undefined
): AmapImportedPlace[] {
  if (!drafts?.length) return seeds

  const draftBySourceRow = new Map(drafts.map(draft => [draft.sourceRow, draft]))
  return seeds.map((seed) => {
    const draft = draftBySourceRow.get(seed.sourceRow)
    if (!draft) return seed

    return {
      ...seed,
      name: draft.name || seed.name,
      summary: studentFacingPlaceBody(draft.summary || seed.summary) || seed.summary,
      address: draft.address || seed.address,
      category: mapCategories.has(draft.category ?? '') ? draft.category! : seed.category,
      point: {
        lng: draft.longitude,
        lat: draft.latitude,
        crs: 'GCJ-02'
      },
      sourcePoint: {
        lng: draft.longitude,
        lat: draft.latitude,
        crs: 'GCJ-02'
      }
    }
  })
}

function toPublicSources(content: ApiContent): PublicSource[] {
  return content.sources.map(source => ({
    title: source.title,
    publisher: source.publisherName,
    url: source.url,
    accessedAt: dateOnly(source.accessedAt),
    status: source.status
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

function studentFacingGuideSection(section: GuideSection): GuideSection {
  return {
    ...section,
    title: studentFacingGuideText(section.title),
    ...(section.description ? { description: studentFacingGuideText(section.description) } : {}),
    items: section.items.map(studentFacingGuideText),
    ...(section.notice ? { notice: studentFacingGuideText(section.notice) } : {}),
    ...(section.sources ? { sources: section.sources.map(studentFacingSource) } : {})
  }
}

function parseGuideSections(content: ApiContent): GuideSection[] {
  const value = content.metadata.sections
  if (!Array.isArray(value)) return []

  return value.flatMap((candidate): GuideSection[] => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const record = candidate as Record<string, unknown>
    const title = typeof record.title === 'string' ? studentFacingGuideText(record.title.trim()) : ''
    if (!title) return []

    const items = Array.isArray(record.items)
      ? record.items
          .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
          .map(item => studentFacingGuideText(item.trim()))
      : []
    const sectionSources = Array.isArray(record.sources)
      ? record.sources.flatMap((candidate): PublicSource[] => {
          if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
          const source = candidate as Record<string, unknown>
          const title = typeof source.title === 'string' ? source.title.trim() : ''
          const publisher = typeof source.publisher === 'string' ? source.publisher.trim() : ''
          const url = typeof source.url === 'string' ? source.url.trim() : ''
          const accessedAt = typeof source.accessedAt === 'string' ? source.accessedAt.trim() : ''
          if (!title || !publisher || !isHttpUrl(url) || !/^\d{4}-\d{2}-\d{2}$/.test(accessedAt)) return []
          return [{
            title,
            publisher,
            url,
            accessedAt,
            ...(source.status === 'unavailable' || source.status === 'disputed'
              ? { status: source.status }
              : {}),
            ...(studentFacingSourceContext(typeof source.context === 'string' ? source.context : undefined)
              ? { context: studentFacingSourceContext(typeof source.context === 'string' ? source.context : undefined)! }
              : {})
          }]
        })
      : []

    return [{
      title,
      icon: typeof record.icon === 'string' && record.icon.trim()
        ? record.icon.trim()
        : 'i-lucide-list-checks',
      ...(typeof record.description === 'string' && record.description.trim()
        ? { description: studentFacingGuideText(record.description.trim()) }
        : {}),
      items,
      ...(typeof record.notice === 'string' && record.notice.trim()
        ? { notice: studentFacingGuideText(record.notice.trim()) }
        : {}),
      ...(sectionSources.length ? { sources: sectionSources } : {})
    }]
  })
}

function apiGuideToView(content: ApiContent, seed?: FreshmanGuide): PublicGuideView {
  const category = normalizeGuideCategory(content.category, seed?.category)
  const metadataSections = parseGuideSections(content)
  const body = studentFacingGuideText(content.body.trim())
  const sections = metadataSections.length
    ? metadataSections
    : body
      ? [{
          title: studentFacingGuideText(metadataString(content, 'bodyHeading') ?? '正文'),
          icon: 'i-lucide-file-text',
          description: body,
          items: []
        }]
      : seed?.sections.map(studentFacingGuideSection) ?? []
  const verifiedDate = dateOnly(content.lastVerifiedAt ?? content.updatedAt)

  return {
    slug: content.slug,
    title: content.title,
    shortTitle: metadataString(content, 'shortTitle') ?? seed?.shortTitle ?? content.title,
    summary: studentFacingGuideText(content.summary),
    icon: metadataString(content, 'icon') ?? seed?.icon ?? guideCategoryDefaults[category].icon,
    category,
    audience: normalizeAudience(content.audience, seed?.audience),
    readMinutes: Math.max(1, Math.round(metadataNumber(content, 'readMinutes') ?? seed?.readMinutes ?? Math.ceil(body.length / 400))),
    status: normalizeGuideStatus(content, seed?.status),
    statusText: studentFacingGuideText(metadataString(content, 'statusText') ?? `${guideCategoryDefaults[category].statusText} · ${verifiedDate}`),
    updatedAt: verifiedDate,
    leadNotice: studentFacingGuideText(metadataString(content, 'leadNotice')
      ?? `本页内容已整理发布，最后确认于 ${verifiedDate}；强时效事项仍以所列官方来源为准。`),
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
    summary: studentFacingGuideText(guide.summary),
    statusText: studentFacingGuideText(guide.statusText),
    leadNotice: studentFacingGuideText(guide.leadNotice),
    sections: guide.sections.map(studentFacingGuideSection),
    sources: guide.sources.map(studentFacingSource),
    contentId: null,
    body: studentFacingGuideText(freshmanGuideBody(guide)),
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
    summary: studentFacingGuideText(content.summary),
    body: studentFacingGuideText(content.body),
    website: isHttpUrl(metadataWebsite) ? metadataWebsite : sourceWebsite ?? seed?.website ?? null,
    phone: metadataString(content, 'phone') ?? seed?.phone ?? null,
    email: metadataString(content, 'email') ?? seed?.email ?? null,
    address: metadataString(content, 'address') ?? seed?.address ?? null,
    officeHours: metadataString(content, 'officeHours'),
    verificationState: metadataString(content, 'verificationState') === 'verified'
      ? 'verified'
      : metadataString(content, 'verificationState') === 'partial'
        ? 'partial'
        : seed?.verificationState ?? null,
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
  const merged = seedDepartments.flatMap((seed): PublicDepartmentView[] => {
    const content = apiByName.get(normalizeName(seed.name))
    if (content) return [apiDepartmentToView(content, seed)]
    if (!allowStaticFallback) return []
    return [{
      slug: seed.slug,
      name: seed.name,
      summary: studentFacingGuideText(seed.summary),
      body: studentFacingGuideText(officialDepartmentBody(seed)),
      website: seed.website,
      phone: seed.phone ?? null,
      email: seed.email ?? null,
      address: seed.address ?? null,
      officeHours: null,
      verificationState: seed.verificationState ?? null,
      isApiPublished: false
    }]
  })
  const seedNames = new Set(seedDepartments.map(department => normalizeName(department.name)))
  const additional = apiDepartments
    .filter(content => !seedNames.has(normalizeName(content.title)))
    .map(content => apiDepartmentToView(content))

  return [...merged, ...additional]
}

function apiClubToView(content: ApiContent): PublicClubView {
  return {
    id: content.id,
    slug: content.slug,
    name: content.title,
    summary: content.summary,
    body: content.body,
    category: content.category === 'recent-activity' ? '近期活动可确认' : content.category,
    recruitmentPeriod: metadataString(content, 'recruitmentPeriod'),
    activitySchedule: metadataString(content, 'activitySchedule'),
    contactMethod: metadataString(content, 'contactMethod'),
    updatedAt: dateOnly(content.lastVerifiedAt ?? content.updatedAt),
    sources: toPublicSources(content)
  }
}

function staticClubToView(club: OfficialClub): PublicClubView {
  const active = club.source.url.includes('/2026/')
  return {
    id: `static-club-${club.slug}`,
    slug: club.slug,
    name: club.name,
    summary: club.summary,
    body: officialClubBody(club),
    category: active ? `${club.group} · 近期活动可确认` : `${club.group} · 名称线索待确认`,
    recruitmentPeriod: null,
    activitySchedule: null,
    contactMethod: null,
    updatedAt: club.source.accessedAt,
    sources: [studentFacingSource(club.source)]
  }
}

export function publicClubs(contents: ApiContent[], seedClubs: OfficialClub[] = []): PublicClubView[] {
  const apiClubs = contents.filter(content => content.kind === 'club' && content.status === 'published')
  const apiBySlug = new Map(apiClubs.map(content => [content.slug, content]))
  const merged = seedClubs.map((seed) => {
    const content = apiBySlug.get(seed.slug)
    return content ? apiClubToView(content) : staticClubToView(seed)
  })
  const seedSlugs = new Set(seedClubs.map(club => club.slug))
  const additional = apiClubs
    .filter(content => !seedSlugs.has(content.slug))
    .map(apiClubToView)

  return [...merged, ...additional]
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
    summary: `学校官网平面图文字编号 ${poi.mapNumber}。原图未提供可验证的版本日期、比例尺或经纬度，且本站不转载原图，因此这里只保留编号和名称索引。`,
    body: `学校官网平面图文字编号 ${poi.mapNumber}。原图未提供可验证的版本日期、比例尺或经纬度，且本站不转载原图，因此这里只保留编号和名称索引。`,
    address: null,
    campusArea: null,
    openingHours: null,
    phone: null,
    usageChecklist: [],
    point: null,
    pointIsVerified: false,
    usesPreviewPoint: true,
    referenceLabel: `官网编号 ${poi.mapNumber}`,
    officialPlanNumber: poi.mapNumber,
    coordinateVerification: 'preview',
    coordinateSystem: null,
    navigationUrl: null,
    isApiPublished: false,
    searchText: [poi.mapNumber, poi.name, ...(poi.aliases ?? [])].join(' ')
  }
}

function ownerMapPlace(poi: AmapImportedPlace): PublicMapPlace {
  const navigation = new URL('https://uri.amap.com/navigation')
  navigation.searchParams.set('to', `${poi.sourcePoint.lng},${poi.sourcePoint.lat},${poi.name}`)
  navigation.searchParams.set('mode', 'walk')
  navigation.searchParams.set('policy', '1')
  navigation.searchParams.set('src', 'yeu-freshman-guide')
  navigation.searchParams.set('coordinate', 'gaode')
  navigation.searchParams.set('callnative', '1')
  return {
    id: poi.id,
    slug: null,
    name: poi.name,
    scope: poi.category === 'nearby' ? 'nearby' : 'campus',
    category: poi.category,
    summary: ownerMapFriendlySummary(poi),
    body: ownerMapFriendlySummary(poi),
    address: poi.address || null,
    campusArea: null,
    openingHours: null,
    phone: null,
    usageChecklist: [],
    // These owner-provided AMap points are already GCJ-02 coordinates. Reuse
    // them directly for AMap rendering instead of round-tripping through the
    // network-dependent convertFrom API.
    point: poi.sourcePoint,
    pointIsVerified: false,
    usesPreviewPoint: false,
    referenceLabel: '高德地图标点',
    officialPlanNumber: null,
    coordinateVerification: 'owner-map-only',
    coordinateSystem: 'GCJ-02',
    navigationUrl: navigation.toString(),
    isApiPublished: false,
    searchText: [poi.name, ownerMapFriendlySummary(poi), poi.summary, poi.address, poi.category].filter(Boolean).join(' ')
  }
}

function apiMapPlace(place: ApiPlace): PublicMapPlace {
  const summary = studentFacingPlaceBody(place.summary) || place.summary
  const body = studentFacingPlaceBody(place.body ?? place.summary) || summary
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
    summary,
    body,
    address: place.address,
    campusArea: place.campusArea,
    openingHours: place.openingHours,
    phone: place.phone,
    usageChecklist: extractStudentUseChecklist(place.body),
    point,
    pointIsVerified: hasRenderableVerifiedPoint,
    usesPreviewPoint: false,
    referenceLabel: null,
    officialPlanNumber: null,
    coordinateVerification: place.coordinateVerification,
    coordinateSystem: place.coordinateSystem,
    navigationUrl: place.navigationAvailable && isHttpUrl(place.externalMapUrl)
      ? place.externalMapUrl
      : null,
    isApiPublished: true,
    searchText: [
      place.name,
      summary,
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
  const apiNames = new Set(published.flatMap(place => equivalentPlaceNames(place.name)))
  const apiNamesWithRenderablePoints = new Set(published
    .filter(place => (
      place.navigationAvailable
      && place.coordinateVerification === 'verified'
      && place.coordinateSystem === 'WGS84'
      && place.longitude !== null
      && place.latitude !== null
    ))
    .flatMap(place => equivalentPlaceNames(place.name)))
  const previewByName = new Map<string, CampusMapReferencePlace>()
  for (const preview of previewPois) {
    for (const name of [preview.name, ...(preview.aliases ?? [])]) {
      for (const equivalentName of equivalentPlaceNames(name)) {
        previewByName.set(equivalentName, preview)
      }
    }
  }
  const apiViews = published.map((place) => {
    const view = apiMapPlace(place)
    const matchingPreview = equivalentPlaceNames(place.name).map(name => previewByName.get(name)).find(Boolean)
    if (!matchingPreview) return view

    return {
      ...view,
      officialPlanNumber: matchingPreview.mapNumber,
      searchText: [
        view.searchText,
        matchingPreview.mapNumber,
        matchingPreview.name,
        ...(matchingPreview.aliases ?? [])
      ].join(' ')
    }
  })
  const ownerViews = ownerMapPois
    .filter(poi => !apiNamesWithRenderablePoints.has(normalizeName(poi.name)))
    .map((poi) => {
      const view = ownerMapPlace(poi)
      const matchingPreview = equivalentPlaceNames(poi.name).map(name => previewByName.get(name)).find(Boolean)
      if (!matchingPreview) return view
      return {
        ...view,
        officialPlanNumber: matchingPreview.mapNumber,
        searchText: [view.searchText, matchingPreview.mapNumber, matchingPreview.name, ...(matchingPreview.aliases ?? [])].join(' ')
      }
    })
  const ownerNames = new Set(ownerViews.flatMap(place => equivalentPlaceNames(place.name)))
  const remainingPreviews = previewPois
    .filter(poi => ![poi.name, ...(poi.aliases ?? [])]
      .some(name => equivalentPlaceNames(name).some(equivalentName => apiNames.has(equivalentName) || ownerNames.has(equivalentName))))
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
    status: place.pointIsVerified ? 'published' : 'draft',
    source: 'catalog'
  }
}
