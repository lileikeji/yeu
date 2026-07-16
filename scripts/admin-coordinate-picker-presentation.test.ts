import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ADMIN_COORDINATE_PICKER_DEFAULT_NAME,
  ADMIN_COORDINATE_PICKER_DRAFT_POI_ID,
  resolveAdminCoordinatePickerCurrentPoint,
  resolveAdminCoordinatePickerCurrentPoi,
  resolveAdminCoordinatePickerMountOptions,
  resolveAdminCoordinatePickerOutsideCampusBounds
} from '../app/utils/admin-coordinate-picker-presentation'
import { YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS } from '../map/core/campus'

describe('admin-coordinate-picker-presentation', () => {
  it('resolves current WGS84 point or null', () => {
    assert.deepEqual(
      resolveAdminCoordinatePickerCurrentPoint({
        coordinateSystem: 'WGS84',
        longitude: 118.6,
        latitude: 25.11
      }),
      { lng: 118.6, lat: 25.11, crs: 'WGS84' }
    )
    assert.equal(
      resolveAdminCoordinatePickerCurrentPoint({
        coordinateSystem: 'GCJ-02',
        longitude: 118.6,
        latitude: 25.11
      }),
      null
    )
    assert.equal(
      resolveAdminCoordinatePickerCurrentPoint({
        coordinateSystem: 'WGS84',
        longitude: null,
        latitude: 25.11
      }),
      null
    )
    assert.equal(
      resolveAdminCoordinatePickerCurrentPoint({
        coordinateSystem: 'WGS84',
        longitude: Number.NaN,
        latitude: 25.11
      }),
      null
    )
  })

  it('builds draft POI list and outside-bounds flag', () => {
    const point = { lng: 118.6, lat: 25.11, crs: 'WGS84' as const }
    assert.deepEqual(
      resolveAdminCoordinatePickerCurrentPoi({ point, name: '图书馆' }),
      [{
        id: ADMIN_COORDINATE_PICKER_DRAFT_POI_ID,
        name: '图书馆',
        category: 'service',
        point,
        status: 'draft'
      }]
    )
    assert.equal(
      resolveAdminCoordinatePickerCurrentPoi({ point: null, name: '图书馆' }).length,
      0
    )
    assert.equal(
      resolveAdminCoordinatePickerCurrentPoi({ point, name: '' })[0]?.name,
      ADMIN_COORDINATE_PICKER_DEFAULT_NAME
    )

    assert.equal(
      resolveAdminCoordinatePickerOutsideCampusBounds({ scope: 'campus', point }),
      false
    )
    assert.equal(
      resolveAdminCoordinatePickerOutsideCampusBounds({
        scope: 'campus',
        point: {
          lng: YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS.west - 0.01,
          lat: 25.11,
          crs: 'WGS84'
        }
      }),
      true
    )
    assert.equal(
      resolveAdminCoordinatePickerOutsideCampusBounds({
        scope: 'nearby',
        point: {
          lng: YEU_CAMPUS_COORDINATE_REVIEW_BOUNDS.west - 0.01,
          lat: 25.11,
          crs: 'WGS84'
        }
      }),
      false
    )
  })

  it('resolves mount options for focused or default view', () => {
    assert.deepEqual(
      resolveAdminCoordinatePickerMountOptions({ point: null }),
      { zoom: 15 }
    )
    assert.deepEqual(
      resolveAdminCoordinatePickerMountOptions({
        point: { lng: 118.6, lat: 25.11, crs: 'WGS84' }
      }),
      {
        center: { lng: 118.6, lat: 25.11, crs: 'WGS84' },
        zoom: 18
      }
    )
  })
})
