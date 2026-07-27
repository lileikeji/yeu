import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { ApiContent } from '../shared/types/server'
import { publicClubs, mergePublicDepartments } from '../app/utils/public-catalog'
import { createContentSchema, updateContentSchema } from '../shared/schemas/server'

const clubDetailSource = readFileSync(resolve('app/pages/clubs/[slug].vue'), 'utf8')
const departmentDetailSource = readFileSync(resolve('app/pages/departments/[slug].vue'), 'utf8')
const contactPanelSource = readFileSync(resolve('app/components/PublicCommunityContactPanel.vue'), 'utf8')

function contentFixture(overrides: Partial<ApiContent>): ApiContent {
  return {
    id: crypto.randomUUID(),
    kind: 'club',
    slug: 'fixture',
    title: '测试社团',
    summary: '供社团目录排序和联系方式测试使用的公开摘要。',
    body: '',
    category: null,
    audience: null,
    metadata: {},
    isFeatured: false,
    status: 'published',
    lastVerifiedAt: null,
    publishedAt: null,
    createdAt: '2026-07-25',
    updatedAt: '2026-07-25',
    sources: [],
    ...overrides
  }
}

test('community metadata accepts uploaded QR URLs and bounded ordering', () => {
  const result = updateContentSchema.safeParse({
    metadata: {
      groupQrUrls: [
        '/uploads/123e4567-e89b-42d3-a456-426614174000.png',
        '/uploads/123e4567-e89b-42d3-a456-426614174002.jpg'
      ],
      contactQrUrls: [
        '/uploads/123e4567-e89b-42d3-a456-426614174001.webp',
        '/uploads/123e4567-e89b-42d3-a456-426614174003.png'
      ],
      contactName: '招新负责人',
      contactPhones: ['138 0000 0000', '0595-12345678'],
      featuredSummary: '适合新生快速了解的精选摘要。',
      sortOrder: 20,
      signupQuestions: ['零基础可以加入吗？', '每周活动安排是什么？']
    }
  })
  assert.equal(result.success, true)
})

test('community metadata rejects external QR URLs and invalid ordering', () => {
  assert.equal(updateContentSchema.safeParse({ metadata: { groupQrUrl: 'https://example.com/qr.png' } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { groupQrUrl: '/uploads/not-a-uuid.png' } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { groupQrUrls: ['https://example.com/qr.png'] } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { contactQrUrls: ['https://example.com/qr.png'] } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { contactPhones: Array.from({ length: 13 }, (_, index) => `138000000${index}`) } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { sortOrder: -1 } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { sortOrder: 2.5 } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { sortOrder: 10000 } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { signupQuestions: [] } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { signupQuestions: ['重复问题', '重复问题'] } }).success, false)
  assert.equal(updateContentSchema.safeParse({ metadata: { signupQuestions: [' 前后有空格'] } }).success, false)
})

test('club directory exposes QR contacts and follows configured order', () => {
  const qrUrl = '/uploads/123e4567-e89b-42d3-a456-426614174000.png'
  const secondQrUrl = '/uploads/123e4567-e89b-42d3-a456-426614174002.jpg'
  const clubs = publicClubs([
    contentFixture({ id: 'club-later', slug: 'later', title: '靠后社团', metadata: { sortOrder: 90 } }),
    contentFixture({
      id: 'club-first',
      slug: 'first',
      title: '优先社团',
      isFeatured: true,
      metadata: {
        sortOrder: 10,
        groupQrUrls: [qrUrl, secondQrUrl],
        contactQrUrls: [secondQrUrl, qrUrl],
        contactName: '招新负责人',
        contactPhones: ['13800000000', '0595-12345678'],
        signupQuestions: ['需要面试吗？', '活动一般在什么时候？'],
        featuredSummary: '首页精选摘要'
      }
    })
  ], [])

  assert.deepEqual(clubs.map(item => item.slug), ['first', 'later'])
  assert.equal(clubs[0]?.groupQrUrl, qrUrl)
  assert.deepEqual(clubs[0]?.groupQrUrls, [qrUrl, secondQrUrl])
  assert.equal(clubs[0]?.contactQrUrl, secondQrUrl)
  assert.deepEqual(clubs[0]?.contactQrUrls, [secondQrUrl, qrUrl])
  assert.equal(clubs[0]?.contactName, '招新负责人')
  assert.equal(clubs[0]?.contactPhone, '13800000000 / 0595-12345678')
  assert.deepEqual(clubs[0]?.contactPhones, ['13800000000', '0595-12345678'])
  assert.deepEqual(clubs[0]?.signupQuestions, ['需要面试吗？', '活动一般在什么时候？'])
  assert.equal(clubs[0]?.featuredSummary, '首页精选摘要')
  assert.equal(clubs[0]?.isFeatured, true)
})

