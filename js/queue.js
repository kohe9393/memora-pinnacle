// 1回の学習で出す単語を選ぶ。

import { dayKey, shuffle } from './util.js';
import { forgetting, isDue } from './srs.js';

export const MODES = {
  auto: { label: '自動出題', desc: '忘れかけた単語・苦手な単語・新しい単語を、ちょうどよい割合で混ぜて出します。' },
  skim: { label: 'スキミング', desc: 'まだ学習していない単語を、単語帳の順にどんどん進めます。自信のなかった単語は最後にもう一周。' },
  weak: { label: '苦手な単語', desc: '間違えた単語と、答えるのに時間がかかった単語だけを出します。' },
  quiz: { label: '4択クイズ', desc: '4つの選択肢から意味を選びます。前に取り違えた単語やつづりが似た単語が選択肢に入ります。' },
};

// 10問ごとの並び：復習7・苦手2・新規1（固まらないように散らす）
const PATTERN = ['r', 'r', 'w', 'r', 'n', 'r', 'r', 'w', 'r', 'r'];

/**
 * 自動出題：復習（忘れていそうな順）・苦手（リスト順）・新規（単語帳の順）を混ぜる。
 * 足りない枠は 復習 → 苦手 → 新規 の順に隣が埋める。
 */
export function autoQueue(words, getState, { limit = 30, now = Date.now() } = {}) {
  const today = dayKey(now);
  const review = [];
  const weak = [];
  const fresh = [];
  for (const word of words) {
    const s = getState(word.id);
    if (!s?.seen) fresh.push(word);
    else if (s.weak) {
      if (dayKey(s.last) !== today) weak.push({ word, s });
    } else if (isDue(s, now)) review.push({ word, s });
  }
  review.sort((a, b) => forgetting(b.s, now) - forgetting(a.s, now));
  weak.sort((a, b) => a.s.weakAt - b.s.weakAt);
  const lists = { r: review.map((x) => x.word), w: weak.map((x) => x.word), n: fresh };
  const fallback = { r: ['r', 'w', 'n'], w: ['w', 'r', 'n'], n: ['n', 'r', 'w'] };

  const out = [];
  for (let i = 0; out.length < limit; i++) {
    const kind = fallback[PATTERN[i % PATTERN.length]].find((k) => lists[k].length);
    if (!kind) break;
    out.push(lists[kind].shift().id);
  }
  return out;
}

/** 今日の分が終わったあとの前倒し：次に出る予定が近い順（今日さわった単語は後回し） */
export function aheadQueue(words, getState, { limit = 30, now = Date.now() } = {}) {
  const today = dayKey(now);
  return words
    .map((word) => ({ word, s: getState(word.id) }))
    .filter(({ s }) => s?.seen)
    .sort((a, b) => (dayKey(a.s.last) === today) - (dayKey(b.s.last) === today) || a.s.due - b.s.due)
    .slice(0, limit)
    .map(({ word }) => word.id);
}

/** スキミング：未学習の単語を単語帳の順に */
export function skimQueue(words, getState, { limit = 30 } = {}) {
  return words.filter((w) => !getState(w.id)?.seen).slice(0, limit).map((w) => w.id);
}

/** 苦手な単語（苦手に入った順）。kind: 'all' | 'miss' | 'slow' */
export function weakWords(words, getState, kind = 'all') {
  return words
    .map((word) => ({ word, s: getState(word.id) }))
    .filter(({ s }) => s?.weak && (kind === 'all' || s.weak === kind))
    .sort((a, b) => a.s.weakAt - b.s.weakAt)
    .map(({ word }) => word);
}

export function weakQueue(words, getState, { kind = 'all', limit = 100 } = {}) {
  return weakWords(words, getState, kind).slice(0, limit).map((w) => w.id);
}

export const SECTION_SIZE = 50;

export function sections(words, size = SECTION_SIZE) {
  const out = [];
  for (let i = 0; i < words.length; i += size) {
    out.push({ index: out.length, from: i + 1, to: Math.min(words.length, i + size), words: words.slice(i, i + size) });
  }
  return out;
}

export const SECTION_STARTS = {
  start: '初めから',
  continue: '続きから',
  weak: '苦手のみ',
  random: 'ランダム',
};

/** セクションの始め方 */
export function sectionQueue(sectionWords, getState, how = 'start', rng = Math.random) {
  if (how === 'weak') return sectionWords.filter((w) => getState(w.id)?.weak).map((w) => w.id);
  if (how === 'random') return shuffle(sectionWords, rng).map((w) => w.id);
  if (how === 'continue') {
    const at = continueIndex(sectionWords, getState);
    return sectionWords.slice(at).map((w) => w.id);
  }
  return sectionWords.map((w) => w.id);
}

/** 最初の未学習の位置（すべて学習済みなら 0） */
export function continueIndex(words, getState) {
  const i = words.findIndex((w) => !getState(w.id)?.seen);
  return i < 0 ? 0 : i;
}

export function countToday(words, getState, now = Date.now()) {
  let due = 0;
  let fresh = 0;
  let weak = 0;
  let miss = 0;
  let slow = 0;
  for (const word of words) {
    const s = getState(word.id);
    if (!s?.seen) fresh += 1;
    else if (s.weak) {
      weak += 1;
      if (s.weak === 'miss') miss += 1;
      else slow += 1;
    } else if (isDue(s, now)) due += 1;
  }
  return { due, fresh, weak, miss, slow };
}
