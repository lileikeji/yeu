import { createError } from 'h3'
import type {
  YeucaGiteaAdminOverview,
  YeucaGiteaProbeResult,
  YeucaMemberGitRepo
} from '../../../shared/types/yeuca'

export interface GiteaConfig {
  configured: boolean
  baseUrl: string
  publicGitUrl: string
  adminToken: string
}

export function readGiteaConfig(): GiteaConfig {
  const baseUrl = (process.env.NUXT_YEUCA_GITEA_BASE_URL || 'http://127.0.0.1:3300').trim().replace(/\/+$/, '')
  const publicGitUrl = (process.env.NUXT_YEUCA_PUBLIC_GIT_URL || 'https://yeuca.huiliyill.cn/git').trim().replace(/\/+$/, '')
  const adminToken = (process.env.NUXT_YEUCA_GITEA_ADMIN_TOKEN || '').trim()
  return {
    configured: Boolean(baseUrl && adminToken),
    baseUrl,
    publicGitUrl,
    adminToken
  }
}

interface GiteaRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown>
  timeoutMs?: number
}

interface GiteaApiUser {
  id: number
  login?: string
  username?: string
  full_name?: string
  email?: string
  active?: boolean
}

interface GiteaApiRepo {
  id: number
  name: string
  full_name: string
  description?: string
  html_url?: string
  clone_url?: string
  private?: boolean
  stars_count?: number
  forks_count?: number
  updated_at?: string
}

