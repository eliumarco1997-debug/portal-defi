import React from 'react';
import { useAppContext } from '../context/AppContext';

export default function Sidebar() {
  const { activeTab, setActiveTab } = useAppContext();

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">PC</div>
        <span className="brand-text">Pool Cripto</span>
      </div>
      <nav className="nav-menu">
        <div className={`nav-item ${activeTab === 'wallets' ? 'active' : ''}`} onClick={() => setActiveTab('wallets')}>
          <span>💼</span> Mis Wallets
        </div>
        <div className={`nav-item ${activeTab === 'haragan' ? 'active' : ''}`} onClick={() => setActiveTab('haragan')}>
          <span>🛡️</span> BOT - El Haragán
        </div>
        <div className={`nav-item ${activeTab === 'avaro' ? 'active' : ''}`} onClick={() => setActiveTab('avaro')}>
          <span>📈</span> BOT - El Avaro
        </div>
      </nav>
    </aside>
  );
}
