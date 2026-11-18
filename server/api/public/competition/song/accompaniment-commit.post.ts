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
  if (head.size <= 0 || head.size > MAX_UPLOADED_AUDIO_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Audio is too large', data: { code: 'PAYLOAD_TOO_LARGE', message: '伴奏超过 400MB' } })
  }
  // m4a 常被存成 video/mp4 容器，按音频放行
  const contentTypeOk = !head.contentType
    || head.contentType.startsWith('audio/')
    || head.contentType === 'application/octet-stream'
    || /^video\/(mp4|quicktime)$/.test(head.contentType)
  if (!contentTypeOk) {
    throw createError({ statusCode: 422, statusMessage: 'Unsupported audio type', data: { code: 'UNSUPPORTED_AUDIO', message: '只收音频文件' } })
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
