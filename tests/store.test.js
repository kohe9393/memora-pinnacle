import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store, STORAGE_KEY } from '../js/store.js';
import { DAY, dayKey } from '../js/util.js';
import { confusionPairs, monthGrid, overview, recentMonths, streakDays, weakBreakdown } from '../js/analytics.js';
import { parseWordList } from '../js/parser.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m };
}

const T0 = new Date(2026, 8, 10, 12).getTime();
const right = (now, extra = {}) => ({ correct: true, confidence: 'high', ms: 1800, now, ...extra });
const wrong = (now, extra = {}) => ({ correct: false, confidence: 'mid', ms: 1200, now, ...extra });

test('単語帳の作成・重複スキップ・保存と読み込み', () => {
  const storage = fakeStorage();
  const store = new Store(storage);
  const { deck, added, duplicates } = store.createDeck('TOEIC', [
    { term: 'apple', meaning: 'りんご' },
    { term: 'Apple ', meaning: '重複' },
    { term: 'run', meaning: '走る' },
    { term: '', meaning: '空' },
  ]);
  assert.equal(added, 2);
  assert.equal(duplicates, 1);
  assert.equal(store.addEntries(deck.id, [{ term: 'RUN', meaning: 'x' }, { term: 'set', meaning: '置く' }]).added, 1);

  const reloaded = new Store(storage);
  assert.deepEqual(
    reloaded.words(deck.id).map((w) => w.term),
    ['apple', 'run', 'set'],
  );
});

test('回答の記録：日別のログ（回答数・語数・間違えた単語・覚えた数）', () => {
  const store = new Store(fakeStorage());
  const { deck } = store.createDeck('d', [
    { term: 'affect', meaning: '影響する' },
    { term: 'effect', meaning: '効果' },
    { term: 'apple', meaning: 'りんご' },
  ]);
  const [a, b, c] = store.words(deck.id);
  store.record(a.id, wrong(T0, { confusedWith: b.id }));
  store.record(a.id, right(T0 + 1000));
  store.record(b.id, wrong(T0, { confusedWith: a.id }));
  store.record(c.id, { correct: true, confidence: 'high', ms: 700, now: T0 }); // 初見で即答 → 覚えた

  const day = store.data.daily[dayKey(T0)];
  assert.equal(day.a, 4);
  assert.equal(day.c, 2);
  assert.deepEqual(day.u, [a.id, b.id, c.id]);
  assert.deepEqual(day.m, [a.id, b.id]);
  assert.equal(day.g, 1);
  assert.equal(store.state(a.id).conf[b.id], 1);

  const words = store.words(deck.id);
  const ov = overview(words, store.getState, store.data.daily, T0);
  assert.equal(ov.studied, 3);
  assert.equal(ov.counts.weak, 2);
  assert.equal(ov.counts.learned, 1);
  assert.equal(ov.completion, 1);
  assert.deepEqual(ov.today, { answers: 4, correct: 2, words: 3, learned: 1 });
  assert.equal(confusionPairs(words, store.getState)[0].count, 2);
  assert.equal(weakBreakdown(words, store.getState).miss, 2);
});

test('undo で1つ前の回答を取り消せる', () => {
  const store = new Store(fakeStorage());
  const { deck } = store.createDeck('d', [{ term: 'a', meaning: 'x' }]);
  const [a] = store.words(deck.id);
  const t1 = store.record(a.id, right(T0));
  const afterFirst = JSON.stringify(store.state(a.id));
  const t2 = store.record(a.id, wrong(T0 + 1000));
  assert.equal(store.state(a.id).weak, 'miss');
  store.undo(t2);
  assert.equal(JSON.stringify(store.state(a.id)), afterFirst);
  assert.equal(store.data.daily[dayKey(T0)].a, 1);
  store.undo(t1);
  assert.equal(store.state(a.id), null);
  assert.equal(store.data.daily[dayKey(T0)], undefined);
});

