import { competitionSongLookupSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  getFinalSongEditor
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/** 决赛两首歌提交页：三要素定位后返回第一轮/第二轮曲目与乐观锁版本。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionSongLookupSchema)
  const contentId = findMusicAssociationContent(client).id
  return getFinalSongEditor(client, contentId, input)
})
