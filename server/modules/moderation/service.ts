/**
 * 留言 AI 巡检：校车留言（bus_moments）与地点留言（place_moments）提交后
 * 异步送 LLM 判违规，违规即撤回（status='rejected'）但记录保留在后台。
 *
 * 设计边界：
 * - 异步 fire-and-forget：留言先短暂可见后被撤（秒级窗口），不阻塞提交；
 * - LLM 不可用/未配置 = 不判定（ai_checked_at 留 NULL，后台可见「未巡检」），
 *   宁漏判不误杀；解析失败同此；
 * - 网关配置复用 assistant 的 NUXT_AI_GATEWAY_*，NUXT_MOMENT_MODERATION='0'
 *   可显式关闭。
 */
import { desc, eq, sql } from 'drizzle-orm'
import { busMoments, placeMoments, users } from '../../database/schema'
import type { DatabaseClient } from '../../database/client'

export type MomentKind = 'bus' | 'place'

export interface ModerationConfig {
  baseUrl: string
  apiKey: string
  model: string
  timeoutMs: number
}

export interface ModerationVerdict {
  violation: boolean
  category: string | null
  reason: string | null
}

const MODERATION_SYSTEM_PROMPT = `你是校园社区留言板的审核员。判断这条学生留言是否违规。
违规类别（category 只能取其一，违规时必填）：
- abuse 辱骂人身攻击
- porn 色情低俗
- spam 广告推销刷屏
- political 政治敏感
- privacy 泄露他人隐私（手机号、学号、宿舍门牌、真实姓名等）
- illegal 其他违法内容
不违规时 violation=false、category=null。reason 用一句话中文说明（≤50 字），违规说为什么违规，不违规说为什么可以放行。
只输出 JSON：{"violation":boolean,"category":string|null,"reason":string|null}`

export function moderationConfigFromRuntime(runtime: {
  aiGatewayBaseUrl?: string
  aiGatewayApiKey?: string
  aiGatewayModel?: string
  aiGatewayTimeoutMs?: number
}): ModerationConfig | null {
  // 进程环境变量显式关闭（NUXT_MOMENT_MODERATION='0'）
  if (process.env.NUXT_MOMENT_MODERATION === '0') return null
  const baseUrl = runtime.aiGatewayBaseUrl?.trim()
  const apiKey = runtime.aiGatewayApiKey?.trim()
  if (!baseUrl || !apiKey) return null
  return {
    baseUrl,
    apiKey,
    model: runtime.aiGatewayModel?.trim() || 'gpt-5.4',
    timeoutMs: Math.max(5_000, runtime.aiGatewayTimeoutMs ?? 20_000)
  }
}

