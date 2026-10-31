<script setup lang="ts">
import { campusMapReferencePlaces } from '~~/data/seeds/preview-places'
import { amapImportedAreas } from '~~/data/seeds/amap-imported-areas'
import { amapImportedPlaces } from '~~/data/seeds/amap-imported-places'
import { freshmanGuides, officialDepartments } from '~~/data/seeds/public-content'
import { mergeAmapImportedPlacesWithDrafts, mergePublicMapPlaces } from '~~/app/utils/public-catalog'
import type { PublicSearchResultType } from '~~/shared/constants/server'
import type {
  ApiAssistantResponse,
  ApiAssistantStage,
  ApiAssistantTraceStep,
  ApiSearchResponse
} from '~~/shared/types/server'
import { buildStudentRuleSearchResults } from '~~/app/utils/student-rules-search'
import { isAssistantAnswerableQuery } from '~~/shared/utils/assistant-query'
import { getOrCreateAssistantSessionId } from '~~/app/utils/assistant-session'
import { parseAssistantFoodAnswer, parseAssistantShopDetail } from '~~/app/utils/assistant-answer-cards'
import {
  buildPublicSearchResults,
  buildSearchAnnouncement,
  buildSearchErrorMessage,
  groupPublicSearchResults,
  isSearchNeedShortcutActive,
  mergePublicSearchApiResponses,
  popularSearchSuggestions,
  publicSearchApiQueries,
  resolveSearchInputSyncFromRoute,
  resolveSearchNavigationStaleCorrection,
  routeQueryString,
  routeSearchType,
  searchListMessages,
  searchAlternativeSuggestions,
  searchNeedShortcuts,
  searchResultActionLabel,
  searchResultCountLabel,
  searchRouteQuery,
  searchStartingPoints,
  shouldSkipSearchNavigation,
  searchTypeOptions
} from '~~/app/utils/public-search-presentation'

useSeoMeta({
  title: '校园搜索',
  description: '按地点、办事和校园信息搜索迎新指南。',
  robots: 'noindex, follow'
})

const { data: amapOwnerDraftResponse } = await usePublicAmapOwnerDraftPlaces()
const geoCipherKey = __GEO_CIPHER_KEY__
const ownerMapSeeds = computed(() => mergeAmapImportedPlacesWithDrafts(
  amapImportedPlaces,
  amapOwnerDraftResponse.value?.items,
  geoCipherKey
))
const staticMapPlaces = computed(() => mergePublicMapPlaces(campusMapReferencePlaces, [], ownerMapSeeds.value, geoCipherKey))
const staticMapAreas = amapImportedAreas

const route = useRoute()
const router = useRouter()

const activeQuery = computed(() => routeQueryString(route.query.q).trim())
const activeType = computed(() => routeSearchType(route.query.type))
type SearchMode = 'site' | 'ai'
const activeSearchMode = computed<SearchMode>(() => route.query.mode === 'site' ? 'site' : 'ai')
const searchInput = ref(activeQuery.value)
let searchNavigationSequence = 0
let latestSubmittedQuery = activeQuery.value
let latestSubmittedType = activeType.value
let previousAssistantQuery = ''
let pendingSearchNavigations = 0
const requestFetch = useRequestFetch()
const listMessages = searchListMessages
const needShortcuts = searchNeedShortcuts
const isNeedShortcutActive = isSearchNeedShortcutActive
const resultCountLabel = searchResultCountLabel
const alternativeSuggestions = computed(() => searchAlternativeSuggestions(activeQuery.value))

async function sanitizeServerSearchPayload(
  searchResponse: ApiSearchResponse
): Promise<ApiSearchResponse> {
  if (import.meta.client) return searchResponse
  const { sanitizePublicSearchResponse } = await import('~/utils/public-api-presentation')
  return sanitizePublicSearchResponse(searchResponse)
}

const {
  data: response,
  error: responseError,
  status: searchStatus,
  refresh: refreshSearch
} = await useAsyncData<ApiSearchResponse>(
  'public-search',
  async () => {
    if (!activeQuery.value) {
      return {
        query: '',
        type: activeType.value ?? null,
        items: [],
        total: 0,
        hasManagedContent: false,
        managedKinds: []
      }
    }

    const queries = publicSearchApiQueries(activeQuery.value)
    const primary = await requestFetch<ApiSearchResponse>('/api/public/search', {
      query: {
        q: queries[0],
        type: activeType.value,
        limit: 50
      }
    })
    const expanded = await Promise.all(queries.slice(1).map(async (query) => {
      try {
        return await requestFetch<ApiSearchResponse>('/api/public/search', {
          query: {
            q: query,
            type: activeType.value,
            limit: 50
          }
        })
      } catch {
        return null
      }
    }))
    return sanitizeServerSearchPayload(mergePublicSearchApiResponses(
      activeQuery.value,
      activeType.value,
      [primary, ...expanded.filter((item): item is ApiSearchResponse => Boolean(item))]
    ))
  },
  { watch: [activeQuery, activeType], dedupe: 'cancel' }
)
const currentResponse = computed(() => (
  response.value?.query.trim() === activeQuery.value
  && response.value.type === (activeType.value ?? null)
    ? response.value
    : null
))
const searching = computed(() => searchStatus.value === 'pending')
const searchError = computed(() => buildSearchErrorMessage(
  Boolean(responseError.value),
  activeType.value
))

async function navigateSearch(query: string, type?: PublicSearchResultType): Promise<void> {
  const navigationId = ++searchNavigationSequence
  latestSubmittedQuery = query
  latestSubmittedType = type
  if (shouldSkipSearchNavigation({
    routeQuery: route.query.q,
    routeType: route.query.type,
    query,
    type
  })) {
    return
  }
  pendingSearchNavigations += 1
  try {
    await router.replace({
      query: {
        ...searchRouteQuery(query, type),
        mode: activeSearchMode.value
      }
    })
  } finally {
    pendingSearchNavigations -= 1
  }

  const correction = resolveSearchNavigationStaleCorrection({
    navigationId,
    searchNavigationSequence,
    routeQuery: route.query.q,
    routeType: route.query.type,
    latestSubmittedQuery,
    latestSubmittedType
  })
  if (correction?.shouldCorrect) {
    await router.replace({
      query: {
        ...searchRouteQuery(correction.query, correction.type),
        mode: activeSearchMode.value
      }
    })
  }
}

