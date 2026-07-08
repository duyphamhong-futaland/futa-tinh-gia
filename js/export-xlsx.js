/* ============================================================
   FUTA Land — Công cụ tính giá · export-xlsx.js
   Xuất phiếu tính giá tạm tính ra Excel (ExcelJS): mỗi phương thức
   thanh toán = 1 sheet, CÓ CÔNG THỨC (mở Excel sửa % → tự tính lại),
   watermark logo mờ, chiết khấu tô đỏ, ưu đãi khách nổi bật, NGÀY XUẤT.
   Tách nguyên logic từ Estella (_buildPhieuSheet) — chạy độc lập offline.
   ============================================================ */
function todayVN(){ const d=new Date(); const p=n=>(n<10?'0':'')+n; return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear(); }
function fmtDateVN(d){ const p=n=>(n<10?'0':'')+n; return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear(); }
/* Thời gian/thời hạn đóng của 1 đợt — tính THEO NGÀY LẬP PHIẾU (hôm nay).
   dt.tgD = số ngày kể từ hôm nay · dt.tgM = số tháng · dt.tg = nhãn/sự kiện. */
function schedTimeStr(dt){
  if(!dt) return '';
  if(dt.tgD!=null){ const d=new Date(); d.setDate(d.getDate()+dt.tgD); return (dt.tg?dt.tg+' ':'')+'(≈ '+fmtDateVN(d)+')'; }
  if(dt.tgM!=null){ const d=new Date(); d.setMonth(d.getMonth()+dt.tgM); return (dt.tg?dt.tg+' — ':'≈ ')+fmtDateVN(d); }
  return dt.tg||'';
}

function _ensureExcelJS(cb){ if(window.ExcelJS){cb();return;}
  const s=document.createElement('script'); s.src='vendor/exceljs.min.js';
  s.onload=()=>cb(); s.onerror=()=>toast('Không tải được thư viện Excel','err'); document.head.appendChild(s); }
function _wmBase64(cb){ if(window._wmB64!==undefined){cb(window._wmB64);return;}
  fetch('img/watermark-futa.png').then(r=>r.blob()).then(b=>{const fr=new FileReader();fr.onload=()=>{window._wmB64=fr.result;cb(fr.result);};fr.readAsDataURL(b);})
  .catch(()=>{window._wmB64=null;cb(null);}); }

