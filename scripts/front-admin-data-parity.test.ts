import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import {
  archiveContent,
  createContent,
  getAdminContent,
  getPublicContent,
  listContent,
  publishContent,
  updateContent
} from '../server/modules/content/service'
import {
  archivePlace,
  getAdminPlace,
  getPublicPlace,
  listPublicAmapOwnerDraftPlaces,
  listPlaces,
  publishPlace,
  updatePlace
} from '../server/modules/places/service'
import {
  archiveProcedure,
  createProcedure,
  getAdminProcedure,
  getPublicProcedure,
  listProcedures,
  publishProcedure,
  updateProcedure
} from '../server/modules/procedures/service'
import { createSource } from '../server/modules/verification/service'
import { searchPublishedContent } from '../server/modules/search/service'
import {
  createContentSchema,
  createProcedureSchema,
  createSourceSchema,
  updateContentSchema,
  updatePlaceSchema,
  updateProcedureSchema
} from '../shared/schemas/server'

interface TestHttpError extends Error {
  statusCode?: number
  data?: { code?: string }
}

Object.defineProperty(globalThis, 'createError', {
  configurable: true,
  value: (input: { statusCode?: number, statusMessage?: string, data?: { code?: string } }) => {
    const error = new Error(input.statusMessage) as TestHttpError
    error.statusCode = input.statusCode
    error.data = input.data
    return error
  }
})

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-front-admin-parity-'))
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

function iso(offsetMs = -60_000): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

function publishedQuery() {
  return {
    page: 1,
    pageSize: 50,
    q: undefined,
    status: 'published' as const,
    kind: undefined,
    category: undefined,
    featured: undefined
  }
}

