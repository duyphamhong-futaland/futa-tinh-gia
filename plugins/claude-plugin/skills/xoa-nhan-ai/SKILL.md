---
name: xoa-nhan-ai
description: >
  Dùng skill này khi người dùng muốn "xoá nhãn AI", "gỡ nhãn AI khỏi ảnh", "xoá metadata ảnh",
  "làm sạch ảnh trước khi đăng Facebook", "kiểm tra ảnh có nhãn AI không", "vì sao Facebook gắn nhãn
  Thông tin về AI", "remove AI label", "strip C2PA / EXIF / XMP", hoặc gửi kèm ảnh (JPG, PNG, WebP, GIF,
  AVIF, HEIC) tạo/chỉnh bằng ChatGPT, Gemini, Firefly, Midjourney, Canva, Photoshop… và lo bị gắn nhãn
  “Thông tin về AI” / “AI info” / “Made with AI”. Phát hiện và gỡ metadata C2PA, IPTC digital source type,
  XMP, EXIF (kể cả GPS), prompt Stable Diffusion/ComfyUI ngay trên máy, không nén lại ảnh.
metadata:
  version: "1.0.0"
---

# Xoá nhãn AI khỏi ảnh

Công cụ `scripts/xoa-nhan-ai.js` (Node.js ≥ 18, không cần cài thêm gói) đọc từng khối metadata của ảnh,
chỉ ra dấu vết AI rồi cắt bỏ — điểm ảnh giữ nguyên, file kết quả được tự kiểm tra lại.
Đường dẫn `scripts/` tính từ thư mục của skill này.

## Quy trình

1. **Xác định ảnh đầu vào**: file người dùng đính kèm / tải lên trong phiên, hoặc đường dẫn, thư mục họ nêu.
   Không bao giờ gửi ảnh lên dịch vụ bên ngoài để xử lý.
2. **Chỉ hỏi “có nhãn AI không?”** → chạy chế độ kiểm tra, không ghi file:
   `node "<skill>/scripts/xoa-nhan-ai.js" --check --json <ảnh...>`
3. **Xoá nhãn** → ghi ảnh sạch vào thư mục đầu ra mà người dùng mở được (Cowork: thư mục outputs của phiên;
   Claude Code: thư mục người dùng chọn, mặc định cạnh ảnh gốc). Không bao giờ ghi đè ảnh gốc:
   `node "<skill>/scripts/xoa-nhan-ai.js" --out "<thư mục đầu ra>" --json <ảnh hoặc thư mục...>`
   Từ 3 ảnh trở lên thì thêm `--zip "<thư mục đầu ra>/anh-da-xoa-nhan-ai.zip"` để gửi một file.
4. **Đọc JSON và báo cáo ngắn gọn bằng tiếng Việt**, mỗi ảnh một dòng hoặc một hàng bảng:
   - `hasAi` + `aiSummary` → có nhãn AI không, đến từ đâu (C2PA, IPTC, tên công cụ);
   - `metadata` → thông tin riêng tư đáng chú ý (📍 GPS, thiết bị, tác giả…);
   - `removed`, `sizeBefore` → `sizeAfter`, `output` → đã xoá bao nhiêu mục, file ở đâu;
   - `remaining` → mục giữ lại có chủ đích (hướng xoay, hồ sơ màu ICC — không chứa dấu hiệu AI);
   - `stillAi: true` hoặc `error` → nói rõ, không được báo là đã sạch.
5. **Giao file**: đưa đường dẫn/liên kết tới ảnh sạch (hoặc file ZIP) để người dùng tải về.

## Tuỳ chọn

| Tuỳ chọn | Khi nào dùng |
|---|---|
| `--no-orientation` | Người dùng muốn xoá cả thông tin hướng xoay (ảnh có thể bị nằm ngang) |
| `--no-icc` | Muốn xoá cả hồ sơ màu ICC |
| `--suffix ""` | Giữ nguyên tên file gốc (bắt buộc dùng `--out` khác thư mục gốc) |
| `--zip <file>` | Gom ảnh sạch vào một file ZIP |

Mặc định giữ hướng xoay và hồ sơ màu vì chúng không chứa dấu hiệu AI và giúp ảnh hiển thị đúng.

## Định dạng

- **JPG, PNG/APNG, WebP, GIF động**: cắt metadata trực tiếp, không nén lại (`method` = cắt metadata).
- **AVIF, HEIC, TIFF, BMP**: không cắt trực tiếp được → script tự vẽ lại bằng Python Pillow (`scripts/ve-lai-anh.py`)
  thành JPG (hoặc PNG nếu có nền trong suốt). Nếu báo lỗi thiếu Pillow / không đọc được HEIC, thử
  `pip install pillow pillow-heif` khi môi trường cho phép rồi chạy lại; nếu không được, hướng dẫn người dùng
  chuyển ảnh sang JPG trước hoặc dùng công cụ web “Xoá nhãn AI khỏi ảnh” của FUTA Land.

## Điều cần nói rõ với người dùng

- Công cụ chỉ xoá **metadata**. Watermark ẩn trong điểm ảnh (Google SynthID…) và logo nhìn thấy được vẫn còn,
  nên nền tảng vẫn có thể tự nhận diện ảnh AI bằng hệ thống riêng. Không hứa chắc “sẽ không bị gắn nhãn”.
- Ảnh phối cảnh / minh hoạ dự án tạo bằng AI vẫn nên ghi chú “Hình ảnh mang tính minh hoạ” khi đăng quảng cáo,
  và tuân thủ chính sách công bố nội dung AI của từng nền tảng.

Giải thích chi tiết từng loại metadata và cách các nền tảng dùng chúng: xem `references/metadata.md`.
