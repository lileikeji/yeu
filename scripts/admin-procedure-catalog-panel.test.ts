import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const panelSource = readFileSync(
  resolve('app/components/admin/AdminProcedureCatalogPanel.vue'),
  'utf8'
)
const deleteSource = readFileSync(
  resolve('app/components/admin/AdminProcedureDeleteDialog.vue'),
  'utf8'
)
const editorSource = readFileSync(
  resolve('app/components/admin/AdminProcedureEditor.vue'),
  'utf8'
)
const pageSource = readFileSync(
  resolve('app/pages/admin/procedures.vue'),
  'utf8'
)

test('admin procedure catalog panel owns filters, table and pagination presentation', () => {
  assert.match(panelSource, /defineModel<string>\('searchQuery', \{ required: true \}\)/)
  assert.match(panelSource, /defineModel<'all' \| ProcedurePublicationStatus>\('statusFilter', \{ required: true \}\)/)
  assert.match(panelSource, /v-if="loadError"/)
  assert.match(panelSource, /aria-label="正在加载流程"/)
  assert.match(panelSource, /<table/)
  assert.match(panelSource, /md:hidden/)
  assert.match(panelSource, /共 \{\{ total \}\} 条，第 \{\{ page \}\} \/ \{\{ pageCount \}\} 页/)
  assert.match(panelSource, /AdminStatusBadge/)
  assert.match(panelSource, /audienceLabel\(procedure\.audience\)/)
  assert.match(panelSource, /methodLabel\(procedure\.method\)/)
})

test('admin procedure catalog panel exposes typed catalog and row action events', () => {
  assert.match(panelSource, /refresh: \[\]/)
  assert.match(panelSource, /changePage: \[page: number\]/)
  assert.match(panelSource, /edit: \[procedure: ApiProcedure\]/)
  assert.match(panelSource, /rowAction: \[procedure: ApiProcedure, action: 'publish' \| 'unpublish'\]/)
  assert.match(panelSource, /requestDelete: \[procedure: ApiProcedure\]/)
  assert.match(panelSource, /emit\('rowAction', procedure, 'publish'\)/)
  assert.match(panelSource, /emit\('rowAction', procedure, 'unpublish'\)/)
})

test('admin procedure catalog panel stays independent of requests, routing and authorization', () => {
  assert.doesNotMatch(panelSource, /\$fetch|useRoute|useRouter|navigateTo/)
  assert.doesNotMatch(panelSource, /useAdminProcedureCatalog|useAdminProcedureOperations/)
  assert.doesNotMatch(panelSource, /endpoint|authorization|Unauthorized/i)
})

test('admin procedure delete dialog owns confirmation presentation only', () => {
  assert.match(deleteSource, /defineModel<boolean>\('open', \{ required: true \}\)/)
  assert.match(deleteSource, /confirm: \[\]/)
  assert.match(deleteSource, /确认删除/)
  assert.match(deleteSource, /:loading="deleting"/)
  assert.doesNotMatch(deleteSource, /\$fetch|useRoute|useRouter|navigateTo/)
  assert.doesNotMatch(deleteSource, /method: 'DELETE'|endpoint/)
})

test('admin procedure editor owns modal shell and composed section editors', () => {
  assert.match(editorSource, /<UModal/)
  assert.match(editorSource, /defineModel<boolean>\('open', \{ required: true \}\)/)
  assert.match(editorSource, /defineModel<ProcedureForm>\('form', \{ required: true \}\)/)
  assert.match(editorSource, /v-if="formError"/)
  assert.match(editorSource, /referencesError/)
  assert.match(editorSource, /<AdminProcedureBasicsEditor/)
  assert.match(editorSource, /<AdminProcedureTimingEditor/)
  assert.match(editorSource, /<AdminProcedureRelationsEditor/)
  assert.match(editorSource, /<AdminProcedureStepsEditor/)
  assert.match(editorSource, /<AdminProcedureMaterialsEditor/)
  assert.match(editorSource, /emit\('save'\)/)
  assert.match(editorSource, /emit\('loadReferences', true\)/)
})

test('admin procedure editor stays independent of requests, routing and authorization', () => {
  assert.doesNotMatch(editorSource, /\$fetch|useRoute|useRouter|navigateTo/)
  assert.doesNotMatch(editorSource, /useAdminProcedureCatalog|useAdminProcedureOperations|useAdminProcedureFormModel/)
  assert.doesNotMatch(editorSource, /endpoint|authorization|Unauthorized/i)
})

test('admin procedures page composes catalog, editor and delete dialog without list markup', () => {
  assert.match(pageSource, /<AdminProcedureCatalogPanel/)
  assert.match(pageSource, /v-model:search-query="searchQuery"/)
  assert.match(pageSource, /v-model:status-filter="statusFilter"/)
  assert.match(pageSource, /@row-action="runRowAction"/)
  assert.match(pageSource, /@request-delete="requestDelete"/)
  assert.match(pageSource, /<AdminProcedureEditor/)
  assert.match(pageSource, /v-model:form="procedureFormModel"/)
  assert.match(pageSource, /@save="saveProcedure"/)
  assert.match(pageSource, /<AdminProcedureDeleteDialog/)
  assert.match(pageSource, /@confirm="deleteProcedure"/)
  assert.doesNotMatch(pageSource, /<table/)
  assert.doesNotMatch(pageSource, /aria-label="正在加载流程"/)
  assert.doesNotMatch(pageSource, /title="删除办事流程"/)
  assert.doesNotMatch(pageSource, /<AdminProcedureBasicsEditor/)
})
