const https = require('node:https')
const data = JSON.stringify({ username: 'admin', password: '***REMOVED***' })
const req = https.request({
  host: 'yeu.huiliyill.cn',
  path: '/api/admin/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Origin': 'https://yeu.huiliyill.cn'
  }
}, (res) => {
  let body = ''
  res.on('data', (c) => { body += c })
  res.on('end', () => {
    console.log('STATUS', res.statusCode)
    try {
      const json = JSON.parse(body)
      console.log(JSON.stringify({
        authenticated: json.authenticated,
        hasCsrf: Boolean(json.csrfToken),
        username: json.admin && json.admin.username
      }))
    } catch {
      console.log(body.slice(0, 200))
    }
  })
})
req.on('error', (e) => { console.error(e); process.exit(1) })
req.write(data)
req.end()