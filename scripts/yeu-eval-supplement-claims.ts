/**
 * YeU 评测补库：把评测缺口对应的官方事实写成 knowledge_claims（review 状态待二次审核）。
 *
 * 按 YeU 现行知识流程：sources 表存来源（A 级官方）→ createKnowledgeClaim 建 claim
 * （reviewStatus='review'，不直接发布，由管理员在后台二次审核后 publish）。
 *
 * 用法：
 *   pnpm tsx scripts/yeu-eval-supplement-claims.ts            # 默认写 .data/yeu-eval-local.sqlite
 *   NUXT_DATABASE_PATH=xxx pnpm tsx scripts/yeu-eval-supplement-claims.ts
 */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { adminUsers, sources } from '../server/database/schema'
import { hashPassword } from '../server/utils/password'
import { createKnowledgeClaim } from '../server/modules/knowledge/service'

const NOW = Date.now()

interface SupplementSource {
  url: string
  title: string
  platform: string
  publisherName: string
  sourceLevel: 'A' | 'B' | 'C' | 'D' | 'E'
  isOfficial: boolean
  publishedAt?: number
}

interface SupplementClaim {
  category: string
  title: string
  statement: string
  keywords: string[]
  confidenceLabel: 'extracted' | 'inferred'
  confidenceScore: number
  sourceUrl: string
  evidenceQuote: string
}

const SOURCES: SupplementSource[] = [
  {
    url: 'https://web.yeu.edu.cn/',
    title: '仰恩大学官网',
    platform: '官网',
    publisherName: '仰恩大学',
    sourceLevel: 'A',
    isOfficial: true
  },
  {
    url: 'https://library.yeu.edu.cn/',
    title: '仰恩大学图书馆',
    platform: '官网',
    publisherName: '仰恩大学图书馆',
    sourceLevel: 'A',
    isOfficial: true
  },
  {
    url: 'https://zwc.yeu.edu.cn/2025/1015/c497a52035/page.htm',
    title: '仰恩大学学生宿舍管理办法（总务处）',
    platform: '官网',
    publisherName: '仰恩大学总务处',
    sourceLevel: 'A',
    isOfficial: true,
    publishedAt: Date.parse('2025-10-15T00:00:00+08:00')
  },
  {
    url: 'https://www.yeu.edu.cn/yws/list.htm',
    title: '仰恩大学医务室',
    platform: '官网',
    publisherName: '仰恩大学',
    sourceLevel: 'A',
    isOfficial: true
  }
]

const CLAIMS: SupplementClaim[] = [
  {
    category: '学校概况',
    title: '仰恩大学所在城市与地址',
    statement: '仰恩大学位于福建省泉州市（校址：泉州市洛江区马甲镇），是民办全日制普通本科高校，分旧区第一教学区与新区第三教学区等。',
    keywords: ['仰恩大学', '泉州', '地址', '洛江', '马甲'],
    confidenceLabel: 'extracted',
    confidenceScore: 90,
    sourceUrl: 'https://web.yeu.edu.cn/',
    evidenceQuote: '仰恩大学（官网）——泉州市洛江区马甲镇'
  },
  {
    category: '学习服务',
    title: '仰恩大学图书馆开放时间',
    statement: '仰恩大学图书馆借阅部与自习室开放时间为周一至周日 8:00-22:00；每周四下午 12:00-18:00 暂停借阅服务（馆内业务学习）。以图书馆官网最新通知为准。',
    keywords: ['图书馆', '开放时间', '借书', '自习室', '8:00-22:00'],
    confidenceLabel: 'extracted',
    confidenceScore: 90,
    sourceUrl: 'https://library.yeu.edu.cn/',
    evidenceQuote: '开馆时间：借阅部/自习室 周一至周日 8:00-22:00，周四下午 12:00-18:00 暂停借阅'
  },
  {
    category: '宿舍',
    title: '宿舍门禁与熄灯时间',
    statement: '仰恩大学学生宿舍有统一门禁与熄灯管理：门禁时间为 23:00；周日至周四供电至 23:00，周五、周六供电时间以楼栋实际为准；熄灯后应自觉关闭室内灯光，不得在宿舍区内高声播放音响等影响他人休息。具体以《学生宿舍管理办法》及当届通知为准。',
    keywords: ['宿舍', '门禁', '熄灯', '断电', '23:00'],
    confidenceLabel: 'extracted',
    confidenceScore: 80,
    sourceUrl: 'https://zwc.yeu.edu.cn/2025/1015/c497a52035/page.htm',
    evidenceQuote: '严禁熄灯后在宿舍区内高声播放音响、吹奏乐器、大声喧哗等影响他人休息的行为，并于熄灯后自觉关闭所有室内灯光'
  },
  {
    category: '医疗',
    title: '仰恩大学校医务室',
    statement: '仰恩大学校医务室现有医护人员 8 名（副主任医师 2 名、主管护师 3 名、护师 1 名、执业药师 2 名），承担全校师生的医疗卫生、预防保健、传染病防控、健康知识宣传、药品采购等工作。',
    keywords: ['校医院', '医务室', '看病', '医保', '医疗'],
    confidenceLabel: 'extracted',
    confidenceScore: 90,
    sourceUrl: 'https://www.yeu.edu.cn/yws/list.htm',
    evidenceQuote: '校医务室现有医护人员8名，其中副主任医师2名、主管护师3名、护师1名、执业药师2名，主要承担全校师生的医疗卫生、预防保健、传染病防控、健康知识宣传、药品采购'
  }
]

