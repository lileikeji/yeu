/**
 * Student account surfaces are currently disabled in the public UI.
 * Keep old bookmarks and client-side navigations from reopening them.
 * Admin login lives under /admin/login and is intentionally unaffected.
 */
export default defineNuxtRouteMiddleware((to) => {
  const path = to.path.replace(/\/+$/, '') || '/'
  const disabled = path === '/login'
    || path.startsWith('/login/')
    || path === '/chat'
    || path.startsWith('/chat/')
    || path === '/me'
    || path.startsWith('/me/')

  if (!disabled) return

  return navigateTo('/', {
    replace: true,
    redirectCode: 302
  })
})
