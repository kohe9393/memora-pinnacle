// 複数の画面で使う部品

import { el } from '../util.js';
import { icons } from '../icons.js';
import { toast, confirmDialog, openSheet } from '../ui.js';
import { aheadQueue, autoQueue, skimQueue, weakQueue, MODES } from '../queue.js';
import { Session } from '../session.js';
import { status } from '../srs.js';

export function isJapanese(text) {
  return /[぀-ヿ一-鿿ｦ-ﾟ]/.test(String(text));
}

/** 全角は2、半角は1として数えた長さ */
export function visualLength(text) {
  let n = 0;
  for (const ch of String(text)) n += ch.charCodeAt(0) > 0xff ? 2 : 1;
  return n;
}

export function lengthClass(text) {
  const n = visualLength(text);
  if (n > 44) return ' is-very-long';
  if (n > 18) return ' is-long';
  return '';
}

export function currentDeck(store) {
  return store.deck(store.settings.deck) ? store.settings.deck : 'all';
}

export function deckLabel(store, deck) {
  return deck === 'all' ? 'すべての単語帳' : store.deck(deck)?.name ?? '単語帳';
}

export function quizPool(store, deck) {
  const own = store.words(deck);
  return own.length >= 4 ? own : store.words('all');
}

const EMPTY = {
  auto: 'この単語帳にはまだ単語がありません',
  skim: 'まだ学習していない単語はもうありません。「自動出題」で復習しましょう',
  weak: '苦手な単語はありません',
};

/**
 * 学習を始める。
 * @param opts.kind 'study'（スワイプ）| 'quiz'（4択）
 * @param opts.mode 'auto' | 'skim' | 'weak' | 'list'
 * @param opts.ids 出す単語を直接指定するとき
 */
export function startSession(ctx, opts) {
  const { store, go } = ctx;
  const deck = opts.deck ?? currentDeck(store);
  const words = store.words(deck);
  const limit = store.settings.dailyGoal;
  let ids = opts.ids;
  if (!ids) {
    if (opts.mode === 'skim') ids = skimQueue(words, store.getState, { limit });
    else if (opts.mode === 'weak') ids = weakQueue(words, store.getState, { kind: opts.weakKind || 'all' });
    else {
      ids = autoQueue(words, store.getState, { limit });
      if (!ids.length) {
        ids = aheadQueue(words, store.getState, { limit });
        if (ids.length) toast('今日の分は終わっています。次に出る予定の単語を前倒しで出します');
      }
    }
  }
  ids = ids.filter((id) => store.word(id));
  if (!ids.length) {
    toast(EMPTY[opts.mode] || '出題できる単語がありません');
    return false;
  }
  let kind = opts.kind || 'study';
  if (kind === 'quiz' && quizPool(store, deck).length < 2) {
    toast('4択クイズには2語以上必要です。スワイプで始めます');
    kind = 'study';
  }
  const before = new Map(ids.map((id) => [id, status(store.state(id))]));
  const session = new Session(ids, { secondLap: opts.mode === 'skim' });
  go(kind, { session, before, opts: { ...opts, deck, kind } });
  return true;
}

export function sessionTitle(store, opts) {
  const mode = opts.title || (opts.kind === 'quiz' ? MODES.quiz.label : MODES[opts.mode]?.label) || '学習';
  return { title: mode, sub: `${deckLabel(store, opts.deck)} · ${opts.kind === 'quiz' ? '4択クイズ' : 'スワイプ'}` };
}

export function studyHeader({ title, sub, onClose, onUndo, sound }) {
  const fill = el('span');
  const count = el('span', { class: 'study-count' });
  const undo = el('button', { class: 'round-btn', type: 'button', 'aria-label': '1つ前に戻す', disabled: true, onclick: onUndo, html: icons.undo });
  const soundBtn =
    sound &&
    el('button', {
      class: 'round-btn',
      type: 'button',
      'aria-label': '自動で読み上げ',
      'aria-pressed': String(sound.value()),
      html: sound.value() ? icons.speaker : icons.speakerOff,
      onclick: () => {
        const on = !sound.value();
        sound.set(on);
        soundBtn.setAttribute('aria-pressed', String(on));
        soundBtn.innerHTML = on ? icons.speaker : icons.speakerOff;
        toast(on ? '単語を自動で読み上げます' : '自動の読み上げをオフにしました');
      },
    });
  const node = el(
    'div',
    {},
    el(
      'div',
      { class: 'study-head' },
      el('div', { class: 'study-title' }, el('b', {}, title), el('span', {}, sub)),
      soundBtn,
      onUndo && undo,
      el('button', { class: 'round-btn', type: 'button', 'aria-label': '学習をやめる', onclick: onClose, html: icons.close }),
      count,
    ),
    el('div', { class: 'progress', role: 'progressbar', 'aria-label': '進み具合' }, fill),
  );
  return {
    el: node,
    update(session) {
      const len = session.queue.length || 1;
      fill.style.width = `${Math.min(100, (session.pos / len) * 100)}%`;
      count.textContent = `${Math.min(session.pos + 1, session.queue.length)}/${session.queue.length}`;
    },
    setUndo(enabled) {
      undo.disabled = !enabled;
    },
  };
}

