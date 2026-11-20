# 清理记录 · 2026-11-19T02:31:36+08:00

删除目标：runs/  _tmp/  .rt/  —— 全部为过程产物，非项目资产。

| 目录 | 顶层条目 | 文件数 | 体积 |
|---|---|---|---|
| `runs/` | 43 | 627 | 17M |
| `_tmp/` | 107 | 438 | 7.7M |
| `.rt/` | 35 | 35 | 140K |

## 顶层条目

### runs/
```
__pycache__
_t1.txt
_t2.php
admin_pw.py
bt_api.py
bt_api_evidence.json
bt_crack0.py
bt_crack1.py
bt_do_login.py
bt_head.py
bt_login.html
bt_page2.html
bt_state.py
btlogin.py
btlogin2.py
code
code-full
crack.py
crack2.py
getwl.py
gost_tunnel_test.py
jwgl-vulnscan-124.221.145.182.md
lst
pivot_http.py
pivot_probe.py
probe1.py
probe2.py
probe3.py
s.sh
sshproxy.cmd
survey1.txt
vhost-yeuca.txt
webshell_deploy.json
wl
ws_a.txt
ws_b.txt
ws_b64.txt
ws_c.txt
ws_deploy.py
ws_req1.txt
ws_req2.txt
ws_test.py
yeuca-code.tar.gz
```

### _tmp/
```
__pycache__
apigw1.py
apigw2.py
apigw3.py
apigw4.py
apigw5.py
cj.txt
ctx_js.py
debug-visits.mjs
e2e-site.json
ev
fix_dept_options.py
grep_js.py
h.txt
ht.py
jw
l.json
patch_nginx.py
prep_e2e_recruit.py
probe.py
probe10.py
probe11.py
probe12.py
probe13.py
probe14.py
probe15.py
probe16.py
probe17.py
probe18.py
probe19.py
probe2.py
probe20.py
probe21.py
probe22.py
probe23.py
probe24.py
probe25.py
probe3.py
probe4.py
probe5.py
probe6.py
probe7.py
probe8.py
probe9.py
prod-site.json
r1.html
r1.sh
r10.sh
r11.sh
r12.sh
r13.sh
r14.sh
r15.sh
r16.sh
r17.sh
r18.sh
r19.sh
r2.sh
r20.sh
r21.sh
r22.sh
r23.sh
r24.sh
r25.sh
r26.sh
r27.sh
r28.sh
r29.sh
r3.sh
r30.sh
r31.sh
r32.sh
r33.sh
r34.sh
r35.sh
r36.sh
r37.sh
r38.sh
r39.sh
r4.sh
r40.sh
r41.sh
r5.sh
r6.sh
r7.sh
r8.sh
r9.sh
recon
rs.py
s2.json
scrape_admin.py
shot-admin.mjs
shot-tabs.mjs
shots
site.json
t.py
t2.py
t3.py
t4.py
tls_test.py
trim3.py
trim_admin_copy.py
trim_admin_copy2.py
v2
vuln_list.tsv
yeuca-secfix-报告.md
漏洞清单与修复建议.md
```

### .rt/
```
ag2.sh
ag3.sh
ag4.sh
agent.sh
agjob.py
agrun.sh
api.sh
api2.sh
creds.sh
env.sh
fscan.sh
gogo2.sh
gogo3.sh
keep.ps1
lst.py
lst2.py
map.sh
meta.sh
mysql.sh
oa.py
oa2.py
pg.sh
pg2.sh
pingsweep.sh
pivot.sh
redis.sh
res.sh
rows.sh
seg.sh
sock.sh
super.sh
svc.sh
tc.py
tok.sh
tun.sh
```

## 保留
- `_tmp/patch_nginx.py` → `deploy/patch-nginx-blocklist.py`（给 vhost 插入封禁名单 include 的运维脚本，唯一有复用价值的产物）
- `_shots/` 站点截图，未动
- `site/yeuca-site.tgz` 旧制品，未动
