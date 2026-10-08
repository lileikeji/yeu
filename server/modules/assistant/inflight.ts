/**
 * 在途请求合并（same-key coalescing）。
 *
 * 场景：开学季同一句话会被很多学生同时问到（"国奖多少"），而每个请求都要问一次网关
 * 做意图分类 / 比赛归类 / 查询改写。网关侧有两条硬约束（见 [[yeu-ai-gateway-constraints]]）：
 *   - 进程内并发上限 `activeGatewayCalls >= 2` → 超出直接抛 AI_BUSY
 *   - 每分钟请求数配额 → 429 + retry-after=24
 * 结果是并发时**后来者的增强调用被静默丢掉**（调用方 catch 成 null → 退回保守行为），
 * 用户看到的是"比赛少算了分""意图没切对"，而不是任何报错。
 *
 * 合并的做法：同一个 key 在途时，后来者直接复用第一个请求的 Promise，不再各发一次。
 * 这既省了网关配额，也把"被 AI_BUSY 丢掉"变成"拿到同一份结果"。
 *
 * 注意两点：
 *  - 只合并**在途**的，不缓存结果：失败会在 finally 里立刻移除，不会被后来者继承；
 *    真正的结果缓存由各调用点自己的缓存负责（如比赛归类按赛事名缓存）。
 *  - key 必须包含足以区分结果的输入（提问文本 + 影响结果的配置），否则会把 A 的答案
 *    发给问 B 的人。
 */

const inflight = new Map<string, Promise<unknown>>()

/** 仅供测试/诊断：当前在途的 key 数量。 */
export function inflightCount(): number {
  return inflight.size
}

/** 仅供测试：清空在途表（不会取消底层请求）。 */
export function clearInflightForTests(): void {
  inflight.clear()
}

/**
 * 同一个 key 在途时复用同一个 Promise。`run` 只在第一个调用者身上执行一次。
 * 结果与异常都原样透传给所有调用者，且在 Promise 落定后立即从表里移除。
 */
export function coalesceInFlight<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const tracked = run().finally(() => {
    // 只删自己：若期间已被清理过（或换了新的在途项），不要误删别人的。
    if (inflight.get(key) === tracked) inflight.delete(key)
  })
  inflight.set(key, tracked)
  return tracked
}
