# Shared contracts

前端、服务端和数据导入脚本共同使用的纯 TypeScript 契约：

- `types.ts`：领域 DTO。
- `schemas/`：运行时输入校验（业务阶段接入）。
- `constants/`：分类、状态与固定选项。
- `utils/`：不依赖浏览器或数据库的纯函数。

不得在此目录引用 Vue、Nitro、数据库驱动或地图 SDK。
