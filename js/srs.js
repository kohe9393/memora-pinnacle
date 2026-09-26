// 記憶のしくみ：自信（アリ／まあまあ／なし）× 正誤 × 答えるまでの時間で、次に出す日を決める。
//
// ・間隔は「日」で持つ。伸ばす土台は予定していた間隔ではなく、実際にあいた日数。
// ・単語ごとに「覚えやすさ（ef）」を持ち、自信アリで正解するたびに少し上がり、間違えると下がる。
// ・自信なしの正解は当てずっぽうかもしれないので、間隔を伸ばさず翌日また出す。
// ・正解でも答えるまで2秒をこえたら「瞬発力不足」として苦手に入れる。
// ・苦手な単語は、別々の日に2回、2秒以内で正解すると苦手から卒業する。
// ・初めて見て1.5秒以内に自信アリで正解した単語は「もう知っている」として15日後まで出さない。

import { DAY, dayKey, startOfDay, looksSimilar } from './util.js';

export const FAST_MS = 2000;
export const KNOWN_MS = 1500;
export const KNOWN_DAYS = 15;
export const LEARNED_DAYS = 7;
export const MAX_INTERVAL = 365;
export const DOT_STEPS = [1, 3, 7, 15, 30]; // 5つ埋まると卒業

export const CONFIDENCE = {
  high: '自信アリ',
  mid: 'まあまあ',
  low: '自信なし',
};

export const STATUS = {
  new: { label: '未学習' },
  review: { label: '学習中' },
  weak: { label: '苦手' },
  learned: { label: '覚えた' },
};

export const WEAK_KIND = {
  miss: '間違えた',
  slow: '瞬発力不足',
};

export function newState() {
  return {
    seen: 0,
    correct: 0,
    wrong: 0,
    iv: 0, // 次の出題までの間隔（日）
    ef: 2.5, // 覚えやすさ
    due: 0, // 次に出す日（その日の0時）
    last: 0,
    n: 0, // すばやく正解した連続回数
    hist: '', // 直近の正誤 '1' / '0'
    weak: null, // 苦手の種類 'miss' | 'slow' | null
    weakAt: 0,
    weakRun: 0, // 苦手からの卒業に向けた正解回数（1日1回まで数える）
    weakDay: '',
    known: false,
    lapses: 0, // 覚えていたのに忘れた回数
    over: 0, // 自信アリなのに間違えた回数（思い込み）
    slow: 0, // 正解だが遅かった回数
    ms: null, // 直近の回答時間
    conf: {}, // 4択で取り違えた相手 id → 回数
  };
}

/**
 * 1回の回答を反映した新しい状態を返す（元の状態は変更しない）。
 * @param answer.correct 合っていたか
 * @param answer.confidence 'high' | 'mid' | 'low'
 * @param answer.ms 答え始めるまでの時間。null なら時間は評価しない（4択など）
 */
export function review(prev, { correct, confidence = 'mid', ms = null, now = Date.now() } = {}) {
  const p = { ...newState(), ...(prev || {}) };
  const s = { ...p, conf: { ...(p.conf || {}) } };
  const today = dayKey(now);
  const first = p.seen === 0;
  const elapsed = p.last ? (now - p.last) / DAY : 0;
  const answeredToday = !!p.last && dayKey(p.last) === today;
  s.seen += 1;
  s.last = now;
  s.ms = ms;
  s.hist = (p.hist + (correct ? '1' : '0')).slice(-12);

  const scheduleIn = (days) => {
    s.iv = Math.min(MAX_INTERVAL, days);
    s.due = startOfDay(now) + s.iv * DAY;
  };

  if (!correct) {
    s.wrong += 1;
    if (p.iv >= LEARNED_DAYS || p.known) s.lapses += 1;
    if (confidence === 'high') s.over += 1;
    s.n = 0;
    s.ef = Math.max(1.3, p.ef - 0.2);
    s.known = false;
    s.weak = 'miss';
    s.weakAt = now;
    s.weakRun = 0;
    s.weakDay = today; // 同じ日の解き直しは卒業の証拠にしない
    scheduleIn(0);
    s.due = startOfDay(now) + DAY; // 翌日いちばん先に出す
    return s;
  }

  s.correct += 1;

  if (first && confidence === 'high' && ms != null && ms <= KNOWN_MS) {
    s.known = true;
    s.n = 1;
    scheduleIn(KNOWN_DAYS);
    return s;
  }

  if (confidence === 'low') {
    scheduleIn(1);
    return s;
  }

  if (ms != null && ms > FAST_MS) {
    s.slow += 1;
    s.n = 0;
    if (!p.weak) {
      s.weak = 'slow';
      s.weakAt = now;
    }
    s.weakRun = 0;
    s.weakDay = today;
    scheduleIn(1);
    return s;
  }

  // すばやく、自信をもって正解
  s.n = p.n + 1;
  const retryAfterMiss = answeredToday && p.hist.endsWith('0');
  if (retryAfterMiss) scheduleIn(1);
  else if (p.iv <= 0) scheduleIn(confidence === 'high' ? 2 : 1);
  else scheduleIn(Math.max(1, Math.round(Math.max(1, elapsed) * p.ef * (confidence === 'mid' ? 0.75 : 1))));
  if (confidence === 'high') s.ef = Math.min(3, p.ef + 0.1);

  if (p.weak) {
    if (p.weakDay !== today) {
      s.weakRun = p.weakRun + 1;
      s.weakDay = today;
    }
    if (s.weakRun >= 2) {
      s.weak = null;
      s.weakRun = 0;
      s.weakDay = '';
    }
  }
  return s;
}

