import type { Ref } from 'vue'
import type {
  CompetitionAdminPayload,
  CompetitionCurrentSinger,
  CompetitionDimension,
  CompetitionEvent,
  CompetitionFormField,
  CompetitionJudge,
  CompetitionRoundEntry,
  CompetitionRoundView
} from '~~/shared/types'
import { adminFetch } from '~~/app/utils/admin-request'
import type { SettingsDraft } from './useCompetitionPayload'

export function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback
  const data = (error as { data?: { data?: { message?: string, issues?: Array<{ message?: string }> } } }).data?.data
  if (data?.message) return data.message
  const issue = data?.issues?.find(item => item?.message)
  return issue?.message ?? fallback
}

export function missingJudgeCount(round: CompetitionRoundView): number {
  return Math.max(0, Number(round.judgeCount || 0) - round.judges.length)
}

export interface UseCompetitionRosterOptions {
  payload: Ref<CompetitionAdminPayload | null>
  settings: Ref<SettingsDraft | null>
  event: Readonly<Ref<CompetitionEvent | null>>
  settingsWeightSum: Readonly<Ref<number>>
  load: () => Promise<void>
  toast: ReturnType<typeof useToast>
  generatingRoundKey: Ref<string>
  busyJudgeId: Ref<string>
}

/** 名单簇：赛程与表单字段、轮次状态展示、顺序评分、分天、名单生成、拖拽排序。 */
export function useCompetitionRoster(options: UseCompetitionRosterOptions) {
  const { payload, settings, event, settingsWeightSum, load, toast, generatingRoundKey, busyJudgeId } = options

  const SCHEDULE_KEY_OPTIONS = [
    { value: 'prelim', label: '初赛' },
    { value: 'semi', label: '复赛' },
    { value: 'final', label: '决赛' }
  ] as const

  function addScheduleRow(): void {
    if (!settings.value) return
    settings.value.schedule.push({ key: 'prelim', dateLabel: '', timeLabel: '', venue: '', note: '' })
  }

  function removeScheduleRow(index: number): void {
    if (!settings.value || settings.value.schedule.length <= 1) return
    settings.value.schedule.splice(index, 1)
  }

  function restoreDefaultFormFields(): void {
    if (!settings.value) return
    const labels: Record<string, string> = {
      name: '姓名',
      className: '班级',
      studentNo: '学号',
      phone: '联系电话',
      email: '邮箱',
      song: '参赛歌曲',
      preferredDay: '打算哪天来'
    }
    settings.value.formFields = Object.entries(labels).map(([key, label]) => ({
      key: key as CompetitionFormField['key'],
      label,
      required: key === 'name' || key === 'preferredDay',
      enabled: true
    }))
  }

  function formatDateTime(ms: number | null): string {
    if (!ms) return '—'
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(ms))
  }

  function weightPercent(dimension: CompetitionDimension): number {
    if (settingsWeightSum.value <= 0) return 0
    return Math.round(((Number(dimension.weight) || 0) / settingsWeightSum.value) * 100)
  }

  function previousRound(round: CompetitionRoundView): CompetitionRoundView | null {
    return payload.value?.rounds.find(item => item.position === round.position - 1) ?? null
  }

  function nextRound(round: CompetitionRoundView): CompetitionRoundView | null {
    return payload.value?.rounds.find(item => item.position === round.position + 1) ?? null
  }

  /** 出场名单按抽签顺序，而不是成绩排名顺序。 */
  function rosterEntries(round: CompetitionRoundView): CompetitionRoundEntry[] {
    return [...round.entries].sort((left, right) => left.sortOrder - right.sortOrder)
  }

  const rosterQuery = ref('')

  /** 搜索只筛显示，不动排序与拖动用的真实下标。 */
  function rosterVisible(round: CompetitionRoundView): CompetitionRoundEntry[] {
    const keyword = rosterQuery.value.trim().toLowerCase()
    const entries = rosterEntries(round)
    if (!keyword) return entries
    return entries.filter(entry => entry.singer.name.toLowerCase().includes(keyword)
      || (entry.singer.song ?? '').toLowerCase().includes(keyword))
  }

  function queueStateText(entry: CompetitionRoundEntry): string {
    if (entry.queueState === 'singing') return '演唱中'
    if (entry.queueState === 'finished') return '已结束'
    if (entry.queueState === 'waiting') {
      return entry.ahead && entry.ahead > 0 ? `前面还有 ${entry.ahead} 人` : '下一位'
    }
    if (entry.queueState === 'idle') {
      return entry.ahead && entry.ahead > 0 ? `前面还有 ${entry.ahead} 人` : '待开始'
    }
    return '未开始'
  }

  function queueStateClass(entry: CompetitionRoundEntry): string {
    if (entry.queueState === 'singing') return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
    if (entry.queueState === 'finished') return 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'
    if (entry.queueState === 'waiting') return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
    return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
  }

  function roundStatusText(round: CompetitionRoundView): string {
    if (round.status === 'open') return '评分进行中'
    if (round.status === 'closed') return '评分已结束'
    return '未开始'
  }

  function roundStatusClass(round: CompetitionRoundView): string {
    if (round.status === 'open') return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
    if (round.status === 'closed') return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  }

  function entryStatus(entry: CompetitionRoundEntry): string {
    if (entry.qualified) return '晋级'
    if (entry.forfeited) return '弃权'
    if (entry.scoreCount > 0) return '已评分'
    return '未评分'
  }

  function entryStatusClass(entry: CompetitionRoundEntry): string {
    if (entry.qualified) return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
    if (entry.forfeited) return 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
    if (entry.scoreCount > 0) return 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
    return 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
  }

  function wrongStatus(entry: CompetitionRoundEntry): string {
    return entry.forfeited ? '本轮所有评委均未打分，按弃权处理' : ''
  }

  function advanceHint(round: CompetitionRoundView): string {
    if (round.key === 'prelim') return ''
    const previous = previousRound(round)
    if (!previous) return ''
    if (previous.status !== 'closed') return `请先结束${previous.title}评分`
    if (previous.advanceCount === null) return `请先设置${previous.title}晋级名额`
    if (previous.entries.every(entry => entry.scoreCount === 0)) return `${previous.title}还没有有效成绩`
    if (round.entries.length > 0) return `本轮名单已生成；如需重做，请先清空本轮名单`
    return `将从${previous.title}取前 ${previous.advanceCount} 名，并随机抽签决定出场顺序`
  }

  function canGenerate(round: CompetitionRoundView): boolean {
    if (round.key === 'prelim') return false
    const previous = previousRound(round)
    return Boolean(previous
      && previous.status === 'closed'
      && previous.advanceCount !== null
      && previous.entries.some(entry => entry.scoreCount > 0)
      && round.entries.length === 0)
  }

  function canRedraw(round: CompetitionRoundView): boolean {
    return round.key !== 'prelim'
      && round.status !== 'closed'
      && !round.hasScores
      && round.entries.length >= 2
  }

  function canClearRoster(round: CompetitionRoundView): boolean {
    const next = nextRound(round)
    return round.key !== 'prelim'
      && round.status !== 'open'
      && !round.hasScores
      && (next?.entries.length ?? 0) === 0
  }

  function rankClass(rank: number | null): string {
    if (rank === 1) return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
    if (rank === 2) return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
    if (rank === 3) return 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300'
    return 'text-zinc-500 dark:text-zinc-400'
  }

  const currentBusyKey = ref('')

  /** 顺序评分：本场已提交人数占比。 */
  function currentPercent(round: CompetitionRoundView): number {
    const item = round.current
    if (!item || item.judgeTotal <= 0) return 0
    return Math.round((item.submitted.length / item.judgeTotal) * 100)
  }

  /** 顺序评分：开始 / 下一位 / 上一位 / 跳过 / 退出。 */
  async function moveCurrent(
    round: CompetitionRoundView,
    action: 'start' | 'next' | 'prev' | 'skip' | 'stop'
  ): Promise<void> {
    if (currentBusyKey.value) return
    if (action === 'stop' && !window.confirm('退出顺序评分？评委可自由给任意选手打分，当前进度不再限制。')) return

    currentBusyKey.value = `${round.key}:${action}`
    try {
      const result = await adminFetch<{ payload: CompetitionAdminPayload, current: CompetitionCurrentSinger | null }>(
        `/api/admin/competition/rounds/${round.key}/current`,
        { method: 'POST', body: { action } }
      )
      payload.value = result.payload
      const item = result.current
      const titles: Record<typeof action, string> = {
        start: item ? `已开始顺序评分：第 ${item.index} 位 ${item.singer.name}` : '已开始顺序评分',
        next: item ? `已切到下一位：${item.singer.name}` : '本场已评完',
        prev: item ? `已回到第 ${item.index} 位 ${item.singer.name}` : '已回到上一位',
        skip: item ? `已跳过，当前第 ${item.index} 位 ${item.singer.name}` : '已跳过此人',
        stop: '已退出顺序评分'
      }
      toast.add({ title: titles[action], color: 'success' })
    } catch (error) {
      toast.add({ title: '操作失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      currentBusyKey.value = ''
    }
  }

  const dayBusyKey = ref('')

  /** 某一天有多少位选手（不分天时算未分配）。 */
  function dayCount(round: CompetitionRoundView, day: number | null): number {
    return round.entries.filter(entry => (entry.contestDay ?? null) === day).length
  }

  /** 当天到岗、要收票的启用评委。 */
  function dutyJudgeCount(round: CompetitionRoundView): number {
    return round.judges.filter(judge => judge.isActive
      && (!round.activeDay || judge.day === null || judge.day === round.activeDay)).length
  }

  function dayLabel(day: number | null | undefined): string {
    if (day === 1) return '第一天'
    if (day === 2) return '第二天'
    return '两天都在'
  }

  /** 初赛分天：切到第一天 / 第二天 / 不分天，split 时按出场顺序平分两天。 */
  async function changeRoundDay(
    round: CompetitionRoundView,
    day: number | null,
    split = false
  ): Promise<void> {
    if (dayBusyKey.value) return
    if (split && !window.confirm('按当前出场顺序把名单平分成两天？前一半第一天、后一半第二天，分完还能单条改。')) return

    dayBusyKey.value = round.key
    try {
      const result = await adminFetch<{ payload: CompetitionAdminPayload }>(
        `/api/admin/competition/rounds/${round.key}/day`,
        { method: 'POST', body: { day, split } }
      )
      payload.value = result.payload
      toast.add({
        title: day === null ? '已取消分天' : `已切到${dayLabel(day)}`,
        color: 'success'
      })
    } catch (error) {
      toast.add({ title: '切换失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      dayBusyKey.value = ''
    }
  }

  /** 单条名单改到某一天。 */
  async function changeEntryDay(
    round: CompetitionRoundView,
    entry: CompetitionRoundEntry,
    value: string
  ): Promise<void> {
    const parsed = Number(value)
    const day = parsed === 1 || parsed === 2 ? parsed : null
    if ((entry.contestDay ?? null) === day) return
    try {
      const result = await adminFetch<{ payload: CompetitionAdminPayload }>(
        `/api/admin/competition/rounds/${round.key}/entry-day`,
        { method: 'POST', body: { entryId: entry.id, day } }
      )
      payload.value = result.payload
    } catch (error) {
      toast.add({ title: '改天失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    }
  }

  /** 评委到岗天：两天都在 / 第一天 / 第二天。 */
  async function changeJudgeDay(
    round: CompetitionRoundView,
    judge: CompetitionJudge,
    value: string
  ): Promise<void> {
    const parsed = Number(value)
    const day = parsed === 1 || parsed === 2 ? parsed : null
    busyJudgeId.value = judge.id
    try {
      await adminFetch(`/api/admin/competition/rounds/${round.key}/judges/${judge.id}`, {
        method: 'PATCH',
        body: { day }
      })
      await load()
    } catch (error) {
      toast.add({ title: '改到岗天失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      busyJudgeId.value = ''
    }
  }

  async function generateNextRound(round: CompetitionRoundView): Promise<void> {
    if (generatingRoundKey.value) return
    const hint = advanceHint(round)
    if (!window.confirm(`${hint}\n\n确定生成下一轮名单并随机抽签？`)) return

    generatingRoundKey.value = round.key
    try {
      const result = await adminFetch<{ advanced: number, payload: CompetitionAdminPayload }>(
        `/api/admin/competition/rounds/${round.key}/advance`,
        { method: 'POST' }
      )
      payload.value = result.payload
      toast.add({ title: `已生成下一轮名单：${result.advanced} 位选手`, color: 'success' })
    } catch (error) {
      toast.add({ title: '生成失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      generatingRoundKey.value = ''
    }
  }

  async function redrawRound(round: CompetitionRoundView): Promise<void> {
    if (generatingRoundKey.value) return
    if (!window.confirm(`重新随机抽签${round.title}出场顺序？现有顺序会被打乱。`)) return

    generatingRoundKey.value = round.key
    try {
      const data = await adminFetch<CompetitionAdminPayload>(
        `/api/admin/competition/rounds/${round.key}/redraw`,
        { method: 'POST' }
      )
      payload.value = data
      toast.add({ title: `${round.title}已重新抽签`, color: 'success' })
    } catch (error) {
      toast.add({ title: '抽签失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      generatingRoundKey.value = ''
    }
  }

  async function clearRoster(round: CompetitionRoundView): Promise<void> {
    if (generatingRoundKey.value) return
    if (!window.confirm(`清空${round.title}名单？只能清空没有评分的轮次。`)) return

    generatingRoundKey.value = round.key
    try {
      const data = await adminFetch<CompetitionAdminPayload>(
        `/api/admin/competition/rounds/${round.key}/clear-roster`,
        { method: 'POST' }
      )
      payload.value = data
      toast.add({ title: `${round.title}名单已清空`, color: 'success' })
    } catch (error) {
      toast.add({ title: '清空失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      generatingRoundKey.value = ''
    }
  }

  const draggingEntryId = ref('')
  const dragOverEntryId = ref('')

  function startDragEntry(round: CompetitionRoundView, entry: CompetitionRoundEntry, event: DragEvent): void {
    if (round.status === 'closed') return
    draggingEntryId.value = entry.id
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', entry.id)
    }
  }

  function dragOverEntry(entry: CompetitionRoundEntry, event: DragEvent): void {
    if (!draggingEntryId.value || draggingEntryId.value === entry.id) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dragOverEntryId.value = entry.id
  }

  async function dropOnEntry(round: CompetitionRoundView, entry: CompetitionRoundEntry): Promise<void> {
    const draggedId = draggingEntryId.value
    dragOverEntryId.value = ''
    draggingEntryId.value = ''
    if (!draggedId || draggedId === entry.id) return

    const list = rosterEntries(round)
    const fromIndex = list.findIndex(item => item.id === draggedId)
    const toIndex = list.findIndex(item => item.id === entry.id)
    if (fromIndex < 0 || toIndex < 0) return
    // 往下拖放到目标行后面，往上拖放到目标行前面，符合手感。
    const place = fromIndex < toIndex ? 'after' : 'before'

    try {
      const data = await adminFetch<CompetitionAdminPayload>(
        `/api/admin/competition/rounds/${round.key}/entry-move`,
        { method: 'POST', body: { entryId: draggedId, targetId: entry.id, place } }
      )
      payload.value = data
    } catch (error) {
      toast.add({ title: '调整顺序失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    }
  }

  function endDragEntry(): void {
    draggingEntryId.value = ''
    dragOverEntryId.value = ''
  }

  async function moveEntry(round: CompetitionRoundView, entry: CompetitionRoundEntry, delta: number): Promise<void> {
    if (round.status === 'closed') {
      toast.add({ title: '本轮已结束，出场顺序已锁定', color: 'warning' })
      return
    }
    const list = rosterEntries(round)
    const index = list.findIndex(item => item.id === entry.id)
    const target = index + delta
    if (index < 0 || target < 0 || target >= list.length) return

    const reordered = [...list]
    const [moved] = reordered.splice(index, 1)
    if (!moved) return
    reordered.splice(target, 0, moved)

    try {
      const data = await adminFetch<CompetitionAdminPayload>(
        `/api/admin/competition/rounds/${round.key}/order`,
        { method: 'PUT', body: { entryIds: reordered.map(item => item.id) } }
      )
      payload.value = data
    } catch (error) {
      toast.add({ title: '调整顺序失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    }
  }

  async function copyRoster(round: CompetitionRoundView): Promise<void> {
    const list = rosterEntries(round)
    if (list.length === 0) return
    const lines = [
      `${event.value?.title || '新声歌手大赛'} · ${round.title}出场名单`,
      '',
      ...list.map((entry, index) =>
        `${index + 1}. ${entry.singer.name}《${entry.singer.song}》${entry.singer.className ? `（${entry.singer.className}）` : ''}`)
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.add({ title: '出场名单已复制', color: 'success' })
    } catch {
      toast.add({ title: '复制失败，请手动选择文本复制', color: 'warning' })
    }
  }

  return {
    SCHEDULE_KEY_OPTIONS,
    addScheduleRow,
    removeScheduleRow,
    restoreDefaultFormFields,
    formatDateTime,
    weightPercent,
    previousRound,
    nextRound,
    rosterEntries,
    rosterQuery,
    rosterVisible,
    missingJudgeCount,
    queueStateText,
    queueStateClass,
    roundStatusText,
    roundStatusClass,
    entryStatus,
    entryStatusClass,
    wrongStatus,
    advanceHint,
    canGenerate,
    canRedraw,
    canClearRoster,
    rankClass,
    currentBusyKey,
    currentPercent,
    moveCurrent,
    dayBusyKey,
    dayCount,
    dutyJudgeCount,
    dayLabel,
    changeRoundDay,
    changeEntryDay,
    changeJudgeDay,
    generateNextRound,
    redrawRound,
    clearRoster,
    draggingEntryId,
    dragOverEntryId,
    startDragEntry,
    dragOverEntry,
    dropOnEntry,
    endDragEntry,
    moveEntry,
    copyRoster
  }
}
