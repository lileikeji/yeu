import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildFeedbackSubmitBody,
  canSubmitFeedback,
  createEmptyFeedbackFormState,
  feedbackReasonOptions,
  feedbackTargetIcons,
  feedbackTargetLabels,
  resolveFeedbackReasonType,
  resolveFeedbackTargetDisplayName,
  resolveFeedbackTargetIcon,
  resolveFeedbackTargetId,
  resolveFeedbackTargetLabel,
  resolveFeedbackTargetName,
  resolveFeedbackTargetType,
  feedbackRouteQueryString
} from '../app/utils/feedback-presentation'

const pageSource = readFileSync(resolve('app/pages/feedback.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/feedback-presentation.ts'), 'utf8')

test('feedback page is a thin shell over feedback-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/feedback-presentation['"]/)
  assert.match(pageSource, /resolveFeedbackTargetType/)
  assert.match(pageSource, /buildFeedbackSubmitBody/)
  assert.match(pageSource, /canSubmitFeedback/)
  assert.match(pageSource, /createEmptyFeedbackFormState/)
  assert.doesNotMatch(pageSource, /const uuidPattern =/)
  assert.doesNotMatch(pageSource, /const reasonOptions = \[/)
  assert.match(utilSource, /export function resolveFeedbackTargetType/)
  assert.match(utilSource, /export function buildFeedbackSubmitBody/)
})

test('feedback target resolution requires typed target and uuid', () => {
  const uuid = '33333333-3333-4333-8333-333333333331'
  assert.equal(feedbackRouteQueryString(['place']), 'place')
  assert.equal(feedbackRouteQueryString(undefined), '')
  assert.equal(resolveFeedbackTargetType('place', uuid), 'place')
  assert.equal(resolveFeedbackTargetType('place', 'not-uuid'), 'general')
  assert.equal(resolveFeedbackTargetType('general', uuid), 'general')
  assert.equal(resolveFeedbackTargetId('place', uuid), uuid)
  assert.equal(resolveFeedbackTargetId('general', uuid), null)
  assert.equal(resolveFeedbackTargetName('place', '  宿舍楼  '), '宿舍楼')
  assert.equal(resolveFeedbackTargetName('general', '宿舍楼'), '')
  assert.equal(resolveFeedbackTargetLabel('procedure'), '办事流程')
  assert.equal(resolveFeedbackTargetLabel('general'), '反馈对象')
  assert.equal(resolveFeedbackTargetIcon('content'), feedbackTargetIcons.content)
  assert.equal(resolveFeedbackTargetDisplayName('place', ''), '已选择的地点')
  assert.equal(resolveFeedbackTargetDisplayName('place', '旧区1号楼'), '旧区1号楼')
  assert.equal(feedbackTargetLabels.place, '地点')
})

test('feedback reason defaults and submit body normalize empty optional fields', () => {
  assert.equal(feedbackReasonOptions.length, 6)
  assert.equal(resolveFeedbackReasonType('procedure_error'), 'procedure_error')
  assert.equal(resolveFeedbackReasonType('unknown'), 'place_error')
  assert.equal(canSubmitFeedback('1234', false), false)
  assert.equal(canSubmitFeedback('12345', false), true)
  assert.equal(canSubmitFeedback('12345', true), false)
  assert.deepEqual(buildFeedbackSubmitBody({
    targetType: 'place',
    targetId: '33333333-3333-4333-8333-333333333331',
    reasonType: 'place_error',
    message: '  名称写错了  ',
    evidenceUrl: '  ',
    pageUrl: '/map',
    contact: '  ',
    website: ''
  }), {
    targetType: 'place',
    targetId: '33333333-3333-4333-8333-333333333331',
    reasonType: 'place_error',
    message: '名称写错了',
    evidenceUrl: null,
    pageUrl: '/map',
    contact: null,
    website: ''
  })
  assert.deepEqual(createEmptyFeedbackFormState().reasonType, 'place_error')
})