/** 调一次网关要 JSON 判定。任何失败返回 null（= 未判定）。 */
export async function moderateOnce(
  config: ModerationConfig,
  body: string,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<ModerationVerdict | null> {
  const doFetch = options.fetchImpl ?? fetch
  // 与 assistant 同一网关契约：baseUrl 不含 /v1（如 http://127.0.0.1:18080），
  // 由这里补 /v1；调用方若直接给了带 /v1 的端点也不重复追加。
  const base = config.baseUrl.replace(/\/+$/, '')
  const url = `${base}${base.endsWith('/v1') ? '' : '/v1'}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({
        model: config.model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: MODERATION_SYSTEM_PROMPT },
          { role: 'user', content: body.slice(0, 600) }
        ]
      }),
      signal: controller.signal
    })
    if (!response.ok) return null
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = payload.choices?.[0]?.message?.content ?? ''
    const parsed = JSON.parse(content) as { violation?: unknown, category?: unknown, reason?: unknown }
    if (typeof parsed.violation !== 'boolean') return null
    if (!parsed.violation) return { violation: false, category: null, reason: typeof parsed.reason === 'string' ? parsed.reason : null }
    const category = typeof parsed.category === 'string' ? parsed.category : null
    if (!category) return null
    return {
      violation: true,
      category,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 200) : null
    }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 巡检一条留言并按结果落库：违规 → 撤回（status='rejected'，moderated_by='ai'），
 * 通过 → 只记 ai_checked_at。任何失败静默（留 NULL = 未巡检）。
 * 返回是否发生了撤回（调用方一般不关心，主要用于测试）。
 */
export async function moderateMomentRow(
  client: DatabaseClient,
  kind: MomentKind,
  id: string,
  body: string,
  config: ModerationConfig,
  options: { fetchImpl?: typeof fetch } = {}
): Promise<boolean> {
  const verdict = await moderateOnce(config, body, options).catch(() => null)
  const now = Date.now()
  if (!verdict) {
    // 巡检失败（网关挂/超时/解析失败）：不卡住留言板，直接放出；
    // ai_checked_at 留 NULL，后台能区分「未判定直发」与「AI 通过」。
    if (kind === 'bus') {
      client.db.update(busMoments)
        .set({ status: 'approved', updatedAt: now })
        .where(eq(busMoments.id, id))
        .run()
    } else {
      client.db.update(placeMoments)
        .set({ status: 'approved' })
        .where(eq(placeMoments.id, id))
        .run()
    }
    return false
  }
  if (!verdict.violation) {
    // 先审后放：通过才放出（pending -> approved）
    if (kind === 'bus') {
      client.db.update(busMoments)
        .set({ status: 'approved', aiCheckedAt: now, aiCategory: null, aiReason: verdict.reason, updatedAt: now })
        .where(eq(busMoments.id, id))
        .run()
    } else {
      client.db.update(placeMoments)
        .set({ status: 'approved', aiCheckedAt: now, aiCategory: null, aiReason: verdict.reason })
        .where(eq(placeMoments.id, id))
        .run()
    }
    return false
  }
  if (kind === 'bus') {
    client.db.update(busMoments)
      .set({
        status: 'rejected',
        aiCheckedAt: now,
        aiCategory: verdict.category,
        aiReason: verdict.reason,
        moderatedBy: 'ai',
        moderationReason: `AI 巡检：${verdict.category}${verdict.reason ? `（${verdict.reason}）` : ''}`,
        updatedAt: now
      })
      .where(eq(busMoments.id, id))
      .run()
  } else {
    client.db.update(placeMoments)
      .set({
        status: 'rejected',
        aiCheckedAt: now,
        aiCategory: verdict.category,
        aiReason: verdict.reason,
        moderatedBy: 'ai',
        moderationReason: `AI 巡检：${verdict.category}${verdict.reason ? `（${verdict.reason}）` : ''}`
      })
      .where(eq(placeMoments.id, id))
      .run()
  }
  return true
}

// ---------- 后台治理 ----------

export interface AdminMomentView {
  id: string
  kind: MomentKind
  /** 校车留言为车号；地点留言为 placeId。 */
  target: string
  /** 校车留言的发帖方向（仅 bus 有）。 */
  routeName: string | null
  body: string
  displayName: string
  ip: string | null
  status: 'pending' | 'approved' | 'rejected'
  aiCheckedAt: string | null
  aiCategory: string | null
  aiReason: string | null
  moderatedBy: string | null
  moderationReason: string | null
  createdAt: string
}

export interface AdminMomentsPayload {
  kind: MomentKind
  items: AdminMomentView[]
  total: number
  page: number
  pageSize: number
}

function displayNameOf(userId: string | null, nickname: string | null): string {
  if (nickname && nickname.trim()) return nickname.trim().slice(0, 12)
  if (userId) return '同学'
  return '访客'
}

export function adminListMoments(
  client: DatabaseClient,
  options: { kind: MomentKind, status?: 'all' | 'pending' | 'approved' | 'rejected', page?: number, pageSize?: number }
): AdminMomentsPayload {
  const kind = options.kind
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20))
  const offset = (page - 1) * pageSize

  if (kind === 'bus') {
    const conditions = options.status && options.status !== 'all'
      ? eq(busMoments.status, options.status)
      : undefined
    const rows = client.db
      .select({
        id: busMoments.id,
        busName: busMoments.busName,
        routeName: busMoments.routeName,
        body: busMoments.body,
        ip: busMoments.ip,
        status: busMoments.status,
        aiCheckedAt: busMoments.aiCheckedAt,
        aiCategory: busMoments.aiCategory,
        aiReason: busMoments.aiReason,
        moderatedBy: busMoments.moderatedBy,
        moderationReason: busMoments.moderationReason,
        createdAt: busMoments.createdAt,
        userId: busMoments.userId,
        nickname: users.displayName
      })
      .from(busMoments)
      .leftJoin(users, eq(busMoments.userId, users.id))
      .where(conditions)
      .orderBy(desc(busMoments.createdAt))
      .limit(pageSize)
      .offset(offset)
      .all()
    const total = client.db
      .select({ count: sql<number>`count(*)` })
      .from(busMoments)
      .where(conditions)
      .get()?.count ?? 0
    return {
      kind,
      total,
      page,
      pageSize,
      items: rows.map(row => ({
        id: row.id,
        kind: 'bus' as const,
        target: row.busName,
        routeName: row.routeName,
        body: row.body,
        displayName: displayNameOf(row.userId, row.nickname),
        ip: row.ip,
        status: row.status,
        aiCheckedAt: row.aiCheckedAt === null ? null : new Date(row.aiCheckedAt).toISOString(),
        aiCategory: row.aiCategory,
        aiReason: row.aiReason,
        moderatedBy: row.moderatedBy,
        moderationReason: row.moderationReason,
        createdAt: new Date(row.createdAt ?? Date.now()).toISOString()
      }))
    }
  }

  const conditions = options.status && options.status !== 'all'
    ? eq(placeMoments.status, options.status)
    : undefined
  const rows = client.db
    .select({
      id: placeMoments.id,
      placeId: placeMoments.placeId,
      body: placeMoments.body,
      ip: placeMoments.ip,
      status: placeMoments.status,
      aiCheckedAt: placeMoments.aiCheckedAt,
      aiCategory: placeMoments.aiCategory,
      aiReason: placeMoments.aiReason,
      moderatedBy: placeMoments.moderatedBy,
      moderationReason: placeMoments.moderationReason,
      createdAt: placeMoments.createdAt,
      userId: placeMoments.userId,
      nickname: users.displayName
    })
    .from(placeMoments)
    .leftJoin(users, eq(placeMoments.userId, users.id))
    .where(conditions)
    .orderBy(desc(placeMoments.createdAt))
    .limit(pageSize)
    .offset(offset)
    .all()
  const total = client.db
    .select({ count: sql<number>`count(*)` })
    .from(placeMoments)
    .where(conditions)
    .get()?.count ?? 0
  return {
    kind,
    total,
    page,
    pageSize,
    items: rows.map(row => ({
      id: row.id,
      kind: 'place' as const,
      target: row.placeId,
      routeName: null,
      body: row.body,
      displayName: displayNameOf(row.userId, row.nickname),
      ip: row.ip,
      status: row.status,
      aiCheckedAt: row.aiCheckedAt === null ? null : new Date(row.aiCheckedAt).toISOString(),
      aiCategory: row.aiCategory,
      aiReason: row.aiReason,
      moderatedBy: row.moderatedBy,
      moderationReason: row.moderationReason,
      createdAt: new Date(row.createdAt ?? Date.now()).toISOString()
    }))
  }
}

export function adminModerateMoment(
  client: DatabaseClient,
  input: { kind: MomentKind, id: string, action: 'withdraw' | 'restore', reason?: string, adminId: string }
): AdminMomentView | null {
  const now = Date.now()
  const status = input.action === 'withdraw' ? 'rejected' as const : 'approved' as const
  const patch = {
    status,
    moderatedBy: input.adminId,
    moderationReason: input.reason?.trim().slice(0, 200) || (input.action === 'withdraw' ? '管理员撤回' : '管理员恢复')
  }
  if (input.kind === 'bus') {
    client.db.update(busMoments)
      .set({ ...patch, updatedAt: now })
      .where(eq(busMoments.id, input.id))
      .run()
  } else {
    client.db.update(placeMoments)
      .set(patch)
      .where(eq(placeMoments.id, input.id))
      .run()
  }
  const list = adminListMoments(client, { kind: input.kind, status: 'all', page: 1, pageSize: 100 })
  return list.items.find(item => item.id === input.id) ?? null
}

export function adminDeleteMoment(client: DatabaseClient, kind: MomentKind, id: string): boolean {
  if (kind === 'bus') {
    return client.db.delete(busMoments).where(eq(busMoments.id, id)).run().changes > 0
  }
  return client.db.delete(placeMoments).where(eq(placeMoments.id, id)).run().changes > 0
}
