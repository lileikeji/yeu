<script setup lang="ts">
import { COMPETITION_EMAIL_MERGE_FIELDS, COMPETITION_MAX_DIMENSION_SCORE } from '~~/shared/utils/competition'

definePageMeta({ layout: 'admin' })

useSeoMeta({
  title: '新声歌手大赛',
  robots: 'noindex, nofollow'
})

const toast = useToast()
const dimensionScoreMax = COMPETITION_MAX_DIMENSION_SCORE

// 成绩与排名：进行中也按平均分实时排；还没分数的排在最后。
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
  sections, event, maxTotal, singers, activeRound, settingsWeightSum, hasAnyScores, roundSummary,
  load, saveSettings, addDimension, removeDimension, moveDimension, restoreDefaultDimensions,
  saveRound, setRoundStatus
} = useCompetitionPayload({ toast })

const {
  busyJudgeId, addingJudge, newJudgeUsername, newJudgePassword, newJudgeDisplayName,
  judgeCredEditId, judgeCredEditName, judgeUsernameDraft, judgePasswordDraft, credentials, credentialsOpen,
  addJudge, generateJudges, openJudgeCredentials, closeJudgeCredentials, saveJudgeCredentials,
  saveJudgeName, toggleJudgeActive, resetJudgePassword, removeJudge, copyCredentials, closeCredentials
} = useCompetitionJudges({ settings, load, toast, generatingRoundKey })

const {
  SCHEDULE_KEY_OPTIONS, addScheduleRow, removeScheduleRow, restoreDefaultFormFields, formatDateTime,
  weightPercent, rosterEntries, rosterQuery, rosterVisible, missingJudgeCount,
  queueStateText, queueStateClass, roundStatusText, roundStatusClass, entryStatus, entryStatusClass,
  wrongStatus, advanceHint, canGenerate, canRedraw, canClearRoster, rankClass,
  currentBusyKey, currentPercent, moveCurrent, dayBusyKey, dayCount, dutyJudgeCount, dayLabel,
  changeRoundDay, changeEntryDay, checkInBusyId, toggleEntryCheckIn, changeJudgeDay, generateNextRound, redrawRound, clearRoster,
  draggingEntryId, dragOverEntryId, startDragEntry, dragOverEntry, dropOnEntry, endDragEntry,
  moveEntry, copyRoster
} = useCompetitionRoster({ payload, settings, event, settingsWeightSum, load, toast, generatingRoundKey, busyJudgeId })

const {
  importInput, importingSingers, triggerImport, onImportFile, newSinger, addingSinger,
  addSinger, editingSinger, editSingerOpen, editSingerForm, savingSinger, openEditSinger, saveSingerEdit,
  removeSinger, detailSinger, detailScore, scoreFor, scoreTotalFor, openScoreFor,
  closeDetail, closeEditSinger
} = useCompetitionSingers({ load, toast })

const {
  emailRound, emailScope, emailSavingTemplate, emailSending, emailTesting, emailTestAddress, emailBodyRef,
  emailImageInput, emailImageUploading, emailImageDeletingId, emailImages, emailTemplate, emailStats,
  emailRoundView, emailCountWithEmail, emailCountWithoutEmail,
  emailAlreadySentCount, emailLatestRows, insertPlaceholder, insertBodyText,
  pickEmailImage, uploadEmailImage, removeEmailImage, saveEmailTemplate, sendEmailTest, sendEmails
} = useCompetitionEmail({ payload, singers, load, toast })

const {
  posterInput, posterSrc, qrPreEnabled, qrRegisterEnabled, qrSizeRatio, qrPosition, preCaption,
  regCaption, patchColor, patchMode, patches, canvasRef,
  qrPreUrl, qrRegisterUrl, composePoster, onPosterFileChange, onCanvasDown,
  onCanvasMove, onCanvasUp, undoLastPatch, clearPatches, downloadQr, downloadPoster
} = useCompetitionPoster()

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
            <div>
              <h2 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                评分维度与占比
              </h2>
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
              预报名 {{ payload.preRegistrations.length }} 人，已到现场
              {{ payload.preRegistrations.filter(item => item.registeredAt).length }} 人。
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
        v-show="activeSection !== 'settings' && activeSection !== 'singers' && activeSection !== 'email' && activeSection !== 'materials'"
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
                    : 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900'"
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
                      class="rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
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
                出场名单
              </h3>
              <p class="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                复赛/决赛名单由上一轮晋级后抽签生成，可拖动调整。
              </p>
            </div>
            <div class="flex items-center gap-2">
              <input
                v-model="rosterQuery"
                type="search"
                placeholder="搜选手名字或歌名"
                class="w-48 rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-800 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-600/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                aria-label="搜索出场名单"
              >
              <a
                href="/singer/call"
                target="_blank"
                rel="noopener noreferrer"
                class="rounded-md border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-700 transition hover:border-green-600 hover:text-green-700 dark:border-zinc-700 dark:text-zinc-200"
              >
                叫号台
              </a>
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
                    出场序（可拖动）
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
                <tr
                  v-for="(entry, index) in rosterVisible(activeRound)"
                  :key="entry.id"
                  :draggable="activeRound.status !== 'closed'"
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
                  <td class="cursor-grab px-4 py-2 font-semibold tabular-nums text-zinc-900 active:cursor-grabbing dark:text-zinc-100">
                    <span class="inline-flex items-center gap-1">
                      <UIcon
                        v-if="activeRound.status !== 'closed'"
                        name="i-lucide-grip-vertical"
                        class="size-3.5 text-zinc-300 dark:text-zinc-600"
                        aria-hidden="true"
                      />
                      {{ entry.sortOrder || index + 1 }}
                    </span>
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
              实时按平均分排序，同分按出场顺序；还没分数的排在最后。
            </p>
            <label
              v-if="settings"
              class="mt-2 flex w-fit cursor-pointer items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300"
            >
              <input
                v-model="settings.trimExtremes"
                type="checkbox"
                class="size-4 accent-emerald-600"
                :disabled="savingSettings"
                @change="saveSettings"
              >
              算平均分时去掉一个最高分和一个最低分（至少 3 位评委）
            </label>
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
                      class="rounded-md border border-zinc-200 bg-white px-1.5 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900"
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
                placeholder="【音乐协会】新声歌手大赛结果通知"
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
                <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  上传海报图 → 选择二维码与位置 → 可用「遮盖贴片」盖住海报上不需要的文字（如水印）→ 下载成品图。
                </p>
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
                      class="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-950"
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
                  <p class="text-xs leading-5 text-zinc-400">
                    贴片颜色建议用吸管取海报邻近底色，盖住后更自然。
                  </p>
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
                    {{ dimension.score }} / {{ dimensionScoreMax }}
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
