import {
  deleteEmailImage,
  ensureCompetitionEvent,
  getAdminCompetitionPayload
} from '../../../../../../modules/competition/service'
import { writeAudit } from '../../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../../utils/http'

export default defineEventHandler((event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  void requireCompetitionRoundKey(event)
  const imageId = getRouterParam(event, 'imageId') || ''
  const competition = ensureCompetitionEvent(client, contentId)
  const removed = deleteEmailImage(client, competition.id, imageId)

  if (!removed) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Email image not found',
      data: { code: 'EMAIL_IMAGE_NOT_FOUND', message: '图片不存在或已删除' }
    })
  }

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.email_image_delete',
    entityType: 'competition_event',
    entityId: competition.id,
    details: { imageId }
  })

  return { ok: true, payload: getAdminCompetitionPayload(client, contentId) }
})
