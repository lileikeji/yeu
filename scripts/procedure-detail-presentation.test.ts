import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildProcedureChecklistStorageKey,
  buildProcedureDetailSources,
  buildProcedureMapLink,
  getProcedureEmptyMaterialText,
  getProcedureMaterialTitle,
  getProcedureNoticeText,
  parseProcedureChecklist,
  procedureAudienceLabels,
  procedureAudienceOptions,
  procedureMethodLabels,
  procedureStateLabels,
  serializeProcedureChecklist,
  sourceClaimForStudents,
  toggleProcedureStep
} from '../app/utils/procedure-detail-presentation'

const pageSource = readFileSync(resolve('app/pages/procedures/[slug].vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/procedure-detail-presentation.ts'), 'utf8')

test('procedure detail page is a thin shell over presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/procedure-detail-presentation['"]/)
  assert.match(pageSource, /getProcedureNoticeText/)
  assert.match(pageSource, /buildProcedureDetailSources/)
  assert.match(pageSource, /parseProcedureChecklist/)
  assert.match(pageSource, /toggleProcedureStep/)
  assert.match(pageSource, /buildProcedureMapLink/)
  assert.doesNotMatch(pageSource, /function sourceClaimForStudents/)
  assert.doesNotMatch(pageSource, /const audienceLabel = \{/)
  assert.doesNotMatch(pageSource, /const methodLabel = \{/)
  assert.doesNotMatch(pageSource, /const stateLabel = \{/)
  assert.match(utilSource, /export function getProcedureNoticeText/)
  assert.match(utilSource, /export function sourceClaimForStudents/)
  assert.match(utilSource, /export function parseProcedureChecklist/)
})

test('procedure presentation labels and audience options stay student-facing', () => {
  assert.equal(procedureAudienceLabels.undergraduate, '普通本科新生')
  assert.equal(procedureAudienceLabels.transfer, '专升本新生')
  assert.equal(procedureMethodLabels.mixed, '线上核对 + 到校办理')
  assert.equal(procedureStateLabels.confirmed, '已确认')
  assert.equal(procedureStateLabels['awaiting-notice'], '待通知')
  assert.deepEqual(procedureAudienceOptions.map(option => option.value), [
    'all',
    'undergraduate',
    'transfer'
  ])
})

test('procedure notice and material copy follow category and confirmation state', () => {
  assert.match(getProcedureNoticeText('arrival', 'partial'), /录取通知书/)
  assert.match(getProcedureNoticeText('campus-card', 'confirmed'), /部门最新通知/)
  assert.match(getProcedureNoticeText('campus-card', 'awaiting-notice'), /待通知/)
  assert.equal(getProcedureMaterialTitle('arrival'), '到校前需要准备')
  assert.equal(getProcedureMaterialTitle('campus-card'), '办理前先看是否需要材料')
  assert.match(getProcedureEmptyMaterialText('arrival'), /不会用往年材料填充/)
  assert.match(getProcedureEmptyMaterialText('campus-card'), /现场窗口要求/)
})

test('source claim rewrite and detail source mapping stay student-readable', () => {
  assert.equal(
    sourceClaimForStudents('官方入口与咨询边界'),
    '这条来源主要确认：官方入口与咨询方式和适用范围'
  )
  assert.equal(
    sourceClaimForStudents('报到流程与使用提醒'),
    '这条来源主要确认：报到办理流程与使用注意事项'
  )
  const sources = buildProcedureDetailSources([
    { id: 's1', title: '招生网', url: 'https://example.com', claimScope: '咨询边界' },
    { id: 's2', title: '无范围', url: null, claimScope: null }
  ])
  assert.deepEqual(sources, [
    {
      key: 's1',
      title: '招生网',
      url: 'https://example.com',
      note: '这条来源主要确认：咨询方式和适用范围'
    },
    {
      key: 's2',
      title: '无范围',
      url: null,
      note: null
    }
  ])
})

test('checklist parse/serialize and step toggle keep version and step id safety', () => {
  assert.equal(buildProcedureChecklistStorageKey('campus-card'), 'yeu:procedure-checklist:campus-card')
  assert.deepEqual(
    parseProcedureChecklist(
      { version: '2026-01-01', stepIds: ['a', 'bad', 1, 'b'] },
      '2026-01-01',
      ['a', 'b']
    ),
    ['a', 'b']
  )
  assert.deepEqual(
    parseProcedureChecklist({ version: 'old', stepIds: ['a'] }, 'new', ['a']),
    []
  )
  assert.deepEqual(
    parseProcedureChecklist('not-object', 'v', ['a']),
    []
  )
  assert.deepEqual(
    serializeProcedureChecklist('2026-01-01', ['a', 'b']),
    { version: '2026-01-01', stepIds: ['a', 'b'] }
  )
  assert.deepEqual(toggleProcedureStep(['a'], 'b'), ['a', 'b'])
  assert.deepEqual(toggleProcedureStep(['a', 'b'], 'a'), ['b'])
  assert.deepEqual(
    buildProcedureMapLink('campus-card', 'card-center', 'step-1'),
    {
      path: '/map',
      query: {
        place: 'card-center',
        from: '/procedures/campus-card#step-step-1'
      }
    }
  )
})
