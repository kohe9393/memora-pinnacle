// 単語帳の中身：セクション（50語ごと）・単語一覧・管理

import { el, downloadText, relativeDays, normalizeText } from '../util.js';
import { icons } from '../icons.js';
import { promptDialog, confirmDialog, toast, openSheet, segmented } from '../ui.js';
import { continueIndex, sections, SECTION_STARTS, sectionQueue } from '../queue.js';
import { status, STATUS } from '../srs.js';
import { progressBar, startSession, statusCounts, topbar } from './common.js';
import { openWordSheet } from './word-sheet.js';
import { exportSheet } from './settings.js';

const FILTERS = [
  { id: 'all', label: 'すべて' },
  { id: 'learned', label: '覚えた' },
  { id: 'weak', label: '苦手' },
  { id: 'new', label: '未学習' },
];
const PAGE = 150;

export function render(ctx) {
  const { store, go, params, refresh } = ctx;
  const deck = store.deck(params.id);
  if (!deck) {
    queueMicrotask(() => go('library'));
    return { el: el('div') };
  }
  const counts = statusCounts(deck.words, store.getState);

  const sectionRows = sections(deck.words).map((sec) => {
    const c = statusCounts(sec.words, store.getState);
    return el(
      'button',
      { class: 'lib-row', type: 'button', onclick: () => sectionSheet(ctx, deck, sec) },
      el('div', { class: 'lib-main' }, el('span', { class: 'lib-name num' }, `${sec.from}〜${sec.to}`), progressBar(c, sec.words.length)),
      el('div', { class: 'lib-side' }, el('b', {}, c.learned), el('span', {}, `/${sec.words.length}`), c.weak ? el('small', { class: 'is-ng' }, `苦手 ${c.weak}`) : null),
    );
  });

  // 単語一覧
  let filter = 'all';
  let query = '';
  let shown = PAGE;
  const list = el('ul', { class: 'list card' });
  const more = el('button', { class: 'btn btn-sm', hidden: true, onclick: () => ((shown += PAGE), renderList()) }, 'もっと見る');
  const countLabel = el('span', { class: 'small muted' });
  const chipButtons = FILTERS.map((f) =>
    el(
      'button',
      {
        class: 'chip',
        type: 'button',
        'aria-pressed': String(f.id === filter),
        onclick: () => {
          filter = f.id;
          shown = PAGE;
          chipButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(FILTERS[i].id === filter)));
          renderList();
        },
      },
      f.label,
    ),
  );

  function renderList() {
    const hits = deck.words.filter((w) => {
      const st = status(store.state(w.id));
      if (filter !== 'all' && st !== filter) return false;
      return !query || normalizeText(`${w.term} ${w.meaning}`).includes(query);
    });
    countLabel.textContent = `${hits.length}語`;
    list.replaceChildren(
      ...(hits.length
        ? hits.slice(0, shown).map((w) => {
            const s = store.state(w.id);
            const st = status(s);
            return el(
              'li',
              {},
              el(
                'button',
                { class: 'row', type: 'button', onclick: () => openWordSheet(store, { wordId: w.id, onChange: refresh }) },
                el('span', { class: 'sdot', dataset: { s: st }, title: STATUS[st].label }),
                el('span', { class: 'row-main' }, el('span', { class: 'row-term' }, w.term), el('span', { class: 'row-meaning' }, w.meaning)),
                el('span', { class: 'row-side' }, s?.seen ? `次 ${relativeDays(s.due)}` : '未学習'),
              ),
            );
          })
        : [el('li', { class: 'empty' }, '該当する単語はありません')]),
    );
    more.hidden = hits.length <= shown;
  }
  renderList();

  async function rename() {
    const name = await promptDialog({ title: '単語帳の名前', label: '名前', value: deck.name });
    if (name) {
      store.renameDeck(deck.id, name);
      refresh();
    }
  }

  function exportCSV() {
    const csv = store.exportDeckCSV(deck.id);
    exportSheet({ title: 'CSVで書き出す', text: csv, filename: `${deck.name}.csv`, download: () => downloadText(`${deck.name}.csv`, `﻿${csv}`, 'text/csv') });
  }

  async function resetStats() {
    const ok = await confirmDialog({ title: '学習記録をリセットしますか？', body: `「${deck.name}」の${deck.words.length}語がすべて未学習に戻ります。単語は消えません。`, ok: 'リセット', danger: true });
    if (!ok) return;
    store.resetStats(deck.words.map((w) => w.id));
    toast('学習記録をリセットしました');
    refresh();
  }

  async function remove() {
    const ok = await confirmDialog({ title: `「${deck.name}」を削除しますか？`, body: `${deck.words.length}語と学習記録がすべて消えます。元に戻せません。`, ok: '削除する', danger: true });
    if (!ok) return;
    store.deleteDeck(deck.id);
    toast('単語帳を削除しました');
    go('library');
  }

  return {
    el: el(
      'div',
      { class: 'page' },
      topbar(deck.name, { back: () => go('library') }),
      el('p', { class: 'topbar-sub back-pad num' }, `全 ${deck.words.length}語 ・ 覚えた ${counts.learned}語 ・ 苦手 ${counts.weak}語`),
      el('div', { class: 'lib' }, sectionRows.length ? sectionRows : el('p', { class: 'empty' }, 'まだ単語がありません')),
      el(
        'div',
        { class: 'btn-row' },
        el('button', { class: 'btn', onclick: () => openWordSheet(store, { deckId: deck.id, onChange: refresh }) }, el('span', { html: icons.plus }), '単語を追加'),
        el('button', { class: 'btn', onclick: () => go('import', { deck: deck.id }) }, el('span', { html: icons.upload }), 'まとめて追加'),
      ),
      el(
        'section',
        { class: 'section' },
        el('div', { class: 'section-head' }, el('h2', {}, '単語一覧'), countLabel),
        el(
          'label',
          { class: 'search' },
          el('span', { html: icons.search }),
          el('input', {
            class: 'input',
            id: 'deck-search',
            type: 'search',
            placeholder: '単語・意味で検索',
            'aria-label': '単語・意味で検索',
            oninput: (e) => {
              query = normalizeText(e.target.value);
              shown = PAGE;
              renderList();
            },
          }),
        ),
        el('div', { class: 'chips', role: 'group', 'aria-label': '絞り込み' }, chipButtons),
        list,
        more,
      ),
      el(
        'section',
        { class: 'section' },
        el('div', { class: 'section-head' }, el('h2', {}, '単語帳の管理')),
        el(
          'div',
          { class: 'btn-row' },
          el('button', { class: 'btn btn-sm', onclick: rename }, el('span', { html: icons.edit }), '名前を変更'),
          el('button', { class: 'btn btn-sm', onclick: exportCSV }, el('span', { html: icons.download }), 'CSVで書き出す'),
          el('button', { class: 'btn btn-sm', onclick: resetStats }, '学習記録をリセット'),
          el('button', { class: 'btn btn-sm btn-danger', onclick: remove }, el('span', { html: icons.trash }), '削除'),
        ),
      ),
    ),
  };
}

