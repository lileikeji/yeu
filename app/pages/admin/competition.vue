<script setup lang="ts">
import { COMPETITION_EMAIL_MERGE_FIELDS, COMPETITION_MAX_DIMENSION_SCORE, competitionMaxTotal } from '~~/shared/utils/competition'
import { computeCompetitionAnalytics } from '~~/shared/utils/competition-analytics'
import type { CompetitionAdminPayload, CompetitionDimension, CompetitionDuelPair, CompetitionRoundEntry, CompetitionRoundKey, CompetitionRoundView } from '~~/shared/types'

definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: '新声歌手大赛',
  robots: 'noindex, nofollow'
})

const toast = useToast()

/** 复赛填曲目是独立页，选手需要这个地址；后台一键复制发群。 */
async function copySongLink(): Promise<void> {
  const path = activeRound.value?.key === 'final' ? '/singer/final-song' : '/singer/song'
  const url = `${window.location.origin}${path}`
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: '选歌链接已复制', description: url, color: 'success' })
  } catch {
    toast.add({ title: '复制失败，手动复制这个地址', description: url, color: 'warning' })
  }
}
/** 还没传伴奏的人：现场催交用，一键复制名单。 */
const missingAccompanimentNames = computed(() => (activeRound.value?.entries ?? [])
  .filter(entry => !entry.accompaniment)
  .map(entry => entry.singer.name))

async function copyMissingAccompaniment(): Promise<void> {
  const names = [...missingAccompanimentNames.value].sort((left, right) =>
    left.localeCompare(right, 'zh-Hans-CN-u-co-pinyin'))
  if (names.length === 0) {
    toast.add({ title: '所有选手都传了伴奏', color: 'success' })
    return
  }
  const text = names.join('、')
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: `已复制 ${names.length} 位还没传伴奏`, description: text.slice(0, 120), color: 'success' })
  } catch {
    toast.add({ title: '复制失败，手动选中下面的名字', description: text.slice(0, 160), color: 'warning' })
  }
}

const reminderPlaceholderHint = '可用占位：{{姓名}}、{{届次}}'
const dimensionScoreMax = computed(() => activeRound.value?.dimensionMax ?? COMPETITION_MAX_DIMENSION_SCORE)
/** 明细里每一维按它自己的满分显示（复赛 20/20/20/15/15/10）。 */
function maxOfKey(key: string): number {
  const dimension = activeRound.value?.dimensions.find(item => item.key === key)
  const own = Number(dimension?.max)
  return Number.isFinite(own) && own > 0 ? own : dimensionScoreMax.value
}

// 成绩与排名：进行中也按平均分实时排；还没分数的排在最后。
function onPickAccompaniment(round: CompetitionRoundView, entry: CompetitionRoundEntry, event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void uploadEntryAccompaniment(round, entry, file)
}

const rankedEntries = computed(() => {
  const list = activeRound.value?.entries ?? []
  return [...list].sort((left, right) => {
    const rankLeft = left.rank ?? Number.MAX_SAFE_INTEGER
    const rankRight = right.rank ?? Number.MAX_SAFE_INTEGER
    return (rankLeft - rankRight)
      || ((right.average ?? -1) - (left.average ?? -1))
      || (left.sortOrder - right.sortOrder)
  })
})

const {
  loading, loadError, payload, settings, activeSection, savingSettings, savingRoundKey, generatingRoundKey,
  sections, event, maxTotal, singers, singerJoinedRound, singerRoundSong, activeRound, settingsWeightSum, roundSummary,
  load, saveSettings,
  saveRound, setRoundStatus,
  clearRoundScores, clearingScoresKey
} = useCompetitionPayload({ toast })

/** 维度编辑按轮次分开：初赛 10 分制（满分 50）、复赛/决赛 20 分制（满分 100）。 */
const dimensionRoundKey = ref<CompetitionRoundKey>('prelim')
const dimensionRoundDraft = ref<CompetitionDimension[]>([])
const dimensionMaxDraft = ref(COMPETITION_MAX_DIMENSION_SCORE)
const dimensionRoundTotal = computed(() => competitionMaxTotal(
  dimensionRoundDraft.value,
  Number(dimensionMaxDraft.value) || COMPETITION_MAX_DIMENSION_SCORE
))
const trimExtremesDraft = ref(false)
const savingTrimExtremes = ref(false)
const savingDimensions = ref(false)

const dimensionRound = computed(
  () => payload.value?.rounds.find(round => round.key === dimensionRoundKey.value) ?? null
)
const dimensionRoundLocked = computed(() => dimensionRound.value?.hasScores === true || savingDimensions.value)
const DIMENSION_ROUND_OPTIONS = [
  { label: '初赛（满分 50）', value: 'prelim' },
  { label: '复赛（满分 100）', value: 'semi' },
  { label: '决赛（满分 100）', value: 'final' },
  { label: '决赛·第二轮（满分 100）', value: 'final2' }
]

function syncDimensionDraft(): void {
  const round = dimensionRound.value
  dimensionRoundDraft.value = (round?.dimensions ?? []).map(item => ({ ...item }))
  dimensionMaxDraft.value = round?.dimensionMax ?? COMPETITION_MAX_DIMENSION_SCORE
  trimExtremesDraft.value = round?.trimExtremes === true
}

watch([dimensionRoundKey, () => payload.value?.event.updatedAt], syncDimensionDraft, { immediate: true })

function addRoundDimension(): void {
  dimensionRoundDraft.value.push({ key: `dimension-${Date.now()}`, label: '', weight: 20 })
}

function removeRoundDimension(index: number): void {
  if (dimensionRoundDraft.value.length <= 1) return
  dimensionRoundDraft.value.splice(index, 1)
}

function moveRoundDimension(index: number, delta: number): void {
  const target = index + delta
  if (target < 0 || target >= dimensionRoundDraft.value.length) return
  const [item] = dimensionRoundDraft.value.splice(index, 1)
  if (item) dimensionRoundDraft.value.splice(target, 0, item)
}

function restoreRoundDimensions(): void {
  dimensionRoundDraft.value = Array.from({ length: 5 }, (_, index) => {
    const base = ['音准与节奏', '音色与技巧', '情感表达', '舞台表现', '选曲难度'][index] ?? `维度${index + 1}`
    const keys = ['pitch_rhythm', 'timbre_skill', 'emotion', 'stage', 'difficulty']
    return { key: keys[index] ?? `dimension-${index + 1}`, label: base, weight: 20 }
  })
}

