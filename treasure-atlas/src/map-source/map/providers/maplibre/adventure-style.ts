import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl'
import type { CampusAtmosphere } from '../../../shared/utils/campus-atmosphere.ts'
import terrainProfile from '../../../public/adventure-map/terrain-profile.json' with { type: 'json' }

const palettes = {
  clear: { ground: [0, 1, 0.07, 0], water: [0, 1, 0.04, 0], roof: '#dbc39a', road: '#f1d8a4', line: '#ece3b1' },
  cloudy: { ground: [0.035, 0.91, -0.23, 5], water: [0.03, 0.93, -0.17, 8], roof: '#c2bda1', road: '#d9cbad', line: '#dadcbb' },
  rain: { ground: [0.03, 0.82, -0.28, 28], water: [0.02, 0.87, -0.16, 12], roof: '#b1b8a3', road: '#c4cbb0', line: '#b4d2c5' },
  night: { ground: [0.045, 0.76, -0.25, 34], water: [0.03, 0.83, -0.08, 20], roof: '#abaf98', road: '#d6c598', line: '#b7cebb' }
} satisfies Record<CampusAtmosphere, { ground: number[], water: number[], roof: string, road: string, line: string }>

export function paintAdventureAtmosphere(map: MapLibreMap, scene: CampusAtmosphere) {
  const palette = palettes[scene]
  for (const [id, values] of [['relief-paint', palette.ground], ['water-paint', palette.water]] as const) {
    const [min, max, saturation, hue] = values
    map.setPaintProperty(id, 'raster-brightness-min', min)
    map.setPaintProperty(id, 'raster-brightness-max', max)
    map.setPaintProperty(id, 'raster-saturation', saturation)
    map.setPaintProperty(id, 'raster-hue-rotate', hue)
  }
  map.setPaintProperty('building-roofs', 'fill-color', palette.roof)
  map.setPaintProperty('supplemental-roof-fills', 'fill-color', palette.roof)
  map.setPaintProperty('roads', 'line-color', palette.road)
  map.setPaintProperty('elevation-major', 'line-color', palette.line)
}

