// 小さな共通ヘルパー。DOM に触る関数はブラウザ専用、それ以外は Node のテストからも使う。

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

// ローカル日付の "YYYY-MM-DD"
export function dayKey(time = Date.now()) {
  const d = new Date(time);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function startOfDay(time = Date.now()) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 今日を0として何日前か（ローカル日付で数える） */
export function daysAgo(time, now = Date.now()) {
  return Math.round((startOfDay(now) - startOfDay(time)) / DAY);
}

export function agoLabel(time, now = Date.now()) {
  if (!time) return '';
  const n = daysAgo(time, now);
  if (n <= 0) return '今日';
  if (n === 1) return '昨日';
  return `${n}日前`;
}

export function normalizeText(s) {
  return String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// 決定的な乱数（テスト用）
export function seededRandom(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function levenshtein(a, b, max = Infinity) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      rowMin = Math.min(rowMin, cur[j]);
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// つづりが似ているか（adapt / adopt, affect / effect など）
export function looksSimilar(a, b) {
  const x = normalizeText(a);
  const y = normalizeText(b);
  if (!x || !y || x === y) return false;
  const len = Math.max(x.length, y.length);
  if (len < 4) return false;
  const max = len <= 6 ? 1 : 2;
  return levenshtein(x, y, max) <= max;
}

export function relativeDays(time, now = Date.now()) {
  const days = Math.round((startOfDay(time) - startOfDay(now)) / DAY);
  if (days <= 0) return '今日';
  if (days === 1) return '明日';
  if (days < 30) return `${days}日後`;
  if (days < 365) return `${Math.round(days / 30)}か月後`;
  return `${Math.round(days / 365)}年後`;
}

// ---- DOM ヘルパー（ブラウザ専用） ----

export function el(tag, props, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'html') node.innerHTML = value; // 固定の SVG アイコンなど、信頼できる文字列だけに使う
    else if (key === 'value' || key === 'checked') node[key] = value;
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else node.append(child instanceof Node ? child : String(child));
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null) continue;
    node.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

export function downloadText(filename, text, type = 'text/plain') {
  try {
    const blob = new Blob([text], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text, fallbackInput) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackInput) {
      fallbackInput.focus();
      fallbackInput.select();
    }
    return false;
  }
}

export function vibrate(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* 非対応端末 */
  }
}
