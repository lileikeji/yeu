import { getHeader, readMultipartFormData } from 'h3'
import {
  ensureCompetitionEvent,
  importSingers,
  parseSingerWorkbook
} from '../../../../modules/competition/service'
import { writeAudit } from '../../../../utils/audit'
import { resolveCompetitionContentId } from '../../../../utils/competition-admin'
import { useAdminRequest } from '../../../../utils/http'

const MAX_IMPORT_BYTES = 5 * 1024 * 1024
const MAX_MULTIPART_BYTES = MAX_IMPORT_BYTES + 64 * 1024
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.csv']

export default defineEventHandler(async (event) => {
  const { client, session } = useAdminRequest(event, true)
  const contentId = resolveCompetitionContentId(client, session)

  const contentType = getHeader(event, 'content-type')?.toLowerCase() ?? ''
  const contentLength = Number(getHeader(event, 'content-length'))
  if (!contentType.startsWith('multipart/form-data;')) {
    throw createError({
      statusCode: 415,
      statusMessage: 'Unsupported Media Type',
      data: { code: 'UNSUPPORTED_MEDIA_TYPE', expected: 'multipart/form-data' }
    })
  }
  if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_MULTIPART_BYTES) {
    throw createError({
      statusCode: contentLength > MAX_MULTIPART_BYTES ? 413 : 411,
      statusMessage: contentLength > MAX_MULTIPART_BYTES ? 'Import file is too large' : 'Content-Length is required',
      data: { code: contentLength > MAX_MULTIPART_BYTES ? 'PAYLOAD_TOO_LARGE' : 'CONTENT_LENGTH_REQUIRED' }
    })
  }

  const parts = await readMultipartFormData(event)
  const file = parts?.find(part => part.name === 'file' && part.filename && part.data)
  if (!file) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Import file is required',
      data: { code: 'IMPORT_FILE_REQUIRED' }
    })
  }

  const filename = file.filename ?? ''
  const extension = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Unsupported import file',
      data: { code: 'IMPORT_FILE_TYPE_UNSUPPORTED', message: '请上传 .xlsx / .xls / .csv 文件' }
    })
  }
  if (file.data.byteLength === 0 || file.data.byteLength > MAX_IMPORT_BYTES) {
    throw createError({
      statusCode: file.data.byteLength > MAX_IMPORT_BYTES ? 413 : 422,
      statusMessage: 'Import file is empty or too large',
      data: { code: 'IMPORT_FILE_SIZE_INVALID', maxBytes: MAX_IMPORT_BYTES }
    })
  }

  const parsed = parseSingerWorkbook(new Uint8Array(file.data))
  const competition = ensureCompetitionEvent(client, contentId)
  const result = importSingers(client, competition.id, parsed)

  writeAudit(client, event, {
    actorAdminId: session.admin.id,
    action: 'competition.singers_import',
    entityType: 'competition_event',
    entityId: competition.id,
    details: { filename, imported: result.imported, skipped: result.skipped }
  })

  return {
    imported: result.imported,
    skipped: result.skipped,
    parsed: parsed.length
  }
})
