import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  moderationConfigFromRuntime,
  moderateMomentRow,
  moderateOnce
} from '../server/modules/moderation/service'
import { createBusMoment, listBusMoments } from '../server/modules/transit/bus-moments'

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-moderation-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

const CONFIG: Parameters<typeof moderateOnce>[0] = {
  baseUrl: 'https://gw.test/v1',
  apiKey: 'sk-test',
  model: 'test-model',
  timeoutMs: 5_000
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 500, json: async () => body } as unknown as Response
}

function chatResponse(content: unknown): Response {
  return jsonResponse({ choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] })
}

test('moderation: 违规判定解析合法 JSON', async () => {
  const calls: Array<{ body: string }> = []
  const verdict = await moderateOnce(CONFIG, '加我微信买便宜卡', {
    fetchImpl: (async (_url: any, init: any) => {
      calls.push({ body: init.body })
      return chatResponse({ violation: true, category: 'spam', reason: '广告推销' })
    }) as typeof fetch
  })
  assert.deepEqual(verdict, { violation: true, category: 'spam', reason: '广告推销' })
  assert.match(calls[0]!.body, /"model":"test-model"/)
  assert.match(calls[0]!.body, /json_object/)
})

test('moderation: 通过判定 category 为 null', async () => {
  const verdict = await moderateOnce(CONFIG, '今天车很空', {
    fetchImpl: (async () => chatResponse({ violation: false, category: null, reason: '正常出行反馈' })) as typeof fetch
  })
  assert.deepEqual(verdict, { violation: false, category: null, reason: '正常出行反馈' })
})

test('moderation: 坏 JSON / 违规缺类别 / 非 2xx 都按未判定处理', async () => {
  const bad = await moderateOnce(CONFIG, 'x', { fetchImpl: (async () => chatResponse('不是JSON')) as typeof fetch })
  assert.equal(bad, null)
  const noCategory = await moderateOnce(CONFIG, 'x', {
    fetchImpl: (async () => chatResponse({ violation: true, reason: '没有类别' })) as typeof fetch
  })
  assert.equal(noCategory, null)
  const httpFail = await moderateOnce(CONFIG, 'x', { fetchImpl: (async () => jsonResponse({}, false)) as typeof fetch })
  assert.equal(httpFail, null)
})

test('moderation: 网关配置缺失或显式关闭时模块禁用', () => {
  assert.equal(moderationConfigFromRuntime({}), null)
  assert.equal(moderationConfigFromRuntime({ aiGatewayBaseUrl: 'https://gw.test' }), null)
  process.env.NUXT_MOMENT_MODERATION = '0'
  assert.equal(moderationConfigFromRuntime({
    aiGatewayBaseUrl: 'https://gw.test',
    aiGatewayApiKey: 'sk-x'
  }), null)
  delete process.env.NUXT_MOMENT_MODERATION
  assert.ok(moderationConfigFromRuntime({ aiGatewayBaseUrl: 'https://gw.test', aiGatewayApiKey: 'sk-x' }))
})

test('moderation: 违规撤回但记录保留，通过只记检查时间', async () => {
  const { client, cleanup } = createFixture()
  try {
    const now = Date.now()
    client.sqlite.prepare(`
      INSERT INTO bus_moments (id, bus_name, body, status, created_at, updated_at)
      VALUES ('ev-bad', '3', '加我微信买便宜卡', 'approved', ?, ?)
    `).run(now, now)
    client.sqlite.prepare(`
      INSERT INTO bus_moments (id, bus_name, body, status, created_at, updated_at)
      VALUES ('ev-ok', '3', '车很空', 'approved', ?, ?)
    `).run(now, now)

    const withdrawn = await moderateMomentRow(client, 'bus', 'ev-bad', '加我微信买便宜卡', CONFIG, {
      fetchImpl: (async () => chatResponse({ violation: true, category: 'spam', reason: '广告' })) as typeof fetch
    })
    assert.equal(withdrawn, true)
    const bad = client.sqlite.prepare('SELECT status, ai_category, moderated_by, moderation_reason FROM bus_moments WHERE id = ?')
      .get('ev-bad') as any
    assert.equal(bad.status, 'rejected')
    assert.equal(bad.ai_category, 'spam')
    assert.equal(bad.moderated_by, 'ai')
    assert.match(bad.moderation_reason, /AI 巡检/)

    const passed = await moderateMomentRow(client, 'bus', 'ev-ok', '车很空', CONFIG, {
      fetchImpl: (async () => chatResponse({ violation: false, category: null, reason: null })) as typeof fetch
    })
    assert.equal(passed, false)
    const ok = client.sqlite.prepare('SELECT status, ai_checked_at, ai_category FROM bus_moments WHERE id = ?').get('ev-ok') as any
    assert.equal(ok.status, 'approved')
    assert.ok(ok.ai_checked_at)
    assert.equal(ok.ai_category, null)
  } finally {
    cleanup()
  }
})

