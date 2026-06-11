import React, { useState } from 'react';
import { useAppContext } from '../../context/AppContext';

export default function CoberturaModal() {
  const { 
    setShowCoberturaModal, lpPositions, selectedLpDetails,
    formatPrice, newWalletApiKey, newWalletApiSecret,
    setBotMessage, setIsBotLoading, cobLeverage, setCobLeverage,
    cobStopLoss, setCobStopLoss, cobOrderType, setCobOrderType,
    botMessage, isBotLoading, setAutoGuardPools, setActiveProtections,
    selectedCobPosition, setSelectedCobPosition
  } = useAppContext();

  const [cobStep, setCobStep] = useState(1);
  const [selectedExchange, setSelectedExchange] = useState(null);
  const [selectedStrategy, setSelectedStrategy] = useState(null);

  const canGoNext = () => {
    if (cobStep === 1) return selectedCobPosition !== null;
    if (cobStep === 2) return selectedExchange !== null;
    if (cobStep === 3) return selectedStrategy !== null;
    return true;
  };

  const toBitunixSymbol = (sym, quoteSym) => {
    if (!sym) return 'ETHUSDT';
    let s = sym.toUpperCase();
    if (s === 'WETH') s = 'ETH';
    if (s === 'WBTC') s = 'BTC';
    // Detectar quote de la pool
    let quote = 'USDT';
    if (quoteSym) {
      const q = quoteSym.toUpperCase();
      if (q === 'USDC' || q === 'USDC.E') quote = 'USDC';
      else if (q === 'USDT' || q === 'USDT.E') quote = 'USDT';
    }
    return `${s}${quote}`;
  };

  const executeBotOrder = async () => {
    if (!newWalletApiKey || !newWalletApiSecret) {
      setBotMessage('⚠️ Ingresa tus claves de Bitunix en "Añadir Wallet" primero.');
      return;
    }
    
    const activePosition = lpPositions.find(p => p.id === selectedCobPosition) || selectedLpDetails;
    if (!activePosition) return;
    
    // Detectar cuál token es la stablecoin de la pool
    const stablecoins = ['USDC', 'USDT', 'USDC.E', 'USDT.E', 'DAI', 'USDC.e', 'USDt'];
    const t0Upper = activePosition.token0.symbol.toUpperCase();
    const t1Upper = activePosition.token1.symbol.toUpperCase();
    
    let baseToken, quoteToken;
    if (stablecoins.includes(t1Upper)) {
      // token1 es la stablecoin (caso normal: WETH/USDC)
      baseToken = activePosition.token0.symbol;
      quoteToken = activePosition.token1.symbol;
    } else if (stablecoins.includes(t0Upper)) {
      // token0 es la stablecoin (caso invertido: USDC/WETH)
      baseToken = activePosition.token1.symbol;
      quoteToken = activePosition.token0.symbol;
    } else {
      // Ninguno es stablecoin, usar token0 con USDT por defecto
      baseToken = activePosition.token0.symbol;
      quoteToken = 'USDT';
    }
    
    const symbol = toBitunixSymbol(baseToken, quoteToken);
    const priceForSizing = activePosition.priceCurrent || activePosition.price0 || 1;
    let rawSize = (activePosition.totalUsd || 0) / priceForSizing;
    let size = parseFloat(rawSize.toFixed(4));
    
    if (selectedStrategy === 'delta_50') size = parseFloat((size * 0.5).toFixed(4));
    else if (selectedStrategy === 'delta_75') size = parseFloat((size * 0.75).toFixed(4));
    else if (selectedStrategy === 'smart_range') size = parseFloat((size * 0.8).toFixed(4));

    if (size <= 0 || isNaN(size)) size = 0.01;

    try {
      setIsBotLoading(true);
      setBotMessage(`⏳ Configurando VIGILANCIA en ${symbol} (x${cobLeverage})...`);
      
      const triggerPrice = activePosition.priceMin;
      const marginRequired = (activePosition.totalUsd || 0) / cobLeverage;

      const botRes = await fetch(`${import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3002' : '')}/api/bot/protect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress:      activePosition.poolAddress,
          lowerBound:       triggerPrice,
          upperBound:       activePosition.priceMax,
          hedgeSymbol:      symbol,
          hedgeQty:         String(size),
          hedgeLeverage:    cobLeverage,
          stopLossPct:      cobStopLoss,
          bitunixApiKey:    newWalletApiKey,
          bitunixApiSecret: newWalletApiSecret,
          orderType:        cobOrderType,
          positionId:       activePosition.id
        })
      });
      
      const data = await botRes.json();
      if (!data.success) throw new Error(data.error || 'Error al conectar con el motor El Haragán');
      
      const hedgeOpened = data.hedgeOpened === true;
      
      setAutoGuardPools(prev => ({
        ...prev,
        [String(activePosition.id)]: {
          active: true,
          triggerPrice,
          leverage: cobLeverage,
          stopLoss: cobStopLoss,
          triggered: hedgeOpened,
          poolAddress: activePosition.poolAddress,
          activatedAt: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        }
      }));
      
      setActiveProtections(prev => ({
        ...prev,
        [selectedCobPosition]: {
          symbol,
          leverage: cobLeverage,
          stopLoss: cobStopLoss,
          entryPrice: triggerPrice,
          sizeTokens: size,
          margin: marginRequired,
          totalValue: activePosition.totalUsd || 0,
          timestamp: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          isMonitoring: !hedgeOpened
        }
      }));
      
      const msg = hedgeOpened 
        ? `✅ ¡SHORT abierto exitosamente en Bitunix! Protección activa.`
        : `✅ Bot vigilando. Se abrirá SHORT automáticamente si el precio sale del rango.`;
      setBotMessage(msg);
      setTimeout(() => { setShowCoberturaModal(false); setCobStep(1); setBotMessage(''); }, 2000);
    } catch (e) {
      if (e.message.includes('Failed to fetch') || e.message.includes('NetworkError')) {
        setBotMessage(`❌ Error de Conexión. Asegúrate de que el backend haragan-bot.js esté corriendo (npm start).`);
      } else {
        setBotMessage(`❌ Error: ${e.message}`);
      }
    } finally {
      setIsBotLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="cob-modal">
        <div className="cob-header">
          <span className="cob-title">Crear Nueva Cobertura</span>
          <span className="cob-close" onClick={() => setShowCoberturaModal(false)}>✕</span>
        </div>

        <div className="cob-stepper">
          <div className={`cob-step ${cobStep >= 1 ? 'active' : ''}`}><div className="cob-step-circle">{cobStep > 1 ? '✓' : '1'}</div><div className="cob-step-title">Seleccionar<br />Posición</div></div>
          <div className={`cob-step ${cobStep >= 2 ? 'active' : ''}`}><div className="cob-step-circle">{cobStep > 2 ? '✓' : '2'}</div><div className="cob-step-title">Seleccionar<br />Exchange</div></div>
          <div className={`cob-step ${cobStep >= 3 ? 'active' : ''}`}><div className="cob-step-circle">{cobStep > 3 ? '✓' : '3'}</div><div className="cob-step-title">Elegir<br />Estrategia</div></div>
          <div className={`cob-step ${cobStep >= 4 ? 'active' : ''}`}><div className="cob-step-circle">{cobStep > 4 ? '✓' : '4'}</div><div className="cob-step-title">Configurar<br />Parámetros</div></div>
        </div>

        {cobStep === 1 && (
          <div className="cob-content">
            <div className="cob-content-title">Selecciona la posición LP a cubrir</div>
            <div className="cob-content-sub">Elige una posición LP que aún no tenga cobertura activa</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '300px', overflowY: 'auto', paddingRight: '8px' }}>
              {lpPositions.filter(p => p.inRange).length === 0 ? (
                <div style={{ color: '#6b7280', textAlign: 'center', padding: '30px', background: '#12141a', borderRadius: '12px' }}>
                  No tienes posiciones en rango en esta wallet.
                </div>
              ) : (
                lpPositions.filter(p => p.inRange).map(pos => (
                  <div
                    key={pos.id}
                    className={`cob-position-card ${selectedCobPosition === pos.id ? 'selected' : ''}`}
                    onClick={() => setSelectedCobPosition(pos.id)}
                  >
                    <div className="cob-check-circle">{selectedCobPosition === pos.id && '✓'}</div>
                    <div className="cob-pos-info">
                      <div className="cob-pos-pair">{pos.token0.symbol}/{pos.token1.symbol} <span className="cob-pos-fee">{pos.fee}%</span></div>
                      <div className="cob-pos-status">{pos.chain} <span style={{ color: '#4ade80' }}>(En Rango)</span></div>
                    </div>
                    <div className="cob-pos-value">
                      <div className="cob-pos-value-big">${pos.totalUsd ? pos.totalUsd.toFixed(2) : '0.00'}</div>
                      <div className="cob-pos-value-sub">Valor</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {cobStep === 2 && (
          <div className="cob-content">
            <div className="cob-content-title">Selecciona el exchange para ejecutar</div>
            <div className="cob-content-sub">Elige el exchange donde se abrirá la posición de cobertura</div>
            <div
              className={`cob-exchange-card ${selectedExchange === 'bitunix' ? 'selected' : ''}`}
              onClick={() => setSelectedExchange('bitunix')}
            >
              <div className="cob-square-check">{selectedExchange === 'bitunix' && '✓'}</div>
              <div className="cob-ex-logo" style={{ backgroundColor: '#f59e0b', color: '#111' }}>BX</div>
              <div className="cob-ex-details">
                <div className="cob-ex-title-row">
                  <span className="cob-ex-name">Bitunix</span>
                  <span className="cob-badge-blue">API Habilitada</span>
                </div>
                <span className="cob-badge-orange" style={{ width: 'max-content' }}>CEX</span>
              </div>
            </div>
          </div>
        )}

        {cobStep === 3 && (
          <div className="cob-content">
            <div className="cob-content-title">Elige una estrategia de cobertura</div>
            <div className="cob-content-sub">Cada estrategia tiene diferentes niveles de protección y costos</div>
            <div className="cob-strategy-grid">
              <div className={`cob-strategy-card strat-blue ${selectedStrategy === 'delta_100' ? 'selected' : ''}`} onClick={() => setSelectedStrategy('delta_100')}>
                <div className="cob-badge-recommended">⭐ Recomendado</div>
                {selectedStrategy === 'delta_100' && <div className="cob-strat-check">✓</div>}
                <div className="cob-strat-header">
                  <div className="cob-strat-icon-box">🛡️</div>
                  <div className="cob-strat-title">Delta Neutral 100%</div>
                </div>
                <div className="cob-strat-ratio">Ratio de Cobertura: <span>100%</span></div>
              </div>
            </div>
          </div>
        )}

        {cobStep === 4 && (
          (() => {
            const activePosition = lpPositions.find(p => p.id === selectedCobPosition) || selectedLpDetails;
            if (!activePosition) return null;
            
            return (
              <div className="cob-content" style={{ padding: '0', background: 'transparent' }}>
                <div className="prot-header">
                  <div className="prot-title"><span className="prot-icon">🛡️</span> Configurar Protección</div>
                  <div className="prot-subtitle">{activePosition.token0.symbol}/{activePosition.token1.symbol} • Rango {formatPrice(activePosition.priceMin)} - {formatPrice(activePosition.priceMax)}</div>
                </div>
                <div className="prot-body">
                  <div className="prot-card">
                    <div className="prot-card-row">
                      <span>Cobertura (Margen Requerido)</span>
                      <span style={{ fontWeight: '700', color: '#10b981', fontSize: '1rem' }}>~${((activePosition.totalUsd || 0) / cobLeverage).toFixed(2)}</span>
                    </div>
                    <div className="prot-slider-container">
                      <div style={{ textAlign: 'center', marginBottom: '8px', fontSize: '1.4rem', fontWeight: 'bold', color: '#f59e0b', textShadow: '0 0 10px rgba(245,158,11,0.5)' }}>
                        {cobLeverage}x
                      </div>
                      <input 
                        type="range" min="1" max="25" 
                        value={cobLeverage} onChange={(e) => setCobLeverage(e.target.value)} 
                        className="prot-slider"
                        style={{ '--val': `${((cobLeverage - 1) / 24) * 100}%` }}
                      />
                      <div className="prot-slider-labels"><span>1x</span><span>25x max</span></div>
                    </div>
                  </div>

                  <div className="prot-field">
                    <label>Stop Loss Fijo (%)</label>
                    <input type="number" step="0.1" value={cobStopLoss} onChange={(e) => setCobStopLoss(e.target.value)} className="prot-input" />
                  </div>

                  <div className="prot-field">
                    <label>Tipo de Orden de Cobertura</label>
                    <select value={cobOrderType} onChange={(e) => setCobOrderType(e.target.value)} className="prot-select" style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)' }}>
                      <option value="LIMIT" style={{ background: '#1a1d29' }}>Límite (LIMIT) con protección</option>
                      <option value="MARKET" style={{ background: '#1a1d29' }}>Mercado (MARKET) - Inmediato</option>
                    </select>
                  </div>

                  {botMessage && (
                    <div style={{ marginTop: '16px', padding: '12px', borderRadius: '8px', background: botMessage.includes('❌') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)', color: botMessage.includes('❌') ? '#ef4444' : '#10b981' }}>
                      {botMessage}
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}

        <div className="cob-footer" style={{ padding: cobStep === 4 ? '16px 24px 24px' : '20px' }}>
          {cobStep === 1 ? (
            <button className="btn-cancel" style={{ background: 'transparent', padding: '10px' }} onClick={() => { setShowCoberturaModal(false); setCobStep(1); }}>&lt; Cancelar</button>
          ) : cobStep === 4 ? (
            <button className="prot-btn-cancel" onClick={() => setCobStep(cobStep - 1)}>Cancelar</button>
          ) : (
            <button className="btn-cancel" style={{ background: 'transparent', padding: '10px' }} onClick={() => setCobStep(cobStep - 1)}>&lt; Atrás</button>
          )}
          
          {cobStep === 4 ? (
            <button className="prot-btn-activate" onClick={executeBotOrder} disabled={isBotLoading}>
              {isBotLoading ? '⏳ Activando...' : 'Activar Protección'}
            </button>
          ) : (
            <button className="btn-cob-next" disabled={!canGoNext()} onClick={() => { if (cobStep < 4) setCobStep(cobStep + 1); }}>
              Siguiente &gt;
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
