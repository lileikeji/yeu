import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildFeedbackSubmitBody,
  canSubmitFeedback,
  createEmptyFeedbackFormState,
  feedbackDefaultFormCopy,
  feedbackMessageNeedsMoreDetail,
  feedbackPrivacyRequestFormCopy,
  feedbackReasonOptions,
  feedbackTargetIcons,
  feedbackTargetLabels,
  resolveFeedbackReasonType,
  resolveFeedbackFormCopy,
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
  assert.match(pageSource, /formCopy\.title/)
  assert.match(pageSource, /formCopy\.sidebarTitle/)
  assert.match(utilSource, /发现信息不对？告诉我们/)
  assert.match(utilSource, /写清楚这三点/)
  assert.doesNotMatch(pageSource, /确认顺序|交叉核对|待处理列表|发布到前台/)
})

test('feedback short fields keep a comfortable mobile touch height', () => {
  assert.equal((pageSource.match(/class="mt-2 min-h-11 w-full"/g) || []).length, 2)
  assert.equal((pageSource.match(/:ui="\{ base: 'min-h-11' \}"/g) || []).length, 2)
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
  assert.equal(feedbackReasonOptions.length, 7)
  assert.equal(feedbackReasonOptions[0]?.label, '地点名称或位置不对')
  assert.equal(feedbackReasonOptions[4]?.label, '提供更准确的链接')
  assert.ok(feedbackReasonOptions.some(option =>
    option.value === 'privacy_request' && option.label === '查询或删除我的信息'
  ))
  assert.equal(resolveFeedbackReasonType('procedure_error'), 'procedure_error')
  assert.equal(resolveFeedbackReasonType('privacy_request'), 'privacy_request')
  assert.equal(resolveFeedbackReasonType('unknown'), 'other')
  assert.equal(canSubmitFeedback('1234', false), false)
  assert.equal(canSubmitFeedback('12345', false), true)
  assert.equal(canSubmitFeedback('12345', true), false)
  assert.equal(feedbackMessageNeedsMoreDetail(''), false)
  assert.equal(feedbackMessageNeedsMoreDetail('  位置错  '), true)
  assert.equal(feedbackMessageNeedsMoreDetail('位置确实错了'), false)
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
  assert.deepEqual(createEmptyFeedbackFormState().reasonType, 'other')
  assert.deepEqual(createEmptyFeedbackFormState('procedure_error').reasonType, 'procedure_error')
})

test('feedback form explains the short-message requirement in plain language', () => {
  assert.match(utilSource, /至少写 5 个字/)
  assert.match(pageSource, /还需要再写一点才能提交。/)
  assert.match(pageSource, /messageNeedsMoreDetail/)
  assert.match(pageSource, /createEmptyFeedbackFormState\(initialReasonType\.value\)/)
})

test('privacy requests get a dedicated, plain-language form', () => {
  assert.equal(resolveFeedbackFormCopy('other'), feedbackDefaultFormCopy)
  assert.equal(resolveFeedbackFormCopy('privacy_request'), feedbackPrivacyRequestFormCopy)
  assert.equal(feedbackPrivacyRequestFormCopy.title, '查询或删除自己的信息')
  assert.equal(feedbackPrivacyRequestFormCopy.reasonLabel, '这次申请')
  assert.equal(feedbackPrivacyRequestFormCopy.submitLabel, '提交申请')
  assert.match(feedbackPrivacyRequestFormCopy.messageHint, /想查询还是删除/)
  assert.match(feedbackPrivacyRequestFormCopy.description, /不要填写密码、证件号码或完整网络地址/)
  assert.match(pageSource, /isPrivacyRequest/)
  assert.match(pageSource, /isDedicatedPrivacyRequest/)
  assert.match(pageSource, /resolveFeedbackFormCopy\(reasonType\.value\)/)
  assert.match(pageSource, /reasonType\.value === 'privacy_request'/)
  assert.match(pageSource, /initialReasonType\.value === 'privacy_request'/)
  assert.match(pageSource, /formCopy\.messagePlaceholder/)
  assert.match(pageSource, /formCopy\.contactPlaceholder/)
  assert.match(pageSource, /formCopy\.successTitle/)
  assert.match(pageSource, /aria-labelledby="feedback-reason-label"/)
  assert.match(pageSource, />\s*申请内容\s*</)
  assert.match(pageSource, /从“隐私说明”进入/)
  assert.doesNotMatch(feedbackPrivacyRequestFormCopy.description, /反馈对象|目标类型|请求类型/)
})