test('club signup questions fall back to the student-facing defaults', () => {
  const club = publicClubs([contentFixture({ metadata: {} })], [])[0]
  assert.ok(club)
  assert.equal(club.signupQuestions.length, 4)
  assert.match(club.signupQuestions[0] ?? '', /主要活动/)
})

test('department directory uses featured state as the tie breaker', () => {
  const departments = mergePublicDepartments([], [
    contentFixture({ id: 'department-normal', kind: 'department', slug: 'normal', title: '普通部门', metadata: { sortOrder: 30 } }),
    contentFixture({ id: 'department-featured', kind: 'department', slug: 'featured', title: '精选部门', isFeatured: true, metadata: { sortOrder: 30 } })
  ], false)
  assert.deepEqual(departments.map(item => item.slug), ['featured', 'normal'])
})

test('plural contact metadata overrides legacy singular values and can be cleared', () => {
  const clubs = publicClubs([
    contentFixture({
      metadata: {
        groupQrUrl: '/uploads/123e4567-e89b-42d3-a456-426614174000.png',
        groupQrUrls: [],
        contactQrUrl: '/uploads/123e4567-e89b-42d3-a456-426614174001.webp',
        contactQrUrls: [],
        contactPhone: '13800000000',
        contactPhones: []
      }
    })
  ], [])
  assert.deepEqual(clubs[0]?.groupQrUrls, [])
  assert.deepEqual(clubs[0]?.contactQrUrls, [])
  assert.deepEqual(clubs[0]?.contactPhones, [])
  assert.equal(clubs[0]?.groupQrUrl, null)
  assert.equal(clubs[0]?.contactQrUrl, null)
  assert.equal(clubs[0]?.contactPhone, null)
})

test('QR and负责人 contacts suppress contradictory pending-contact states', () => {
  assert.match(clubDetailSource, /contactActions\.value\.length[\s\S]*club\.value\?\.groupQrUrls\.length[\s\S]*club\.value\?\.contactQrUrls\.length[\s\S]*club\.value\?\.contactPhones\.length/)
  assert.match(departmentDetailSource, /department\.value\?\.groupQrUrls\.length[\s\S]*department\.value\?\.contactQrUrls\.length[\s\S]*department\.value\?\.contactPhones\.length/)
  assert.doesNotMatch(
    clubDetailSource,
    /const hasRecruitmentDetails[\s\S]{0,300}groupQrUrl/
  )
  assert.match(contactPanelSource, /v-for="\(qrUrl, index\) in groupQrUrls"/)
  assert.match(contactPanelSource, /v-for="\(qrUrl, index\) in contactQrUrls"/)
  assert.match(contactPanelSource, /v-for="phone in phoneContacts"/)
})

test('full content creation still validates required fields with community metadata', () => {
  const result = createContentSchema.safeParse({
    kind: 'club',
    slug: 'new-club',
    title: '新社团',
    summary: '新社团介绍',
    body: '',
    category: null,
    audience: null,
    metadata: { sortOrder: 100 },
    isFeatured: false,
    lastVerifiedAt: null,
    sourceIds: []
  })
  assert.equal(result.success, true)
})
