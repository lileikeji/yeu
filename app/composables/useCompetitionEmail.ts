import type { Ref } from 'vue'
import type {
  CompetitionAdminPayload,
  CompetitionEmailImage,
  CompetitionRoundEntry,
  CompetitionRoundKey,
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

  const emailRound = ref<CompetitionRoundKey>('prelim')
  const emailScope = ref<EmailScope>('all')
  const emailSavingTemplate = ref(false)
  const emailSending = ref(false)
  const emailTesting = ref(false)
  const emailTestAddress = ref('')
  const emailBodyRef = ref<HTMLTextAreaElement | null>(null)
  const emailImageInput = ref<HTMLInputElement | null>(null)
  const emailImageUploading = ref(false)
  const emailImageDeletingId = ref('')

  const emailImages = computed<CompetitionEmailImage[]>(() => payload.value?.email.images ?? [])

  // -- 邮件通知 ------------------------------------------------------------------

  const emailTemplate = computed(() => payload.value?.email.templates[emailRound.value]
    ?? { roundKey: emailRound.value, subject: '', body: '' })
  const emailStats = computed(() => payload.value?.email.stats[emailRound.value]
    ?? { sent: 0, failed: 0, lastSentAt: null as number | null })
  const emailRoundView = computed<CompetitionRoundView | null>(() =>
    payload.value?.rounds.find(round => round.key === emailRound.value) ?? null)

  function emailPool(scope: EmailScope): CompetitionRoundEntry[] {
    const round = emailRoundView.value
    if (!round) return []
    if (scope === 'qualified') return round.entries.filter(entry => entry.qualified)
    if (scope === 'unqualified') return round.entries.filter(entry => !entry.qualified && !entry.forfeited)
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
      toast.add({ title: '图片已上传', description: '已插入正文光标处，可拖动位置。', color: 'success' })
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
        toast.add({ title: '图片已删除', description: '正文里的引用也一并清掉了，记得保存模板。', color: 'success' })
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
      const result = await adminFetch<{ template: { roundKey: CompetitionRoundKey, subject: string, body: string } }>(
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

  async function sendEmails(): Promise<void> {
    if (emailSending.value) return
    const count = emailCountWithEmail(emailScope.value)
    if (count <= 0) {
      toast.add({ title: '当前范围没有可发送的选手邮箱', color: 'warning' })
      return
    }
    const roundTitle = emailRoundView.value?.title ?? ''
    const already = emailAlreadySentCount.value
    const withoutEmail = emailCountWithoutEmail(emailScope.value)
    const summary = [
      `将向 ${count} 位选手发送「${roundTitle}」结果邮件。`,
      already > 0 ? `其中 ${already} 位已发送过，会被自动跳过。` : '',
      withoutEmail > 0 ? `另有 ${withoutEmail} 位未填邮箱，将跳过。` : ''
    ].filter(Boolean).join('\n')
    if (!window.confirm(`${summary}\n\n确定发送？`)) return

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
    sendEmails
  }
}