/** セクションの始め方を選ぶ */
function sectionSheet(ctx, deck, sec) {
  const { store } = ctx;
  let kind = 'study';
  const at = continueIndex(sec.words, store.getState);
  const weakCount = sec.words.filter((w) => store.state(w.id)?.weak).length;
  const label = `${sec.from}〜${sec.to}`;
  const start = (how) => {
    const ids = sectionQueue(sec.words, store.getState, how);
    sheet.close();
    startSession(ctx, { kind, mode: 'list', deck: deck.id, ids, title: `${label}（${SECTION_STARTS[how]}）` });
  };
  const option = (how, sub, disabled = false) =>
    el('button', { class: 'sheet-option', type: 'button', disabled, onclick: () => start(how) }, el('div', {}, el('b', {}, SECTION_STARTS[how]), el('span', {}, sub)), el('span', { html: icons.chevron }));
  const sheet = openSheet({
    title: `${deck.name} ${label}`,
    content: el(
      'div',
      { class: 'steps' },
      segmented({
        label: '学習のしかた',
        value: kind,
        options: [
          { value: 'study', label: 'スワイプ' },
          { value: 'quiz', label: '4択クイズ' },
        ],
        onChange: (v) => (kind = v),
      }),
      option('start', `${sec.words.length}語を順番に`),
      option('continue', sec.words.every((w) => store.state(w.id)?.seen) ? 'すべて学習済み（最初から）' : `${sec.from + at}語目から`),
      option('weak', `${weakCount}語`, weakCount === 0),
      option('random', 'この範囲をシャッフル'),
    ),
  });
}
