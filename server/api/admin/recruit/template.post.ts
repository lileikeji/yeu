import { uploadRecruitTemplateSchema } from '../../../../shared/schemas/server'
import { listTemplateLabels, readTemplateXml } from '../../../modules/recruit/docx'
import { saveRecruitTemplate } from '../../../modules/recruit/service'
import { writeAudit } from '../../../utils/audit'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'
import { resolveRecruitContentId } from '../../../utils/recruit-admin'

const MAX_TEMPLATE_BYTES = 3 * 1024 * 1024

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveRecruitContentId(event, session)
  const input = await parseBody(event, uploadRecruitTemplateSchema)

  const bytes = new Uint8Array(Buffer.from(input.dataBase64, 'base64'))
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_TEMPLATE_BYTES) {
    throw createError({
      statusCode: 413,
      statusMessage: 'Template file is too large (max 3MB)',
      data: { code: 'PAYLOAD_TOO_LARGE', maxBytes: MAX_TEMPLATE_BYTES }
    })
  }

  // Validates zip magic + presence of word/document.xml before persisting.
  const xml = readTemplateXml(bytes)
  const labels = listTemplateLabels(xml)

  saveRecruitTemplate(client, contentId, input.filename, bytes)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'recruit.template_upload',
    entityType: 'recruit_form',
    entityId: contentId,
    details: { filename: input.filename, sizeBytes: bytes.byteLength }
  })

  return { templateName: input.filename, labels }
})
