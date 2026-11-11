import { moveCompetitionCurrentSchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getCurrentSinger,
  getRoundByKey,
  moveCurrentEntry
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

/**
 * 顺序评分：开始 / 下一位 / 上一位 / 跳过 / 退出。
 *
 * 「下一位」在还有评委没提交时返回 409 `COMPETITION_PENDING_JUDGES`，
 * message 里带上缺谁，后台直接弹这个提示，不需要另算一遍。
 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, moveCompetitionCurrentSchema)

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  moveCurrentEntry(client, round, input.action, input.entryId)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.current',
    entityType: 'competition_round',
    entityId: round.id,
    details: { key: roundKey, action: input.action, entryId: input.entryId ?? null }
  })

  const payload = getAdminCompetitionPayload(client, contentId)
  return {
    payload,
    current: getCurrentSinger(client, getRoundByKey(client, competition.id, roundKey))
  }
})
