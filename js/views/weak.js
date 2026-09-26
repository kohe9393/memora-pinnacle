// 苦手な単語の一覧（苦手に入った順）

import { el, agoLabel } from '../util.js';
import { weakWords } from '../queue.js';
import { weakReasons } from '../srs.js';
import { currentDeck, deckLabel, recentDots, startSession, topbar } from './common.js';
import { openWordSheet } from './word-sheet.js';

const KINDS = [
  { id: 'all', label: 'すべて' },
  { id: 'miss', label: '間違えた' },
  { id: 'slow', label: '瞬発力不足' },
];

export function render(ctx) {
  const { store, go, params } = ctx;
  const deck = currentDeck(store);
  const words = store.words(deck);
  let kind = params.kind || 'all';
  const body = el('div', { class: 'section' });

  function paint() {
    const list = weakWords(words, store.getState, kind);
    const counts = Object.fromEntries(KINDS.map((k) => [k.id, weakWords(words, store.getState, k.id).length]));
    const chips = el(
      'div',
      { class: 'chips', role: 'group', 'aria-label': '絞り込み' },
      KINDS.map((k) =>
        el(
          'button',
          {
            class: 'chip',
            type: 'button',
            'aria-pressed': String(k.id === kind),
            onclick: () => {
              kind = k.id;
              paint();
            },
          },
          `${k.label} ${counts[k.id]}`,
        ),
      ),
    );
    if (!list.length) {
      body.replaceChildren(chips, el('div', { class: 'card empty' }, el('p', {}, '苦手な単語はありません。'), el('p', { class: 'small' }, '間違えた単語や、答えるのに2秒以上かかった単語がここに集まります。')));
      return;
    }
    const rows = list.map((w) => {
      const s = store.state(w.id);
      const reasons = weakReasons(w, s, { lookup: (id) => store.word(id), neighbors: words }).slice(0, 2);
      return el(
        'li',
        {},
        el(
          'button',
          { class: 'row stripe', type: 'button', onclick: () => openWordSheet(store, { wordId: w.id, onChange: paint }) },
          el(
            'span',
            { class: 'row-main' },
            el('span', { class: 'row-term' }, w.term),
            el('span', { class: 'row-meaning' }, w.meaning),
            reasons.length > 0 && el('span', { class: 'tags', style: { marginTop: '4px' } }, reasons.map((r) => el('span', { class: r.kind === 'similar' || r.kind === 'confused' ? 'tag tag-mid' : 'tag tag-ng' }, r.text))),
          ),
          el('span', { class: 'row-side' }, agoLabel(s.weakAt), recentDots(s.hist)),
        ),
      );
    });
    body.replaceChildren(
      chips,
      el('ul', { class: 'list card' }, rows),
      el(
        'div',
        { class: 'btn-row' },
        el('button', { class: 'btn btn-dark', onclick: () => startSession(ctx, { mode: 'list', deck, ids: list.map((w) => w.id), title: '苦手な単語' }) }, `この順番で学習（${list.length}語）`),
        el('button', { class: 'btn', onclick: () => startSession(ctx, { kind: 'quiz', mode: 'list', deck, ids: list.map((w) => w.id), title: '苦手な単語' }) }, '4択で'),
      ),
    );
  }
  paint();

  return {
    el: el(
      'div',
      { class: 'page' },
      topbar('苦手な単語', { back: () => go(params.from || 'library') }),
      el('p', { class: 'topbar-sub back-pad' }, deckLabel(store, deck)),
      body,
    ),
  };
}
