const http = require('node:http')
const data = JSON.stringify({ username: 'admin', password: '***REMOVED***' })
const req = http.request({
  host: '127.0.0.1',
  port: 3000,
  path: '/api/admin/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Origin': 'https://yx.huiliyill.cn',
    'Referer': 'https://yx.huiliyill.cn/admin/login'
  }
}, (res) => {
  let body = ''
  res.on('data', (c) => { body += c })
  res.on('end', () => {
    console.log('STATUS', res.statusCode)
    // redact cookies partially
    const setCookie = res.headers['set-cookie']
    console.log('HAS_SET_COOKIE', Boolean(setCookie && setCookie.length))
    try {
      const json = JSON.parse(body)
      console.log('BODY', JSON.stringify({
        authenticated: json.authenticated,
        hasCsrf: Boolean(json.csrfToken),
        admin: json.admin,
        expiresAt: json.expiresAt,
        error: json.error,
        statusMessage: json.statusMessage,
        data: json.data
      }))
    } catch {
      console.log('BODY_RAW', body.slice(0, 300))
    }
  })
})
req.on('error', (err) => { console.error(err); process.exit(1) })
req.write(data)
req.end()