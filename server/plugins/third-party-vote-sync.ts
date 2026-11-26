import { desc } from 'drizzle-orm'
import { thirdPartyVoteRecords } from '../database/schema'
import { ingestJinshujuEntries, recordThirdPartySyncState, resolveIngestContext } from '../modules/vote-sync/ingest'
import { fetchJinshujuEntries, readJinshujuConfig, toJinshujuTimestamp } from '../utils/jinshuju'

/**
 * 定时把金数据的新票拉回来。
 *
 * 为什么放在应用内：金数据的「数据推送」不是所有套餐都能开，而投票期间实时性要求也就
 * 分钟级。跑在进程里能直接复用入库与风控逻辑，不用在外面再挂一个 cron 去敲 HTTP 接口，
 * 也不用维护第二份鉴权凭据。
 *
 * 水位取库里最新一票往前推 24 小时重叠，重复条目由记录 id 兜底跳过，所以多拉不会写重。
 */
const STARTUP_DELAY_MS = 60 * 1000
const INTERVAL_MS = 5 * 60 * 1000
const OVERLAP_MS = 24 * 60 * 60 * 1000
const PAGE_SIZE = 500
const MAX_PAGES = 3

export default defineNitroPlugin((nitroApp) => {
  const config = readJinshujuConfig()
  // 没配表单就直接退出：本地开发、测试环境不该往上游发请求。
  if (!config) return

  let running = false

  const run = () => {
    if (running) return
    running = true
    void (async () => {
      try {
        const context = resolveIngestContext()
        const latest = context.client.db
          .select({ votedAt: thirdPartyVoteRecords.votedAt })
          .from(thirdPartyVoteRecords)
          .orderBy(desc(thirdPartyVoteRecords.votedAt))
          .limit(1)
          .get()
        const created = latest?.votedAt
          ? toJinshujuTimestamp(new Date(latest.votedAt - OVERLAP_MS))
          : undefined

        let next: string | null = null
        let added = 0
        let received = 0
        let lastEntryAt = latest?.votedAt ?? null
        for (let page = 0; page < MAX_PAGES; page += 1) {
          const result = await fetchJinshujuEntries(config, {
            created,
            next,
            limit: PAGE_SIZE
          })
          const outcome = ingestJinshujuEntries(context, result.data, {
            formToken: config.formToken,
            optionField: config.optionField
          })
          added += outcome.inserted
          received += outcome.received
          for (const entry of result.data) {
            const votedAt = Date.parse(String((entry as Record<string, unknown>).created_at ?? ''))
            if (Number.isFinite(votedAt) && (!lastEntryAt || votedAt > lastEntryAt)) lastEntryAt = votedAt
          }
          next = result.next
          if (!next || result.data.length === 0) break
        }

        recordThirdPartySyncState(context, {
          formToken: config.formToken,
          lastEntryAt,
          added
        })
        if (added > 0) {
          console.log(`[third-party-vote-sync] received=${received} inserted=${added}`)
        }
      } catch (error) {
        // 拉取失败不影响请求路径；游标记下原因，下一轮重试。
        const message = error instanceof Error ? error.message : String(error)
        console.warn(`[third-party-vote-sync] failed: ${message}`)
        try {
          recordThirdPartySyncState(resolveIngestContext(), {
            formToken: config.formToken,
            error: message
          })
        } catch {
          // 连写游标都失败时只能等下一轮。
        }
      } finally {
        running = false
      }
    })()
  }

  const bootTimer = setTimeout(run, STARTUP_DELAY_MS)
  const intervalTimer = setInterval(run, INTERVAL_MS)
  // 不要因为这些定时器让进程无法退出。
  bootTimer.unref?.()
  intervalTimer.unref?.()
  nitroApp.hooks.hook('close', () => {
    clearTimeout(bootTimer)
    clearInterval(intervalTimer)
  })
})
