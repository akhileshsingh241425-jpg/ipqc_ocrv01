import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_BASE = '/api';

// ========== IPQC RESULTS PAGE ==========
// Shows all saved/processed IPQC OCR results from database
// This data persists across refresh — independent of ERP API

function IPQCResultsPage() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterLine, setFilterLine] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [expandedRow, setExpandedRow] = useState(null);
  const [statsData, setStatsData] = useState(null);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listRes, statsRes] = await Promise.all([
        axios.get(`${API_BASE}/ipqc-data/list?limit=500`),
        axios.get(`${API_BASE}/ipqc-data/stats`)
      ]);
      if (listRes.data.success) {
        setResults(listRes.data.data || []);
      }
      if (statsRes.data.success) {
        setStatsData(statsRes.data.stats);
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchResults(); }, [fetchResults]);

  // Filters
  const filtered = results.filter(item => {
    if (filterDate && item.date !== filterDate) return false;
    if (filterLine && item.line !== filterLine) return false;
    if (filterShift && item.shift !== filterShift) return false;
    return true;
  });

  const uniqueDates = [...new Set(results.map(r => r.date).filter(Boolean))].sort().reverse();
  const uniqueLines = [...new Set(results.map(r => r.line).filter(Boolean))].sort();
  const uniqueShifts = [...new Set(results.map(r => r.shift).filter(Boolean))];

  const processedCount = results.filter(r => r.is_processed).length;

  const handleDownload = (filename) => {
    if (filename) window.open(`${API_BASE}/ipqc-ocr/download/${filename}`, '_blank');
  };

  const toggleRow = (id) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  const verdictStyle = (verdict) => {
    const map = {
      'GENUINE': { bg: '#10b98122', color: '#10b981', icon: '✅' },
      'NEEDS_REVIEW': { bg: '#f59e0b22', color: '#f59e0b', icon: '⚠️' },
      'SUSPICIOUS': { bg: '#f9731622', color: '#f97316', icon: '🔶' },
      'LIKELY_DUMMY': { bg: '#ef444422', color: '#ef4444', icon: '🚨' },
    };
    return map[verdict] || { bg: '#94a3b822', color: '#94a3b8', icon: '—' };
  };

  return (
    <div>
      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon bg-blue">📊</div>
          <div className="stat-body">
            <span className="stat-val">{results.length}</span>
            <span className="stat-lbl">Total Records</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-green">✅</div>
          <div className="stat-body">
            <span className="stat-val">{processedCount}</span>
            <span className="stat-lbl">OCR Processed</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-purple">📄</div>
          <div className="stat-body">
            <span className="stat-val">{filtered.length}</span>
            <span className="stat-lbl">Showing</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-amber">📅</div>
          <div className="stat-body">
            <span className="stat-val">{uniqueDates.length}</span>
            <span className="stat-lbl">Unique Dates</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-top">
          <h2>📊 Saved IPQC Results (Database)</h2>
          <button onClick={fetchResults} disabled={loading} className="btn btn-ghost">
            {loading ? <span className="spin-sm"></span> : '🔄'} Refresh
          </button>
        </div>

        <div style={{ padding: '8px 16px', background: '#f0fdf4', borderRadius: 6, margin: '0 0 12px', fontSize: 13, color: '#166534' }}>
          💾 Yeh data MySQL database mein save hai — page refresh karne par bhi rahega
        </div>

        {/* Filters */}
        <div className="filters">
          <div className="flt-group">
            <label>Date</label>
            <select value={filterDate} onChange={e => setFilterDate(e.target.value)}>
              <option value="">All ({uniqueDates.length})</option>
              {uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flt-group">
            <label>Shift</label>
            <select value={filterShift} onChange={e => setFilterShift(e.target.value)}>
              <option value="">All</option>
              {uniqueShifts.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flt-group">
            <label>Line</label>
            <select value={filterLine} onChange={e => setFilterLine(e.target.value)}>
              <option value="">All</option>
              {uniqueLines.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {error && <div className="alert alert-error">❌ {error}</div>}
        {loading && results.length === 0 && <div className="alert alert-info"><span className="spin-sm"></span> Loading...</div>}

        {filtered.length === 0 && !loading && (
          <div className="alert alert-info">
            Koi processed result nahi mila. Pehle IPQC tab mein jaake checklist process karo.
          </div>
        )}

        {filtered.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Line</th>
                  <th>Shift</th>
                  <th>Source</th>
                  <th>Fraud Check</th>
                  <th>Status</th>
                  <th>Downloads</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const vs = verdictStyle(item.fraud_verdict);
                  const isExpanded = expandedRow === item.id;
                  let pr = null;
                  try {
                    pr = item.process_result ? (typeof item.process_result === 'string' ? JSON.parse(item.process_result) : item.process_result) : null;
                  } catch(e) { /* ignore */ }

                  return (
                    <React.Fragment key={item.id}>
                      <tr className={item.is_processed ? 'row-done' : ''}>
                        <td className="td-num">{idx + 1}</td>
                        <td className="td-date">{item.date || '—'}</td>
                        <td><span className="badge badge-line">Line {item.line || '—'}</span></td>
                        <td>
                          <span className={`badge badge-shift ${(item.shift || '').toLowerCase()}`}>
                            {item.shift === 'Day' ? '☀️' : '🌙'} {item.shift || '—'}
                          </span>
                        </td>
                        <td>
                          <span style={{ fontSize: 11, background: item.source === 'ocr' ? '#3b82f622' : '#94a3b822', color: item.source === 'ocr' ? '#3b82f6' : '#64748b', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                            {item.source === 'ocr' ? '🔬 OCR' : '📝 Form'}
                          </span>
                        </td>
                        <td>
                          {item.fraud_verdict ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: vs.bg, color: vs.color, border: `1.5px solid ${vs.color}`, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
                              {vs.icon} {item.fraud_verdict} {item.fraud_score != null && <span style={{ opacity: 0.7, fontSize: 10 }}>({item.fraud_score})</span>}
                            </span>
                          ) : <span style={{ fontSize: 11, color: '#94a3b8' }}>—</span>}
                        </td>
                        <td>
                          {item.is_processed ? (
                            <span className="status status-done">✅ Processed</span>
                          ) : (
                            <span className="status status-pend">📝 Saved</span>
                          )}
                        </td>
                        <td>
                          <div className="actions-cell">
                            {item.excel_output_file && (
                              <button className="btn btn-sm btn-success" onClick={() => handleDownload(item.excel_output_file)} title="System Excel">
                                📥 System
                              </button>
                            )}
                            {item.human_excel_file && (
                              <button className="btn btn-sm btn-warning" onClick={() => handleDownload(item.human_excel_file)} title="Handwritten Excel">
                                ✍️ Real
                              </button>
                            )}
                            {item.scanned_pdf_file && (
                              <button className="btn btn-sm btn-danger" onClick={() => handleDownload(item.scanned_pdf_file)} title="Scanned PDF">
                                📄 Scan
                              </button>
                            )}
                          </div>
                        </td>
                        <td>
                          <button className="btn btn-sm btn-ghost" onClick={() => toggleRow(item.id)}>
                            {isExpanded ? '▲ Hide' : '▼ Show'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} style={{ padding: 0 }}>
                            <ExpandedDetails item={item} processResult={pr} onDownload={handleDownload} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ========== EXPANDED DETAILS PANEL ==========
function ExpandedDetails({ item, processResult, onDownload }) {
  const pr = processResult;

  return (
    <div style={{ background: '#f8fafc', padding: 16, borderTop: '2px solid #e2e8f0' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        
        {/* Basic Info */}
        <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>📋 Basic Info</h4>
          <InfoRow label="ID" value={`#${item.id}`} />
          <InfoRow label="Date" value={item.date} />
          <InfoRow label="Line" value={item.line} />
          <InfoRow label="Shift" value={item.shift} />
          <InfoRow label="PO Number" value={item.po_number} />
          <InfoRow label="Source" value={item.source} />
          <InfoRow label="Created" value={item.created_at ? new Date(item.created_at).toLocaleString() : '—'} />
        </div>

        {/* Page 1: Shop Floor */}
        <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>🌡️ Page 1 — Shop Floor</h4>
          <InfoRow label="Temperature" value={item.shop_floor_temp} />
          <InfoRow label="Humidity" value={item.shop_floor_humidity} />
          <InfoRow label="Soldering Temp" value={item.soldering_temp} />
          <InfoRow label="Cell Efficiency" value={item.cell_efficiency} />
        </div>

        {/* Page 2: Gaps & Creepage */}
        <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>📏 Page 2 — Gaps & Creepage</h4>
          <InfoRow label="String-to-String Gap" value={item.string_to_string_gap} />
          <InfoRow label="Cell Edge Top" value={item.cell_edge_glass_top} />
          <InfoRow label="Cell Edge Bottom" value={item.cell_edge_glass_bottom} />
          <InfoRow label="Cell Edge Sides" value={item.cell_edge_glass_sides} />
          <InfoRow label="Creepage Top" value={item.creepage_top} />
          <InfoRow label="Creepage Bottom" value={item.creepage_bottom} />
        </div>

        {/* Page 5: Glue & Curing */}
        <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>🔧 Page 5 — Assembly</h4>
          <InfoRow label="Glue Weight" value={item.short_side_glue_weight} />
          <InfoRow label="Potting Weight" value={item.potting_weight} />
          <InfoRow label="Welding Current" value={item.welding_current} />
          <InfoRow label="Curing Temp" value={item.curing_temp} />
          <InfoRow label="Curing Humidity" value={item.curing_humidity} />
        </div>

        {/* Page 6: Testing */}
        <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>⚡ Page 6 — Testing</h4>
          <InfoRow label="Ambient Temp" value={item.ambient_temp} />
          <InfoRow label="Module Temp" value={item.module_temp} />
          <InfoRow label="DCW Values" value={[item.dcw_value1, item.dcw_value2, item.dcw_value3, item.dcw_value4].filter(Boolean).join(', ')} />
          <InfoRow label="IR Values" value={[item.ir_value1, item.ir_value2, item.ir_value3, item.ir_value4].filter(Boolean).join(', ')} />
        </div>

        {/* Page 7: Final */}
        <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>📦 Page 7 — Final</h4>
          <InfoRow label="Module Dimension" value={item.module_dimension} />
          <InfoRow label="Diagonal Difference" value={item.diagonal_difference} />
          <InfoRow label="Anodizing Thickness" value={item.anodizing_thickness} />
        </div>

        {/* OCR Stats (if process result exists) */}
        {pr && pr.stats && (
          <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>🔬 OCR Stats</h4>
            <InfoRow label="Pages Scanned" value={`${pr.stats.pagesScanned}/${pr.stats.totalPages}`} />
            <InfoRow label="Scan %" value={`${pr.stats.scanPercent}%`} />
            <InfoRow label="Serial Numbers" value={pr.stats.totalSerials} />
            <InfoRow label="Temperatures" value={pr.stats.totalTemps} />
            <InfoRow label="Characters" value={pr.stats.totalChars?.toLocaleString()} />
          </div>
        )}

        {/* Downloads */}
        <div style={{ background: '#fff', borderRadius: 8, padding: 12, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>📥 All Downloads</h4>
          {item.excel_output_file && (
            <button className="btn btn-sm btn-success" style={{ margin: '4px 4px 4px 0', width: '100%' }} onClick={() => onDownload(item.excel_output_file)}>
              📥 System Excel — {item.excel_output_file}
            </button>
          )}
          {item.human_excel_file && (
            <button className="btn btn-sm btn-warning" style={{ margin: '4px 4px 4px 0', width: '100%' }} onClick={() => onDownload(item.human_excel_file)}>
              ✍️ Handwritten Excel — {item.human_excel_file}
            </button>
          )}
          {item.scanned_pdf_file && (
            <button className="btn btn-sm btn-danger" style={{ margin: '4px 4px 4px 0', width: '100%' }} onClick={() => onDownload(item.scanned_pdf_file)}>
              📄 Scanned PDF — {item.scanned_pdf_file}
            </button>
          )}
          {item.ocr_data_file && (
            <button className="btn btn-sm btn-ghost" style={{ margin: '4px 4px 4px 0', width: '100%' }} onClick={() => onDownload(item.ocr_data_file)}>
              📑 OCR Data JSON — {item.ocr_data_file}
            </button>
          )}
          {!item.excel_output_file && !item.human_excel_file && !item.scanned_pdf_file && (
            <span style={{ fontSize: 12, color: '#94a3b8' }}>No downloads available</span>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12, borderBottom: '1px solid #f1f5f9' }}>
      <span style={{ color: '#64748b', fontWeight: 500 }}>{label}</span>
      <span style={{ color: '#1e293b', fontWeight: 600, textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

export default IPQCResultsPage;
