# FUTA Land — Công cụ tính giá tạm tính (độc lập)

Công cụ **chạy 100% offline**, không cần internet/server. Dùng để tính giá tạm tính cho khách hàng — chọn căn, áp chiết khấu, xem ngay **ưu đãi khách được lợi**, rồi **xuất Excel** hoặc **in phiếu**.

Dùng được **2 cách**: (a) mở trực tiếp `index.html` bằng trình duyệt, hoặc (b) cài **app desktop** (Mac / Windows) đóng gói bằng Electron — dữ liệu lưu trên máy người dùng, quản lý & cập nhật dự án ngay trong app.

## 🖥️ App desktop (Electron)
- **Cài đặt:** dùng file trong `dist/` (hoặc `~/Downloads/FUTA-TinhGia-Installers/`):
  - macOS Apple Silicon: `FUTA Land - Tinh gia-1.0.0-arm64.dmg`
  - macOS Intel: `FUTA Land - Tinh gia-1.0.0.dmg`
  - Windows (cài đặt): `FUTA Land - Tinh gia Setup 1.0.0.exe`
  - Windows (chạy ngay, không cài): `FUTA Land - Tinh gia 1.0.0.exe`
  - ⚠️ Chưa ký số (code signing) → lần đầu mở: **macOS** bấm chuột phải → *Mở*; **Windows** SmartScreen → *More info → Run anyway*.
- **Dữ liệu lưu trên máy người dùng:** `userData/futa-pricing-data.json` (macOS: `~/Library/Application Support/FUTA Land - Tinh gia/`). Lần đầu tự nạp từ bộ dữ liệu đóng gói; sau đó mọi thay đổi/thêm dự án lưu tại đây.
- **Quản lý & cập nhật dự án:** nút **⚙ Quản lý dữ liệu** → thêm/sửa/xoá dự án & căn · **nhập bảng giá từ Excel** (có template mẫu) · **sao lưu/khôi phục** (.json) · khôi phục dữ liệu gốc.

### Chạy dev / build lại
```bash
cd pricing-tool
npm install
npm start            # chạy thử app desktop
npm run dist:mac     # đóng gói .dmg (Mac)
npm run dist:win     # đóng gói .exe (Windows x64) — build được ngay trên Mac, không cần Wine
```
Muốn app **có logo & không cảnh báo bảo mật**: ký số (Apple Developer ID / Windows code-signing cert) — hiện đang bỏ qua.

## Cách dùng
1. Mở tệp **`index.html`** bằng trình duyệt (Chrome/Edge/Safari) — bấm đúp là chạy.
2. Chọn **dự án** → **tháp/khu** → bấm vào **căn** cần tính (hoặc gõ mã ở ô tìm kiếm).
3. Chọn **phương thức thanh toán**, nhập thêm **chiết khấu** (thân thiết / mua sỉ / đặc biệt) nếu có.
4. Xem **Tổng ưu đãi** (khách được lợi) + **Giá phải thanh toán** + **tiến độ thanh toán**.
5. **⬇ Xuất Excel** (mỗi phương thức 1 sheet, có công thức + watermark + ngày xuất) hoặc **🖨 In phiếu** (A4, tô đậm/màu chiết khấu cho khách xem).

## Dữ liệu
- Bao gồm **toàn bộ căn của các dự án FUTA Land đang triển khai** (Đà Nẵng Times Square + Futa Kim Phát C5B).
- Dữ liệu là **snapshot** (ngày hiển thị ở góc phải trên). **Không chứa thông tin khách hàng.**
- **Cập nhật dữ liệu sau này:** thay tệp `js/data.js` (mảng `window.PRICING_UNITS` + `window.PRICING_SNAPSHOT_DATE`). Có thể trích lại từ hệ thống Estella hoặc từ file bảng giá.

## Cấu trúc
```
pricing-tool/
├── index.html            # mở tệp này
├── css/style.css
├── js/
│   ├── config.js         # hằng số giá (QSD/KPBT/VAT)
│   ├── pricing.js        # engine tính giá + chiết khấu (dealCalc)
│   ├── policies.js       # chính sách + phương thức + tiến độ từng dự án
│   ├── data.js           # DỮ LIỆU CÁC CĂN (snapshot)
│   ├── export-xlsx.js    # xuất Excel (ExcelJS, công thức, watermark, ngày)
│   └── app.js            # giao diện
├── vendor/exceljs.min.js # thư viện Excel (nhúng sẵn, offline)
└── img/                  # logo + watermark

```

*Giá mang tính tạm tính tại ngày xuất. Giá trị chính thức theo hợp đồng mua bán. FUTA Land — Chất lượng là danh dự.*
