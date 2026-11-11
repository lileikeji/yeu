import { competitionEmailImageUploadSchema } from '../../../../../../shared/schemas/server'
import {
  createEmailImage,
  ensureCompetitionEvent,
  getAdminCompetitionPayload
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  // 图片按活动维护，与轮次无关；仍校验路由，避免半截地址写出脏数据。
  void requireCompetitionRoundKey(event)
  const input = await parseBody(event, competitionEmailImageUploadSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const image = createEmailImage(client, competition.id, input)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.email_image_upload',
    entityType: 'competition_event',
    entityId: competition.id,
    details: { imageId: image.id, filename: image.filename, byteSize: image.byteSize }
  })

  return { image, payload: getAdminCompetitionPayload(client, contentId) }
})