// p: object căn ; mck:{thanThiet,muaSi,dacBiet} (% thập phân) ; projName: tên dự án
function exportPhieuXLSX(p, mck, projName){
  mck = mck || {thanThiet:0,muaSi:0,dacBiet:0};
  _ensureExcelJS(()=>_wmBase64((wm)=>{
    const pol=(typeof POL!=='undefined')?POL.byName(projName):null;
    const methods=(pol?POL.methods(pol.key):[{key:'thuong',label:'Tiêu chuẩn',pct:0,dot:Pricing.DEFAULT_DOT}]);
    const wb=new ExcelJS.Workbook(); wb.creator='FUTA Land'; wb.created=new Date();
    const wmId=(wm)?wb.addImage({base64:wm,extension:'png'}):null;
    const dateStr=todayVN();
    methods.forEach(m=>_buildPhieuSheet(wb,p,m,mck,projName,wmId,dateStr));
    wb.xlsx.writeBuffer().then(buf=>{
      const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
      a.download='Phieu-tinh-gia-'+p.ma+'-'+dateStr.replace(/\//g,'')+'.xlsx'; a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),2500);
      toast('Đã xuất phiếu '+p.ma+' — '+methods.length+' phương thức');
    }).catch(e=>toast('Lỗi xuất Excel: '+e.message,'err'));
  }));
}

function _buildPhieuSheet(wb,p,method,mck,proj,wmId,dateStr){
  const d=Pricing.dealCalc(p,{nhanh:method.pct||0,thanThiet:mck.thanThiet,muaSi:mck.muaSi,dacBiet:mck.dacBiet,custom:mck.custom});
  const nm=(method.label||'PT').replace(/[\\\/*?:\[\]]/g,'').slice(0,31);
  const ws=wb.addWorksheet(nm,{views:[{showGridLines:false}]});
  ws.columns=[{width:40},{width:24},{width:10},{width:22},{width:20}];
  const GREEN='FF1B7F3B', LG='FFE2F6E6', GOLD='FFFFF3D6', RED='FFC0392B', money='#,##0', pf='0.00%';
  const bd={top:{style:'thin',color:{argb:'FFD0D7E2'}},left:{style:'thin',color:{argb:'FFD0D7E2'}},bottom:{style:'thin',color:{argb:'FFD0D7E2'}},right:{style:'thin',color:{argb:'FFD0D7E2'}}};
  function C(addr,val,o){ o=o||{}; const c=ws.getCell(addr); c.value=val;
    if(o.num) c.numFmt=o.num;
    c.font={bold:!!o.bold,size:o.size||11,color:{argb:o.color||(o.head?'FFFFFFFF':'FF1F2733')}};
    if(o.head) c.fill={type:'pattern',pattern:'solid',fgColor:{argb:GREEN}};
    else if(o.fill) c.fill={type:'pattern',pattern:'solid',fgColor:{argb:o.fill}};
    c.alignment={vertical:'middle',horizontal:o.h||'left',wrapText:!!o.wrap};
    if(o.border!==false) c.border=bd;
    return c;
  }
  const F=(addr,formula,result,o)=>C(addr,{formula:formula,result:Math.round(result||0)},Object.assign({num:money,h:'right'},o||{}));
  // Tiêu đề + NGÀY XUẤT + watermark
  ws.mergeCells('A1:E1'); C('A1','Dự án: '+proj+' — '+(method.label||'')+'\nPHIẾU TÍNH GIÁ (TẠM TÍNH)',{bold:true,size:13,head:true,h:'center',wrap:true,border:false}); ws.getRow(1).height=42;
  ws.mergeCells('A2:E2'); C('A2','Ngày xuất phiếu: '+dateStr+'   ·   FUTA Land — Chất lượng là danh dự',{size:10,color:'FF6B7785',h:'center',border:false});
  if(wmId!=null){ try{ ws.addImage(wmId,{tl:{col:0.4,row:6.3},ext:{width:540,height:304},editAs:'absolute'}); }catch(e){} }
  // Thông tin căn
  ['Mã SP','Tháp/Khu','Tầng','Loại','DT thông thủy (m²)'].forEach((t,i)=>C(String.fromCharCode(65+i)+'3',t,{head:true,bold:true,h:'center'}));
  C('A4',p.ma,{h:'center'});C('B4',p.block||'',{h:'center'});C('C4',p.tang||'',{h:'center'});C('D4',p.loai||'',{h:'center'});C('E4',p.ttuy||0,{h:'center',num:'0.00'});
  // Hướng căn hộ + View (dòng 5)
  if(p.huong||p.huongCua||p.view){
    ws.mergeCells('A5:E5');
    const hInfo='🧭 Hướng ban công: '+(p.huong||'—')+'   ·   Cửa chính: '+(p.huongCua||'—')+(p.view?('   ·   View: '+p.view):'')+(p.viTri?('   ·   '+p.viTri):'');
    C('A5',hInfo,{size:10.5,bold:true,color:'FF1B7F3B',border:false});
  }
  // ===== Chương trình bán hàng (số dòng động — chèn dòng nội thất khi có) =====
  let r=6;
  const rHead=r; C('A'+r,'CHƯƠNG TRÌNH BÁN HÀNG',{head:true,bold:true});C('B'+r,'',{head:true});C('C'+r,'Tỷ lệ',{head:true,bold:true,h:'center'});C('D'+r,'Giá trị (VNĐ)',{head:true,bold:true,h:'right'});C('E'+r,'',{head:true}); r++;
  const rNY=r; C('A'+rNY,'(1) Giá niêm yết trước CK (gồm VAT & PBT)',{bold:true});C('D'+rNY,d.giaNiemYet,{num:money,h:'right',bold:true}); r++;
  const rCB=r; C('A'+rCB,'Giá trị căn bán (chưa VAT) — cơ sở tính CK',{color:'FF6B7785'});C('D'+rCB,d.giaCB,{num:money,h:'right',color:'FF6B7785'}); r++;
  const rThan=r; C('A'+rThan,'(2) Khách hàng thân thiết');C('C'+rThan,+mck.thanThiet||0,{num:pf,h:'center'});F('D'+rThan,'ROUND(D'+rCB+'*C'+rThan+',0)',d.lines[0].amount,{color:RED}); r++;
  const rMua=r; C('A'+rMua,'(3) Chiết khấu mua sỉ');C('C'+rMua,+mck.muaSi||0,{num:pf,h:'center'});F('D'+rMua,'ROUND((D'+rCB+'-D'+rThan+')*C'+rMua+',0)',d.lines[1].amount,{color:RED}); r++;
  const rDac=r; C('A'+rDac,'(4) Chiết khấu đặc biệt / khác');C('C'+rDac,+mck.dacBiet||0,{num:pf,h:'center'});F('D'+rDac,'ROUND((D'+rCB+'-D'+rThan+'-D'+rMua+')*C'+rDac+',0)',d.lines[2].amount,{color:RED}); r++;
  const rNhanh=r; C('A'+rNhanh,'(5) Chiết khấu thanh toán nhanh');C('C'+rNhanh,+method.pct||0,{num:pf,h:'center'});F('D'+rNhanh,'ROUND((D'+rCB+'-D'+rThan+'-D'+rMua+'-D'+rDac+')*C'+rNhanh+',0)',d.lines[3].amount,{color:RED}); r++;
  const rCustom=[];
  (d.custom||[]).forEach((c,idx)=>{ const rr=r; C('A'+rr,'('+(6+idx)+') '+(c.text||'Chiết khấu thêm'),{wrap:true});C('D'+rr,c.amount,{num:money,h:'right',color:RED}); rCustom.push(rr); r++; });
  const rTong=r; C('A'+rTong,'TỔNG ƯU ĐÃI — KHÁCH ĐƯỢC LỢI',{bold:true,fill:GOLD});F('D'+rTong,'D'+rThan+'+D'+rMua+'+D'+rDac+'+D'+rNhanh+rCustom.map(rr=>'+D'+rr).join(''),d.tongCK,{bold:true,color:RED,fill:GOLD,size:12}); r++;
  const rTT=r; C('A'+rTT,'GIÁ PHẢI THANH TOÁN (= (1) − TỔNG ƯU ĐÃI)',{bold:true,fill:LG,size:12});F('D'+rTT,'D'+rNY+'-D'+rTong,d.giaPhaiTT,{bold:true,color:GREEN,fill:LG,size:12}); r++;
  r++; // dòng trống ngăn cách
  // Chi tiết báo giá
  const rDetH=r; ['Giá bán chưa VAT (A)','Phí bảo trì (B) = 2%×A','Thuế GTGT VAT (C)','Tổng GTCH (D)=A+B+C'].forEach((t,i)=>C(String.fromCharCode(65+i)+rDetH,t,{head:true,bold:true,h:'center',wrap:true})); r++;
  const rDet=r;
  F('A'+rDet,'ROUND(D'+rTT+'/1.12,0)',Math.round(d.giaPhaiTT/1.12),{h:'right'});
  F('B'+rDet,'ROUND(A'+rDet+'*0.02,0)',Math.round(d.giaPhaiTT/1.12*0.02),{h:'right'});
  F('C'+rDet,'ROUND(A'+rDet+'*0.1,0)',Math.round(d.giaPhaiTT/1.12*0.10),{h:'right'});
  F('D'+rDet,'A'+rDet+'+B'+rDet+'+C'+rDet,d.giaPhaiTT,{h:'right',bold:true}); r++;
  r++; // dòng trống ngăn cách
  // Đợt thanh toán
  const dot=(method.dot||Pricing.DEFAULT_DOT||[]);
  const gcn=dot.find(x=>x.gcn); const gp=gcn?(gcn.tyLe/100):0; const vatF='ROUND(D'+rTT+'/1.12*'+gp+'*0.1,0)';
  const rSchH=r; ['Đợt thanh toán','Thời gian','Tỷ lệ','Giá trị (VNĐ)','Lũy kế'].forEach((t,i)=>C(String.fromCharCode(65+i)+rSchH,t,{head:true,bold:true,h:i>=2?'right':'left'})); r++;
  C('A'+r,'Hợp đồng đặt cọc');C('B'+r,'Ngày lập phiếu ('+dateStr+')',{color:'FF6B7785',wrap:true});C('D'+r,100000000,{num:money,h:'right'});C('E'+r,{formula:'D'+r,result:100000000},{num:money,h:'right',color:'FF6B7785'}); let prevE=r; r++;
  const kpbtR=Math.round(d.giaPhaiTT/1.12*0.02);   // phí bảo trì theo giá sau CK (khớp B{rDet})
  const vGcn=Math.round(d.giaPhaiTT/1.12*gp*0.1);
  dot.forEach(dt=>{
    C('A'+r,dt.ten,{wrap:true});
    C('B'+r,(typeof schedTimeStr==='function'?schedTimeStr(dt):(dt.tg||'')),{color:'FF6B7785',wrap:true});
    if(dt.pbt){ F('D'+r,'B'+rDet,kpbtR); }
    else {
      C('C'+r,dt.tyLe/100,{num:pf,h:'center'});
      let bF='ROUND((D'+rTT+'-B'+rDet+')*C'+r+',0)', bV=Math.round((d.giaPhaiTT-kpbtR)*dt.tyLe/100), fx='', vx=0;
      if(dt.kpbt){ fx+='+B'+rDet; vx+=kpbtR; }
      if(dt.vatGcn){ fx+='+'+vatF; vx+=vGcn; }
      if(dt.gcn){ fx+='-'+vatF; vx-=vGcn; }
      if(dt.coc){ fx+='-100000000'; vx-=100000000; }
      F('D'+r, bF+fx, bV+vx);
    }
    C('E'+r,{formula:'E'+prevE+'+D'+r,result:0},{num:money,h:'right',color:'FF6B7785'}); prevE=r; r++;
  });
  ws.getRow(1).alignment={wrapText:true,vertical:'middle',horizontal:'center'};
}
