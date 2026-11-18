import { buildAccompanimentArchive, ensureCompetitionEvent, getRoundByKey } from '../../../../../modules/competition/service'
import { requireCompetitionRoundKey, resolveCompetitionContentId } from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'

/** 后台导出复赛伴奏：按出场顺序，一人一个文件夹（含 曲目.txt）。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const useOriginal = getQuery(event).original === '1'
  const archive = await buildAccompanimentArchive(client, round, { useOriginal })

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', `attachment; filename="${archive.filename}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return archive.data
})
