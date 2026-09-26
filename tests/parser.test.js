import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBytes, detectDelimiter, parseDelimited, parseWordList, splitSmart, toCSV } from '../js/parser.js';

const pairs = (result) => result.entries.map((e) => [e.term, e.meaning]);

test('Excel などから貼り付けたタブ区切り', () => {
  const r = parseWordList('apple\tりんご\nbanana\tバナナ\n');
  assert.equal(r.delimiter, '\t');
  assert.deepEqual(pairs(r), [
    ['apple', 'りんご'],
    ['banana', 'バナナ'],
  ]);
});

test('CSV: 引用符・カンマ入りの意味・例文列', () => {
  const r = parseWordList('abandon,"捨てる, 見捨てる",He abandoned the plan.\r\nacquire,獲得する,');
  assert.equal(r.delimiter, ',');
  assert.deepEqual(pairs(r), [
    ['abandon', '捨てる, 見捨てる'],
    ['acquire', '獲得する'],
  ]);
  assert.equal(r.entries[0].example, 'He abandoned the plan.');
});

test('CSV: 改行を含むセルと "" のエスケープ', () => {
  const rows = parseDelimited('a,"line1\nline2"\nb,"say ""hi"""', ',');
  assert.deepEqual(rows, [
    ['a', 'line1\nline2'],
    ['b', 'say "hi"'],
  ]);
});

test('見出し行を判定して列を並べ替える', () => {
  const r = parseWordList('No.,意味,英単語,例文\n1,りんご,apple,I ate an apple.\n2,走る,run,');
  assert.equal(r.hasHeader, true);
  assert.deepEqual(pairs(r), [
    ['apple', 'りんご'],
    ['run', '走る'],
  ]);
  assert.equal(r.entries[0].example, 'I ate an apple.');
});

test('通し番号の列は読み飛ばす', () => {
  const r = parseWordList('1,apple,りんご\n2,banana,バナナ\n3,cherry,さくらんぼ');
  assert.deepEqual(pairs(r)[0], ['apple', 'りんご']);
});

test('「apple - りんご」「apple: りんご」形式', () => {
  assert.deepEqual(pairs(parseWordList('take off - 離陸する, 脱ぐ\nwell-known - よく知られた')), [
    ['take off', '離陸する, 脱ぐ'],
    ['well-known', 'よく知られた'],
  ]);
  const colon = parseWordList('apple: りんご, 林檎\nbanana：バナナ');
  assert.equal(colon.delimiter, ':');
  assert.deepEqual(pairs(colon), [
    ['apple', 'りんご, 林檎'],
    ['banana', 'バナナ'],
  ]);
});

test('スペースだけで区切ったメモ（英語と日本語の境目で分ける）', () => {
  const r = parseWordList('give up 諦める\nlook forward to ~ing ～を楽しみに待つ\ncafé カフェ\napple　りんご');
  assert.deepEqual(pairs(r), [
    ['give up', '諦める'],
    ['look forward to ~ing', '～を楽しみに待つ'],
    ['café', 'カフェ'],
    ['apple', 'りんご'],
  ]);
});

test('番号付きリストの番号を外す', () => {
  const r = parseWordList('1. abandon 捨てる\n2. ability 能力\n3) absorb 吸収する');
  assert.deepEqual(pairs(r), [
    ['abandon', '捨てる'],
    ['ability', '能力'],
    ['absorb', '吸収する'],
  ]);
});

test('空行で区切ったまとまり', () => {
  const r = parseWordList('apple\nりんご\nI like apples.\n\nbanana\nバナナ\n');
  assert.equal(r.delimiter, 'block');
  assert.deepEqual(pairs(r), [
    ['apple', 'りんご'],
    ['banana', 'バナナ'],
  ]);
  assert.equal(r.entries[0].example, 'I like apples.');
});

test('1行ずつ交互', () => {
  const r = parseWordList('apple\nりんご\nbanana\nバナナ');
  assert.equal(r.delimiter, 'alternate');
  assert.deepEqual(pairs(r), [
    ['apple', 'りんご'],
    ['banana', 'バナナ'],
  ]);
});

test('Anki の書き出し（メタ行・HTML）', () => {
  const r = parseWordList('#separator:tab\n#html:true\nrun\t走る<br>運営する\nset\t<b>置く</b>&nbsp;');
  assert.deepEqual(pairs(r), [
    ['run', '走る / 運営する'],
    ['set', '置く'],
  ]);
});

test('意味がない行はスキップして数える', () => {
  const r = parseWordList('apple\tりんご\nbanana\n\tだけ');
  assert.equal(r.entries.length, 1);
  assert.equal(r.skipped.length, 2);
});

test('単語と意味の入れ替え', () => {
  const r = parseWordList('りんご,apple', { swap: true });
  assert.deepEqual(pairs(r), [['apple', 'りんご']]);
});

test('区切りを手動で指定', () => {
  const r = parseWordList('a;b\nc;d', { delimiter: ';' });
  assert.deepEqual(pairs(r), [
    ['a', 'b'],
    ['c', 'd'],
  ]);
});

test('splitSmart は日本語が先でも分けられる', () => {
  assert.deepEqual(splitSmart('りんご apple'), ['りんご', 'apple']);
});

test('detectDelimiter: カンマよりも先に出る区切りを優先', () => {
  assert.equal(detectDelimiter('apple\tりんご, 林檎\nbanana\tバナナ'), '\t');
});

test('文字コード: UTF-8 / BOM / Shift_JIS / UTF-16', () => {
  const utf8 = new TextEncoder().encode('apple,りんご');
  assert.equal(decodeBytes(utf8), 'apple,りんご');
  assert.equal(decodeBytes(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])), 'apple,りんご');
  // 「りんご」の Shift_JIS
  const sjis = new Uint8Array([0x61, 0x2c, 0x82, 0xe8, 0x82, 0xf1, 0x82, 0xb2]);
  assert.equal(decodeBytes(sjis), 'a,りんご');
  const utf16 = new Uint8Array([0xff, 0xfe, 0x61, 0x00, 0x09, 0x00, 0x42, 0x30]);
  assert.equal(decodeBytes(utf16), 'a\tあ');
});

test('toCSV はカンマや引用符をエスケープし、読み戻せる', () => {
  const csv = toCSV([
    ['単語', '意味'],
    ['abandon', '捨てる, 見捨てる'],
    ['say', 'He said "hi"'],
  ]);
  const back = parseWordList(csv);
  assert.deepEqual(pairs(back), [
    ['abandon', '捨てる, 見捨てる'],
    ['say', 'He said "hi"'],
  ]);
});
