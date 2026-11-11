<script setup lang="ts">
import type {
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  Texture,
  WebGLRenderer
} from 'three'

interface CampusPanoramaScene {
  label: string
  panoId: string
  heading: number
  pitch: number
}

interface PanoramaTileLevel {
  zoom: number
  columns: number
  rows: number
}

const emit = defineEmits<{
  ready: []
  error: []
}>()

const scenes: CampusPanoramaScene[] = [
  { label: '大门', panoId: '1000170000150119145327310IN', heading: 358, pitch: 6 },
  { label: '和昌教学楼1', panoId: '1000170000150119145333354IN', heading: 178, pitch: 6 },
  { label: '和昌教学楼2', panoId: '1000170000150119145130732IN', heading: 94, pitch: 6 },
  { label: '普照教学楼', panoId: '1000170000150119145349891IN', heading: 344, pitch: 6 },
  { label: '黑龙江楼', panoId: '1000170000150119145439271IN', heading: 6, pitch: 6 },
  { label: '吉林楼', panoId: '1000170000150119145113581IN', heading: 342, pitch: 6 },
  { label: '辽宁楼', panoId: '1000170000150119145429841IN', heading: 355, pitch: 6 },
  { label: '湖北楼', panoId: '1000170000150119145409789IN', heading: 356, pitch: 6 },
  { label: '湖南楼', panoId: '1000170000150119145410585IN', heading: 351, pitch: 6 },
  { label: '甘肃楼', panoId: '1000170000150119145411365IN', heading: 333, pitch: 6 },
  { label: '体育馆', panoId: '1000170000150119145048627IN', heading: 342, pitch: 6 },
  { label: '医务所', panoId: '1000170000150119145112856IN', heading: 355, pitch: 6 },
  { label: '学生公寓1', panoId: '1000170000150119145250614IN', heading: 42, pitch: 6 },
  { label: '学生公寓2', panoId: '1000170000150119145227766IN', heading: 227, pitch: 6 },
  { label: '学生公寓3', panoId: '1000170000150119145313151IN', heading: 41, pitch: 6 },
  { label: '教师公寓', panoId: '1000170000150119145341952IN', heading: 168, pitch: 6 },
  { label: '篮球场1', panoId: '1000170000150119145057032IN', heading: 176, pitch: 6 },
  { label: '篮球场2', panoId: '1000170000150119145420378IN', heading: 357, pitch: 6 },
  { label: '草坪1', panoId: '1000170000150119145429126IN', heading: 84, pitch: 6 },
  { label: '草坪2', panoId: '1000170000150119145320589IN', heading: 41, pitch: 6 },
  { label: '配电室', panoId: '1000170000150119145438190IN', heading: 355, pitch: 6 },
  { label: '小路1', panoId: '1000170000150119145242449IN', heading: 354, pitch: 6 },
  { label: '小路2', panoId: '1000170000150119145306250IN', heading: 353, pitch: 6 },
  { label: '小路3', panoId: '1000170000150119145342630IN', heading: 0, pitch: 6 },
  { label: '商店', panoId: '1000170000150119145235199IN', heading: 188, pitch: 6 },
  { label: '校园公交站', panoId: '1000170000150119145047605IN', heading: 340, pitch: 6 }
]

const viewerHost = ref<HTMLElement | null>(null)
const activeSceneIndex = ref(0)
const loadingScene = ref(true)
const pointers = new Map<number, { x: number, y: number }>()

let renderer: WebGLRenderer | null = null
let panoramaScene: Scene | null = null
let camera: PerspectiveCamera | null = null
let sphere: Mesh<SphereGeometry, MeshBasicMaterial> | null = null
let activeTexture: Texture | null = null
let resizeObserver: ResizeObserver | null = null
let animationFrame = 0
let sceneLoadVersion = 0
let longitude = 0
let latitude = 0
let longitudeVelocity = 0
let latitudeVelocity = 0
let pinchDistance: number | null = null
let resultReported = false
let failureReported = false

const panoramaTileLevels: PanoramaTileLevel[] = [
  { zoom: 4, columns: 8, rows: 4 },
  { zoom: 3, columns: 4, rows: 2 },
  { zoom: 2, columns: 2, rows: 1 }
]

function tileUrl(panoId: string, row: number, column: number, zoom: number): string {
  const query = new URLSearchParams({
    qt: 'pdata',
    sid: panoId,
    pos: `${row}_${column}`,
    z: String(zoom)
  })
  return `https://mapsv0.bdimg.com/?${query.toString()}`
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Panorama tile failed to load'))
    image.src = url
  })
}

