<script setup lang="ts">
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum
} from 'd3-force'
import { adminFetch } from '~~/app/utils/admin-request'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { safeExternalHref } from '~/utils/safe-external-href'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '数字山水知识图谱', robots: 'noindex, nofollow' })

type CollectionId = 'entries' | 'documents' | 'web' | 'structured' | 'claims'

interface GraphNode extends SimulationNodeDatum {
  id: string
  label: string
  type: 'root' | 'collection' | 'topic' | 'source' | 'document' | 'structured'
  count: number
  collection?: 'entries' | 'web' | 'documents'
  filter?: string
  description?: string
  community?: string
  kind?: string
  status?: string
  url?: string | null
  capturedAt?: number
  itemId?: string
}

interface GraphEdge extends SimulationLinkDatum<GraphNode> {
  source: string | GraphNode
  target: string | GraphNode
}

interface GraphPayload {
  summary: { systemTotal: number, retrievalTotal: number, sources: number }
  nodes: GraphNode[]
  edges: Array<{ source: string, target: string }>
  visibleItems?: number
  generatedAt: string
}

const CANVAS_WIDTH = 1200
const CANVAS_HEIGHT = 720
const MIN_ZOOM = 0.55
const MAX_ZOOM = 2.5

const communityOptions: Array<{
  id: CollectionId
  label: string
  shortLabel: string
  color: string
  wash: string
  center: { x: number, y: number }
}> = [
  { id: 'entries', label: '内置知识', shortLabel: '知识', color: '#52705d', wash: '#bfd0b8', center: { x: 350, y: 275 } },
  { id: 'documents', label: '官网正文', shortLabel: '官网', color: '#5f7f99', wash: '#c4d4d8', center: { x: 790, y: 250 } },
  { id: 'web', label: '网页资料', shortLabel: '网页', color: '#b47a3f', wash: '#e2c693', center: { x: 780, y: 535 } },
  { id: 'structured', label: '系统数据', shortLabel: '系统', color: '#7d5f7f', wash: '#d2bfd0', center: { x: 390, y: 545 } },
  { id: 'claims', label: '审核事实', shortLabel: '审核', color: '#a65343', wash: '#dab6a9', center: { x: 595, y: 400 } }
]
const communityById = new Map(communityOptions.map(item => [item.id, item]))

const loading = ref(false)
const errorMessage = ref('')
const graph = ref<GraphPayload>({
  summary: { systemTotal: 0, retrievalTotal: 0, sources: 0 },
  nodes: [], edges: [], generatedAt: ''
})
const visualNodes = ref<GraphNode[]>([])
const visualEdges = ref<GraphEdge[]>([])
const selectedId = ref<string | null>(null)
const hoveredId = ref<string | null>(null)
const queryText = ref('')
const activeCollection = ref<'all' | CollectionId>('all')
const transform = ref({ x: 0, y: 0, k: 1 })
const svgElement = ref<SVGSVGElement | null>(null)

let simulation: Simulation<GraphNode, GraphEdge> | null = null
let pointerMode: 'pan' | 'node' | null = null
let pointerId: number | null = null
let pointerStart = { x: 0, y: 0 }
let transformStart = { x: 0, y: 0 }
let draggedNode: GraphNode | null = null
let dragMoved = false
let suppressNextClick = false

const nodeMap = computed(() => new Map(visualNodes.value.map(node => [node.id, node])))
const selectedNode = computed(() => selectedId.value ? nodeMap.value.get(selectedId.value) ?? null : null)
const selectedExternalUrl = computed(() => safeExternalHref(selectedNode.value?.url) ?? null)
const normalizedQuery = computed(() => queryText.value.trim().toLocaleLowerCase('zh-CN'))
const matchingIds = computed(() => {
  if (!normalizedQuery.value) return new Set<string>()
  return new Set(visualNodes.value
    .filter(node => [node.label, node.description, node.community, node.kind]
      .some(value => String(value ?? '').toLocaleLowerCase('zh-CN').includes(normalizedQuery.value)))
    .map(node => node.id))
})