test('連続学習日数・月カレンダー', () => {
  const daily = {
    [dayKey(T0)]: { a: 5, c: 4 },
    [dayKey(T0 - DAY)]: { a: 2, c: 2 },
    [dayKey(T0 - 3 * DAY)]: { a: 1, c: 0 },
  };
  assert.equal(streakDays(daily, T0), 2);
  assert.equal(streakDays({ [dayKey(T0 - DAY)]: { a: 1 } }, T0), 1);
  // 2026年9月1日は火曜 → 月曜はじまりで空白1マス
  const grid = monthGrid(2026, 8, daily, T0);
  assert.equal(grid[0], null);
  assert.equal(grid[1].day, 1);
  assert.equal(grid.filter(Boolean).length, 30);
  const ten = grid.find((c) => c?.day === 10);
  assert.equal(ten.today, true);
  assert.equal(ten.data.a, 5);
  assert.equal(grid.find((c) => c?.day === 11).future, true);
  assert.deepEqual(recentMonths(3, T0), [
    { year: 2026, month: 6 },
    { year: 2026, month: 7 },
    { year: 2026, month: 8 },
  ]);
});

test('単語の編集・削除、単語帳の削除で記録も消える', () => {
  const store = new Store(fakeStorage());
  const { deck } = store.createDeck('d', [
    { term: 'a', meaning: 'x' },
    { term: 'b', meaning: 'y' },
  ]);
  const [a, b] = store.words(deck.id);
  store.updateWord(a.id, { meaning: 'エー', example: 'An a.' });
  assert.equal(store.word(a.id).meaning, 'エー');
  store.updateWord(a.id, { term: '  ' });
  assert.equal(store.word(a.id).term, 'a');
  store.record(b.id, right(T0));
  store.deleteWord(b.id);
  assert.equal(store.state(b.id), null);
  store.record(a.id, right(T0));
  store.deleteDeck(deck.id);
  assert.equal(store.state(a.id), null);
  assert.equal(store.words('all').length, 0);
});

test('バックアップの書き出しと復元、CSV 書き出し', () => {
  const store = new Store(fakeStorage());
  const { deck } = store.createDeck('英検', [{ term: 'abandon', meaning: '捨てる, 見捨てる', example: 'He abandoned it.' }]);
  store.record(store.words(deck.id)[0].id, right(T0));
  store.setSetting('dailyGoal', 50);
  const json = store.exportBackup();

  const other = new Store(fakeStorage());
  assert.deepEqual(other.restoreBackup(json), { decks: 1, words: 1 });
  assert.equal(other.settings.dailyGoal, 50);
  assert.equal(other.state(other.words('all')[0].id).seen, 1);
  assert.throws(() => other.restoreBackup('{"hello":1}'));
  assert.equal(other.words('all').length, 1);

  const back = parseWordList(store.exportDeckCSV(deck.id));
  assert.equal(back.entries[0].meaning, '捨てる, 見捨てる');
  assert.equal(back.entries[0].example, 'He abandoned it.');
});

test('以前の版の学習記録を読み込める', () => {
  const storage = fakeStorage();
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      decks: [{ id: 'd', name: 'old', words: [{ id: 'w', term: 'a', meaning: 'b' }] }],
      stats: { w: { seen: 2, correct: 1, wrong: 1, streak: 0, interval: 0, ease: 2.3, due: 1, last: 1, hist: '10', conf: {} } },
      settings: { sessionSize: 20 },
    }),
  );
  const store = new Store(storage);
  const s = store.state('w');
  assert.equal(s.iv, 0);
  assert.equal(s.weak, 'miss');
  assert.equal(store.settings.dailyGoal, 30);
});

test('壊れた保存データは無視、保存に失敗したら lastSaveOk が false', () => {
  const storage = fakeStorage();
  storage.setItem(STORAGE_KEY, '{broken');
  assert.equal(new Store(storage).decks.length, 0);
  const failing = { getItem: () => null, setItem: () => { throw new Error('QuotaExceeded'); }, removeItem() {} };
  const store = new Store(failing);
  store.createDeck('d', [{ term: 'a', meaning: 'b' }]);
  assert.equal(store.lastSaveOk, false);
});
