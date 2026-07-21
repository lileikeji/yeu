export default defineEventHandler((event) => {
  return sendRedirect(event, '/discover', 308)
})