function collectionFor(node: GraphNode): CollectionId | null {
  if (communityById.has(node.id as CollectionId)) return node.id as CollectionId
  if (node.collection) return node.collection
  if (node.id.startsWith('structured:')) return 'structured'
  if (node.id.startsWith('claim:')) return 'claims'
  return null
}

const visibleNodes = computed(() => visualNodes.value.filter((node) => {
  if (activeCollection.value === 'all' || node.id === 'root') return true
  return collectionFor(node) === activeCollection.value
}))
const visibleNodeIds = computed(() => new Set(visibleNodes.value.map(node => node.id)))

function endpointId(endpoint: string | GraphNode): string {
  return typeof endpoint === 'string' ? endpoint : endpoint.id
}

const visibleEdges = computed(() => visualEdges.value.filter(edge => (
  visibleNodeIds.value.has(endpointId(edge.source))
  && visibleNodeIds.value.has(endpointId(edge.target))
)))

const emphasisId = computed(() => hoveredId.value ?? selectedId.value)
const relatedIds = computed(() => {
  const ids = new Set<string>()
  if (!emphasisId.value) return ids
  ids.add(emphasisId.value)
  for (const edge of visualEdges.value) {
    const source = endpointId(edge.source)
    const target = endpointId(edge.target)
    if (source === emphasisId.value) ids.add(target)
    if (target === emphasisId.value) ids.add(source)
  }
  return ids
})

const graphStats = computed(() => [
  `${visualNodes.value.length} 个可见节点`,
  `${graph.value.edges.length} 条关系`,
  `${graph.value.summary.retrievalTotal} 条 AI 可检索资料`
])

function deterministicOffset(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) | 0
  return Math.abs(hash)
}

function centerFor(node: GraphNode): { x: number, y: number } {
  if (node.id === 'root') return { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }
  const collection = collectionFor(node)
  return communityById.get(collection ?? 'entries')?.center ?? { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }
}

function initializeGraph(payload: GraphPayload): void {
  simulation?.stop()
  const nodes = payload.nodes.map((node) => {
    const center = centerFor(node)
    const hash = deterministicOffset(node.id)
    return {
      ...node,
      x: center.x + (hash % 130) - 65,
      y: center.y + (Math.floor(hash / 137) % 110) - 55
    }
  })
  const edges: GraphEdge[] = payload.edges.map(edge => ({ ...edge }))
  visualNodes.value = nodes
  visualEdges.value = edges
  let tick = 0
  simulation = forceSimulation<GraphNode>(nodes)
    .alpha(0.95)
    .alphaDecay(0.028)
    .velocityDecay(0.34)
    .force('link', forceLink<GraphNode, GraphEdge>(edges)
      .id(node => node.id)
      .distance(edge => endpointId(edge.source) === 'root' ? 155 : 78)
      .strength(0.42))
    .force('charge', forceManyBody<GraphNode>().strength(node => node.id === 'root' ? -900 : node.count > 1 ? -260 : -115))
    .force('collide', forceCollide<GraphNode>()
      .radius(node => Math.max(nodeRadius(node) + 9, nodeWidth(node) / 2 + 7))
      .iterations(3))
    .force('x', forceX<GraphNode>(node => centerFor(node).x)
      .strength(node => node.id === 'root' ? 0.5 : node.type === 'collection' ? 0.18 : 0.045))
    .force('y', forceY<GraphNode>(node => centerFor(node).y)
      .strength(node => node.id === 'root' ? 0.5 : node.type === 'collection' ? 0.18 : 0.045))
    .on('tick', () => {
      tick += 1
      for (const node of nodes) {
        const halfWidth = nodeWidth(node) / 2 + 18
        const halfHeight = nodeRadius(node) + 18
        node.x = Math.max(halfWidth, Math.min(CANVAS_WIDTH - halfWidth, node.x ?? CANVAS_WIDTH / 2))
        node.y = Math.max(halfHeight, Math.min(CANVAS_HEIGHT - halfHeight, node.y ?? CANVAS_HEIGHT / 2))
      }
      if (tick % 2 === 0) visualNodes.value = [...nodes]
    })
}

