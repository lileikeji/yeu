export interface PublicPhoneContact {
  label: string
  href: string
}

export type PublicContactActionKind = 'phone' | 'email' | 'text'

export interface PublicContactAction {
  kind: PublicContactActionKind
  label: string
  href: string | null
  copyValue: string
  actionLabel: string
}

const phonePartSplit = /[/／|｜,，;；、\n]+/

/**
 * Split student-facing phone fields into dialable contacts.
 * Keeps the original display text and builds a tel: href from digits only.
 */
export function parsePublicPhoneContacts(value: string | null | undefined): PublicPhoneContact[] {
  const raw = value?.trim()
  if (!raw) return []

  const parts = raw
    .split(phonePartSplit)
    .map(part => part.trim())
    .filter(Boolean)

  const contacts: PublicPhoneContact[] = []
  const seen = new Set<string>()

  for (const part of parts) {
    const compact = part.replace(/[^\d+]/g, '')
    if (!compact) continue

    const hrefNumber = compact.startsWith('+')
      ? `+${compact.slice(1).replace(/\D/g, '')}`
      : compact.replace(/\D/g, '')
    const digitCount = hrefNumber.replace(/\D/g, '').length
    if (digitCount < 7 || digitCount > 15) continue

    const href = `tel:${hrefNumber}`
    if (seen.has(href)) continue
    seen.add(href)
    contacts.push({
      label: part,
      href
    })
  }

  return contacts
}

export function resolvePublicEmailHref(value: string | null | undefined): string | null {
  const email = value?.trim()
  if (!email) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return `mailto:${email}`
}

/**
 * Turn free-form contact text into student-facing actions.
 * Phones become dial links, emails become mailto links, otherwise keep copyable text.
 */
export function resolvePublicContactActions(value: string | null | undefined): PublicContactAction[] {
  const raw = value?.trim()
  if (!raw) return []

  const phones = parsePublicPhoneContacts(raw)
  if (phones.length) {
    return phones.map(phone => ({
      kind: 'phone' as const,
      label: phone.label,
      href: phone.href,
      copyValue: phone.label,
      actionLabel: `拨打 ${phone.label}`
    }))
  }

  const emailHref = resolvePublicEmailHref(raw)
  if (emailHref) {
    return [{
      kind: 'email',
      label: raw,
      href: emailHref,
      copyValue: raw,
      actionLabel: '发邮件'
    }]
  }

  return [{
    kind: 'text',
    label: raw,
    href: null,
    copyValue: raw,
    actionLabel: '复制联系方式'
  }]
}
