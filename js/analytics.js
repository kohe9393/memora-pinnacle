// 学習データの集計（ホーム・分析画面で使う）

import { DAY, dayKey, looksSimilar, startOfDay } from './util.js';
import { status } from './srs.js';

export function overview(words, getState, daily = {}, now = Date.now()) {
  const counts = { new: 0, review: 0, weak: 0, learned: 0 };
  let correct = 0;
  let answers = 0;
  let miss = 0;
  let slow = 0;
  for (const word of words) {
    const s = getState(word.id);
    counts[status(s)] += 1;
    if (s?.seen) {
      correct += s.correct;
      answers += s.seen;
      if (s.weak === 'miss') miss += 1;
      if (s.weak === 'slow') slow += 1;
    }
  }
  const total = words.length;
  const studied = total - counts.new;
  const today = daily[dayKey(now)] || {};
  return {
    total,
    studied,
    counts,
    completion: total ? studied / total : 0,
    answers,
    accuracy: answers ? correct / answers : null,
    miss,
    slow,
    streak: streakDays(daily, now),
    today: { answers: today.a || 0, correct: today.c || 0, words: (today.u || []).length, learned: today.g || 0 },
  };
}

/** 今日（まだなら昨日）から途切れずに学習した日数 */
export function streakDays(daily = {}, now = Date.now()) {
  let t = now;
  if (!daily[dayKey(t)]?.a) t -= DAY;
  let days = 0;
  while (daily[dayKey(t)]?.a) {
    days += 1;
    t -= DAY;
  }
  return days;
}

export const CAL_METRICS = {
  answers: { label: '回答数', value: (d) => d?.a || 0 },
  learned: { label: '覚えた単語', value: (d) => d?.g || 0 },
  missed: { label: '間違えた単語', value: (d) => (d?.m || []).length },
};

/** 月曜はじまりの月カレンダー。空白のマスは null */
export function monthGrid(year, month, daily = {}, now = Date.now()) {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(now);
  const cells = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++) {
    const time = new Date(year, month, d).getTime();
    const key = dayKey(time);
    cells.push({ day: d, key, time, today: time === today, future: time > today, data: daily[key] || null });
  }
  return cells;
}

/** 表示する月（今月から過去へ count か月） */
export function recentMonths(count = 3, now = Date.now()) {
  const d = new Date(now);
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ year: m.getFullYear(), month: m.getMonth() });
  }
  return out;
}

/** 苦手の内訳 */
export function weakBreakdown(words, getState) {
  const out = { miss: 0, slow: 0, over: 0, lapse: 0, similar: 0 };
  const weakWords = [];
  for (const word of words) {
    const s = getState(word.id);
    if (!s?.weak) continue;
    weakWords.push(word);
    if (s.weak === 'miss') out.miss += 1;
    if (s.weak === 'slow') out.slow += 1;
    if (s.over > 0) out.over += 1;
    if (s.lapses > 0) out.lapse += 1;
  }
  out.similar = weakWords.filter((w) => words.some((o) => o.id !== w.id && looksSimilar(o.term, w.term))).length;
  return out;
}

/** 4択で取り違えた組み合わせ（A→B と B→A はまとめる） */
export function confusionPairs(words, getState, { limit = 10 } = {}) {
  const ids = new Set(words.map((w) => w.id));
  const byId = new Map(words.map((w) => [w.id, w]));
  const pairs = new Map();
  for (const word of words) {
    const conf = getState(word.id)?.conf || {};
    for (const [otherId, n] of Object.entries(conf)) {
      if (!ids.has(otherId)) continue;
      const key = [word.id, otherId].sort().join('|');
      pairs.set(key, (pairs.get(key) || 0) + n);
    }
  }
  return [...pairs.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split('|');
      return { a: byId.get(a), b: byId.get(b), count };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, limit);
}
