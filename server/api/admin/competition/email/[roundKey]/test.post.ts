import { competitionEmailTestSchema } from '../../../../../../shared/schemas/server'
import {
  buildEmailVariables,
  competitionEmailBodyToHtml,
  emailImageAttachments,
  ensureCompetitionEvent,
  getEmailTemplate,
  getRoundByKey,
  loadEmailImagesForBody,
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

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event)
  const contentId = resolveCompetitionContentId(client, session)
  const roundKey = requireCompetitionRoundKey(event)
  const input = await parseBody(event, competitionEmailTestSchema)

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
  const template = getEmailTemplate(client, competition.id, roundKey)

  // 示例数据：让管理员直观确认占位符替换效果，不写入发送流水。
  const sampleEntry = {
    id: 'email-test',
    singer: {
      id: 'email-test',
      name: '张三',
      song: '示例歌曲',
      className: '26音乐学1班',
      remark: null,
      sortOrder: 1,
      createdAt: 0,
      updatedAt: 0
    },
    sortOrder: 1,
    contestDay: null,
    advancedFromRank: null,
    average: 88.88,
    scoreCount: 5,
    rank: 3,
    qualified: round.advanceCount !== null,
    forfeited: false
  }
  const sampleSinger = {
    ...sampleEntry.singer,
    studentNo: '20260001',
    phone: '13800000000',
    email: input.email,
    source: 'admin' as const,
    preRegistrationId: null
  }
  const variables = buildEmailVariables(round, sampleEntry, sampleSinger)
  const subject = renderCompetitionEmailTemplate(template.subject, variables)
  const body = renderCompetitionEmailTemplate(template.body, variables)
  const images = loadEmailImagesForBody(client, competition.id, body)

  await sendMailMessage(mailerConfig, {
    to: input.email,
    subject,
    text: body,
    html: competitionEmailBodyToHtml(body, images),
    attachments: emailImageAttachments(body, images)
  }, { fromName: '仰恩大学音乐协会' })

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.email_test',
    entityType: 'competition_round',
    entityId: round.id,
    details: { roundKey, to: input.email }
  })

  return { ok: true, subject, body }
})
