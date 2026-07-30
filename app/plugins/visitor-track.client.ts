export default defineNuxtPlugin((nuxtApp) => {
  if (!import.meta.client) return

  const router = useRouter()
  let lastKey = ''
  let lastAt = 0
  let queue: Promise<void> = Promise.resolve()

  const moduleRoutes = [
    { prefix: '/search', key: 'search', name: '校园搜索' },
    { prefix: '/map', key: 'map', name: '校园地图' },
    { prefix: '/places', key: 'map-place', name: '地图地点详情' },
    { prefix: '/procedures', key: 'procedures', name: '办事流程' },
    { prefix: '/guides', key: 'guides', name: '新生专题' },
    { prefix: '/checklist', key: 'checklist', name: '新生准备清单' },
    { prefix: '/dorms', key: 'dorms', name: '宿舍指南' },
    { prefix: '/student-rules', key: 'student-rules', name: '学生手册与规则' },
    { prefix: '/major-lookup', key: 'major-lookup', name: '专业与住宿查询' },
    { prefix: '/discover', key: 'discover', name: '服务导航' },
    { prefix: '/campus', key: 'campus', name: '校园与公告' },
    { prefix: '/departments', key: 'departments', name: '学校部门' },
    { prefix: '/clubs', key: 'clubs', name: '学生社团' },
    { prefix: '/nearby', key: 'nearby', name: '校园周边' },
    { prefix: '/transport', key: 'transport', name: '到校交通' },
    { prefix: '/panorama', key: 'panorama', name: '校园 VR' },
    { prefix: '/chat', key: 'chat', name: '新生群聊' },
    { prefix: '/me', key: 'profile', name: '个人中心' },
    { prefix: '/login', key: 'login', name: '账号登录' },
    { prefix: '/contact', key: 'contact', name: '联系我们' },
    { prefix: '/feedback', key: 'feedback', name: '反馈纠错' },
    { prefix: '/sources', key: 'sources', name: '信息来源' },
    { prefix: '/about', key: 'about', name: '关于本站' },
    { prefix: '/', key: 'home', name: '首页' }
  ]

  function resolveModule(path: string): { key: string, name: string } | null {
    const pathname = path.split('?')[0] || '/'
    if (pathname.startsWith('/admin') || pathname.startsWith('/research')) return null
    const matched = moduleRoutes.find(item => item.prefix === '/'
      ? pathname === '/'
      : pathname === item.prefix || pathname.startsWith(`${item.prefix}/`))
    return matched ? { key: matched.key, name: matched.name } : null
  }

  async function sendTrack(action: string, path: string, meta?: Record<string, unknown>) {
    try {
      await $fetch('/api/public/track', {
        method: 'POST',
        body: {
          action,
          path,
          meta
        },
        credentials: 'include'
      })
    } catch {
      // non-fatal
    }
  }

  function trackPage(path: string) {
    const now = Date.now()
    const key = path
    if (key === lastKey && now - lastAt < 2500) return
    lastKey = key
    lastAt = now
    const module = resolveModule(path)
    queue = queue.then(async () => {
      await sendTrack('page_view', path)
      if (module) {
        await sendTrack('module_view', path, {
          moduleKey: module.key,
          moduleName: module.name
        })
      }
    }).catch(() => undefined)
  }

  router.isReady().then(() => {
    trackPage(router.currentRoute.value.fullPath)
  }).catch(() => undefined)

  nuxtApp.hook('page:finish', () => {
    trackPage(router.currentRoute.value.fullPath)
  })
})
