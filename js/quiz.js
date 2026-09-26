// 4択クイズの選択肢づくり。
// ただのランダムではなく「前にまちがえた相手」「つづりが似た単語」「語尾が同じ意味（〜する 等）」を
// 混ぜて、品詞や見た目だけで当てられないようにする。

import { looksSimilar, normalizeText, shuffle } from './util.js';

function tail(text, n = 2) {
  const s = normalizeText(text);
  return s.length > n ? s.slice(-n) : s;
}

export function pickDirection(setting, rng = Math.random) {
  if (setting === 'meaning') return 'meaning';
  if (setting === 'mix') return rng() < 0.5 ? 'term' : 'meaning';
  return 'term';
}

/**
 * @param word 出題する単語
 * @param pool 選択肢の候補になる単語
 * @param direction 'term'（単語を見て意味を選ぶ）| 'meaning'（意味を見て単語を選ぶ）
 * @param confusions この単語の取り違え履歴 { otherId: 回数 }
 */
export function buildQuestion(word, pool, { direction = 'term', count = 4, confusions = {}, rng = Math.random } = {}) {
  const field = direction === 'term' ? 'meaning' : 'term';
  const answerText = normalizeText(word[field]);
  const answerLength = String(word[field]).length;

  const candidates = [];
  const seenText = new Set([answerText]);
  for (const other of pool) {
    if (other.id === word.id) continue;
    const text = normalizeText(other[field]);
    if (!text || seenText.has(text)) continue;
    seenText.add(text);
    let score = rng() * 2;
    if (confusions[other.id]) score += 3 + Math.min(2, confusions[other.id]);
    if (looksSimilar(other.term, word.term)) score += 2.5;
    if (tail(other[field]) === tail(word[field])) score += 1.2;
    score += 1 - Math.min(1, Math.abs(String(other[field]).length - answerLength) / 12);
    candidates.push({ other, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const distractors = candidates.slice(0, count - 1).map((c) => c.other);

  const options = shuffle([word, ...distractors], rng).map((w) => ({ id: w.id, text: w[field] }));
  return {
    wordId: word.id,
    direction,
    prompt: direction === 'term' ? word.term : word.meaning,
    answer: word[field],
    options,
    correctIndex: options.findIndex((o) => o.id === word.id),
  };
}
