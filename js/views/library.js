import { el } from '../util.js';
import { icons } from '../icons.js';
import { countToday } from '../queue.js';
import { currentDeck, progressBar, statusCounts } from './common.js';

export function render({ store, go }) {
  const all = store.words('all');
  const allCounts = statusCounts(all, store.getState);
  const weak = countToday(store.words(currentDeck(store)), store.getState).weak;

  const deckRows = store.decks.map((deck) => {
    const counts = statusCounts(deck.words, store.getState);
    return el(
      'button',
      { class: 'lib-row', type: 'button', onclick: () => go('deck', { id: deck.id }) },
      el('div', { class: 'lib-main' }, el('span', { class: 'lib-name' }, deck.name), progressBar(counts, deck.words.length)),
      el(
        'div',
        { class: 'lib-side' },
        el('b', {}, counts.learned),
        el('span', {}, `/${deck.words.length}`),
        counts.weak ? el('small', { class: 'is-ng' }, `苦手 ${counts.weak}`) : el('small', {}, `未学習 ${counts.new}`),
      ),
    );
  });

  return {
    el: el(
      'div',
      { class: 'page' },
      el('header', { class: 'topbar' }, el('h1', {}, 'ライブラリ')),
      el('p', { class: 'topbar-sub num' }, `全 ${all.length.toLocaleString()}語 ・ 覚えた ${allCounts.learned.toLocaleString()}語`),
      el(
        'div',
        { class: 'lib' },
        el(
          'button',
          { class: 'lib-row stripe', type: 'button', onclick: () => go('weak') },
          el('div', { class: 'lib-main' }, el('span', { class: 'lib-name' }, '苦手な単語')),
          el('div', { class: 'lib-side' }, el('b', {}, weak), el('span', {}, '語')),
        ),
        deckRows,
      ),
      el('button', { class: 'btn btn-block', onclick: () => go('import') }, el('span', { html: icons.plus }), '単語帳を追加'),
    ),
  };
}