async function switchSearchMode(mode: SearchMode): Promise<void> {
  if (mode === activeSearchMode.value) return
  await router.replace({
    query: {
      ...searchRouteQuery(activeQuery.value, mode === 'ai' ? undefined : activeType.value),
      mode
    }
  })
}

async function submitSearch(): Promise<void> {
  await navigateSearch(searchInput.value.trim(), activeType.value)
}

function updateSearchType(value: string): void {
  const type = value === 'all' ? undefined : routeSearchType(value)
  void navigateSearch(activeQuery.value, type)
}

const selectedType = computed({
  get: () => activeType.value ?? 'all',
  set: updateSearchType
})

function clearSearch(): void {
  searchInput.value = ''
  void submitSearch()
}

function retrySearch(): void {
  void refreshSearch()
}

function startSuggestedSearch(query: string): void {
  searchInput.value = query
  void navigateSearch(query)
}

function selectSearchNeed(query: string): void {
  if (isNeedShortcutActive({ query }, activeQuery.value)) {
    searchInput.value = ''
    void navigateSearch('')
    return
  }
  searchInput.value = query
  void navigateSearch(query)
}

const results = computed(() => {
  if (!activeQuery.value) return []

  const publicResults = buildPublicSearchResults({
    query: activeQuery.value,
    activeType: activeType.value,
    apiResponse: currentResponse.value,
    hasSearchError: Boolean(searchError.value),
    mapPlaces: staticMapPlaces.value,
    mapAreas: staticMapAreas,
    guides: freshmanGuides,
    departments: officialDepartments
  })
  const ruleResults = buildStudentRuleSearchResults(activeQuery.value, activeType.value)
  return [...ruleResults, ...publicResults]
})

const groupedResults = computed(() => groupPublicSearchResults(results.value, activeQuery.value))
const hasPlaceResults = computed(() => results.value.some(result => result.resultType === 'place'))
const assistantResponse = ref<ApiAssistantResponse | null>(null)
// 流式正文草稿：美食推荐 LLM 通道通过 content_delta 事件逐段送达，completed 事件
// 到达后用完整 answer 接管渲染（草稿清空，避免重复）。
const assistantDraftAnswer = ref('')
// 结构化答案卡片：美食榜单 → 商家卡；单店详情 → 评价卡。解析失败一律回退纯文本。
const assistantFoodCards = computed(() => assistantResponse.value
  ? parseAssistantFoodAnswer(assistantResponse.value.answer)
  : null)
const assistantShopCards = computed(() => assistantResponse.value
  ? parseAssistantShopDetail(assistantResponse.value.answer)
  : null)
interface AssistantDisplayStep extends Omit<ApiAssistantTraceStep, 'status'> {
  status: 'running' | 'completed' | 'failed'
  startedAt?: string
}

const hasInitialAssistantQuery = activeSearchMode.value === 'ai'
  && !activeType.value
  && activeQuery.value.length >= 2
// Start the visible trace as soon as a question is present. The answer stream
// still starts on the client, but the user never waits behind the site-search
// request before seeing the first analysis step.
const assistantStatus = ref<'idle' | 'pending' | 'success' | 'error'>(
  hasInitialAssistantQuery ? 'pending' : 'idle'
)
const assistantLiveTrace = ref<AssistantDisplayStep[]>(hasInitialAssistantQuery
  ? [{
      stage: 'query_analysis',
      label: '分析问题',
      durationMs: 0,
      status: 'running'
    }]
  : [])
const assistantClock = ref(Date.now())
let assistantRequestSequence = 0
let assistantAbortController: AbortController | null = null
let assistantClockTimer: ReturnType<typeof setInterval> | null = null

const assistantDisplayTrace = computed<AssistantDisplayStep[]>(() => {
  if (assistantStatus.value === 'pending') return assistantLiveTrace.value
  return (assistantResponse.value?.trace ?? []).map(step => ({ ...step }))
})

function assistantDurationMs(step: AssistantDisplayStep): number {
  if (step.status !== 'running' || !step.startedAt) return step.durationMs
  const startedAt = Date.parse(step.startedAt)
  if (!Number.isFinite(startedAt)) return step.durationMs
  return Math.max(0, assistantClock.value - startedAt)
}

