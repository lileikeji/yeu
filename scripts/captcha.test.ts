import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { createCaptchaChallenge, verifyCaptcha } from '../server/utils/captcha'

test('captcha: 生成的 SVG 含 5 个字符文本，challenge 可校验', () => {
  const { captchaId, svg } = createCaptchaChallenge()
  assert.match(svg, /<svg/)
  const textCount = (svg.match(/<text /g) || []).length
  assert.equal(textCount, 5)
  assert.equal(verifyCaptcha(captchaId, '随便填'), false)
})

test('captcha: 正确答案一次性通过，重复使用失败', () => {
  const { captchaId, svg } = createCaptchaChallenge()
  // 从 SVG 里抠出字符重建答案（模拟用户看图识别）
  const chars = [...svg.matchAll(/>([A-Z2-9])<\/text>/g)].map(match => match[1]!)
  assert.equal(chars.length, 5)
  const answer = chars.join('')
  const codeHash = createHash('sha256').update(answer).digest('hex')
  // 校验走 hash——直接用答案验证
  assert.equal(verifyCaptcha(captchaId, answer), true)
  assert.equal(verifyCaptcha(captchaId, answer), false, 'one-shot: second use fails')
  assert.ok(codeHash)
})

test('captcha: 未知 id 与大小写不敏感答案', () => {
  assert.equal(verifyCaptcha('nonexistent-id', 'AAAAA'), false)
  const { captchaId, svg } = createCaptchaChallenge()
  const chars = [...svg.matchAll(/>([A-Z2-9])<\/text>/g)].map(match => match[1]!)
  const answer = chars.join('')
  // 小写答案也应通过（verify 内部统一大写）
  assert.equal(verifyCaptcha(captchaId, answer.toLowerCase()), true)
})
