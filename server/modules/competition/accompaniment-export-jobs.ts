import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  contentTypeForKey,
  headCosObject,
  presignCosGet,
  putCosObjectFromFile
} from '../../utils/cos-storage'
import { buildAccompanimentArchiveToFile, listRoundEntryRows } from './service'
import type { DatabaseClient } from '../../database/client'
import type { competitionRounds } from '../../database/schema'
import type { CosConfig } from '../../utils/cos-storage'

type RoundRow = typeof competitionRounds.$inferSelect

/**
 * 伴奏包导出任务：原件包要读几百 MB 再打包上传，耗时三十秒以上，
 * 直接在请求里做会被 nginx 的 60 秒读超时掐断。改成后台任务 + 轮询进度。
 */
export interface AccompanimentExportJob {
  id: string
  status: 'running' | 'done' | 'error'
  done: number
  total: number
  cached: boolean
  url: string | null
  filename: string | null
  size: number | null
  message: string | null
  createdAt: number
  updatedAt: number
}

const jobs = new Map<string, AccompanimentExportJob>()
const JOB_TTL_MS = 30 * 60 * 1000

function pruneJobs(now: number): void {
  for (const [id, job] of jobs) {
    if (now - job.updatedAt > JOB_TTL_MS) jobs.delete(id)
  }
}

/** 按「轮次 + 是否原件 + 条目快照」生成对象存储里的缓存 key。 */
export function accompanimentExportCacheKey(
  config: CosConfig,
  client: DatabaseClient,
  round: RoundRow,
  useOriginal: boolean
): string {
  const fingerprint = createHash('sha1')
    .update(round.id)
    .update(useOriginal ? '|original' : '|mp3')
    .update(listRoundEntryRows(client, round.id).map(row => `${row.id}:${row.sortOrder}:${row.accompanimentUrl ?? ''}`).sort().join(','))
    .digest('hex')
    .slice(0, 12)
  return `${config.prefix}/exports/${round.key}-${useOriginal ? 'original' : 'mp3'}-${fingerprint}.zip`
}

export function getAccompanimentExportJob(id: string): AccompanimentExportJob | null {
  return jobs.get(id) ?? null
}

export function startAccompanimentExportJob(
  client: DatabaseClient,
  round: RoundRow,
  useOriginal: boolean,
  config: CosConfig
): AccompanimentExportJob {
  const now = Date.now()
  pruneJobs(now)
  const job: AccompanimentExportJob = {
    id: randomUUID(),
    status: 'running',
    done: 0,
    total: listRoundEntryRows(client, round.id).length,
    cached: false,
    url: null,
    filename: `competition-${round.key}-${useOriginal ? 'original' : 'mp3'}.zip`,
    size: null,
    message: null,
    createdAt: now,
    updatedAt: now
  }
  jobs.set(job.id, job)

  void runJob(client, round, useOriginal, config, job).catch((error: unknown) => {
    job.status = 'error'
    job.message = error instanceof Error ? error.message : '打包失败'
    job.updatedAt = Date.now()
    // 失败原因回给前端即可，日志里再写一份便于对账
    process.emitWarning(`伴奏包导出失败 ${round.key} ${String(useOriginal)} ${job.message ?? ''}`)
  })

  return job
}

async function runJob(
  client: DatabaseClient,
  round: RoundRow,
  useOriginal: boolean,
  config: CosConfig,
  job: AccompanimentExportJob
): Promise<void> {
  const cacheKey = accompanimentExportCacheKey(config, client, round, useOriginal)
  const cached = await headCosObject(config, cacheKey)
  if (cached) {
    job.cached = true
    job.done = job.total
    job.size = cached.size
    job.url = presignCosGet(config, cacheKey, 60 * 60, 'application/zip')
    job.status = 'done'
    job.updatedAt = Date.now()
    return
  }

  const workDir = await mkdtemp(join(tmpdir(), 'yeu-accompaniment-'))
  const target = join(workDir, 'bundle.zip')
  try {
    const archive = await buildAccompanimentArchiveToFile(client, round, {
      useOriginal,
      targetPath: target,
      onProgress: (done, total) => {
        job.done = done
        job.total = total
        job.updatedAt = Date.now()
      }
    })
    job.filename = archive.filename
    await putCosObjectFromFile(config, cacheKey, target, contentTypeForKey(cacheKey))
    job.size = archive.size
    job.url = presignCosGet(config, cacheKey, 60 * 60, 'application/zip')
    job.done = job.total
    job.status = 'done'
    job.updatedAt = Date.now()
  } finally {
    await rm(workDir, { recursive: true, force: true })
  }
}
