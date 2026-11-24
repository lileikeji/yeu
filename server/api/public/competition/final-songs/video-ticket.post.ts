import { competitionFinalSongVideoTicketSchema } from '../../../../../shared/schemas/server'
import {
  findMusicAssociationContent,
  getFinalSongVideoUploadTarget
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/** 决赛两首歌各自拿一个 MP4 直传地址；浏览器直接传 COS，不经过应用服务器。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionFinalSongVideoTicketSchema)
  const contentId = findMusicAssociationContent(client).id
  return getFinalSongVideoUploadTarget(client, contentId, {
    name: input.name,
    studentNo: input.studentNo,
    contact: input.contact
  }, input.slot, input.filename)
})