test('public frontend records and admin backend records stay aligned for maintained data', () => {
  const fixture = createFixture()
  try {
    const source = createSource(fixture.client, createSourceSchema.parse({
      title: '前后台一致性核验来源',
      url: 'https://example.edu/front-admin-parity-source',
      platform: 'official-website',
      publisherName: '仰恩大学测试来源',
      sourceLevel: 'A',
      isOfficial: true,
      accessedAt: iso(),
      status: 'active',
      notes: '用于验证前台公开数据和后台维护数据来自同一记录。'
    }))

    const content = createContent(fixture.client, createContentSchema.parse({
      kind: 'guide',
      slug: 'front-admin-parity-guide',
      title: '前后台一致性指南',
      summary: '验证前台指南和后台内容使用同一条数据库记录。',
      body: '前台展示给新生的正文，必须和后台维护的正文一致。',
      category: 'campus',
      audience: 'all',
      metadata: {
        readMinutes: 1,
        statusText: '一致性已验证',
        sections: [{
          title: '给新生看的结构化段落',
          icon: 'i-lucide-list-checks',
          items: ['后台维护的 JSON 章节应原样进入前台。']
        }]
      },
      isFeatured: true,
      lastVerifiedAt: iso(),
      sourceIds: [source.id]
    }))
    const publishedContent = publishContent(fixture.client, content.id)
    const adminContent = getAdminContent(fixture.client, content.id)
    const publicContent = getPublicContent(fixture.client, 'front-admin-parity-guide', 'guide')
    assert.equal(publicContent.id, adminContent.id)
    assert.equal(publicContent.title, adminContent.title)
    assert.equal(publicContent.summary, adminContent.summary)
    assert.equal(publicContent.body, adminContent.body)
    assert.deepEqual(publicContent.metadata, adminContent.metadata)
    assert.deepEqual(publicContent.metadata.sections, [{
      title: '给新生看的结构化段落',
      icon: 'i-lucide-list-checks',
      items: ['后台维护的 JSON 章节应原样进入前台。']
    }])
    assert.equal(publicContent.sources[0]?.id, source.id)
    assert.equal(publishedContent.status, 'published')

    const adminContentList = listContent(fixture.client, publishedQuery(), false, 'guide')
    const publicContentList = listContent(fixture.client, {
      page: 1,
      pageSize: 50,
      q: undefined,
      kind: undefined,
      category: undefined,
      featured: undefined
    }, true, 'guide')
    assert.deepEqual(
      publicContentList.items.map(item => item.id),
      adminContentList.items.map(item => item.id)
    )

    const now = Date.now() - 60_000
    const placeId = '2f66cb7e-fb61-4084-9f1e-a3cf36d67ec5'
    fixture.client.sqlite.prepare(`
      INSERT INTO places (
        id, slug, name, summary, body, scope, type, category, address,
        longitude, latitude, coordinate_system, coordinate_verification,
        coordinate_verified_at, coordinate_point_role,
        is_official, is_featured, status, last_verified_at, created_at, updated_at
      ) VALUES (?, 'front-admin-parity-place', '前后台一致性地点',
        '验证前台地点和后台地点使用同一条数据库记录。', '地点正文。',
        'campus', 'service', 'service', '仰恩大学',
        118.604, 25.107, 'WGS84', 'verified', ?, 'site-point',
        1, 1, 'draft', ?, ?, ?)
    `).run(placeId, now, now, now, now)
    fixture.client.sqlite.prepare(`
      INSERT INTO place_sources (place_id, source_id, is_primary, created_at)
      VALUES (?, ?, 1, ?)
    `).run(placeId, source.id, now)
    publishPlace(fixture.client, placeId)
    const adminPlace = getAdminPlace(fixture.client, placeId)
    const publicPlace = getPublicPlace(fixture.client, 'front-admin-parity-place')
    assert.equal(publicPlace.id, adminPlace.id)
    assert.equal(publicPlace.name, adminPlace.name)
    assert.equal(publicPlace.summary, adminPlace.summary)
    assert.equal(publicPlace.longitude, adminPlace.longitude)
    assert.equal(publicPlace.latitude, adminPlace.latitude)
    assert.equal(publicPlace.coordinateSystem, 'WGS84')
    assert.equal(publicPlace.navigationAvailable, true)

    const adminPlaces = listPlaces(fixture.client, {
      page: 1,
      pageSize: 50,
      q: undefined,
      status: 'published',
      scope: undefined,
      type: undefined,
      category: undefined,
      featured: undefined,
      coordinateVerification: undefined
    }, false)
    const publicPlaces = listPlaces(fixture.client, {
      page: 1,
      pageSize: 50,
      q: undefined,
      scope: undefined,
      type: undefined,
      category: undefined,
      featured: undefined
    }, true)
    assert.deepEqual(publicPlaces.items.map(item => item.id), adminPlaces.items.map(item => item.id))

    const procedure = createProcedure(fixture.client, createProcedureSchema.parse({
      slug: 'front-admin-parity-procedure',
      title: '前后台一致性流程',
      summary: '验证前台流程和后台流程使用同一条数据库记录。',
      body: '流程说明正文。',
      category: 'arrival',
      audience: ['undergraduate', 'transfer'],
      method: 'mixed',
      informationState: 'partial',
      statusText: '一致性已验证',
      processingTime: '约 10 分钟',
      deadlineText: '以当年通知为准',
      validUntil: iso(86_400_000),
      lastVerifiedAt: iso(),
      sourceIds: [source.id],
      placeIds: [placeId],
      steps: [{
        title: '查看通知',
        description: '先查看官方通知。',
        audience: ['undergraduate', 'transfer'],
        informationState: 'confirmed',
        timeText: null,
        placeId,
        departmentId: null,
        actionUrl: null
      }],
      materials: [{
        name: '身份证件',
        description: '按当年通知准备。',
        audience: ['undergraduate', 'transfer'],
        isRequired: true,
        informationState: 'partial',
        placeId: null,
        departmentId: null
      }]
    }))
    publishProcedure(fixture.client, procedure.id)
    const adminProcedure = getAdminProcedure(fixture.client, procedure.id)
    const publicProcedure = getPublicProcedure(fixture.client, 'front-admin-parity-procedure')
    assert.equal(publicProcedure.id, adminProcedure.id)
    assert.equal(publicProcedure.title, adminProcedure.title)
    assert.equal(publicProcedure.summary, adminProcedure.summary)
    assert.equal(publicProcedure.body, adminProcedure.body)
    assert.equal(publicProcedure.steps[0]?.title, adminProcedure.steps[0]?.title)
    assert.equal(publicProcedure.materials[0]?.name, adminProcedure.materials[0]?.name)
    assert.equal(publicProcedure.places[0]?.id, placeId)

    const adminProcedures = listProcedures(fixture.client, {
      page: 1,
      pageSize: 50,
      q: undefined,
      status: 'published',
      category: undefined,
      audience: undefined
    }, false)
    const publicProcedures = listProcedures(fixture.client, {
      page: 1,
      pageSize: 50,
      q: undefined,
      category: undefined,
      audience: undefined
    }, true)
    assert.deepEqual(publicProcedures.items.map(item => item.id), adminProcedures.items.map(item => item.id))
  } finally {
    fixture.cleanup()
  }
})

