import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildAccompanimentArchive, buildAccompanimentArchiveToFile, ensureCompetitionEvent, getRoundByKey } from '../../../../../modules/competition/service'
import { requireCompetitionRoundKey, resolveCompetitionContentId } from '../../../../../utils/competition-admin'
import { contentTypeForKey, cosConfig, newAccompanimentKey, presignCosGet, putCosObjectFromFile } from '../../../../../utils/cos-storage'
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

  // deliver=cos：在磁盘上流式打包，再流式上传到对象存储，回一个临时直链。
  // 走边缘节点下载，既不受源站 3Mbps 出口限制，也不会把几百 MB 的包塞进进程内存。
  if (query.deliver === 'cos') {
    const config = cosConfig()
    if (!config) {
      throw createError({ statusCode: 503, statusMessage: 'Storage not configured', data: { code: 'STORAGE_NOT_CONFIGURED', message: '还没有配置对象存储' } })
    }
    const workDir = await mkdtemp(join(tmpdir(), 'yeu-accompaniment-'))
    const target = join(workDir, 'bundle.zip')
    try {
      const archive = await buildAccompanimentArchiveToFile(client, round, { useOriginal, targetPath: target })
      const key = newAccompanimentKey(config, 'zip')
      await putCosObjectFromFile(config, key, target, contentTypeForKey(key))
      const url = presignCosGet(config, key, 60 * 60, 'application/zip')
      setHeader(event, 'Cache-Control', 'no-store')
      return { url, filename: archive.filename, size: archive.size, expiresIn: 3600 }
    } finally {
      await rm(workDir, { recursive: true, force: true })
    }
  }

  const archive = await buildAccompanimentArchive(client, round, { useOriginal })

  setHeader(event, 'Content-Type', 'application/zip')
  setHeader(event, 'Content-Disposition', `attachment; filename="${archive.filename}"`)
  setHeader(event, 'Cache-Control', 'no-store')
  return archive.data
})
