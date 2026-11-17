import { competitionEmailSendSchema } from '../../../../../../shared/schemas/server'
import {
  buildEmailSendPlan,
  buildEmailVariables,
  ensureReceiptToken,
  openResultQuery,
  receiptPath,
  competitionEmailBodyToHtml,
  emailImageAttachments,
  ensureCompetitionEvent,
  getRoundByKey,
  loadEmailImagesForBody,
  recordEmailSend,
  renderCompetitionEmailTemplate
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { mailerConfigFromEnv, resetMailTransport, sendMailMessage, verifyMailTransport } from '../../../../../utils/mailer'
import { parseBody } from '../../../../../utils/validation'

// QQ 邮箱对「短时间大量登录/发信」很敏感：连发过快会回 535 login frequency limited，
// 之后整批全挂。单封间隔 1.2 秒，失败按 4s/10s 退避重试两次，连续 3 人登录失败就停手。
const SEND_INTERVAL_MS = 1200
const RETRY_DELAYS_MS = [4000, 10000]
const AUTH_FAILURE_LIMIT = 3

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, competitionEmailSendSchema)

  const mailerConfig = mailerConfigFromEnv()
  if (!mailerConfig) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Mail service is not configured',
      data: { code: 'MAILER_NOT_CONFIGURED', message: '邮件服务未配置：请在 shared/.env 设置 QQ_EMAIL / QQ_EMAIL_AUTH_CODE 后重启服务' }
    })
  }

  const competition = ensureCompetitionEvent(client, contentId)
  const round = getRoundByKey(client, competition.id, roundKey)
  const plan = buildEmailSendPlan(client, competition.id, round, input.scope, input.singerIds)

  if (plan.recipients.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'No email recipients',
      data: {
        code: 'EMAIL_NO_RECIPIENTS',
        message: `没有可发送的选手（无邮箱 ${plan.skippedNoEmail} 人${plan.skippedAlreadySent > 0 ? `，已发送过 ${plan.skippedAlreadySent} 人` : ''}）`
      }
    })
  }

  const siteUrl = String(useRuntimeConfig(event).public.siteUrl || '').replace(/\/$/, '')
  const receiptTargets: string[] = []
  const failures: Array<{ name: string, email: string, error: string }> = []
  let sent = 0
  let failed = 0

  // 开批前先探一次 SMTP：登不上就直接报错，不要逐封试到限流
  try {
    await verifyMailTransport(mailerConfig)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    resetMailTransport(mailerConfig)
    throw createError({
      statusCode: 502,
      statusMessage: 'SMTP login failed',
      data: {
        code: 'EMAIL_LOGIN_FAILED',
        message: `邮箱登录失败：${detail.slice(0, 120)}`
      }
    })
  }

  let authFailures = 0
  let aborted = 0
  for (const recipient of plan.recipients) {
    if (authFailures >= AUTH_FAILURE_LIMIT) {
      aborted += 1
      failures.push({ name: recipient.singer.name, email: recipient.singer.email!, error: '登录被邮箱限流，本封未发送' })
      continue
    }
    const token = ensureReceiptToken(client, competition.id, roundKey, recipient.singer.id)
    const receiptUrl = `${siteUrl}${receiptPath(token)}`
    const variables = buildEmailVariables(round, recipient.entry, recipient.singer, {
      edition: competition.edition,
      receiptUrl,
      qqGroupUrl: competition.qqGroupUrl,
      songUrl: `${siteUrl}/singer/song`
    })
    const subject = renderCompetitionEmailTemplate(plan.template.subject, variables)
    const body = renderCompetitionEmailTemplate(plan.template.body, variables)
    const images = loadEmailImagesForBody(client, competition.id, body)
    const attachments = emailImageAttachments(body, images)
    const html = competitionEmailBodyToHtml(body, images, receiptUrl, competition.qqGroupUrl, `${siteUrl}/singer/song`)
    let lastError = ''
    let delivered = false
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        await sendMailMessage(mailerConfig, {
          to: recipient.singer.email!,
          subject,
          text: body,
          html,
          attachments
        }, { fromName: '仰恩大学音乐协会' })
        delivered = true
        break
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error)
        // 坏连接留在池里会让后面每一封都失败，这里直接弃掉，下次重连
        resetMailTransport(mailerConfig)
        const transient = /535|Login fail|ETIMEDOUT|ECONNRESET|ECONNABORTED|EPIPE|ESOCKET|socket hang up|try again|busy/i.test(lastError)
        const delay = RETRY_DELAYS_MS[attempt]
        if (!transient || delay === undefined) break
        await sleep(delay)
      }
    }
    if (delivered) {
      recordEmailSend(client, competition.id, roundKey, recipient.singer.id, recipient.singer.email!, 'sent', null)
      receiptTargets.push(recipient.singer.name)
      authFailures = 0
      sent += 1
    } else {
      recordEmailSend(client, competition.id, roundKey, recipient.singer.id, recipient.singer.email!, 'failed', lastError.slice(0, 500))
      failed += 1
      if (/535|Login fail|login frequency/i.test(lastError)) authFailures += 1
      if (failures.length < 50) failures.push({ name: recipient.singer.name, email: recipient.singer.email!, error: lastError.slice(0, 200) })
    }
    await sleep(SEND_INTERVAL_MS)
  }

  if (sent > 0) openResultQuery(client, round)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.email_send',
    entityType: 'competition_round',
    entityId: round.id,
    details: { roundKey, scope: input.scope, sent, failed, aborted, skippedNoEmail: plan.skippedNoEmail, skippedAlreadySent: plan.skippedAlreadySent }
  })

  return {
    sent,
    failed,
    aborted,
    skippedNoEmail: plan.skippedNoEmail,
    skippedAlreadySent: plan.skippedAlreadySent,
    failures
  }
})
