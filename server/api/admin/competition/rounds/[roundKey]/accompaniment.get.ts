import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildAccompanimentArchive, buildAccompanimentArchiveToFile, ensureCompetitionEvent, getRoundByKey, listRoundEntryRows } from '../../../../../modules/competition/service'
import { requireCompetitionRoundKey, resolveCompetitionContentId } from '../../../../../utils/competition-admin'
import { contentTypeForKey, cosConfig, headCosObject, presignCosGet, putCosObjectFromFile } from '../../../../../utils/cos-storage'
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
    // 打包很贵（原件包 500MB+，30 秒级），按「轮次 + 是否原件 + 条目快照」缓存到对象存储：
    // 第二次点下载直接回直链，几秒内开始下载，也不会再被 nginx 的 60 秒读超时掐断。
    const fingerprint = createHash('sha1')
      .update(round.id)
      .update(useOriginal ? '|original' : '|mp3')
      .update(listRoundEntryRows(client, round.id).map(row => `${row.id}:${row.sortOrder}:${row.accompanimentUrl ?? ''}`).sort().join(','))
      .digest('hex')
      .slice(0, 12)
    const cacheKey = `${config.prefix}/exports/${round.key}-${useOriginal ? 'original' : 'mp3'}-${fingerprint}.zip`
    const cached = await headCosObject(config, cacheKey)
    if (cached) {
      setHeader(event, 'Cache-Control', 'no-store')
      return {
        url: presignCosGet(config, cacheKey, 60 * 60, 'application/zip'),
        filename: `competition-${round.key}-${useOriginal ? 'original' : 'mp3'}.zip`,
        size: cached.size,
        expiresIn: 3600,
        cached: true
      }
    }

    const workDir = await mkdtemp(join(tmpdir(), 'yeu-accompaniment-'))
    const target = join(workDir, 'bundle.zip')
    try {
      const archive = await buildAccompanimentArchiveToFile(client, round, { useOriginal, targetPath: target })
      await putCosObjectFromFile(config, cacheKey, target, contentTypeForKey(cacheKey))
      const url = presignCosGet(config, cacheKey, 60 * 60, 'application/zip')
      setHeader(event, 'Cache-Control', 'no-store')
      return { url, filename: archive.filename, size: archive.size, expiresIn: 3600, cached: false }
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