test('moderation: 地点留言违规同样撤回', async () => {
  const { client, cleanup } = createFixture()
  try {
    const now = Date.now()
    client.sqlite.prepare(`
      INSERT INTO place_moments (id, place_id, kind, body, status, created_at)
      VALUES ('pm-bad', 'place-x', 'comment', 'call 13800138000', 'approved', ?)
    `).run(now)
    const withdrawn = await moderateMomentRow(client, 'place', 'pm-bad', 'call 13800138000', CONFIG, {
      fetchImpl: (async () => chatResponse({ violation: true, category: 'privacy', reason: '泄露手机号' })) as typeof fetch
    })
    assert.equal(withdrawn, true)
    const row = client.sqlite.prepare("SELECT status FROM place_moments WHERE id = 'pm-bad'").get() as any
    assert.equal(row.status, 'rejected')
  } finally {
    cleanup()
  }
})

test('moderation: 先审后放——pending 经通过转 approved、违规转 rejected、失败直发 approved', async () => {
  const { client, cleanup } = createFixture()
  try {
    const now = Date.now()
    for (const [id, body] of [['ev-pass', '正常留言'], ['ev-bad', '加微信卖卡'], ['ev-fail', '车坏了']] as const) {
      client.sqlite.prepare(`
        INSERT INTO bus_moments (id, bus_name, body, status, created_at, updated_at)
        VALUES (?, '8', ?, 'pending', ?, ?)
      `).run(id, body, now, now)
    }
    const okFetch = (async () => chatResponse({ violation: false, category: null, reason: null })) as typeof fetch
    const badFetch = (async () => chatResponse({ violation: true, category: 'spam', reason: '广告' })) as typeof fetch
    const deadFetch = (async () => jsonResponse({}, false)) as typeof fetch

    assert.equal(await moderateMomentRow(client, 'bus', 'ev-pass', '正常留言', CONFIG, { fetchImpl: okFetch }), false)
    assert.equal(await moderateMomentRow(client, 'bus', 'ev-bad', '加微信卖卡', CONFIG, { fetchImpl: badFetch }), true)
    assert.equal(await moderateMomentRow(client, 'bus', 'ev-fail', '车坏了', CONFIG, { fetchImpl: deadFetch }), false)

    const rows = client.sqlite.prepare("SELECT id, status, ai_checked_at IS NOT NULL AS checked FROM bus_moments WHERE bus_name = '8' ORDER BY id").all() as Array<{ id: string, status: string, checked: number }>
    assert.deepEqual(rows, [
      { id: 'ev-bad', status: 'rejected', checked: 1 },
      { id: 'ev-fail', status: 'approved', checked: 0 },
      { id: 'ev-pass', status: 'approved', checked: 1 }
    ])
  } finally {
    cleanup()
  }
})

test('moderation: 打卡也先审后放——带文字送判定，空文本直放', async () => {
  const { client, cleanup } = createFixture()
  try {
    const now = Date.now()
    client.sqlite.prepare(`
      INSERT INTO place_moments (id, place_id, kind, body, status, created_at)
      VALUES ('ck-text', 'place-y', 'checkin', '今天来的，顺便打广告加微信xxx', 'pending', ?)
    `).run(now)
    client.sqlite.prepare(`
      INSERT INTO place_moments (id, place_id, kind, body, status, created_at)
      VALUES ('ck-empty', 'place-y', 'checkin', '', 'pending', ?)
    `).run(now)

    const flagged = await moderateMomentRow(client, 'place', 'ck-text', '今天来的，顺便打广告加微信xxx', CONFIG, {
      fetchImpl: (async () => chatResponse({ violation: true, category: 'spam', reason: '广告' })) as typeof fetch
    })
    assert.equal(flagged, true)
    const empty = await moderateMomentRow(client, 'place', 'ck-empty', '', CONFIG, {
      fetchImpl: (async () => { throw new Error('不应该调用 LLM') }) as typeof fetch
    })
    assert.equal(empty, false)

    const rows = client.sqlite.prepare("SELECT id, status FROM place_moments WHERE place_id = 'place-y' ORDER BY id").all() as Array<{ id: string, status: string }>
    assert.deepEqual(rows, [
      { id: 'ck-empty', status: 'approved' },
      { id: 'ck-text', status: 'rejected' }
    ])
  } finally {
    cleanup()
  }
})

test('moderation: 含 U+FFFD 替换符的编码错乱内容被拒绝', () => {
  const { client, cleanup } = createFixture()
  try {
    assert.throws(
      () => createBusMoment(client, { busName: '3', routeName: '', body: '这趟车师傅�开得很稳，全程不颠' }, { anonymousKey: 'anon-1' }),
      (error: { data?: { code?: string } }) => error.data?.code === 'BUS_MOMENT_ENCODING'
    )
    assert.equal(listBusMoments(client, '3').moments.length, 0)
  } finally {
    cleanup()
  }
})
