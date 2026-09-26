import { el } from '../util.js';
import { icons } from '../icons.js';
import { openSheet, toast } from '../ui.js';
import { continueIndex, countToday, MODES } from '../queue.js';
import { overview } from '../analytics.js';
import { SAMPLE_NAME, SAMPLE_WORDS } from '../sample.js';
import { currentDeck, deckLabel, pickDeck, progressBar, startSession } from './common.js';
import { openWordSheet } from './word-sheet.js';

export function render(ctx) {
  const { store, go, refresh } = ctx;
  if (!store.decks.length) return onboarding(ctx);

  const deck = currentDeck(store);
  const words = store.words(deck);
  const ov = overview(words, store.getState, store.data.daily);
  const c = countToday(words, store.getState);
  const goal = store.settings.dailyGoal;
  const today = overview([], store.getState, store.data.daily).today;
  const skimAt = continueIndex(words, store.getState);

  const header = el(
    'header',
    { class: 'home-head' },
    el(
      'div',
      { class: 'home-title' },
      el('h1', {}, 'めくる単語帳'),
      el('button', { class: 'deck-picker', type: 'button', onclick: () => pickDeck(ctx, { onPick: refresh }) }, el('span', {}, deckLabel(store, deck)), el('span', { html: icons.caret })),
    ),
    el(
      'div',
      { class: 'head-actions' },
      el('button', { class: 'head-action', type: 'button', onclick: () => addWords(ctx, deck) }, el('span', { html: icons.plusCircle }), '単語追加'),
      el('button', { class: 'head-action', type: 'button', onclick: () => go('settings') }, el('span', { html: icons.settings }), '設定'),
    ),
  );

  const pct = Math.round(ov.completion * 100);
  const legend = (color, label, n) => el('span', {}, el('i', { style: { background: color } }), `${label} `, el('b', {}, n));
  const completion = el(
    'section',
    { class: 'card completion', 'aria-label': '完成度' },
    el('div', { class: 'completion-top' }, el('span', { class: 'completion-label' }, `${deckLabel(store, deck)}の完成度`), el('span', { class: 'completion-value' }, pct, el('small', {}, '%'))),
    progressBar(ov.counts, ov.total),
    el(
      'div',
      { class: 'completion-legend' },
      legend('var(--ok)', '覚えた', ov.counts.learned),
      legend('var(--accent)', '学習中', ov.counts.review),
      legend('var(--ng)', '苦手', ov.counts.weak),
      legend('var(--line-strong)', '未学習', ov.counts.new),
    ),
  );

  const task = (no, label, meta, metaClass, onclick) =>
    el(
      'button',
      { class: 'task', type: 'button', onclick },
      el('span', { class: 'task-no' }, no),
      el('span', { class: 'task-title' }, label),
      meta != null && el('span', { class: `task-meta ${metaClass || ''}` }, meta),
    );

  const tasks = el(
    'div',
    { class: 'tasks' },
    task('01', MODES.auto.label, c.due ? `復習 ${c.due}` : null, 'is-accent', () => startSession(ctx, { mode: 'auto', deck })),
    task('02', MODES.skim.label, c.fresh ? (skimAt ? `続き ${skimAt + 1}語目〜` : `未学習 ${c.fresh}`) : '完了', '', () => startSession(ctx, { mode: 'skim', deck })),
    task('03', MODES.weak.label, `${c.weak}語`, c.weak ? 'is-ng' : '', () => weakSheet(ctx, deck, c)),
    task('04', MODES.quiz.label, null, '', () => startSession(ctx, { kind: 'quiz', mode: 'auto', deck })),
  );

  const reached = today.answers >= goal;
  const todayLine = el(
    'p',
    { class: 'today-line' },
    el('span', {}, '今日 ', el('b', {}, today.answers), '回答'),
    el('span', { 'aria-hidden': 'true' }, '・'),
    el('span', {}, el('b', {}, today.words), '語'),
    reached ? el('span', { class: 'goal-badge' }, el('span', { html: icons.seal }), '目標達成') : el('span', {}, `目標 ${goal}回答`),
  );

  return {
    el: el(
      'div',
      { class: 'page' },
      header,
      completion,
      el('div', { class: 'help-row' }, el('button', { class: 'help-btn', type: 'button', 'aria-label': '使い方', onclick: helpSheet }, '?')),
      tasks,
      todayLine,
    ),
  };
}

function weakSheet(ctx, deck, c) {
  const { go } = ctx;
  const option = (label, n, onclick, desc) =>
    el('button', { class: 'sheet-option', type: 'button', disabled: !n, onclick }, el('div', {}, el('b', {}, label), el('span', {}, `${n}語${desc ? ` ・ ${desc}` : ''}`)), el('span', { html: icons.chevron }));
  const sheet = openSheet({
    title: '苦手な単語',
    content: el(
      'div',
      { class: 'steps' },
      option('間違えた単語', c.miss, () => (sheet.close(), startSession(ctx, { mode: 'weak', weakKind: 'miss', deck, title: '間違えた単語' })), '合っていなかった単語'),
      option('瞬発力が遅い単語', c.slow, () => (sheet.close(), startSession(ctx, { mode: 'weak', weakKind: 'slow', deck, title: '瞬発力が遅い単語' })), '答えるのに2秒以上'),
      el('button', { class: 'btn btn-sm', onclick: () => (sheet.close(), go('weak', { from: 'home' })) }, '一覧を見る'),
    ),
  });
}

