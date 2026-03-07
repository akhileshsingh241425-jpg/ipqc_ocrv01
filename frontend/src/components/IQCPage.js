import React, { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = 'http://localhost:5001/api';

// ========== RAW MATERIALS LIST ==========
const RAW_MATERIALS = [
  { id: 'glass', name: 'Glass', icon: '🪟', color: '#3b82f6', desc: 'Front Tempered Glass (3.2mm / 2.0mm)', params: ['Thickness', 'Dimensions (L×W)', 'Transmittance %', 'Visual Defects', 'Edge Quality', 'Flatness', 'Supplier', 'Batch No', 'Mfg Date', 'Qty Received', 'Qty Accepted', 'Qty Rejected'] },
  { id: 'eva', name: 'EVA', icon: '📦', color: '#8b5cf6', desc: 'Ethylene Vinyl Acetate Encapsulant Sheet', params: ['Type (EP304/EP502)', 'Dimensions (L×W×T)', 'Mfg Date', 'Gel Content %', 'Peel Strength', 'Visual Check', 'Supplier', 'Batch No', 'Qty Received', 'Qty Accepted', 'Qty Rejected', 'Storage Condition'] },
  { id: 'cell', name: 'Solar Cells', icon: '⚡', color: '#f59e0b', desc: 'Mono/Poly Crystalline Silicon Cells', params: ['Cell Type', 'Cell Size (mm)', 'Efficiency %', 'Watt Class', 'Color Shade', 'Visual Defects', 'Breakage %', 'Supplier', 'Batch No', 'Qty Received', 'Qty Accepted', 'Qty Rejected'] },
  { id: 'backsheet', name: 'Backsheet', icon: '📄', color: '#06b6d4', desc: 'TPT/TPE/KPE Backsheet Film', params: ['Type (TPT/TPE)', 'Thickness', 'Dimensions', 'Color', 'Adhesion Test', 'Visual Check', 'Mfg Date', 'Supplier', 'Batch No', 'Qty Received', 'Qty Accepted', 'Qty Rejected'] },
  { id: 'ribbon', name: 'Ribbon', icon: '🔗', color: '#10b981', desc: 'Busbar & Interconnect Ribbon (Tabbing/Stringing)', params: ['Type (Tabbing/Stringing)', 'Width (mm)', 'Thickness (mm)', 'Solder Coating', 'Peel Strength', 'Visual Check', 'Supplier', 'Batch No', 'Mfg Date', 'Qty Received', 'Qty Accepted', 'Qty Rejected'] },
  { id: 'frame', name: 'Frame', icon: '🖼️', color: '#64748b', desc: 'Aluminium Alloy Frame (Anodized)', params: ['Alloy Type', 'Dimensions (L×W×H)', 'Anodizing Thickness (Micron)', 'Corner Joint', 'Screw Holes', 'Visual Check', 'Supplier', 'Batch No', 'Qty Received', 'Qty Accepted', 'Qty Rejected', 'Color'] },
  { id: 'jbox', name: 'Junction Box', icon: '📡', color: '#ef4444', desc: 'IP67/IP68 Junction Box with Bypass Diodes', params: ['Type/Model', 'IP Rating', 'Bypass Diodes', 'Cable Length (mm)', 'Connector Type', 'Hi-Pot Test', 'Visual Check', 'Supplier', 'Batch No', 'Qty Received', 'Qty Accepted', 'Qty Rejected'] },
  { id: 'silicone', name: 'Silicone', icon: '💧', color: '#a855f7', desc: 'Silicone Sealant / Potting Material', params: ['Type/Brand', 'Viscosity', 'Cure Time', 'Shelf Life', 'Mfg Date', 'Expiry Date', 'Visual Check', 'Supplier', 'Batch No', 'Qty Received', 'Qty Accepted', 'Qty Rejected'] },
  { id: 'flux', name: 'Flux', icon: '🧪', color: '#ec4899', desc: 'Soldering Flux for Cell Stringing', params: ['Type/Brand', 'Activity Level', 'pH Value', 'Specific Gravity', 'Expiry Date', 'Mfg Date', 'Visual Check', 'Supplier', 'Batch No', 'Qty Received', 'Qty Accepted', 'Qty Rejected'] },
  { id: 'tpt', name: 'TPT Backsheet', icon: '🛡️', color: '#14b8a6', desc: 'Tedlar-PET-Tedlar Composite Film', params: ['Type', 'Thickness (μm)', 'Dimensions', 'Adhesion', 'Color', 'Visual Check', 'Mfg Date', 'Supplier', 'Batch No', 'Qty Received', 'Qty Accepted', 'Qty Rejected'] },
  { id: 'label', name: 'Label/Sticker', icon: '🏷️', color: '#78716c', desc: 'Name Plate, Rating Label, Barcode Sticker', params: ['Type', 'Size', 'Print Quality', 'Adhesion Test', 'Content Verification', 'Visual Check', 'Supplier', 'Batch No', 'Qty Received', 'Qty Accepted', 'Qty Rejected'] },
];

// ========== IQC INSPECTION FORM ==========
function IQCInspectionForm({ material, onBack, onSave }) {
  const [formData, setFormData] = useState({
    inspectionDate: new Date().toISOString().split('T')[0],
    inspectorName: '',
    supplierName: '',
    batchNo: '',
    poNumber: '',
    challanNo: '',
    qtyReceived: '',
    qtyAccepted: '',
    qtyRejected: '',
    overallResult: 'Accepted',
    remarks: '',
    params: material.params.reduce((acc, p) => ({ ...acc, [p]: '' }), {}),
    paramResults: material.params.reduce((acc, p) => ({ ...acc, [p]: 'OK' }), {}),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState(null);

  const handleParamChange = (param, value) => {
    setFormData(prev => ({ ...prev, params: { ...prev.params, [param]: value } }));
  };

  const handleParamResult = (param, result) => {
    setFormData(prev => ({ ...prev, paramResults: { ...prev.paramResults, [param]: result } }));
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    setUploadedFiles(prev => [...prev, ...files]);
  };

  const handleOCRProcess = async () => {
    if (uploadedFiles.length === 0) { setError('Upload inspection documents first'); return; }
    setOcrProcessing(true); setError(''); setOcrResult(null);
    try {
      const fd = new FormData();
      uploadedFiles.forEach(f => fd.append('images', f));
      fd.append('materialType', material.id);
      
      const res = await axios.post(`${API_BASE}/iqc/ocr-process`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      if (res.data.success) {
        setOcrResult(res.data);
        // Auto-fill form from OCR extracted data
        if (res.data.extractedData) {
          const ed = res.data.extractedData;
          setFormData(prev => {
            const updated = { ...prev };
            if (ed.supplierName) updated.supplierName = ed.supplierName;
            if (ed.batchNo) updated.batchNo = ed.batchNo;
            if (ed.qtyReceived) updated.qtyReceived = ed.qtyReceived;
            if (ed.inspectionDate) updated.inspectionDate = ed.inspectionDate;
            // Fill individual params from OCR
            if (ed.params) {
              updated.params = { ...updated.params, ...ed.params };
            }
            return updated;
          });
          setSuccess('OCR data extracted and form auto-filled!');
        }
      } else {
        setError(res.data.error || 'OCR processing failed');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setOcrProcessing(false);
    }
  };

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload = {
        materialType: material.id,
        materialName: material.name,
        ...formData,
      };
      const res = await axios.post(`${API_BASE}/iqc/save-inspection`, payload);
      if (res.data.success) {
        setSuccess(`✅ IQC inspection saved! ${res.data.excelGenerated ? 'Excel generated.' : ''}`);
        if (onSave) onSave(res.data);
      } else {
        setError(res.data.error || 'Save failed');
      }
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadExcel = () => {
    window.open(`${API_BASE}/iqc/download-excel/${material.id}/${formData.batchNo || 'latest'}`, '_blank');
  };

  const okCount = Object.values(formData.paramResults).filter(v => v === 'OK').length;
  const ngCount = Object.values(formData.paramResults).filter(v => v === 'NG').length;
  const totalParams = material.params.length;

  return (
    <div className="iqc-inspection">
      {/* Header */}
      <div className="iqc-insp-header">
        <button className="btn btn-ghost btn-back" onClick={onBack}>← Back to Materials</button>
        <div className="iqc-insp-title">
          <span className="iqc-mat-icon-lg" style={{ background: material.color }}>{material.icon}</span>
          <div>
            <h2>IQC Inspection — {material.name}</h2>
            <p className="iqc-mat-desc">{material.desc}</p>
          </div>
        </div>
        <div className="iqc-insp-summary">
          <div className="iqc-sum-item iqc-ok"><span>{okCount}</span> OK</div>
          <div className="iqc-sum-item iqc-ng"><span>{ngCount}</span> NG</div>
          <div className="iqc-sum-item iqc-total"><span>{totalParams}</span> Total</div>
        </div>
      </div>

      {/* Upload & OCR Section */}
      <div className="card iqc-ocr-card">
        <h3>📸 Upload Inspection Documents (Optional)</h3>
        <p className="card-desc">Upload photos/PDFs of supplier COA, test certificates, or inspection sheets for auto-fill via OCR.</p>
        <div className="iqc-upload-row">
          <label className="btn btn-outline iqc-upload-btn">
            📁 Choose Files
            <input type="file" multiple accept="image/*,.pdf" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
          {uploadedFiles.length > 0 && (
            <span className="iqc-file-count">{uploadedFiles.length} file(s) selected</span>
          )}
          <button className="btn btn-primary" onClick={handleOCRProcess} disabled={ocrProcessing || uploadedFiles.length === 0}>
            {ocrProcessing ? <><span className="spin-sm white"></span> OCR Processing...</> : '🔍 Extract Data via OCR'}
          </button>
        </div>
        {uploadedFiles.length > 0 && (
          <div className="iqc-file-list">
            {uploadedFiles.map((f, i) => (
              <span key={i} className="iqc-file-chip">📄 {f.name} <button onClick={() => setUploadedFiles(prev => prev.filter((_, j) => j !== i))}>×</button></span>
            ))}
          </div>
        )}
      </div>

      {error && <div className="alert alert-error">❌ {error}</div>}
      {success && <div className="alert alert-success">✅ {success}</div>}

      {/* General Info Form */}
      <div className="card">
        <h3>📝 General Information</h3>
        <div className="iqc-form-grid">
          <div className="iqc-field">
            <label>Inspection Date</label>
            <input type="date" value={formData.inspectionDate} onChange={e => setFormData(prev => ({ ...prev, inspectionDate: e.target.value }))} />
          </div>
          <div className="iqc-field">
            <label>Inspector Name</label>
            <input type="text" value={formData.inspectorName} onChange={e => setFormData(prev => ({ ...prev, inspectorName: e.target.value }))} placeholder="Enter name" />
          </div>
          <div className="iqc-field">
            <label>Supplier Name</label>
            <input type="text" value={formData.supplierName} onChange={e => setFormData(prev => ({ ...prev, supplierName: e.target.value }))} placeholder="Supplier" />
          </div>
          <div className="iqc-field">
            <label>Batch / Lot No</label>
            <input type="text" value={formData.batchNo} onChange={e => setFormData(prev => ({ ...prev, batchNo: e.target.value }))} placeholder="Batch number" />
          </div>
          <div className="iqc-field">
            <label>PO Number</label>
            <input type="text" value={formData.poNumber} onChange={e => setFormData(prev => ({ ...prev, poNumber: e.target.value }))} placeholder="Purchase order" />
          </div>
          <div className="iqc-field">
            <label>Challan No</label>
            <input type="text" value={formData.challanNo} onChange={e => setFormData(prev => ({ ...prev, challanNo: e.target.value }))} placeholder="Challan/DC no" />
          </div>
          <div className="iqc-field">
            <label>Qty Received</label>
            <input type="text" value={formData.qtyReceived} onChange={e => setFormData(prev => ({ ...prev, qtyReceived: e.target.value }))} placeholder="0" />
          </div>
          <div className="iqc-field">
            <label>Qty Accepted</label>
            <input type="text" value={formData.qtyAccepted} onChange={e => setFormData(prev => ({ ...prev, qtyAccepted: e.target.value }))} placeholder="0" />
          </div>
          <div className="iqc-field">
            <label>Qty Rejected</label>
            <input type="text" value={formData.qtyRejected} onChange={e => setFormData(prev => ({ ...prev, qtyRejected: e.target.value }))} placeholder="0" />
          </div>
        </div>
      </div>

      {/* Parameter-wise Inspection */}
      <div className="card">
        <h3>🔬 Parameter-wise Inspection</h3>
        <div className="table-wrap">
          <table className="data-table iqc-param-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Parameter</th>
                <th>Observed Value</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {material.params.map((param, idx) => (
                <tr key={idx} className={formData.paramResults[param] === 'NG' ? 'row-ng' : ''}>
                  <td className="td-num">{idx + 1}</td>
                  <td className="td-param">{param}</td>
                  <td>
                    <input
                      type="text"
                      className="iqc-param-input"
                      value={formData.params[param] || ''}
                      onChange={e => handleParamChange(param, e.target.value)}
                      placeholder={`Enter ${param}`}
                    />
                  </td>
                  <td>
                    <div className="iqc-result-btns">
                      <button
                        className={`iqc-rbtn ${formData.paramResults[param] === 'OK' ? 'iqc-rbtn-ok-active' : 'iqc-rbtn-ok'}`}
                        onClick={() => handleParamResult(param, 'OK')}
                      >OK</button>
                      <button
                        className={`iqc-rbtn ${formData.paramResults[param] === 'NG' ? 'iqc-rbtn-ng-active' : 'iqc-rbtn-ng'}`}
                        onClick={() => handleParamResult(param, 'NG')}
                      >NG</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Overall Result & Save */}
      <div className="card">
        <h3>📋 Overall Result</h3>
        <div className="iqc-form-grid">
          <div className="iqc-field">
            <label>Overall Verdict</label>
            <select value={formData.overallResult} onChange={e => setFormData(prev => ({ ...prev, overallResult: e.target.value }))}>
              <option value="Accepted">✅ Accepted</option>
              <option value="Rejected">❌ Rejected</option>
              <option value="Conditional">⚠️ Conditional Accept</option>
              <option value="Hold">⏸️ On Hold</option>
            </select>
          </div>
          <div className="iqc-field iqc-field-wide">
            <label>Remarks</label>
            <textarea value={formData.remarks} onChange={e => setFormData(prev => ({ ...prev, remarks: e.target.value }))} placeholder="Any remarks..." rows={3} />
          </div>
        </div>
        <div className="iqc-save-row">
          <button className="btn btn-lg btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? <><span className="spin-sm white"></span> Saving...</> : '💾 Save IQC Inspection'}
          </button>
          <button className="btn btn-lg btn-success" onClick={handleDownloadExcel}>
            📥 Download Excel Report
          </button>
          {ocrResult?.scannedPdfGenerated && (
            <button className="btn btn-lg btn-danger" onClick={() => window.open(`${API_BASE}/iqc/download/${ocrResult.scannedPdfFile}`, '_blank')}>
              📄 Download Scanned PDF
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ========== IQC HISTORY ==========
function IQCHistory({ material, onBack }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/iqc/history/${material.id}`);
      if (res.data.success) setRecords(res.data.records || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [material.id]);

  React.useEffect(() => { fetchHistory(); }, [fetchHistory]);

  return (
    <div className="iqc-history">
      <div className="iqc-hist-header">
        <button className="btn btn-ghost btn-back" onClick={onBack}>← Back to Materials</button>
        <h2>📜 {material.name} — Inspection History</h2>
      </div>
      {loading ? (
        <div className="alert alert-info"><span className="spin-sm"></span> Loading history...</div>
      ) : records.length === 0 ? (
        <div className="card"><div className="no-data-box"><span>📭</span><p>No inspection records yet for {material.name}</p></div></div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Date</th>
                  <th>Batch No</th>
                  <th>Supplier</th>
                  <th>Qty</th>
                  <th>Result</th>
                  <th>Inspector</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((rec, idx) => (
                  <tr key={idx} className={rec.overallResult === 'Rejected' ? 'row-ng' : rec.overallResult === 'Accepted' ? 'row-done' : ''}>
                    <td>{idx + 1}</td>
                    <td>{rec.inspectionDate}</td>
                    <td>{rec.batchNo}</td>
                    <td>{rec.supplierName}</td>
                    <td>{rec.qtyReceived}</td>
                    <td>
                      <span className={`badge ${rec.overallResult === 'Accepted' ? 'badge-ok' : rec.overallResult === 'Rejected' ? 'badge-ng' : 'badge-hold'}`}>
                        {rec.overallResult}
                      </span>
                    </td>
                    <td>{rec.inspectorName}</td>
                    <td>
                      <button className="btn btn-sm btn-success" onClick={() => window.open(`${API_BASE}/iqc/download-excel/${material.id}/${rec.batchNo}`, '_blank')}>📥 Excel</button>
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
}

// ========== MAIN IQC PAGE ==========
function IQCPage() {
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'inspect' | 'history'

  const handleSelectMaterial = (mat, mode) => {
    setSelectedMaterial(mat);
    setViewMode(mode);
  };

  if (selectedMaterial && viewMode === 'inspect') {
    return (
      <IQCInspectionForm
        material={selectedMaterial}
        onBack={() => { setSelectedMaterial(null); setViewMode('grid'); }}
        onSave={() => {}}
      />
    );
  }

  if (selectedMaterial && viewMode === 'history') {
    return (
      <IQCHistory
        material={selectedMaterial}
        onBack={() => { setSelectedMaterial(null); setViewMode('grid'); }}
      />
    );
  }

  return (
    <>
      {/* Stats Overview */}
      <div className="stats-row">
        <div className="stat-card"><div className="stat-icon bg-blue">📦</div><div className="stat-body"><span className="stat-val">{RAW_MATERIALS.length}</span><span className="stat-lbl">Raw Materials</span></div></div>
        <div className="stat-card"><div className="stat-icon bg-green">✅</div><div className="stat-body"><span className="stat-val">0</span><span className="stat-lbl">Inspected Today</span></div></div>
        <div className="stat-card"><div className="stat-icon bg-amber">⏳</div><div className="stat-body"><span className="stat-val">0</span><span className="stat-lbl">Pending</span></div></div>
        <div className="stat-card"><div className="stat-icon bg-red">❌</div><div className="stat-body"><span className="stat-val">0</span><span className="stat-lbl">Rejected</span></div></div>
      </div>

      {/* Material Cards Grid */}
      <div className="card">
        <div className="card-top">
          <h2>📦 IQC — Incoming Raw Material Inspection</h2>
          <p className="card-desc-inline">Select a raw material to start inspection or view history</p>
        </div>

        <div className="iqc-materials-grid">
          {RAW_MATERIALS.map(mat => (
            <div key={mat.id} className="iqc-mat-card" style={{ borderTopColor: mat.color }}>
              <div className="iqc-mat-card-icon" style={{ background: mat.color }}>
                {mat.icon}
              </div>
              <div className="iqc-mat-card-body">
                <h3>{mat.name}</h3>
                <p>{mat.desc}</p>
                <span className="iqc-param-count">{mat.params.length} parameters</span>
              </div>
              <div className="iqc-mat-card-actions">
                <button className="btn btn-sm btn-primary" onClick={() => handleSelectMaterial(mat, 'inspect')}>
                  🔬 New Inspection
                </button>
                <button className="btn btn-sm btn-outline" onClick={() => handleSelectMaterial(mat, 'history')}>
                  📜 History
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export default IQCPage;
