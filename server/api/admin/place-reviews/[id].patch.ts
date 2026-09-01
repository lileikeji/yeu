import { readBody } from 'h3'
import { reviewPlaceReviewSchema, updateSeedReviewSchema } from '../../../../shared/schemas/server'
import { adminReviewPlace, adminUpdateSeedReview } from '../../../modules/place-reviews/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody, requireUuidParam } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const id = requireUuidParam(event)
  const raw = await readBody(event).catch(() => null) as Record<string, unknown> | null

  // 编辑整理卡（source='seed'）：body 含 content/score
  if (raw && (raw.content !== undefined || raw.score !== undefined)) {
    const input = updateSeedReviewSchema.parse(raw)
    const result = adminUpdateSeedReview(client, id, input, session.admin.id)
    writeAudit(client, event, {
      actorAdminId: session.admin.id,
      action: 'place_review.edit_seed',
      entityType: 'place-review',
      entityId: id,
      details: { placeId: result.placeId, score: input.score ?? undefined, contentLength: input.content?.length ?? undefined }
    })
    return result
  }

  // 审核（status/note）
  const input = reviewPlaceReviewSchema.parse(raw)
  const result = adminReviewPlace(client, id, input, session.admin.id)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'place_review.review',
    entityType: 'place-review',
    entityId: id,
    details: { status: result.status, placeId: result.placeId, note: input.note ?? null }
  })
  return result
})