test('admin edits propagate to public detail and search, and archived content disappears', () => {
  const fixture = createFixture()
  try {
    const source = createSource(fixture.client, createSourceSchema.parse({
      title: '后台编辑同步核验来源',
      url: 'https://example.edu/admin-edit-sync-source',
      platform: 'official-website',
      publisherName: '仰恩大学测试来源',
      sourceLevel: 'A',
      isOfficial: true,
      accessedAt: iso(),
      status: 'active',
      notes: '用于验证后台编辑后前台详情和搜索同步。'
    }))

    const created = createContent(fixture.client, createContentSchema.parse({
      kind: 'guide',
      slug: 'admin-edit-sync-guide',
      title: '后台编辑同步指南',
      summary: '初始摘要用于验证发布后的公开展示。',
      body: '初始正文用于验证后台编辑前的公开详情。',
      category: 'campus',
      audience: 'all',
      metadata: {
        readMinutes: 1,
        sections: [{
          title: '初始章节',
          icon: 'i-lucide-list-checks',
          items: ['初始搜索词']
        }]
      },
      isFeatured: false,
      lastVerifiedAt: iso(),
      sourceIds: [source.id]
    }))
    publishContent(fixture.client, created.id)

    assert.equal(
      searchPublishedContent(fixture.client, '初始搜索词', 10).items[0]?.slug,
      'admin-edit-sync-guide'
    )

    const updated = updateContent(fixture.client, created.id, updateContentSchema.parse({
      title: '后台编辑后公开同步指南',
      summary: '后台编辑后的摘要必须在公开详情和搜索结果中同步出现。',
      body: '后台编辑后的正文给新生阅读，不能继续显示旧正文。',
      metadata: {
        statusText: '后台编辑后已同步',
        sections: [{
          title: '新生可见章节',
          icon: 'i-lucide-list-checks',
          items: ['编辑后唯一搜索词']
        }]
      }
    }))
    const publicContent = getPublicContent(fixture.client, 'admin-edit-sync-guide', 'guide')
    assert.equal(publicContent.id, updated.id)
    assert.equal(publicContent.title, '后台编辑后公开同步指南')
    assert.equal(publicContent.summary, '后台编辑后的摘要必须在公开详情和搜索结果中同步出现。')
    assert.equal(publicContent.body, '后台编辑后的正文给新生阅读，不能继续显示旧正文。')
    assert.deepEqual(publicContent.metadata.sections, [{
      title: '新生可见章节',
      icon: 'i-lucide-list-checks',
      items: ['编辑后唯一搜索词']
    }])

    const searchResult = searchPublishedContent(fixture.client, '编辑后唯一搜索词', 10)
    assert.equal(searchResult.items.length, 1)
    assert.equal(searchResult.items[0]?.slug, 'admin-edit-sync-guide')
    assert.equal(searchResult.items[0]?.title, '后台编辑后公开同步指南')
    assert.equal(searchPublishedContent(fixture.client, '初始搜索词', 10).items.length, 0)

    archiveContent(fixture.client, created.id)
    assert.throws(() => getPublicContent(fixture.client, 'admin-edit-sync-guide', 'guide'), (error: unknown) => {
      const value = error as TestHttpError
      return value.statusCode === 404 && value.data?.code === 'CONTENT_NOT_PUBLIC'
    })
    assert.equal(searchPublishedContent(fixture.client, '编辑后唯一搜索词', 10).items.length, 0)
  } finally {
    fixture.cleanup()
  }
})

