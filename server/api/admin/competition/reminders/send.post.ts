import {
  buildReminderPlan,
  competitionEmailBodyToHtml,
  getReminderTemplate,
  ensureCompetitionEvent,
  recordEmailSend,
  renderCompetitionEmailTemplate
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'
import { mailerConfigFromEnv, sendMailMessage } from '../../../../utils/mailer'

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** 一键提醒：给「预报名了但没签到」的人发提醒邮件（模板单独设置）。 */
export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)

  const mailerConfig = mailerConfigFromEnv()
  if (!mailerConfig) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Mail service is not configured',
      data: { code: 'MAILER_NOT_CONFIGURED', message: '邮件服务未配置：请在 shared/.env 设置 QQ_EMAIL / QQ_EMAIL_AUTH_CODE 后重启服务' }
    })
  }

  const competition = ensureCompetitionEvent(client, contentId)
  const template = getReminderTemplate(client, competition.id)
  const plan = buildReminderPlan(client, competition.id)
  if (plan.recipients.length === 0) {
    throw createError({
      statusCode: 422,
      statusMessage: 'No email recipients',
      data: {
        code: 'EMAIL_NO_RECIPIENTS',
        message: `没有要提醒的人（已签到 ${plan.skippedCheckedIn} 人，没填邮箱 ${plan.skippedNoEmail} 人）`
      }
    })
  }

  let sent = 0
  let failed = 0
  const failures: Array<{ name: string, email: string, error: string }> = []
  for (const recipient of plan.recipients) {
    const variables = {
      姓名: recipient.name,
      歌曲: recipient.song || '—',
      届次: competition.edition || '新声歌手大赛',
      加群按钮: competition.qqGroupUrl || ''
    }
    const subject = renderCompetitionEmailTemplate(template.subject, variables)
    const body = renderCompetitionEmailTemplate(template.body, variables)
    try {
      await sendMailMessage(mailerConfig, {
        to: recipient.email,
        subject,
        text: body,
        html: competitionEmailBodyToHtml(body, [], '', competition.qqGroupUrl)
      }, { fromName: '仰恩大学音乐协会' })
      recordEmailSend(client, competition.id, 'prelim', null, recipient.email, 'sent', null)
      sent += 1
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error)
      recordEmailSend(client, competition.id, 'prelim', null, recipient.email, 'failed', messageText.slice(0, 500))
      failed += 1
      if (failures.length < 50) failures.push({ name: recipient.name, email: recipient.email, error: messageText.slice(0, 200) })
    }
    await sleep(250)
  }

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.reminder_send',
    entityType: 'competition_event',
    entityId: competition.id,
    details: { sent, failed }
  })

  return { sent, failed, failures, skippedCheckedIn: plan.skippedCheckedIn, skippedNoEmail: plan.skippedNoEmail }
})
