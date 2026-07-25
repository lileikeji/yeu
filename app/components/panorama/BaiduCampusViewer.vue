<script setup lang="ts">
interface CampusPanoramaScene {
  label: string
  panoId: string
  heading: number
  pitch: number
}

interface BaiduPanoramaInstance {
  setId: (id: string) => void
  setPov: (pov: { heading: number, pitch: number }) => void
  setOptions?: (options: Record<string, boolean>) => void
  addEventListener?: (name: string, handler: () => void) => void
}

interface BaiduMapsApi {
  Panorama: new (container: string) => BaiduPanoramaInstance
}

declare global {
  interface Window {
    BMapGL?: BaiduMapsApi
    __yeuBaiduMapsReady?: () => void
  }
}

const props = defineProps<{
  apiKey: string
}>()

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
  { label: '仰恩公交站', panoId: '1000170000150119145047605IN', heading: 340, pitch: 6 }
]

const containerId = `yeu-baidu-panorama-${useId().replace(/[^a-z0-9_-]/gi, '')}`
const viewerHost = ref<HTMLElement | null>(null)
const activeSceneIndex = ref(0)
const loadingScene = ref(true)
let panorama: BaiduPanoramaInstance | null = null
let readinessTimer: ReturnType<typeof setTimeout> | undefined
let restoreAlert: (() => void) | undefined
let resultReported = false

function loadBaiduMapsApi(apiKey: string): Promise<BaiduMapsApi> {
  if (window.BMapGL?.Panorama) return Promise.resolve(window.BMapGL)

  return new Promise((resolve, reject) => {
    const callbackName = '__yeuBaiduMapsReady'
    const existing = document.querySelector<HTMLScriptElement>('script[data-yeu-baidu-maps]')
    const timeout = window.setTimeout(() => reject(new Error('Baidu Maps API timed out')), 10_000)

    window[callbackName] = () => {
      window.clearTimeout(timeout)
      if (window.BMapGL?.Panorama) resolve(window.BMapGL)
      else reject(new Error('Baidu panorama API is unavailable'))
    }

    if (existing) return

    const script = document.createElement('script')
    script.dataset.yeuBaiduMaps = 'true'
    script.async = true
    script.src = `https://api.map.baidu.com/api?v=3.0&type=webgl&ak=${encodeURIComponent(apiKey)}&callback=${callbackName}`
    script.onerror = () => {
      window.clearTimeout(timeout)
      reject(new Error('Baidu Maps API failed to load'))
    }
    document.head.appendChild(script)
  })
}

function reportError() {
  if (resultReported) return
  resultReported = true
  restoreAlert?.()
  emit('error')
}

function reportReady() {
  loadingScene.value = false
  if (resultReported) return
  resultReported = true
  restoreAlert?.()
  emit('ready')
}

function guardBaiduAlerts() {
  const originalAlert = window.alert
  window.alert = () => reportError()
  restoreAlert = () => {
    window.alert = originalAlert
    restoreAlert = undefined
  }
}

function confirmViewerReady(attempt = 0) {
  window.clearTimeout(readinessTimer)
  readinessTimer = window.setTimeout(() => {
    const host = viewerHost.value
    const message = host?.innerText ?? ''
    const hasVisiblePicture = [...(host?.querySelectorAll<HTMLElement>('canvas, img') ?? [])]
      .some((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return rect.width > 8
          && rect.height > 8
          && style.display !== 'none'
          && style.visibility !== 'hidden'
      })

    if (/密钥|未授权|权限|服务不可用|AK|Referer|校验失败/i.test(message)) {
      reportError()
      return
    }

    if (hasVisiblePicture) {
      reportReady()
      return
    }

    if (attempt >= 11) {
      reportError()
      return
    }

    confirmViewerReady(attempt + 1)
  }, attempt === 0 ? 1_200 : 400)
}

function openScene(index: number) {
  const scene = scenes[index]
  if (!scene || !panorama) return

  activeSceneIndex.value = index
  loadingScene.value = true
  panorama.setId(scene.panoId)
  panorama.setPov({ heading: scene.heading, pitch: scene.pitch })
  confirmViewerReady()
}

onMounted(async () => {
  guardBaiduAlerts()
  try {
    const api = await loadBaiduMapsApi(props.apiKey)
    panorama = new api.Panorama(containerId)
    panorama.setOptions?.({
      linksControl: true,
      navigationControl: true
    })
    panorama.addEventListener?.('position_changed', () => {
      confirmViewerReady()
    })
    openScene(0)
  } catch {
    reportError()
  }
})

onBeforeUnmount(() => {
  window.clearTimeout(readinessTimer)
  restoreAlert?.()
})
</script>

<template>
  <div class="absolute inset-0 bg-zinc-950">
    <div
      :id="containerId"
      ref="viewerHost"
      class="absolute inset-x-0 bottom-[5.75rem] top-0 bg-zinc-950"
      aria-label="仰恩大学校内全景画面"
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
          想看哪里，点名字就行
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
            ? 'border-emerald-300 bg-emerald-300 text-emerald-950'
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
.scene-strip {
  scrollbar-width: thin;
  scrollbar-color: rgb(110 231 183 / 0.7) transparent;
  overscroll-behavior-x: contain;
}
</style>
