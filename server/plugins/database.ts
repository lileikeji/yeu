import { closeDatabase } from '../database/client'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('close', () => {
    closeDatabase()
  })
})
