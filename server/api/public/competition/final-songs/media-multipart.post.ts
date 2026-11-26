import { competitionFinalSongMediaMultipartSchema } from '../../../../../shared/schemas/server'
import {
  abortFinalSongMultipart,
  completeFinalSongMultipart,
  findMusicAssociationContent,
  listFinalSongMultipart,
  signFinalSongMultipartParts,
  startFinalSongMultipart
} from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

/**
 * 决赛文件分片上传（断点续传）。第一首伴奏、第二首 MP4/ZIP 都走同一套会话：
 * init 拿 key + uploadId，sign 按片取直传地址，status 查已传分片，
 * complete 收口后立刻写回名单，abort 放弃。
 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const input = await parseBody(event, competitionFinalSongMediaMultipartSchema)
  const contentId = findMusicAssociationContent(client).id
  const who = { name: input.name, studentNo: input.studentNo, contact: input.contact }
  switch (input.action) {
    case 'init':
      return startFinalSongMultipart(client, contentId, who, input.slot, input.filename, input.size)
    case 'status':
      return listFinalSongMultipart(client, contentId, who, input.slot, input.key, input.uploadId)
    case 'sign':
      return signFinalSongMultipartParts(client, contentId, who, input.slot, input.key, input.uploadId, input.partNumbers)
    case 'complete':
      return completeFinalSongMultipart(client, contentId, who, input.slot, input.key, input.uploadId, input.size)
    case 'abort':
      await abortFinalSongMultipart(client, contentId, who, input.slot, input.key, input.uploadId)
      return { ok: true }
    default:
      throw createError({
        statusCode: 400,
        statusMessage: 'Unknown action',
        data: { code: 'VALIDATION_ERROR', message: '不支持的上传动作' }
      })
  }
})
