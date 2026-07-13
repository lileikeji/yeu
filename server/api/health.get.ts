import { adminUsers, places } from '../database/schema'
import { useAppDatabase } from '../utils/database'
import { inspectRuntimeReadiness } from '../utils/readiness'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const client = useAppDatabase(event)
  const runtimeConfig = useRuntimeConfig(event)
  const configuration = inspectRuntimeReadiness({
    nodeEnv: process.env.NODE_ENV,
    siteUrl: String(runtimeConfig.public.siteUrl || ''),
    mapProvider: String(runtimeConfig.public.mapProvider || ''),
    amapKey: String(runtimeConfig.public.amapKey || ''),
    amapSecurityCode: String(runtimeConfig.public.amapSecurityCode || ''),
    adminSessionSecret: String(runtimeConfig.adminSessionSecret || process.env.NUXT_ADMIN_SESSION_SECRET || '')
  })

  try {
    client.db.select({ id: places.id }).from(places).limit(1).get()
    client.db.select({ id: adminUsers.id }).from(adminUsers).limit(1).get()

    if (!configuration.ready) {
      setResponseStatus(event, 503)
      return {
        status: 'unavailable',
        database: 'ready',
        configuration: 'invalid',
        issues: configuration.issues,
        timestamp: new Date().toISOString()
      }
    }

    return {
      status: 'ok',
      database: 'ready',
      configuration: 'ready',
      issues: [],
      timestamp: new Date().toISOString()
    }
  } catch {
    setResponseStatus(event, 503)
    return {
      status: 'unavailable',
      database: 'not_initialized_or_unreachable',
      configuration: configuration.ready ? 'ready' : 'invalid',
      issues: configuration.issues,
      timestamp: new Date().toISOString()
    }
  }
})
