import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const pageSource = readFileSync(resolve('app/pages/admin/procedures.vue'), 'utf8')
const editorShellSource = readFileSync(resolve('app/components/admin/AdminProcedureEditor.vue'), 'utf8')
const basicsSource = readFileSync(resolve('app/components/admin/AdminProcedureBasicsEditor.vue'), 'utf8')
const timingSource = readFileSync(resolve('app/components/admin/AdminProcedureTimingEditor.vue'), 'utf8')
const relationsSource = readFileSync(resolve('app/components/admin/AdminProcedureRelationsEditor.vue'), 'utf8')
const stepsSource = readFileSync(resolve('app/components/admin/AdminProcedureStepsEditor.vue'), 'utf8')
const materialsSource = readFileSync(resolve('app/components/admin/AdminProcedureMaterialsEditor.vue'), 'utf8')
const typesSource = readFileSync(resolve('app/components/admin/procedure-editor-types.ts'), 'utf8')
const formModelSource = readFileSync(resolve('app/composables/useAdminProcedureFormModel.ts'), 'utf8')

test('procedure page delegates the editor shell and form mutations without section markup', () => {
  assert.match(pageSource, /<AdminProcedureEditor\b/)
  assert.match(pageSource, /v-model:form="procedureFormModel"/)
  assert.match(pageSource, /@add-step="addStep"/)
  assert.match(pageSource, /@move-step="moveStep"/)
  assert.match(pageSource, /@toggle-audience="toggleAudience"/)
  assert.match(pageSource, /@add-material="addMaterial"/)
  assert.match(pageSource, /@move-material="moveMaterial"/)
  assert.match(pageSource, /@set-required="setRequired"/)
  assert.doesNotMatch(pageSource, /<AdminProcedureStepsEditor\b/)
  assert.doesNotMatch(pageSource, /<AdminProcedureMaterialsEditor\b/)
  assert.doesNotMatch(pageSource, /v-for="\(step, index\) in form\.steps"/)
  assert.doesNotMatch(pageSource, /v-for="\(material, index\) in form\.materials"/)
  assert.doesNotMatch(pageSource, /function requiredValue/)
})

test('procedure page keeps form model orchestration and routes section editors through the shell', () => {
  assert.match(pageSource, /useAdminProcedureFormModel\(\)/)
  assert.match(pageSource, /procedureFormModel,/)
  assert.match(pageSource, /<AdminProcedureEditor\b/)
  assert.doesNotMatch(pageSource, /<AdminProcedureBasicsEditor\b/)
  assert.doesNotMatch(pageSource, /<AdminProcedureTimingEditor\b/)
  assert.doesNotMatch(pageSource, /<AdminProcedureRelationsEditor\b/)
  assert.equal(pageSource.match(/v-model:form="procedureFormModel"/g)?.length, 1)
  assert.doesNotMatch(pageSource, /label="流程标题"|label="最后核验时间"|label="核验来源"/)
})

test('procedure editor shell composes ordered section editors with a shared form model', () => {
  assert.match(editorShellSource, /<AdminProcedureBasicsEditor\b/)
  assert.match(editorShellSource, /<AdminProcedureTimingEditor\b/)
  assert.match(editorShellSource, /<AdminProcedureRelationsEditor\b/)
  assert.match(editorShellSource, /<AdminProcedureStepsEditor\b/)
  assert.match(editorShellSource, /:steps="form\.steps"/)
  assert.match(editorShellSource, /@move="\(index, direction\) => emit\('moveStep', index, direction\)"/)
  assert.match(editorShellSource, /@toggle-audience="\(\.\.\.args\) => emit\('toggleAudience', \.\.\.args\)"/)
  assert.match(editorShellSource, /<AdminProcedureMaterialsEditor\b/)
  assert.match(editorShellSource, /:materials="form\.materials"/)
  assert.match(editorShellSource, /@move="\(index, direction\) => emit\('moveMaterial', index, direction\)"/)
  assert.match(editorShellSource, /@set-required="\(\.\.\.args\) => emit\('setRequired', \.\.\.args\)"/)
  assert.equal(editorShellSource.match(/v-model:form="form"/g)?.length, 3)
})

