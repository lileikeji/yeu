import type {
  CompetitionDimension,
  CompetitionRoundKey,
  CompetitionRoundView,
  CompetitionSingerPublic
} from '~~/shared/types'
import { calculateCompetitionTotal, dimensionMaxOf } from '~~/shared/utils/competition'
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
      const max = dimensionMaxOf(dimension, dimensionMax.value)
      return Number.isFinite(raw) && raw >= 0 && raw <= max && String(scoreDraft.value[dimension.key] ?? '') !== ''
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
  /* 打包进度：服务端在后台读 COS、拼 zip、再传回 COS，原件包要三十秒以上。 */
  const exportProgress = ref<{ done: number, total: number } | null>(null)

  function triggerDownload(url: string): void {
    const link = document.createElement('a')
    link.href = url
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  async function downloadAccompanimentZip(round: CompetitionRoundView, original: boolean): Promise<void> {
    exportingKind.value = original ? 'accompaniment-original' : 'accompaniment'
    exportProgress.value = null
    try {
      // 用原生 fetch：$fetch 的模板字面量路由推导在这里会触发 TS2321（路由联合类型过深）
      // adminFetch 会自动带上 CSRF 头（__Host-yeu_admin_csrf），裸 fetch 会被判 401/403
      const started = await adminFetch<{ jobId?: string, total?: number }>(
        `/api/admin/competition/rounds/${round.key}/accompaniment-job`,
        { method: 'POST', body: { original } }
      )
      if (!started.jobId) throw new Error('no jobId')
      exportProgress.value = { done: 0, total: started.total ?? 0 }

      for (let attempt = 0; attempt < 300; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 1000))
        const job = await adminFetch<{ status: string, done: number, total: number, url?: string | null, message?: string | null }>(
          `/api/admin/competition/rounds/${round.key}/accompaniment-job`,
          { query: { jobId: started.jobId } }
        )
        exportProgress.value = { done: job.done, total: job.total }
        if (job.status === 'error') throw new Error(job.message || '打包失败')
        if (job.status === 'done') {
          if (!job.url) throw new Error('no url')
          triggerDownload(job.url)
          toast.add({
            title: original ? '原件包已开始下载' : '伴奏包已开始下载',
            description: '走对象存储直链，速度取决于你的网络。',
            color: 'success'
          })
          return
        }
      }
      throw new Error('timeout')
    } catch (error) {
      toast.add({
        title: '打包没成功',
        description: error instanceof Error && error.message !== 'timeout'
          ? `再点一次试试：${error.message}`
          : '打包超过 5 分钟，再点一次；已经打好的那部分会直接复用。',
        color: 'warning'
      })
    } finally {
      exportProgress.value = null
      window.setTimeout(() => {
        exportingKind.value = ''
      }, 1500)
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
    exportProgress,
    exportRound,
    exportAccompaniment,
    exportOriginalAccompaniment
  }
}