function nodeRadius(node: GraphNode): number {
  if (node.id === 'root') return 58
  if (node.type === 'collection') return 48
  if (node.count > 1) return 38
  return 26
}

function nodeWidth(node: GraphNode): number {
  if (node.id === 'root') return 142
  if (node.type === 'collection') return 120
  return Math.max(78, Math.min(154, node.label.length * 12 + 26))
}

function nodeFill(node: GraphNode): string {
  if (node.id === 'root') return '#f8f5ec'
  const collection = collectionFor(node)
  if (node.type === 'collection') return communityById.get(collection ?? 'entries')?.color ?? '#3f4d43'
  return '#fffdf7'
}

function nodeStroke(node: GraphNode): string {
  const collection = collectionFor(node)
  return communityById.get(collection ?? 'entries')?.color ?? '#71695f'
}

function nodeOpacity(node: GraphNode): number {
  if (normalizedQuery.value && !matchingIds.value.has(node.id) && node.id !== 'root') return 0.18
  if (emphasisId.value && !relatedIds.value.has(node.id)) return 0.28
  return 1
}

function edgeOpacity(edge: GraphEdge): number {
  if (!emphasisId.value) return 0.28
  return [endpointId(edge.source), endpointId(edge.target)].includes(emphasisId.value) ? 0.9 : 0.07
}

function edgePoint(edge: GraphEdge, endpoint: 'source' | 'target'): GraphNode | undefined {
  const value = edge[endpoint]
  return typeof value === 'string' ? nodeMap.value.get(value) : value
}

function shortLabel(value: string, limit = 13): string {
  return value.length > limit ? `${value.slice(0, limit)}...` : value
}

function graphPoint(event: PointerEvent | WheelEvent): { x: number, y: number } {
  const rect = svgElement.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (event.clientX - rect.left) * CANVAS_WIDTH / rect.width,
    y: (event.clientY - rect.top) * CANVAS_HEIGHT / rect.height
  }
}

function worldPoint(event: PointerEvent): { x: number, y: number } {
  const point = graphPoint(event)
  return {
    x: (point.x - transform.value.x) / transform.value.k,
    y: (point.y - transform.value.y) / transform.value.k
  }
}

function beginPan(event: PointerEvent): void {
  if (event.button !== 0) return
  pointerMode = 'pan'
  pointerId = event.pointerId
  pointerStart = graphPoint(event)
  transformStart = { x: transform.value.x, y: transform.value.y }
  svgElement.value?.setPointerCapture(event.pointerId)
}

function beginNodeDrag(node: GraphNode, event: PointerEvent): void {
  if (event.button !== 0) return
  pointerMode = 'node'
  pointerId = event.pointerId
  draggedNode = node
  dragMoved = false
  pointerStart = graphPoint(event)
  node.fx = node.x
  node.fy = node.y
  svgElement.value?.setPointerCapture(event.pointerId)
  simulation?.alphaTarget(0.22).restart()
}

function movePointer(event: PointerEvent): void {
  if (event.pointerId !== pointerId || !pointerMode) return
  const point = graphPoint(event)
  if (Math.hypot(point.x - pointerStart.x, point.y - pointerStart.y) > 4) dragMoved = true
  if (pointerMode === 'pan') {
    transform.value = {
      ...transform.value,
      x: transformStart.x + point.x - pointerStart.x,
      y: transformStart.y + point.y - pointerStart.y
    }
    return
  }
  if (draggedNode) {
    const world = worldPoint(event)
    draggedNode.fx = world.x
    draggedNode.fy = world.y
  }
}

