import React from 'react';
import { useAppContext } from '../context/AppContext';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { 
    activeWalletName, walletAddress, selectedChain, 
    newWalletApiKey, newWalletApiSecret, activeProtections, 
    autoGuardPools, cobOrderType 
  } = useAppContext();
  
  const { session } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const handleForceSync = async () => {
    if (!session?.user?.id) {
      alert("No hay sesión activa.");
      return;
    }
    try {
      const { error } = await supabase.from('user_settings').upsert({
        id: session.user.id,
        wallet_address: walletAddress || null,
        selected_chain: selectedChain || null,
        active_wallet_name: activeWalletName || null,
        bitunix_api_key: newWalletApiKey || null,
        bitunix_api_secret: newWalletApiSecret || null,
        active_protections: activeProtections || {},
        auto_guard_pools: autoGuardPools || {},
        cob_order_type: cobOrderType || 'LIMIT',
        updated_at: new Date().toISOString()
      });
      if (error) {
        alert("Error al subir a la nube: " + error.message);
      } else {
        alert("¡Datos subidos a la nube con éxito! Ahora recarga la página en tu teléfono.");
      }
    } catch (err) {
      alert("Error crítico: " + err.message);
    }
  };

  return (
    <header className="top-header glass-panel" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <h1 className="header-title">
        Mis Wallets {activeWalletName && <span style={{ color: 'var(--primary-neon)', fontSize: '1.2rem', marginLeft: '12px' }}>🔹 {activeWalletName}</span>}
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
        <button 
          onClick={handleForceSync}
          style={{
            background: 'rgba(50, 205, 50, 0.2)',
            color: '#32cd32',
            border: '1px solid rgba(50, 205, 50, 0.5)',
            padding: '8px 16px',
            borderRadius: '8px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Forzar Sincronización
        </button>
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
