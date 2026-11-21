import { getHeader } from 'h3'
import { ALL_USER_CSRF_COOKIE_NAMES, USER_CSRF_HEADER_NAME } from '../../../shared/constants/security'
import { TREASURE_PILOT_RADIUS_METERS } from '../../../shared/types/treasure-pilot'
import { readTreasurePilotConfig } from '../../modules/treasure-pilot/service'
import { getPublicTreasureState } from '../../modules/yeuca/treasure-service'
import { useAppDatabase } from '../../utils/database'

const BOOTSTRAP = '<script type="application/json" id="bridge-config">{}</script>'

export default defineEventHandler(async (event) => {
  const atlas = await useStorage('assets:server').getItem<string>('treasure/atlas.html')
  if (typeof atlas !== 'string' || !atlas.includes(BOOTSTRAP)) {
    throw createError({ statusCode: 503, statusMessage: 'Treasure map unavailable' })
  }

  const runtimeConfig = useRuntimeConfig(event)
  const pilot = readTreasurePilotConfig(runtimeConfig)
  const host = String(getHeader(event, 'host') || '').split(':')[0]?.toLowerCase() || ''
  const isYeucaHost = host === 'yeuca.huiliyill.cn' || host.endsWith('.yeuca.huiliyill.cn')
  let state: ReturnType<typeof getPublicTreasureState> | null
  try {
    state = getPublicTreasureState(event, useAppDatabase(event), runtimeConfig)
  } catch {
    state = null
  }
  const pilotPoint = state?.points.find(p => p.id === 'zodiac-bridge')?.point ?? (pilot ? [pilot.point.lng, pilot.point.lat] : null)

  const publicConfig = JSON.stringify({
    point: pilotPoint,
    radius: TREASURE_PILOT_RADIUS_METERS,
    csrfHeader: USER_CSRF_HEADER_NAME,
    csrfCookies: ALL_USER_CSRF_COOKIE_NAMES,
    isYeucaHost,
    state
  }).replace(/</g, '\\u003c')

  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return atlas.replace(BOOTSTRAP, `<script type="application/json" id="bridge-config">${publicConfig}</script>`)
})
