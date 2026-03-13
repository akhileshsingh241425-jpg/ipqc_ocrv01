import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import CircleProgress from './CircleProgress';

const API_BASE = '/api';

// ========== FRAUD VERDICT BADGE ==========
function FraudBadge({ verdict, score }) {
  const styles = {
    GENUINE: { bg: '#10b981', icon: '✅', label: 'Genuine' },
    NEEDS_REVIEW: { bg: '#f59e0b', icon: '⚠️', label: 'Review' },
    SUSPICIOUS: { bg: '#f97316', icon: '🔶', label: 'Suspicious' },
    LIKELY_DUMMY: { bg: '#ef4444', icon: '🚨', label: 'Dummy!' },
  };
  const s = styles[verdict] || styles.GENUINE;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: s.bg + '22', color: s.bg, border: `1.5px solid ${s.bg}`, borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 700 }}>
      {s.icon} {s.label} {score !== undefined && <span style={{ opacity: 0.7, fontSize: 10 }}>({score})</span>}
    </span>
  );
}

// ========== FRAUD ANALYSIS PANEL ==========
function FraudAnalysisPanel({ fraudAnalysis }) {
  const [expandedPast, setExpandedPast] = useState(null);
  const [showFlags, setShowFlags] = useState(true);
  if (!fraudAnalysis) return null;

  const fa = fraudAnalysis;
  const verdictColors = {
    GENUINE: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', icon: '✅' },
    NEEDS_REVIEW: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', icon: '⚠️' },
    SUSPICIOUS: { bg: '#fff7ed', border: '#f97316', text: '#9a3412', icon: '🔶' },
    LIKELY_DUMMY: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', icon: '🚨' },
  };
  const vc = verdictColors[fa.overallVerdict] || verdictColors.GENUINE;

  return (
    <div style={{ marginTop: 24, borderRadius: 12, border: `2px solid ${vc.border}`, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: vc.bg, padding: '16px 20px', borderBottom: `1.5px solid ${vc.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: vc.text, fontSize: 18 }}>
              {vc.icon} IPQC Fraud Detection — <span style={{ textTransform: 'uppercase' }}>{fa.overallVerdict.replace('_', ' ')}</span>
            </h3>
            <p style={{ margin: '6px 0 0', color: vc.text, fontSize: 13, opacity: 0.85 }}>{fa.overallSummary}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: vc.text }}>{fa.genuineScore}%</div>
              <div style={{ fontSize: 11, color: vc.text, opacity: 0.7 }}>Genuine Score</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: vc.text }}>{fa.overallScore}</div>
              <div style={{ fontSize: 11, color: vc.text, opacity: 0.7 }}>Fraud Score</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, padding: '12px 16px', background: '#f8fafc' }}>
        <StatMini label="Values Found" value={fa.currentValues?.totalMeasurableValues || 0} icon="📊" />
        <StatMini label="Serials Found" value={fa.currentValues?.totalSerials || 0} icon="🔢" />
        <StatMini label="Past Checksheets" value={fa.pastDatasetsCount || 0} icon="📁" />
        <StatMini label="Statistical Flags" value={fa.statisticalAnalysis?.totalFlags || 0} icon="🚩"
          color={fa.statisticalAnalysis?.totalFlags > 0 ? '#ef4444' : '#10b981'} />
        {fa.copyDetected && <StatMini label="Copy Detected!" value="YES" icon="🚨" color="#ef4444" />}
      </div>

      {/* Worst Match (if copy detected) */}
      {fa.worstMatch && fa.worstMatch.exactMatchCount > 0 && (
        <div style={{ margin: '12px 16px', padding: 14, background: fa.worstMatch.verdict === 'COPIED' ? '#fef2f2' : fa.worstMatch.verdict === 'SUSPICIOUS' ? '#fff7ed' : '#fffbeb', borderRadius: 8, border: `1px solid ${fa.worstMatch.verdict === 'COPIED' ? '#fca5a5' : fa.worstMatch.verdict === 'SUSPICIOUS' ? '#fdba74' : '#fcd34d'}` }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>
            🔍 Most Similar Past Checksheet
          </h4>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
            <span><strong>Date:</strong> {fa.worstMatch.pastDate}</span>
            <span><strong>Line:</strong> {fa.worstMatch.pastLine}</span>
            <span><strong>Shift:</strong> {fa.worstMatch.pastShift}</span>
            <span><strong>Days Ago:</strong> {fa.worstMatch.daysAgo}</span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginTop: 8 }}>
            <span style={{ color: '#ef4444', fontWeight: 700 }}>🎯 {fa.worstMatch.exactMatchCount} Exact Matches</span>
            <span style={{ color: '#f97316' }}>≈ {fa.worstMatch.nearMatchCount} Near Matches</span>
            <span>Match: <strong>{fa.worstMatch.matchPercentage}%</strong></span>
            {fa.worstMatch.serialOverlap > 0 && <span style={{ color: '#ef4444' }}>🔢 {fa.worstMatch.serialOverlap} Serial Overlap!</span>}
          </div>
          {/* Exact match details */}
          {fa.worstMatch.exactMatches.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>Exact Match Details:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {fa.worstMatch.exactMatches.map((m, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, background: '#fee2e2', color: '#991b1b', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 500 }}>
                    P{m.page} {m.parameter}: {m.currentValue}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Statistical Flags */}
      {fa.statisticalAnalysis?.flags?.length > 0 && (
        <div style={{ margin: '0 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={() => setShowFlags(!showFlags)}>
            <h4 style={{ margin: 0, fontSize: 14, color: '#1e293b' }}>🚩 Statistical Fraud Flags ({fa.statisticalAnalysis.flags.length})</h4>
            <span style={{ fontSize: 12 }}>{showFlags ? '▼' : '▶'}</span>
          </div>
          {showFlags && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {fa.statisticalAnalysis.flags.map((flag, i) => {
                const sevColors = { CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#64748b' };
                const sc = sevColors[flag.severity] || '#64748b';
                return (
                  <div key={i} style={{ padding: '8px 12px', background: sc + '0d', border: `1px solid ${sc}40`, borderRadius: 6, fontSize: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ background: sc, color: '#fff', borderRadius: 3, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>{flag.severity}</span>
                      <span style={{ fontWeight: 600, color: '#1e293b' }}>{flag.parameter}</span>
                    </div>
                    <p style={{ margin: '4px 0 0', color: '#475569' }}>{flag.message}</p>
                    {flag.values?.length > 0 && (
                      <div style={{ marginTop: 4, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {flag.values.slice(0, 10).map((v, vi) => (
                          <span key={vi} style={{ background: sc + '1a', color: sc, borderRadius: 3, padding: '1px 5px', fontSize: 10 }}>{v}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* All Past Data Comparisons */}
      {fa.pastDataComparisons?.length > 0 && (
        <div style={{ margin: '0 16px 16px' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#1e293b' }}>📂 Comparison with {fa.pastDataComparisons.length} Past Checksheets</h4>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Line</th>
                  <th style={thStyle}>Shift</th>
                  <th style={thStyle}>Days Ago</th>
                  <th style={thStyle}>Exact</th>
                  <th style={thStyle}>Near</th>
                  <th style={thStyle}>Match%</th>
                  <th style={thStyle}>Serials</th>
                  <th style={thStyle}>Verdict</th>
                  <th style={thStyle}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {fa.pastDataComparisons.map((pc, idx) => {
                  const rowBg = pc.verdict === 'COPIED' ? '#fef2f2' : pc.verdict === 'SUSPICIOUS' ? '#fff7ed' : pc.verdict === 'NEEDS_REVIEW' ? '#fffbeb' : '#fff';
                  return (
                    <React.Fragment key={idx}>
                      <tr style={{ background: rowBg }}>
                        <td style={tdStyle}>{pc.pastDate}</td>
                        <td style={tdStyle}>{pc.pastLine}</td>
                        <td style={tdStyle}>{pc.pastShift}</td>
                        <td style={tdStyle}>{pc.daysAgo}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: pc.exactMatchCount >= 5 ? '#ef4444' : '#1e293b' }}>{pc.exactMatchCount}</td>
                        <td style={tdStyle}>{pc.nearMatchCount}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{pc.matchPercentage}%</td>
                        <td style={tdStyle}>{pc.serialOverlap > 0 ? <span style={{ color: '#ef4444' }}>{pc.serialOverlap} ⚠</span> : '0'}</td>
                        <td style={tdStyle}><FraudBadge verdict={pc.verdict} /></td>
                        <td style={tdStyle}>
                          {(pc.exactMatchCount > 0 || pc.nearMatchCount > 0) && (
                            <button style={{ fontSize: 11, padding: '2px 8px', cursor: 'pointer', border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff' }}
                              onClick={() => setExpandedPast(expandedPast === idx ? null : idx)}>
                              {expandedPast === idx ? '▲ Hide' : '▼ Show'}
                            </button>
                          )}
                        </td>
                      </tr>
                      {expandedPast === idx && (
                        <tr>
                          <td colSpan={10} style={{ padding: '8px 12px', background: '#f8fafc' }}>
                            {pc.exactMatches.length > 0 && (
                              <div style={{ marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#ef4444' }}>Exact Matches:</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                  {pc.exactMatches.map((m, mi) => (
                                    <span key={mi} style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 6px', borderRadius: 3, fontSize: 10 }}>
                                      P{m.page} {m.parameter}={m.currentValue}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {pc.nearMatches.length > 0 && (
                              <div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: '#f97316' }}>Near Matches:</span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                  {pc.nearMatches.map((m, mi) => (
                                    <span key={mi} style={{ background: '#ffedd5', color: '#9a3412', padding: '2px 6px', borderRadius: 3, fontSize: 10 }}>
                                      P{m.page} {m.parameter}: {m.currentValue} vs {m.pastValue} (±{m.deviationPct}%)
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Extracted Values List */}
      {fa.currentValues?.valuesList?.length > 0 && (
        <details style={{ margin: '0 16px 16px' }}>
          <summary style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', cursor: 'pointer' }}>
            📊 All Extracted Measurable Values ({fa.currentValues.valuesList.length})
          </summary>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {fa.currentValues.valuesList.map((v, i) => (
              <span key={i} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
                <span style={{ color: '#64748b' }}>P{v.page}</span> {v.name}: <strong>{v.value}</strong>
              </span>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

const thStyle = { padding: '6px 8px', textAlign: 'left', borderBottom: '1.5px solid #e2e8f0', fontSize: 11, color: '#64748b', fontWeight: 600 };
const tdStyle = { padding: '6px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 12 };

function StatMini({ label, value, icon, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', borderRadius: 6, padding: '8px 12px', border: '1px solid #e2e8f0' }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: color || '#1e293b' }}>{value}</div>
        <div style={{ fontSize: 10, color: '#64748b' }}>{label}</div>
      </div>
    </div>
  );
}

// ========== COMPARISON PANEL ==========
function ComparisonPanel({ checklist, result, onBack, onDownloadExcel, onDownloadHumanExcel, humanExcelGenerated, scannedPdfGenerated, onDownloadScannedPdf, onSavePdf, savingPdf, onDownloadSummaryPdf }) {
  const [activePg, setActivePg] = useState(0);

  const pdfPages = result.pdfUrls || checklist.pdfPages || [];
  const extracted = result.extractedData || [];
  const st = result.stats || {};
  const pgStats = st.pageStats || [];
  const fraudAnalysis = result.fraudAnalysis || null;

  const totalPages = st.totalPages || pdfPages.length;
  const pagesScanned = st.pagesScanned || extracted.filter(p => (p.rawText?.length || 0) > 0).length;
  const pagesWithAnyData = st.pagesWithAnyData || extracted.filter(p =>
    (p.serialNumbers?.length || 0) > 0 || (p.temperatures?.length || 0) > 0 ||
    (p.times?.length || 0) > 0 || (p.dates?.length || 0) > 0
  ).length;
  const pagesWithSerials = st.pagesWithSerials || extracted.filter(p => (p.serialNumbers?.length || 0) > 0).length;
  const totalSerials = st.totalSerials || extracted.reduce((s, p) => s + (p.serialNumbers?.length || 0), 0);
  const totalTemps = st.totalTemps || extracted.reduce((s, p) => s + (p.temperatures?.length || 0), 0);
  const totalDims = st.totalDimensions || extracted.reduce((s, p) => s + (p.dimensions?.length || 0), 0);
  const totalTimes = st.totalTimes || extracted.reduce((s, p) => s + (p.times?.length || 0), 0);
  const totalDates = st.totalDates || extracted.reduce((s, p) => s + (p.dates?.length || 0), 0);
  const totalChars = st.totalChars || extracted.reduce((s, p) => s + (p.rawText?.length || 0), 0);
  const pagesWithErrors = st.pagesWithErrors || extracted.filter(p => p.error).length;

  const scanPercent = st.scanPercent || (totalPages > 0 ? Math.round((pagesScanned / totalPages) * 100) : 0);
  const dataPercent = st.dataFetchPercent || (totalPages > 0 ? Math.round((pagesWithAnyData / totalPages) * 100) : 0);
  const serialPercent = st.serialPercent || (totalPages > 0 ? Math.round((pagesWithSerials / totalPages) * 100) : 0);

  const currentPdf = pdfPages[activePg];
  const currentUrl = currentPdf?.url || currentPdf;
  const currentData = extracted[activePg];

  const getPageScanStatus = (i) => {
    if (pgStats[i]) return pgStats[i];
    const pg = extracted[i];
    if (!pg) return { scanned: false, chars: 0, serials: 0, temps: 0, times: 0, dates: 0, dims: 0, error: null };
    return {
      scanned: (pg.rawText?.length || 0) > 0,
      chars: pg.rawText?.length || 0,
      serials: pg.serialNumbers?.length || 0,
      temps: pg.temperatures?.length || 0,
      times: pg.times?.length || 0,
      dates: pg.dates?.length || 0,
      dims: pg.dimensions?.length || 0,
      error: pg.error || null
    };
  };

  const proxyUrl = currentUrl
    ? `${API_BASE}/ipqc-ocr/proxy-pdf?url=${encodeURIComponent(currentUrl)}`
    : null;

  return (
    <div className="comparison">
      <div className="comp-header">
        <div className="comp-left">
          <button className="btn btn-ghost btn-back" onClick={onBack}>← Back to List</button>
          <div className="comp-title">
            <h2>📊 IPQC Comparison View</h2>
            <div className="comp-meta">
              <span className="meta-tag">📅 {checklist.date || '—'}</span>
              <span className="meta-tag">🏭 Line {checklist.Line || '—'}</span>
              <span className={`meta-tag shift-tag ${(checklist.Shift || '').toLowerCase()}`}>
                {checklist.Shift === 'Day' ? '☀️' : '🌙'} {checklist.Shift || '—'}
              </span>
            </div>
          </div>
        </div>
        <div className="comp-right comp-circles">
          <CircleProgress percent={scanPercent} size={90} strokeWidth={7} label="OCR Scan" />
          <CircleProgress percent={dataPercent} size={90} strokeWidth={7} label="Data Found" />
          <CircleProgress percent={serialPercent} size={90} strokeWidth={7} label="Serials" />
        </div>
      </div>

      <div className="scan-overview">
        <div className="scan-overview-hdr">
          <h3>📡 Page-wise Scan Status</h3>
          <span className="scan-total">{totalChars.toLocaleString()} chars OCR'd total</span>
        </div>
        <div className="scan-grid">
          {pdfPages.map((p, i) => {
            const pg = p?.page || i + 1;
            const stat = getPageScanStatus(i);
            return (
              <div key={i} className={`scan-cell ${activePg === i ? 'scan-active' : ''} ${stat.error ? 'scan-error' : stat.scanned ? 'scan-ok' : 'scan-fail'}`} onClick={() => setActivePg(i)}>
                <div className="scan-cell-top">
                  <span className="scan-pg">Page {pg}</span>
                  <span className="scan-status-icon">{stat.error ? '❌' : stat.scanned ? '✅' : '⚠️'}</span>
                </div>
                <div className="scan-cell-chars">{stat.chars.toLocaleString()} chars</div>
                <div className="scan-cell-items">
                  {stat.serials > 0 && <span className="sci sci-serial">{stat.serials} SN</span>}
                  {stat.temps > 0 && <span className="sci sci-temp">{stat.temps} T°</span>}
                  {stat.times > 0 && <span className="sci sci-time">{stat.times} ⏱</span>}
                  {stat.dates > 0 && <span className="sci sci-date">{stat.dates} 📅</span>}
                  {stat.dims > 0 && <span className="sci sci-dim">{stat.dims} 📏</span>}
                  {stat.serials === 0 && stat.temps === 0 && stat.times === 0 && stat.dates === 0 && stat.dims === 0 && (
                    <span className="sci sci-none">raw text only</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="comp-stats-row">
        <div className="comp-stat-card"><span className="csc-val">{totalPages}</span><span className="csc-lbl">Total Pages</span></div>
        <div className="comp-stat-card"><span className="csc-val csc-green">{pagesScanned}/{totalPages}</span><span className="csc-lbl">Scanned OK</span></div>
        <div className="comp-stat-card"><span className="csc-val">{totalSerials}</span><span className="csc-lbl">Serial Numbers</span></div>
        <div className="comp-stat-card"><span className="csc-val">{totalTemps}</span><span className="csc-lbl">Temperatures</span></div>
        <div className="comp-stat-card"><span className="csc-val">{totalTimes}</span><span className="csc-lbl">Times</span></div>
        <div className="comp-stat-card"><span className="csc-val">{totalDates}</span><span className="csc-lbl">Dates</span></div>
        <div className="comp-stat-card"><span className="csc-val">{totalDims}</span><span className="csc-lbl">Dimensions</span></div>
        <div className="comp-stat-card"><span className="csc-val">{result.excelGenerated ? '✅' : '❌'}</span><span className="csc-lbl">Excel Ready</span></div>
      </div>

      <div className="page-nav">
        {pdfPages.map((p, i) => {
          const pg = p?.page || i + 1;
          const stat = getPageScanStatus(i);
          const hasItems = stat.serials > 0 || stat.temps > 0 || stat.times > 0 || stat.dates > 0;
          return (
            <button key={i} className={`page-tab ${activePg === i ? 'active' : ''} ${stat.error ? 'tab-error' : stat.scanned ? (hasItems ? 'has-data' : 'scanned-only') : ''}`} onClick={() => setActivePg(i)}>
              <span className="page-tab-status">{stat.error ? '❌' : stat.scanned ? '✅' : '⚠️'}</span>
              Page {pg}
              {stat.serials > 0 && <span className="page-tab-badge">{stat.serials} SN</span>}
            </button>
          );
        })}
      </div>

      <div className="split-view">
        <div className="split-panel split-pdf">
          <div className="panel-top">
            <h3>📄 Original IPQC PDF — Page {pdfPages[activePg]?.page || activePg + 1}</h3>
            <button className="btn btn-sm btn-outline" onClick={onSavePdf} disabled={savingPdf}>
              {savingPdf ? '⏳ Saving...' : '💾 Save All PDFs'}
            </button>
          </div>
          <div className="pdf-frame">
            {proxyUrl ? (
              <iframe src={proxyUrl} title={`IPQC PDF Page ${activePg + 1}`} />
            ) : (
              <div className="pdf-empty"><span className="empty-icon">📄</span><p>No PDF available</p></div>
            )}
          </div>
        </div>

        <div className="split-panel split-data">
          <div className="panel-top">
            <h3>📊 Extracted Data — Page {pdfPages[activePg]?.page || activePg + 1}
              {currentData ? (
                <span className="panel-scan-badge">
                  {currentData?.rawText?.length > 0 ? '✅ Scanned' : '⚠️ Not Scanned'}
                </span>
              ) : null}
            </h3>
            {result.excelGenerated && <button className="btn btn-sm btn-success" onClick={onDownloadExcel}>📥 System</button>}
            {humanExcelGenerated && <button className="btn btn-sm btn-warning" onClick={onDownloadHumanExcel}>✍️ Real</button>}
            {scannedPdfGenerated && <button className="btn btn-sm btn-danger" onClick={onDownloadScannedPdf}>📄 Scan PDF</button>}
            {result && <button className="btn btn-sm" style={{background:'#7c3aed',color:'#fff'}} onClick={onDownloadSummaryPdf}>📄 Summary</button>}
          </div>
          <div className="data-content">
            {currentData ? (
              currentData.error ? (
                <div className="alert alert-error">Error: {currentData.error}</div>
              ) : (
                <>
                  <div className="page-mini-stats">
                    <div className={`pms ${(currentData.rawText?.length || 0) > 0 ? 'pms-ok' : 'pms-fail'}`}>
                      <span className="pms-num">{(currentData.rawText?.length || 0).toLocaleString()}</span><span className="pms-txt">OCR Chars</span>
                    </div>
                    <div className={`pms ${(currentData.serialNumbers?.length || 0) > 0 ? 'pms-ok' : ''}`}>
                      <span className="pms-num">{currentData.serialNumbers?.length || 0}</span><span className="pms-txt">Serials</span>
                    </div>
                    <div className={`pms ${(currentData.temperatures?.length || 0) > 0 ? 'pms-ok' : ''}`}>
                      <span className="pms-num">{currentData.temperatures?.length || 0}</span><span className="pms-txt">Temps</span>
                    </div>
                    <div className={`pms ${(currentData.times?.length || 0) > 0 ? 'pms-ok' : ''}`}>
                      <span className="pms-num">{currentData.times?.length || 0}</span><span className="pms-txt">Times</span>
                    </div>
                    <div className={`pms ${(currentData.dates?.length || 0) > 0 ? 'pms-ok' : ''}`}>
                      <span className="pms-num">{currentData.dates?.length || 0}</span><span className="pms-txt">Dates</span>
                    </div>
                  </div>

                  {currentData.serialNumbers?.length > 0 && (
                    <div className="data-section"><h4>🔢 Serial Numbers ({currentData.serialNumbers.length})</h4><div className="chip-grid">{currentData.serialNumbers.map((s, i) => <span key={i} className="chip chip-serial">{s}</span>)}</div></div>
                  )}
                  {currentData.temperatures?.length > 0 && (
                    <div className="data-section"><h4>🌡️ Temperatures ({currentData.temperatures.length})</h4><div className="chip-grid">{currentData.temperatures.map((t, i) => <span key={i} className="chip chip-temp">{t}</span>)}</div></div>
                  )}
                  {currentData.times?.length > 0 && (
                    <div className="data-section"><h4>🕐 Times ({currentData.times.length})</h4><div className="chip-grid">{currentData.times.map((t, i) => <span key={i} className="chip chip-time">{t}</span>)}</div></div>
                  )}
                  {currentData.dates?.length > 0 && (
                    <div className="data-section"><h4>📅 Dates ({currentData.dates.length})</h4><div className="chip-grid">{currentData.dates.map((d, i) => <span key={i} className="chip chip-date">{d}</span>)}</div></div>
                  )}
                  {currentData.dimensions?.length > 0 && (
                    <div className="data-section"><h4>📏 Dimensions ({currentData.dimensions.length})</h4><div className="chip-grid">{currentData.dimensions.map((d, i) => <span key={i} className="chip chip-dim">{d}</span>)}</div></div>
                  )}
                  {currentData.percentages?.length > 0 && (
                    <div className="data-section"><h4>📊 Percentages ({currentData.percentages.length})</h4><div className="chip-grid">{currentData.percentages.map((p, i) => <span key={i} className="chip chip-dim">{p}</span>)}</div></div>
                  )}
                  {currentData.rawText && (
                    <details className="raw-text-toggle"><summary>📝 Raw OCR Text ({currentData.rawText.length.toLocaleString()} characters)</summary><pre className="raw-text-pre">{currentData.rawText}</pre></details>
                  )}
                  {!currentData.serialNumbers?.length && !currentData.temperatures?.length && !currentData.times?.length && !currentData.dates?.length && !currentData.dimensions?.length && currentData.rawText?.length > 0 && (
                    <div className="no-data-box scan-success-box"><span>✅</span><p>Page scanned successfully ({currentData.rawText.length.toLocaleString()} chars)</p><p className="no-data-sub">No structured fields extracted — normal for cover/header pages.</p></div>
                  )}
                  {(!currentData.rawText || currentData.rawText.length === 0) && (
                    <div className="no-data-box"><span>❌</span><p>Page NOT scanned — OCR returned empty text</p></div>
                  )}
                </>
              )
            ) : (
              <div className="no-data-box"><span>📭</span><p>No data available</p></div>
            )}
          </div>
        </div>
      </div>

      <div className="comp-footer">
        <div className="comp-footer-info">
          <h3>📊 Overall Extraction Summary</h3>
          <div className="progress-bars-group">
            <div className="progress-row"><span className="prog-lbl">OCR Scan</span><div className="progress-bar"><div className="progress-fill prog-scan" style={{ width: `${scanPercent}%` }}></div></div><span className="prog-pct">{scanPercent}%</span></div>
            <div className="progress-row"><span className="prog-lbl">Data Found</span><div className="progress-bar"><div className="progress-fill prog-data" style={{ width: `${dataPercent}%` }}></div></div><span className="prog-pct">{dataPercent}%</span></div>
            <div className="progress-row"><span className="prog-lbl">Serials</span><div className="progress-bar"><div className="progress-fill prog-serial" style={{ width: `${serialPercent}%` }}></div></div><span className="prog-pct">{serialPercent}%</span></div>
          </div>
          <p className="summary-text">
            {pagesScanned}/{totalPages} pages scanned &bull; {pagesWithErrors > 0 ? `${pagesWithErrors} errors &bull; ` : ''}{totalSerials} serial numbers &bull; {totalTemps} temperatures &bull; {totalTimes} times &bull; {totalDates} dates
          </p>
        </div>
        <div className="comp-footer-actions">
          {result.excelGenerated && <button className="btn btn-lg btn-success" onClick={onDownloadExcel}>📥 Download System Excel</button>}
          {humanExcelGenerated && <button className="btn btn-lg btn-warning" onClick={onDownloadHumanExcel}>✍️ Download Real Excel</button>}
          {scannedPdfGenerated && <button className="btn btn-lg btn-danger" onClick={onDownloadScannedPdf}>📄 Download Scanned PDF</button>}
          {result && <button className="btn btn-lg" style={{background:'#7c3aed',color:'#fff',border:'none',borderRadius:8,cursor:'pointer'}} onClick={onDownloadSummaryPdf}>📄 Download Summary PDF</button>}
          <button className="btn btn-lg btn-outline" onClick={onSavePdf} disabled={savingPdf}>{savingPdf ? '⏳ Saving...' : '💾 Save Original PDFs'}</button>
        </div>
      </div>

      {/* FRAUD DETECTION PANEL */}
      <FraudAnalysisPanel fraudAnalysis={fraudAnalysis} />
    </div>
  );
}

// ========== MANUAL OCR TAB ==========
function OcrTab() {
  const [pdfUrls, setPdfUrls] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [extractedData, setExtractedData] = useState(null);

  const handleProcess = async () => {
    if (!pdfUrls.trim()) { setError('Enter PDF URLs'); return; }
    setLoading(true); setStatus('Processing...'); setError(''); setResult(null); setExtractedData(null);
    try {
      const urls = pdfUrls.split('\n').map(u => u.trim()).filter(Boolean);
      setStatus(`Processing ${urls.length} PDF(s) with Azure OCR...`);
      const res = await axios.post(`${API_BASE}/ipqc-ocr/process-from-urls`, { pdfUrls: urls }, { timeout: 600000 });
      if (res.data.success) { setResult(res.data); setExtractedData(res.data.extractedData); setStatus('✅ OCR Complete!'); }
      else { setError(res.data.error || 'Failed'); setStatus(''); }
    } catch (e) { setError(e.response?.data?.error || e.message); setStatus(''); }
    finally { setLoading(false); }
  };

  const handleDownload = () => {
    if (result?.outputFile) {
      const fn = result.outputFile.split(/[\\\/]/).pop();
      window.open(`${API_BASE}/ipqc-ocr/download/${fn}`, '_blank');
    }
  };

  return (
    <div className="card">
      <h2 className="card-title">🔗 Manual OCR Processing</h2>
      <p className="card-desc">Paste PDF URLs to process through Azure OCR and generate Excel.</p>
      <div className="input-section">
        <label>Enter PDF URLs (one per line):</label>
        <textarea value={pdfUrls} onChange={e => setPdfUrls(e.target.value)} placeholder={`https://example.com/page1.pdf\nhttps://example.com/page2.pdf`} rows={5} disabled={loading} />
      </div>
      <div className="btn-row">
        <button onClick={handleProcess} disabled={loading || !pdfUrls.trim()} className="btn btn-primary">
          {loading ? <><span className="spin-sm white"></span> Processing...</> : '🚀 Process OCR'}
        </button>
        {result && <button onClick={handleDownload} className="btn btn-success">📥 System Excel</button>}
        {result?.humanExcelGenerated && (
          <button onClick={() => { const fn = result.humanOutputFile.split(/[\\\/]/).pop(); window.open(`${API_BASE}/ipqc-ocr/download/${fn}`, '_blank'); }} className="btn btn-warning">✍️ Real Excel</button>
        )}
        {result?.scannedPdfGenerated && (
          <button onClick={() => { const fn = result.scannedPdfFile.split(/[\\\/]/).pop(); window.open(`${API_BASE}/ipqc-ocr/download/${fn}`, '_blank'); }} className="btn btn-danger">📄 Scanned PDF</button>
        )}
      </div>
      {status && <div className="alert alert-info">{status}</div>}
      {error && <div className="alert alert-error">❌ {error}</div>}
      {extractedData?.serialNumbers?.length > 0 && (
        <div className="ocr-results"><h3>📋 Extracted Data</h3>
          <div className="data-section"><h4>Serial Numbers ({extractedData.serialNumbers.length})</h4>
            <div className="chip-grid">{extractedData.serialNumbers.slice(0, 20).map((s, i) => <span key={i} className="chip chip-serial">{s}</span>)}{extractedData.serialNumbers.length > 20 && <span className="chip chip-more">+{extractedData.serialNumbers.length - 20} more</span>}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== CHECKLIST TAB ==========
function ChecklistTab() {
  const [loading, setLoading] = useState(false);
  const [checklists, setChecklists] = useState([]);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(null);
  const [processResults, setProcessResults] = useState({});
  const [comparisonItem, setComparisonItem] = useState(null);
  const [savingPdf, setSavingPdf] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [filterShift, setFilterShift] = useState('');
  const [filterLine, setFilterLine] = useState('');

  // Fetch saved process results from database
  const loadSavedResults = useCallback(async (checklistsData) => {
    try {
      const res = await axios.get(`${API_BASE}/ipqc-data/process-results`);
      if (res.data.success && res.data.data) {
        const savedResults = res.data.data;
        const newProcessResults = {};
        
        // Map saved results to checklist indexes
        checklistsData.forEach((item, idx) => {
          const dateStr = item.date ? item.date.substring(0, 10) : '';
          const key = `${dateStr}_${item.Line}_${item.Shift}`;
          if (savedResults[key] && savedResults[key].process_result) {
            newProcessResults[idx] = savedResults[key].process_result;
          }
        });
        
        if (Object.keys(newProcessResults).length > 0) {
          setProcessResults(newProcessResults);
          console.log(`[IPQC] Loaded ${Object.keys(newProcessResults).length} saved process results`);
        }
      }
    } catch (e) {
      console.warn('[IPQC] Could not load saved process results:', e.message);
    }
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await axios.post(`${API_BASE}/ipqc-checklist/fetch`, {});
      if (res.data.success) { 
        const checklistsData = res.data.data || [];
        setChecklists(checklistsData); 
        if (checklistsData.length === 0) setError('No IPQC checklists found.');
        // Load saved process results after checklists are loaded
        await loadSavedResults(checklistsData);
      }
      else { setError(res.data.error || 'Fetch failed'); }
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  }, [loadSavedResults]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = checklists.filter(item => {
    if (filterDate && item.date !== filterDate) return false;
    if (filterShift && item.Shift !== filterShift) return false;
    if (filterLine && item.Line !== filterLine) return false;
    return true;
  });

  const uniqueDates = [...new Set(checklists.map(c => c.date).filter(Boolean))].sort().reverse();
  const uniqueShifts = [...new Set(checklists.map(c => c.Shift).filter(Boolean))];
  const uniqueLines = [...new Set(checklists.map(c => c.Line).filter(Boolean))].sort();
  const processedCount = Object.keys(processResults).length;

  const handleProcess = async (checklist, index) => {
    setProcessing(index); setError('');
    try {
      const res = await axios.post(`${API_BASE}/ipqc-checklist/process-item`, { checklist }, { timeout: 600000 });
      if (res.data.success) { setProcessResults(prev => ({ ...prev, [index]: res.data })); }
      else { setError(res.data.error || 'Processing failed'); }
    } catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setProcessing(null); }
  };

  const handleDownload = (filename) => { window.open(`${API_BASE}/ipqc-ocr/download/${filename}`, '_blank'); };

  const handleDownloadSummaryPdf = async (checklist, result) => {
    try {
      const res = await axios.post(`${API_BASE}/ipqc-ocr/summary-pdf`, { checklist, result }, { responseType: 'blob', timeout: 600000 });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url;
      a.download = `IPQC_Summary_${checklist.date || 'report'}_${checklist.Line || ''}_${checklist.Shift || ''}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
    } catch (e) { setError('Failed to download summary PDF: ' + e.message); }
  };

  const handleSavePdf = async (checklist) => {
    setSavingPdf(true);
    try {
      const res = await axios.post(`${API_BASE}/ipqc-ocr/save-original-pdfs`, { checklist }, { timeout: 600000 });
      if (res.data.success) { for (const f of res.data.files) { if (!f.error) window.open(`${API_BASE}/ipqc-ocr/download/${f.filename}`, '_blank'); } }
    } catch (e) { setError('Failed to save PDFs: ' + e.message); }
    finally { setSavingPdf(false); }
  };

  if (comparisonItem) {
    return (
      <ComparisonPanel checklist={comparisonItem.checklist} result={comparisonItem.result} onBack={() => setComparisonItem(null)}
        onDownloadExcel={() => handleDownload(comparisonItem.result.outputFile)}
        onDownloadHumanExcel={() => handleDownload(comparisonItem.result.humanOutputFile)}
        humanExcelGenerated={comparisonItem.result.humanExcelGenerated}
        scannedPdfGenerated={comparisonItem.result.scannedPdfGenerated}
        onDownloadScannedPdf={() => handleDownload(comparisonItem.result.scannedPdfFile)}
        onSavePdf={() => handleSavePdf(comparisonItem.checklist)} savingPdf={savingPdf}
        onDownloadSummaryPdf={() => handleDownloadSummaryPdf(comparisonItem.checklist, comparisonItem.result)}
      />
    );
  }

  return (
    <>
      <div className="stats-row">
        <div className="stat-card"><div className="stat-icon bg-blue">📋</div><div className="stat-body"><span className="stat-val">{checklists.length}</span><span className="stat-lbl">Total Checklists</span></div></div>
        <div className="stat-card"><div className="stat-icon bg-green">✅</div><div className="stat-body"><span className="stat-val">{processedCount}</span><span className="stat-lbl">Processed</span></div></div>
        <div className="stat-card"><div className="stat-icon bg-amber">⏳</div><div className="stat-body"><span className="stat-val">{Math.max(0, filtered.length - processedCount)}</span><span className="stat-lbl">Pending</span></div></div>
        <div className="stat-card"><div className="stat-icon bg-purple">📄</div><div className="stat-body"><span className="stat-val">{filtered.length}</span><span className="stat-lbl">Showing</span></div></div>
      </div>

      <div className="card">
        <div className="card-top">
          <h2>📋 IPQC Checklists</h2>
          <button onClick={fetchAll} disabled={loading} className="btn btn-ghost">{loading ? <span className="spin-sm"></span> : '🔄'} Refresh</button>
        </div>
        <div className="filters">
          <div className="flt-group"><label>Date</label><select value={filterDate} onChange={e => setFilterDate(e.target.value)}><option value="">All ({uniqueDates.length})</option>{uniqueDates.map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          <div className="flt-group"><label>Shift</label><select value={filterShift} onChange={e => setFilterShift(e.target.value)}><option value="">All</option>{uniqueShifts.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          <div className="flt-group"><label>Line</label><select value={filterLine} onChange={e => setFilterLine(e.target.value)}><option value="">All</option>{uniqueLines.map(l => <option key={l} value={l}>{l}</option>)}</select></div>
        </div>
        {error && <div className="alert alert-error">❌ {error}</div>}
        {loading && checklists.length === 0 && <div className="alert alert-info"><span className="spin-sm"></span> Loading...</div>}
        {filtered.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>#</th><th>Date</th><th>Line</th><th>Shift</th><th>Pages</th><th>Fraud Check</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const gi = checklists.indexOf(item);
                  const result = processResults[gi];
                  const isProc = processing === gi;
                  return (
                    <tr key={gi} className={result ? 'row-done' : ''}>
                      <td className="td-num">{idx + 1}</td>
                      <td className="td-date">{item.date || '—'}</td>
                      <td><span className="badge badge-line">{item.Line || '—'}</span></td>
                      <td><span className={`badge badge-shift ${(item.Shift || '').toLowerCase()}`}>{item.Shift === 'Day' ? '☀️' : '🌙'} {item.Shift || '—'}</span></td>
                      <td><span className="badge badge-pages">{item.totalPages || 0}</span></td>
                      <td>{result?.fraudAnalysis ? (
                        <FraudBadge verdict={result.fraudAnalysis.overallVerdict} score={result.fraudAnalysis.overallScore} />
                      ) : isProc ? <span style={{fontSize:11,color:'#94a3b8'}}>—</span> : <span style={{fontSize:11,color:'#94a3b8'}}>—</span>}</td>
                      <td>{isProc ? <span className="status status-proc"><span className="spin-sm"></span> Processing...</span> : result ? <span className="status status-done">✅ Done</span> : <span className="status status-pend">⏳ Pending</span>}</td>
                      <td>
                        <div className="actions-cell">
                          {isProc ? <span className="text-muted">Please wait...</span> : result ? (
                            <>
                              <button className="btn btn-sm btn-primary" onClick={() => setComparisonItem({ checklist: item, result, index: gi })}>📊 Compare</button>
                              {result.excelGenerated && <button className="btn btn-sm btn-success" onClick={() => handleDownload(result.outputFile)}>📥 System</button>}
                              {result.humanExcelGenerated && <button className="btn btn-sm btn-warning" onClick={() => handleDownload(result.humanOutputFile)}>✍️ Real</button>}
                              {result.scannedPdfGenerated && <button className="btn btn-sm btn-danger" onClick={() => handleDownload(result.scannedPdfFile)}>📄 Scan PDF</button>}
                              <button className="btn btn-sm" style={{background:'#7c3aed',color:'#fff'}} onClick={() => handleDownloadSummaryPdf(item, result)}>📄 Summary PDF</button>
                            </>
                          ) : (
                            <button className="btn btn-sm btn-primary" onClick={() => handleProcess(item, gi)} disabled={processing !== null || item.totalPages === 0}>🚀 Process</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ========== MAIN IPQC PAGE ==========
function IPQCPage() {
  const [activeTab, setActiveTab] = useState('checklist');

  return (
    <div>
      <div className="sub-nav">
        <button className={`sub-tab ${activeTab === 'checklist' ? 'active' : ''}`} onClick={() => setActiveTab('checklist')}>
          📋 IPQC Checklist
        </button>
        <button className={`sub-tab ${activeTab === 'ocr' ? 'active' : ''}`} onClick={() => setActiveTab('ocr')}>
          🔗 Manual OCR
        </button>
      </div>
      {activeTab === 'checklist' ? <ChecklistTab /> : <OcrTab />}
    </div>
  );
}

export default IPQCPage;
