import React, { useState } from 'react';
import './App.css';
import IPQCPage from './components/IPQCPage';
import IQCPage from './components/IQCPage';
import IQCVerifyPage from './components/IQCVerifyPage';
import IPQCFormPage from './components/IPQCFormPage';

// ========== MAIN APP ==========
function App() {
  const [activeModule, setActiveModule] = useState('ipqc'); // 'ipqc' | 'iqc' | 'iqc-verify' | 'ipqc-form'

  // IPQC Form gets full page — no header, no padding
  if (activeModule === 'ipqc-form') {
    return (
      <div className="app-root" style={{ background:'#f0f2f5' }}>
        <IPQCFormPage onBack={() => setActiveModule('ipqc')} />
      </div>
    );
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="hdr-inner">
          <div className="brand">
            <div className="brand-icon">🏭</div>
            <div>
              <h1>Gautam Solar — QC System</h1>
              <span className="brand-sub">IPQC & IQC Quality Control • OCR • Excel • Scanned PDF</span>
            </div>
          </div>
          <nav className="nav-tabs">
            <button className={`nav-tab ${activeModule === 'ipqc' ? 'active' : ''}`} onClick={() => setActiveModule('ipqc')}>
              🔬 IPQC
            </button>
            <button className={`nav-tab ${activeModule === 'iqc' ? 'active' : ''}`} onClick={() => setActiveModule('iqc')}>
              📦 IQC
            </button>
            <button className={`nav-tab ${activeModule === 'iqc-verify' ? 'active' : ''}`} onClick={() => setActiveModule('iqc-verify')}>
              🔍 IQC Verify
            </button>
            <button className={`nav-tab ${activeModule === 'ipqc-form' ? 'active' : ''}`} onClick={() => setActiveModule('ipqc-form')}>
              📝 IPQC Form
            </button>
          </nav>
        </div>
      </header>

      <main className="main-area">
        {activeModule === 'ipqc' ? <IPQCPage /> : activeModule === 'iqc' ? <IQCPage /> : activeModule === 'iqc-verify' ? <IQCVerifyPage /> : null}
      </main>
    </div>
  );
}

export default App;
