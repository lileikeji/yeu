<script setup lang="ts">
import { adminFetch } from '~~/app/utils/admin-request'
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '数字山水知识图谱', robots: 'noindex, nofollow' })

interface GraphNode {
  id: string
  label: string
  type: 'root' | 'collection' | 'topic' | 'source' | 'document' | 'structured'
  count: number
  collection?: 'entries' | 'web' | 'documents'
  filter?: string
}

interface GraphEdge { source: string, target: string }
interface GraphPayload {
  summary: { systemTotal: number, retrievalTotal: number, sources: number }
  nodes: GraphNode[]
  edges: GraphEdge[]
  generatedAt: string
}

interface PositionedNode extends GraphNode { x: number, y: number }

const loading = ref(false)
const errorMessage = ref('')
const graph = ref<GraphPayload>({
  summary: { systemTotal: 0, retrievalTotal: 0, sources: 0 }, nodes: [], edges: [], generatedAt: ''
})
const hoveredId = ref<string | null>(null)

const collectionIds = ['entries', 'documents', 'web', 'structured', 'claims']
const positionedNodes = computed<PositionedNode[]>(() => {
  const center = { x: 600, y: 380 }
  const positions = new Map<string, { x: number, y: number }>([['root', center]])
  collectionIds.forEach((id, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / collectionIds.length)
    positions.set(id, { x: center.x + Math.cos(angle) * 215, y: center.y + Math.sin(angle) * 175 })
  })
  collectionIds.forEach((parentId, parentIndex) => {
    const children = graph.value.edges.filter(edge => edge.source === parentId).map(edge => edge.target)
    const centerAngle = -Math.PI / 2 + parentIndex * (Math.PI * 2 / collectionIds.length)
    children.forEach((id, childIndex) => {
      const spread = Math.min(1.1, children.length * 0.13)
      const angle = centerAngle + (children.length === 1 ? 0 : -spread / 2 + childIndex * spread / (children.length - 1))
      const radiusX = 485
      const radiusY = 315
      positions.set(id, { x: center.x + Math.cos(angle) * radiusX, y: center.y + Math.sin(angle) * radiusY })
    })
  })
  return graph.value.nodes.map(node => ({ ...node, ...(positions.get(node.id) ?? center) }))
})
const positionMap = computed(() => new Map(positionedNodes.value.map(node => [node.id, node])))

function nodeFill(type: GraphNode['type']): string {
  return ({ root: '#14532d', collection: '#18181b', topic: '#dcfce7', source: '#dbeafe', document: '#fef3c7', structured: '#f3e8ff' } as Record<string, string>)[type] ?? '#f4f4f5'
}

function nodeText(type: GraphNode['type']): string {
  return ['root', 'collection'].includes(type) ? '#ffffff' : '#18181b'
}

async function openNode(node: GraphNode): Promise<void> {
  if (!node.collection) return
  await navigateTo({
    path: '/admin/knowledge/library',
    query: {
      collection: node.collection,
      ...(node.filter ? { category: node.filter } : {})
    }
  })
}

async function loadGraph(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    graph.value = await adminFetch<GraphPayload>('/api/admin/knowledge/graph')
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
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-5">
    <AdminPageHeader
      title="数字山水知识图谱"
      description="把系统现有资料按知识来源和主题连起来，节点数量来自当前数据库。"
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

    <section class="grid grid-cols-3 gap-3">
      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <p class="text-xs text-zinc-500">
          图谱覆盖数据
        </p>
        <p class="mt-2 text-xl font-bold tabular-nums text-zinc-950">
          {{ graph.summary.systemTotal }}
        </p>
      </div>
      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <p class="text-xs text-zinc-500">
          AI 可检索资料
        </p>
        <p class="mt-2 text-xl font-bold tabular-nums text-zinc-950">
          {{ graph.summary.retrievalTotal }}
        </p>
      </div>
      <div class="rounded-md border border-zinc-200 bg-white p-4">
        <p class="text-xs text-zinc-500">
          登记来源
        </p>
        <p class="mt-2 text-xl font-bold tabular-nums text-zinc-950">
          {{ graph.summary.sources }}
        </p>
      </div>
    </section>

    <section
      class="overflow-hidden rounded-md border border-zinc-200 bg-white"
      aria-label="知识图谱画布"
    >
      <div class="border-b border-zinc-100 px-4 py-3">
        <p class="text-sm font-semibold text-zinc-950">
          资料关系
        </p>
        <p class="mt-1 text-xs text-zinc-500">
          点击内置知识、官网正文或网页来源节点，可查看对应资料。
        </p>
      </div>
      <div
        v-if="loading && !graph.nodes.length"
        class="grid min-h-[32rem] place-items-center text-zinc-500"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-7 animate-spin"
        />
      </div>
      <div
        v-else
        class="overflow-x-auto bg-zinc-50/60"
      >
        <svg
          viewBox="0 0 1200 760"
          class="block h-auto min-h-[34rem] min-w-[62rem] w-full"
          role="img"
          aria-label="仰恩数字山水知识图谱"
        >
          <g aria-hidden="true">
            <line
              v-for="edge in graph.edges"
              :key="`${edge.source}-${edge.target}`"
              :x1="positionMap.get(edge.source)?.x"
              :y1="positionMap.get(edge.source)?.y"
              :x2="positionMap.get(edge.target)?.x"
              :y2="positionMap.get(edge.target)?.y"
              :stroke="hoveredId && [edge.source, edge.target].includes(hoveredId) ? '#15803d' : '#d4d4d8'"
              :stroke-width="hoveredId && [edge.source, edge.target].includes(hoveredId) ? 2.5 : 1.2"
            />
          </g>
          <g
            v-for="node in positionedNodes"
            :key="node.id"
            :transform="`translate(${node.x} ${node.y})`"
            :class="node.collection ? 'cursor-pointer' : ''"
            role="button"
            :tabindex="node.collection ? 0 : -1"
            @mouseenter="hoveredId = node.id"
            @mouseleave="hoveredId = null"
            @click="openNode(node)"
            @keydown.enter="openNode(node)"
          >
            <title>{{ node.label }}，{{ node.count }} 条</title>
            <rect
              :x="node.type === 'root' ? -78 : -66"
              :y="node.type === 'root' ? -34 : -27"
              :width="node.type === 'root' ? 156 : 132"
              :height="node.type === 'root' ? 68 : 54"
              rx="6"
              :fill="nodeFill(node.type)"
              :stroke="hoveredId === node.id ? '#16a34a' : '#d4d4d8'"
              :stroke-width="hoveredId === node.id ? 3 : 1"
            />
            <text
              text-anchor="middle"
              y="-3"
              :fill="nodeText(node.type)"
              font-size="13"
              font-weight="700"
            >{{ node.label.length > 15 ? `${node.label.slice(0, 14)}…` : node.label }}</text>
            <text
              text-anchor="middle"
              y="17"
              :fill="nodeText(node.type)"
              font-size="11"
              opacity="0.78"
            >{{ node.count }} 条</text>
          </g>
        </svg>
      </div>
    </section>

    <p class="text-xs leading-5 text-zinc-500">
      这里展示的是现有数据的实时关系，不会把网页搜索缓存冒充为人工审核事实。事实审核通过后会自动进入“审核事实”分支。
    </p>
  </div>
</template>