async function callGitea<T>(
  config: GiteaConfig,
  path: string,
  options: GiteaRequestOptions = {}
): Promise<{ status: number, data: T | null, rawMessage: string }> {
  if (!config.configured) {
    return { status: 0, data: null, rawMessage: 'Gitea 管理令牌未配置（NUXT_YEUCA_GITEA_ADMIN_TOKEN）' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 6000)
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `token ${config.adminToken}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal
    })
    const text = await response.text()
    let parsed: unknown = null
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        parsed = null
      }
    }
    const rawMessage = parsed && typeof parsed === 'object' && 'message' in parsed
      ? String((parsed as { message: unknown }).message || '')
      : text.slice(0, 180)
    return {
      status: response.status,
      data: (parsed as T) ?? null,
      rawMessage
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Gitea service unreachable'
    return { status: 0, data: null, rawMessage: msg }
  } finally {
    clearTimeout(timer)
  }
}

export async function inspectGiteaHealth(syncedMemberCount: number): Promise<YeucaGiteaAdminOverview> {
  const config = readGiteaConfig()
  if (!config.configured) {
    return {
      configured: false,
      reachable: false,
      version: '',
      requireSigninView: true,
      disableRegistration: true,
      baseUrl: config.baseUrl,
      publicGitUrl: config.publicGitUrl,
      syncedMemberCount,
      error: '服务端尚未配置 NUXT_YEUCA_GITEA_ADMIN_TOKEN'
    }
  }

  const versionRes = await callGitea<{ version?: string }>(config, '/api/v1/version', { timeoutMs: 3500 })
  if (versionRes.status >= 200 && versionRes.status < 300) {
    return {
      configured: true,
      reachable: true,
      version: versionRes.data?.version || '',
      requireSigninView: true,
      disableRegistration: true,
      baseUrl: config.baseUrl,
      publicGitUrl: config.publicGitUrl,
      syncedMemberCount,
      error: ''
    }
  }
  return {
    configured: true,
    reachable: false,
    version: '',
    requireSigninView: true,
    disableRegistration: true,
    baseUrl: config.baseUrl,
    publicGitUrl: config.publicGitUrl,
    syncedMemberCount,
    error: versionRes.rawMessage || `HTTP ${versionRes.status}`
  }
}

/** 实测 Gitea 连通、Admin Token 身份和用户管理目录权限（用于后台开户诊断测试）。 */
export async function probeGiteaService(): Promise<YeucaGiteaProbeResult> {
  const config = readGiteaConfig()
  const checkedAt = new Date().toISOString()
  if (!config.configured) {
    return {
      configured: false,
      reachable: false,
      adminTokenValid: false,
      adminLogin: '',
      version: '',
      requireSigninView: true,
      disableRegistration: true,
      totalGiteaUsers: null,
      checkedAt,
      error: '服务端尚未配置 NUXT_YEUCA_GITEA_ADMIN_TOKEN'
    }
  }

  const [versionRes, userRes, adminUsersRes] = await Promise.all([
    callGitea<{ version?: string }>(config, '/api/v1/version', { timeoutMs: 4000 }),
    callGitea<GiteaApiUser>(config, '/api/v1/user', { timeoutMs: 4000 }),
    callGitea<GiteaApiUser[]>(config, '/api/v1/admin/users?limit=200', { timeoutMs: 4000 })
  ])

  const reachable = versionRes.status >= 200 && versionRes.status < 300
  const adminTokenValid = userRes.status === 200 && adminUsersRes.status === 200
  const adminLogin = userRes.data?.login || userRes.data?.username || ''
  const totalGiteaUsers = Array.isArray(adminUsersRes.data) ? adminUsersRes.data.length : null

  let error = ''
  if (!reachable) {
    error = versionRes.rawMessage || `Gitea 服务不可达 (${versionRes.status})`
  } else if (userRes.status !== 200) {
    error = `Admin Token 鉴权失败 (HTTP ${userRes.status}): ${userRes.rawMessage}`
  } else if (adminUsersRes.status !== 200) {
    error = `无权读取用户管理接口 /api/v1/admin/users (HTTP ${adminUsersRes.status})，请检查令牌是否为管理员权限`
  }

  return {
    configured: true,
    reachable,
    adminTokenValid,
    adminLogin,
    version: versionRes.data?.version || '',
    requireSigninView: true,
    disableRegistration: true,
    totalGiteaUsers,
    checkedAt,
    error
  }
}

export interface SyncGiteaAccountInput {
  username: string
  email: string
  fullName: string
  password?: string
  active: boolean
  /** 注册场景严格查重：若 Gitea 上该用户名已存在则拒绝，防止误绑他人账号 */
  rejectIfUsernameExists?: boolean
}

export interface SyncGiteaAccountResult {
  synced: boolean
  gitUserId: number | null
  error: string
}

export async function syncGiteaAccount(input: SyncGiteaAccountInput): Promise<SyncGiteaAccountResult> {
  const config = readGiteaConfig()
  if (!config.configured) {
    if (input.rejectIfUsernameExists) {
      throw createError({
        statusCode: 503,
        statusMessage: 'Git service provisioning is not configured',
        data: { code: 'GITEA_NOT_CONFIGURED', message: 'Git 站自动开户尚未完成配置，请联系协会管理员' }
      })
    }
    return { synced: false, gitUserId: null, error: '未配置 Gitea Admin Token' }
  }

  const encodedUser = encodeURIComponent(input.username)
  const existing = await callGitea<GiteaApiUser>(config, `/api/v1/users/${encodedUser}`)

  if (existing.status === 200 && existing.data) {
    if (input.rejectIfUsernameExists) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Git username already exists',
        data: { code: 'GIT_USERNAME_TAKEN', message: `Git 用户名「${input.username}」已被占用，请更换一个用户名` }
      })
    }
    const patchBody: Record<string, unknown> = {
      login_name: input.username,
      full_name: input.fullName,
      email: input.email,
      active: input.active,
      must_change_password: false,
      source_id: 0
    }
    if (input.password) {
      patchBody.password = input.password
    }
    const updated = await callGitea<GiteaApiUser>(config, `/api/v1/admin/users/${encodedUser}`, {
      method: 'PATCH',
      body: patchBody
    })
    if (updated.status >= 200 && updated.status < 300) {
      return {
        synced: true,
        gitUserId: updated.data?.id ?? existing.data.id ?? null,
        error: ''
      }
    }
    return {
      synced: false,
      gitUserId: existing.data.id ?? null,
      error: updated.rawMessage || `更新 Gitea 用户失败 (${updated.status})`
    }
  }

  if (existing.status === 404) {
    if (!input.password) {
      return {
        synced: false,
        gitUserId: null,
        error: 'Gitea 中尚无此用户且未提供初始密码，等待成员注册或管理员重置密码'
      }
    }
    const created = await callGitea<GiteaApiUser>(config, '/api/v1/admin/users', {
      method: 'POST',
      body: {
        username: input.username,
        login_name: input.username,
        email: input.email,
        full_name: input.fullName,
        password: input.password,
        must_change_password: false,
        send_notify: false,
        visibility: 'limited',
        source_id: 0
      }
    })
    if (created.status === 201 && created.data) {
      if (!input.active) {
        await callGitea(config, `/api/v1/admin/users/${encodedUser}`, {
          method: 'PATCH',
          body: { login_name: input.username, active: false, source_id: 0 }
        })
      }
      return {
        synced: true,
        gitUserId: created.data.id ?? null,
        error: ''
      }
    }
    if (created.status === 422 && input.rejectIfUsernameExists) {
      const conflictHint = /email/i.test(created.rawMessage)
        ? '该邮箱已在 Git 站注册过，请更换邮箱或联系管理员'
        : `Git 用户名「${input.username}」不可用或已被占用，请更换`
      throw createError({
        statusCode: 409,
        statusMessage: 'Git account conflict',
        data: { code: 'GIT_ACCOUNT_CONFLICT', message: conflictHint }
      })
    }
    if (input.rejectIfUsernameExists) {
      throw createError({
        statusCode: 502,
        statusMessage: 'Failed to provision Git account',
        data: { code: 'GIT_PROVISION_FAILED', message: 'Git 站自动开户失败，请稍后重试或联系协会管理员' }
      })
    }
    return {
      synced: false,
      gitUserId: null,
      error: created.rawMessage || `创建 Gitea 用户失败 (${created.status})`
    }
  }

  if (input.rejectIfUsernameExists) {
    throw createError({
      statusCode: 502,
      statusMessage: 'Git service unavailable',
      data: { code: 'GITEA_UNREACHABLE', message: 'Git 代码站暂不可达，请稍后再试' }
    })
  }
  return {
    synced: false,
    gitUserId: null,
    error: existing.rawMessage || `查询 Gitea 用户异常 (${existing.status})`
  }
}

export async function listMemberGiteaRepos(gitUsername: string): Promise<YeucaMemberGitRepo[]> {
  if (!gitUsername) return []
  const config = readGiteaConfig()
  if (!config.configured) return []

  const encodedUser = encodeURIComponent(gitUsername)
  const res = await callGitea<GiteaApiRepo[]>(config, `/api/v1/users/${encodedUser}/repos?limit=30`, { timeoutMs: 4000 })
  if (res.status !== 200 || !Array.isArray(res.data)) return []

  return res.data.map(repo => ({
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    description: repo.description || '',
    htmlUrl: repo.html_url || `${config.publicGitUrl}/${repo.full_name}`,
    cloneUrl: repo.clone_url || `${config.publicGitUrl}/${repo.full_name}.git`,
    isPrivate: Boolean(repo.private),
    starsCount: Number(repo.stars_count ?? 0),
    forksCount: Number(repo.forks_count ?? 0),
    updatedAt: repo.updated_at || ''
  }))
}
