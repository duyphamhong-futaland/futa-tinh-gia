#!/usr/bin/env node
/* FUTA Land — Xoá nhãn AI khỏi ảnh · công cụ dòng lệnh (dùng chung lõi meta.js với bản web)
   Chạy: node xoa-nhan-ai.js [tuỳ chọn] <ảnh hoặc thư mục>...   (xem --help) */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function loadCore() {
  for (const p of [path.join(__dirname, 'meta.js'), path.resolve(__dirname, '../../../../../remove-ai/js/meta.js')]) {
    if (fs.existsSync(p)) return require(p);
  }
  console.error('Không tìm thấy meta.js cạnh công cụ.');
  process.exit(2);
}
const M = loadCore();

const HELP = `Xoá nhãn AI khỏi ảnh — gỡ C2PA, IPTC, XMP, EXIF, prompt… (không nén lại ảnh)

Cách dùng: node xoa-nhan-ai.js [tuỳ chọn] <ảnh hoặc thư mục>...

  --out <thư mục>    nơi lưu ảnh đã làm sạch (mặc định: cùng thư mục với ảnh gốc)
  --suffix <chuỗi>   hậu tố tên file (mặc định "_clean"; "" = giữ tên gốc, cần --out khác thư mục gốc)
  --check            chỉ kiểm tra, không ghi file
  --no-orientation   không giữ hướng xoay
  --no-icc           không giữ hồ sơ màu ICC
  --zip <file.zip>   gom các ảnh đã làm sạch vào một file ZIP
  --json             in báo cáo dạng JSON
  -h, --help         xem hướng dẫn`;

function parseArgs(argv) {
  const o = { out: '', suffix: '_clean', check: false, keepOrientation: true, keepIcc: true, zip: '', json: false, inputs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-h' || a === '--help') { console.log(HELP); process.exit(0); }
    else if (a === '--out') o.out = argv[++i] || '';
    else if (a === '--suffix') o.suffix = argv[++i] ?? '';
    else if (a === '--zip') o.zip = argv[++i] || '';
    else if (a === '--check') o.check = true;
    else if (a === '--no-orientation') o.keepOrientation = false;
    else if (a === '--no-icc') o.keepIcc = false;
    else if (a === '--json') o.json = true;
    else if (a.startsWith('--')) { console.error('Tuỳ chọn không hợp lệ: ' + a + '\n\n' + HELP); process.exit(2); }
    else o.inputs.push(a);
  }
  if (!o.inputs.length) { console.error(HELP); process.exit(2); }
  return o;
}

const IMG = /\.(jpe?g|jfif|png|apng|webp|gif|avif|heic|heif|bmp|tiff?)$/i;
function collect(inputs) {
  const files = [];
  const walk = p => {
    let st; try { st = fs.statSync(p); } catch (e) { files.push({ path: p, missing: true }); return; }
    if (st.isDirectory()) { for (const f of fs.readdirSync(p).sort()) { const q = path.join(p, f); if (fs.statSync(q).isDirectory() || IMG.test(f)) walk(q); } }
    else files.push({ path: p });
  };
  inputs.forEach(walk);
  return files;
}