function endPointer(event: PointerEvent): void {
  if (event.pointerId !== pointerId) return
  if (pointerMode === 'node' && draggedNode) {
    draggedNode.fx = null
    draggedNode.fy = null
    simulation?.alphaTarget(0)
    suppressNextClick = dragMoved
    setTimeout(() => { suppressNextClick = false }, 0)
  }
  pointerMode = null
  pointerId = null
  draggedNode = null
  try {
    svgElement.value?.releasePointerCapture(event.pointerId)
  } catch {
    // Pointer capture may already be released when leaving the canvas.
  }
}

function zoomAt(point: { x: number, y: number }, nextZoom: number): void {
  const previous = transform.value
  const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextZoom))
  const worldX = (point.x - previous.x) / previous.k
  const worldY = (point.y - previous.y) / previous.k
  transform.value = {
    k,
    x: point.x - worldX * k,
    y: point.y - worldY * k
  }
}

function handleWheel(event: WheelEvent): void {
  zoomAt(graphPoint(event), transform.value.k * Math.exp(-event.deltaY * 0.0014))
}

function changeZoom(multiplier: number): void {
  zoomAt({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }, transform.value.k * multiplier)
}

function resetView(): void {
  transform.value = { x: 0, y: 0, k: 1 }
  activeCollection.value = 'all'
}

function focusCollection(id: CollectionId): void {
  activeCollection.value = id
  const center = communityById.get(id)?.center ?? { x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 }
  const k = 1.35
  transform.value = {
    k,
    x: CANVAS_WIDTH / 2 - center.x * k,
    y: CANVAS_HEIGHT / 2 - center.y * k
  }
}

function selectNode(node: GraphNode): void {
  if (suppressNextClick) return
  selectedId.value = node.id
}

function selectFirstMatch(): void {
  const query = normalizedQuery.value
  const match = visualNodes.value
    .filter(node => matchingIds.value.has(node.id))
    .sort((left, right) => {
      const rank = (node: GraphNode) => {
        const label = node.label.toLocaleLowerCase('zh-CN')
        if (label === query) return 0
        if (label.startsWith(query)) return 1
        if (label.includes(query)) return 2
        return 3
      }
      return rank(left) - rank(right)
    })[0]
  if (!match) return
  selectedId.value = match.id
  const k = Math.max(1.35, transform.value.k)
  transform.value = {
    k,
    x: CANVAS_WIDTH / 2 - (match.x ?? CANVAS_WIDTH / 2) * k,
    y: CANVAS_HEIGHT / 2 - (match.y ?? CANVAS_HEIGHT / 2) * k
  }
}

async function openNodeLibrary(node: GraphNode): Promise<void> {
  if (!node.collection) return
  await navigateTo({
    path: '/admin/knowledge/library',
    query: {
      collection: node.collection,
      ...(node.itemId ? { q: node.label } : node.filter ? { category: node.filter } : {})
    }
  })
}

function formatDate(value?: number): string {
  if (!value) return '未记录更新时间'
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(value)
}

