import { competitionSongLookupSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  getSongEditor
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/** 独立填歌页：姓名 + 学号 + QQ 或邮箱，和邮箱通知互不相干。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionSongLookupSchema)
  const contentId = findMusicAssociationContent(client).id
  return getSongEditor(client, contentId, input)
})
