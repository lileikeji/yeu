/*
 * 配色切换的行为回归测试。
 *
 * 直接把 src/layouts/Base.astro 里的配色内联脚本抠出来，注入一套最小 DOM mock 跑，
 * 盯住三个曾经踩过的坑：
 *   1. 每次切换对上百个元素读几何与计算样式 → 点击瞬间卡顿，需要设上限并提前退出；
 *   2. 连点时旧动画的 finished 回调会把新一轮刚设好的快照命名一起清掉；
 *   3. backdrop-filter 元素被单独命名后快照成纯色块，页头模糊瞬间消失。
 *
 * 运行：node --test scripts/theme-transition.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const astroFile = path.join(here, '..', 'src', 'layouts', 'Base.astro');

const HEADER_SELECTOR =
  '.site-header, .site-footer, .band, .lab-band, .hero, .page-head, .flagship-link-strip, .campus-live-bar';
const CARD_SELECTOR =
  '.card, .pillar-card, .swiss-cell, .comp-cell, .comp-strip, .timeline-row, .timeline-list, .faq-item, .form-panel, .spec-table-wrap, .modal-box, .dept-focus-card, .wf-node, .wf-inspector, .status-banner, .empty-panel, .member-tab-bar, .theme-toggle, .mobile-menu-btn, .nav-member, .back-to-top, .btn, .filter-chip';

function extractScript() {
  const source = fs.readFileSync(astroFile, 'utf8');
  const blocks = [...source.matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  // head 里另有一段同名的防闪烁脚本（只读 meta，不绑按钮），按视图过渡 API 区分。
  const block = blocks.find((b) => b.includes('startViewTransition') && b.includes('color-scheme'));
  assert.ok(block, 'Base.astro 里没找到配色切换内联脚本');
  return block;
}

function makeStyle() {
  const props = new Map();
  return {
    id: '',
    _text: '',
    setProperty(name, value) {
      props.set(name, value);
    },
    removeProperty(name) {
      props.delete(name);
    },
    getPropertyValue(name) {
      return props.get(name) || '';
    },
    get textContent() {
      return this._text;
    },
    set textContent(value) {
      this._text = value;
    },
  };
}

function makeEl(classes, opts = {}) {
  const set = new Set(classes);
  return {
    classList: { contains: (name) => set.has(name) },
    style: makeStyle(),
    rect: opts.rect || { width: 120, height: 48 },
    css: {
      backgroundColor: 'rgb(255, 255, 255)',
      backdropFilter: 'none',
      ...(opts.css || {}),
    },
    getBoundingClientRect() {
      return this.rect;
    },
  };
}

/** 搭一个只够跑这段脚本的假页面，返回观测句柄。 */
function createHarness(options = {}) {
  const meta = {
    _content: 'light dark',
    getAttribute() {
      return this._content;
    },
    setAttribute(name, value) {
      this._content = value;
    },
  };
  const button = {
    attrs: {},
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
    setAttribute(name, value) {
      this.attrs[name] = value;
    },
  };

  const registry = new Map();
  const layerStyleEl = makeStyle();
  layerStyleEl.id = 'theme-vt-layers';
  const transitions = [];

  const documentMock = {
    querySelector(selector) {
      if (selector.includes('color-scheme')) return meta;
      if (selector.includes('theme-toggle')) return button;
      return null;
    },
    querySelectorAll(selector) {
      return registry.get(selector) || [];
    },
    getElementById(id) {
      return id === 'theme-vt-layers' ? layerStyleEl : null;
    },
    createElement() {
      return makeStyle();
    },
    head: { appendChild() {} },
    startViewTransition(callback) {
      if (options.failTransition) throw new Error('mock: 浏览器拒绝快照');
      let settle;
      const finished = new Promise((resolve) => {
        settle = resolve;
      });
      transitions.push({ callback, finish: () => settle() });
      callback();
      return { finished };
    },
  };

  const storage = {
    data: new Map(),
    getItem(key) {
      return this.data.has(key) ? this.data.get(key) : null;
    },
    setItem(key, value) {
      this.data.set(key, value);
    },
    removeItem(key) {
      this.data.delete(key);
    },
  };

  const windowMock = {
    matchMedia() {
      return { matches: Boolean(options.reduceMotion) };
    },
    addEventListener() {},
    setTimeout(callback) {
      callback();
    },
  };

  new Function('document', 'window', 'localStorage', 'getComputedStyle', extractScript())(
    documentMock,
    windowMock,
    storage,
    (el) => el.css,
  );

  return {
    meta,
    button,
    layerStyleEl,
    transitions,
    register(selector, elements) {
      registry.set(selector, elements);
    },
    click() {
      button.listeners.click();
    },
    elements() {
      return [...registry.values()].flatMap((list) => [...list]);
    },
    names() {
      return this.elements()
        .map((el) => el.style.getPropertyValue('view-transition-name'))
        .filter(Boolean);
    },
  };
}

