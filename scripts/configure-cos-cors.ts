/**
 * 给伴奏桶配 CORS：允许选手在浏览器里直接 PUT 到 COS。
 * 用法：COS_BUCKET=… COS_REGION=… COS_SECRET_ID=… COS_SECRET_KEY=… \
 *        CORS_ORIGIN=https://yx.huiliyill.cn npx tsx scripts/configure-cos-cors.ts
 */
import { cosConfig, signCosUrl } from '../server/utils/cos-storage'

async function main(): Promise<void> {
  const config = cosConfig()
  if (!config) {
    console.error('缺 COS_BUCKET / COS_REGION / COS_SECRET_ID / COS_SECRET_KEY')
    process.exitCode = 1
    return
  }
  const origin = process.env.CORS_ORIGIN || 'https://yx.huiliyill.cn'
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>${origin}</AllowedOrigin>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>content-type</AllowedHeader>
    <AllowedHeader>*</AllowedHeader>
    <ExposeHeader>ETag</ExposeHeader>
    <MaxAgeSeconds>600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>`
  const url = signCosUrl(config, { method: 'PUT', key: '', expiresIn: 300, params: { cors: '' } })
  const response = await fetch(url, { method: 'PUT', body: xml, headers: { 'Content-Type': 'application/xml' } })
  const text = await response.text()
  console.log(response.status, text.slice(0, 200))
  const check = await fetch(signCosUrl(config, { method: 'GET', key: '', expiresIn: 300, params: { cors: '' } }))
  console.log('当前 CORS:\n' + (await check.text()).slice(0, 400))
}

await main()
