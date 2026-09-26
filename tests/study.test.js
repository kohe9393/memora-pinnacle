import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, seededRandom, startOfDay } from '../js/util.js';
import { newState, review } from '../js/srs.js';
import { aheadQueue, autoQueue, continueIndex, countToday, sectionQueue, sections, skimQueue, weakQueue } from '../js/queue.js';
import { Session } from '../js/session.js';
import { buildQuestion, pickDirection } from '../js/quiz.js';

const T0 = new Date(2026, 8, 1, 9).getTime();
const words = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, term: `word${i}`, meaning: `意味${i}` }));

const known = (now) => review(newState(), { correct: true, confidence: 'high', ms: 1800, now });
const missed = (now) => review(newState(), { correct: false, now });

function statsWith(entries) {
  const map = new Map(entries);
  return (id) => map.get(id) || null;
}

test('自動出題：復習7・苦手2・新規1 の割合で混ぜる', () => {
  const entries = [];
  for (let i = 0; i < 12; i++) entries.push([`w${i}`, known(T0 - 5 * DAY)]); // 期限切れの復習
  for (let i = 12; i < 16; i++) entries.push([`w${i}`, missed(T0 - DAY)]); // 苦手
  const getState = statsWith(entries);
  const q = autoQueue(words, getState, { limit: 10, now: T0 });
  assert.equal(q.length, 10);
  const kinds = q.map((id) => (Number(id.slice(1)) < 12 ? 'r' : Number(id.slice(1)) < 16 ? 'w' : 'n'));
  assert.equal(kinds.filter((k) => k === 'r').length, 7);
  assert.equal(kinds.filter((k) => k === 'w').length, 2);
  assert.equal(kinds.filter((k) => k === 'n').length, 1);
  assert.equal(q.filter((id) => Number(id.slice(1)) >= 16)[0], 'w16'); // 新規は単語帳の順
});

test('自動出題：足りない枠は隣が埋める／今日さわった苦手は出さない', () => {
  const getState = statsWith([
    ['w0', missed(T0 - 60 * 1000)], // 今日間違えた
    ['w1', missed(T0 - DAY)],
  ]);
  const q = autoQueue(words, getState, { limit: 5, now: T0 });
  assert.equal(q.length, 5);
  assert.ok(!q.includes('w0'));
  assert.ok(q.includes('w1'));
});

test('前倒し：今日の分が終わったら、次に出る予定が近い順（今日さわった単語は後回し）', () => {
  const getState = statsWith([
    ['w0', known(T0 - 60 * 1000)], // 今日さわった
    ['w1', known(T0 - DAY)], // 明日が期限
    ['w2', review(known(T0 - 5 * DAY), { correct: true, confidence: 'high', ms: 900, now: T0 - DAY })],
  ]);
  assert.deepEqual(autoQueue(words.slice(0, 3), getState, { now: T0 }), []);
  assert.deepEqual(aheadQueue(words.slice(0, 3), getState, { now: T0 }), ['w1', 'w2', 'w0']);
});

test('自動出題：忘れていそうな順（期限切れが長い・間隔が短いほど先）', () => {
  const a = known(T0 - 30 * DAY); // 2日間隔で28日放置
  const b = known(T0 - 3 * DAY); // 2日間隔で1日遅れ
  const getState = statsWith([
    ['w0', b],
    ['w1', a],
  ]);
  const q = autoQueue(words.slice(0, 2), getState, { limit: 2, now: T0 });
  assert.deepEqual(q, ['w1', 'w0']);
});

test('スキミング・苦手・セクション', () => {
  const getState = statsWith([
    ['w0', known(T0)],
    ['w2', missed(T0)],
    ['w3', review(known(T0 - 3 * DAY), { correct: true, confidence: 'high', ms: 5000, now: T0 })], // 遅い
  ]);
  assert.deepEqual(skimQueue(words, getState, { limit: 3 }), ['w1', 'w4', 'w5']);
  assert.deepEqual(weakQueue(words, getState), ['w2', 'w3']);
  assert.deepEqual(weakQueue(words, getState, { kind: 'slow' }), ['w3']);

  const secs = sections(words, 12);
  assert.deepEqual(secs.map((s) => [s.from, s.to]), [[1, 12], [13, 24], [25, 30]]);
  assert.equal(continueIndex(secs[0].words, getState), 1);
  assert.deepEqual(sectionQueue(secs[0].words, getState, 'continue').slice(0, 2), ['w1', 'w2']);
  assert.deepEqual(sectionQueue(secs[0].words, getState, 'weak'), ['w2', 'w3']);
  assert.equal(new Set(sectionQueue(secs[0].words, getState, 'random', seededRandom(1))).size, 12);

  assert.deepEqual(countToday(words, getState, T0 + 3 * DAY), { due: 1, fresh: 27, weak: 2, miss: 1, slow: 1 });
});

test('Session：間違えた単語は5枚あとに再出題', () => {
  const s = new Session(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  s.answer(false);
  assert.deepEqual(s.queue, ['a', 'b', 'c', 'd', 'e', 'f', 'a', 'g']);
  for (let i = 0; i < 5; i++) s.answer(true);
  assert.equal(s.current, 'a');
  assert.equal(s.isRetry, true);
  s.answer(true);
  s.answer(true);
  assert.equal(s.done, true);
  const sum = s.summary();
  assert.equal(sum.total, 7);
  assert.equal(sum.firstTry, 6);
  assert.deepEqual(sum.missed, [{ id: 'a', misses: 1, recovered: true }]);
});

test('Session：スキミングは自信のなかった正解を最後にもう一周', () => {
  const s = new Session(['a', 'b', 'c'], { secondLap: true });
  s.answer(true, { confident: false });
  s.answer(true);
  s.answer(true, { confident: false });
  assert.equal(s.done, false);
  assert.deepEqual(s.queue.slice(s.pos), ['a', 'c']);
  s.answer(true, { confident: false });
  s.answer(true);
  assert.equal(s.done, true); // 2周目は1回だけ
});

test('Session：1つ前に戻す（snapshot / restore）', () => {
  const s = new Session(['a', 'b', 'c']);
  const snap = s.snapshot();
  s.answer(false);
  assert.equal(s.current, 'b');
  s.restore(snap);
  assert.equal(s.current, 'a');
  assert.deepEqual(s.queue, ['a', 'b', 'c']);
  assert.equal(s.log.length, 0);
  assert.equal(s.results.size, 0);
});

test('クイズ：正解1つ + 重複のない選択肢、取り違えた単語が入りやすい', () => {
  const pool = [...words, { id: 'dup', term: 'dup', meaning: '意味1' }];
  for (let seed = 1; seed < 15; seed++) {
    const q = buildQuestion(words[1], pool, { rng: seededRandom(seed), confusions: { w7: 2 } });
    assert.equal(q.options.length, 4);
    assert.equal(q.options[q.correctIndex].id, 'w1');
    assert.equal(new Set(q.options.map((o) => o.text)).size, 4);
    assert.ok(q.options.some((o) => o.id === 'w7'));
  }
  const rev = buildQuestion(words[0], words.slice(0, 2), { direction: 'meaning' });
  assert.equal(rev.prompt, '意味0');
  assert.equal(rev.options.length, 2);
  assert.equal(pickDirection('mix', () => 0.9), 'meaning');
});

test('startOfDay 基準で期限を比べる', () => {
  const s = known(T0);
  assert.equal(s.due, startOfDay(T0) + 2 * DAY);
});
