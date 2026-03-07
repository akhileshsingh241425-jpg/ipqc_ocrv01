import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';

const API = 'http://localhost:5001/api';

/* ═══════════════════════════════════════════════════════════════════
   IPQC CHECK SHEET — COMPACT NO-SCROLL EDITION
   Gautam Solar Pvt. Ltd. • GSPL/IPQC/IPC/003
   ═══════════════════════════════════════════════════════════════════ */

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
  .ipqc-root * { font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; box-sizing:border-box; }
  @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes slideIn { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:translateX(0)} }
  @keyframes spin { to{transform:rotate(360deg)} }
  .ipqc-inp { transition:all 0.2s !important; }
  .ipqc-inp:focus { border-color:#3b82f6 !important; box-shadow:0 0 0 3px rgba(59,130,246,0.1) !important; }
  .ipqc-inp:hover:not(:focus) { border-color:#94a3b8 !important; }
  .ipqc-btn { transition:all 0.2s !important; }
  .ipqc-btn:hover { transform:translateY(-1px) !important; box-shadow:0 3px 10px rgba(0,0,0,0.12) !important; }
  .ipqc-step { transition:all 0.25s !important; }
  .ipqc-step:hover { background:rgba(255,255,255,0.08) !important; transform:translateX(2px) !important; }
  .ipqc-tog { transition:all 0.2s !important; cursor:pointer; }
  .ipqc-tog:hover { transform:scale(1.03) !important; }
  .ipqc-tog:active { transform:scale(0.97) !important; }
  .ipqc-row:hover { background:linear-gradient(90deg,#eff6ff,#f8fafc) !important; }
  .ipqc-card { transition:box-shadow 0.3s !important; }
  .ipqc-card:hover { box-shadow:0 4px 16px rgba(0,0,0,0.06) !important; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:#f1f5f9; }
  ::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
`;

function injectCSS() {
  if(document.getElementById('ipqc-css'))return;
  const s=document.createElement('style'); s.id='ipqc-css'; s.textContent=CSS;
  document.head.appendChild(s);
}

// ── Page Config ──
const PAGES = [
  { n:1, title:'Shop Floor & Stringer', icon:'🏭', color:'#2563eb', bg:'#eff6ff', desc:'Environment, glass, cell, soldering' },
  { n:2, title:'Soldering & Layout', icon:'📐', color:'#7c3aed', bg:'#f5f3ff', desc:'Peel strength, gaps, creepage' },
  { n:3, title:'Pre-Lamination', icon:'🔧', color:'#059669', bg:'#ecfdf5', desc:'Holes, busbar, soldering iron' },
  { n:4, title:'Post-Lam & Framing', icon:'📦', color:'#d97706', bg:'#fffbeb', desc:'Peel test, trimming, glue' },
  { n:5, title:'JB Assembly & Curing', icon:'🔩', color:'#dc2626', bg:'#fef2f2', desc:'Junction box, welding, curing' },
  { n:6, title:'Flash Tester & EL', icon:'⚡', color:'#0891b2', bg:'#ecfeff', desc:'DCW, IR, voltage, current' },
  { n:7, title:'Final Inspection', icon:'✅', color:'#4f46e5', bg:'#eef2ff', desc:'Dimensions, packaging, final' },
];

const PAGE_FIELDS = {
  1:['shop_floor_temp','shop_floor_humidity','glass_dimension','glass_visual','eva_epe_type','eva_epe_dimension','eva_epe_status','soldering_temp','cell_manufacturer','cell_efficiency','cell_size','cell_condition','cell_loading_cleanliness','stringer_specification','ts_visual','ts_el_image','cell_gap_ts01a','cell_gap_ts01b','cell_gap_ts02a','cell_gap_ts02b','cell_gap_ts03a','cell_gap_ts03b','cell_gap_ts04a','cell_gap_ts04b'],
  2:['peel_strength_ribbon_cell','peel_strength_ribbon_busbar','string_to_string_gap','cell_edge_glass_top','cell_edge_glass_bottom','cell_edge_glass_sides','terminal_busbar_to_cell','soldering_quality','creepage_top','creepage_bottom','creepage_left','creepage_right','auto_taping','rfid_logo_position','back_eva_type','back_eva_dimension','back_glass_dimension'],
  3:['hole1_dimension','hole2_dimension','hole3_dimension','busbar_flatten','soldering_iron_temp1','soldering_iron_temp2','rework_method','pre_lam_visual','rework_station_clean'],
  4:['peel_test_eva_glass','peel_test_eva_backsheet','gel_content','tape_removing','trimming_quality','trimming_blade_status','post_lam_visual','glue_uniformity','short_side_glue_weight','long_side_glue_weight','anodizing_thickness'],
  5:['jb_appearance','jb_cable_length','silicon_glue_weight','welding_current','soldering_quality_jb','glue_ratio','potting_weight','curing_temp','curing_humidity','curing_time','buffing_condition','cleaning_status'],
  6:['ambient_temp','module_temp','simulator_calibration','el_check','dcw_value1','dcw_value2','dcw_value3','dcw_value4','ir_value1','ir_value2','ir_value3','ir_value4','voltage_verification','current_verification','manufacturing_month','post_el_visual','rfid_position'],
  7:['module_dimension','mounting_hole_x','mounting_hole_y','diagonal_difference','corner_gap','cable_length_final','final_visual','backlabel','packaging_label','box_content','box_condition','pallet_dimension'],
};

// ══════════════════════════════
//  COMPACT INPUT COMPONENTS
// ══════════════════════════════

function F({ label, name, type='text', value, onChange, placeholder, unit, min, max, step, options, required }) {
  const has = value !== '' && value != null;
  return (
    <div>
      <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:12.5, fontWeight:600, color:'#475569', marginBottom:4, letterSpacing:'0.01em' }}>
        {label}
        {unit && <span style={{ color:'#94a3b8', fontWeight:400, fontSize:11 }}>({unit})</span>}
        {required && <span style={{ color:'#ef4444' }}>*</span>}
      </label>
      {options ? (
        <select className="ipqc-inp" value={value||''} onChange={e=>onChange(name,e.target.value)}
          style={{ width:'100%', padding:'8px 12px', borderRadius:7, fontSize:14, outline:'none',
            border:`1.5px solid ${has?'#a5b4fc':'#e2e8f0'}`, background:has?'#f8faff':'#fff',
            color:has?'#1e293b':'#94a3b8', cursor:'pointer', fontWeight:has?500:400, appearance:'none',
            backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 8 8'%3E%3Cpath fill='%2394a3b8' d='M4 6L0 2h8z'/%3E%3C/svg%3E")`,
            backgroundRepeat:'no-repeat', backgroundPosition:'right 10px center',
          }}>
          <option value="">— Select —</option>
          {options.map(o=><option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input className="ipqc-inp" type={type} value={value||''} placeholder={placeholder||''}
          min={min} max={max} step={step||(type==='number'?'0.01':undefined)}
          onChange={e=>onChange(name, type==='number'?(e.target.value===''?'':parseFloat(e.target.value)):e.target.value)}
          style={{ width:'100%', padding:'8px 12px', borderRadius:7, fontSize:14, outline:'none',
            border:`1.5px solid ${has?'#86efac':'#e2e8f0'}`,
            background:has?'linear-gradient(135deg,#f0fdf4,#ecfdf5)':'#fff',
            color:'#1e293b', fontWeight:has?500:400,
          }} />
      )}
    </div>
  );
}

function T({ label, name, value, onChange }) {
  const ok = value !== 'NG';
  return (
    <div>
      <label style={{ display:'block', fontSize:12.5, fontWeight:600, color:'#475569', marginBottom:4 }}>{label}</label>
      <button className="ipqc-tog" type="button" onClick={()=>onChange(name, ok?'NG':'OK')}
        style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'7px 16px', borderRadius:7,
          fontWeight:700, fontSize:13.5, letterSpacing:'0.03em', border:'none',
          background: ok ? 'linear-gradient(135deg,#dcfce7,#bbf7d0)' : 'linear-gradient(135deg,#fee2e2,#fecaca)',
          color: ok ? '#166534' : '#991b1b',
          boxShadow: ok ? '0 1px 4px rgba(34,197,94,0.15)' : '0 1px 4px rgba(239,68,68,0.15)',
        }}>
        <span style={{ width:20, height:20, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
          background:ok?'#22c55e':'#ef4444', color:'#fff', fontSize:12, fontWeight:800,
        }}>{ok?'✓':'✕'}</span>
        {ok?'OK':'NG'}
      </button>
    </div>
  );
}

