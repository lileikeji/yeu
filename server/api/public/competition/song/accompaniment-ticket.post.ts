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

const AUDIO_EXTENSIONS = ['mp3', 'm4a', 'wav', 'aac', 'ogg', 'flac'] as const
const VIDEO_EXTENSIONS = ['mp4'] as const

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

  const videoRound = target.round.key === 'final' || target.round.key === 'final2'
  const rawExtension = (input.filename || '').split('.').at(-1)?.toLowerCase() || (videoRound ? '' : 'mp3')
  const allowedExtensions: readonly string[] = videoRound ? VIDEO_EXTENSIONS : AUDIO_EXTENSIONS
  if (!allowedExtensions.includes(rawExtension)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unsupported upload type',
      data: videoRound
        ? { code: 'FINAL_VIDEO_REQUIRED', message: '决赛只收 MP4 视频背景' }
        : { code: 'UNSUPPORTED_AUDIO', message: '只收 mp3 / m4a / wav / aac / ogg / flac 这些音频格式' }
    })
  }
  const extension = rawExtension as typeof AUDIO_EXTENSIONS[number] | typeof VIDEO_EXTENSIONS[number]
  const key = newAccompanimentKey(config, extension)
  // 以扩展名定 mime（前端也按同一规则算），保证签名里的 content-type 和浏览器 PUT 的一致
  const MIME_BY_EXTENSION: Record<string, string> = {
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    wav: 'audio/wav',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    flac: 'audio/flac'
  }
  const mime = MIME_BY_EXTENSION[extension] ?? (videoRound ? 'video/mp4' : 'audio/mpeg')
  const uploadUrl = presignCosPut(config, key, mime, 900)
  return { key, uploadUrl, expiresIn: 900 }
})