async function createSceneTexture(
  three: typeof import('three'),
  scene: CampusPanoramaScene
): Promise<Texture> {
  const maxTextureSize = renderer?.capabilities.maxTextureSize ?? 2048
  const supportedLevels = panoramaTileLevels.filter(level => level.columns * 512 <= maxTextureSize)
  let lastError: unknown

  for (const level of supportedLevels) {
    try {
      const tiles = await Promise.all(
        Array.from({ length: level.rows * level.columns }, (_, index) => {
          const row = Math.floor(index / level.columns)
          const column = index % level.columns
          return loadImage(tileUrl(scene.panoId, row, column, level.zoom))
        })
      )
      const canvas = document.createElement('canvas')
      canvas.width = level.columns * 512
      canvas.height = level.rows * 512
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Panorama canvas is unavailable')
      for (const [index, image] of tiles.entries()) {
        const row = Math.floor(index / level.columns)
        const column = index % level.columns
        context.drawImage(image, column * 512, row * 512, 512, 512)
      }

      const texture = new three.CanvasTexture(canvas)
      texture.colorSpace = three.SRGBColorSpace
      texture.minFilter = three.LinearMipmapLinearFilter
      texture.magFilter = three.LinearFilter
      texture.generateMipmaps = true
      texture.anisotropy = renderer?.capabilities.getMaxAnisotropy() ?? 1
      texture.needsUpdate = true
      return texture
    } catch (error) {
      lastError = error
    }
  }
  throw lastError ?? new Error('No supported panorama texture level')
}

function reportError() {
  if (failureReported) return
  failureReported = true
  emit('error')
}

function reportReady() {
  if (resultReported) return
  resultReported = true
  emit('ready')
}

function resizeViewer() {
  const host = viewerHost.value
  if (!host || !renderer || !camera) return
  const width = Math.max(host.clientWidth, 1)
  const height = Math.max(host.clientHeight, 1)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height, false)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

function renderFrame() {
  animationFrame = window.requestAnimationFrame(renderFrame)
  if (!renderer || !panoramaScene || !camera) return

  if (pointers.size === 0) {
    longitude += longitudeVelocity
    latitude += latitudeVelocity
    longitudeVelocity *= 0.9
    latitudeVelocity *= 0.9
  }
  latitude = Math.max(-78, Math.min(78, latitude))

  const phi = (90 - latitude) * Math.PI / 180
  const theta = longitude * Math.PI / 180
  camera.lookAt(
    100 * Math.sin(phi) * Math.cos(theta),
    100 * Math.cos(phi),
    100 * Math.sin(phi) * Math.sin(theta)
  )
  renderer.render(panoramaScene, camera)
}

function pointerDistance(): number | null {
  const values = [...pointers.values()]
  if (values.length < 2) return null
  return Math.hypot(values[0]!.x - values[1]!.x, values[0]!.y - values[1]!.y)
}

function handlePointerDown(event: PointerEvent) {
  viewerHost.value?.setPointerCapture(event.pointerId)
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  longitudeVelocity = 0
  latitudeVelocity = 0
  pinchDistance = pointerDistance()
}

function handlePointerMove(event: PointerEvent) {
  const previous = pointers.get(event.pointerId)
  if (!previous) return
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (pointers.size === 1) {
    const deltaX = event.clientX - previous.x
    const deltaY = event.clientY - previous.y
    longitudeVelocity = -deltaX * 0.12
    latitudeVelocity = deltaY * 0.1
    longitude += longitudeVelocity
    latitude += latitudeVelocity
    return
  }

  const nextDistance = pointerDistance()
  if (camera && pinchDistance && nextDistance) {
    camera.fov = Math.max(35, Math.min(85, camera.fov - (nextDistance - pinchDistance) * 0.08))
    camera.updateProjectionMatrix()
  }
  pinchDistance = nextDistance
}

function handlePointerEnd(event: PointerEvent) {
  pointers.delete(event.pointerId)
  pinchDistance = pointerDistance()
}

function handleWheel(event: WheelEvent) {
  if (!camera) return
  event.preventDefault()
  camera.fov = Math.max(35, Math.min(85, camera.fov + event.deltaY * 0.04))
  camera.updateProjectionMatrix()
}

