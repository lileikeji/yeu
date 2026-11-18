import { buildAccompanimentArchive, ensureCompetitionEvent, getRoundByKey } from '../../../../../modules/competition/service'
import { requireCompetitionRoundKey, resolveCompetitionContentId } from '../../../../../utils/competition-admin'
import { contentTypeForKey, cosConfig, newAccompanimentKey, presignCosGet, putCosObject } from '../../../../../utils/cos-storage'
import { useAdminRequest } from '../../../../../utils/http'

/** 后台导出复赛伴奏：按出场顺序，一人一个文件夹（含 曲目.txt）。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const query = getQuery(event)
  const useOriginal = query.original === '1'
  const archive = await buildAccompanimentArchive(client, round, { useOriginal })

  // deliver=cos：把 zip 先传到对象存储，回一个临时直链。
  // 这样下载走腾讯云边缘节点，不再受源站 3Mbps 出口限制（CDN 无法缓存这种动态包）。
  if (query.deliver === 'cos') {
    const config = cosConfig()
    if (!config) {
      throw createError({ statusCode: 503, statusMessage: 'Storage not configured', data: { code: 'STORAGE_NOT_CONFIGURED', message: '还没有配置对象存储' } })
    }
    const key = newAccompanimentKey(config, 'zip')
    await putCosObject(config, key, new Uint8Array(archive.data), contentTypeForKey(key))
    const url = presignCosGet(config, key, 60 * 60, 'application/zip')
    setHeader(event, 'Cache-Control', 'no-store')
    return { url, filename: archive.filename, size: archive.data.byteLength, expiresIn: 3600 }
  }

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', `attachment; filename="${archive.filename}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return archive.data
})