/** 去极值只影响平均分口径，不受「已有评分锁定」限制，单独保存。 */
async function saveRoundTrimExtremes(): Promise<void> {
  const round = dimensionRound.value
  if (!round || savingTrimExtremes.value) return
  savingTrimExtremes.value = true
  try {
    const data = await adminFetch<CompetitionAdminPayload>(
      `/api/admin/competition/rounds/${round.key}`,
      { method: 'PUT', body: { trimExtremes: trimExtremesDraft.value } }
    )
    payload.value = data
    toast.add({ title: `${round.title}${trimExtremesDraft.value ? '已开启' : '已关闭'}去极值`, color: 'success' })
  } catch (error) {
    toast.add({ title: '保存失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
  } finally {
    savingTrimExtremes.value = false
  }
}

async function saveRoundDimensions(): Promise<void> {
  const round = dimensionRound.value
  if (!round || savingDimensions.value) return
  const dimensions = dimensionRoundDraft.value
    .map((item) => {
      const max = Number(item.max)
      return {
        key: item.key,
        label: item.label.trim(),
        weight: Number(item.weight),
        ...(Number.isFinite(max) && max > 0 ? { max: Math.round(max) } : {})
      }
    })
  if (dimensions.some(item => !item.label)) {
    toast.add({ title: '维度名称不能为空', color: 'warning' })
    return
  }
  savingDimensions.value = true
  try {
    const data = await adminFetch<CompetitionAdminPayload>(
      `/api/admin/competition/rounds/${round.key}`,
      {
        method: 'PUT',
        body: {
          dimensions,
          // 每维满分都填了就让本轮满分跟着取最大值，否则沿用原兜底值
          dimensionMax: dimensions.every(item => item.max)
            ? Math.max(...dimensions.map(item => item.max as number))
            : (Number(dimensionMaxDraft.value) || COMPETITION_MAX_DIMENSION_SCORE)
        }
      }
    )
    payload.value = data
    toast.add({ title: `${round.title}维度已保存`, color: 'success' })
  } catch (error) {
    toast.add({ title: '保存失败', description: apiErrorMessage(error, '请重试。'), color: 'warning' })
  } finally {
    savingDimensions.value = false
  }
}

const {
  busyJudgeId, addingJudge, newJudgeUsername, newJudgePassword, newJudgeDisplayName,
  judgeCredEditId, judgeCredEditName, judgeUsernameDraft, judgePasswordDraft, credentials, credentialsOpen,
  addJudge, generateJudges, openJudgeCredentials, closeJudgeCredentials, saveJudgeCredentials,
  saveJudgeName, toggleJudgeActive, resetJudgePassword, removeJudge, copyCredentials, closeCredentials
} = useCompetitionJudges({ settings, load, toast, generatingRoundKey })

const {
  SCHEDULE_KEY_OPTIONS, addScheduleRow, removeScheduleRow, restoreDefaultFormFields, formatDateTime,
  weightPercent, rosterEntries, rosterQuery, rosterVisible, duelRosterVisible, missingJudgeCount,
  rosterOrderMode, sortOrderBusy, sortOrderValue, setSortOrderDraft, applySortOrders,
  queueStateText, queueStateClass, roundStatusText, roundStatusClass, entryStatus, entryStatusClass,
  wrongStatus, advanceHint, canRedraw, canClearRoster, rankClass,
  currentBusyKey, currentPercent, moveCurrent, dayBusyKey, dayCount, dutyJudgeCount, dayLabel,
  changeRoundDay, changeEntryDay, checkInBusyId, toggleEntryCheckIn,
  entrySongBusyId, entrySongValue, setEntrySongDraft, saveEntrySong,
  finalSongsBusyId, finalSongsValue, setFinalSongsDraft, saveFinalSongs,
  accompanimentBusyId, uploadEntryAccompaniment,
  photoBusyId, uploadEntryPhoto, changeJudgeDay, redrawRound, clearRoster,
  draggingEntryId, dragOverEntryId, startDragEntry, dragOverEntry, dropOnEntry, endDragEntry,
  moveEntry, copyRoster
} = useCompetitionRoster({ payload, settings, event, settingsWeightSum, load, toast, generatingRoundKey, busyJudgeId })

const {
  importInput, importingSingers, triggerImport, onImportFile, newSinger, addingSinger,
  addSinger, editingSinger, editSingerOpen, editSingerForm, savingSinger, openEditSinger, saveSingerEdit,
  removeSinger, detailSinger, detailScore, scoreFor, scoreTotalFor, openScoreFor,
  closeDetail, closeEditSinger
} = useCompetitionSingers({ load, toast })

/** 从「评分明细」弹窗跳去改分：两者都读同一份 payload，这里只做一次空值收口。 */
function editDetailScore(): void {
  const round = activeRound.value
  const singer = detailSinger.value
  const score = detailScore.value
  if (!round || !singer || !score) return
  openScoreEditor(round, singer, score.judgeId, score.judgeName)
}

const {
  scoreEditorOpen, scoreEditorSinger, scoreEditorJudgeName, scoreDraft, scoreCommentDraft,
  savingScore, scoreDraftTotal, scoreDraftComplete, openScoreEditor, closeScoreEditor,
  saveScoreEdit, exportingKind, exportProgress, exportRound, exportAccompaniment, exportOriginalAccompaniment
} = useCompetitionScores({
  dimensions: computed(() => activeRound.value?.dimensions ?? settings.value?.dimensions ?? []),
  dimensionMax: computed(() => activeRound.value?.dimensionMax ?? COMPETITION_MAX_DIMENSION_SCORE),
  load,
  toast
})

const {
  advanceBusyKey, advanceRows, advanceConfirmed, advanceCount, receipts, receiptConfirmedCount,
  pairsBusyKey, duelPairs, duelResolved, drawPairs,
  toggleAdvance, confirmAdvance, reopenAdvance,
  reminderSubject, reminderBody, reminderSaving, reminderSending, saveReminderTemplate, sendReminders,
  editionLabel, editionCreating, createEdition
} = useCompetitionAdvance({ payload, activeRound, load, toast })

/** 只有决赛第一轮切到 1v1 时，出场名单才改成按组展示；其他轮次保持原表格。 */
const isDuelFinal = computed(() => activeRound.value?.key === 'final' && activeRound.value.advanceMode === 'duel')
const visibleRoster = computed(() => {
  const round = activeRound.value
  if (!round) return []
  return isDuelFinal.value ? duelRosterVisible(round) : rosterVisible(round)
})

function duelPairOf(entry: CompetitionRoundEntry): CompetitionDuelPair | null {
  return activeRound.value?.duelPairs?.find(pair => pair.pairNo === entry.pairNo) ?? null
}

const {
  emailRound, emailRounds, emailScope, emailSavingTemplate, emailSending, emailTesting, emailTestAddress, emailBodyRef,
  emailImageInput, emailImageUploading, emailImageDeletingId, emailImages, emailTemplate, emailStats,
  emailRoundView, emailCountWithEmail, emailCountWithoutEmail,
  emailAlreadySentCount, emailLatestRows, insertPlaceholder, insertBodyText,
  pickEmailImage, uploadEmailImage, removeEmailImage, saveEmailTemplate, sendEmailTest, sendEmails,
  openSendConfirm, sendConfirmOpen, sendConfirmNames, sendConfirmAlreadySent, sendConfirmWithoutEmail
} = useCompetitionEmail({ payload, singers, load, toast })

const {
  posterInput, posterSrc, qrPreEnabled, qrRegisterEnabled, qrSizeRatio, qrPosition, preCaption,
  regCaption, patchColor, patchMode, patches, canvasRef,
  qrPreUrl, qrRegisterUrl, composePoster, onPosterFileChange, onCanvasDown,
  onCanvasMove, onCanvasUp, undoLastPatch, clearPatches, downloadQr, downloadPoster
} = useCompetitionPoster()

const accompanimentPreview = ref<{
  name: string
  url: string
  size: number | null
  updatedAt: number | null
  original?: { name: string, url: string, size: number | null } | null
} | null>(null)

const photoPreview = ref<{ name: string, url: string } | null>(null)
const photoInput = ref<HTMLInputElement | null>(null)
const photoTargetEntryId = ref('')
function openPhoto(entry: { singer: { name: string, photoUrl?: string | null } }): void {
  if (!entry.singer.photoUrl) return
  photoPreview.value = { name: entry.singer.name, url: entry.singer.photoUrl }
}
function pickPhoto(entry: { id: string }): void {
  photoTargetEntryId.value = entry.id
  photoInput.value?.click()
}
function onPhotoPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const entry = activeRound.value?.entries.find(item => item.id === photoTargetEntryId.value)
  if (!file || !entry) return
  void uploadEntryPhoto(entry, file)
}

const accompanimentPreviewOpen = ref(false)

/** 伴奏体积：MB 保留一位，小的用 KB。 */
function accompanimentSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  return `${Math.max(1, Math.round(bytes / 1024))}KB`
}

function openAccompaniment(entry: CompetitionRoundEntry): void {
  if (!entry.accompaniment) return
  accompanimentPreview.value = {
    name: entry.accompaniment.name,
    url: entry.accompaniment.url,
    size: entry.accompaniment.size,
    updatedAt: entry.accompanimentUpdatedAt ?? null,
    original: entry.accompaniment.original ?? null
  }
  accompanimentPreviewOpen.value = true
}

const liveRefreshing = ref(false)
let liveTimer: ReturnType<typeof setInterval> | null = null

function stopLiveRefresh(): void {
  if (liveTimer) {
    clearInterval(liveTimer)
    liveTimer = null
  }
}

/** 名单实时刷新：页面在前台、本轮评分进行中时每 5 秒拉一次。 */
function startLiveRefresh(): void {
  stopLiveRefresh()
  liveTimer = setInterval(async () => {
    if (document.visibilityState !== 'visible' || liveRefreshing.value) return
    const round = activeRound.value
    if (!round || round.status !== 'open') return
    liveRefreshing.value = true
    try {
      await load()
    } finally {
      liveRefreshing.value = false
    }
  }, 5000)
}

const analyticsReport = computed(() => payload.value ? computeCompetitionAnalytics(payload.value) : null)

onMounted(async () => {
  await load()
  startLiveRefresh()
})