test('backdrop-filter 元素不单独命名，避免快照成纯色块', () => {
  const harness = createHarness();
  const header = makeEl(['site-header'], {
    css: { backgroundColor: 'rgba(255, 255, 255, 0.94)', backdropFilter: 'blur(10px)' },
  });
  const card = makeEl(['card']);
  harness.register(HEADER_SELECTOR, [header]);
  harness.register(CARD_SELECTOR, [card]);

  harness.click();

  assert.equal(
    header.style.getPropertyValue('view-transition-name'),
    '',
    '带 backdrop-filter 的页头不该被单独快照',
  );
  assert.notEqual(card.style.getPropertyValue('view-transition-name'), '', '普通卡片仍应参与分层');
});

test('分层命名数量有上限，不会为整页元素逐个建快照', () => {
  const harness = createHarness();
  const cards = Array.from({ length: 400 }, () => makeEl(['card']));
  harness.register(HEADER_SELECTOR, [makeEl(['site-footer'])]);
  harness.register(CARD_SELECTOR, cards);

  harness.click();

  const named = harness.names();
  assert.ok(named.length > 0, '至少要给一个元素建快照');
  assert.ok(named.length <= 60, `命名数量 ${named.length} 超过上限 60`);
});

test('全透明与小到看不见的元素不参与分层', () => {
  const harness = createHarness();
  const ghost = makeEl(['card'], { css: { backgroundColor: 'rgba(0, 0, 0, 0)' } });
  const tiny = makeEl(['card'], { rect: { width: 2, height: 2 } });
  harness.register(HEADER_SELECTOR, []);
  harness.register(CARD_SELECTOR, [ghost, tiny]);

  harness.click();

  assert.deepEqual(harness.names(), [], '透明和过小的元素都该被跳过');
});

test('连点时旧动画收尾不能清掉新一轮的命名', async () => {
  const harness = createHarness();
  harness.register(HEADER_SELECTOR, []);
  harness.register(CARD_SELECTOR, [makeEl(['card']), makeEl(['btn'])]);

  harness.click();
  assert.equal(harness.transitions.length, 1, '第一次点击应发起一次过渡');
  const first = harness.transitions[0];

  harness.click();
  assert.equal(harness.transitions.length, 2, '第二次点击应再发起一次过渡');
  const second = harness.transitions[1];

  const stable = harness.names();
  assert.ok(stable.length > 0, '第二次点击后应持有自己的命名');

  first.finish();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(harness.names().sort(), [...stable].sort(), '第一次动画收尾后，第二次的命名必须原样保留');

  second.finish();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(harness.names(), [], '当前这轮结束后应把命名全部撤掉');
});

test('快照抛错时仍要落定配色', () => {
  const harness = createHarness({ failTransition: true });
  harness.register(HEADER_SELECTOR, []);
  harness.register(CARD_SELECTOR, [makeEl(['card'])]);

  harness.click();

  assert.equal(harness.meta.getAttribute(), 'light', '过渡失败也必须把配色写进去');
  assert.deepEqual(harness.names(), [], '失败路径也要撤掉命名');
});

test('减少动态效果偏好下直接切，不发起过渡', () => {
  const harness = createHarness({ reduceMotion: true });
  harness.register(HEADER_SELECTOR, []);
  harness.register(CARD_SELECTOR, [makeEl(['card'])]);

  harness.click();

  assert.equal(harness.transitions.length, 0, 'prefers-reduced-motion 下不该启动视图过渡');
  assert.equal(harness.meta.getAttribute(), 'light', '配色仍要立即生效');
});
