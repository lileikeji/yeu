import { setCompetitionEntryAccompanimentSchema } from '../../../../../../shared/schemas/server'
import {
  commitAccompanimentKey,
  ensureCompetitionEvent,
  getAdminCompetitionPayload,
  getRoundByKey,
  setEntryAccompaniment
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { cosConfig, headCosObject } from '../../../../../utils/cos-storage'
import type { CompetitionEntryAccompaniment } from '../../../../../../shared/types'
import { useAdminRequest } from '../../../../../utils/http'
import { MAX_UPLOAD_JSON_BODY_BYTES, parseBody } from '../../../../../utils/validation'
import { audioUploadBusyError, beginAudioUpload, endAudioUpload } from '../../../../../utils/uploaded-audio'

/** 后台代传伴奏：选手不会传（比如 iOS 选不到微信文件）时，工作人员在这里补。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  if (!beginAudioUpload()) throw audioUploadBusyError()
  let input: ReturnType<typeof setCompetitionEntryAccompanimentSchema.parse>
  let saved: CompetitionEntryAccompaniment
  try {
    input = await parseBody(event, setCompetitionEntryAccompanimentSchema, { maxBytes: MAX_UPLOAD_JSON_BODY_BYTES })
    const competition = ensureCompetitionEvent(client, contentId)
    const round = getRoundByKey(client, competition.id, roundKey)
    if (input.key && roundKey !== 'final2') {
      throw createError({
        statusCode: 422,
        statusMessage: 'Validation failed',
        data: {
          code: 'ACCOMPANIMENT_BYTES_REQUIRED',
          message: roundKey === 'final'
            ? '决赛第一首是音频伴奏，请直接选音频文件上传'
            : '这一轮伴奏请直接选音频文件上传'
        }
      })
    }
    if (input.key) {
      if (!input.size || input.size <= 0) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Validation failed',
          data: { code: 'VALIDATION_ERROR', message: '缺少文件大小', field: 'size' }
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
      if (!input.key.startsWith(`${config.prefix}/`)) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Bad key',
          data: { code: 'INVALID_KEY', message: '上传路径不对' }
        })
      }
      const head = await headCosObject(config, input.key)
      if (!head) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Object missing',
          data: { code: 'OBJECT_MISSING', message: '没在存储里找到这个文件，重传一次' }
        })
      }
      if (head.size <= 0 || head.size > 1024 * 1024 * 1024) {
        throw createError({
          statusCode: 413,
          statusMessage: 'Video is too large',
          data: { code: 'PAYLOAD_TOO_LARGE', message: '决赛背景视频不能超过 1GB' }
        })
      }
      const videoTypeOk = !head.contentType
        || head.contentType.startsWith('video/mp4')
        || head.contentType === 'application/octet-stream'
      if (!videoTypeOk) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Unsupported video type',
          data: { code: 'UNSUPPORTED_VIDEO', message: '决赛背景只收 MP4 视频' }
        })
      }
      const name = input.filename?.trim() || input.key.split('/').at(-1) || '决赛背景视频'
      saved = await commitAccompanimentKey(client, round, input.entryId, {
        key: input.key,
        name,
        size: head.size
      })
    } else {
      if (!input.data) {
        throw createError({
          statusCode: 422,
          statusMessage: 'Validation failed',
          data: { code: 'VALIDATION_ERROR', message: '缺少上传内容', field: 'data' }
        })
      }
      saved = await setEntryAccompaniment(client, round, input.entryId, {
        filename: input.filename ?? '',
        data: Buffer.from(input.data, 'base64')
      })
    }
  } finally {
    endAudioUpload()
  }

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.entry_accompaniment',
    entityType: 'competition_round_entry',
    entityId: input.entryId,
    details: { key: roundKey, name: saved.name, size: saved.size }
  })

  return { accompaniment: saved, payload: getAdminCompetitionPayload(client, contentId) }
})
