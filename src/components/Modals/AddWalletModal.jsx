import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';

export default function AddWalletModal() {
  const { 
    setShowAddWalletModal, setWalletAddress, setActiveWalletName, 
    setSelectedChain, scanPositions, setNewWalletApiKey, setNewWalletApiSecret,
    newWalletApiKey, newWalletApiSecret
  } = useAppContext();

  const [newWalletPlatform, setNewWalletPlatform] = useState('hyperliquid');
  const [newWalletName, setNewWalletName] = useState('');
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletChain, setNewWalletChain] = useState('arbitrum');
  const [newWalletType, setNewWalletType] = useState('Protección');

  const handleAddWallet = () => {
    if (!newWalletName || !newWalletAddress) return;
    setWalletAddress(newWalletAddress);
    setActiveWalletName(newWalletName);
    setSelectedChain(newWalletChain);
    scanPositions(newWalletAddress, newWalletChain);
    setShowAddWalletModal(false);
  };

  return (
    <div className="modal-overlay">
      <div className="hyper-modal">
        <div className="scanner-header-top" style={{ marginBottom: '16px' }}>
          <span style={{ fontSize: '1.2rem', fontWeight: '600', color: 'white' }}>Añadir Wallet {newWalletPlatform === 'hyperliquid' ? 'Hyperliquid' : 'Bitunix'}</span>
          <span className="scanner-close" onClick={() => setShowAddWalletModal(false)}>✕</span>
        </div>

        <div className="hyper-input-group" style={{ display: 'flex', gap: '10px' }}>
          <button
            className="btn-dark-outline"
            style={{ flex: 1, justifyContent: 'center', borderColor: newWalletPlatform === 'hyperliquid' ? '#3b82f6' : '#2a2d36', color: newWalletPlatform === 'hyperliquid' ? '#3b82f6' : '#8a8f9e', backgroundColor: newWalletPlatform === 'hyperliquid' ? 'rgba(59, 130, 246, 0.1)' : 'transparent' }}
            onClick={() => setNewWalletPlatform('hyperliquid')}
          >
            Hyperliquid
          </button>
          <button
            className="btn-dark-outline"
            style={{ flex: 1, justifyContent: 'center', borderColor: newWalletPlatform === 'bitunix' ? '#f59e0b' : '#2a2d36', color: newWalletPlatform === 'bitunix' ? '#f59e0b' : '#8a8f9e', backgroundColor: newWalletPlatform === 'bitunix' ? 'rgba(245, 158, 11, 0.1)' : 'transparent' }}
            onClick={() => setNewWalletPlatform('bitunix')}
          >
            Bitunix
          </button>
        </div>

        <div className="hyper-input-group">
          <label className="hyper-label">Nombre / Etiqueta</label>
          <input
            className="scanner-input"
            placeholder="Ej: Mi wallet principal"
            value={newWalletName}
            onChange={e => setNewWalletName(e.target.value)}
          />
        </div>

        <div className="hyper-input-group">
          <label className="hyper-label">Tipo de Wallet</label>
          <div className="wallet-type-grid">
            <div className={`wallet-type-btn ${newWalletType === 'Protección' ? 'active' : ''}`} onClick={() => setNewWalletType('Protección')}>
              <div className="wt-icon" style={{ color: '#3b82f6' }}>🛡️</div>
              <div className="wt-title">Protección</div>
              <div className="wt-sub">Hedge</div>
            </div>
            <div className={`wallet-type-btn ${newWalletType === 'Trading' ? 'active' : ''}`} onClick={() => setNewWalletType('Trading')}>
              <div className="wt-icon" style={{ color: '#a855f7' }}>📈</div>
              <div className="wt-title">Trading</div>
              <div className="wt-sub">Rango</div>
            </div>
            <div className={`wallet-type-btn ${newWalletType === 'Catador' ? 'active' : ''}`} onClick={() => setNewWalletType('Catador')}>
              <div className="wt-icon" style={{ color: '#f59e0b' }}>🔮</div>
              <div className="wt-title">Catador</div>
              <div className="wt-sub">Mean-rev</div>
            </div>
            <div className="wallet-type-btn disabled">
              <div className="wt-icon" style={{ color: '#6b7280' }}>🕵️</div>
              <div className="wt-title" style={{ whiteSpace: 'nowrap' }}>Copy Trading</div>
              <div className="wt-sub">No disponible</div>
            </div>
          </div>
        </div>

        <div className="hyper-input-group">
          <label className="hyper-label">Dirección Pública (Wallet)</label>
          <input
            className="scanner-input mono"
            placeholder="0x... (tu dirección de MetaMask o Rabby)"
            value={newWalletAddress}
            onChange={e => setNewWalletAddress(e.target.value)}
          />
        </div>

        {newWalletPlatform === 'bitunix' && (
          <>
            <div className="hyper-input-group">
              <label className="hyper-label">API Key</label>
              <input
                className="scanner-input mono"
                placeholder="Pega tu API Key"
                value={newWalletApiKey}
                onChange={e => setNewWalletApiKey(e.target.value)}
              />
            </div>
            <div className="hyper-input-group">
              <label className="hyper-label">API Secret</label>
              <input
                className="scanner-input mono"
                type="password"
                placeholder="Pega tu API Secret"
                value={newWalletApiSecret}
                onChange={e => setNewWalletApiSecret(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="modal-actions-spaced" style={{ marginTop: '24px' }}>
          <button className="btn-cancel" onClick={() => setShowAddWalletModal(false)}>Cancelar</button>
          <button className="btn-yellow" onClick={handleAddWallet}>Añadir Wallet</button>
        </div>
      </div>
    </div>
  );
}
