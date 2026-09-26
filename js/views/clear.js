// 学習の終了画面

import { el } from '../util.js';
import { icons } from '../icons.js';
import { status, weakReasons } from '../srs.js';
import { overview } from '../analytics.js';
import { startSession } from './common.js';
import { openWordSheet } from './word-sheet.js';

export function render(ctx) {
  const { store, go, params, refresh } = ctx;
  const { summary, before = new Map(), opts = {} } = params;
  if (!summary) {
    queueMicrotask(() => go('home'));
    return { el: el('div') };
  }
  const goal = store.settings.dailyGoal;
  const today = overview([], store.getState, store.data.daily).today;
  const reached = today.answers >= goal;

  const ids = summary.ids.filter((id) => store.word(id));
  const nowStatus = new Map(ids.map((id) => [id, status(store.state(id))]));
  const learned = ids.filter((id) => nowStatus.get(id) === 'learned' && before.get(id) !== 'learned');
  const newWeak = ids.filter((id) => nowStatus.get(id) === 'weak' && before.get(id) !== 'weak');
  const graduated = ids.filter((id) => before.get(id) === 'weak' && nowStatus.get(id) !== 'weak');
  const pct = Math.round(summary.accuracy * 100);

  const hero = el(
    'section',
    { class: 'card clear' },
    el('div', { class: `stamp${reached ? '' : ' is-plain'}`, html: icons.seal }),
    el('h1', {}, reached ? '今日の目標達成！' : 'おつかれさまでした'),
    el('p', { class: 'clear-sub' }, `今日 ${today.answers} / ${goal}回答`),
  );

  const tile = (label, value, unit, cls = '') => el('div', { class: `card tile ${cls}` }, el('span', {}, label), el('b', {}, value, unit && el('small', {}, unit)));
  const tiles = el('div', { class: 'tiles' }, tile('回答', summary.answers, '問'), tile('一発正解', pct, '%'), tile('覚えた', learned.length, '語', 'is-ok'));

  const LIMIT = 8;
  const list = (title, wordIds, stripe) =>
    wordIds.length > 0 &&
    el(
      'section',
      { class: 'section' },
      el('div', { class: 'section-head' }, el('h2', {}, title), el('span', { class: 'small muted' }, `${wordIds.length}語`)),
      el(
        'ul',
        { class: 'list card' },
        wordIds.slice(0, LIMIT).map((id) => {
          const w = store.word(id);
          const s = store.state(id);
          const reasons = stripe ? weakReasons(w, s).slice(0, 2) : [];
          return el(
            'li',
            {},
            el(
              'button',
              { class: `row${stripe ? ' stripe' : ''}`, type: 'button', onclick: () => openWordSheet(store, { wordId: id, onChange: refresh }) },
              el('span', { class: 'row-main' }, el('span', { class: 'row-term' }, w.term), el('span', { class: 'row-meaning' }, w.meaning)),
              reasons.length > 0 && el('span', { class: 'row-side' }, reasons.map((r) => el('span', { class: 'tag tag-ng' }, r.text))),
            ),
          );
        }),
        wordIds.length > LIMIT && el('li', { class: 'row muted small' }, `ほか ${wordIds.length - LIMIT}語`),
      ),
    );

  const missedIds = summary.missed.map((m) => m.id).filter((id) => store.word(id));
  const again = { ...opts };
  delete again.ids;
  const canContinue = ['auto', 'skim', 'weak'].includes(opts.mode) && !opts.ids;

  const actions = el(
    'div',
    { class: 'steps' },
    canContinue && el('button', { class: 'btn btn-dark btn-block', onclick: () => startSession(ctx, again) }, '続ける'),
    missedIds.length > 0 &&
      el('button', { class: `btn btn-block${canContinue ? '' : ' btn-dark'}`, onclick: () => startSession(ctx, { ...opts, mode: 'list', ids: missedIds, title: '間違えた単語' }) }, el('span', { html: icons.repeat }), '間違えた単語をもう一度'),
    el('button', { class: 'btn btn-block', onclick: () => go('home') }, 'ホームへ'),
  );

  return {
    el: el(
      'div',
      { class: 'page' },
      hero,
      tiles,
      list('苦手に入った単語', newWeak, true),
      list('苦手から卒業した単語', graduated, false),
      list('覚えた単語', learned.filter((id) => !graduated.includes(id)), false),
      actions,
    ),
  };
}
