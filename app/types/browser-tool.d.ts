declare module 'browser-tool' {
  interface BrowserFingerprint {
    /** 综合指纹哈希（UA + 屏幕 + 下方各信号拼接后取哈希）。 */
    value: string
    webgl?: unknown
    canvas?: unknown
    font?: unknown
    audio?: unknown
    mime?: unknown
  }

  interface BrowserTool {
    parse(userAgent?: string): Record<string, unknown>
    getInfo(fields?: string[]): Promise<Record<string, unknown>>
    getFingerprint(kinds?: string[]): Promise<BrowserFingerprint>
    isSupport(feature: string, value?: string): boolean
  }

  const browser: BrowserTool
  export default browser
}
