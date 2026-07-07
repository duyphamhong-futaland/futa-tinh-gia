/* FUTA Land — Công cụ tính giá · Service Worker (chạy offline trên điện thoại)
   Cache app shell lần đầu → mở lại KHÔNG cần mạng. Đổi CACHE khi cập nhật file. */
const CACHE = 'futa-pricing-v4';
const ASSETS = [
  './', 'index.html', 'css/style.css',
  'js/config.js', 'js/pricing.js', 'js/policies.js', 'js/data.js',
  'js/datastore.js', 'js/export-xlsx.js', 'js/manage.js', 'js/app.js',
  'vendor/exceljs.min.js',
  'img/logo-futa-land-trans.png', 'img/watermark-futa.png', 'img/favicon.png',
  'img/icon-192.png', 'img/icon-512.png', 'img/apple-touch-icon.png',
  'manifest.webmanifest'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      try { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } catch (x) {}
      return resp;
    }).catch(() => caches.match('index.html')))
  );
});
