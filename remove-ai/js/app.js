/* FUTA Land — Xoá nhãn AI khỏi ảnh · giao diện
   Đọc ảnh → AIMeta.analyze (phát hiện) → AIMeta.strip (cắt metadata) hoặc vẽ lại bằng canvas
   → kiểm tra lại file kết quả → tải từng ảnh / cả gói ZIP. Mọi thứ chạy cục bộ trong trình duyệt. */
(function () {
  'use strict';
  const M = window.AIMeta;
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX = 100 * 1024 * 1024;
  const IMG_EXT = /\.(jpe?g|jfif|png|apng|webp|gif|avif|heic|heif|bmp|tiff?)$/i;
  const items = [];
  let seq = 0, queue = Promise.resolve();

  /* ---------- Tuỳ chọn (nhớ trên trình duyệt) ---------- */
  const KEY = 'futa-remove-ai-opts';
  function readOpts() {
    return {
      mode: document.querySelector('input[name=mode]:checked').value,
      fmt: $('#fmt').value, quality: +$('#q').value,
      keepOrientation: $('#keepOri').checked, keepIcc: $('#keepIcc').checked,
      naming: $('#naming').value,
    };
  }
  function setSel(sel, v) { if (v != null && [...sel.options].some(o => o.value === String(v))) sel.value = v; }
  function loadOpts() {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* bỏ qua */ }
    if (!o) return;
    const r = document.querySelector('input[name=mode][value="' + o.mode + '"]'); if (r) r.checked = true;
    setSel($('#fmt'), o.fmt); setSel($('#naming'), o.naming);
    if (o.quality >= 60 && o.quality <= 100) $('#q').value = o.quality;
    if (typeof o.keepOrientation === 'boolean') $('#keepOri').checked = o.keepOrientation;
    if (typeof o.keepIcc === 'boolean') $('#keepIcc').checked = o.keepIcc;
  }
  function syncOptsUi() {
    const o = readOpts(), re = o.mode === 'reencode';
    $('#reOpts').hidden = !re;
    $('#qv').textContent = o.quality;
    for (const id of ['#keepOri', '#keepIcc']) {
      $(id).disabled = re;
      $(id).parentElement.title = re ? 'Khi vẽ lại, ảnh luôn được xoay đúng chiều và chuyển về hệ màu sRGB' : '';
    }
    try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* bỏ qua */ }
  }

  /* ---------- Thêm ảnh ---------- */
  function randName() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return 'IMG_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '_' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) +
      '_' + String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }
  function enqueue(fn) { queue = queue.then(fn).catch(() => {}); }

  function addFiles(list) {
    const files = Array.from(list || []).filter(f => f && ((f.type || '').startsWith('image/') || IMG_EXT.test(f.name || '')));
    for (const file of files) {
      const it = { id: ++seq, file, name: file.name || 'anh-dan-' + seq + '.png', size: file.size, status: 'reading', rand: randName() };
      items.push(it); render(it);
      enqueue(async () => {
        try { await load(it); } catch (e) { it.status = 'error'; it.error = msg(e); render(it); renderBar(); return; }
        await process(it);
      });
    }
    renderBar();
  }

  async function load(it) {
    if (it.size > MAX) throw new Error('TOO_BIG');
    it.bytes = new Uint8Array(await it.file.arrayBuffer());
    it.before = await M.analyze(it.bytes);
    it.format = it.before.format;
    it.srcUrl = URL.createObjectURL(new Blob([it.bytes], { type: M.MIME[it.format] || it.file.type || 'application/octet-stream' }));
  }

  /* ---------- Xử lý ---------- */
  async function process(it) {
    if (it.removed || !it.bytes) return;
    const o = readOpts();
    it.status = 'working'; render(it);
    try {
      let bytes, mime, note = '';
      const lossless = o.mode === 'lossless' && M.canStrip(it.format);
      if (lossless) {
        bytes = M.strip(it.bytes, o); mime = M.MIME[it.format];
      } else {
        const opt = o.mode === 'lossless' ? Object.assign({}, o, { fmt: 'keep' }) : o;
        if (o.mode === 'lossless') note = 'Định dạng ' + (M.NAME[it.format] || 'này') + ' không cắt metadata trực tiếp được — đã vẽ lại ảnh.';
        const r = await reencode(it, opt);
        bytes = r.bytes; mime = r.mime; if (r.note) note = (note ? note + ' ' : '') + r.note;
      }
      const after = await M.analyze(bytes), ext = M.EXT[after.format] || 'jpg';
      if (it.outUrl) URL.revokeObjectURL(it.outUrl);
      it.out = { bytes, mime, size: bytes.length, after, note, ext, name: outName(it, ext, o.naming) };
      it.outUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
      it.status = 'done'; it.error = '';
    } catch (e) {
      it.status = 'error'; it.error = msg(e);
    }
    render(it); renderBar();
  }

  function decode(it) {
    const fromImg = () => new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => rej(new Error(it.format === 'heic' ? 'HEIC' : 'DECODE'));
      img.src = it.srcUrl;
    });
    if (!window.createImageBitmap) return fromImg();
    const blob = new Blob([it.bytes], { type: M.MIME[it.format] || it.file.type || '' });
    // 'from-image' = áp dụng hướng xoay EXIF; trình duyệt cũ không hiểu tuỳ chọn này → dùng <img>
    return createImageBitmap(blob, { imageOrientation: 'from-image' }).catch(fromImg);
  }
  function hasAlpha(ctx, w, h) {
    try {
      const d = ctx.getImageData(0, 0, w, h).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    } catch (e) { /* bỏ qua */ }
    return false;
  }
  async function reencode(it, o) {
    const src = await decode(it);
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    let mime = o.fmt;
    if (mime === 'keep') {
      mime = { jpeg: 'image/jpeg', png: 'image/png', gif: 'image/png', bmp: 'image/png', webp: 'image/webp' }[it.format];
      if (!mime) { ctx.drawImage(src, 0, 0); mime = hasAlpha(ctx, w, h) ? 'image/png' : 'image/jpeg'; ctx.clearRect(0, 0, w, h); }
    }
    if (mime === 'image/jpeg') { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); }
    ctx.drawImage(src, 0, 0);
    if (src.close) src.close();
    const blob = await new Promise(r => cv.toBlob(r, mime, o.quality / 100));
    cv.width = cv.height = 0;
    if (!blob || !blob.size) throw new Error('CANVAS');
    const up = t => (t.split('/')[1] || '').toUpperCase().replace('JPEG', 'JPG');
    let note = blob.type !== mime ? 'Trình duyệt không xuất được ' + up(mime) + ' — đã lưu ' + up(blob.type) + '.' : '';
    if (it.format === 'gif') note = (note ? note + ' ' : '') + 'Vẽ lại GIF chỉ giữ khung hình đầu — dùng “Giữ nguyên chất lượng” để giữ ảnh động.';
    return { bytes: new Uint8Array(await blob.arrayBuffer()), mime: blob.type || mime, note };
  }

  function outName(it, ext, naming) {
    const base = it.name.replace(/\.[^.]+$/, '') || 'anh';
    if (naming === 'same') return base + '.' + ext;
    if (naming === 'random') return it.rand + '.' + ext;
    return base + '_clean.' + ext;
  }
  function msg(e) {
    const m = e && e.message;
    if (m === 'TOO_BIG') return 'File lớn hơn 100 MB — vượt giới hạn xử lý trên trình duyệt.';
    if (m === 'HEIC') return 'Trình duyệt này không đọc được ảnh HEIC. Hãy mở trang bằng Safari (iPhone/Mac) hoặc chuyển ảnh sang JPG trước.';
    if (m === 'DECODE') return 'Không giải mã được ảnh — file có thể bị hỏng hoặc trình duyệt không hỗ trợ định dạng này.';
    if (m === 'CANVAS') return 'Ảnh quá lớn để vẽ lại trên thiết bị này — hãy dùng chế độ “Giữ nguyên chất lượng”.';
    return 'Lỗi xử lý: ' + (m || e);
  }

  /* ---------- Hiển thị ---------- */
  const countOf = (a, lv) => a ? a.findings.filter(f => f.level === lv).length : 0;
  const realCount = a => a ? a.findings.filter(f => f.level !== 'info').length : 0;

  function chips(a) {
    const out = [], add = (t, cls) => { if (!out.some(c => c[0] === t)) out.push([t, cls]); };
    for (const f of a.findings) {
      if (f.level === 'ai') {
        if (f.label.startsWith('Dấu vết công cụ AI: ')) add(f.label.slice(f.label.indexOf(': ') + 2), 'ai');
        else if (f.label.startsWith('Content Credentials')) add('C2PA', 'ai');
        else if (f.label.startsWith('Nguồn ảnh:')) add('IPTC: ảnh AI', 'ai');
        else add('Prompt AI', 'ai');
      }
    }
    for (const f of a.findings) {
      if (f.level !== 'meta') continue;
      if (f.label.includes('GPS')) add('📍 GPS', '');
      else add(f.group.split(' · ')[0], '');
    }
    return out.slice(0, 9).map(([t, c]) => '<span class="tag ' + c + '">' + esc(t) + '</span>').join('');
  }
  function flist(a, after) {
    if (!a || !a.findings.length) return '<ul class="fl"><li class="none">✓ ' + (after ? 'Không còn metadata nào' : 'Không có metadata') + '</li></ul>';
    return '<ul class="fl">' + a.findings.map(f =>
      '<li class="' + f.level + '"><span class="g">' + esc(f.group) + '</span>' + esc(f.label) +
      (f.level === 'info' && after ? ' <em>(giữ lại)</em>' : '') +
      (f.detail ? '<small>' + esc(f.detail) + '</small>' : '') + '</li>').join('') + '</ul>';
  }
  function badges(it) {
    if (it.status === 'error') return '<span class="badge ai">Lỗi</span>';
    if (!it.before || it.status !== 'done') return '<span class="badge run">Đang xử lý…</span>';
    const b = it.before, a = it.out.after;
    let h = b.hasAi ? '<span class="badge ai">⚠ Phát hiện nhãn AI</span>'
      : realCount(b) ? '<span class="badge meta">Có metadata</span>' : '<span class="badge ok">Không có metadata</span>';
    if (a.hasAi) h += '<span class="arrow">→</span><span class="badge ai">Vẫn còn dấu vết AI</span>';
    else if (realCount(a)) h += '<span class="arrow">→</span><span class="badge meta">Còn ' + realCount(a) + ' mục</span>';
    else if (realCount(b)) h += '<span class="arrow">→</span><span class="badge ok">✓ Đã làm sạch</span>';
    return h;
  }

  function render(it) {
    let li = document.getElementById('it' + it.id);
    if (it.removed) { if (li) li.remove(); return; }
    if (!li) { li = document.createElement('li'); li.className = 'item'; li.id = 'it' + it.id; li.dataset.id = it.id; $('#list').appendChild(li); }
    const done = it.status === 'done', o = it.out, b = it.before;
    const fmt = M.NAME[it.format] || (it.name.split('.').pop() || '').toUpperCase();
    const thumb = (done && it.outUrl) || it.srcUrl;
    const removed = done ? Math.max(0, realCount(b) - realCount(o.after)) : 0;
    let sub = esc(fmt) + '<span class="dim">' + (it.dim ? ' · ' + it.dim : '') + '</span> · ' + M.kb(it.size);
    if (done) {
      const pct = it.size ? Math.round((1 - o.size / it.size) * 100) : 0;
      sub += ' → ' + M.kb(o.size) + (pct > 0 ? ' <span class="save">(−' + pct + '%)</span>' : '') +
        (o.ext !== M.EXT[it.format] ? ' · ' + esc(o.ext.toUpperCase()) : '') + (removed ? ' · đã xoá <b>' + removed + '</b> mục' : '');
    }
    li.innerHTML =
      '<div class="thumb">' + (thumb ? '<img alt="" src="' + thumb + '">' : esc(fmt)) + '</div>' +
      '<div class="body">' +
        '<div class="row1"><span class="name">' + esc(it.name) + '</span>' + badges(it) + '</div>' +
        '<div class="sub">' + sub + '</div>' +
        (b && b.findings.length ? '<div class="tags">' + chips(b) + '</div>' : '') +
        (done && o.note ? '<div class="note">ℹ ' + esc(o.note) + '</div>' : '') +
        (it.status === 'error' ? '<div class="err">' + esc(it.error) + '</div>' : '') +
      '</div>' +
      '<div class="acts">' +
        (done ? '<a class="btn primary sm" href="' + it.outUrl + '" download="' + esc(o.name) + '">⬇ Tải ảnh</a>' : '') +
        '<button class="x" type="button" data-act="rm" title="Bỏ ảnh này">✕ Bỏ</button>' +
      '</div>' +
      (done ? '<details class="det"' + (it.open ? ' open' : '') + '><summary>Chi tiết metadata (' + b.findings.length + ' mục trước → ' + o.after.findings.length + ' mục sau)</summary>' +
        '<div class="cols"><div><h4>Trước khi xoá</h4>' + flist(b) + '</div><div><h4>Sau khi xoá</h4>' + flist(o.after, true) + '</div></div></details>' : '');
    const img = li.querySelector('.thumb img');
    if (img) {
      img.addEventListener('load', () => {
        if (it.dim) return;
        it.dim = img.naturalWidth + '×' + img.naturalHeight;
        const d = li.querySelector('.dim'); if (d) d.textContent = ' · ' + it.dim;
      });
      img.addEventListener('error', () => { img.replaceWith(document.createTextNode(fmt)); });
    }
    const det = li.querySelector('details');
    if (det) det.addEventListener('toggle', () => { it.open = det.open; });
  }

  function renderBar() {
    const live = items.filter(i => !i.removed);
    $('#bar').hidden = !live.length;
    if (!live.length) return;
    const done = live.filter(i => i.status === 'done');
    const ai = live.filter(i => i.before && i.before.hasAi).length;
    const saved = done.reduce((s, i) => s + i.size - i.out.size, 0);
    $('#summary').innerHTML = '<b>' + live.length + '</b> ảnh · ' +
      (ai ? '<span class="red"><b>' + ai + '</b> ảnh có nhãn AI</span>' : 'không ảnh nào có nhãn AI') +
      ' · đã làm sạch <b>' + done.length + '/' + live.length + '</b>' + (saved > 0 ? ' · giảm ' + M.kb(saved) : '');
    $('#zipBtn').disabled = !done.length;
  }

  function removeItem(it) {
    it.removed = true;
    if (it.srcUrl) URL.revokeObjectURL(it.srcUrl);
    if (it.outUrl) URL.revokeObjectURL(it.outUrl);
    it.bytes = null; it.out = null;
    render(it);
  }

  function reprocessAll() {
    for (const it of items) if (!it.removed && it.bytes) { it.status = 'working'; render(it); enqueue(() => process(it)); }
    renderBar();
  }
  function renameAll() {
    const naming = readOpts().naming;
    for (const it of items) if (!it.removed && it.status === 'done') { it.out.name = outName(it, it.out.ext, naming); render(it); }
  }

  /* ---------- Tải gói ZIP ---------- */
  let saver = null;   // trang nhúng (vd. Artifact claude.ai) có thể thay cách lưu file: saver(blob, tên)
  function saveBlob(blob, name) {
    if (saver) { saver(blob, name); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  }
  function downloadZip() {
    const done = items.filter(i => !i.removed && i.status === 'done');
    if (!done.length) return;
    const used = new Set();
    const files = done.map(i => {
      const m = i.out.name.match(/^(.*?)(\.[^.]*)?$/); let n = i.out.name, k = 1;
      while (used.has(n.toLowerCase())) n = m[1] + ' (' + k++ + ')' + (m[2] || '');
      used.add(n.toLowerCase());
      return { name: n, data: i.out.bytes };
    });
    const d = new Date(), p = x => String(x).padStart(2, '0');
    saveBlob(new Blob(M.zipParts(files), { type: 'application/zip' }),
      'anh-da-xoa-nhan-ai_' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.zip');
  }

  /* ---------- Sự kiện ---------- */
  loadOpts(); syncOptsUi();

  const input = $('#file'), drop = $('#drop');
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });

  let dragDepth = 0;
  const hasFiles = e => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  window.addEventListener('dragenter', e => { if (!hasFiles(e)) return; dragDepth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    addFiles(e.dataTransfer.files);
  });
  document.addEventListener('paste', e => {
    const fs = Array.from((e.clipboardData && e.clipboardData.items) || []).filter(x => x.kind === 'file').map(x => x.getAsFile()).filter(Boolean);
    if (fs.length) { e.preventDefault(); addFiles(fs); }
  });

  document.querySelectorAll('input[name=mode]').forEach(r => r.addEventListener('change', () => { syncOptsUi(); reprocessAll(); }));
  $('#fmt').addEventListener('change', () => { syncOptsUi(); reprocessAll(); });
  $('#q').addEventListener('input', () => { $('#qv').textContent = $('#q').value; });
  $('#q').addEventListener('change', () => { syncOptsUi(); reprocessAll(); });
  $('#keepOri').addEventListener('change', () => { syncOptsUi(); reprocessAll(); });
  $('#keepIcc').addEventListener('change', () => { syncOptsUi(); reprocessAll(); });
  $('#naming').addEventListener('change', () => { syncOptsUi(); renameAll(); });

  $('#list').addEventListener('click', e => {
    const dl = e.target.closest('a[download]');
    if (dl && saver) {
      e.preventDefault();
      const it = items.find(i => String(i.id) === dl.closest('.item').dataset.id);
      if (it && it.out) saveBlob(new Blob([it.out.bytes], { type: it.out.mime }), it.out.name);
      return;
    }
    const btn = e.target.closest('[data-act=rm]'); if (!btn) return;
    const it = items.find(i => String(i.id) === btn.closest('.item').dataset.id);
    if (it) { removeItem(it); renderBar(); }
  });
  $('#zipBtn').addEventListener('click', downloadZip);
  $('#clearBtn').addEventListener('click', () => { items.forEach(i => { if (!i.removed) removeItem(i); }); renderBar(); });

  // Cho trang nhúng: tiện ích trình duyệt đưa ảnh lấy từ web vào; Artifact claude.ai thay cách lưu file
  window.RemoveAIApp = { addFiles, setSaver: fn => { saver = typeof fn === 'function' ? fn : null; } };
})();
