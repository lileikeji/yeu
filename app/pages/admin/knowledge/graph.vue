<script setup lang="ts">
import { adminFetch } from '~~/app/utils/admin-request'
import { enableCommunityDragPanning } from '~~/app/utils/knowledge-graph-interaction'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { safeExternalHref } from '~/utils/safe-external-href'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '数字山水知识图谱', robots: 'noindex, nofollow' })

type CollectionId = 'entries' | 'documents' | 'claims' | 'web' | 'structured'
type NodeType = 'entity' | 'topic' | 'source' | 'comparison' | 'synthesis' | 'query'
type Confidence = 'EXTRACTED' | 'INFERRED' | 'AMBIGUOUS' | 'UNVERIFIED'

interface GraphNode {
  id: string
  label: string
  type: NodeType
  community: string
  content: string
  summary: string
  source_path: string
  source: string
  confidence: Confidence
  weight: number
  collection: CollectionId
  itemId: string
  category: string
  url: string | null
  capturedAt: number
}

interface GraphEdge {
  id: string
  from: string
  to: string
  relation_type: string
  confidence: Confidence
  type: Confidence
  weight: number
}

interface GraphCommunity {
  id: string
  label: string
  node_count: number
  is_primary?: boolean
  is_weak?: boolean
  recommended_start_node_id?: string | null
  members?: string[]
}

interface GraphPayload {
  meta: {
    build_date: string
    wiki_title: string
    total_nodes: number
    total_edges: number
    degraded?: boolean
  }
  nodes: GraphNode[]
  edges: GraphEdge[]
  learning?: { communities?: GraphCommunity[] }
  summary: {
    systemTotal: number
    retrievalTotal: number
    entries: number
    activeEntries: number
    documents: number
    readyDocuments: number
    web: number
    activeWeb: number
    publishedClaims: number
  }
  visibleItems: number
  truncatedItems: number
  generatedAt: string
}

interface GraphSelection {
  nodeIds: string[]
  communityIds: string[]
  input?: { kind?: string, id?: string }
}

interface GraphVisibilityState {
  searchQuery?: string
  searchResultIds?: string[]
  focusCommunityId?: string | null
}

interface GraphEngine {
  destroy: () => void
  focusCommunity: (id: string) => GraphSelection
  resetView: () => void
  setTypeFilters: (filters: Record<string, boolean>) => void
  select: (input: { kind: string, id?: string, ids?: string[] }) => GraphSelection
  focusNode: (path: string) => void
  accommodateNodeForDrawer?: (nodeId: string, options?: { durationMs?: number }) => void
}

interface GraphEngineLibrary {
  createGraphEngine: (container: HTMLElement, options: Record<string, unknown>) => GraphEngine
  GRAPH_RENDER_BUDGETS?: {
    global?: Record<string, number>
    community?: Record<string, number>
    [key: string]: Record<string, number> | undefined
  }
  buildCommunityAggregationMarkers?: (data: GraphPayload, options?: Record<string, unknown>) => unknown[]
  GraphGestureStateMachine?: {
    prototype: {
      active?: Record<string, unknown> | null
      pointerMove: (event: {
        pointerId: number
        screenPoint: { x: number, y: number }
      }) => Array<{ kind: string, [key: string]: unknown }>
      snapshot?: () => Record<string, unknown> | null
      __yeuCommunityPanPatched?: boolean
    }
  }
}

declare global {
  interface Window {
    LlmWikiGraphEngine?: GraphEngineLibrary
  }
}

const ENGINE_SOURCE = '/vendor/llm-wiki-graph-engine/engine.iife.js?v=b8a47a17'
const PIN_STORAGE_KEY = 'yeu.knowledge-graph.pins.v1'

const typeOptions: Array<{ id: NodeType, label: string, icon: string }> = [
  { id: 'entity', label: '实体', icon: 'i-lucide-landmark' },
  { id: 'topic', label: '主题', icon: 'i-lucide-sparkles' },
  { id: 'source', label: '来源', icon: 'i-lucide-library' },
  { id: 'synthesis', label: '综合', icon: 'i-lucide-layers-3' },
  { id: 'comparison', label: '对比', icon: 'i-lucide-git-compare-arrows' },
  { id: 'query', label: '问答', icon: 'i-lucide-message-circle-question' }
]

const confidenceOptions: Array<{ id: Confidence, label: string, detail: string }> = [
  { id: 'EXTRACTED', label: '直接提取', detail: '来自官网正文或明确资料' },
  { id: 'INFERRED', label: '推断关联', detail: '由多条内容共同支持' },
  { id: 'AMBIGUOUS', label: '存在歧义', detail: '需要结合原文判断' },
  { id: 'UNVERIFIED', label: '尚未核实', detail: '网页资料，使用前请核对' }
]

const graphHost = ref<HTMLElement | null>(null)
const graph = ref<GraphPayload | null>(null)
const loading = ref(false)
const engineLoading = ref(false)
const errorMessage = ref('')
const selectedNodeId = ref<string | null>(null)
const selectedCommunityId = ref<string | null>(null)
const activeCommunityId = ref<string | null>(null)
const readerOpen = ref(false)
const leftPanelOpen = ref(true)
const rightPanelOpen = ref(false)
const interactionHelpOpen = ref(false)
const compactGraphMode = ref(false)
const searchState = ref({ query: '', resultIds: [] as string[] })
const typeFilters = ref<Record<NodeType, boolean>>({
  entity: true,
  topic: true,
  source: false,
  comparison: true,
  synthesis: true,
  query: true
})

let engine: GraphEngine | null = null
let enginePromise: Promise<GraphEngineLibrary> | null = null

