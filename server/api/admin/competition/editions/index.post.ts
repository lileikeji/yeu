import { z } from 'zod'
import {
  createNextEdition,
  getAdminCompetitionPayload
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'

const bodySchema = z.object({ label: z.string().trim().min(1).max(40) }).strict()

/** 换届：旧届归档留数据，新届从零开始。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const input = await parseBody(event, bodySchema)

  const created = createNextEdition(client, contentId, input.label)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.edition_create',
    entityType: 'competition_event',
    entityId: created.id,
    details: { label: input.label }
  })

  return { payload: getAdminCompetitionPayload(client, contentId) }
})
