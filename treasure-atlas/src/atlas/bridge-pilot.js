function createBridgePilot(config, onStateSync, onStampChange, frog) {
  const stateEndpoint = '/api/public/treasure/state'
  const claimEndpoint = '/api/public/treasure/claim'

  let stateData = config.state ?? null
  let loading = null
  let loadFailed = false
  let busy = false
  let eligible = false
  let message = ''
  let wrong = false
  let view = null
  let currentEntry = null

  const getState = () => stateData
  const isCollectedRemote = id => Boolean(stateData?.collectedMap && Object.hasOwn(stateData.collectedMap, id))
  const isAuthenticated = () => Boolean(stateData?.actor?.authenticated)
  const collected = () => isCollectedRemote('zodiac-bridge') || isCollectedRemote('rainbow-bridge')

  function loginUrl(entryId) {
    const isYeuca = Boolean(config.isYeucaHost) || location.hostname === 'yeuca.huiliyill.cn'
    const path = `/activities/treasure${entryId ? `?point=${encodeURIComponent(entryId)}` : ''}`
    if (isYeuca) return `/member/?redirect=${encodeURIComponent(path)}`
    if (stateData?.requireMember) {
      return `https://yeuca.huiliyill.cn/member/?redirect=${encodeURIComponent(`https://yeuca.huiliyill.cn${path}`)}`
    }
    return `/login?redirect=${encodeURIComponent(path)}`
  }

  function loginButtonLabel() {
    const isYeuca = Boolean(config.isYeucaHost) || location.hostname === 'yeuca.huiliyill.cn'
    if (isYeuca || stateData?.requireMember) return '登录计协会员账号参加'
    return '登录后参加'
  }

  function paint() {
    if (!view || !currentEntry) return
    const closed = stateData?.enabled === false
    const actor = stateData?.actor
    const memberBlocked = Boolean(stateData?.requireMember && actor?.type !== 'yeuca_member')
    const authed = Boolean(actor?.authenticated) && !memberBlocked
    const canLocate = Boolean(!closed && authed)
    const radius = currentEntry.radiusMeters ?? config.radius ?? 20
    const needsAnswer = currentEntry.verifyMode !== 'gps_only'

    if (message) {
      view.status.textContent = message
    } else if (closed) {
      view.status.textContent = '当前校园寻宝活动暂未开放。'
    } else if (loadFailed && !stateData) {
      view.status.textContent = '暂时无法同步活动状态，请重试。'
    } else if (!actor?.authenticated) {
      view.status.textContent = stateData?.requireMember
        ? '本活动需登录计协会员账号后定位集章。'
        : '登录计协会员或迎新账号后可定位并保存正式印章。'
    } else if (memberBlocked) {
      view.status.textContent = '后台已设仅限计协在册会员集章，请改用计协会员账号登录。'
    } else {
      view.status.textContent = `请到「${currentEntry.landmark || currentEntry.name}」${radius} 米内验证手机位置。`
    }

    view.login.href = loginUrl(currentEntry.id)
    view.login.textContent = loginButtonLabel()
    view.login.hidden = closed || authed
    view.retry.hidden = closed || !loadFailed
    view.locate.hidden = !canLocate
    view.locate.disabled = busy
    view.locate.textContent = eligible ? '重新定位' : '验证当前位置'

    view.gpsClaim.hidden = !(canLocate && eligible && !needsAnswer)
    view.gpsClaim.disabled = busy

    view.form.hidden = !(canLocate && eligible && needsAnswer)
    if (view.answerLabel) {
      view.answerLabel.textContent = currentEntry.question || '现场暗号'
    }
    view.answer.disabled = busy
    view.submit.disabled = busy || !view.answer.value.trim()
    view.caption.hidden = !canLocate
    view.caption.textContent = actor?.type === 'yeuca_member'
      ? `定位与提交时实时核验位置，印章记录到计协会员 ${actor.label}。`
      : '定位与提交时实时核验位置，印章记录到当前账号。'

    view.reaction.hidden = !wrong
    if (wrong) view.answer.setAttribute('aria-invalid', 'true')
    else view.answer.removeAttribute('aria-invalid')
  }

  async function requestJson(url, body) {
    const headers = new Headers()
    if (body) {
      headers.set('content-type', 'application/json')
      const cookies = document.cookie.split(';').map(cookie => cookie.trim())
      for (const name of config.csrfCookies || []) {
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
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET',
        headers,
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        body: body ? JSON.stringify(body) : undefined
      })
      if (!response.ok) {
        let errMessage = ''
        try {
          const payload = await response.json()
          errMessage = payload?.data?.message || payload?.message || ''
        } catch {}
        throw Object.assign(new Error(errMessage || 'Treasure request failed'), { status: response.status })
      }
      return await response.json()
    } finally {
      clearTimeout(timeout)
    }
  }

  function refresh() {
    if (busy) return
    if (loading) return loading
    loadFailed = false
    loading = requestJson(stateEndpoint).then((next) => {
      stateData = next
      if (!next.actor?.authenticated || !next.enabled) eligible = false
      onStateSync?.(next)
    }).catch(() => {
      loadFailed = true
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
    if (busy || !view || !currentEntry || stateData?.enabled === false) return
    if (!stateData?.actor?.authenticated) return
    if (isCollectedRemote(currentEntry.id)) return

    const current = view
    const entry = currentEntry
    const needsAnswer = entry.verifyMode !== 'gps_only'
    const answer = current.answer.value.trim()
    if (action === 'claim' && !eligible) return
    if (action === 'claim' && needsAnswer && !answer) return

    if (loading) await loading
    if (current !== view || busy) return
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
      message = '正在核验坐标与暗号…'
      paint()

      const payload = action === 'claim'
        ? { action: 'claim', pointId: entry.id, position, ...(needsAnswer ? { answer } : {}) }
        : { action: 'check', pointId: entry.id, position }
      const result = await requestJson(claimEndpoint, payload)

      if (result.status === 'collected') {
        eligible = false
        if (stateData) {
          stateData.collectedMap = { ...(stateData.collectedMap || {}), [entry.id]: result.collectedAt }
        }
        onStampChange?.(entry.id, true)
        return
      }
      if (view !== current) return

      wrong = result.status === 'wrong-answer'
      eligible = result.status === 'eligible' || result.status === 'wrong-answer'
      const radius = entry.radiusMeters ?? config.radius ?? 20
      const messages = {
        'eligible': needsAnswer
          ? `已进入 ${radius} 米范围（约 ${result.distanceMeters} 米），请输入答案或暗号。`
          : `已进入 ${radius} 米范围（约 ${result.distanceMeters} 米），可点击直接集章。`,
        'outside': `距点位约 ${result.distanceMeters} 米（需进入 ${radius} 米内），请走近后重试。`,
        'inaccurate': '定位精度不足，请到室外开阔处重新定位。',
        'stale': '定位结果已过期，请重新获取定位。',
        'wrong-answer': '暗号或答案不对，再查看一下现场线索。',
        'goal-unmet': `还未集齐 ${stateData?.goalCount ?? 5} 枚印章，暂时无法开启终点。`,
        'member-required': '后台设置仅限计协会员账号参与集章，请先登录计协会员账号。',
        'closed': '寻宝活动已暂停开放。',
        'not-found': '该寻宝点位已被下架或调整，请刷新后查看。'
      }
      message = messages[result.status] ?? '暂时无法验证，请稍后重试。'
    } catch (error) {
      refreshSession = error.status === 401 || error.status === 403
      if (view === current) {
        if (refreshSession) eligible = false
        message = refreshSession
          ? (error.message || '登录状态需要更新，请先登录后重试。')
          : error.status === 429 ? '提交过于频繁，请一分钟后重试。' : '网络请求异常，请稍后重试。'
      }
    } finally {
      busy = false
      paint()
      if (refreshSession) void refresh()
    }
  }

  function submitTrialClaim(pointId, trialDistanceMeters, answer) {
    return requestJson(claimEndpoint, {
      action: 'claim',
      pointId,
      trialDistanceMeters,
      answer
    })
  }

  function mount(container, entry) {
    currentEntry = entry
    eligible = false
    wrong = false
    message = ''
    container.append(document.getElementById('bridge-pilot-template').content.cloneNode(true))
    const find = selector => container.querySelector(selector)
    view = {
      status: find('.bridge-status'),
      login: find('.bridge-login'),
      retry: find('[data-bridge-retry]'),
      locate: find('[data-bridge-locate]'),
      gpsClaim: find('[data-bridge-gps-claim]'),
      form: find('.bridge-answer'),
      answerLabel: find('.bridge-answer label'),
      answer: find('#bridge-answer'),
      submit: find('button[type=submit]'),
      caption: find('.bridge-caption'),
      reaction: find('.parade-reaction')
    }
    view.reaction.querySelector('img').src = frog
    view.retry.addEventListener('click', () => void refresh())
    view.locate.addEventListener('click', () => void run('check'))
    view.gpsClaim.addEventListener('click', () => void run('claim'))
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
    if (!stateData) void refresh()
  }

  function unmount() {
    view = null
    currentEntry = null
    eligible = false
    wrong = false
    message = ''
  }

  return {
    getState,
    isAuthenticated,
    isCollectedRemote,
    collected,
    loginUrl,
    refresh,
    submitTrialClaim,
    mount,
    unmount
  }
}
