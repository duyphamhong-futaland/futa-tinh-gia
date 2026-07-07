/* ============================================================
   FUTA Land Estella · policies.js
   Registry CHÍNH SÁCH BÁN HÀNG THẬT (đối chứng file Excel "Tổng hợp
   chính sách … đang triển khai", cập nhật 03/07/2026). Nguồn sự thật
   trong app cho 3 dự án đang triển khai: FUTA Residence (CT3&7),
   FUTA Kim Phát (C5B), FUTA Kim An (H&A).

   Dùng:
   - Màn "Chính sách đang áp dụng" (SCREENS['policy-active']).
   - C5BTpl tra cứu CK theo phương thức (Vay/Chuẩn/Nhanh) khi in HĐMB C5B.
   ============================================================ */
window.SCREENS = window.SCREENS || {};

const POL = (function () {
  const UPDATED = '03/07/2026';

  const PROJECTS = [
    {
      key: 'residence', name: 'FUTA Residence (CT3 & CT7) — Đà Nẵng Times Square',
      active: [
        ['CSBH 02/FUTA Residence/KH/04.2026', '15/04/2026', 'Ưu đãi gói dịch vụ quản lý + nội thất + chiết khấu',
          'Miễn phí 2 năm DVQL; tặng gói nội thất (Studio/1PN 100tr, 2PN 200tr — hoàn thiện ≤45 ngày); KH thân thiết 1%; Thanh toán Nhanh 95% → CK 10%; mua sỉ 2 căn 2% / từ 3 căn 4%; HTLS 12 tháng'],
        ['CSBS 01/ĐN Times square/KH/06.2026', '16/06/2026', 'Tri ân "KH giới thiệu KH"',
          'Studio/1PN (100tr) & Căn hộ 2PN (200tr)'],
        ['CSTN 02/ĐN Times square/ĐL/12.2025', '22/12/2025', 'Thưởng nóng Sale & Đại lý',
          'Sale: Studio/1PN/2PN & Shophouse 20tr · Penthouse 100tr · 2PN Ocean Panorama (mã 03,04) 300tr. Đại lý: Studio/1PN/2PN 10tr'],
        ['CSTN/FUTA Residence/ĐL/04.2026', '15/04/2026', 'Thưởng nóng Sale & Đại lý (cập nhật)',
          'Sale: Studio/1PN/2PN 40tr/giao dịch. Đại lý: 10tr/giao dịch'],
        ['CS Hỗ trợ Marketing/ĐL/07.2026', '01/07/2026', 'Hỗ trợ chi phí Marketing cho Đại lý',
          '10.000.000 đồng/giao dịch (từ 01/07/2026)'],
      ],
      expired: [
        ['CSBH 02/ĐN Times square/KH/11.2025', '01/11/2025', 'CK 10% đặc biệt (36 căn) — trước thuế & phí bảo trì'],
        ['CSBH 01/ĐN Times square/KH/11.2025', '01/11/2025', 'Miễn phí 2 năm DVQL'],
        ['CSBH 03/ĐN Times square/KH/11.2025', '01/11/2025', 'Nhóm gia đình: 2 căn 2% / 3+ căn 4%'],
      ],
    },
    {
      key: 'c5b', name: 'FUTA Kim Phát (C5B)',
      active: [
        ['CSBH 03/FUTA KIMPHAT/KH/07.2026', '01/07/2026', 'Chính sách hiện hành T7: mua sỉ, thân thiết, đặc quyền T7, nhanh, HTLS',
          'Mua sỉ 2 căn 1% / từ 3 căn 2%; KH thân thiết 1%; ĐẶC QUYỀN THÁNG 07: CK 5% (mua 01–30/07/2026); HTLS 12 tháng; Thanh toán Nhanh 50% → CK 6% / Nhanh 70% → CK 10%'],
        ['CSBH 03/FUTA KIMPHAT/KH/06.2026', '18/06/2026', 'PTTT chuẩn (không vay NH) + Thanh toán nhanh',
          'Chuẩn: CK 3% trước VAT (TT 30% GTHĐ gồm VAT, đúng tiến độ đợt 1). Nhanh: CK 6% trước VAT (TT 50% GTHĐ đợt 1)'],
        ['CSTN 01/FUTA KIMPHAT/ĐL/06.2026', '18/06/2026', 'Thưởng nóng Sale & Đại lý',
          'Townhouse & Shophouse — Sale 40tr/giao dịch · Đại lý 10tr/giao dịch'],
        ['CSBS 02/FUTA KIMPHAT/KH/06.2026', '16/06/2026', 'Tri ân "KH giới thiệu KH"',
          'Townhouse (100tr) & Shophouse (200tr)'],
      ],
      expired: [
        ['CSBS 02/FUTA KIMPHAT/KH/04.2026', '25/03/2026', '⚠️ CK 5% cho KH VAY NH (TT đủ 20% GTHĐ trong 1 ngày); HTLS 18→12 tháng — ĐÃ HẾT HIỆU LỰC'],
        ['CSBH 01/FUTA KIMPHAT/KH/01.2026', '10/01/2026', 'Mua sỉ 1%/2%; Early Bird 1%; thân thiết 1%; Nhanh 70% 10%; HTLS 18 tháng'],
      ],
      // ngoại giao 5% (theo bảng tổng hợp)
      diplomatic: 0.05,
    },
    {
      key: 'kiman', name: 'FUTA Kim An (H&A)',
      active: [
        ['CSBH 03/FUTA Kim An/ĐL/04.2026', '01/04/2026', 'Chiết khấu CB-NV / Ngoại giao + hoa hồng môi giới',
          'CB-NV: CK 2% trước thuế (sp chuyển cọc thành công); KH Ngoại giao: CK 5% trước thuế. Hoa hồng môi giới 2% (sau ký HĐMB & TT đủ 20% đợt 2)'],
        ['CSBH 01/FUTA Kim An/KH/04.2026', '01/04/2026', 'Gói ưu đãi KH (DVQL, Early Bird, nhanh, mua sỉ, HTLS)',
          'Miễn phí 2 năm DVQL; Early Bird 1% (25/4–5/5); CK đặc biệt 1% (TT đủ đợt 1 ngày mở bán); thân thiết 1%; mua sỉ 2 căn 1% / 3+ căn 2%; Nhanh 50% 5% / 70% 7% / 95% 9%; HTLS 12 tháng'],
        ['CSBH 01/FUTA Kim An/KH/04.2026 (bs)', '15/04/2026', 'Chiết khấu đặc biệt + mua sỉ số lượng lớn',
          'CK 2% (TT đủ 20% trong ngày 25/04); mua sỉ 5–9 căn 5%; từ 10 căn 5%'],
      ],
      expired: [],
    },
  ];

  /* Bảng % chính sách "máy đọc được" (đối chứng file 03/07/2026) — công thức giá ăn theo đây.
     methods = phương thức thanh toán (CK trên giá trước VAT). muaSi = chiết khấu theo số căn.
     Kim Phát 07/2026: thêm "đặc quyền Tháng 07" CK 5% (mua trong 01–30/07/2026) — nhập ở ô "đặc biệt". */
  const RATES = {
    residence: {
      methods: [
        { key: 'thuong', label: 'PTTT giãn (chuẩn)', pct: 0, dot: [
          {ten:'Đợt 1 (Ký HĐMB)',tyLe:20,coc:true},{ten:'Đợt 2',tyLe:10},{ten:'Đợt 3',tyLe:10},{ten:'Đợt 4',tyLe:10},
          {ten:'Đợt 5',tyLe:10},{ten:'Đợt 6',tyLe:10},{ten:'Đợt 7',tyLe:10},{ten:'Đợt 8 (Bàn giao)',tyLe:15,vatGcn:true},{ten:'Đợt 9 (Cấp GCN)',tyLe:5,gcn:true} ] },
        { key: 'vay', label: 'PTTT Vay (vay ngân hàng)', pct: 0, dot: [
          {ten:'Đợt 1 (Ký HĐMB)',tyLe:20,coc:true},{ten:'Đợt 2 (Ngân hàng)',tyLe:50},{ten:'Đợt 3 (KH — Phí bảo trì)',pbt:true},
          {ten:'Đợt 3 (Ngân hàng)',tyLe:25,vatGcn:true},{ten:'Đợt 4 (Ngân hàng — Cấp GCN)',tyLe:5,gcn:true} ] },
        { key: 'nhanh95', label: 'Nhanh 95%', pct: 0.10, dot: [
          {ten:'Đợt 1 (Ký HĐMB)',tyLe:30,coc:true},{ten:'Đợt 2',tyLe:40},{ten:'Đợt 3',tyLe:25,vatGcn:true},{ten:'Đợt 4 (Cấp GCN)',tyLe:5,gcn:true} ] },
      ],
      muaSi: [{ min: 3, pct: 0.04 }, { min: 2, pct: 0.02 }], thanThiet: 0.01, ngoaiGiao: 0.10, htls: '12 tháng',
    },
    c5b: {
      methods: [{ key: 'chuan', label: 'PTTT chuẩn — TT 30%', pct: 0.03 }, { key: 'nhanh', label: 'Nhanh 50% — TT 50%', pct: 0.06 },
                { key: 'nhanh70', label: 'Nhanh 70%', pct: 0.10 }, { key: 'vay', label: 'Khách vay NH', pct: 0 }],
      muaSi: [{ min: 3, pct: 0.02 }, { min: 2, pct: 0.01 }], thanThiet: 0.01, dacQuyenT7: 0.05, htls: '12 tháng',
    },
    kiman: {
      methods: [{ key: 'thuong', label: 'Tiêu chuẩn', pct: 0 }, { key: 'nhanh50', label: 'Nhanh 50%', pct: 0.05 },
                { key: 'nhanh70', label: 'Nhanh 70%', pct: 0.07 }, { key: 'nhanh95', label: 'Nhanh 95%', pct: 0.09 }],
      muaSi: [{ min: 10, pct: 0.10 }, { min: 5, pct: 0.05 }, { min: 3, pct: 0.02 }, { min: 2, pct: 0.01 }],
      thanThiet: 0.01, earlyBird: 0.01, dacBiet: 0.01, noiBo: 0.02, ngoaiGiao: 0.05, htls: '12 tháng',
    },
  };

  function byKey(k) { return PROJECTS.find(p => p.key === k); }
  function byName(name) {
    if (!name) return null;
    const s = String(name).toLowerCase();
    if (/kim ph[áa]t|c5b/.test(s)) return byKey('c5b');
    if (/times square|residence|ct3|ct7/.test(s)) return byKey('residence');
    if (/kim an|h\s*&\s*a|h&a/.test(s)) return byKey('kiman');
    return null;
  }
  function rates(k) { return RATES[k] || null; }
  function methods(k) { return (RATES[k] || {}).methods || []; }
  function discount(k, methodKey) {
    return methods(k).find(m => m.key === methodKey) || { key: '', label: '', pct: 0 };
  }
  function muaSiPct(k, soCan) {
    const hit = ((RATES[k] || {}).muaSi || []).find(x => (soCan || 0) >= x.min);
    return hit ? hit.pct : 0;
  }

  /* CK theo phương thức cho C5B — phục vụ auto-điền HĐMB (giữ tương thích) */
  function c5bDiscount(method) {
    switch (method) {
      case 'chuan': return { pct: 0.03, label: 'PTTT chuẩn — TT 30%', note: 'CK 3% trước VAT · TT 30% GTHĐ (gồm VAT) đúng tiến độ đợt 1' };
      case 'nhanh': return { pct: 0.06, label: 'Nhanh 50% — TT 50%', note: 'CK 6% trước VAT · TT 50% GTHĐ đợt 1 (hoặc Nhanh 70% → CK 10%)' };
      case 'vay': return { pct: 0, label: 'Khách vay ngân hàng', note: 'Không chiết khấu (CK 5% đã HẾT HIỆU LỰC 04.2026) · HTLS 12 tháng' };
      default: return { pct: 0, label: '', note: '' };
    }
  }

  return { UPDATED, PROJECTS, RATES, c5bDiscount, byKey, byName, rates, methods, discount, muaSiPct };
})();
