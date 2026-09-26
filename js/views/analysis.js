// 分析：学習カレンダー（日ごとの輪）と苦手の内訳

import { el, svg } from '../util.js';
import { icons } from '../icons.js';
import { openSheet, segmented } from '../ui.js';
import { CAL_METRICS, confusionPairs, monthGrid, overview, recentMonths, weakBreakdown } from '../analytics.js';
import { currentDeck, startSession } from './common.js';
import { openWordSheet } from './word-sheet.js';

const WEEK = ['月', '火', '水', '木', '金', '土', '日'];
const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function render(ctx) {
  const { store, go } = ctx;
  const all = store.words('all');
  const ov = overview(all, store.getState, store.data.daily);
  let metric = 'answers';
  let monthsShown = 3;
  const calBody = el('div', { class: 'steps' });

  function ring(cell, max) {
    const size = 44;
    const r = 18;
    const c = 2 * Math.PI * r;
    const value = cell.data ? CAL_METRICS[metric].value(cell.data) : 0;
    const studied = !!cell.data?.a;
    const node = svg('svg', { class: 'ring', viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' });
    node.append(svg('circle', { class: `ring-track${!studied && !cell.future ? ' is-empty' : ''}`, cx: 22, cy: 22, r }));
    if (studied && value > 0) {
      const p = Math.min(1, value / Math.max(1, max));
      node.append(svg('circle', { class: `ring-fill m-${metric}`, cx: 22, cy: 22, r, 'stroke-dasharray': `${(p * c).toFixed(1)} ${c.toFixed(1)}` }));
    }
    if (!cell.future) {
      node.append(svg('text', { class: `ring-text${studied ? '' : ' is-dash'}`, x: 22, y: 26.5, 'text-anchor': 'middle' }, studied ? String(value) : '—'));
    }
    return node;
  }

  function monthBlock({ year, month }) {
    const cells = monthGrid(year, month, store.data.daily);
    const values = cells.filter((c) => c?.data).map((c) => CAL_METRICS[metric].value(c.data));
    const max = metric === 'answers' ? store.settings.dailyGoal : Math.max(1, ...values);
    return el(
      'section',
      { class: 'month' },
      el('h3', {}, `${year}年 ${month + 1}月`),
      el(
        'div',
        { class: 'calgrid' },
        cells.map((cell) =>
          cell
            ? el(
                'button',
                {
                  class: `calcell${cell.today ? ' is-today' : ''}${cell.future ? ' is-future' : ''}`,
                  type: 'button',
                  disabled: cell.future || !cell.data?.a,
                  'aria-label': `${month + 1}月${cell.day}日 ${cell.data?.a ? `${CAL_METRICS[metric].label} ${CAL_METRICS[metric].value(cell.data)}` : '学習なし'}`,
                  onclick: () => daySheet(ctx, cell),
                },
                el('span', { class: 'calday' }, cell.day),
                ring(cell, max),
              )
            : el('span'),
        ),
      ),
    );
  }

  function paintCalendar() {
    const months = recentMonths(monthsShown);
    calBody.replaceChildren(
      el('div', { class: 'weekhead', 'aria-hidden': 'true' }, WEEK.map((d) => el('span', {}, d))),
      el('button', { class: 'link-btn', style: { alignSelf: 'center' }, onclick: () => ((monthsShown += 3), paintCalendar()) }, 'さらに前の月'),
      ...months.map(monthBlock),
    );
  }
  paintCalendar();

  const words = store.words(currentDeck(store));
  const bd = weakBreakdown(words, store.getState);
  const tile = (label, n, desc) => el('div', { class: 'card bd' }, el('span', {}, label), el('b', {}, n, el('small', {}, '語')), el('p', {}, desc));
  const pairs = confusionPairs(words, store.getState, { limit: 5 });

  return {
    el: el(
      'div',
      { class: 'page' },
      el(
        'div',
        { class: 'an-top' },
        el('div', {}, el('p', { class: 'an-top-label' }, '今まで学習した単語'), el('p', { class: 'an-big' }, ov.studied.toLocaleString(), el('small', {}, '語'))),
        el('div', { class: 'an-side' }, el('p', { class: 'an-top-label' }, '未学習'), el('b', {}, ov.counts.new.toLocaleString(), el('small', {}, '語'))),
      ),
      segmented({
        label: 'カレンダーに出す値',
        value: metric,
        options: [
          { value: 'answers', label: '回答数' },
          { value: 'learned', label: '覚えた単語' },
          { value: 'missed', label: '間違えた単語' },
        ],
        onChange: (v) => {
          metric = v;
          paintCalendar();
        },
      }),
      el('section', { class: 'card card-pad' }, calBody),
      el('p', { class: 'small muted', style: { padding: '0 4px' } }, `連続学習 ${ov.streak}日 ・ 正答率 ${ov.accuracy == null ? '—' : `${Math.round(ov.accuracy * 100)}%`} ・ 輪は「回答数」なら1日の目標（${store.settings.dailyGoal}問）に対する割合です。日付をタップすると、その日に間違えた単語が見られます。`),
      el(
        'section',
        { class: 'section' },
        el('div', { class: 'section-head' }, el('h2', {}, '苦手の内訳'), el('button', { class: 'link-btn', onclick: () => go('weak', { from: 'analysis' }) }, '一覧を見る')),
        el(
          'div',
          { class: 'breakdown' },
          tile('間違えた', bd.miss, '答えが合っていなかった'),
          tile('瞬発力不足', bd.slow, '正解でも2秒以上かかった'),
          tile('自信アリで間違い', bd.over, '思い込みで覚えている'),
          tile('覚えたのに忘れた', bd.lapse, '間隔があくと抜ける'),
        ),
        bd.similar > 0 && el('p', { class: 'small muted', style: { padding: '0 4px' } }, `苦手な単語のうち${bd.similar}語は、つづりが似た単語があります。答えの面の「つづりが似た単語」で見比べられます。`),
      ),
      pairs.length > 0 &&
        el(
          'section',
          { class: 'section' },
          el('div', { class: 'section-head' }, el('h2', {}, '取り違えやすい組み合わせ')),
          el(
            'ul',
            { class: 'list card' },
            pairs.map(({ a, b, count }) =>
              el(
                'li',
                {},
                el(
                  'div',
                  { class: 'row' },
                  el('span', { class: 'row-main' }, el('span', { class: 'row-term' }, `${a.term} ⇄ ${b.term}`), el('span', { class: 'row-meaning' }, `${a.meaning} ／ ${b.meaning}`)),
                  el('span', { class: 'row-side' }, el('span', { class: 'tag tag-ng' }, `${count}回`)),
                ),
              ),
            ),
          ),
        ),
    ),
  };
}

function daySheet(ctx, cell) {
  const { store, refresh } = ctx;
  const d = cell.data;
  const date = new Date(cell.time);
  const missed = (d.m || []).filter((id) => store.word(id));
  const pct = d.a ? Math.round((d.c / d.a) * 100) : 0;
  const sheet = openSheet({
    title: `${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAY_JA[date.getDay()]}）`,
    content: el(
      'div',
      { class: 'steps' },
      el(
        'p',
        { class: 'stat-line' },
        el('span', {}, '回答 ', el('b', {}, d.a)),
        el('span', {}, '正答率 ', el('b', {}, `${pct}%`)),
        el('span', {}, '学習した単語 ', el('b', {}, (d.u || []).length)),
        el('span', {}, '覚えた ', el('b', {}, d.g || 0)),
      ),
      missed.length
        ? el(
            'ul',
            { class: 'list card' },
            missed.map((id) => {
              const w = store.word(id);
              return el(
                'li',
                {},
                el(
                  'button',
                  { class: 'row stripe', type: 'button', onclick: () => openWordSheet(store, { wordId: id, onChange: refresh }) },
                  el('span', { class: 'row-main' }, el('span', { class: 'row-term' }, w.term), el('span', { class: 'row-meaning' }, w.meaning)),
                  el('span', { html: icons.chevron, class: 'chev' }),
                ),
              );
            }),
          )
        : el('p', { class: 'muted small' }, 'この日に間違えた単語はありません。'),
      missed.length > 0 &&
        el('button', { class: 'btn btn-dark btn-block', onclick: () => (sheet.close(), startSession(ctx, { mode: 'list', deck: 'all', ids: missed, title: `${date.getMonth() + 1}/${date.getDate()}に間違えた単語` })) }, `この${missed.length}語を復習する`),
    ),
  });
}
