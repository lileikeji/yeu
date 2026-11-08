<script setup lang="ts">
import type {
  CompetitionAdminPayload,
  CompetitionDimension,
  CompetitionEvent,
  CompetitionJudge,
  CompetitionJudgeCredentials,
  CompetitionRoundEntry,
  CompetitionRoundKey,
  CompetitionRoundView,
  CompetitionScore,
  CompetitionSinger,
  CompetitionSingerPublic
} from '~~/shared/types'
import { COMPETITION_EMAIL_MERGE_FIELDS, DEFAULT_COMPETITION_DIMENSIONS } from '~~/shared/utils/competition'
import { adminFetch } from '~~/app/utils/admin-request'

definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: '新生歌手大赛',
  robots: 'noindex, nofollow'
})

interface SettingsDraft {
  title: string
  registrationOpen: boolean
  dimensions: CompetitionDimension[]
}

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

type SectionKey = 'settings' | 'singers' | 'email' | CompetitionRoundKey
type EmailScope = 'all' | 'qualified' | 'unqualified'

const toast = useToast()

const loading = ref(true)
const loadError = ref('')
const payload = ref<CompetitionAdminPayload | null>(null)
const settings = ref<SettingsDraft | null>(null)
const activeSection = ref<SectionKey>('settings')
const savingSettings = ref(false)
const savingRoundKey = ref('')
const generatingRoundKey = ref('')
const importingSingers = ref(false)
const addingSinger = ref(false)
const savingSinger = ref(false)
const busyJudgeId = ref('')
const credentials = ref<CompetitionJudgeCredentials[]>([])
const credentialsOpen = ref(false)
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

const emailRound = ref<CompetitionRoundKey>('prelim')
const emailScope = ref<EmailScope>('all')
const emailSavingTemplate = ref(false)
const emailSending = ref(false)
const emailTesting = ref(false)
const emailTestAddress = ref('')
const emailBodyRef = ref<HTMLTextAreaElement | null>(null)

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

const sections = [
  { key: 'settings', label: '赛事设置', icon: 'i-lucide-sliders-horizontal' },
  { key: 'singers', label: '选手库', icon: 'i-lucide-list-music' },
  { key: 'prelim', label: '初赛', icon: 'i-lucide-flag' },
  { key: 'semi', label: '复赛', icon: 'i-lucide-git-branch' },
  { key: 'final', label: '决赛', icon: 'i-lucide-trophy' },
  { key: 'email', label: '邮件通知', icon: 'i-lucide-mail' }
] as const

const event = computed<CompetitionEvent | null>(() => payload.value?.event ?? null)
const maxTotal = computed(() => event.value?.maxTotal ?? 0)
const singers = computed(() => payload.value?.singers ?? [])

