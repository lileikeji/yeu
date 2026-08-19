import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isMemoryPreferenceStatement, splitCompoundIntentQueries } from '../server/modules/assistant/service'

test('splitCompoundIntentQueries: sentence-level compound', () => {
  assert.deepEqual(
    splitCompoundIntentQueries('助学金怎么申请？报销需要什么材料？'),
    ['助学金怎么申请', '报销需要什么材料']
  )
  // Two clear intents.
  assert.deepEqual(
    splitCompoundIntentQueries('助学金怎么申请？转专业什么时候开始？'),
    ['助学金怎么申请', '转专业什么时候开始']
  )
  // A trailing verb-head continuation folds into one intent (empty = stays intact).
  assert.deepEqual(splitCompoundIntentQueries('转专业怎么申请。需要什么材料'), [])
})

test('splitCompoundIntentQueries: 和-list compound', () => {
  assert.deepEqual(
    splitCompoundIntentQueries('宿舍和军训怎么安排'),
    ['宿舍', '军训怎么安排']
  )
})

test('splitCompoundIntentQueries: single intent stays intact', () => {
  assert.deepEqual(splitCompoundIntentQueries('什么时候开学'), [])
  assert.deepEqual(splitCompoundIntentQueries('助学金多少钱'), [])
  // Too short to be compound.
  assert.deepEqual(splitCompoundIntentQueries('好吗'), [])
})

test('isMemoryPreferenceStatement: accepts pure self-preference statements', () => {
  assert.equal(isMemoryPreferenceStatement('我喜欢在晚上学习效率更高'), '我喜欢在晚上学习效率更高')
  assert.equal(isMemoryPreferenceStatement('我习惯早起到操场跑步'), '我习惯早起到操场跑步')
  assert.equal(isMemoryPreferenceStatement('我住E栋'), '我住E栋')
})

test('isMemoryPreferenceStatement: rejects real questions', () => {
  assert.equal(isMemoryPreferenceStatement('什么时候开学？'), null)
  assert.equal(isMemoryPreferenceStatement('宿舍怎么办理入住'), null)
  assert.equal(isMemoryPreferenceStatement('我是新生，什么时候报到？'), null)
  assert.equal(isMemoryPreferenceStatement('助学金怎么申请'), null)
  // No self-preference marker at all.
  assert.equal(isMemoryPreferenceStatement('报到需要带什么材料'), null)
})
