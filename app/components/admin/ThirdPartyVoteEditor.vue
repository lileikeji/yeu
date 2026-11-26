<script setup lang="ts">
/**
 * 第三方投票（金数据）后台工作台。
 *
 * 覆盖这条链路的全部接口能力：
 * 1. 读远端表单结构（选项 / 链接 / 字段名）
 * 2. 增删选项（写回金数据表单）
 * 3. 手动触发条目同步（增量 / 全量）
 * 4. 手动补录票
 * 5. 改单条状态、删除单条
 */

type VoteStatus = 'valid' | 'watch' | 'void'

interface Choice {
  name: string
  value: string
  hidden: boolean
}

interface Candidate {
  singerId: string
  name: string
  number: number
  className: string | null
  song: string | null
}

interface FormSummary {
  token: string
  name: string
  entriesCount: number
  createdAt: string
  lastEntryAt: string | null
  url: string
}

interface FormState {
  configured: boolean
  tokenConfigured: boolean
  formToken: string
  optionField: string | null
  activeSource: 'file' | 'env' | 'none'
  form: {
    token: string
    name: string
    description: string
    url: string
    fields: Array<{ apiCode: string, label: string, type: string, choices: Choice[] }>
    weixinLimited: boolean
    fillType: string
    fillCondition: string
  } | null
  forms: FormSummary[]
  formsError: string | null
  remoteError: string | null
  candidates: Candidate[]
  optionCounts: Record<string, number>
  summary: { total: number, valid: number, watch: number, voided: number }
  syncState: {
    cursor: string | null
    lastSyncedAt: number | null
    lastEntryAt: number | null
    totalSynced: number
    lastError: string | null
  } | null
}

interface VoteRecord {
  id: string
  provider: string
  optionId: string
  voterRef: string | null
  votedAt: number
  status: VoteStatus
  score: number
  flags: string[]
  fillSeconds: number | null
}

interface VoteListPayload {
  formToken: string
  summary: { total: number, valid: number, watch: number, voided: number }
  candidates: Candidate[]
  records: VoteRecord[]
}

const toast = useToast()

const loading = ref(false)
const busy = ref('')
const formState = ref<FormState | null>(null)
const votes = ref<VoteListPayload | null>(null)

const draft = reactive({
  optionId: '',
  count: 1,
  votedAtLocal: '',
  voterRef: '',
  status: 'valid' as VoteStatus
})

const newChoice = ref('')
const syncFull = ref(false)

const showCreate = ref(false)
const createDraft = reactive({
  name: '',
  description: '',
  fieldLabel: '支持谁',
  options: '',
  activate: true
})
const settingsDraft = reactive({
  name: '',
  description: '',
  weixinLimited: false,
  oncePerWeixin: false
})
const deletingToken = ref('')

const candidates = computed(() => formState.value?.candidates ?? votes.value?.candidates ?? [])
const records = computed(() => votes.value?.records ?? [])
const summary = computed(() => votes.value?.summary ?? formState.value?.summary ?? { total: 0, valid: 0, watch: 0, voided: 0 })
const choices = computed<Choice[]>(() => formState.value?.form?.fields[0]?.choices ?? [])
const syncState = computed(() => formState.value?.syncState ?? null)

const statusOptions: Array<{ value: VoteStatus, label: string }> = [
  { value: 'valid', label: '有效票' },
  { value: 'watch', label: '待审' },
  { value: 'void', label: '作废' }
]

