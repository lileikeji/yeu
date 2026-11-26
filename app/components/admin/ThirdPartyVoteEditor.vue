<script setup lang="ts">
/**
 * 第三方投票（金数据）后台手动补录。
 *
 * 表单限制只有微信内能填写，现场投不了时由这里代录；
 * 代录票与平台同步回来的票落在同一张表、同一个 form_token 下，一起进榜单。
 */

type VoteStatus = 'valid' | 'watch' | 'void'

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

interface VoteSummary {
  total: number
  valid: number
  watch: number
  voided: number
}

interface Candidate {
  singerId: string
  name: string
  number: number
  className: string | null
  song: string | null
}

interface VotePayload {
  formToken: string
  summary: VoteSummary
  candidates: Candidate[]
  records: VoteRecord[]
}

const toast = useToast()

const loading = ref(false)
const saving = ref(false)
const deletingId = ref('')
const payload = ref<VotePayload | null>(null)

const draft = reactive({
  optionId: '',
  count: 1,
  votedAtLocal: '',
  voterRef: '',
  status: 'valid' as VoteStatus
})

const candidates = computed(() => payload.value?.candidates ?? [])
const records = computed(() => payload.value?.records ?? [])
const summary = computed<VoteSummary>(() => payload.value?.summary ?? { total: 0, valid: 0, watch: 0, voided: 0 })

const statusOptions: Array<{ value: VoteStatus; label: string }> = [
  { value: 'valid', label: '有效票' },
  { value: 'watch', label: '待审' },
  { value: 'void', label: '作废' }
]

onMounted(() => {
  if (!draft.optionId && candidates.value.length > 0) draft.optionId = candidates.value[0]!.name
  void load()
})

async function load(): Promise<void> {
  loading.value = true
  try {
    payload.value = await adminFetch<VotePayload>('/api/admin/competition/popularity/third-party-votes')
    if (!draft.optionId && candidates.value.length > 0) draft.optionId = candidates.value[0]!.name
  } catch (error) {
    toast.add({
      title: '读取投票记录失败',
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

async function submit(): Promise<void> {
  if (saving.value) return
  const optionId = draft.optionId.trim()
  if (!optionId) {
    toast.add({ title: '请选择或填写选手', color: 'warning' })
    return
  }

  saving.value = true
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
    saving.value = false
  }
}

async function remove(row: VoteRecord): Promise<void> {
  if (deletingId.value) return
  deletingId.value = row.id
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
    deletingId.value = ''
  }
}

function formatTime(ms: number): string {
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
</script>

<template>
  <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          第三方投票补录
        </h3>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          金数据侧限制微信内填写，现场投不了时在这里代录。补录票与平台同步的票一起进榜单。
        </p>
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

    <div class="mt-3 flex flex-wrap gap-2 text-xs">
      <span class="rounded-full bg-zinc-100 px-2.5 py-1 dark:bg-zinc-800">合计 {{ summary.total }}</span>
      <span class="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">有效 {{ summary.valid }}</span>
      <span class="rounded-full bg-amber-100 px-2.5 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">待审 {{ summary.watch }}</span>
      <span class="rounded-full bg-rose-100 px-2.5 py-1 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">作废 {{ summary.voided }}</span>
    </div>

    <div class="mt-4 grid gap-3 sm:grid-cols-2">
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
      :disabled="saving"
      @click="submit"
    >
      {{ saving ? '提交中…' : '补录投票' }}
    </button>

    <div class="mt-5">
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
                <span
                  class="rounded-full px-2 py-0.5"
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
                  :disabled="deletingId === row.id"
                  @click="remove(row)"
                >
                  {{ deletingId === row.id ? '删除中…' : '删除' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
