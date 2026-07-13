export interface RuntimeReadinessInput {
  nodeEnv: string | undefined
  siteUrl: string
  mapProvider: string
  amapKey: string
  amapSecurityCode: string
  adminSessionSecret: string
}

export interface RuntimeReadinessResult {
  ready: boolean
  issues: string[]
}

function parsedUrl(value: string): URL | null {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

export function inspectRuntimeReadiness(input: RuntimeReadinessInput): RuntimeReadinessResult {
  const issues: string[] = []
  const production = input.nodeEnv === 'production'
  const siteUrl = parsedUrl(input.siteUrl)

  if (!siteUrl || !['http:', 'https:'].includes(siteUrl.protocol)) {
    issues.push('site_url_invalid')
  } else if (production && siteUrl.protocol !== 'https:') {
    issues.push('site_url_https_required')
  }

  if (Buffer.byteLength(input.adminSessionSecret) < 32) {
    issues.push('admin_session_secret_missing')
  }

  if (input.mapProvider === 'amap') {
    if (!input.amapKey.trim()) issues.push('amap_key_missing')
    if (!input.amapSecurityCode.trim()) issues.push('amap_security_code_missing')
  } else if (input.mapProvider === 'maplibre-dev') {
    if (production) issues.push('development_map_provider_in_production')
  } else {
    issues.push('map_provider_invalid')
  }

  return {
    ready: issues.length === 0,
    issues
  }
}
