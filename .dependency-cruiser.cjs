/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'client-must-not-import-server',
      comment: '前端视图与地图层 (app/、map/) 禁止直接导入 Nitro 服务端 (server/) 模块',
      severity: 'error',
      from: { path: '^(app|map)/' },
      to: { path: '^server/' }
    },
    {
      name: 'client-and-shared-must-not-import-node-core',
      comment: '前端视图、地图层与共享纯逻辑层 (app/、map/、shared/) 禁止引入 Node 内置核心模块',
      severity: 'error',
      from: {
        path: '^(app|map|shared)/',
        pathNot: '^shared/utils/public-http-url\\.ts$'
      },
      to: { dependencyTypes: ['core'] }
    },
    {
      name: 'public-http-url-only-dynamic-dns',
      comment: 'shared/utils/public-http-url.ts 仅允许按需引入 node:dns 用于服务端 SSRF 重绑定校验，禁止引入其他 Node 核心模块',
      severity: 'error',
      from: { path: '^shared/utils/public-http-url\\.ts$' },
      to: { dependencyTypes: ['core'], pathNot: '^dns$' }
    },
    {
      name: 'public-http-url-dns-must-be-dynamic',
      comment: 'shared/utils/public-http-url.ts 引入 node:dns 必须保持动态 import()，防止污染客户端同步校验函数 bundle',
      severity: 'error',
      from: { path: '^shared/utils/public-http-url\\.ts$' },
      to: { path: '^dns$', dynamic: false }
    },
    {
      name: 'client-and-shared-must-not-import-db-drivers',
      comment: '前端视图、地图层与共享纯逻辑层 (app/、map/、shared/) 禁止引入服务端数据库驱动或 ORM',
      severity: 'error',
      from: { path: '^(app|map|shared)/' },
      to: { path: '(^|/)node_modules/(better-sqlite3|drizzle-orm|sqlite-vec)(/|$)' }
    },
    {
      name: 'shared-must-remain-pure',
      comment: '共享契约与纯函数层 (shared/) 禁止反向依赖 app/、map/ 或 server/',
      severity: 'error',
      from: { path: '^shared/' },
      to: { path: '^(app|map|server)/' }
    },
    {
      name: 'server-core-must-not-import-api-routes',
      comment: '服务端领域、数据库与工具层 (server/modules|database|utils) 禁止反向导入 HTTP 路由处理器 (server/api|routes)',
      severity: 'error',
      from: { path: '^server/(modules|database|utils)/' },
      to: { path: '^server/(api|routes)/' }
    },
    {
      name: 'no-circular-dependencies',
      comment: '禁止运行时模块循环依赖（忽略编译期擦除的纯 import type 引用环）',
      severity: 'error',
      from: {},
      to: {
        circular: true,
        viaOnly: { dependencyTypesNot: ['type-only'] }
      }
    }
  ],
  options: {
    doNotFollow: { path: '(^|/)node_modules/' },
    exclude: {
      path: '^(\\.nuxt|\\.output|\\.data|node_modules|miniapp|deepseek-harness|treasure-atlas|yeuca|design-demos|_worktree)'
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' }
  }
}