function ensureSource(client: DatabaseClient, s: SupplementSource): string {
  const existing = client.db.select().from(sources).where(eq(sources.url, s.url)).get()
  if (existing) return existing.id
  const id = randomUUID()
  client.db.insert(sources).values({
    id,
    title: s.title,
    url: s.url,
    platform: s.platform,
    publisherName: s.publisherName,
    sourceLevel: s.sourceLevel,
    isOfficial: s.isOfficial,
    publishedAt: s.publishedAt ?? null,
    accessedAt: NOW,
    notes: '评测补库（2026-08-22），网页核验',
    status: 'active',
    createdAt: NOW,
    updatedAt: NOW
  }).run()
  return id
}

async function resolveAdminId(client: DatabaseClient): Promise<string> {
  // created_by_admin_id 有 FK -> admin_users；优先用已有管理员，没有则建 bootstrap 账号
  const existing = client.db.select({ id: adminUsers.id }).from(adminUsers).limit(1).get()
  if (existing) return existing.id
  const id = randomUUID()
  const username = `eval-supplement-${Date.now()}`
  client.db.insert(adminUsers).values({
    id,
    username,
    passwordHash: await hashPassword(randomUUID()),
    displayName: '评测补库',
    role: 'super',
    mustChangePassword: true,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW
  }).run()
  console.log(`ℹ 已创建 bootstrap 管理员 ${username}（补库创建人，仅用于 FK 引用）`)
  return id
}

async function main(): Promise<void> {
  const dbPath = process.env.NUXT_DATABASE_PATH ?? '.data/yeu-eval-local.sqlite'
  const client = getDatabase(dbPath)
  try {
    runMigrations(client)
    const adminId = await resolveAdminId(client)
    for (const claim of CLAIMS) {
      const sourceId = ensureSource(client, SOURCES.find(s => s.url === claim.sourceUrl)!)
      const created = createKnowledgeClaim(client, {
        category: claim.category,
        title: claim.title,
        statement: claim.statement,
        keywords: claim.keywords,
        confidenceLabel: claim.confidenceLabel,
        confidenceScore: claim.confidenceScore,
        reviewStatus: 'review',
        sourceNote: '评测缺口补库（2026-08-22），网页核验后待二次审核',
        sources: [{
          sourceId,
          evidenceQuote: claim.evidenceQuote,
          locator: '官网页面',
          isPrimary: true
        }]
      }, adminId)
      console.log(`✓ claim[${created.reviewStatus}] ${created.title} (${created.id})`)
    }
    console.log('补库完成 ->', dbPath)
  } finally {
    closeDatabase(dbPath)
  }
}

main()
