=== FUTA Land — Xoá nhãn AI khỏi ảnh ===
Contributors: futaland
Tags: ai label, c2pa, metadata, exif, privacy
Requires at least: 5.8
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 1.1.0
License: GPL-2.0-or-later

Tự động gỡ metadata C2PA, IPTC, XMP, EXIF (thứ khiến Facebook/Instagram gắn nhãn “Thông tin về AI”) khỏi ảnh khi tải lên — không nén lại ảnh.

== Description ==

* **Tự động khi tải ảnh lên** (Thư viện, trình soạn thảo, REST API): cắt bỏ khối C2PA / Content Credentials, mã IPTC “ảnh do AI tạo”, XMP, EXIF (kể cả GPS), prompt Stable Diffusion/ComfyUI… khỏi ảnh JPG, PNG, WebP, GIF động. Điểm ảnh giữ nguyên, dung lượng thường giảm.
* **Cột “Nhãn AI”** trong Thư viện (chế độ danh sách) + nút “Xoá ngay”, thao tác hàng loạt “Xoá nhãn AI”, ô trạng thái trong cửa sổ chi tiết ảnh.
* **Media → Xoá nhãn AI**: quét & xoá toàn bộ ảnh đã có, kèm công cụ xử lý ảnh ngay trên trình duyệt (cho ảnh AVIF/HEIC hoặc ảnh chưa tải lên).
* **Cài đặt → Media**: bật/tắt tự động, giữ hướng xoay, giữ hồ sơ màu ICC.

Không gửi ảnh ra dịch vụ bên ngoài. Không xoá được watermark ẩn trong điểm ảnh (SynthID…) hay logo nhìn thấy được.

== Installation ==

1. Plugins → Cài mới → Tải plugin lên → chọn `futa-xoa-nhan-ai-wordpress.zip` → Cài đặt → Kích hoạt.
2. Ảnh tải lên từ giờ sẽ tự được làm sạch. Với ảnh cũ: Media → Xoá nhãn AI → “Quét & xoá toàn bộ thư viện”.

== Changelog ==

= 1.1.0 =
* Giao diện công cụ mới: bản đồ file trước/sau theo dung lượng thật, nền sáng/tối, nút thử với ảnh mẫu.
* Đọc đúng mô tả XMP tiếng Việt.

= 1.0.0 =
* Phát hành lần đầu.
