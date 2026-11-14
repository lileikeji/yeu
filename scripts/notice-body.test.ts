import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  parseNoticeBodyLine,
  parseNoticeBodyLines
} from '../app/utils/notice-body'

test('notice body 把 **粗体** 切成 bold 段，其余保持原文', () => {
  assert.deepEqual(parseNoticeBodyLine('**重要**联系学长'), [
    { text: '重要', bold: true },
    { text: '联系学长', bold: false }
  ])
  assert.deepEqual(parseNoticeBodyLine('前**中**后'), [
    { text: '前', bold: false },
    { text: '中', bold: true },
    { text: '后', bold: false }
  ])
  assert.deepEqual(parseNoticeBodyLine('**整行**'), [
    { text: '整行', bold: true }
  ])
})

test('notice body 没有粗体时整行是一个明文段', () => {
  assert.deepEqual(parseNoticeBodyLine('欢迎使用迎新指南。'), [
    { text: '欢迎使用迎新指南。', bold: false }
  ])
  assert.deepEqual(parseNoticeBodyLine(''), [{ text: '', bold: false }])
})

test('notice body 单个星号或空粗体不做处理', () => {
  assert.deepEqual(parseNoticeBodyLine('*不是粗体*'), [
    { text: '*不是粗体*', bold: false }
  ])
  assert.deepEqual(parseNoticeBodyLine('****'), [
    { text: '****', bold: false }
  ])
})

test('notice body 按行切分，丢掉空行与首尾空白', () => {
  const lines = parseNoticeBodyLines('**第一行**\r\n\r\n  第二行  \n')
  assert.equal(lines.length, 2)
  assert.deepEqual(lines[0], [{ text: '第一行', bold: true }])
  assert.deepEqual(lines[1], [{ text: '第二行', bold: false }])
})

test('notice body 空值返回空数组', () => {
  assert.deepEqual(parseNoticeBodyLines(''), [])
  assert.deepEqual(parseNoticeBodyLines(null), [])
  assert.deepEqual(parseNoticeBodyLines(undefined), [])
})

test('公告页与校园页都用 PublicNoticeBody 渲染正文，不再直接插值 body', () => {
  const noticesPage = readFileSync(resolve('app/pages/notices/index.vue'), 'utf8')
  const campusPage = readFileSync(resolve('app/pages/campus.vue'), 'utf8')
  const component = readFileSync(resolve('app/components/PublicNoticeBody.vue'), 'utf8')

  assert.match(noticesPage, /<PublicNoticeBody/)
  assert.match(campusPage, /<PublicNoticeBody/)
  assert.doesNotMatch(noticesPage, /\{\{\s*notice\.body\s*\}\}/)
  assert.doesNotMatch(campusPage, /\{\{\s*notice\.body\s*\}\}/)
  assert.doesNotMatch(component, /v-html/)
  assert.match(component, /parseNoticeBodyLines/)
})