async function openScene(index: number) {
  const target = scenes[index]
  if (!target || !sphere) return
  const loadVersion = ++sceneLoadVersion
  activeSceneIndex.value = index
  loadingScene.value = true

  try {
    const three = await import('three')
    const texture = await createSceneTexture(three, target)
    if (loadVersion !== sceneLoadVersion || !sphere) {
      texture.dispose()
      return
    }
    activeTexture?.dispose()
    activeTexture = texture
    sphere.material.map = texture
    sphere.material.needsUpdate = true
    longitude = target.heading
    latitude = target.pitch
    longitudeVelocity = 0
    latitudeVelocity = 0
    loadingScene.value = false
    reportReady()
  } catch {
    if (loadVersion === sceneLoadVersion) reportError()
  }
}

onMounted(async () => {
  const host = viewerHost.value
  if (!host) return
  try {
    const three = await import('three')
    panoramaScene = new three.Scene()
    camera = new three.PerspectiveCamera(70, 1, 0.1, 200)
    const geometry = new three.SphereGeometry(80, 48, 32)
    geometry.scale(-1, 1, 1)
    const material = new three.MeshBasicMaterial({ color: 0xffffff })
    sphere = new three.Mesh(geometry, material)
    panoramaScene.add(sphere)
    renderer = new three.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
    renderer.outputColorSpace = three.SRGBColorSpace
    host.appendChild(renderer.domElement)
    host.addEventListener('pointerdown', handlePointerDown)
    host.addEventListener('pointermove', handlePointerMove)
    host.addEventListener('pointerup', handlePointerEnd)
    host.addEventListener('pointercancel', handlePointerEnd)
    host.addEventListener('wheel', handleWheel, { passive: false })
    renderer.domElement.addEventListener('webglcontextlost', reportError, { once: true })
    resizeObserver = new ResizeObserver(resizeViewer)
    resizeObserver.observe(host)
    resizeViewer()
    renderFrame()
    await openScene(0)
  } catch {
    reportError()
  }
})

onBeforeUnmount(() => {
  ++sceneLoadVersion
  window.cancelAnimationFrame(animationFrame)
  resizeObserver?.disconnect()
  const host = viewerHost.value
  host?.removeEventListener('pointerdown', handlePointerDown)
  host?.removeEventListener('pointermove', handlePointerMove)
  host?.removeEventListener('pointerup', handlePointerEnd)
  host?.removeEventListener('pointercancel', handlePointerEnd)
  host?.removeEventListener('wheel', handleWheel)
  activeTexture?.dispose()
  sphere?.geometry.dispose()
  sphere?.material.dispose()
  renderer?.dispose()
  renderer?.domElement.remove()
})
</script>

<template>
  <div class="absolute inset-0 bg-zinc-950 dark:bg-zinc-800">
    <div
      ref="viewerHost"
      class="panorama-canvas absolute inset-x-0 bottom-[5.75rem] top-0 cursor-grab bg-zinc-950 dark:bg-zinc-800 active:cursor-grabbing"
      aria-label="校园全景画面"
    />

    <div
      v-if="loadingScene"
      class="pointer-events-none absolute inset-x-0 bottom-[5.75rem] top-0 z-10 grid place-items-center bg-zinc-950/35 text-white backdrop-blur-[1px]"
      role="status"
    >
      <div class="rounded-full bg-black/55 px-4 py-2 text-xs font-semibold shadow-lg">
        正在打开{{ scenes[activeSceneIndex]?.label }}
      </div>
    </div>

    <div class="absolute inset-x-0 bottom-0 h-[5.75rem] border-t border-white/10 bg-zinc-950/95 px-3 py-2 text-white">
      <div class="mb-1 flex items-center justify-between gap-3 px-1">
        <p class="text-[11px] font-semibold text-white/65">
          拍摄点
        </p>
        <p class="shrink-0 text-[11px] text-emerald-300">
          {{ activeSceneIndex + 1 }} / {{ scenes.length }}
        </p>
      </div>
      <div class="scene-strip flex gap-2 overflow-x-auto pb-1">
        <button
          v-for="(scene, index) in scenes"
          :key="scene.panoId"
          type="button"
          class="min-h-10 shrink-0 rounded-xl border px-3 text-xs font-semibold transition"
          :class="activeSceneIndex === index
            ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-300 text-emerald-950 dark:text-emerald-300'
            : 'border-white/15 bg-white/8 text-white hover:bg-white/15'"
          :aria-pressed="activeSceneIndex === index"
          @click="openScene(index)"
        >
          {{ scene.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panorama-canvas {
  touch-action: none;
}

.panorama-canvas :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.scene-strip {
  scrollbar-width: thin;
  scrollbar-color: rgb(110 231 183 / 0.7) transparent;
  overscroll-behavior-x: contain;
}
</style>