const nodesById = computed(() => new Map((graph.value?.nodes ?? []).map(node => [node.id, node])))
const communities = computed(() => graph.value?.learning?.communities ?? [])
const communitiesById = computed(() => new Map(communities.value.map(item => [item.id, item])))
const selectedNode = computed(() => selectedNodeId.value ? nodesById.value.get(selectedNodeId.value) ?? null : null)
const selectedCommunity = computed(() => {
  const id = selectedCommunityId.value ?? selectedNode.value?.community ?? null
  return id ? communitiesById.value.get(id) ?? null : null
})
const selectedExternalUrl = computed(() => safeExternalHref(selectedNode.value?.url) ?? null)
const selectedRelations = computed(() => {
  if (!selectedNode.value || !graph.value) return []
  return graph.value.edges
    .filter(edge => edge.from === selectedNode.value?.id || edge.to === selectedNode.value?.id)
    .slice(0, 8)
    .map((edge) => {
      const relatedId = edge.from === selectedNode.value?.id ? edge.to : edge.from
      return { ...edge, node: nodesById.value.get(relatedId) ?? null }
    })
})
const visibleCommunityMembers = computed(() => {
  const community = selectedCommunity.value
  if (!community) return []
  const searchIds = new Set(searchState.value.resultIds)
  return (community.members ?? [])
    .map(nodeId => nodesById.value.get(nodeId) ?? null)
    .filter((node): node is GraphNode => Boolean(node))
    .filter(node => typeFilters.value[node.type])
    .filter(node => !searchState.value.query || searchIds.has(node.id))
    .slice(0, 8)
})
const nodeTypeCounts = computed(() => {
  const counts = new Map<NodeType, number>()
  for (const node of graph.value?.nodes ?? []) counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
  return counts
})
const collectionStats = computed(() => graph.value
  ? [
      { label: '站内知识', value: graph.value.summary.activeEntries, tone: 'green' },
      { label: '官网知识点', value: graph.value.summary.publishedClaims, tone: 'blue' },
      { label: '官网正文', value: graph.value.summary.readyDocuments, tone: 'blue' },
      { label: '网页资料', value: graph.value.summary.activeWeb, tone: 'red' }
    ]
  : [])

function loadPins(): Record<string, { x: number, y: number, coordinateSpace?: string }> {
  try {
    const value = localStorage.getItem(PIN_STORAGE_KEY)
    return value ? JSON.parse(value) as Record<string, { x: number, y: number, coordinateSpace?: string }> : {}
  } catch {
    return {}
  }
}

async function loadEngineLibrary(): Promise<GraphEngineLibrary> {
  if (window.LlmWikiGraphEngine) {
    tuneGraphRenderBudgets(window.LlmWikiGraphEngine)
    enableCommunityDragPanning(window.LlmWikiGraphEngine)
    return window.LlmWikiGraphEngine
  }
  if (enginePromise) return enginePromise
  enginePromise = new Promise<GraphEngineLibrary>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-llm-wiki-engine]')
    const script = existing ?? document.createElement('script')
    const handleLoad = () => {
      if (window.LlmWikiGraphEngine) {
        tuneGraphRenderBudgets(window.LlmWikiGraphEngine)
        enableCommunityDragPanning(window.LlmWikiGraphEngine)
        resolve(window.LlmWikiGraphEngine)
      } else reject(new Error('图谱引擎加载后没有完成初始化'))
    }
    const handleError = () => reject(new Error('数字山水图谱引擎加载失败'))
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
    if (!existing) {
      script.src = ENGINE_SOURCE
      script.async = true
      script.dataset.llmWikiEngine = 'true'
      document.head.appendChild(script)
    }
  }).catch((error) => {
    enginePromise = null
    throw error
  })
  return enginePromise
}

function tuneGraphRenderBudgets(library: GraphEngineLibrary): void {
  const budgets = library.GRAPH_RENDER_BUDGETS
  if (!budgets) return

  // Keep the overview readable. Full content remains available through search,
  // hover and the reader panel; the canvas should only carry the visual index.
  Object.assign(budgets.global ?? {}, {
    maxVisibleEdges: 160,
    maxLabels: 8,
    maxCards: 0
  })
  Object.assign(budgets.community ?? {}, {
    maxVisibleNodes: 1800,
    maxVisibleEdges: 240,
    maxLabels: 12,
    maxCards: 10
  })
  for (const [band, values] of Object.entries(budgets)) {
    if (!values || band === 'global' || band === 'community') continue
    Object.assign(values, {
      maxVisibleEdges: Math.min(Number(values.maxVisibleEdges ?? 420), 420),
      maxLabels: Math.min(Number(values.maxLabels ?? 12), band === 'small' ? 3 : band === 'medium' ? 6 : 10),
      maxCards: 0
    })
  }
}

function handleSelection(selection: GraphSelection | null): void {
  if (!selection) return
  const inputKind = selection.input?.kind
  const communityId = inputKind === 'community'
    ? selection.input?.id ?? selection.communityIds?.[0]
    : selection.communityIds?.[0]
  if (communityId) selectedCommunityId.value = communityId
  if (inputKind === 'community') {
    selectedNodeId.value = null
    rightPanelOpen.value = true
    readerOpen.value = false
    return
  }
  const nodeId = selection.nodeIds?.[0]
  if (!nodeId) return
  selectedNodeId.value = nodeId
  selectedCommunityId.value = nodesById.value.get(nodeId)?.community ?? communityId ?? null
  rightPanelOpen.value = true
  readerOpen.value = false
}

async function mountEngine(): Promise<void> {
  if (!graph.value || !graphHost.value) return
  engineLoading.value = true
  try {
    const library = await loadEngineLibrary()
    engine?.destroy()
    const aggregationMarkers = library.buildCommunityAggregationMarkers?.(graph.value, {
      pins: loadPins(),
      minCommunitySize: 6
    }) ?? []
    engine = library.createGraphEngine(graphHost.value, {
      data: graph.value,
      pins: loadPins(),
      theme: 'shan-shui',
      edgeStyle: { semanticEmphasis: true, focusHighlight: true },
      typeFilters: typeFilters.value,
      aggregationMarkers,
      capabilities: {
        persistPins: async (pins: unknown) => localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pins)),
        onSelectionChange: (selection: GraphSelection) => handleSelection(selection),
        onSelectionClear: () => {
          selectedNodeId.value = null
          selectedCommunityId.value = null
          readerOpen.value = false
        },
        onOpenPage: (payload: { node?: { id?: string } }) => {
          const nodeId = payload.node?.id
          if (!nodeId) return
          selectedNodeId.value = nodeId
          selectedCommunityId.value = nodesById.value.get(nodeId)?.community ?? null
          readerOpen.value = true
          engine?.accommodateNodeForDrawer?.(nodeId, { durationMs: 180 })
        },
        onViewReset: () => {
          activeCommunityId.value = null
          selectedCommunityId.value = null
        },
        onVisibilityStateChange: (state: GraphVisibilityState) => {
          searchState.value = {
            query: state.searchQuery ?? '',
            resultIds: state.searchResultIds ?? []
          }
          activeCommunityId.value = state.focusCommunityId ?? activeCommunityId.value
        }
      }
    })
  } finally {
    engineLoading.value = false
  }
}

