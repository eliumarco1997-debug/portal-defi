import React from 'react';
import { useAppContext } from '../context/AppContext';

export default function Header() {
  const { activeWalletName } = useAppContext();

  return (
    <header className="top-header glass-panel">
      <h1 className="header-title">
        Mis Wallets {activeWalletName && <span style={{ color: 'var(--primary-neon)', fontSize: '1.2rem', marginLeft: '12px' }}>🔹 {activeWalletName}</span>}
      </h1>
      <div className="avatar"></div>
    </header>
  );
}
