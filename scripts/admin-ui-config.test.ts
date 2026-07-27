import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { buildCatalogSeed } from './seed-public-catalog'
import {
  adminSectionConfigs,
  getAdminSectionConfig,
  listAdminSectionKeys,
  publicationStatusOptions
} from '../app/utils/admin-section-config'

const adminSectionPageSource = readFileSync(resolve('app/pages/admin/[section].vue'), 'utf8')
const adminSectionConfigSource = readFileSync(resolve('app/utils/admin-section-config.ts'), 'utf8')
const managerSource = readFileSync(resolve('app/components/admin/AdminResourceManager.vue'), 'utf8')
const editorSource = readFileSync(resolve('app/components/admin/AdminResourceEditor.vue'), 'utf8')
const catalogPanelSource = readFileSync(resolve('app/components/admin/AdminResourceCatalogPanel.vue'), 'utf8')
const deleteDialogSource = readFileSync(resolve('app/components/admin/AdminResourceDeleteDialog.vue'), 'utf8')
const resourceFormSource = readFileSync(resolve('app/utils/admin-resource-form.ts'), 'utf8')
const resourceOperationsSource = readFileSync(
  resolve('app/utils/admin-resource-operations.ts'),
  'utf8'
)
const adminLayoutSource = readFileSync(resolve('app/layouts/admin.vue'), 'utf8')
const adminIndexSource = readFileSync(resolve('app/pages/admin/index.vue'), 'utf8')
const adminDashboardPresentationSource = readFileSync(resolve('app/utils/admin-dashboard-presentation.ts'), 'utf8')
const passwordChangePanelSource = readFileSync(
  resolve('app/components/admin/AdminPasswordChangePanel.vue'),
  'utf8'
)
const organizationVisualEditorSource = readFileSync(
  resolve('app/components/admin/AdminOrganizationVisualEditor.vue'),
  'utf8'
)
const organizationVisualCreatePageSource = readFileSync(
  resolve('app/pages/admin/content/new/visual.vue'),
  'utf8'
)
const organizationVisualEditPageSource = readFileSync(
  resolve('app/pages/admin/content/[id]/visual.vue'),
  'utf8'
)

function sectionBlock(key: string): string {
  const marker = `  '${key}': {`
  const start = adminSectionConfigSource.indexOf(marker)
  assert.notEqual(start, -1, `admin section ${key} is missing`)

  const next = adminSectionConfigSource.indexOf('\n  \'', start + marker.length)
  const fallbackEnd = adminSectionConfigSource.indexOf(
    '\n}\n\nexport function getAdminSectionConfig',
    start
  )
  return adminSectionConfigSource.slice(start, next === -1 ? fallbackEnd : next)
}

function assertContains(block: string, patterns: RegExp[], label: string): void {
  for (const pattern of patterns) {
    assert.match(block, pattern, `${label} missing ${pattern}`)
  }
}

