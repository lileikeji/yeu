import io, shutil, time, sys

path = '/www/server/panel/vhost/nginx/yeuca.huiliyill.cn.conf'
include_line = '    include /www/wwwroot/yeu/shared/yeuca-blocklist.conf;'
marker = 'root /www/wwwroot/yeuca.huiliyill.cn;'

src = io.open(path, encoding='utf-8').read()
if include_line.strip() in src:
    print('already-included')
    sys.exit(0)

idx = src.index(marker)
# 找到该行结尾，插在其后一行（index index.html; 之后）
line_end = src.index('\n', idx)
second_end = src.index('\n', line_end + 1)
backup = path + '.bak-' + time.strftime('%Y%m%d-%H%M%S')
shutil.copy2(path, backup)

out = src[:second_end + 1] + '    # 计协封禁名单：后台封 IP 后由 yeuca-blocklist.timer 每两分钟刷新本文件\n' + include_line + '\n' + src[second_end + 1:]
io.open(path, 'w', encoding='utf-8', newline='\n').write(out)
print('backup=' + backup)
print('inserted-after=' + src[idx:second_end].replace('\n', ' | '))
