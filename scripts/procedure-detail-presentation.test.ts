import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildProcedureChecklistStorageKey,
  buildProcedureChecklistStorageValue,
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
  resolveProcedureAudienceOptionPresentation,
  resolveProcedureAudienceRouteQuery,
  resolveProcedureChecklistFromStorageText,
  resolveProcedureInformationStateBadgeColor,
  resolveProcedureMaterialsCountBadge,
  resolveProcedureStepCompletionPresentation,
  serializeProcedureChecklist,
  shouldShowProcedureStepAudienceBadges,
  sourceClaimForStudents,
  studentFacingProcedureText,
  toggleProcedureStep
} from '../app/utils/procedure-detail-presentation'

const pageSource = readFileSync(resolve('app/pages/procedures/[slug].vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/procedure-detail-presentation.ts'), 'utf8')

test('procedure detail page is a thin shell over presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/procedure-detail-presentation['"]/)
  assert.match(pageSource, /getProcedureNoticeText/)
  assert.match(pageSource, /buildProcedureDetailSources/)
  assert.match(pageSource, /resolveProcedureChecklistFromStorageText/)
  assert.match(pageSource, /toggleProcedureStep/)
  assert.match(pageSource, /buildProcedureMapLink/)
  assert.match(pageSource, /resolveProcedureAudienceRouteQuery/)
  assert.match(pageSource, /resolveProcedureInformationStateBadgeColor/)
  assert.match(pageSource, /resolveProcedureMaterialsCountBadge/)
  assert.match(pageSource, /resolveProcedureStepCompletionPresentation/)
  assert.match(pageSource, /shouldShowProcedureStepAudienceBadges/)
  assert.doesNotMatch(pageSource, /function sourceClaimForStudents/)
  assert.doesNotMatch(pageSource, /informationState === 'confirmed' \? 'success'/)
  assert.doesNotMatch(pageSource, /JSON\.parse\(localStorage/)
  assert.doesNotMatch(pageSource, /delete query\.audience/)
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
  assert.equal(procedureStateLabels.confirmed, '信息明确')
  assert.equal(procedureStateLabels['awaiting-notice'], '等待学校通知')
  assert.deepEqual(procedureAudienceOptions.map(option => option.value), [
    'all',
    'undergraduate',
    'transfer'
  ])
})

test('procedure notice and material copy follow category and confirmation state', () => {
  assert.match(getProcedureNoticeText('arrival', 'partial'), /录取通知书/)
  assert.match(getProcedureNoticeText('campus-card', 'confirmed'), /最新通知/)
  assert.match(getProcedureNoticeText('campus-card', 'awaiting-notice'), /等学校通知/)
  assert.equal(getProcedureMaterialTitle('arrival'), '到校前需要准备')
  assert.equal(getProcedureMaterialTitle('campus-card'), '办理前先看是否需要材料')
  assert.match(getProcedureEmptyMaterialText('arrival'), /还没有公布/)
  assert.match(getProcedureEmptyMaterialText('campus-card'), /现场窗口的要求/)
  assert.equal(
    studentFacingProcedureText('说明已发布，工单状态待通知，入口仍待核验'),
    '说明已经公布，处理进度还要等学校通知，入口仍待确认'
  )
  assert.equal(
    studentFacingProcedureText('2026公开来源尚未列明个人材料，尚未从2026公开来源确认窗口'),
    '学校目前还没有列明个人材料，目前还没有从学校通知中确认窗口'
  )
})

test('source claim rewrite and detail source mapping stay student-readable', () => {
  assert.equal(
    sourceClaimForStudents('官方入口与咨询边界'),
    '这份说明可以确认：官方入口与咨询方式和适用范围'
  )
  assert.equal(
    sourceClaimForStudents('报到流程与使用提醒'),
    '这份说明可以确认：报到办理流程与使用注意事项'
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
      note: '这份说明可以确认：咨询方式和适用范围'
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

test('Stage 65 procedure presentation decisions stay pure and student-facing', () => {
  assert.equal(resolveProcedureInformationStateBadgeColor('confirmed'), 'success')
  assert.equal(resolveProcedureInformationStateBadgeColor('partial'), 'warning')
  assert.equal(resolveProcedureInformationStateBadgeColor(null), 'warning')
  assert.deepEqual(resolveProcedureMaterialsCountBadge(0), {
    color: 'warning',
    label: '暂未公布'
  })
  assert.deepEqual(resolveProcedureMaterialsCountBadge(3), {
    color: 'neutral',
    label: '3 项'
  })
  assert.deepEqual(
    resolveProcedureAudienceOptionPresentation('all', 'all'),
    { color: 'primary', variant: 'solid', ariaPressed: true }
  )
  assert.deepEqual(
    resolveProcedureAudienceOptionPresentation('all', 'undergraduate'),
    { color: 'neutral', variant: 'ghost', ariaPressed: false }
  )
  assert.equal(shouldShowProcedureStepAudienceBadges('all', 1, 2), true)
  assert.equal(shouldShowProcedureStepAudienceBadges('undergraduate', 1, 2), false)
  assert.equal(shouldShowProcedureStepAudienceBadges('all', 2, 2), false)
  assert.deepEqual(
    resolveProcedureStepCompletionPresentation(false, 2),
    {
      ariaLabel: '标记第2步完成',
      ariaPressed: false,
      icon: 'i-lucide-circle',
      titleClass: ''
    }
  )
  assert.deepEqual(
    resolveProcedureStepCompletionPresentation(true, 1),
    {
      ariaLabel: '取消完成第1步',
      ariaPressed: true,
      icon: 'i-lucide-circle-check-big',
      titleClass: 'line-through opacity-60'
    }
  )
  assert.deepEqual(
    resolveProcedureAudienceRouteQuery({ audience: 'transfer', q: 'x' }, 'all'),
    { q: 'x' }
  )
  assert.deepEqual(
    resolveProcedureAudienceRouteQuery({ q: 'x' }, 'undergraduate'),
    { q: 'x', audience: 'undergraduate' }
  )
  assert.deepEqual(
    resolveProcedureChecklistFromStorageText(
      JSON.stringify({ version: 'v1', stepIds: ['a', 'bad'] }),
      'v1',
      ['a']
    ),
    ['a']
  )
  assert.deepEqual(
    resolveProcedureChecklistFromStorageText('not-json', 'v1', ['a']),
    []
  )
  assert.equal(
    buildProcedureChecklistStorageValue('v1', ['a']),
    JSON.stringify({ version: 'v1', stepIds: ['a'] })
  )
  assert.match(utilSource, /export function resolveProcedureAudienceRouteQuery/)
  assert.match(utilSource, /export function resolveProcedureStepCompletionPresentation/)
})
