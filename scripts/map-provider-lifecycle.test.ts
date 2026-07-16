import assert from 'node:assert/strict'
import test from 'node:test'
import type { GeoPoint, MapArea, MapMountOptions, MapPoi } from '../map/core/types'
import type {
  AreaSelectHandler,
  MapBaseStyle,
  MapDisplayOptions,
  MapErrorHandler,
  MapProvider,
  PoiSelectHandler,
  PointPickedHandler,
  RouteSummary
} from '../map/core/provider'
import {
  createMapProviderMountGate,
  initializeMapProvider
} from '../app/utils/map-provider-lifecycle'

const displayOptions: MapDisplayOptions = {
  showPois: true,
  showAreas: true,
  showLabels: true,
  autoCluster: false,
  labelSize: 'medium'
}

const poi: MapPoi = {
  id: 'library',
  name: '图书馆',
  category: 'service',
  point: { lng: 118.6, lat: 24.9, crs: 'GCJ-02' },
  status: 'published'
}

const area: MapArea = {
  id: 'campus',
  name: '校园',
  strokeColor: '#176f46',
  fillColor: '#176f46',
  areaSquareMeters: 1000,
  perimeterMeters: 150,
  paths: [],
  geometrySource: 'wia-shape-batch'
}

interface FakeProviderState {
  mountedWith: { element: HTMLElement, options?: MapMountOptions } | null
  displayOptions: MapDisplayOptions | null
  baseStyle: MapBaseStyle | null
  areas: MapArea[] | null
  pois: MapPoi[] | null
  selectedPoiId: string | null
  selectedAreaId: string | null
  flownPoiId: string | null
  fitCount: number
  destroyCount: number
  poiHandler: PoiSelectHandler | null
  areaHandler: AreaSelectHandler | null
  errorHandler: MapErrorHandler | null
}

function fakeProvider(mountError?: Error): { provider: MapProvider, state: FakeProviderState } {
  const state: FakeProviderState = {
    mountedWith: null,
    displayOptions: null,
    baseStyle: null,
    areas: null,
    pois: null,
    selectedPoiId: null,
    selectedAreaId: null,
    flownPoiId: null,
    fitCount: 0,
    destroyCount: 0,
    poiHandler: null,
    areaHandler: null,
    errorHandler: null
  }

  const provider: MapProvider = {
    id: 'amap',
    async mount(element, options) {
      state.mountedWith = { element, options }
      if (mountError) throw mountError
    },
    setPois(pois) {
      state.pois = pois
    },
    setAreas(areas) {
      state.areas = areas
    },
    setDisplayOptions(options) {
      state.displayOptions = options
    },
    setBaseStyle(style) {
      state.baseStyle = style
      return true
    },
    resize: () => {},
    fitToPois() {
      state.fitCount += 1
    },
    enablePointPicker: (_handler: PointPickedHandler) => {},
    disablePointPicker: () => {},
    setSelectedPoi(id) {
      state.selectedPoiId = id
    },
    setSelectedArea(id) {
      state.selectedAreaId = id
    },
    flyToPoi(id) {
      state.flownPoiId = id
      return true
    },
    flyToPoint: (_point: GeoPoint, _zoom?: number) => true,
    planWalkingRoute: async (_origin: GeoPoint, _destination: GeoPoint): Promise<RouteSummary> => ({
      distanceMeters: 100,
      durationSeconds: 60
    }),
    searchVisiblePois: async (_query: string) => [],
    clearRoute: () => {},
    onPoiSelect(handler) {
      state.poiHandler = handler
      return () => {}
    },
    onAreaSelect(handler) {
      state.areaHandler = handler
      return () => {}
    },
    onError(handler) {
      state.errorHandler = handler
      return () => {}
    },
    destroy() {
      state.destroyCount += 1
    }
  }

  return { provider, state }
}

function snapshot(selection: { poi?: string, area?: string } = {}) {
  return {
    element: {} as HTMLElement,
    displayOptions,
    baseStyle: 'satellite' as const,
    areas: [area],
    pois: [poi],
    selectedPoiId: selection.poi ?? null,
    selectedAreaId: selection.area ?? null
  }
}

