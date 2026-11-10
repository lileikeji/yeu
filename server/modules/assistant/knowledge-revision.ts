import { eq, sql } from 'drizzle-orm'
import type { DatabaseClient } from '../../database/client'
import { assistantKnowledgeState } from '../../database/schema'

/**
 * 知识修订号。
 *
 * 原来是 `let knowledgeRevision = 0`：进程内计数，重启归零、多进程各算各的。
 * 而它同时是答案缓存 key 的第三段和向量缓存的 key 段，于是重启后修订号回到 0，
 * 上一轮留在 assistant_answer_cache 表里的旧答案照样命中 —— 内容更新了，
 * 用户还是拿到旧答案（这就是「knowledge_revision 写而不读」的根因）。
 *
 * 现在落库到单行表 assistant_knowledge_state，读写都走它，跨进程/重启连续。
 * 库读不出来时退回进程内计数：库写不进去时 bump 也只记在进程内，两者是同一个数，
 * 进程内仍然单调，不会出现「重启后 key 回到 0 撞上旧行」那种事故。
 */
const STATE_ID = 'assistant'

let boundClient: DatabaseClient | null = null
/** 没有数据库可写时（脚本、测试、调用方没传 client）的进程内计数。 */
let processRevision = 0
/** 还没写进库的 bump，下次拿到 client 时补记。 */
let pendingBumps = 0

/**
 * 绑定本次请求的数据库连接。content/places/procedures 里有十几处零参 bump 调用，
 * 它们不在本批的改动范围，靠这个绑定让那些调用也能落库。
 */
export function bindAssistantKnowledgeRevisionDatabase(client: DatabaseClient | null): void {
  boundClient = client
}

function incrementRevision(client: DatabaseClient, by: number): void {
  client.db.insert(assistantKnowledgeState)
    .values({ id: STATE_ID, revision: by, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: assistantKnowledgeState.id,
      set: {
        revision: sql`${assistantKnowledgeState.revision} + ${by}`,
        updatedAt: Date.now()
      }
    })
    .run()
}

function readRevision(client: DatabaseClient): number {
  // 先把欠账补上：这一步必须在读之前，否则同一个事务里 bump 完立刻读会拿到旧值。
  const owed = pendingBumps
  if (owed > 0) {
    pendingBumps = 0
    try {
      incrementRevision(client, owed)
    } catch {
      pendingBumps += owed
      return processRevision
    }
  }
  try {
    const row = client.db
      .select({ revision: assistantKnowledgeState.revision })
      .from(assistantKnowledgeState)
      .where(eq(assistantKnowledgeState.id, STATE_ID))
      .get()
    if (row) return row.revision
    // 首次部署：建零行，保证后续 bump 走 upsert。
    client.db.insert(assistantKnowledgeState)
      .values({ id: STATE_ID, revision: 0, updatedAt: Date.now() })
      .onConflictDoNothing({ target: assistantKnowledgeState.id })
      .run()
    return 0
  } catch {
    return processRevision
  }
}

export function currentAssistantKnowledgeRevision(client?: DatabaseClient | null): number {
  const resolved = client ?? boundClient
  if (resolved) return readRevision(resolved)
  return processRevision
}

export function bumpAssistantKnowledgeRevision(client?: DatabaseClient | null): void {
  processRevision += 1
  const resolved = client ?? boundClient
  if (!resolved) {
    pendingBumps += 1
    return
  }
  try {
    incrementRevision(resolved, 1)
  } catch {
    // 库写不进去（只读副本/锁）也不能让发布流程失败：记在进程内，下次带 client 读时补记。
    pendingBumps += 1
  }
}

/** 测试与运维用：清掉进程内状态（不回滚库里的修订号）。 */
export function resetAssistantKnowledgeRevisionState(): void {
  boundClient = null
  processRevision = 0
  pendingBumps = 0
}
