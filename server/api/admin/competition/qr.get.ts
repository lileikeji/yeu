import QRCode from 'qrcode'
import { competitionQrQuerySchema } from '../../../../shared/schemas/server'
import { useAdminRequest } from '../../../utils/http'
import { parseQuery } from '../../../utils/validation'

const QR_PATHS = {
  '/singer/pre-register': '预报名',
  '/singer/register': '现场登记'
} as const

export default defineEventHandler(async (event) => {
  const { session } = useAdminRequest(event)
  void session
  const query = parseQuery(event, competitionQrQuerySchema)

  const siteUrl = String(useRuntimeConfig(event).public.siteUrl || '').replace(/\/+$/, '')
  if (!siteUrl) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Site URL is not configured',
      data: { code: 'SITE_URL_MISSING' }
    })
  }

  const png = await QRCode.toBuffer(`${siteUrl}${query.path}`, {
    type: 'png',
    width: query.size,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#2f3a34ff', light: '#ffffffff' }
  })

  setHeader(event, 'Content-Type', 'image/png')
  setHeader(event, 'Cache-Control', 'private, max-age=300')
  if (query.download) {
    const label = QR_PATHS[query.path]
    setHeader(event, 'Content-Disposition',
      `attachment; filename="qr.png"; filename*=UTF-8''${encodeURIComponent(`新声歌手大赛${label}二维码.png`)}`)
  }
  return png
})