export function noteConfusion(state, otherId) {
  const conf = { ...(state.conf || {}) };
  conf[otherId] = (conf[otherId] || 0) + 1;
  return { ...state, conf };
}

export function status(s) {
  if (!s || !s.seen) return 'new';
  if (s.weak) return 'weak';
  if (s.known || s.iv >= LEARNED_DAYS) return 'learned';
  return 'review';
}

/** 卒業までのドット（0〜5） */
export function dots(s) {
  const iv = s?.iv || 0;
  return DOT_STEPS.filter((d) => iv >= d).length;
}

export function isDue(s, now = Date.now()) {
  return !!s && s.seen > 0 && s.due <= now;
}

/** 正解（自信アリ・すばやく）したら何日後に出るか */
export function nextIfCorrect(s, now = Date.now()) {
  if (!s?.seen) return null;
  return review(s, { correct: true, confidence: 'high', ms: 0, now }).iv;
}

/** 忘れていそうな度合い。大きいほど先に復習する */
export function forgetting(s, now = Date.now()) {
  if (!s?.seen) return 0;
  const overdue = (now - s.due) / DAY;
  return overdue / Math.max(1, s.iv) + (s.weak ? 1 : 0);
}

export function accuracy(s) {
  return s?.seen ? s.correct / s.seen : null;
}

/** 苦手の理由（分析や一覧に出す短いラベル） */
export function weakReasons(word, s, { lookup = () => null, neighbors = [] } = {}) {
  const reasons = [];
  if (!s?.seen) return reasons;
  if (s.weak === 'slow') reasons.push({ kind: 'slow', text: s.ms ? `答えるのに${(s.ms / 1000).toFixed(1)}秒` : '瞬発力不足' });
  if (s.hist.endsWith('00')) reasons.push({ kind: 'streak', text: '連続でミス' });
  else if (s.weak === 'miss') reasons.push({ kind: 'miss', text: '前回ミス' });
  if (s.over >= 1) reasons.push({ kind: 'over', text: '自信アリで間違い' });
  if (s.lapses >= 1) reasons.push({ kind: 'lapse', text: '覚えたのに忘れた' });
  if (s.wrong >= 3) reasons.push({ kind: 'count', text: `${s.wrong}回ミス` });
  const top = Object.entries(s.conf || {}).sort((a, b) => b[1] - a[1])[0];
  const other = top && lookup(top[0]);
  if (other) reasons.push({ kind: 'confused', text: `「${other.term}」と混同`, otherId: other.id });
  else {
    const similar = neighbors.find((w) => w.id !== word.id && looksSimilar(w.term, word.term));
    if (similar) reasons.push({ kind: 'similar', text: `つづりが似た「${similar.term}」`, otherId: similar.id });
  }
  return reasons;
}

export function similarWords(word, pool, limit = 3) {
  return pool.filter((w) => w.id !== word.id && looksSimilar(w.term, word.term)).slice(0, limit);
}
