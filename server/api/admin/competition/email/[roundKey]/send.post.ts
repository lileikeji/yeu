import { competitionEmailSendSchema } from '../../../../../../shared/schemas/server'
import {
  buildEmailSendPlan,
  buildEmailVariables,
  competitionEmailBodyToHtml,
  ensureCompetitionEvent,
  getRoundByKey,
  recordEmailSend,
  renderCompetitionEmailTemplate
} from '../../../../../modules/competition/service'
import { writeAudit } from '../../../../../utils/audit'
import {
  requireCompetitionRoundKey,
  resolveCompetitionContentId
} from '../../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../../utils/http'
import { mailerConfigFromEnv, sendMailMessage } from '../../../../../utils/mailer'
import { parseBody } from '../../../../../utils/validation'

const SEND_INTERVAL_MS = 250

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

  const failures: Array<{ name: string, email: string, error: string }> = []
  let sent = 0
  let failed = 0

  for (const recipient of plan.recipients) {
    const variables = buildEmailVariables(round, recipient.entry, recipient.singer)
    const subject = renderCompetitionEmailTemplate(plan.template.subject, variables)
    const body = renderCompetitionEmailTemplate(plan.template.body, variables)
    try {
      await sendMailMessage(mailerConfig, {
        to: recipient.singer.email!,
        subject,
        text: body,
        html: competitionEmailBodyToHtml(body)
      }, { fromName: '仰恩大学音乐协会' })
      recordEmailSend(client, competition.id, roundKey, recipient.singer.id, recipient.singer.email!, 'sent', null)
      sent += 1
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      recordEmailSend(client, competition.id, roundKey, recipient.singer.id, recipient.singer.email!, 'failed', messageText.slice(0, 500))
      failed += 1
      if (failures.length < 50) failures.push({ name: recipient.singer.name, email: recipient.singer.email!, error: messageText.slice(0, 200) })
    }
    await sleep(SEND_INTERVAL_MS)
  }

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.email_send',
    entityType: 'competition_round',
    entityId: round.id,
    details: { roundKey, scope: input.scope, sent, failed, skippedNoEmail: plan.skippedNoEmail, skippedAlreadySent: plan.skippedAlreadySent }
  })

  return {
    sent,
    failed,
    skippedNoEmail: plan.skippedNoEmail,
    skippedAlreadySent: plan.skippedAlreadySent,
    failures
  }
})
