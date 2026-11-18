import { ALL_USER_CSRF_COOKIE_NAMES, USER_CSRF_HEADER_NAME } from '../../../shared/constants/security'
import { TREASURE_PILOT_RADIUS_METERS } from '../../../shared/types/treasure-pilot'
import { readTreasurePilotConfig } from '../../modules/treasure-pilot/service'

const BOOTSTRAP = '<script type="application/json" id="bridge-config">{}</script>'

export default defineEventHandler(async (event) => {
  const atlas = await useStorage('assets:server').getItem<string>('treasure/atlas.html')
  if (typeof atlas !== 'string' || !atlas.includes(BOOTSTRAP)) {
    throw createError({ statusCode: 503, statusMessage: 'Treasure map unavailable' })
  }

  const pilot = readTreasurePilotConfig(useRuntimeConfig(event))
  const publicConfig = JSON.stringify({
    point: pilot ? [pilot.point.lng, pilot.point.lat] : null,
    radius: TREASURE_PILOT_RADIUS_METERS,
    csrfHeader: USER_CSRF_HEADER_NAME,
    csrfCookies: ALL_USER_CSRF_COOKIE_NAMES
  })
  setResponseHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'no-cache')
  return atlas.replace(BOOTSTRAP, `<script type="application/json" id="bridge-config">${publicConfig}</script>`)
})