function callbacks(events: string[]) {
  return {
    onCreated: (_provider: MapProvider) => events.push('created'),
    onPoiSelected: (selected: MapPoi | null) => events.push(`poi:${selected?.id ?? 'none'}`),
    onAreaSelected: (selected: MapArea | null) => events.push(`area:${selected?.id ?? 'none'}`),
    onError: (error: Error) => events.push(`error:${error.message}`)
  }
}

test('provider initialization mounts and applies the current map snapshot', async () => {
  const { provider, state } = fakeProvider()
  const currentSnapshot = snapshot({ poi: poi.id })
  const events: string[] = []

  const result = await initializeMapProvider(
    async () => provider,
    currentSnapshot,
    callbacks(events),
    () => true
  )

  assert.equal(result, provider)
  assert.deepEqual(state.mountedWith, { element: currentSnapshot.element, options: { zoom: 15 } })
  assert.equal(state.displayOptions, displayOptions)
  assert.equal(state.baseStyle, 'satellite')
  assert.equal(state.areas, currentSnapshot.areas)
  assert.equal(state.pois, currentSnapshot.pois)
  assert.equal(state.selectedPoiId, poi.id)
  assert.equal(state.flownPoiId, poi.id)
  assert.equal(state.selectedAreaId, null)
  assert.equal(state.fitCount, 0)
  assert.deepEqual(events, ['created'])
})

test('provider initialization restores an area or fits all POIs when nothing is selected', async () => {
  const selectedAreaProvider = fakeProvider()
  await initializeMapProvider(
    async () => selectedAreaProvider.provider,
    snapshot({ area: area.id }),
    callbacks([]),
    () => true
  )
  assert.equal(selectedAreaProvider.state.selectedAreaId, area.id)
  assert.equal(selectedAreaProvider.state.fitCount, 0)

  const unselectedProvider = fakeProvider()
  await initializeMapProvider(
    async () => unselectedProvider.provider,
    snapshot(),
    callbacks([]),
    () => true
  )
  assert.equal(unselectedProvider.state.selectedAreaId, null)
  assert.equal(unselectedProvider.state.selectedPoiId, null)
  assert.equal(unselectedProvider.state.fitCount, 1)
})

test('stale provider requests are destroyed before they can mount', async () => {
  const { provider, state } = fakeProvider()
  const gate = createMapProviderMountGate()
  const request = gate.begin()
  gate.invalidate()

  const result = await initializeMapProvider(
    async () => provider,
    snapshot(),
    callbacks([]),
    () => gate.isCurrent(request)
  )

  assert.equal(result, null)
  assert.equal(state.mountedWith, null)
  assert.equal(state.destroyCount, 1)
})

test('providers that become stale while mounting are destroyed without applying configuration', async () => {
  const { provider, state } = fakeProvider()
  const gate = createMapProviderMountGate()
  const request = gate.begin()
  let finishMount!: () => void
  let reportMountStarted!: () => void
  const mountFinished = new Promise<void>((resolve) => {
    finishMount = resolve
  })
  const mountStarted = new Promise<void>((resolve) => {
    reportMountStarted = resolve
  })
  provider.mount = async (element, options) => {
    state.mountedWith = { element, options }
    reportMountStarted()
    await mountFinished
  }

  const initialization = initializeMapProvider(
    async () => provider,
    snapshot(),
    callbacks([]),
    () => gate.isCurrent(request)
  )
  await mountStarted
  gate.invalidate()
  finishMount()

  assert.equal(await initialization, null)
  assert.equal(state.destroyCount, 1)
  assert.equal(state.displayOptions, null)
  assert.equal(state.areas, null)
  assert.equal(state.pois, null)
})

test('provider mount failures destroy the partial provider and propagate the error', async () => {
  const mountError = new Error('mount failed')
  const { provider, state } = fakeProvider(mountError)

  await assert.rejects(
    initializeMapProvider(async () => provider, snapshot(), callbacks([]), () => true),
    mountError
  )
  assert.equal(state.destroyCount, 1)
})

test('provider callbacks ignore events after their request becomes stale', async () => {
  const { provider, state } = fakeProvider()
  const events: string[] = []
  let current = true
  await initializeMapProvider(async () => provider, snapshot(), callbacks(events), () => current)
  current = false

  state.poiHandler?.(poi)
  state.areaHandler?.(area)
  state.errorHandler?.(new Error('late failure'))

  assert.deepEqual(events, ['created'])
})
