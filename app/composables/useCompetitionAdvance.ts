import type { Ref } from 'vue'
import type {
  CompetitionAdminPayload,
  CompetitionReceiptRow,
  CompetitionRoundView
} from '~~/shared/types'
import { adminFetch } from '~~/app/utils/admin-request'
import { apiErrorMessage } from './useCompetitionRoster'

export interface UseCompetitionAdvanceOptions {
  payload: Ref<CompetitionAdminPayload | null>
  activeRound: Readonly<Ref<CompetitionRoundView | null>>
  load: () => Promise<void>
  toast: ReturnType<typeof useToast>
}

/** 晋级名单确认、结果回执、预报名一键提醒、换届。 */
export function useCompetitionAdvance(options: UseCompetitionAdvanceOptions) {
  const { payload, activeRound, load, toast } = options

  const advanceBusyKey = ref('')
  const pairsBusyKey = ref('')
  const reminderSending = ref(false)
  const reminderSaving = ref(false)
  const reminderSubject = ref('')
  const reminderBody = ref('')
  const editionLabel = ref('')
  const editionCreating = ref(false)

  const advanceRows = computed(() => {
    const round = activeRound.value
    if (!round || !payload.value) return []
    return payload.value.advance[round.key] ?? []
  })

  const advanceConfirmed = computed(() => activeRound.value?.rosterConfirmedAt ?? null)

  const advanceCount = computed(() => advanceRows.value.filter(row => row.advanced).length)

  const duelPairs = computed(() => activeRound.value?.duelPairs ?? [])

  const duelResolved = computed(() => duelPairs.value.length > 0 && duelPairs.value.every(pair => pair.ready))

  const receipts = computed<CompetitionReceiptRow[]>(() => {
    const round = activeRound.value
    if (!round || !payload.value) return []
    return payload.value.receipts[round.key] ?? []
  })

  const receiptConfirmedCount = computed(() => receipts.value.filter(row => row.confirmedAt).length)

  function syncReminder(): void {
    const event = payload.value?.event
    if (!event) return
    if (!reminderSubject.value) reminderSubject.value = event.reminderSubject
    if (!reminderBody.value) reminderBody.value = event.reminderBody
  }

  async function postAdvance(roundKey: string, body: Record<string, unknown>): Promise<void> {
    advanceBusyKey.value = `${roundKey}:${String(body.action)}`
    try {
      const data = await adminFetch<{ payload: CompetitionAdminPayload }>(
        `/api/admin/competition/rounds/${roundKey}/advance`,
        { method: 'POST', body }
      )
      payload.value = data.payload
      toast.add({ title: body.action === 'confirm' ? '晋级名单已确认' : body.action === 'reopen' ? '已重新打开，可以再改' : '已保存', color: 'success' })
    } catch (error) {
      toast.add({ title: apiErrorMessage(error, '保存失败，请重试'), color: 'error' })
    } finally {
      advanceBusyKey.value = ''
    }
  }

  function toggleAdvance(entryId: string, advanced: boolean): Promise<void> {
    const round = activeRound.value
    if (!round) return Promise.resolve()
    return postAdvance(round.key, { action: 'toggle', entryId, advanced })
  }

  function confirmAdvance(): Promise<void> {
    const round = activeRound.value
    if (!round) return Promise.resolve()
    if (round.advanceMode === 'duel' && !duelResolved.value) {
      toast.add({ title: '还有小组没分出胜负，先处理同分或加赛', color: 'warning' })
      return Promise.resolve()
    }
    if (advanceCount.value === 0) {
      toast.add({ title: '至少勾选一位晋级选手', color: 'warning' })
      return Promise.resolve()
    }
    return postAdvance(round.key, { action: 'confirm' })
  }

  async function drawPairs(action: 'draw' | 'clear'): Promise<void> {
    const round = activeRound.value
    if (!round || pairsBusyKey.value) return
    pairsBusyKey.value = `${round.key}:${action}`
    try {
      const data = await adminFetch<{ payload: CompetitionAdminPayload }>(
        `/api/admin/competition/rounds/${round.key}/pairs`,
        { method: 'POST', body: { action } }
      )
      payload.value = data.payload
      toast.add({ title: action === 'draw' ? '对阵已抽好' : '对阵已清除', color: 'success' })
    } catch (error) {
      toast.add({ title: apiErrorMessage(error, '操作失败，请重试'), color: 'error' })
    } finally {
      pairsBusyKey.value = ''
    }
  }

  function reopenAdvance(): Promise<void> {
    const round = activeRound.value
    if (!round) return Promise.resolve()
    return postAdvance(round.key, { action: 'reopen' })
  }

  async function saveReminderTemplate(): Promise<void> {
    if (reminderSaving.value) return
    if (!reminderSubject.value.trim() || !reminderBody.value.trim()) {
      toast.add({ title: '提醒邮件的主题和正文都要填', color: 'warning' })
      return
    }
    reminderSaving.value = true
    try {
      await adminFetch('/api/admin/competition', {
        method: 'PUT',
        body: {
          title: payload.value?.event.title,
          registrationOpen: payload.value?.event.registrationOpen,
          dimensions: payload.value?.event.dimensions,
          edition: payload.value?.event.edition,
          schedule: payload.value?.event.schedule,
          formFields: payload.value?.event.formFields,
          trimExtremes: payload.value?.event.trimExtremes,
          reminderSubject: reminderSubject.value.trim(),
          reminderBody: reminderBody.value
        }
      })
      await load()
      toast.add({ title: '提醒模板已保存', color: 'success' })
    } catch (error) {
      toast.add({ title: apiErrorMessage(error, '保存失败，请重试'), color: 'error' })
    } finally {
      reminderSaving.value = false
    }
  }

  /** 给「预报名了但没签到」的人群发提醒；一个人都没签到过也算正常。 */
  async function sendReminders(): Promise<void> {
    if (reminderSending.value) return
    reminderSending.value = true
    try {
      const data = await adminFetch<{ sent: number, failed: number, skippedCheckedIn: number, skippedNoEmail: number }>(
        '/api/admin/competition/reminders/send',
        { method: 'POST' }
      )
      toast.add({
        title: `已发 ${data.sent} 封，失败 ${data.failed}；已签到跳过 ${data.skippedCheckedIn} 人，没邮箱 ${data.skippedNoEmail} 人`,
        color: data.failed > 0 ? 'warning' : 'success'
      })
    } catch (error) {
      toast.add({ title: apiErrorMessage(error, '发送失败，请检查邮件服务'), color: 'error' })
    } finally {
      reminderSending.value = false
    }
  }

  /** 换届：旧届留档，新届从空白开始。 */
  async function createEdition(): Promise<void> {
    if (editionCreating.value) return
    const label = editionLabel.value.trim()
    if (!label) {
      toast.add({ title: '先填新一代的届次，例如 2027', color: 'warning' })
      return
    }
    editionCreating.value = true
    try {
      const data = await adminFetch<{ payload: CompetitionAdminPayload }>('/api/admin/competition/editions', {
        method: 'POST',
        body: { label }
      })
      payload.value = data.payload
      editionLabel.value = ''
      reminderSubject.value = ''
      reminderBody.value = ''
      syncReminder()
      toast.add({ title: `已新建 ${label} 届，旧届数据仍保留`, color: 'success' })
    } catch (error) {
      toast.add({ title: apiErrorMessage(error, '换届失败，请重试'), color: 'error' })
    } finally {
      editionCreating.value = false
    }
  }

  // 决赛第二轮出场顺序：运营按姓名逐行录入，晋级的人按这个先后落名单。
  const final2OrderText = ref('')
  const final2OrderSaving = ref(false)
  const final2OrderUnmatched = ref<string[]>([])

  function syncFinal2Order(current: CompetitionAdminPayload | null) {
    const ids = current?.event?.final2Order ?? []
    const nameById = new Map((current?.singers ?? []).map(singer => [singer.id, singer.name]))
    final2OrderText.value = ids.map(id => nameById.get(id) ?? '').filter(Boolean).join('\n')
  }

  async function saveFinal2Order(): Promise<void> {
    if (final2OrderSaving.value) return
    final2OrderSaving.value = true
    try {
      const names = final2OrderText.value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
      const data = await adminFetch<{
        payload: CompetitionAdminPayload
        order: { singerId: string, name: string }[]
        unmatched: string[]
      }>('/api/admin/competition/final2-order', { method: 'POST', body: { names } })
      payload.value = data.payload
      final2OrderUnmatched.value = data.unmatched
      syncFinal2Order(data.payload)
      toast.add({
        title: data.unmatched.length > 0
          ? `已存 ${data.order.length} 人，${data.unmatched.length} 个名字没对上`
          : `第二轮顺序已存 ${data.order.length} 人`,
        color: data.unmatched.length > 0 ? 'warning' : 'success'
      })
    } catch (error) {
      toast.add({ title: apiErrorMessage(error, '保存顺序失败，请重试'), color: 'error' })
    } finally {
      final2OrderSaving.value = false
    }
  }

  watch(payload, (value) => {
    syncReminder()
    syncFinal2Order(value)
  }, { immediate: true })
  return {
    advanceBusyKey,
    pairsBusyKey,
    advanceRows,
    advanceConfirmed,
    advanceCount,
    duelPairs,
    duelResolved,
    receipts,
    receiptConfirmedCount,
    toggleAdvance,
    confirmAdvance,
    drawPairs,
    reopenAdvance,
    reminderSubject,
    reminderBody,
    reminderSaving,
    reminderSending,
    saveReminderTemplate,
    sendReminders,
    editionLabel,
    editionCreating,
    final2OrderText,
    final2OrderSaving,
    final2OrderUnmatched,
    saveFinal2Order,
    createEdition
  }
}
