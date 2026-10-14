/* FUTA Land — Xoá nhãn AI · phần riêng của tiện ích Chrome/Edge
   Nhận ảnh từ menu chuột phải (background.js đẩy vào chrome.storage.session) → tải ảnh về → đưa vào công cụ.
   Trang web chặn tải chéo (CORS) → xin quyền đọc ảnh đúng tên miền đó, chỉ khi người dùng bấm đồng ý. */
(function () {
  'use strict';
  const app = window.RemoveAIApp;
  const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/heic': 'heic', 'image/bmp': 'bmp' };
  let draining = false;

  /* ---- Thông báo ngay trên khung công cụ ---- */
  const box = document.createElement('div');
  box.id = 'extMsg';
  box.setAttribute('role', 'status');
  document.querySelector('.tool').prepend(box);
  function show(text, kind, buttons) {
    const row = document.createElement('div');
    row.className = 'ext-msg ' + (kind || '');
    const p = document.createElement('span'); p.textContent = text; row.appendChild(p);
    for (const [label, fn, primary] of buttons || []) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn sm ' + (primary ? 'primary' : 'ghost'); b.textContent = label;
      b.addEventListener('click', () => fn(row));
      row.appendChild(b);
    }
    box.appendChild(row);
    return row;
  }

  function fileName(url, type) {
    let n = '';
    try { const u = new URL(url); if (/^https?:$/.test(u.protocol)) n = decodeURIComponent(u.pathname.split('/').pop() || ''); } catch (e) { /* bỏ qua */ }
    n = n.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(-120) || 'anh-tu-web';
    if (!/\.(jpe?g|png|webp|gif|avif|heic|heif|bmp|tiff?)$/i.test(n)) n += '.' + (TYPES[type] || 'jpg');
    return n;
  }
  async function grab(url, withCookies) {
    const r = await fetch(url, { credentials: withCookies ? 'include' : 'omit' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    if (!blob.size) throw new Error('EMPTY');
    return new File([blob], fileName(url, blob.type), { type: blob.type });
  }
  const host = url => { try { return new URL(url).host; } catch (e) { return ''; } };

  async function take(item) {
    const url = item.url;
    if (url.startsWith('blob:')) {
      show('Ảnh này được trang web tạo tạm (blob) nên tiện ích không đọc được. Hãy lưu ảnh về máy rồi kéo thả vào đây.', 'warn');
      return;
    }
    try { app.addFiles([await grab(url, false)]); return; } catch (e) { /* có thể bị CORS chặn → thử với quyền */ }
    if (!/^https?:/.test(url)) { show('Không tải được ảnh này. Hãy lưu ảnh về máy rồi kéo thả vào đây.', 'warn'); return; }
    const origins = [new URL(url).origin + '/*'];
    if (await chrome.permissions.contains({ origins })) {
      try { app.addFiles([await grab(url, true)]); } catch (e) { show('Không tải được ảnh từ ' + host(url) + ' (' + e.message + '). Hãy lưu ảnh về máy rồi kéo thả vào đây.', 'warn'); }
      return;
    }
    show('Trang ' + host(url) + ' không cho tải ảnh trực tiếp. Cho phép tiện ích đọc ảnh từ tên miền này?', '', [
      ['Cho phép & tải ảnh', async row => {
        let ok = false;
        try { ok = await chrome.permissions.request({ origins }); } catch (e) { /* bỏ qua */ }
        row.remove();
        if (!ok) { show('Chưa được cấp quyền — hãy lưu ảnh về máy rồi kéo thả vào đây.', 'warn'); return; }
        try { app.addFiles([await grab(url, true)]); } catch (e) { show('Vẫn không tải được ảnh (' + e.message + '). Hãy lưu ảnh về máy rồi kéo thả vào đây.', 'warn'); }
      }, true],
      ['Bỏ qua', row => row.remove()],
    ]);
  }

  async function drain() {
    if (draining) return;
    draining = true;
    try {
      for (;;) {
        const { queue = [] } = await chrome.storage.session.get('queue');
        if (!queue.length) break;
        await chrome.storage.session.set({ queue: [] });
        for (const item of queue) await take(item);
      }
    } finally { draining = false; }
  }

  chrome.storage.onChanged.addListener((changes, area) => { if (area === 'session' && changes.queue) drain(); });
  drain();
})();
