import type {
  ApiAmapOwnerDraftPlace,
  ApiContent,
  ApiListResponse,
  ApiPlace,
  ApiProcedure,
  ApiProcedureDepartment,
  ApiProcedureGuide,
  ApiProcedurePlace,
  ApiSearchResponse,
  ApiSource
} from '~~/shared/types/server'
import {
  studentFacingProcedureText,
  studentFacingProcedureTitle
} from './procedure-detail-presentation'
import {
  studentFacingSourcePublisher,
  studentFacingSourceTitle
} from './sources-presentation'

function studentFacingDepartmentPayloadText(value: string): string {
  return value
    .replace(/学院独立官网已经上线，可查询计算机、网络工程、物联网等相关栏目；网站仍混有原工程技术学院历史内容，2026级专业归属应以录取材料和学院最新通知为准。/g, '可以在学院官网查看计算机、网络工程、物联网等专业信息。2026级专业归属和报到安排请以录取材料及学院最新通知为准。')
    .replace(/学院独立官网已经上线，可查询人工智能、数据科学相关教学科研和学院通知；网站仍混有原工程技术学院内容，2026级专业归属以录取材料和学院最新通知为准。/g, '可以在学院官网查看人工智能、数据科学相关专业、教学科研和学院通知。2026级专业归属和报到安排请以录取材料及学院最新通知为准。')
    .replace(/学院独立官网已经上线，可查询学院概况、专业介绍、教学科研和通知公告；当前可独立核对的院情资料较少，2026级专业归属以录取材料和学院最新通知为准。/g, '可以在学院官网查看学院概况、专业介绍、教学科研和通知公告。2026级专业归属和报到安排请以录取材料及学院最新通知为准。')
    .replace(/(.+?)是新生查找相关通知和办事入口时需要优先确认的官方渠道。/g, '$1可以帮助新生查找相关通知和办事入口。')
    .replace(/使用建议：如果你不确定该不该找这个部门，可以先在站内搜索关键词，再核对官网栏目名称、发布时间和落款；不要只靠群聊截图或二手转述。/g, '不确定该找谁时，可以先在站内搜索想办的事，再打开学校或部门官网看最新通知；不要只看群聊截图。')
    .replace(/^资料核对：[^\n]*(?:\n|$)/gm, '')
    .replace(/当前只整理到官网入口，固定办公地点、办公时间和直拨电话未核验前不写死。/g, '具体办公地点、办公时间和电话可能调整，请打开官网查看最新安排。')
}

function studentFacingPayloadText(value: string): string {
  return studentFacingDepartmentPayloadText(studentFacingProcedureText(value
    .replace(/系统只在内部资料目录保存少量带来源和版权状态的(?:核验|确认)图片，不在(?:前台|公开页面)发布，也不复制完整正文或评论用户资料。/g, '部分图片只用于确认地点和设施信息，不会在公开页面展示，也不会复制原帖正文或评论中的个人信息。')
    .replace(/系统不会把未(?:核验|确认)内容伪装成确定通知。/g, '还没有明确通知的时间、地点和报名方式只作参考，不会写成已经确定。')
    .replace(/资料状态是：名称线索(?:待确认|还要确认)/g, '今年是否继续招新还要等通知')
    .replace(/资料状态是：近期活动可确认/g, '2026年仍有公开活动')
    .replace(/用校园地图搜索地点，同时区分\s*[“"]已导入[”"]\s*和\s*[“"]已确认坐标[”"]\s*。?/g, '用校园地图搜索宿舍、教学楼和服务点；地图上的位置可先用来找方向，入口细节仍需现场确认。')
    .replace(/地图目录已导入，坐标核验中/g, '地图地点已整理，入口仍在确认')
    .replace(/高德导入标点/g, '地图上的位置')
    .replace(/高德 POI/g, '高德地图地点')
    .replace(/工作地图/g, '地图')
    .replace(/后台草稿/g, '地图位置参考')
    .replace(/坐标核验中/g, '入口仍在确认')
    .replace(/坐标核验/g, '位置确认')
    .replace(/精确坐标/g, '准确位置')
    .replace(/入口坐标/g, '入口位置')
    .replace(/数据状态/g, '是否已经确认')
    .replace(/最后核验日期/g, '最后确认日期')
    .replace(/现场核验/g, '现场确认')
    .replace(/独立核验/g, '独立确认')
    .replace(/待实地核验/g, '还要到现场确认')
    .replace(/待现场核验/g, '还要到现场确认')
    .replace(/待核验/g, '还要再确认')
    .replace(/已核验/g, '已确认')
    .replace(/核验/g, '确认')
    .replace(/复核/g, '再次确认')
    .replace(/原外链/g, '原链接')
    .replace(/前台/g, '公开页面')
    .replace(/本系统/g, '这里')
    .replace(/上线前/g, '使用前')))
}

