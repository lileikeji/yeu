import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const editorSource = readFileSync(
  resolve('app/components/admin/AdminResourceEditor.vue'),
  'utf8'
)
const managerSource = readFileSync(
  resolve('app/components/admin/AdminResourceManager.vue'),
  'utf8'
)

test('admin resource editor owns modal presentation and dynamic field rendering', () => {
  assert.match(editorSource, /<UModal/)
  assert.match(editorSource, /v-if="formError"/)
  assert.match(editorSource, /<AdminCoordinatePicker/)
  assert.match(editorSource, /v-for="group in groupedFields"/)
  assert.match(editorSource, /<details/)
  assert.match(editorSource, /高级设置/)
  assert.match(editorSource, /field\.type === 'textarea' \|\| field\.type === 'json'/)
  assert.match(editorSource, /field\.type === 'select'/)
  assert.match(editorSource, /field\.type === 'checkbox'/)
  assert.match(editorSource, /field\.type === 'image-list'/)
  assert.match(editorSource, /field\.type === 'tel-list'/)
  assert.match(editorSource, /multiple/)
  assert.match(editorSource, /添加联系电话/)
  assert.match(editorSource, /getAdminResourceFieldInputType\(field\)/)
})

test('admin resource editor exposes a typed state and event boundary', () => {
  assert.match(editorSource, /defineModel<boolean>\('open', \{ required: true \}\)/)
  assert.match(editorSource, /updateField: \[key: string, value: unknown\]/)
  assert.match(editorSource, /coordinatePicked: \[point: GeoPoint\]/)
  assert.match(editorSource, /clearCoordinates: \[\]/)
  assert.match(editorSource, /save: \[\]/)
  assert.match(editorSource, /emit\('updateField', field\.key, \$event\)/)
  assert.match(editorSource, /emit\('save'\)/)
})

test('admin resource editor stays independent of requests, routing and authorization', () => {
  assert.doesNotMatch(editorSource, /\$fetch|useRoute|useRouter|navigateTo/)
  assert.doesNotMatch(editorSource, /useAdminResourceCatalog|useAdminResourceOperations/)
  assert.doesNotMatch(editorSource, /endpoint|authorization|Unauthorized/i)
})

test('admin resource manager delegates the editor without duplicating its template', () => {
  assert.match(managerSource, /<AdminResourceEditor/)
  assert.match(managerSource, /:form-state="formState"/)
  assert.match(managerSource, /@update-field="setFormValue"/)
  assert.match(managerSource, /@coordinate-picked="handleCoordinatePicked"/)
  assert.match(managerSource, /@clear-coordinates="clearCoordinates"/)
  assert.match(managerSource, /@save="saveRecord"/)
  assert.doesNotMatch(managerSource, /<AdminCoordinatePicker/)
  assert.doesNotMatch(managerSource, /v-for="group in groupedFields"/)
})
