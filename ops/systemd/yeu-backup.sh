#!/usr/bin/env bash
# 每日 SQLite 快照：VACUUM INTO 出一份一致快照 + 写 .sqlite.json 元数据。
#
# 为什么需要它：
# - 此前只有部署时 `scripts/deploy-home-sheet.sh` 打快照（且要求先有部署），
#   连续几天不发版 = 连续几天没有新的回滚点；
# - 那个快照不写元数据，而 `scripts/monitor-production.ts:270-293` 只认
#   `<name>.sqlite.json`（读 createdAt / outputPath，且 basename(outputPath)
#   必须等于 outputPath、对应 .sqlite 必须存在），所以监控一直在报 backup_missing。
# 本脚本产出的元数据字段与 `scripts/backup-database.ts` 保持同一形状，监控直接可用。
#
# 用法（systemd 里由 yeu-backup.service 以 yeu 身份调用）：
#   bash /opt/yeu-ops/yeu-backup.sh
# 环境变量：
#   NUXT_DATABASE_PATH     源库，默认 /www/wwwroot/yeu/shared/data/yeu.sqlite
#   YEU_BACKUP_DIR         快照目录，默认 /www/wwwroot/yeu/shared/backups
#   YEU_BACKUP_KEEP        保留份数，默认 14
#   YEU_BACKUP_PREFIX      文件名前缀，默认 yeu-daily
# 手工验证：YEU_BACKUP_DIR=/tmp/yeu-backup-test bash ops/systemd/yeu-backup.sh
set -euo pipefail

database="${NUXT_DATABASE_PATH:-/www/wwwroot/yeu/shared/data/yeu.sqlite}"
backup_dir="${YEU_BACKUP_DIR:-/www/wwwroot/yeu/shared/backups}"
keep="${YEU_BACKUP_KEEP:-14}"
prefix="${YEU_BACKUP_PREFIX:-yeu-daily}"

if [[ ! -f "$database" ]]; then
  echo "源数据库不存在：$database" >&2
  exit 1
fi
mkdir -p "$backup_dir"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$backup_dir/$prefix-$stamp.sqlite"
meta="$backup.json"
rm -f -- "$backup.partial" "$meta.partial"

# -readonly：快照任务不该拿到源库的写句柄；VACUUM INTO 只读也能跑，
# 目标文件由它自己创建。库不在（或 WAL 边车缺失导致打不开）就失败退出，
# 由 systemd 记 failed，不静默放过。
sqlite3 -readonly -cmd '.timeout 15000' "$database" "VACUUM INTO '$backup.partial'"

bytes="$(stat -c %s -- "$backup.partial")"
if [[ -z "$bytes" || "$bytes" -le 0 ]]; then
  echo "快照文件为空：$backup.partial" >&2
  exit 1
fi
sha256="$(sha256sum -- "$backup.partial" | cut -d' ' -f1)"
schema_version="$(sqlite3 -readonly "$backup.partial" 'PRAGMA user_version;')"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# 只写 monitor-production.ts 校验的 createdAt / outputPath，外加与
# scripts/backup-database.ts 同形的几个排查字段。outputPath 必须是裸文件名。
cat > "$meta.partial" <<JSON
{
  "sourceFile": "$(basename -- "$database")",
  "outputPath": "$(basename -- "$backup")",
  "metadataPath": "$(basename -- "$meta")",
  "createdAt": "$created_at",
  "bytes": $bytes,
  "sha256": "$sha256",
  "schemaVersion": ${schema_version:-0},
  "commitSha": "${GIT_COMMIT_SHA:-null}"
}
JSON

mv -f -- "$backup.partial" "$backup"
mv -f -- "$meta.partial" "$meta"
chmod 0600 -- "$backup"
chmod 0640 -- "$meta"

# 只留最近 $keep 份（文件名带 UTC 时间戳，字典序即时间序）。成对删除，
# 避免留下指向已删快照的元数据把监控带偏。
mapfile -t snapshots < <(find "$backup_dir" -maxdepth 1 -type f -name "$prefix-*.sqlite" -printf '%f\n' | sort -r)
if (( ${#snapshots[@]} > keep )); then
  for old in "${snapshots[@]:keep}"; do
    rm -f -- "$backup_dir/$old" "$backup_dir/$old.json"
  done
fi

echo "快照完成：$backup ($bytes bytes, user_version=$schema_version, sha256=${sha256:0:12}…)"