test('basic editor owns the public identity and audience fields without side effects', () => {
  assert.match(basicsSource, /defineModel<ProcedureForm>\('form', \{ required: true \}\)/)
  assert.match(basicsSource, /toggleAudience: \[target: ProcedureForm/)
  for (const label of ['流程标题', '公开路径标识', '分类', '办理方式', '适用人群', '摘要', '详细说明']) {
    assert.match(basicsSource, new RegExp(`label="${label}"`))
  }
  assert.doesNotMatch(basicsSource, /\$fetch|useRoute|useRouter|buildPayload|validateForm/)
})

test('timing editor owns confirmed status, schedule, validity and verification fields', () => {
  assert.match(timingSource, /defineModel<ProcedureForm>\('form', \{ required: true \}\)/)
  for (const label of ['信息确认状态', '前台状态说明', '预计办理时长', '截止时间说明', '办理开始时间', '办理结束时间', '公开有效期开始', '公开有效期结束', '最后核验时间']) {
    assert.match(timingSource, new RegExp(`label="${label}"`))
  }
  assert.equal(timingSource.match(/type="datetime-local"/g)?.length, 5)
  assert.doesNotMatch(timingSource, /\$fetch|useRoute|useRouter|buildPayload|validateDateRange/)
})

test('relation editor owns maintained department, guide, place and source selectors', () => {
  assert.match(relationsSource, /defineModel<ProcedureForm>\('form', \{ required: true \}\)/)
  assert.match(relationsSource, /departmentOptions: ProcedureSelectOption\[\]/)
  assert.match(relationsSource, /sourceOptions: ProcedureSelectOption\[\]/)
  for (const label of ['负责部门', '相关指南', '流程涉及地点', '核验来源']) {
    assert.match(relationsSource, new RegExp(`label="${label}"`))
    assert.match(relationsSource, new RegExp(`aria-label="${label}"`))
  }
  assert.equal(relationsSource.match(/\bmultiple\b/g)?.length, 2)
  assert.match(relationsSource, /:loading="referencesLoading"/)
  assert.doesNotMatch(relationsSource, /\$fetch|useRoute|useRouter|buildPayload/)
})

test('step editor exposes every ordered step field through typed props and events', () => {
  assert.match(stepsSource, /defineProps<\{/)
  assert.match(stepsSource, /steps: ProcedureStepForm\[\]/)
  assert.match(stepsSource, /const emit = defineEmits<\{/)
  assert.match(stepsSource, /move: \[index: number, direction: -1 \| 1\]/)
  assert.match(stepsSource, /toggleAudience: \[target: ProcedureStepForm/)
  for (const label of ['步骤标题', '步骤说明', '适用人群', '信息状态', '时间说明', '办理地点', '负责部门', '线上办理链接']) {
    assert.match(stepsSource, new RegExp(`label="${label}"`))
  }
  assert.match(stepsSource, /:loading="referencesLoading"/)
  assert.doesNotMatch(stepsSource, /\$fetch|useRoute|useRouter|buildPayload/)
})

test('material editor owns tri-state requirements and every ordered material field', () => {
  assert.match(materialsSource, /materials: ProcedureMaterialForm\[\]/)
  assert.match(materialsSource, /setRequired: \[target: ProcedureMaterialForm, value: unknown\]/)
  assert.match(materialsSource, /function requiredValue\(value: boolean \| null\)/)
  assert.match(materialsSource, /emit\('setRequired', material, value\)/)
  for (const label of ['材料名称', '材料说明', '适用人群', '信息状态', '是否必需', '提交地点', '负责部门']) {
    assert.match(materialsSource, new RegExp(`label="${label}"`))
  }
  assert.doesNotMatch(materialsSource, /\$fetch|useRoute|useRouter|buildPayload/)
})

test('procedure editor form contracts are shared instead of duplicated across components', () => {
  assert.match(typesSource, /export interface ProcedureStepForm/)
  assert.match(typesSource, /export interface ProcedureMaterialForm/)
  assert.match(typesSource, /export interface ProcedureSelectOption/)
  assert.match(typesSource, /export interface ProcedureForm/)
  assert.match(formModelSource, /from '~\/components\/admin\/procedure-editor-types'/)
  assert.doesNotMatch(pageSource, /interface Procedure(Form|StepForm|MaterialForm)/)
  assert.match(stepsSource, /from '\.\/procedure-editor-types'/)
  assert.match(materialsSource, /from '\.\/procedure-editor-types'/)
  assert.match(editorShellSource, /from '\.\/procedure-editor-types'/)
})
