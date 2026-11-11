import type {
  CompetitionRoundView,
  CompetitionScore,
  CompetitionSinger,
  CompetitionSingerPublic
} from '~~/shared/types'
import { adminFetch } from '~~/app/utils/admin-request'
import { apiErrorMessage } from './useCompetitionRoster'

interface SingerDraft {
  name: string
  song: string
  className: string
  remark: string
  studentNo: string
  phone: string
  email: string
  sortOrder: string
}

export interface UseCompetitionSingersOptions {
  load: () => Promise<void>
  toast: ReturnType<typeof useToast>
}

/** 选手簇：名单导入、新增、编辑、删除、单评委成绩查看。 */
export function useCompetitionSingers(options: UseCompetitionSingersOptions) {
  const { load, toast } = options

  const importingSingers = ref(false)
  const addingSinger = ref(false)
  const savingSinger = ref(false)

  const importInput = ref<HTMLInputElement | null>(null)

  const editingSinger = ref<CompetitionSinger | null>(null)
  const editSingerOpen = ref(false)
  const editSingerForm = ref<SingerDraft>({
    name: '',
    song: '',
    className: '',
    remark: '',
    studentNo: '',
    phone: '',
    email: '',
    sortOrder: ''
  })

  const detailSinger = ref<CompetitionSingerPublic | null>(null)
  const detailScore = ref<CompetitionScore | null>(null)

  const newSinger = ref<SingerDraft>({
    name: '',
    song: '',
    className: '',
    remark: '',
    studentNo: '',
    phone: '',
    email: '',
    sortOrder: ''
  })

  function triggerImport(): void {
    importInput.value?.click()
  }

  async function onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || importingSingers.value) return

    const formData = new FormData()
    formData.append('file', file)
    importingSingers.value = true
    try {
      const result = await adminFetch<{ imported: number, skipped: number, parsed: number }>(
        '/api/admin/competition/singers/import',
        { method: 'POST', body: formData }
      )
      await load()
      toast.add({
        title: `导入完成：新增 ${result.imported} 位${result.skipped > 0 ? `，跳过重复 ${result.skipped} 位` : ''}`,
        color: 'success'
      })
    } catch (error) {
      toast.add({
        title: '导入失败',
        description: apiErrorMessage(error, '请检查表格是否包含「姓名」和「歌曲」两列。'),
        color: 'warning'
      })
    } finally {
      importingSingers.value = false
    }
  }

  function singerPayload(draft: SingerDraft): Record<string, unknown> {
    const body: Record<string, unknown> = {
      name: draft.name.trim(),
      song: draft.song.trim(),
      className: draft.className.trim() || null,
      remark: draft.remark.trim() || null,
      studentNo: draft.studentNo.trim() || null,
      phone: draft.phone.trim() || null,
      email: draft.email.trim() || null
    }
    if (draft.sortOrder.trim() !== '') body.sortOrder = Number(draft.sortOrder)
    return body
  }

  async function addSinger(): Promise<void> {
    if (addingSinger.value) return
    if (!newSinger.value.name.trim() || !newSinger.value.song.trim()) {
      toast.add({ title: '请填写选手姓名和参赛歌曲', color: 'warning' })
      return
    }
    addingSinger.value = true
    try {
      await adminFetch('/api/admin/competition/singers', {
        method: 'POST',
        body: singerPayload(newSinger.value)
      })
      newSinger.value = { name: '', song: '', className: '', remark: '', studentNo: '', phone: '', email: '', sortOrder: '' }
      await load()
      toast.add({ title: '已添加选手', color: 'success' })
    } catch (error) {
      toast.add({ title: '添加失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      addingSinger.value = false
    }
  }

  function openEditSinger(singer: CompetitionSinger): void {
    editingSinger.value = singer
    editSingerForm.value = {
      name: singer.name,
      song: singer.song,
      className: singer.className ?? '',
      remark: singer.remark ?? '',
      studentNo: singer.studentNo ?? '',
      phone: singer.phone ?? '',
      email: singer.email ?? '',
      sortOrder: String(singer.sortOrder)
    }
    editSingerOpen.value = true
  }

  async function saveSingerEdit(): Promise<void> {
    const singer = editingSinger.value
    if (!singer || savingSinger.value) return
    if (!editSingerForm.value.name.trim() || !editSingerForm.value.song.trim()) {
      toast.add({ title: '请填写选手姓名和参赛歌曲', color: 'warning' })
      return
    }
    savingSinger.value = true
    try {
      await adminFetch(`/api/admin/competition/singers/${singer.id}`, {
        method: 'PUT',
        body: singerPayload(editSingerForm.value)
      })
      editSingerOpen.value = false
      await load()
      toast.add({ title: '选手信息已保存', color: 'success' })
    } catch (error) {
      toast.add({ title: '保存失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      savingSinger.value = false
    }
  }

  async function removeSinger(singer: CompetitionSinger): Promise<void> {
    if (!window.confirm(`删除选手「${singer.name}」？该选手在各轮的评分与名单会一并删除。`)) return
    try {
      await adminFetch(`/api/admin/competition/singers/${singer.id}`, { method: 'DELETE' })
      await load()
      toast.add({ title: '选手已删除', color: 'success' })
    } catch (error) {
      toast.add({ title: '删除失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    }
  }

  function scoreFor(round: CompetitionRoundView, singerId: string, judgeId: string): CompetitionScore | null {
    return round.scores.find(score => score.singerId === singerId && score.judgeId === judgeId) ?? null
  }

  function scoreTotalFor(round: CompetitionRoundView, singerId: string, judgeId: string): string {
    const score = scoreFor(round, singerId, judgeId)
    return score ? score.total.toFixed(2) : '—'
  }

  function openScoreFor(round: CompetitionRoundView, singer: CompetitionSingerPublic, judgeId: string): void {
    const score = scoreFor(round, singer.id, judgeId)
    if (score) openScoreDetail(singer, score)
  }

  function openScoreDetail(singer: CompetitionSingerPublic, score: CompetitionScore): void {
    detailSinger.value = singer
    detailScore.value = score
  }

  function closeDetail(): void {
    detailSinger.value = null
    detailScore.value = null
  }

  function closeEditSinger(): void {
    editSingerOpen.value = false
  }

  return {
    importInput,
    importingSingers,
    triggerImport,
    onImportFile,
    newSinger,
    addingSinger,
    singerPayload,
    addSinger,
    editingSinger,
    editSingerOpen,
    editSingerForm,
    savingSinger,
    openEditSinger,
    saveSingerEdit,
    removeSinger,
    detailSinger,
    detailScore,
    scoreFor,
    scoreTotalFor,
    openScoreFor,
    openScoreDetail,
    closeDetail,
    closeEditSinger
  }
}
