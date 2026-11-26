import { competitionFinalSongVideoCommitSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  saveFinalSongMediaByThreeFactors
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/** 直传完成后登记第 1 首的伴奏 / 第 2 首的视频；服务端会 HEAD 校验对象再落库。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionFinalSongVideoCommitSchema)
  const contentId = findMusicAssociationContent(client).id
  return saveFinalSongMediaByThreeFactors(client, contentId, {
    name: input.name,
    studentNo: input.studentNo,
    contact: input.contact
  }, input.slot, input.key, input.size)
})
