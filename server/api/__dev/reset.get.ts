const devResetHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>正在刷新本地预览</title>
</head>
<body>
  <p>正在刷新本地预览...</p>
  <script>
    Promise.resolve('serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations() : [])
      .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
      .finally(() => location.replace('/?dev-preview-reset=1'));
  </script>
</body>
</html>`

export default defineEventHandler((event) => {
  if (!import.meta.dev) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }

  setHeader(event, 'Content-Type', 'text/html; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return devResetHtml
})
