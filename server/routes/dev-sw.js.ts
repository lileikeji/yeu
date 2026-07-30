const devServiceWorkerRetirementScript = `self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(clients.map(client => client.navigate(client.url)));
  })());
});
`

export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'text/javascript; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store, no-cache, must-revalidate')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'Service-Worker-Allowed', '/')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return devServiceWorkerRetirementScript
})
