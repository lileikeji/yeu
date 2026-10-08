import type { H3Event } from 'h3'
import type { AdminSessionContext } from './auth'
import { requireAdminContentAccess } from './auth'

/**
 * Resolve which club content a recruit admin request targets.
 * Organization admins are always pinned to their own scoped content;
 * super admins must name the contentId explicitly.
 */
export function resolveRecruitContentId(event: H3Event, session: AdminSessionContext): string {
  const requested = getQuery(event).contentId

  if (session.admin.role === 'organization') {
    const scoped = session.admin.organization?.contentId
    if (!scoped) {
      throw createError({
        statusCode: 403,
        statusMessage: 'This administrator has no organization scope',
        data: { code: 'ADMIN_SCOPE_FORBIDDEN' }
      })
    }
    if (typeof requested === 'string' && requested && requested !== scoped) {
      requireAdminContentAccess(session, requested)
    }
    return scoped
  }

  if (typeof requested !== 'string' || !requested) {
    throw createError({
      statusCode: 400,
      statusMessage: 'contentId query parameter is required',
      data: { code: 'CONTENT_ID_REQUIRED' }
    })
  }
  requireAdminContentAccess(session, requested)
  return requested
}

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const ZIP_MIME = 'application/zip'

/** Send generated Office bytes as a download with an RFC 5987 UTF-8 filename. */
export function sendOfficeFile(
  event: H3Event,
  bytes: Uint8Array,
  filename: string,
  mime: typeof DOCX_MIME | typeof XLSX_MIME | typeof ZIP_MIME
): void {
  const safeName = filename.replace(/[\r\n"\\]/g, '')
  const fallbackExt = mime === DOCX_MIME ? '.docx' : mime === XLSX_MIME ? '.xlsx' : '.zip'
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'Content-Type', mime)
  setHeader(event, 'Content-Disposition',
    `attachment; filename="download${fallbackExt}"; filename*=UTF-8''${encodeURIComponent(safeName)}`)
}

export function sendDocx(event: H3Event, bytes: Uint8Array, filename: string): void {
  sendOfficeFile(event, bytes, filename, DOCX_MIME)
}

export function sendXlsx(event: H3Event, bytes: Uint8Array, filename: string): void {
  sendOfficeFile(event, bytes, filename, XLSX_MIME)
}

export function sendZip(event: H3Event, bytes: Uint8Array, filename: string): void {
  sendOfficeFile(event, bytes, filename, ZIP_MIME)
}
