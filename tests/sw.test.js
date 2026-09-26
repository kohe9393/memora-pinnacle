import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

test('Service Worker がアプリのファイルをすべてキャッシュする（オフライン対応）', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const needed = [...files(join(root, 'js')), ...files(join(root, 'css'))].map((p) => `./${relative(root, p)}`);
  for (const path of needed) assert.ok(sw.includes(`'${path}'`), `${path} が sw.js の ASSETS にありません`);
});
