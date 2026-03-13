import React, { useState, useEffect } from 'react';
import './App.css';
import IPQCPage from './components/IPQCPage';
import IQCPage from './components/IQCPage';
import IQCVerifyPage from './components/IQCVerifyPage';
import IPQCFormPage from './components/IPQCFormPage';
import IPQCResultsPage from './components/IPQCResultsPage';
import LoginPage from './components/LoginPage';

// ========== MAIN APP ==========
function App() {
  const [activeModule, setActiveModule] = useState('ipqc');
  const [loggedInUser, setLoggedInUser] = useState(null);

  // Check localStorage on mount for existing session
  useEffect(() => {
    try {
      const auth = JSON.parse(localStorage.getItem('ipqc_auth'));
      if (auth && auth.user) {
        setLoggedInUser(auth.user);
      }
    } catch (e) { /* ignore */ }
  }, []);

  const handleLogin = (user) => {
    setLoggedInUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('ipqc_auth');
    setLoggedInUser(null);
    setActiveModule('ipqc');
  };

  // Show login page if not authenticated
  if (!loggedInUser) {
    return <LoginPage onLogin={handleLogin} />;
  }

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
              <button className={`nav-tab ${activeModule === 'ipqc-results' ? 'active' : ''}`} onClick={() => setActiveModule('ipqc-results')}>
                📊 IPQC Results
              </button>
            </nav>
            <button onClick={handleLogout} className="logout-btn" title="Logout">
              🚪 Logout
            </button>
          </div>
        </div>
      </header>

      <main className="main-area">
        {activeModule === 'ipqc' ? <IPQCPage /> : activeModule === 'iqc' ? <IQCPage /> : activeModule === 'iqc-verify' ? <IQCVerifyPage /> : activeModule === 'ipqc-results' ? <IPQCResultsPage /> : null}
      </main>
    </div>
  );
}

export default App;
