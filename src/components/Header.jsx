import React from 'react';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../utils/supabaseClient';

export default function Header() {
  const { activeWalletName } = useAppContext();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <header className="top-header glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1 className="header-title">
        Mis Wallets {activeWalletName && <span style={{ color: 'var(--primary-neon)', fontSize: '1.2rem', marginLeft: '12px' }}>🔹 {activeWalletName}</span>}
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button 
          onClick={handleLogout}
          style={{
            background: 'rgba(255, 75, 75, 0.2)',
            color: '#ff4b4b',
            border: '1px solid rgba(255, 75, 75, 0.5)',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 75, 75, 0.4)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 75, 75, 0.2)';
          }}
        >
          Cerrar Sesión
        </button>
        <div className="avatar"></div>
      </div>
    </header>
  );
}
