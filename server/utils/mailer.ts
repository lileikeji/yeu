/**
 * SMTP 邮件发送（注册验证码）。
 *
 * 配置沿用 chat.lileikeji.top 同款环境变量命名（QQ 邮箱 SMTP + 授权码）：
 *   QQ_EMAIL=发件邮箱  QQ_EMAIL_AUTH_CODE=授权码
 *   QQ_SMTP_HOST=smtp.qq.com  QQ_SMTP_PORT=465(SSL)
 * 生产写在 /www/wwwroot/yeu/shared/.env；缺任一项 = 邮件功能禁用（注册接口返回 503）。
 */
import nodemailer from 'nodemailer'

export interface MailerConfig {
  host: string
  port: number
  user: string
  pass: string
  from: string
}

export function mailerConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailerConfig | null {
  const user = String(env.QQ_EMAIL || '').trim()
  const pass = String(env.QQ_EMAIL_AUTH_CODE || '').trim()
  const host = String(env.QQ_SMTP_HOST || '').trim() || 'smtp.qq.com'
  const port = Number(env.QQ_SMTP_PORT || '') || 465
  if (!user || !pass) return null
  return { host, port, user, pass, from: user }
}

export function generateVerificationCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

/** 发验证码邮件；失败返回 false（不抛错，由调用方决定语义）。 */
export async function sendVerificationCodeEmail(
  config: MailerConfig,
  to: string,
  code: string,
  // 历史签名保留（无调用方使用）；下划线前缀满足 no-unused-vars。
  _options: { fetchless?: boolean } = {}
): Promise<boolean> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass }
    })
    await transporter.sendMail({
      from: `"仰恩新生指南" <${config.from}>`,
      to,
      subject: '注册验证码 · 仰恩新生指南',
      text: `你的注册验证码是 ${code}，10 分钟内有效。如果不是你本人操作，请忽略这封邮件。`,
      html: `<p>你的注册验证码是</p><p style="font-size:22px;font-weight:bold;letter-spacing:4px;">${code}</p><p>10 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p>`
    })
    return true
  } catch {
    return false
  }
}

/** 内嵌图片附件：cid 与邮件 HTML 里的 cid:xxx 对应。 */
export interface MailAttachment {
  filename: string
  mime: string
  /** base64（不含 data: 前缀） */
  data: string
  cid: string
}

/**
 * 通用邮件发送（歌手大赛结果通知等）。
 * fromName 可按业务场景定制（如「仰恩大学音乐协会」）。
 */
/**
 * 同一个发件账号复用一条带连接池的 SMTP 连接。
 *
 * 反例（曾经踩过）：每封邮件都 createTransport 一次，等于每封都重新登录一次；
 * 30 封连发时 QQ 邮箱会在第 10 封左右开始回 `535 Login fail ... login frequency limited`，
 * 之后整批全失败。这里按「账号+主机+端口」缓存 transporter，并把池限制成单连接顺序发。
 */
const transporterCache = new Map<string, ReturnType<typeof nodemailer.createTransport>>()

function getTransporter(config: MailerConfig): ReturnType<typeof nodemailer.createTransport> {
  const key = `${config.user}@${config.host}:${config.port}`
  const cached = transporterCache.get(key)
  if (cached) return cached
  const created = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    pool: true,
    maxConnections: 1,
    maxMessages: 200,
    auth: { user: config.user, pass: config.pass }
  })
  transporterCache.set(key, created)
  return created
}

export async function sendMailMessage(
  config: MailerConfig,
  message: { to: string, subject: string, html: string, text: string, attachments?: MailAttachment[] },
  options: { fromName?: string } = {}
): Promise<void> {
  const transporter = getTransporter(config)
  const attachments = (message.attachments ?? []).map(item => ({
    filename: item.filename,
    content: Buffer.from(item.data, 'base64'),
    contentType: item.mime,
    cid: item.cid,
    contentDisposition: 'inline' as const
  }))
  await transporter.sendMail({
    from: `"${options.fromName || '仰恩新生指南'}" <${config.from}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    ...(attachments.length > 0 ? { attachments } : {})
  })
}