onBeforeUnmount(stopLiveRefresh)
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          新声歌手大赛
        </h1>
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
        <div class="rounded-lg border border-zinc-200 bg-[var(--surface)] px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
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
          class="rounded-lg border border-zinc-200 bg-[var(--surface)] px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900"
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
                placeholder="新声歌手大赛"
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
          <div class="mt-3 rounded-md border border-dashed border-amber-300 bg-amber-50/60 p-3 dark:border-amber-800 dark:bg-amber-950/20">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex flex-wrap items-center gap-3">
                <USwitch
                  :model-value="settings.revivalEnabled"
                  @update:model-value="value => settings && (settings.revivalEnabled = value === true)"
                />
                <span class="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                  隐藏赛制 · 复活赛
                </span>
                <span class="text-xs text-zinc-600 dark:text-zinc-300">
                  {{ settings.revivalEnabled ? `已开启：败者组前 ${settings.revivalSlots} 名复活进第二轮` : '已关闭：决赛第一轮只取各组胜者' }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-zinc-500 dark:text-zinc-400">复活名额</span>
                <UInput
                  :model-value="String(settings.revivalSlots)"
                  type="number"
                  min="1"
                  max="6"
                  class="w-20"
                  :disabled="!settings.revivalEnabled"
                  @update:model-value="value => settings && (settings.revivalSlots = Math.min(6, Math.max(1, Math.trunc(Number(value) || 2))))"
                />
              </div>
            </div>
            <p class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              决赛第一轮 1v1 败者按本轮均分取前 N 名进第二轮；轮空与未评分不计。
            </p>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                届次与赛程
              </h2>
            </div>
            <UButton
              size="xs"
              icon="i-lucide-plus"
              label="加一行赛程"
              variant="soft"
              @click="addScheduleRow"
            />
          </div>

          <div class="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <UFormField label="届次">
              <UInput
                v-model="settings.edition"
                class="w-full"
                maxlength="40"
                placeholder="如 2026 第六届"
              />
            </UFormField>
            <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400 md:pt-7">
              届次留空时，预报名页只显示「赛前预报名」。
            </p>
          </div>

          <div class="mt-3 rounded-md border border-dashed border-zinc-200 p-2.5 dark:border-zinc-800">
            <div class="flex flex-wrap items-end gap-2">
              <UFormField
                label="换一届"
                class="min-w-40 flex-1"
              >
                <UInput
                  v-model="editionLabel"
                  class="w-full"
                  maxlength="40"
                  placeholder="如 2027 第七届"
                />
              </UFormField>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                :loading="editionCreating"
                @click="createEdition"
              >
                新建这一届
              </UButton>
            </div>
            <p class="mt-1 text-[11px] leading-4 text-zinc-400">
              新建后当前这一届的选手、评分、名单全部留档，新一届从空白开始；赛程、表单、维度沿用这一届的设置。
            </p>
            <p
              v-if="payload.editions.length > 0"
              class="mt-1 text-[11px] leading-4 text-zinc-400"
            >
              历届：{{ payload.editions.map(item => `${item.label || '未命名'}（${item.singerCount} 人${item.isCurrent ? '，当前' : ''}）`).join(' · ') }}
            </p>
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-for="(item, index) in settings.schedule"
              :key="`schedule-${index}`"
              class="grid gap-2 rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800 md:grid-cols-[6rem_minmax(0,1fr)_8rem_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end"
            >
              <UFormField label="轮次">
                <USelect
                  v-model="item.key"
                  :items="[...SCHEDULE_KEY_OPTIONS]"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="日期">
                <UInput
                  v-model="item.dateLabel"
                  class="w-full"
                  maxlength="40"
                  placeholder="11 月 14 日（周六）"
                />
              </UFormField>
              <UFormField label="时间">
                <UInput
                  v-model="item.timeLabel"
                  class="w-full"
                  maxlength="40"
                  placeholder="19:00 开始"
                />
              </UFormField>
              <UFormField label="地点">
                <UInput
                  v-model="item.venue"
                  class="w-full"
                  maxlength="60"
                  placeholder="旧区宏船楼 303"
                />
              </UFormField>
              <UFormField label="备注">
                <UInput
                  v-model="item.note"
                  class="w-full"
                  maxlength="80"
                  placeholder="如 30 进 12"
                />
              </UFormField>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="i-lucide-trash-2"
                :disabled="settings.schedule.length <= 1"
                aria-label="删除这一行赛程"
                @click="removeScheduleRow(index)"
              />
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                报名表单字段
              </h2>
            </div>
            <UButton
              size="xs"
              icon="i-lucide-rotate-ccw"
              label="恢复默认"
              color="neutral"
              variant="soft"
              @click="restoreDefaultFormFields"
            />
          </div>

          <div class="mt-3 space-y-2">
            <div
              v-for="field in settings.formFields"
              :key="field.key"
              class="flex flex-wrap items-end gap-3 rounded-md border border-zinc-200 p-2.5 dark:border-zinc-800"
            >
              <UFormField
                label="字段名称"
                class="min-w-36 flex-1"
              >
                <UInput
                  v-model="field.label"
                  class="w-full"
                  maxlength="20"
                  :disabled="field.key === 'name'"
                />
              </UFormField>
              <div class="flex items-center gap-2 pb-2.5">
                <USwitch
                  :model-value="field.enabled"
                  :disabled="field.key === 'name'"
                  @update:model-value="value => field.enabled = value === true"
                />
                <span class="text-xs text-zinc-600 dark:text-zinc-300">显示</span>
              </div>
              <div class="flex items-center gap-2 pb-2.5">
                <USwitch
                  :model-value="field.required"
                  :disabled="field.key === 'name'"
                  @update:model-value="value => field.required = value === true"
                />
                <span class="text-xs text-zinc-600 dark:text-zinc-300">必填</span>
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                评分维度与占比
              </h2>
              <USelect
                v-model="dimensionRoundKey"
                :items="DIMENSION_ROUND_OPTIONS"
                size="xs"
                class="w-40"
              />
              <span class="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                本轮满分 {{ dimensionRoundTotal }} 分
              </span>
              <span class="text-xs text-zinc-400 dark:text-zinc-500">
                每维满分在下面各行自己填，留空就用 {{ dimensionMaxDraft }} 分
              </span>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <UButton
                size="xs"
                icon="i-lucide-rotate-ccw"
                label="恢复默认五维"
                color="neutral"
                variant="soft"
                :disabled="dimensionRoundLocked"
                @click="restoreRoundDimensions"
              />
              <UButton
                size="xs"
                icon="i-lucide-plus"
                label="添加维度"
                variant="soft"
                :disabled="dimensionRoundLocked"
                @click="addRoundDimension"
              />
              <UButton
                size="xs"
                icon="i-lucide-save"
                label="保存本轮维度"
                :loading="savingDimensions"
                :disabled="dimensionRoundLocked"
                @click="saveRoundDimensions"
              />
            </div>
          </div>

          <label class="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
            <input
              v-model="trimExtremesDraft"
              type="checkbox"
              class="size-4 accent-emerald-600"
              :disabled="savingTrimExtremes"
              @change="saveRoundTrimExtremes"
            >
            算平均分时去掉一个最高分和一个最低分（本轮，至少 3 位评委）
          </label>

          <div class="mt-3 space-y-2">
            <div
              v-for="(dimension, index) in dimensionRoundDraft"
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
                  :disabled="dimensionRoundLocked"
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
                  :disabled="dimensionRoundLocked"
                  @update:model-value="value => dimension.weight = Number(value) || 0"
                />
              </UFormField>
              <UFormField
                label="满分"
                class="w-24"
              >
                <UInput
                  :model-value="String(dimension.max ?? '')"
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  :placeholder="`${dimensionMaxDraft}`"
                  class="w-full"
                  :disabled="dimensionRoundLocked"
                  @update:model-value="value => dimension.max = Number(value) > 0 ? Number(value) : undefined"
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
                  :disabled="index === 0 || dimensionRoundLocked"
                  @click="moveRoundDimension(index, -1)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-arrow-down"
                  aria-label="下移"
                  :disabled="index === dimensionRoundDraft.length - 1 || dimensionRoundLocked"
                  @click="moveRoundDimension(index, 1)"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="soft"
                  icon="i-lucide-trash-2"
                  aria-label="删除维度"
                  :disabled="dimensionRoundDraft.length <= 1 || dimensionRoundLocked"
                  @click="removeRoundDimension(index)"
                />
              </div>
            </div>
          </div>

          <p class="mt-3 border-t border-zinc-100 pt-3 text-xs text-amber-700 dark:border-zinc-800 dark:text-amber-300">
            {{ dimensionRound?.hasScores
              ? '本轮已有评分，维度与满分已锁定；已保存成绩按当时快照计算。'
              : '初赛默认五维、每维 0-10（满分 50）；复赛/决赛每维 0-20（满分 100）。改完点「保存本轮维度」。' }}
          </p>
        </div>
      </section>

      <section
        v-if="activeSection === 'analytics' && payload"
        class="space-y-4"
      >
        <AdminCompetitionAnalyticsPanel
          :payload="payload"
          @update:payload="payload = $event"
          @refresh="load"
        />
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
                  placeholder="选填，如 example@qq.com"
                />
              </UFormField>
              <UFormField label="QQ（可选）">
                <UInput
                  v-model="newSinger.qq"
                  class="w-full"
                  placeholder="查结果用"
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
          <table class="w-full min-w-[1360px] text-sm">
            <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
              <tr>
                <th class="w-16 px-3 py-2 font-medium">
                  序号
                </th>
                <th class="px-3 py-2 font-medium">
                  姓名
                </th>
                <th class="px-3 py-2 font-medium">
                  初赛曲目
                </th>
                <th class="px-3 py-2 font-medium">
                  复赛曲目
                </th>
                <th class="px-3 py-2 font-medium">
                  决赛曲目
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
                  QQ
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
                  {{ singerRoundSong(singer, 'prelim') || singer.song || '待定' }}
                </td>
                <td class="px-3 py-2 text-xs">
                  <template v-if="singerJoinedRound(singer.id, 'semi')">
                    {{ singerRoundSong(singer, 'semi') || '待填' }}
                  </template>
                  <span
                    v-else
                    class="text-zinc-300 dark:text-zinc-600"
                  >—</span>
                </td>
                <td class="px-3 py-2 text-xs">
                  <template v-if="singerJoinedRound(singer.id, 'final')">
                    {{ singerRoundSong(singer, 'final') || '待填' }}
                  </template>
                  <span
                    v-else
                    class="text-zinc-300 dark:text-zinc-600"
                  >—</span>
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
                <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                  <span class="select-all tabular-nums">{{ singer.qq || '—' }}</span>
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
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                预报名名单
              </h3>
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                :loading="reminderSending"
                @click="sendReminders"
              >
                提醒未到场选手
              </UButton>
            </div>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              预报名 {{ payload.preRegistrations.length }} 人，已到现场
              {{ payload.preRegistrations.filter(item => item.registeredAt).length }} 人。提醒只发给没签到的，已签到的跳过。
            </p>
            <details class="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
              <summary class="cursor-pointer select-none">
                提醒邮件模板
              </summary>
              <div class="mt-2 space-y-2">
                <input
                  v-model="reminderSubject"
                  class="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="主题"
                >
                <textarea
                  v-model="reminderBody"
                  rows="4"
                  class="w-full rounded-md border border-zinc-200 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                  placeholder="正文"
                />
                <div class="flex items-center gap-2">
                  <UButton
                    size="xs"
                    :loading="reminderSaving"
                    @click="saveReminderTemplate"
                  >
                    保存模板
                  </UButton>
                  <span class="text-[11px] text-zinc-400">{{ reminderPlaceholderHint }}</span>
                </div>
              </div>
            </details>
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
                    QQ
                  </th>
                  <th class="px-3 py-2 font-medium">
                    歌曲
                  </th>
                  <th class="px-3 py-2 text-left">
                    伴奏
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
                    <span class="select-all tabular-nums">{{ item.qq || '—' }}</span>
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
        v-show="activeSection !== 'settings' && activeSection !== 'singers' && activeSection !== 'popularity' && activeSection !== 'email' && activeSection !== 'materials'"
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
                icon="i-lucide-eraser"
                label="清空评分"
                color="error"
                variant="soft"
                :disabled="!(activeRound.entries.some(entry => entry.average !== null) || (activeRound.scores?.length ?? 0) > 0)"
                :loading="clearingScoresKey === activeRound.key"
                @click="clearRoundScores(activeRound)"
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

          <div
            v-if="activeRound.key === 'prelim'"
            class="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-medium">
                  赛程天
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  v-if="!activeRound.activeDay"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-calendar-range"
                  label="按顺序平分两天"
                  :loading="dayBusyKey === activeRound.key"
                  @click="changeRoundDay(activeRound, null, true)"
                />
                <UButton
                  v-if="activeRound.activeDay !== 1"
                  size="xs"
                  icon="i-lucide-calendar-days"
                  :label="activeRound.activeDay ? '切到第一天' : '第一天'"
                  :disabled="activeRound.status === 'closed'"
                  :loading="dayBusyKey === activeRound.key"
                  @click="changeRoundDay(activeRound, 1)"
                />
                <UButton
                  v-if="activeRound.activeDay !== 2"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-calendar-days"
                  :label="activeRound.activeDay ? '切到第二天' : '第二天'"
                  :disabled="activeRound.status === 'closed'"
                  :loading="dayBusyKey === activeRound.key"
                  @click="changeRoundDay(activeRound, 2)"
                />
                <UButton
                  v-if="activeRound.activeDay"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-x"
                  label="不分天"
                  :disabled="activeRound.status === 'closed'"
                  :loading="dayBusyKey === activeRound.key"
                  @click="changeRoundDay(activeRound, null)"
                />
              </div>
            </div>
            <p class="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              第一天 {{ dayCount(activeRound, 1) }} 人 · 第二天 {{ dayCount(activeRound, 2) }} 人 ·
              未分配 {{ dayCount(activeRound, null) }} 人
              <span class="mx-1">|</span>
              当天到岗评委 {{ dutyJudgeCount(activeRound) }} 位
              <span
                v-if="activeRound.activeDay"
                class="ml-1 font-medium text-green-700 dark:text-green-400"
              >
                当前：{{ dayLabel(activeRound.activeDay) }}
              </span>
            </p>
          </div>

          <div class="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-sm font-medium">
                  顺序评分
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  v-if="!activeRound.current"
                  size="xs"
                  icon="i-lucide-play"
                  label="开始顺序评分"
                  :disabled="activeRound.status !== 'open' || activeRound.entries.length === 0"
                  :loading="currentBusyKey === `${activeRound.key}:start`"
                  @click="moveCurrent(activeRound, 'start')"
                />
                <template v-else>
                  <UButton
                    size="xs"
                    icon="i-lucide-skip-forward"
                    label="下一位"
                    :disabled="!activeRound.current.allSubmitted"
                    :loading="currentBusyKey === `${activeRound.key}:next`"
                    @click="moveCurrent(activeRound, 'next')"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-undo-2"
                    label="上一位"
                    :loading="currentBusyKey === `${activeRound.key}:prev`"
                    @click="moveCurrent(activeRound, 'prev')"
                  />
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-forward"
                    label="跳过此人"
                    :loading="currentBusyKey === `${activeRound.key}:skip`"
                    @click="moveCurrent(activeRound, 'skip')"
                  />
                  <UButton
                    size="xs"
                    color="error"
                    variant="soft"
                    icon="i-lucide-x"
                    label="退出"
                    :loading="currentBusyKey === `${activeRound.key}:stop`"
                    @click="moveCurrent(activeRound, 'stop')"
                  />
                </template>
              </div>
            </div>
            <div
              v-if="activeRound.current"
              class="mt-3"
            >
              <p class="text-sm">
                第 {{ activeRound.current.index }} / {{ activeRound.current.total }} 位 ·
                <span class="font-semibold">{{ activeRound.current.singer.name }}</span>
                <span class="text-zinc-500 dark:text-zinc-400">《{{ activeRound.current.singer.song }}》</span>
              </p>
              <div class="mt-2 flex items-center gap-2">
                <div class="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    class="h-full rounded-full bg-green-600 transition-[width] duration-300"
                    :style="{ width: `${currentPercent(activeRound)}%` }"
                  />
                </div>
                <span class="shrink-0 text-xs font-semibold tabular-nums">
                  {{ activeRound.current.submitted.length }} / {{ activeRound.current.judgeTotal }}
                </span>
              </div>
              <p
                v-if="activeRound.current.pending.length"
                class="mt-1 text-xs text-amber-600 dark:text-amber-400"
              >
                还差 {{ activeRound.current.pending.length }} 位：{{ activeRound.current.pending.join('、') }}
              </p>
              <p
                v-else
                class="mt-1 text-xs text-green-600 dark:text-green-400"
              >
                全部提交，可以点「下一位」。
              </p>
              <ul class="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                <li
                  v-for="(item, slot) in activeRound.current.judges"
                  :key="item.id"
                  class="flex items-center gap-2 rounded-md border px-2 py-1 text-xs"
                  :class="item.submitted
                    ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40'
                    : 'border-zinc-200 bg-[var(--surface)] dark:border-zinc-800 dark:bg-zinc-900'"
                >
                  <span class="w-4 shrink-0 tabular-nums text-zinc-400">{{ slot + 1 }}</span>
                  <span class="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200">{{ item.name }}</span>
                  <span
                    class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                    :class="item.submitted
                      ? 'bg-green-600 text-white'
                      : 'bg-zinc-200 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300'"
                  >
                    {{ item.submitted ? '已提交' : '未提交' }}
                  </span>
                </li>
              </ul>
            </div>
            <p
              v-else
              class="mt-2 text-xs text-zinc-400"
            >
              {{ activeRound.status === 'open' ? '未开启：评委可自由给任意选手打分。' : '本轮未开放评分。' }}
            </p>
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
              v-if="activeRound.key === 'final'"
              label="晋级方式"
              class="w-44"
            >
              <select
                :value="activeRound.advanceMode"
                class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-2 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                @change="activeRound.advanceMode = ($event.target as HTMLSelectElement).value as 'rank' | 'duel'"
              >
                <option value="rank">
                  整轮前六
                </option>
                <option value="duel">
                  抽签 1v1（每组胜者）
                </option>
              </select>
            </UFormField>
            <UFormField
              v-if="activeRound.key !== 'final' && activeRound.key !== 'final2'"
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
            <UFormField
              label="打分精度"
              class="w-36"
            >
              <select
                :value="activeRound.scorePrecision"
                class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-2 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                @change="activeRound.scorePrecision = ($event.target as HTMLSelectElement).value as 'integer' | 'decimal'"
              >
                <option value="integer">
                  整数（0-10）
                </option>
                <option value="decimal">
                  小数（拖滑块，0.1 步长）
                </option>
              </select>
            </UFormField>
            <UButton
              icon="i-lucide-save"
              label="保存本轮设置"
              variant="soft"
              :loading="savingRoundKey === activeRound.key"
              @click="saveRound(activeRound)"
            />
            <span class="pb-2 text-xs text-zinc-400">
              初赛默认取前 30；复赛名额可在复赛结束后再填；决赛第一轮固定取前六进第二轮，第二轮不再晋级。
            </span>
          </div>
        </div>

        <div class="rounded-lg border border-zinc-200 dark:border-zinc-800">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div>
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {{ activeRound.title }}评委账号
              </h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                已创建 {{ activeRound.judges.length }} / 计划 {{ activeRound.judgeCount }}
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

          <div class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <p class="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              自定义账号（留空自动生成；密码至少 6 位）
            </p>
            <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <UInput
                v-model="newJudgeUsername"
                size="xs"
                placeholder="登录账号"
                autocomplete="off"
              />
              <UInput
                v-model="newJudgePassword"
                size="xs"
                placeholder="密码"
                autocomplete="new-password"
              />
              <UInput
                v-model="newJudgeDisplayName"
                size="xs"
                placeholder="显示名称"
              />
              <UButton
                size="xs"
                icon="i-lucide-user-plus"
                label="添加评委"
                :loading="addingJudge"
                :disabled="activeRound.status === 'closed'"
                @click="addJudge(activeRound)"
              />
            </div>
          </div>

          <div
            v-if="judgeCredEditId"
            class="border-b border-zinc-100 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-800/40"
          >
            <p class="text-xs font-medium text-zinc-600 dark:text-zinc-300">
              修改「{{ judgeCredEditName }}」的账号密码
            </p>
            <div class="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <UInput
                v-model="judgeUsernameDraft"
                size="xs"
                placeholder="登录账号"
                autocomplete="off"
              />
              <UInput
                v-model="judgePasswordDraft"
                size="xs"
                placeholder="新密码（留空不改）"
                autocomplete="new-password"
              />
              <UButton
                size="xs"
                icon="i-lucide-save"
                label="保存"
                :loading="busyJudgeId === judgeCredEditId"
                @click="saveJudgeCredentials(activeRound)"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                label="取消"
                @click="closeJudgeCredentials"
              />
            </div>
          </div>

          <div
            v-if="activeRound.judges.length === 0"
            class="px-4 py-8 text-center text-sm text-zinc-400"
          >
            还没有评委账号。设置上方「评委人数」后点「补齐评委账号」，或直接在上面填账号密码添加。
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
                  <th
                    v-if="activeRound.key === 'prelim'"
                    class="px-3 py-2 font-medium"
                  >
                    到岗天
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
                  <td
                    v-if="activeRound.key === 'prelim'"
                    class="px-3 py-2"
                  >
                    <select
                      class="rounded-md border border-zinc-200 bg-[var(--surface)] px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      :value="judge.day ?? 0"
                      :disabled="busyJudgeId === judge.id || activeRound.status === 'closed'"
                      @change="changeJudgeDay(activeRound, judge, ($event.target as HTMLSelectElement).value)"
                    >
                      <option :value="0">
                        两天都在
                      </option>
                      <option :value="1">
                        第一天
                      </option>
                      <option :value="2">
                        第二天
                      </option>
                    </select>
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
                        icon="i-lucide-at-sign"
                        label="改账号密码"
                        :disabled="busyJudgeId === judge.id || activeRound.status === 'closed'"
                        @click="openJudgeCredentials(judge)"
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
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div>
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                {{ isDuelFinal ? '对阵名单' : '出场名单' }}
              </h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {{ isDuelFinal
                  ? '按 1v1 分组显示；每组两人，胜者进第二轮。抽签与确认在下方晋级结算区操作。'
                  : '复赛/决赛名单由上一轮晋级后抽签生成，可拖动调整。' }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <input
                v-if="!isDuelFinal"
                v-model="rosterQuery"
                type="search"
                placeholder="搜选手名字或歌名"
                class="w-48 rounded-md border border-zinc-300 bg-[var(--surface)] px-2.5 py-1.5 text-xs text-zinc-800 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                aria-label="搜索出场名单"
              >
              <select
                v-if="!isDuelFinal"
                v-model="rosterOrderMode"
                class="rounded-md border border-zinc-300 bg-[var(--surface)] px-2 py-1.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                aria-label="名单显示顺序"
              >
                <option value="pinyin">
                  按姓名排
                </option>
                <option value="draw">
                  按出场号排
                </option>
              </select>
              <span
                v-if="!isDuelFinal"
                class="hidden text-[11px] text-zinc-500 sm:inline dark:text-zinc-400"
              >填号=签到</span>
              <UButton
                v-if="activeRound.status !== 'closed' && !isDuelFinal"
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-list-ordered"
                :loading="sortOrderBusy"
                @click="applySortOrders(activeRound)"
              >
                保存号码并排序
              </UButton>
              <a
                href="/singer/draw"
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-green-600 hover:text-green-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                抽签登记
              </a>
              <a
                href="/singer/call"
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-green-600 hover:text-green-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                叫号台
              </a>
              <UButton
                v-if="activeRound && activeRound.key !== 'prelim'"
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-folder-down"
                :loading="exportingKind === 'accompaniment'"
                @click="exportAccompaniment(activeRound)"
              >
                {{ exportProgress && exportingKind === 'accompaniment'
                  ? `打包中 ${exportProgress.done}/${exportProgress.total}`
                  : '下载全部伴奏' }}
              </UButton>
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-folder-down"
                :loading="exportingKind === 'accompaniment-original'"
                @click="exportOriginalAccompaniment(activeRound)"
              >
                {{ exportProgress && exportingKind === 'accompaniment-original'
                  ? `打包中 ${exportProgress.done}/${exportProgress.total}`
                  : '下载全部原件' }}
              </UButton>
            </div>
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
                  <th class="w-24 px-4 py-2 font-medium">
                    {{ isDuelFinal ? '出场号' : '出场顺序' }}
                  </th>
                  <th class="px-3 py-2 font-medium">
                    选手
                  </th>
                  <th class="px-3 py-2 font-medium">
                    {{ activeRound.key === 'final' ? '决赛两首歌' : activeRound.key === 'final2' ? '第二轮曲目' : '歌曲' }}
                  </th>
                  <th class="px-3 py-2 font-medium">
                    班级
                  </th>
                  <th class="px-3 py-2 font-medium">
                    来源
                  </th>
                  <th class="px-3 py-2 font-medium">
                    照片
                  </th>
                  <th class="w-24 px-3 py-2 font-medium">
                    状态
                  </th>
                  <th class="w-20 px-3 py-2 font-medium">
                    签到
                  </th>
                  <th class="w-32 px-4 py-2 font-medium">
                    调整
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <template
                  v-for="(entry, index) in visibleRoster"
                  :key="entry.id"
                >
                  <tr
                    v-if="isDuelFinal && (index === 0 || visibleRoster[index - 1]?.pairNo !== entry.pairNo)"
                    class="bg-zinc-50/80 dark:bg-zinc-900/40"
                  >
                    <td
                      colspan="9"
                      class="px-4 py-2"
                    >
                      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span class="font-bold text-zinc-700 dark:text-zinc-200">
                          第 {{ entry.pairNo ?? '—' }} 组
                        </span>
                        <span
                          v-if="duelPairOf(entry)?.ready"
                          class="text-emerald-700 dark:text-emerald-300"
                        >
                          胜者：{{ duelPairOf(entry)?.winnerName }}
                        </span>
                        <span
                          v-else
                          class="text-amber-700 dark:text-amber-300"
                        >
                          {{ duelPairOf(entry)?.entries.length === 2 ? '待比赛 / 待裁定' : '未分组' }}
                        </span>
                      </div>
                    </td>
                  </tr>
                  <tr
                    :draggable="activeRound.status !== 'closed' && !isDuelFinal"
                    class="transition-colors"
                    :class="[
                      entry.id === draggingEntryId ? 'opacity-40' : '',
                      entry.id === dragOverEntryId ? 'bg-green-50 dark:bg-green-950/40' : ''
                    ]"
                    @dragstart="startDragEntry(activeRound, entry, $event)"
                    @dragover="dragOverEntry(entry, $event)"
                    @drop.prevent="dropOnEntry(activeRound, entry)"
                    @dragend="endDragEntry"
                  >
                    <td
                      class="px-3 py-2 font-semibold tabular-nums text-zinc-900 dark:text-zinc-100"
                      :class="isDuelFinal ? '' : 'cursor-grab active:cursor-grabbing'"
                    >
                      <span class="inline-flex items-center gap-1">
                        <UIcon
                          v-if="activeRound.status !== 'closed' && !isDuelFinal"
                          name="i-lucide-grip-vertical"
                          class="size-3.5 text-zinc-300 dark:text-zinc-600"
                          aria-hidden="true"
                        />
                        <input
                          v-if="activeRound.status !== 'closed' && !isDuelFinal"
                          :value="sortOrderValue(entry)"
                          type="text"
                          inputmode="numeric"
                          class="w-12 rounded border border-zinc-200 px-1 py-0.5 text-center text-sm tabular-nums focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                          :placeholder="String(index + 1)"
                          :aria-label="`${entry.singer.name} 出场顺序`"
                          @input="setSortOrderDraft(entry.id, ($event.target as HTMLInputElement).value)"
                        >
                        <span v-else>{{ isDuelFinal ? (entry.sortOrder || '—') : (rosterOrderMode === 'draw' ? (entry.sortOrder || index + 1) : index + 1) }}</span>
                      </span>
                    </td>
                    <td class="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {{ entry.singer.name }}
                    </td>
                    <td class="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      <div
                        v-if="activeRound.key === 'final'"
                        class="flex min-w-[15rem] flex-col gap-1"
                      >
                        <label class="flex items-center gap-1 text-[11px] text-zinc-400">
                          第一首
                          <input
                            :value="finalSongsValue(entry).firstSong"
                            class="min-w-0 flex-1 rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-sm text-zinc-700 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                            :disabled="activeRound.status === 'closed' || finalSongsBusyId === entry.singer.id"
                            placeholder="第一轮唱"
                            @input="setFinalSongsDraft(entry, 'firstSong', ($event.target as HTMLInputElement).value)"
                          >
                        </label>
                        <label class="flex items-center gap-1 text-[11px] text-zinc-400">
                          第二首
                          <input
                            :value="finalSongsValue(entry).secondSong"
                            class="min-w-0 flex-1 rounded border border-zinc-200 bg-zinc-50 px-1 py-0.5 text-sm text-zinc-700 focus:border-emerald-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                            :disabled="activeRound.status === 'closed' || finalSongsBusyId === entry.singer.id"
                            placeholder="进前六后唱"
                            @input="setFinalSongsDraft(entry, 'secondSong', ($event.target as HTMLInputElement).value)"
                          >
                        </label>
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="subtle"
                          icon="i-lucide-check"
                          class="self-start"
                          :loading="finalSongsBusyId === entry.singer.id"
                          :disabled="activeRound.status === 'closed'"
                          @click="saveFinalSongs(activeRound, entry)"
                        >
                          保存两首
                        </UButton>
                      </div>
                      <template v-else>
                        <input
                          v-if="activeRound?.status !== 'closed' && activeRound?.key !== 'final2'"
                          :value="entrySongValue(entry, activeRound?.key)"
                          class="w-full min-w-[8rem] rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-zinc-200 focus:border-emerald-500 focus:outline-none dark:hover:border-zinc-700"
                          :disabled="entrySongBusyId === entry.id"
                          @input="setEntrySongDraft(entry, ($event.target as HTMLInputElement).value)"
                          @change="saveEntrySong(activeRound!, entry)"
                        >
                        <span v-else>{{ entrySongValue(entry, activeRound?.key) }}</span>
                      </template>
                    </td>
                    <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                      <template v-if="activeRound?.key !== 'prelim'">
                        <label
                          v-if="activeRound?.key !== 'final' && activeRound?.key !== 'final2'"
                          class="inline-flex cursor-pointer items-center gap-1 rounded border border-zinc-200 px-2 py-1 text-xs hover:border-emerald-500 dark:border-zinc-700"
                          :class="accompanimentBusyId === entry.id ? 'opacity-60' : ''"
                        >
                          <input
                            type="file"
                            class="hidden"
                            accept="audio/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,video/mp4,.mp4"
                            :disabled="accompanimentBusyId === entry.id || activeRound?.status === 'closed'"
                            @change="onPickAccompaniment(activeRound!, entry, $event)"
                          >
                          {{ entry.accompaniment
                            ? (entry.accompaniment.name.toLowerCase().endsWith('.mp4') ? '换背景视频' : '换伴奏')
                            : '传伴奏' }}
                        </label>
                        <span
                          v-else
                          class="text-[11px] text-zinc-400"
                        >决赛两段视频由选手在「决赛两首歌」页分别上传</span>
                        <template v-if="entry.accompaniment">
                          <button
                            type="button"
                            class="ml-1 inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-700 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                            :aria-label="entry.accompaniment?.name.toLowerCase().endsWith('.mp4') ? '预览背景视频' : '试听伴奏'"
                            @click="openAccompaniment(entry)"
                          >
                            <UIcon
                              name="i-lucide-play"
                              class="size-3"
                            />
                            {{ entry.accompaniment.name.toLowerCase().endsWith('.mp4') ? '预览' : '试听' }}
                          </button>
                          <span class="ml-1 text-[11px]">
                            {{ entry.accompaniment.name }}
                            <span class="text-zinc-400">· {{ accompanimentSize(entry.accompaniment.size) }}</span>
                            <span
                              v-if="entry.accompanimentUpdatedAt"
                              class="block text-[11px] text-zinc-400 tabular-nums"
                            >
                              更新于 {{ formatDateTime(entry.accompanimentUpdatedAt) }}
                            </span>
                          </span>
                        </template>
                      </template>
                      <span v-else>—</span>
                    </td>
                    <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {{ entry.singer.className || '—' }}
                    </td>
                    <td class="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {{ entry.advancedFromRank ? `上一轮第 ${entry.advancedFromRank} 名` : '选手库' }}
                    </td>
                    <td class="px-3 py-2">
                      <div class="flex items-center gap-1">
                        <button
                          v-if="entry.singer.photoUrl"
                          type="button"
                          class="size-10 overflow-hidden rounded border border-zinc-200 dark:border-zinc-700"
                          :aria-label="`查看${entry.singer.name}的照片`"
                          @click="openPhoto(entry)"
                        >
                          <img
                            :src="entry.singer.photoUrl"
                            :alt="entry.singer.name"
                            class="size-10 object-cover"
                          >
                        </button>
                        <UButton
                          size="xs"
                          color="neutral"
                          variant="outline"
                          :icon="entry.singer.photoUrl ? 'i-lucide-image-up' : 'i-lucide-upload'"
                          :loading="photoBusyId === entry.id"
                          :aria-label="`上传${entry.singer.name}的照片`"
                          @click="pickPhoto(entry)"
                        >
                          {{ entry.singer.photoUrl ? '换' : '上传' }}
                        </UButton>
                      </div>
                    </td>
                    <td class="px-3 py-2">
                      <span
                        class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium"
                        :class="queueStateClass(entry)"
                      >
                        {{ queueStateText(entry) }}
                      </span>
                    </td>
                    <td class="px-3 py-2">
                      <UButton
                        size="xs"
                        :color="entry.checkedInAt ? 'success' : 'neutral'"
                        :variant="entry.checkedInAt ? 'soft' : 'outline'"
                        :loading="checkInBusyId === entry.id"
                        :disabled="activeRound.status === 'closed'"
                        @click="toggleEntryCheckIn(activeRound, entry)"
                      >
                        {{ entry.checkedInAt ? '已签到' : '签到' }}
                      </UButton>
                    </td>
                    <td class="px-4 py-2">
                      <div
                        v-if="!isDuelFinal"
                        class="flex items-center gap-1"
                      >
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
                      <span
                        v-else
                        class="text-[11px] text-zinc-400"
                      >按组固定</span>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div
          v-if="activeRound.key !== 'final2'"
          class="rounded-lg border border-zinc-200 dark:border-zinc-800"
        >
          <div class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                晋级名单
              </h3>
              <div class="flex items-center gap-2">
                <span
                  v-if="advanceConfirmed"
                  class="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                >
                  已确认 · 回执 {{ receiptConfirmedCount }} / {{ receipts.length }}
                </span>
                <UButton
                  v-if="advanceConfirmed"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-link"
                  label="选歌链接"
                  @click="copySongLink"
                />
                <UButton
                  v-if="advanceConfirmed"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-download"
                  :loading="exportingKind === 'confirmed'"
                  @click="exportRound(activeRound, 'confirmed')"
                >
                  导出名单
                </UButton>
                <UButton
                  v-if="advanceConfirmed"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-list-ordered"
                  :loading="exportingKind === 'confirmed-plain'"
                  @click="exportRound(activeRound, 'confirmed-plain')"
                >
                  名单（不带成绩）
                </UButton>

                <UButton
                  v-if="advanceConfirmed"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  :loading="advanceBusyKey.endsWith(':reopen')"
                  @click="reopenAdvance"
                >
                  重新打开
                </UButton>
                <template v-else>
                  <UButton
                    v-if="activeRound.key === 'final' && activeRound.advanceMode === 'duel'"
                    size="xs"
                    color="neutral"
                    variant="soft"
                    icon="i-lucide-shuffle"
                    :loading="pairsBusyKey.endsWith(':draw')"
                    @click="drawPairs('draw')"
                  >
                    {{ duelPairs.length > 0 ? '重新抽签' : '抽签分组' }}
                  </UButton>
                  <UButton
                    v-if="activeRound.key === 'final' && activeRound.advanceMode === 'duel' && duelPairs.length > 0"
                    size="xs"
                    color="neutral"
                    variant="outline"
                    :loading="pairsBusyKey.endsWith(':clear')"
                    @click="drawPairs('clear')"
                  >
                    清除对阵
                  </UButton>
                </template>
                <UButton
                  v-if="!advanceConfirmed && advanceRows.length > 0"
                  size="xs"
                  :loading="advanceBusyKey.endsWith(':confirm')"
                  :disabled="activeRound.advanceMode === 'duel' && !duelResolved"
                  @click="confirmAdvance"
                >
                  {{ activeRound.advanceMode === 'duel' ? '确认胜者' : '确认名单' }}（{{ advanceCount }} 人）
                </UButton>
              </div>
            </div>
            <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              <template v-if="activeRound.advanceMode === 'duel'">
                每组两人唱第一首，均分高者晋级；同分按评委多数、最高单项分裁定。
              </template>
              <template v-else>
                确认晋级名单后方可发送通知邮件。
              </template>
            </p>
          </div>

          <div
            v-if="activeRound.advanceMode === 'duel'"
            class="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800"
          >
            <div
              v-if="duelPairs.length === 0"
              class="rounded-lg border border-dashed border-zinc-300 px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            >
              尚未抽签分组（已有评分后不可重抽）。
            </div>
            <div
              v-else
              class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
            >
              <div
                v-for="pair in duelPairs"
                :key="pair.pairNo"
                class="rounded-lg border p-3"
                :class="pair.ready ? 'border-emerald-200 dark:border-emerald-900' : 'border-amber-200 dark:border-amber-900'"
              >
                <div class="mb-2 flex items-center justify-between gap-2">
                  <span class="text-xs font-bold text-zinc-500 dark:text-zinc-400">第 {{ pair.pairNo }} 组</span>
                  <span
                    v-if="pair.ready"
                    class="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  >
                    胜者：{{ pair.winnerName }}
                  </span>
                  <span
                    v-else
                    class="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                  >
                    待裁定
                  </span>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="(entry, entryIndex) in pair.entries"
                    :key="entry.id"
                    class="relative rounded-md border px-2.5 py-2 pr-10 text-sm"
                    :class="entry.id === pair.winnerEntryId
                      ? 'border-emerald-300 bg-emerald-50 font-bold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200'
                      : 'border-zinc-200 bg-zinc-50/70 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/40 dark:text-zinc-300'"
                  >
                    <div class="absolute right-2 top-2">
                      <AdminCompetitionPowerPopover
                        :profile="analyticsReport?.profilesById[entry.singer.id]"
                        :opponent="pair.entries[1 - entryIndex] ? analyticsReport?.profilesById[pair.entries[1 - entryIndex]!.singer.id] : null"
                        :prediction="analyticsReport?.duelPredictions[pair.pairNo]"
                        :side="entryIndex === 0 ? 'left' : 'right'"
                        :pair-no="pair.pairNo"
                        compact
                      />
                    </div>
                    <div class="flex items-center justify-between gap-2">
                      <span class="truncate">{{ entry.singer.name }}</span>
                      <span class="shrink-0 tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
                        {{ entry.average === null ? '未评分' : entry.average.toFixed(2) }}
                      </span>
                    </div>
                    <div
                      v-if="analyticsReport?.profilesById[entry.singer.id]?.power.hasRating"
                      class="mt-1 flex items-center justify-between gap-2 text-xs font-normal text-zinc-500 dark:text-zinc-400"
                    >
                      <span>
                        实力 {{ analyticsReport.profilesById[entry.singer.id]!.power.tier }} · {{ analyticsReport.profilesById[entry.singer.id]!.power.powerScore?.toFixed(1) }}
                      </span>
                      <span
                        v-if="analyticsReport?.duelPredictions[pair.pairNo]?.leftWinProb !== null && analyticsReport?.duelPredictions[pair.pairNo]?.rightWinProb !== null"
                        class="tabular-nums"
                      >
                        胜率 {{ entryIndex === 0 ? analyticsReport.duelPredictions[pair.pairNo]!.leftWinProb : analyticsReport.duelPredictions[pair.pairNo]!.rightWinProb }}%
                      </span>
                    </div>
                  </div>
                </div>
                <p
                  v-if="pair.note"
                  class="mt-2 text-[11px] text-amber-700 dark:text-amber-300"
                >
                  {{ pair.note }}
                </p>
              </div>
            </div>
          </div>

          <div
            v-if="activeRound.revival && activeRound.revival.enabled"
            class="border-b border-zinc-100 px-4 py-4 dark:border-zinc-800"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                复活赛 · 败者组排名
              </h3>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ activeRound.revival.slots }} 个复活名额：前 {{ activeRound.revival.slots }} 名跟各组胜者一起进下一轮
              </span>
            </div>
            <div
              v-if="activeRound.revival.candidates.length === 0"
              class="mt-2 rounded-lg border border-dashed border-zinc-300 px-4 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            >
              各组 1v1 出结果后按本轮均分排序。
            </div>
            <div
              v-else
              class="mt-2 space-y-1.5"
            >
              <div
                v-for="candidate in activeRound.revival.candidates"
                :key="candidate.entryId"
                class="flex flex-wrap items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm"
                :class="candidate.revived
                  ? 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-500/10'
                  : 'border-zinc-200 bg-[var(--surface)] dark:border-zinc-800 dark:bg-zinc-900'"
              >
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <span class="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    败者第 {{ candidate.loserRank }}
                  </span>
                  <span class="truncate font-medium text-zinc-800 dark:text-zinc-100">{{ candidate.name }}</span>
                  <span
                    v-if="candidate.className"
                    class="shrink-0 text-xs text-zinc-500 dark:text-zinc-400"
                  >{{ candidate.className }}</span>
                  <span
                    v-if="candidate.revived"
                    class="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                  >
                    复活
                  </span>
                </div>
                <span class="shrink-0 tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
                  {{ candidate.average === null ? '未评分' : candidate.average.toFixed(2) }} · {{ candidate.scoreCount }} 位评委
                </span>
              </div>
            </div>
          </div>

          <div
            v-if="advanceRows.length === 0"
            class="px-4 py-8 text-center text-sm text-zinc-400"
          >
            <p>{{ activeRound.status === 'closed' ? '这一轮没有可晋级的选手。' : '本轮还没结束，评完再回来确认晋级名单。' }}</p>
            <UButton
              v-if="activeRound.status !== 'closed'"
              class="mt-3"
              size="xs"
              color="warning"
              :loading="savingRoundKey === activeRound.key"
              @click="setRoundStatus(activeRound, 'closed')"
            >
              结束本轮评分
            </UButton>
          </div>

          <div
            v-else
            class="overflow-x-auto"
          >
            <table class="w-full min-w-[720px] text-sm">
              <thead class="bg-zinc-50 text-left text-xs text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
                <tr>
                  <th class="w-16 px-4 py-2 font-medium">
                    晋级
                  </th>
                  <th class="w-20 px-3 py-2 font-medium">
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
                  <th class="px-4 py-2 font-medium">
                    回执
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
                <tr
                  v-for="row in advanceRows"
                  :key="row.entryId"
                >
                  <td class="px-4 py-2.5">
                    <input
                      type="checkbox"
                      class="size-4 accent-emerald-600"
                      :checked="row.advanced"
                      :disabled="Boolean(advanceConfirmed) || activeRound.advanceMode === 'duel'"
                      @change="toggleAdvance(row.entryId, ($event.target as HTMLInputElement).checked)"
                    >
                  </td>
                  <td class="px-3 py-2.5 tabular-nums text-zinc-500 dark:text-zinc-400">
                    {{ row.rank ?? '—' }}
                  </td>
                  <td class="px-3 py-2.5 font-medium text-zinc-900 dark:text-zinc-100">
                    {{ row.singer.name }}
                    <span
                      v-if="row.revived"
                      class="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-normal text-amber-800 dark:bg-amber-500/20 dark:text-amber-200"
                    >
                      复活
                    </span>
                  </td>
                  <td class="px-3 py-2.5 text-zinc-600 dark:text-zinc-300">
                    {{ row.singer.song }}
                  </td>
                  <td class="px-3 py-2.5 text-right tabular-nums">
                    {{ row.average === null ? '—' : row.average.toFixed(2) }}
                  </td>
                  <td class="px-4 py-2.5">
                    <span
                      v-if="advanceConfirmed && row.advanced"
                      class="text-xs"
                      :class="receipts.find(item => item.singerId === row.singer.id)?.confirmedAt ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'"
                    >
                      {{ receipts.find(item => item.singerId === row.singer.id)?.confirmedAt ? '已收到' : '未确认' }}
                      <span
                        v-if="receipts.find(item => item.singerId === row.singer.id)?.confirmedAt"
                        class="ml-1 text-[11px] text-zinc-400"
                      >
                        {{ formatDateTime(receipts.find(item => item.singerId === row.singer.id)?.confirmedAt ?? null) }}
                      </span>
                    </span>
                    <span
                      v-else
                      class="text-xs text-zinc-300 dark:text-zinc-600"
                    >—</span>
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
              实时按平均分排序，同分按出场顺序；还没分数的排在最后。
            </p>
            <div class="mt-2 flex flex-wrap gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-download"
                label="成绩明细 CSV"
                :loading="exportingKind === 'detail'"
                @click="exportRound(activeRound, 'detail')"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-download"
                label="排名汇总 CSV"
                :loading="exportingKind === 'summary'"
                @click="exportRound(activeRound, 'summary')"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-trophy"
                label="晋级名单 CSV"
                :loading="exportingKind === 'advancing'"
                @click="exportRound(activeRound, 'advancing')"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-music"
                label="曲目名单 CSV"
                :loading="exportingKind === 'songs'"
                @click="exportRound(activeRound, 'songs')"
              />
              <UButton
                v-if="activeRound && activeRound.key !== 'prelim'"
                size="xs"
                color="neutral"
                variant="soft"
                icon="i-lucide-copy"
                :label="`复制没传伴奏的（${missingAccompanimentNames.length}）`"
                @click="copyMissingAccompaniment"
              />
            </div>
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
                  <th
                    v-if="activeRound.key === 'prelim'"
                    class="px-3 py-2 font-medium"
                  >
                    天
                  </th>
                  <th class="px-3 py-2 text-right font-medium">
                    平均分（满分 {{ maxTotal }}）
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
                  v-for="entry in rankedEntries"
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
                  <td
                    v-if="activeRound.key === 'prelim'"
                    class="px-3 py-2.5"
                  >
                    <select
                      class="rounded-md border border-zinc-200 bg-[var(--surface)] px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      :value="entry.contestDay ?? 0"
                      :disabled="activeRound.status === 'closed'"
                      @change="changeEntryDay(activeRound, entry, ($event.target as HTMLSelectElement).value)"
                    >
                      <option :value="0">
                        未分配
                      </option>
                      <option :value="1">
                        第一天
                      </option>
                      <option :value="2">
                        第二天
                      </option>
                    </select>
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
          <div class="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              {{ activeRound.title }}评分明细
            </h3>
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
                  <td class="sticky left-0 bg-[var(--surface)] px-4 py-2 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100">
                    {{ entry.singer.name }}
                    <span class="block text-xs font-normal text-zinc-400">{{ entry.singer.song }}</span>
                  </td>
                  <td
                    v-for="judge in activeRound.judges"
                    :key="judge.id"
                    class="px-3 py-2 text-center"
                  >
                    <div class="flex items-center justify-center gap-1">
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
                      <UButton
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        :icon="scoreFor(activeRound, entry.singer.id, judge.id) ? 'i-lucide-pencil' : 'i-lucide-plus'"
                        :aria-label="`${scoreFor(activeRound, entry.singer.id, judge.id) ? '修改' : '补录'}${entry.singer.name}·${judge.displayName}的评分`"
                        :title="scoreFor(activeRound, entry.singer.id, judge.id) ? '修改这位评委的评分' : '补录这位评委的评分'"
                        @click="openScoreEditor(activeRound, entry.singer, judge.id, judge.displayName)"
                      />
                    </div>
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
        v-show="activeSection === 'popularity'"
        class="space-y-4"
      >
        <AdminCompetitionPopularityPanel
          :state="payload?.popularity ?? null"
          @refresh="load"
        />
      </section>

      <section
        v-show="activeSection === 'email'"
        class="space-y-4"
      >
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-1 rounded-lg border border-zinc-200 p-1 dark:border-zinc-800">
            <button
              v-for="round in emailRounds"
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
            <UFormField label="QQ 群链接">
              <div class="flex flex-wrap items-center gap-2">
                <UInput
                  v-model="settings.qqGroupUrl"
                  placeholder="https://qm.qq.com/…（填了之后模板里的「加群按钮」才有跳转）"
                  class="w-full sm:w-[420px]"
                />
                <UButton
                  icon="i-lucide-save"
                  label="保存群链接"
                  size="xs"
                  variant="soft"
                  :loading="savingSettings"
                  @click="saveSettings"
                />
              </div>
            </UFormField>
            <UFormField label="邮件主题">
              <UInput
                v-model="emailTemplate.subject"
                class="w-full"
                placeholder="【音乐协会】新声歌手大赛结果通知"
              />
            </UFormField>
            <UFormField label="邮件正文">
              <textarea
                ref="emailBodyRef"
                v-model="emailTemplate.body"
                rows="10"
                class="w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm leading-6 text-zinc-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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

            <div class="rounded-md border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  <span class="font-semibold text-zinc-800 dark:text-zinc-100">邮件图片</span>
                  支持 JPG / PNG / WebP / GIF，单张 4MB 以内；上传后自动在光标处插入
                  <code class="rounded bg-zinc-100 px-1 dark:bg-zinc-800">[[图片:ID]]</code>，发送时内嵌进邮件正文。
                </div>
                <div class="flex items-center gap-2">
                  <input
                    ref="emailImageInput"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    class="hidden"
                    @change="uploadEmailImage"
                  >
                  <UButton
                    icon="i-lucide-image-plus"
                    label="上传图片"
                    size="xs"
                    variant="soft"
                    :loading="emailImageUploading"
                    @click="pickEmailImage"
                  />
                </div>
              </div>
              <div
                v-if="emailImages.length > 0"
                class="mt-3 flex flex-wrap gap-1.5"
              >
                <span
                  v-for="image in emailImages"
                  :key="image.id"
                  class="group relative inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1 pr-1.5 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <img
                    :src="image.url"
                    :alt="image.filename"
                    class="h-8 w-8 rounded object-cover"
                  >
                  <UButton
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    label="插入"
                    @click="insertBodyText(`[[图片:${image.id}]]`)"
                  />
                  <UButton
                    size="xs"
                    color="error"
                    variant="ghost"
                    icon="i-lucide-trash-2"
                    :loading="emailImageDeletingId === image.id"
                    @click="removeEmailImage(image)"
                  />
                </span>
              </div>
              <p
                v-else
                class="mt-2 text-xs text-zinc-400"
              >
                还没有图片。上传后可复用，删除前请确认正文里不再引用。
              </p>
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
                  class="rounded-md border border-zinc-300 bg-[var(--surface)] px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
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
                label="发送结果邮件"
                :loading="emailSending"
                :disabled="emailRoundView?.status !== 'closed' || emailCountWithEmail(emailScope) <= 0"
                @click="openSendConfirm"
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
              placeholder="接收测试邮件的邮箱"
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
              显示最近一次发送状态。
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

      <section
        v-show="activeSection === 'materials'"
        class="space-y-4"
      >
        <div class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
              报名二维码
            </h3>
            <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              印在海报或物料上。预报名码赛前发放；现场登记码只在比赛当天现场提供，不放在公开网页上。
            </p>
            <div class="mt-3 space-y-4">
              <div class="text-center">
                <img
                  :src="qrPreUrl"
                  alt="预报名二维码"
                  class="mx-auto w-40 rounded-lg border border-zinc-200 dark:border-zinc-700"
                >
                <p class="mt-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  赛前预报名
                </p>
                <p class="text-xs text-zinc-400">
                  /singer/pre-register
                </p>
                <UButton
                  size="xs"
                  variant="soft"
                  icon="i-lucide-download"
                  label="下载 PNG"
                  class="mt-1.5"
                  @click="downloadQr('/singer/pre-register', '新声歌手大赛预报名二维码.png')"
                />
              </div>
              <div class="text-center">
                <img
                  :src="qrRegisterUrl"
                  alt="现场登记二维码"
                  class="mx-auto w-40 rounded-lg border border-zinc-200 dark:border-zinc-700"
                >
                <p class="mt-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  现场正式登记
                </p>
                <p class="text-xs text-zinc-400">
                  /singer/register
                </p>
                <UButton
                  size="xs"
                  variant="soft"
                  icon="i-lucide-download"
                  label="下载 PNG"
                  class="mt-1.5"
                  @click="downloadQr('/singer/register', '新声歌手大赛现场登记二维码.png')"
                />
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  海报拼接
                </h3>
              </div>
              <div>
                <input
                  ref="posterInput"
                  type="file"
                  accept="image/*"
                  class="hidden"
                  @change="onPosterFileChange"
                >
                <UButton
                  icon="i-lucide-image-up"
                  :label="posterSrc ? '更换海报图' : '上传海报图'"
                  variant="soft"
                  @click="posterInput?.click()"
                />
              </div>
            </div>

            <div
              v-if="posterSrc"
              class="mt-3 space-y-3"
            >
              <div class="grid gap-3 sm:grid-cols-2">
                <div class="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <p class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    二维码
                  </p>
                  <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
                    <UCheckbox
                      v-model="qrPreEnabled"
                      label="预报名码"
                    />
                    <UInput
                      v-model="preCaption"
                      size="xs"
                      class="w-28"
                      placeholder="二维码下文字"
                    />
                  </div>
                  <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
                    <UCheckbox
                      v-model="qrRegisterEnabled"
                      label="现场登记码"
                    />
                    <UInput
                      v-model="regCaption"
                      size="xs"
                      class="w-28"
                      placeholder="二维码下文字"
                    />
                  </div>
                  <p class="pt-1 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    大小与位置
                  </p>
                  <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
                    <label class="flex items-center gap-2">
                      边长
                      <input
                        v-model.number="qrSizeRatio"
                        type="range"
                        min="10"
                        max="35"
                        class="accent-green-600"
                      >
                      {{ qrSizeRatio }}%
                    </label>
                    <select
                      v-model="qrPosition"
                      class="rounded-md border border-zinc-300 bg-[var(--surface)] px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
                    >
                      <option value="bottom-left">
                        左下角
                      </option>
                      <option value="bottom-right">
                        右下角
                      </option>
                      <option value="bottom-center">
                        底部居中
                      </option>
                    </select>
                  </div>
                </div>

                <div class="space-y-2 rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                  <p class="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    遮盖贴片（去除海报上的文字/水印）
                  </p>
                  <div class="flex flex-wrap items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                    <USwitch
                      v-model="patchMode"
                      @update:model-value="() => composePoster()"
                    />
                    <span>开启后在图上拖拽涂抹</span>
                    <input
                      v-model="patchColor"
                      type="color"
                      class="h-7 w-10 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
                      title="贴片颜色"
                    >
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      label="撤销上一块"
                      :disabled="patches.length === 0"
                      @click="undoLastPatch"
                    />
                    <UButton
                      size="xs"
                      color="neutral"
                      variant="soft"
                      label="全部清除"
                      :disabled="patches.length === 0"
                      @click="clearPatches"
                    />
                  </div>
                </div>
              </div>

              <div class="overflow-auto rounded-md border border-zinc-200 bg-[#f6f7f5] p-2 dark:border-zinc-800 dark:bg-zinc-900">
                <canvas
                  ref="canvasRef"
                  class="mx-auto block max-w-full cursor-crosshair rounded"
                  @mousedown="onCanvasDown"
                  @mousemove="onCanvasMove"
                  @mouseup="onCanvasUp"
                  @mouseleave="onCanvasUp"
                />
              </div>

              <div class="flex justify-end">
                <UButton
                  icon="i-lucide-image-down"
                  label="下载拼接图 PNG"
                  @click="downloadPoster"
                />
              </div>
            </div>

            <div
              v-else
              class="mt-3 grid min-h-48 place-items-center rounded-md border border-dashed border-zinc-300 text-sm text-zinc-400 dark:border-zinc-700"
            >
              先上传海报图（当前两张海报的图片文件）
            </div>
          </div>
        </div>
      </section>
    </template>

    <UModal
      v-model:open="sendConfirmOpen"
      title="确认发送名单"
      description="发出去就撤不回，先核对一遍这些人对不对。"
      :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-lg' }"
    >
      <template #body>
        <div class="space-y-3">
          <p class="text-sm text-zinc-600 dark:text-zinc-300">
            共 <span class="font-semibold text-zinc-900 dark:text-zinc-100">{{ sendConfirmNames.length }}</span> 位将收到「{{ emailRoundView?.title }}」通知：
          </p>
          <div class="max-h-64 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
            <span
              v-for="(name, index) in sendConfirmNames"
              :key="`${name}-${index}`"
              class="mr-1.5 mb-1.5 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
            >
              {{ index + 1 }}. {{ name }}
            </span>
          </div>
          <p
            v-if="sendConfirmAlreadySent > 0 || sendConfirmWithoutEmail > 0"
            class="text-xs text-zinc-500 dark:text-zinc-400"
          >
            <template v-if="sendConfirmAlreadySent > 0">
              {{ sendConfirmAlreadySent }} 位之前发过，会自动跳过；
            </template>
            <template v-if="sendConfirmWithoutEmail > 0">
              {{ sendConfirmWithoutEmail }} 位没填邮箱，也会跳过。
            </template>
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="再改改"
            @click="sendConfirmOpen = false"
          />
          <UButton
            icon="i-lucide-send"
            label="确认发送"
            :loading="emailSending"
            @click="sendEmails"
          />
        </div>
      </template>
    </UModal>

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
          <UFormField label="QQ">
            <UInput
              v-model="editSingerForm.qq"
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
                    {{ dimension.score }} / {{ maxOfKey(dimension.key) }}
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
        <div class="flex w-full items-center justify-between gap-2">
          <UButton
            v-if="detailScore && detailSinger"
            label="修正这份评分"
            color="neutral"
            variant="ghost"
            icon="i-lucide-pencil"
            @click="editDetailScore"
          />
          <UButton
            label="关闭"
            color="neutral"
            variant="soft"
            @click="closeDetail"
          />
        </div>
      </template>
    </UModal>

    <UModal
      :open="scoreEditorOpen"
      :title="scoreEditorSinger ? `修改评分 · ${scoreEditorSinger.name} · ${scoreEditorJudgeName}` : '修改评分'"
      :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-lg' }"
      @update:open="value => { if (!value) closeScoreEditor() }"
    >
      <template #body>
        <div class="space-y-4">
          <p class="rounded-md bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            修改评委单份评分后，均分、名次与晋级状态立即重算。
          </p>

          <div class="space-y-2">
            <div
              v-for="dimension in (activeRound?.dimensions ?? [])"
              :key="dimension.key"
              class="flex items-center justify-between gap-3"
            >
              <label
                :for="`score-dim-${dimension.key}`"
                class="text-sm text-zinc-700 dark:text-zinc-200"
              >
                {{ dimension.label }}
                <span class="text-xs text-zinc-400">（权重 {{ dimension.weight }}）</span>
              </label>
              <input
                :id="`score-dim-${dimension.key}`"
                v-model="scoreDraft[dimension.key]"
                type="number"
                min="0"
                :max="maxOfKey(dimension.key)"
                step="0.5"
                class="w-24 rounded-md border border-zinc-300 bg-[var(--surface)] px-2 py-1.5 text-right text-sm tabular-nums text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
            </div>
          </div>

          <div class="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60">
            <span class="text-zinc-600 dark:text-zinc-300">按权重折算总分</span>
            <span class="font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
              {{ scoreDraftTotal.toFixed(2) }}
              <span class="text-xs font-normal text-zinc-400">/ {{ maxTotal }}</span>
            </span>
          </div>

          <div>
            <label
              for="score-comment-edit"
              class="text-xs font-semibold text-zinc-700 dark:text-zinc-200"
            >
              评委备注
            </label>
            <textarea
              id="score-comment-edit"
              v-model="scoreCommentDraft"
              rows="3"
              maxlength="500"
              class="mt-1 w-full rounded-md border border-zinc-300 bg-[var(--surface)] px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="可留空"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            label="取消"
            color="neutral"
            variant="soft"
            @click="closeScoreEditor"
          />
          <UButton
            label="保存评分"
            icon="i-lucide-check"
            :loading="savingScore"
            :disabled="!scoreDraftComplete"
            @click="saveScoreEdit"
          />
        </div>
      </template>
    </UModal>

    <UModal
      v-model:open="accompanimentPreviewOpen"
      :title="accompanimentPreview?.name || '伴奏'"
      :description="accompanimentPreview ? `文件大小 ${accompanimentSize(accompanimentPreview.size)}${accompanimentPreview.updatedAt ? `，更新于 ${formatDateTime(accompanimentPreview.updatedAt)}` : ''}，手机上直接点播放就能看/听，电脑也可以下载下来。` : '手机上直接点播放就能看/听，电脑也可以下载下来。'"
      :ui="{ content: 'w-[calc(100vw-1rem)] sm:max-w-md' }"
    >
      <template #body>
        <div class="space-y-3">
          <video
            v-if="accompanimentPreview && accompanimentPreview.name.toLowerCase().endsWith('.mp4')"
            :src="accompanimentPreview.url"
            controls
            playsinline
            preload="metadata"
            class="max-h-[70vh] w-full rounded-lg bg-black"
          />
          <audio
            v-else-if="accompanimentPreview"
            :src="accompanimentPreview.url"
            controls
            preload="none"
            class="w-full"
          />
          <a
            v-if="accompanimentPreview"
            :href="accompanimentPreview.url"
            :download="accompanimentPreview.name"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-sm text-emerald-700 underline dark:text-emerald-300"
          >
            <UIcon
              name="i-lucide-download"
              class="size-4"
            />
            下载这个{{ accompanimentPreview.name.toLowerCase().endsWith('.mp4') ? '视频' : '伴奏' }}
          </a>
          <a
            v-if="accompanimentPreview?.original"
            :href="accompanimentPreview.original.url"
            :download="accompanimentPreview.original.name"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1 text-sm text-zinc-600 underline dark:text-zinc-300"
          >
            <UIcon
              name="i-lucide-file-audio"
              class="size-4"
            />
            下载原件（{{ accompanimentSize(accompanimentPreview.original.size) }}）
          </a>
        </div>
      </template>
    </UModal>

    <input
      ref="photoInput"
      type="file"
      accept="image/*"
      class="hidden"
      @change="onPhotoPicked"
    >

    <div
      v-if="photoPreview"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      @click="photoPreview = null"
    >
      <figure class="max-h-full w-full max-w-lg text-center">
        <img
          :src="photoPreview.url"
          :alt="photoPreview.name"
          class="mx-auto max-h-[80vh] w-auto rounded-lg object-contain"
        >
        <figcaption class="mt-3 text-sm text-white/80">
          {{ photoPreview.name }}
        </figcaption>
      </figure>
    </div>
  </div>
</template>