async function loadGraph(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const endpoint = compactGraphMode.value
      ? '/api/admin/knowledge/graph?compact=1'
      : '/api/admin/knowledge/graph'
    graph.value = await adminFetch<GraphPayload>(endpoint)
    selectedNodeId.value = null
    selectedCommunityId.value = null
    activeCommunityId.value = null
    readerOpen.value = false
    await nextTick()
    await mountEngine()
  } catch (error) {
    if (isAuthorizationError(error)) {
      await navigateTo('/admin/login', { replace: true })
      return
    }
    errorMessage.value = getRequestMessage(error, '知识图谱加载失败')
  } finally {
    loading.value = false
  }
}

function enterCommunity(community: GraphCommunity): void {
  if (!engine) return
  activeCommunityId.value = community.id
  selectedCommunityId.value = community.id
  selectedNodeId.value = null
  readerOpen.value = false
  rightPanelOpen.value = true
  handleSelection(engine.focusCommunity(community.id))
}

function resetView(): void {
  engine?.resetView()
  activeCommunityId.value = null
  selectedCommunityId.value = null
  selectedNodeId.value = null
  readerOpen.value = false
}

function triggerEngineControl(label: string): void {
  const controls = graphHost.value?.querySelectorAll<HTMLButtonElement>('button')
  const target = controls
    ? Array.from(controls).find(button => button.getAttribute('aria-label') === label)
    : null
  target?.click()
}

function focusGraphSearch(): void {
  graphHost.value?.querySelector<HTMLInputElement>('input[role="searchbox"], input[type="search"]')?.focus()
}

function toggleType(type: NodeType): void {
  typeFilters.value[type] = !typeFilters.value[type]
  engine?.setTypeFilters({ ...typeFilters.value })
}

function selectCommunityNode(nodeId: string): void {
  const node = nodesById.value.get(nodeId)
  if (!node || !engine) return
  handleSelection(engine.select({ kind: 'node', id: nodeId }))
  engine.focusNode(node.source_path)
}

function openReader(): void {
  if (!selectedNode.value) return
  readerOpen.value = true
  engine?.accommodateNodeForDrawer?.(selectedNode.value.id, { durationMs: 180 })
}

async function openLibrary(node: GraphNode): Promise<void> {
  await navigateTo({
    path: '/admin/knowledge/library',
    query: { collection: node.collection, q: node.label }
  })
}

function openSource(): void {
  if (!selectedExternalUrl.value) return
  window.open(selectedExternalUrl.value, '_blank', 'noopener,noreferrer')
}

function formatDate(value?: number): string {
  if (!value) return '未记录'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}

function confidenceLabel(value?: Confidence): string {
  return confidenceOptions.find(item => item.id === value)?.label ?? '尚未核实'
}

function nodeTypeLabel(value?: NodeType): string {
  return typeOptions.find(item => item.id === value)?.label ?? '资料'
}

function relationNodeLabel(node: GraphNode | null): string {
  if (!node) return '关联资料'
  return node.label.length > 18 ? `${node.label.slice(0, 18)}…` : node.label
}

onMounted(() => {
  const compactViewport = window.matchMedia('(max-width: 1023px)').matches
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const deviceMemory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 0)
  compactGraphMode.value = compactViewport || coarsePointer || (deviceMemory > 0 && deviceMemory <= 4)
  if (compactViewport) leftPanelOpen.value = false
  void loadGraph()
})
onBeforeUnmount(() => {
  engine?.destroy()
  engine = null
})
</script>

