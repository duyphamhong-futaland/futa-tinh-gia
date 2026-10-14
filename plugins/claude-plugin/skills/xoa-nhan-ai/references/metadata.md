# Các loại metadata khiến ảnh bị gắn nhãn AI

Dùng khi người dùng hỏi “vì sao ảnh bị gắn nhãn”, “xoá những gì”, “có an toàn không”.

| Loại | Nằm ở đâu trong file | Chứa gì | Ảnh hưởng |
|---|---|---|---|
| **C2PA / Content Credentials** | JPEG: khối APP11 (JUMBF) · PNG: chunk `caBX` · WebP: chunk `C2PA` · AVIF/HEIC: hộp `uuid` | Chữ ký số ghi phần mềm tạo/ký (ChatGPT, DALL·E, Firefly, Gemini, Copilot, Photoshop Generative Fill…), các thao tác, thường kèm ảnh thu nhỏ 100 KB+ | Meta, TikTok, LinkedIn đọc để gắn nhãn AI |
| **IPTC Digital Source Type** | Trong XMP hoặc trong C2PA | `trainedAlgorithmicMedia` = ảnh do AI tạo; `compositeWithTrainedAlgorithmicMedia` = có vùng sửa bằng AI | Meta gắn nhãn “Thông tin về AI” |
| **XMP** | JPEG APP1, PNG iTXt `XML:com.adobe.xmp`, WebP `XMP `, GIF | Phần mềm tạo, lịch sử chỉnh sửa, mô tả, tác giả | Lộ nguồn gốc |
| **PNG text** | tEXt / zTXt / iTXt | Prompt, seed, sampler (Stable Diffusion `parameters`), workflow ComfyUI (`prompt`, `workflow`), NovelAI | Lộ prompt |
| **EXIF** | JPEG APP1, PNG `eXIf`, WebP `EXIF` | Thiết bị, phần mềm, thời gian, toạ độ GPS, ảnh thu nhỏ, số serial | Lộ thông tin riêng tư |
| **Khác** | APP13 Photoshop/IPTC, COM, MPF, dữ liệu sau EOI | Chú thích, ảnh phụ, video Motion Photo | Dư thừa |

## Được giữ lại mặc định
- **Hướng xoay (Orientation)**: ghi lại thành EXIF tối giản chỉ có thẻ này, để ảnh chụp điện thoại không bị nằm ngang.
- **Hồ sơ màu ICC** (Display P3, sRGB…): để màu hiển thị đúng.

## Không xoá được
- Watermark vô hình trong điểm ảnh (Google SynthID, watermark của một số hãng khác).
- Logo/watermark nhìn thấy được trên ảnh.
- Nhận diện bằng bộ phân loại hình ảnh của nền tảng.

## Hai cách xử lý
- **Cắt metadata (lossless)** — JPG/PNG/WebP/GIF: chỉ bỏ các khối dữ liệu phụ, dữ liệu ảnh nén giữ nguyên từng byte.
- **Vẽ lại ảnh** — AVIF/HEIC/TIFF/BMP: giải mã rồi lưu file mới không kèm metadata; JPG được nén lại ở chất lượng 92.
