/**
 * 图形验证码（注册反扒）：自实现 SVG 验证码，无第三方依赖。
 *
 * - 挑战：GET /api/auth/captcha → { captchaId, svg }，文本 5 字符
 *   （去 I/O/0/1），10 分钟有效，一次性（校验后即删，失败也换码）。
 * - 存储：进程内 Map。单实例部署（SQLite 单写约定），重启失效即可，
 *   用户重新拉一张新图，不影响注册主链路。
 * - 反扒：答案 hash 存储；SVG 文本用随机旋转/位移 + 干扰线 + 噪点圆，
 *   机器识别成本足够挡住脚本批量发邮件。
 */
import { createHash, randomBytes, randomInt } from 'node:crypto'

const CAPTCHA_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CAPTCHA_LENGTH = 5
const CAPTCHA_TTL_MS = 10 * 60 * 1000
const CAPTCHA_MAX_ATTEMPTS = 5

interface CaptchaEntry {
  codeHash: string
  expiresAt: number
  attempts: number
}

const challenges = new Map<string, CaptchaEntry>()

export interface CaptchaChallenge {
  captchaId: string
  svg: string
}

function randomCode(): string {
  let code = ''
  for (let i = 0; i < CAPTCHA_LENGTH; i++) {
    code += CAPTCHA_ALPHABET[randomInt(CAPTCHA_ALPHABET.length)]
  }
  return code
}

/** 生成扭曲字符 SVG：每字符随机旋转 ±24°、纵向抖动 ±5、双色深灰。 */
function renderSvg(code: string): string {
  const width = 150
  const height = 44
  const colors = ['#334155', '#0f766e', '#4338ca', '#b91c1c', '#a16207']
  const chars = code.split('').map((char, index) => {
    const x = 16 + index * 26 + randomInt(-2, 3)
    const y = 30 + randomInt(-5, 6)
    const rotate = randomInt(-24, 25)
    const color = colors[randomInt(colors.length)]
    const size = randomInt(24, 30)
    return `<text x="${x}" y="${y}" fill="${color}" font-family="Georgia, 'Times New Roman', serif" font-size="${size}" font-weight="bold" transform="rotate(${rotate} ${x} ${y})">${char}</text>`
  }).join('')

  const lines = Array.from({ length: 4 }, () => {
    const x1 = randomInt(0, width)
    const y1 = randomInt(0, height)
    const x2 = randomInt(0, width)
    const y2 = randomInt(0, height)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#94a3b8" stroke-width="1" opacity="0.7"/>`
  }).join('')

  const dots = Array.from({ length: 30 }, () => {
    return `<circle cx="${randomInt(0, width)}" cy="${randomInt(0, height)}" r="1" fill="#94a3b8" opacity="0.6"/>`
  }).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="图形验证码"><rect width="${width}" height="${height}" fill="#f8fafc"/>${lines}${dots}${chars}</svg>`
}

export function createCaptchaChallenge(): CaptchaChallenge {
  // 顺手清理过期挑战，防 Map 无限增长
  const now = Date.now()
  for (const [id, entry] of challenges) {
    if (entry.expiresAt <= now) challenges.delete(id)
  }
  const code = randomCode()
  const captchaId = randomBytes(16).toString('base64url')
  challenges.set(captchaId, {
    codeHash: createHash('sha256').update(code).digest('hex'),
    expiresAt: now + CAPTCHA_TTL_MS,
    attempts: 0
  })
  return { captchaId, svg: renderSvg(code) }
}

/** 校验图形验证码：通过返回 true（一次性消耗）；失败/过期/超次返回 false。 */
export function verifyCaptcha(captchaId: string, answer: string): boolean {
  const id = captchaId.trim()
  const entry = challenges.get(id)
  if (!entry) return false
  if (entry.expiresAt <= Date.now() || entry.attempts >= CAPTCHA_MAX_ATTEMPTS) {
    challenges.delete(id)
    return false
  }
  entry.attempts += 1
  const answerHash = createHash('sha256')
    .update(answer.trim().toUpperCase())
    .digest('hex')
  if (answerHash !== entry.codeHash) return false
  challenges.delete(id)
  return true
}