onMounted(() => {
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  try {
    const [state, list] = await Promise.all([
      adminFetch<FormState>('/api/admin/competition/popularity/third-party-form'),
      adminFetch<VoteListPayload>('/api/admin/competition/popularity/third-party-votes')
    ])
    formState.value = state
    votes.value = list
    syncSettingsDraft(state)
    if (!draft.optionId) {
      draft.optionId = state.candidates[0]?.name ?? list.candidates[0]?.name ?? ''
    }
  } catch (error) {
    toast.add({
      title: '读取投票数据失败',
      description: apiErrorMessage(error, '请检查网络后重试。'),
      color: 'warning'
    })
  } finally {
    loading.value = false
  }
}

function votedAtValue(): number | undefined {
  if (!draft.votedAtLocal) return undefined
  const ms = new Date(draft.votedAtLocal).getTime()
  return Number.isFinite(ms) ? ms : undefined
}

async function submitVote(): Promise<void> {
  if (busy.value) return
  const optionId = draft.optionId.trim()
  if (!optionId) {
    toast.add({ title: '请选择或填写选手', color: 'warning' })
    return
  }

  busy.value = 'vote'
  try {
    const result = await adminFetch<{ inserted: number }>('/api/admin/competition/popularity/third-party-votes', {
      method: 'POST',
      body: {
        optionId,
        count: Math.min(50, Math.max(1, Number(draft.count) || 1)),
        status: draft.status,
        voterRef: draft.voterRef.trim() || undefined,
        votedAt: votedAtValue()
      }
    })
    toast.add({ title: `已补录 ${result.inserted} 票`, color: 'success' })
    draft.voterRef = ''
    draft.count = 1
    await load()
  } catch (error) {
    toast.add({
      title: '补录失败',
      description: apiErrorMessage(error, '请检查网络后重试。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}

async function changeStatus(row: VoteRecord, status: VoteStatus): Promise<void> {
  if (busy.value) return
  busy.value = `status:${row.id}`
  try {
    await adminFetch('/api/admin/competition/popularity/third-party-votes', {
      method: 'PATCH',
      body: { id: row.id, status }
    })
    toast.add({ title: '状态已更新', color: 'success' })
    await load()
  } catch (error) {
    toast.add({
      title: '状态更新失败',
      description: apiErrorMessage(error, '请检查网络后重试。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}

async function removeVote(row: VoteRecord): Promise<void> {
  if (busy.value) return
  busy.value = `delete:${row.id}`
  try {
    await adminFetch('/api/admin/competition/popularity/third-party-votes', {
      method: 'DELETE',
      query: { id: row.id }
    })
    toast.add({ title: '已删除该条记录', color: 'success' })
    await load()
  } catch (error) {
    toast.add({
      title: '删除失败',
      description: apiErrorMessage(error, '请检查网络后重试。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}

async function addChoices(): Promise<void> {
  if (busy.value) return
  const names = newChoice.value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean)
  if (names.length === 0) {
    toast.add({ title: '请填写要新增的选手名', color: 'warning' })
    return
  }

  busy.value = 'choices'
  try {
    await adminFetch('/api/admin/competition/popularity/third-party-form', {
      method: 'PATCH',
      body: { add: names }
    })
    toast.add({ title: `已新增 ${names.length} 个选项`, color: 'success' })
    newChoice.value = ''
    await load()
  } catch (error) {
    toast.add({
      title: '新增选项失败',
      description: apiErrorMessage(error, '请检查网络后重试。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}

async function removeChoice(choice: Choice): Promise<void> {
  if (busy.value) return
  busy.value = `choice:${choice.value}`
  try {
    await adminFetch('/api/admin/competition/popularity/third-party-form', {
      method: 'PATCH',
      body: { remove: [choice.value] }
    })
    toast.add({ title: `已删除选项「${choice.name}」`, color: 'success' })
    await load()
  } catch (error) {
    toast.add({
      title: '删除选项失败',
      description: apiErrorMessage(error, '请检查网络后重试。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}

async function runSync(): Promise<void> {
  if (busy.value) return
  busy.value = 'sync'
  try {
    const result = await adminFetch<{ inserted: number, received: number, pages: number }>(
      '/api/admin/competition/popularity/third-party-sync',
      { method: 'POST', body: { full: syncFull.value } }
    )
    toast.add({
      title: `同步完成：拉到 ${result.received} 条，新入库 ${result.inserted} 条`,
      color: 'success'
    })
    await load()
  } catch (error) {
    toast.add({
      title: '同步失败',
      description: apiErrorMessage(error, '可能是金数据限流或令牌失效。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}

function formatTime(ms: number | null): string {
  if (!ms) return '—'
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getMonth() + 1}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function statusLabel(status: VoteStatus): string {
  if (status === 'watch') return '待审'
  if (status === 'void') return '作废'
  return '有效'
}

function statusClass(status: VoteStatus): string {
  if (status === 'watch') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
  if (status === 'void') return 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
}

function votesOf(choice: Choice): number {
  return formState.value?.optionCounts[choice.name] ?? 0
}

function syncSettingsDraft(state: FormState): void {
  if (!state.form) return
  settingsDraft.name = state.form.name
  settingsDraft.description = state.form.description
  settingsDraft.weixinLimited = state.form.weixinLimited
  settingsDraft.oncePerWeixin = state.form.fillType === 'once' && state.form.fillCondition === 'by_weixin'
}

function splitNames(raw: string): string[] {
  return raw.split(/[,，\n]/).map(item => item.trim()).filter(Boolean)
}

async function submitCreateForm(): Promise<void> {
  if (busy.value) return
  const name = createDraft.name.trim()
  if (!name) {
    toast.add({ title: '请填写表单名称', color: 'warning' })
    return
  }

  const options = splitNames(createDraft.options)
  busy.value = 'create-form'
  try {
    const result = await adminFetch<{ token: string, url: string, activated: boolean }>(
      '/api/admin/competition/popularity/third-party-form',
      {
        method: 'POST',
        body: {
          name,
          description: createDraft.description.trim() || undefined,
          fieldLabel: createDraft.fieldLabel.trim() || undefined,
          options,
          activate: createDraft.activate
        }
      }
    )
    toast.add({
      title: `已创建表单 ${result.token}（${options.length} 个选项）`,
      description: result.activated ? '已设为生效表单。' : '可在列表中切换成生效表单。',
      color: 'success'
    })
    showCreate.value = false
    createDraft.name = ''
    createDraft.description = ''
    createDraft.options = ''
    await load()
  } catch (error) {
    toast.add({
      title: '新建表单失败',
      description: apiErrorMessage(error, '请检查金数据套餐额度与令牌权限。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}

async function saveFormSettings(): Promise<void> {
  if (busy.value || !formState.value?.configured) return
  busy.value = 'settings'
  try {
    await adminFetch('/api/admin/competition/popularity/third-party-form', {
      method: 'PATCH',
      body: {
        name: settingsDraft.name.trim() || undefined,
        description: settingsDraft.description,
        weixinLimited: settingsDraft.weixinLimited,
        oncePerWeixin: settingsDraft.oncePerWeixin
      }
    })
    toast.add({ title: '表单设置已保存', color: 'success' })
    await load()
  } catch (error) {
    toast.add({
      title: '保存设置失败',
      description: apiErrorMessage(error, '自定义填写频次需要金数据企业版套餐。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}

async function activateForm(token: string): Promise<void> {
  if (busy.value) return
  busy.value = `activate:${token}`
  try {
    await adminFetch('/api/admin/competition/popularity/third-party-form/switch', {
      method: 'POST',
      body: { token }
    })
    toast.add({ title: '已切换生效表单', color: 'success' })
    await load()
  } catch (error) {
    toast.add({
      title: '切换失败',
      description: apiErrorMessage(error, '表单可能已被删除或令牌无权限。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}

async function deleteForm(token: string, name: string): Promise<void> {
  if (busy.value) return
  if (deletingToken.value !== token) {
    deletingToken.value = token
    toast.add({ title: `再点一次「删除」确认删除表单「${name}」`, color: 'warning' })
    return
  }

  busy.value = `delete-form:${token}`
  try {
    const result = await adminFetch<{ cleared: boolean }>(
      '/api/admin/competition/popularity/third-party-form',
      { method: 'DELETE', body: { token, confirm: true } }
    )
    toast.add({
      title: `已删除表单「${name}」`,
      description: result.cleared ? '它原本是生效表单，已回退到环境变量配置。' : undefined,
      color: 'success'
    })
    deletingToken.value = ''
    await load()
  } catch (error) {
    toast.add({
      title: '删除表单失败',
      description: apiErrorMessage(error, '请确认令牌有删除权限。'),
      color: 'warning'
    })
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            第三方投票（金数据）
          </h3>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            表单 <code v-if="formState?.form">{{ formState.form.name }}</code>
            <span v-else>未读取到远端表单</span>
            · 字段 <code>{{ formState?.optionField ?? '—' }}</code>
            · 表单 ID <code>{{ formState?.formToken ?? '—' }}</code>
          </p>
          <a
            v-if="formState?.form?.url"
            :href="formState.form.url"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-1 inline-block text-xs text-emerald-600 hover:underline"
          >{{ formState.form.url }}</a>
        </div>
        <button
          type="button"
          class="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          :disabled="loading"
          @click="load"
        >
          {{ loading ? '刷新中…' : '刷新' }}
        </button>
      </div>

      <p
        v-if="formState && !formState.configured"
        class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      >
        未配置金数据令牌，当前只能做手动补录（数据落在 manual 表单口径下）。
      </p>
      <p
        v-else-if="formState?.remoteError"
        class="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
      >
        读取远端表单失败：{{ formState.remoteError }}
      </p>

      <div class="mt-3 flex flex-wrap gap-2 text-xs">
        <span class="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">合计 {{ summary.total }}</span>
        <span class="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">有效 {{ summary.valid }}</span>
        <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">待审 {{ summary.watch }}</span>
        <span class="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">作废 {{ summary.voided }}</span>
      </div>
    </div>

    <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            表单管理
          </h4>
          <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            建表、切换生效表单、改名改描述、改填写规则、删除表单都在这里完成，换比赛不需要再改代码或配置。
            当前配置来源：
            <code>{{ formState?.activeSource === 'file' ? '后台写入的配置文件' : formState?.activeSource === 'env' ? '环境变量' : '未配置' }}</code>
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
          :disabled="!formState?.tokenConfigured"
          @click="showCreate = !showCreate"
        >
          {{ showCreate ? '收起' : '新建表单' }}
        </button>
      </div>

      <p
        v-if="formState && !formState.tokenConfigured"
        class="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
      >
        没有读到金数据 API 令牌（NUXT_JINSHUJU_API_TOKEN），无法管理表单。
      </p>
      <p
        v-else-if="formState?.formsError"
        class="mt-3 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
      >
        读取表单列表失败：{{ formState.formsError }}
      </p>

      <div
        v-if="showCreate"
        class="mt-3 space-y-2 rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700"
      >
        <input
          v-model="createDraft.name"
          placeholder="表单名称，例：2027 新生歌手大赛 · 人气投票"
          class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
        <input
          v-model="createDraft.description"
          placeholder="描述（可留空）"
          class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
        <input
          v-model="createDraft.fieldLabel"
          placeholder="选项字段名，默认「支持谁」"
          class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
        <textarea
          v-model="createDraft.options"
          rows="3"
          placeholder="选项（选手名单），多个用逗号或换行分隔"
          class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
        <div class="flex flex-wrap items-center justify-between gap-2">
          <label class="flex items-center gap-2 text-xs">
            <input
              v-model="createDraft.activate"
              type="checkbox"
              class="size-4 rounded border-zinc-300"
            >
            创建后立即设为生效表单
          </label>
          <button
            type="button"
            class="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            :disabled="Boolean(busy)"
            @click="submitCreateForm"
          >
            创建
          </button>
        </div>
      </div>

      <ul
        v-if="(formState?.forms?.length ?? 0) > 0"
        class="mt-3 max-h-64 space-y-1 overflow-y-auto pr-1"
      >
        <li
          v-for="item in formState?.forms ?? []"
          :key="item.token"
          class="flex flex-wrap items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
        >
          <div class="min-w-0">
            <div class="truncate font-medium text-zinc-900 dark:text-zinc-100">
              {{ item.name }}
              <span
                v-if="item.token === formState?.formToken"
                class="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              >生效中</span>
            </div>
            <div class="mt-0.5 text-zinc-500 dark:text-zinc-400">
              <code>{{ item.token }}</code> · {{ item.entriesCount }} 条提交
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <a
              :href="item.url"
              target="_blank"
              rel="noopener noreferrer"
              class="text-emerald-600 hover:underline"
            >打开</a>
            <button
              v-if="item.token !== formState?.formToken"
              type="button"
              class="text-zinc-600 hover:underline disabled:opacity-50 dark:text-zinc-300"
              :disabled="Boolean(busy)"
              @click="activateForm(item.token)"
            >
              设为生效
            </button>
            <button
              type="button"
              class="text-rose-600 hover:underline disabled:opacity-50"
              :disabled="Boolean(busy)"
              @click="deleteForm(item.token, item.name)"
            >
              {{ deletingToken === item.token ? '确认删除' : '删除' }}
            </button>
          </div>
        </li>
      </ul>

      <div
        v-if="formState?.form"
        class="mt-4 border-t border-zinc-200 pt-3 dark:border-zinc-800"
      >
        <h5 class="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          当前生效表单设置
        </h5>
        <div class="mt-2 space-y-2">
          <input
            v-model="settingsDraft.name"
            placeholder="表单名称"
            class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
          <input
            v-model="settingsDraft.description"
            placeholder="描述"
            class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
          <div class="flex flex-wrap items-center gap-4">
            <label class="flex items-center gap-2 text-xs">
              <input
                v-model="settingsDraft.weixinLimited"
                type="checkbox"
                class="size-4 rounded border-zinc-300"
              >
              只允许微信内填写
            </label>
            <label class="flex items-center gap-2 text-xs">
              <input
                v-model="settingsDraft.oncePerWeixin"
                type="checkbox"
                class="size-4 rounded border-zinc-300"
              >
              每个微信限投一次
            </label>
            <button
              type="button"
              class="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              :disabled="Boolean(busy)"
              @click="saveFormSettings"
            >
              保存设置
            </button>
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h4 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          表单选项（{{ choices.length }}）
        </h4>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          这里的改动会直接写回金数据表单。删除选项不会删掉已产生的票，但那部分会沉到榜单尾部。
        </p>

        <div
          v-if="choices.length === 0"
          class="mt-3 rounded-md border border-dashed border-zinc-300 p-3 text-center text-xs text-zinc-500 dark:border-zinc-700"
        >
          没有读取到选项
        </div>

        <ul
          v-else
          class="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1"
        >
          <li
            v-for="choice in choices"
            :key="choice.value"
            class="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-xs hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            <span class="truncate">
              {{ choice.name }}
              <span class="text-zinc-400">（本站 {{ votesOf(choice) }} 票）</span>
            </span>
            <button
              type="button"
              class="shrink-0 text-rose-600 hover:underline disabled:opacity-50"
              :disabled="Boolean(busy)"
              @click="removeChoice(choice)"
            >
              删除
            </button>
          </li>
        </ul>

        <div class="mt-3 flex gap-2">
          <input
            v-model="newChoice"
            placeholder="新增选手名，多个用逗号分隔"
            class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
          <button
            type="button"
            class="shrink-0 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
            :disabled="Boolean(busy)"
            @click="addChoices"
          >
            添加
          </button>
        </div>
      </div>

      <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h4 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          同步
        </h4>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          从金数据拉取提交记录入库。站内定时任务每 5 分钟自动跑一次增量，这里是手动触发的同一套逻辑。
        </p>

        <dl class="mt-3 space-y-1 text-xs">
          <div class="flex justify-between">
            <dt class="text-zinc-500">
              上次同步
            </dt>
            <dd>{{ formatTime(syncState?.lastSyncedAt ?? null) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-zinc-500">
              最新票时间
            </dt>
            <dd>{{ formatTime(syncState?.lastEntryAt ?? null) }}</dd>
          </div>
          <div class="flex justify-between">
            <dt class="text-zinc-500">
              累计入库
            </dt>
            <dd>{{ syncState?.totalSynced ?? 0 }}</dd>
          </div>
        </dl>

        <p
          v-if="syncState?.lastError"
          class="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
        >
          上次失败：{{ syncState.lastError }}
        </p>

        <label class="mt-3 flex items-center gap-2 text-xs">
          <input
            v-model="syncFull"
            type="checkbox"
            class="size-4 rounded border-zinc-300"
            :disabled="!formState?.configured"
          >
          全量重拉（忽略水位，首次可用）
        </label>

        <button
          type="button"
          class="mt-3 w-full rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          :disabled="Boolean(busy) || !formState?.configured"
          @click="runSync"
        >
          {{ busy === 'sync' ? '同步中…' : '立即同步' }}
        </button>
      </div>
    </div>

    <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <h4 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        手动补录
      </h4>
      <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        有人投不了票时在这里代录。补录票与平台同步的票一起进榜单。
      </p>

      <div class="mt-3 grid gap-3 sm:grid-cols-2">
        <div class="sm:col-span-2">
          <label
            class="block text-sm font-medium"
            for="tpv-option"
          >选手</label>
          <input
            id="tpv-option"
            v-model="draft.optionId"
            list="tpv-candidates"
            placeholder="选择选手，或直接填写选项名"
            class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
          <datalist id="tpv-candidates">
            <option
              v-for="item in candidates"
              :key="item.singerId"
              :value="item.name"
            >
              {{ item.number }}号 {{ item.className ?? '' }} {{ item.song ?? '' }}
            </option>
          </datalist>
        </div>

        <div>
          <label
            class="block text-sm font-medium"
            for="tpv-count"
          >票数</label>
          <input
            id="tpv-count"
            v-model.number="draft.count"
            type="number"
            min="1"
            max="50"
            class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
        </div>

        <div>
          <label
            class="block text-sm font-medium"
            for="tpv-status"
          >状态</label>
          <select
            id="tpv-status"
            v-model="draft.status"
            class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option
              v-for="item in statusOptions"
              :key="item.value"
              :value="item.value"
            >
              {{ item.label }}
            </option>
          </select>
        </div>

        <div>
          <label
            class="block text-sm font-medium"
            for="tpv-time"
          >投票时间</label>
          <input
            id="tpv-time"
            v-model="draft.votedAtLocal"
            type="datetime-local"
            class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
          <p class="mt-1 text-xs text-zinc-500">
            留空 = 当前时间
          </p>
        </div>

        <div>
          <label
            class="block text-sm font-medium"
            for="tpv-voter"
          >投票人备注</label>
          <input
            id="tpv-voter"
            v-model="draft.voterRef"
            maxlength="80"
            placeholder="可留空，例如「现场代录 · 张同学」"
            class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
        </div>
      </div>

      <button
        type="button"
        class="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        :disabled="Boolean(busy)"
        @click="submitVote"
      >
        {{ busy === 'vote' ? '提交中…' : '补录投票' }}
      </button>
    </div>

    <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          最近记录
        </h4>
        <span class="text-xs text-zinc-500">最多显示 50 条</span>
      </div>

      <div
        v-if="records.length === 0"
        class="mt-2 rounded-md border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700"
      >
        还没有投票记录
      </div>

      <div
        v-else
        class="mt-2 overflow-x-auto"
      >
        <table class="w-full text-left text-xs">
          <thead class="text-zinc-500">
            <tr>
              <th class="py-1.5 pr-3 font-medium">
                时间
              </th>
              <th class="py-1.5 pr-3 font-medium">
                选手
              </th>
              <th class="py-1.5 pr-3 font-medium">
                状态
              </th>
              <th class="py-1.5 pr-3 font-medium">
                来源
              </th>
              <th class="py-1.5 pr-3 font-medium">
                备注
              </th>
              <th class="py-1.5 font-medium">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in records"
              :key="row.id"
              class="border-t border-zinc-100 dark:border-zinc-800"
            >
              <td class="py-1.5 pr-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                {{ formatTime(row.votedAt) }}
              </td>
              <td class="py-1.5 pr-3 font-medium">
                {{ row.optionId }}
              </td>
              <td class="py-1.5 pr-3">
                <select
                  :value="row.status"
                  class="rounded-md border border-zinc-300 bg-[var(--surface)] px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  :disabled="Boolean(busy)"
                  @change="changeStatus(row, ($event.target as HTMLSelectElement).value as VoteStatus)"
                >
                  <option
                    v-for="item in statusOptions"
                    :key="item.value"
                    :value="item.value"
                  >
                    {{ item.label }}
                  </option>
                </select>
                <span
                  class="ml-1 rounded-full px-1.5 py-0.5"
                  :class="statusClass(row.status)"
                >{{ statusLabel(row.status) }}</span>
              </td>
              <td class="py-1.5 pr-3 text-zinc-500">
                {{ row.provider === 'manual' ? '手动补录' : '平台同步' }}
              </td>
              <td class="py-1.5 pr-3 text-zinc-500">
                {{ row.voterRef || '—' }}
              </td>
              <td class="py-1.5">
                <button
                  type="button"
                  class="text-rose-600 hover:underline disabled:opacity-50"
                  :disabled="Boolean(busy)"
                  @click="removeVote(row)"
                >
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
