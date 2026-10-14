/* FUTA Land — Xoá nhãn AI khỏi ảnh · lõi đọc & xoá metadata
   Chạy thuần JavaScript trên trình duyệt (hoặc Node để kiểm thử) — ảnh KHÔNG được gửi đi đâu.
   - AIMeta.analyze(bytes)      → Promise<{format, findings[], orientation, hasAi}>
   - AIMeta.strip(bytes, opts)  → Uint8Array — cắt bỏ khối metadata, KHÔNG nén lại ảnh (giữ nguyên điểm ảnh)
                                   hỗ trợ JPEG · PNG/APNG · WebP · GIF (giữ ảnh động)
   - AIMeta.zipParts(files)     → mảng byte để ghép thành Blob .zip (kiểu "store", không nén)
   Định dạng khác (AVIF/HEIC/…) → giao diện vẽ lại ảnh bằng canvas. */
(function (root) {
  'use strict';

  const L1 = new TextDecoder('latin1');   // 1 byte ↔ 1 ký tự → vị trí trong chuỗi = vị trí byte
  const U8 = new TextDecoder('utf-8');
  const str = (b, o, n) => L1.decode(b.subarray(o, o + n));
  const u16be = (b, o) => (b[o] << 8) | b[o + 1];
  const u32be = (b, o) => b[o] * 16777216 + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  const u32le = (b, o) => b[o + 3] * 16777216 + (b[o + 2] << 16) + (b[o + 1] << 8) + b[o];
  const kb = n => n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(2) + ' MB';
  const clip = (s, n) => { s = String(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
  const ent = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  function concat(parts) {
    let n = 0; for (const p of parts) n += p.length;
    const out = new Uint8Array(n); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  /* ---------- CRC32 (PNG chunk + ZIP) ---------- */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(...arrs) {
    let c = 0xFFFFFFFF;
    for (const b of arrs) for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /* ---------- Nhận diện định dạng ---------- */
  const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif', heic: 'image/heic', bmp: 'image/bmp', tiff: 'image/tiff' };
  const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', avif: 'avif', heic: 'heic', bmp: 'bmp', tiff: 'tif' };
  const NAME = { jpeg: 'JPG', png: 'PNG', webp: 'WebP', gif: 'GIF', avif: 'AVIF', heic: 'HEIC', bmp: 'BMP', tiff: 'TIFF', unknown: 'File' };

  function detectFormat(b) {
    if (b.length < 12) return 'unknown';
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg';
    if (b[0] === 0x89 && str(b, 1, 3) === 'PNG') return 'png';
    if (str(b, 0, 4) === 'RIFF' && str(b, 8, 4) === 'WEBP') return 'webp';
    if (str(b, 0, 4) === 'GIF8') return 'gif';
    if (str(b, 4, 4) === 'ftyp') {
      const brands = str(b, 8, Math.min(u32be(b, 0), 64) - 8);
      if (/avi[fs]/.test(brands)) return 'avif';
      if (/hei[cxms]|hev[cxms]|mif1|msf1/.test(brands)) return 'heic';
    }
    if (b[0] === 0x42 && b[1] === 0x4D) return 'bmp';
    const t = str(b, 0, 4);
    if (t === 'II*\0' || t === 'MM\0*') return 'tiff';
    return 'unknown';
  }
  const canStrip = f => f === 'jpeg' || f === 'png' || f === 'webp' || f === 'gif';

  /* ---------- Nhận diện dấu vết AI trong chuỗi ---------- */
  const AI_TOOLS = [
    [/dall[\s·._-]?e\b/i, 'DALL·E (OpenAI)'],
    [/chat\s?gpt|gpt[\s_-]?image|gpt-4o|\bopenai\b|\bsora\b/i, 'OpenAI · ChatGPT'],
    [/midjourney/i, 'Midjourney'],
    [/firefly/i, 'Adobe Firefly'],
    [/generative\s?(fill|expand)/i, 'Photoshop Generative Fill'],
    [/stable[\s_-]?diffusion|\bsdxl\b|stability\.?ai/i, 'Stable Diffusion'],
    [/comfy\s?ui/i, 'ComfyUI'],
    [/automatic1111|\ba1111\b/i, 'Stable Diffusion WebUI'],
    [/invoke\s?ai/i, 'InvokeAI'],
    [/novel\s?ai/i, 'NovelAI'],
    [/leonardo[\s.]?ai/i, 'Leonardo.Ai'],
    [/ideogram/i, 'Ideogram'],
    [/\bimagen\b/i, 'Google Imagen'],
    [/gemini|nano[\s-]?banana|\bbard\b/i, 'Google Gemini'],
    [/(made|edited|created) with google ai|\bgoogle\s?ai\b/i, 'Google AI'],
    [/synthid/i, 'Google SynthID'],
    [/\bmeta\s?ai\b|imagine with meta/i, 'Meta AI'],
    [/\bgrok\b|\bx\.ai\b|\bxai\b/i, 'Grok (xAI)'],
    [/\bflux(\.\d)?\b|black\s?forest\s?labs/i, 'FLUX'],
    [/bing image creator|image creator from (bing|microsoft)|microsoft designer|\bcopilot\b/i, 'Microsoft Copilot / Designer'],
    [/magic media|dream lab/i, 'Canva AI'],
    [/runway\s?(ml|gen)/i, 'Runway'],
    [/\bkling\b/i, 'Kling AI'],
    [/playground\s?(ai|v\d)/i, 'Playground AI'],
    [/recraft/i, 'Recraft'],
    [/seedream|dreamina|jimeng/i, 'ByteDance Seedream'],
    [/\bkrea\b/i, 'Krea'],
    [/galaxy\s?ai/i, 'Samsung Galaxy AI'],
    [/image\s?playground/i, 'Apple Image Playground'],
    [/hunyuan/i, 'Tencent Hunyuan'],
    [/qwen[\s-]?image|tongyi|\bwanx\b/i, 'Alibaba Qwen / Tongyi'],
    [/\bai[\s-]generated\b|generated (by|with) ai|made with ai|created (by|with) ai|tạo (bởi|bằng) ai/i, 'Gắn cờ “AI generated”'],
  ];
  const aiTools = t => AI_TOOLS.filter(([re]) => re.test(t)).map(([, n]) => n);

  // IPTC Digital Source Type — Meta, TikTok… đọc mã này để gắn nhãn
  const DST = {
    trainedAlgorithmicMedia: ['ai', 'Nguồn ảnh: tạo hoàn toàn bằng AI (trainedAlgorithmicMedia)'],
    compositeWithTrainedAlgorithmicMedia: ['ai', 'Nguồn ảnh: có vùng chỉnh sửa/ghép bằng AI (compositeWithTrainedAlgorithmicMedia)'],
    algorithmicMedia: ['ai', 'Nguồn ảnh: tạo bằng thuật toán (algorithmicMedia)'],
    compositeSynthetic: ['ai', 'Nguồn ảnh: ghép có thành phần tổng hợp (compositeSynthetic)'],
  };
  function sourceTypes(t) {
    const s = new Set(), re = /digitalsourcetype\/([A-Za-z]+)/gi; let m;
    while ((m = re.exec(t))) s.add(m[1]);
    return [...s];
  }

  const SD_LABEL = 'Prompt & thông số tạo ảnh Stable Diffusion';
  const F = (level, group, label, detail) => ({ level, group, label, detail: detail ? clip(detail, 240) : '' });

  function aiScan(text, group, out) {
    for (const c of sourceTypes(text)) {
      const d = DST[c];
      out.push(d ? F(d[0], group, d[1]) : F('meta', group, 'Nguồn ảnh: ' + c));
    }
    for (const n of aiTools(text)) out.push(F('ai', group, 'Dấu vết công cụ AI: ' + n));
    if (/\bSteps: ?\d+,[\s\S]*?\b(Sampler|CFG scale|Seed):/.test(text)) out.push(F('ai', group, SD_LABEL));
  }

  // Chuỗi ký tự in được (≥4) trong dữ liệu nhị phân — như lệnh `strings`
  function printable(b) {
    const runs = []; let s = -1;
    for (let i = 0; i <= b.length; i++) {
      const c = i < b.length ? b[i] : 0;
      if (c >= 32 && c < 127) { if (s < 0) s = i; } else if (s >= 0) { if (i - s >= 4) runs.push(L1.decode(b.subarray(s, i))); s = -1; }
    }
    return runs.join('\n');
  }

  /* ---------- EXIF / TIFF ---------- */
  const ORI = ['', 'bình thường', 'lật ngang', 'xoay 180°', 'lật dọc', 'xoay 90° + lật', 'xoay 90°', 'xoay 270° + lật', 'xoay 270°'];

  function parseTiff(b, s, e) {
    if (e - s < 8) return null;
    const N = e - s, dv = new DataView(b.buffer, b.byteOffset + s, N);
    const bo = dv.getUint16(0);
    if (bo !== 0x4949 && bo !== 0x4D4D) return null;
    const le = bo === 0x4949;
    if (dv.getUint16(2, le) !== 42) return null;
    const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
    const SZ = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
    const ifd = off => {
      const tags = {}; let next = 0;
      if (!off || off + 2 > N) return { tags, next };
      const n = u16(off);
      for (let i = 0; i < n; i++) {
        const p = off + 2 + i * 12; if (p + 12 > N) break;
        const type = u16(p + 2), cnt = u32(p + 4), size = (SZ[type] || 1) * cnt;
        const vo = size <= 4 ? p + 8 : u32(p + 8);
        if (vo + size <= N) tags[u16(p)] = { type, cnt, vo, size };
      }
      const q = off + 2 + n * 12; if (q + 4 <= N) next = u32(q);
      return { tags, next };
    };
    const raw = t => new Uint8Array(dv.buffer, dv.byteOffset + t.vo, t.size);
    const txt = t => t ? U8.decode(raw(t)).replace(/\0+$/, '').replace(/\0/g, ' ').trim() : '';
    const num = t => !t ? 0 : t.type === 3 ? u16(t.vo) : t.type === 4 ? u32(t.vo) : dv.getUint8(t.vo);
    const rats = t => { const a = []; if (t && t.type === 5) for (let i = 0; i < t.cnt; i++) { const d = u32(t.vo + i * 8 + 4); a.push(d ? u32(t.vo + i * 8) / d : 0); } return a; };
    const ucs2 = t => t ? new TextDecoder('utf-16le').decode(raw(t)).replace(/\0+$/, '').trim() : '';
    const comment = t => {
      if (!t || t.size <= 8) return '';
      const r = raw(t), head = L1.decode(r.subarray(0, 8)).replace(/\0/g, ''), body = r.subarray(8);
      if (head === 'UNICODE') {   // đoán thứ tự byte theo vị trí các byte 0
        let ev = 0, od = 0; for (let i = 0; i < Math.min(body.length, 400); i++) if (!body[i]) (i % 2 ? od++ : ev++);
        return new TextDecoder(ev > od ? 'utf-16be' : 'utf-16le').decode(body).replace(/\0+$/, '').trim();
      }
      return U8.decode(body).replace(/\0+$/, '').trim();
    };
    const i0 = ifd(u32(4)), T = i0.tags;
    const X = T[0x8769] ? ifd(num(T[0x8769])).tags : {};
    let gps = null;
    if (T[0x8825]) {
      const G = ifd(num(T[0x8825])).tags, la = rats(G[2]), lo = rats(G[4]);
      gps = {};
      if (la.length === 3 && lo.length === 3) {
        gps.lat = (la[0] + la[1] / 60 + la[2] / 3600) * (txt(G[1]) === 'S' ? -1 : 1);
        gps.lon = (lo[0] + lo[1] / 60 + lo[2] / 3600) * (txt(G[3]) === 'W' ? -1 : 1);
      }
    }
    const o = num(T[0x0112]);
    return {
      orientation: o >= 1 && o <= 8 ? o : 1,
      make: txt(T[0x010F]), model: txt(T[0x0110]), software: txt(T[0x0131]), artist: txt(T[0x013B]),
      description: txt(T[0x010E]), copyright: txt(T[0x8298]), datetime: txt(X[0x9003]) || txt(T[0x0132]),
      userComment: comment(X[0x9286]), xp: [ucs2(T[0x9C9B]), ucs2(T[0x9C9C]), ucs2(T[0x9C9D]), ucs2(T[0x9C9E]), ucs2(T[0x9C9F])].filter(Boolean).join(' · '),
      lens: txt(X[0xA434]), serial: [txt(X[0xA430]), txt(X[0xA431])].filter(Boolean).join(' · '), uid: txt(X[0xA420]),
      makerNote: !!X[0x927C], gps, thumb: !!i0.next,
    };
  }

  function exifFindings(t, out, g) {
    g = g || 'EXIF';
    if (!t) { out.push(F('meta', g, 'Khối dữ liệu EXIF')); return; }
    const dev = [t.make, t.model].filter(Boolean).join(' ');
    const before = out.length;
    if (dev) out.push(F('meta', g, 'Thiết bị: ' + clip(dev, 80)));
    if (t.lens) out.push(F('meta', g, 'Ống kính: ' + clip(t.lens, 80)));
    if (t.serial) out.push(F('meta', g, 'Số serial / chủ thiết bị', t.serial));
    if (t.software) out.push(F('meta', g, 'Phần mềm: ' + clip(t.software, 80)));
    if (t.datetime) out.push(F('meta', g, 'Thời gian chụp/tạo: ' + t.datetime));
    if (t.artist) out.push(F('meta', g, 'Tác giả: ' + clip(t.artist, 80)));
    if (t.copyright) out.push(F('meta', g, 'Bản quyền: ' + clip(t.copyright, 80)));
    if (t.description) out.push(F('meta', g, 'Mô tả ảnh', t.description));
    if (t.userComment) out.push(F('meta', g, 'Ghi chú (UserComment)', t.userComment));
    if (t.xp) out.push(F('meta', g, 'Tiêu đề / ghi chú Windows', t.xp));
    if (t.uid) out.push(F('meta', g, 'Mã định danh ảnh', t.uid));
    if (t.makerNote) out.push(F('meta', g, 'Dữ liệu riêng của hãng (MakerNote)'));
    if (t.gps) out.push(F('meta', g, '📍 Toạ độ GPS nơi chụp', t.gps.lat != null ? t.gps.lat.toFixed(5) + ', ' + t.gps.lon.toFixed(5) : ''));
    if (t.thumb) out.push(F('meta', g, 'Ảnh thu nhỏ (thumbnail) nhúng sẵn'));
    if (out.length === before && t.orientation === 1) out.push(F('meta', g, 'Khối dữ liệu EXIF'));
    if (t.orientation > 1) out.push(F('info', g, 'Hướng xoay ảnh: ' + ORI[t.orientation]));
    aiScan([t.make, t.model, t.software, t.artist, t.copyright, t.description, t.userComment, t.xp].join('\n'), g, out);
  }

  // TIFF tối giản chỉ chứa Orientation (+ YCbCrPositioning bắt buộc với JPEG) — để ảnh không bị xoay sai sau khi xoá EXIF
  const tiffOrientation = o => Uint8Array.of(0x4D, 0x4D, 0, 0x2A, 0, 0, 0, 8, 0, 2,
    0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0,
    0x02, 0x13, 0, 3, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0);

  /* ---------- XMP ---------- */
  function xmpProp(x, name) {
    let m = x.match(new RegExp(name + '\\s*=\\s*"([^"]*)"'));
    if (m) return ent(m[1]).trim();
    m = x.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>'));
    return m ? ent(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
  }
  function xmpFindings(x, out, g) {
    g = g || 'XMP';
    out.push(F('meta', g, 'Gói metadata XMP', kb(x.length)));
    const tool = xmpProp(x, 'xmp:CreatorTool'), credit = xmpProp(x, 'photoshop:Credit'),
      creator = xmpProp(x, 'dc:creator'), desc = xmpProp(x, 'dc:description'), title = xmpProp(x, 'dc:title');
    if (tool) out.push(F('meta', g, 'Phần mềm tạo: ' + clip(tool, 80)));
    if (credit) out.push(F('meta', g, 'Ghi công: ' + clip(credit, 80)));
    if (creator) out.push(F('meta', g, 'Tác giả: ' + clip(creator, 80)));
    if (title) out.push(F('meta', g, 'Tiêu đề', title));
    if (desc) out.push(F('meta', g, 'Mô tả', desc));
    if (/xmpMM:History/.test(x)) out.push(F('meta', g, 'Lịch sử chỉnh sửa (xmpMM:History)'));
    if (/GPSLatitude/.test(x)) out.push(F('meta', g, '📍 Toạ độ GPS nơi chụp'));
    aiScan(ent(x), g, out);
  }

  /* ---------- C2PA / Content Credentials ---------- */
  // Tìm khoá (chuỗi) trong CBOR rồi đọc chuỗi text CBOR đứng ngay sau
  function cborText(b, key) {
    const k = Array.from(key, c => c.charCodeAt(0)), res = [];
    outer: for (let i = 0; i + k.length < b.length; i++) {
      for (let j = 0; j < k.length; j++) if (b[i + j] !== k[j]) continue outer;
      let p = i + k.length; const h = b[p++];
      if ((h & 0xE0) !== 0x60) continue;
      let n = h & 0x1F;
      if (n === 24) n = b[p++]; else if (n === 25) { n = u16be(b, p); p += 2; } else if (n > 23) continue;
      if (p + n <= b.length) res.push({ at: i, v: U8.decode(b.subarray(p, p + n)) });
    }
    return res;
  }
  // Tên công cụ tạo/ký: claim_generator (v1) · claim_generator_info.name · softwareAgent(.name)
  function c2paGenerators(b) {
    const names = cborText(b, 'name'), near = (key, win) => cborText(b, key).map(x => x.at)
      .concat(Array.from(L1.decode(b).matchAll(new RegExp(key + '(?!_)', 'g')), m => m.index))
      .flatMap(at => names.filter(n => n.at > at && n.at < at + win).slice(0, 1).map(n => n.v));
    return [...new Set([
      ...cborText(b, 'claim_generator').map(x => x.v), ...near('claim_generator_info', 160),
      ...cborText(b, 'softwareAgent').map(x => x.v), ...near('softwareAgent', 40),
    ])].filter(x => x && x.length < 100);
  }
  function c2paFindings(b, out, g) {
    g = g || 'C2PA';
    const s = printable(b);
    const gens = c2paGenerators(b);
    const ai = sourceTypes(s).some(c => DST[c]) || aiTools(s).length > 0;
    out.push(F(ai ? 'ai' : 'meta', g, 'Content Credentials (C2PA) — chứng nhận nguồn gốc nội dung',
      (gens.length ? 'Tạo/ký bởi: ' + gens.slice(0, 3).join(' · ') + ' · ' : '') + kb(b.length)));
    aiScan(s, g, out);
  }

  /* ---------- IPTC (Photoshop IRB) ---------- */
  const IIM = { '2:5': 'Tên ảnh', '2:25': 'Từ khoá', '2:80': 'Tác giả', '2:110': 'Ghi công', '2:115': 'Nguồn', '2:116': 'Bản quyền', '2:120': 'Mô tả', '2:65': 'Chương trình tạo' };
  function iptcFindings(b, s, e, out) {
    const g = 'IPTC';
    out.push(F('meta', g, 'Khối Photoshop / IPTC', kb(e - s)));
    let i = s, iim = null;
    while (i + 12 <= e && str(b, i, 4) === '8BIM') {
      const id = u16be(b, i + 4), nl = b[i + 6];
      let p = i + 7 + nl; if ((nl + 1) % 2) p++;
      const size = u32be(b, p); p += 4;
      if (id === 0x0404) iim = [p, Math.min(p + size, e)];
      if (id === 0x0409 || id === 0x040C) out.push(F('meta', g, 'Ảnh thu nhỏ Photoshop'));
      i = p + size + (size % 2);
    }
    if (!iim) return;
    const vals = {}; let all = '';
    for (let j = iim[0]; j + 5 <= iim[1] && b[j] === 0x1C;) {
      const key = b[j + 1] + ':' + b[j + 2]; let len = u16be(b, j + 3); j += 5;
      if (len & 0x8000) { const nb = len & 0x7FFF; len = 0; for (let q = 0; q < nb; q++) len = len * 256 + b[j + q]; j += nb; }
      const v = U8.decode(b.subarray(j, Math.min(j + len, iim[1])));
      if (IIM[key]) (vals[key] = vals[key] || []).push(v);
      all += v + '\n'; j += len;
    }
    for (const k in vals) out.push(F('meta', g, IIM[k], vals[k].join(', ')));
    aiScan(all, g, out);
  }

  /* ---------- Quét chung (AVIF/HEIC/dữ liệu đuôi…) ---------- */
  function scanGeneric(b, out, info, g) {
    const t = L1.decode(b);
    const xm = U8.decode(b).match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/g);
    if (xm) xmpFindings(xm.join('\n'), out, g + ' · XMP');
    const k = t.search(/Exif\0\0|MM\0\x2A\0\0\0\x08|II\x2A\0\x08\0\0\0/);
    if (k >= 0) {
      const tf = parseTiff(b, t.startsWith('Exif', k) ? k + 6 : k, b.length);
      if (tf) { exifFindings(tf, out, g + ' · EXIF'); if (info) info.orientation = tf.orientation; }
    }
    const j = t.indexOf('jumb');
    if (j >= 4 && t.indexOf('c2pa', j) > 0) {
      const len = u32be(b, j - 4);
      c2paFindings(b.subarray(j - 4, len > 8 ? Math.min(b.length, j - 4 + len) : b.length), out, g + ' · C2PA');
    }
    if (t.indexOf('ICC_PROFILE') >= 0 || t.indexOf('colrprof') >= 0) out.push(F('info', g, 'Hồ sơ màu ICC'));
  }

  /* ---------- JPEG ---------- */
  function jpegSegments(b) {
    const segs = [], n = b.length; let i = 2, end = -1, bad = false;
    while (i + 1 < n) {
      if (b[i] !== 0xFF) { bad = true; break; }
      const m = b[i + 1];
      if (m === 0xFF) { i++; continue; }                         // byte đệm
      if (m === 0xD9) { end = i + 2; break; }                    // EOI
      if ((m >= 0xD0 && m <= 0xD7) || m === 0x01) { segs.push({ m, s: i, e: i + 2, d: i + 2 }); i += 2; continue; }
      if (i + 4 > n) break;
      const sg = { m, s: i, e: Math.min(n, i + 2 + u16be(b, i + 2)), d: i + 4 };
      segs.push(sg); i = sg.e;
      if (m === 0xDA) {                                          // SOS → gộp luôn dữ liệu ảnh nén phía sau
        let j = i;
        while (j + 1 < n && !(b[j] === 0xFF && b[j + 1] !== 0 && b[j + 1] !== 0xFF && (b[j + 1] < 0xD0 || b[j + 1] > 0xD7))) j++;
        if (j + 1 >= n) j = n;
        sg.e = i = j;
      }
    }
    return { segs, end: end > 0 ? end : i, bad };
  }
  function jpegKind(b, sg) {
    const m = sg.m, sig = k => str(b, sg.d, Math.min(k, Math.max(0, sg.e - sg.d)));
    if (m === 0xE0) { const s = sig(5); return s === 'JFIF\0' ? 'jfif' : s === 'JFXX\0' ? 'jfxx' : 'app'; }
    if (m === 0xE1) {
      const s = sig(35);
      return s.startsWith('Exif\0') ? 'exif' : s.startsWith('http://ns.adobe.com/xap/1.0/\0') ? 'xmp' : s.startsWith('http://ns.adobe.com/xmp/extension/\0') ? 'xmpx' : 'app';
    }
    if (m === 0xE2) { const s = sig(12); return s === 'ICC_PROFILE\0' ? 'icc' : s.startsWith('MPF\0') ? 'mpf' : 'app'; }
    if (m === 0xEB) return sig(2) === 'JP' ? 'jumbf' : 'app';
    if (m === 0xED) return sig(14) === 'Photoshop 3.0\0' ? 'iptc' : 'app';
    if (m === 0xEE) return sig(5) === 'Adobe' ? 'adobe' : 'app';
    if (m >= 0xE0 && m <= 0xEF) return 'app';
    if (m === 0xFE) return 'com';
    return 'img';
  }
  function analyzeJpeg(b, out, info) {
    const { segs, end, bad } = jpegSegments(b), xmp = [], jumbf = [];
    for (const sg of segs) {
      const k = jpegKind(b, sg);
      if (k === 'exif') { const t = parseTiff(b, sg.d + 6, sg.e); if (t) info.orientation = t.orientation; exifFindings(t, out); }
      else if (k === 'xmp') xmp.push(U8.decode(b.subarray(sg.d + 29, sg.e)));      // XMP luôn là UTF-8
      else if (k === 'xmpx') xmp.push(U8.decode(b.subarray(sg.d + 75, sg.e)));
      else if (k === 'jumbf') jumbf.push(b.subarray(sg.d + 8, sg.e));
      else if (k === 'iptc') iptcFindings(b, sg.d + 14, sg.e, out);
      else if (k === 'icc') out.push(F('info', 'ICC', 'Hồ sơ màu ICC'));
      else if (k === 'mpf') out.push(F('meta', 'MPF', 'Ảnh phụ nhúng kèm (Multi-Picture / gain map)'));
      else if (k === 'jfxx') out.push(F('meta', 'JFIF', 'Ảnh thu nhỏ JFXX'));
      else if (k === 'com') { const c = U8.decode(b.subarray(sg.d, sg.e)); out.push(F('meta', 'Comment', 'Chú thích trong file', c)); aiScan(c, 'Comment', out); }
      else if (k === 'app') out.push(F('meta', 'APP' + (sg.m - 0xE0), 'Khối dữ liệu ứng dụng APP' + (sg.m - 0xE0), kb(sg.e - sg.s)));
    }
    if (xmp.length) xmpFindings(xmp.join('\n'), out);
    if (jumbf.length) c2paFindings(concat(jumbf), out);
    if (!bad && end < b.length) {
      out.push(F('meta', 'Trailer', 'Dữ liệu ẩn phía sau ảnh (ảnh phụ/video kèm…)', kb(b.length - end)));
      scanGeneric(b.subarray(end), out, null, 'Trailer');
    }
  }
  function stripJpeg(b, o) {
    const { segs, end, bad } = jpegSegments(b);
    let ori = 1;
    for (const sg of segs) if (jpegKind(b, sg) === 'exif') { const t = parseTiff(b, sg.d + 6, sg.e); if (t) ori = t.orientation; break; }
    let oriDone = !(o.keepOrientation && ori > 1);
    const parts = [b.subarray(0, 2)];
    for (const sg of segs) {
      const k = jpegKind(b, sg);
      if (!(k === 'img' || k === 'jfif' || k === 'adobe' || (k === 'icc' && o.keepIcc))) continue;
      if (!oriDone && k !== 'jfif') {
        const t = tiffOrientation(ori), len = 8 + t.length;
        parts.push(Uint8Array.of(0xFF, 0xE1, len >> 8, len & 255, 0x45, 0x78, 0x69, 0x66, 0, 0), t);
        oriDone = true;
      }
      parts.push(b.subarray(sg.s, sg.e));
    }
    parts.push(bad ? b.subarray(end) : Uint8Array.of(0xFF, 0xD9));
    return concat(parts);
  }

  /* ---------- PNG ---------- */
  const PNG_KEEP = new Set(['tRNS', 'gAMA', 'cHRM', 'sRGB', 'sBIT', 'pHYs', 'bKGD', 'hIST', 'acTL', 'fcTL', 'fdAT', 'cICP', 'mDCv', 'cLLI']);
  function pngChunks(b) {
    const out = []; let i = 8, end = -1;
    while (i + 12 <= b.length) {
      const len = u32be(b, i), e = i + 12 + len;
      if (e > b.length) break;
      const c = { type: str(b, i + 4, 4), s: i, d: i + 8, de: i + 8 + len, e };
      out.push(c); i = e;
      if (c.type === 'IEND') { end = e; break; }
    }
    return { chunks: out, end: end > 0 ? end : i };
  }
  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') return null;
    try {
      const r = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
      return new Uint8Array(await new Response(r).arrayBuffer());
    } catch (e) { return null; }
  }
  async function pngText(b, c) {
    const d = b.subarray(c.d, c.de), z = d.indexOf(0);
    if (z < 0) return null;
    const key = L1.decode(d.subarray(0, z));
    if (c.type === 'tEXt') return { key, val: L1.decode(d.subarray(z + 1)) };
    if (c.type === 'zTXt') { const r = await inflate(d.subarray(z + 2)); return { key, val: r ? L1.decode(r) : '(nén)' }; }
    const comp = d[z + 1];                                           // iTXt
    let p = d.indexOf(0, z + 3); p = d.indexOf(0, p + 1) + 1;          // bỏ qua language tag + translated keyword
    const raw = d.subarray(p), r = comp ? await inflate(raw) : raw;
    return { key, val: r ? U8.decode(r) : '(nén)' };
  }
  function pngTextFinding(key, val, out) {
    const g = 'PNG text';
    if (key === 'XML:com.adobe.xmp') return xmpFindings(val, out);
    if (key === 'parameters') out.push(F('ai', g, SD_LABEL, val));
    else if (key === 'prompt' || key === 'workflow') out.push(F('ai', g, /class_type|"nodes"/.test(val) ? 'Quy trình ComfyUI (' + key + ')' : 'Prompt tạo ảnh', val));
    else if (/^(invokeai_metadata|invokeai_graph|dream|sd-metadata|generation_data)$/i.test(key)) out.push(F('ai', g, 'Thông số tạo ảnh AI (' + key + ')', val));
    else out.push(F('meta', g, 'Văn bản “' + clip(key, 40) + '”', val));
    aiScan(key + '\n' + val, g, out);
  }
  async function analyzePng(b, out, info) {
    const { chunks, end } = pngChunks(b);
    for (const c of chunks) {
      const t = c.type;
      if (t === 'tEXt' || t === 'zTXt' || t === 'iTXt') { const r = await pngText(b, c); if (r) pngTextFinding(r.key, r.val, out); }
      else if (t === 'eXIf') { const tf = parseTiff(b, c.d, c.de); if (tf) info.orientation = tf.orientation; exifFindings(tf, out); }
      else if (t === 'caBX') c2paFindings(b.subarray(c.d, c.de), out);
      else if (t === 'iCCP') out.push(F('info', 'ICC', 'Hồ sơ màu ICC'));
      else if (t === 'tIME') out.push(F('meta', 'PNG', 'Thời điểm chỉnh sửa cuối (tIME)'));
      else if ((b[c.s + 4] & 0x20) && !PNG_KEEP.has(t)) out.push(F('meta', 'PNG', 'Khối dữ liệu phụ “' + t + '”', kb(c.e - c.s)));
    }
    if (end < b.length) { out.push(F('meta', 'Trailer', 'Dữ liệu ẩn phía sau ảnh', kb(b.length - end))); scanGeneric(b.subarray(end), out, null, 'Trailer'); }
  }
  function pngChunk(type, data) {
    const t = Uint8Array.from(type, c => c.charCodeAt(0)), h = new Uint8Array(8), f = new Uint8Array(4);
    new DataView(h.buffer).setUint32(0, data.length); h.set(t, 4);
    new DataView(f.buffer).setUint32(0, crc32(t, data));
    return concat([h, data, f]);
  }
  function stripPng(b, o) {
    const { chunks, end } = pngChunks(b);
    let ori = 1;
    for (const c of chunks) if (c.type === 'eXIf') { const t = parseTiff(b, c.d, c.de); if (t) ori = t.orientation; }
    let oriDone = !(o.keepOrientation && ori > 1);
    const parts = [b.subarray(0, 8)];
    for (const c of chunks) {
      const critical = !(b[c.s + 4] & 0x20);
      if (c.type === 'IDAT' && !oriDone) { parts.push(pngChunk('eXIf', tiffOrientation(ori))); oriDone = true; }
      if (critical || PNG_KEEP.has(c.type) || (c.type === 'iCCP' && o.keepIcc)) parts.push(b.subarray(c.s, c.e));
    }
    const last = chunks[chunks.length - 1];
    if (!last || last.type !== 'IEND') parts.push(b.subarray(end));     // file cụt: giữ nguyên phần còn lại
    return concat(parts);
  }

  /* ---------- WebP (RIFF) ---------- */
  const WEBP_KEEP = new Set(['VP8X', 'ANIM', 'ANMF', 'ALPH', 'VP8 ', 'VP8L']);
  function riffChunks(b) {
    const out = [], n = Math.min(b.length, 8 + u32le(b, 4)); let i = 12;
    while (i + 8 <= n) {
      const size = u32le(b, i + 4), d = i + 8, e = Math.min(d + size + (size & 1), b.length);
      out.push({ id: str(b, i, 4), s: i, d, de: Math.min(d + size, b.length), e }); i = e;
    }
    return { chunks: out, end: n };
  }
  const webpExif = (b, c) => parseTiff(b, str(b, c.d, 6) === 'Exif\0\0' ? c.d + 6 : c.d, c.de);
  function analyzeWebp(b, out, info) {
    const { chunks, end } = riffChunks(b);
    for (const c of chunks) {
      if (c.id === 'EXIF') { const t = webpExif(b, c); if (t) info.orientation = t.orientation; exifFindings(t, out); }
      else if (c.id === 'XMP ') xmpFindings(U8.decode(b.subarray(c.d, c.de)), out);
      else if (c.id === 'C2PA') c2paFindings(b.subarray(c.d, c.de), out);
      else if (c.id === 'ICCP') out.push(F('info', 'ICC', 'Hồ sơ màu ICC'));
      else if (!WEBP_KEEP.has(c.id)) out.push(F('meta', 'WebP', 'Khối dữ liệu phụ “' + c.id.trim() + '”', kb(c.e - c.s)));
    }
    if (end < b.length) out.push(F('meta', 'Trailer', 'Dữ liệu ẩn phía sau ảnh', kb(b.length - end)));
  }
  function stripWebp(b, o) {
    const { chunks } = riffChunks(b);
    let ori = 1;
    for (const c of chunks) if (c.id === 'EXIF') { const t = webpExif(b, c); if (t) ori = t.orientation; }
    const parts = []; let vp8x = null, icc = false;
    for (const c of chunks) {
      if (!(WEBP_KEEP.has(c.id) || (c.id === 'ICCP' && o.keepIcc))) continue;
      if (c.id === 'VP8X') { vp8x = b.slice(c.s, c.e); parts.push(vp8x); } else parts.push(b.subarray(c.s, c.e));
      if (c.id === 'ICCP') icc = true;
    }
    const addOri = !!vp8x && o.keepOrientation && ori > 1;
    if (addOri) { const t = tiffOrientation(ori), h = new Uint8Array(8); h.set([0x45, 0x58, 0x49, 0x46]); new DataView(h.buffer).setUint32(4, t.length, true); parts.push(h, t); }
    if (vp8x) vp8x[8] = (vp8x[8] & ~(0x20 | 0x08 | 0x04)) | (icc ? 0x20 : 0) | (addOri ? 0x08 : 0);   // cờ ICC / EXIF / XMP
    const body = concat(parts), head = new Uint8Array(12);
    head.set([0x52, 0x49, 0x46, 0x46]); new DataView(head.buffer).setUint32(4, body.length + 4, true); head.set([0x57, 0x45, 0x42, 0x50], 8);
    return concat([head, body]);
  }

  /* ---------- GIF ---------- */
  function gifBlocks(b) {
    const n = b.length, blocks = [];
    let i = 13; if (b[10] & 0x80) i += 3 << ((b[10] & 7) + 1);
    blocks.push({ t: 'head', s: 0, e: Math.min(i, n) });
    const subs = j => { while (j < n && b[j] !== 0) j += b[j] + 1; return Math.min(j + 1, n); };
    while (i < n) {
      const c = b[i];
      if (c === 0x3B) { blocks.push({ t: 'end', s: i, e: i + 1 }); break; }
      if (c === 0x21) {
        const label = b[i + 1], app = label === 0xFF ? str(b, i + 3, Math.min(11, b[i + 2])) : '', e = subs(i + 2);
        blocks.push({ t: 'ext', label, app, s: i, e }); i = e; continue;
      }
      if (c === 0x2C) {
        let j = i + 10; if (b[i + 9] & 0x80) j += 3 << ((b[i + 9] & 7) + 1);
        const e = subs(j + 1); blocks.push({ t: 'img', s: i, e }); i = e; continue;
      }
      blocks.push({ t: 'junk', s: i, e: n }); break;
    }
    return blocks;
  }
  const gifKeep = (k, o) => k.label === 0xF9 || k.label === 0x01 ||
    (k.label === 0xFF && (/^(NETSCAPE2\.0|ANIMEXTS1\.0)/.test(k.app) || (o.keepIcc && k.app.startsWith('ICCRGBG1'))));
  function analyzeGif(b, out) {
    for (const k of gifBlocks(b)) {
      if (k.t !== 'ext') continue;
      if (k.label === 0xFE) {
        let t = '', j = k.s + 2; while (j < k.e && b[j]) { t += L1.decode(b.subarray(j + 1, j + 1 + b[j])); j += b[j] + 1; }
        out.push(F('meta', 'GIF', 'Chú thích trong file', t)); aiScan(t, 'GIF', out);
      } else if (k.label === 0xFF && k.app === 'XMP DataXMP') {
        const m = U8.decode(b.subarray(k.s, k.e)).match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/);
        xmpFindings(m ? m[0] : '', out);
      } else if (k.label === 0xFF && k.app.startsWith('ICCRGBG1')) out.push(F('info', 'ICC', 'Hồ sơ màu ICC'));
      else if (!gifKeep(k, { keepIcc: true })) out.push(F('meta', 'GIF', 'Khối mở rộng ' + (k.app || '0x' + k.label.toString(16)), kb(k.e - k.s)));
    }
  }
  function stripGif(b, o) {
    const blocks = gifBlocks(b), parts = [];
    for (const k of blocks) if (k.t !== 'ext' || gifKeep(k, o)) parts.push(b.subarray(k.s, k.e));
    if (blocks[blocks.length - 1].t !== 'end') parts.push(Uint8Array.of(0x3B));
    return concat(parts);
  }

  /* ---------- API ---------- */
  async function analyze(bytes) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const format = detectFormat(b), out = [], info = { orientation: 1 };
    try {
      if (format === 'jpeg') analyzeJpeg(b, out, info);
      else if (format === 'png') await analyzePng(b, out, info);
      else if (format === 'webp') analyzeWebp(b, out, info);
      else if (format === 'gif') analyzeGif(b, out);
      else scanGeneric(b, out, info, NAME[format]);
    } catch (e) {
      out.push(F('meta', 'Lỗi', 'Không đọc hết được metadata (file có thể bị hỏng)'));
    }
    const seen = new Set(), findings = out.filter(f => { const k = f.group + '|' + f.label; return seen.has(k) ? false : seen.add(k); });
    return { format, findings, orientation: info.orientation, hasAi: findings.some(f => f.level === 'ai') };
  }

  function strip(bytes, opts) {
    const o = Object.assign({ keepOrientation: true, keepIcc: true }, opts);
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const f = detectFormat(b);
    if (f === 'jpeg') return stripJpeg(b, o);
    if (f === 'png') return stripPng(b, o);
    if (f === 'webp') return stripWebp(b, o);
    if (f === 'gif') return stripGif(b, o);
    throw new Error('UNSUPPORTED');
  }

  /* ---------- ZIP (store, không nén — ảnh vốn đã nén) ---------- */
  function zipParts(files, date) {
    const d = date || new Date(), enc = new TextEncoder(), parts = [], central = [];
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const day = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    let off = 0, cdLen = 0;
    for (const f of files) {
      const nm = enc.encode(f.name), crc = crc32(f.data), sz = f.data.length;
      const lh = new Uint8Array(30 + nm.length), l = new DataView(lh.buffer);
      l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x0800, true);
      l.setUint16(10, time, true); l.setUint16(12, day, true); l.setUint32(14, crc, true);
      l.setUint32(18, sz, true); l.setUint32(22, sz, true); l.setUint16(26, nm.length, true); lh.set(nm, 30);
      const ch = new Uint8Array(46 + nm.length), c = new DataView(ch.buffer);
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(12, time, true); c.setUint16(14, day, true); c.setUint32(16, crc, true);
      c.setUint32(20, sz, true); c.setUint32(24, sz, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true); ch.set(nm, 46);
      parts.push(lh, f.data); central.push(ch); off += lh.length + sz; cdLen += ch.length;
    }
    const end = new Uint8Array(22), e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cdLen, true); e.setUint32(16, off, true);
    return [...parts, ...central, end];
  }

  const api = { analyze, strip, canStrip, detectFormat, zipParts, crc32, concat, kb, MIME, EXT, NAME };
  root.AIMeta = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
