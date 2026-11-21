export interface MirrorRowItem {
  id: string;
  category: '语言与包' | 'AI 与模型' | '系统与容器';
  name: string;
  upstream: string;
  note: string;
  cmd: string;
  snippetTitle?: string;
  snippet?: string;
  helpUrl: string;
  helpHost: string;
}

export const MIRROR_DIRECTORY: MirrorRowItem[] = [
  {
    id: 'tuna-pypi',
    category: '语言与包',
    name: 'Python PyPI（清华）',
    upstream: 'pypi.tuna.tsinghua.edu.cn',
    note: '国内备用直连，5 分钟同步',
    cmd: 'pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple',
    snippetTitle: 'pip.conf 写法',
    snippet: '[global]\nindex-url = https://pypi.tuna.tsinghua.edu.cn/simple',
    helpUrl: 'https://mirrors.tuna.tsinghua.edu.cn/help/pypi/',
    helpHost: 'mirrors.tuna.tsinghua.edu.cn',
  },
  {
    id: 'uv-pypi',
    category: '语言与包',
    name: 'uv (Python)',
    upstream: 'pypi.tuna.tsinghua.edu.cn',
    note: 'AI 部常用快速装包工具',
    cmd: 'uv pip install --default-index https://pypi.tuna.tsinghua.edu.cn/simple/ httpx',
    snippetTitle: 'uv.toml 写法',
    snippet: '[[index]]\nurl = "https://pypi.tuna.tsinghua.edu.cn/simple/"\ndefault = true',
    helpUrl: 'https://docs.astral.sh/uv/',
    helpHost: 'docs.astral.sh',
  },
  {
    id: 'conda-tuna',
    category: 'AI 与模型',
    name: 'Anaconda / Miniconda',
    upstream: 'mirrors.tuna.tsinghua.edu.cn',
    note: '装 PyTorch / CUDA 虚拟环境前先换源',
    cmd: 'conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main && conda config --set show_channel_urls yes',
    snippetTitle: '~/.condarc 完整配置',
    snippet:
      'channels:\n  - defaults\nshow_channel_urls: true\ndefault_channels:\n  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main\n  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/r\n  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/msys2\ncustom_channels:\n  conda-forge: https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud\n  pytorch: https://mirrors.tuna.tsinghua.edu.cn/anaconda/cloud',
    helpUrl: 'https://mirrors.tuna.tsinghua.edu.cn/help/anaconda/',
    helpHost: 'mirrors.tuna.tsinghua.edu.cn',
  },
  {
    id: 'npmmirror',
    category: '语言与包',
    name: 'Node.js / npm / pnpm',
    upstream: 'registry.npmmirror.com',
    note: '国内常用前端镜像源',
    cmd: 'npm config set registry https://registry.npmmirror.com',
    snippetTitle: 'pnpm 同步切源',
    snippet: 'pnpm config set registry https://registry.npmmirror.com',
    helpUrl: 'https://npmmirror.com/',
    helpHost: 'npmmirror.com',
  },
  {
    id: 'hf-mirror',
    category: 'AI 与模型',
    name: 'HuggingFace',
    upstream: 'hf-mirror.com',
    note: '下载开源模型与词向量权重',
    cmd: 'export HF_ENDPOINT=https://hf-mirror.com',
    snippetTitle: 'PowerShell 持久变量',
    snippet: '[Environment]::SetEnvironmentVariable("HF_ENDPOINT", "https://hf-mirror.com", "User")',
    helpUrl: 'https://hf-mirror.com/',
    helpHost: 'hf-mirror.com',
  },
  {
    id: 'goproxy-cn',
    category: '语言与包',
    name: 'Go GOPROXY',
    upstream: 'goproxy.cn',
    note: 'Go 模块拉取代理',
    cmd: 'go env -w GOPROXY=https://goproxy.cn,direct',
    helpUrl: 'https://goproxy.cn/',
    helpHost: 'goproxy.cn',
  },
  {
    id: 'rust-rsproxy',
    category: '语言与包',
    name: 'Rust Crates',
    upstream: 'rsproxy.cn',
    note: 'Cargo sparse 协议及 rustup',
    cmd: 'export RUSTUP_DIST_SERVER=https://rsproxy.cn',
    snippetTitle: '~/.cargo/config.toml',
    snippet:
      '[source.crates-io]\nreplace-with = "rsproxy-sparse"\n[source.rsproxy-sparse]\nregistry = "sparse+https://rsproxy.cn/index/"',
    helpUrl: 'https://rsproxy.cn/',
    helpHost: 'rsproxy.cn',
  },
  {
    id: 'ubuntu-apt',
    category: '系统与容器',
    name: 'Ubuntu / Debian APT',
    upstream: 'mirrors.tuna.tsinghua.edu.cn',
    note: 'WSL2 / 服务器软件源',
    cmd: 'sudo sed -i "s@//.*archive.ubuntu.com@//mirrors.tuna.tsinghua.edu.cn@g" /etc/apt/sources.list.d/ubuntu.sources',
    helpUrl: 'https://mirrors.tuna.tsinghua.edu.cn/help/ubuntu/',
    helpHost: 'mirrors.tuna.tsinghua.edu.cn',
  },
  {
    id: 'docker-mirror',
    category: '系统与容器',
    name: 'Docker Engine 镜像加速',
    upstream: 'docker.1ms.run · ghcr.nju.edu.cn',
    note: '拉取容器镜像卡顿时配 daemon.json',
    cmd: 'sudo mkdir -p /etc/docker && printf \'{\\n  "registry-mirrors": ["https://docker.1ms.run"]\\n}\\n\' | sudo tee /etc/docker/daemon.json && sudo systemctl restart docker',
    snippetTitle: '/etc/docker/daemon.json 与 GHCR 说明',
    snippet:
      '{\n  "registry-mirrors": ["https://docker.1ms.run"]\n}\n# 若拉取 ghcr.io/xxx/yyy 镜像，可改为 ghcr.nju.edu.cn/xxx/yyy',
    helpUrl: 'https://mirrors.nju.edu.cn/',
    helpHost: 'mirrors.nju.edu.cn',
  },
  {
    id: 'git-init',
    category: '系统与容器',
    name: 'Git 基础配置',
    upstream: 'yeuca.huiliyill.cn/git',
    note: '克隆协会仓库前先设置好分支与缓冲',
    cmd: 'git config --global init.defaultBranch main && git config --global http.postBuffer 524288000',
    snippetTitle: '拉取协会实验代码仓',
    snippet: 'git clone https://yeuca.huiliyill.cn/git/yeuca/starter-labs.git',
    helpUrl: 'https://yeuca.huiliyill.cn/git/',
    helpHost: 'yeuca.huiliyill.cn/git',
  },
];

