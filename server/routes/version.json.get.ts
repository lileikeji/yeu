import { readReleaseVersion } from '../utils/release-version'

export default defineEventHandler((event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  try {
    return readReleaseVersion()
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'Release metadata unavailable' })
  }
})