<template>
  <div class="knowledge-landscape-page">
    <AdminPageHeader
      class="graph-page-intro"
      title="数字山水知识图谱"
      description="把站内知识、官网正文和网页资料放在同一张可探索的知识地图里。"
      icon="i-lucide-git-fork"
      eyebrow="知识库"
    >
      <template #actions>
        <UButton
          to="/admin/knowledge/library"
          icon="i-lucide-library"
          label="全部资料"
          color="neutral"
          variant="outline"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="重新生成"
          :loading="loading || engineLoading"
          @click="loadGraph"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="errorMessage"
      class="landscape-error"
      role="alert"
    >
      <UIcon
        name="i-lucide-circle-alert"
        class="size-5"
      />
      <span>{{ errorMessage }}</span>
      <button
        type="button"
        @click="loadGraph"
      >
        重试
      </button>
    </div>

    <section
      class="landscape-shell"
      :class="{
        'is-left-collapsed': !leftPanelOpen,
        'is-right-collapsed': !rightPanelOpen
      }"
      aria-label="数字山水知识图谱工作区"
    >
      <aside
        v-show="leftPanelOpen"
        class="landscape-sidebar landscape-sidebar-left"
      >
        <div class="landscape-brand">
          <span class="landscape-seal">仰恩</span>
          <div>
            <p>数字山水</p>
            <span>
              {{ graph?.summary.publishedClaims ?? 0 }} 个官网知识点已索引 · 当前绘制 {{ graph?.meta.total_nodes ?? 0 }} 个
            </span>
          </div>
          <button
            type="button"
            class="mobile-panel-close"
            aria-label="关闭图谱目录"
            @click="leftPanelOpen = false"
          >
            <UIcon name="i-lucide-x" />
          </button>
        </div>

        <div
          class="collection-summary"
          aria-label="知识来源统计"
        >
          <div
            v-for="item in collectionStats"
            :key="item.label"
            :data-tone="item.tone"
          >
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
          </div>
        </div>

        <div class="sidebar-section community-section">
          <div class="sidebar-heading">
            <div>
              <span class="sidebar-kicker">阅读路径</span>
              <h2>知识社区</h2>
            </div>
            <button
              v-if="activeCommunityId"
              type="button"
              title="返回全图"
              @click="resetView"
            >
              <UIcon name="i-lucide-scan" />
            </button>
          </div>
          <div class="community-list">
            <button
              v-for="(community, index) in communities"
              :key="community.id"
              type="button"
              :class="{ active: activeCommunityId === community.id }"
              :style="{ '--community-index': index }"
              @click="enterCommunity(community)"
            >
              <span class="community-number">{{ String(index + 1).padStart(2, '0') }}</span>
              <span class="community-copy">
                <strong>{{ community.label }}</strong>
                <small>{{ community.node_count }} 页{{ community.is_weak ? ' · 待补充' : '' }}</small>
              </span>
              <UIcon name="i-lucide-chevron-right" />
            </button>
          </div>
        </div>

        <div class="sidebar-section type-section">
          <div class="sidebar-heading compact">
            <div>
              <span class="sidebar-kicker">图例</span>
              <h2>显示内容</h2>
            </div>
          </div>
          <div class="type-filter-list">
            <button
              v-for="item in typeOptions"
              :key="item.id"
              type="button"
              :aria-pressed="typeFilters[item.id]"
              :class="{ muted: !typeFilters[item.id] }"
              @click="toggleType(item.id)"
            >
              <span class="type-mark"><UIcon :name="item.icon" /></span>
              <span>{{ item.label }}</span>
              <small>{{ nodeTypeCounts.get(item.id) ?? 0 }}</small>
              <UIcon :name="typeFilters[item.id] ? 'i-lucide-eye' : 'i-lucide-eye-off'" />
            </button>
          </div>
        </div>
      </aside>

      <main class="landscape-main">
        <header class="canvas-heading">
          <div class="canvas-heading-copy">
            <p>{{ activeCommunityId ? communitiesById.get(activeCommunityId)?.label : '仰恩大学新生知识全景' }}</p>
            <span v-if="searchState.query">“{{ searchState.query }}”找到 {{ searchState.resultIds.length }} 条</span>
            <span v-else>按住任意位置拖动画布，滚轮缩放；Shift + 拖动节点可固定位置</span>
          </div>
          <div
            class="canvas-toolstrip"
            role="toolbar"
            aria-label="图谱快捷操作"
          >
            <button
              type="button"
              :aria-pressed="leftPanelOpen"
              title="显示或隐藏知识社区与类型筛选"
              @click="leftPanelOpen = !leftPanelOpen"
            >
              <UIcon name="i-lucide-panel-left" />
              <span>目录</span>
            </button>
            <button
              type="button"
              title="搜索图谱"
              @click="focusGraphSearch"
            >
              <UIcon name="i-lucide-search" />
              <span>搜索</span>
            </button>
            <button
              type="button"
              title="缩小图谱"
              @click="triggerEngineControl('缩小图谱')"
            >
              <UIcon name="i-lucide-zoom-out" />
              <span>缩小</span>
            </button>
            <button
              type="button"
              title="放大图谱"
              @click="triggerEngineControl('放大图谱')"
            >
              <UIcon name="i-lucide-zoom-in" />
              <span>放大</span>
            </button>
            <button
              type="button"
              title="回到知识全景"
              @click="resetView"
            >
              <UIcon name="i-lucide-scan" />
              <span>全图</span>
            </button>
            <button
              type="button"
              :aria-pressed="interactionHelpOpen"
              title="查看图谱操作方法"
              @click="interactionHelpOpen = !interactionHelpOpen"
            >
              <UIcon name="i-lucide-circle-help" />
              <span>帮助</span>
            </button>
            <button
              type="button"
              :aria-pressed="rightPanelOpen"
              title="显示或隐藏阅读台"
              @click="rightPanelOpen = !rightPanelOpen"
            >
              <UIcon name="i-lucide-panel-right" />
              <span>阅读台</span>
            </button>
          </div>
        </header>

        <div class="landscape-canvas">
          <div
            v-if="loading && !graph"
            class="canvas-state"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="size-7 animate-spin"
            />
            <strong>正在展开知识地图</strong>
            <span>资料较多，第一次生成需要一点时间</span>
          </div>
          <div
            v-else-if="!graph?.nodes.length"
            class="canvas-state"
          >
            <UIcon
              name="i-lucide-library-big"
              class="size-7"
            />
            <strong>知识库里还没有可绘制的资料</strong>
            <span>先导入或抓取内容，再回来生成图谱</span>
          </div>
          <div
            ref="graphHost"
            class="graph-engine-host"
          />
          <Transition name="graph-help">
            <aside
              v-if="interactionHelpOpen"
              class="interaction-help"
              aria-label="图谱操作帮助"
            >
              <header>
                <strong>怎样操作这张图</strong>
                <button
                  type="button"
                  aria-label="关闭图谱操作帮助"
                  @click="interactionHelpOpen = false"
                >
                  <UIcon name="i-lucide-x" />
                </button>
              </header>
              <ul>
                <li><UIcon name="i-lucide-hand" /><span><b>拖动画布</b>：按住空白、社区云雾或节点移动</span></li>
                <li><UIcon name="i-lucide-pin" /><span><b>固定节点</b>：按住 Shift 再拖动节点</span></li>
                <li><UIcon name="i-lucide-mouse" /><span><b>缩放</b>：滚动鼠标滚轮，触屏双指缩放</span></li>
                <li><UIcon name="i-lucide-move" /><span><b>固定节点</b>：拖动节点到合适位置后松开</span></li>
                <li><UIcon name="i-lucide-book-open" /><span><b>查看内容</b>：单击看摘要，双击看全文</span></li>
              </ul>
            </aside>
          </Transition>
          <div class="canvas-gesture-hint">
            <UIcon name="i-lucide-hand" />
            拖动画布
            <span>·</span>
            <UIcon name="i-lucide-mouse" />
            滚轮缩放
          </div>
          <div
            v-if="engineLoading"
            class="engine-loading"
            aria-live="polite"
          >
            <UIcon
              name="i-lucide-loader-circle"
              class="animate-spin"
            />
            正在加载山水画布
          </div>
        </div>

        <footer class="canvas-footer">
          <div class="confidence-line">
            <span
              v-for="item in confidenceOptions"
              :key="item.id"
              :data-confidence="item.id"
            >
              <i />{{ item.label }}
            </span>
          </div>
          <span>更新于 {{ formatDate(graph ? Date.parse(graph.generatedAt) : 0) }}</span>
        </footer>
      </main>

      <aside
        v-show="rightPanelOpen"
        class="landscape-sidebar landscape-sidebar-right"
        :class="{ reading: readerOpen }"
      >
        <template v-if="selectedNode">
          <header class="reader-heading">
            <button
              v-if="readerOpen"
              type="button"
              title="返回摘要"
              @click="readerOpen = false"
            >
              <UIcon name="i-lucide-arrow-left" />
            </button>
            <div>
              <span>{{ readerOpen ? '阅读全文' : '知识摘要' }}</span>
              <small>{{ selectedCommunity?.label ?? selectedNode.category }}</small>
            </div>
            <button
              type="button"
              title="关闭"
              @click="selectedNodeId = null; readerOpen = false"
            >
              <UIcon name="i-lucide-x" />
            </button>
          </header>

          <div
            v-if="readerOpen"
            class="reader-body full-reader"
          >
            <div class="reader-eyebrow">
              <span>{{ nodeTypeLabel(selectedNode.type) }}</span>
              <span :data-confidence="selectedNode.confidence">{{ confidenceLabel(selectedNode.confidence) }}</span>
            </div>
            <h2>{{ selectedNode.label }}</h2>
            <p class="reader-content">
              {{ selectedNode.content || selectedNode.summary || '这条资料暂时没有可显示的正文。' }}
            </p>
            <div class="reader-source-line">
              <span>来源</span>
              <strong>{{ selectedNode.source }}</strong>
              <small>{{ formatDate(selectedNode.capturedAt) }}</small>
            </div>
          </div>

          <div
            v-else
            class="reader-body summary-reader"
          >
            <div class="reader-eyebrow">
              <span>{{ nodeTypeLabel(selectedNode.type) }}</span>
              <span :data-confidence="selectedNode.confidence">{{ confidenceLabel(selectedNode.confidence) }}</span>
            </div>
            <h2>{{ selectedNode.label }}</h2>
            <p class="summary-copy">
              {{ selectedNode.summary || '这条资料暂时没有摘要，可以进入全文查看。' }}
            </p>

            <div class="reader-actions">
              <button
                type="button"
                class="primary"
                @click="openReader"
              >
                <UIcon name="i-lucide-book-open-text" />阅读全文
              </button>
              <button
                type="button"
                @click="openLibrary(selectedNode)"
              >
                <UIcon name="i-lucide-folder-search" />去资料库
              </button>
              <button
                v-if="selectedExternalUrl"
                type="button"
                @click="openSource"
              >
                <UIcon name="i-lucide-external-link" />查看来源
              </button>
            </div>

            <section
              v-if="selectedRelations.length"
              class="related-section"
            >
              <div class="reader-section-title">
                <h3>相关内容</h3>
                <span>{{ selectedRelations.length }} 条</span>
              </div>
              <button
                v-for="relation in selectedRelations"
                :key="relation.id"
                type="button"
                @click="relation.node && selectCommunityNode(relation.node.id)"
              >
                <span>
                  <strong>{{ relationNodeLabel(relation.node) }}</strong>
                  <small>{{ relation.relation_type }} · {{ confidenceLabel(relation.confidence) }}</small>
                </span>
                <UIcon name="i-lucide-arrow-up-right" />
              </button>
            </section>
          </div>
        </template>

        <template v-else-if="selectedCommunity">
          <header class="reader-heading">
            <div>
              <span>社区摘要</span>
              <small>同一类资料放在一起阅读</small>
            </div>
            <button
              type="button"
              title="关闭"
              @click="selectedCommunityId = null"
            >
              <UIcon name="i-lucide-x" />
            </button>
          </header>
          <div class="reader-body community-reader">
            <span class="community-stamp">社区</span>
            <h2>{{ selectedCommunity.label }}</h2>
            <p>这个社区收录了 {{ selectedCommunity.node_count }} 页资料。进入后，搜索和类型筛选只会作用在当前社区，更适合顺着一个主题读下去。</p>
            <div class="community-facts">
              <div><strong>{{ selectedCommunity.node_count }}</strong><span>资料页</span></div>
              <div><strong>{{ selectedCommunity.is_weak ? '待补充' : '结构清晰' }}</strong><span>整理状态</span></div>
            </div>
            <button
              class="enter-community-button"
              type="button"
              @click="enterCommunity(selectedCommunity)"
            >
              进入这个社区<UIcon name="i-lucide-arrow-right" />
            </button>
            <section class="related-section community-core-list">
              <div class="reader-section-title">
                <h3>先看这些</h3>
              </div>
              <button
                v-for="node in visibleCommunityMembers"
                :key="node.id"
                type="button"
                @click="selectCommunityNode(node.id)"
              >
                <span><strong>{{ relationNodeLabel(node) }}</strong></span>
                <UIcon name="i-lucide-chevron-right" />
              </button>
            </section>
          </div>
        </template>

        <template v-else>
          <header class="reader-heading">
            <div>
              <span>阅读台</span>
              <small>从图谱中选一条内容</small>
            </div>
          </header>
          <div class="reader-body empty-reader">
            <div class="empty-ink-mark">
              <UIcon name="i-lucide-mountain-snow" />
            </div>
            <h2>从一座山开始</h2>
            <p>每片云雾代表一个知识社区。先点社区看整体，再点节点看摘要；确认有用后再进入全文。</p>
            <ol>
              <li><span>一</span>悬停节点，快速预览</li>
              <li><span>二</span>点击节点，阅读摘要</li>
              <li><span>三</span>双击节点，直接看全文</li>
            </ol>
          </div>
        </template>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.knowledge-landscape-page {
  width: min(100%, 110rem);
  margin: 0 auto;
  color: #2f352f;
}

