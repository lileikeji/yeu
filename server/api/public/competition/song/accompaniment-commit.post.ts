import { z } from 'zod'
import { commitAccompanimentKey, findMusicAssociationContent, resolveAccompanimentTarget } from '../../../../modules/competition/service'
import { cosConfig, headCosObject } from '../../../../utils/cos-storage'
import { useAppDatabase } from '../../../../utils/database'
import { MAX_UPLOADED_AUDIO_BYTES } from '../../../../utils/uploaded-audio'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  studentNo: z.string().trim().min(1).max(40),
  contact: z.string().trim().min(4).max(120),
  key: z.string().trim().min(4).max(300),
  filename: z.string().trim().max(120).optional(),
  song: z.string().trim().max(100).optional()
}).strict()

/** 直传成功后落库：用 HEAD 校验对象真实大小与类型，不信任客户端上报。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const config = cosConfig()
  if (!config) {
    throw createError({ statusCode: 503, statusMessage: 'Storage not configured', data: { code: 'STORAGE_NOT_CONFIGURED', message: '还没配对象存储，先用普通上传' } })
  }
  const client = useAppDatabase(event)
  const input = await parseBody(event, schema)
  if (!input.key.startsWith(`${config.prefix}/`)) {
    throw createError({ statusCode: 422, statusMessage: 'Bad key', data: { code: 'INVALID_KEY', message: '上传路径不对' } })
  }
  const contentId = findMusicAssociationContent(client).id
  const target = resolveAccompanimentTarget(client, contentId, input)
  const head = await headCosObject(config, input.key)
  if (!head) {
    throw createError({ statusCode: 409, statusMessage: 'Object missing', data: { code: 'OBJECT_MISSING', message: '没在存储里找到这个文件，重传一次' } })
  }
  const videoRound = target.round.key === 'final' || target.round.key === 'final2'
  const maxSize = videoRound ? 500 * 1024 * 1024 : MAX_UPLOADED_AUDIO_BYTES
  if (head.size <= 0 || head.size > maxSize) {
    throw createError({
      statusCode: 413,
      statusMessage: videoRound ? 'Video is too large' : 'Audio is too large',
      data: videoRound
        ? { code: 'PAYLOAD_TOO_LARGE', message: '决赛背景视频不能超过 500MB' }
        : { code: 'PAYLOAD_TOO_LARGE', message: '伴奏超过 400MB' }
    })
  }
  if (videoRound) {
    const extension = input.key.split('.').at(-1)?.toLowerCase() ?? ''
    if (extension !== 'mp4') {
      throw createError({ statusCode: 422, statusMessage: 'Final video required', data: { code: 'FINAL_VIDEO_REQUIRED', message: '决赛只收 MP4 视频背景' } })
    }
    const videoHeadOk = !head.contentType
      || head.contentType.startsWith('video/mp4')
      || head.contentType === 'application/octet-stream'
    if (!videoHeadOk) {
      throw createError({ statusCode: 422, statusMessage: 'Unsupported video type', data: { code: 'UNSUPPORTED_VIDEO', message: '决赛背景只收 MP4 视频' } })
    }
    if (head.size > 500 * 1024 * 1024) {
      throw createError({ statusCode: 413, statusMessage: 'Video is too large', data: { code: 'PAYLOAD_TOO_LARGE', message: '决赛背景视频不能超过 500MB' } })
    }
  } else {
    // m4a 常被存成 video/mp4 容器，按音频放行
    const contentTypeOk = !head.contentType
      || head.contentType.startsWith('audio/')
      || head.contentType === 'application/octet-stream'
      || /^video\/(mp4|quicktime)$/.test(head.contentType)
    if (!contentTypeOk) {
      throw createError({ statusCode: 422, statusMessage: 'Unsupported audio type', data: { code: 'UNSUPPORTED_AUDIO', message: '只收音频文件' } })
    }
  }
  const name = (input.filename || '').trim().slice(0, 120) || input.key.split('/').at(-1) || '伴奏'
  const saved = await commitAccompanimentKey(
    client,
    target.round,
    target.entryId,
    { key: input.key, name, size: head.size },
    input.song
  )
  return { name: saved.name, size: head.size }
})