test('admin place edits propagate to public detail and search, and archived places disappear', () => {
  const fixture = createFixture()
  try {
    const source = createSource(fixture.client, createSourceSchema.parse({
      title: '后台地点编辑同步核验来源',
      url: 'https://example.edu/admin-place-edit-sync-source',
      platform: 'official-website',
      publisherName: '仰恩大学测试来源',
      sourceLevel: 'A',
      isOfficial: true,
      accessedAt: iso(),
      status: 'active',
      notes: '用于验证后台地点编辑后前台详情和搜索同步。'
    }))
    const now = Date.now() - 60_000
    const placeId = '8c003816-4d01-4605-a2a3-b066a6714548'
    fixture.client.sqlite.prepare(`
      INSERT INTO places (
        id, slug, name, summary, body, scope, type, category, address,
        campus_area, floor, room,
        longitude, latitude, coordinate_system, coordinate_verification,
        coordinate_verified_at, coordinate_point_role,
        opening_hours, phone, website, external_map_url,
        is_official, is_featured, status, last_verified_at, created_at, updated_at
      ) VALUES (?, 'admin-place-edit-sync', '后台地点同步点',
        '初始地点摘要。', '初始地点正文。',
        'campus', 'service', 'service', '仰恩大学', '新区', null, null,
        118.604, 25.107, 'WGS84', 'verified', ?, 'site-point',
        null, null, null, null,
        1, 0, 'draft', ?, ?, ?)
    `).run(placeId, now, now, now, now)
    fixture.client.sqlite.prepare(`
      INSERT INTO place_sources (place_id, source_id, is_primary, created_at)
      VALUES (?, ?, 1, ?)
    `).run(placeId, source.id, now)

    publishPlace(fixture.client, placeId)
    assert.equal(
      searchPublishedContent(fixture.client, '后台地点同步点', 10, 'place').items[0]?.slug,
      'admin-place-edit-sync'
    )

    const updated = updatePlace(fixture.client, placeId, updatePlaceSchema.parse({
      name: '后台地点编辑后同步点',
      summary: '后台编辑后的地点摘要必须同步到公开地图、详情和搜索。',
      body: '后台编辑后的地点正文给新生阅读。',
      address: '仰恩大学新区服务点'
    }))
    const publicPlace = getPublicPlace(fixture.client, 'admin-place-edit-sync')
    assert.equal(publicPlace.id, updated.id)
    assert.equal(publicPlace.name, '后台地点编辑后同步点')
    assert.equal(publicPlace.summary, '后台编辑后的地点摘要必须同步到公开地图、详情和搜索。')
    assert.equal(publicPlace.body, '后台编辑后的地点正文给新生阅读。')
    assert.equal(publicPlace.address, '仰恩大学新区服务点')

    const searchResult = searchPublishedContent(fixture.client, '编辑后的地点摘要', 10, 'place')
    assert.equal(searchResult.items.length, 1)
    assert.equal(searchResult.items[0]?.slug, 'admin-place-edit-sync')
    assert.equal(searchResult.items[0]?.title, '后台地点编辑后同步点')
    assert.equal(searchPublishedContent(fixture.client, '初始地点摘要', 10, 'place').items.length, 0)

    archivePlace(fixture.client, placeId)
    assert.throws(() => getPublicPlace(fixture.client, 'admin-place-edit-sync'), (error: unknown) => {
      const value = error as TestHttpError
      return value.statusCode === 404
    })
    assert.equal(searchPublishedContent(fixture.client, '编辑后的地点摘要', 10, 'place').items.length, 0)
  } finally {
    fixture.cleanup()
  }
})

