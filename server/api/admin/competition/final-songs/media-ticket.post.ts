import { competitionAdminFinalSongMediaTicketSchema } from '../../../../../shared/schemas/server'
import { getAdminFinalSongMediaTarget } from '../../../../modules/competition/service'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { parseBody } from '../../../../utils/validation'

/**
 * 后台替选手传决赛第二首背景视频：先拿 COS 直传地址，字节不经过应用服务器。
 * 落点与选手自己在「决赛两首歌」页上传完全相同，第二轮名单生成后自动带上这份文件。
 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  setHeader(event, 'Cache-Control', 'no-store')
  const input = await parseBody(event, competitionAdminFinalSongMediaTicketSchema)
  return getAdminFinalSongMediaTarget(client, contentId, input.singerId, input.filename)
})
