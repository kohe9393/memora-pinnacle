import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, startOfDay } from '../js/util.js';
import { dots, isDue, newState, nextIfCorrect, noteConfusion, review, status, weakReasons, FAST_MS, KNOWN_DAYS } from '../js/srs.js';

const T0 = new Date(2026, 8, 1, 9).getTime();
const ok = (s, now, extra = {}) => review(s, { correct: true, confidence: 'high', ms: 900, now, ...extra });
const ng = (s, now, extra = {}) => review(s, { correct: false, confidence: 'mid', ms: 1500, now, ...extra });

test('初見で1.5秒以内に自信アリで正解 → もう知っている単語として15日後', () => {
  const s = review(newState(), { correct: true, confidence: 'high', ms: 800, now: T0 });
  assert.equal(s.known, true);
  assert.equal(s.iv, KNOWN_DAYS);
  assert.equal(s.due, startOfDay(T0) + KNOWN_DAYS * DAY);
  assert.equal(status(s), 'learned');
});

test('間違えると苦手（間違えた）に入り、翌日いちばん先に出る', () => {
  const s = ng(newState(), T0);
  assert.equal(s.weak, 'miss');
  assert.equal(status(s), 'weak');
  assert.equal(s.due, startOfDay(T0) + DAY);
  assert.ok(!isDue(s, T0 + 60 * 1000));
  assert.ok(isDue(s, startOfDay(T0) + DAY));
});

test('正解でも2秒をこえたら瞬発力不足として苦手に入る', () => {
  let s = ok(newState(), T0, { ms: 1800 }); // 1.5秒超なので「知っている」扱いにはならない
  assert.equal(s.weak, null);
  s = ok(s, s.due, { ms: FAST_MS + 500 });
  assert.equal(s.weak, 'slow');
  assert.equal(s.n, 0);
  assert.equal(s.iv, 1);
});

test('自信なしの正解は間隔を伸ばさず翌日また出す', () => {
  let s = ok(newState(), T0, { ms: 1800 });
  s = ok(s, s.due);
  const before = s.iv;
  const lucky = review(s, { correct: true, confidence: 'low', ms: 900, now: s.due });
  assert.ok(before > 1);
  assert.equal(lucky.iv, 1);
});

test('自信アリですばやく正解し続けると間隔が伸び、ドットが埋まる', () => {
  let s = ok(newState(), T0, { ms: 1800 });
  assert.equal(s.iv, 2);
  const ivs = [s.iv];
  for (let i = 0; i < 5; i++) {
    s = ok(s, s.due);
    ivs.push(s.iv);
  }
  for (let i = 1; i < ivs.length; i++) assert.ok(ivs[i] > ivs[i - 1], `間隔が伸びていない: ${ivs}`);
  assert.equal(dots(s), 5);
  assert.equal(status(s), 'learned');
});

test('まあまあの正解は自信アリより伸びが小さい', () => {
  let base = ok(newState(), T0, { ms: 1800 });
  base = ok(base, base.due);
  const high = ok(base, base.due);
  const mid = review(base, { correct: true, confidence: 'mid', ms: 900, now: base.due });
  assert.ok(mid.iv < high.iv);
});

test('伸ばす土台は実際にあいた日数：前倒しで解いても間隔は飛ばない', () => {
  let s = ok(newState(), T0, { ms: 1800 });
  for (let i = 0; i < 4; i++) s = ok(s, s.due);
  const planned = s.iv;
  const early = ok(s, s.last + 2 * DAY);
  assert.ok(early.iv < planned, `${early.iv} < ${planned}`);
});

test('苦手は別々の日に2回すばやく正解すると卒業（同じ日の解き直しは数えない）', () => {
  let s = ng(newState(), T0);
  s = ok(s, T0 + 5 * 60 * 1000); // 同じ日の出し直し
  assert.equal(s.weak, 'miss');
  assert.equal(s.iv, 1);
  s = ok(s, startOfDay(T0) + DAY + 9 * 3600 * 1000);
  assert.equal(s.weak, 'miss');
  assert.equal(s.weakRun, 1);
  s = ok(s, startOfDay(T0) + 2 * DAY + 9 * 3600 * 1000);
  assert.equal(s.weak, null);
  assert.equal(status(s), 'review');
});

test('覚えた単語を自信アリで間違えると「思い込み」と「忘れた」が記録される', () => {
  let s = review(newState(), { correct: true, confidence: 'high', ms: 800, now: T0 });
  s = review(s, { correct: false, confidence: 'high', ms: 700, now: s.due });
  assert.equal(s.over, 1);
  assert.equal(s.lapses, 1);
  assert.equal(s.known, false);
  const kinds = weakReasons({ id: 'a', term: 'adapt' }, s).map((r) => r.kind);
  assert.ok(kinds.includes('over') && kinds.includes('lapse'));
});

test('4択など時間を測らない回答（ms: null）は瞬発力を問わない', () => {
  let s = review(newState(), { correct: true, confidence: 'mid', ms: null, now: T0 });
  s = review(s, { correct: true, confidence: 'mid', ms: null, now: s.due });
  assert.equal(s.weak, null);
  assert.ok(s.iv >= 1);
});

test('nextIfCorrect と元の状態を変えないこと', () => {
  const s = ng(newState(), T0);
  const copy = JSON.parse(JSON.stringify(s));
  assert.equal(nextIfCorrect(newState()), null);
  assert.ok(nextIfCorrect(s, T0 + DAY) >= 1);
  noteConfusion(s, 'x');
  assert.deepEqual(s, copy);
});

test('苦手の理由：遅かった秒数・つづりが似た語・混同', () => {
  const words = [
    { id: 'a', term: 'adapt', meaning: '適応させる' },
    { id: 'b', term: 'adopt', meaning: '採用する' },
    { id: 'c', term: 'affect', meaning: '影響する' },
  ];
  let s = ok(newState(), T0, { ms: 1800 });
  s = ok(s, s.due, { ms: 3400 });
  const slow = weakReasons(words[0], s, { neighbors: words });
  assert.ok(slow.some((r) => r.kind === 'slow' && r.text.includes('3.4秒')));
  assert.ok(slow.some((r) => r.kind === 'similar' && r.text.includes('adopt')));
  const confused = weakReasons(words[0], noteConfusion(ng(s, s.due), 'c'), { lookup: (id) => words.find((w) => w.id === id), neighbors: words });
  assert.ok(confused.some((r) => r.kind === 'confused' && r.text.includes('affect')));
});
