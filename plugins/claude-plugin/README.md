# futa-xoa-nhan-ai — Plugin cho Claude

Gửi ảnh cho Claude và nói **“xoá nhãn AI”** (hoặc “ảnh này có nhãn AI không?”). Claude sẽ:

1. Kiểm tra từng ảnh: có C2PA / IPTC “ảnh do AI tạo” / prompt / GPS… hay không.
2. Gỡ sạch metadata — ảnh JPG, PNG, WebP, GIF giữ nguyên từng điểm ảnh; AVIF/HEIC được vẽ lại.
3. Tự kiểm tra lại file kết quả và gửi ảnh sạch (hoặc file ZIP) kèm báo cáo ngắn.

Xử lý ngay trên máy/phiên làm việc, không gửi ảnh ra dịch vụ bên ngoài.

**Yêu cầu:** Node.js ≥ 18. Với AVIF/HEIC cần thêm Python + Pillow (`pip install pillow pillow-heif`).

**Không xoá được:** watermark ẩn trong điểm ảnh (SynthID…) và logo nhìn thấy được.
