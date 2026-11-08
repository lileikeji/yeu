// YKT 协议测试的先导模块：必须在 import ykt-bus 之前执行。
// ykt-bus 模块顶层会把 NUXT_YKT_* 固化到常量，ESM import 有提升，
// 因此 env 设置放这里（ESM 按声明顺序求值），测试用非机密本地假值。
export const TEST_YKT_AES_KEY = 'test-aes-key-16b'
export const TEST_YKT_AES_IV = 'test-aes-iv-16b0'
export const TEST_YKT_API_ID = 'test-api-id'

process.env.NUXT_YKT_AES_KEY = TEST_YKT_AES_KEY
process.env.NUXT_YKT_AES_IV = TEST_YKT_AES_IV
process.env.NUXT_YKT_API_ID = TEST_YKT_API_ID
process.env.NUXT_YKT_ACCESS_TOKEN = 'test-access-token'
