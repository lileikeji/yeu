import { competitionFinalSongsSubmitSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  submitFinalSongsByThreeFactors
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/**
 * 决赛专属提交接口：两首歌一次提交，slot 决定第一轮/第二轮。
 * 带 revision 做乐观锁；别人已经改过时返回 409，不会把领先的版本覆盖掉。
 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionFinalSongsSubmitSchema)
  const contentId = findMusicAssociationContent(client).id
  return submitFinalSongsByThreeFactors(client, contentId, {
    name: input.name,
    studentNo: input.studentNo,
    contact: input.contact,
    revision: input.revision
  }, {
    firstSong: input.firstSong,
    secondSong: input.secondSong
  })
})
