export type CampusAtmosphere = 'clear' | 'cloudy' | 'rain' | 'night'
export type CampusAtmosphereMode = 'live' | CampusAtmosphere

export interface CampusWeather {
  time: string
  temperature: number
  code: number
  cloudCover: number
  precipitation: number
  isDay: boolean
}

export const atmosphereOptions: { id: CampusAtmosphereMode, name: string }[] = [
  { id: 'live', name: '当前天气' },
  { id: 'clear', name: '晴日' },
  { id: 'cloudy', name: '云天' },
  { id: 'rain', name: '雨天' },
  { id: 'night', name: '夜色' }
]

export function weatherLabel(code: number): string {
  if (code <= 1) return code === 0 ? '晴' : '少云'
  if (code === 2) return '多云'
  if (code === 3) return '阴'
  if (code === 45 || code === 48) return '雾'
  if (code >= 95) return '雷雨'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '雪'
  return '雨'
}

export function weatherAtmosphere(weather: CampusWeather | null): CampusAtmosphere {
  if (!weather) return 'clear'
  if (weather.precipitation > 0 || weather.code >= 51) return 'rain'
  if (!weather.isDay) return 'night'
  return weather.code >= 2 || weather.cloudCover >= 55 ? 'cloudy' : 'clear'
}
