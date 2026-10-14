"""FUTA Land — Xoá nhãn AI · vẽ lại ảnh AVIF/HEIC/TIFF/BMP bằng Pillow (không mang theo metadata).

Cách dùng: python3 ve-lai-anh.py <ảnh gốc> <đường dẫn đầu ra, không đuôi> <giữ ICC: 1|0>
In ra đường dẫn file kết quả (.jpg, hoặc .png nếu ảnh có nền trong suốt).
"""
import sys

from PIL import Image, ImageOps

try:  # đọc HEIC nếu có pillow-heif
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

src, base, keep_icc = sys.argv[1], sys.argv[2], sys.argv[3] == '1'
im = ImageOps.exif_transpose(Image.open(src))      # xoay đúng chiều vào thẳng điểm ảnh
icc = im.info.get('icc_profile') if keep_icc else None
alpha = im.mode in ('RGBA', 'LA', 'PA') or (im.mode == 'P' and 'transparency' in im.info)
im.info = {}                                        # bỏ EXIF/XMP/… để không bị ghi lại
extra = {'icc_profile': icc} if icc else {}
if alpha:
    out = base + '.png'
    im.convert('RGBA').save(out, 'PNG', **extra)
else:
    out = base + '.jpg'
    im.convert('RGB').save(out, 'JPEG', quality=92, **extra)
print(out)
