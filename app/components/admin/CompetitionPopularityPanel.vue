<script setup lang="ts">
import type {
  CompetitionPopularityAdminState,
  CompetitionPopularityAuthMode,
  CompetitionPopularitySettings
} from '~~/shared/types'

const props = defineProps<{
  state: CompetitionPopularityAdminState | null
}>()

const emit = defineEmits<{ refresh: [] }>()
const toast = useToast()

interface SettingsDraft extends Omit<CompetitionPopularitySettings, 'opensAt' | 'closesAt' | 'displayKey' | 'updatedAt'> {
  opensAtLocal: string
  closesAtLocal: string
}

const draft = reactive<SettingsDraft>({
  enabled: false,
  title: '人气奖投票',
  subtitle: '现场扫码投票，一人一票',
  opensAtLocal: '',
  closesAtLocal: '',
  allowChange: false,
  maxChanges: 1,
  votesPerVoter: 1,
  wechatBonusVotes: 2,
  allowRepeatVote: true,
  qrRotateSeconds: 30,
  passcodeRotate: true,
  allowWithdraw: true,
  showResults: true,
  showRankGap: false,
  authMode: 'wechat_mp' as CompetitionPopularityAuthMode,
  wechatAccountName: '仰恩大学指南',
  wechatQrUrl: '',
  wechatBiz: '',
  autoQuarantine: true,
  aiAutoModerate: true
})

const displayPolicy = computed<'full' | 'gap_only' | 'hidden'>({
  get() {
    if (draft.showResults) return 'full'
    return draft.showRankGap ? 'gap_only' : 'hidden'
  },
  set(value) {
    if (value === 'full') {
      draft.showResults = true
      draft.showRankGap = true
    } else if (value === 'gap_only') {
      draft.showResults = false
      draft.showRankGap = true
    } else {
      draft.showResults = false
      draft.showRankGap = false
    }
  }
})

