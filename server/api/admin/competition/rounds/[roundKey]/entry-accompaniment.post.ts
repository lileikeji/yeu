import { setCompetitionEntryAccompanimentSchema } from '../../../../../../shared/schemas/server'
import {
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  setEntryAccompaniment
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import type { CompetitionEntryAccompaniment } from '../../../../../../shared/types'
import { useAdminRequest } from '../../../../../utils/http'
import { MAX_UPLOAD_JSON_BODY_BYTES, parseBody } from '../../../../../utils/validation'
import { audioUploadBusyError, beginAudioUpload, endAudioUpload } from '../../../../../utils/uploaded-audio'

/** 后台代传伴奏：选手不会传（比如 iOS 选不到微信文件）时，工作人员在这里补。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  if (!beginAudioUpload()) throw audioUploadBusyError()
  let input: ReturnType<typeof setCompetitionEntryAccompanimentSchema.parse>
  let saved: CompetitionEntryAccompaniment
  try {
    input = await parseBody(event, setCompetitionEntryAccompanimentSchema, { maxBytes: MAX_UPLOAD_JSON_BODY_BYTES })
    const competition = ensureCompetitionEvent(client, contentId)
    const round = getRoundByKey(client, competition.id, roundKey)
    saved = await setEntryAccompaniment(client, round, input.entryId, {
      filename: input.filename ?? '',
      data: Buffer.from(input.data, 'base64')
    })
  } finally {
    endAudioUpload()
  }

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.entry_accompaniment',
    entityType: 'competition_round_entry',
    entityId: input.entryId,
    details: { key: roundKey, name: saved.name, size: saved.size }
  })

  return { accompaniment: saved, payload: getAdminCompetitionPayload(client, contentId) }
})