const realCount = a => a.findings.filter(f => f.level !== 'info').length;
const brief = f => f.label + (f.detail ? ' (' + f.detail + ')' : '');
// Tóm tắt dấu vết AI, gọn & không lặp: "C2PA (ChatGPT · GPT-4o)", "IPTC: …", tên công cụ
function aiSummary(findings) {
  const out = [];
  for (const f of findings) {
    if (f.level !== 'ai') continue;
    let s = f.label;
    if (s.startsWith('Content Credentials')) { const m = /Tạo\/ký bởi: (.*?) · [\d.]+ [KM]?B$/.exec(f.detail); s = 'C2PA' + (m ? ' (' + m[1] + ')' : ''); }
    else if (s.startsWith('Nguồn ảnh: ')) s = 'IPTC: ' + s.slice(11).replace(/ \(\w+\)$/, '');
    else if (s.startsWith('Dấu vết công cụ AI: ')) s = s.slice(20);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

// AVIF/HEIC/TIFF/BMP: không cắt trực tiếp được → vẽ lại bằng Python Pillow nếu máy có
function reencode(src, base, keepIcc) {
  const py = path.join(__dirname, 've-lai-anh.py');
  for (const bin of ['python3', 'python']) {
    const r = spawnSync(bin, [py, src, base, keepIcc ? '1' : '0'], { encoding: 'utf8' });
    if (r.error) continue;
    if (r.status === 0) return { file: r.stdout.trim().split('\n').pop() };
    return { error: (r.stderr || '').trim().split('\n').pop() || 'Pillow không đọc được ảnh' };
  }
  return { error: 'Không có Python để vẽ lại ảnh' };
}

async function processFile(item, o) {
  const rep = { file: item.path };
  if (item.missing) return Object.assign(rep, { error: 'Không tìm thấy file' });
  const bytes = new Uint8Array(fs.readFileSync(item.path));
  const before = await M.analyze(bytes);
  Object.assign(rep, {
    format: M.NAME[before.format] || before.format, sizeBefore: bytes.length, hasAi: before.hasAi,
    aiSummary: aiSummary(before.findings),
    ai: before.findings.filter(f => f.level === 'ai').map(brief),
    metadata: before.findings.filter(f => f.level === 'meta').map(brief),
    kept: before.findings.filter(f => f.level === 'info').map(f => f.label),
  });
  if (o.check) return rep;

  const dir = o.out || path.dirname(item.path);
  const base = path.join(dir, path.basename(item.path).replace(/\.[^.]+$/, '') + o.suffix);
  let out, outBytes;
  if (M.canStrip(before.format)) {
    outBytes = M.strip(bytes, o);
    out = base + '.' + M.EXT[before.format];
    if (path.resolve(out) === path.resolve(item.path)) return Object.assign(rep, { error: 'Đầu ra trùng file gốc — dùng --out khác thư mục hoặc --suffix' });
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(out, outBytes);
    rep.method = 'cắt metadata (không nén lại)';
  } else {
    fs.mkdirSync(dir, { recursive: true });
    const r = reencode(item.path, base, o.keepIcc);
    if (r.error) return Object.assign(rep, { error: 'Định dạng ' + rep.format + ' cần vẽ lại nhưng không làm được: ' + r.error + '. Cài Pillow (pip install pillow pillow-heif) hoặc dùng công cụ web.' });
    out = r.file; outBytes = new Uint8Array(fs.readFileSync(out));
    rep.method = 'vẽ lại ảnh bằng Pillow';
  }
  const after = await M.analyze(outBytes);
  return Object.assign(rep, {
    output: out, sizeAfter: outBytes.length, removed: Math.max(0, realCount(before) - realCount(after)),
    remaining: after.findings.map(f => f.label), stillAi: after.hasAi,
  });
}

function printText(reports, o, zipPath) {
  let ai = 0, done = 0, saved = 0;
  for (const r of reports) {
    if (r.error) { console.log('✖ ' + r.file + ' — ' + r.error); continue; }
    if (r.hasAi) ai++;
    const head = (o.check ? '• ' : '✔ ') + path.basename(r.file) + '  [' + r.format + '] ' + M.kb(r.sizeBefore) +
      (r.output ? ' → ' + M.kb(r.sizeAfter) : '');
    console.log(head);
    console.log('   ' + (r.hasAi ? '⚠ Có nhãn AI: ' + r.aiSummary.join(' · ') : 'Không thấy dấu vết AI'));
    if (r.metadata.length) console.log('   Metadata khác: ' + r.metadata.map(m => m.length > 70 ? m.slice(0, 69) + '…' : m).join(' · '));
    if (r.output) {
      done++; saved += r.sizeBefore - r.sizeAfter;
      console.log('   Đã xoá ' + r.removed + ' mục (' + r.method + ') → ' + r.output +
        (r.remaining.length ? '  · còn giữ: ' + r.remaining.join(', ') : '') + (r.stillAi ? '  ⚠ VẪN CÒN DẤU VẾT AI' : ''));
    }
  }
  console.log('\nTổng: ' + reports.length + ' ảnh · ' + ai + ' ảnh có nhãn AI' +
    (o.check ? '' : ' · đã làm sạch ' + done + ' · giảm ' + M.kb(Math.max(0, saved))) + (zipPath ? ' · ZIP: ' + zipPath : ''));
}

(async () => {
  const o = parseArgs(process.argv.slice(2));
  const reports = [];
  for (const item of collect(o.inputs)) {
    try { reports.push(await processFile(item, o)); } catch (e) { reports.push({ file: item.path, error: e.message }); }
  }
  let zipPath = '';
  if (o.zip && !o.check) {
    const used = new Set(), files = reports.filter(r => r.output).map(r => {
      let n = path.basename(r.output), k = 1; const m = n.match(/^(.*?)(\.[^.]*)?$/);
      while (used.has(n.toLowerCase())) n = m[1] + ' (' + k++ + ')' + (m[2] || '');
      used.add(n.toLowerCase());
      return { name: n, data: new Uint8Array(fs.readFileSync(r.output)) };
    });
    if (files.length) { zipPath = o.zip; fs.writeFileSync(zipPath, M.concat(M.zipParts(files))); }
  }
  if (o.json) console.log(JSON.stringify({ reports, zip: zipPath || null }, null, 2));
  else printText(reports, o, zipPath);
  process.exit(reports.some(r => r.error) ? 1 : 0);
})();
