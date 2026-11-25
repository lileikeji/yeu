<script setup lang="ts">
import type {
  YeucaDepartment,
  YeucaTreasureAdminOverview,
  YeucaTreasurePointAdminItem,
  YeucaTreasurePointKind,
  YeucaTreasureVerifyMode
} from '~~/shared/types/yeuca'
import { adminFetch } from '~~/app/utils/admin-request'

const props = defineProps<{
  isChief: boolean
  scopedDepartment: string
  departments: YeucaDepartment[]
}>()

const toast = useToast()

type TreasureOverviewResponse = YeucaTreasureAdminOverview & {
  meta: {
    landmarks: Array<{ name: string, region: 'new' | 'old', lng: number, lat: number }>
    characters: Array<{ value: string, label: string }>
  }
}

const loading = ref(true)
const savingConfig = ref(false)
const savingPoint = ref(false)
const subView = ref<'points' | 'stamps'>('points')
const overview = ref<TreasureOverviewResponse | null>(null)

const searchText = ref('')
const filterDept = ref('all')
const filterMode = ref('all')

const configForm = reactive({
  enabled: true,
  title: '仰恩校园实景寻宝 · 计协联合集章',
  subtitle: '',
  goalCount: 5,
  requireMember: false
})

const KIND_OPTIONS: Array<{ label: string, value: YeucaTreasurePointKind }> = [
  { label: '角色立牌', value: 'chest' },
  { label: '校园神瞳', value: 'oculus' },
  { label: '教学楼隐藏款', value: 'classroom' },
  { label: '塔菲宝箱', value: 'taffy' },
  { label: '协会终点宝箱', value: 'finish' }
]

const VERIFY_MODE_OPTIONS: Array<{ label: string, value: YeucaTreasureVerifyMode }> = [
  { label: '实地 GPS 定位 + 现场暗号', value: 'gps_answer' },
  { label: '实地 GPS 定位免密打卡', value: 'gps_only' },
  { label: '站内试玩 / 定位答题（兼容）', value: 'answer_or_trial' }
]

const KIND_LABEL: Record<string, string> = {
  chest: '角色立牌',
  oculus: '校园神瞳',
  classroom: '教学楼隐藏款',
  taffy: '塔菲宝箱',
  finish: '终点宝箱'
}

const VERIFY_LABEL: Record<string, string> = {
  gps_answer: '定位 + 暗号',
  gps_only: '定位打卡',
  answer_or_trial: '定位 / 试玩'
}

const deptSelectItems = computed(() => {
  const names = props.departments.map(d => d.name)
  const list = Array.from(new Set(['协会全体', ...names]))
  if (!props.isChief && props.scopedDepartment) {
    return [{ label: props.scopedDepartment, value: props.scopedDepartment }]
  }
  return list.map(name => ({ label: name, value: name }))
})

const availableKindItems = computed(() => {
  if (props.isChief) return KIND_OPTIONS
  return KIND_OPTIONS.filter(item => item.value !== 'finish')
})

const characterOptions = computed(() => overview.value?.meta.characters ?? [{ label: '默认图标', value: '' }])
const landmarkOptions = computed(() => overview.value?.meta.landmarks ?? [])

function getErrDesc(error: unknown): string {
  if (!error || typeof error !== 'object') return '操作失败'
  const rec = error as Record<string, unknown>
  const data = rec.data as Record<string, unknown> | undefined
  return String(data?.message || rec.statusMessage || rec.message || '操作失败')
}

