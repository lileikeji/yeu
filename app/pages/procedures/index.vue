<script setup lang="ts">
import {
  filterProcedureListItems,
  procedureListAudienceOptions,
  procedureListCardActionLabel,
  procedureListDetailQuery,
  procedureListMessages,
  procedureListQuickEntries,
  procedureListStatePresentation,
  procedureListStatusText,
  procedureMethodLabel,
  readLooseProcedureChecklistFromStorageText,
  resolveProcedureListCardProgress
} from '~~/app/utils/procedure-list-presentation'
import {
  buildProcedureChecklistStorageKey,
  studentFacingProcedureText,
  studentFacingProcedureTitle
} from '~~/app/utils/procedure-detail-presentation'
import {
  describeProcedureWindow,
  procedureWindowBadgeColor,
  procedureWindowStateLabels,
  resolveProcedureWindowBySlug,
  type ProcedureWindowBadgeColor
} from '~~/app/utils/procedure-window'

const { data, error, refresh } = await usePublicProcedureList()

useSeoMeta({
  title: '新生办事流程',
  description: '报到等事项的办理步骤、要带的材料、去哪儿办，以及现在就能准备的。'
})

const query = ref('')
const audience = ref<'all' | 'undergraduate' | 'transfer'>('all')

const procedures = computed(() => filterProcedureListItems(data.value?.items ?? [], {
  query: query.value,
  audience: audience.value
}))
const filtersActive = computed(() => Boolean(query.value.trim()) || audience.value !== 'all')
const checklistTick = ref(0)
const procedureWindowTick = useState('procedure-window-now', () => Date.now())
const hiddenProcedureWindowBadge = { label: '', color: 'neutral' as ProcedureWindowBadgeColor, visible: false }

// 办理窗口只写在 seed 里，公开接口不带这个字段；没有核实日期的流程（upcoming/unknown）不占卡片位置
function procedureWindowBadge(slug: string) {
  const seedWindow = resolveProcedureWindowBySlug(slug)
  if (!seedWindow) return hiddenProcedureWindowBadge
  const description = describeProcedureWindow(seedWindow, procedureWindowTick.value)
  if (description.state === 'upcoming' || description.state === 'unknown') return hiddenProcedureWindowBadge
  return {
    label: procedureWindowStateLabels[description.state],
    color: procedureWindowBadgeColor(description.tone),
    visible: true
  }
}

function readChecklistForItem(item: { slug: string, steps: ReadonlyArray<{ id: string }>, materials: ReadonlyArray<{ id: string }> }) {
  void checklistTick.value
  if (!import.meta.client) {
    return { stepIds: [] as string[], materialIds: [] as string[] }
  }
  try {
    const raw = window.localStorage.getItem(buildProcedureChecklistStorageKey(item.slug))
    return readLooseProcedureChecklistFromStorageText(
      raw,
      item.steps.map(step => step.id),
      item.materials.map(material => material.id)
    )
  } catch {
    return { stepIds: [] as string[], materialIds: [] as string[] }
  }
}

function cardProgressFor(item: { slug: string, steps: ReadonlyArray<{ id: string }>, materials: ReadonlyArray<{ id: string }> }) {
  return resolveProcedureListCardProgress(item, readChecklistForItem(item))
}

function selectProcedureAudience(value: typeof audience.value): void {
  audience.value = value
}

function clearProcedureFilters(): void {
  query.value = ''
  audience.value = 'all'
}

