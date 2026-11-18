import { z } from 'zod'
import { entrySongOf, findMusicAssociationContent, resolveAccompanimentTarget, submitSongByThreeFactors } from '../../../../modules/competition/service'
import { useAppDatabase } from '../../../../utils/database'
import { cosConfig, newAccompanimentKey, presignCosPut } from '../../../../utils/cos-storage'
import { assertTrustedOrigin } from '../../../../utils/security'
import { parseBody } from '../../../../utils/validation'

const schema = z.object({
  name: z.string().trim().min(1).max(40),
  studentNo: z.string().trim().min(1).max(40),
  contact: z.string().trim().min(4).max(120),
  filename: z.string().trim().max(120).optional(),
  mime: z.string().trim().max(60).optional(),
  song: z.string().trim().max(100).optional()
}).strict()

const EXTENSIONS = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'] as const

/** 选手直传伴奏：服务端只发一个 15 分钟有效的 PUT 地址，字节不经过我们。 */
export default defineEventHandler(async (event) => {
  assertTrustedOrigin(event)
  setHeader(event, 'Cache-Control', 'no-store')
  const config = cosConfig()
  if (!config) {
    throw createError({ statusCode: 503, statusMessage: 'Storage not configured', data: { code: 'STORAGE_NOT_CONFIGURED', message: '还没配对象存储，先用普通上传' } })
  }
  const client = useAppDatabase(event)
  const input = await parseBody(event, schema)
  const contentId = findMusicAssociationContent(client).id
  const target = resolveAccompanimentTarget(client, contentId, input)
  // 页面上刚敲进去、还没点「提交曲目」的新歌，这里顺带存下，免得传伴奏被判「没曲目」
  if (!entrySongOf(client, target.entryId) && (input.song ?? '').trim()) {
    submitSongByThreeFactors(client, contentId, input, input.song!.trim())
  }
  if (!entrySongOf(client, target.entryId)) {
    throw createError({ statusCode: 409, statusMessage: 'Song required', data: { code: 'SONG_REQUIRED', message: '先把这一轮的曲目填上，再选伴奏文件' } })
  }

  const rawExtension = (input.filename || '').split('.').at(-1)?.toLowerCase() || 'mp3'
  const extension = (EXTENSIONS as readonly string[]).includes(rawExtension) ? rawExtension : 'mp3'
  const key = newAccompanimentKey(config, extension)
  const mime = (input.mime || '').startsWith('audio/') ? input.mime! : 'audio/mpeg'
  const uploadUrl = presignCosPut(config, key, mime, 900)
  return { key, uploadUrl, expiresIn: 900 }
})