function addWords(ctx, deck) {
  const { store, go, refresh } = ctx;
  const target = deck !== 'all' ? deck : store.decks[0]?.id;
  const sheet = openSheet({
    title: '単語追加',
    content: el(
      'div',
      { class: 'steps' },
      el(
        'button',
        { class: 'sheet-option', type: 'button', onclick: () => (sheet.close(), go('import')) },
        el('div', {}, el('b', {}, 'まとめて読み込む'), el('span', {}, 'CSV・テキスト・Excel からのコピペ')),
        el('span', { html: icons.chevron }),
      ),
      target &&
        el(
          'button',
          { class: 'sheet-option', type: 'button', onclick: () => (sheet.close(), openWordSheet(store, { deckId: target, onChange: refresh })) },
          el('div', {}, el('b', {}, '1語ずつ追加'), el('span', {}, `「${store.deck(target).name}」に追加`)),
          el('span', { html: icons.chevron }),
        ),
    ),
  });
}

function helpSheet() {
  const item = (title, text) => el('li', {}, el('b', {}, title), el('p', {}, text));
  openSheet({
    title: '使い方',
    content: el(
      'ul',
      { class: 'help-list' },
      item('スワイプの2段階', '単語を見て答えを思い浮かべたら、自信をスワイプします（右＝自信アリ／下＝まあまあ／左＝自信なし）。答えが出たら、合っていたら右、間違っていたら左。'),
      item('苦手の判定', '間違えた単語と、正解でも答え始めるまで2秒以上かかった単語が「苦手」に入ります。別々の日に2回、すばやく正解すると卒業します。'),
      item(MODES.auto.label, `${MODES.auto.desc} 間違えた単語は翌日いちばん先に出ます。`),
      item(MODES.skim.label, MODES.skim.desc),
      item(MODES.weak.label, MODES.weak.desc),
      item(MODES.quiz.label, MODES.quiz.desc),
      item('↺ ボタン', '学習中に押すと、1つ前の回答を取り消せます。'),
    ),
  });
}

function onboarding(ctx) {
  const { store, go } = ctx;
  let step = 0;
  const root = el('div', { class: 'onboard' });

  function paint() {
    const bar = el(
      'div',
      { class: 'onboard-bar' },
      step > 0 ? el('button', { class: 'icon-btn', 'aria-label': '戻る', onclick: () => ((step -= 1), paint()), html: icons.back }) : el('span', { style: { width: '44px' } }),
      el('div', { class: 'onboard-progress' }, el('span', { style: { width: `${((step + 1) / 2) * 100}%` } })),
    );
    let body;
    if (step === 0) {
      const goal = (n, sub, rec) =>
        el(
          'button',
          {
            class: `choice-card${rec ? ' is-recommended' : ''}`,
            type: 'button',
            onclick: () => {
              store.setSetting('dailyGoal', n);
              step = 1;
              paint();
            },
          },
          rec && el('span', { class: 'badge' }, 'おすすめ'),
          el('b', {}, `${n}問`),
          el('span', {}, sub),
        );
      body = el(
        'div',
        { class: 'onboard-body' },
        el('h1', {}, '1日に何問', el('br'), 'がんばりますか？'),
        el('p', { class: 'onboard-lead' }, '1回の出題数と、毎日の目標になります。あとから設定で変えられます。'),
        el('div', { class: 'goal-grid' }, goal(20, '約5分'), goal(30, '約8分', true), goal(50, '約12分'), goal(100, '約25分')),
      );
    } else {
      body = el(
        'div',
        { class: 'onboard-body' },
        el('h1', {}, '覚えたい単語帳を', el('br'), '用意しましょう'),
        el(
          'button',
          { class: 'choice-card is-recommended', type: 'button', onclick: () => go('import') },
          el('span', { class: 'badge' }, 'おすすめ'),
          el('b', {}, '自分の単語帳を読み込む'),
          el('span', {}, 'CSV・テキスト・Excel からのコピペ'),
        ),
        el(
          'button',
          {
            class: 'choice-card',
            type: 'button',
            onclick: () => {
              store.createDeck(SAMPLE_NAME, SAMPLE_WORDS);
              toast('サンプルの単語帳を追加しました');
              go('home');
            },
          },
          el('b', {}, 'サンプルで試す'),
          el('span', {}, 'まぎらわしい英単語30語'),
        ),
      );
    }
    root.replaceChildren(bar, body);
  }
  paint();
  return { el: root };
}
