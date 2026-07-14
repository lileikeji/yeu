export function isWechatUserAgent(userAgent: string): boolean {
  return /MicroMessenger/i.test(userAgent)
}

export function isShareCancellation(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
