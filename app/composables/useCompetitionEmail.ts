import type { Ref } from 'vue'
import type {
  CompetitionAdminPayload,
  CompetitionEmailImage,
  CompetitionEmailRoundKey,
  CompetitionRoundEntry,
  CompetitionRoundView,
  CompetitionSinger
} from '~~/shared/types'
import { adminFetch } from '~~/app/utils/admin-request'
import { apiErrorMessage } from './useCompetitionRoster'

type EmailScope = 'all' | 'qualified' | 'unqualified'

export interface UseCompetitionEmailOptions {
  payload: Ref<CompetitionAdminPayload | null>
  singers: Readonly<Ref<CompetitionSinger[]>>
  load: () => Promise<void>
  toast: ReturnType<typeof useToast>
}

/** 邮件通知簇：模板编辑、占位符与插图、保存模板、测试发送、按范围群发结果。 */
export function useCompetitionEmail(options: UseCompetitionEmailOptions) {
  const { payload, singers, load, toast } = options

  const emailRound = ref<CompetitionEmailRoundKey>('prelim')
  const emailScope = ref<EmailScope>('all')
  /** 发送前二次确认：列出这次到底发给谁。 */
  const sendConfirmOpen = ref(false)
  const sendConfirmNames = ref<string[]>([])
  const sendConfirmWithoutEmail = ref(0)
  const sendConfirmAlreadySent = ref(0)
  const emailSavingTemplate = ref(false)
  const emailSending = ref(false)
  const emailTesting = ref(false)
  const emailTestAddress = ref('')
  const emailBodyRef = ref<HTMLTextAreaElement | null>(null)
  const emailImageInput = ref<HTMLInputElement | null>(null)
  const emailImageUploading = ref(false)
  const emailImageDeletingId = ref('')

  const emailImages = computed<CompetitionEmailImage[]>(() => payload.value?.email.images ?? [])

  /** 邮件只覆盖初赛/复赛/决赛三轮，决赛第二轮没有模板与发送记录。 */
  const emailRounds = computed(() => (payload.value?.rounds ?? [])
    .filter((round): round is CompetitionRoundView & { key: CompetitionEmailRoundKey } => round.key !== 'final2'))

  // -- 邮件通知 ------------------------------------------------------------------

  const emailTemplate = computed(() => payload.value?.email.templates[emailRound.value]
    ?? { roundKey: emailRound.value, subject: '', body: '' })
  const emailStats = computed(() => payload.value?.email.stats[emailRound.value]
    ?? { sent: 0, failed: 0, lastSentAt: null as number | null })
  const emailRoundView = computed<CompetitionRoundView | null>(() =>
    emailRounds.value.find(round => round.key === emailRound.value) ?? null)

  function emailPool(scope: EmailScope): CompetitionRoundEntry[] {
    const round = emailRoundView.value
    if (!round) return []
    // 与后端一致：晋级以「晋级名单里勾选的人」为准（advanced === 1），
    // 不能再按名次 qualified 算，否则后台显示的封数会和实际发送对象对不上。
    if (scope === 'qualified') return round.entries.filter(entry => entry.advanced === 1)
    if (scope === 'unqualified') return round.entries.filter(entry => entry.advanced !== 1 && !entry.forfeited)
    return round.entries
  }

  const emailSentIds = computed(() => new Set((payload.value?.email.latest ?? [])
    .filter(record => record.roundKey === emailRound.value && record.status === 'sent')
    .map(record => record.singerId)))

  function emailCountWithEmail(scope: EmailScope): number {
    return emailPool(scope).filter(entry => singers.value.find(s => s.id === entry.singer.id)?.email).length
  }

  function emailCountWithoutEmail(scope: EmailScope): number {
    return emailPool(scope).filter(entry => !singers.value.find(s => s.id === entry.singer.id)?.email).length
  }

  const emailAlreadySentCount = computed(() =>
    emailPool(emailScope.value).filter(entry => emailSentIds.value.has(entry.singer.id)).length)

  const emailLatestRows = computed(() => (payload.value?.email.latest ?? [])
    .filter(record => record.roundKey === emailRound.value)
    .map(record => ({ ...record, name: singers.value.find(s => s.id === record.singerId)?.name ?? '—' })))

  function insertPlaceholder(key: string): void {
    insertBodyText(key)
  }

  /** 在正文光标处插入文本（占位符与图片标记共用）。 */
  function insertBodyText(text: string): void {
    const template = emailTemplate.value
    if (!template) return
    const el = emailBodyRef.value
    if (!el) {
      template.body += text
      return
    }
    const start = el.selectionStart ?? template.body.length
    const end = el.selectionEnd ?? start
    template.body = template.body.slice(0, start) + text + template.body.slice(end)
    nextTick(() => {
      el.focus()
      el.setSelectionRange(start + text.length, start + text.length)
    })
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || '').replace(/^data:[^;]+;base64,/, ''))
      reader.onerror = () => reject(new Error('读取图片失败'))
      reader.readAsDataURL(file)
    })
  }

  function pickEmailImage(): void {
    emailImageInput.value?.click()
  }

  async function uploadEmailImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    if (file.size > 4 * 1024 * 1024) {
      toast.add({ title: '图片不能超过 4MB', color: 'warning' })
      return
    }
    emailImageUploading.value = true
    try {
      const data = await readFileAsBase64(file)
      const result = await adminFetch<{ image: CompetitionEmailImage, payload: CompetitionAdminPayload }>(
        `/api/admin/competition/email/${emailRound.value}/images`,
        { method: 'POST', body: { filename: file.name, mime: file.type, data } }
      )
      if (payload.value) payload.value.email.images = result.payload.email.images
      insertBodyText(`[[图片:${result.image.id}]]`)
      toast.add({ title: '图片已上传', color: 'success' })
    } catch (error) {
      toast.add({ title: '上传失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      emailImageUploading.value = false
    }
  }

  async function removeEmailImage(image: CompetitionEmailImage): Promise<void> {
    if (emailImageDeletingId.value) return
    emailImageDeletingId.value = image.id
    try {
      const result = await adminFetch<{ payload: CompetitionAdminPayload }>(
        `/api/admin/competition/email/${emailRound.value}/images/${image.id}`,
        { method: 'DELETE' }
      )
      if (payload.value) payload.value.email.images = result.payload.email.images
      const marker = `[[图片:${image.id}]]`
      if (emailTemplate.value && emailTemplate.value.body.includes(marker)) {
        emailTemplate.value.body = emailTemplate.value.body.split(marker).join('')
        toast.add({ title: '图片已删除', description: '引用已一并清除。', color: 'success' })
      } else {
        toast.add({ title: '图片已删除', color: 'success' })
      }
    } catch (error) {
      toast.add({ title: '删除失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      emailImageDeletingId.value = ''
    }
  }

  async function saveEmailTemplate(): Promise<void> {
    const template = emailTemplate.value
    if (!template || emailSavingTemplate.value) return
    if (!template.subject.trim() || !template.body.trim()) {
      toast.add({ title: '邮件主题和正文不能为空', color: 'warning' })
      return
    }
    emailSavingTemplate.value = true
    try {
      const result = await adminFetch<{ template: { roundKey: CompetitionEmailRoundKey, subject: string, body: string } }>(
        `/api/admin/competition/email/${template.roundKey}`,
        { method: 'PUT', body: { subject: template.subject.trim(), body: template.body.trim() } }
      )
      if (payload.value) {
        payload.value.email.templates[result.template.roundKey] = result.template
      }
      toast.add({ title: '邮件模板已保存', color: 'success' })
    } catch (error) {
      toast.add({ title: '保存失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      emailSavingTemplate.value = false
    }
  }

  async function sendEmailTest(): Promise<void> {
    if (emailTesting.value) return
    const address = emailTestAddress.value.trim()
    if (!address) {
      toast.add({ title: '请填写测试邮箱', color: 'warning' })
      return
    }
    emailTesting.value = true
    try {
      await adminFetch(`/api/admin/competition/email/${emailRound.value}/test`, {
        method: 'POST',
        body: { email: address }
      })
      toast.add({ title: '测试邮件已发送', description: `请查收 ${address}（注意垃圾箱）`, color: 'success' })
    } catch (error) {
      toast.add({ title: '测试发送失败', description: apiErrorMessage(error, '请检查邮件配置。'), color: 'warning' })
    } finally {
      emailTesting.value = false
    }
  }

  /** 点「一键发送」先弹名单，确认后才真正发。 */
  function openSendConfirm(): void {
    if (emailSending.value) return
    const count = emailCountWithEmail(emailScope.value)
    if (count <= 0) {
      toast.add({ title: '当前范围没有可发送的选手邮箱', color: 'warning' })
      return
    }
    const names = emailPool(emailScope.value)
      .filter(entry => singers.value.find(s => s.id === entry.singer.id)?.email)
      .map(entry => singers.value.find(s => s.id === entry.singer.id)?.name ?? '—')
    const alreadyIds = emailSentIds.value
    sendConfirmNames.value = names
    sendConfirmAlreadySent.value = emailPool(emailScope.value)
      .filter(entry => alreadyIds.has(entry.singer.id)).length
    sendConfirmWithoutEmail.value = emailCountWithoutEmail(emailScope.value)
    sendConfirmOpen.value = true
  }

  async function sendEmails(): Promise<void> {
    if (emailSending.value) return
    const count = emailCountWithEmail(emailScope.value)
    if (count <= 0) {
      toast.add({ title: '当前范围没有可发送的选手邮箱', color: 'warning' })
      return
    }
    sendConfirmOpen.value = false

    emailSending.value = true
    try {
      const result = await adminFetch<{ sent: number, failed: number, failures: Array<{ name: string, email: string, error: string }> }>(
        `/api/admin/competition/email/${emailRound.value}/send`,
        { method: 'POST', body: { scope: emailScope.value } }
      )
      await load()
      toast.add({
        title: `发送完成：成功 ${result.sent}，失败 ${result.failed}`,
        description: result.failures.length > 0
          ? `失败示例：${result.failures[0]!.name}（${result.failures[0]!.email}）`
          : undefined,
        color: result.failed > 0 ? 'warning' : 'success'
      })
    } catch (error) {
      toast.add({ title: '发送失败', description: apiErrorMessage(error, '请检查邮件配置。'), color: 'warning' })
    } finally {
      emailSending.value = false
    }
  }

  return {
    emailRound,
    emailRounds,
    emailScope,
    emailSavingTemplate,
    emailSending,
    emailTesting,
    emailTestAddress,
    emailBodyRef,
    emailImageInput,
    emailImageUploading,
    emailImageDeletingId,
    emailImages,
    emailTemplate,
    emailStats,
    emailRoundView,
    emailPool,
    emailSentIds,
    emailCountWithEmail,
    emailCountWithoutEmail,
    emailAlreadySentCount,
    emailLatestRows,
    insertPlaceholder,
    insertBodyText,
    readFileAsBase64,
    pickEmailImage,
    uploadEmailImage,
    removeEmailImage,
    saveEmailTemplate,
    sendEmailTest,
    sendEmails,
    openSendConfirm,
    sendConfirmOpen,
    sendConfirmNames,
    sendConfirmAlreadySent,
    sendConfirmWithoutEmail
  }
}
