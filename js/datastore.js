/* ============================================================
   FUTA Land — Công cụ tính giá · datastore.js
   Nguồn dữ liệu căn:
   - App desktop (Electron): đọc/ghi file trên MÁY người dùng (userData).
   - Web (mở index.html): localStorage; lần đầu seed từ data.js đóng gói.
   Dữ liệu = { snapshotDate, projects:[...], units:[...] } — app sửa trực tiếp
   window.PRICING_* rồi gọi DataStore.persist().
   ============================================================ */
const DataStore = (function(){
  const LS_KEY = 'futa_pricing_data_v1';
  const isDesk = () => !!(window.desktop && window.desktop.isElectron);
  // Chụp BẢN GỐC đóng gói (data.js) NGAY lúc nạp — trước khi app sửa window.PRICING_*
  const _ORIG = { snapshotDate: window.PRICING_SNAPSHOT_DATE||'',
    projects: JSON.parse(JSON.stringify(window.PRICING_PROJECTS||[])),
    units: JSON.parse(JSON.stringify(window.PRICING_UNITS||[])) };
  function bundled(){ return JSON.parse(JSON.stringify(_ORIG)); }
  function valid(d){ return d && Array.isArray(d.units) && Array.isArray(d.projects); }

  async function load(){
    if(isDesk()){
      try{ const d = await window.desktop.loadData(); if(valid(d) && d.units.length) return d; }catch(e){}
      const seed = bundled(); try{ await window.desktop.saveData(seed); }catch(e){}   // seed lần đầu vào file máy
      return seed;
    }
    try{ const s = localStorage.getItem(LS_KEY); if(s){ const d = JSON.parse(s); if(valid(d)) return d; } }catch(e){}
    return bundled();
  }
  async function save(data){
    if(isDesk()){ try{ return await window.desktop.saveData(data); }catch(e){ return {ok:false,error:String(e)}; } }
    try{ localStorage.setItem(LS_KEY, JSON.stringify(data)); return {ok:true}; }catch(e){ return {ok:false,error:String(e)}; }
  }
  function current(){ return { snapshotDate: window.PRICING_SNAPSHOT_DATE||'', projects: window.PRICING_PROJECTS||[], units: window.PRICING_UNITS||[] }; }
  async function persist(){ return save(current()); }
  async function reset(){ const b = bundled(); await save(b); return b; }   // khôi phục dữ liệu gốc đóng gói
  async function pathInfo(){ if(isDesk()){ try{ return await window.desktop.dataPath(); }catch(e){} } return 'Trình duyệt (localStorage)'; }

  return { load, save, current, persist, reset, bundled, pathInfo, isDesk };
})();
