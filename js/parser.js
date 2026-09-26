// 単語帳テキストの読み取り。
// Excel / スプレッドシートからの貼り付け（タブ区切り）、CSV、Quizlet・Anki の書き出し、
// 「apple - りんご」「apple りんご」のようなメモ形式に対応する。

export const DELIMITER_OPTIONS = [
  { id: 'auto', label: '自動で判定' },
  { id: '\t', label: 'タブ（Excel・スプレッドシート）' },
  { id: ',', label: 'カンマ（CSV）' },
  { id: ';', label: 'セミコロン' },
  { id: ' - ', label: 'ハイフン（apple - りんご）' },
  { id: ':', label: 'コロン（apple: りんご）' },
  { id: 'smart', label: 'スペース（apple りんご）' },
  { id: 'block', label: '空行で区切ったまとまり' },
  { id: 'alternate', label: '1行ずつ交互（単語→意味→単語…）' },
];

const CHAR_DELIMITERS = ['\t', ',', ';', '|'];

const LINE_SPLITTERS = {
  ' - ': /\s+[-–—−]+\s+/,
  ':': /\s*[:：]\s*/,
  '=': /\s*[=＝]\s*/,
  '　': /　+/,
};

// 行の中で最初に現れた区切りを投票する候補（優先順）
const VOTE_CANDIDATES = ['\t', ',', ';', '|', ' - ', ':', '=', '　'];

const TERM_CHARS = '[\\x20-\\x7E\\u00A0-\\u024F\\u2018-\\u201F]';
const LATIN_THEN_OTHER = new RegExp(`^(${TERM_CHARS}*[A-Za-z]${TERM_CHARS}*?)\\s*([^\\x00-\\x7F\\u00A0-\\u024F\\u2018-\\u201F\\s][\\s\\S]*)$`);
const OTHER_THEN_LATIN = new RegExp(`^([^\\x00-\\x7F][\\s\\S]*?)\\s+([A-Za-z]${TERM_CHARS}*)$`);

const HEADER_KEYWORDS = {
  number: { exact: ['no', 'no.', '#', 'id', 'num', 'number'], includes: ['番号'] },
  term: {
    exact: ['word', 'words', 'term', 'front', 'english', 'vocabulary', 'vocab', 'question', 'headword', 'expression'],
    includes: ['単語', '英語', '見出し', '問題', '表面', 'おもて'],
  },
  meaning: {
    exact: ['meaning', 'meanings', 'definition', 'back', 'japanese', 'answer', 'translation'],
    includes: ['意味', '和訳', '訳', '日本語', '裏', '答え', 'うら'],
  },
  example: { exact: ['example', 'examples', 'sentence', 'usage'], includes: ['例文', '用例'] },
  note: { exact: ['note', 'notes', 'memo', 'comment', 'pos', 'tags'], includes: ['メモ', '備考', '品詞', '補足', '注'] },
};

export function decodeBytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    // 日本語版 Excel で保存した CSV は Shift_JIS のことが多い
    try {
      return new TextDecoder('shift_jis').decode(bytes);
    } catch {
      return new TextDecoder('utf-8').decode(bytes);
    }
  }
}

function normalizeInput(text) {
  return String(text ?? '')
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter((line) => !/^#(separator|html|tags|columns|notetype|deck|guid)\b.*:/i.test(line.trim()))
    .join('\n');
}

function cleanCell(value) {
  let s = String(value ?? '');
  if (/<\/?[a-z][^>]*>/i.test(s)) {
    s = s
      .replace(/<br\s*\/?>/gi, ' / ')
      .replace(/<\/(div|p|li)>\s*<(div|p|li)[^>]*>/gi, ' / ')
      .replace(/<\/?[a-z][^>]*>/gi, '');
  }
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t ]+/g, ' ')
    .trim();
}

