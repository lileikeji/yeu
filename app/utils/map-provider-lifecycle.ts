import type { MapArea, MapPoi } from '~~/map/core/types'
import type {
  MapBaseStyle,
  MapDisplayOptions,
  MapProvider
} from '~~/map/core/provider'

interface MapProviderMountRequest {
  version: number
}

export interface MapProviderMountGate {
  begin: () => MapProviderMountRequest
  isCurrent: (request: MapProviderMountRequest) => boolean
  invalidate: () => void
}

interface MapProviderMountSnapshot {
  element: HTMLElement
  displayOptions: MapDisplayOptions
  baseStyle: MapBaseStyle
  areas: MapArea[]
  pois: MapPoi[]
  selectedPoiId: string | null
  selectedAreaId: string | null
}

interface MapProviderMountCallbacks {
  onCreated: (provider: MapProvider) => void
  onPoiSelected: Parameters<MapProvider['onPoiSelect']>[0]
  onAreaSelected: Parameters<MapProvider['onAreaSelect']>[0]
  onError: (error: Error) => void
}

export function createMapProviderMountGate(): MapProviderMountGate {
  let version = 0

  return {
    begin() {
      return { version: ++version }
    },
    isCurrent(request) {
      return request.version === version
    },
    invalidate() {
      ++version
    }
  }
}

export async function initializeMapProvider(
  createProvider: () => Promise<MapProvider>,
  snapshot: MapProviderMountSnapshot,
  callbacks: MapProviderMountCallbacks,
  isCurrent: () => boolean
): Promise<MapProvider | null> {
  let provider: MapProvider | null = null

  try {
    provider = await createProvider()
    if (!isCurrent()) {
      provider.destroy()
      return null
    }

    callbacks.onCreated(provider)
    provider.onPoiSelect(poi => isCurrent() && callbacks.onPoiSelected(poi))
    provider.onAreaSelect(area => isCurrent() && callbacks.onAreaSelected(area))
    provider.onError(error => isCurrent() && callbacks.onError(error))

    await provider.mount(snapshot.element, { zoom: 15 })
    if (!isCurrent()) {
      provider.destroy()
      return null
    }

    provider.setDisplayOptions(snapshot.displayOptions)
    provider.setBaseStyle(snapshot.baseStyle)
    provider.setAreas(snapshot.areas)
    provider.setPois(snapshot.pois)

    if (snapshot.selectedPoiId) {
      provider.setSelectedPoi(snapshot.selectedPoiId)
      provider.flyToPoi(snapshot.selectedPoiId)
    } else if (snapshot.selectedAreaId) {
      provider.setSelectedArea(snapshot.selectedAreaId)
    } else {
      provider.fitToPois()
    }

    return provider
  } catch (error) {
    provider?.destroy()
    throw error
  }
}
