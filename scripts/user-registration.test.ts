import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { registerUser, requestRegistrationCode } from '../server/modules/users/service'

interface Fixture {
  client: DatabaseClient
  cleanup: () => void
}

function createFixture(): Fixture {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-registration-'))
  const databasePath = join(directory, 'test.sqlite')
  const client = getDatabase(databasePath)
  runMigrations(client)
  return {
    client,
    cleanup: () => {
      closeDatabase(databasePath)
      rmSync(directory, { recursive: true, force: true })
    }
  }
}

const INPUT = { username: '新生小明', email: 'ming@test.com', password: 'password123' }

function sentCodes(client: DatabaseClient, email: string): string[] {
  // 测试用：验证码 hash 不可逆，直接用明文 code 由 sendEmail 闭包捕获——这里
  // 通过 sendEmail 回调把明文码带出来。
  return sentBox.get(email) ?? []
}

const sentBox = new Map<string, string[]>()

function fakeSender(codes: string[]): (to: string, code: string) => Promise<boolean> {
  return async (to, code) => {
    codes.push(code)
    sentBox.set(to, [...(sentBox.get(to) ?? []), code])
    return true
  }
}

test('registration: 验证码下发、正确验证建号（邮箱已验证）、验证码行清除', async () => {
  const { client, cleanup } = createFixture()
  try {
    const codes: string[] = []
    await requestRegistrationCode(client, INPUT, fakeSender(codes))
    assert.equal(codes.length, 1)

    const user = await registerUser(client, { ...INPUT, code: codes[0]! })
    assert.equal(user.username, '新生小明')
    assert.ok(user.emailVerifiedAt)
    assert.equal(user.email, 'ming@test.com')
    assert.equal(client.sqlite.prepare('SELECT COUNT(*) c FROM email_verifications').get().c, 0)
  } finally {
    cleanup()
  }
})

test('registration: 错误验证码 5 次后锁定', async () => {
  const { client, cleanup } = createFixture()
  try {
    const codes: string[] = []
    await requestRegistrationCode(client, INPUT, fakeSender(codes))
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => registerUser(client, { ...INPUT, code: '000000' }),
        (error: { data?: { code?: string } }) => error.data?.code === 'REG_CODE_MISMATCH'
      )
    }
    await assert.rejects(
      () => registerUser(client, { ...INPUT, code: codes[0]! }),
      (error: { data?: { code?: string } }) => error.data?.code === 'REG_CODE_LOCKED'
    )
  } finally {
    cleanup()
  }
})

test('registration: 用户名/邮箱冲突在发码前即拒绝', async () => {
  const { client, cleanup } = createFixture()
  try {
    const codes: string[] = []
    await requestRegistrationCode(client, INPUT, fakeSender(codes))
    await registerUser(client, { ...INPUT, code: codes[0]! })

    // 同名同邮箱重发：用户名检查在前，先命中 USERNAME_TAKEN
    await assert.rejects(
      () => requestRegistrationCode(client, INPUT, fakeSender([])),
      (error: { data?: { code?: string } }) => error.data?.code === 'REG_USERNAME_TAKEN'
    )
    // 换名但邮箱相同：EMAIL_TAKEN
    await assert.rejects(
      () => requestRegistrationCode(client, { ...INPUT, username: '别的名字' }, fakeSender([])),
      (error: { data?: { code?: string } }) => error.data?.code === 'REG_EMAIL_TAKEN'
    )
  } finally {
    cleanup()
  }
})

test('registration: 验证码过期拒绝', async () => {
  const { client, cleanup } = createFixture()
  try {
    await requestRegistrationCode(client, INPUT, fakeSender(['123456']))
    // 手动把验证码置为已过期
    client.sqlite.prepare('UPDATE email_verifications SET expires_at = ?').run(Date.now() - 1000)
    await assert.rejects(
      () => registerUser(client, { ...INPUT, code: '123456' }),
      (error: { data?: { code?: string } }) => error.data?.code === 'REG_CODE_EXPIRED'
    )
  } finally {
    cleanup()
  }
})

// 供 sentCodes 引用（测试可读辅助）
export { sentCodes }
