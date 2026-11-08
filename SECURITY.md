# 安全政策

## 报告漏洞

**请勿通过公开 Issue 报告安全漏洞。** 发现可被利用的问题（越权、注入、绕过限流/票闸、凭据泄漏、XSS 等），请通过 Gitee 私信联系仓库维护者，或在 Issue 中仅描述"存在疑似安全问题"并留下联系方式，细节走私下沟通。

我们会在确认后尽快修复并公开披露；负责任披露期之内请勿公开细节。

## 边界声明（贡献者必读）

- 本仓库**不包含**生产服务器地址、SSH 私钥/私钥文件名、部署主机组凭据、管理员密码——这些全部由维护者在本地环境或服务器端提供。任何 PR 引入此类信息都会被拒收并要求清理历史。
- 生产部署由维护者的私有流水线执行，贡献者的 CI（fork / 公开流水线）不应也无法触达生产环境；`scripts/ci-build.sh` 默认跳过生产基线探测（`YEU_CI_SKIP_BASELINE=1`）。
- 防护层（Origin guard、miniapp 限流、visitor ban、anti-crawl、admin 登录限流）是层层设防：**任何削弱它们的 PR 一律拒收**；发现 403/429 请按 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) 排障，不要绕过。

## 已知设计取舍

- 管理后台入口不在前台导航中公开，API 路径对公开站点可见（防扫描靠 Origin guard + 登录限流 + scrypt 成本，不靠路径保密）。
- 学校官方原始文件与学生个人信息永不入库（`.gitignore` 已拦截常见形态）；内容合规见 [docs/CONTENT_POLICY.md](docs/CONTENT_POLICY.md)。