function studentFacingPlacePayloadText(value: string): string {
  return value
    .split('\n')
    .map(line => line.trim()
      .replace(/^(.*?)\s*已按用户授权的高德地图坐标导入后台草稿；?可用于地图定位和维护，?具体入口、楼层、开放时间仍需现场或官方资料核验后再正式发布。?$/g, '$1的位置来自高德地图标点，可以先用来找方向；具体入口、楼层和开放时间请以现场标识或学校通知为准。')
      .replace(/已按用户授权的高德地图坐标导入后台草稿；?可用于地图定位和维护。?/g, '的位置来自高德地图标点，可以先用来找方向。')
      .replace(/地图定位和维护/g, '找方向'))
    .filter(line => !/resourceId|坐标来源|发布提醒|sourceRawRef|GCJ-02|WGS84|coordinate/i.test(line))
    .map(studentFacingPayloadText)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (typeof value === 'string') return studentFacingPayloadText(value)
  if (Array.isArray(value)) return value.map(sanitizeMetadataValue)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, sanitizeMetadataValue(item)])
  )
}

function sanitizeSource<T extends ApiSource>(source: T): T {
  return {
    ...source,
    title: studentFacingSourceTitle(source.title),
    publisherName: studentFacingSourcePublisher(source.publisherName)
  }
}

function sanitizeProcedurePlace(place: ApiProcedurePlace | null): ApiProcedurePlace | null {
  if (!place) return null
  return {
    ...place,
    summary: studentFacingProcedureText(place.summary)
  }
}

function sanitizeProcedureDepartment(
  department: ApiProcedureDepartment | null
): ApiProcedureDepartment | null {
  if (!department) return null
  return {
    ...department,
    summary: studentFacingProcedureText(department.summary)
  }
}

function sanitizeProcedureGuide(guide: ApiProcedureGuide | null): ApiProcedureGuide | null {
  if (!guide) return null
  return {
    ...guide,
    title: studentFacingPayloadText(studentFacingProcedureTitle(guide.title)),
    summary: studentFacingPayloadText(guide.summary)
  }
}

export function sanitizePublicContent(content: ApiContent): ApiContent {
  return {
    ...content,
    title: studentFacingPayloadText(content.title),
    summary: studentFacingPayloadText(content.summary),
    body: studentFacingPayloadText(content.body),
    metadata: sanitizeMetadataValue(content.metadata) as Record<string, unknown>,
    sources: content.sources.map(sanitizeSource)
  }
}

export function sanitizePublicPlace(place: ApiPlace): ApiPlace {
  const { sourceRawRef: _sourceRawRef, ...publicPlace } = place
  const summary = studentFacingPlacePayloadText(place.summary) || place.summary
  const body = studentFacingPlacePayloadText(place.body) || summary

  return {
    ...publicPlace,
    summary,
    body,
    sources: place.sources.map(sanitizeSource)
  }
}

export function sanitizePublicAmapOwnerDraftPlace(
  place: ApiAmapOwnerDraftPlace
): ApiAmapOwnerDraftPlace {
  return {
    ...place,
    summary: studentFacingPlacePayloadText(place.summary) || place.summary
  }
}

export function sanitizePublicProcedure(procedure: ApiProcedure): ApiProcedure {
  return {
    ...procedure,
    title: studentFacingProcedureTitle(procedure.title),
    summary: studentFacingProcedureText(procedure.summary),
    body: studentFacingProcedureText(procedure.body),
    statusText: studentFacingProcedureText(procedure.statusText),
    processingTime: procedure.processingTime
      ? studentFacingProcedureText(procedure.processingTime)
      : null,
    deadlineText: procedure.deadlineText
      ? studentFacingProcedureText(procedure.deadlineText)
      : null,
    department: sanitizeProcedureDepartment(procedure.department),
    relatedGuide: sanitizeProcedureGuide(procedure.relatedGuide),
    places: procedure.places.map(place => sanitizeProcedurePlace(place)!),
    steps: procedure.steps.map(step => ({
      ...step,
      title: studentFacingProcedureText(step.title),
      description: studentFacingProcedureText(step.description),
      timeText: step.timeText ? studentFacingProcedureText(step.timeText) : null,
      place: sanitizeProcedurePlace(step.place),
      department: sanitizeProcedureDepartment(step.department)
    })),
    materials: procedure.materials.map(material => ({
      ...material,
      name: studentFacingProcedureText(material.name),
      description: studentFacingProcedureText(material.description),
      place: sanitizeProcedurePlace(material.place),
      department: sanitizeProcedureDepartment(material.department)
    })),
    sources: procedure.sources.map(source => ({
      ...sanitizeSource(source),
      claimScope: studentFacingProcedureText(source.claimScope)
    }))
  }
}

export function sanitizePublicSearchResponse(response: ApiSearchResponse): ApiSearchResponse {
  return {
    ...response,
    items: response.items.map(item => ({
      ...item,
      title: studentFacingPayloadText(item.title),
      summary: studentFacingPayloadText(item.summary)
    }))
  }
}

export function sanitizePublicList<T>(
  response: ApiListResponse<T>,
  sanitizeItem: (item: T) => T
): ApiListResponse<T> {
  return {
    ...response,
    items: response.items.map(sanitizeItem)
  }
}
