# 伴奏存储：本机 /uploads 与「职业发展平台」对象存储

默认落本机（`NUXT_UPLOAD_DIR`，对外 `/uploads/<uuid>.<ext>`，nginx 加一年 immutable）。
当环境变量配了 `CAREER_STORAGE_BASE_URL`，`storeUploadedAudio()` 改成把字节转给职业发展平台已经接好的对象存储，库里只存它回传的 URL，本机不再落盘。

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `CAREER_STORAGE_BASE_URL` | 是 | 平台域名，例如 `https://career.example.com`；不配则继续本机存储 |
| `CAREER_STORAGE_TOKEN` | 按需 | 以 `Authorization: Bearer <token>` 发送 |
| `CAREER_STORAGE_PATH` | 否 | 上传路径，默认 `/api/storage/upload` |
| `CAREER_STORAGE_PREFIX` | 否 | 对象前缀，默认 `competition/accompaniment` |

请求是 `multipart/form-data`，带 `file`（音频字节）、`path`（对象 key）、`filename` 三个字段。
返回体里任意层级的 `url` / `src` / `href` / `downloadUrl` / `fileUrl` 都能被识别；返回纯文本 URL 也认。
接口路径不确定时先跑 `CAREER_STORAGE_BASE_URL=... CAREER_STORAGE_TOKEN=... npx tsx scripts/probe-career-storage.ts`，它会挨个试常见路径并打印状态码。

播放侧不用改：`CompetitionEntryAccompaniment.url` 直接存公网 URL，前端 `<audio>` 照旧。
后台「下载全部伴奏」目前仍按 URL 取字节打包；如果换成对象存储的域名，记得让桶对源站可读，否则改成直链清单。
