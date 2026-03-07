import React, { useState } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:5001/api';

// ========== IQC VERIFICATION PAGE ==========
function IQCVerifyPage() {
  const [materialType, setMaterialType] = useState('busbar');
  const [iqcFiles, setIqcFiles] = useState([]);
  const [cocFiles, setCocFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [activeTab, setActiveTab] = useState('results'); // results | raw | history
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const handleVerify = async () => {
    if (iqcFiles.length === 0) {
      setError('Please upload at least one IQC report image');
      return;
    }

    setProcessing(true);
    setError('');
    setResult(null);
    setProgress('Uploading documents...');

    try {
      const fd = new FormData();
      iqcFiles.forEach(f => fd.append('iqcImages', f));
      cocFiles.forEach(f => fd.append('cocImages', f));
      fd.append('materialType', materialType);

      setProgress('Processing OCR on IQC Report...');
      
      const res = await axios.post(`${API_BASE}/iqc/verify-report`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 300000, // 5 min timeout for OCR
      });

      if (res.data.success) {
        setResult(res.data);
        setProgress('');
        setActiveTab('results');
      } else {
        setError(res.data.error || 'Verification failed');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setProcessing(false);
      setProgress('');
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/iqc/verify-history`);
      if (res.data.success) setHistory(res.data.reports || []);
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'history') loadHistory();
  };

  const StatusBadge = ({ status }) => {
    const colors = {
      PASS: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
      FAIL: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
      WARNING: { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
      MATCH: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
      EXACT_MATCH: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
      CLOSE_MATCH: { bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
      ACCEPTABLE: { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' },
      EXACT: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
      MISMATCH: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
      DEVIATION: { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
      GENUINE: { bg: '#dcfce7', color: '#166534', border: '#86efac' },
      SUSPICIOUS: { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
      LIKELY_FAKE: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
      CRITICAL: { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
      HIGH: { bg: '#fff7ed', color: '#9a3412', border: '#fdba74' },
      MEDIUM: { bg: '#fef9c3', color: '#854d0e', border: '#fde047' },
      LOW: { bg: '#f0fdf4', color: '#166534', border: '#86efac' },
      IQC_MISSING: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
      COC_MISSING: { bg: '#f1f5f9', color: '#475569', border: '#cbd5e1' },
    };
    const c = colors[status] || colors.WARNING;
    const goodStatuses = ['PASS', 'MATCH', 'GENUINE', 'EXACT_MATCH', 'CLOSE_MATCH', 'EXACT', 'ACCEPTABLE'];
    const badStatuses = ['FAIL', 'MISMATCH', 'LIKELY_FAKE', 'CRITICAL'];
    return (
      <span style={{
        display: 'inline-block', padding: '2px 10px', borderRadius: 6,
        fontWeight: 700, fontSize: 13, background: c.bg, color: c.color,
        border: `1.5px solid ${c.border}`, letterSpacing: 0.5,
      }}>
        {goodStatuses.includes(status) ? '✅ ' : badStatuses.includes(status) ? '❌ ' : '⚠️ '}
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1e40af 0%, #7c3aed 100%)',
        borderRadius: 16, padding: '28px 32px', marginBottom: 24, color: '#fff',
      }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800 }}>
          🔍 IQC Report Verification System
        </h2>
        <p style={{ margin: '8px 0 0', opacity: 0.9 }}>
          OCR + Document Intelligence — Verify IQC Report against AQL standards & COC
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { id: 'upload', label: '📤 Upload & Verify', icon: '' },
          { id: 'results', label: '📊 Results', icon: '' },
          { id: 'history', label: '📜 History', icon: '' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: activeTab === tab.id ? '#1e40af' : '#f1f5f9',
              color: activeTab === tab.id ? '#fff' : '#475569',
              fontWeight: 600, fontSize: 14, cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ==================== UPLOAD TAB ==================== */}
      {activeTab === 'upload' && (
        <div>
          {/* Material Type */}
          <div style={{
            background: '#fff', borderRadius: 14, padding: 24,
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
          }}>
            <h3 style={{ margin: '0 0 12px', color: '#1e293b' }}>🏭 Material Type</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { id: 'busbar', name: 'Bus Bar', icon: '🔗', desc: 'Copper Bus Bar (0.4×6.0 mm)' },
              ].map(mat => (
                <button
                  key={mat.id}
                  onClick={() => setMaterialType(mat.id)}
                  style={{
                    padding: '14px 24px', borderRadius: 12,
                    border: materialType === mat.id ? '2px solid #1e40af' : '2px solid #e2e8f0',
                    background: materialType === mat.id ? '#eff6ff' : '#fff',
                    cursor: 'pointer', textAlign: 'left', flex: 1,
                  }}
                >
                  <div style={{ fontSize: 28 }}>{mat.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b', marginTop: 4 }}>{mat.name}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{mat.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Upload IQC Report */}
          <div style={{
            background: '#fff', borderRadius: 14, padding: 24,
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
          }}>
            <h3 style={{ margin: '0 0 8px', color: '#1e293b' }}>📄 IQC Report Images</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px' }}>
              Upload scanned images of the IQC inspection report (1-2 pages). Supported: JPG, PNG, PDF
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 10,
                border: '2px dashed #3b82f6', background: '#eff6ff',
                cursor: 'pointer', fontWeight: 600, color: '#1e40af',
              }}>
                📁 Choose IQC Files
                <input
                  type="file" multiple accept="image/*,.pdf"
                  onChange={e => setIqcFiles(Array.from(e.target.files))}
                  style={{ display: 'none' }}
                />
              </label>
              {iqcFiles.length > 0 && (
                <span style={{ color: '#059669', fontWeight: 600 }}>
                  ✅ {iqcFiles.length} file(s) selected
                </span>
              )}
            </div>
            {iqcFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {iqcFiles.map((f, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', background: '#f1f5f9', borderRadius: 8,
                    fontSize: 13, color: '#334155',
                  }}>
                    📄 {f.name}
                    <button onClick={() => setIqcFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Upload COC */}
          <div style={{
            background: '#fff', borderRadius: 14, padding: 24,
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
          }}>
            <h3 style={{ margin: '0 0 8px', color: '#1e293b' }}>📋 COC / Test Certificate Images</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px' }}>
              Upload the supplier's Certificate of Conformance or test report for cross-verification. (Optional but recommended)
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <label style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 10,
                border: '2px dashed #8b5cf6', background: '#f5f3ff',
                cursor: 'pointer', fontWeight: 600, color: '#6d28d9',
              }}>
                📁 Choose COC Files
                <input
                  type="file" multiple accept="image/*,.pdf"
                  onChange={e => setCocFiles(Array.from(e.target.files))}
                  style={{ display: 'none' }}
                />
              </label>
              {cocFiles.length > 0 && (
                <span style={{ color: '#059669', fontWeight: 600 }}>
                  ✅ {cocFiles.length} file(s) selected
                </span>
              )}
            </div>
            {cocFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                {cocFiles.map((f, i) => (
                  <span key={i} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', background: '#faf5ff', borderRadius: 8,
                    fontSize: 13, color: '#6d28d9',
                  }}>
                    📋 {f.name}
                    <button onClick={() => setCocFiles(prev => prev.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#ef4444', fontWeight: 700 }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div style={{
              background: '#fee2e2', color: '#991b1b', padding: '12px 16px',
              borderRadius: 10, marginBottom: 16, fontWeight: 600,
            }}>
              ❌ {error}
            </div>
          )}

          {/* Verify Button */}
          <button
            onClick={handleVerify}
            disabled={processing || iqcFiles.length === 0}
            style={{
              width: '100%', padding: '16px 32px', borderRadius: 14,
              border: 'none', fontWeight: 800, fontSize: 18, cursor: 'pointer',
              background: processing ? '#94a3b8' : 'linear-gradient(135deg, #1e40af, #7c3aed)',
              color: '#fff', transition: 'all 0.3s',
              boxShadow: processing ? 'none' : '0 4px 16px rgba(30,64,175,0.3)',
            }}
          >
            {processing ? (
              <span>⏳ {progress || 'Processing...'}</span>
            ) : (
              '🔍 Verify IQC Report with OCR + COC Cross-Check'
            )}
          </button>

          {processing && (
            <div style={{
              marginTop: 16, padding: 16, background: '#eff6ff',
              borderRadius: 12, textAlign: 'center',
            }}>
              <div style={{
                width: '100%', height: 6, background: '#dbeafe', borderRadius: 3,
                overflow: 'hidden', marginBottom: 8,
              }}>
                <div style={{
                  width: '60%', height: '100%',
                  background: 'linear-gradient(90deg, #3b82f6, #7c3aed)',
                  borderRadius: 3, animation: 'pulse 2s infinite',
                }} />
              </div>
              <p style={{ color: '#1e40af', fontWeight: 600, margin: 0 }}>
                {progress || 'Azure Document Intelligence is analyzing your documents...'}
              </p>
              <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 0' }}>
                This may take 30-60 seconds depending on document complexity
              </p>
            </div>
          )}
        </div>
      )}

      {/* ==================== RESULTS TAB ==================== */}
      {activeTab === 'results' && result && (
        <div>
          {/* Overall Verdict Banner */}
          <div style={{
            background: result.verification.overallResult === 'PASS'
              ? (result.verification.fraudDetection?.overallVerdict === 'SUSPICIOUS' ? 'linear-gradient(135deg, #d97706, #f59e0b)' : 'linear-gradient(135deg, #059669, #10b981)')
              : 'linear-gradient(135deg, #dc2626, #ef4444)',
            borderRadius: 16, padding: '24px 32px', marginBottom: 24, color: '#fff',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>
              {result.verification.overallResult === 'PASS'
                ? (result.verification.fraudDetection?.overallVerdict === 'SUSPICIOUS' ? '⚠️' : '✅')
                : '❌'}
            </div>
            <h2 style={{ margin: 0, fontSize: 28, fontWeight: 900 }}>
              IQC Report: {result.verification.overallResult}
            </h2>
            <p style={{ margin: '8px 0 0', opacity: 0.95, fontSize: 16 }}>
              {result.verification.overallMessage}
            </p>
            {result.verification.fraudDetection && (
              <div style={{
                marginTop: 12, padding: '8px 16px', background: 'rgba(255,255,255,0.15)',
                borderRadius: 8, display: 'inline-block',
              }}>
                <span style={{ fontWeight: 700 }}>
                  {result.verification.fraudDetection.inspectorTested ? '👤 Inspector Likely TESTED' : '🚨 Inspector Likely DID NOT TEST'}
                </span>
                <span style={{ marginLeft: 12 }}>
                  Authenticity: {100 - (result.verification.fraudDetection.overallScore || 0)}/100
                </span>
              </div>
            )}
          </div>

          {/* Download Report Button */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 24, justifyContent: 'center' }}>
            <button
              onClick={() => {
                if (result.reportFile) {
                  window.open(`${API_BASE}/iqc/verify-report-excel/${result.reportFile}`, '_blank');
                }
              }}
              style={{
                padding: '14px 32px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: '0 4px 14px rgba(5,150,105,0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 6px 20px rgba(5,150,105,0.4)'; }}
              onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 4px 14px rgba(5,150,105,0.3)'; }}
            >
              📥 Download Comparison Report (Excel)
            </button>
            <button
              onClick={() => {
                if (result.reportFile) {
                  window.open(`${API_BASE}/iqc/verify-report-pdf/${result.reportFile}`, '_blank');
                }
              }}
              style={{
                padding: '14px 32px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: '0 4px 14px rgba(220,38,38,0.3)',
                transition: 'transform 0.2s, box-shadow 0.2s',
              }}
              onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 6px 20px rgba(220,38,38,0.4)'; }}
              onMouseLeave={e => { e.target.style.transform = 'translateY(0)'; e.target.style.boxShadow = '0 4px 14px rgba(220,38,38,0.3)'; }}
            >
              📄 Summary PDF
            </button>
            <button
              onClick={() => window.print()}
              style={{
                padding: '14px 32px', borderRadius: 12, border: '2px solid #3b82f6',
                background: '#eff6ff', color: '#1e40af', fontWeight: 700, fontSize: 16,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.target.style.background = '#dbeafe'; }}
              onMouseLeave={e => { e.target.style.background = '#eff6ff'; }}
            >
              🖨️ Print Report
            </button>
          </div>

          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Total Checks', value: result.verification.summary.totalChecks, color: '#3b82f6', icon: '📋' },
              { label: 'Passed', value: result.verification.summary.passed, color: '#059669', icon: '✅' },
              { label: 'Failed', value: result.verification.summary.failed, color: '#dc2626', icon: '❌' },
              { label: 'Warnings', value: result.verification.summary.warnings, color: '#d97706', icon: '⚠️' },
              { label: 'Authenticity', value: (100 - (result.verification.summary.fraudScore || 0)) + '%', color: result.verification.summary.fraudScore > 30 ? '#dc2626' : '#059669', icon: '🔒' },
            ].map((card, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: 14, padding: '20px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.08)', textAlign: 'center',
                borderTop: `4px solid ${card.color}`,
              }}>
                <div style={{ fontSize: 32 }}>{card.icon}</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: card.color }}>{card.value}</div>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{card.label}</div>
              </div>
            ))}
          </div>

          {/* IQC Data Extracted */}
          {result.iqcData && (
            <div style={{
              background: '#fff', borderRadius: 14, padding: 24,
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
            }}>
              <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>📄 IQC Report — Extracted Data</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 24px' }}>
                {[
                  { label: 'Document No', value: result.iqcData.documentNo },
                  { label: 'Material', value: result.iqcData.materialName },
                  { label: 'Supplier', value: result.iqcData.supplierName },
                  { label: 'Quantity', value: result.iqcData.quantity },
                  { label: 'Invoice No', value: result.iqcData.invoiceNo },
                  { label: 'Receipt Date', value: result.iqcData.receiptDate },
                  { label: 'RM Details', value: result.iqcData.rmDetails },
                  { label: 'Samples', value: result.iqcData.sampleCount || 'N/A' },
                  { label: 'Checked By', value: result.iqcData.checkedBy },
                ].filter(f => f.value).map((field, i) => (
                  <div key={i} style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      {field.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                      {field.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parameter-wise Checks */}
          <div style={{
            background: '#fff', borderRadius: 14, padding: 24,
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
          }}>
            <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>🔬 Parameter-wise Verification (IQC vs COC)</h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={thStyle}>#</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Check</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>IQC Values</th>
                    <th style={{ ...thStyle, textAlign: 'left', background: '#eff6ff' }}>COC Values</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Spec</th>
                    <th style={thStyle}>Status</th>
                    <th style={{ ...thStyle, textAlign: 'left' }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {result.verification.checks.map((check, idx) => (
                    <React.Fragment key={idx}>
                      <tr style={{
                        background: check.status === 'FAIL' ? '#fef2f2' : check.status === 'WARNING' ? '#fffbeb' : '#fff',
                        borderBottom: '1px solid #e2e8f0',
                      }}>
                        <td style={tdStyle}>{idx + 1}</td>
                        <td style={{ ...tdStyle, fontWeight: 700, color: '#1e293b' }}>{check.name}</td>
                        <td style={tdStyle}>
                          {check.values ? (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {check.values.map((v, i) => (
                                <span key={i} style={{
                                  padding: '2px 8px', borderRadius: 4,
                                  background: '#f1f5f9', fontSize: 12, fontWeight: 600,
                                  color: '#334155',
                                }}>{v}</span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>—</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, background: '#f8fbff' }}>
                          {check.cocValues ? (
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {check.cocValues.map((v, i) => (
                                <span key={i} style={{
                                  padding: '2px 8px', borderRadius: 4,
                                  background: '#dbeafe', fontSize: 12, fontWeight: 600,
                                  color: '#1e40af',
                                }}>{v}</span>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No COC</span>
                          )}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#475569' }}>{check.spec}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <StatusBadge status={check.status} />
                        </td>
                        <td style={{ ...tdStyle, fontSize: 12, color: '#64748b', maxWidth: 300 }}>{check.details}</td>
                      </tr>
                      {/* Show per-value pair comparison if available */}
                      {check.cocMatchInfo && check.cocMatchInfo.pairComparisons && check.cocMatchInfo.pairComparisons.length > 0 && (
                        <tr>
                          <td colSpan={7} style={{ padding: '0 12px 8px 40px', background: '#fafbff' }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', marginBottom: 4 }}>📊 Value-by-Value Comparison:</div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {check.cocMatchInfo.pairComparisons.map((pair, pi) => (
                                <span key={pi} style={{
                                  padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                  background: pair.status === 'EXACT' || pair.status === 'MATCH' ? '#dcfce7'
                                    : pair.status === 'DEVIATION' ? '#fef9c3' : pair.status === 'MISMATCH' ? '#fee2e2' : '#f1f5f9',
                                  color: pair.status === 'EXACT' || pair.status === 'MATCH' ? '#166534'
                                    : pair.status === 'DEVIATION' ? '#854d0e' : pair.status === 'MISMATCH' ? '#991b1b' : '#334155',
                                  border: `1px solid ${pair.status === 'EXACT' || pair.status === 'MATCH' ? '#86efac'
                                    : pair.status === 'DEVIATION' ? '#fde047' : pair.status === 'MISMATCH' ? '#fca5a5' : '#e2e8f0'}`,
                                }}>
                                  #{pair.index}: IQC {pair.iqcValue} vs COC {pair.cocValue}
                                  {pair.deviation !== 0 && ` (${pair.deviation > 0 ? '+' : ''}${pair.deviation}, ${pair.deviationPct}%)`}
                                  {pair.status === 'EXACT' && ' ✓'}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* COC Mismatch Summary */}
          {result.verification.summary && (result.verification.summary.cocMismatches > 0 || result.verification.summary.cocDeviations > 0) && (
            <div style={{
              background: result.verification.summary.cocMismatches > 0 ? '#fef2f2' : '#fffbeb',
              borderRadius: 14, padding: '16px 24px', marginBottom: 20,
              border: `2px solid ${result.verification.summary.cocMismatches > 0 ? '#fca5a5' : '#fde047'}`,
            }}>
              <h4 style={{ margin: '0 0 8px', color: result.verification.summary.cocMismatches > 0 ? '#991b1b' : '#854d0e' }}>
                {result.verification.summary.cocMismatches > 0 ? '❌' : '⚠️'} COC Value Matching Summary
              </h4>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#334155' }}>
                {result.verification.summary.cocMismatches} value(s) DO NOT match COC | {result.verification.summary.cocDeviations} deviation(s) need review
                | {result.verification.summary.cocChecksTotal} total COC checks
              </p>
            </div>
          )}

          {/* AQL Verification */}
          {result.verification.aqlVerification && (
            <div style={{
              background: '#fff', borderRadius: 14, padding: 24,
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
              borderLeft: `4px solid ${result.verification.aqlVerification.status === 'PASS' ? '#059669' : '#dc2626'}`,
            }}>
              <h3 style={{ margin: '0 0 12px', color: '#1e293b' }}>📊 AQL Sampling Plan Verification</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>LOT SIZE</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{result.verification.aqlVerification.lotSize}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>INSPECTION LEVEL</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{result.verification.aqlVerification.inspectionLevel}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>REQUIRED (S3)</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{result.verification.aqlVerification.requiredSamplesS3 || result.verification.aqlVerification.requiredSamples}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>REQUIRED (S4)</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#1e293b' }}>{result.verification.aqlVerification.requiredSamplesS4 || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>ACTUAL SAMPLES</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: result.verification.aqlVerification.actualSamples >= (result.verification.aqlVerification.requiredSamplesS3 || result.verification.aqlVerification.requiredSamples) ? '#059669' : '#dc2626' }}>
                    {result.verification.aqlVerification.actualSamples}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <StatusBadge status={result.verification.aqlVerification.status} />
                <span style={{ marginLeft: 12, color: '#475569', fontSize: 13 }}>
                  {result.verification.aqlVerification.details}
                </span>
              </div>
            </div>
          )}

          {/* COC Cross-Check */}
          {result.verification.cocCrossCheck && result.verification.cocCrossCheck.length > 0 && (
            <div style={{
              background: '#fff', borderRadius: 14, padding: 24,
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
            }}>
              <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>📋 COC Cross-Verification (Value-by-Value)</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={thStyle}>Field</th>
                    <th style={thStyle}>IQC Report Value</th>
                    <th style={thStyle}>COC Value</th>
                    <th style={thStyle}>Importance</th>
                    <th style={thStyle}>Deviation</th>
                    <th style={thStyle}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.verification.cocCrossCheck.map((check, idx) => (
                    <React.Fragment key={idx}>
                      <tr style={{
                        background: !check.match ? (check.status === 'DEVIATION' ? '#fffbeb' : '#fef2f2') : '#fff',
                        borderBottom: '1px solid #e2e8f0',
                      }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{check.field}</td>
                        <td style={tdStyle}>{check.iqcValue}</td>
                        <td style={tdStyle}>{check.cocValue}</td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {check.importance && <StatusBadge status={check.importance} />}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 600, color: '#475569' }}>
                          {check.deviation || '—'}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          <StatusBadge status={check.status} />
                        </td>
                      </tr>
                      {/* Show pair-level breakdown for value comparisons */}
                      {check.pairDetails && check.pairDetails.length > 0 && (
                        <tr>
                          <td colSpan={6} style={{ padding: '4px 12px 8px 32px', background: '#fafbff' }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {check.pairDetails.map((pair, pi) => (
                                <span key={pi} style={{
                                  padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                                  background: pair.status === 'EXACT' || pair.status === 'MATCH' ? '#dcfce7'
                                    : pair.status === 'DEVIATION' ? '#fef9c3' : pair.status === 'MISMATCH' ? '#fee2e2' : '#f1f5f9',
                                  color: pair.status === 'EXACT' || pair.status === 'MATCH' ? '#166534'
                                    : pair.status === 'DEVIATION' ? '#854d0e' : '#991b1b',
                                }}>
                                  #{pair.index}: {pair.iqcValue} ↔ {pair.cocValue}
                                  {pair.deviation !== 0 && ` (${pair.deviation > 0 ? '+' : ''}${pair.deviation})`}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* COC Data Extracted */}
          {result.cocData && (
            <div style={{
              background: '#fff', borderRadius: 14, padding: 24,
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
            }}>
              <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>📋 COC — Extracted Data</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px 24px' }}>
                {[
                  { label: 'Customer', value: result.cocData.customerName },
                  { label: 'Supplier', value: result.cocData.supplierName },
                  { label: 'Product Spec', value: result.cocData.productSpec },
                  { label: 'Certificate No', value: result.cocData.certificateNo },
                  { label: 'Invoice No', value: result.cocData.invoiceNo },
                  { label: 'Delivery Date', value: result.cocData.deliveryDate },
                  { label: 'Production Date', value: result.cocData.productionDate },
                  { label: 'Total Weight', value: result.cocData.totalWeight },
                  { label: 'All Tests OK', value: result.cocData.allJudgmentsOK ? '✅ Yes' : '❌ No' },
                ].filter(f => f.value).map((field, i) => (
                  <div key={i} style={{ padding: '8px 0' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                      {field.label}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginTop: 2 }}>
                      {field.value}
                    </div>
                  </div>
                ))}
              </div>

              {/* COC Specs from document */}
              {(result.cocData.widthSpec || result.cocData.thicknessSpec) && (
                <div style={{ marginTop: 16 }}>
                  <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#475569' }}>COC Specifications (Used as Validation Ranges)</h4>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {result.cocData.widthSpec && (
                      <div style={{ padding: '8px 16px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>WIDTH SPEC</div>
                        <div style={{ fontSize: 13, color: '#1e293b', marginTop: 2 }}>
                          {result.cocData.widthSpec.nominal} {result.cocData.widthSpec.tolerance} mm
                          ({result.cocData.widthSpec.min}-{result.cocData.widthSpec.max})
                        </div>
                      </div>
                    )}
                    {result.cocData.thicknessSpec && (
                      <div style={{ padding: '8px 16px', background: '#eff6ff', borderRadius: 8, border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#1e40af' }}>THICKNESS SPEC</div>
                        <div style={{ fontSize: 13, color: '#1e293b', marginTop: 2 }}>
                          {result.cocData.thicknessSpec.nominal} {result.cocData.thicknessSpec.tolerance} mm
                          ({result.cocData.thicknessSpec.min}-{result.cocData.thicknessSpec.max})
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* COC Test Values */}
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#475569' }}>COC Test Results</h4>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {[
                    { label: 'Width', values: result.cocData.width, unit: 'mm' },
                    { label: 'Thickness', values: result.cocData.thickness, unit: 'mm' },
                    { label: 'Tensile', values: result.cocData.tensileStrength, unit: 'MPa' },
                    { label: 'Yield', values: result.cocData.yieldStrength, unit: 'MPa' },
                    { label: 'Elongation', values: result.cocData.elongation, unit: '%' },
                    { label: 'Resistivity', values: result.cocData.resistivity, unit: 'Ω·mm²/m' },
                    { label: 'Cu Purity', values: result.cocData.copperPurity, unit: '%' },
                    { label: 'Sn Content', values: result.cocData.tinContent, unit: '%' },
                  ].filter(f => f.values && f.values.length > 0).map((field, i) => (
                    <div key={i} style={{
                      padding: '8px 16px', background: '#f8fafc', borderRadius: 8,
                      border: '1px solid #e2e8f0',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8' }}>{field.label}</div>
                      <div style={{ fontSize: 13, color: '#1e293b', marginTop: 2 }}>
                        {field.values.join(', ')} {field.unit}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ==================== FRAUD DETECTION SECTION ==================== */}
          {result.verification.fraudDetection && (
            <div style={{
              background: '#fff', borderRadius: 14, padding: 24,
              boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
              borderLeft: `4px solid ${
                result.verification.fraudDetection.overallVerdict === 'GENUINE' ? '#059669'
                : result.verification.fraudDetection.overallVerdict === 'SUSPICIOUS' ? '#d97706'
                : '#dc2626'
              }`,
            }}>
              <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>
                🔒 Fraud / Dummy Report Detection
              </h3>

              {/* Fraud Summary Banner */}
              <div style={{
                background: result.verification.fraudDetection.overallVerdict === 'GENUINE' ? '#f0fdf4'
                  : result.verification.fraudDetection.overallVerdict === 'SUSPICIOUS' ? '#fffbeb' : '#fef2f2',
                borderRadius: 12, padding: '16px 20px', marginBottom: 16,
                border: `1px solid ${
                  result.verification.fraudDetection.overallVerdict === 'GENUINE' ? '#86efac'
                  : result.verification.fraudDetection.overallVerdict === 'SUSPICIOUS' ? '#fde047' : '#fca5a5'
                }`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  <StatusBadge status={result.verification.fraudDetection.overallVerdict} />
                  <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                    Authenticity Score: {100 - (result.verification.fraudDetection.overallScore || 0)} / 100
                  </span>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}>
                    Confidence: {result.verification.fraudDetection.confidence}
                  </span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, color: '#334155', fontWeight: 600 }}>
                  {result.verification.fraudDetection.summary}
                </p>
                <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
                    🔴 Critical: {result.verification.fraudDetection.criticalFlags}
                  </span>
                  <span style={{ fontSize: 12, color: '#9a3412', fontWeight: 600 }}>
                    🟠 High: {result.verification.fraudDetection.highFlags}
                  </span>
                  <span style={{ fontSize: 12, color: '#854d0e', fontWeight: 600 }}>
                    🟡 Medium: {result.verification.fraudDetection.mediumFlags}
                  </span>
                  <span style={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
                    🟢 Low: {result.verification.fraudDetection.lowFlags}
                  </span>
                </div>
              </div>

              {/* Fraud Inspector Assessment */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
                padding: '12px 16px', borderRadius: 10,
                background: result.verification.fraudDetection.inspectorTested ? '#f0fdf4' : '#fef2f2',
                border: `1px solid ${result.verification.fraudDetection.inspectorTested ? '#86efac' : '#fca5a5'}`,
              }}>
                <span style={{ fontSize: 28 }}>
                  {result.verification.fraudDetection.inspectorTested ? '👤✅' : '👤❌'}
                </span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15, color: result.verification.fraudDetection.inspectorTested ? '#166534' : '#991b1b' }}>
                    {result.verification.fraudDetection.inspectorTested
                      ? 'Inspector LIKELY PERFORMED Actual Physical Testing'
                      : 'Inspector LIKELY DID NOT Test — Possible Dummy Data'}
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                    Based on statistical analysis of measurement patterns, variance, digit distribution & COC similarity
                  </div>
                </div>
              </div>

              {/* Per-Parameter Fraud Analysis */}
              {result.verification.fraudDetection.parameterResults && result.verification.fraudDetection.parameterResults.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: 14, color: '#475569' }}>Parameter-wise Authenticity Analysis</h4>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {result.verification.fraudDetection.parameterResults.map((param, idx) => (
                      <div key={idx} style={{
                        padding: '12px 16px', borderRadius: 10,
                        background: param.verdict === 'GENUINE' ? '#f8faf8' : param.verdict === 'SUSPICIOUS' ? '#fffdf4' : '#fef6f6',
                        border: `1px solid ${param.verdict === 'GENUINE' ? '#d1fae5' : param.verdict === 'SUSPICIOUS' ? '#fef08a' : '#fecaca'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{param.parameter}</span>
                          <StatusBadge status={param.verdict} />
                          <span style={{ fontSize: 12, color: '#64748b' }}>Score: {param.score}/100</span>
                          {param.stats && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                              Mean: {param.stats.mean} | StdDev: {param.stats.stdDev} | CV: {param.stats.cv}%
                            </span>
                          )}
                        </div>
                        {param.flags && param.flags.length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {param.flags.map((flag, fi) => (
                              <div key={fi} style={{
                                padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                                background: flag.severity === 'CRITICAL' ? '#fee2e2' : flag.severity === 'HIGH' ? '#fff7ed' : flag.severity === 'MEDIUM' ? '#fef9c3' : '#f0fdf4',
                                color: flag.severity === 'CRITICAL' ? '#991b1b' : flag.severity === 'HIGH' ? '#9a3412' : flag.severity === 'MEDIUM' ? '#854d0e' : '#166534',
                                border: `1px solid ${flag.severity === 'CRITICAL' ? '#fca5a5' : flag.severity === 'HIGH' ? '#fdba74' : flag.severity === 'MEDIUM' ? '#fde047' : '#86efac'}`,
                              }}>
                                [{flag.severity}] {flag.message}
                              </div>
                            ))}
                          </div>
                        )}
                        {param.cocComparison && (
                          <div style={{ marginTop: 6, fontSize: 11, color: '#475569' }}>
                            COC Match: {param.cocComparison.exactMatches} exact, {param.cocComparison.closeMatches} close out of {param.cocComparison.totalIQC} IQC values vs {param.cocComparison.totalCOC} COC values.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {result.verification.fraudDetection.recommendations && result.verification.fraudDetection.recommendations.length > 0 && (
                <div>
                  <h4 style={{ margin: '0 0 8px', fontSize: 14, color: '#475569' }}>📋 Recommendations</h4>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {result.verification.fraudDetection.recommendations.map((rec, i) => (
                      <li key={i} style={{ fontSize: 13, color: '#334155', marginBottom: 4, fontWeight: 500 }}>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Raw OCR Text Toggle */}
          <div style={{
            background: '#fff', borderRadius: 14, padding: 24,
            boxShadow: '0 1px 6px rgba(0,0,0,0.08)', marginBottom: 20,
          }}>
            <button
              onClick={() => setShowRawText(!showRawText)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
                background: '#f8fafc', cursor: 'pointer', fontWeight: 600, color: '#475569',
              }}
            >
              {showRawText ? '🔽 Hide' : '▶️ Show'} Raw OCR Text
            </button>
            {showRawText && (
              <div style={{ marginTop: 16 }}>
                <h4 style={{ margin: '0 0 8px' }}>IQC Report OCR Text ({result.iqcOcrChars} chars)</h4>
                <pre style={{
                  background: '#1e293b', color: '#e2e8f0', padding: 16,
                  borderRadius: 10, fontSize: 12, maxHeight: 300,
                  overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {result.iqcRawText || 'No text extracted'}
                </pre>
                {result.cocRawText && (
                  <>
                    <h4 style={{ margin: '16px 0 8px' }}>COC OCR Text ({result.cocOcrChars} chars)</h4>
                    <pre style={{
                      background: '#1e293b', color: '#e2e8f0', padding: 16,
                      borderRadius: 10, fontSize: 12, maxHeight: 300,
                      overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    }}>
                      {result.cocRawText}
                    </pre>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* No Results Yet */}
      {activeTab === 'results' && !result && (
        <div style={{
          background: '#fff', borderRadius: 14, padding: 48,
          boxShadow: '0 1px 6px rgba(0,0,0,0.08)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 64, marginBottom: 16 }}>📊</div>
          <h3 style={{ color: '#64748b', margin: 0 }}>No verification results yet</h3>
          <p style={{ color: '#94a3b8', margin: '8px 0 16px' }}>
            Upload IQC report and COC documents, then click Verify to see results
          </p>
          <button
            onClick={() => setActiveTab('upload')}
            style={{
              padding: '10px 24px', borderRadius: 10, border: 'none',
              background: '#1e40af', color: '#fff', fontWeight: 600, cursor: 'pointer',
            }}
          >
            📤 Go to Upload
          </button>
        </div>
      )}

      {/* ==================== HISTORY TAB ==================== */}
      {activeTab === 'history' && (
        <div style={{
          background: '#fff', borderRadius: 14, padding: 24,
          boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
        }}>
          <h3 style={{ margin: '0 0 16px', color: '#1e293b' }}>📜 Verification History</h3>
          {historyLoading ? (
            <p style={{ color: '#64748b' }}>Loading history...</p>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <div style={{ fontSize: 48 }}>📭</div>
              <p style={{ color: '#94a3b8' }}>No verification records yet</p>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Material</th>
                  <th style={thStyle}>Result</th>
                  <th style={thStyle}>Passed</th>
                  <th style={thStyle}>Failed</th>
                  <th style={thStyle}>Warnings</th>
                  <th style={thStyle}>Report</th>
                </tr>
              </thead>
              <tbody>
                {history.map((rec, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={tdStyle}>{idx + 1}</td>
                    <td style={tdStyle}>{rec.timestamp ? new Date(rec.timestamp).toLocaleString() : '—'}</td>
                    <td style={tdStyle}>{rec.materialType}</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <StatusBadge status={rec.overallResult} />
                    </td>
                    <td style={{ ...tdStyle, color: '#059669', fontWeight: 700 }}>{rec.summary?.passed || 0}</td>
                    <td style={{ ...tdStyle, color: '#dc2626', fontWeight: 700 }}>{rec.summary?.failed || 0}</td>
                    <td style={{ ...tdStyle, color: '#d97706', fontWeight: 700 }}>{rec.summary?.warnings || 0}</td>
                    <td style={{ ...tdStyle, display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => window.open(`${API_BASE}/iqc/verify-report-excel/${rec.filename}`, '_blank')}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: 'none',
                          background: '#059669', color: '#fff', fontWeight: 600,
                          fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        📥 Excel
                      </button>
                      <button
                        onClick={() => window.open(`${API_BASE}/iqc/verify-report-pdf/${rec.filename}`, '_blank')}
                        style={{
                          padding: '6px 14px', borderRadius: 8, border: 'none',
                          background: '#dc2626', color: '#fff', fontWeight: 600,
                          fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                        }}
                      >
                        📄 PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// Table styles
const thStyle = {
  padding: '10px 12px',
  textAlign: 'center',
  fontSize: 12,
  fontWeight: 700,
  color: '#475569',
  borderBottom: '2px solid #e2e8f0',
  whiteSpace: 'nowrap',
};

const tdStyle = {
  padding: '10px 12px',
  fontSize: 13,
  color: '#334155',
  verticalAlign: 'top',
};

export default IQCVerifyPage;