.landscape-error {
  display: flex;
  align-items: center;
  gap: .65rem;
  margin: 1rem 0;
  border-left: 3px solid #a84d3f;
  background: #fff3ef;
  padding: .8rem 1rem;
  color: #7f332a;
  font-size: .875rem;
}

.landscape-error button {
  margin-left: auto;
  color: #7f332a;
  font-weight: 700;
}

.landscape-shell {
  position: relative;
  display: grid;
  grid-template-columns: 15rem minmax(34rem, 1fr) 20rem;
  min-height: 44rem;
  margin-top: 1rem;
  overflow: hidden;
  border: 1px solid #c9c2af;
  background: #f5f0e3;
  box-shadow: 0 18px 50px rgb(65 75 62 / 10%);
  transition: grid-template-columns .22s ease;
}

.landscape-shell.is-left-collapsed { grid-template-columns: 0 minmax(34rem, 1fr) 20rem; }
.landscape-shell.is-right-collapsed { grid-template-columns: 15rem minmax(34rem, 1fr) 0; }
.landscape-shell.is-left-collapsed.is-right-collapsed { grid-template-columns: 0 minmax(34rem, 1fr) 0; }

.landscape-sidebar {
  min-width: 0;
  background:
    linear-gradient(rgb(255 255 255 / 64%), rgb(255 255 255 / 30%)),
    repeating-linear-gradient(0deg, transparent 0 27px, rgb(95 111 92 / 6%) 27px 28px);
}