export function createAdventureStyle(origin: string): StyleSpecification {
  const vector = new URL('/adventure-map/vector/{z}/{x}/{y}.pbf', origin).href
  const buildings = new URL('/adventure-map/buildings/{z}/{x}/{y}.pbf', origin).href
  const elevation = new URL('/adventure-map/terrain/{z}/{x}/{y}.png', origin).href
  const imageCoordinates = terrainProfile.bounds as [[number, number], [number, number], [number, number], [number, number]]
  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      reliefPaint: {
        type: 'image', url: new URL('/adventure-map/painted-relief.webp', origin).href, coordinates: imageCoordinates
      },
      waterPaint: {
        type: 'image', url: new URL('/adventure-map/painted-water.webp', origin).href, coordinates: imageCoordinates
      },
      originalAreas: {
        type: 'geojson', data: new URL('/adventure-map/original-areas.geojson', origin).href
      },
      contours: { type: 'geojson', data: new URL('/adventure-map/contours.geojson', origin).href },
      campus: {
        type: 'vector', tiles: [decodeURI(vector)], minzoom: 14, maxzoom: 14,
        bounds: [118.56, 25.077, 118.63, 25.138],
        attribution: '<a href="https://openfreemap.org/">OpenFreeMap</a>'
      },
      roofs: {
        type: 'vector', tiles: [decodeURI(buildings)], minzoom: 14, maxzoom: 14,
        bounds: [118.594, 25.103, 118.616, 25.121],
        attribution: '<a href="https://docs.overturemaps.org/attribution/#buildings">Overture Maps</a> · <a href="https://doi.org/10.5281/zenodo.8174931">Qian Shi et al.</a>'
      },
      supplementalRoofs: {
        type: 'geojson', data: new URL('/adventure-map/supplemental-roofs.geojson', origin).href,
        attribution: '<a href="https://source.coop/tge-labs/globalbuildingatlas-lod1">GlobalBuildingAtlas · Zhu et al.</a>'
      },
      elevation: {
        type: 'raster-dem', tiles: [decodeURI(elevation)], minzoom: 13, maxzoom: 13,
        bounds: [118.56, 25.077, 118.63, 25.138], tileSize: 256, encoding: 'terrarium',
        attribution: '<a href="https://registry.opendata.aws/terrain-tiles/">Mapzen</a>'
      }
    },
    layers: [
      { id: 'grassland', type: 'background', paint: { 'background-color': '#a9be97' } },
      { id: 'relief-paint', type: 'raster', source: 'reliefPaint', paint: { 'raster-fade-duration': 0, 'raster-saturation': 0.07 } },
      {
        id: 'elevation-minor', type: 'line', source: 'contours', minzoom: 14.5,
        filter: ['==', ['get', 'major'], false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#365e53', 'line-opacity': 0.22, 'line-width': 0.85 }
      },
      {
        id: 'elevation-major', type: 'line', source: 'contours', minzoom: 14.4,
        filter: ['==', ['get', 'major'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ece3b1', 'line-opacity': 0.63, 'line-width': 1.35 }
      },
      {
        'id': 'water-shore', 'type': 'line', 'source': 'campus', 'source-layer': 'water',
        'paint': { 'line-color': '#d4dba3', 'line-opacity': 0.85, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 9] }
      },
      {
        'id': 'water-fallback', 'type': 'fill', 'source': 'campus', 'source-layer': 'water',
        'paint': { 'fill-color': '#497f94' }
      },
      { id: 'water-paint', type: 'raster', source: 'waterPaint', paint: { 'raster-fade-duration': 0 } },
      {
        id: 'campus-plots', type: 'fill', source: 'originalAreas', paint: {
          'fill-color': ['match', ['get', 'class'], 'sport', '#c5b88b', 'housing', '#d6c6a0', 'street', '#c9aa7a', '#e4d29e'],
          'fill-opacity': ['match', ['get', 'class'], 'path', 0.63, 'street', 0.32, 0.59],
          'fill-outline-color': '#867e65'
        }
      },
      {
        id: 'campus-field-outline', type: 'line', source: 'originalAreas',
        filter: ['==', ['get', 'class'], 'sport'],
        paint: { 'line-color': '#987e65', 'line-opacity': 0.7, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.8, 18, 2.5] }
      },
      {
        'id': 'streams', 'type': 'line', 'source': 'campus', 'source-layer': 'waterway',
        'layout': { 'line-cap': 'round' }, 'paint': { 'line-color': '#6299a3', 'line-width': 2 }
      },
      {
        'id': 'road-edge', 'type': 'line', 'source': 'campus', 'source-layer': 'transportation',
        'filter': ['!', ['in', ['get', 'class'], ['literal', ['rail', 'transit']]]],
        'layout': { 'line-cap': 'round', 'line-join': 'round' },
        'paint': { 'line-color': '#5f7967', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 7.8] }
      },
      {
        'id': 'roads', 'type': 'line', 'source': 'campus', 'source-layer': 'transportation',
        'filter': ['!', ['in', ['get', 'class'], ['literal', ['rail', 'transit']]]],
        'layout': { 'line-cap': 'round', 'line-join': 'round' },
        'paint': { 'line-color': '#f1d8a4', 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.2, 18, 5.1] }
      },
      {
        id: 'supplemental-roof-shadows', type: 'fill', source: 'supplementalRoofs',
        minzoom: 14.4, paint: {
          'fill-color': '#3c5545', 'fill-opacity': 0.35,
          'fill-translate': ['interpolate', ['linear'], ['zoom'], 15, ['literal', [1, 1]], 18, ['literal', [3, 3]]]
        }
      },
      {
        id: 'supplemental-roof-fills', type: 'fill', source: 'supplementalRoofs',
        minzoom: 14.4, paint: { 'fill-color': '#dbc39a', 'fill-outline-color': '#796e58', 'fill-opacity': 0.93 }
      },
      {
        'id': 'building-shadow', 'type': 'fill', 'source': 'roofs', 'source-layer': 'building',
        'minzoom': 14.4, 'paint': {
          'fill-color': '#3c5545', 'fill-opacity': 0.32,
          'fill-translate': ['interpolate', ['linear'], ['zoom'], 15, ['literal', [1, 1]], 18, ['literal', [3, 3]]]
        }
      },
      {
        'id': 'building-roofs', 'type': 'fill', 'source': 'roofs', 'source-layer': 'building',
        'minzoom': 14.4, 'paint': { 'fill-color': '#dbc39a', 'fill-outline-color': '#796e58', 'fill-opacity': 0.90 }
      },
      {
        'id': 'lake-names', 'type': 'symbol', 'source': 'campus', 'source-layer': 'water_name', 'minzoom': 14,
        'layout': {
          'text-field': ['coalesce', ['get', 'name:zh'], ['get', 'name']],
          'text-font': ['Open Sans Semibold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 14.4, 14, 17, 20], 'text-letter-spacing': 0.20
        },
        'paint': { 'text-color': '#edf3e2', 'text-halo-color': '#416b78', 'text-halo-width': 1.3 }
      }
    ]
  }
}
