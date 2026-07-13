function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function publicResponseErrorCode(error: unknown): string | null {
  if (!isObject(error)) return null
  if (typeof error.code === 'string') return error.code
  const data = isObject(error.data) ? error.data : null
  if (typeof data?.code === 'string') return data.code
  if (isObject(data?.data) && typeof data.data.code === 'string') return data.data.code
  const response = isObject(error.response) ? error.response : null
  const responseData = isObject(response?._data) ? response._data : null
  if (typeof responseData?.code === 'string') return responseData.code
  if (isObject(responseData?.data) && typeof responseData.data.code === 'string') return responseData.data.code
  return null
}

export function publicResponseStatusCode(error: unknown): number | null {
  if (!isObject(error)) return null
  if (typeof error.statusCode === 'number') return error.statusCode
  const response = isObject(error.response) ? error.response : null
  if (typeof response?.status === 'number') return response.status
  const responseData = isObject(response?._data) ? response._data : null
  if (typeof responseData?.statusCode === 'number') return responseData.statusCode
  return null
}

export function throwPublicDetailError(error: unknown, entityLabel: string): never {
  const statusCode = publicResponseStatusCode(error)
  throw createError({
    statusCode: statusCode === 404 ? 404 : 503,
    statusMessage: statusCode === 404 ? `${entityLabel}不存在` : `${entityLabel}服务暂时不可用`
  })
}
