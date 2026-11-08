import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findBannedWord } from '../shared/constants/chat-banned-words'

test('banned-words: 命中广告类并返回类别', () => {
  const hit = findBannedWord('需要的加微信联系我')
  assert.ok(hit)
  assert.equal(hit.label, '广告代购')
})

test('banned-words: 英文词整词匹配、大小写不敏感', () => {
  assert.ok(findBannedWord('I want to 加V quickly'))
  // 整词边界：单词内部的字母组合不误伤
  assert.equal(findBannedWord('今天下午班级集体活动'), null)
})

test('banned-words: 正常聊天不命中', () => {
  assert.equal(findBannedWord('这趟车挺准时的，师傅很客气'), null)
  assert.equal(findBannedWord('食堂二楼新开的窗口好吃'), null)
  assert.equal(findBannedWord(''), null)
})

test('banned-words: 辱骂与诈骗类命中', () => {
  assert.equal(findBannedWord('你就是个傻逼')?.label, '辱骂攻击')
  assert.equal(findBannedWord('无抵押贷款秒批')?.label, '诈骗引流')
})