const activeRound = computed<CompetitionRoundView | null>(() => {
  const key = activeSection.value
  if (key === 'settings' || key === 'singers' || key === 'email') return null
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

function settingsFromEvent(source: CompetitionEvent): SettingsDraft {
  return {
    title: source.title,
    registrationOpen: source.registrationOpen,
    dimensions: cloneDimensions(source.dimensions)
  }
}

function apiErrorMessage(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null) return fallback
  const data = (error as { data?: { data?: { message?: string, issues?: Array<{ message?: string }> } } }).data?.data
  if (data?.message) return data.message
  const issue = data?.issues?.find(item => item?.message)
  return issue?.message ?? fallback
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

function missingJudgeCount(round: CompetitionRoundView): number {
  return Math.max(0, Number(round.judgeCount || 0) - round.judges.length)
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
      ? '该功能仅开放给音乐协会的组织管理员。'
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

  savingSettings.value = true
  try {
    const data = await adminFetch<CompetitionAdminPayload>('/api/admin/competition', {
      method: 'PUT',
      body: {
        title: draft.title.trim(),
        registrationOpen: draft.registrationOpen,
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
    const body: Record<string, unknown> = { judgeCount: Number(round.judgeCount) }
    if (round.key !== 'final') {
      body.advanceCount = round.advanceCount === null ? null : Number(round.advanceCount)
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

async function setRoundStatus(round: CompetitionRoundView, status: 'open' | 'closed'): Promise<void> {
  if (savingRoundKey.value) return
  if (status === 'closed' && !window.confirm(`结束${round.title}评分？结束后评委不能再修改成绩；未评分选手按弃权处理。`)) {
    return
  }
  if (status === 'open' && round.status === 'closed'
    && !window.confirm(`重新开放${round.title}评分？如果下一轮名单已生成，系统会拒绝此操作。`)) {
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
    `${event.value?.title || '新生歌手大赛'} · ${round.title}出场名单`,
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
    `${settings.value?.title || '新生歌手大赛'} 评委账号`,
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
  const template = emailTemplate.value
  if (!template) return
  const el = emailBodyRef.value
  if (!el) {
    template.body += key
    return
  }
  const start = el.selectionStart ?? template.body.length
  const end = el.selectionEnd ?? start
  template.body = template.body.slice(0, start) + key + template.body.slice(end)
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start + key.length, start + key.length)
  })
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

function closeCredentials(): void {
  credentialsOpen.value = false
}

function closeEditSinger(): void {
  editSingerOpen.value = false
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          新生歌手大赛
        </h1>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {{ event
            ? `音乐协会 · 初赛/复赛/决赛 · 单评委满分 ${event.maxTotal}`
            : '仅音乐协会可用：三轮独立评委、随机抽签、评分与排行' }}
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          icon="i-lucide-megaphone"
          label="宣传页"
          to="/singer"
          target="_blank"
          rel="noopener noreferrer"
          color="neutral"
          variant="soft"
        />
        <UButton
          icon="i-lucide-external-link"
          label="评委登录页"
          to="/judge/login"
          target="_blank"
          rel="noopener noreferrer"
          color="neutral"
          variant="soft"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="soft"
          :loading="loading"
          @click="load"
        />
        <UButton
          v-if="activeSection === 'settings'"
          icon="i-lucide-save"
          label="保存设置"
          :loading="savingSettings"
          :disabled="!settings"
          @click="saveSettings"
        />
      </div>
    </div>

    <div
      v-if="loading && !payload"
      class="grid min-h-80 place-items-center"
      role="status"
    >
      <UIcon
        name="i-lucide-loader-circle"
        class="size-7 animate-spin text-green-700 dark:text-green-400"
      />
    </div>

    <div
      v-else-if="loadError"
      class="rounded-lg border border-red-200 bg-red-50 p-5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
      role="alert"
    >
      {{ loadError }}
    </div>

    <template v-else-if="payload && settings && event">
      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div class="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <p class="text-xs text-zinc-500 dark:text-zinc-400">
            选手库
          </p>
          <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {{ singers.length }}
          </p>
        </div>
        <div
          v-for="round in roundSummary"
          :key="round.id"
          class="rounded-lg border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <p class="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>{{ round.title }}</span>
            <span>{{ round.judges.length }} 评委</span>
          </p>
          <p class="mt-1 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
            {{ round.scoredSingerCount }}
            <span class="text-sm font-medium text-zinc-400">/ {{ round.entries.length }} 人有分</span>
          </p>
          <p class="mt-0.5 text-xs text-zinc-400">
            {{ roundStatusText(round) }}<template v-if="round.status === 'closed' && round.advanceCount !== null">
              · 晋级 {{ round.qualifiedCount }} / {{ round.advanceCount }}
            </template>
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
        <button
          v-for="section in sections"
          :key="section.key"
          type="button"
          class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
          :class="activeSection === section.key
            ? 'bg-zinc-900 text-white dark:bg-zinc-700'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
          @click="activeSection = section.key"
        >
          {{ section.label }}
        </button>
      </div>

      <section
        v-show="activeSection === 'settings'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="比赛名称">
              <UInput
                v-model="settings.title"
                class="w-full"
                placeholder="新生歌手大赛"
              />
            </UFormField>
            <UFormField label="现场登记入口">
              <div class="flex items-center gap-3 pt-1">
                <USwitch
                  :model-value="settings.registrationOpen"
                  @update:model-value="value => settings && (settings.registrationOpen = value === true)"
                />
                <span class="text-sm text-zinc-600 dark:text-zinc-300">
                  {{ settings.registrationOpen ? '开放中，登记页可提交' : '已关闭，登记页只读' }}
                </span>
              </div>
            </UFormField>
          </div>
          <div class="mt-3 grid gap-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400 sm:grid-cols-2">
            <p>
              赛制：初赛全员参加，结束后取前 30 名进入复赛；复赛晋级名额在复赛页设置（可先留空）；
              决赛决出最终排行。登记入口关闭后，现场扫码登记页不可再提交。
            </p>
            <p>
              每轮评委相互独立，可在各轮页面单独生成账号。未在评分结束前提交成绩的选手，按弃权处理。
            </p>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                评分维度与占比
              </h2>
              <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                每个维度满分 20 分。占比按相对权重归一化；默认五维等权时，单评委总分即五项累加（满分 100）。
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                size="xs"
                icon="i-lucide-rotate-ccw"
                label="恢复默认五维"
                color="neutral"
                variant="soft"
                :disabled="hasAnyScores"
                @click="restoreDefaultDimensions"
              />
              <UButton
                size="xs"
                icon="i-lucide-plus"
                label="添加维度"
                variant="soft"
                :disabled="hasAnyScores"
                @click="addDimension"
              />
            </div>
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-for="(dimension, index) in settings.dimensions"
              :key="dimension.key"
              class="flex flex-wrap items-end gap-2 rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800"
            >
              <UFormField
                label="维度名称"
                class="min-w-40 flex-1"
              >
                <UInput
                  v-model="dimension.label"
                  class="w-full"
                  :disabled="hasAnyScores"
                  placeholder="如：音准"
                />
              </UFormField>
              <UFormField
                label="权重"
                class="w-28"
              >
                <UInput
                  :model-value="dimension.weight"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  class="w-full"
                  :disabled="hasAnyScores"
                  @update:model-value="value => dimension.weight = Number(value) || 0"
                />
              </UFormField>
              <div class="w-20 pb-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                占 {{ weightPercent(dimension) }}%
              </div>
              <div class="flex items-center gap-1 pb-0.5">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-up"
                  aria-label="上移"
                  :disabled="index === 0 || hasAnyScores"
                  @click="moveDimension(index, -1)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-down"
                  aria-label="下移"
                  :disabled="index === settings.dimensions.length - 1 || hasAnyScores"
                  @click="moveDimension(index, 1)"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="soft"
                  icon="i-lucide-trash-2"
                  aria-label="删除维度"
                  :disabled="settings.dimensions.length <= 1 || hasAnyScores"
                  @click="removeDimension(index)"
                />
              </div>
            </div>
          </div>

          <p class="mt-3 border-t border-zinc-100 pt-3 text-xs text-amber-700 dark:border-zinc-800 dark:text-amber-300">
            {{ hasAnyScores
              ? '比赛已有评分，维度与占比已锁定；已保存成绩按当时快照计算。'
              : '评分开始后维度与占比会锁定，请在首轮评分前完成设置。' }}
          </p>
        </div>
      </section>

      <section
        v-show="activeSection === 'singers'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                导入歌手名单
              </h2>
              <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                支持 .xlsx / .xls / .csv，表头需包含「姓名」和「歌曲」两列，可另加「班级」列。
                按表格行顺序作为初赛出场顺序；重复的姓名+歌曲会自动跳过。
              </p>
            </div>
            <div>
              <input
                ref="importInput"
                type="file"
                accept=".xlsx,.xls,.csv"
                class="hidden"
                @change="onImportFile"
              >
              <UButton
                icon="i-lucide-upload"
                label="选择名单文件"
                :loading="importingSingers"
                variant="soft"
                @click="triggerImport"
              />
            </div>
          </div>

          <div class="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
            <h3 class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              手动添加选手
            </h3>
            <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              现场扫码登记的选手会自动进入本表；这里用于补录或修正。歌曲可留空（待定）。
            </p>
            <div class="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
              <UFormField label="姓名">
                <UInput
                  v-model="newSinger.name"
                  class="w-full"
                  placeholder="选手姓名"
                />
              </UFormField>
              <UFormField label="班级（可选）">
                <UInput
                  v-model="newSinger.className"
                  class="w-full"
                  placeholder="如 26音乐学1班"
                />
              </UFormField>
              <UFormField label="学号（可选）">
                <UInput
                  v-model="newSinger.studentNo"
                  class="w-full"
                  placeholder="现场登记自动填写"
                />
              </UFormField>
              <UFormField label="电话（可选）">
                <UInput
                  v-model="newSinger.phone"
                  class="w-full"
                  placeholder="现场登记自动填写"
                />
              </UFormField>
              <UFormField label="邮箱（可选）">
                <UInput
                  v-model="newSinger.email"
                  class="w-full"
                  placeholder="用于接收结果邮件"
                />
              </UFormField>
              <UFormField label="参赛歌曲（可待定）">
                <UInput
                  v-model="newSinger.song"
                  class="w-full"
                  placeholder="可留空，赛前补充"
                />
              </UFormField>
              <UFormField label="备注（可选）">
                <UInput
                  v-model="newSinger.remark"
                  class="w-full"
                  placeholder="伴奏、上场要求等"
                />
              </UFormField>
              <UFormField label="初赛序号（可选）">
                <UInput
                  v-model="newSinger.sortOrder"
                  type="number"
                  min="0"
                  class="w-full"
                  placeholder="自动排到最后"
                />
              </UFormField>
              <div class="flex items-end xl:col-span-2">
                <UButton
                  icon="i-lucide-plus"
                  label="添加"
                  class="w-full"
                  :loading="addingSinger"
                  @click="addSinger"
                />
              </div>
            </div>
          </div>
        </div>

        <div
          v-if="singers.length === 0"
          class="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
        >
          还没有选手。导入名单或手动添加后，初赛名单会自动同步。
        </div>

        <div
          v-else
          class="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800"
        >
          <table class="w-full min-w-[1180px] text-sm">
            <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
              <tr>
                <th class="w-16 px-3 py-2 font-medium">
                  序号
                </th>
                <th class="px-3 py-2 font-medium">
                  姓名
                </th>
                <th class="px-3 py-2 font-medium">
                  参赛歌曲
                </th>
                <th class="px-3 py-2 font-medium">
                  班级
                </th>
                <th class="px-3 py-2 font-medium">
                  学号
                </th>
                <th class="px-3 py-2 font-medium">
                  电话
                </th>
                <th class="px-3 py-2 font-medium">
                  邮箱
                </th>
                <th class="px-3 py-2 font-medium">
                  来源
                </th>
                <th class="px-3 py-2 font-medium">
                  备注
                </th>
                <th class="px-3 py-2 font-medium">
                  轮次
                </th>
                <th class="px-3 py-2 font-medium">
                  操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr
                v-for="singer in singers"
                :key="singer.id"
                class="text-zinc-800 dark:text-zinc-200"
              >
                <td class="px-3 py-2 tabular-nums text-zinc-500">
                  {{ singer.sortOrder }}
                </td>
                <td class="px-3 py-2 font-medium">
                  {{ singer.name }}
                </td>
                <td class="px-3 py-2">
                  {{ singer.song || '待定' }}
                </td>
                <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {{ singer.className || '—' }}
                </td>
                <td class="px-3 py-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {{ singer.studentNo || '—' }}
                </td>
                <td class="px-3 py-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  {{ singer.phone || '—' }}
                </td>
                <td class="max-w-44 truncate px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  {{ singer.email || '—' }}
                </td>
                <td class="px-3 py-2">
                  <span
                    class="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    :class="singer.source === 'pre'
                      ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                      : singer.source === 'form'
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300'
                        : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'"
                  >
                    {{ singer.source === 'pre' ? '预报名确认' : singer.source === 'form' ? '现场填写' : '后台录入' }}
                  </span>
                </td>
                <td class="max-w-56 px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span class="line-clamp-2">{{ singer.remark || '—' }}</span>
                </td>
                <td class="px-3 py-2">
                  <div class="flex flex-wrap gap-1">
                    <span
                      v-for="round in payload.rounds"
                      :key="round.id"
                      class="rounded px-1.5 py-0.5 text-[10px] font-medium"
                      :class="round.entries.some(entry => entry.singer.id === singer.id)
                        ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                        : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'"
                    >
                      {{ round.title }}
                    </span>
                  </div>
                </td>
                <td class="px-3 py-2">
                  <div class="flex items-center gap-1">
                    <UButton
                      size="xs"
                      variant="soft"
                      icon="i-lucide-pencil"
                      label="编辑"
                      @click="openEditSinger(singer)"
                    />
                    <UButton
                      size="xs"
                      color="error"
                      variant="soft"
                      icon="i-lucide-trash-2"
                      aria-label="删除选手"
                      @click="removeSinger(singer)"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              预报名名单
            </h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              赛前预报名共 {{ payload.preRegistrations.length }} 人，其中
              {{ payload.preRegistrations.filter(item => item.registeredAt).length }} 人已到现场确认正式登记。
              未确认的选手在正式登记页输入姓名即可一键带出。
            </p>
          </div>
          <div
            v-if="payload.preRegistrations.length === 0"
            class="px-4 py-8 text-center text-sm text-zinc-400"
          >
            还没有预报名记录。
          </div>
          <div
            v-else
            class="overflow-x-auto"
          >
            <table class="w-full min-w-[860px] text-sm">
              <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th class="px-4 py-2 font-medium">
                    姓名
                  </th>
                  <th class="px-3 py-2 font-medium">
                    班级
                  </th>
                  <th class="px-3 py-2 font-medium">
                    学号
                  </th>
                  <th class="px-3 py-2 font-medium">
                    电话
                  </th>
                  <th class="px-3 py-2 font-medium">
                    歌曲
                  </th>
                  <th class="px-3 py-2 font-medium">
                    状态
                  </th>
                  <th class="px-4 py-2 font-medium">
                    预报名时间
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr
                  v-for="item in payload.preRegistrations"
                  :key="item.id"
                >
                  <td class="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {{ item.name }}
                  </td>
                  <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {{ item.className || '—' }}
                  </td>
                  <td class="px-3 py-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {{ item.studentNo || '—' }}
                  </td>
                  <td class="px-3 py-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {{ item.phone || '—' }}
                  </td>
                  <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {{ item.song || '待定' }}
                  </td>
                  <td class="px-3 py-2">
                    <span
                      class="rounded px-1.5 py-0.5 text-xs font-medium"
                      :class="item.registeredAt
                        ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                        : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'"
                    >
                      {{ item.registeredAt ? `已登记（${item.registeredSingerName || item.name}）` : '未到场确认' }}
                    </span>
                  </td>
                  <td class="px-4 py-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {{ formatDateTime(item.createdAt) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        v-if="activeRound"
        v-show="activeSection !== 'settings' && activeSection !== 'singers' && activeSection !== 'email'"
        class="space-y-4"
      >
        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {{ activeRound.title }}
                </h2>
                <span
                  class="rounded-full px-2.5 py-0.5 text-xs font-medium"
                  :class="roundStatusClass(activeRound)"
                >
                  {{ roundStatusText(activeRound) }}
                </span>
                <span class="text-xs text-zinc-400">
                  名单 {{ activeRound.entries.length }} 人 · 评委 {{ activeRound.judges.length }} 人 · 已提交 {{ activeRound.scores.length }} 条评分
                </span>
              </div>
              <p
                v-if="activeRound.key === 'prelim'"
                class="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
              >
                初赛名单来自选手库，按导入顺序出场；结束后取前 {{ activeRound.advanceCount ?? 30 }} 名进入复赛。
              </p>
              <p
                v-else
                class="mt-1 text-xs text-zinc-500 dark:text-zinc-400"
              >
                {{ advanceHint(activeRound) || '请先从上一轮生成名单。' }}
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                v-if="activeRound.status !== 'open'"
                icon="i-lucide-play"
                label="开放评分"
                :loading="savingRoundKey === activeRound.key"
                :disabled="activeRound.entries.length === 0"
                @click="setRoundStatus(activeRound, 'open')"
              />
              <UButton
                v-else
                icon="i-lucide-square"
                label="结束评分"
                color="warning"
                :loading="savingRoundKey === activeRound.key"
                @click="setRoundStatus(activeRound, 'closed')"
              />
              <UButton
                v-if="activeRound.key !== 'final'"
                icon="i-lucide-shuffle"
                label="生成下一轮名单并抽签"
                color="neutral"
                variant="soft"
                :disabled="!canGenerate(activeRound)"
                :loading="generatingRoundKey === activeRound.key"
                @click="generateNextRound(activeRound)"
              />
              <UButton
                v-if="activeRound.key !== 'prelim'"
                icon="i-lucide-dices"
                label="重新抽签"
                color="neutral"
                variant="soft"
                :disabled="!canRedraw(activeRound)"
                :loading="generatingRoundKey === activeRound.key"
                @click="redrawRound(activeRound)"
              />
              <UButton
                v-if="activeRound.key !== 'prelim'"
                icon="i-lucide-trash-2"
                label="清空名单"
                color="error"
                variant="soft"
                :disabled="!canClearRoster(activeRound)"
                :loading="generatingRoundKey === activeRound.key"
                @click="clearRoster(activeRound)"
              />
              <UButton
                icon="i-lucide-copy"
                label="复制出场名单"
                color="neutral"
                variant="soft"
                @click="copyRoster(activeRound)"
              />
            </div>
          </div>

          <div class="mt-4 flex flex-wrap items-end gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <UFormField
              label="评委人数"
              class="w-32"
            >
              <UInput
                :model-value="activeRound.judgeCount"
                type="number"
                min="1"
                max="20"
                class="w-full"
                @update:model-value="value => activeRound && (activeRound.judgeCount = Number(value) || 0)"
              />
            </UFormField>
            <UFormField
              v-if="activeRound.key !== 'final'"
              :label="activeRound.key === 'semi' ? '晋级人数（可待定）' : '晋级人数'"
              class="w-40"
            >
              <UInput
                :model-value="activeRound.advanceCount === null ? '' : String(activeRound.advanceCount)"
                type="number"
                min="1"
                class="w-full"
                :placeholder="activeRound.key === 'semi' ? '待定' : '30'"
                @update:model-value="value => activeRound && (activeRound.advanceCount = String(value).trim() === '' ? null : Number(value))"
              />
            </UFormField>
            <UButton
              icon="i-lucide-save"
              label="保存本轮设置"
              variant="soft"
              :loading="savingRoundKey === activeRound.key"
              @click="saveRound(activeRound)"
            />
            <span class="pb-2 text-xs text-zinc-400">
              初赛默认取前 30；复赛名额可在复赛结束后再填。
            </span>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div>
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                出场名单
              </h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                复赛/决赛名单由上一轮晋级后随机抽签生成；可用上下箭头手动调整。调整只影响出场顺序与同分时的先后。
              </p>
            </div>
            <span class="text-xs text-zinc-400">
              按抽签顺序排列
            </span>
          </div>

          <div
            v-if="activeRound.entries.length === 0"
            class="px-4 py-8 text-center text-sm text-zinc-400"
          >
            {{ activeRound.key === 'prelim' ? '选手库为空，请先导入名单。' : '本轮名单尚未生成。' }}
          </div>

          <div
            v-else
            class="overflow-x-auto"
          >
            <table class="w-full min-w-[780px] text-sm">
              <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th class="w-20 px-4 py-2 font-medium">
                    出场序
                  </th>
                  <th class="px-3 py-2 font-medium">
                    选手
                  </th>
                  <th class="px-3 py-2 font-medium">
                    歌曲
                  </th>
                  <th class="px-3 py-2 font-medium">
                    班级
                  </th>
                  <th class="px-3 py-2 font-medium">
                    来源
                  </th>
                  <th class="w-32 px-4 py-2 font-medium">
                    调整
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr
                  v-for="(entry, index) in rosterEntries(activeRound)"
                  :key="entry.id"
                >
                  <td class="px-4 py-2 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {{ index + 1 }}
                  </td>
                  <td class="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {{ entry.singer.name }}
                  </td>
                  <td class="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                    {{ entry.singer.song }}
                  </td>
                  <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {{ entry.singer.className || '—' }}
                  </td>
                  <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {{ entry.advancedFromRank ? `上一轮第 ${entry.advancedFromRank} 名` : '选手库' }}
                  </td>
                  <td class="px-4 py-2">
                    <div class="flex items-center gap-1">
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="soft"
                        icon="i-lucide-arrow-up"
                        aria-label="上移"
                        :disabled="index === 0 || activeRound.status === 'closed'"
                        @click="moveEntry(activeRound, entry, -1)"
                      />
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="soft"
                        icon="i-lucide-arrow-down"
                        aria-label="下移"
                        :disabled="index === rosterEntries(activeRound).length - 1 || activeRound.status === 'closed'"
                        @click="moveEntry(activeRound, entry, 1)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              成绩与排名
            </h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              按所有评委平均分排序；同分按出场顺序靠前者优先。结束后未评分的选手标为弃权，不参与晋级。
            </p>
          </div>

          <div
            v-if="activeRound.entries.length === 0"
            class="px-4 py-8 text-center text-sm text-zinc-400"
          >
            暂无成绩。
          </div>

          <div
            v-else
            class="overflow-x-auto"
          >
            <table class="w-full min-w-[820px] text-sm">
              <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th class="w-20 px-4 py-2 font-medium">
                    排名
                  </th>
                  <th class="px-3 py-2 font-medium">
                    选手
                  </th>
                  <th class="px-3 py-2 font-medium">
                    歌曲
                  </th>
                  <th class="px-3 py-2 text-right font-medium">
                    平均分
                  </th>
                  <th class="px-3 py-2 text-right font-medium">
                    评分人数
                  </th>
                  <th class="px-4 py-2 font-medium">
                    状态
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr
                  v-for="entry in activeRound.entries"
                  :key="entry.id"
                  :title="wrongStatus(entry)"
                >
                  <td class="px-4 py-2.5">
                    <span
                      class="inline-grid min-w-8 place-items-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums"
                      :class="rankClass(entry.rank)"
                    >
                      {{ entry.rank ?? '—' }}
                    </span>
                  </td>
                  <td class="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                    {{ entry.singer.name }}
                  </td>
                  <td class="px-3 py-2.5 text-zinc-600 dark:text-zinc-300">
                    {{ entry.singer.song }}
                  </td>
                  <td class="px-3 py-2.5 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {{ entry.average === null ? '—' : entry.average.toFixed(2) }}
                    <span class="text-xs font-normal text-zinc-400">/ {{ maxTotal }}</span>
                  </td>
                  <td class="px-3 py-2.5 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
                    {{ entry.scoreCount }} / {{ activeRound.judges.length }}
                  </td>
                  <td class="px-4 py-2.5">
                    <span
                      class="rounded px-1.5 py-0.5 text-xs font-medium"
                      :class="entryStatusClass(entry)"
                    >
                      {{ entryStatus(entry) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div>
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {{ activeRound.title }}评委账号
              </h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                已创建 {{ activeRound.judges.length }} 个 / 计划 {{ activeRound.judgeCount }} 个。每轮评委独立，登录后只看本轮选手。
              </p>
            </div>
            <UButton
              icon="i-lucide-user-plus"
              :label="missingJudgeCount(activeRound) > 0
                ? `补齐 ${missingJudgeCount(activeRound)} 个评委账号`
                : '账号已满员'"
              :disabled="missingJudgeCount(activeRound) <= 0"
              :loading="generatingRoundKey === activeRound.key"
              @click="generateJudges(activeRound)"
            />
          </div>

          <div
            v-if="activeRound.judges.length === 0"
            class="px-4 py-8 text-center text-sm text-zinc-400"
          >
            还没有评委账号。设置上方「评委人数」后点「补齐评委账号」。
          </div>

          <div
            v-else
            class="overflow-x-auto"
          >
            <table class="w-full min-w-[820px] text-sm">
              <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    评委名称
                  </th>
                  <th class="px-3 py-2 font-medium">
                    登录账号
                  </th>
                  <th class="px-3 py-2 font-medium">
                    已评
                  </th>
                  <th class="px-3 py-2 font-medium">
                    最近登录
                  </th>
                  <th class="px-3 py-2 font-medium">
                    启用
                  </th>
                  <th class="px-3 py-2 font-medium">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr
                  v-for="judge in activeRound.judges"
                  :key="judge.id"
                  class="text-zinc-800 dark:text-zinc-200"
                >
                  <td class="px-3 py-2">
                    <UInput
                      v-model="judge.displayName"
                      size="xs"
                      class="w-36"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <code class="rounded bg-zinc-100 px-2 py-0.5 font-mono text-xs dark:bg-zinc-800">{{ judge.username }}</code>
                  </td>
                  <td class="px-3 py-2 tabular-nums">
                    {{ judge.scoreCount }} / {{ activeRound.entries.length }}
                  </td>
                  <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {{ formatDateTime(judge.lastLoginAt) }}
                  </td>
                  <td class="px-3 py-2">
                    <USwitch
                      :model-value="judge.isActive"
                      :disabled="busyJudgeId === judge.id"
                      @update:model-value="value => toggleJudgeActive(activeRound, judge, value === true)"
                    />
                  </td>
                  <td class="px-3 py-2">
                    <div class="flex flex-wrap items-center gap-1">
                      <UButton
                        size="xs"
                        variant="soft"
                        icon="i-lucide-save"
                        label="存名称"
                        :loading="busyJudgeId === judge.id"
                        @click="saveJudgeName(activeRound, judge)"
                      />
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="soft"
                        icon="i-lucide-key-round"
                        label="重置密码"
                        :disabled="busyJudgeId === judge.id"
                        @click="resetJudgePassword(activeRound, judge)"
                      />
                      <UButton
                        size="xs"
                        color="error"
                        variant="soft"
                        icon="i-lucide-trash-2"
                        aria-label="删除评委"
                        :disabled="busyJudgeId === judge.id"
                        @click="removeJudge(activeRound, judge)"
                      />
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {{ activeRound.title }}评分明细
            </h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              每格为该评委给这位选手的总分，点击可查看各维度分数与备注。
            </p>
          </div>

          <div
            v-if="activeRound.entries.length === 0 || activeRound.judges.length === 0"
            class="px-4 py-8 text-center text-sm text-zinc-400"
          >
            需要先有本轮名单和评委。
          </div>

          <div
            v-else
            class="overflow-x-auto"
          >
            <table class="w-full text-sm">
              <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th class="sticky left-0 bg-zinc-50 px-4 py-2 font-medium dark:bg-zinc-800/60">
                    选手
                  </th>
                  <th
                    v-for="judge in activeRound.judges"
                    :key="judge.id"
                    class="min-w-24 px-3 py-2 text-center font-medium"
                  >
                    {{ judge.displayName }}
                    <span
                      v-if="!judge.isActive"
                      class="block text-[10px] font-normal text-zinc-400"
                    >已停用</span>
                  </th>
                  <th class="min-w-24 px-4 py-2 text-right font-medium">
                    平均分
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr
                  v-for="entry in rosterEntries(activeRound)"
                  :key="entry.id"
                >
                  <td class="sticky left-0 bg-white px-4 py-2 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                    {{ entry.singer.name }}
                    <span class="block text-xs font-normal text-zinc-400">{{ entry.singer.song }}</span>
                  </td>
                  <td
                    v-for="judge in activeRound.judges"
                    :key="judge.id"
                    class="px-3 py-2 text-center"
                  >
                    <button
                      v-if="scoreFor(activeRound, entry.singer.id, judge.id)"
                      type="button"
                      class="rounded-md px-2 py-1 text-sm font-semibold tabular-nums text-green-800 underline decoration-green-300 underline-offset-2 hover:bg-green-50 dark:text-green-300 dark:decoration-green-800 dark:hover:bg-green-950"
                      @click="openScoreFor(activeRound, entry.singer, judge.id)"
                    >
                      {{ scoreTotalFor(activeRound, entry.singer.id, judge.id) }}
                    </button>
                    <span
                      v-else
                      class="text-xs text-zinc-300 dark:text-zinc-600"
                    >—</span>
                  </td>
                  <td class="px-4 py-2 text-right font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {{ activeRound.entries.find(item => item.singer.id === entry.singer.id)?.average?.toFixed(2) ?? '—' }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        v-show="activeSection === 'email'"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
            <button
              v-for="round in payload.rounds"
              :key="round.id"
              type="button"
              class="rounded-md px-3 py-1 text-xs font-medium transition-colors"
              :class="emailRound === round.key
                ? 'bg-zinc-900 text-white dark:bg-zinc-700'
                : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'"
              @click="emailRound = round.key"
            >
              {{ round.title }}
            </button>
          </div>
          <span
            class="rounded-full px-2.5 py-1 text-xs font-medium"
            :class="emailRoundView?.status === 'closed'
              ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'"
          >
            {{ emailRoundView?.status === 'closed' ? '已结束，可发送' : '未结束，发送已锁定' }}
          </span>
        </div>

        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {{ emailRoundView?.title }}结果邮件模板
              </h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                点击占位符插入正文光标处；发送时按选手逐一生成。
              </p>
            </div>
            <UButton
              icon="i-lucide-save"
              label="保存模板"
              variant="soft"
              :loading="emailSavingTemplate"
              @click="saveEmailTemplate"
            />
          </div>

          <div class="mt-3 space-y-3">
            <UFormField label="邮件主题">
              <UInput
                v-model="emailTemplate.subject"
                class="w-full"
                placeholder="【音乐协会】新生歌手大赛结果通知"
              />
            </UFormField>
            <UFormField label="邮件正文">
              <textarea
                ref="emailBodyRef"
                v-model="emailTemplate.body"
                rows="10"
                class="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm leading-6 text-zinc-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </UFormField>
            <div class="flex flex-wrap gap-1.5">
              <UButton
                v-for="field in COMPETITION_EMAIL_MERGE_FIELDS"
                :key="field.key"
                size="xs"
                color="neutral"
                variant="soft"
                :label="`${field.key} ${field.desc}`"
                @click="insertPlaceholder(field.key)"
              />
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div class="space-y-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              <p>
                发送范围：
                <select
                  v-model="emailScope"
                  class="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  <option value="all">
                    全部选手
                  </option>
                  <option value="qualified">
                    仅晋级
                  </option>
                  <option value="unqualified">
                    仅未晋级
                  </option>
                </select>
              </p>
              <p>
                可发送 <span class="font-semibold text-zinc-800 dark:text-zinc-100">{{ emailCountWithEmail(emailScope) }}</span> 人
                <template v-if="emailCountWithoutEmail(emailScope) > 0">
                  ，{{ emailCountWithoutEmail(emailScope) }} 人未填邮箱将跳过
                </template>
                <template v-if="emailAlreadySentCount > 0">
                  ，{{ emailAlreadySentCount }} 人已发送过将自动跳过
                </template>。
              </p>
              <p>
                已发送 {{ emailStats.sent }} / 失败 {{ emailStats.failed }}
                <template v-if="emailStats.lastSentAt">
                  · 最近发送 {{ formatDateTime(emailStats.lastSentAt) }}
                </template>
              </p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                icon="i-lucide-send"
                label="一键发送结果邮件"
                :loading="emailSending"
                :disabled="emailRoundView?.status !== 'closed' || emailCountWithEmail(emailScope) <= 0"
                @click="sendEmails"
              />
            </div>
          </div>
          <div
            v-if="emailRoundView?.status !== 'closed'"
            class="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
          >
            本轮评分尚未结束。结束评分并确认成绩后才能发送，避免发出中间分数。
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800">
            <UInput
              v-model="emailTestAddress"
              class="w-64"
              placeholder="你的邮箱，用于测试模板效果"
            />
            <UButton
              icon="i-lucide-mail-check"
              label="发送测试邮件"
              color="neutral"
              variant="soft"
              :loading="emailTesting"
              @click="sendEmailTest"
            />
            <span class="text-xs text-zinc-400">
              测试邮件使用示例数据，不会写入发送记录。
            </span>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              发送记录
            </h3>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              每位选手显示最近一次发送状态；失败的可在修正邮箱后重新发送。
            </p>
          </div>
          <div
            v-if="emailLatestRows.length === 0"
            class="px-4 py-8 text-center text-sm text-zinc-400"
          >
            还没有发送记录。
          </div>
          <div
            v-else
            class="overflow-x-auto"
          >
            <table class="w-full min-w-[720px] text-sm">
              <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th class="px-4 py-2 font-medium">
                    选手
                  </th>
                  <th class="px-3 py-2 font-medium">
                    邮箱
                  </th>
                  <th class="px-3 py-2 font-medium">
                    状态
                  </th>
                  <th class="px-3 py-2 font-medium">
                    时间
                  </th>
                  <th class="px-4 py-2 font-medium">
                    错误
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr
                  v-for="record in emailLatestRows"
                  :key="`${record.roundKey}:${record.singerId}`"
                >
                  <td class="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                    {{ record.name }}
                  </td>
                  <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                    {{ record.email }}
                  </td>
                  <td class="px-3 py-2">
                    <span
                      class="rounded px-1.5 py-0.5 text-xs font-medium"
                      :class="record.status === 'sent'
                        ? 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'"
                    >
                      {{ record.status === 'sent' ? '已发送' : '失败' }}
                    </span>
                  </td>
                  <td class="px-3 py-2 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                    {{ formatDateTime(record.createdAt) }}
                  </td>
                  <td class="max-w-64 px-4 py-2 text-xs text-red-700 dark:text-red-300">
                    <span class="line-clamp-2">{{ record.error || '—' }}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <UModal
      v-model:open="credentialsOpen"
      title="评委账号（请立即保存）"
      description="密码只在此处显示一次，关闭后无法再次查看。"
      :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-lg' }"
    >
      <template #body>
        <div class="space-y-3">
          <div class="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
            <table class="w-full min-w-[420px] text-sm">
              <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    评委
                  </th>
                  <th class="px-3 py-2 font-medium">
                    账号
                  </th>
                  <th class="px-3 py-2 font-medium">
                    密码
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr
                  v-for="item in credentials"
                  :key="item.id"
                >
                  <td class="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                    {{ item.displayName }}
                  </td>
                  <td class="px-3 py-2">
                    <code class="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs dark:bg-zinc-800">{{ item.username }}</code>
                  </td>
                  <td class="px-3 py-2">
                    <code class="rounded bg-amber-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">{{ item.password }}</code>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            评委登录地址：<code class="rounded bg-zinc-100 px-1 dark:bg-zinc-800">/judge/login</code>。
            请通过私聊单独发送，不要发在公开群里。
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            icon="i-lucide-copy"
            label="复制全部账号"
            @click="copyCredentials"
          />
          <UButton
            label="我已保存"
            color="neutral"
            variant="soft"
            @click="closeCredentials"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="editSingerOpen"
      :title="editingSinger ? `编辑选手 - ${editingSinger.name}` : '编辑选手'"
      :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-lg' }"
    >
      <template #body>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="姓名">
            <UInput
              v-model="editSingerForm.name"
              class="w-full"
            />
          </UFormField>
          <UFormField label="参赛歌曲">
            <UInput
              v-model="editSingerForm.song"
              class="w-full"
            />
          </UFormField>
          <UFormField label="班级">
            <UInput
              v-model="editSingerForm.className"
              class="w-full"
            />
          </UFormField>
          <UFormField label="学号">
            <UInput
              v-model="editSingerForm.studentNo"
              class="w-full"
            />
          </UFormField>
          <UFormField label="电话">
            <UInput
              v-model="editSingerForm.phone"
              class="w-full"
            />
          </UFormField>
          <UFormField label="邮箱">
            <UInput
              v-model="editSingerForm.email"
              class="w-full"
            />
          </UFormField>
          <UFormField label="选手库序号">
            <UInput
              v-model="editSingerForm.sortOrder"
              type="number"
              min="0"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="备注"
            class="sm:col-span-2"
          >
            <UTextarea
              v-model="editSingerForm.remark"
              :rows="2"
              class="w-full"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="soft"
            @click="closeEditSinger"
          />
          <UButton
            label="保存"
            icon="i-lucide-save"
            :loading="savingSinger"
            @click="saveSingerEdit"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="Boolean(detailScore)"
      :title="detailSinger && detailScore ? `${detailSinger.name} · ${detailScore.judgeName}` : '评分明细'"
      :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-lg' }"
      @update:open="value => { if (!value) closeDetail() }"
    >
      <template #body>
        <div
          v-if="detailScore && detailSinger"
          class="space-y-4"
        >
          <div class="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            《{{ detailSinger.song }}》 · 总分
            <span class="text-base font-bold text-zinc-900 dark:text-zinc-100">{{ detailScore.total.toFixed(2) }}</span>
            / {{ maxTotal }}
          </div>
          <div class="overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
            <table class="w-full text-sm">
              <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    维度
                  </th>
                  <th class="px-3 py-2 text-right font-medium">
                    权重
                  </th>
                  <th class="px-3 py-2 text-right font-medium">
                    得分
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr
                  v-for="dimension in detailScore.dimensions"
                  :key="dimension.key"
                >
                  <td class="px-3 py-2 text-zinc-800 dark:text-zinc-200">
                    {{ dimension.label }}
                  </td>
                  <td class="px-3 py-2 text-right text-xs tabular-nums text-zinc-500">
                    {{ dimension.weight }}
                  </td>
                  <td class="px-3 py-2 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {{ dimension.score }} / 20
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div>
            <p class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              评委备注
            </p>
            <p class="mt-1 whitespace-pre-wrap rounded-md bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {{ detailScore.comment || '无备注' }}
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton
            label="关闭"
            color="neutral"
            variant="soft"
            @click="closeDetail"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
