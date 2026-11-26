import { competitionFinalSongVideoTicketSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  getFinalSongMediaUploadTarget
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/** 决赛两首歌各自拿一个直传地址：第一首伴奏音频、第二首 MP4 背景视频。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionFinalSongVideoTicketSchema)
  const contentId = findMusicAssociationContent(client).id
  return getFinalSongMediaUploadTarget(client, contentId, {
    name: input.name,
    studentNo: input.studentNo,
    contact: input.contact
  }, input.slot, input.filename)
})
