import { z } from 'zod'
import { setSingerPhoto } from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

const schema = z.object({
  filename: z.string().trim().min(1).max(160),
  data: z.string().trim().min(1).max(14 * 1024 * 1024)
}).strict()

/** 选手照片：表单里传 base64，落对象存储（competition/photos），只记 key。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const singerId = String(getRouterParam(event, 'id') ?? '').trim()
  if (!singerId) {
    throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: { code: 'VALIDATION_ERROR', field: 'id' } })
  }
  const input = await parseBody(event, schema)
  const buffer = Buffer.from(input.data, 'base64')
  if (buffer.byteLength > 10 * 1024 * 1024) {
    throw createError({ statusCode: 413, statusMessage: 'Payload Too Large', data: { code: 'PAYLOAD_TOO_LARGE', message: '照片别超过 10MB' } })
  }

  const { url } = await setSingerPhoto(client, singerId, { filename: input.filename, data: buffer })
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.singer_photo',
    entityType: 'competition_singer',
    entityId: singerId,
    details: { contentId, filename: input.filename, bytes: buffer.byteLength }
  })
  return { url }
})