export interface GeneratorToolOption {
  id: string;
  label: string;
  ps1: string[];
  sh: string[];
}

export const SCRIPT_GENERATOR_OPTIONS: GeneratorToolOption[] = [
  {
    id: 'yeuca_pypi',
    label: 'pip 用计协 PyPI 缓存',
    ps1: ['pip config set global.index-url https://yeuca.huiliyill.cn/mirrors/pypi/simple/'],
    sh: ['pip config set global.index-url https://yeuca.huiliyill.cn/mirrors/pypi/simple/'],
  },
  {
    id: 'tuna_pypi',
    label: 'pip 用清华 TUNA',
    ps1: ['pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple'],
    sh: ['pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple'],
  },
  {
    id: 'yeuca_npm',
    label: 'npm / pnpm 用计协缓存',
    ps1: [
      'npm config set registry https://yeuca.huiliyill.cn/mirrors/npm/',
      'if (Get-Command pnpm -ErrorAction SilentlyContinue) { pnpm config set registry https://yeuca.huiliyill.cn/mirrors/npm/ }',
    ],
    sh: [
      'npm config set registry https://yeuca.huiliyill.cn/mirrors/npm/',
      'command -v pnpm >/dev/null 2>&1 && pnpm config set registry https://yeuca.huiliyill.cn/mirrors/npm/',
    ],
  },
  {
    id: 'uv_env',
    label: 'uv 国内索引变量',
    ps1: [
      '[Environment]::SetEnvironmentVariable("UV_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple/", "User")',
      '$env:UV_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple/"',
    ],
    sh: ['export UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple/"'],
  },
  {
    id: 'conda_tuna',
    label: 'Conda 用清华 TUNA 源',
    ps1: [
      'if (Get-Command conda -ErrorAction SilentlyContinue) { conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main; conda config --set show_channel_urls yes }',
    ],
    sh: [
      'command -v conda >/dev/null 2>&1 && conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main && conda config --set show_channel_urls yes',
    ],
  },
  {
    id: 'hf_mirror',
    label: 'HuggingFace 镜像',
    ps1: [
      '[Environment]::SetEnvironmentVariable("HF_ENDPOINT", "https://hf-mirror.com", "User")',
      '$env:HF_ENDPOINT = "https://hf-mirror.com"',
    ],
    sh: ['export HF_ENDPOINT="https://hf-mirror.com"'],
  },
  {
    id: 'git_init',
    label: 'Git 默认分支与大文件缓冲',
    ps1: [
      'git config --global init.defaultBranch main',
      'git config --global core.longpaths true',
      'git config --global http.postBuffer 524288000',
    ],
    sh: [
      'git config --global init.defaultBranch main',
      'git config --global http.postBuffer 524288000',
    ],
  },
  {
    id: 'goproxy',
    label: 'Go GOPROXY',
    ps1: ['if (Get-Command go -ErrorAction SilentlyContinue) { go env -w GOPROXY=https://goproxy.cn,direct }'],
    sh: ['command -v go >/dev/null 2>&1 && go env -w GOPROXY=https://goproxy.cn,direct'],
  },
];
