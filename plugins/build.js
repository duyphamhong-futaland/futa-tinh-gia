#!/usr/bin/env node
/* Đóng gói 3 plugin “Xoá nhãn AI khỏi ảnh” từ mã nguồn dùng chung trong remove-ai/
   Chạy:  node plugins/build.js
   Kết quả (plugins/dist/):
     futa-xoa-nhan-ai-chrome.zip     tiện ích Chrome/Edge (giải nén → “Tải tiện ích đã giải nén”, hoặc nộp Chrome Web Store)
     futa-xoa-nhan-ai.plugin         plugin cho Claude (Cowork / Claude Code)
     futa-xoa-nhan-ai-wordpress.zip  plugin WordPress (Plugins → Cài mới → Tải plugin lên) */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = __dirname;
const DIST = path.join(SRC, 'dist');
const BUILD = path.join(DIST, 'build');
const M = require(path.join(ROOT, 'remove-ai/js/meta.js'));
const ZIP_DATE = new Date(2026, 0, 1);   // ngày cố định → build lại cho ra file ZIP giống hệt

const copy = (src, dst) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); };
const write = (dst, text) => { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, text); };
function listFiles(dir, base = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === '.DS_Store') continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...listFiles(dir, rel)); else out.push(rel);
  }
  return out;
}
const copyDir = (src, dst) => listFiles(src).forEach(rel => copy(path.join(src, rel), path.join(dst, rel)));
function zipDir(dir, out, prefix = '') {
  const files = listFiles(dir).map(rel => ({ name: prefix + rel, data: new Uint8Array(fs.readFileSync(path.join(dir, rel))) }));
  fs.writeFileSync(out, M.concat(M.zipParts(files, ZIP_DATE)));
  return files.length;
}

// Trang công cụ cho bản đóng gói: logo/favicon nằm cạnh trang, bỏ liên kết sang công cụ tính giá
function toolPage({ head = '', scripts = '', pill = '' } = {}) {
  let h = fs.readFileSync(path.join(ROOT, 'remove-ai/index.html'), 'utf8');
  const rep = (a, b) => {
    const next = h.replace(a, b);
    if (next === h) throw new Error('Không tìm thấy đoạn cần thay trong remove-ai/index.html: ' + a);
    h = next;
  };
  rep('href="../img/favicon.png"', 'href="img/favicon.png"');
  rep('src="../img/logo-futa-land-trans.png"', 'src="img/logo.png"');
  rep(/\s*<nav class="nav">[\s\S]*?<\/nav>/, '');
  if (head) rep('</head>', head + '\n</head>');
  if (pill) rep(/(<li>🔎[^<]*<\/li>)/, '$1\n      ' + pill);
  if (scripts) rep(/(<script src="js\/app\.js[^"]*"><\/script>)/, '$1\n' + scripts);
  return h;
}
function toolFiles(dst, page, pageName) {
  write(path.join(dst, pageName), page);
  copy(path.join(ROOT, 'remove-ai/css/remove-ai.css'), path.join(dst, 'css/remove-ai.css'));
  copy(path.join(ROOT, 'remove-ai/js/meta.js'), path.join(dst, 'js/meta.js'));
  copy(path.join(ROOT, 'remove-ai/js/app.js'), path.join(dst, 'js/app.js'));
  copy(path.join(ROOT, 'img/logo-futa-land-trans.png'), path.join(dst, 'img/logo.png'));
  copy(path.join(ROOT, 'img/favicon.png'), path.join(dst, 'img/favicon.png'));
}

fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(BUILD, { recursive: true });
const versions = {};

/* 1) Tiện ích Chrome / Edge (Manifest V3) */
{
  const dst = path.join(BUILD, 'chrome');
  copyDir(path.join(SRC, 'chrome-extension'), dst);
  toolFiles(dst, toolPage({
    head: '<link rel="stylesheet" href="css/ext.css?v=1">',
    scripts: '<script src="js/ext.js?v=1"></script>',
    pill: '<li>🖱 Chuột phải vào ảnh trên web → “Xoá nhãn AI khỏi ảnh này”</li>',
  }), 'tool.html');
  versions.chrome = JSON.parse(fs.readFileSync(path.join(dst, 'manifest.json'), 'utf8')).version;
  const n = zipDir(dst, path.join(DIST, 'futa-xoa-nhan-ai-chrome.zip'));
  console.log('✔ Chrome/Edge   v' + versions.chrome + '  ' + n + ' file → dist/futa-xoa-nhan-ai-chrome.zip');
}

/* 2) Plugin cho Claude */
{
  const dst = path.join(BUILD, 'claude');
  copyDir(path.join(SRC, 'claude-plugin'), dst);
  copy(path.join(ROOT, 'remove-ai/js/meta.js'), path.join(dst, 'skills/xoa-nhan-ai/scripts/meta.js'));
  const manifest = JSON.parse(fs.readFileSync(path.join(dst, '.claude-plugin/plugin.json'), 'utf8'));
  versions.claude = manifest.version;
  const n = zipDir(dst, path.join(DIST, manifest.name + '.plugin'));
  console.log('✔ Claude        v' + versions.claude + '  ' + n + ' file → dist/' + manifest.name + '.plugin');
}

/* 3) Plugin WordPress */
{
  const slug = 'futa-xoa-nhan-ai';
  const dst = path.join(BUILD, 'wordpress', slug);
  copyDir(path.join(SRC, 'wordpress', slug), dst);
  toolFiles(path.join(dst, 'tool'), toolPage(), 'index.html');
  versions.wordpress = (/^\s*\*\s*Version:\s*(\S+)/m.exec(fs.readFileSync(path.join(dst, slug + '.php'), 'utf8')) || [])[1];
  const n = zipDir(path.join(BUILD, 'wordpress'), path.join(DIST, slug + '-wordpress.zip'));
  console.log('✔ WordPress     v' + versions.wordpress + '  ' + n + ' file → dist/' + slug + '-wordpress.zip');
}

if (new Set(Object.values(versions)).size > 1) console.warn('⚠ Phiên bản 3 plugin đang lệch nhau:', versions);