function Sub({ title, children }) {
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, padding:'7px 12px', borderRadius:8, background:'linear-gradient(135deg,#eff6ff,#dbeafe)', border:'1px solid #bfdbfe' }}>
        <div style={{ width:4, height:22, borderRadius:3, background:'linear-gradient(180deg,#2563eb,#3b82f6)', flexShrink:0 }}/>
        <span style={{ fontSize:16, fontWeight:800, color:'#1e40af', letterSpacing:'-0.01em' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function SerialInput({ serials, setSerials, page, stage }) {
  const [val, setVal] = useState('');
  const add = () => { const v=val.trim(); if(v && !serials.find(s=>s.serial_number===v&&s.page_number===page)){setSerials([...serials,{serial_number:v,page_number:page,stage}]);setVal('');} };
  const rm = i => setSerials(serials.filter((_,idx)=>idx!==i));
  const ps = serials.filter(s=>s.page_number===page);
  return (
    <div style={{ marginTop:8, padding:'8px 10px', background:'#f8fafc', borderRadius:8, border:'1px solid #e2e8f0' }}>
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
        <span style={{ width:22, height:22, borderRadius:5, background:'linear-gradient(135deg,#3b82f6,#2563eb)', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700 }}>#</span>
        <span style={{ fontSize:15, fontWeight:800, color:'#1e293b' }}>Serial Numbers</span>
        <span style={{ fontSize:11, color:'#64748b', background:'#e2e8f0', padding:'2px 8px', borderRadius:10, fontWeight:600 }}>{stage}</span>
        {ps.length>0 && <span style={{ fontSize:9, fontWeight:700, color:'#2563eb', background:'#dbeafe', padding:'1px 6px', borderRadius:10, marginLeft:'auto' }}>{ps.length}</span>}
      </div>
      <div style={{ display:'flex', gap:6 }}>
        <input className="ipqc-inp" value={val} onChange={e=>setVal(e.target.value)} placeholder="e.g. GS04830001"
          onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();add();}}}
          style={{ flex:1, padding:'7px 12px', border:'1.5px solid #e2e8f0', borderRadius:7, fontSize:13.5, outline:'none', background:'#fff' }}/>
        <button className="ipqc-btn" onClick={add} style={{ padding:'7px 16px', background:'linear-gradient(135deg,#3b82f6,#2563eb)', color:'#fff', border:'none', borderRadius:7, fontSize:13.5, fontWeight:700, cursor:'pointer' }}>+ Add</button>
      </div>
      {ps.length>0&&(
        <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginTop:6 }}>
          {ps.map((s,i)=>{const gi=serials.indexOf(s);return(
            <span key={i} style={{ background:'#fff', border:'1px solid #bfdbfe', borderRadius:6, padding:'4px 8px 4px 10px', fontSize:12.5, fontWeight:600, color:'#1e40af', display:'inline-flex', alignItems:'center', gap:5 }}>
              <span style={{ fontFamily:'monospace' }}>{s.serial_number}</span>
              <span onClick={()=>rm(gi)} style={{ cursor:'pointer', width:16, height:16, borderRadius:'50%', background:'#fee2e2', color:'#dc2626', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800 }}>×</span>
            </span>
          );})}
        </div>
      )}
    </div>
  );
}

const G = (c) => ({ display:'grid', gridTemplateColumns:`repeat(${c}, 1fr)`, gap:'8px 14px' });

// ══════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════

