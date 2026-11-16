import type {
  CompetitionDimension,
  CompetitionRoundKey,
  CompetitionRoundView,
  CompetitionSingerPublic
} from '~~/shared/types'
import { calculateCompetitionTotal } from '~~/shared/utils/competition'
import { adminFetch } from '~~/app/utils/admin-request'
import { apiErrorMessage } from './useCompetitionRoster'

export type CompetitionExportKind = 'detail' | 'summary' | 'advancing' | 'confirmed' | 'confirmed-plain'

export interface UseCompetitionScoresOptions {
  /** 当前维度定义（来自 settings.dimensions，改权重后立刻跟着变）。 */
  dimensions: Ref<CompetitionDimension[]>
  load: () => Promise<void>
  toast: ReturnType<typeof useToast>
}

/**
 * 后台改分簇：把某位评委给某位选手的评分整份覆盖（不存在就补录），
 * 外加三种 CSV 导出（成绩明细 / 排名汇总 / 晋级名单）。
 *
 * 改完不需要手工刷新：接口直接回整份 payload，这里再拉一次，
 * 平均分、名次、晋级标记一起变。
 */
export function useCompetitionScores(options: UseCompetitionScoresOptions) {
  const { dimensions, load, toast } = options

  const scoreEditorOpen = ref(false)
  const scoreEditorSinger = ref<CompetitionSingerPublic | null>(null)
  const scoreEditorJudgeId = ref('')
  const scoreEditorJudgeName = ref('')
  const scoreEditorRoundKey = ref<CompetitionRoundKey | ''>('')
  const scoreEditorIsNew = ref(true)
  const scoreDraft = ref<Record<string, string>>({})
  const scoreCommentDraft = ref('')
  const savingScore = ref(false)

  const scoreDraftNumbers = computed<Record<string, number>>(() => {
    const result: Record<string, number> = {}
    for (const dimension of dimensions.value) {
      const raw = Number(scoreDraft.value[dimension.key])
      result[dimension.key] = Number.isFinite(raw) ? raw : 0
    }
    return result
  })

  const scoreDraftTotal = computed(() =>
    calculateCompetitionTotal(dimensions.value, scoreDraftNumbers.value)
  )

  const scoreDraftComplete = computed(() =>
    dimensions.value.every((dimension) => {
      const raw = Number(scoreDraft.value[dimension.key])
      return Number.isFinite(raw) && raw >= 0 && raw <= 10 && String(scoreDraft.value[dimension.key] ?? '') !== ''
    })
  )

  function openScoreEditor(
    round: CompetitionRoundView,
    singer: CompetitionSingerPublic,
    judgeId: string,
    judgeName: string
  ): void {
    const existing = round.scores.find(score => score.singerId === singer.id && score.judgeId === judgeId) ?? null
    const draft: Record<string, string> = {}
    for (const dimension of dimensions.value) {
      const saved = existing?.dimensions.find(item => item.key === dimension.key)?.score
      draft[dimension.key] = saved === undefined || saved === null ? '0' : String(saved)
    }
    scoreDraft.value = draft
    scoreCommentDraft.value = existing?.comment ?? ''
    scoreEditorSinger.value = singer
    scoreEditorJudgeId.value = judgeId
    scoreEditorJudgeName.value = judgeName
    scoreEditorRoundKey.value = round.key
    scoreEditorIsNew.value = existing === null
    scoreEditorOpen.value = true
  }

  function closeScoreEditor(): void {
    scoreEditorOpen.value = false
  }

  async function saveScoreEdit(): Promise<void> {
    if (!scoreEditorSinger.value || !scoreEditorRoundKey.value || savingScore.value) return
    if (!scoreDraftComplete.value) {
      toast.add({ title: '每个维度都要填 0-10 的分数', color: 'warning', icon: 'i-lucide-triangle-alert' })
      return
    }
    savingScore.value = true
    try {
      await adminFetch(`/api/admin/competition/rounds/${scoreEditorRoundKey.value}/scores`, {
        method: 'PUT',
        body: {
          singerId: scoreEditorSinger.value.id,
          judgeId: scoreEditorJudgeId.value,
          scores: scoreDraftNumbers.value,
          comment: scoreCommentDraft.value
        }
      })
      toast.add({
        title: `${scoreEditorIsNew.value ? '已补录' : '已修改'} ${scoreEditorSinger.value.name} · ${scoreEditorJudgeName.value}`,
        color: 'success',
        icon: 'i-lucide-check'
      })
      scoreEditorOpen.value = false
      await load()
    } catch (error) {
      toast.add({
        title: apiErrorMessage(error, '改分失败，请重试'),
        color: 'error',
        icon: 'i-lucide-circle-alert'
      })
    } finally {
      savingScore.value = false
    }
  }

  const exportingKind = ref<CompetitionExportKind | ''>('')

  /** 导出走浏览器原生下载：服务端带 content-disposition，cookie 会自动带上。 */
  function exportRound(round: CompetitionRoundView, kind: CompetitionExportKind): void {
    exportingKind.value = kind
    const link = document.createElement('a')
    link.href = `/api/admin/competition/rounds/${round.key}/export?kind=${kind}`
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => {
      exportingKind.value = ''
    }, 1200)
  }

  return {
    scoreEditorOpen,
    scoreEditorSinger,
    scoreEditorJudgeName,
    scoreDraft,
    scoreCommentDraft,
    savingScore,
    scoreDraftTotal,
    scoreDraftComplete,
    openScoreEditor,
    closeScoreEditor,
    saveScoreEdit,
    exportingKind,
    exportRound
  }
}