.landscape-sidebar-left { border-right: 1px solid #d5cfbe; }
.landscape-sidebar-right { border-left: 1px solid #d5cfbe; }

.landscape-brand {
  display: flex;
  align-items: center;
  gap: .7rem;
  min-height: 5rem;
  padding: 1rem;
  border-bottom: 1px solid #d5cfbe;
}

.mobile-panel-close { display: none; }

.landscape-seal {
  display: grid;
  width: 2.65rem;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 2px;
  background: #a84d3f;
  color: white;
  font-family: serif;
  font-size: .75rem;
  box-shadow: inset 0 0 0 3px rgb(255 255 255 / 20%);
}

.landscape-brand p {
  margin: 0;
  font-family: ui-serif, "Songti SC", SimSun, serif;
  font-size: 1.05rem;
  font-weight: 800;
}

.landscape-brand span { color: #72786f; font-size: .72rem; }

.collection-summary {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  border-bottom: 1px solid #d5cfbe;
}

.collection-summary > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: .2rem;
  padding: .8rem .45rem;
  text-align: center;
}

.collection-summary > div + div { border-left: 1px solid #ddd7c7; }
.collection-summary span { color: #747a72; font-size: .66rem; }
.collection-summary strong { font-family: ui-monospace, monospace; font-size: .9rem; }
.collection-summary [data-tone="green"] strong { color: #476b59; }
.collection-summary [data-tone="blue"] strong { color: #526f83; }
.collection-summary [data-tone="red"] strong { color: #9c5947; }

.sidebar-section { padding: 1rem .8rem; }
.sidebar-section + .sidebar-section { border-top: 1px solid #d5cfbe; }

.sidebar-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: .75rem;
}

.sidebar-heading h2 {
  margin: .12rem 0 0;
  font-family: ui-serif, "Songti SC", SimSun, serif;
  font-size: 1rem;
  font-weight: 800;
}

.sidebar-kicker {
  color: #9a5546;
  font-size: .63rem;
  font-weight: 800;
  letter-spacing: .12em;
}

.sidebar-heading > button {
  display: grid;
  width: 2rem;
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid #d2cbbb;
  background: #faf7ee;
}

.community-list {
  display: flex;
  max-height: 20rem;
  flex-direction: column;
  gap: .28rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.community-list button {
  display: grid;
  grid-template-columns: 1.65rem minmax(0, 1fr) 1rem;
  align-items: center;
  gap: .5rem;
  min-height: 3.2rem;
  border-left: 2px solid transparent;
  padding: .48rem .42rem;
  text-align: left;
  transition: background .16s ease, border-color .16s ease;
}

.community-list button:hover,
.community-list button.active {
  border-left-color: #a84d3f;
  background: rgb(255 253 247 / 88%);
}

.community-number {
  color: #a84d3f;
  font-family: ui-monospace, monospace;
  font-size: .65rem;
}

.community-copy { min-width: 0; }
.community-copy strong,
.community-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.community-copy strong { font-size: .78rem; }
.community-copy small { margin-top: .2rem; color: #7b8079; font-size: .65rem; }
.community-list button > svg { color: #9b9d94; }

.type-filter-list { display: grid; gap: .25rem; }
.type-filter-list button {
  display: grid;
  grid-template-columns: 1.65rem minmax(0, 1fr) auto 1rem;
  align-items: center;
  gap: .45rem;
  min-height: 2.2rem;
  color: #39423a;
  font-size: .74rem;
  text-align: left;
}
.type-filter-list button.muted { opacity: .42; }
.type-filter-list small { color: #81877f; font-family: ui-monospace, monospace; }
.type-mark {
  display: grid;
  width: 1.45rem;
  aspect-ratio: 1;
  place-items: center;
  border: 1px solid #cbc3b1;
  background: #fffdf7;
  color: #9d5a47;
}

.landscape-main {
  display: grid;
  min-width: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: #efe9da;
}

.canvas-heading,
.canvas-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 3.35rem;
  padding: .65rem 1rem;
  border-bottom: 1px solid #cec7b5;
  background: rgb(249 246 237 / 86%);
}

.canvas-heading p { margin: 0; font-family: ui-serif, "Songti SC", SimSun, serif; font-size: .9rem; font-weight: 800; }
.canvas-heading span { color: #767b73; font-size: .67rem; }
.canvas-heading-copy { min-width: 10rem; }
.canvas-heading-copy > span { display: block; margin-top: .16rem; }

.canvas-toolstrip {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: .24rem;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: none;
}
.canvas-toolstrip::-webkit-scrollbar { display: none; }
.canvas-toolstrip button {
  display: inline-flex;
  min-width: 2.35rem;
  min-height: 2.15rem;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: .3rem;
  border: 1px solid transparent;
  border-radius: .35rem;
  padding: .35rem .46rem;
  color: #59675d;
  font-size: .68rem;
  font-weight: 750;
  transition: border-color .16s ease, background .16s ease, color .16s ease;
}
.canvas-toolstrip button:hover,
.canvas-toolstrip button:focus-visible,
.canvas-toolstrip button[aria-pressed="true"] {
  border-color: #c8beaa;
  background: #fffdf7;
  color: #8f4639;
  outline: none;
}
.canvas-toolstrip button svg { width: .9rem; height: .9rem; }
.canvas-toolstrip button span { color: inherit; font-size: inherit; }

.landscape-canvas {
  position: relative;
  min-height: 37rem;
  height: min(70vh, 51rem);
  overflow: hidden;
  background: #f2eddf;
}

.graph-engine-host {
  position: absolute;
  inset: 0;
  touch-action: none;
}
.graph-engine-host :deep(.llm-wiki-graph-engine),
.graph-engine-host :deep(.sigma-mouse) {
  cursor: grab !important;
}
.graph-engine-host :deep(.llm-wiki-graph-engine[data-viewport-dragging="true"]),
.graph-engine-host :deep(.llm-wiki-graph-engine[data-viewport-dragging="true"] .sigma-mouse) {
  cursor: grabbing !important;
}
.graph-engine-host :deep(button),
.graph-engine-host :deep(input),
.graph-engine-host :deep([role="button"]) {
  cursor: pointer;
}
.graph-engine-host :deep(.node) {
  max-width: 132px;
}
.graph-engine-host :deep(.node-name) {
  max-width: 116px;
}
.graph-engine-host :deep(.llm-wiki-graph-engine .node-name) {
  display: none !important;
}
.graph-engine-host :deep(.llm-wiki-graph-engine .node:hover .node-name),
.graph-engine-host :deep(.llm-wiki-graph-engine .node[aria-pressed="true"] .node-name),
.graph-engine-host :deep(.llm-wiki-graph-engine .node[data-traceable="true"] .node-name) {
  display: block !important;
}
.graph-engine-host :deep(.llm-wiki-graph-engine .edge) {
  opacity: .2 !important;
}
.graph-engine-host :deep(.llm-wiki-graph-engine .edge.relation-contrast) {
  opacity: .34 !important;
}
.graph-engine-host :deep(.llm-wiki-graph-engine .community-wash),
.graph-engine-host :deep(.llm-wiki-graph-engine .sigma-global-community-region) {
  display: none !important;
}
.graph-engine-host :deep(.node.is-compact) {
  max-width: 124px;
}
.graph-engine-host :deep(.node.is-compact .node-name) {
  max-width: 104px;
}

.interaction-help {
  position: absolute;
  z-index: 16;
  top: .85rem;
  right: .85rem;
  width: min(19rem, calc(100% - 1.7rem));
  border: 1px solid #c8beaa;
  border-radius: .55rem;
  background: rgb(255 253 247 / 97%);
  padding: .8rem;
  box-shadow: 0 16px 38px rgb(54 60 52 / 18%);
  color: #485148;
}
.interaction-help header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: .75rem;
}
.interaction-help header strong {
  font-family: ui-serif, "Songti SC", SimSun, serif;
  font-size: .86rem;
}
.interaction-help header button {
  display: grid;
  width: 1.8rem;
  aspect-ratio: 1;
  place-items: center;
  border-radius: 50%;
  color: #687168;
}
.interaction-help header button:hover { background: #eee8da; }
.interaction-help ul {
  display: grid;
  gap: .55rem;
  margin: .7rem 0 0;
  padding: 0;
  list-style: none;
}
.interaction-help li {
  display: grid;
  grid-template-columns: 1.15rem minmax(0, 1fr);
  align-items: start;
  gap: .45rem;
  font-size: .7rem;
  line-height: 1.55;
}
.interaction-help li > svg { margin-top: .12rem; color: #9a5143; }
.interaction-help b { color: #354037; }

.canvas-gesture-hint {
  position: absolute;
  z-index: 10;
  right: .75rem;
  bottom: .7rem;
  display: flex;
  align-items: center;
  gap: .3rem;
  border: 1px solid rgb(187 177 157 / 74%);
  border-radius: 999px;
  background: rgb(255 253 247 / 86%);
  padding: .32rem .55rem;
  color: #677067;
  font-size: .62rem;
  pointer-events: none;
  backdrop-filter: blur(5px);
}
.canvas-gesture-hint svg { width: .78rem; height: .78rem; color: #8f4c3f; }
.canvas-gesture-hint span { color: #b4aa98; }

.graph-help-enter-active,
.graph-help-leave-active { transition: opacity .16s ease, transform .16s ease; }
.graph-help-enter-from,
.graph-help-leave-to { opacity: 0; transform: translateY(-.35rem); }

.canvas-state {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: .55rem;
  color: #59645a;
  text-align: center;
}
.canvas-state span { color: #7b8179; font-size: .75rem; }

.engine-loading,
.graph-limit-note {
  position: absolute;
  z-index: 12;
  display: flex;
  align-items: center;
  gap: .45rem;
  border: 1px solid #c9c0aa;
  background: rgb(255 252 243 / 92%);
  box-shadow: 0 8px 24px rgb(65 70 61 / 12%);
  color: #58635a;
  font-size: .72rem;
}
.engine-loading { top: 1rem; left: 50%; padding: .5rem .75rem; transform: translateX(-50%); }
.graph-limit-note { right: 1rem; bottom: 1rem; padding: .45rem .65rem; }

.canvas-footer {
  min-height: 2.7rem;
  border-top: 1px solid #cec7b5;
  border-bottom: 0;
  color: #7b8079;
  font-size: .63rem;
}
.confidence-line { display: flex; flex-wrap: wrap; gap: .75rem; }
.confidence-line span { display: inline-flex; align-items: center; gap: .25rem; }
.confidence-line i { width: 1.1rem; border-top: 2px solid #52675b; }
.confidence-line [data-confidence="INFERRED"] i { border-top-style: dashed; }
.confidence-line [data-confidence="AMBIGUOUS"] i { border-color: #9c743f; border-top-style: dotted; }
.confidence-line [data-confidence="UNVERIFIED"] i { border-color: #a84d3f; border-top-style: dotted; }

.reader-heading {
  display: flex;
  min-height: 5rem;
  align-items: center;
  gap: .65rem;
  padding: .9rem 1rem;
  border-bottom: 1px solid #d5cfbe;
}
.reader-heading > div { min-width: 0; flex: 1; }
.reader-heading span,
.reader-heading small { display: block; }
.reader-heading span { font-family: ui-serif, "Songti SC", SimSun, serif; font-weight: 800; }
.reader-heading small { margin-top: .25rem; overflow: hidden; color: #797e76; font-size: .67rem; text-overflow: ellipsis; white-space: nowrap; }
.reader-heading button {
  display: grid;
  width: 2rem;
  aspect-ratio: 1;
  flex: 0 0 auto;
  place-items: center;
  color: #6d746d;
}

.reader-body {
  max-height: calc(min(70vh, 51rem) + 2.7rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 1.15rem 1rem 1.5rem;
}

.reader-eyebrow { display: flex; flex-wrap: wrap; gap: .35rem; }
.reader-eyebrow span {
  border: 1px solid #d3c9b6;
  background: #fffaf0;
  padding: .22rem .45rem;
  color: #687167;
  font-size: .64rem;
}
.reader-eyebrow [data-confidence="EXTRACTED"] { border-color: #9ab1a0; color: #3f6652; }
.reader-eyebrow [data-confidence="INFERRED"] { border-style: dashed; color: #596f83; }
.reader-eyebrow [data-confidence="AMBIGUOUS"] { border-style: dotted; color: #946f39; }
.reader-eyebrow [data-confidence="UNVERIFIED"] { border-style: dotted; color: #a04e40; }

.reader-body h2 {
  margin: .85rem 0 .65rem;
  overflow-wrap: anywhere;
  color: #30362f;
  font-family: ui-serif, "Songti SC", SimSun, serif;
  font-size: 1.28rem;
  line-height: 1.45;
}
.summary-copy,
.community-reader > p,
.empty-reader > p {
  color: #5d655d;
  font-size: .8rem;
  line-height: 1.75;
}
.reader-content {
  white-space: pre-wrap;
  color: #454d45;
  font-family: ui-serif, "Songti SC", SimSun, serif;
  font-size: .84rem;
  line-height: 1.9;
}
.reader-source-line {
  display: grid;
  gap: .25rem;
  margin-top: 1.2rem;
  border-top: 1px solid #d4cdbc;
  padding-top: .8rem;
  overflow-wrap: anywhere;
}
.reader-source-line span,
.reader-source-line small { color: #7b8179; font-size: .66rem; }
.reader-source-line strong { color: #59675d; font-size: .72rem; }

.reader-actions { display: grid; grid-template-columns: 1fr 1fr; gap: .45rem; margin-top: 1rem; }
.reader-actions button,
.enter-community-button {
  display: inline-flex;
  min-height: 2.55rem;
  align-items: center;
  justify-content: center;
  gap: .4rem;
  border: 1px solid #cfc6b3;
  background: #fffdf7;
  color: #4e5950;
  font-size: .75rem;
  font-weight: 750;
}
.reader-actions button.primary { border-color: #9d5141; background: #a84d3f; color: white; }

.related-section { margin-top: 1.2rem; border-top: 1px solid #d6cebd; padding-top: .85rem; }
.reader-section-title { display: flex; align-items: center; justify-content: space-between; margin-bottom: .45rem; }
.reader-section-title h3 { margin: 0; font-size: .78rem; }
.reader-section-title span { color: #858a83; font-size: .65rem; }
.related-section > button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: .5rem;
  border-bottom: 1px dashed #ddd6c6;
  padding: .6rem .15rem;
  text-align: left;
}
.related-section button span { min-width: 0; }
.related-section button strong,
.related-section button small { display: block; }
.related-section button strong { overflow: hidden; font-size: .72rem; text-overflow: ellipsis; white-space: nowrap; }
.related-section button small { margin-top: .2rem; color: #858a82; font-size: .62rem; }

.community-stamp {
  display: inline-grid;
  border: 1px solid #bd6958;
  padding: .2rem .4rem;
  color: #a84d3f;
  font-size: .65rem;
}
.community-facts { display: grid; grid-template-columns: 1fr 1fr; margin: 1rem 0; border: 1px solid #d3cbbb; }
.community-facts div { display: flex; flex-direction: column; gap: .25rem; padding: .75rem; }
.community-facts div + div { border-left: 1px solid #d3cbbb; }
.community-facts strong { color: #a04d3e; font-size: .85rem; }
.community-facts span { color: #7b8179; font-size: .65rem; }
.enter-community-button { width: 100%; border-color: #a84d3f; color: #8c4033; }

.empty-reader { text-align: center; }
.empty-ink-mark {
  display: grid;
  width: 4.5rem;
  aspect-ratio: 1;
  margin: 1rem auto;
  place-items: center;
  border: 1px solid #bac5b7;
  border-radius: 50%;
  background: radial-gradient(circle at 40% 35%, #fdfbf3, #dfe6d9);
  color: #58705d;
  font-size: 1.7rem;
}
.empty-reader ol { display: grid; gap: .55rem; margin: 1.2rem 0 0; padding: 0; list-style: none; text-align: left; }
.empty-reader li { display: flex; align-items: center; gap: .55rem; color: #5d655d; font-size: .73rem; }
.empty-reader li span { display: grid; width: 1.55rem; aspect-ratio: 1; place-items: center; border: 1px solid #c9c2b0; color: #9c5141; font-family: serif; }

@media (max-width: 1280px) {
  .landscape-shell { grid-template-columns: 13rem minmax(30rem, 1fr) 18rem; }
}

@media (max-width: 1023px) {
  .graph-page-intro { display: none; }
  .landscape-shell {
    display: block;
    min-height: 0;
    margin-top: 0;
    overflow: hidden;
  }
  .landscape-sidebar-left,
  .landscape-sidebar-right {
    position: absolute;
    z-index: 24;
    top: 3.35rem;
    bottom: 0;
    width: min(21rem, 88vw);
    overflow-y: auto;
    border: 1px solid #c9c2af;
    background-color: #f8f5eb;
    box-shadow: 0 18px 45px rgb(42 49 42 / 24%);
  }
  .landscape-sidebar-left { left: 0; border-left: 0; }
  .landscape-sidebar-right { right: 0; border-right: 0; }
  .mobile-panel-close {
    display: grid;
    width: 2rem;
    aspect-ratio: 1;
    margin-left: auto;
    place-items: center;
    border-radius: 50%;
    color: #687168;
  }
  .landscape-brand { min-height: 4rem; }
  .collection-summary { position: absolute; visibility: hidden; }
  .community-section { padding-bottom: .65rem; }
  .community-list { max-height: none; flex-direction: row; overflow-x: auto; }
  .community-list button { min-width: 12rem; }
  .type-section { padding-top: .7rem; }
  .type-filter-list { grid-template-columns: repeat(3, 1fr); }
  .landscape-canvas { min-height: 32rem; height: 64dvh; max-height: 44rem; }
  .reader-body { max-height: none; }
}

@media (max-width: 639px) {
  .landscape-shell { margin-inline: -.75rem; border-right: 0; border-left: 0; }
  .canvas-heading {
    min-height: 2.85rem;
    justify-content: flex-end;
    padding: .35rem .5rem;
  }
  .canvas-heading-copy { display: none; }
  .canvas-toolstrip { width: 100%; justify-content: flex-end; }
  .canvas-toolstrip button { min-width: 2.1rem; min-height: 2.05rem; padding: .3rem; }
  .canvas-toolstrip button span { display: none; }
  .canvas-metrics { width: 100%; justify-content: space-between; }
  .landscape-canvas { min-height: 31rem; height: calc(100dvh - 10rem); }
  .canvas-footer { display: none; }
  .canvas-gesture-hint { right: .5rem; bottom: .5rem; }
  .confidence-line { gap: .45rem .65rem; }
  .type-filter-list { grid-template-columns: repeat(2, 1fr); }
  .community-list button { min-width: 10.5rem; }
  .reader-actions { grid-template-columns: 1fr; }
}
</style>
