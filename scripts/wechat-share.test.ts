import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import fc from 'fast-check'
import type { CompetitionPopularityCandidate } from '../shared/types'
import {
  popularityShareImageUrl,
  popularitySingerPhotoPath,
  resolvePopularityPageSharePayload
} from '../app/utils/popularity-share'
import {
  DEFAULT_SHARE_ICON_PATH,
  DEFAULT_SHARE_ICON_URL,
  normalizeShareIconUrl,
  stripEphemeralShareParams
} from '../shared/config/brand'
import {
  buildWechatJsSdkSignature,
  normalizeWechatShareUrl
} from '../server/modules/wechat/share'

const allowedHosts = ['yx.huiliyill.cn']

test('WeChat share signing accepts only the configured HTTPS sites and removes fragments', () => {
  assert.equal(
    normalizeWechatShareUrl(
      'https://yx.huiliyill.cn/clubs/computer-association?a=1#contact',
      allowedHosts
    ),
    'https://yx.huiliyill.cn/clubs/computer-association?a=1'
  )
  assert.equal(
    normalizeWechatShareUrl('https://yx.huiliyill.cn/departments/student-union', allowedHosts),
    'https://yx.huiliyill.cn/departments/student-union'
  )
  assert.throws(
    () => normalizeWechatShareUrl('https://yx.huiliyill.cn.evil.example/clubs/test', allowedHosts),
    /分享页面地址不受支持/
  )
  assert.throws(
    () => normalizeWechatShareUrl('http://yx.huiliyill.cn/clubs/test', allowedHosts),
    /分享页面地址不受支持/
  )
})

test('WeChat JS-SDK signature uses the required lowercase canonical parameter order', () => {
  assert.equal(
    buildWechatJsSdkSignature(
      'ticket-demo',
      'nonce-demo',
      1722222222,
      'https://yx.huiliyill.cn/clubs/computer-association?a=1'
    ),
    '88433fd165b55ff861944c530f12f27e14c1e167'
  )
})

