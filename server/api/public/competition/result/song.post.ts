import { updateSongByToken } from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'
import { competitionSongUpdateSchema } from '../../../../../shared/schemas/server'

/** 晋级选手提交复赛/决赛曲目，直接写回选手库的歌曲字段。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionSongUpdateSchema)
  return updateSongByToken(client, input.token, input.song)
})
