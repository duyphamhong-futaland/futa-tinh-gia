/* ============================================================
   FUTA Land — Công cụ tính giá · manage.js
   Quản lý dữ liệu (phát triển lâu dài): thêm/sửa/xoá DỰ ÁN & CĂN,
   nhập bảng giá từ Excel, sao lưu/khôi phục. Lưu vào máy qua DataStore.
   ============================================================ */
const Manage = (function(){
  let tab = 'projects', editMa = null, impRows = null;
  const norm = s => String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/đ/g,'d').trim();
  const money = s => Number(String(s==null?'':s).replace(/[^\d.-]/g,''))||0;
  const projName2 = id => { const p=(window.PRICING_PROJECTS||[]).find(x=>x.id===id); return p?p.ten:id; };
  const countUnits = id => (window.PRICING_UNITS||[]).filter(u=>u.duAnId===id).length;

  async function afterChange(msg){
    const r = await DataStore.persist();
    if(r && r.ok===false){ toast('Lưu thất bại: '+(r.error||''),'err'); }
    else if(msg) toast(msg);
    if(typeof refreshApp==='function') refreshApp();
    render();
  }

  function open(){ tab='projects'; editMa=null; render(); }
  function close(){ const el=document.getElementById('manageRoot'); if(el) el.innerHTML=''; }

  function render(){
    let root=document.getElementById('manageRoot');
    if(!root){ root=document.createElement('div'); root.id='manageRoot'; document.body.appendChild(root); }
    const T=(k,label)=>`<button class="mtab ${tab===k?'on':''}" onclick="Manage.go('${k}')">${label}</button>`;
    root.innerHTML=`<div class="m-overlay" onclick="if(event.target===this)Manage.close()">
      <div class="m-modal">
        <div class="m-head"><b>⚙ Quản lý dữ liệu — dự án & căn</b><button class="m-x" onclick="Manage.close()">×</button></div>
        <div class="m-tabs">${T('projects','🏢 Dự án')}${T('unit','🏠 Thêm / sửa căn')}${T('import','📥 Nhập Excel')}${T('backup','💾 Sao lưu')}</div>
        <div class="m-body" id="mBody">${body()}</div>
      </div></div>`;
    if(tab==='backup') showPath();
  }
  function go(k){ tab=k; editMa=null; render(); }

  function body(){
    if(tab==='projects') return projectsTab();
    if(tab==='unit') return unitTab();
    if(tab==='import') return importTab();
    return backupTab();
  }

  /* ---- Dự án ---- */
  function projectsTab(){
    const rows=(window.PRICING_PROJECTS||[]).map(p=>`<tr>
      <td class="code">${esc(p.id)}</td><td><b>${esc(p.ten)}</b></td><td>${esc(p.chuDauTu||'')}</td>
      <td class="r">${countUnits(p.id)}</td>
      <td><button class="mbtn del" onclick="Manage.delProject('${esc(p.id)}')">Xoá</button></td></tr>`).join('');
    return `<div class="m-sec">Danh sách dự án (${(window.PRICING_PROJECTS||[]).length})</div>
      <table class="m-tbl"><thead><tr><th>Mã dự án</th><th>Tên dự án</th><th>Chủ đầu tư</th><th class="r">Số căn</th><th></th></tr></thead>
      <tbody>${rows||'<tr><td colspan="5" class="empty">Chưa có dự án</td></tr>'}</tbody></table>
      <div class="m-sec" style="margin-top:18px">➕ Thêm dự án mới</div>
      <div class="m-grid">
        <label>Mã dự án (tự sinh nếu trống)<input id="pjId" placeholder="VD: P_ABC"></label>
        <label>Tên dự án *<input id="pjTen" placeholder="VD: FUTA Land Riverside"></label>
        <label>Chủ đầu tư<input id="pjCdt" placeholder="VD: FUTA Land"></label>
      </div>
      <div class="m-actions"><button class="mbtn primary" onclick="Manage.addProject()">Thêm dự án</button></div>`;
  }
  function addProject(){
    const ten=(document.getElementById('pjTen').value||'').trim();
    if(!ten){ toast('Nhập tên dự án','err'); return; }
    let id=(document.getElementById('pjId').value||'').trim();
    if(!id) id='P_'+norm(ten).replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,16).toUpperCase();
    if((window.PRICING_PROJECTS||[]).some(p=>p.id===id)){ toast('Mã dự án đã tồn tại','err'); return; }
    window.PRICING_PROJECTS.push({id, ten, chuDauTu:(document.getElementById('pjCdt').value||'').trim()});
    afterChange('Đã thêm dự án '+ten);
  }
  function delProject(id){
    const n=countUnits(id);
    if(!confirm('Xoá dự án "'+projName2(id)+'"'+(n?(' và '+n+' căn thuộc dự án'):'')+'?')) return;
    window.PRICING_PROJECTS=(window.PRICING_PROJECTS||[]).filter(p=>p.id!==id);
    window.PRICING_UNITS=(window.PRICING_UNITS||[]).filter(u=>u.duAnId!==id);
    afterChange('Đã xoá dự án');
  }

  /* ---- Thêm / sửa căn ---- */
  function unitTab(){
    const u = editMa ? (window.PRICING_UNITS||[]).find(x=>x.ma===editMa) : null;
    const g=(k,v)=> (u?(u[k]!=null?u[k]:''):(v||''));
    const projOpts=(window.PRICING_PROJECTS||[]).map(p=>`<option value="${esc(p.id)}"${u&&u.duAnId===p.id?' selected':''}>${esc(p.ten)}</option>`).join('');
    const listRows=(window.PRICING_UNITS||[]).slice(0,60).map(x=>`<tr>
      <td class="code">${esc(x.ma)}</td><td>${esc(projName2(x.duAnId))}</td><td class="r">${fmtVN(x.giaTong||x.giaVAT||x.giaCB)}</td>
      <td><button class="mbtn" onclick="Manage.editUnit('${esc(x.ma)}')">Sửa</button> <button class="mbtn del" onclick="Manage.delUnit('${esc(x.ma)}')">Xoá</button></td></tr>`).join('');
    return `<div class="m-sec">${u?('✏️ Sửa căn '+esc(u.ma)):'➕ Thêm căn mới'}</div>
      <div class="m-grid">
        <label>Dự án *<select id="uProj">${projOpts}</select></label>
        <label>Mã căn *<input id="uMa" value="${esc(g('ma'))}" ${u?'readonly':''} placeholder="VD: CT7-08.09"></label>
        <label>Tháp/Khu (block)<input id="uBlock" value="${esc(g('block'))}"></label>
        <label>Tầng<input id="uTang" value="${esc(g('tang'))}"></label>
        <label>Lô<input id="uLo" value="${esc(g('lo'))}"></label>
        <label>Loại (1PN/2PN…)<input id="uLoai" value="${esc(g('loai'))}"></label>
        <label>DT thông thủy (m²)<input id="uTtuy" type="number" step="0.01" value="${g('ttuy')}"></label>
        <label>DT tim tường (m²)<input id="uTim" type="number" step="0.01" value="${g('tim')}"></label>
        <label>Giá chưa VAT (cơ sở CK) *<input id="uCB" inputmode="numeric" value="${g('giaCB')}"></label>
        <label>Giá gồm VAT<input id="uVAT" inputmode="numeric" value="${g('giaVAT')}"></label>
        <label>Giá bán (gồm VAT & PBT) *<input id="uTong" inputmode="numeric" value="${g('giaTong')}"></label>
        <label>Phí bảo trì KPBT<input id="uKpbt" inputmode="numeric" value="${g('kpbt')}"></label>
        <label>Đơn giá (đ/m²)<input id="uDonGia" inputmode="numeric" value="${g('donGia')}"></label>
      </div>
      <div class="m-actions">
        <button class="mbtn primary" onclick="Manage.saveUnit()">${u?'Lưu thay đổi':'Thêm căn'}</button>
        ${u?'<button class="mbtn" onclick="Manage.go(\'unit\')">Huỷ sửa</button>':''}
      </div>
      <div class="m-sec" style="margin-top:18px">Danh sách căn (60 gần nhất) — sửa/xoá</div>
      <table class="m-tbl"><thead><tr><th>Mã</th><th>Dự án</th><th class="r">Giá bán</th><th></th></tr></thead>
      <tbody>${listRows||'<tr><td colspan="4" class="empty">Chưa có căn</td></tr>'}</tbody></table>`;
  }
  function editUnit(ma){ editMa=ma; render(); document.getElementById('mBody').scrollTop=0; }
  function saveUnit(){
    const v=id=>(document.getElementById(id).value||'').trim();
    const ma=v('uMa'), duAnId=v('uProj');
    if(!ma){ toast('Nhập mã căn','err'); return; }
    if(!duAnId){ toast('Chọn dự án','err'); return; }
    let giaTong=money(v('uTong')), giaCB=money(v('uCB'));
    if(!giaTong && !giaCB){ toast('Nhập ít nhất Giá bán hoặc Giá chưa VAT','err'); return; }
    if(!giaCB && giaTong) giaCB=Math.round(giaTong/1.12);   // suy ra cơ sở CK nếu thiếu
    if(!giaTong && giaCB) giaTong=Math.round(giaCB*1.12);
    const rec={ ma, duAnId, block:v('uBlock'), tang:v('uTang'), lo:v('uLo'), loai:v('uLoai'),
      ttuy:money(v('uTtuy')), tim:money(v('uTim')), giaCB, giaVAT:money(v('uVAT'))||Math.round(giaCB*1.1),
      giaTong, kpbt:money(v('uKpbt')), donGia:money(v('uDonGia')), congKhaiGia:true };
    const arr=window.PRICING_UNITS; const i=arr.findIndex(x=>x.ma===ma);
    if(i>=0){ arr[i]=Object.assign({},arr[i],rec); } else { arr.push(rec); }
    editMa=null; afterChange('Đã lưu căn '+ma);
  }
  function delUnit(ma){ if(!confirm('Xoá căn '+ma+'?')) return;
    window.PRICING_UNITS=(window.PRICING_UNITS||[]).filter(u=>u.ma!==ma); if(editMa===ma)editMa=null; afterChange('Đã xoá căn '+ma); }

  /* ---- Nhập Excel ---- */
  function importTab(){
    const projOpts=(window.PRICING_PROJECTS||[]).map(p=>`<option value="${esc(p.id)}">${esc(p.ten)}</option>`).join('');
    return `<div class="m-sec">📥 Nhập bảng giá từ Excel</div>
      <div class="m-note">Dùng đúng <b>template</b> (tải bên dưới) rồi chọn file. Cột nhận diện theo tên tiêu đề dòng 1: Mã căn, Block, Tầng, Lô, Loại, DT thông thủy, DT tim tường, Giá chưa VAT, Giá gồm VAT, Giá bán, KPBT, Đơn giá. Trùng mã sẽ được cập nhật.</div>
      <div class="m-grid">
        <label>Thêm vào dự án *<select id="impProj">${projOpts||'<option value="">— chưa có dự án, tạo ở tab Dự án —</option>'}</select></label>
        <label>Chọn file Excel (.xlsx)<input id="impFile" type="file" accept=".xlsx" onchange="Manage.previewImport(this)"></label>
      </div>
      <div class="m-actions">
        <button class="mbtn" onclick="Manage.downloadTemplate()">⬇ Tải template mẫu</button>
        <button class="mbtn primary" id="impBtn" onclick="Manage.doImport()" ${impRows&&impRows.length?'':'disabled'}>Nhập ${impRows?('('+impRows.length+' căn)'):''}</button>
      </div>
      <div id="impPreview" class="m-note">${impRows?('Đã đọc <b>'+impRows.length+'</b> căn hợp lệ từ file. Bấm "Nhập" để thêm.'):''}</div>`;
  }
  function previewImport(input){
    const f=input.files&&input.files[0]; if(!f) return;
    _ensureExcelJS(()=>{
      const reader=new FileReader();
      reader.onload=e=>{ const wb=new ExcelJS.Workbook();
        wb.xlsx.load(e.target.result).then(()=>{
          const ws=wb.worksheets[0]; if(!ws){ toast('File rỗng','err'); return; }
          const H={}; ws.getRow(1).eachCell((c,col)=>{ H[norm(c.text||c.value)]=col; });
          const C=(...ns)=>{ for(const n of ns){ const k=norm(n); if(H[k]) return H[k]; } return null; };
          const cols={ ma:C('ma','ma can','ma sp','so san pham'), block:C('block','thap','khu'), tang:C('tang'), lo:C('lo'),
            loai:C('loai','loai pn'), ttuy:C('dt thong thuy','thong thuy','dtsd'), tim:C('dt tim tuong','tim tuong'),
            giaCB:C('gia chua vat','chua vat'), giaVAT:C('gia gom vat','gom vat'), giaTong:C('gia ban','gia'), kpbt:C('kpbt','phi bao tri'), donGia:C('don gia') };
          if(!cols.ma){ toast('Không thấy cột "Mã căn" — dùng template mẫu','err'); return; }
          const cellV=(row,col)=>{ if(!col) return ''; const c=row.getCell(col); return c.text!=null?c.text:c.value; };
          const rows=[]; ws.eachRow((row,r)=>{ if(r===1) return; const ma=String(cellV(row,cols.ma)||'').trim(); if(!ma) return;
            let giaTong=money(cellV(row,cols.giaTong)), giaCB=money(cellV(row,cols.giaCB));
            if(!giaCB&&giaTong) giaCB=Math.round(giaTong/1.12); if(!giaTong&&giaCB) giaTong=Math.round(giaCB*1.12);
            rows.push({ ma, block:String(cellV(row,cols.block)||'').trim(), tang:String(cellV(row,cols.tang)||'').trim(), lo:String(cellV(row,cols.lo)||'').trim(),
              loai:String(cellV(row,cols.loai)||'').trim(), ttuy:money(cellV(row,cols.ttuy)), tim:money(cellV(row,cols.tim)),
              giaCB, giaVAT:money(cellV(row,cols.giaVAT))||Math.round(giaCB*1.1), giaTong, kpbt:money(cellV(row,cols.kpbt)), donGia:money(cellV(row,cols.donGia)) }); });
          impRows=rows; render();
          toast('Đọc được '+rows.length+' căn — bấm Nhập');
        }).catch(err=>toast('Lỗi đọc Excel: '+err.message,'err'));
      };
      reader.readAsArrayBuffer(f);
    });
  }
  function doImport(){
    if(!impRows||!impRows.length){ toast('Chưa có dữ liệu','err'); return; }
    const projId=(document.getElementById('impProj')||{}).value||'';
    if(!projId){ toast('Chọn dự án đích','err'); return; }
    let add=0,upd=0; const arr=window.PRICING_UNITS;
    impRows.forEach(r=>{ const rec=Object.assign({duAnId:projId,congKhaiGia:true},r); const i=arr.findIndex(x=>x.ma===rec.ma);
      if(i>=0){ arr[i]=Object.assign({},arr[i],rec); upd++; } else { arr.push(rec); add++; } });
    impRows=null; afterChange('Đã nhập: '+add+' căn mới, '+upd+' cập nhật');
  }
  function downloadTemplate(){
    _ensureExcelJS(()=>{ const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('BangGia');
      const hdr=['Mã căn','Block','Tầng','Lô','Loại','DT thông thủy','DT tim tường','Giá chưa VAT','Giá gồm VAT','Giá bán','KPBT','Đơn giá'];
      ws.addRow(hdr); ws.getRow(1).font={bold:true}; ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1B7F3B'}}; ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
      ws.addRow(['CT7-08.09','CT7','08','09','2PN',84.59,95.2,6134000000,6747000000,6870000000,175000000,176934572]);
      ws.columns.forEach(c=>c.width=16);
      wb.xlsx.writeBuffer().then(buf=>{ const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download='Template-bang-gia-FUTA.xlsx'; a.click(); toast('Đã tải template'); });
    });
  }

  /* ---- Sao lưu ---- */
  function backupTab(){
    return `<div class="m-sec">💾 Sao lưu & khôi phục</div>
      <div class="m-note">Nơi lưu dữ liệu trên máy: <b id="dataPath">…</b></div>
      <div class="m-actions" style="margin-top:12px">
        <button class="mbtn primary" onclick="Manage.exportBackup()">⬇ Xuất file sao lưu (.json)</button>
        <label class="mbtn filelike">📤 Khôi phục từ file<input type="file" accept=".json" style="display:none" onchange="Manage.importBackup(this)"></label>
      </div>
      <div class="m-sec" style="margin-top:20px">Khôi phục dữ liệu gốc</div>
      <div class="m-note">Đưa về đúng bộ dữ liệu đóng gói ban đầu (${(DataStore.bundled().units||[]).length} căn). Mọi thay đổi bạn đã thêm sẽ mất.</div>
      <div class="m-actions"><button class="mbtn del" onclick="Manage.resetData()">↺ Khôi phục dữ liệu gốc</button></div>`;
  }
  async function showPath(){ const el=document.getElementById('dataPath'); if(el){ try{ el.textContent=await DataStore.pathInfo(); }catch(e){ el.textContent='—'; } } }
  function exportBackup(){
    const data=DataStore.current(); const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
    const d=new Date(), p=n=>(n<10?'0':'')+n; a.download='FUTA-tinh-gia-saoluu-'+p(d.getDate())+p(d.getMonth()+1)+d.getFullYear()+'.json'; a.click();
    toast('Đã xuất file sao lưu');
  }
  function importBackup(input){ const f=input.files&&input.files[0]; if(!f) return;
    const reader=new FileReader(); reader.onload=e=>{ try{ const d=JSON.parse(e.target.result);
      if(!d||!Array.isArray(d.units)||!Array.isArray(d.projects)){ toast('File sao lưu không hợp lệ','err'); return; }
      if(!confirm('Khôi phục từ file sao lưu? Dữ liệu hiện tại sẽ được thay thế ('+d.units.length+' căn).')) return;
      window.PRICING_PROJECTS=d.projects; window.PRICING_UNITS=d.units; if(d.snapshotDate)window.PRICING_SNAPSHOT_DATE=d.snapshotDate;
      afterChange('Đã khôi phục từ file sao lưu');
    }catch(err){ toast('Lỗi đọc file: '+err.message,'err'); } };
    reader.readAsText(f);
  }
  async function resetData(){ if(!confirm('Khôi phục về dữ liệu gốc đóng gói? Thay đổi đã thêm sẽ mất.')) return;
    const b=await DataStore.reset(); window.PRICING_PROJECTS=b.projects; window.PRICING_UNITS=b.units; window.PRICING_SNAPSHOT_DATE=b.snapshotDate;
    if(typeof refreshApp==='function') refreshApp(); toast('Đã khôi phục dữ liệu gốc'); render();
  }

  return { open, close, go, addProject, delProject, saveUnit, editUnit, delUnit,
           previewImport, doImport, downloadTemplate, exportBackup, importBackup, resetData };
})();
