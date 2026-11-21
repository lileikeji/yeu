#!/usr/bin/env bash
# 等制品 → 生成清单 → 上传 → 部署，RC 取真正的脚本退出码；被闸门挡回则报告线上当时跑的提交。
set -uo pipefail
cd /e/tmp-align || exit 1

SHA=$(git rev-parse HEAD)
SHORT=${SHA:0:8}
echo "HEAD=$SHORT" >&2

wait_build() {
  for _ in $(seq 1 40); do
    line=$(gh run list --branch deploy/theme-on-competition --limit 6 \
      --json name,status,conclusion,headSha,databaseId 2>/dev/null |
      python -c "
import json,sys
short='$SHORT'
for r in json.load(sys.stdin):
    if r['name']=='build-artifact' and r['headSha'].startswith(short):
        print(r['status'], r['conclusion'] or '-', r['databaseId']); break
")
    echo "  build: ${line:-无}" >&2
    case "$line" in
      *"completed success"*) echo "$line" | awk '{print $3}' ;;
      *"completed failure"*) return 1 ;;
    esac
    sleep 40
  done
  return 1
}

RUN=$(wait_build) || { echo "构建没成功"; exit 2; }
echo "run=$RUN"

REL="20261121-local-$(date +%H%M%S)"
DIR="E:/tmp-rel-$$"
rm -rf "$DIR"; mkdir -p "$DIR"
gh run download "$RUN" -n output -D "$DIR/.output" || { echo "下载失败"; exit 3; }

GITHUB_ACTIONS=true GITHUB_RUN_ID="$RUN" GITHUB_WORKFLOW=build-artifact \
  node scripts/release-tools.mjs create "$DIR/.output" "$REL" "$SHA" >/dev/null 2>&1 || { echo "生成清单失败"; exit 4; }

node -e "
const fs=require('fs');const p='$DIR/.output/release.json';const r=JSON.parse(fs.readFileSync(p,'utf8'));
r.platform='linux';r.arch='x64';r.node='v22.20.0';r.abi='127';
r.ci={workflow:'build-artifact',runId:'$RUN',sha:r.commit};
fs.writeFileSync(p,JSON.stringify(r,null,2));
console.log('release', r.release, r.commit.slice(0,8), 'mig', r.migrations.length, 'hist', (r.history||[]).length);
"

tar -czf "$DIR/$REL.tar.gz" -C "$DIR" .output || { echo "打包失败"; exit 5; }
scp -O -i C:/Users/15294/.ssh/tencent_yeu.pem "$DIR/$REL.tar.gz" \
  root@124.221.145.182:/data/yeu-build/incoming/ >/dev/null || { echo "上传失败"; exit 6; }

ssh -i C:/Users/15294/.ssh/tencent_yeu.pem root@124.221.145.182 \
  "bash /data/yeu-build/deploy-incoming.sh /data/yeu-build/incoming/$REL.tar.gz" > "E:/tmp-deploy-$REL.log" 2>&1
RC=$?
echo "deploy RC=$RC"
tail -6 "E:/tmp-deploy-$REL.log"
[ "$RC" -eq 0 ] && echo "DEPLOYED $REL"
exit $RC