onMounted(() => {
  checklistTick.value += 1
  if (!import.meta.client) return
  window.addEventListener('storage', () => {
    checklistTick.value += 1
  })
  window.addEventListener('pageshow', () => {
    checklistTick.value += 1
  })
  window.addEventListener('focus', () => {
    checklistTick.value += 1
  })
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          按步骤办理
        </p>
        <div class="mt-2 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div class="max-w-3xl">
            <h1 class="text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
              新生办事流程
            </h1>
          </div>
          <UButton
            to="/guides"
            icon="i-lucide-notebook-tabs"
            label="先看入学指南"
            color="neutral"
            variant="outline"
            class="min-h-11 self-start md:self-auto"
          />
        </div>

        <nav
          aria-label="常找的办事入口"
          class="scrollbar-none mt-5 flex items-center gap-2 overflow-x-auto pb-1"
        >
          <span class="shrink-0 text-xs font-semibold text-zinc-500 dark:text-zinc-400">常找</span>
          <NuxtLink
            v-for="entry in procedureListQuickEntries"
            :key="entry.to"
            :to="entry.to"
            class="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200 transition-colors hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-800 dark:hover:text-green-300"
          >
            <UIcon
              :name="entry.icon"
              class="size-3.5"
            />
            {{ entry.label }}
          </NuxtLink>
        </nav>

        <div class="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <UInput
            v-model="query"
            icon="i-lucide-search"
            size="lg"
            placeholder="搜索报到、校园网、宿舍报修…"
            aria-label="搜索办事流程"
            class="min-h-11 w-full"
            :ui="{ base: 'min-h-11' }"
          />
          <div
            class="scrollbar-none flex gap-1 overflow-x-auto"
            aria-label="适用人群"
          >
            <UButton
              v-for="option in procedureListAudienceOptions"
              :key="option.value"
              :label="option.label"
              :color="audience === option.value ? 'primary' : 'neutral'"
              :variant="audience === option.value ? 'soft' : 'ghost'"
              class="min-h-11 shrink-0"
              :aria-pressed="audience === option.value"
              @click="selectProcedureAudience(option.value)"
            />
          </div>
        </div>
      </div>
    </header>

    <div class="page-shell page-section">
      <div
        v-if="error"
        class="border-y border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-5 py-10 text-center"
        role="alert"
      >
        <UIcon
          name="i-lucide-circle-alert"
          class="mx-auto size-6 text-amber-700 dark:text-amber-300"
        />
        <h2 class="mt-3 text-base font-bold text-amber-950">
          办事信息暂时没有显示出来
        </h2>
        <p class="mt-2 text-sm leading-6 text-amber-900 dark:text-amber-300">
          {{ procedureListMessages.serviceUnavailable }}
        </p>
        <div class="mt-5 flex flex-wrap justify-center gap-2">
          <UButton
            icon="i-lucide-refresh-cw"
            label="重新试一次"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="refresh()"
          />
          <UButton
            to="/guides"
            icon="i-lucide-notebook-tabs"
            label="先看入学指南"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>

      <template v-else>
        <div class="mb-4 flex items-center justify-between gap-4">
          <h2 class="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {{ procedures.length }} 件事
          </h2>
        </div>

        <div
          v-if="procedures.length"
          class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          <NuxtLink
            v-for="item in procedures"
            :key="item.id"
            :to="{
              path: `/procedures/${item.slug}`,
              query: procedureListDetailQuery(audience)
            }"
            class="surface-panel group flex min-h-0 flex-col p-4 transition hover:border-green-300 dark:hover:border-green-700 hover:shadow-sm md:min-h-64 md:p-5"
          >
            <div class="flex items-start justify-between gap-3">
              <span class="grid size-9 shrink-0 place-items-center rounded-md bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400 md:size-10">
                <UIcon
                  name="i-lucide-list-checks"
                  class="size-5"
                />
              </span>
              <div class="flex shrink-0 flex-col items-end gap-1.5">
                <UBadge
                  :color="procedureListStatePresentation(item.informationState).color"
                  variant="soft"
                  size="sm"
                >
                  <UIcon
                    :name="procedureListStatePresentation(item.informationState).icon"
                    class="mr-1 size-3.5"
                  />
                  {{ procedureListStatePresentation(item.informationState).label }}
                </UBadge>
                <UBadge
                  v-if="procedureWindowBadge(item.slug).visible"
                  :color="procedureWindowBadge(item.slug).color"
                  variant="soft"
                  size="sm"
                >
                  <UIcon
                    name="i-lucide-calendar-clock"
                    class="mr-1 size-3.5"
                  />
                  {{ procedureWindowBadge(item.slug).label }}
                </UBadge>
              </div>
            </div>
            <h2 class="mt-3 text-base font-bold text-zinc-950 dark:text-zinc-100 md:mt-5">
              {{ studentFacingProcedureTitle(item.title) }}
            </h2>
            <p class="mt-1.5 line-clamp-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300 md:mt-2 md:line-clamp-none">
              {{ studentFacingProcedureText(item.summary) }}
            </p>
            <p class="mt-2 line-clamp-1 border-l-2 border-orange-300 pl-2.5 text-xs leading-5 text-zinc-600 dark:text-zinc-300 md:mt-4 md:line-clamp-none md:pl-3">
              <span class="font-semibold text-zinc-800 dark:text-zinc-100">目前：</span>
              {{ procedureListStatusText(item.statusText) }}
            </p>
            <div class="mt-3 text-xs text-zinc-500 dark:text-zinc-400 md:mt-5 md:border-t md:border-zinc-100 dark:md:border-zinc-800 md:pt-4">
              <div class="flex items-center justify-between gap-3">
                <span class="truncate">{{ procedureMethodLabel(item.method) }}</span>
                <span class="inline-flex items-center gap-1 font-medium text-green-700 dark:text-green-400">
                  {{ procedureListCardActionLabel(item.informationState) }}
                  <UIcon
                    name="i-lucide-arrow-right"
                    class="size-4 transition group-hover:translate-x-0.5"
                  />
                </span>
              </div>
              <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 leading-5 md:mt-2">
                <span>{{ cardProgressFor(item).stepLabel }}</span>
                <span class="text-zinc-300 dark:text-zinc-600">·</span>
                <span>{{ cardProgressFor(item).materialLabel }}</span>
              </div>
              <p
                v-if="cardProgressFor(item).progressHint"
                class="mt-1 font-medium text-green-700 dark:text-green-400"
              >
                {{ cardProgressFor(item).progressHint }}
              </p>
              <p
                v-if="item.deadlineText"
                class="mt-1 line-clamp-1 leading-5 md:mt-2 md:line-clamp-2"
              >
                {{ item.deadlineText }}
              </p>
            </div>
          </NuxtLink>
        </div>

        <div
          v-else
          class="border-y border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 px-5 py-12 text-center"
          role="status"
        >
          <UIcon
            name="i-lucide-list-x"
            class="mx-auto size-6 text-zinc-400 dark:text-zinc-500"
          />
          <h2 class="mt-3 text-base font-bold text-zinc-900 dark:text-zinc-100">
            {{ filtersActive ? procedureListMessages.emptyMatch : procedureListMessages.emptyList }}
          </h2>
          <div class="mt-5 flex flex-wrap justify-center gap-2">
            <UButton
              v-if="filtersActive"
              icon="i-lucide-x"
              label="清除条件"
              color="neutral"
              variant="outline"
              class="min-h-11"
              @click="clearProcedureFilters"
            />
            <UButton
              to="/guides"
              icon="i-lucide-notebook-tabs"
              label="查看入学指南"
              color="neutral"
              variant="ghost"
              class="min-h-11"
            />
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
