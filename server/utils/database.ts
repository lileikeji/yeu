import type { H3Event } from 'h3'
import { getDatabase } from '../database/client'

export function useAppDatabase(event?: H3Event) {
  const runtimeConfig = useRuntimeConfig(event)
  const databasePath = String(runtimeConfig.databasePath || process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite')
  return getDatabase(databasePath)
}
