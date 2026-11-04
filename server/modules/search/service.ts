import { and, desc, eq, inArray, like, or } from 'drizzle-orm'
import type { PublicSearchResultType } from '../../../shared/constants/server'
import type { ApiSearchResponse } from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import {
  contents,
  places,
  procedureMaterials,
  procedures,
  procedureSteps,
  signalEvents
} from '../../database/schema'
import { getManagedContentKinds } from '../content/catalog-state'
import { activePublicContentCondition } from '../content/visibility'
import { activePublicProcedureCondition } from '../procedures/service'
import { cleanSearchTerm } from '../../../shared/utils/like-search'
import { expandCampusSearchTerms } from '../../../shared/utils/campus-search-aliases'
import { safeMetadata } from '../../utils/serializers'
import { searchSystemFeatures } from '../../../data/system-features'

function matchScore(title: string, detail: string | null, search: string): number {
  const normalizedTitle = title.toLocaleLowerCase('zh-CN')
  const normalizedDetail = (detail ?? '').toLocaleLowerCase('zh-CN')
  const normalizedSearch = search.toLocaleLowerCase('zh-CN')

  if (normalizedTitle === normalizedSearch) return 0
  if (normalizedTitle.includes(normalizedSearch)) return 1
  if (normalizedDetail.includes(normalizedSearch)) return 2
  return 3
}

function bestMatchScore(title: string, detail: string | null, searches: string[]): number {
  return Math.min(...searches.map(search => matchScore(title, detail, search)))
}

function publicMetadataSearchText(metadataJson: string): string {
  const metadata = safeMetadata(metadataJson)

  const text: string[] = []
  for (const key of [
    'shortTitle',
    'statusText',
    'leadNotice',
    'bodyHeading',
    'recruitmentPeriod',
    'activitySchedule',
    'contactMethod'
  ]) {
    if (typeof metadata[key] === 'string') text.push(metadata[key])
  }
  if (Array.isArray(metadata.sections)) {
    for (const section of metadata.sections) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) continue
      const record = section as Record<string, unknown>
      for (const key of ['title', 'description', 'notice']) {
        if (typeof record[key] === 'string') text.push(record[key])
      }
      if (Array.isArray(record.items)) {
        text.push(...record.items.filter((item): item is string => typeof item === 'string'))
      }
    }
  }
  return text.join(' ')
}

