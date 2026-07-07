/* FUTA Land — Công cụ tính giá · Service Worker (chạy offline trên điện thoại)
   Chiến lược: HTML/JS/CSS = network-first (online luôn lấy bản MỚI, offline fallback cache);
   ảnh/vendor/manifest = cache-first. Đổi CACHE khi cập nhật file. */
const CACHE = 'futa-pricing-v10';
const ASSETS = [
  './', 'index.html', 'css/style.css?v=10',
  'js/config.js?v=10', 'js/pricing.js?v=10', 'js/policies.js?v=10', 'js/data.js?v=10',
  'js/datastore.js?v=10', 'js/export-xlsx.js?v=10', 'js/manage.js?v=10', 'js/app.js?v=10',
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
  const url = new URL(e.request.url);
  const isDoc = e.request.mode === 'navigate' || url.pathname === '/' || /\/(index\.html)?$/.test(url.pathname);
  const isCode = /\.(js|css)$/.test(url.pathname);
  // Mã nguồn (HTML/JS/CSS) cùng origin → network-first: luôn ưu tiên bản mới, offline mới lấy cache
  if (url.origin === location.origin && (isDoc || isCode)) {
    e.respondWith(
      fetch(e.request).then(resp => {
        try { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } catch (x) {}
        return resp;
      }).catch(() => caches.match(e.request).then(hit => hit || caches.match('index.html')))
    );
    return;
  }
  // Còn lại (ảnh/vendor/manifest) → cache-first cho nhanh + offline
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
      try { const cp = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } catch (x) {}
      return resp;
    }).catch(() => caches.match('index.html')))
  );
});
