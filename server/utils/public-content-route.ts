import type { ContentKind } from '../../shared/constants/server'

export function publicContentRoute(kind: ContentKind, slug: string): string {
  const encodedSlug = encodeURIComponent(slug)
  if (kind === 'guide') return `/guides/${encodedSlug}`
  if (kind === 'department') return `/departments/${encodedSlug}`
  if (kind === 'club') return `/clubs/${encodedSlug}`
  return `/campus#notice-${encodedSlug}`
}