export function searchPublishedContent(
  client: DatabaseClient,
  query: string,
  limit: number,
  type?: PublicSearchResultType
): ApiSearchResponse {
  const search = cleanSearchTerm(query)
  const searchTerms = expandCampusSearchTerms(query)
  const managedKinds = getManagedContentKinds(client)
  const hasManagedContent = managedKinds.length > 0
  if (!search) {
    return { query, type: type ?? null, items: [], total: 0, hasManagedContent, managedKinds }
  }

  const now = Date.now()
  const contentKind = type && type !== 'place' && type !== 'procedure' ? type : null

  const placeRows = !type || type === 'place'
    ? client.db.select({
        id: places.id,
        slug: places.slug,
        title: places.name,
        summary: places.summary,
        address: places.address,
        category: places.category,
        updatedAt: places.updatedAt
      }).from(places).where(and(
        eq(places.status, 'published'),
        or(...searchTerms.flatMap(term => [
          like(places.name, `%${term}%`),
          like(places.summary, `%${term}%`),
          like(places.address, `%${term}%`)
        ]))
      )).orderBy(desc(places.isFeatured), desc(places.updatedAt)).all()
    : []

  const contentRows = !type || contentKind
    ? client.db.select({
        id: contents.id,
        slug: contents.slug,
        title: contents.title,
        summary: contents.summary,
        body: contents.body,
        category: contents.category,
        kind: contents.kind,
        metadataJson: contents.metadataJson,
        updatedAt: contents.updatedAt
      }).from(contents).where(and(
        eq(contents.status, 'published'),
        activePublicContentCondition(now),
        contentKind ? eq(contents.kind, contentKind) : undefined,
        or(...searchTerms.flatMap(term => [
          like(contents.title, `%${term}%`),
          like(contents.summary, `%${term}%`),
          like(contents.body, `%${term}%`),
          like(contents.metadataJson, `%${term}%`)
        ]))
      )).orderBy(desc(contents.isFeatured), desc(contents.updatedAt)).all()
    : []

  const searchableContentRows = contentRows.flatMap((row) => {
    const metadataSearchText = publicMetadataSearchText(row.metadataJson)
    const detail = `${row.summary} ${row.body} ${metadataSearchText}`
    return searchTerms.some(term => (
      detail.toLocaleLowerCase('zh-CN').includes(term.toLocaleLowerCase('zh-CN'))
      || row.title.toLocaleLowerCase('zh-CN').includes(term.toLocaleLowerCase('zh-CN'))
    ))
      ? [{ row, metadataSearchText }]
      : []
  })

  const procedureRows = !type || type === 'procedure'
    ? client.db.select({
        id: procedures.id,
        slug: procedures.slug,
        title: procedures.title,
        summary: procedures.summary,
        body: procedures.body,
        category: procedures.category,
        statusText: procedures.statusText,
        updatedAt: procedures.updatedAt
      }).from(procedures)
        .where(activePublicProcedureCondition(now))
        .orderBy(desc(procedures.updatedAt))
        .all()
    : []
  const procedureIds = procedureRows.map(row => row.id)
  const stepRows = procedureIds.length > 0
    ? client.db.select({
        procedureId: procedureSteps.procedureId,
        title: procedureSteps.title,
        description: procedureSteps.description,
        timeText: procedureSteps.timeText
      }).from(procedureSteps)
        .where(inArray(procedureSteps.procedureId, procedureIds))
        .all()
    : []
  const materialRows = procedureIds.length > 0
    ? client.db.select({
        procedureId: procedureMaterials.procedureId,
        name: procedureMaterials.name,
        description: procedureMaterials.description
      }).from(procedureMaterials)
        .where(inArray(procedureMaterials.procedureId, procedureIds))
        .all()
    : []
  const normalizedSearchTerms = searchTerms.map(term => term.toLocaleLowerCase('zh-CN'))
  const searchableProcedureRows = procedureRows.flatMap((row) => {
    const stepText = stepRows
      .filter(step => step.procedureId === row.id)
      .map(step => `${step.title} ${step.description} ${step.timeText ?? ''}`)
      .join(' ')
    const materialText = materialRows
      .filter(material => material.procedureId === row.id)
      .map(material => `${material.name} ${material.description}`)
      .join(' ')
    const detail = `${row.summary} ${row.body} ${row.statusText} ${stepText} ${materialText}`
    return normalizedSearchTerms.some(term => (
      row.title.toLocaleLowerCase('zh-CN').includes(term)
      || detail.toLocaleLowerCase('zh-CN').includes(term)
    ))
      ? [{ row, detail }]
      : []
  })

  // 校园信号（/hot）是同一批官网通知的聚簇结果：搜索词命中事件时一并给出，
  // 点进去看「哪几个站点都发了、热度多少」，再跳原文。
  const signalRows = !type || type === 'notice'
    ? client.db.select({
        id: signalEvents.id,
        slug: signalEvents.slug,
        title: signalEvents.title,
        summary: signalEvents.summary,
        category: signalEvents.category,
        lastSeenAt: signalEvents.lastSeenAt
      }).from(signalEvents).where(and(
        eq(signalEvents.status, 'published'),
        or(...searchTerms.flatMap(term => [
          like(signalEvents.title, `%${term}%`),
          like(signalEvents.summary, `%${term}%`),
          like(signalEvents.category, `%${term}%`)
        ]))
      )).orderBy(desc(signalEvents.heat), desc(signalEvents.lastSeenAt)).all()
    : []

  const rankedItems = [
    ...placeRows.map(row => ({
      entityType: 'place' as const,
      resultType: 'place' as const,
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category,
      kind: null,
      updatedAt: new Date(row.updatedAt).toISOString(),
      score: bestMatchScore(row.title, `${row.summary} ${row.address ?? ''}`, searchTerms)
    })),
    ...searchableContentRows.map(({ row, metadataSearchText }) => ({
      entityType: 'content' as const,
      resultType: row.kind,
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category,
      kind: row.kind,
      updatedAt: new Date(row.updatedAt).toISOString(),
      score: bestMatchScore(row.title, `${row.summary} ${row.body} ${metadataSearchText}`, searchTerms)
    })),
    ...searchableProcedureRows.map(({ row, detail }) => ({
      entityType: 'procedure' as const,
      resultType: 'procedure' as const,
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category,
      kind: null,
      updatedAt: new Date(row.updatedAt).toISOString(),
      score: bestMatchScore(row.title, detail, searchTerms)
    })),
    ...signalRows.map(row => ({
      entityType: 'content' as const,
      resultType: 'notice' as const,
      id: row.id,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      category: row.category,
      kind: 'notice' as const,
      updatedAt: new Date(row.lastSeenAt).toISOString(),
      to: `/hot#${encodeURIComponent(row.slug)}`,
      score: bestMatchScore(row.title, row.summary, searchTerms)
    }))
  ]
    .sort((left, right) => left.score - right.score || right.updatedAt.localeCompare(left.updatedAt))
  const total = rankedItems.length
  const items = rankedItems
    .slice(0, limit)
    .map(({ score: _score, ...item }) => item)
  const featureMatches = !type || type === 'guide'
    ? searchSystemFeatures(query, Math.min(limit, 8)).map(({ score: _score, ...feature }) => feature)
    : []

  return {
    query,
    type: type ?? null,
    items,
    total,
    hasManagedContent,
    managedKinds,
    ...(featureMatches.length > 0 ? { features: featureMatches } : {})
  }
}
