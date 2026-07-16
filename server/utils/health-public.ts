import { isLoopbackIp } from './client-ip'
/**
 * Public health responses must not advertise which exact secret or map setting is missing.
 * Loopback/dev clients may receive the detailed readiness issue codes for local ops.
 */
export function publicConfigurationIssues(issues: string[], discloseDetails: boolean): string[] {
  if (discloseDetails || issues.length === 0) return issues
  return ['configuration_invalid']
}

export function isLoopbackAddress(address: string | null | undefined): boolean {
  return isLoopbackIp(address)
}
