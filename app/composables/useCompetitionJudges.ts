import type { Ref } from 'vue'
import type {
  CompetitionJudge,
  CompetitionJudgeCredentials,
  CompetitionRoundView
} from '~~/shared/types'
import { adminFetch } from '~~/app/utils/admin-request'
import { missingJudgeCount } from './useCompetitionRoster'
import type { SettingsDraft } from './useCompetitionPayload'

export interface UseCompetitionJudgesOptions {
  settings: Readonly<Ref<SettingsDraft | null>>
  load: () => Promise<void>
  toast: ReturnType<typeof useToast>
  generatingRoundKey: Ref<string>
}

/** 评委簇：生成账号、手动添加、改账号密码与名称、启用停用、重置密码、删除、复制凭据。 */
export function useCompetitionJudges(options: UseCompetitionJudgesOptions) {
  const { settings, load, toast, generatingRoundKey } = options

  const busyJudgeId = ref('')
  const addingJudge = ref(false)
  const newJudgeUsername = ref('')
  const newJudgePassword = ref('')
  const newJudgeDisplayName = ref('')
  const judgeCredEditId = ref('')
  const judgeCredEditName = ref('')
  const judgeUsernameDraft = ref('')
  const judgePasswordDraft = ref('')
  const credentials = ref<CompetitionJudgeCredentials[]>([])
  const credentialsOpen = ref(false)

  async function generateJudges(round: CompetitionRoundView): Promise<void> {
    const count = missingJudgeCount(round)
    if (count <= 0 || generatingRoundKey.value) return

    generatingRoundKey.value = round.key
    try {
      const result = await adminFetch<{ judges: CompetitionJudgeCredentials[] }>(
        `/api/admin/competition/rounds/${round.key}/judges`,
        { method: 'POST', body: { count } }
      )
      credentials.value = result.judges
      credentialsOpen.value = true
      await load()
      toast.add({ title: `已生成 ${result.judges.length} 个${round.title}评委账号`, color: 'success' })
    } catch (error) {
      toast.add({ title: '生成失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      generatingRoundKey.value = ''
    }
  }

  async function addJudge(round: CompetitionRoundView): Promise<void> {
    if (addingJudge.value) return
    addingJudge.value = true
    try {
      const body: Record<string, string> = {}
      if (newJudgeUsername.value.trim()) body.username = newJudgeUsername.value.trim()
      if (newJudgePassword.value) body.password = newJudgePassword.value
      if (newJudgeDisplayName.value.trim()) body.displayName = newJudgeDisplayName.value.trim()

      const result = await adminFetch<{ judges: CompetitionJudgeCredentials[] }>(
        `/api/admin/competition/rounds/${round.key}/judges`,
        { method: 'POST', body }
      )
      credentials.value = result.judges
      credentialsOpen.value = true
      newJudgeUsername.value = ''
      newJudgePassword.value = ''
      newJudgeDisplayName.value = ''
      await load()
    } catch (error) {
      toast.add({ title: '添加失败', description: apiErrorMessage(error, '账号可能已被占用。'), color: 'warning' })
    } finally {
      addingJudge.value = false
    }
  }

  function openJudgeCredentials(judge: CompetitionJudge): void {
    judgeCredEditId.value = judge.id
    judgeCredEditName.value = judge.displayName
    judgeUsernameDraft.value = judge.username
    judgePasswordDraft.value = ''
  }

  function closeJudgeCredentials(): void {
    judgeCredEditId.value = ''
    judgeCredEditName.value = ''
    judgeUsernameDraft.value = ''
    judgePasswordDraft.value = ''
  }

  async function saveJudgeCredentials(round: CompetitionRoundView | null): Promise<void> {
    if (!round || !judgeCredEditId.value) return
    const username = judgeUsernameDraft.value.trim()
    if (!username) {
      toast.add({ title: '登录账号不能为空', color: 'warning' })
      return
    }
    const body: Record<string, string> = { username }
    if (judgePasswordDraft.value) body.password = judgePasswordDraft.value

    busyJudgeId.value = judgeCredEditId.value
    try {
      await adminFetch(`/api/admin/competition/rounds/${round.key}/judges/${judgeCredEditId.value}`, {
        method: 'PATCH',
        body
      })
      closeJudgeCredentials()
      await load()
      toast.add({ title: '账号密码已更新', color: 'success' })
    } catch (error) {
      toast.add({ title: '保存失败', description: apiErrorMessage(error, '账号可能已被占用。'), color: 'warning' })
    } finally {
      busyJudgeId.value = ''
    }
  }

  async function saveJudgeName(round: CompetitionRoundView, judge: CompetitionJudge): Promise<void> {
    if (!judge.displayName.trim()) {
      toast.add({ title: '评委名称不能为空', color: 'warning' })
      return
    }
    busyJudgeId.value = judge.id
    try {
      await adminFetch(`/api/admin/competition/rounds/${round.key}/judges/${judge.id}`, {
        method: 'PATCH',
        body: { displayName: judge.displayName.trim() }
      })
      await load()
      toast.add({ title: '评委名称已保存', color: 'success' })
    } catch (error) {
      toast.add({ title: '保存失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      busyJudgeId.value = ''
    }
  }

  async function toggleJudgeActive(
    round: CompetitionRoundView | null,
    judge: CompetitionJudge,
    isActive: boolean
  ): Promise<void> {
    if (!round) return
    busyJudgeId.value = judge.id
    try {
      await adminFetch(`/api/admin/competition/rounds/${round.key}/judges/${judge.id}`, {
        method: 'PATCH',
        body: { isActive }
      })
      await load()
    } catch (error) {
      toast.add({ title: '操作失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      busyJudgeId.value = ''
    }
  }

  async function resetJudgePassword(round: CompetitionRoundView, judge: CompetitionJudge): Promise<void> {
    if (!window.confirm(`重置「${judge.displayName}」的密码？旧密码将立即失效。`)) return
    busyJudgeId.value = judge.id
    try {
      const result = await adminFetch<{ password: string }>(
        `/api/admin/competition/rounds/${round.key}/judges/${judge.id}/reset-password`,
        { method: 'POST' }
      )
      credentials.value = [{
        id: judge.id,
        username: judge.username,
        displayName: judge.displayName,
        password: result.password
      }]
      credentialsOpen.value = true
    } catch (error) {
      toast.add({ title: '重置失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      busyJudgeId.value = ''
    }
  }

  async function removeJudge(round: CompetitionRoundView, judge: CompetitionJudge): Promise<void> {
    const warning = judge.scoreCount > 0
      ? `「${judge.displayName}」已提交 ${judge.scoreCount} 条评分，删除账号会同时删除这些评分并改变排名。确定删除？`
      : `确定删除评委账号「${judge.displayName}」？`
    if (!window.confirm(warning)) return

    busyJudgeId.value = judge.id
    try {
      await adminFetch(`/api/admin/competition/rounds/${round.key}/judges/${judge.id}`, { method: 'DELETE' })
      toast.add({ title: '评委账号已删除', color: 'success' })
      await load()
    } catch (error) {
      toast.add({ title: '删除失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
    } finally {
      busyJudgeId.value = ''
    }
  }

  async function copyCredentials(): Promise<void> {
    if (credentials.value.length === 0) return
    const lines = [
      `${settings.value?.title || '新声歌手大赛'} 评委账号`,
      '登录地址：/judge/login',
      '',
      ...credentials.value.map(item =>
        `${item.displayName}\t账号：${item.username}\t密码：${item.password}`)
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast.add({ title: '账号密码已复制', color: 'success' })
    } catch {
      toast.add({ title: '复制失败，请手动选择文本复制', color: 'warning' })
    }
  }

  function closeCredentials(): void {
    credentialsOpen.value = false
  }

  return {
    busyJudgeId,
    addingJudge,
    newJudgeUsername,
    newJudgePassword,
    newJudgeDisplayName,
    judgeCredEditId,
    judgeCredEditName,
    judgeUsernameDraft,
    judgePasswordDraft,
    credentials,
    credentialsOpen,
    addJudge,
    generateJudges,
    openJudgeCredentials,
    closeJudgeCredentials,
    saveJudgeCredentials,
    saveJudgeName,
    toggleJudgeActive,
    resetJudgePassword,
    removeJudge,
    copyCredentials,
    closeCredentials
  }
}
