function createBridgePilot(config, onStampChange, frog) {
  const endpoint = '/api/public/treasure/pilot'
  let status = null
  let loading = null
  let loadFailed = false
  let busy = false
  let eligible = false
  let message = ''
  let wrong = false
  let view = null

  const collected = () => status?.collectedAt != null

  function setStatus(next, claimed = false) {
    const previous = status?.collectedAt ?? null
    status = next
    if ((status?.collectedAt ?? null) !== previous) onStampChange(claimed)
  }

  function paint() {
    if (!view) return
    const closed = !config.point || status?.enabled === false
    const canLocate = Boolean(!closed && status?.authenticated)
    view.status.textContent = message || (closed
      ? '彩虹桥试点暂未开放。'
      : loadFailed
        ? '暂时无法读取彩虹桥试点状态。'
        : !status
            ? '正在读取试点状态…'
            : !status.authenticated
                ? '登录迎新网后可验证位置并集章。'
                : `请到立牌 ${config.radius} 米内验证手机位置。`)
    view.login.hidden = closed || !status || status.authenticated
    view.retry.hidden = closed || !loadFailed
    view.locate.hidden = !canLocate
    view.locate.disabled = busy
    view.locate.textContent = eligible ? '重新定位' : '验证当前位置'
    view.form.hidden = !(canLocate && eligible)
    view.answer.disabled = busy
    view.submit.disabled = busy || !view.answer.value.trim()
    view.caption.hidden = !canLocate
    view.reaction.hidden = !wrong
    if (wrong) view.answer.setAttribute('aria-invalid', 'true')
    else view.answer.removeAttribute('aria-invalid')
  }

  async function request(body) {
    const headers = new Headers()
    if (body) {
      headers.set('content-type', 'application/json')
      const cookies = document.cookie.split(';').map(cookie => cookie.trim())
      for (const name of config.csrfCookies) {
        const match = cookies.find(cookie => cookie.startsWith(`${name}=`))
        if (match) {
          headers.set(config.csrfHeader, decodeURIComponent(match.slice(name.length + 1)))
          break
        }
      }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(endpoint, {
        method: body ? 'POST' : 'GET', headers,
        credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        body: body ? JSON.stringify(body) : undefined
      })
      if (!response.ok) {
        throw Object.assign(new Error('Treasure pilot request failed'), { status: response.status })
      }
      return await response.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  function refresh() {
    if (!config.csrfHeader || busy) return
    if (loading) return loading
    loadFailed = false
    loading = request().then((next) => {
      if (!next.authenticated || !next.enabled) eligible = false
      setStatus(next)
    }).catch(() => {
      loadFailed = true
      eligible = false
      setStatus(null)
    }).finally(() => {
      loading = null
      paint()
    })
    paint()
    return loading
  }

  function positionNow() {
    if (!window.isSecureContext || !navigator.geolocation) {
      return Promise.reject(new Error('请在支持定位的手机浏览器里，通过 HTTPS 打开。'))
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        ({ coords, timestamp }) => resolve({ lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, timestamp }),
        failure => reject(new Error(failure.code === 1 ? '定位权限未开启。请允许定位后重试。' : '暂时无法取得位置。请到开阔处重试。')),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
      )
    })
  }

  async function run(action) {
    if (busy || !view || !status?.enabled || !status.authenticated || collected()) return
    const current = view
    const answer = current.answer.value.trim()
    if (action === 'claim' && (!eligible || !answer)) return
    if (loading) await loading
    if (current !== view || busy || !status?.enabled || !status.authenticated || collected()) return
    busy = true
    wrong = false
    if (action === 'check') eligible = false
    message = '正在获取当前位置…'
    paint()
    let refreshSession = false
    try {
      const position = await positionNow().catch((error) => {
        if (view === current) {
          eligible = false
          message = error.message
        }
        return null
      })
      if (!position || view !== current) return
      message = '正在验证…'
      paint()
      const result = await request(action === 'claim' ? { action, position, answer } : { action, position })
      if (result.status === 'collected') {
        eligible = false
        setStatus({ ...status, collectedAt: result.collectedAt }, true)
        return
      }
      if (view !== current) return
      wrong = result.status === 'wrong-answer'
      eligible = result.status === 'eligible' || result.status === 'wrong-answer'
      const messages = {
        'eligible': `距立牌约 ${result.distanceMeters} 米，可以输入暗号。`,
        'outside': `距立牌约 ${result.distanceMeters} 米。请走近立牌后重试。`,
        'inaccurate': '定位精度不足。请到开阔处重新定位。',
        'stale': '这次定位已过期，请重新定位。',
        'wrong-answer': '暗号不正确，请再看看现场立牌。'
      }
      message = messages[result.status] ?? '暂时无法验证，请稍后重试。'
    } catch (error) {
      refreshSession = error.status === 401 || error.status === 403
      if (view === current) {
        if (refreshSession) eligible = false
        message = refreshSession
          ? '登录状态需要更新，请重试。'
          : error.status === 429 ? '尝试次数过多，请稍后重试。' : '暂时无法验证，请稍后重试。'
      }
    } finally {
      busy = false
      paint()
      if (refreshSession) void refresh()
    }
  }

  function mount(container) {
    container.append(document.getElementById('bridge-pilot-template').content.cloneNode(true))
    const find = selector => container.querySelector(selector)
    view = {
      status: find('.bridge-status'), login: find('.bridge-login'), retry: find('[data-bridge-retry]'),
      locate: find('[data-bridge-locate]'), form: find('.bridge-answer'), answer: find('#bridge-answer'),
      submit: find('button[type=submit]'), caption: find('.bridge-caption'), reaction: find('.parade-reaction')
    }
    view.reaction.querySelector('img').src = frog
    view.retry.addEventListener('click', () => void refresh())
    view.locate.addEventListener('click', () => void run('check'))
    view.answer.addEventListener('input', () => {
      if (wrong) message = ''
      wrong = false
      paint()
    })
    view.form.addEventListener('submit', (event) => {
      event.preventDefault()
      void run('claim')
    })
    paint()
    void refresh()
  }

  function unmount() {
    view = null
    eligible = false
    wrong = false
    message = ''
  }

  return { collected, refresh, mount, unmount }
}