test('WeChat credentials stay server-side and route sharing uses one automatic SDK entry', () => {
  const runtimeConfig = readFileSync(resolve('nuxt.config.ts'), 'utf8')
  const endpoint = readFileSync(resolve('server/api/public/wechat-share.get.ts'), 'utf8')
  const composable = readFileSync(resolve('app/composables/useWechatShareCard.ts'), 'utf8')
  const shareActions = readFileSync(resolve('app/composables/useShareActions.ts'), 'utf8')
  const layout = readFileSync(resolve('app/layouts/default.vue'), 'utf8')
  const plugin = readFileSync(resolve('app/plugins/wechat-share.client.ts'), 'utf8')
  const club = readFileSync(resolve('app/pages/clubs/[slug].vue'), 'utf8')
  const department = readFileSync(resolve('app/pages/departments/[slug].vue'), 'utf8')
  const activity = readFileSync(resolve('app/pages/activities/[slug].vue'), 'utf8')
  const app = readFileSync(resolve('app/app.vue'), 'utf8')
  const nginxSetup = readFileSync(resolve('ops/configure-nginx.sh'), 'utf8')

  assert.match(runtimeConfig, /wechatMpAppSecret: ''/)
  assert.doesNotMatch(runtimeConfig, /wechatMpAppSecret:\s*'[0-9a-f]{32}'/i)
  assert.match(endpoint, /runtimeConfig\.wechatMpAppSecret/)
  assert.match(endpoint, /CDN-Cache-Control', 'no-store'/)
  assert.doesNotMatch(endpoint, /appSecret[,\s}]*$/m)
  assert.match(composable, /updateAppMessageShareData/)
  assert.match(composable, /updateTimelineShareData/)
  assert.match(composable, /res\.wx\.qq\.com/)
  assert.match(composable, /sdk\.ready\([\s\S]*sdk\.config\(/)
  assert.doesNotMatch(composable, /signature\.url !== signedUrl/)
  // WeChat validates wx.config against the URL that loaded the page. On iOS
  // that never changes after pushState, so the entry URL must be captured once
  // and reused for signing instead of reading location.href per route.
  assert.match(composable, /entryPageUrl/)
  assert.match(composable, /function signingPageUrl\(userAgent: string\)/)
  assert.match(composable, /iP\(\?:hone\|ad\|od\)/)
  assert.match(composable, /: currentPageUrl\(\)/)
  assert.match(composable, /reportWechatShareDiagnostic\('wx_config', 'error'/)
  assert.match(composable, /reportWechatShareDiagnostic\('share_data', 'success'/)
  assert.match(plugin, /configureWechatShare/)
  assert.match(plugin, /lastScheduledRouteKey/)
  assert.doesNotMatch(layout, /configureWechatShare/)
  assert.doesNotMatch(club, /configureWechatShare/)
  assert.doesNotMatch(department, /configureWechatShare/)
  assert.match(shareActions, /微信分享未就绪/)
  assert.match(shareActions, /Do not fall through to clipboard sharing/)
  assert.match(app, /ogTitle: '迎新指南｜报到、地图与校园生活'/)
  assert.match(app, /https:\/\/yx\.huiliyill\.cn\/icons\/app-icon-512\.png\?v=[a-z0-9]+/i)
  assert.ok(app.includes(DEFAULT_SHARE_ICON_URL))
  assert.match(app, /itempropMeta\('image'/)
  const itempropHelper = readFileSync(resolve('app/utils/itemprop-meta.ts'), 'utf8')
  assert.ok(itempropHelper.includes('key: `itemprop:${itemprop}`'))
  assert.match(app, /<img[^>]*width="512"[^>]*height="512"/)
  assert.equal(existsSync(resolve('public/icons/app-icon-512.png')), true)
  assert.match(composable, /export function captureWechatEntryUrl/)
  assert.match(plugin, /captureWechatEntryUrl\(\)/)
  assert.match(plugin, /DEFAULT_SHARE_ICON_PATH/)
  assert.match(shareActions, /normalizeShareIconUrl/)
  assert.match(club, /normalizeShareIconUrl/)
  assert.match(department, /normalizeShareIconUrl/)
  assert.match(activity, /normalizeShareIconUrl/)
  for (const [name, source] of [
    ['app/plugins/wechat-share.client.ts', plugin],
    ['app/composables/useShareActions.ts', shareActions],
    ['app/pages/clubs/[slug].vue', club],
    ['app/pages/departments/[slug].vue', department],
    ['app/pages/activities/[slug].vue', activity]
  ] as const) {
    assert.doesNotMatch(
      source,
      /['"]\/icons\/app-icon-512\.png['"]/,
      `${name} 不得使用不带版本号的 /icons/app-icon-512.png`
    )
  }
  assert.ok(nginxSetup.includes('location \\/icons\\/'))
  assert.ok(nginxSetup.includes('location \\/images\\/'))
  assert.ok(nginxSetup.includes('try_files \\$uri @nuxt;'))
})

test('WeChat share thumbnail URL normalization and ticket parameter stripping', () => {
  const origin = 'https://yx.huiliyill.cn'
  assert.equal(DEFAULT_SHARE_ICON_PATH, '/icons/app-icon-512.png?v=20261127wx1')
  assert.equal(DEFAULT_SHARE_ICON_URL, 'https://yx.huiliyill.cn/icons/app-icon-512.png?v=20261127wx1')
  assert.equal(normalizeShareIconUrl(undefined, origin), DEFAULT_SHARE_ICON_URL)
  assert.equal(normalizeShareIconUrl('', origin), DEFAULT_SHARE_ICON_URL)
  assert.equal(normalizeShareIconUrl('/icons/app-icon-512.png', origin), DEFAULT_SHARE_ICON_URL)
  assert.equal(
    normalizeShareIconUrl('https://yx.huiliyill.cn/icons/app-icon-512.png', origin),
    DEFAULT_SHARE_ICON_URL
  )
  assert.equal(
    normalizeShareIconUrl('/uploads/club.png', origin),
    'https://yx.huiliyill.cn/uploads/club.png'
  )
  assert.equal(
    stripEphemeralShareParams(
      'https://yx.huiliyill.cn/singer/popularity?t=round1&vt=one-time-ticket&a=1#top',
      origin
    ),
    'https://yx.huiliyill.cn/singer/popularity?t=round1&a=1'
  )
})

test('WeChat client diagnostics are bounded, rate limited and omit request secrets', () => {
  const endpoint = readFileSync(
    resolve('server/api/public/wechat-share/report.post.ts'),
    'utf8'
  )
  assert.match(endpoint, /assertTrustedOrigin\(event\)/)
  assert.match(endpoint, /assertRateLimit\(/)
  assert.match(endpoint, /wechat-share-report:\$\{ipAddress\}.*, 120, 60 \* 60 \* 1000/)
  assert.match(endpoint, /max\(160\)/)
  assert.match(endpoint, /wechat_share_client/)
  assert.doesNotMatch(endpoint, /getHeader\(event, ['"]user-agent/)
  assert.doesNotMatch(endpoint, /input\.(?:signature|nonceStr|appSecret)/)
})

test('Popularity singer modal share card uses public media photo route, preserves ?id= and syncs WeChat/SSR meta', () => {
  const origin = 'https://yx.huiliyill.cn'
  const singerId = '11111111-2222-4333-8444-555555555555'
  const withPhoto: CompetitionPopularityCandidate = {
    singerId,
    number: 7,
    name: '林小声',
    className: '25电子专升本1班',
    photoUrl: 'https://example.cos.ap-guangzhou.myqcloud.com/a.jpg',
    photoUpdatedAt: 1764200000123,
    song: '晴天',
    sortOrder: 7,
    pairNo: null,
    pairSlot: null
  }
  const withoutPhoto: CompetitionPopularityCandidate = {
    ...withPhoto,
    singerId: '99999999-2222-4333-8444-555555555555',
    photoUrl: null,
    photoUpdatedAt: null
  }

  assert.equal(
    popularitySingerPhotoPath(singerId, 1764200000123),
    `/media/competition/singer-photo/${singerId}.jpg?v=1764200000123`
  )
  assert.doesNotMatch(popularitySingerPhotoPath(singerId, 1764200000123), /^\/api\//)

  assert.equal(
    popularityShareImageUrl(withPhoto, origin),
    `${origin}/media/competition/singer-photo/${singerId}.jpg?v=1764200000123`
  )
  assert.equal(popularityShareImageUrl(withoutPhoto, origin), DEFAULT_SHARE_ICON_URL)

  const singerPayload = resolvePopularityPageSharePayload({
    title: '人气奖投票',
    subtitle: '投出你的关键一票',
    candidate: withPhoto,
    origin
  })
  assert.equal(singerPayload.title, '7号 林小声｜人气奖投票')
  assert.match(singerPayload.description, /林小声（7号）《晴天》/)
  assert.equal(singerPayload.imageUrl, `${origin}/media/competition/singer-photo/${singerId}.jpg?v=1764200000123`)
  assert.equal(singerPayload.link, `${origin}/singer/popularity?id=${singerId}`)

  const homePayload = resolvePopularityPageSharePayload({
    title: '人气奖投票',
    subtitle: '投出你的关键一票',
    candidate: null,
    origin
  })
  assert.equal(homePayload.title, '人气奖投票｜新声歌手大赛')
  assert.equal(homePayload.description, '投出你的关键一票')
  assert.equal(homePayload.imageUrl, DEFAULT_SHARE_ICON_URL)
  assert.equal(homePayload.link, `${origin}/singer/popularity`)

  fc.assert(
    fc.property(
      fc.record({
        singerId: fc.uuid(),
        number: fc.integer({ min: 1, max: 99 }),
        name: fc.string({ minLength: 1, maxLength: 12 }),
        song: fc.string({ minLength: 0, maxLength: 20 }),
        hasPhoto: fc.boolean(),
        photoUpdatedAt: fc.option(fc.integer({ min: 1, max: 2_000_000_000_000 }), { nil: null }),
        selected: fc.boolean()
      }),
      (sample) => {
        const candidate: CompetitionPopularityCandidate = {
          singerId: sample.singerId,
          number: sample.number,
          name: sample.name,
          className: null,
          photoUrl: sample.hasPhoto ? 'https://cdn.example.com/photo.jpg' : null,
          photoUpdatedAt: sample.photoUpdatedAt,
          song: sample.song,
          sortOrder: sample.number,
          pairNo: null,
          pairSlot: null
        }
        const photoPath = popularitySingerPhotoPath(candidate.singerId, candidate.photoUpdatedAt)
        assert.equal(photoPath.startsWith('/media/competition/singer-photo/'), true)
        assert.equal(photoPath.startsWith('/api/'), false)

        const payload = resolvePopularityPageSharePayload({
          title: '人气奖投票',
          subtitle: '副标题',
          candidate: sample.selected ? candidate : null,
          origin
        })
        assert.equal(payload.imageUrl.includes('/api/'), false)
        if (sample.selected) {
          assert.equal(payload.link, `${origin}/singer/popularity?id=${encodeURIComponent(candidate.singerId)}`)
          if (sample.hasPhoto) {
            assert.equal(payload.imageUrl, `${origin}${photoPath}`)
          } else {
            assert.equal(payload.imageUrl, DEFAULT_SHARE_ICON_URL)
          }
        } else {
          assert.equal(payload.link, `${origin}/singer/popularity`)
          assert.equal(payload.imageUrl, DEFAULT_SHARE_ICON_URL)
        }
      }
    ),
    { numRuns: 100 }
  )

  assert.equal(existsSync(resolve('server/routes/media/competition/singer-photo/[id].ts')), true)
  assert.equal(existsSync(resolve('server/routes/media/competition/singer-photo/[id].get.ts')), false)
  assert.equal(existsSync(resolve('server/api/public/competition/popularity/singer-photo.get.ts')), false)

  const popularityPage = readFileSync(resolve('app/pages/singer/popularity.vue'), 'utf8')
  assert.match(popularityPage, /resolvePopularityPageSharePayload/)
  assert.match(popularityPage, /itempropMeta/)
  assert.match(popularityPage, /ogTitle/)
  assert.match(popularityPage, /ogImage/)
  assert.match(popularityPage, /configureWechatShare/)
})

test('WeChat timeline fallback image size >= 512px, HEAD preflight & CORP headers, and permission denied poster guidance', () => {
  const app = readFileSync(resolve('app/app.vue'), 'utf8')
  assert.doesNotMatch(app, /class="[^"]*\bsize-px\b[^"]*"/)
  assert.match(app, /width="512"\s+height="512"/)
  assert.match(app, /max-w-none/)
  assert.match(app, /useState<string>\(\s*['"]wechat-fallback-share-image['"]/)

  const popularityPage = readFileSync(resolve('app/pages/singer/popularity.vue'), 'utf8')
  assert.match(popularityPage, /useState<string>\(\s*['"]wechat-fallback-share-image['"]/)

  const mediaRoute = readFileSync(resolve('server/routes/media/competition/singer-photo/[id].ts'), 'utf8')
  assert.match(mediaRoute, /getMethod\(event\)/)
  assert.match(mediaRoute, /HEAD/)
  assert.match(mediaRoute, /Cross-Origin-Resource-Policy/)
  assert.match(mediaRoute, /cross-origin/)

  const cachePlugin = readFileSync(resolve('server/plugins/email-image-cache-headers.ts'), 'utf8')
  assert.match(cachePlugin, /Cross-Origin-Resource-Policy/)
  assert.match(cachePlugin, /cross-origin/)

  const composable = readFileSync(resolve('app/composables/useWechatShareCard.ts'), 'utf8')
  assert.match(composable, /timelinePermitted/)
  assert.match(composable, /appMessagePermitted/)

  const shareActions = readFileSync(resolve('app/composables/useShareActions.ts'), 'utf8')
  assert.match(shareActions, /timelinePermitted/)
  assert.match(shareActions, /朋友圈/)

  const sheet = readFileSync(resolve('app/components/competition/PopularitySingerSheet.vue'), 'utf8')
  assert.match(sheet, /timelinePermitted/)
  assert.match(sheet, /朋友圈海报/)

  const shareEndpoint = readFileSync(resolve('server/api/public/wechat-share.get.ts'), 'utf8')
  assert.match(shareEndpoint, /wechatMpAltAppId/)
  assert.match(shareEndpoint, /wechatMpAltAppSecret/)
})
