import type {
  CompetitionDimension,
  CompetitionRoundKey,
  CompetitionRoundView,
  CompetitionSingerPublic
} from '~~/shared/types'
import { calculateCompetitionTotal } from '~~/shared/utils/competition'
import { adminFetch } from '~~/app/utils/admin-request'
import { apiErrorMessage } from './useCompetitionRoster'

export type CompetitionExportKind = 'detail' | 'summary' | 'advancing' | 'confirmed' | 'confirmed-plain' | 'songs'

export interface UseCompetitionScoresOptions {
  /** 当前轮次的维度定义（初赛 10 分制、复赛/决赛 20 分制）。 */
  dimensions: Ref<CompetitionDimension[]>
  /** 当前轮次每维满分。 */
  dimensionMax: Ref<number>
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
  const { dimensions, dimensionMax, load, toast } = options

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
    calculateCompetitionTotal(dimensions.value, scoreDraftNumbers.value, dimensionMax.value)
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

  const exportingKind = ref<CompetitionExportKind | 'accompaniment' | 'accompaniment-original' | ''>('')

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

  /** 导出复赛伴奏：一人一个文件夹的 zip，按出场顺序。 */
  /**
   * 伴奏包走对象存储直链下载：zip 先传到 COS，浏览器再从腾讯云边缘拉，
   * 不再受源站 3Mbps 出口限制。取不到直链时回落到原来的直连流式下载。
   */
  async function downloadAccompanimentZip(round: CompetitionRoundView, original: boolean): Promise<void> {
    exportingKind.value = original ? 'accompaniment-original' : 'accompaniment'
    const params = new URLSearchParams({ deliver: 'cos' })
    if (original) params.set('original', '1')
    try {
      // 用原生 fetch：$fetch 的模板字面量路由推导在这里会触发 TS2321（路由联合类型过深）
      const response = await fetch(`/api/admin/competition/rounds/${round.key}/accompaniment?${params.toString()}`, {
        credentials: 'include',
        headers: { accept: 'application/json' }
      })
      if (!response.ok) throw new Error(`export ${response.status}`)
      const result = await response.json() as { url?: string }
      if (!result.url) throw new Error('no url')
      const link = document.createElement('a')
      link.href = result.url
      link.rel = 'noopener'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      // 打包本身要几十秒，首次请求可能被网关超时掐断；对象存储里已经缓存了这一版，
      // 直接回落到源站会把几百 MB 的包从 3Mbps 出口挤一遍，现场体验更差，所以只提示重试。
      toast.add({
        title: '打包超时了，再点一次',
        description: '第一次打包要几十秒，包已经存好，第二次会立刻开始下载。',
        color: 'warning'
      })
    } finally {
      window.setTimeout(() => {
        exportingKind.value = ''
      }, 3000)
    }
  }

  async function exportAccompaniment(round: CompetitionRoundView): Promise<void> {
    if (exportingKind.value) return
    await downloadAccompanimentZip(round, false)
  }

  /** 导出选手当初上传的原件（m4a/wav 等），现场调音用 */
  async function exportOriginalAccompaniment(round: CompetitionRoundView): Promise<void> {
    if (exportingKind.value) return
    await downloadAccompanimentZip(round, true)
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
    exportRound,
    exportAccompaniment,
    exportOriginalAccompaniment
  }
}
