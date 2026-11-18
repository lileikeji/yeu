(() => {
  'use strict'
  const $ = id => document.getElementById(id)
  const data = JSON.parse($('atlas-data').textContent)
  const { activity, pins, style, tileData, icons, characters, taffy, goal, paradeDemo,
    artworkIds, artBounds, bridgeRoute, pilot, pendingPlanNames } = data
  const bridgeConfig = JSON.parse($('bridge-config').textContent)
  const bridgeEntry = activity.find(entry => entry.id === paradeDemo)
  const routeMatchesPilot = !bridgeConfig.point || pilot.point.every((coordinate, index) => Math.abs(coordinate - bridgeConfig.point[index]) < 1e-7)
  if (bridgeConfig.point) bridgeEntry.point = bridgeConfig.point
  const entries = [...activity, ...pins]
  const byId = new Map(entries.map(entry => [entry.id, entry]))
  const names = { all: '全校', new: '新区', old: '旧区' }
  const keys = { chest: '角色立牌', oculus: '校园神瞳', finish: '终点立牌', waypoint: '传送锚点', landmark: '校园地标' }
  const initialKinds = ['chest', 'oculus', 'finish', 'waypoint', 'landmark', 'taffy', 'classroom']
  const campusCenter = [118.6058, 25.1115]
  const weatherUrl = `https://wttr.in/${campusCenter[1]},${campusCenter[0]}?format=j1`
  const rainCodes = new Set([263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 317, 320, 353, 356, 359, 362, 365, 386, 389])
  const palettes = {
    clear: { icon: '☀', ground: [0, 1, 0.07, 0], water: [0, 1, 0.04, 0], roof: '#dbc39a', road: '#f1d8a4', line: '#ece3b1' },
    cloudy: { icon: '☁', ground: [0.035, 0.90, -0.29, 5], water: [0.03, 0.92, -0.23, 8], roof: '#c2bda1', road: '#d9cbad', line: '#dadcbb' },
    rain: { icon: '☂', ground: [0.03, 0.82, -0.28, 28], water: [0.02, 0.87, -0.16, 12], roof: '#b1b8a3', road: '#c4cbb0', line: '#b4d2c5' },
    night: { icon: '☾', ground: [0.045, 0.76, -0.25, 34], water: [0.03, 0.83, -0.08, 20], roof: '#abaf98', road: '#d6c598', line: '#b7cebb' }
  }
  const groups = ['教学与图书馆', '餐厅', '行政与公共建筑', '校园地标']
  const storageKey = 'yeu-atlas-share-playtest-progress'
  const collectibles = activity.filter(entry => entry.kind === 'chest' || entry.kind === 'oculus')
  const taffyChests = activity.filter(entry => entry.kind === 'taffy')
  const classroomStandees = activity.filter(entry => entry.kind === 'classroom')
  const classroomEffects = {
    phoebe: '<span class="unbox-halo"></span>',
    guga: '<span class="unbox-cookie"></span>',
    doro: '<span class="unbox-skid"></span>',
    whale: '<span class="unbox-ripple"></span>'
  }
  const revealed = new Set()
  let collected = new Set()
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
    if (Array.isArray(saved)) collected = new Set(saved.filter(id => id !== paradeDemo && activity.some(entry => entry.id === id)))
  } catch {}
  const state = { region: 'all', tab: 'hunt', kinds: new Set(initialKinds), selected: null, sample: null, relief: false }
  const mapLib = globalThis.AtlasMapLibre || (typeof AtlasMapLibre === 'undefined' ? undefined : AtlasMapLibre)
  let map = null
  let ready = false
  let markers = new Map()
  let junctionLabel
  let weatherPending = false
  let lastLiveWeather = null
  const media = window.matchMedia('(max-width: 767px)')
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)')
  const bridge = createBridgePilot(bridgeConfig, onBridgeStampChange, characters.frog.still)
  const motion = () => reduce.matches ? 0 : 550
  const isActivity = entry => Object.hasOwn(entry, 'question')
  const regionEntries = source => source.filter(entry => state.region === 'all' || entry.region === state.region)
  const isCollected = entry => entry.id === paradeDemo ? bridge.collected() : collected.has(entry.id)
  const stampCount = () => collectibles.filter(isCollected).length
  const isStandee = entry => entry.kind === 'chest' || entry.kind === 'finish'
  const isHidden = entry => entry.kind === 'oculus' || entry.kind === 'taffy' || entry.kind === 'classroom'
  const isDiscovered = entry => revealed.has(entry.id) || collected.has(entry.id)
  const displayName = entry => entry.kind === 'classroom' && !collected.has(entry.id) ? '教学楼隐藏立牌' : entry.name
  const openedIcon = (entry) => {
    if (!isCollected(entry)) return entry.kind
    if (isHidden(entry)) return `${entry.kind}-done`
    return entry.kind === 'finish' ? 'finish-done' : 'opened'
  }
  const safe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[ch])
  const characterPicture = (avatar, className, still = false) => {
    const motionSource = avatar.animated && !still ? `<source media="(prefers-reduced-motion: no-preference)" srcset="${avatar.animated}">` : ''
    return `<picture class="${className}">${motionSource}<img alt="" src="${avatar.still}"></picture>`
  }
  const image = (kind, entryId, still = false) => {
    if (kind === 'classroom') return '<span class="classroom-seal" aria-hidden="true">?</span>'
    if (kind === 'taffy' || kind === 'taffy-done') {
      const avatar = taffy[entryId]
      return `<span class="taffy-art" data-state="${kind}" aria-hidden="true">${characterPicture(avatar, 'taffy-avatar', still)}<span class="taffy-chest">${kind === 'taffy-done' ? '✓' : `<img alt="" src="${icons.chest}">`}</span></span>`
    }
    const character = byId.get(entryId)?.character
    if (character) {
      const avatar = characters[character]
      const animal = avatar.animal ? `<span class="zodiac-label">${avatar.animal}</span>` : ''
      const motion = avatar.animal ? `<canvas class="zodiac-motion" data-zodiac="${character}" width="${zodiacCanvasSize}" height="${zodiacCanvasSize}"></canvas>` : ''
      return `<span class="standee-art${avatar.animal ? ' zodiac-art' : ''}" data-character="${character}" data-state="${kind === 'classroom-done' ? 'opened' : kind}" aria-hidden="true">${characterPicture(avatar, 'standee-avatar', still)}${motion}${animal}</span>`
    }
    return icons[kind] ? `<img alt="" src="${icons[kind]}">` : ''
  }
  const renderRows = (items, label) => items.map(entry => `<li><button type="button" data-id="${safe(entry.id)}">${safe(entry.name)}<small>${safe(label(entry))}</small></button></li>`).join('')
  const markerPriority = { finish: 6, chest: 5, classroom: 4, taffy: 4, oculus: 4, waypoint: 3, landmark: 2, dorm: 1 }

  function visible(entry) {
    if (entry.kind === 'dorm') return state.selected?.id === entry.id
    if (state.selected?.id === entry.id) return true
    if (state.region !== 'all' && entry.region !== state.region) return false
    if (!state.kinds.has(entry.kind)) return false
    if (['waypoint', 'landmark'].includes(entry.kind) && state.tab !== 'places') return false
    if (isHidden(entry) && !isDiscovered(entry)) return false
    return !$('hide-done').checked || !isCollected(entry)
  }

  function sidebar(open, focus = false) {
    $('filters').dataset.open = String(open)
    $('atlas').dataset.sidebarOpen = String(open)
    $('open-filters').setAttribute('aria-expanded', String(open))
    $('open-filters').hidden = open
    if (focus) (open ? $('close-filters') : $('open-filters')).focus({ preventScroll: true })
  }

  function refreshSidebar() {
    for (const button of document.querySelectorAll('[data-region]')) button.setAttribute('aria-pressed', String(button.dataset.region === state.region))
    $('region-cycle').textContent = state.region === 'all' ? '◆ 仰恩大学 ▾' : `◆ 仰恩${names[state.region]} ▾`
    const query = $('search').value.trim().toLowerCase()
    $('search-pane').hidden = !query
    $('hunt-pane').hidden = Boolean(query) || state.tab !== 'hunt'
    $('place-pane').hidden = Boolean(query) || state.tab !== 'places'
    for (const button of document.querySelectorAll('[data-tab]')) button.setAttribute('aria-pressed', String(button.dataset.tab === state.tab && !query))
    if (query) {
      const matches = entries.filter(entry => (entry.kind === 'classroom' ? collected.has(entry.id) : !isHidden(entry) || isDiscovered(entry))
        && [entry.name, entry.alias, entry.landmark, entry.group, names[entry.region]].some(part => part?.toLowerCase().includes(query)))
        .sort((a, b) => (b.name.toLowerCase() === query) - (a.name.toLowerCase() === query))
      const missing = pendingPlanNames.filter(name => name.includes(query))
      $('results').innerHTML = renderRows(matches, entry => `${names[entry.region]} · ${entry.location?.description || entry.group || entry.landmark}`)
        + missing.map(name => `<li><p class="muted">${safe(name)} · 校图坐标待补</p></li>`).join('')
      $('no-results').hidden = matches.length > 0 || missing.length > 0
    } else {
      const makeTile = (kind, count) => `<button type="button" class="tile" data-kind="${kind}" aria-pressed="${state.kinds.has(kind)}"><span class="tile-art">${image(kind === 'finish' ? 'chest' : kind) || '<span aria-hidden="true">◎</span>'}<small>${count}</small></span>${keys[kind]}</button>`
      const scopedActivity = regionEntries(activity)
      const scopedPins = regionEntries(pins)
      $('hunt-tiles').innerHTML = ['chest', 'oculus', 'finish'].map(kind => makeTile(kind, scopedActivity.filter(entry => entry.kind === kind).length)).join('')
      const standees = scopedActivity.filter(entry => entry.kind === 'chest')
      const opened = standees.filter(isCollected).length
      $('standee-title').textContent = `立牌图鉴 · 已收集 ${opened}/${standees.length}`
      const standeesByCharacter = new Map(standees.map(entry => [entry.character, entry]))
      $('standee-list').innerHTML = Object.entries(characters).map(([key, avatar]) => {
        const entry = standeesByCharacter.get(key)
        if (!entry) return ''
        const label = isCollected(entry) ? `${entry.name}，已收集` : entry.name
        return `<li><button type="button" data-id="${safe(entry.id)}" title="${safe(label)}" aria-label="${safe(label)}">${image(openedIcon(entry), entry.id, true)}<span>${safe(avatar.name)}</span></button></li>`
      }).join('')
      $('place-tiles').innerHTML = ['waypoint', 'landmark'].map(kind => makeTile(kind, scopedPins.filter(entry => entry.kind === kind).length)).join('')
      const hintRows = scopedActivity.filter(entry => entry.kind === 'oculus')
      $('hint-title').innerHTML = image('oculus') + `神瞳线索 · ${hintRows.length} 处`
      $('hints').innerHTML = hintRows.map((entry, index) => `<li><button type="button" data-id="${entry.id}">${safe(revealed.has(entry.id) ? entry.name : `${names[entry.region]}线索 ${index + 1}`)}<small>${safe(entry.clue)}</small></button></li>`).join('')
      const taffyCollected = taffyChests.filter(entry => collected.has(entry.id)).length
      $('taffy-title').innerHTML = `${image('taffy', taffyChests[0].id, true)}塔菲宝箱线索 · ${taffyCollected}/${taffyChests.length}`
      const scopedTaffy = scopedActivity.filter(entry => entry.kind === 'taffy')
      $('taffy-hints').innerHTML = scopedTaffy.map((entry, index) => {
        const label = isDiscovered(entry) ? entry.name : `${names[entry.region]}隐藏线索 ${index + 1}`
        return `<li><button type="button" data-id="${entry.id}">${safe(label)}<small>${safe(entry.clue)}</small></button></li>`
      }).join('')
      const scopedClassroom = regionEntries(classroomStandees)
      const classroomCollected = scopedClassroom.filter(entry => collected.has(entry.id)).length
      $('classroom-title').textContent = `教学楼隐藏款 · ${classroomCollected}/${scopedClassroom.length}`
      $('classroom-hints').innerHTML = scopedClassroom.map((entry) => {
        const label = collected.has(entry.id) ? entry.name : `${names[entry.region]} · ${entry.room}线索`
        return `<li><button type="button" data-id="${safe(entry.id)}">${safe(label)}<small>${safe(entry.clue)}</small></button></li>`
      }).join('')
      const open = new Set([...$('directory-list').querySelectorAll('details[open]')].map(el => el.dataset.group))
      $('directory-list').innerHTML = groups.map((group, index) => {
        const rows = scopedPins.filter(entry => entry.group === group).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'))
        if (!rows.length) return ''
        return `<details class="folder" data-group="${group}" ${open.has(group) || (!open.size && index === 0) ? 'open' : ''}><summary>${group} · ${rows.length}</summary><ul class="results">${renderRows(rows, entry => `${names[entry.region]}${entry.plan ? ' · 校图 ' + entry.plan : ''}`)}</ul></details>`
      }).join('')
    }
    $('progress-text').textContent = `本机试玩 · 已收集 ${stampCount()} / ${collectibles.length}`
    $('stamps').textContent = `探索印章 · ${Math.min(stampCount(), goal)} / ${goal}`
  }

  function populateRain(layer) {
    // Negative delays start the drops at different heights on the first frame.
    const streaks = Array.from({ length: 54 }, (_, index) => {
      const x = 2 + index * 2.25 + (index % 4) * 0.72
      const speed = 590 + (index * 67) % 390
      const delay = (index * 137) % speed
      const length = 17 + (index * 13) % 37
      return `<i class="rain-streak" style="--x:${x}%;--speed:${speed}ms;--delay:-${delay}ms;--length:${length}px"></i>`
    })
    const droplets = [[9, 18, 13], [75, 12, 10], [89, 34, 18], [15, 63, 16], [83, 74, 12], [44, 85, 9]]
      .map(([x, y, size], index) => `<i class="rain-droplet" style="left:${x}%;top:${y}%;--size:${size}px;--delay:-${index * 1160}ms"></i>`)
    layer.innerHTML = streaks.concat(droplets).join('')
  }

  function setWeather(mode) {
    const palette = palettes[mode]
    const rain = $('rain')
    if (mode === 'rain' && !rain.firstElementChild) populateRain(rain)
    rain.hidden = mode !== 'rain'
    $('viewport').dataset.weather = mode
    $('weather-icon').textContent = palette.icon
    if (!ready) return
    for (const id of artworkIds) {
      const values = palette.ground
      for (const [index, property] of ['raster-brightness-min', 'raster-brightness-max', 'raster-saturation', 'raster-hue-rotate'].entries()) map.setPaintProperty(id, property, values[index])
    }
  }

  function weatherStatus(label, description) {
    const selector = $('weather')
    selector.options[0].textContent = label
    selector.title = description
    $('weather-status').textContent = description
  }

  async function refreshLiveWeather() {
    const selector = $('weather')
    if (selector.value !== 'auto' || weatherPending) return
    weatherPending = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    try {
      const response = await fetch(weatherUrl, { signal: controller.signal, credentials: 'omit' })
      if (!response.ok) throw new Error('Weather unavailable')
      const payload = await response.json()
      const current = (payload.data ?? payload).current_condition?.[0]
      const code = current?.weatherCode
      if (!/^\d{3}$/.test(String(code ?? ''))) throw new Error('Weather condition missing')
      const mode = rainCodes.has(Number(code)) ? 'rain' : Number(code) === 113 ? 'clear' : 'cloudy'
      lastLiveWeather = mode
      if (selector.value !== 'auto') return
      setWeather(mode)
      const label = [...selector.options].find(option => option.value === mode).textContent
      weatherStatus(`自动 · ${label}`, `仰恩大学附近天气：${label}。来源：wttr.in。`)
    } catch {
      if (selector.value !== 'auto') return
      const hasRecentWeather = Boolean(lastLiveWeather)
      weatherStatus(hasRecentWeather ? '自动 · 更新失败' : '自动 · 暂不可用',
        hasRecentWeather ? '天气更新失败，显示上次获取的天气效果。' : '暂时无法获取校园天气，可以手动切换。')
    } finally {
      clearTimeout(timeout)
      weatherPending = false
    }
  }

  function selectWeather() {
    const mode = $('weather').value
    if (mode === 'auto') {
      setWeather(lastLiveWeather ?? 'clear')
      weatherStatus('自动 · 查询中', '正在获取仰恩大学附近天气。')
      void refreshLiveWeather()
    } else {
      setWeather(mode)
      weatherStatus('自动 · 跟随天气', '当前为手动天气效果。')
    }
  }

  function fitRegion(duration = motion()) {
    if (!ready) return
    const coords = state.region === 'all'
      ? [[artBounds[0], artBounds[1]], [artBounds[2], artBounds[3]]]
      : pins.filter(pin => pin.region === state.region && pin.kind !== 'landmark').map(pin => pin.point)
    const bounds = new mapLib.LngLatBounds()
    for (const coord of coords) bounds.extend(coord)
    for (const entry of regionEntries(activity)) {
      if (isStandee(entry)) bounds.extend(entry.point)
    }
    const padding = state.region === 'all'
      ? (media.matches ? { top: 74, right: 7, bottom: 74, left: 7 } : { top: 20, right: 14, bottom: 20, left: 14 })
      : (media.matches ? { top: 95, right: 24, bottom: 86, left: 24 } : { top: 60, right: 42, bottom: 55, left: 42 })
    map.fitBounds(bounds, { duration, padding, maxZoom: 17.2, bearing: map.getBearing(), pitch: map.getPitch() })
  }

  function updatePinSize() {
    if (!map) return
    const zoom = map.getZoom()
    $('map').dataset.scale = zoom < 16.05 ? 'wide' : 'close'
    $('map').style.setProperty('--pin-size', `${Math.min(37, Math.max(25, 25 + (zoom - 15) * 3.3))}px`)
    layoutMarkerCrowding()
  }

  function layoutMarkerCrowding() {
    if (!ready) return
    const zoom = map.getZoom()
    if (zoom >= 17.1) {
      for (const marker of markers.values()) marker.getElement().hidden = false
      return
    }
    const score = id => id === state.selected?.id ? 9 : id === paradeDemo ? 8 : markerPriority[byId.get(id).kind]
    const positions = []
    const separation = zoom < 16.05 ? 19 : 30
    for (const [id, marker] of [...markers].sort(([a], [b]) => score(b) - score(a))) {
      const point = map.project(marker.getLngLat())
      const hidden = positions.some(other => Math.hypot(point.x - other.x, point.y - other.y) < separation)
      marker.getElement().hidden = hidden
      if (!hidden) positions.push(point)
    }
  }

  function refreshMarkers() {
    if (!ready) return
    const shown = entries.filter(visible)
    const ids = new Set(shown.map(entry => entry.id))
    for (const [id, marker] of markers) if (!ids.has(id)) {
      marker.remove()
      markers.delete(id)
    }
    for (const entry of shown) {
      const stack = entry.kind === 'waypoint' && shown.some(item => isActivity(item)
        && Math.abs(item.point[0] - entry.point[0]) < 0.000012 && Math.abs(item.point[1] - entry.point[1]) < 0.000012)
      let marker = markers.get(entry.id)
      if (marker && marker.getElement().dataset.stack !== String(stack)) {
        marker.remove()
        marker = undefined
      }
      if (!marker) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'map-pin'
        button.dataset.kind = entry.kind
        button.dataset.pointId = entry.id
        button.dataset.stack = String(stack)
        button.addEventListener('click', (event) => {
          event.stopPropagation()
          select(entry, false)
        })
        // A landmark inside a building shares its coordinates with the building marker.
        const anchor = entry.location ? 'left' : stack ? 'top' : 'bottom'
        marker = new mapLib.Marker({ element: button, anchor, pitchAlignment: 'viewport', rotationAlignment: 'viewport' })
          .setLngLat(entry.point).addTo(map)
        markers.set(entry.id, marker)
      }
      const el = marker.getElement()
      el.dataset.collected = String(isCollected(entry))
      const icon = openedIcon(entry)
      if (el.dataset.icon !== icon) {
        el.dataset.icon = icon
        el.title = displayName(entry)
        el.setAttribute('aria-label', displayName(entry))
        el.innerHTML = image(icon, entry.id) || '<span aria-hidden="true"></span>'
      }
      el.setAttribute('aria-pressed', String(state.selected?.id === entry.id))
    }
    layoutMarkerCrowding()
  }

  function refreshZone() {
    if (!ready) return
    const entry = state.selected
    const features = []
    if (entry && isActivity(entry)) {
      const [longitude, latitude] = entry.point
      const radius = (entry.id === paradeDemo ? bridgeConfig.radius ?? pilot.radius : pilot.radius) / 6371000
      const phi = latitude * Math.PI / 180
      const ring = Array.from({ length: 65 }, (_, i) => {
        const az = i * Math.PI / 32
        const y = Math.asin(Math.sin(phi) * Math.cos(radius) + Math.cos(phi) * Math.sin(radius) * Math.cos(az))
        const x = Math.atan2(Math.sin(az) * Math.sin(radius) * Math.cos(phi), Math.cos(radius) - Math.sin(phi) * Math.sin(y))
        return [longitude + x * 180 / Math.PI, y * 180 / Math.PI]
      })
      ring[ring.length - 1] = ring[0]
      features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } })
    }
    map.getSource('positionZone')?.setData({ type: 'FeatureCollection', features })
    map.getSource('bridgeRoute')?.setData({
      type: 'FeatureCollection', features: entry?.id === paradeDemo && routeMatchesPilot
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...bridgeRoute.slice(0, -1), entry.point] } }]
        : []
    })
    if (junctionLabel) junctionLabel.hidden = entry?.id !== paradeDemo || !routeMatchesPilot
  }

  function placeDetail() {
    if (!ready || !state.selected || media.matches) return
    const pixel = map.project(state.selected.point)
    const width = $('viewport').clientWidth
    const height = $('viewport').clientHeight
    const detail = $('detail')
    if (state.selected.id === paradeDemo) {
      detail.style.setProperty('--detail-x', `${width - 374}px`)
      detail.style.setProperty('--detail-y', `${Math.max(102, height - detail.offsetHeight - 61)}px`)
      return
    }
    const x = pixel.x + 337 < width ? pixel.x + 23 : pixel.x - 333
    detail.style.setProperty('--detail-x', `${Math.max(12, Math.min(width - 324, x))}px`)
    detail.style.setProperty('--detail-y', `${Math.max(55, Math.min(height - 292, pixel.y - 104))}px`)
  }

  function paradeReward() {
    return `<div class="parade-reward" id="parade-reward"><div class="reward-stage" aria-hidden="true">
      ${characterPicture(characters['dragon-motion'], 'reward-dragon', true)}<span class="reward-stamp">巡游<br>印章</span><span class="reward-impact">DUANG!</span>
    </div><div class="reward-copy"><p id="reward-status" tabindex="-1">已集章 · 彩虹桥巡游印章 1 枚</p><button type="button" class="reward-replay" data-replay>重播弹章</button></div></div>`
  }

  function playReward(reward = $('parade-reward')) {
    reward.classList.remove('is-bouncing')
    void reward.offsetWidth
    reward.classList.add('is-bouncing')
  }

  function classroomReward(entry) {
    return `<div class="classroom-reward" id="classroom-reward" data-effect="${entry.character}">
      <div class="classroom-stage" aria-hidden="true">
        <img class="unbox-guest" alt="" src="${characters[entry.character].reveal}">
        <div class="unbox-effects">${classroomEffects[entry.character]}<i></i><i></i><i></i></div>
        <div class="unbox-light"></div>
        <div class="unbox-chest">
          <span class="unbox-lid"></span>
          <span class="unbox-base"></span>
          <span class="unbox-seam"></span>
        </div>
      </div>
      <div class="reward-copy"><p>已收集 · 教学楼隐藏款</p><button type="button" class="reward-replay" data-replay-classroom>重播开箱</button></div>
    </div>`
  }

  function refreshDetail() {
    const entry = state.selected
    const panel = $('detail')
    bridge.unmount()
    $('parade-shortcut').setAttribute('aria-expanded', String(entry?.id === paradeDemo))
    panel.hidden = !entry
    if (!entry) { panel.innerHTML = ''; return }
    const demo = entry.id === paradeDemo
    const classroom = entry.kind === 'classroom'
    const showUnboxing = classroom && collected.has(entry.id) && Object.hasOwn(classroomEffects, entry.character)
    panel.classList.toggle('parade-detail', demo)
    panel.classList.toggle('classroom-result', showUnboxing)
    const icon = image(openedIcon(entry), entry.id) || '<span class="detail-icon" aria-hidden="true">◎</span>'
    const subtitle = `${names[entry.region]} · ${entry.landmark || entry.group}${entry.room ? ' · ' + entry.room : ''}${entry.plan ? ' · 校图 ' + entry.plan : ''}`
    let body
    if (isActivity(entry)) {
      body = `<p>${safe(entry.clue)}</p><p class="location-note">${safe(entry.review.detail)}</p>`
      if (isCollected(entry)) {
        const messages = { finish: '终点立牌已验证', taffy: '已开启 · 收集 1 个塔菲隐藏款', classroom: '已收集 · 教学楼隐藏款' }
        body += demo ? paradeReward() : showUnboxing ? classroomReward(entry) : `<p class="done" tabindex="-1">${messages[entry.kind] ?? '已收集 · 计入 1 枚印章'}</p>`
      } else if (demo) body += '<div id="bridge-pilot"></div>'
      else if (entry.kind === 'finish' && stampCount() < goal) body += `<p class="feedback">还需 ${goal - stampCount()} 枚印章。</p>`
      else {
        body += `<div class="samples" role="group" aria-label="离线模拟位置">模拟距离 ${[19, 20, 21].map(value => `<button type="button" data-sample="${value}" aria-pressed="${state.sample === value}">${value} 米</button>`).join('')}</div>`
        body += '<p id="feedback" class="feedback" role="status"></p>'
        if (classroom) body += `<details class="demo-placard" id="demo-placard" hidden><summary>查看模拟立牌</summary><div class="demo-placard-face"><span class="classroom-glyph" aria-hidden="true">${entry.glyph}</span><div>立牌暗号<strong>${safe(entry.answer)}</strong></div></div></details>`
        const prompt = classroom ? '输入两字暗号' : '输入答案'
        const action = classroom ? '揭晓隐藏款' : entry.kind === 'taffy' ? '开启宝箱' : entry.kind === 'oculus' ? '收集神瞳' : '提交验证'
        body += `<form id="answer" class="answer" hidden><label for="answer-input">${entry.kind !== 'oculus' ? '试玩题 · ' : ''}${safe(entry.question)}</label><div><input id="answer-input" placeholder="${prompt}" maxlength="40" autocomplete="off" required><button type="submit" class="pill">${action}</button></div></form>`
      }
    } else {
      body = `<p>${safe(entry.review.detail)}</p>`
      if (entry.location) {
        body = `<p>${safe(entry.location.description)}。图钉标示图书馆位置，馆门待现场确认。</p><p><a href="${safe(entry.location.source)}" target="_blank" rel="noopener noreferrer">仰恩大学位置说明</a></p>`
      }
      if (entry.elevation !== undefined) body += `<p>地面海拔约 ${safe(entry.elevation)} 米。</p>`
      if (entry.kind === 'waypoint') body += '<button type="button" class="pill" data-transfer>传送到此处</button>'
    }
    panel.innerHTML = `<header>${icon}<div><h2 tabindex="-1">${safe(displayName(entry))}</h2><p>${safe(subtitle)}</p></div><button type="button" class="detail-close" aria-label="关闭点位详情" data-close>×</button></header>${body}`
    if ($('bridge-pilot')) bridge.mount($('bridge-pilot'))
    placeDetail()
  }

  function onBridgeStampChange(claimed) {
    refreshSidebar()
    refreshMarkers()
    if (state.selected?.kind === 'finish') refreshDetail()
    if (state.selected?.id !== paradeDemo) return
    refreshDetail()
    if (claimed) {
      playReward()
      $('reward-status').focus({ preventScroll: true })
      $('parade-reward').scrollIntoView({ block: 'nearest' })
    }
  }

  function select(entry, fly) {
    state.selected = entry
    state.sample = null
    if (isHidden(entry)) revealed.add(entry.id)
    if (entry.kind !== 'dorm') state.kinds.add(entry.kind)
    if (media.matches) sidebar(false)
    refreshSidebar()
    refreshMarkers()
    refreshZone()
    refreshDetail()
    if (fly && ready) {
      const demo = entry.id === paradeDemo
      const offset = media.matches
        ? (demo ? [34, -145] : entry.kind === 'classroom' ? [0, -145] : [0, 0])
        : (demo ? [-70, -75] : [0, 0])
      const zoom = demo
        ? (media.matches ? 17.45 : 18.06)
        : isActivity(entry) ? (media.matches ? 17.85 : 18.35) : 17.8
      map.easeTo({ center: entry.point, offset, zoom, duration: motion() })
    }
  }

  function closeDetail() {
    state.selected = null
    state.sample = null
    refreshDetail()
    refreshZone()
    refreshMarkers()
  }

  function changeRegion(region) {
    state.region = region
    closeDetail()
    refreshSidebar()
    if (media.matches) sidebar(false)
    fitRegion()
  }

  document.addEventListener('click', (event) => {
    const control = event.target.closest('button')
    if (!control) return
    if (control.dataset.region) changeRegion(control.dataset.region)
    else if (control.dataset.tab) {
      state.tab = control.dataset.tab
      $('search').value = ''
      closeDetail()
      refreshSidebar()
    } else if (control.dataset.id) {
      const entry = byId.get(control.dataset.id)
      if (entry) {
        select(entry, true)
        if (entry.kind === 'classroom') $('detail').querySelector('h2').focus({ preventScroll: true })
      }
    } else if (control.classList.contains('tile')) {
      const kind = control.dataset.kind
      if (!state.kinds.delete(kind)) state.kinds.add(kind)
      if (state.selected?.kind === kind && !state.kinds.has(kind)) closeDetail()
      refreshSidebar()
      refreshMarkers()
      document.querySelector(`#${state.tab === 'hunt' ? 'hunt-tiles' : 'place-tiles'} [data-kind="${kind}"]`)?.focus()
    } else if (Object.hasOwn(control.dataset, 'close')) closeDetail()
    else if (Object.hasOwn(control.dataset, 'replay')) playReward()
    else if (Object.hasOwn(control.dataset, 'replayClassroom')) playReward($('classroom-reward'))
    else if (Object.hasOwn(control.dataset, 'transfer') && state.selected?.kind === 'waypoint') {
      if (ready) map.easeTo({ center: state.selected.point, zoom: 18.7, duration: motion() })
      closeDetail()
    } else if (control.dataset.sample) {
      state.sample = Number(control.dataset.sample)
      for (const item of $('detail').querySelectorAll('[data-sample]')) item.setAttribute('aria-pressed', String(item === control))
      const inRange = state.sample <= 20
      const classroom = state.selected?.kind === 'classroom'
      $('feedback').textContent = inRange ? (classroom ? '已进入 20 米范围，可以输入暗号。' : '已进入 20 米范围，可以答题。') : '还在 20 米圈外，选 20 米或 19 米就能答题。'
      $('answer').hidden = !inRange
      if (classroom) {
        $('demo-placard').hidden = !inRange
        if (!inRange) $('demo-placard').open = false
      }
    }
  })
  $('detail').addEventListener('submit', (event) => {
    if (event.target.id !== 'answer') return
    event.preventDefault()
    const entry = state.selected
    if (!entry || entry.id === paradeDemo || state.sample === null || state.sample > 20 || isCollected(entry)) return
    const answer = $('answer-input').value.normalize('NFKC').trim().toLowerCase()
    if (answer !== entry.answer && !(entry.answer === '四' && ['4', '四片', '4片'].includes(answer))) {
      $('feedback').textContent = '答案不对，再看看线索。'
      return
    }
    collected.add(entry.id)
    try { localStorage.setItem(storageKey, JSON.stringify([...collected])) } catch {}
    refreshSidebar()
    refreshMarkers()
    refreshDetail()
    if (entry.kind === 'classroom') {
      $('detail').querySelector('h2').focus({ preventScroll: true })
      const reward = $('classroom-reward')
      if (reward) {
        reward.querySelector('.classroom-stage').scrollIntoView({ block: 'nearest' })
        playReward(reward)
      }
    }
  })
  $('search').addEventListener('input', refreshSidebar)
  $('search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $('results').querySelector('button')?.click()
  })
  $('hide-done').addEventListener('change', refreshMarkers)
  $('weather').addEventListener('change', selectWeather)
  window.addEventListener('online', refreshLiveWeather)
  setInterval(() => {
    if (!document.hidden && navigator.onLine) void refreshLiveWeather()
  }, 15 * 60 * 1000)
  function openBridge() {
    if (state.region !== 'all' && state.region !== bridgeEntry.region) state.region = bridgeEntry.region
    state.tab = 'hunt'
    $('search').value = ''
    select(bridgeEntry, true)
    $('detail').querySelector('h2').focus({ preventScroll: true })
  }
  $('parade-shortcut').addEventListener('click', () => {
    if (state.selected?.id === paradeDemo) closeDetail()
    else openBridge()
  })
  $('taffy-shortcut').addEventListener('click', () => {
    state.tab = 'hunt'
    state.region = 'all'
    $('search').value = ''
    closeDetail()
    refreshSidebar()
    sidebar(true)
    $('taffy-clues').open = true
    $('taffy-title').focus({ preventScroll: true })
    $('taffy-title').scrollIntoView({ block: 'nearest' })
  })
  $('classroom-shortcut').addEventListener('click', () => {
    state.tab = 'hunt'
    state.region = 'all'
    $('search').value = ''
    closeDetail()
    refreshSidebar()
    sidebar(true)
    $('classroom-clues').open = true
    $('classroom-title').focus({ preventScroll: true })
    $('classroom-title').scrollIntoView({ block: 'nearest' })
  })
  $('open-filters').addEventListener('click', () => sidebar(true, true))
  $('bottom-filters').addEventListener('click', () => sidebar(true, true))
  $('close-filters').addEventListener('click', () => sidebar(false, true))
  $('apply').addEventListener('click', () => sidebar(false, true))
  media.addEventListener('change', () => sidebar(!media.matches))
  $('overview').addEventListener('click', () => { closeDetail(); fitRegion() })
  $('region-cycle').addEventListener('click', () => changeRegion(({ all: 'new', new: 'old', old: 'all' })[state.region]))
  $('reset').addEventListener('click', () => {
    state.kinds = new Set(initialKinds)
    state.tab = 'hunt'
    $('search').value = ''
    $('hide-done').checked = false
    revealed.clear()
    closeDetail()
    refreshSidebar()
  })
  $('relief').addEventListener('click', () => {
    if (!ready) return
    state.relief = !state.relief
    map.setTerrain(state.relief ? { source: 'elevation', exaggeration: 1.25 } : null)
    map.easeTo({ pitch: state.relief ? 39 : 0, bearing: state.relief ? -15 : 0, duration: motion() })
    $('relief').setAttribute('aria-pressed', String(state.relief))
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.selected) closeDetail()
      else if ($('filters').dataset.open === 'true') sidebar(false, true)
    }
  })

  function fallback() {
    $('fallback').hidden = false
    $('map').hidden = true
    $('relief').disabled = true
    $('overview').disabled = true
    $('map-status').textContent = '正在显示静态地图。可从试玩入口或点位列表继续答题。'
    if (new URLSearchParams(location.search).get('point') === 'rainbow-bridge' && !state.selected) openBridge()
  }

  sidebar(!media.matches)
  refreshSidebar()
  void bridge.refresh()
  window.addEventListener('pageshow', (event) => { if (event.persisted) void bridge.refresh() })
  selectWeather()
  createZodiacRenderer()
  if (!mapLib) { fallback(); return }
  try {
    const worker = JSON.parse($('atlas-worker').textContent)
    mapLib.setWorkerUrl(URL.createObjectURL(new Blob([worker], { type: 'text/javascript' })))
    mapLib.setWorkerCount(1)
    mapLib.addProtocol('atlas', async ({ url }) => {
      const key = url.slice('atlas://'.length).split(/[?#]/)[0]
      const encoded = tileData[key]
      if (!encoded) return { data: new ArrayBuffer(0) }
      const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0))
      return { data: bytes.buffer }
    })
    map = new mapLib.Map({
      container: $('map'), style, center: campusCenter, zoom: 15.2, minZoom: 13.2, maxZoom: 19.6,
      maxBounds: [[118.566, 25.089], [118.637, 25.138]], renderWorldCopies: false, attributionControl: false,
      dragRotate: false, maxPitch: 56
    })
    new ResizeObserver(() => {
      map.resize()
      placeDetail()
    }).observe($('viewport'))
    map.addControl(new mapLib.NavigationControl({ showCompass: true }), 'bottom-right')
    map.addControl(new mapLib.ScaleControl({ unit: 'metric' }), 'bottom-left')
    const attribution = new mapLib.AttributionControl({ compact: true, customAttribution: [
      '<a href="https://registry.opendata.aws/terrain-tiles/">Mapzen</a>',
      '<a href="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer">Esri 影像参考</a>',
      '<a href="https://www.yeu.edu.cn/2022/1024/c1344a51789/page.htm">仰恩大学校图</a>'
    ] })
    map.addControl(attribution, 'bottom-right')
    const timeout = setTimeout(() => { if (!ready) fallback() }, 12000)
    map.on('load', () => {
      clearTimeout(timeout)
      ready = true
      $('map-status').hidden = true
      $('fallback').hidden = true
      $('map').hidden = false
      $('relief').disabled = false
      $('overview').disabled = false
      for (const [label, point, kind] of [
        ['新区', [118.5984, 25.1098], 'campus'], ['旧区', [118.6113, 25.1193], 'campus'], ['仰恩湖', [118.6066, 25.1089], 'lake'],
        ['彩虹桥', [118.6139, 25.1157], 'local'], ['湖边舞池', [118.60742, 25.11172], 'local'],
        ['仰恩基金会体育场', [118.6094, 25.11414], 'local'], ['文体中心', [118.60207, 25.11251], 'local']
      ]) {
        const element = document.createElement('div')
        element.className = `map-label ${kind}`
        element.textContent = label
        new mapLib.Marker({ element, anchor: 'bottom', pitchAlignment: 'viewport', rotationAlignment: 'viewport' }).setLngLat(point).addTo(map)
      }
      junctionLabel = document.createElement('div')
      junctionLabel.className = 'bridge-junction'
      junctionLabel.textContent = '旧区主路岔口'
      new mapLib.Marker({ element: junctionLabel, anchor: 'top-left', offset: [4, 7] })
        .setLngLat(bridgeRoute[0]).addTo(map)
      refreshZone()
      fitRegion(0)
      setWeather($('viewport').dataset.weather)
      refreshMarkers()
      updatePinSize()
      if (new URLSearchParams(location.search).get('point') === 'rainbow-bridge' && !state.selected) openBridge()
    })
    map.on('move', () => { placeDetail(); updatePinSize() })
    map.on('click', (event) => { if (!event.originalEvent.target.closest('.map-pin')) closeDetail() })
  } catch {
    fallback()
  }
})()
