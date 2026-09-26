// オフラインでも開けるようにするための Service Worker。
// ファイルを変更したら CACHE の番号を上げると、次回起動時に新しい版へ入れ替わる。

const CACHE = 'mekuru-v4';
const FONT_CACHE = 'mekuru-fonts-v1';

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './icons/icon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/analytics.js',
  './js/app.js',
  './js/icons.js',
  './js/parser.js',
  './js/queue.js',
  './js/quiz.js',
  './js/sample.js',
  './js/session.js',
  './js/speech.js',
  './js/srs.js',
  './js/store.js',
  './js/swipe.js',
  './js/ui.js',
  './js/util.js',
  './js/views/analysis.js',
  './js/views/clear.js',
  './js/views/common.js',
  './js/views/deck.js',
  './js/views/home.js',
  './js/views/import.js',
  './js/views/library.js',
  './js/views/quiz.js',
  './js/views/settings.js',
  './js/views/study.js',
  './js/views/weak.js',
  './js/views/word-sheet.js',
];

self.addEventListener('install', (event) => {
  // ブラウザのHTTPキャッシュを通さず、必ず最新のファイルを取りにいく
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Google Fonts：一度読んだらキャッシュから
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.open(FONT_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok || res.type === 'opaque') cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // アプリ本体：つながっていれば最新版を取り、オフラインのときだけ保存した版を使う
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(request, { cache: 'no-cache' });
        if (res.ok) cache.put(request, res.clone());
        return res;
      } catch {
        const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
        return cached || (request.mode === 'navigate' && (await cache.match('./index.html'))) || Response.error();
      }
    }),
  );
});