async function loadTreasure(): Promise<void> {
  loading.value = true
  try {
    const res = await adminFetch<TreasureOverviewResponse>('/api/admin/yeuca/treasure')
    overview.value = res
    configForm.enabled = res.config.enabled
    configForm.title = res.config.title
    configForm.subtitle = res.config.subtitle
    configForm.goalCount = res.config.goalCount
    configForm.requireMember = res.config.requireMember
  } catch (err) {
    toast.add({ title: '加载寻宝配置失败', description: getErrDesc(err), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function saveConfig(): Promise<void> {
  if (!props.isChief) return
  savingConfig.value = true
  try {
    await adminFetch('/api/admin/yeuca/treasure/config', {
      method: 'PUT',
      body: {
        enabled: configForm.enabled,
        title: configForm.title.trim(),
        subtitle: configForm.subtitle.trim(),
        goalCount: Number(configForm.goalCount) || 5,
        requireMember: configForm.requireMember
      }
    })
    toast.add({ title: '寻宝活动总控设置已生效', color: 'success' })
    await loadTreasure()
  } catch (err) {
    toast.add({ title: '保存设置失败', description: getErrDesc(err), color: 'error' })
  } finally {
    savingConfig.value = false
  }
}

const filteredPoints = computed(() => {
  const list = overview.value?.points ?? []
  const kw = searchText.value.trim().toLowerCase()
  return list.filter((p) => {
    if (filterDept.value === 'mine' && !p.canEdit) return false
    if (filterDept.value !== 'all' && filterDept.value !== 'mine' && p.deptName !== filterDept.value) return false
    if (filterMode.value !== 'all' && p.verifyMode !== filterMode.value) return false
    if (kw) {
      const hay = `${p.name} ${p.landmark} ${p.deptName} ${p.question} ${p.clue}`.toLowerCase()
      if (!hay.includes(kw)) return false
    }
    return true
  })
})

/* ---------------- 新增 / 编辑点位弹窗 ---------------- */
const pointModalOpen = ref(false)
const editingPointId = ref<string | null>(null)
const selectedLandmarkPreset = ref('')

const pointForm = reactive({
  name: '',
  alias: '',
  kind: 'chest' as YeucaTreasurePointKind,
  deptName: '协会全体',
  landmark: '',
  room: '',
  coordType: 'wgs84' as 'wgs84' | 'gcj02',
  lngText: '118.6074209',
  latText: '25.1115621',
  radiusMeters: 20,
  verifyMode: 'gps_answer' as YeucaTreasureVerifyMode,
  clue: '',
  question: '',
  answer: '',
  characterKey: '',
  glyph: '',
  sortOrder: 300,
  isPublished: true
})

function openCreatePoint(): void {
  editingPointId.value = null
  selectedLandmarkPreset.value = ''
  pointForm.name = ''
  pointForm.alias = ''
  pointForm.kind = 'chest'
  pointForm.deptName = !props.isChief && props.scopedDepartment ? props.scopedDepartment : '协会全体'
  pointForm.landmark = ''
  pointForm.room = ''
  pointForm.coordType = 'wgs84'
  pointForm.lngText = '118.6074209'
  pointForm.latText = '25.1115621'
  pointForm.radiusMeters = 20
  pointForm.verifyMode = 'gps_answer'
  pointForm.clue = ''
  pointForm.question = ''
  pointForm.answer = ''
  pointForm.characterKey = ''
  pointForm.glyph = ''
  pointForm.sortOrder = ((overview.value?.points.length ?? 29) + 1) * 10
  pointForm.isPublished = true
  pointModalOpen.value = true
}

function openEditPoint(item: YeucaTreasurePointAdminItem): void {
  if (!item.canEdit) return
  editingPointId.value = item.id
  selectedLandmarkPreset.value = ''
  pointForm.name = item.name
  pointForm.alias = item.alias
  pointForm.kind = item.kind
  pointForm.deptName = item.deptName
  pointForm.landmark = item.landmark
  pointForm.room = item.room
  pointForm.coordType = 'wgs84'
  pointForm.lngText = String(item.lng)
  pointForm.latText = String(item.lat)
  pointForm.radiusMeters = item.radiusMeters
  pointForm.verifyMode = item.verifyMode
  pointForm.clue = item.clue
  pointForm.question = item.question
  pointForm.answer = item.answer
  pointForm.characterKey = item.characterKey
  pointForm.glyph = item.glyph
  pointForm.sortOrder = item.sortOrder
  pointForm.isPublished = item.isPublished
  pointModalOpen.value = true
}

function applyLandmarkPreset(): void {
  const target = landmarkOptions.value.find(l => l.name === selectedLandmarkPreset.value)
  if (!target) return
  pointForm.landmark = target.name
  pointForm.coordType = 'wgs84'
  pointForm.lngText = String(target.lng)
  pointForm.latText = String(target.lat)
}

function handleCoordPaste(event: ClipboardEvent): void {
  const raw = event.clipboardData?.getData('text') || ''
  const parts = raw.trim().split(/[\s,，]+/)
  if (parts.length >= 2) {
    const a = Number(parts[0])
    const b = Number(parts[1])
    if (Number.isFinite(a) && Number.isFinite(b) && a > 100 && b > 10 && b < 60) {
      event.preventDefault()
      pointForm.lngText = String(a)
      pointForm.latText = String(b)
    }
  }
}

async function submitPoint(): Promise<void> {
  const lng = Number(pointForm.lngText.trim())
  const lat = Number(pointForm.latText.trim())
  if (!pointForm.name.trim() || !pointForm.landmark.trim() || !pointForm.clue.trim()) {
    toast.add({ title: '请填写点位名称、地标名和寻宝线索', color: 'warning' })
    return
  }
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    toast.add({ title: '请输入有效的数字经纬度坐标', color: 'warning' })
    return
  }
  if (pointForm.verifyMode !== 'gps_only' && !pointForm.question.trim()) {
    toast.add({ title: '需要输入题目或暗号说明', color: 'warning' })
    return
  }
  if (!editingPointId.value && pointForm.verifyMode !== 'gps_only' && !pointForm.answer.trim()) {
    toast.add({ title: '请设置标准答案或现场暗号', color: 'warning' })
    return
  }

  savingPoint.value = true
  try {
    const body = {
      name: pointForm.name.trim(),
      alias: pointForm.alias.trim(),
      kind: pointForm.kind,
      deptName: pointForm.deptName.trim() || '协会全体',
      landmark: pointForm.landmark.trim(),
      room: pointForm.room.trim(),
      coordType: pointForm.coordType,
      lng,
      lat,
      radiusMeters: Number(pointForm.radiusMeters) || 20,
      verifyMode: pointForm.verifyMode,
      clue: pointForm.clue.trim(),
      question: pointForm.question.trim(),
      answer: pointForm.answer.trim(),
      characterKey: pointForm.characterKey,
      glyph: pointForm.glyph.trim(),
      sortOrder: Number(pointForm.sortOrder) || 100,
      isPublished: pointForm.isPublished
    }
    if (editingPointId.value) {
      await adminFetch(`/api/admin/yeuca/treasure/points/${editingPointId.value}`, { method: 'PUT', body })
      toast.add({ title: `已更新点位「${body.name}」并实时同步寻宝图`, color: 'success' })
    } else {
      await adminFetch('/api/admin/yeuca/treasure/points', { method: 'POST', body })
      toast.add({ title: `已新增点位「${body.name}」并同步上线`, color: 'success' })
    }
    pointModalOpen.value = false
    await loadTreasure()
  } catch (err) {
    toast.add({ title: '保存寻宝点位失败', description: getErrDesc(err), color: 'error' })
  } finally {
    savingPoint.value = false
  }
}

async function togglePointPublished(item: YeucaTreasurePointAdminItem): Promise<void> {
  if (!item.canEdit) return
  try {
    await adminFetch(`/api/admin/yeuca/treasure/points/${item.id}`, {
      method: 'PUT',
      body: {
        name: item.name,
        alias: item.alias,
        kind: item.kind,
        deptName: item.deptName,
        landmark: item.landmark,
        room: item.room,
        coordType: 'wgs84',
        lng: item.lng,
        lat: item.lat,
        radiusMeters: item.radiusMeters,
        verifyMode: item.verifyMode,
        clue: item.clue,
        question: item.question,
        answer: item.answer,
        characterKey: item.characterKey,
        glyph: item.glyph,
        sortOrder: item.sortOrder,
        isPublished: !item.isPublished
      }
    })
    toast.add({ title: !item.isPublished ? `点位「${item.name}」已上线` : `点位「${item.name}」已隐藏`, color: 'success' })
    await loadTreasure()
  } catch (err) {
    toast.add({ title: '切换状态失败', description: getErrDesc(err), color: 'error' })
  }
}

async function removePoint(item: YeucaTreasurePointAdminItem): Promise<void> {
  if (!item.canEdit) return
  if (!window.confirm(`确认删除寻宝点位「${item.name}」？已关联的集章记录也将一并清除。`)) return
  try {
    await adminFetch(`/api/admin/yeuca/treasure/points/${item.id}`, { method: 'DELETE' })
    toast.add({ title: '已删除点位', color: 'success' })
    await loadTreasure()
  } catch (err) {
    toast.add({ title: '删除点位失败', description: getErrDesc(err), color: 'error' })
  }
}

function formatTime(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ')
}

onMounted(() => {
  void loadTreasure()
})
</script>

<template>
  <div class="space-y-4">
    <!-- 全局控制卡与地图联动入口 -->
    <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <div class="flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            <UIcon
              name="i-lucide-map-pin"
              class="size-4 text-zinc-500 dark:text-zinc-400"
            />
            <span>校园寻宝点位</span>
            <UBadge
              :label="isChief ? '全部门' : `${scopedDepartment} · 部长分管`"
              color="neutral"
              variant="outline"
              size="xs"
            />
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <UButton
            to="https://yeuca.huiliyill.cn/activities/treasure"
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-external-link"
            label="打开寻宝地图"
          />
          <UButton
            to="https://yeuca.huiliyill.cn/activities/treasure?pick=1"
            target="_blank"
            rel="noopener noreferrer"
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-crosshair"
            label="地图拾取坐标"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            label="刷新"
            :loading="loading"
            @click="loadTreasure"
          />
        </div>
      </div>

      <!-- 总管可修改全局开关 -->
      <div class="grid gap-3 border-t border-zinc-100 dark:border-zinc-800 pt-3 md:grid-cols-2 lg:grid-cols-4">
        <UFormField label="活动主标题">
          <UInput
            v-model="configForm.title"
            :disabled="!isChief"
            size="sm"
            class="w-full"
          />
        </UFormField>
        <UFormField label="引导副文案">
          <UInput
            v-model="configForm.subtitle"
            :disabled="!isChief"
            size="sm"
            class="w-full"
          />
        </UFormField>
        <UFormField label="终点解锁印章数">
          <UInput
            v-model.number="configForm.goalCount"
            type="number"
            min="1"
            max="30"
            :disabled="!isChief"
            size="sm"
            class="w-full"
          />
        </UFormField>
        <div class="flex flex-col justify-end gap-2">
          <div class="flex flex-wrap items-center gap-4 text-xs">
            <label class="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                v-model="configForm.enabled"
                type="checkbox"
                :disabled="!isChief"
                class="rounded border-zinc-300"
              >
              <span class="font-medium text-zinc-800 dark:text-zinc-200">开放寻宝</span>
            </label>
            <label class="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                v-model="configForm.requireMember"
                type="checkbox"
                :disabled="!isChief"
                class="rounded border-zinc-300"
              >
              <span class="font-medium text-zinc-800 dark:text-zinc-200">仅计协会员可集章</span>
            </label>
          </div>
          <UButton
            v-if="isChief"
            size="xs"
            icon="i-lucide-save"
            label="保存总控设置"
            class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white w-fit"
            :loading="savingConfig"
            @click="saveConfig"
          />
        </div>
      </div>
    </div>

    <!-- 4 格统计摘要 -->
    <div
      v-if="overview"
      class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-3.5">
        <p class="text-xs text-zinc-500">
          {{ isChief ? '全校点位（已上线 / 总计）' : '本部门负责点位' }}
        </p>
        <p class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
          {{ overview.stats.publishedPoints }}
          <span class="text-xs font-normal text-zinc-500">/ {{ overview.stats.totalPoints }} 处</span>
        </p>
      </div>
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-3.5">
        <p class="text-xs text-zinc-500">
          正式集章人次
        </p>
        <p class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
          {{ overview.stats.totalStamps }}
        </p>
      </div>
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-3.5">
        <p class="text-xs text-zinc-500">
          参与记录账号
        </p>
        <p class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
          {{ overview.stats.participantCount }}
        </p>
      </div>
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-3.5">
        <p class="text-xs text-zinc-500">
          终点领奖完成
        </p>
        <p class="mt-1 text-xl font-bold text-zinc-950 dark:text-zinc-100">
          {{ overview.stats.finishCount }}
        </p>
      </div>
    </div>

    <!-- 视图切换 -->
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-2.5">
      <div class="flex flex-wrap gap-1.5">
        <UButton
          size="xs"
          color="neutral"
          :variant="subView === 'points' ? 'solid' : 'ghost'"
          :label="`点位与题库 (${overview?.points.length ?? 0})`"
          @click="subView = 'points'"
        />
        <UButton
          size="xs"
          color="neutral"
          :variant="subView === 'stamps' ? 'solid' : 'ghost'"
          :label="`集章排行与流水 (${overview?.recentStamps.length ?? 0})`"
          @click="subView = 'stamps'"
        />
      </div>

      <UButton
        v-if="subView === 'points'"
        size="sm"
        icon="i-lucide-plus"
        :label="isChief ? '新增寻宝点' : `新增 ${scopedDepartment} 点位`"
        class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
        @click="openCreatePoint"
      />
    </div>

    <!-- 视图 1：点位与题库管理 -->
    <div
      v-if="subView === 'points'"
      class="space-y-3"
    >
      <div class="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-3">
        <UInput
          v-model="searchText"
          icon="i-lucide-search"
          placeholder="搜点位名称、地标或题目…"
          size="sm"
          class="w-60"
        />
        <select
          v-model="filterDept"
          class="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-xs text-zinc-700 dark:text-zinc-200"
        >
          <option value="all">
            全部展示 ({{ overview?.points.length ?? 0 }})
          </option>
          <option
            v-if="!isChief"
            value="mine"
          >
            仅看 {{ scopedDepartment }} 可编辑
          </option>
          <template v-if="isChief">
            <option
              v-for="item in deptSelectItems"
              :key="item.value"
              :value="item.value"
            >
              {{ item.label }}
            </option>
          </template>
        </select>
        <select
          v-model="filterMode"
          class="h-8 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-xs text-zinc-700 dark:text-zinc-200"
        >
          <option value="all">
            全部验证模式
          </option>
          <option value="gps_answer">
            定位 + 暗号
          </option>
          <option value="gps_only">
            定位免密打卡
          </option>
          <option value="answer_or_trial">
            定位 / 试玩答题
          </option>
        </select>
      </div>

      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 overflow-hidden">
        <div
          v-if="!filteredPoints.length"
          class="p-10 text-center text-sm text-zinc-500"
        >
          没有匹配的寻宝点位
        </div>

        <div
          v-else
          class="overflow-x-auto"
        >
          <table class="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
            <thead class="bg-zinc-50 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400">
              <tr>
                <th class="px-4 py-2.5 text-left font-medium">
                  点位名称 · 地标
                </th>
                <th class="px-4 py-2.5 text-left font-medium">
                  类别 · 模式 · 归属
                </th>
                <th class="px-4 py-2.5 text-left font-medium">
                  WGS84 坐标 · 半径
                </th>
                <th class="px-4 py-2.5 text-left font-medium">
                  题目与暗号
                </th>
                <th class="px-4 py-2.5 text-left font-medium">
                  状态 · 集章
                </th>
                <th class="px-4 py-2.5 text-right font-medium">
                  管理操作
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800/80">
              <tr
                v-for="pt in filteredPoints"
                :key="pt.id"
                class="hover:bg-zinc-50/70 dark:hover:bg-zinc-800/30"
              >
                <td class="px-4 py-3 align-top">
                  <div class="font-semibold text-zinc-950 dark:text-zinc-100">
                    {{ pt.name }}
                  </div>
                  <div class="text-[11px] text-zinc-500">
                    {{ pt.region === 'new' ? '新区' : '旧区' }} · {{ pt.landmark }}{{ pt.room ? ` (${pt.room})` : '' }}
                  </div>
                </td>
                <td class="px-4 py-3 align-top">
                  <div class="flex flex-wrap gap-1">
                    <UBadge
                      :label="KIND_LABEL[pt.kind] || pt.kind"
                      color="neutral"
                      variant="subtle"
                      size="xs"
                    />
                    <UBadge
                      :label="VERIFY_LABEL[pt.verifyMode] || pt.verifyMode"
                      color="neutral"
                      variant="outline"
                      size="xs"
                    />
                  </div>
                  <div class="mt-1 text-[11px] text-zinc-500">
                    负责：{{ pt.deptName }}
                  </div>
                </td>
                <td class="px-4 py-3 align-top whitespace-nowrap font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
                  <div>{{ pt.lng.toFixed(6) }}, {{ pt.lat.toFixed(6) }}</div>
                  <div class="mt-0.5 text-zinc-400">
                    半径 {{ pt.radiusMeters }} 米 ·
                    <a
                      :href="`https://yeuca.huiliyill.cn/activities/treasure?point=${encodeURIComponent(pt.id)}`"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="underline hover:text-zinc-900 dark:hover:text-white"
                    >看位置</a>
                  </div>
                </td>
                <td class="px-4 py-3 align-top max-w-[260px]">
                  <p
                    class="truncate text-zinc-800 dark:text-zinc-200"
                    :title="pt.question || pt.clue"
                  >
                    {{ pt.question || pt.clue }}
                  </p>
                  <p class="mt-0.5 text-[11px] text-zinc-500">
                    暗号：<span class="font-mono">{{ pt.canEdit ? (pt.verifyMode === 'gps_only' ? '免密打卡' : (pt.answer || '未设置')) : '••••（非本部门保密）' }}</span>
                  </p>
                </td>
                <td class="px-4 py-3 align-top whitespace-nowrap">
                  <div class="flex items-center gap-1.5">
                    <UBadge
                      :label="pt.isPublished ? '已上线' : '已隐藏'"
                      color="neutral"
                      :variant="pt.isPublished ? 'soft' : 'outline'"
                      size="xs"
                    />
                    <span class="text-zinc-500">{{ pt.stampCount }} 人</span>
                  </div>
                </td>
                <td class="px-4 py-3 align-top text-right whitespace-nowrap">
                  <div
                    v-if="pt.canEdit"
                    class="inline-flex gap-1"
                  >
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      label="编辑"
                      @click="openEditPoint(pt)"
                    />
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="neutral"
                      :label="pt.isPublished ? '隐藏' : '上线'"
                      @click="togglePointPublished(pt)"
                    />
                    <UButton
                      v-if="pt.kind !== 'finish' || isChief"
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-trash-2"
                      aria-label="删除点位"
                      @click="removePoint(pt)"
                    />
                  </div>
                  <span
                    v-else
                    class="text-[11px] text-zinc-400"
                  >只读</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 视图 2：玩家集章排行与打卡流水 -->
    <div
      v-else
      class="grid gap-4 lg:grid-cols-2"
    >
      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            参与玩家集章进展榜
          </h3>
          <span class="text-xs text-zinc-500">Top {{ overview?.leaderboard.length ?? 0 }}</span>
        </div>
        <div
          v-if="!overview?.leaderboard.length"
          class="py-8 text-center text-xs text-zinc-500"
        >
          暂无集章记录
        </div>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table class="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-xs">
            <thead class="text-zinc-500">
              <tr>
                <th class="py-2 pr-2 text-left font-medium">
                  参与者
                </th>
                <th class="py-2 pr-2 text-left font-medium">
                  印章数
                </th>
                <th class="py-2 pr-2 text-left font-medium">
                  终点状态
                </th>
                <th class="py-2 text-right font-medium">
                  最近打卡
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-zinc-100 dark:divide-zinc-800">
              <tr
                v-for="row in overview.leaderboard"
                :key="`${row.actorType}:${row.actorId}`"
              >
                <td class="py-2 pr-2">
                  <div class="font-medium text-zinc-900 dark:text-zinc-100">
                    {{ row.actorLabel }}
                  </div>
                  <div class="text-[11px] text-zinc-500">
                    {{ row.actorType === 'yeuca_member' ? '计协会员' : '迎新网账号' }}
                  </div>
                </td>
                <td class="py-2 pr-2 font-mono font-bold text-zinc-950 dark:text-zinc-100">
                  {{ row.stampCount }}
                </td>
                <td class="py-2 pr-2">
                  <UBadge
                    :label="row.finishCollected ? '已通关终点' : (row.stampCount >= configForm.goalCount ? '已达标' : '探索中')"
                    color="neutral"
                    :variant="row.finishCollected ? 'solid' : 'outline'"
                    size="xs"
                  />
                </td>
                <td class="py-2 text-right font-mono text-[11px] text-zinc-500">
                  {{ formatTime(row.lastCollectedAt) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 space-y-3">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            最新核验集章流水
          </h3>
          <span class="text-xs text-zinc-500">最近 80 条</span>
        </div>
        <div
          v-if="!overview?.recentStamps.length"
          class="py-8 text-center text-xs text-zinc-500"
        >
          暂无打卡记录。
        </div>
        <ul
          v-else
          class="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs max-h-96 overflow-y-auto"
        >
          <li
            v-for="item in overview.recentStamps"
            :key="item.id"
            class="py-2 flex items-center justify-between gap-2"
          >
            <div class="min-w-0">
              <div class="font-medium text-zinc-900 dark:text-zinc-100 truncate">
                {{ item.actorLabel }} · {{ item.pointName }}
              </div>
              <div class="text-[11px] text-zinc-500">
                {{ item.deptName }} · {{ VERIFY_LABEL[item.verifyMode] || item.verifyMode }}
                <span v-if="item.distanceMeters !== null"> · 距中心 {{ item.distanceMeters }} m</span>
              </div>
            </div>
            <span class="shrink-0 font-mono text-[11px] text-zinc-400">
              {{ formatTime(item.collectedAt) }}
            </span>
          </li>
        </ul>
      </div>
    </div>

    <!-- 新增 / 编辑寻宝点位弹窗 -->
    <UModal
      v-model:open="pointModalOpen"
      :title="editingPointId ? '编辑寻宝点位与题库' : '新增寻宝点位'"
      :ui="{ content: 'max-w-3xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField
              label="点位名称"
              required
            >
              <UInput
                v-model="pointForm.name"
                placeholder="如：图信 AI 实验室打卡点"
                class="w-full"
              />
            </UFormField>
            <UFormField label="负责部门">
              <select
                v-model="pointForm.deptName"
                :disabled="!isChief"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
              >
                <option
                  v-for="opt in deptSelectItems"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </UFormField>
            <UFormField label="点位分类">
              <select
                v-model="pointForm.kind"
                :disabled="!isChief && pointForm.kind === 'finish'"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
              >
                <option
                  v-for="opt in availableKindItems"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </UFormField>
          </div>

          <div class="grid gap-3 sm:grid-cols-3">
            <UFormField
              label="对应地标建筑"
              required
            >
              <UInput
                v-model="pointForm.landmark"
                placeholder="如：泽钏教学楼 / 彩虹桥"
                class="w-full"
              />
            </UFormField>
            <UFormField label="室内/补充位置（选填）">
              <UInput
                v-model="pointForm.room"
                placeholder="如：一楼大厅 / 西桥头"
                class="w-full"
              />
            </UFormField>
            <UFormField label="立牌/图标样式">
              <select
                v-model="pointForm.characterKey"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
              >
                <option
                  v-for="ch in characterOptions"
                  :key="ch.value"
                  :value="ch.value"
                >
                  {{ ch.label }}
                </option>
              </select>
            </UFormField>
          </div>

          <!-- 校内地标一键代入 + 坐标纠偏输入 -->
          <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-3 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                地理坐标（可粘贴 <code>经度, 纬度</code>）
              </span>
              <div class="flex items-center gap-1.5">
                <select
                  v-model="selectedLandmarkPreset"
                  class="h-7 rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2 text-xs"
                  @change="applyLandmarkPreset"
                >
                  <option value="">
                    校内建筑参考坐标速填…
                  </option>
                  <option
                    v-for="lm in landmarkOptions"
                    :key="lm.name"
                    :value="lm.name"
                  >
                    {{ lm.name }}（{{ lm.region === 'new' ? '新区' : '旧区' }}）
                  </option>
                </select>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-4">
              <UFormField label="坐标系">
                <select
                  v-model="pointForm.coordType"
                  class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2 text-xs"
                >
                  <option value="wgs84">
                    WGS84（地图默认）
                  </option>
                  <option value="gcj02">
                    GCJ-02（高德坐标自动转）
                  </option>
                </select>
              </UFormField>
              <UFormField
                label="经度 (Lng)"
                required
              >
                <UInput
                  v-model="pointForm.lngText"
                  placeholder="118.6074209"
                  class="w-full font-mono text-xs"
                  @paste="handleCoordPaste"
                />
              </UFormField>
              <UFormField
                label="纬度 (Lat)"
                required
              >
                <UInput
                  v-model="pointForm.latText"
                  placeholder="25.1115621"
                  class="w-full font-mono text-xs"
                />
              </UFormField>
              <UFormField label="触发半径 (米)">
                <UInput
                  v-model.number="pointForm.radiusMeters"
                  type="number"
                  min="5"
                  max="500"
                  class="w-full font-mono text-xs"
                />
              </UFormField>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="打卡校验模式">
              <select
                v-model="pointForm.verifyMode"
                class="h-9 w-full rounded-md border border-zinc-200 dark:border-zinc-700 bg-[var(--surface)] dark:bg-zinc-950 px-2.5 text-sm"
              >
                <option
                  v-for="opt in VERIFY_MODE_OPTIONS"
                  :key="opt.value"
                  :value="opt.value"
                >
                  {{ opt.label }}
                </option>
              </select>
            </UFormField>
            <UFormField label="排序权重 & 发布状态">
              <div class="flex items-center gap-3 h-9">
                <UInput
                  v-model.number="pointForm.sortOrder"
                  type="number"
                  class="w-24 font-mono"
                />
                <label class="inline-flex items-center gap-1.5 text-xs cursor-pointer">
                  <input
                    v-model="pointForm.isPublished"
                    type="checkbox"
                    class="rounded border-zinc-300"
                  >
                  <span>上线展示</span>
                </label>
              </div>
            </UFormField>
          </div>

          <UFormField
            label="寻宝引导线索（地图未解开时展示）"
            required
          >
            <UTextarea
              v-model="pointForm.clue"
              :rows="2"
              placeholder="如：前往泽钏楼一楼大厅计协签到处寻找二维码立牌…"
              class="w-full"
            />
          </UFormField>

          <div
            v-if="pointForm.verifyMode !== 'gps_only'"
            class="grid gap-3 sm:grid-cols-2"
          >
            <UFormField
              label="现场题目 / 暗号提问"
              required
            >
              <UInput
                v-model="pointForm.question"
                placeholder="如：立牌右下角写着哪两个字？"
                class="w-full"
              />
            </UFormField>
            <UFormField
              :label="editingPointId ? '标准暗号 / 答案（仅服务端比对，留空沿用原答案）' : '标准暗号 / 答案（仅服务端比对）'"
              :required="!editingPointId"
            >
              <UInput
                v-model="pointForm.answer"
                placeholder="不区分大小写与全半角"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="取消"
            @click="pointModalOpen = false"
          />
          <UButton
            :label="editingPointId ? '保存修改' : '确认添加并上线'"
            class="!bg-[#a8121e] hover:!bg-[#7f0d16] !text-white"
            :loading="savingPoint"
            @click="submitPoint"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
