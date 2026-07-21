import { and, desc, eq, inArray, like, or } from 'drizzle-orm'
import type { PublicSearchResultType } from '../../../shared/constants/server'
import type { ApiSearchResponse } from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import {
  contents,
  places,
  procedureMaterials,
  procedures,
  procedureSteps
} from '../../database/schema'
import { getManagedContentKinds } from '../content/catalog-state'
import { activePublicContentCondition } from '../content/visibility'
import { activePublicProcedureCondition } from '../procedures/service'
import { cleanSearchTerm } from '../../../shared/utils/like-search'
import { safeMetadata } from '../../utils/serializers'

function matchScore(title: string, detail: string | null, search: string): number {
  const normalizedTitle = title.toLocaleLowerCase('zh-CN')
  const normalizedDetail = (detail ?? '').toLocaleLowerCase('zh-CN')
  const normalizedSearch = search.toLocaleLowerCase('zh-CN')

  if (normalizedTitle === normalizedSearch) return 0
  if (normalizedTitle.includes(normalizedSearch)) return 1
  if (normalizedDetail.includes(normalizedSearch)) return 2
  return 3
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
        or(
          like(places.name, `%${search}%`),
          like(places.summary, `%${search}%`),
          like(places.address, `%${search}%`)
        )
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
        or(
          like(contents.title, `%${search}%`),
          like(contents.summary, `%${search}%`),
          like(contents.body, `%${search}%`),
          like(contents.metadataJson, `%${search}%`)
        )
      )).orderBy(desc(contents.isFeatured), desc(contents.updatedAt)).all()
    : []

  const searchableContentRows = contentRows.flatMap((row) => {
    const metadataSearchText = publicMetadataSearchText(row.metadataJson)
    const detail = `${row.summary} ${row.body} ${metadataSearchText}`
    return detail.toLocaleLowerCase('zh-CN').includes(search.toLocaleLowerCase('zh-CN'))
      || row.title.toLocaleLowerCase('zh-CN').includes(search.toLocaleLowerCase('zh-CN'))
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
  const normalizedSearch = search.toLocaleLowerCase('zh-CN')
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
    return row.title.toLocaleLowerCase('zh-CN').includes(normalizedSearch)
      || detail.toLocaleLowerCase('zh-CN').includes(normalizedSearch)
      ? [{ row, detail }]
      : []
  })

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
      score: matchScore(row.title, `${row.summary} ${row.address ?? ''}`, search)
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
      score: matchScore(row.title, `${row.summary} ${row.body} ${metadataSearchText}`, search)
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
      score: matchScore(row.title, detail, search)
    }))
  ]
    .sort((left, right) => left.score - right.score || right.updatedAt.localeCompare(left.updatedAt))
  const total = rankedItems.length
  const items = rankedItems
    .slice(0, limit)
    .map(({ score: _score, ...item }) => item)

  return {
    query,
    type: type ?? null,
    items,
    total,
    hasManagedContent,
    managedKinds
  }
}
