/* ============================================================
   FUTA Land — Công cụ tính giá tạm tính (độc lập, offline)
   Chọn căn → nhập chiết khấu → xem giá + lợi ích khách → xuất Excel / in phiếu.
   ============================================================ */
function fmtVN(n){ return (Math.round(+n||0)).toLocaleString('vi-VN'); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function pct(v){ return (+((+v||0)*100).toFixed(2))+'%'; }
function toast(msg,type){ let t=document.getElementById('toast'); if(!t){t=document.createElement('div');t.id='toast';document.body.appendChild(t);}
  t.textContent=msg; t.className='show '+(type||''); clearTimeout(window._tt); window._tt=setTimeout(()=>t.className='',2600); }

const State = { unit:null, method:'', manual:{thanThiet:0,muaSi:0,dacBiet:0}, proj:'', block:'', q:'' };

function projName(u){ const p=(window.PRICING_PROJECTS||[]).find(x=>x.id===(u&&u.duAnId)); return p?p.ten:(u&&u.duAnId)||''; }
/* Gói nội thất tặng (chỉ DNTS): Studio/1PN 100tr · 2PN 200tr — theo loại căn */
function goiNoiThat(u){
  if(!u || u.duAnId!=='P_DNTS' || typeof POL==='undefined') return 0;
  const nt=(POL.rates('residence')||{}).noiThat||{};
  return nt[String(u.loai||'').toLowerCase().replace(/\s/g,'')]||0;
}
function blocksOf(projId){ const s={}; (window.PRICING_UNITS||[]).forEach(u=>{ if(!projId||u.duAnId===projId) if(u.block) s[u.block]=1; }); return Object.keys(s).sort(); }

function unitList(){
  let list=(window.PRICING_UNITS||[]).slice();
  if(State.proj) list=list.filter(u=>u.duAnId===State.proj);
  if(State.block) list=list.filter(u=>u.block===State.block);
  const q=(State.q||'').toLowerCase().trim();
  if(q) list=list.filter(u=>(u.ma||'').toLowerCase().includes(q)||(u.loai||'').toLowerCase().includes(q));
  return list;
}

/* ---- Bộ phương thức + chiết khấu chính sách của căn ---- */
function polOf(u){ return (typeof POL!=='undefined')?POL.byName(projName(u)):null; }
function methodsOf(u){ const pol=polOf(u); return pol?POL.methods(pol.key):[{key:'thuong',label:'Tiêu chuẩn',pct:0,dot:Pricing.DEFAULT_DOT}]; }
function currentDeal(){
  const u=State.unit; const ms=methodsOf(u);
  const method=ms.find(m=>m.key===State.method)||ms[0]||{key:'',label:'',pct:0};
  const deal=Pricing.dealCalc(u,{nhanh:method.pct||0, thanThiet:State.manual.thanThiet, muaSi:State.manual.muaSi, dacBiet:State.manual.dacBiet});
  return {deal, method, methods:ms};
}
/* Lịch thanh toán theo phương thức (cùng logic xuất Excel) */
function scheduleRows(u, deal, method){
  const dot=(method.dot||Pricing.DEFAULT_DOT||[]);
  const gcn=dot.find(x=>x.gcn); const gp=gcn?(gcn.tyLe/100):0;
  const A=deal.giaPhaiTT/1.12;                 // giá bán chưa VAT (sau CK)
  const kpbtVal=Math.round(A*0.02);            // phí bảo trì theo giá sau CK
  const vatGcn=Math.round(A*gp*0.1);           // VAT của phần GCN (đợt cuối)
  const base=deal.giaPhaiTT-kpbtVal;           // = giá trị căn hộ gồm VAT
  const rows=[{ten:'Hợp đồng đặt cọc', tyLe:null, soTien:100000000, tg:'Ngày lập phiếu ('+todayVN()+')'}];
  dot.forEach(dt=>{
    let soTien;
    if(dt.pbt){ soTien=kpbtVal; }
    else {
      soTien=Math.round(base*dt.tyLe/100);     // % trên giá trị căn hộ gồm VAT
      if(dt.kpbt) soTien+=kpbtVal;             // + phí bảo trì
      if(dt.vatGcn) soTien+=vatGcn;            // + VAT của 5% cuối
      if(dt.gcn) soTien-=vatGcn;               // − VAT (đợt cuối không gồm VAT)
      if(dt.coc) soTien-=100000000;            // − đặt cọc
    }
    rows.push({ten:dt.ten, tyLe:dt.pbt?null:dt.tyLe, soTien, tg:(typeof schedTimeStr==='function'?schedTimeStr(dt):(dt.tg||''))});
  });
  let acc=0; rows.forEach(r=>{ acc+=r.soTien; r.luyKe=acc; });
  return rows;
}

/* ---- Render ---- */
async function init(){
  try{ const d=await DataStore.load();
    if(d){ if(d.projects) window.PRICING_PROJECTS=d.projects; if(d.units) window.PRICING_UNITS=d.units; if(d.snapshotDate) window.PRICING_SNAPSHOT_DATE=d.snapshotDate; }
  }catch(e){}
  refreshApp();
}
function refreshApp(){
  document.getElementById('snapDate').textContent = window.PRICING_SNAPSHOT_DATE||'';
  document.getElementById('unitCount').textContent = (window.PRICING_UNITS||[]).length;
  if(State.proj && !(window.PRICING_PROJECTS||[]).some(p=>p.id===State.proj)) State.proj='';
  renderProjTabs(); renderBlockChips(); renderList();
  if(State.unit && !(window.PRICING_UNITS||[]).some(u=>u.ma===State.unit.ma)){ State.unit=null; renderDetail(); }
}
function renderProjTabs(){
  const el=document.getElementById('projTabs');
  const tabs=[{id:'',ten:'Tất cả dự án'}].concat((window.PRICING_PROJECTS||[]).map(p=>({id:p.id,ten:p.ten})));
  el.innerHTML=tabs.map(t=>`<button class="tab ${State.proj===t.id?'on':''}" onclick="setProj('${t.id}')">${esc(t.ten)}</button>`).join('');
}
function renderBlockChips(){
  const el=document.getElementById('blockChips');
  const bs=blocksOf(State.proj);
  el.innerHTML=`<button class="chip ${!State.block?'on':''}" onclick="setBlock('')">Tất cả</button>`+
    bs.map(b=>`<button class="chip ${State.block===b?'on':''}" onclick="setBlock('${b}')">${esc(b)}</button>`).join('');
}
function renderList(){
  const list=unitList();
  document.getElementById('listCount').textContent=list.length;
  const rows=list.slice(0,400).map(u=>`<tr class="${State.unit&&State.unit.ma===u.ma?'sel':''}" onclick="selectUnit('${esc(u.ma)}')">
    <td><b>${esc(u.ma)}</b></td><td>${esc(u.block||'')}</td><td>${esc(u.loai||'')}</td>
    <td class="r">${u.ttuy?(+u.ttuy).toFixed(1):''}</td>
    <td class="r"><b>${fmtVN(u.giaTong||u.giaVAT||u.giaCB)}</b></td></tr>`).join('');
  document.getElementById('unitRows').innerHTML=rows||`<tr><td colspan="5" class="empty">Không có căn phù hợp</td></tr>`;
  if(list.length>400) document.getElementById('listMore').textContent='Hiển thị 400/'+list.length+' căn — gõ tìm kiếm để thu hẹp';
  else document.getElementById('listMore').textContent='';
}
function setProj(id){ State.proj=id; State.block=''; renderProjTabs(); renderBlockChips(); renderList(); }
function setBlock(b){ State.block=b; renderBlockChips(); renderList(); }
function onSearch(v){ State.q=v; renderList(); }

function selectUnit(ma){
  State.unit=(window.PRICING_UNITS||[]).find(u=>u.ma===ma); if(!State.unit) return;
  const ms=methodsOf(State.unit); State.method=(ms[0]||{}).key||'';
  renderList(); renderDetail();
  // Mobile: mở phần tính giá full màn hình (khỏi cuộn qua danh sách dài)
  if(window.innerWidth<=900){ document.body.classList.add('show-detail'); window.scrollTo(0,0); }
}
function backToList(){ document.body.classList.remove('show-detail'); window.scrollTo(0,0); }
function setMethod(k){ State.method=k; renderDetail(); }
function setCK(kind,v){ State.manual[kind]=Math.max(0,(+v||0))/100; renderDetailNumbers(); }

function renderDetail(){
  const wrap=document.getElementById('detail');
  const u=State.unit;
  if(!u){ document.body.classList.remove('show-detail'); wrap.innerHTML=`<div class="empty-detail">👈 Chọn một căn ở danh sách để tính giá</div>`; return; }
  const {methods}=currentDeal();
  wrap.innerHTML=`
    <button class="d-back" onclick="backToList()">✕ Đóng bảng tính</button>
    <div class="d-head">
      <div><div class="d-ma">${esc(u.ma)}</div><div class="d-sub">${esc(projName(u))} · ${esc(u.block||'')}${u.tang?(' · Tầng '+esc(u.tang)):''}${u.loai?(' · '+esc(u.loai)):''}</div></div>
      <div class="d-acts">
        <button class="btn ghost" onclick="printPhieu()">🖨 In phiếu</button>
        <button class="btn primary" onclick="doExport()">⬇ Xuất Excel</button>
      </div>
    </div>
    <div class="d-grid">
      <div class="fld"><label>DT thông thủy</label><div class="val">${u.ttuy?(+u.ttuy).toFixed(2)+' m²':'—'}</div></div>
      <div class="fld"><label>DT tim tường</label><div class="val">${u.tim?(+u.tim).toFixed(2)+' m²':'—'}</div></div>
      <div class="fld"><label>Đơn giá</label><div class="val">${u.donGia?fmtVN(u.donGia)+' đ/m²':'—'}</div></div>
      ${u.huong?`<div class="fld"><label>Hướng ban công</label><div class="val">${esc(u.huong)}</div></div>`:''}
      ${u.huongCua?`<div class="fld"><label>Hướng cửa chính</label><div class="val">${esc(u.huongCua)}</div></div>`:''}
      ${u.view?`<div class="fld"><label>View / Vị trí</label><div class="val">${esc(u.view)}${u.viTri?' · '+esc(u.viTri):''}</div></div>`:''}
    </div>
    ${goiNoiThat(u)?`<div class="noithat-box">🎁 <b>Tặng gói nội thất trị giá ${fmtVN(goiNoiThat(u))}đ</b> — hoàn thiện nội thất trong 45 ngày kể từ ngày bàn giao · ưu đãi khấu trừ trực tiếp vào giá bán</div>`:''}
    <div class="ck-box">
      <div class="ck-title">Phương thức thanh toán</div>
      <select id="methodSel" onchange="setMethod(this.value)">${methods.map(m=>`<option value="${m.key}"${m.key===State.method?' selected':''}>${esc(m.label)}${m.pct?(' — CK '+pct(m.pct)):''}</option>`).join('')}</select>
      <div class="ck-title" style="margin-top:12px">Chiết khấu thêm (tuỳ chọn)</div>
      <div class="ck-inputs">
        <label>Thân thiết <span>%</span><input type="number" min="0" step="0.5" value="${State.manual.thanThiet*100||''}" oninput="setCK('thanThiet',this.value)"></label>
        <label>Mua sỉ <span>%</span><input type="number" min="0" step="0.5" value="${State.manual.muaSi*100||''}" oninput="setCK('muaSi',this.value)"></label>
        <label>Đặc biệt <span>%</span><input type="number" min="0" step="0.5" value="${State.manual.dacBiet*100||''}" oninput="setCK('dacBiet',this.value)"></label>
      </div>
    </div>
    <div id="detailNumbers"></div>`;
  renderDetailNumbers();
}
function renderDetailNumbers(){
  if(!State.unit) return;
  const {deal,method}=currentDeal();
  const line=(label,amount,pctVal)=>`<div class="pr-row"><span>${label}${pctVal?` <em>(${pct(pctVal)})</em>`:''}</span><b class="minus">− ${fmtVN(amount)}</b></div>`;
  let ckHtml='';
  if(deal.lines[0].amount) ckHtml+=line('Khách hàng thân thiết',deal.lines[0].amount,State.manual.thanThiet);
  if(deal.lines[1].amount) ckHtml+=line('Chiết khấu mua sỉ',deal.lines[1].amount,State.manual.muaSi);
  if(deal.lines[2].amount) ckHtml+=line('Chiết khấu đặc biệt',deal.lines[2].amount,State.manual.dacBiet);
  if(deal.lines[3].amount) ckHtml+=line('Thanh toán nhanh',deal.lines[3].amount,method.pct);
  const rows=scheduleRows(State.unit,deal,method);
  document.getElementById('detailNumbers').innerHTML=`
    <div class="pr-card">
      <div class="pr-row big"><span>Giá niêm yết (gồm VAT & PBT)</span><b>${fmtVN(deal.giaNiemYet)}</b></div>
      ${ckHtml||'<div class="pr-row muted"><span>Chưa áp chiết khấu</span><b>0</b></div>'}
      <div class="benefit"><span>🎁 TỔNG ƯU ĐÃI — Khách được lợi</span><b>− ${fmtVN(deal.tongCK)} đ</b></div>
      <div class="final"><span>GIÁ PHẢI THANH TOÁN</span><b>${fmtVN(deal.giaPhaiTT)} đ</b></div>
    </div>
    <div class="sched">
      <div class="sched-h">Tiến độ thanh toán — <b>${esc(method.label)}</b></div>
      <table><thead><tr><th>Đợt</th><th>Thời gian</th><th class="r">Tỷ lệ</th><th class="r">Số tiền (đ)</th><th class="r">Luỹ kế</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${esc(r.ten)}</td><td style="color:#5b6573">${esc(r.tg||'')}</td><td class="r">${r.tyLe!=null?r.tyLe+'%':''}</td><td class="r">${fmtVN(r.soTien)}</td><td class="r muted">${fmtVN(r.luyKe)}</td></tr>`).join('')}</tbody></table>
    </div>
    <div class="note">Phiếu tạm tính — ngày ${todayVN()}. Giá trị cuối theo hợp đồng chính thức.</div>`;
}

function doExport(){ if(!State.unit){toast('Chọn căn trước','err');return;}
  exportPhieuXLSX(State.unit, State.manual, projName(State.unit)); }

/* ---- In phiếu A4 (đậm + tô màu chiết khấu để khách thấy lợi ích) ---- */
function printPhieu(){
  if(!State.unit){toast('Chọn căn trước','err');return;}
  const u=State.unit; const {deal,method}=currentDeal();
  const rows=scheduleRows(u,deal,method);
  const ckLine=(label,amount)=>amount?`<tr><td>${label}</td><td class="r red">− ${fmtVN(amount)}</td></tr>`:'';
  const w=window.open('','_blank'); if(!w){toast('Cho phép pop-up để in','err');return;}
  const html=`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Phiếu tính giá ${esc(u.ma)}</title><style>
    @page{size:A4;margin:14mm}*{box-sizing:border-box}
    body{font-family:'Times New Roman',serif;color:#111;font-size:13pt;max-width:190mm;margin:0 auto}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1B7F3B;padding-bottom:8px}
    .brand b{color:#1B7F3B;font-size:15pt}.brand small{color:#666}
    .date{font-size:10.5pt;color:#444;text-align:right}
    h1{text-align:center;color:#1B7F3B;font-size:16pt;margin:14px 0 4px;text-transform:uppercase}
    .sub{text-align:center;color:#555;margin-bottom:12px}
    table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #999;padding:6px 9px;font-size:11.5pt}
    th{background:#1B7F3B;color:#fff}.r{text-align:right}.red{color:#C0102E;font-weight:bold}
    .info td{border:none;padding:2px 6px}.info b{display:inline-block;min-width:150px;color:#444;font-weight:normal}
    .benefit{background:#FFF3D6;border:1.5px solid #E0B84D;border-radius:6px;padding:10px 14px;margin:10px 0;display:flex;justify-content:space-between;font-weight:bold;font-size:13.5pt}
    .benefit b{color:#C0102E}
    .final{background:#E2F6E6;border:1.5px solid #1B7F3B;border-radius:6px;padding:12px 14px;display:flex;justify-content:space-between;font-weight:bold;font-size:15pt}
    .final b{color:#1B7F3B}
    .sign{display:flex;justify-content:space-around;margin-top:34px;text-align:center;font-weight:bold}
    .foot{margin-top:16px;color:#666;font-size:10pt;font-style:italic;text-align:center}
    .bar{background:#1B7F3B;color:#fff;padding:8px 12px;margin-bottom:12px;font-family:Arial;font-size:13px;display:flex;gap:12px}
    .bar button{background:#fff;color:#1B7F3B;border:none;border-radius:5px;padding:5px 14px;font-weight:bold;cursor:pointer}
    @media print{.bar{display:none}}
  </style></head><body>
  <div class="bar"><button onclick="window.print()">🖨 In / Lưu PDF</button><span>Phiếu tính giá ${esc(u.ma)}</span></div>
  <div class="top"><div class="brand"><b>FUTA LAND</b><br><small>Chất lượng là danh dự</small></div>
    <div class="date">Ngày xuất phiếu:<br><b>${todayVN()}</b></div></div>
  <h1>Phiếu tính giá (tạm tính)</h1>
  <div class="sub">Dự án: <b>${esc(projName(u))}</b> — Phương thức: <b>${esc(method.label)}</b></div>
  <table class="info"><tr><td><b>Mã sản phẩm:</b> ${esc(u.ma)}</td><td><b>Tháp/Khu:</b> ${esc(u.block||'—')}</td></tr>
    <tr><td><b>Tầng/Lô:</b> ${esc(u.tang||u.lo||'—')}</td><td><b>Loại:</b> ${esc(u.loai||'—')}</td></tr>
    <tr><td><b>DT thông thủy:</b> ${u.ttuy?(+u.ttuy).toFixed(2)+' m²':'—'}</td><td><b>DT tim tường:</b> ${u.tim?(+u.tim).toFixed(2)+' m²':'—'}</td></tr>
    ${(u.huong||u.huongCua)?`<tr><td><b>Hướng ban công:</b> ${esc(u.huong||'—')}</td><td><b>Hướng cửa chính:</b> ${esc(u.huongCua||'—')}</td></tr>`:''}
    ${(u.view||u.viTri)?`<tr><td colspan="2"><b>View / Vị trí:</b> ${esc([u.view,u.viTri].filter(Boolean).join(' · '))}</td></tr>`:''}</table>
  ${goiNoiThat(u)?`<div style="background:#fff5e6;border:1px solid #f0d29a;border-radius:6px;padding:8px 12px;margin:8px 0;color:#8a5a00;font-size:11.5pt">🎁 <b>Tặng gói nội thất trị giá ${fmtVN(goiNoiThat(u))}đ</b> — hoàn thiện nội thất trong 45 ngày kể từ ngày bàn giao · ưu đãi khấu trừ trực tiếp vào giá bán</div>`:''}
  <table><tr><th>Chương trình bán hàng</th><th class="r">Giá trị (VNĐ)</th></tr>
    <tr><td><b>Giá niêm yết (gồm VAT & PBT)</b></td><td class="r"><b>${fmtVN(deal.giaNiemYet)}</b></td></tr>
    ${ckLine('Khách hàng thân thiết',deal.lines[0].amount)}
    ${ckLine('Chiết khấu mua sỉ',deal.lines[1].amount)}
    ${ckLine('Chiết khấu đặc biệt / khác',deal.lines[2].amount)}
    ${ckLine('Chiết khấu thanh toán nhanh',deal.lines[3].amount)}
  </table>
  <div class="benefit"><span>🎁 TỔNG ƯU ĐÃI — Quý khách được lợi</span><b>− ${fmtVN(deal.tongCK)} đ</b></div>
  <div class="final"><span>GIÁ PHẢI THANH TOÁN</span><b>${fmtVN(deal.giaPhaiTT)} đ</b></div>
  <table><tr><th>Đợt thanh toán</th><th>Thời gian</th><th class="r">Tỷ lệ</th><th class="r">Số tiền (VNĐ)</th><th class="r">Luỹ kế</th></tr>
    ${rows.map(r=>`<tr><td>${esc(r.ten)}</td><td style="font-size:10.5pt">${esc(r.tg||'')}</td><td class="r">${r.tyLe!=null?r.tyLe+'%':''}</td><td class="r">${fmtVN(r.soTien)}</td><td class="r">${fmtVN(r.luyKe)}</td></tr>`).join('')}
  </table>
  <div class="sign"><div>KHÁCH HÀNG<br><span style="font-weight:normal;color:#666">(Ký, ghi rõ họ tên)</span></div>
    <div>TƯ VẤN VIÊN<br><span style="font-weight:normal;color:#666">(Ký, ghi rõ họ tên)</span></div></div>
  <div class="foot">Phiếu mang tính tạm tính tại ngày xuất. Giá trị chính thức theo hợp đồng mua bán. FUTA Land.</div>
  </body></html>`;
  w.document.write(html); w.document.close(); w.focus();
}

document.addEventListener('DOMContentLoaded', init);