export async function confirmExit(ctx, session, params) {
  if (!session.log.length) {
    ctx.go('home');
    return;
  }
  const ok = await confirmDialog({ title: '学習を終わりますか？', body: 'ここまでの回答は記録されています。', ok: '終わる', cancel: '続ける' });
  if (ok) ctx.go('clear', { summary: session.summary(), ...params });
}

/** 覚えた（緑）・学習中（青）・苦手（赤）の進捗バー */
export function progressBar(counts, total) {
  const bar = el('div', { class: 'pbar', role: 'img', 'aria-label': `覚えた${counts.learned}語・学習中${counts.review}語・苦手${counts.weak}語（全${total}語）` });
  for (const [key, cls] of [
    ['learned', 'p-learned'],
    ['review', 'p-review'],
    ['weak', 'p-weak'],
  ]) {
    if (counts[key] && total) bar.append(el('span', { class: cls, style: { width: `${(counts[key] / total) * 100}%` } }));
  }
  return bar;
}

export function statusCounts(words, getState) {
  const counts = { new: 0, review: 0, weak: 0, learned: 0 };
  for (const w of words) counts[status(getState(w.id))] += 1;
  return counts;
}

/** 卒業までのドット */
export function dotsEl(filled, total = 5, label = '卒業まで') {
  return el(
    'span',
    { class: 'dots', role: 'img', 'aria-label': `${label} ${filled}/${total}` },
    Array.from({ length: total }, (_, i) => el('i', { class: i < filled ? 'on' : '' })),
  );
}

/** 直近5回の正誤 */
export function recentDots(hist = '') {
  const last = hist.slice(-5).split('').filter(Boolean);
  const pad = Array.from({ length: 5 - last.length }, () => '');
  const text = last.map((c) => (c === '1' ? '○' : '×')).join('');
  return el(
    'span',
    { class: 'dots', role: 'img', 'aria-label': `直近の結果 ${text || 'なし'}` },
    [...pad, ...last].map((c) => el('i', { class: c === '1' ? 'ok' : c === '0' ? 'ng' : '' })),
  );
}

export function topbar(title, { back, actions = [] } = {}) {
  return el(
    'header',
    { class: 'topbar' },
    back && el('button', { class: 'icon-btn', 'aria-label': '戻る', onclick: back, html: icons.back }),
    el('h1', { class: visualLength(title) > 14 ? 'is-long' : '' }, title),
    ...actions,
  );
}

/** 単語帳を選ぶシート */
export function pickDeck(ctx, { onPick } = {}) {
  const { store } = ctx;
  const cur = currentDeck(store);
  const option = (id, name, count) =>
    el(
      'button',
      {
        class: 'sheet-option',
        type: 'button',
        onclick: () => {
          store.setSetting('deck', id);
          sheet.close();
          onPick?.(id);
        },
      },
      el('div', {}, el('b', {}, name), el('span', {}, `${count}語`)),
      id === cur ? el('span', { html: icons.check, style: { color: 'var(--accent)' } }) : null,
    );
  const sheet = openSheet({
    title: '単語帳を選ぶ',
    content: el(
      'div',
      { class: 'steps' },
      option('all', 'すべての単語帳', store.words('all').length),
      store.decks.map((d) => option(d.id, d.name, d.words.length)),
      el('button', { class: 'btn btn-sm', onclick: () => (sheet.close(), ctx.go('import')) }, el('span', { html: icons.plus }), '単語帳を追加'),
    ),
  });
}

/** 例文の中の見出し語を太字にする */
export function highlightTerm(example, term) {
  const text = String(example);
  const key = String(term).trim();
  if (!key || key.length < 2) return [text];
  const stem = key.length > 4 ? key.slice(0, key.length - 1) : key;
  const re = new RegExp(`(${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[a-zA-Z]*)`, 'gi');
  const parts = text.split(re);
  return parts.map((p, i) => (i % 2 === 1 ? el('b', {}, p) : p));
}
