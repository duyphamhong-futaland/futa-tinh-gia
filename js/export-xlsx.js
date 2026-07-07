/* ============================================================
   FUTA Land — Công cụ tính giá · export-xlsx.js
   Xuất phiếu tính giá tạm tính ra Excel (ExcelJS): mỗi phương thức
   thanh toán = 1 sheet, CÓ CÔNG THỨC (mở Excel sửa % → tự tính lại),
   watermark logo mờ, chiết khấu tô đỏ, ưu đãi khách nổi bật, NGÀY XUẤT.
   Tách nguyên logic từ Estella (_buildPhieuSheet) — chạy độc lập offline.
   ============================================================ */
function todayVN(){ const d=new Date(); const p=n=>(n<10?'0':'')+n; return p(d.getDate())+'/'+p(d.getMonth()+1)+'/'+d.getFullYear(); }

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
  const d=Pricing.dealCalc(p,{nhanh:method.pct||0,thanThiet:mck.thanThiet,muaSi:mck.muaSi,dacBiet:mck.dacBiet});
  const nm=(method.label||'PT').replace(/[\\\/*?:\[\]]/g,'').slice(0,31);
  const ws=wb.addWorksheet(nm,{views:[{showGridLines:false}]});
  ws.columns=[{width:46},{width:16},{width:12},{width:22},{width:20}];
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
  // Chương trình bán hàng
  C('A6','CHƯƠNG TRÌNH BÁN HÀNG',{head:true,bold:true});C('B6','',{head:true});C('C6','Tỷ lệ',{head:true,bold:true,h:'center'});C('D6','Giá trị (VNĐ)',{head:true,bold:true,h:'right'});C('E6','',{head:true});
  C('A7','(1) Giá niêm yết trước CK (gồm VAT & PBT)',{bold:true});C('D7',d.giaNiemYet,{num:money,h:'right',bold:true});
  C('A8','Giá trị căn bán (chưa VAT) — cơ sở tính CK',{color:'FF6B7785'});C('D8',d.giaCB,{num:money,h:'right',color:'FF6B7785'});
  C('A9','(2) Khách hàng thân thiết');C('C9',+mck.thanThiet||0,{num:pf,h:'center'});F('D9','ROUND(D8*C9,0)',d.lines[0].amount,{color:RED});
  C('A10','(3) Chiết khấu mua sỉ');C('C10',+mck.muaSi||0,{num:pf,h:'center'});F('D10','ROUND((D8-D9)*C10,0)',d.lines[1].amount,{color:RED});
  C('A11','(4) Chiết khấu đặc biệt / khác');C('C11',+mck.dacBiet||0,{num:pf,h:'center'});F('D11','ROUND((D8-D9-D10)*C11,0)',d.lines[2].amount,{color:RED});
  C('A12','(5) Chiết khấu thanh toán nhanh');C('C12',+method.pct||0,{num:pf,h:'center'});F('D12','ROUND((D8-D9-D10-D11)*C12,0)',d.lines[3].amount,{color:RED});
  C('A13','(6) TỔNG ƯU ĐÃI — KHÁCH ĐƯỢC LỢI',{bold:true,fill:GOLD});F('D13','D9+D10+D11+D12',d.tongCK,{bold:true,color:RED,fill:GOLD,size:12});
  C('A14','(7) GIÁ PHẢI THANH TOÁN (7 = 1 − 6)',{bold:true,fill:LG,size:12});F('D14','D7-D13',d.giaPhaiTT,{bold:true,color:GREEN,fill:LG,size:12});
  // Chi tiết báo giá
  ['Giá bán chưa VAT (A)','Phí bảo trì (B) = 2%×A','Thuế GTGT VAT (C)','Tổng GTCH (D)=A+B+C'].forEach((t,i)=>C(String.fromCharCode(65+i)+'16',t,{head:true,bold:true,h:'center',wrap:true}));
  F('A17','ROUND(D14/1.12,0)',Math.round(d.giaPhaiTT/1.12),{h:'right'});
  F('B17','ROUND(A17*0.02,0)',Math.round(d.giaPhaiTT/1.12*0.02),{h:'right'});
  F('C17','ROUND(A17*0.1,0)',Math.round(d.giaPhaiTT/1.12*0.10),{h:'right'});
  F('D17','A17+B17+C17',d.giaPhaiTT,{h:'right',bold:true});
  // Đợt thanh toán
  const dot=(method.dot||Pricing.DEFAULT_DOT||[]);
  const gcn=dot.find(x=>x.gcn); const gp=gcn?(gcn.tyLe/100):0; const vatF='ROUND(D14/1.12*'+gp+'*0.1,0)';
  ['Đợt thanh toán','Thời gian','Tỷ lệ','Giá trị (VNĐ)','Lũy kế'].forEach((t,i)=>C(String.fromCharCode(65+i)+'19',t,{head:true,bold:true,h:i>=2?'right':'left'}));
  let r=20; C('A'+r,'Hợp đồng đặt cọc');C('D'+r,100000000,{num:money,h:'right'});C('E'+r,{formula:'D'+r,result:100000000},{num:money,h:'right',color:'FF6B7785'}); let prevE=r; r++;
  dot.forEach(dt=>{
    C('A'+r,dt.ten,{wrap:true});
    if(dt.pbt){ F('D'+r,'B17',p.kpbt||0); }
    else { C('C'+r,dt.tyLe/100,{num:pf,h:'center'}); const bF='ROUND((D14-B17)*C'+r+',0)', bV=Math.round((d.giaPhaiTT-(p.kpbt||0))*dt.tyLe/100);
      if(dt.coc) F('D'+r,bF+'-100000000',bV-100000000);
      else if(dt.vatGcn) F('D'+r,bF+'+'+vatF,bV+Math.round(d.giaPhaiTT/1.12*gp*0.1));
      else if(dt.gcn) F('D'+r,bF+'-'+vatF,bV-Math.round(d.giaPhaiTT/1.12*gp*0.1));
      else F('D'+r,bF,bV);
    }
    C('E'+r,{formula:'E'+prevE+'+D'+r,result:0},{num:money,h:'right',color:'FF6B7785'}); prevE=r; r++;
  });
  ws.getRow(1).alignment={wrapText:true,vertical:'middle',horizontal:'center'};
}