test('admin AMap draft edits propagate through the safe public map draft export', () => {
  const fixture = createFixture()
  try {
    const now = Date.now() - 60_000
    const placeId = '3f88c402-13c3-4a61-8f77-a61396e7a849'
    const sourceRawRef = JSON.stringify({
      importer: 'amap-workmap-draft-v1',
      file: 'amap-workmap-2026-07-13.raw.json',
      sheet: '标记位置',
      sourceRow: 49,
      locationCode: 'WIA-118.59973890906161,25.103396572681646'
    })
    fixture.client.sqlite.prepare(`
      INSERT INTO places (
        id, slug, name, summary, body, scope, type, category, address,
        campus_area, floor, room,
        longitude, latitude, coordinate_system, coordinate_verification,
        coordinate_verified_at, coordinate_point_role, source_raw_ref,
        opening_hours, phone, website, external_map_url,
        is_official, is_featured, status, last_verified_at, created_at, updated_at
      ) VALUES (?, 'amap-workmap-20260713-r049', '辽宁楼',
        '辽宁楼初始草稿摘要。', '辽宁楼初始草稿正文。',
        'campus', 'building', 'dorm', '仰恩大学新区辽宁楼',
        null, null, null,
        118.599, 25.103, 'GCJ-02', 'unverified',
        null, null, ?,
        null, null, null, null,
        0, 0, 'draft', null, ?, ?)
    `).run(placeId, sourceRawRef, now, now)

    const initial = listPublicAmapOwnerDraftPlaces(fixture.client)
    assert.equal(initial.length, 1)
    assert.equal(initial[0]?.sourceRow, 49)
    assert.equal(initial[0]?.name, '辽宁楼')
    assert.equal(initial[0]?.longitude, 118.599)
    assert.equal('sourceRawRef' in initial[0]!, false)
    assert.equal('sources' in initial[0]!, false)

    const updated = updatePlace(fixture.client, placeId, updatePlaceSchema.parse({
      name: '辽宁楼',
      summary: '辽宁楼在后台维护后的新生可读说明。',
      body: '给新生看的辽宁楼说明，不包含维护字段。',
      address: '仰恩大学新区辽宁楼',
      longitude: 118.59973890906161,
      latitude: 25.103396572681646,
      coordinateSystem: 'GCJ-02'
    }))
    assert.equal(updated.coordinateVerification, 'unverified')

    const exported = listPublicAmapOwnerDraftPlaces(fixture.client)
    assert.equal(exported.length, 1)
    assert.equal(exported[0]?.id, placeId)
    assert.equal(exported[0]?.sourceRow, 49)
    assert.equal(exported[0]?.summary, '辽宁楼在后台维护后的新生可读说明。')
    assert.equal(exported[0]?.longitude, 118.59973890906161)
    assert.equal(exported[0]?.latitude, 25.103396572681646)
    assert.equal(exported[0]?.coordinateSystem, 'GCJ-02')
    assert.equal(exported[0]?.coordinateVerification, 'unverified')
    assert.equal('sourceRawRef' in exported[0]!, false)
    assert.equal('phone' in exported[0]!, false)
    assert.equal('openingHours' in exported[0]!, false)
    assert.equal('externalMapUrl' in exported[0]!, false)
    assert.equal('body' in exported[0]!, false)
    assert.equal('slug' in exported[0]!, false)
  } finally {
    fixture.cleanup()
  }
})

