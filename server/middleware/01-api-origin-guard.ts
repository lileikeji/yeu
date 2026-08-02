import { assertApiOrigin } from '../utils/api-origin'

/**
 * Keep data APIs callable by the site itself while rejecting direct requests
 * that have no trustworthy browser page context. Webhook integrations and the
 * public health probe are explicit exceptions in api-origin.ts.
 */
export default defineEventHandler((event) => {
  assertApiOrigin(event)
})
