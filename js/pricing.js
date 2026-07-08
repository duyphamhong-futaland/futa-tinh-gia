/* ============================================================
   FUTA Land Estella  ·  pricing.js
   Engine "Cơ cấu giá" — tái hiện đúng file Excel "Phiếu tính tiến độ
   thanh toán": từ giá niêm yết → chiết khấu → QSD đất → KPBT 2% →
   giá trị căn → VAT 10% → các đợt thanh toán lũy kế.
   ============================================================ */
const Pricing = (function(){
  const { QSD_RATE, KPBT_RATE, VAT_RATE } = CFG.PRICE;

  /* breakdown(giaNiemYet, dtThongThuy, {khtt, muaSi, khac})  */
  function breakdown(giaNiemYet, dtThongThuy, ck){
    ck = ck || {};
    const tongCK = (ck.khtt||0) + (ck.muaSi||0) + (ck.khac||0);   // (4)
    const giaPhaiTT = Math.max(0, giaNiemYet - tongCK);           // (5)
    const qsd = Math.round(QSD_RATE * (dtThongThuy||0));          // (6) không chịu VAT
    const kpbt = Math.round((giaPhaiTT - qsd) * KPBT_RATE);       // (7) KPBT 2%
    const giaTriCan = giaPhaiTT - qsd - kpbt;                     // (8)
    const vat = Math.round(giaTriCan * VAT_RATE);                 // (9) VAT 10%
    const giaChuaVAT = giaTriCan + qsd;                           // (10)
    const tong = giaChuaVAT + kpbt + vat;                         // = (5)
    return { giaNiemYet, tongCK, giaPhaiTT, qsd, kpbt, giaTriCan, vat, giaChuaVAT, tong };
  }

  /* Tạo lịch các đợt thanh toán từ tổng giá + định nghĩa đợt (tỷ lệ %).
     dotDef: [{ten, mo:'mô tả', tyLe: số %, han:'dd/mm/yyyy'|''}]
     Trả về [{stt, ten, mo, tyLe, han, soTien, daTT, conLai}] (lũy kế). */
  function installments(tong, dotDef){
    let acc = 0;
    return (dotDef||[]).map((d,i)=>{
      const soTien = Math.round(tong * (d.tyLe/100));
      acc += soTien;
      return { stt:i+1, ten:d.ten, mo:d.mo||`${d.tyLe}% Giá Trị Căn Hộ`, tyLe:d.tyLe,
        han:d.han||"", soTien, luyKe:acc, daTT:0, conLai:soTien };
    });
  }

  /* Bộ đợt mặc định (đúng form CS PTTT chuẩn) */
  const DEFAULT_DOT = [
    {ten:"Đăng ký NV", tyLe:5,  mo:"5% Giá Trị Căn Hộ", tg:"Khi đăng ký nguyện vọng"},
    {ten:"Đợt 1", tyLe:5,  mo:"5% Giá Trị Căn Hộ", tg:"Trong 7 ngày từ ký HĐĐC", tgD:7},
    {ten:"Đợt 2", tyLe:10, mo:"10% Giá Trị Căn Hộ", tgM:1},
    {ten:"Đợt 3", tyLe:10, mo:"10% Giá Trị Căn Hộ", tgM:2},
    {ten:"Đợt 4", tyLe:20, mo:"20% Giá Trị Căn Hộ", tgM:3},
    {ten:"Đợt 5", tyLe:20, mo:"20% Giá Trị Căn Hộ", tgM:4},
    {ten:"Đợt 6", tyLe:25, mo:"25% Giá Trị Căn Hộ", tg:"Khi nhận bàn giao"},
    {ten:"Đợt 7", tyLe:5,  mo:"5% Giá Trị Căn Hộ", tg:"Khi cấp GCN"},
  ];

  /* Lãi phạt trễ hạn: số tiền × lãi suất ngày × số ngày trễ */
  function lateInterest(soTien, laiSuatNgay, soNgay){
    return Math.round((soTien||0) * (laiSuatNgay||0) * (soNgay||0));
  }

  /* ============================================================
     dealCalc — tính chiết khấu theo ĐÚNG phiếu tính giá tạm tính.
     Các %CK áp TUẦN TỰ trên "giá chưa VAT" còn lại (thân thiết → mua sỉ →
     đặc biệt → thanh toán nhanh); Giá phải TT = giá niêm yết (gồm VAT&PBT) − tổng CK.
     opts: {thanThiet, muaSi, dacBiet, nhanh} — % dạng thập phân (0.10 = 10%).
     Đối chiếu phiếu CT7-08.07: đặc biệt 1% → 63.774.411; nhanh 10% → 631.366.671;
     tổng 695.141.082; giá phải TT 6.447.592.972. ============================================================ */
  function dealCalc(p, opts){
    opts = opts || {};
    p = p || {};
    const giaCB = Math.round(p.giaCB || 0);                          // giá chưa VAT — base cho %CK
    const giaNiemYet = Math.round(p.giaTong || p.giaVAT || p.giaCB || 0); // giá niêm yết gồm VAT & PBT
    const lines = [
      { key:'thanThiet', label:'Khách hàng thân thiết',       pct:+opts.thanThiet||0, manual:true },
      { key:'muaSi',     label:'Chiết khấu mua sỉ',            pct:+opts.muaSi||0,     manual:true },
      { key:'dacBiet',   label:'Chiết khấu đặc biệt/khác',     pct:+opts.dacBiet||0,   manual:true },
      { key:'nhanh',     label:'Chiết khấu thanh toán nhanh',  pct:+opts.nhanh||0,     manual:false },
    ];
    let running = giaCB, tongCK = 0;
    lines.forEach(l=>{ l.amount = Math.round(running * (l.pct||0)); running -= l.amount; tongCK += l.amount; });
    // Tùy chọn chiết khấu thêm — NHIỀU dòng, mỗi dòng số tiền cố định (VNĐ) + nội dung tự nhập, trừ thẳng vào giá
    const custom = (opts.custom||[])
      .map(c=>({ text:String(c&&c.text||'').trim(), amount:Math.max(0, Math.round(+(c&&c.amount)||0)) }))
      .filter(c=>c.amount>0);
    const customTong = custom.reduce((s,c)=>s+c.amount, 0);
    tongCK += customTong;
    const giaPhaiTT = Math.max(0, giaNiemYet - tongCK);
    const hasManual = ((+opts.thanThiet||0)+(+opts.muaSi||0)+(+opts.dacBiet||0)) > 0 || customTong > 0;   // cần TPKD duyệt
    return { giaCB, giaNiemYet, lines, custom, customTong, tongCK, giaPhaiTT, hasManual };
  }

  return { breakdown, installments, lateInterest, dealCalc, DEFAULT_DOT };
})();
