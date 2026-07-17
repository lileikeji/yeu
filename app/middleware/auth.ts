/**
 * Require an app-user session for private pages (chat / me).
 * Guests are redirected to /login; APIs already return 401 as a second gate.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const { isAuthenticated, refreshSession } = useUserSession()
  await refreshSession(true)

  if (!isAuthenticated.value) {
    const redirect = to.fullPath && to.fullPath.startsWith('/') && !to.fullPath.startsWith('//')
      ? to.fullPath
      : '/me'
    return navigateTo({
      path: '/login',
      query: { redirect }
    })
  }
})
