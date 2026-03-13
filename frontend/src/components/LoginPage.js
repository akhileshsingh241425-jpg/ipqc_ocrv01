import React, { useState } from 'react';

// ========== LOGIN PAGE ==========
function LoginPage({ onLogin }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      if (userId.trim().toLowerCase() === 'quality@gautamsolar' && password === 'Gautamsolar@d120') {
        localStorage.setItem('ipqc_auth', JSON.stringify({ user: userId.trim().toLowerCase(), loggedAt: Date.now() }));
        onLogin(userId.trim().toLowerCase());
      } else {
        setError('Invalid User ID or Password');
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div className="login-page">
      <div className="login-bg-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>

      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">🏭</div>
          <h1>Gautam Solar</h1>
          <p>Quality Control System</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="userId">👤 User ID</label>
            <input
              id="userId"
              type="text"
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setError(''); }}
              placeholder="Enter your User ID"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="login-field">
            <label htmlFor="password">🔒 Password</label>
            <div className="password-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="Enter your Password"
                autoComplete="current-password"
                required
              />
              <button type="button" className="pwd-toggle" onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {error && (
            <div className="login-error">
              ❌ {error}
            </div>
          )}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? (
              <><span className="spin-sm"></span> Logging in...</>
            ) : (
              <>🔐 Login</>
            )}
          </button>
        </form>

        <div className="login-footer">
          <span>IPQC & IQC Quality Control • OCR • Excel</span>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
