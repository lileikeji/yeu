import { randomBytes, randomUUID } from 'node:crypto'
import { and, count, desc, eq, like, or, type SQL } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { z } from 'zod'
import type {
  createFeedbackSchema,
  feedbackQuerySchema,
  updateFeedbackSchema
} from '../../../shared/schemas/server'
import type { ApiFeedbackReceipt, FeedbackReceiptStatus } from '../../../shared/types/server'
import type { DatabaseClient } from '../../database/client'
import { contents, feedback, knowledgeClaims, places, procedures } from '../../database/schema'
import { throwNotFound } from '../../utils/errors'
import { serializeFeedback } from '../../utils/serializers'
import { getSecurityConfig, hashOpaqueToken } from '../../utils/security'
import { activePublicProcedureCondition } from '../procedures/service'
import { cleanSearchTerm } from '../../../shared/utils/like-search'

type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>
type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>
type FeedbackQuery = z.infer<typeof feedbackQuerySchema>

/** 回执号字母表去掉 I/O/0/1：用户要照着念、照着抄。 */
const FEEDBACK_RECEIPT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const FEEDBACK_RECEIPT_PATTERN = /^YEU-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/

export function createFeedbackReceiptCode(): string {
  const bytes = randomBytes(6)
  let code = ''

  for (const byte of bytes) {
    code += FEEDBACK_RECEIPT_ALPHABET[byte % FEEDBACK_RECEIPT_ALPHABET.length]
  }

  return `YEU-${code}`
}

export function isFeedbackReceiptCode(value: string): boolean {
  return FEEDBACK_RECEIPT_PATTERN.test(value)
}

function toReceiptStatus(status: string): FeedbackReceiptStatus {
  if (status === 'resolved') {
    return 'accepted'
  }
  if (status === 'rejected' || status === 'spam') {
    return 'rejected'
  }

  return 'pending'
}

export function assertPublicFeedbackTarget(client: DatabaseClient, input: CreateFeedbackInput): void {
  if (input.targetType === 'general') {
    return
  }

  let exists: { id: string } | undefined
  if (input.targetType === 'place') {
    exists = client.db.select({ id: places.id }).from(places).where(and(
      eq(places.id, input.targetId!),
      eq(places.status, 'published')
    )).get()
  } else if (input.targetType === 'content') {
    exists = client.db.select({ id: contents.id }).from(contents).where(and(
      eq(contents.id, input.targetId!),
      eq(contents.status, 'published')
    )).get()
  } else if (input.targetType === 'claim') {
    exists = client.db.select({ id: knowledgeClaims.id }).from(knowledgeClaims).where(and(
      eq(knowledgeClaims.id, input.targetId!),
      eq(knowledgeClaims.reviewStatus, 'published')
    )).get()
  } else {
    exists = client.db.select({ id: procedures.id }).from(procedures).where(and(
      eq(procedures.id, input.targetId!),
      activePublicProcedureCondition()
    )).get()
  }

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
  assertPublicFeedbackTarget(client, input)
  const id = randomUUID()
  const now = Date.now()
  const security = getSecurityConfig(event)
  const receiptCode = createFeedbackReceiptCode()

  client.db.insert(feedback).values({
    id,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    reasonType: input.reasonType,
    message: input.message,
    expected: input.expected ?? null,
    evidenceUrl: input.evidenceUrl || null,
    pageUrl: input.pageUrl || null,
    contact: input.contact ?? null,
    receiptCode,
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

/**
 * 公开回执查询：只回答「这份纠错处理到哪一步」。
 * 联系方式、正文、IP 哈希一律不出现在返回值里。
 */
export function getFeedbackByReceiptCode(
  client: DatabaseClient,
  code: string
): ApiFeedbackReceipt | null {
  if (!isFeedbackReceiptCode(code)) {
    return null
  }

  const row = client.db.select({
    code: feedback.receiptCode,
    status: feedback.status,
    targetType: feedback.targetType,
    createdAt: feedback.createdAt,
    updatedAt: feedback.updatedAt,
    resolvedAt: feedback.resolvedAt
  }).from(feedback).where(eq(feedback.receiptCode, code)).get()

  if (!row) {
    return null
  }

  return {
    code,
    status: toReceiptStatus(row.status),
    targetType: row.targetType,
    submittedAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    handledAt: row.resolvedAt === null ? null : new Date(row.resolvedAt).toISOString()
  }
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
