# Plugin “Xoá nhãn AI khỏi ảnh”

Ba bản đóng gói của công cụ [`remove-ai/`](../remove-ai/), dùng chung một lõi xử lý (`remove-ai/js/meta.js`; bản WordPress là bản chuyển sang PHP cho ra kết quả giống hệt từng byte).
Tất cả đều gỡ C2PA, IPTC “ảnh do AI tạo”, XMP, EXIF (kể cả GPS), prompt… mà **không nén lại ảnh** JPG/PNG/WebP/GIF, và không gửi ảnh ra dịch vụ bên ngoài.

| File cài đặt (trong `dist/`) | Dành cho | Dùng thế nào |
|---|---|---|
| `futa-xoa-nhan-ai-chrome.zip` | Chrome, Edge, Cốc Cốc, Brave | Bấm biểu tượng tiện ích → mở công cụ · **chuột phải vào ảnh trên web → “Xoá nhãn AI khỏi ảnh này”** |
| `futa-xoa-nhan-ai.plugin` | Claude (Cowork / Claude Code) | Gửi ảnh và nói “xoá nhãn AI” → Claude kiểm tra, làm sạch, trả ảnh + báo cáo |
| `futa-xoa-nhan-ai-wordpress.zip` | Website WordPress | Tự xoá khi tải ảnh lên · cột “Nhãn AI” trong Thư viện · xử lý hàng loạt |

## Cài đặt

### Tiện ích Chrome / Edge
1. Giải nén `futa-xoa-nhan-ai-chrome.zip` vào một thư mục cố định (đừng xoá thư mục này sau khi cài).
2. Mở `chrome://extensions` (Edge: `edge://extensions`) → bật **Chế độ nhà phát triển** → **Tải tiện ích đã giải nén** → chọn thư mục vừa giải nén.
3. Ghim biểu tượng “AI gạch chéo” lên thanh công cụ.

Khi chuột phải vào ảnh mà trang web chặn tải trực tiếp, tiện ích sẽ hỏi xin quyền đọc ảnh **riêng tên miền đó** — tiện ích không xin quyền truy cập mọi trang web lúc cài.
Muốn phát hành cho cả công ty mà không cần chế độ nhà phát triển: nộp chính file zip này lên Chrome Web Store (để chế độ “Không công khai”).

### Plugin cho Claude
- **Cowork:** kéo file `futa-xoa-nhan-ai.plugin` vào khung chat (hoặc Cài đặt → Plugins → tải lên) → bấm cài.
- **Claude Code:** giải nén vào một thư mục rồi chạy `claude --plugin-dir <thư mục>`.
- Cần Node.js ≥ 18. Ảnh AVIF/HEIC cần thêm Python + Pillow (`pip install pillow pillow-heif`).

### Plugin WordPress
1. Quản trị → **Plugins → Cài mới → Tải plugin lên** → chọn `futa-xoa-nhan-ai-wordpress.zip` → Cài đặt → Kích hoạt.
2. Từ giờ ảnh tải lên tự được làm sạch (bản gốc + ảnh thu nhỏ). Ảnh cũ: **Media → Xoá nhãn AI → “Quét & xoá toàn bộ thư viện”** (nên sao lưu trước — file trên máy chủ bị ghi đè).
3. Tuỳ chỉnh ở **Cài đặt → Media**: bật/tắt tự động, giữ hướng xoay, giữ hồ sơ màu ICC.
4. Ảnh AVIF/HEIC không cắt trực tiếp được → cột “Nhãn AI” chỉ đường sang công cụ vẽ lại ngay trong trang quản trị.

Yêu cầu: WordPress ≥ 5.8, PHP ≥ 7.4. Đã chạy thử trên WordPress 7.1.3 / PHP 8.3.

## Đóng gói lại sau khi sửa code

```bash
node plugins/build.js
```
Script lấy trang công cụ + lõi xử lý từ `remove-ai/`, ghép với phần riêng của từng plugin rồi xuất 3 file vào `plugins/dist/` (file ZIP giống hệt nhau giữa các lần build nếu mã nguồn không đổi). Nhớ tăng số phiên bản ở cả 3 nơi khi phát hành bản mới:
`chrome-extension/manifest.json`, `claude-plugin/.claude-plugin/plugin.json`, `wordpress/futa-xoa-nhan-ai/futa-xoa-nhan-ai.php` (+ `readme.txt`).

```
plugins/
├── build.js                         # đóng gói cả 3 plugin → dist/
├── chrome-extension/                # Manifest V3: background.js (menu chuột phải), js/ext.js (nhận ảnh từ web), icons/
├── claude-plugin/                   # .claude-plugin/plugin.json + skills/xoa-nhan-ai/ (SKILL.md, scripts/xoa-nhan-ai.js, ve-lai-anh.py)
├── wordpress/futa-xoa-nhan-ai/      # futa-xoa-nhan-ai.php, includes/class-futa-ai-meta.php (lõi PHP), includes/class-futa-xna-plugin.php
└── dist/                            # 3 file cài đặt đã đóng gói sẵn
```

**Giới hạn chung:** chỉ xoá metadata — watermark ẩn trong điểm ảnh (Google SynthID…) và logo nhìn thấy được vẫn còn, nền tảng vẫn có thể tự nhận diện ảnh AI. Ảnh phối cảnh dự án dùng AI vẫn nên ghi “Hình ảnh mang tính minh hoạ”.
