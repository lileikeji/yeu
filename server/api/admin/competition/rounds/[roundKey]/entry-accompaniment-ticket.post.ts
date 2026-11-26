import { z } from 'zod'
import {
  ensureCompetitionEvent,
  getRoundByKey,
  listRoundEntryRows
} from '../../../../../modules/competition/service'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { cosConfig, newAccompanimentKey, presignCosPut } from '../../../../../utils/cos-storage'
import { useAdminRequest } from '../../../../../utils/http'
import { parseBody } from '../../../../../utils/validation'

const schema = z.object({
  entryId: z.string().min(1).max(64),
  filename: z.string().trim().min(1).max(120)
}).strict()

/** 后台代传决赛第二首背景视频：先拿直传地址，字节不经过应用服务器。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, schema)

  if (roundKey !== 'final2') {
    throw createError({
      statusCode: 422,
      statusMessage: 'Final round only',
      data: {
        code: 'FINAL_VIDEO_REQUIRED',
        message: roundKey === 'final'
          ? '决赛第一首是音频伴奏，直接选音频文件上传就行'
          : '只有决赛第二首背景视频走直传'
      }
    })
  }
  if (!input.filename.toLowerCase().endsWith('.mp4')) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Final video required',
      data: { code: 'FINAL_VIDEO_REQUIRED', message: '背景视频只收 MP4' }
    })
  }
  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  if (!listRoundEntryRows(client, round.id).some(entry => entry.id === input.entryId)) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Entry not found',
      data: { code: 'ENTRY_NOT_FOUND', message: '名单里没有这条记录' }
    })
  }
  const config = cosConfig()
  if (!config) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Storage not configured',
      data: { code: 'STORAGE_NOT_CONFIGURED', message: '还没配对象存储，决赛视频暂时传不了' }
    })
  }
  const key = newAccompanimentKey(config, 'mp4')
  return {
    key,
    uploadUrl: presignCosPut(config, key, 'video/mp4', 900),
    expiresIn: 900
  }
})