const saving = ref(false)
const actionBusy = ref('')
const origin = ref('')

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toLocalInput(ms: number | null): string {
  if (ms == null) return ''
  const date = new Date(ms)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string): number | null {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

function sync(): void {
  const settings = props.state?.settings
  if (!settings) return
  Object.assign(draft, {
    enabled: settings.enabled,
    title: settings.title,
    subtitle: settings.subtitle,
    opensAtLocal: toLocalInput(settings.opensAt),
    closesAtLocal: toLocalInput(settings.closesAt),
    allowChange: settings.allowChange,
    maxChanges: settings.maxChanges,
    votesPerVoter: settings.votesPerVoter ?? 1,
    wechatBonusVotes: settings.wechatBonusVotes ?? 2,
    allowRepeatVote: settings.allowRepeatVote ?? true,
    qrRotateSeconds: settings.qrRotateSeconds,
    passcodeRotate: settings.passcodeRotate ?? true,
    allowWithdraw: settings.allowWithdraw ?? true,
    showResults: settings.showResults,
    showRankGap: settings.showRankGap ?? false,
    authMode: settings.authMode ?? 'wechat_mp',
    wechatAccountName: settings.wechatAccountName ?? '仰恩大学指南',
    wechatQrUrl: settings.wechatQrUrl ?? '',
    wechatBiz: settings.wechatBiz ?? '',
    autoQuarantine: settings.autoQuarantine ?? true,
    aiAutoModerate: settings.aiAutoModerate ?? true
  })
}

watch(() => props.state?.settings, sync, { immediate: true, deep: true })

const statusText = computed(() => {
  switch (props.state?.status) {
    case 'open': return '进行中'
    case 'scheduled': return '未开始'
    case 'closed': return '已截止'
    default: return '已关闭'
  }
})

const statusClass = computed(() => {
  switch (props.state?.status) {
    case 'open': return 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300'
    case 'scheduled': return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
    default: return 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
  }
})

const displayUrl = computed(() => {
  const key = props.state?.settings.displayKey
  if (!key || !origin.value) return ''
  return `${origin.value}/singer/popularity-display?key=${encodeURIComponent(key)}`
})

const candidateCount = computed(() => props.state?.candidates.length ?? 0)
const voteTotal = computed(() => props.state?.totalVotes ?? 0)
const maxCount = computed(() => Math.max(1, ...(props.state?.results.map(row => row.count) ?? [1])))

onMounted(() => {
  origin.value = window.location.origin
})

async function saveSettings(): Promise<void> {
  if (saving.value) return
  const opensAt = fromLocalInput(draft.opensAtLocal)
  const closesAt = fromLocalInput(draft.closesAtLocal)
  if (opensAt != null && closesAt != null && opensAt >= closesAt) {
    toast.add({ title: '开始时间必须早于截止时间', color: 'warning' })
    return
  }
  saving.value = true
  try {
    await adminFetch('/api/admin/competition/popularity', {
      method: 'PUT',
      body: {
        enabled: draft.enabled,
        title: draft.title.trim(),
        subtitle: draft.subtitle.trim(),
        opensAt,
        closesAt,
        allowChange: draft.allowChange,
        maxChanges: Number(draft.maxChanges),
        votesPerVoter: Math.min(20, Math.max(1, Number(draft.votesPerVoter) || 1)),
        wechatBonusVotes: Math.min(20, Math.max(0, Number(draft.wechatBonusVotes ?? 2))),
        allowRepeatVote: draft.allowRepeatVote,
        qrRotateSeconds: Number(draft.qrRotateSeconds),
        passcodeRotate: draft.passcodeRotate,
        allowWithdraw: draft.allowWithdraw,
        showResults: draft.showResults,
        showRankGap: draft.showRankGap,
        authMode: draft.authMode,
        wechatAccountName: draft.wechatAccountName.trim() || '仰恩大学指南',
        wechatQrUrl: draft.wechatQrUrl.trim(),
        wechatBiz: draft.wechatBiz.trim(),
        autoQuarantine: draft.autoQuarantine,
        aiAutoModerate: draft.aiAutoModerate
      }
    })
    toast.add({ title: '人气奖设置已保存', color: 'success' })
    emit('refresh')
  } catch (error) {
    toast.add({
      title: '保存失败',
      description: apiErrorMessage(error, '请检查网络后重试。'),
      color: 'warning'
    })
  } finally {
    saving.value = false
  }
}

async function runAction(
  action: 'open' | 'close' | 'disable' | 'reset-votes' | 'rotate-display-key',
  confirmText?: string
): Promise<void> {
  if (actionBusy.value) return
  if (confirmText && !window.confirm(confirmText)) return
  actionBusy.value = action
  try {
    await adminFetch('/api/admin/competition/popularity/action', {
      method: 'POST',
      body: { action }
    })
    toast.add({ title: '操作已完成', color: 'success' })
    emit('refresh')
  } catch (error) {
    toast.add({
      title: '操作失败',
      description: apiErrorMessage(error, '请稍后重试。'),
      color: 'warning'
    })
  } finally {
    actionBusy.value = ''
  }
}

async function copyDisplayUrl(): Promise<void> {
  if (!displayUrl.value) return
  try {
    await navigator.clipboard.writeText(displayUrl.value)
    toast.add({ title: '大屏链接已复制', color: 'success' })
  } catch {
    toast.add({ title: '复制失败，请手动选中链接', color: 'warning' })
  }
}
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="text-base font-bold text-zinc-900 dark:text-zinc-100">
          人气奖投票
        </h2>
      </div>
      <span
        class="rounded-full px-2.5 py-1 text-xs font-medium"
        :class="statusClass"
      >
        {{ statusText }}
      </span>
    </div>

    <div class="grid gap-4 lg:grid-cols-2">
      <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          投票设置
        </h3>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          候选共 {{ candidateCount }} 人（决赛第一轮名单），不计入比赛成绩。
        </p>

        <label class="mt-4 flex items-center gap-2 text-sm">
          <input
            v-model="draft.enabled"
            type="checkbox"
            class="size-4 rounded border-zinc-300"
          >
          开启人气奖投票
        </label>

        <label
          class="mt-4 block text-sm font-medium"
          for="popularity-title"
        >标题</label>
        <UInput
          id="popularity-title"
          v-model="draft.title"
          class="mt-1 w-full"
          maxlength="60"
        />

        <label
          class="mt-3 block text-sm font-medium"
          for="popularity-subtitle"
        >说明</label>
        <UTextarea
          id="popularity-subtitle"
          v-model="draft.subtitle"
          class="mt-1 w-full"
          :rows="2"
          maxlength="160"
        />

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              class="block text-sm font-medium"
              for="popularity-opens"
            >开始时间</label>
            <input
              id="popularity-opens"
              v-model="draft.opensAtLocal"
              type="datetime-local"
              class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
            <p class="mt-1 text-xs text-zinc-500">
              留空 = 开启后立即生效
            </p>
          </div>
          <div>
            <label
              class="block text-sm font-medium"
              for="popularity-closes"
            >截止时间</label>
            <input
              id="popularity-closes"
              v-model="draft.closesAtLocal"
              type="datetime-local"
              class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
            <p class="mt-1 text-xs text-zinc-500">
              留空 = 手动结束
            </p>
          </div>
        </div>

        <div class="mt-4">
          <label
            class="block text-sm font-medium"
            for="popularity-votes-per-voter"
          >{{ draft.authMode === 'hybrid' ? '免关注基础票数' : '每人可投票数' }}</label>
          <input
            id="popularity-votes-per-voter"
            v-model.number="draft.votesPerVoter"
            type="number"
            min="1"
            max="20"
            class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 sm:max-w-[12rem]"
          >
          <p class="mt-1 text-xs text-zinc-500">
            {{ draft.authMode === 'hybrid'
              ? `不关注公众号即可直接投 ${draft.votesPerVoter} 票；关注公众号后总票数升级为 ${Number(draft.votesPerVoter || 1) + Number(draft.wechatBonusVotes ?? 2)} 票。`
              : '1 = 一人一票，可改票；大于 1 = 每人可投多票，改票设置不生效。' }}
          </p>
          <div
            v-if="draft.authMode === 'hybrid'"
            class="mt-3"
          >
            <label
              class="block text-sm font-medium"
              for="popularity-wechat-bonus-votes"
            >关注公众号额外加赠票数</label>
            <input
              id="popularity-wechat-bonus-votes"
              v-model.number="draft.wechatBonusVotes"
              type="number"
              min="0"
              max="20"
              class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 sm:max-w-[12rem]"
            >
            <p class="mt-1 text-xs text-zinc-500">
              默认 +2 票，关注公众号领专属链接后自动解锁并可与基础票合并投给同一位选手。
            </p>
          </div>
          <label
            v-if="draft.votesPerVoter > 1 || (draft.authMode === 'hybrid' && draft.wechatBonusVotes > 0)"
            class="mt-2 flex items-center gap-2 text-sm"
          >
            <input
              v-model="draft.allowRepeatVote"
              type="checkbox"
            >
            允许把多票投给同一位选手
          </label>
          <p
            v-if="draft.votesPerVoter > 1 || (draft.authMode === 'hybrid' && draft.wechatBonusVotes > 0)"
            class="mt-1 text-xs text-zinc-500"
          >
            {{ draft.allowRepeatVote
              ? '自由分配：可投给不同选手，也可把全部票投给同一位选手。'
              : '同一选手最多 1 票：多张票必须投给不同选手。' }}
          </p>
        </div>

        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label
              class="block text-sm font-medium"
              for="popularity-changes"
            >允许改票次数</label>
            <input
              id="popularity-changes"
              v-model.number="draft.maxChanges"
              type="number"
              min="0"
              max="20"
              class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
          </div>
          <div>
            <label
              class="block text-sm font-medium"
              for="popularity-rotate"
            >二维码刷新（秒）</label>
            <input
              id="popularity-rotate"
              v-model.number="draft.qrRotateSeconds"
              type="number"
              min="10"
              max="300"
              class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
          </div>
        </div>

        <label class="mt-4 flex items-center gap-2 text-sm">
          <input
            v-model="draft.allowChange"
            type="checkbox"
            class="size-4 rounded border-zinc-300"
          >
          允许改票（关闭即投票后锁定；最多 {{ draft.maxChanges }} 次）
        </label>
        <p
          v-if="draft.votesPerVoter > 1"
          class="mt-1 text-xs text-amber-600"
        >
          每人可投 {{ draft.votesPerVoter }} 票时，改票次数与「允许改票」不生效。
        </p>
        <div class="mt-3">
          <label
            class="block text-sm font-medium text-zinc-900 dark:text-zinc-100"
            for="popularity-display-policy"
          >公开页与大屏票数公布策略</label>
          <select
            id="popularity-display-policy"
            v-model="displayPolicy"
            class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="full">
              公布实时票数、名次与差票（完整公开）
            </option>
            <option value="gap_only">
              不公布具体票数，仅显示距离前一名差多少票
            </option>
            <option value="hidden">
              完全不公布（隐藏全部票数、名次与差票）
            </option>
          </select>
          <p class="mt-1 text-xs text-zinc-500">
            选「不公布具体票数，仅显示差票」时，前台与大屏不显示得票数、总票数与进度条，只显示名次及距离上一名差几票。
          </p>
        </div>

        <div class="mt-4 space-y-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <div>
            <label
              class="block text-xs font-semibold text-zinc-700 dark:text-zinc-200"
              for="popularity-auth-mode"
            >身份核验与防刷策略</label>
            <select
              id="popularity-auth-mode"
              v-model="draft.authMode"
              class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="hybrid">
                混合模式（人人可投基础票 + 关注公众号多投 {{ draft.wechatBonusVotes }} 票）
              </option>
              <option value="wechat_mp">
                公众号口令领专属链接（必须先关注 · 一人一微信号）
              </option>
              <option value="device_strict">
                免关注扫码降级（大屏单会话 + 设备严格风控）
              </option>
            </select>
          </div>
          <div
            v-if="draft.authMode === 'wechat_mp' || draft.authMode === 'hybrid'"
            class="grid gap-2 sm:grid-cols-2"
          >
            <div>
              <label
                class="block text-xs text-zinc-600 dark:text-zinc-400"
                for="popularity-wechat-name"
              >公众号名称</label>
              <UInput
                id="popularity-wechat-name"
                v-model="draft.wechatAccountName"
                size="sm"
                class="mt-1 w-full"
                maxlength="40"
              />
            </div>
            <div>
              <label
                class="block text-xs text-zinc-600 dark:text-zinc-400"
                for="popularity-wechat-qr"
              >公众号二维码地址（选填）</label>
              <UInput
                id="popularity-wechat-qr"
                v-model="draft.wechatQrUrl"
                size="sm"
                placeholder="/images/... 或 https://..."
                class="mt-1 w-full"
                maxlength="260"
              />
            </div>
            <div class="sm:col-span-2">
              <label
                class="block text-xs text-zinc-600 dark:text-zinc-400"
                for="popularity-wechat-biz"
              >公众号文章链接或 __biz（选填，填了才能在微信内一键进公众号）</label>
              <UInput
                id="popularity-wechat-biz"
                v-model="draft.wechatBiz"
                size="sm"
                placeholder="粘贴该号任意一篇文章链接，或 MzA...=="
                class="mt-1 w-full"
                maxlength="300"
              />
              <p class="mt-1 text-[11px] leading-relaxed text-zinc-500">
                微信里点「关注再得票」会直接打开公众号主页；没填或非微信环境仍显示上方二维码。
              </p>
            </div>
          </div>
          <div class="space-y-1.5">
            <label class="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
              <input
                v-model="draft.passcodeRotate"
                type="checkbox"
                class="size-4 rounded border-zinc-300"
              >
              发口令领票（大屏显示 2 位数字口令，每分钟自动轮换）
            </label>
            <p
              v-if="!draft.passcodeRotate"
              class="text-xs text-zinc-500"
            >
              已关闭：观众关注公众号后直接发送「投票」即可收到专属链接，大屏不再显示数字口令。
            </p>
          </div>
          <label class="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <input
              v-model="draft.allowWithdraw"
              type="checkbox"
              class="size-4 rounded border-zinc-300"
            >
            允许观众取消自己已投的票（取消后可重新投）
          </label>
          <label class="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <input
              v-model="draft.autoQuarantine"
              type="checkbox"
              class="size-4 rounded border-zinc-300"
            >
            高危特征自动冻结隔离（不计入公开与大屏票数）
          </label>
          <label class="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300">
            <input
              v-model="draft.aiAutoModerate"
              type="checkbox"
              class="size-4 rounded border-zinc-300"
            >
            AI 巡检直接自动处置风险票（自动作废刷票 / 放行正常冻结票，人工放行保留豁免）
          </label>
        </div>

        <div class="mt-5 flex flex-wrap gap-2">
          <UButton
            color="primary"
            :loading="saving"
            icon="i-lucide-save"
            @click="saveSettings"
          >
            保存设置
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            :loading="actionBusy === 'open'"
            icon="i-lucide-play"
            @click="runAction('open')"
          >
            立即开始
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            :loading="actionBusy === 'close'"
            icon="i-lucide-square"
            @click="runAction('close', '确定现在就截止人气奖投票？截止后不能继续投。')"
          >
            立即截止
          </UButton>
          <UButton
            color="error"
            variant="ghost"
            :loading="actionBusy === 'reset-votes'"
            icon="i-lucide-rotate-ccw"
            @click="runAction('reset-votes', '清空全部人气奖选票？此操作不可恢复，建议先导出结果。')"
          >
            清空选票
          </UButton>
        </div>
      </div>

      <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          大屏二维码
        </h3>
        <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          含取码密钥，勿发公开群。
        </p>
        <div class="mt-3 flex gap-2">
          <input
            :value="displayUrl"
            readonly
            class="min-w-0 flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-700 dark:bg-zinc-900"
          >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-copy"
            :disabled="!displayUrl"
            @click="copyDisplayUrl"
          >
            复制
          </UButton>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <UButton
            v-if="displayUrl"
            :to="displayUrl"
            target="_blank"
            rel="noopener noreferrer"
            color="primary"
            variant="soft"
            icon="i-lucide-external-link"
          >
            打开大屏页
          </UButton>
          <UButton
            color="error"
            variant="ghost"
            icon="i-lucide-key-round"
            :loading="actionBusy === 'rotate-display-key'"
            @click="runAction('rotate-display-key', '更换大屏链接？旧链接会立即失效。')"
          >
            更换大屏链接
          </UButton>
        </div>

        <div class="mt-5 rounded-md bg-zinc-50 p-3 text-xs leading-relaxed text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
          <p>
            当前有效票 {{ voteTotal }} 票（冻结待审 {{ props.state?.quarantinedVotes ?? 0 }} 票 · 已作废 {{ props.state?.voidedVotes ?? 0 }} 票）；规则高危 {{ props.state?.riskVotes ?? 0 }} 票。
          </p>
          <p class="mt-1">
            前置防御：大屏单实例 HttpOnly 会话锁死 + 不返明文 token；脚本 UA、缺 Cookie、无效凭证及 400ms 内极快提交直接拦截；高危自动冻结并由记忆 AI 巡检直接处置。
          </p>
        </div>
      </div>
    </div>

    <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          实时票数
        </h3>
        <span class="text-xs text-zinc-500">共 {{ voteTotal }} 票</span>
      </div>
      <div
        v-if="!props.state?.results.length"
        class="mt-3 text-sm text-zinc-500"
      >
        还没有人投票。
      </div>
      <div
        v-else
        class="mt-3 space-y-2"
      >
        <div
          v-for="row in props.state.results"
          :key="row.singerId"
          class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
        >
          <div class="min-w-0">
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="truncate font-medium">{{ row.name }}</span>
              <span class="shrink-0 tabular-nums text-zinc-500">{{ row.count }} 票 · {{ row.percent }}%</span>
            </div>
            <div class="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                class="h-full rounded-full bg-rose-500"
                :style="{ width: `${Math.round((row.count / maxCount) * 100)}%` }"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <AdminCompetitionPopularityGuardPanel
      :updated-at="props.state?.updatedAt"
      :candidates-count="candidateCount"
      @refresh="emit('refresh')"
    />
  </section>
</template>
