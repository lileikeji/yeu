import { removeResponseHeader, type H3Event } from 'h3'

/**
 * Drop framework fingerprint headers. Nuxt/Nitro may set x-powered-by late
 * in the response pipeline (especially HTML), so middleware alone is not enough.
 */
export default defineNitroPlugin((nitroApp) => {
  const strip = (event: H3Event) => {
    removeResponseHeader(event, 'x-powered-by')
    removeResponseHeader(event, 'X-Powered-By')
  }

  nitroApp.hooks.hook('beforeResponse', (event) => {
    strip(event)
  })
  nitroApp.hooks.hook('afterResponse', (event) => {
    strip(event)
  })

  // Nuxt HTML render path (hook name is not always in base Nitro types).
  type RenderHook = (_response: unknown, context: { event?: H3Event }) => void
  const hook = nitroApp.hooks.hook as unknown as (name: string, fn: RenderHook) => void
  hook('render:response', (_response, context) => {
    if (context?.event) strip(context.event)
  })
  hook('render:html', (_html, context) => {
    if (context?.event) strip(context.event)
  })
})
