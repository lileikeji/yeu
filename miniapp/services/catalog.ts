import type { ApiAssistantResponse, ApiListResponse } from '@shared/types/server'
import { postJson, request } from './http'
import type { MiniAppGuide, MiniAppHomeResponse, MiniAppNearbyResponse, MiniAppNotice, MiniAppPlace, MiniAppProcedure, MiniAppSearchResponse, MiniAppWalkingRoute } from '../types/app'

export function getHome(): Promise<MiniAppHomeResponse> {
  return request<MiniAppHomeResponse>({ path: '/api/miniapp/v1/home', timeout: 8_000, cacheTtl: 30_000 })
}

export function listPlaces(options: { page?: number, pageSize?: number, q?: string, scope?: 'campus' | 'nearby' } = {}): Promise<ApiListResponse<MiniAppPlace>> {
  return request<ApiListResponse<MiniAppPlace>>({
    path: '/api/miniapp/v1/places',
    query: { page: options.page ?? 1, pageSize: options.pageSize ?? 100, q: options.q, scope: options.scope },
    cacheTtl: 30_000
  })
}

export function getPlace(slug: string): Promise<MiniAppPlace> {
  return request<MiniAppPlace>({ path: `/api/miniapp/v1/places/${encodeURIComponent(slug)}`, timeout: 8_000, cacheTtl: 60_000 })
}

export function listGuides(options: { page?: number, pageSize?: number, q?: string } = {}): Promise<ApiListResponse<MiniAppGuide>> {
  return request<ApiListResponse<MiniAppGuide>>({
    path: '/api/miniapp/v1/guides',
    query: { page: options.page ?? 1, pageSize: options.pageSize ?? 50, q: options.q },
    cacheTtl: 30_000
  })
}

export function getGuide(slug: string): Promise<MiniAppGuide> {
  return request<MiniAppGuide>({
    path: `/api/miniapp/v1/guides/${encodeURIComponent(slug)}`,
    timeout: 8_000,
    cacheTtl: 60_000
  })
}

export function getNotice(slug: string): Promise<MiniAppNotice> {
  return request<MiniAppNotice>({
    path: `/api/miniapp/v1/notices/${encodeURIComponent(slug)}`,
    timeout: 8_000,
    cacheTtl: 60_000
  })
}

export function listProcedures(options: { page?: number, pageSize?: number, category?: string } = {}): Promise<ApiListResponse<MiniAppProcedure>> {
  return request<ApiListResponse<MiniAppProcedure>>({
    path: '/api/miniapp/v1/procedures',
    query: { page: options.page ?? 1, pageSize: options.pageSize ?? 50, category: options.category },
    cacheTtl: 30_000
  })
}

export function getProcedure(slug: string): Promise<MiniAppProcedure> {
  return request<MiniAppProcedure>({ path: `/api/miniapp/v1/procedures/${encodeURIComponent(slug)}`, timeout: 8_000, cacheTtl: 60_000 })
}

export function listNotices(): Promise<{ items: MiniAppNotice[], total: number }> {
  return request<{ items: MiniAppNotice[], total: number }>({ path: '/api/miniapp/v1/notices', timeout: 8_000, cacheTtl: 30_000 })
}

export function searchCatalog(q: string, type?: string): Promise<MiniAppSearchResponse> {
  return request<MiniAppSearchResponse>({ path: '/api/miniapp/v1/search', query: { q, type, limit: 30 }, timeout: 8_000, cacheTtl: 15_000 })
}

/** 周边攻略：与网页端同一份整理内容，坐标已是 GCJ-02。 */
export function listNearbyGuides(options: { scope?: 'nearby' | 'city', category?: string } = {}): Promise<MiniAppNearbyResponse> {
  return request<MiniAppNearbyResponse>({
    path: '/api/miniapp/v1/nearby',
    query: { scope: options.scope, category: options.category },
    timeout: 8_000,
    cacheTtl: 120_000
  })
}

/**
 * 站内步行路线规划。服务端代理高德 Web 服务，返回 GCJ-02 折线 + 路口指引，
 * 与网页端地图的步行规划是同一份上游数据。
 * origin 传小程序 getLocation 拿到的 GCJ-02 坐标；不传则由服务端从校区中心起算。
 */
export function getWalkingRoute(options: {
  slug: string
  origin?: { longitude: number, latitude: number } | null
}): Promise<MiniAppWalkingRoute> {
  return request<MiniAppWalkingRoute>({
    path: '/api/miniapp/v1/directions/walking',
    query: {
      slug: options.slug,
      origin: options.origin ? `${options.origin.longitude},${options.origin.latitude}` : undefined
    },
    timeout: 10_000,
    cacheTtl: 60_000
  })
}

/** 问答：与网页共用服务端同一套查找与回答逻辑。 */
export function askAssistant(q: string, sessionId?: string): Promise<ApiAssistantResponse> {
  return postJson<ApiAssistantResponse>({
    path: '/api/miniapp/v1/assistant',
    body: { q, ...(sessionId ? { sessionId } : {}) },
    timeout: 55_000
  })
}

export function listDepartments(options: { page?: number, pageSize?: number } = {}): Promise<ApiListResponse<MiniAppGuide>> {
  return request<ApiListResponse<MiniAppGuide>>({
    path: '/api/miniapp/v1/departments',
    query: { page: options.page ?? 1, pageSize: options.pageSize ?? 50 },
    cacheTtl: 60_000
  })
}

export function getDepartment(slug: string): Promise<MiniAppGuide> {
  return request<MiniAppGuide>({
    path: `/api/miniapp/v1/departments/${encodeURIComponent(slug)}`,
    timeout: 8_000,
    cacheTtl: 60_000
  })
}

export function listClubs(options: { page?: number, pageSize?: number } = {}): Promise<ApiListResponse<MiniAppGuide>> {
  return request<ApiListResponse<MiniAppGuide>>({
    path: '/api/miniapp/v1/clubs',
    query: { page: options.page ?? 1, pageSize: options.pageSize ?? 50 },
    cacheTtl: 60_000
  })
}

export function getClub(slug: string): Promise<MiniAppGuide> {
  return request<MiniAppGuide>({
    path: `/api/miniapp/v1/clubs/${encodeURIComponent(slug)}`,
    timeout: 8_000,
    cacheTtl: 60_000
  })
}