test('admin resource manager exposes create, edit, delete, save and publication controls', () => {
  assertContains(managerSource, [
    /const canCreate = computed\(\(\) => props\.config\.canCreate !== false\)/,
    /const canEdit = computed\(\(\) => props\.config\.canEdit !== false\)/,
    /const canDelete = computed\(\(\) => props\.config\.canDelete !== false\)/,
    /useAdminResourceOperations\(\{/,
    /async function handleEdit\(record: AdminRecord\)/,
    /props\.config\.key === 'content'/,
    /kind === 'club' \|\| kind === 'department'/,
    /navigateTo\(`\/admin\/content\/\$\{encodeURIComponent\(id\)\}\/visual`\)/,
    /AdminResourceCatalogPanel/,
    /@edit="handleEdit"/,
    /@set-publication-status="setPublicationStatus"/,
    /AdminResourceEditor/,
    /AdminResourceDeleteDialog/
  ], 'AdminResourceManager')
  assertContains(catalogPanelSource, [
    /emit\('setPublicationStatus', record, 'published'\)/,
    /emit\('setPublicationStatus', record, 'archived'\)/,
    /:disabled="writeBusy"/
  ], 'AdminResourceCatalogPanel')
  assertContains(deleteDialogSource, [
    /confirm: \[\]/,
    /确认删除/
  ], 'AdminResourceDeleteDialog')
  assertContains(editorSource, [
    /AdminCoordinatePicker/,
    /getAdminResourceCoordinateNumber\(formState, 'longitude'\)/,
    /getAdminResourceCoordinateNumber\(formState, 'latitude'\)/,
    /getAdminResourceCoordinateSystem\(formState\)/
  ], 'AdminResourceEditor')
  assertContains(resourceOperationsSource, [
    /function openCreate\(\)/,
    /function openEdit\(record: AdminRecord\)/,
    /async function saveRecord\(\)/,
    /async function deleteRecord\(\)/,
    /method: id \? 'PUT' : 'POST'/,
    /method: 'DELETE'/
  ], 'admin resource operations utility')
  assertContains(resourceFormSource, [
    /writeAdminResourcePath\(payload, field\.key, value\)/,
    /field\.type === 'json'/,
    /JSON\.parse\(value\)/,
    /JSON\.stringify\(value, null, 2\)/,
    /field\.key === 'sourceIds'/
  ], 'admin resource form utility')
})

test('organization visual editor entry includes the required first-login password flow', () => {
  assertContains(passwordChangePanelSource, [
    /currentPassword = ref\(''\)/,
    /newPassword\.value\.length < 12/,
    /newPassword\.value !== confirmPassword\.value/,
    /adminFetch\('\/api\/admin\/auth\/password'/,
    /navigateTo\('\/admin\/login\?password=changed'/,
    /autocomplete="current-password"/,
    /autocomplete="new-password"/
  ], 'AdminPasswordChangePanel')
})

test('organization visual editor manages signup Q&A and persists QR uploads immediately', () => {
  assertContains(organizationVisualEditorSource, [
    /interface EditorSignupQa/,
    /signupQa: EditorSignupQa\[\]/,
    /function editorSignupQa\(metadata: Record<string, unknown>\)/,
    /model\.signupQa = editorSignupQa\(metadata\)/,
    /function addSignupQuestion\(\)/,
    /function moveSignupQuestion\(index: number, offset: -1 \| 1\)/,
    /function removeSignupQuestion\(index: number\)/,
    /v-model="item\.question"/,
    /v-model="item\.answer"/,
    /signupQuestions, signupQa/,
    /Promise\.allSettled/,
    /await persistQrAssociations\(\)/,
    /二维码已上传并保存/
  ], 'AdminOrganizationVisualEditor')
})

test('organization content creation and every organization field use the visual editor', () => {
  assertContains(managerSource, [
    /function openVisualCreate\(kind: 'club' \| 'department'\)/,
    /path: '\/admin\/content\/new\/visual'/,
    /label="新增社团"/,
    /@click="openVisualCreate\('club'\)"/,
    /label="新增部门"/,
    /@click="openVisualCreate\('department'\)"/,
    /label="新增指南 \/ 公告"/
  ], 'AdminResourceManager visual creation actions')
  assertContains(organizationVisualCreatePageSource, [
    /route\.query\.kind === 'department'/,
    /AdminOrganizationVisualEditor :create-kind="createKind"/
  ], 'organization visual creation page')
  assertContains(organizationVisualEditorSource, [
    /contentId\?: string/,
    /createKind\?: 'club' \| 'department'/,
    /const isCreating = computed\(\(\) => !model\.id\)/,
    /method: 'POST'/,
    /kind: model\.kind/,
    /slug: model\.slug\.trim\(\)/,
    /sourceIds,/,
    /lastVerifiedAt: isoDateOrNull\(model\.lastVerifiedAt\)/,
    /verificationState: model\.verificationState/,
    /featuredSummary: model\.featuredSummary\.trim\(\)/,
    /sortOrder,/,
    /v-model="model\.profileUrl"/,
    /v-model="model\.contactUrl"/,
    /v-model="model\.sourceIdsText"/,
    /v-model="model\.lastVerifiedAt"/,
    /v-model="model\.isFeatured"/,
    /loadAvailableSources\(\)/,
    /\/api\/admin\/sources\?/,
    /toggleSource\(source\.id, \$event === true\)/,
    /label="设为现在"/,
    /label="发布依据"/,
    /创建并继续编辑/
  ], 'AdminOrganizationVisualEditor complete organization fields')
})

test('super admins can switch between visual and detailed organization editors', () => {
  assertContains(organizationVisualEditorSource, [
    /allowDetailedEdit\?: boolean/,
    /v-if="!isCreating && allowDetailedEdit"/,
    /path: '\/admin\/content'/,
    /query: \{ edit: model\.id \}/,
    /label="切换到详细编辑"/
  ], 'AdminOrganizationVisualEditor detailed editor switch')
  assertContains(organizationVisualEditPageSource, [
    /session\.admin\?\.role === 'super'/,
    /:allow-detailed-edit="allowDetailedEdit"/
  ], 'organization visual edit super-admin gate')
  assertContains(managerSource, [
    /const editId = typeof route\.query\.edit === 'string'/,
    /`\/api\/admin\/content\/\$\{encodeURIComponent\(editId\)\}`/,
    /openEdit\(record\)/,
    /:visual-editor-path="visualEditorPath"/
  ], 'AdminResourceManager detailed editor route')
  assertContains(editorSource, [
    /visualEditorPath\?: string/,
    /v-if="visualEditorPath"/,
    /label="切换到可视化编辑"/
  ], 'AdminResourceEditor visual editor switch')
})

test('core admin modules are configured for maintainable CRUD and publication workflows', () => {
  const places = sectionBlock('places')
  assertContains(places, [
    /endpoint: '\/api\/admin\/places'/,
    /createLabel: '新增地点'/,
    /publicationActions: true/,
    /key: 'name'/,
    /key: 'slug'/,
    /key: 'summary'/,
    /key: 'body'/,
    /【到这里前先确认】小节/,
    /key: 'longitude'/,
    /key: 'latitude'/,
    /key: 'coordinateSystem'/,
    /key: 'coordinateVerification'/,
    /key: 'coordinatePointRole'/,
    /label: '坐标用途'/,
    /'main-entrance': '主入口'/,
    /'site-point': '场地点'/,
    /坐标用途只能通过现场定位记录/,
    /key: 'sourceIds'/,
    /key: 'lastVerifiedAt'/
  ], 'places admin config')

  const content = sectionBlock('content')
  assertContains(content, [
    /endpoint: '\/api\/admin\/content'/,
    /createLabel: '新增内容'/,
    /publicationActions: true/,
    /key: 'kind'/,
    /key: 'title'/,
    /key: 'slug'/,
    /key: 'summary'/,
    /key: 'body'/,
    /key: 'metadata\.phone'/,
    /key: 'metadata\.recruitmentPeriod'/,
    /key: 'metadata\.validFrom'/,
    /key: 'metadata\.shortTitle'/,
    /key: 'metadata\.icon'/,
    /key: 'metadata\.statusText'/,
    /key: 'metadata\.leadNotice'/,
    /key: 'metadata\.sections'/,
    /key: 'metadata\.verificationState'/,
    /key: 'metadata\.website'/,
    /key: 'metadata\.group'/,
    /key: 'metadata\.direction'/,
    /key: 'sourceIds'/,
    /key: 'lastVerifiedAt'/
  ], 'content admin config')

  const sources = sectionBlock('sources')
  assertContains(sources, [
    /endpoint: '\/api\/admin\/sources'/,
    /createLabel: '登记来源'/,
    /key: 'title'/,
    /key: 'url'/,
    /key: 'platform'/,
    /key: 'publisherName'/,
    /key: 'sourceLevel'/,
    /key: 'accessedAt'/,
    /key: 'status'/,
    /key: 'isOfficial'/,
    /key: 'notes'/
  ], 'sources admin config')
})

test('content admin form covers editable metadata used by public catalog seeds', () => {
  const catalog = buildCatalogSeed()
  const metadataKeys = new Set(catalog.contents.flatMap(content => Object.keys(content.metadata ?? {})))
  const intentionallyManagedElsewhere = new Set(['catalogSeed'])
  const editableMetadataKeys = [...metadataKeys].filter(key => !intentionallyManagedElsewhere.has(key)).sort()
  const content = sectionBlock('content')

  assert.deepEqual(editableMetadataKeys, [
    'activitySchedule',
    'address',
    'contactMethod',
    'contactUrl',
    'direction',
    'email',
    'group',
    'icon',
    'leadNotice',
    'phone',
    'profileUrl',
    'readMinutes',
    'recruitmentPeriod',
    'sections',
    'shortTitle',
    'statusText',
    'verificationState',
    'website'
  ])
  for (const key of editableMetadataKeys) {
    assert.match(content, new RegExp(`key: 'metadata\\.${key}'`), `content admin config missing metadata.${key}`)
  }
})

test('admin navigation and dashboard expose every maintenance entry point', () => {
  assert.match(adminLayoutSource, /adminNavigationGroups/)
  assertContains(adminDashboardPresentationSource, [
    /to: '\/admin\/places'/,
    /to: '\/admin\/field-observations'/,
    /to: '\/admin\/procedures'/,
    /to: '\/admin\/content'/,
    /to: '\/admin\/sources'/,
    /to: '\/admin\/feedback'/,
    /to: '\/admin\/users'/,
    /to: '\/admin\/chat'/,
    /to: '\/admin\/visitors'/,
    /to: '\/admin\/audit'/
  ], 'admin navigation entry points')

  assert.match(adminIndexSource, /from ['"]~~\/app\/utils\/admin-dashboard-presentation['"]/)
  assert.match(adminIndexSource, /adminDashboardModules/)
  assert.match(adminIndexSource, /adminDashboardQuickActions/)
  assertContains(adminDashboardPresentationSource, [
    /endpoint: '\/api\/admin\/places'/,
    /endpoint: '\/api\/admin\/content'/,
    /endpoint: '\/api\/admin\/procedures'/,
    /endpoint: '\/api\/admin\/sources'/,
    /endpoint: '\/api\/admin\/feedback'/,
    /endpoint: '\/api\/admin\/users'/,
    /endpoint: '\/api\/admin\/chat\/rooms'/,
    /endpoint: '\/api\/admin\/visitors'/,
    /endpoint: '\/api\/admin\/visitors\/bans'/,
    /to: '\/admin\/places\?action=create'/,
    /to: '\/admin\/content\?action=create'/,
    /to: '\/admin\/procedures\?action=create'/,
    /to: '\/admin\/sources\?action=create'/,
    /to: '\/admin\/field-observations'/,
    /to: '\/admin\/feedback'/,
    /to: '\/admin\/users'/,
    /to: '\/admin\/chat'/,
    /to: '\/admin\/visitors'/,
    /to: '\/admin\/audit'/,
    /export const adminDashboardGroupMeta/,
    /export const adminNavigationGroups/
  ], 'admin dashboard entry points')
})

test('feedback is editable but not user-created, and audit logs are read-only', () => {
  const feedback = sectionBlock('feedback')
  assertContains(feedback, [
    /endpoint: '\/api\/admin\/feedback'/,
    /canCreate: false/,
    /key: 'status'/,
    /key: 'resolutionNote'/
  ], 'feedback admin config')
  assert.doesNotMatch(feedback, /canEdit: false/)
  assert.doesNotMatch(feedback, /canDelete: false/)

  const auditLogs = sectionBlock('audit-logs')
  assertContains(auditLogs, [
    /endpoint: '\/api\/admin\/audit-logs'/,
    /canCreate: false/,
    /canEdit: false/,
    /canDelete: false/,
    /searchable: false/,
    /readOnlyNote:/
  ], 'audit logs admin config')
})

test('admin section page stays a thin config shell', () => {
  assert.match(adminSectionPageSource, /from ['"]~~\/app\/utils\/admin-section-config['"]/)
  assert.match(adminSectionPageSource, /getAdminSectionConfig\(section\.value\)/)
  assert.match(adminSectionPageSource, /AdminResourceManager :config="current"/)
  assert.doesNotMatch(adminSectionPageSource, /const sections: Record/)
  assert.doesNotMatch(adminSectionPageSource, /publicationStatusOptions/)
  assert.match(adminSectionConfigSource, /export const adminSectionConfigs/)
  assert.match(adminSectionConfigSource, /export function getAdminSectionConfig/)
  assert.match(adminSectionConfigSource, /export const publicationStatusOptions/)
  assert.match(adminSectionConfigSource, /export const sourcePlatformOptions/)
})

test('getAdminSectionConfig returns configured modules and rejects unknown keys', () => {
  assert.deepEqual(listAdminSectionKeys().sort(), ['audit-logs', 'content', 'feedback', 'places', 'sources'])
  assert.equal(getAdminSectionConfig('places')?.endpoint, '/api/admin/places')
  assert.equal(getAdminSectionConfig('content')?.publicationActions, true)
  assert.equal(getAdminSectionConfig('audit-logs')?.canEdit, false)
  assert.equal(getAdminSectionConfig('missing'), undefined)
  assert.equal(adminSectionConfigs.places.title, '地点管理')
  assert.ok(publicationStatusOptions.some(option => option.value === 'published'))
})
