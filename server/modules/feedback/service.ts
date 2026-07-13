import { randomUUID } from 'node:crypto'
import { and, count, desc, eq, like, or, type SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { z } from 'zod'
import type {
  createFeedbackSchema,
  feedbackQuerySchema,
  updateFeedbackSchema
} from '../../../shared/schemas/server'
import type { DatabaseClient } from '../../database/client'
import { contents, feedback, places } from '../../database/schema'
import { throwNotFound } from '../../utils/errors'
import { serializeFeedback } from '../../utils/serializers'
import { getSecurityConfig, hashOpaqueToken } from '../../utils/security'

type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>
type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>
type FeedbackQuery = z.infer<typeof feedbackQuerySchema>

function cleanSearchTerm(value: string): string {
  return value.replace(/[%_]/g, '').trim()
}

function assertPublicTarget(client: DatabaseClient, input: CreateFeedbackInput): void {
  if (input.targetType === 'general') {
    return
  }

  const exists = input.targetType === 'place'
    ? client.db.select({ id: places.id }).from(places).where(and(
        eq(places.id, input.targetId!),
        eq(places.status, 'published')
      )).get()
    : client.db.select({ id: contents.id }).from(contents).where(and(
        eq(contents.id, input.targetId!),
        eq(contents.status, 'published')
      )).get()

  if (!exists) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Feedback target does not exist or is not public',
      data: { code: 'INVALID_FEEDBACK_TARGET' }
    })
  }
}

export function createFeedback(
  event: H3Event,
  client: DatabaseClient,
  input: CreateFeedbackInput,
  ipAddress: string
) {
  assertPublicTarget(client, input)
  const id = randomUUID()
  const now = Date.now()
  const security = getSecurityConfig(event)

  client.db.insert(feedback).values({
    id,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    reasonType: input.reasonType,
    message: input.message,
    evidenceUrl: input.evidenceUrl || null,
    contact: input.contact ?? null,
    status: 'new',
    submitterIpHash: hashOpaqueToken(security.secret, 'feedback-ip', ipAddress),
    createdAt: now,
    updatedAt: now
  }).run()

  const row = client.db.select().from(feedback).where(eq(feedback.id, id)).get()

  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Feedback could not be created' })
  }

  return serializeFeedback(row)
}

export function listFeedback(client: DatabaseClient, query: FeedbackQuery) {
  const conditions: SQL[] = []
  const search = query.q ? cleanSearchTerm(query.q) : ''

  if (query.status) {
    conditions.push(eq(feedback.status, query.status))
  }
  if (query.targetType) {
    conditions.push(eq(feedback.targetType, query.targetType))
  }
  if (search) {
    const searchCondition = or(
      like(feedback.message, `%${search}%`),
      like(feedback.reasonType, `%${search}%`),
      like(feedback.contact, `%${search}%`)
    )
    if (searchCondition) conditions.push(searchCondition)
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const offset = (query.page - 1) * query.pageSize
  const rows = client.db.select().from(feedback)
    .where(where)
    .orderBy(desc(feedback.createdAt))
    .limit(query.pageSize)
    .offset(offset)
    .all()
  const total = client.db.select({ value: count() }).from(feedback).where(where).get()?.value ?? 0

  return {
    items: rows.map(serializeFeedback),
    total,
    page: query.page,
    pageSize: query.pageSize
  }
}

export function getFeedback(client: DatabaseClient, id: string) {
  const row = client.db.select().from(feedback).where(eq(feedback.id, id)).get()
  return row ? serializeFeedback(row) : throwNotFound('feedback')
}

export function updateFeedback(
  client: DatabaseClient,
  id: string,
  input: UpdateFeedbackInput,
  adminId: string
) {
  const existing = client.db.select().from(feedback).where(eq(feedback.id, id)).get()

  if (!existing) {
    throwNotFound('feedback')
  }

  const status = input.status ?? existing.status
  const terminal = ['resolved', 'rejected', 'spam'].includes(status)

  client.db.update(feedback).set({
    status,
    resolutionNote: input.resolutionNote,
    resolvedBy: terminal ? adminId : null,
    resolvedAt: terminal ? Date.now() : null,
    updatedAt: Date.now()
  }).where(eq(feedback.id, id)).run()
  return getFeedback(client, id)
}

export function deleteFeedback(client: DatabaseClient, id: string): void {
  const existing = client.db.select({ id: feedback.id }).from(feedback).where(eq(feedback.id, id)).get()

  if (!existing) {
    throwNotFound('feedback')
  }

  client.db.delete(feedback).where(eq(feedback.id, id)).run()
}
