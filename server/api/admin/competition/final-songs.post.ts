import { competitionAdminFinalSongsSchema } from '../../../../shared/schemas/server'
import {
  getAdminCompetitionPayload,
  setFinalSongsByAdmin
} from '../../../modules/competition/service'
import { writeAudit } from '../../../utils/audit'
import { resolveCompetitionContentId } from '../../../utils/competition-admin'
import { useAdminRequest } from '../../../utils/http'
import { parseBody } from '../../../utils/validation'

/** 后台代替决赛选手定两首歌：第一首唱第一轮，第二首进前六后唱第二轮。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const input = await parseBody(event, competitionAdminFinalSongsSchema)

  const result = setFinalSongsByAdmin(client, contentId, input)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.final_songs',
    entityType: 'competition_final_songs',
    entityId: input.singerId,
    details: {
      firstSong: input.firstSong,
      secondSong: input.secondSong,
      revision: result.revision
    }
  })

  return { payload: getAdminCompetitionPayload(client, contentId) }
})
