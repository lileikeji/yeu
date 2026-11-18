export const TREASURE_PILOT_RADIUS_METERS = 20

export interface TreasurePosition {
  lat: number
  lng: number
  accuracy: number
  timestamp: number
}

export interface TreasurePilotStatus {
  enabled: boolean
  authenticated: boolean
  collectedAt: number | null
}

export type TreasurePositionCheck
  = { status: 'eligible' | 'outside', distanceMeters: number }
    | { status: 'stale' | 'inaccurate' }

export type TreasurePilotResult
  = TreasurePositionCheck
    | { status: 'wrong-answer' }
    | { status: 'collected', collectedAt: number }
