import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { initializeAdmin } from '../server/database/admin-bootstrap'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { createContent } from '../server/modules/content/service'
import { publishPlace } from '../server/modules/places/service'
import { seedProcedures } from './seed-procedures'
import { seedPublicCatalog } from './seed-public-catalog'
import {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAME,
  E2E_DATABASE_PATH,
  E2E_DRAFT_CONTENT,
  E2E_PLACE_SLUG
} from './e2e-fixtures'

export {
  E2E_ADMIN_PASSWORD,
  E2E_ADMIN_USERNAME,
  E2E_DATABASE_PATH,
  E2E_DRAFT_CONTENT,
  E2E_PLACE_SLUG
} from './e2e-fixtures'

async function seedAdmin() {
  const client = getDatabase(E2E_DATABASE_PATH)
  try {
    return await initializeAdmin(client, {
      username: E2E_ADMIN_USERNAME,
      password: E2E_ADMIN_PASSWORD
    })
  } finally {
    closeDatabase(E2E_DATABASE_PATH)
  }
}

function seedDraftContent() {
  const client = getDatabase(E2E_DATABASE_PATH)
  const now = Date.parse('2026-07-15T00:00:00+08:00')
  try {
    const source = client.sqlite.prepare(`
      SELECT id
      FROM sources
      WHERE status = 'active' AND is_official = 1 AND source_level IN ('A', 'B')
      ORDER BY source_level, url
      LIMIT 1
    `).get() as { id: string } | undefined
    if (!source) throw new Error('E2E 内容草稿缺少可发布的官方来源')

    return E2E_DRAFT_CONTENT.map(fixture => createContent(client, {
      kind: 'notice',
      slug: fixture.slug,
      title: fixture.title,
      summary: '等待管理员通过浏览器完成编辑、发布和下线。',
      body: '此记录仅存在于隔离 E2E 数据库，不得同步到生产环境。',
      category: 'e2e',
      audience: 'all',
      metadata: {
        validFrom: '2026-07-01T00:00:00+08:00',
        validUntil: '2026-12-31T23:59:59+08:00'
      },
      isFeatured: false,
      lastVerifiedAt: new Date(now).toISOString(),
      sourceIds: [source.id]
    }))
  } finally {
    closeDatabase(E2E_DATABASE_PATH)
  }
}

function seedPublishedPlace() {
  const client = getDatabase(E2E_DATABASE_PATH)
  const now = Date.parse('2026-07-15T00:00:00+08:00')
  try {
    const source = client.sqlite.prepare(`
      SELECT id, url
      FROM sources
      WHERE status = 'active' AND is_official = 1 AND source_level IN ('A', 'B')
      ORDER BY source_level, url
      LIMIT 1
    `).get() as { id: string, url: string } | undefined
    if (!source) throw new Error('E2E 地点缺少可发布的官方来源')

    client.sqlite.prepare(`
      INSERT INTO places (
        id, slug, name, summary, body, scope, type, category, address,
        campus_area, floor, room,
        longitude, latitude, coordinate_system, coordinate_verification,
        coordinate_verified_at, coordinate_point_role,
        opening_hours, website, external_map_url,
        is_official, is_featured, status, last_verified_at, created_at, updated_at
      ) VALUES (
        'e2e-published-place', ?, 'E2E 核验服务点',
        '仅用于自动化浏览器验收的受控已发布地点。',
        '【到这里前先确认】\n- 核对地点名称和入口标识。\n- 自动化数据不得写入生产库。',
        'campus', 'service', 'service', '仰恩大学自动化验收区域',
        '第一教学区', '一楼', 'E2E',
        118.604, 25.107, 'WGS84', 'verified', ?, 'main-entrance',
        '自动化验收期间可用', ?,
        'https://uri.amap.com/marker?position=118.604,25.107&name=E2E%E6%A0%B8%E9%AA%8C%E6%9C%8D%E5%8A%A1%E7%82%B9',
        1, 0, 'draft', ?, ?, ?
      )
    `).run(E2E_PLACE_SLUG, now, source.url, now, now, now)
    client.sqlite.prepare(`
      INSERT INTO place_sources (place_id, source_id, is_primary, created_at)
      VALUES ('e2e-published-place', ?, 1, ?)
    `).run(source.id, now)

    const published = publishPlace(client, 'e2e-published-place')
    if (published.status !== 'published') throw new Error('E2E 地点发布失败')
    return published
  } finally {
    closeDatabase(E2E_DATABASE_PATH)
  }
}

function removePreviousDatabase() {
  const expectedDirectory = resolve(process.cwd(), '.data')
  if (dirname(E2E_DATABASE_PATH) !== expectedDirectory) {
    throw new Error(`拒绝清理预期目录之外的 E2E 数据库：${E2E_DATABASE_PATH}`)
  }
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${E2E_DATABASE_PATH}${suffix}`, { force: true })
}

export async function prepareE2eDatabase() {
  mkdirSync(dirname(E2E_DATABASE_PATH), { recursive: true })
  removePreviousDatabase()

  const client = getDatabase(E2E_DATABASE_PATH)
  try {
    runMigrations(client)
  } finally {
    closeDatabase(E2E_DATABASE_PATH)
  }

  const catalog = seedPublicCatalog({
    apply: true,
    databasePath: E2E_DATABASE_PATH,
    now: Date.parse('2026-07-15T00:00:00+08:00')
  })
  if (!catalog.applied || catalog.conflicts > 0) {
    throw new Error(`E2E 公开目录准备失败：${JSON.stringify(catalog.conflictDetails)}`)
  }
  const procedures = seedProcedures({
    apply: true,
    databasePath: E2E_DATABASE_PATH,
    now: Date.parse('2026-07-15T00:00:00+08:00')
  })
  if (!procedures.applied || procedures.procedureCount === 0) {
    throw new Error('E2E 办事流程准备失败')
  }
  const admin = await seedAdmin()
  const draftContent = seedDraftContent()
  const place = seedPublishedPlace()

  return {
    databasePath: E2E_DATABASE_PATH,
    sources: catalog.sourceCount,
    contents: catalog.contentCount,
    procedures: procedures.procedureCount,
    steps: procedures.stepCount,
    publishedPlace: place.slug,
    admin,
    draftContent: draftContent.map(item => item.slug)
  }
}

const result = await prepareE2eDatabase()
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)

// release-version.spec 校验运行版本与制品一致：nuxt build 不产出 release.json
// （只有部署流程的 release-tools create 会写），e2e 前补一份 e2e 专用 manifest。
if (existsSync(resolve('.output/server/index.mjs'))) {
  const { createRelease } = await import('../scripts/release-tools.mjs')
  const commit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  const release = `${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-e2e`
  createRelease(process.cwd(), resolve('.output'), release, commit)
  process.stdout.write(`release.json ready: ${release}\n`)
} else {
  throw new Error('.output 缺失：先运行 pnpm build 再跑 e2e')
}