test('admin procedure edits propagate to public detail and search, and archived procedures disappear', () => {
  const fixture = createFixture()
  try {
    const source = createSource(fixture.client, createSourceSchema.parse({
      title: '后台流程编辑同步核验来源',
      url: 'https://example.edu/admin-procedure-edit-sync-source',
      platform: 'official-website',
      publisherName: '仰恩大学测试来源',
      sourceLevel: 'A',
      isOfficial: true,
      accessedAt: iso(),
      status: 'active',
      notes: '用于验证后台流程编辑后前台详情和搜索同步。'
    }))

    const created = createProcedure(fixture.client, createProcedureSchema.parse({
      slug: 'admin-procedure-edit-sync',
      title: '后台流程同步',
      summary: '初始流程摘要。',
      body: '初始流程正文。',
      category: 'arrival',
      audience: ['undergraduate', 'transfer'],
      method: 'mixed',
      informationState: 'partial',
      statusText: '初始状态',
      processingTime: null,
      deadlineText: null,
      validUntil: iso(86_400_000),
      lastVerifiedAt: iso(),
      sourceIds: [source.id],
      placeIds: [],
      steps: [{
        title: '初始步骤',
        description: '初始步骤说明。',
        audience: ['undergraduate', 'transfer'],
        informationState: 'confirmed',
        timeText: null,
        placeId: null,
        departmentId: null,
        actionUrl: null
      }],
      materials: [{
        name: '初始材料',
        description: '初始材料说明。',
        audience: ['undergraduate', 'transfer'],
        isRequired: true,
        informationState: 'partial',
        placeId: null,
        departmentId: null
      }]
    }))
    publishProcedure(fixture.client, created.id)
    assert.equal(
      searchPublishedContent(fixture.client, '初始材料', 10, 'procedure').items[0]?.slug,
      'admin-procedure-edit-sync'
    )

    const updated = updateProcedure(fixture.client, created.id, updateProcedureSchema.parse({
      title: '后台流程编辑后同步',
      summary: '后台编辑后的流程摘要必须同步到公开详情和搜索。',
      body: '后台编辑后的流程正文给新生阅读。',
      statusText: '后台编辑后已同步',
      steps: [{
        title: '编辑后唯一步骤',
        description: '编辑后的步骤说明必须进入公开搜索。',
        audience: ['undergraduate', 'transfer'],
        informationState: 'confirmed',
        timeText: null,
        placeId: null,
        departmentId: null,
        actionUrl: null
      }],
      materials: [{
        name: '编辑后唯一材料',
        description: '编辑后的材料说明必须进入公开搜索。',
        audience: ['undergraduate', 'transfer'],
        isRequired: true,
        informationState: 'partial',
        placeId: null,
        departmentId: null
      }]
    }))
    const publicProcedure = getPublicProcedure(fixture.client, 'admin-procedure-edit-sync')
    assert.equal(publicProcedure.id, updated.id)
    assert.equal(publicProcedure.title, '后台流程编辑后同步')
    assert.equal(publicProcedure.summary, '后台编辑后的流程摘要必须同步到公开详情和搜索。')
    assert.equal(publicProcedure.body, '后台编辑后的流程正文给新生阅读。')
    assert.equal(publicProcedure.steps[0]?.title, '编辑后唯一步骤')
    assert.equal(publicProcedure.materials[0]?.name, '编辑后唯一材料')

    const searchResult = searchPublishedContent(fixture.client, '编辑后唯一材料', 10, 'procedure')
    assert.equal(searchResult.items.length, 1)
    assert.equal(searchResult.items[0]?.slug, 'admin-procedure-edit-sync')
    assert.equal(searchResult.items[0]?.title, '后台流程编辑后同步')
    assert.equal(searchPublishedContent(fixture.client, '初始材料', 10, 'procedure').items.length, 0)

    archiveProcedure(fixture.client, created.id)
    assert.throws(() => getPublicProcedure(fixture.client, 'admin-procedure-edit-sync'), (error: unknown) => {
      const value = error as TestHttpError
      return value.statusCode === 404
    })
    assert.equal(searchPublishedContent(fixture.client, '编辑后唯一材料', 10, 'procedure').items.length, 0)
  } finally {
    fixture.cleanup()
  }
})
