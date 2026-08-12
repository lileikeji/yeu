const legacyTestReasonPattern = /^(?:full-audit temp ban|smoke(?:-test)? ban(?: rigor)?(?: [a-z0-9]+)?|rigor-live-check|probe|mech(?: html)? ban(?: smoke)?(?: \d+)?|local origin ban test|json check2?|e2e|debug(?: html ban| ::1)?|audit ban)$/i

export function visitorBanReasonLabel(reason: string | null | undefined): string {
  const value = String(reason || '').trim()
  if (!value) return '未填写原因'
  if (value === 'crawler_honeypot') {
    return '系统自动限制：访问到了仅用于识别自动抓取的隐藏地址。该限制为临时措施，到期后不会继续拦截。'
  }
  if (legacyTestReasonPattern.test(value)) return '历史系统测试记录（已失效）'
  // These records predate the administrator-facing reason requirement. Do not
  // expose implementation labels if a legacy row contains only English text.
  if (/^[\x20-\x7E]+$/.test(value)) return '历史系统记录（原因未注明）'
  return value
}

export function isCrawlerHoneypotReason(reason: string | null | undefined): boolean {
  return String(reason || '').trim() === 'crawler_honeypot'
}
