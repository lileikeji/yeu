import type {
  ApiAmapOwnerDraftPlace,
  ApiContent,
  ApiListResponse,
  ApiPlace,
  ApiProcedure,
  ApiProcedureDepartment,
  ApiProcedureGuide,
  ApiProcedurePlace,
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

function studentFacingPayloadText(value: string): string {
  return studentFacingProcedureText(value
    .replace(/地图目录已导入，坐标核验中/g, '地图地点已整理，入口仍在确认')
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
    .replace(/上线前/g, '使用前'))
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
    title: studentFacingProcedureTitle(guide.title),
    summary: studentFacingProcedureText(guide.summary)
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

export function sanitizePublicList<T>(
  response: ApiListResponse<T>,
  sanitizeItem: (item: T) => T
): ApiListResponse<T> {
  return {
    ...response,
    items: response.items.map(sanitizeItem)
  }
}