async function loadGraph(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    const payload = await adminFetch<GraphPayload>('/api/admin/knowledge/graph')
    graph.value = payload
    initializeGraph(payload)
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

onMounted(loadGraph)
onBeforeUnmount(() => simulation?.stop())
</script>

<template>
  <div class="mx-auto max-w-[96rem] space-y-4">
    <AdminPageHeader
      title="数字山水知识图谱"
      description="把内置知识、官网正文、网页资料与系统内容放进同一张可探索的知识地图。"
      icon="i-lucide-git-fork"
      eyebrow="知识库"
    >
      <template #actions>
        <UButton
          to="/admin/knowledge/library"
          icon="i-lucide-database"
          label="全部资料"
          color="neutral"
          variant="outline"
        />
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新图谱"
          :loading="loading"
          @click="loadGraph"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="errorMessage"
      class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <section class="graph-shell" aria-label="数字山水知识图谱工作区">
      <header class="graph-toolbar">
        <div class="graph-search">
          <UInput
            v-model="queryText"
            icon="i-lucide-search"
            placeholder="搜索节点、主题或正文摘要"
            aria-label="搜索知识图谱"
            @keyup.enter="selectFirstMatch"
          />
          <span v-if="normalizedQuery" class="graph-search-count">
            {{ matchingIds.size }} 个结果
          </span>
        </div>

        <div class="graph-communities" aria-label="知识社区筛选">
          <button
            type="button"
            class="community-chip"
            :class="{ active: activeCollection === 'all' }"
            @click="resetView"
          >
            全部
          </button>
          <button
            v-for="item in communityOptions"
            :key="item.id"
            type="button"
            class="community-chip"
            :class="{ active: activeCollection === item.id }"
            :style="{ '--community-color': item.color }"
            @click="focusCollection(item.id)"
          >
            <span class="community-dot" />{{ item.shortLabel }}
          </button>
        </div>

        <div class="graph-actions">
          <UButton
            icon="i-lucide-minus"
            aria-label="缩小图谱"
            title="缩小"
            color="neutral"
            variant="ghost"
            @click="changeZoom(0.82)"
          />
          <span class="zoom-value">{{ Math.round(transform.k * 100) }}%</span>
          <UButton
            icon="i-lucide-plus"
            aria-label="放大图谱"
            title="放大"
            color="neutral"
            variant="ghost"
            @click="changeZoom(1.22)"
          />
          <UButton
            icon="i-lucide-scan"
            aria-label="复位图谱"
            title="复位"
            color="neutral"
            variant="ghost"
            @click="resetView"
          />
        </div>
      </header>

      <div class="graph-meta">
        <span v-for="item in graphStats" :key="item">{{ item }}</span>
        <span class="graph-meta-note">滚轮缩放 · 拖动画布 · 拖动节点</span>
      </div>

      <div class="graph-stage">
        <div
          v-if="loading && !visualNodes.length"
          class="graph-loading"
        >
          <UIcon name="i-lucide-loader-circle" class="size-7 animate-spin" />
          <span>正在展开知识地图</span>
        </div>

        <svg
          v-else
          ref="svgElement"
          viewBox="0 0 1200 720"
          class="graph-canvas"
          role="img"
          aria-label="仰恩数字山水知识图谱"
          @pointerdown="beginPan"
          @pointermove="movePointer"
          @pointerup="endPointer"
          @pointercancel="endPointer"
          @wheel.prevent="handleWheel"
        >
          <defs>
            <filter id="wash-blur" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="24" />
            </filter>
            <filter id="node-shadow" x="-30%" y="-50%" width="160%" height="200%">
              <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#5f5548" flood-opacity="0.18" />
            </filter>
          </defs>

          <g :transform="`translate(${transform.x} ${transform.y}) scale(${transform.k})`">
            <g class="community-washes" aria-hidden="true">
              <ellipse
                v-for="item in communityOptions"
                :key="item.id"
                :cx="item.center.x"
                :cy="item.center.y"
                rx="215"
                ry="150"
                :fill="item.wash"
                :opacity="activeCollection === 'all' || activeCollection === item.id ? 0.5 : 0.12"
                filter="url(#wash-blur)"
              />
            </g>

            <g class="graph-edges" aria-hidden="true">
              <line
                v-for="(edge, index) in visibleEdges"
                :key="`${endpointId(edge.source)}-${endpointId(edge.target)}-${index}`"
                :x1="edgePoint(edge, 'source')?.x"
                :y1="edgePoint(edge, 'source')?.y"
                :x2="edgePoint(edge, 'target')?.x"
                :y2="edgePoint(edge, 'target')?.y"
                :stroke="emphasisId && [endpointId(edge.source), endpointId(edge.target)].includes(emphasisId) ? '#355b48' : '#6d756e'"
                :stroke-width="emphasisId && [endpointId(edge.source), endpointId(edge.target)].includes(emphasisId) ? 1.8 : 0.85"
                :opacity="edgeOpacity(edge)"
              />
            </g>

            <g
              v-for="node in visibleNodes"
              :key="node.id"
              :transform="`translate(${node.x ?? 0} ${node.y ?? 0})`"
              class="graph-node"
              :class="{
                selected: selectedId === node.id,
                matched: matchingIds.has(node.id),
                collection: node.type === 'collection' || node.id === 'root'
              }"
              :opacity="nodeOpacity(node)"
              role="button"
              tabindex="0"
              :aria-label="`${node.label}，${node.count} 条`"
              data-graph-node="true"
              @pointerdown.stop="beginNodeDrag(node, $event)"
              @mouseenter="hoveredId = node.id"
              @mouseleave="hoveredId = null"
              @click.stop="selectNode(node)"
              @keydown.enter.stop="selectNode(node)"
            >
              <path
                v-if="node.id !== 'root'"
                :d="`M ${-nodeWidth(node) / 2 + 8} -25 h 25 l 7 7 h ${nodeWidth(node) - 40} v 48 h ${-nodeWidth(node)} v -48 h 8 z`"
                :fill="nodeFill(node)"
                :stroke="nodeStroke(node)"
                :stroke-width="selectedId === node.id ? 2.5 : 1.1"
                filter="url(#node-shadow)"
              />
              <rect
                v-else
                :x="-nodeWidth(node) / 2"
                y="-34"
                :width="nodeWidth(node)"
                height="68"
                rx="6"
                :fill="nodeFill(node)"
                :stroke="nodeStroke(node)"
                stroke-width="2.4"
                filter="url(#node-shadow)"
              />
              <text
                text-anchor="middle"
                :y="node.id === 'root' ? -3 : 3"
                :fill="node.type === 'collection' ? '#ffffff' : '#292722'"
                :font-size="node.id === 'root' ? 15 : node.type === 'collection' ? 13 : 11"
                font-weight="700"
              >{{ shortLabel(node.label, node.id === 'root' ? 10 : 13) }}</text>
              <text
                v-if="node.id === 'root' || node.type === 'collection' || node.count > 1"
                text-anchor="middle"
                :y="node.id === 'root' ? 19 : 18"
                :fill="node.type === 'collection' ? '#ffffff' : '#675f54'"
                font-size="9"
                opacity="0.78"
              >{{ node.count }} 条</text>
            </g>
          </g>
        </svg>

        <div class="graph-legend" aria-label="图例">
          <strong>图例</strong>
          <span v-for="item in communityOptions.slice(0, 4)" :key="item.id">
            <i :style="{ backgroundColor: item.color }" />{{ item.shortLabel }}
          </span>
        </div>

        <div class="graph-minimap" aria-label="小地图">
          <div class="minimap-title">小地图</div>
          <svg viewBox="0 0 180 108" aria-hidden="true">
            <rect x="1" y="1" width="178" height="106" rx="5" fill="#faf6eb" stroke="#b8ab98" />
            <circle
              v-for="node in visibleNodes"
              :key="node.id"
              :cx="(node.x ?? 0) / 1200 * 180"
              :cy="(node.y ?? 0) / 720 * 108"
              :r="node.type === 'collection' ? 2.6 : 1.4"
              :fill="nodeStroke(node)"
              opacity="0.78"
            />
          </svg>
        </div>

        <Transition name="graph-drawer">
          <aside v-if="selectedNode" class="node-drawer" aria-label="节点详情">
            <div class="node-drawer-header">
              <div>
                <p>{{ communityById.get(collectionFor(selectedNode) ?? 'entries')?.label ?? '知识节点' }}</p>
                <h2>{{ selectedNode.label }}</h2>
              </div>
              <UButton
                icon="i-lucide-x"
                aria-label="关闭节点详情"
                color="neutral"
                variant="ghost"
                @click="selectedId = null"
              />
            </div>
            <div class="node-drawer-body">
              <div class="node-facts">
                <span>{{ selectedNode.kind || selectedNode.type }}</span>
                <span>{{ selectedNode.count }} 条</span>
                <span v-if="selectedNode.capturedAt">{{ formatDate(selectedNode.capturedAt) }}</span>
              </div>
              <p v-if="selectedNode.description" class="node-description">
                {{ selectedNode.description }}
              </p>
              <p v-else class="node-description muted">
                这是知识地图中的汇总节点，可进入对应分支查看完整资料。
              </p>
              <div class="node-actions">
                <UButton
                  v-if="selectedNode.collection"
                  icon="i-lucide-list-tree"
                  label="查看对应资料"
                  block
                  @click="openNodeLibrary(selectedNode)"
                />
                <UButton
                  v-if="collectionFor(selectedNode) && selectedNode.type === 'collection'"
                  icon="i-lucide-focus"
                  label="只看这个分支"
                  color="neutral"
                  variant="outline"
                  block
                  @click="focusCollection(collectionFor(selectedNode)!)"
                />
                <UButton
                  v-if="selectedExternalUrl"
                  :to="selectedExternalUrl"
                  target="_blank"
                  icon="i-lucide-external-link"
                  label="打开原始来源"
                  color="neutral"
                  variant="outline"
                  block
                />
              </div>
            </div>
          </aside>
        </Transition>
      </div>

      <footer class="graph-footer">
        <span>{{ graph.generatedAt ? `更新于 ${formatDate(Date.parse(graph.generatedAt))}` : '等待图谱数据' }}</span>
        <span>交互与视觉理念参考 llm-wiki 数字山水图谱</span>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.graph-shell {
  overflow: hidden;
  border: 1px solid #d7d0c4;
  border-radius: 6px;
  background: #f7f4eb;
  box-shadow: 0 10px 30px rgb(62 54 42 / 8%);
}

