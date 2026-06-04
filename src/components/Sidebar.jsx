import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';

export default function Sidebar() {
  const { activeTab, setActiveTab } = useAppContext();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNavClick = (tab) => {
    setActiveTab(tab);
    setMobileOpen(false);
  };

  return (
    <>
      {/* Hamburger button - solo visible en mobile */}
      <button 
        className="mobile-hamburger" 
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label="Toggle menu"
      >
        <span className={`hamburger-line ${mobileOpen ? 'open' : ''}`}></span>
        <span className={`hamburger-line ${mobileOpen ? 'open' : ''}`}></span>
        <span className={`hamburger-line ${mobileOpen ? 'open' : ''}`}></span>
      </button>

      {/* Overlay oscuro al abrir menu en mobile */}
      {mobileOpen && <div className="mobile-overlay" onClick={() => setMobileOpen(false)}></div>}

      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <div className="brand-icon">PC</div>
          <span className="brand-text">Pool Cripto</span>
        </div>
        <nav className="nav-menu">
          <div className={`nav-item ${activeTab === 'wallets' ? 'active' : ''}`} onClick={() => handleNavClick('wallets')}>
            <span>💼</span> Mis Wallets
          </div>
          <div className={`nav-item ${activeTab === 'haragan' ? 'active' : ''}`} onClick={() => handleNavClick('haragan')}>
            <span>🛡️</span> BOT - El Haragán
          </div>
          <div className={`nav-item ${activeTab === 'avaro' ? 'active' : ''}`} onClick={() => handleNavClick('avaro')}>
            <span>📈</span> BOT - El Avaro
          </div>
        </nav>
      </aside>
    </>
  );
}
