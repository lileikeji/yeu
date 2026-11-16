import { z } from 'zod'
import {
  confirmAdvanceRoster,
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  reopenAdvanceRoster,
  setEntryAdvanced
} from '../../../../../../modules/competition/service'
import { writeAudit } from '../../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../../utils/http'
import { parseBody } from '../../../../../../utils/validation'

const bodySchema = z.object({
  action: z.enum(['toggle', 'confirm', 'reopen']),
  entryId: z.string().min(1).max(64).optional(),
  advanced: z.boolean().optional()
}).strict()

/** 晋级名单：逐人勾选 → 确认（生成下一轮名单、解锁发邮件）→ 可重新打开调整。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, bodySchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)

  if (input.action === 'toggle') {
    if (!input.entryId) {
      throw createError({ statusCode: 422, statusMessage: 'Validation failed', data: { code: 'VALIDATION_ERROR', field: 'entryId' } })
    }
    setEntryAdvanced(client, round, input.entryId, input.advanced !== false)
  } else if (input.action === 'confirm') {
    confirmAdvanceRoster(client, round)
  } else {
    reopenAdvanceRoster(client, round)
  }

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.advance',
    entityType: 'competition_round',
    entityId: round.id,
    details: { roundKey, action: input.action, entryId: input.entryId ?? null }
  })

  return { payload: getAdminCompetitionPayload(client, contentId) }
})
