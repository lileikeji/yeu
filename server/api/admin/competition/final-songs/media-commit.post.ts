import { competitionAdminFinalSongMediaCommitSchema } from '../../../../../shared/schemas/server'
import {
  getAdminCompetitionPayload,
  saveAdminFinalSongMedia
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'

/** 后台直传完成后登记第二首背景视频（MP4 或 ZIP），并回带整份后台数据。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const input = await parseBody(event, competitionAdminFinalSongMediaCommitSchema)
  const saved = await saveAdminFinalSongMedia(client, contentId, input.singerId, input.key, input.size)
  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.final_song_media',
    entityType: 'competition_singer',
    entityId: input.singerId,
    details: { name: saved.name, size: saved.size }
  })
  return { media: saved, payload: getAdminCompetitionPayload(client, contentId) }
})