function IPQCFormPage({ onBack }) {
  useEffect(()=>{injectCSS();},[]);

  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0], shift:'Day', line:'A',
    time: new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),
    po_number:'', inspector_name:'', source:'form',
  });
  const [serials, setSerials] = useState([]);
  const [activePage, setActivePage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [savedList, setSavedList] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [viewMode, setViewMode] = useState('form');
  const [viewData, setViewData] = useState(null);
  const [stats, setStats] = useState(null);
  const contentRef = useRef(null);

  const set = useCallback((n,v)=>setForm(p=>({...p,[n]:v})),[]);

  const pageCounts = useMemo(()=>{
    const r={};
    for(const [pg,fields] of Object.entries(PAGE_FIELDS)){
      const filled=fields.filter(f=>form[f]!=null&&form[f]!=='').length;
      r[pg]={filled,total:fields.length};
    }
    return r;
  },[form]);

  const totalFilled = useMemo(()=>{
    const all=Object.values(pageCounts);
    return {filled:all.reduce((a,b)=>a+b.filled,0),total:all.reduce((a,b)=>a+b.total,0)};
  },[pageCounts]);

  const loadList = useCallback(async()=>{
    setLoadingList(true);
    try{const r=await axios.get(`${API}/ipqc-data/list`);if(r.data.success)setSavedList(r.data.data||[]);}catch(e){console.error(e);}
    finally{setLoadingList(false);}
  },[]);
  const loadStats = useCallback(async()=>{
    try{const r=await axios.get(`${API}/ipqc-data/stats`);if(r.data.success)setStats(r.data.stats);}catch(e){}
  },[]);
  useEffect(()=>{loadList();loadStats();},[loadList,loadStats]);

  const handleSave = async()=>{
    if(!form.date||!form.shift||!form.line){alert('Date, Shift and Line are required!');return;}
    setSaving(true);setSaveResult(null);
    try{
      const r=await axios.post(`${API}/ipqc-data/save`,{...form,serials});
      if(r.data.success){setSaveResult({ok:true,msg:`Checksheet #${r.data.id} saved!`});loadList();loadStats();}
      else setSaveResult({ok:false,msg:r.data.error||'Failed'});
    }catch(e){setSaveResult({ok:false,msg:e.response?.data?.error||e.message});}
    finally{setSaving(false);}
  };
  const handleView = async(id)=>{
    try{const r=await axios.get(`${API}/ipqc-data/get/${id}`);if(r.data.success){setViewData(r.data.data);setViewMode('view');}}catch(e){alert('Error: '+e.message);}
  };
  const handleDelete = async(id)=>{
    if(!window.confirm('Delete this checksheet permanently?'))return;
    try{await axios.delete(`${API}/ipqc-data/delete/${id}`);loadList();loadStats();}catch(e){alert('Error: '+e.message);}
  };
  const resetForm = ()=>{
    setForm({date:new Date().toISOString().split('T')[0],shift:'Day',line:'A',time:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),po_number:'',inspector_name:'',source:'form'});
    setSerials([]);setSaveResult(null);setActivePage(1);
  };
  const goPage = (n)=>{setActivePage(n);};

  // ═══════════════════════════
  //  LIST VIEW
  // ═══════════════════════════
  if (viewMode==='list') return (
    <div className="ipqc-root" style={{ animation:'fadeIn 0.3s', maxWidth:1300, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16, padding:'14px 22px', background:'linear-gradient(135deg,#1e3a8a,#2563eb)', borderRadius:14, boxShadow:'0 6px 24px rgba(37,99,235,0.25)' }}>
        <div>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:'#fff' }}>📋 Saved Checksheets</h2>
          <p style={{ margin:'2px 0 0', fontSize:11, color:'rgba(255,255,255,0.65)' }}>All IPQC records from Form & OCR</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="ipqc-btn" onClick={()=>setViewMode('form')} style={{ padding:'8px 18px', background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.25)', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer' }}>✏️ New</button>
          <button className="ipqc-btn" onClick={()=>{loadList();loadStats();}} disabled={loadingList} style={{ padding:'8px 14px', background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.9)', border:'1px solid rgba(255,255,255,0.15)', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}>🔄</button>
        </div>
      </div>
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:16 }}>
          {[
            {icon:'📊',label:'Total',val:stats.total,color:'#3b82f6',bg:'#eff6ff'},
            {icon:'📝',label:'Form',val:stats.fromForm,color:'#7c3aed',bg:'#f5f3ff'},
            {icon:'🤖',label:'OCR',val:stats.fromOCR,color:'#0891b2',bg:'#ecfeff'},
            {icon:'✅',label:'Genuine',val:stats.genuine,color:'#059669',bg:'#ecfdf5'},
            {icon:'⚠️',label:'Suspicious',val:stats.suspicious,color:'#d97706',bg:'#fffbeb'},
            {icon:'📅',label:'Dates',val:stats.uniqueDates,color:'#64748b',bg:'#f8fafc'},
          ].map((s,i)=>(
            <div key={i} className="ipqc-card" style={{ background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', padding:'12px', textAlign:'center' }}>
              <div style={{ width:36, height:36, borderRadius:10, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, margin:'0 auto 6px' }}>{s.icon}</div>
              <div style={{ fontSize:22, fontWeight:900, color:s.color, lineHeight:1 }}>{s.val}</div>
              <div style={{ fontSize:9, color:'#64748b', fontWeight:600, marginTop:3, textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
      {savedList.length===0 ? (
        <div style={{ textAlign:'center', padding:'60px 24px', background:'#fff', borderRadius:14, border:'1px solid #e2e8f0' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📭</div>
          <h3 style={{ fontSize:16, fontWeight:700, color:'#1e293b', margin:'0 0 4px' }}>No Checksheets Yet</h3>
          <p style={{ color:'#64748b', fontSize:13, margin:0 }}>Create your first checksheet or use OCR.</p>
        </div>
      ) : (
        <div className="ipqc-card" style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {['ID','Date','Line','Shift','Source','Inspector','Serials','Fraud','Created','Actions'].map(h=>(
                    <th key={h} style={{ padding:'10px 12px', textAlign:'left', borderBottom:'2px solid #e2e8f0', fontSize:9.5, fontWeight:700, color:'#64748b', letterSpacing:'0.06em', textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {savedList.map((r,i)=>(
                  <tr key={r.id} className="ipqc-row" style={{ background:i%2?'#fafbfc':'#fff', cursor:'pointer' }} onClick={()=>handleView(r.id)}>
                    <td style={TD}><span style={{ fontWeight:700, color:'#64748b', fontSize:11 }}>#{r.id}</span></td>
                    <td style={TD}><span style={{ fontWeight:600 }}>{r.date}</span></td>
                    <td style={TD}><span style={{ background:'#eff6ff', color:'#1e40af', padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700 }}>Line {r.line}</span></td>
                    <td style={TD}>{r.shift==='Day'?'☀️':'🌙'} {r.shift}</td>
                    <td style={TD}><span style={{ background:r.source==='form'?'#f5f3ff':'#ecfdf5', color:r.source==='form'?'#7c3aed':'#059669', padding:'2px 6px', borderRadius:6, fontSize:9.5, fontWeight:700 }}>{r.source==='form'?'📝 Form':'🤖 OCR'}</span></td>
                    <td style={TD}>{r.inspector_name||<span style={{color:'#cbd5e1'}}>—</span>}</td>
                    <td style={TD}><span style={{ background:(r.serial_count||0)>0?'#dbeafe':'#f1f5f9', color:(r.serial_count||0)>0?'#2563eb':'#94a3b8', padding:'2px 8px', borderRadius:6, fontSize:10, fontWeight:700 }}>{r.serial_count||0}</span></td>
                    <td style={TD}>{r.fraud_verdict?<FraudBadge v={r.fraud_verdict}/>:<span style={{color:'#cbd5e1'}}>—</span>}</td>
                    <td style={{...TD,fontSize:10,color:'#94a3b8'}}>{r.created_at}</td>
                    <td style={TD} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button className="ipqc-btn" onClick={()=>handleView(r.id)} style={{ padding:'4px 8px', background:'#eff6ff', color:'#3b82f6', border:'1px solid #bfdbfe', borderRadius:6, fontSize:12, cursor:'pointer' }}>👁</button>
                        <button className="ipqc-btn" onClick={()=>window.open(`${API}/ipqc-data/summary-pdf/${r.id}`, '_blank')} style={{ padding:'4px 8px', background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5', borderRadius:6, fontSize:12, cursor:'pointer' }} title="Summary PDF">📄</button>
                        <button className="ipqc-btn" onClick={()=>handleDelete(r.id)} style={{ padding:'4px 8px', background:'#fef2f2', color:'#ef4444', border:'1px solid #fca5a5', borderRadius:6, fontSize:12, cursor:'pointer' }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // ═══════════════════════════
  //  VIEW MODE
  // ═══════════════════════════
  if (viewMode==='view' && viewData) return (
    <div className="ipqc-root" style={{ animation:'fadeIn 0.3s', maxWidth:1100, margin:'0 auto' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, padding:'12px 18px', background:'#fff', borderRadius:12, border:'1px solid #e2e8f0' }}>
        <button className="ipqc-btn" onClick={()=>setViewMode('list')} style={{ padding:'7px 14px', background:'#f1f5f9', color:'#334155', border:'1px solid #e2e8f0', borderRadius:8, fontSize:12, fontWeight:600, cursor:'pointer' }}>← Back</button>
        <div style={{flex:1}}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:800, color:'#1e293b' }}>Checksheet #{viewData.id}</h2>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:2, fontSize:12, color:'#64748b' }}>
            <span>{viewData.date}</span><span style={{color:'#cbd5e1'}}>•</span>
            <span>Line {viewData.line}</span><span style={{color:'#cbd5e1'}}>•</span>
            <span>{viewData.shift==='Day'?'☀️':'🌙'} {viewData.shift}</span>
            {viewData.source && <span style={{ background:viewData.source==='form'?'#f5f3ff':'#ecfdf5', color:viewData.source==='form'?'#7c3aed':'#059669', padding:'2px 6px', borderRadius:4, fontSize:9.5, fontWeight:700 }}>{viewData.source==='form'?'📝 Form':'🤖 OCR'}</span>}
            {viewData.fraud_verdict && <FraudBadge v={viewData.fraud_verdict}/>}
          </div>
        </div>
        <button className="ipqc-btn" onClick={()=>window.open(`${API}/ipqc-data/summary-pdf/${viewData.id}`, '_blank')} style={{ padding:'8px 18px', background:'linear-gradient(135deg, #dc2626, #ef4444)', color:'#fff', border:'none', borderRadius:8, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6, boxShadow:'0 2px 8px rgba(220,38,38,0.3)' }}>📄 Summary PDF</button>
      </div>
      <div className="ipqc-card" style={{ background:'#fff', borderRadius:14, border:'1px solid #e2e8f0', overflow:'hidden' }}>
        <div style={{ padding:'14px 20px', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
          <div style={G(4)}>
            <VF l="Date" v={viewData.date}/><VF l="Shift" v={viewData.shift}/><VF l="Line" v={'Line '+viewData.line}/><VF l="Time" v={viewData.time}/>
            <VF l="PO Number" v={viewData.po_number}/><VF l="Inspector" v={viewData.inspector_name}/><VF l="Fraud Score" v={viewData.fraud_score}/><VF l="Created" v={viewData.created_at}/>
          </div>
        </div>
        <div style={{ padding:'16px 20px' }}>
          {[
            {title:'Page 1 — Shop Floor',color:'#2563eb',fields:[['Temp',viewData.shop_floor_temp,'°C'],['RH',viewData.shop_floor_humidity,'%'],['Solder',viewData.soldering_temp,'°C'],['Eff',viewData.cell_efficiency,'%'],['TS01A',viewData.cell_gap_ts01a,'mm'],['TS01B',viewData.cell_gap_ts01b,'mm'],['TS02A',viewData.cell_gap_ts02a,'mm'],['TS02B',viewData.cell_gap_ts02b,'mm'],['TS03A',viewData.cell_gap_ts03a,'mm'],['TS03B',viewData.cell_gap_ts03b,'mm'],['TS04A',viewData.cell_gap_ts04a,'mm'],['TS04B',viewData.cell_gap_ts04b,'mm']]},
            {title:'Page 2 — Layout',color:'#7c3aed',fields:[['Edge-T',viewData.cell_edge_glass_top,'mm'],['Edge-B',viewData.cell_edge_glass_bottom,'mm'],['Edge-S',viewData.cell_edge_glass_sides,'mm'],['Str-Str',viewData.string_to_string_gap,'mm'],['BB-Cell',viewData.terminal_busbar_to_cell,'mm'],['Crp-T',viewData.creepage_top,'mm'],['Crp-B',viewData.creepage_bottom,'mm'],['Crp-L',viewData.creepage_left,'mm']]},
            {title:'Page 3-5',color:'#059669',fields:[['Hole1',viewData.hole1_dimension,'mm'],['Hole2',viewData.hole2_dimension,'mm'],['Hole3',viewData.hole3_dimension,'mm'],['SolderIron',viewData.soldering_iron_temp1,'°C'],['Anodize',viewData.anodizing_thickness,'μ'],['ShortGlue',viewData.short_side_glue_weight,'gm'],['LongGlue',viewData.long_side_glue_weight,'gm'],['SilicGlue',viewData.silicon_glue_weight,'gm'],['Weld',viewData.welding_current,'A'],['Potting',viewData.potting_weight,'gm'],['CureT',viewData.curing_temp,'°C'],['CureRH',viewData.curing_humidity,'%']]},
            {title:'Page 6-7',color:'#0891b2',fields:[['Ambient',viewData.ambient_temp,'°C'],['Module',viewData.module_temp,'°C'],['DCW1',viewData.dcw_value1,'mA'],['DCW2',viewData.dcw_value2,'mA'],['IR1',viewData.ir_value1,'MΩ'],['IR2',viewData.ir_value2,'MΩ'],['Volt',viewData.voltage_verification,'V'],['Curr',viewData.current_verification,'A'],['Diag',viewData.diagonal_difference,'mm'],['Cable',viewData.cable_length_final,'mm'],['ModDim',viewData.module_dimension],['Pallet',viewData.pallet_dimension]]},
          ].map((sec,i)=>(
            <div key={i} style={{ marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, paddingBottom:6, borderBottom:`2px solid ${sec.color}15` }}>
                <div style={{ width:3, height:16, borderRadius:2, background:sec.color }}/><h4 style={{ margin:0, fontSize:13, fontWeight:700, color:'#1e293b' }}>{sec.title}</h4>
              </div>
              <div style={G(6)}>{sec.fields.map(([l,v,u],j)=><VF key={j} l={l} v={v} u={u}/>)}</div>
            </div>
          ))}
          {viewData.serials?.length>0 && (
            <div>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8, paddingBottom:6, borderBottom:'2px solid #6366f115' }}>
                <div style={{ width:3, height:16, borderRadius:2, background:'#6366f1' }}/><h4 style={{ margin:0, fontSize:13, fontWeight:700 }}>Serials ({viewData.serials.length})</h4>
              </div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                {viewData.serials.map((s,i)=>(
                  <span key={i} style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, color:'#1e40af', fontFamily:'monospace' }}>
                    <span style={{ fontSize:9, color:'#64748b', marginRight:4 }}>P{s.page_number}</span>{s.serial_number}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ═══════════════════════════
  //  FORM VIEW — WIZARD (NO SCROLL)
  // ═══════════════════════════
  const pct = totalFilled.total>0?Math.round(totalFilled.filled/totalFilled.total*100):0;

  return (
    <div className="ipqc-root" style={{ display:'flex', gap:0, height:'100vh', animation:'fadeIn 0.3s' }}>

      {/* ──── LEFT SIDEBAR ──── */}
      <div style={{
        width:240, minWidth:240, background:'linear-gradient(180deg,#0f172a,#1e293b)',
        borderRadius:'14px 0 0 14px', padding:'16px 0', display:'flex', flexDirection:'column',
        boxShadow:'4px 0 16px rgba(0,0,0,0.08)',
      }}>
        {/* Logo */}
        <div style={{ padding:'0 14px 12px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div onClick={onBack} title="Back to Dashboard" style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#3b82f6,#1d4ed8)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, boxShadow:'0 3px 10px rgba(59,130,246,0.35)', cursor:'pointer' }}>🏭</div>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>IPQC Check Sheet</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)', letterSpacing:'0.04em' }}>GSPL/IPQC/IPC/003</div>
            </div>
          </div>
          {onBack && <button onClick={onBack} style={{ marginTop:6, width:'100%', padding:'5px', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.6)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, fontSize:10, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>← Dashboard</button>}
        </div>

        {/* Progress */}
        <div style={{ padding:'10px 14px', borderBottom:'1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:600 }}>Progress</span>
            <span style={{ fontSize:11, color:'#60a5fa', fontWeight:700 }}>{pct}%</span>
          </div>
          <div style={{ height:4, background:'rgba(255,255,255,0.08)', borderRadius:2, overflow:'hidden' }}>
            <div style={{ width:`${pct}%`, height:'100%', background:'linear-gradient(90deg,#3b82f6,#60a5fa)', borderRadius:2, transition:'width 0.5s' }}/>
          </div>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', marginTop:4 }}>{totalFilled.filled} of {totalFilled.total} fields</div>
        </div>

        {/* Steps */}
        <div style={{ flex:1, padding:'8px 6px', overflowY:'auto' }}>
          {PAGES.map(pg=>{
            const c=pageCounts[pg.n]; const ppct=c.total>0?Math.round(c.filled/c.total*100):0;
            const active=activePage===pg.n;
            return (
              <div key={pg.n} className="ipqc-step" onClick={()=>goPage(pg.n)}
                style={{
                  display:'flex', alignItems:'center', gap:8, padding:'8px 10px', marginBottom:2, borderRadius:8, cursor:'pointer',
                  background:active?'rgba(59,130,246,0.15)':'transparent',
                  borderLeft:active?'3px solid #3b82f6':'3px solid transparent',
                }}>
                <div style={{
                  width:28, height:28, borderRadius:7, display:'flex', alignItems:'center', justifyContent:'center',
                  background:ppct===100?'linear-gradient(135deg,#22c55e,#16a34a)':active?'linear-gradient(135deg,#3b82f6,#2563eb)':'rgba(255,255,255,0.06)',
                  color:'#fff', fontSize:ppct===100?12:11, fontWeight:800,
                  boxShadow:active?'0 2px 6px rgba(59,130,246,0.3)':'none',
                }}>
                  {ppct===100?'✓':pg.n}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:active?700:500, color:active?'#fff':'rgba(255,255,255,0.6)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{pg.title}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                    <div style={{ flex:1, height:2.5, background:'rgba(255,255,255,0.07)', borderRadius:2, overflow:'hidden' }}>
                      <div style={{ width:`${ppct}%`, height:'100%', background:ppct===100?'#22c55e':active?'#60a5fa':'rgba(255,255,255,0.15)', borderRadius:2, transition:'width 0.4s' }}/>
                    </div>
                    <span style={{ fontSize:8, color:ppct===100?'#4ade80':'rgba(255,255,255,0.3)', fontWeight:600 }}>{c.filled}/{c.total}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom */}
        <div style={{ padding:'10px 10px 6px', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
          <button className="ipqc-btn" onClick={()=>{setViewMode('list');loadList();}}
            style={{ width:'100%', padding:'8px', background:'rgba(255,255,255,0.06)', color:'rgba(255,255,255,0.75)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, fontSize:11, fontWeight:600, cursor:'pointer', marginBottom:4, display:'flex', alignItems:'center', justifyContent:'center', gap:5 }}>
            📋 Records <span style={{ background:'rgba(255,255,255,0.12)', padding:'0px 6px', borderRadius:6, fontSize:9 }}>{savedList.length}</span>
          </button>
          <button className="ipqc-btn" onClick={resetForm}
            style={{ width:'100%', padding:'7px', background:'transparent', color:'rgba(255,255,255,0.4)', border:'1px solid rgba(255,255,255,0.05)', borderRadius:8, fontSize:10, fontWeight:500, cursor:'pointer' }}>
            🔄 Reset
          </button>
        </div>
      </div>

      {/* ──── MAIN CONTENT ──── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', background:'#f8fafc', borderRadius:'0 14px 14px 0', overflow:'hidden' }}>

        {/* Top Bar — compact */}
        <div style={{ padding:'10px 20px', background:'#fff', borderBottom:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', minHeight:44 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ width:28, height:28, borderRadius:7, background:PAGES[activePage-1].bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>{PAGES[activePage-1].icon}</span>
            <div>
              <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:'#1e293b' }}>Page {activePage}: {PAGES[activePage-1].title}</h2>
              <p style={{ margin:0, fontSize:13, color:'#94a3b8' }}>{PAGES[activePage-1].desc}</p>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:10, color:'#94a3b8', fontWeight:600 }}>PAGE</span>
            <span style={{ fontSize:16, fontWeight:800, color:PAGES[activePage-1].color }}>{pageCounts[activePage]?.filled||0}<span style={{fontSize:11,color:'#94a3b8',fontWeight:500}}>/{pageCounts[activePage]?.total||0}</span></span>
            <div style={{ width:36, height:36, borderRadius:10, background:PAGES[activePage-1].bg, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
              <svg width="36" height="36" viewBox="0 0 36 36" style={{position:'absolute',transform:'rotate(-90deg)'}}>
                <circle cx="18" cy="18" r="15" fill="none" stroke="#e2e8f0" strokeWidth="2.5"/>
                <circle cx="18" cy="18" r="15" fill="none" stroke={PAGES[activePage-1].color} strokeWidth="2.5" strokeLinecap="round"
                  strokeDasharray={`${(pageCounts[activePage]?.total>0?(pageCounts[activePage].filled/pageCounts[activePage].total):0)*94.2} 94.2`}
                  style={{transition:'stroke-dasharray 0.4s'}}/>
              </svg>
              <span style={{fontSize:10,fontWeight:800,color:PAGES[activePage-1].color,position:'relative',zIndex:1}}>
                {pageCounts[activePage]?.total>0?Math.round(pageCounts[activePage].filled/pageCounts[activePage].total*100):0}%
              </span>
            </div>
          </div>
        </div>

        {/* Content — fills remaining space, NO scroll */}
        <div ref={contentRef} style={{ flex:1, padding:'12px 20px', display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Toast */}
          {saveResult && (
            <div style={{ padding:'8px 14px', borderRadius:8, marginBottom:8, display:'flex', alignItems:'center', gap:8, background:saveResult.ok?'#ecfdf5':'#fef2f2', color:saveResult.ok?'#065f46':'#991b1b', border:`1px solid ${saveResult.ok?'#6ee7b7':'#fca5a5'}`, fontSize:12, fontWeight:600 }}>
              <span style={{fontSize:16}}>{saveResult.ok?'✅':'❌'}</span>{saveResult.msg}
              <button onClick={()=>setSaveResult(null)} style={{ marginLeft:'auto', background:'none', border:'none', cursor:'pointer', fontSize:16, color:'inherit', opacity:0.5 }}>×</button>
            </div>
          )}

          {/* Header Info — compact inline */}
          <div style={{ background:'#fff', borderRadius:10, border:'1px solid #dbeafe', marginBottom:10, overflow:'hidden' }}>
            <div style={{ padding:'8px 14px', background:'linear-gradient(135deg,#dbeafe,#bfdbfe)', borderBottom:'1px solid #93c5fd', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{fontSize:15}}>📋</span>
              <span style={{ fontSize:15, fontWeight:800, color:'#1e3a8a', letterSpacing:'-0.01em' }}>Checksheet Info</span>
              <span style={{ fontSize:12, color:'#475569', marginLeft:'auto', fontWeight:600 }}>Required *</span>
            </div>
            <div style={{ padding:'8px 14px' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 0.7fr 0.7fr 0.7fr 1fr 1fr', gap:'6px 12px' }}>
                <F label="Date" name="date" type="date" value={form.date} onChange={set} required/>
                <F label="Shift" name="shift" value={form.shift} onChange={set} options={['Day','Night']} required/>
                <F label="Line" name="line" value={form.line} onChange={set} options={['A','B','C','D','E']} required/>
                <F label="Time" name="time" value={form.time} onChange={set} placeholder="HH:MM"/>
                <F label="PO Number" name="po_number" value={form.po_number} onChange={set} placeholder="Enter PO"/>
                <F label="Inspector" name="inspector_name" value={form.inspector_name} onChange={set} placeholder="Checked By"/>
              </div>
            </div>
          </div>

          {/* Page Content — flex:1 fills remaining space */}
          <div style={{ flex:1, animation:'slideIn 0.25s', overflow:'hidden' }} key={activePage}>
            <div style={{ background:'#fff', borderRadius:10, border:'1px solid #e2e8f0', padding:'12px 16px', height:'100%', display:'flex', flexDirection:'column', justifyContent:'flex-start', gap:0 }}>
              {activePage===1 && <P1 f={form} s={set}/>}
              {activePage===2 && <P2 f={form} s={set}/>}
              {activePage===3 && <P3 f={form} s={set} sr={serials} ssr={setSerials}/>}
              {activePage===4 && <P4 f={form} s={set} sr={serials} ssr={setSerials}/>}
              {activePage===5 && <P5 f={form} s={set} sr={serials} ssr={setSerials}/>}
              {activePage===6 && <P6 f={form} s={set} sr={serials} ssr={setSerials}/>}
              {activePage===7 && <P7 f={form} s={set} sr={serials} ssr={setSerials}/>}
            </div>
          </div>
        </div>

        {/* Bottom Bar — compact */}
        <div style={{ padding:'8px 20px', background:'#fff', borderTop:'1px solid #e2e8f0', display:'flex', alignItems:'center', justifyContent:'space-between', minHeight:40 }}>
          <button className="ipqc-btn" disabled={activePage===1} onClick={()=>goPage(activePage-1)}
            style={{ padding:'7px 18px', background:activePage===1?'#f1f5f9':'#fff', color:activePage===1?'#cbd5e1':'#334155', border:`1px solid ${activePage===1?'#f1f5f9':'#e2e8f0'}`, borderRadius:8, fontSize:12, fontWeight:600, cursor:activePage===1?'default':'pointer' }}>
            ← Prev
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            {PAGES.map(pg=>{
              const ppct=pageCounts[pg.n]?.total>0?Math.round(pageCounts[pg.n].filled/pageCounts[pg.n].total*100):0;
              return (
                <div key={pg.n} onClick={()=>goPage(pg.n)} title={`Page ${pg.n}`}
                  style={{ width:ppct===100?24:activePage===pg.n?24:16, height:6, borderRadius:3, cursor:'pointer',
                    background:ppct===100?'linear-gradient(90deg,#22c55e,#4ade80)':activePage===pg.n?'linear-gradient(90deg,#3b82f6,#60a5fa)':'#e2e8f0',
                    transition:'all 0.3s',
                  }}/>
              );
            })}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {activePage===7 ? (
              <button className="ipqc-btn" onClick={handleSave} disabled={saving}
                style={{ padding:'7px 24px', border:'none', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:saving?'default':'pointer', color:'#fff', background:saving?'#94a3b8':'linear-gradient(135deg,#059669,#10b981)', boxShadow:saving?'none':'0 3px 10px rgba(16,185,129,0.3)', display:'flex', alignItems:'center', gap:6 }}>
                {saving?<><Spinner/> Saving...</>:<>💾 Save</>}
              </button>
            ) : (
              <button className="ipqc-btn" onClick={()=>goPage(activePage+1)}
                style={{ padding:'7px 22px', background:'linear-gradient(135deg,#3b82f6,#2563eb)', color:'#fff', border:'none', borderRadius:8, fontSize:12.5, fontWeight:700, cursor:'pointer', boxShadow:'0 3px 10px rgba(37,99,235,0.25)', display:'flex', alignItems:'center', gap:5 }}>
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════
//  PAGE COMPONENTS — ULTRA COMPACT
// ══════════════════════════════

function P1({f,s}) { return (<>
  <Sub title="🌡️ Environment & Glass">
    <div style={G(6)}>
      <F label="Shop Floor Temp" name="shop_floor_temp" type="number" value={f.shop_floor_temp} onChange={s} unit="°C" placeholder="25"/>
      <F label="Humidity" name="shop_floor_humidity" type="number" value={f.shop_floor_humidity} onChange={s} unit="%" placeholder="40-60"/>
      <F label="Glass Dim (L×W×T)" name="glass_dimension" value={f.glass_dimension} onChange={s} placeholder="2274×1126×3.2"/>
      <T label="Glass Visual" name="glass_visual" value={f.glass_visual} onChange={s}/>
      <F label="EVA/EPE Type" name="eva_epe_type" value={f.eva_epe_type} onChange={s} placeholder="EP-304"/>
      <F label="EVA Dim (L×W×T)" name="eva_epe_dimension" value={f.eva_epe_dimension} onChange={s} placeholder="2272×1128×2.0"/>
    </div>
    <div style={{...G(6),marginTop:6}}>
      <T label="EVA Status" name="eva_epe_status" value={f.eva_epe_status} onChange={s}/>
    </div>
  </Sub>
  <Sub title="🔌 Cell & Soldering">
    <div style={G(6)}>
      <F label="Solder Temp" name="soldering_temp" type="number" value={f.soldering_temp} onChange={s} unit="°C" placeholder="400-420"/>
      <F label="Cell Mfr" name="cell_manufacturer" value={f.cell_manufacturer} onChange={s} placeholder="Solar Space"/>
      <F label="Cell Eff" name="cell_efficiency" type="number" value={f.cell_efficiency} onChange={s} unit="%" placeholder="25.40"/>
      <F label="Cell Size" name="cell_size" value={f.cell_size} onChange={s} placeholder="182×91.92"/>
      <T label="Cell Condition" name="cell_condition" value={f.cell_condition} onChange={s}/>
      <T label="Loading Clean" name="cell_loading_cleanliness" value={f.cell_loading_cleanliness||'OK'} onChange={s}/>
    </div>
  </Sub>
  <Sub title="📏 Cell Gap (per Stringer)">
    <div style={G(8)}>
      {['ts01a','ts01b','ts02a','ts02b','ts03a','ts03b','ts04a','ts04b'].map(k=>(
        <F key={k} label={k.toUpperCase()} name={`cell_gap_${k}`} type="number" value={f[`cell_gap_${k}`]} onChange={s} unit="mm" placeholder="0.80" step="0.01"/>
      ))}
    </div>
  </Sub>
  <div style={{...G(6),marginTop:4}}>
    <T label="Stringer Spec" name="stringer_specification" value={f.stringer_specification} onChange={s}/>
    <T label="TS Visual" name="ts_visual" value={f.ts_visual} onChange={s}/>
    <T label="TS EL Image" name="ts_el_image" value={f.ts_el_image} onChange={s}/>
  </div>
</>);}

function P2({f,s}) { return (<>
  <Sub title="🔬 Peel Strength">
    <div style={G(4)}>
      <F label="Ribbon to Cell" name="peel_strength_ribbon_cell" type="number" value={f.peel_strength_ribbon_cell} onChange={s} unit="N" placeholder="≥21"/>
      <F label="Ribbon to Busbar" name="peel_strength_ribbon_busbar" type="number" value={f.peel_strength_ribbon_busbar} onChange={s} unit="N" placeholder="≥22"/>
    </div>
  </Sub>
  <Sub title="📐 Distances & Gaps">
    <div style={G(5)}>
      <F label="String-String" name="string_to_string_gap" type="number" value={f.string_to_string_gap} onChange={s} unit="mm" placeholder="1.5"/>
      <F label="Edge-Top" name="cell_edge_glass_top" type="number" value={f.cell_edge_glass_top} onChange={s} unit="mm" placeholder="18.70"/>
      <F label="Edge-Bottom" name="cell_edge_glass_bottom" type="number" value={f.cell_edge_glass_bottom} onChange={s} unit="mm" placeholder="18.58"/>
      <F label="Edge-Sides" name="cell_edge_glass_sides" type="number" value={f.cell_edge_glass_sides} onChange={s} unit="mm" placeholder="12.46"/>
      <F label="Busbar-Cell" name="terminal_busbar_to_cell" type="number" value={f.terminal_busbar_to_cell} onChange={s} unit="mm" placeholder="3.04"/>
    </div>
  </Sub>
  <Sub title="📏 Creepage Distance">
    <div style={G(4)}>
      <F label="Top" name="creepage_top" type="number" value={f.creepage_top} onChange={s} unit="mm" placeholder="11.48"/>
      <F label="Bottom" name="creepage_bottom" type="number" value={f.creepage_bottom} onChange={s} unit="mm" placeholder="10.98"/>
      <F label="Left" name="creepage_left" type="number" value={f.creepage_left} onChange={s} unit="mm" placeholder="11.24"/>
      <F label="Right" name="creepage_right" type="number" value={f.creepage_right} onChange={s} unit="mm" placeholder="11.56"/>
    </div>
  </Sub>
  <div style={G(6)}>
    <T label="Solder Quality" name="soldering_quality" value={f.soldering_quality} onChange={s}/>
    <T label="Auto Taping" name="auto_taping" value={f.auto_taping} onChange={s}/>
    <T label="RFID/Logo" name="rfid_logo_position" value={f.rfid_logo_position} onChange={s}/>
    <F label="Back EVA Type" name="back_eva_type" value={f.back_eva_type} onChange={s} placeholder="EP-304"/>
    <F label="Back EVA Dim" name="back_eva_dimension" value={f.back_eva_dimension} onChange={s} placeholder="2274×1126×0.70"/>
    <F label="Back Glass Dim" name="back_glass_dimension" value={f.back_glass_dimension} onChange={s} placeholder="2272×1128×2.0"/>
  </div>
</>);}

function P3({f,s,sr,ssr}) { return (<>
  <Sub title="🕳️ Holes & Busbar">
    <div style={G(4)}>
      <F label="Hole 1" name="hole1_dimension" type="number" value={f.hole1_dimension} onChange={s} unit="mm" placeholder="12±0.5"/>
      <F label="Hole 2" name="hole2_dimension" type="number" value={f.hole2_dimension} onChange={s} unit="mm" placeholder="12±0.5"/>
      <F label="Hole 3" name="hole3_dimension" type="number" value={f.hole3_dimension} onChange={s} unit="mm" placeholder="12±0.5"/>
      <T label="Busbar Flatten" name="busbar_flatten" value={f.busbar_flatten} onChange={s}/>
    </div>
  </Sub>
  <Sub title="🔥 Soldering Iron">
    <div style={G(3)}>
      <F label="Iron Temp 1" name="soldering_iron_temp1" type="number" value={f.soldering_iron_temp1} onChange={s} unit="°C" placeholder="400-430"/>
      <F label="Iron Temp 2" name="soldering_iron_temp2" type="number" value={f.soldering_iron_temp2} onChange={s} unit="°C" placeholder="400-430"/>
      <F label="Rework Method" name="rework_method" value={f.rework_method} onChange={s} options={['Manual','Auto']}/>
    </div>
  </Sub>
  <div style={{...G(4),marginTop:4}}>
    <T label="Pre-Lam Visual" name="pre_lam_visual" value={f.pre_lam_visual} onChange={s}/>
    <T label="Rework Station" name="rework_station_clean" value={f.rework_station_clean||'OK'} onChange={s}/>
  </div>
  <SerialInput serials={sr} setSerials={ssr} page={3} stage="Pre-EL"/>
</>);}

function P4({f,s,sr,ssr}) { return (<>
  <Sub title="🧪 Tests & Visual">
    <div style={G(3)}>
      <F label="Peel EVA-Glass" name="peel_test_eva_glass" value={f.peel_test_eva_glass} onChange={s} placeholder="≥60 N/cm"/>
      <F label="Peel EVA-BS" name="peel_test_eva_backsheet" value={f.peel_test_eva_backsheet} onChange={s} placeholder="≥60 N/cm"/>
      <F label="Gel Content" name="gel_content" value={f.gel_content} onChange={s} placeholder="75-95%"/>
    </div>
    <div style={{...G(4),marginTop:6}}>
      <T label="Tape Remove" name="tape_removing" value={f.tape_removing} onChange={s}/>
      <T label="Trimming" name="trimming_quality" value={f.trimming_quality} onChange={s}/>
      <T label="Blade" name="trimming_blade_status" value={f.trimming_blade_status} onChange={s}/>
      <T label="Post-Lam" name="post_lam_visual" value={f.post_lam_visual} onChange={s}/>
    </div>
  </Sub>
  <Sub title="🖼️ Framing">
    <div style={G(4)}>
      <T label="Glue Uniform" name="glue_uniformity" value={f.glue_uniformity} onChange={s}/>
      <F label="Short Glue" name="short_side_glue_weight" type="number" value={f.short_side_glue_weight} onChange={s} unit="gm" placeholder="16.394" step="0.001"/>
      <F label="Long Glue" name="long_side_glue_weight" type="number" value={f.long_side_glue_weight} onChange={s} unit="gm" step="0.001"/>
      <F label="Anodizing" name="anodizing_thickness" type="number" value={f.anodizing_thickness} onChange={s} unit="μ" placeholder="≥15" step="0.1"/>
    </div>
  </Sub>
  <SerialInput serials={sr} setSerials={ssr} page={4} stage="Post-Lam"/>
</>);}

function P5({f,s,sr,ssr}) { return (<>
  <Sub title="📦 Junction Box">
    <div style={G(4)}>
      <T label="JB Appearance" name="jb_appearance" value={f.jb_appearance} onChange={s}/>
      <F label="Cable Length" name="jb_cable_length" type="number" value={f.jb_cable_length} onChange={s} unit="mm" placeholder="300"/>
      <F label="Silicon Glue" name="silicon_glue_weight" type="number" value={f.silicon_glue_weight} onChange={s} unit="gm" placeholder="21±6" step="0.001"/>
      <F label="Welding" name="welding_current" type="number" value={f.welding_current} onChange={s} unit="Amp" placeholder="17"/>
    </div>
    <div style={{...G(3),marginTop:6}}>
      <T label="JB Solder" name="soldering_quality_jb" value={f.soldering_quality_jb} onChange={s}/>
      <F label="Glue Ratio" name="glue_ratio" value={f.glue_ratio} onChange={s} placeholder="A/B Ratio"/>
      <F label="Potting Wt" name="potting_weight" type="number" value={f.potting_weight} onChange={s} unit="gm" placeholder="21±6" step="0.001"/>
    </div>
  </Sub>
  <Sub title="🌡️ Curing">
    <div style={G(5)}>
      <F label="Curing Temp" name="curing_temp" type="number" value={f.curing_temp} onChange={s} unit="°C" placeholder="25±3"/>
      <F label="Curing RH" name="curing_humidity" type="number" value={f.curing_humidity} onChange={s} unit="%" placeholder="≤50"/>
      <F label="Curing Time" name="curing_time" value={f.curing_time} onChange={s} placeholder="≥4 hrs"/>
      <T label="Buffing" name="buffing_condition" value={f.buffing_condition} onChange={s}/>
      <T label="Cleaning" name="cleaning_status" value={f.cleaning_status} onChange={s}/>
    </div>
  </Sub>
  <SerialInput serials={sr} setSerials={ssr} page={5} stage="Post-Visual"/>
</>);}

function P6({f,s,sr,ssr}) { return (<>
  <Sub title="🌡️ Environment">
    <div style={G(4)}>
      <F label="Ambient" name="ambient_temp" type="number" value={f.ambient_temp} onChange={s} unit="°C" placeholder="27.93"/>
      <F label="Module" name="module_temp" type="number" value={f.module_temp} onChange={s} unit="°C" placeholder="26.48"/>
      <T label="Calibration" name="simulator_calibration" value={f.simulator_calibration} onChange={s}/>
      <T label="EL Check" name="el_check" value={f.el_check} onChange={s}/>
    </div>
  </Sub>
  <Sub title="⚡ DCW / IR">
    <div style={G(4)}>
      <F label="DCW #1" name="dcw_value1" type="number" value={f.dcw_value1} onChange={s} unit="mA" placeholder="≤50" step="0.001"/>
      <F label="DCW #2" name="dcw_value2" type="number" value={f.dcw_value2} onChange={s} unit="mA" placeholder="≤50" step="0.001"/>
      <F label="DCW #3" name="dcw_value3" type="number" value={f.dcw_value3} onChange={s} unit="mA" placeholder="≤50" step="0.001"/>
      <F label="DCW #4" name="dcw_value4" type="number" value={f.dcw_value4} onChange={s} unit="mA" placeholder="≤50" step="0.001"/>
    </div>
    <div style={{...G(4),marginTop:6}}>
      <F label="IR #1" name="ir_value1" type="number" value={f.ir_value1} onChange={s} unit="MΩ" placeholder=">40" step="0.01"/>
      <F label="IR #2" name="ir_value2" type="number" value={f.ir_value2} onChange={s} unit="MΩ" placeholder=">40" step="0.01"/>
      <F label="IR #3" name="ir_value3" type="number" value={f.ir_value3} onChange={s} unit="MΩ" placeholder=">40" step="0.01"/>
      <F label="IR #4" name="ir_value4" type="number" value={f.ir_value4} onChange={s} unit="MΩ" placeholder=">40" step="0.01"/>
    </div>
  </Sub>
  <Sub title="🔌 Power">
    <div style={G(5)}>
      <F label="Voltage" name="voltage_verification" type="number" value={f.voltage_verification} onChange={s} unit="V" placeholder="55.10" step="0.01"/>
      <F label="Current" name="current_verification" type="number" value={f.current_verification} onChange={s} unit="A" placeholder="7.343" step="0.001"/>
      <F label="Mfg Month" name="manufacturing_month" value={f.manufacturing_month} onChange={s} placeholder="March 2026"/>
      <T label="Post EL" name="post_el_visual" value={f.post_el_visual} onChange={s}/>
      <T label="RFID Pos" name="rfid_position" value={f.rfid_position} onChange={s}/>
    </div>
  </Sub>
  <SerialInput serials={sr} setSerials={ssr} page={6} stage="Flash Tester"/>
</>);}

function P7({f,s,sr,ssr}) { return (<>
  <Sub title="📏 Dimensions">
    <div style={G(3)}>
      <F label="Module Dim (L×W×T)" name="module_dimension" value={f.module_dimension} onChange={s} placeholder="2278×1134×30 mm"/>
      <F label="Mount Hole X" name="mounting_hole_x" type="number" value={f.mounting_hole_x} onChange={s} unit="mm" placeholder="1400"/>
      <F label="Mount Hole Y" name="mounting_hole_y" type="number" value={f.mounting_hole_y} onChange={s} unit="mm" placeholder="1092"/>
    </div>
    <div style={{...G(3),marginTop:6}}>
      <F label="Diagonal Diff" name="diagonal_difference" type="number" value={f.diagonal_difference} onChange={s} unit="mm" placeholder="≤3" step="0.01"/>
      <F label="Corner Gap" name="corner_gap" type="number" value={f.corner_gap} onChange={s} unit="mm" placeholder="0.03" step="0.01"/>
      <F label="Cable Length" name="cable_length_final" type="number" value={f.cable_length_final} onChange={s} unit="mm" placeholder="300"/>
    </div>
  </Sub>
  <Sub title="📦 Packaging">
    <div style={G(5)}>
      <T label="Final Visual" name="final_visual" value={f.final_visual} onChange={s}/>
      <T label="Backlabel" name="backlabel" value={f.backlabel} onChange={s}/>
      <T label="Pkg Label" name="packaging_label" value={f.packaging_label} onChange={s}/>
      <T label="Box Content" name="box_content" value={f.box_content} onChange={s}/>
      <T label="Box Cond" name="box_condition" value={f.box_condition} onChange={s}/>
    </div>
    <div style={{...G(3),marginTop:6}}>
      <F label="Pallet Dimension" name="pallet_dimension" value={f.pallet_dimension} onChange={s} placeholder="2286×1019×142 mm"/>
    </div>
  </Sub>
  <SerialInput serials={sr} setSerials={ssr} page={7} stage="Final Visual"/>
</>);}

// ══════════════════════════════
//  HELPERS
// ══════════════════════════════

function VF({ l, v, u }) {
  const has=v!=null&&v!=='';
  return (
    <div>
      <div style={{ fontSize:9, color:'#64748b', fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', marginBottom:2 }}>{l}</div>
      <div style={{ fontSize:12.5, fontWeight:600, color:has?'#1e293b':'#d1d5db', padding:'3px 0', borderBottom:`1px solid ${has?'#e2e8f0':'#f8fafc'}` }}>
        {has?<>{v}{u?<span style={{color:'#94a3b8',fontSize:10,marginLeft:3}}>{u}</span>:''}</>:'—'}
      </div>
    </div>
  );
}

function FraudBadge({ v }) {
  const M={GENUINE:['#059669','#ecfdf5'],NEEDS_REVIEW:['#d97706','#fffbeb'],SUSPICIOUS:['#f97316','#fff7ed'],LIKELY_DUMMY:['#dc2626','#fef2f2']};
  const [c,bg]=M[v]||['#64748b','#f8fafc'];
  return <span style={{ background:bg, color:c, padding:'2px 8px', borderRadius:6, fontSize:9.5, fontWeight:700, border:`1px solid ${c}25` }}>{v}</span>;
}

function Spinner() {
  return <span style={{ display:'inline-block', width:12, height:12, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.6s linear infinite' }}/>;
}

const TD = { padding:'8px 12px', borderBottom:'1px solid #f1f5f9', fontSize:12 };

export default IPQCFormPage;