// 引用符に対応した区切り文字パーサー（CSV / TSV）
export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  let atCellStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && atCellStart) {
      quoted = true;
      atCellStart = false;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
      atCellStart = true;
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      atCellStart = true;
    } else {
      if (!(atCellStart && ch === ' ')) atCellStart = false;
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function splitFirst(line, pattern) {
  const m = pattern.exec(line);
  if (!m || m.index === 0) return [line];
  return [line.slice(0, m.index), line.slice(m.index + m[0].length)];
}

function firstDelimiterIn(line) {
  let best = null;
  let bestIndex = Infinity;
  for (const d of VOTE_CANDIDATES) {
    const pattern = LINE_SPLITTERS[d];
    const index = pattern ? (pattern.exec(line)?.index ?? -1) : line.indexOf(d);
    if (index > 0 && index < bestIndex) {
      best = d;
      bestIndex = index;
    }
  }
  return best;
}

// 1行ずつ、いちばん自然な区切り方を探す
export function splitSmart(line) {
  const s = line.trim();
  if (!s) return [];
  if (s.includes('\t')) return s.split('\t');
  let best = null;
  for (const d of [' - ', ':', '=', '　']) {
    const m = LINE_SPLITTERS[d].exec(s);
    if (m && m.index > 0 && (!best || m.index < best.index)) best = { index: m.index, length: m[0].length };
  }
  if (best) return [s.slice(0, best.index), s.slice(best.index + best.length)];
  let m = LATIN_THEN_OTHER.exec(s);
  if (m) return [m[1], m[2]];
  m = OTHER_THEN_LATIN.exec(s);
  if (m) return [m[1], m[2]];
  if (s.includes(',')) return splitFirst(s, /\s*,\s*/);
  const wide = splitFirst(s, /\s{2,}/);
  if (wide.length > 1) return wide;
  return [s];
}

function nonBlankLines(text) {
  return text.split('\n').filter((l) => l.trim());
}

export function detectDelimiter(text) {
  const lines = nonBlankLines(text).slice(0, 300);
  if (!lines.length) return 'smart';
  const votes = new Map();
  for (const line of lines) {
    const d = firstDelimiterIn(line.trim());
    if (d) votes.set(d, (votes.get(d) || 0) + 1);
  }
  let best = null;
  let bestVotes = 0;
  for (const d of VOTE_CANDIDATES) {
    const v = votes.get(d) || 0;
    if (v > bestVotes) {
      best = d;
      bestVotes = v;
    }
  }
  if (best && bestVotes >= lines.length * 0.6) return best;

  const smartOk = lines.filter((l) => splitSmart(l).filter((c) => c.trim()).length >= 2).length;
  if (smartOk >= lines.length * 0.6) return 'smart';

  const blocks = text.split(/\n\s*\n/).map(nonBlankLines).filter((b) => b.length);
  if (blocks.length >= 2 && blocks.filter((b) => b.length >= 2 && b.length <= 5).length >= blocks.length * 0.8) {
    return 'block';
  }
  if (lines.length >= 2 && lines.length % 2 === 0 && smartOk < lines.length * 0.3) return 'alternate';
  return best || 'smart';
}

function classifyHeader(cell) {
  const raw = String(cell ?? '').trim().toLowerCase();
  if (!raw || raw.length > 20) return null;
  const word = raw.replace(/[()（）\[\]「」:：]/g, '').trim();
  for (const [kind, { exact, includes }] of Object.entries(HEADER_KEYWORDS)) {
    if (exact.includes(word) || exact.includes(raw)) return kind;
    if (includes.some((k) => raw.includes(k))) return kind;
  }
  return null;
}

function detectHeader(row) {
  const kinds = row.map(classifyHeader);
  const known = kinds.filter(Boolean);
  if (known.length < 2 || !(kinds.includes('term') || kinds.includes('meaning'))) return null;
  const map = {};
  kinds.forEach((kind, i) => {
    if (kind && kind !== 'number' && map[kind] === undefined) map[kind] = i;
  });
  const free = row.map((_, i) => i).filter((i) => !kinds[i]);
  if (map.term === undefined) map.term = free.shift() ?? -1;
  if (map.meaning === undefined) map.meaning = free.shift() ?? -1;
  return map;
}

const NUMBERING = /^\s*\d{1,5}(?:\s*[.)．、:：]\s*|\s+)(?=\S)/;

function rowsFromText(text, delimiter) {
  if (CHAR_DELIMITERS.includes(delimiter)) return parseDelimited(text, delimiter);

  let lines = nonBlankLines(text);
  if (delimiter === 'block') {
    return text
      .split(/\n\s*\n/)
      .map(nonBlankLines)
      .filter((b) => b.length)
      .map((b) => [b[0], b[1] ?? '', b[2] ?? '', b.slice(3).join(' / ')]);
  }
  if (lines.length && lines.filter((l) => NUMBERING.test(l)).length >= lines.length * 0.8) {
    lines = lines.map((l) => l.replace(NUMBERING, ''));
  }
  if (delimiter === 'alternate') {
    const rows = [];
    for (let i = 0; i < lines.length; i += 2) rows.push([lines[i], lines[i + 1] ?? '']);
    return rows;
  }
  if (delimiter === 'smart') return lines.map(splitSmart);
  const pattern = LINE_SPLITTERS[delimiter];
  if (pattern) return lines.map((l) => splitFirst(l, pattern));
  return lines.map((l) => splitFirst(l, new RegExp(escapeRegExp(delimiter))));
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @returns {{ entries: {term:string, meaning:string, example:string, note:string}[],
 *   skipped: string[], delimiter: string, hasHeader: boolean }}
 */
export function parseWordList(input, { delimiter = 'auto', swap = false } = {}) {
  const text = normalizeInput(input);
  const used = delimiter === 'auto' ? detectDelimiter(text) : delimiter;
  let rows = rowsFromText(text, used)
    .map((r) => r.map(cleanCell))
    .filter((r) => r.some(Boolean));

  let map = { term: 0, meaning: 1, example: 2, note: 3 };
  let hasHeader = false;
  if (rows.length) {
    const header = detectHeader(rows[0]);
    if (header) {
      map = header;
      hasHeader = true;
      rows = rows.slice(1);
    }
  }

  // 先頭列が通し番号だけなら読み飛ばす
  if (!hasHeader && rows.length) {
    const numbered = rows.filter((r) => r.length >= 3 && /^\d{1,6}$/.test(r[0])).length;
    if (numbered >= rows.length * 0.8) rows = rows.map((r) => r.slice(1));
  }

  const entries = [];
  const skipped = [];
  for (const row of rows) {
    let term = row[map.term] ?? '';
    let meaning = row[map.meaning] ?? '';
    if (swap) [term, meaning] = [meaning, term];
    if (!term || !meaning) {
      skipped.push(row.filter(Boolean).join(' '));
      continue;
    }
    entries.push({
      term,
      meaning,
      example: map.example === undefined ? '' : row[map.example] ?? '',
      note: map.note === undefined ? '' : row[map.note] ?? '',
    });
  }
  return { entries, skipped, delimiter: used, hasHeader };
}

export function delimiterLabel(id) {
  return DELIMITER_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

// CSV 書き出し（Excel で文字化けしないよう BOM を付けるのは呼び出し側）
export function toCSV(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n\r]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(','),
    )
    .join('\r\n');
}
