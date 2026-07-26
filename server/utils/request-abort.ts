import type { H3Event } from 'h3'

export function createRequestAbortSignal(event: H3Event): {
  signal: AbortSignal
  dispose: () => void
} {
  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) controller.abort(new Error('CLIENT_ABORTED'))
  }

  if (event.node.req.aborted || event.node.res.destroyed) abort()
  event.node.req.once('aborted', abort)
  event.node.res.once('close', abort)

  return {
    signal: controller.signal,
    dispose: () => {
      event.node.req.off('aborted', abort)
      event.node.res.off('close', abort)
    }
  }
}