.graph-toolbar {
  display: grid;
  grid-template-columns: minmax(15rem, 1fr) auto auto;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid #d8d0c2;
  background: rgb(255 253 248 / 92%);
}

.graph-search {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

.graph-search :deep(.relative) { width: min(100%, 26rem); }
.graph-search-count, .zoom-value { color: #736b60; font-size: 11px; white-space: nowrap; }
.graph-communities, .graph-actions { display: flex; align-items: center; gap: 4px; }

.community-chip {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0 9px;
  color: #615b52;
  font-size: 12px;
  font-weight: 650;
}

.community-chip:hover { background: #f0ece2; }
.community-chip.active { border-color: #8f8577; background: #fffdf8; color: #27241f; }
.community-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--community-color, #5c6f61); }

.graph-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 18px;
  padding: 8px 15px;
  border-bottom: 1px dashed #d8d0c2;
  color: #676157;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.graph-meta-note { margin-left: auto; color: #8a8175; }

.graph-stage {
  position: relative;
  min-height: 36rem;
  aspect-ratio: 5 / 3;
  overflow: hidden;
  background-color: #f8f4e9;
  background-image:
    linear-gradient(rgb(105 94 77 / 6%) 1px, transparent 1px),
    linear-gradient(90deg, rgb(105 94 77 / 6%) 1px, transparent 1px);
  background-size: 28px 28px;
}

.graph-stage::before {
  position: absolute;
  z-index: 1;
  top: 0;
  bottom: 0;
  left: 48px;
  width: 1px;
  background: #bc675b;
  content: '';
  opacity: 0.5;
  pointer-events: none;
}

.graph-canvas { display: block; width: 100%; height: 100%; min-height: 36rem; cursor: grab; touch-action: none; user-select: none; }
.graph-canvas:active { cursor: grabbing; }
.graph-node { cursor: pointer; transition: opacity 160ms ease; outline: none; }
.graph-node:hover, .graph-node:focus-visible { opacity: 1 !important; }
.graph-node.matched path, .graph-node.matched rect { stroke-width: 3; }
.graph-node.selected { filter: saturate(1.15); }
.graph-node text { pointer-events: none; letter-spacing: 0; }
.graph-edges line { transition: opacity 160ms ease, stroke-width 160ms ease; }

.graph-loading {
  display: grid;
  position: absolute;
  inset: 0;
  place-content: center;
  gap: 10px;
  color: #696157;
  font-size: 13px;
  text-align: center;
}

.graph-legend, .graph-minimap {
  position: absolute;
  z-index: 3;
  border: 1px solid #bdb3a4;
  border-radius: 6px;
  background: rgb(255 252 244 / 92%);
  box-shadow: 0 5px 16px rgb(67 57 43 / 10%);
  backdrop-filter: blur(7px);
}

.graph-legend { bottom: 18px; left: 18px; display: grid; gap: 7px; width: 126px; padding: 11px; font-size: 11px; color: #625c53; }
.graph-legend strong { color: #2d2924; font-size: 13px; }
.graph-legend span { display: flex; align-items: center; gap: 7px; }
.graph-legend i { width: 9px; height: 9px; border-radius: 2px; }
.graph-minimap { top: 14px; right: 14px; width: 182px; overflow: hidden; }
.minimap-title { padding: 5px 8px 3px; color: #746c60; font-size: 10px; }
.graph-minimap svg { display: block; width: 100%; }

.node-drawer {
  position: absolute;
  z-index: 5;
  top: 14px;
  right: 14px;
  bottom: 14px;
  display: flex;
  width: min(22rem, calc(100% - 28px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #a99e8d;
  border-radius: 6px;
  background: rgb(255 253 247 / 97%);
  box-shadow: 0 16px 40px rgb(52 45 35 / 20%);
}

.node-drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid #e0d8cc; }
.node-drawer-header p { color: #8d5649; font-size: 11px; font-weight: 700; }
.node-drawer-header h2 { margin-top: 5px; color: #27231f; font-size: 17px; font-weight: 750; line-height: 1.45; }
.node-drawer-body { overflow-y: auto; padding: 16px; }
.node-facts { display: flex; flex-wrap: wrap; gap: 6px; }
.node-facts span { border: 1px solid #ddd4c7; border-radius: 4px; background: #f6f1e7; padding: 4px 7px; color: #6e665b; font-size: 10px; }
.node-description { margin-top: 15px; white-space: pre-line; color: #48433c; font-size: 13px; line-height: 1.8; }
.node-description.muted { color: #81786c; }
.node-actions { display: grid; gap: 8px; margin-top: 18px; padding-top: 15px; border-top: 1px solid #e5ddd1; }
.graph-drawer-enter-active, .graph-drawer-leave-active { transition: transform 180ms ease, opacity 180ms ease; }
.graph-drawer-enter-from, .graph-drawer-leave-to { transform: translateX(18px); opacity: 0; }

.graph-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-top: 1px solid #d8d0c2;
  background: #fffdf8;
  color: #8a8175;
  font-size: 10px;
}

@media (max-width: 1024px) {
  .graph-toolbar { grid-template-columns: 1fr auto; }
  .graph-communities { grid-column: 1 / -1; order: 3; overflow-x: auto; padding-bottom: 2px; }
  .graph-stage { min-height: 34rem; aspect-ratio: auto; }
  .graph-canvas { min-height: 34rem; }
}

@media (max-width: 640px) {
  .graph-toolbar { grid-template-columns: minmax(0, 1fr); padding: 10px; }
  .graph-actions { position: absolute; z-index: 6; right: 10px; margin-top: 130px; border: 1px solid #d2c9bc; border-radius: 6px; background: #fffdf8; }
  .graph-search-count, .zoom-value, .graph-meta-note { display: none; }
  .graph-stage, .graph-canvas { min-height: 31rem; }
  .graph-stage::before { left: 24px; }
  .graph-minimap { width: 126px; }
  .graph-legend { bottom: 10px; left: 10px; width: 104px; }
  .graph-legend span:nth-of-type(n+4) { display: none; }
  .node-drawer { top: auto; right: 8px; bottom: 8px; left: 8px; width: auto; max-height: 64%; }
  .graph-footer { flex-direction: column; }
}
</style>
