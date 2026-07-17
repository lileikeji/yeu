import type { H3Event } from 'h3'
import { isLoopbackIp, isPrivateIp } from './client-ip'

export interface GeoLocation {
  country: string | null
  region: string | null
  city: string | null
  label: string
}

function firstHeader(event: H3Event, names: string[]): string | null {
  for (const name of names) {
    const value = getHeader(event, name)
    if (typeof value === 'string' && value.trim()) {
      const cleaned = value.trim().split(',')[0]?.trim() || ''
      if (cleaned && cleaned.toUpperCase() !== 'XX' && cleaned.toLowerCase() !== 'unknown') {
        return cleaned.slice(0, 80)
      }
    }
  }
  return null
}

export function resolveGeoLocation(event: H3Event, ip: string | null | undefined): GeoLocation {
  if (ip && (isPrivateIp(ip) || isLoopbackIp(ip) || ip === 'unknown')) {
    return {
      country: 'CN',
      region: '内网',
      city: '内网',
      label: '内网'
    }
  }

  const country = firstHeader(event, [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'cloudfront-viewer-country',
    'x-country-code',
    'x-geo-country'
  ])
  const region = firstHeader(event, [
    'cf-region',
    'x-vercel-ip-country-region',
    'cloudfront-viewer-country-region',
    'x-region',
    'x-geo-region'
  ])
  const city = firstHeader(event, [
    'cf-ipcity',
    'x-vercel-ip-city',
    'cloudfront-viewer-city',
    'x-city',
    'x-geo-city'
  ])

  const parts = [country, region, city].filter(Boolean) as string[]
  return {
    country,
    region,
    city,
    label: parts.length ? parts.join(' · ') : '未知'
  }
}