function formatAssistantDuration(durationMs: number): string {
  if (durationMs < 100) return '<0.1 秒'
  if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(1)} 秒`
  return `${Math.round(durationMs / 1000)} 秒`
}

function formatAssistantStepDuration(step: AssistantDisplayStep): string {
  const durationMs = assistantDurationMs(step)
  if (step.status !== 'running' && durationMs < 100) return '已完成'
  return formatAssistantDuration(durationMs)
}

function assistantModeLabel(response: ApiAssistantResponse): string {
  const labels: Record<string, string> = {
    feature_api: '系统 API',
    local_database: '内置数据库',
    answer_cache: '答案缓存',
    web_cache: '网页资料缓存',
    web_search: 'AI + 网页检索'
  }
  return labels[response.retrievalPath ?? '']
    ?? (response.mode === 'local' ? '本站资料' : response.usedWebSearch ? 'AI + 网页检索' : 'AI 整理')
}

interface AssistantAnswerSegment {
  text: string
  locate: boolean
  shopName: string
}

/**
 * Split the assistant answer into text segments and 〔地图定位〕 markers.
 * Each marker becomes an inline link to /map?q=<shop name> which locates the
 * merchant on the campus map.
 */
/**
 * Clean a merchant name for map search: strip parenthetical suffixes and
 * region tags so AMap PlaceSearch matches the core name. e.g.
 * "串烧烤肉(仰恩大学新区店)" -> "串烧烤肉"; "[学生街] 芭比Q(仰恩大学店)" -> "芭比Q".
 */
function locateSearchTerm(shopName: string): string {
  const stripped = shopName
    .replace(/^\[[^\]]+\]\s*/u, '')
    .replace(/\s*[（(][^）)]*[）)]\s*$/u, '')
    .trim()
  return stripped || shopName
}

function splitAssistantAnswer(answer: string): AssistantAnswerSegment[] {
  const segments: AssistantAnswerSegment[] = []
  const parts = answer.split('〔地图定位〕')
  // Intro paragraphs ("根据…选择如下：") end with a colon too; require a
  // numbered list item ("1. 店名：…") or a bare shop name line that does not
  // start with intro phrasing, so the opening paragraph never gets a locate
  // link pointing at the whole answer.
  const INTRO_PREFIX = /^(?:根据|按|以下是|为你整理|结合|校园内|附近|学生街)/u
  for (let i = 0; i < parts.length; i += 1) {
    const text = parts[i]!
    if (text) {
      // Recover the shop name from the segment start.
      // Prefer "1. [区域] 店名："; fall back to "店名：" when not intro-ish.
      const numbered = text.match(/^\s*\d+\.\s*(?:\[[^\]]+\]\s*)?([^：:]+?)(?:：|:)/u)
      const bare = !numbered && !INTRO_PREFIX.test(text.trim())
        ? text.match(/^([^：:]{1,24}?)(?:：|:)/u)
        : null
      const shopName = (numbered?.[1] ?? bare?.[1] ?? '').trim()
      segments.push({
        text,
        locate: false,
        shopName
      })
    }
    if (i < parts.length - 1) {
      // The shop name for the marker belongs to the current segment.
      const prev = segments[segments.length - 1]
      segments.push({
        text: '',
        locate: true,
        shopName: prev?.shopName ?? ''
      })
    }
  }
  return segments
}

function startAssistantClock(): void {
  if (assistantClockTimer) clearInterval(assistantClockTimer)
  assistantClock.value = Date.now()
  assistantClockTimer = setInterval(() => {
    assistantClock.value = Date.now()
  }, 100)
}

function stopAssistantClock(): void {
  if (!assistantClockTimer) return
  clearInterval(assistantClockTimer)
  assistantClockTimer = null
}

function updateAssistantStageStarted(payload: Record<string, unknown>): void {
  const stage = String(payload.stage ?? '') as ApiAssistantStage
  const label = String(payload.label ?? '').trim()
  const startedAt = String(payload.startedAt ?? '')
  if (!stage || !label) return
  const next: AssistantDisplayStep = {
    stage,
    label,
    durationMs: 0,
    status: 'running',
    startedAt
  }
  assistantLiveTrace.value = [
    ...assistantLiveTrace.value.filter(item => item.stage !== stage),
    next
  ]
  // 同一时刻只保留一个“加载中”行：外层阶段（如“分析问题”）与它内部嵌套的
  // 检索腿（改写查询/向量检索…）会先后发出 stage_started，若都保持 running，
  // 界面上会出现两个转圈 + 计时同时转。新阶段开始时，把之前仍在 running 的
  // 阶段先降为 completed 展示；若它随后有真实的 stage_completed 事件，
  // 会用真实耗时覆盖回来。
  if (assistantLiveTrace.value.some(item => item.stage !== stage && item.status === 'running')) {
    assistantLiveTrace.value = assistantLiveTrace.value.map(item =>
      item.stage !== stage && item.status === 'running'
        ? { ...item, status: 'completed' }
        : item
    )
  }
}

function updateAssistantStageCompleted(payload: Record<string, unknown>): void {
  const stage = String(payload.stage ?? '') as ApiAssistantStage
  const label = String(payload.label ?? '').trim()
  if (!stage || !label) return
  const status = payload.status === 'failed' ? 'failed' : 'completed'
  const completed: AssistantDisplayStep = {
    stage,
    label,
    durationMs: Math.max(0, Number(payload.durationMs) || 0),
    status,
    ...(typeof payload.detail === 'string' ? { detail: payload.detail } : {})
  }
  const index = assistantLiveTrace.value.findIndex(item => item.stage === stage)
  if (index < 0) assistantLiveTrace.value = [...assistantLiveTrace.value, completed]
  else assistantLiveTrace.value = assistantLiveTrace.value.map((item, itemIndex) => itemIndex === index ? completed : item)
}

function parseAssistantSseBlock(block: string): { event: string, data: Record<string, unknown> } | null {
  const lines = block.split(/\r?\n/)
  const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() ?? ''
  const dataText = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('\n')
  if (!event || !dataText) return null
  const data = JSON.parse(dataText) as unknown
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  return { event, data: data as Record<string, unknown> }
}

type AssistantRequestBody = {
  q: string
  previousQ?: string
  sessionId?: string
}

function buildAssistantRequestBody(query: string): AssistantRequestBody {
  const sessionId = getOrCreateAssistantSessionId()
  return {
    q: query,
    ...(previousAssistantQuery && previousAssistantQuery !== query
      ? { previousQ: previousAssistantQuery }
      : {}),
    ...(sessionId ? { sessionId } : {})
  }
}

async function requestAssistantFallback(
  requestBody: AssistantRequestBody,
  signal: AbortSignal
): Promise<ApiAssistantResponse> {
  return requestFetch<ApiAssistantResponse>('/api/public/assistant', {
    method: 'POST',
    body: requestBody,
    signal
  })
}

async function requestAssistantStream(query: string, signal: AbortSignal): Promise<ApiAssistantResponse> {
  const requestBody = buildAssistantRequestBody(query)
  let response: Response
  try {
    response = await fetch('/api/public/assistant/stream', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody),
      signal
    })
  } catch (error) {
    if (signal.aborted) throw error
    return requestAssistantFallback(requestBody, signal)
  }
  if (response.status === 404 || response.status === 405) {
    // 路由形态不匹配（旧版本发布 / 代理剥离 SSE）才退化到普通端点。这是唯一
    // 仍然值得重试的情况：请求根本没被这个端点受理。
    return requestAssistantFallback(requestBody, signal)
  }
  if (!response.ok || !response.body) {
    if (signal.aborted) throw new Error('ASSISTANT_STREAM_ABORTED')
    // 服务端已经明确拒绝（502/503/422），普通端点会以同样方式失败，不再重试。
    throw new Error(`ASSISTANT_HTTP_${response.status}`)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed: ApiAssistantResponse | null = null
  let streamError: unknown = null
  let serverReportedError = false
  try {
    while (true) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done })
      const blocks = buffer.split(/\r?\n\r?\n/)
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const message = parseAssistantSseBlock(block)
        if (!message) continue
        if (message.event === 'stage_started') updateAssistantStageStarted(message.data)
        else if (message.event === 'stage_completed') updateAssistantStageCompleted(message.data)
        else if (message.event === 'content_delta') {
          const delta = typeof message.data.delta === 'string' ? message.data.delta : ''
          if (delta) assistantDraftAnswer.value += delta
        } else if (message.event === 'completed') completed = message.data as unknown as ApiAssistantResponse
        else if (message.event === 'error') {
          serverReportedError = true
          throw new Error(String(message.data.code ?? 'AI_UNAVAILABLE'))
        }
        // A proxy may forward the terminal event without closing the HTTP
        // connection. Do not keep the answer card waiting for EOF.
        if (completed) break
      }
      if (completed) break
      if (chunk.done) break
    }
  } catch (error) {
    streamError = error
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
  if (streamError) {
    if (signal.aborted) throw streamError
    // 服务端已经用 error 事件说明失败原因，重试只会让用户再等一轮同样的时间。
    if (serverReportedError) throw streamError
    return requestAssistantFallback(requestBody, signal)
  }
  if (!completed) {
    if (signal.aborted) throw new Error('ASSISTANT_STREAM_ABORTED')
    // 流被代理截断但正文已经增量推过：保留已收到的答案，不要丢掉再来一轮。
    if (assistantDraftAnswer.value.trim()) {
      return {
        query,
        mode: 'ai',
        answer: assistantDraftAnswer.value,
        citations: [],
        usedWebSearch: false,
        confidence: 0.5,
        retrievalPath: 'web_search',
        trace: []
      }
    }
    return requestAssistantFallback(requestBody, signal)
  }
  return completed
}

async function requestAssistantAnswer(): Promise<void> {
  if (import.meta.server) return
  const query = activeQuery.value
  // 用户显式选了 AI 模式：只要输入非空就交给 AI 判意图。旧的关键词表会把
  // “上课时间表/课表/竞赛奖金”判成关键词搜索并静默不回答，用户看到的是
  // 「AI 检索什么都没出」。
  const shouldRequest = activeSearchMode.value === 'ai'
    && !activeType.value
    && query.length >= 2
    && isAssistantAnswerableQuery(query)
  if (!shouldRequest) {
    assistantRequestSequence += 1
    assistantAbortController?.abort()
    assistantAbortController = null
    stopAssistantClock()
    assistantResponse.value = null
    assistantDraftAnswer.value = ''
    assistantLiveTrace.value = []
    assistantStatus.value = 'idle'
    return
  }

  const requestId = ++assistantRequestSequence
  assistantAbortController?.abort()
  assistantAbortController = new AbortController()
  assistantResponse.value = null
  assistantDraftAnswer.value = ''
  assistantLiveTrace.value = [{
    stage: 'query_analysis',
    label: '分析问题',
    durationMs: 0,
    status: 'running',
    startedAt: new Date().toISOString()
  }]
  assistantStatus.value = 'pending'
  startAssistantClock()
  try {
    const response = await requestAssistantStream(query, assistantAbortController.signal)
    if (requestId !== assistantRequestSequence || query !== activeQuery.value) return
    assistantResponse.value = response
    assistantDraftAnswer.value = ''
    previousAssistantQuery = query
    assistantLiveTrace.value = (response.trace ?? []).map(step => ({ ...step }))
    assistantStatus.value = 'success'
  } catch {
    if (requestId !== assistantRequestSequence || query !== activeQuery.value) return
    assistantStatus.value = 'error'
  } finally {
    if (requestId === assistantRequestSequence) stopAssistantClock()
  }
}

const searchAnnouncement = computed(() => buildSearchAnnouncement({
  query: activeQuery.value,
  searching: searching.value,
  searchError: searchError.value,
  resultCount: results.value.length,
  groupCount: groupedResults.value.length
}))

watch([activeQuery, activeType], ([query, type]) => {
  const sync = resolveSearchInputSyncFromRoute({
    pendingSearchNavigations,
    routeQuery: query,
    routeType: type,
    latestSubmittedQuery,
    latestSubmittedType
  })
  if (!sync.shouldUpdateInput) return
  searchInput.value = sync.searchInput ?? query
  if (sync.shouldUpdateLatestSubmitted) {
    latestSubmittedQuery = sync.latestSubmittedQuery ?? query
    latestSubmittedType = sync.latestSubmittedType
  }
})

watch(
  [activeQuery, activeType, activeSearchMode],
  () => void requestAssistantAnswer(),
  { immediate: true }
)

onBeforeUnmount(() => {
  assistantAbortController?.abort()
  stopAssistantClock()
})
</script>

<template>
  <div>
    <section class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          校园搜索
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          找地点、办事和校园信息
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          可以直接提问，也可以切换到站内搜索查找地点、办事、部门和社团。
        </p>

        <div class="mt-6 max-w-3xl">
          <div
            class="mb-3 inline-grid grid-cols-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 p-1"
            role="tablist"
            aria-label="搜索方式"
          >
            <button
              type="button"
              role="tab"
              class="inline-flex min-h-10 items-center justify-center gap-2 rounded px-4 text-sm font-semibold transition"
              :class="activeSearchMode === 'ai' ? 'bg-white dark:bg-zinc-900 text-green-700 dark:text-green-400 dark:text-green-400 shadow-sm' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100'"
              :aria-selected="activeSearchMode === 'ai'"
              @click="switchSearchMode('ai')"
            >
              <UIcon
                name="i-lucide-sparkles"
                class="size-4"
              />
              AI 搜索
            </button>
            <button
              type="button"
              role="tab"
              class="inline-flex min-h-10 items-center justify-center gap-2 rounded px-4 text-sm font-semibold transition"
              :class="activeSearchMode === 'site' ? 'bg-white dark:bg-zinc-900 text-green-700 dark:text-green-400 dark:text-green-400 shadow-sm' : 'text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100'"
              :aria-selected="activeSearchMode === 'site'"
              @click="switchSearchMode('site')"
            >
              <UIcon
                name="i-lucide-list-filter"
                class="size-4"
              />
              站内搜索
            </button>
          </div>

          <form
            class="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
            role="search"
            @submit.prevent="submitSearch"
          >
            <UInput
              v-model="searchInput"
              icon="i-lucide-search"
              size="xl"
              class="min-w-0"
              :placeholder="activeSearchMode === 'ai' ? '直接问一个校园问题' : '搜索地点、办事、部门或社团'"
              :aria-label="activeSearchMode === 'ai' ? 'AI 搜索' : '站内搜索'"
            >
              <template
                v-if="searchInput"
                #trailing
              >
                <UButton
                  type="button"
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  aria-label="清空搜索"
                  class="min-h-10 min-w-10"
                  @click="clearSearch"
                />
              </template>
            </UInput>
            <UButton
              type="submit"
              :icon="activeSearchMode === 'ai' ? 'i-lucide-sparkles' : 'i-lucide-search'"
              :label="activeSearchMode === 'ai' ? 'AI 搜索' : '搜索'"
              size="xl"
              class="min-h-11 shrink-0"
              :loading="searching"
            />
          </form>

          <div
            v-if="activeSearchMode === 'site'"
            class="mt-3 flex items-center gap-3"
          >
            <label
              for="search-result-type"
              class="shrink-0 text-xs font-medium text-zinc-600 dark:text-zinc-300"
            >
              只看
            </label>
            <USelect
              id="search-result-type"
              v-model="selectedType"
              :items="searchTypeOptions"
              value-key="value"
              label-key="label"
              size="sm"
              class="min-h-11 w-36 max-w-full"
              aria-label="筛选搜索结果"
            />
          </div>

          <div class="mt-4">
            <p class="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
              {{ listMessages.needShortcutsTitle }}
            </p>
            <div class="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
              <button
                v-for="shortcut in needShortcuts"
                :key="shortcut.query"
                type="button"
                class="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-2 text-xs font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
                :class="isNeedShortcutActive(shortcut, activeQuery)
                  ? 'border-green-700 bg-green-700 text-white'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50 dark:hover:bg-green-950'"
                :aria-label="`按${shortcut.label}搜索`"
                :aria-pressed="isNeedShortcutActive(shortcut, activeQuery)"
                @click="selectSearchNeed(shortcut.query)"
              >
                <UIcon
                  :name="shortcut.icon"
                  class="size-3.5"
                />
                {{ shortcut.label }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="page-shell page-section">
      <p
        class="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {{ searchAnnouncement }}
      </p>

      <div
        v-if="searchError"
        class="mb-5 flex items-start gap-2 border-l-2 border-orange-500 dark:border-orange-800 bg-orange-50 dark:bg-orange-950 px-3 py-2 text-sm text-orange-900 dark:text-orange-300"
        role="status"
      >
        <UIcon
          name="i-lucide-triangle-alert"
          class="mt-0.5 size-4 shrink-0"
        />
        {{ searchError }}
      </div>

      <div v-if="activeQuery">
        <section
          v-if="activeSearchMode === 'ai' && (assistantStatus === 'pending' || assistantResponse || assistantStatus === 'error')"
          class="mb-6 rounded-lg border border-green-200 dark:border-green-800 bg-white dark:bg-zinc-900 p-4 shadow-sm sm:p-5"
          aria-labelledby="assistant-answer-heading"
        >
          <div class="flex items-start gap-3">
            <span class="grid size-9 shrink-0 place-items-center rounded-md bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
              <UIcon
                :name="assistantStatus === 'pending' ? 'i-lucide-loader-circle' : 'i-lucide-sparkles'"
                class="size-4.5"
                :class="assistantStatus === 'pending' ? 'animate-spin' : ''"
              />
            </span>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-2">
                <h2
                  id="assistant-answer-heading"
                  class="text-base font-bold text-zinc-950 dark:text-zinc-100"
                >
                  {{ assistantStatus === 'pending' ? '继续查找答案' : '校园问答' }}
                </h2>
                <UBadge
                  v-if="assistantResponse"
                  :label="assistantModeLabel(assistantResponse)"
                  color="success"
                  variant="soft"
                  size="sm"
                />
              </div>

              <p
                v-if="assistantStatus === 'pending'"
                class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300"
              >
                正在分析问题并检索校园知识库，必要时再联网补充。
              </p>
              <div
                v-if="assistantDisplayTrace.length"
                class="mt-3 max-w-xl space-y-1.5 text-xs"
              >
                <div
                  v-for="step in assistantDisplayTrace"
                  :key="step.stage"
                  class="flex min-h-8 items-center justify-between gap-4 rounded-md bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-1.5"
                >
                  <span class="inline-flex min-w-0 items-start gap-2 font-medium text-zinc-700 dark:text-zinc-200">
                    <UIcon
                      :name="step.status === 'running'
                        ? 'i-lucide-loader-circle'
                        : step.status === 'failed'
                          ? 'i-lucide-circle-x'
                          : 'i-lucide-circle-check'"
                      class="mt-0.5 size-3.5 shrink-0"
                      :class="step.status === 'running'
                        ? 'animate-spin text-green-700 dark:text-green-400'
                        : step.status === 'failed'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-green-700 dark:text-green-400'"
                    />
                    <span class="min-w-0">
                      <span class="block">
                        {{ step.label }}{{ step.status === 'running' ? '中' : '' }}
                      </span>
                      <span
                        v-if="step.detail"
                        class="mt-0.5 block text-[11px] font-normal leading-4 text-zinc-500 dark:text-zinc-400"
                      >
                        {{ step.detail }}
                      </span>
                    </span>
                  </span>
                  <span class="shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
                    {{ formatAssistantStepDuration(step) }}
                  </span>
                </div>
                <div
                  v-if="assistantResponse?.totalDurationMs !== undefined"
                  class="flex items-center justify-between gap-4 px-2.5 pt-1 text-zinc-500 dark:text-zinc-400"
                >
                  <span class="inline-flex items-center gap-2 font-medium">
                    <UIcon
                      name="i-lucide-timer"
                      class="size-3.5 text-green-700 dark:text-green-400"
                    />
                    全部完成
                  </span>
                  <span class="tabular-nums">
                    {{ formatAssistantDuration(assistantResponse.totalDurationMs) }}
                  </span>
                </div>
              </div>
              <div
                v-else-if="assistantStatus === 'pending'"
                class="mt-3 inline-flex min-h-8 items-center gap-2 rounded-md bg-zinc-50 dark:bg-zinc-800/60 px-2.5 py-1.5 text-xs text-zinc-500 dark:text-zinc-400"
              >
                <UIcon
                  name="i-lucide-loader-circle"
                  class="size-3.5 animate-spin text-green-700 dark:text-green-400"
                />
                正在连接检索服务
              </div>
              <p
                v-if="assistantStatus === 'pending' && assistantDraftAnswer"
                class="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-700 dark:text-zinc-200"
              >
                {{ assistantDraftAnswer }}
                <span class="ml-0.5 inline-block h-4 w-[2px] animate-pulse bg-green-600 align-text-bottom" />
              </p>
              <template v-if="assistantResponse">
                <!-- 美食榜单：结构化商家卡片（移动端主视觉，解析失败回退纯文本） -->
                <template v-if="assistantFoodCards">
                  <p class="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-700 dark:text-zinc-200">
                    {{ assistantFoodCards.intro }}
                  </p>
                  <ul class="mt-3 grid gap-2 sm:grid-cols-2">
                    <li
                      v-for="(item, itemIndex) in assistantFoodCards.items"
                      :key="`${item.name}-${itemIndex}`"
                      class="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-sm transition-colors active:border-green-300 dark:active:border-green-700"
                    >
                      <div class="flex items-start justify-between gap-2">
                        <p class="min-w-0 text-sm font-bold leading-5 text-zinc-950 dark:text-zinc-100">
                          <span
                            v-if="item.area"
                            class="mr-1 inline-block rounded bg-green-50 dark:bg-green-950 px-1 py-0.5 align-middle text-[10px] font-semibold text-green-700 dark:text-green-400"
                          >{{ item.area }}</span>{{ item.name }}
                        </p>
                        <span class="inline-flex shrink-0 items-center gap-0.5 rounded-md bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 text-xs font-bold tabular-nums text-amber-700 dark:text-amber-300">
                          <UIcon
                            name="i-lucide-star"
                            class="size-3"
                          />{{ item.score !== null ? item.score.toFixed(1) : '—' }}
                        </span>
                      </div>
                      <p
                        v-if="item.cost !== null"
                        class="mt-1 text-xs font-medium tabular-nums text-zinc-500 dark:text-zinc-400"
                      >
                        人均约 ¥{{ item.cost }}
                      </p>
                      <p
                        v-if="item.tips.length"
                        class="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
                      >
                        {{ item.tips.join('；') }}
                      </p>
                      <NuxtLink
                        :to="`/map?q=${encodeURIComponent(locateSearchTerm(item.name))}`"
                        class="mt-2 inline-flex min-h-8 items-center gap-1 rounded-md bg-green-50 dark:bg-green-950 px-2.5 text-[11px] font-semibold text-green-700 dark:text-green-400 active:bg-green-100 dark:active:bg-green-900/60"
                        @click.stop
                      >
                        <UIcon
                          name="i-lucide-map-pin"
                          class="size-3"
                        />
                        地图定位
                      </NuxtLink>
                    </li>
                  </ul>
                  <p
                    v-if="assistantFoodCards.tail"
                    class="mt-3 whitespace-pre-line text-xs leading-5 text-zinc-500 dark:text-zinc-400"
                  >
                    {{ assistantFoodCards.tail }}
                  </p>
                </template>
                <!-- 单店详情：评分头 + 评价卡片 -->
                <template v-else-if="assistantShopCards">
                  <div class="mt-3 flex flex-wrap items-center gap-2">
                    <p class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                      {{ assistantShopCards.shopName }}
                    </p>
                    <span class="inline-flex items-center gap-0.5 rounded-md bg-amber-50 dark:bg-amber-950 px-1.5 py-0.5 text-xs font-bold tabular-nums text-amber-700 dark:text-amber-300">
                      <UIcon
                        name="i-lucide-star"
                        class="size-3"
                      />高德 {{ assistantShopCards.amapScore !== null ? assistantShopCards.amapScore.toFixed(1) : '—' }}
                    </span>
                    <span
                      v-if="assistantShopCards.cost !== null"
                      class="rounded-md bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-xs font-medium tabular-nums text-zinc-600 dark:text-zinc-300"
                    >人均约 ¥{{ assistantShopCards.cost }}</span>
                    <NuxtLink
                      :to="`/map?q=${encodeURIComponent(locateSearchTerm(assistantShopCards.shopName))}`"
                      class="inline-flex min-h-8 items-center gap-1 rounded-md bg-green-50 dark:bg-green-950 px-2.5 text-[11px] font-semibold text-green-700 dark:text-green-400 active:bg-green-100 dark:active:bg-green-900/60"
                      @click.stop
                    >
                      <UIcon
                        name="i-lucide-map-pin"
                        class="size-3"
                      />
                      地图定位
                    </NuxtLink>
                  </div>
                  <ul class="mt-2 space-y-2">
                    <li
                      v-for="(review, reviewIndex) in assistantShopCards.reviews"
                      :key="reviewIndex"
                      class="rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-3"
                    >
                      <div class="flex items-center justify-between gap-2">
                        <span class="rounded bg-white dark:bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300 ring-1 ring-zinc-200 dark:ring-zinc-700">{{ review.tag }}</span>
                        <span
                          v-if="review.score !== null"
                          class="text-xs font-bold tabular-nums text-amber-700 dark:text-amber-300"
                        >{{ review.score.toFixed(1) }} 分</span>
                      </div>
                      <p class="mt-1.5 text-xs leading-5 text-zinc-600 dark:text-zinc-300">
                        {{ review.content }}
                      </p>
                    </li>
                  </ul>
                  <p
                    v-if="assistantShopCards.tail"
                    class="mt-3 whitespace-pre-line text-xs leading-5 text-zinc-500 dark:text-zinc-400"
                  >
                    {{ assistantShopCards.tail }}
                  </p>
                </template>
                <p
                  v-else
                  class="mt-3 whitespace-pre-line text-sm leading-7 text-zinc-700 dark:text-zinc-200"
                >
                  <template
                    v-for="(segment, segIndex) in splitAssistantAnswer(assistantResponse.answer)"
                    :key="segIndex"
                  >
                    <template v-if="!segment.locate">
                      {{ segment.text }}
                    </template>
                    <NuxtLink
                      v-else
                      :to="`/map?q=${encodeURIComponent(locateSearchTerm(segment.shopName))}`"
                      class="mx-1 inline-flex items-center gap-0.5 rounded bg-green-50 dark:bg-green-950 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/60"
                      @click.stop
                    >
                      <UIcon
                        name="i-lucide-map-pin"
                        class="size-3"
                      />
                      地图定位
                    </NuxtLink>
                  </template>
                </p>
                <div
                  v-if="assistantResponse.citations.length"
                  class="mt-4 border-t border-zinc-100 dark:border-zinc-800 pt-3"
                >
                  <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    参考内容
                  </p>
                  <div class="mt-2 flex flex-wrap gap-2">
                    <NuxtLink
                      v-for="citation in assistantResponse.citations.filter(item => item.source === 'site')"
                      :key="citation.url"
                      :to="citation.url"
                      class="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-green-300 dark:hover:border-green-700 hover:text-green-700 dark:hover:text-green-400"
                    >
                      <UIcon
                        name="i-lucide-file-text"
                        class="size-3.5"
                      />
                      {{ citation.title }}
                    </NuxtLink>
                    <a
                      v-for="citation in assistantResponse.citations.filter(item => item.source === 'web')"
                      :key="citation.url"
                      :href="citation.url"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200 hover:border-green-300 dark:hover:border-green-700 hover:text-green-700 dark:hover:text-green-400"
                    >
                      <UIcon
                        name="i-lucide-external-link"
                        class="size-3.5"
                      />
                      {{ citation.title }}
                    </a>
                  </div>
                </div>
                <p class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                  {{ assistantResponse.mode === 'ai' ? 'AI 整理可能有遗漏，日期、费用和办理要求请以学校最新通知为准。' : '站内资料可能未覆盖最新变化，重要事项请以学校最新通知为准。' }}
                </p>
              </template>
              <div
                v-else-if="assistantStatus === 'error'"
                class="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300"
              >
                <span>暂时无法继续整理这个问题。</span>
                <UButton
                  to="/contact"
                  icon="i-lucide-message-circle"
                  label="联系整理者"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  class="min-h-10"
                />
              </div>
            </div>
          </div>
        </section>

        <div
          v-if="searching || results.length"
          class="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] pb-3"
        >
          <div>
            <p class="text-xs text-zinc-500 dark:text-zinc-400">
              “{{ activeQuery }}”{{ listMessages.resultQuerySuffix }}
            </p>
            <h2 class="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-100">
              {{ searching ? listMessages.searching : activeSearchMode === 'ai' ? `相关站内内容 ${results.length} 项` : resultCountLabel(results.length) }}
            </h2>
          </div>
          <UButton
            v-if="hasPlaceResults"
            :to="`/map?q=${encodeURIComponent(activeQuery)}`"
            icon="i-lucide-map"
            :label="listMessages.onlyMap"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
        </div>

        <nav
          v-if="groupedResults.length > 1"
          class="mt-4 rounded-lg border border-green-100 dark:border-green-900 bg-green-50/60 dark:bg-green-950/60 p-3"
          aria-label="快速跳到结果分类"
        >
          <p class="text-xs font-semibold text-green-900 dark:text-green-300">
            {{ listMessages.jumpToGroups }}
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <a
              v-for="group in groupedResults"
              :key="group.type"
              :href="`#search-group-${group.type}`"
              class="inline-flex min-h-11 items-center gap-2 rounded-md border border-green-200 dark:border-green-800 bg-white dark:bg-zinc-900 px-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100 transition-colors hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50 dark:hover:bg-green-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            >
              <UIcon
                :name="group.icon"
                class="size-4 text-green-700 dark:text-green-400"
              />
              <span>{{ group.label }}</span>
              <span class="text-xs font-normal text-zinc-500 dark:text-zinc-400">{{ group.items.length }} 项</span>
            </a>
          </div>
        </nav>

        <div
          v-if="results.length"
          class="divide-y divide-[var(--line)]"
        >
          <section
            v-for="group in groupedResults"
            :key="group.type"
            class="scroll-mt-20 py-5"
            :aria-labelledby="`search-group-${group.type}`"
          >
            <div class="flex items-center gap-2">
              <UIcon
                :name="group.icon"
                class="size-4 text-green-700 dark:text-green-400"
              />
              <h3
                :id="`search-group-${group.type}`"
                class="text-sm font-bold text-zinc-950 dark:text-zinc-100"
              >
                {{ group.label }}
              </h3>
              <span class="text-xs text-zinc-500 dark:text-zinc-400">{{ group.items.length }} 项</span>
            </div>

            <div class="mt-2 divide-y divide-zinc-100 dark:divide-zinc-800">
              <NuxtLink
                v-for="result in group.items"
                :key="result.key"
                :to="result.to"
                class="group flex min-h-24 items-start gap-3 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 sm:gap-4"
              >
                <span class="grid size-9 shrink-0 place-items-center rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 group-hover:bg-green-50 dark:group-hover:bg-green-950 group-hover:text-green-700 dark:group-hover:text-green-400 sm:size-10">
                  <UIcon
                    :name="result.icon"
                    class="size-5"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="flex flex-wrap items-center gap-2">
                    <span class="break-words font-bold text-zinc-950 dark:text-zinc-100">{{ result.title }}</span>
                    <UBadge
                      v-if="result.typeLabel !== group.label"
                      color="neutral"
                      variant="soft"
                      size="sm"
                    >
                      {{ result.typeLabel }}
                    </UBadge>
                  </span>
                  <span class="mt-1.5 line-clamp-2 block text-sm leading-6 text-zinc-600 dark:text-zinc-300">{{ result.summary }}</span>
                  <span class="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                    <span class="text-zinc-400 dark:text-zinc-500">{{ result.sourceLabel }}</span>
                    <span class="inline-flex items-center gap-1 font-semibold text-green-700 dark:text-green-400">
                      {{ searchResultActionLabel(result.resultType) }}
                      <UIcon
                        name="i-lucide-arrow-right"
                        class="size-3.5 transition-transform group-hover:translate-x-0.5"
                      />
                    </span>
                  </span>
                </span>
              </NuxtLink>
            </div>
          </section>
        </div>

        <div
          v-else-if="searching"
          class="grid min-h-48 place-items-center border-b border-[var(--line)] text-center"
          role="status"
        >
          <div>
            <UIcon
              name="i-lucide-loader-circle"
              class="mx-auto size-6 animate-spin text-green-700 dark:text-green-400"
            />
            <p class="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">
              {{ listMessages.searching }}
            </p>
          </div>
        </div>

        <div
          v-else-if="searchError"
          class="grid min-h-48 place-items-center border-b border-[var(--line)] px-4 text-center"
        >
          <div>
            <UIcon
              name="i-lucide-cloud-off"
              class="mx-auto size-7 text-orange-600 dark:text-orange-300"
            />
            <p class="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
              {{ listMessages.emptyErrorTitle }}
            </p>
            <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {{ listMessages.emptyErrorHint }}
            </p>
            <div class="mt-4 flex flex-wrap justify-center gap-2">
              <UButton
                class="min-h-11"
                icon="i-lucide-refresh-cw"
                :label="listMessages.retrySearch"
                color="neutral"
                variant="outline"
                @click="retrySearch"
              />
              <UButton
                to="/map"
                class="min-h-11"
                icon="i-lucide-map"
                :label="listMessages.openMap"
                color="neutral"
                variant="ghost"
              />
            </div>
          </div>
        </div>

        <div
          v-else-if="assistantStatus === 'idle'"
          class="py-12 text-center"
        >
          <UIcon
            name="i-lucide-search-x"
            class="mx-auto size-7 text-zinc-400 dark:text-zinc-500"
          />
          <p class="mt-3 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
            {{ listMessages.emptyMatchTitle }}
          </p>
          <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            {{ listMessages.emptyMatchHint }}
          </p>
          <div class="mt-4 flex flex-wrap justify-center gap-2">
            <UButton
              class="min-h-11"
              icon="i-lucide-eraser"
              :label="listMessages.clearSearch"
              color="neutral"
              variant="outline"
              @click="clearSearch"
            />
            <UButton
              to="/map"
              :label="listMessages.openMap"
              color="neutral"
              variant="outline"
              class="min-h-11"
            />
            <UButton
              to="/guides"
              :label="listMessages.openGuides"
              color="neutral"
              variant="ghost"
              class="min-h-11"
            />
            <UButton
              to="/feedback"
              :label="listMessages.tellUsMissing"
              color="neutral"
              variant="ghost"
              class="min-h-11"
            />
            <UButton
              to="/contact"
              icon="i-lucide-message-circle"
              label="联系我们"
              color="primary"
              variant="soft"
              class="min-h-11"
            />
          </div>
          <div class="mt-5 flex flex-wrap justify-center gap-2">
            <UButton
              v-for="suggestion in alternativeSuggestions"
              :key="suggestion.query"
              :icon="suggestion.icon"
              :label="suggestion.label"
              color="neutral"
              variant="soft"
              size="sm"
              class="min-h-11"
              @click="startSuggestedSearch(suggestion.query)"
            />
          </div>
        </div>
      </div>

      <div
        v-else
        class="space-y-8"
      >
        <section aria-labelledby="popular-searches-heading">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-sparkles"
              class="size-4 text-green-700 dark:text-green-400"
            />
            <h2
              id="popular-searches-heading"
              class="text-base font-bold text-zinc-950 dark:text-zinc-100"
            >
              大家常找
            </h2>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              v-for="suggestion in popularSearchSuggestions"
              :key="suggestion.query"
              :icon="suggestion.icon"
              :label="suggestion.label"
              color="neutral"
              variant="soft"
              class="min-h-11"
              @click="startSuggestedSearch(suggestion.query)"
            />
          </div>
        </section>

        <section aria-labelledby="search-starting-points-heading">
          <div class="flex items-end justify-between gap-3 border-b border-[var(--line)] pb-3">
            <div>
              <p class="section-kicker">
                按需要浏览
              </p>
              <h2
                id="search-starting-points-heading"
                class="mt-1 text-lg font-bold text-zinc-950 dark:text-zinc-100"
              >
                也可以从这里开始
              </h2>
            </div>
          </div>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <NuxtLink
              v-for="item in searchStartingPoints"
              :key="item.to"
              :to="item.to"
              class="group flex min-h-24 items-start gap-3 rounded-md border border-[var(--line)] bg-white dark:bg-zinc-900 p-4 transition-colors hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-md bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
                <UIcon
                  :name="item.icon"
                  class="size-5"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="font-bold text-zinc-950 dark:text-zinc-100">{{ item.title }}</span>
                <span class="mt-1 block text-sm leading-6 text-zinc-600 dark:text-zinc-300">{{ item.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="mt-3 size-4 shrink-0 text-zinc-300 dark:text-zinc-600 transition-colors group-hover:text-green-700 dark:group-hover:text-green-400"
              />
            </NuxtLink>
          </div>
        </section>
      </div>
    </section>

    <div class="page-shell">
      <PublicPageViewStats variant="inline" />
    </div>
  </div>
</template>
