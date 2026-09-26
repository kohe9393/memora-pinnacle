// 画面の切り替えと起動処理

import { Store } from './store.js';
import { el } from './util.js';
import { icons } from './icons.js';
import { toast } from './ui.js';
import * as home from './views/home.js';
import * as library from './views/library.js';
import * as deck from './views/deck.js';
import * as importer from './views/import.js';
import * as study from './views/study.js';
import * as quiz from './views/quiz.js';
import * as clear from './views/clear.js';
import * as weak from './views/weak.js';
import * as analysis from './views/analysis.js';
import * as settings from './views/settings.js';

const VIEWS = { home, library, deck, import: importer, study, quiz, clear, weak, analysis, settings };
const TABS = [
  { id: 'home', label: 'ホーム', icon: icons.home },
  { id: 'library', label: 'ライブラリ', icon: icons.library },
  { id: 'analysis', label: '分析', icon: icons.chart },
];
// 学習中（study / quiz / clear）はタブを隠して集中できるようにする
const TAB_OF = { home: 'home', settings: 'home', library: 'library', deck: 'library', import: 'library', weak: 'library', analysis: 'analysis' };

const store = new Store();
const viewRoot = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let current = null;

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') {
    root.dataset.theme = theme;
    root.dataset.themeOwner = 'app';
  } else if (root.dataset.themeOwner === 'app') {
    // 自分で付けた指定だけ外す（埋め込み先が付けた指定は尊重する）
    delete root.dataset.theme;
    delete root.dataset.themeOwner;
  }
  // ステータスバーの色も画面に合わせる
  const dark = root.dataset.theme === 'dark' || (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.content = dark ? '#0d0f13' : '#f6f8fc';
}

function go(name, params = {}) {
  try {
    current?.cleanup?.();
  } catch {
    /* 前の画面の後片付けに失敗しても進める */
  }
  const view = VIEWS[name] ? name : 'home';
  const ctx = { store, go, params, applyTheme, refresh: () => refresh() };
  const out = VIEWS[view].render(ctx);
  current = { name: view, params, cleanup: out.cleanup };
  viewRoot.replaceChildren(out.el);
  viewRoot.scrollTop = 0;
  const onboarding = view === 'home' && !store.decks.length;
  const tab = onboarding ? null : TAB_OF[view];
  tabbar.hidden = !tab;
  document.documentElement.dataset.mode = tab ? 'browse' : 'study';
  for (const button of tabbar.querySelectorAll('.tab')) {
    if (button.dataset.tab === tab) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
}

/** 今の画面を描き直す（スクロール位置は保つ） */
function refresh() {
  if (!current) return;
  const top = viewRoot.scrollTop;
  go(current.name, current.params);
  viewRoot.scrollTop = top;
}

tabbar.append(
  el(
    'div',
    { class: 'tabbar-inner' },
    TABS.map((t) => el('button', { class: 'tab', type: 'button', dataset: { tab: t.id }, onclick: () => go(t.id) }, el('span', { html: t.icon }), t.label)),
  ),
);

let lastSaveWarning = 0;
store.subscribe((s) => {
  if (!s.lastSaveOk && Date.now() - lastSaveWarning > 10000) {
    lastSaveWarning = Date.now();
    toast('端末に保存できませんでした。空き容量を確認し、バックアップを書き出してください');
  }
});

applyTheme(store.settings.theme);
go('home');

if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* プレビュー環境などでは登録できないことがある */
    });
  });
}
