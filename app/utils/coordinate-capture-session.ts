export function coordinateCaptureBelongsToPlace(
  capturePlaceId: string | null,
  currentPlaceId: string
): boolean {
  return capturePlaceId !== null && capturePlaceId === currentPlaceId
}

export function shouldLockCoordinateCapturePlace(
  tracking: boolean,
  sampleCount: number
): boolean {
  return tracking || sampleCount > 0
}
