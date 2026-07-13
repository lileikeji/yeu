import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createMapProvider,
  MapProviderConfigurationError,
  resolveMapProviderConfig
} from '../map/providers/factory'

test('resolves the two supported map providers without exposing credentials', () => {
  assert.deepEqual(resolveMapProviderConfig({ mapProvider: 'maplibre-dev' }), {
    id: 'maplibre-dev'
  })
  assert.deepEqual(resolveMapProviderConfig({
    mapProvider: ' amap ',
    amapKey: ' public-key ',
    amapSecurityCode: ' security-code '
  }), {
    id: 'amap',
    amapKey: 'public-key',
    amapSecurityCode: 'security-code'
  })
})
test('rejects missing and unsupported production map configuration', () => {
  assert.throws(
    () => resolveMapProviderConfig({}),
    MapProviderConfigurationError
  )
  assert.throws(
    () => resolveMapProviderConfig({ mapProvider: 'amap' }),
    /NUXT_PUBLIC_AMAP_KEY/
  )
  assert.throws(
    () => resolveMapProviderConfig({ mapProvider: 'amap', amapKey: 'key' }),
    /NUXT_PUBLIC_AMAP_SECURITY_CODE/
  )
  assert.throws(
    () => resolveMapProviderConfig({ mapProvider: 'unknown' }),
    /不支持的地图 provider/
  )
})

test('factory creates provider instances without loading either browser SDK', async () => {
  const maplibre = await createMapProvider({ mapProvider: 'maplibre-dev' })
  const amap = await createMapProvider({
    mapProvider: 'amap',
    amapKey: 'public-key',
    amapSecurityCode: 'security-code'
  })

  assert.equal(maplibre.id, 'maplibre-dev')
  assert.equal(amap.id, 'amap')
})
