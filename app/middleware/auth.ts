/**
 * Require an app-user session for private pages (chat / me).
 * Guests are redirected to /login; APIs already return 401 as a second gate.
 * Server also enforces this via server/middleware/require-user-pages.ts.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, refreshSession } = useUserSession()
  await refreshSession(true)

  if (!isAuthenticated.value) {
    const redirect = to.fullPath && to.fullPath.startsWith('/') && !to.fullPath.startsWith('//')
      ? to.fullPath
      : '/me'
    return navigateTo(
      {
        path: '/login',
        query: { redirect }
      },
      {
        replace: true,
        redirectCode: 302
      }
    )
  }
})
