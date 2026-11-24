import type {
  CompetitionAdminPayload,
  CompetitionDimension,
  CompetitionEvent,
  CompetitionFormField,
  CompetitionRoundKey,
  CompetitionRoundView,
  CompetitionScheduleItem
} from '~~/shared/types'
import { DEFAULT_COMPETITION_DIMENSIONS } from '~~/shared/utils/competition'
import { adminFetch } from '~~/app/utils/admin-request'
import { apiErrorMessage } from './useCompetitionRoster'

type SectionKey = 'settings' | 'analytics' | 'singers' | 'popularity' | 'email' | 'materials' | CompetitionRoundKey

export interface SettingsDraft {
  title: string
  edition: string
  registrationOpen: boolean
  /** 算平均分时去掉一个最高分和一个最低分。 */
  trimExtremes: boolean
  /** 邮件模板「加群按钮」跳转的 QQ 群链接。 */
  qqGroupUrl: string
  schedule: CompetitionScheduleItem[]
  formFields: CompetitionFormField[]
  dimensions: CompetitionDimension[]
}

export interface UseCompetitionPayloadOptions {
  toast: ReturnType<typeof useToast>
}

/** 赛事数据与设置：加载、保存赛程/表单/维度、轮次设置与开关评分。 */
export function useCompetitionPayload(options: UseCompetitionPayloadOptions) {
  const { toast } = options

  const loading = ref(true)
  const loadError = ref('')
  const payload = ref<CompetitionAdminPayload | null>(null)
  const settings = ref<SettingsDraft | null>(null)
  const activeSection = ref<SectionKey>('settings')
  const savingSettings = ref(false)
  const savingRoundKey = ref('')
  const generatingRoundKey = ref('')
  const clearingScoresKey = ref('')

  const sections = [
    { key: 'settings', label: '赛事设置', icon: 'i-lucide-sliders-horizontal' },
    { key: 'analytics', label: '数据可视化', icon: 'i-lucide-chart-column' },
    { key: 'singers', label: '选手库', icon: 'i-lucide-list-music' },
    { key: 'prelim', label: '初赛', icon: 'i-lucide-flag' },
    { key: 'semi', label: '复赛', icon: 'i-lucide-git-branch' },
    { key: 'final', label: '决赛', icon: 'i-lucide-trophy' },
    { key: 'final2', label: '决赛·第二轮', icon: 'i-lucide-list-ordered' },
    { key: 'popularity', label: '人气奖投票', icon: 'i-lucide-heart' },
    { key: 'email', label: '邮件通知', icon: 'i-lucide-mail' },
    { key: 'materials', label: '报名物料', icon: 'i-lucide-qr-code' }
  ] as const

  const event = computed<CompetitionEvent | null>(() => payload.value?.event ?? null)
  // 满分跟当前轮次走：复赛 100 分制、初赛 50 分制，别再拿赛事级的值。
  const maxTotal = computed(() => activeRound.value?.maxTotal ?? event.value?.maxTotal ?? 0)
  const singers = computed(() => payload.value?.singers ?? [])

  /** 「轮次:选手 id」→ 该轮条目，只有真正进了这一轮的人才会有。 */
  const stageEntryMap = computed(() => {
    const map = new Map<string, CompetitionRoundView['entries'][number]>()
    for (const round of payload.value?.rounds ?? []) {
      for (const entry of round.entries) map.set(`${round.key}:${entry.singer.id}`, entry)
    }
    return map
  })

  /** 该选手有没有进这一轮（复赛/决赛只对晋级的人显示）。 */
  function singerJoinedRound(singerId: string, roundKey: CompetitionRoundKey): boolean {
    return stageEntryMap.value.has(`${roundKey}:${singerId}`)
  }

  /** 该选手在这一轮唱的歌；初赛没写条目曲目时回落到选手库里登记的曲目。 */
  function singerRoundSong(singer: { id: string, song: string | null }, roundKey: CompetitionRoundKey): string {
    const entry = stageEntryMap.value.get(`${roundKey}:${singer.id}`)
    if (!entry) return ''
    const song = (entry.song ?? '').trim()
    if (song) return song
    return roundKey === 'prelim' ? (singer.song ?? '').trim() : ''
  }

  const activeRound = computed<CompetitionRoundView | null>(() => {
    const key = activeSection.value
    if (key === 'settings' || key === 'analytics' || key === 'singers' || key === 'popularity' || key === 'email' || key === 'materials') return null
    return payload.value?.rounds.find(round => round.key === key) ?? null
  })

  const settingsWeightSum = computed(() => (settings.value?.dimensions ?? [])
    .reduce((sum, dimension) => sum + (Number(dimension.weight) || 0), 0))

  const hasAnyScores = computed(() => (payload.value?.rounds ?? []).some(round => round.hasScores))

  const roundSummary = computed(() => (payload.value?.rounds ?? []).map(round => ({
    ...round,
    scoredSingerCount: round.entries.filter(entry => entry.scoreCount > 0).length,
    qualifiedCount: round.entries.filter(entry => entry.qualified).length
  })))

  function cloneDimensions(dimensions: CompetitionDimension[]): CompetitionDimension[] {
    return dimensions.map(dimension => ({ ...dimension }))
  }

  function cloneSchedule(items: CompetitionScheduleItem[]): CompetitionScheduleItem[] {
    return items.map(item => ({ ...item }))
  }

  function cloneFormFields(fields: CompetitionFormField[]): CompetitionFormField[] {
    return fields.map(field => ({ ...field }))
  }

  function settingsFromEvent(source: CompetitionEvent): SettingsDraft {
    return {
      title: source.title,
      edition: source.edition,
      registrationOpen: source.registrationOpen,
      trimExtremes: source.trimExtremes === true,
      qqGroupUrl: source.qqGroupUrl ?? '',
      schedule: cloneSchedule(source.schedule),
      formFields: cloneFormFields(source.formFields),
      dimensions: cloneDimensions(source.dimensions)
    }
  }

  async function load(): Promise<void> {
    loading.value = true
    loadError.value = ''
    try {
      const data = await adminFetch<CompetitionAdminPayload>('/api/admin/competition')
      payload.value = data
      settings.value = settingsFromEvent(data.event)
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode
      loadError.value = status === 403
        ? '仅限组织管理员。'
        : apiErrorMessage(error, '比赛数据加载失败，请刷新重试。')
    } finally {
      loading.value = false
    }
  }

  async function saveSettings(): Promise<void> {
    if (!settings.value || savingSettings.value) return
    const draft = settings.value
    if (!draft.title.trim()) {
      toast.add({ title: '比赛名称不能为空', color: 'warning' })
      return
    }
    if (draft.dimensions.some(dimension => !dimension.label.trim())) {
      toast.add({ title: '评分维度名称不能为空', color: 'warning' })
      return
    }
    if (draft.dimensions.some(dimension => !(Number(dimension.weight) > 0))) {
      toast.add({ title: '每个维度的占比必须大于 0', color: 'warning' })
      return
    }
    if (draft.schedule.some(item => !item.dateLabel.trim())) {
      toast.add({ title: '赛程里每一行都要填日期', color: 'warning' })
      return
    }
    if (draft.formFields.some(field => !field.label.trim())) {
      toast.add({ title: '表单字段名称不能为空', color: 'warning' })
      return
    }

    savingSettings.value = true
    try {
      const data = await adminFetch<CompetitionAdminPayload>('/api/admin/competition', {
        method: 'PUT',
        body: {
          title: draft.title.trim(),
          edition: draft.edition.trim(),
          registrationOpen: draft.registrationOpen,
          trimExtremes: draft.trimExtremes,
          qqGroupUrl: draft.qqGroupUrl.trim(),
          schedule: draft.schedule.map(item => ({
            key: item.key,
            dateLabel: item.dateLabel.trim(),
            timeLabel: item.timeLabel.trim(),
            venue: item.venue.trim(),
            note: item.note.trim()
          })),
          formFields: draft.formFields.map(field => ({
            key: field.key,
            label: field.label.trim(),
            required: field.required,
            enabled: field.enabled
          })),
          dimensions: draft.dimensions.map(dimension => ({
            key: dimension.key,
            label: dimension.label.trim(),
            weight: Number(dimension.weight)
          }))
        }
      })
      payload.value = data
      settings.value = settingsFromEvent(data.event)
      toast.add({ title: '赛事设置已保存', color: 'success' })
    } catch (error) {
      toast.add({
        title: '保存失败',
        description: apiErrorMessage(error, '请检查网络后重试。'),
        color: 'warning'
      })
    } finally {
      savingSettings.value = false
    }
  }

  function addDimension(): void {
    if (!settings.value) return
    if (settings.value.dimensions.length >= 10) {
      toast.add({ title: '最多 10 个评分维度', color: 'warning' })
      return
    }
    settings.value.dimensions.push({
      key: `dim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      label: '新维度',
      weight: 10
    })
  }

  function removeDimension(index: number): void {
    if (!settings.value || settings.value.dimensions.length <= 1) return
    settings.value.dimensions.splice(index, 1)
  }

  function moveDimension(index: number, delta: number): void {
    if (!settings.value) return
    const target = index + delta
    const dimensions = settings.value.dimensions
    if (target < 0 || target >= dimensions.length) return
    const [item] = dimensions.splice(index, 1)
    if (item) dimensions.splice(target, 0, item)
  }

  function restoreDefaultDimensions(): void {
    if (!settings.value) return
    settings.value.dimensions = cloneDimensions(DEFAULT_COMPETITION_DIMENSIONS)
    toast.add({ title: '已恢复默认五维（等权）', color: 'success' })
  }

  async function saveRound(round: CompetitionRoundView): Promise<void> {
    if (savingRoundKey.value) return
    if (!Number.isInteger(Number(round.judgeCount)) || Number(round.judgeCount) < 1 || Number(round.judgeCount) > 20) {
      toast.add({ title: '评委人数需为 1-20 的整数', color: 'warning' })
      return
    }
    if (round.key !== 'final' && round.advanceCount !== null
      && (!Number.isInteger(Number(round.advanceCount)) || Number(round.advanceCount) < 1)) {
      toast.add({ title: '晋级人数需为正整数', color: 'warning' })
      return
    }
    if (round.key === 'prelim' && round.advanceCount === null) {
      toast.add({ title: '初赛需设置晋级人数', color: 'warning' })
      return
    }

    savingRoundKey.value = round.key
    try {
      const body: Record<string, unknown> = {
        judgeCount: Number(round.judgeCount),
        scorePrecision: round.scorePrecision === 'decimal' ? 'decimal' : 'integer'
      }
      if (round.key !== 'final') {
        body.advanceCount = round.advanceCount === null ? null : Number(round.advanceCount)
      } else {
        body.advanceMode = round.advanceMode
      }
      const data = await adminFetch<CompetitionAdminPayload>(
        `/api/admin/competition/rounds/${round.key}`,
        { method: 'PUT', body }
      )
      payload.value = data
      toast.add({ title: `${round.title}设置已保存`, color: 'success' })
    } catch (error) {
      toast.add({ title: '保存失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      savingRoundKey.value = ''
    }
  }

  /** 测试用：清空本轮所有评分（签到与出场号不动），清完评委可以重新打分。 */
  async function clearRoundScores(round: CompetitionRoundView): Promise<void> {
    if (clearingScoresKey.value) return
    if (!window.confirm(`清空${round.title}的全部评分？这条只用于测试，清空后评委要重新打分。`)) return
    clearingScoresKey.value = round.key
    try {
      const data = await adminFetch<{ cleared: number, payload: CompetitionAdminPayload }>(
        `/api/admin/competition/rounds/${round.key}/scores-clear`,
        { method: 'POST' }
      )
      payload.value = data.payload
      toast.add({ title: `已清空 ${data.cleared} 条评分`, color: 'success' })
    } catch (error) {
      toast.add({ title: '清理失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      clearingScoresKey.value = ''
    }
  }

  async function setRoundStatus(round: CompetitionRoundView, status: 'open' | 'closed'): Promise<void> {
    if (savingRoundKey.value) return
    if (status === 'closed' && !window.confirm(`结束${round.title}评分？结束后成绩锁定。`)) {
      return
    }
    if (status === 'open' && round.status === 'closed'
      && !window.confirm(`重新开放${round.title}评分？`)) {
      return
    }

    savingRoundKey.value = round.key
    try {
      const data = await adminFetch<CompetitionAdminPayload>(
        `/api/admin/competition/rounds/${round.key}`,
        { method: 'PUT', body: { status } }
      )
      payload.value = data
      toast.add({
        title: status === 'open' ? `${round.title}已开放评分` : `${round.title}评分已结束`,
        color: 'success'
      })
    } catch (error) {
      toast.add({ title: '操作失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      savingRoundKey.value = ''
    }
  }

  return {
    loading,
    loadError,
    payload,
    settings,
    activeSection,
    savingSettings,
    savingRoundKey,
    generatingRoundKey,
    sections,
    event,
    maxTotal,
    singers,
    singerJoinedRound,
    singerRoundSong,
    activeRound,
    settingsWeightSum,
    hasAnyScores,
    roundSummary,
    load,
    saveSettings,
    addDimension,
    removeDimension,
    moveDimension,
    restoreDefaultDimensions,
    saveRound,
    setRoundStatus,
    clearRoundScores,
    clearingScoresKey
  }
}
