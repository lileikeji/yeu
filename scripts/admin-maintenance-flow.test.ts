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
  publishContent,
  updateContent
} from '../server/modules/content/service'
import {
  archivePlace,
  createPlace,
  publishPlace,
  updatePlace
} from '../server/modules/places/service'
import {
  archiveProcedure,
  createProcedure,
  publishProcedure,
  updateProcedure
} from '../server/modules/procedures/service'
import {
  createSource,
  deleteSource,
  updateSource
} from '../server/modules/verification/service'
import {
  createContentSchema,
  createPlaceSchema,
  createProcedureSchema,
  createSourceSchema,
  updateContentSchema,
  updatePlaceSchema,
  updateProcedureSchema,
  updateSourceSchema
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
  const directory = mkdtempSync(join(tmpdir(), 'yeu-admin-maintenance-'))
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

function assertHttpError(action: () => unknown, code: string, statusCode = 422): void {
  assert.throws(action, (error: unknown) => {
    const value = error as TestHttpError
    return value.statusCode === statusCode && value.data?.code === code
  })
}

test('admin services support maintainable source, content, place and procedure workflows', () => {
  const fixture = createFixture()
  try {
    const source = createSource(fixture.client, createSourceSchema.parse({
      title: '后台维护能力核验来源',
      url: 'https://example.edu/admin-maintenance-source',
      platform: 'official-website',
      publisherName: '仰恩大学测试来源',
      sourceLevel: 'A',
      isOfficial: true,
      accessedAt: iso(),
      status: 'active',
      notes: '用于后台维护能力自动化测试。'
    }))
    assert.equal(source.status, 'active')

    const updatedSource = updateSource(fixture.client, source.id, updateSourceSchema.parse({
      title: '后台维护能力核验来源（已编辑）',
      notes: '来源可编辑。'
    }))
    assert.equal(updatedSource.title, '后台维护能力核验来源（已编辑）')

    const content = createContent(fixture.client, createContentSchema.parse({
      kind: 'guide',
      slug: 'admin-maintenance-guide',
      title: '后台维护指南',
      summary: '验证后台可新增、编辑、发布和下架内容。',
      body: '这是一条后台维护测试内容。',
      category: 'campus',
      audience: 'all',
      metadata: { readMinutes: 1 },
      isFeatured: false,
      lastVerifiedAt: iso(),
      sourceIds: [source.id]
    }))
    assert.equal(content.status, 'draft')

    const editedContent = updateContent(fixture.client, content.id, updateContentSchema.parse({
      summary: '验证后台内容编辑后仍可发布。',
      metadata: { statusText: '后台维护已验证' }
    }))
    assert.equal(editedContent.summary, '验证后台内容编辑后仍可发布。')
    assert.equal(editedContent.metadata.statusText, '后台维护已验证')
    assert.equal(publishContent(fixture.client, content.id).status, 'published')
    assert.equal(archiveContent(fixture.client, content.id).status, 'archived')

    const place = createPlace(fixture.client, createPlaceSchema.parse({
      slug: 'admin-maintenance-place',
      name: '后台维护地点',
      summary: '验证后台可新增和编辑地点。',
      body: '地点说明。',
      scope: 'campus',
      type: 'service',
      category: 'service',
      address: '仰恩大学',
      campusArea: '新区',
      floor: null,
      room: null,
      longitude: null,
      latitude: null,
      coordinateSystem: null,
      coordinateVerification: 'missing',
      coordinateVerifiedAt: null,
      sourceRawRef: null,
      openingHours: null,
      phone: null,
      website: '',
      externalMapUrl: '',
      isOfficial: true,
      isFeatured: false,
      lastVerifiedAt: iso(),
      sourceIds: [source.id]
    }))
    assert.equal(place.status, 'draft')
    const editedPlace = updatePlace(fixture.client, place.id, updatePlaceSchema.parse({
      longitude: 118.604,
      latitude: 25.107,
      coordinateSystem: 'GCJ-02',
      address: '仰恩大学新区'
    }))
    assert.equal(editedPlace.coordinateVerification, 'unverified')
    assertHttpError(
      () => publishPlace(fixture.client, place.id),
      'PUBLISH_REQUIREMENTS_NOT_MET'
    )
    assert.equal(archivePlace(fixture.client, place.id).status, 'archived')

    const verifiedPlaceId = '9db99f16-1045-4bcb-a5ce-6cf1d939b7c7'
    const now = Date.now() - 60_000
    fixture.client.sqlite.prepare(`
      INSERT INTO places (
        id, slug, name, summary, body, scope, type, category, address,
        longitude, latitude, coordinate_system, coordinate_verification,
        coordinate_verified_at, coordinate_point_role,
        is_official, is_featured, status, last_verified_at, created_at, updated_at
      ) VALUES (?, 'admin-maintenance-verified-place', '后台已核验地点',
        '用于验证后台地点发布。', '', 'campus', 'service', 'service', '仰恩大学',
        118.604, 25.107, 'WGS84', 'verified', ?, 'site-point',
        1, 0, 'draft', ?, ?, ?)
    `).run(verifiedPlaceId, now, now, now, now)
    fixture.client.sqlite.prepare(`
      INSERT INTO place_sources (place_id, source_id, is_primary, created_at)
      VALUES (?, ?, 1, ?)
    `).run(verifiedPlaceId, source.id, now)
    assert.equal(publishPlace(fixture.client, verifiedPlaceId).status, 'published')
    assert.equal(archivePlace(fixture.client, verifiedPlaceId).status, 'archived')

    const procedure = createProcedure(fixture.client, createProcedureSchema.parse({
      slug: 'admin-maintenance-procedure',
      title: '后台维护流程',
      summary: '验证后台可维护办事流程步骤和材料。',
      body: '流程说明。',
      category: 'arrival',
      audience: ['undergraduate', 'transfer'],
      method: 'mixed',
      informationState: 'partial',
      statusText: '后台维护已验证',
      processingTime: null,
      deadlineText: null,
      validUntil: iso(86_400_000),
      lastVerifiedAt: iso(),
      sourceIds: [source.id],
      placeIds: [],
      steps: [{
        title: '查看通知',
        description: '先查看官方通知。',
        audience: ['undergraduate', 'transfer'],
        informationState: 'confirmed',
        timeText: null,
        placeId: null,
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
    assert.equal(procedure.status, 'draft')

    const editedProcedure = updateProcedure(fixture.client, procedure.id, updateProcedureSchema.parse({
      summary: '验证后台流程编辑后仍可发布。',
      steps: [
        {
          title: '查看通知',
          description: '先查看官方通知。',
          audience: ['undergraduate', 'transfer'],
          informationState: 'confirmed',
          timeText: null,
          placeId: null,
          departmentId: null,
          actionUrl: null
        },
        {
          title: '现场确认',
          description: '到校后按学院安排确认。',
          audience: ['undergraduate', 'transfer'],
          informationState: 'awaiting-notice',
          timeText: null,
          placeId: null,
          departmentId: null,
          actionUrl: null
        }
      ]
    }))
    assert.deepEqual(editedProcedure.steps.map(step => step.order), [1, 2])
    assert.equal(publishProcedure(fixture.client, procedure.id).status, 'published')
    assert.equal(archiveProcedure(fixture.client, procedure.id).status, 'archived')

    const removableSource = createSource(fixture.client, createSourceSchema.parse({
      title: '可删除来源',
      url: 'https://example.edu/removable-source',
      platform: 'other',
      publisherName: '测试',
      sourceLevel: 'D',
      isOfficial: false,
      accessedAt: iso(),
      status: 'active',
      notes: null
    }))
    deleteSource(fixture.client, removableSource.id)
    assert.equal(
      fixture.client.sqlite.prepare('SELECT count(*) AS count FROM sources WHERE id = ?').get(removableSource.id).count,
      0
    )
  } finally {
    fixture.cleanup()
  }
})
