import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { botFetch } from '../utils/supabaseClient';

export default function HaraganPage() {
  const {
    lpPositions, activeProtections, autoGuardPools,
    botStatus, toggleAutoGuard, cobLeverage, cobStopLoss,
    formatPrice, setSelectedCobPosition, setShowCoberturaModal,
    setActiveProtections, setAutoGuardPools
  } = useAppContext();

  const [expandedHaraganPool, setExpandedHaraganPool] = useState(null);

  return (
    <div className="haragan-container">
      <h2 className="haragan-title">🛡️ El Haragán — Análisis Detallado</h2>
      <p className="haragan-subtitle">Vista profesional de cada posición LP con métricas avanzadas, fees y proyecciones.</p>

      {lpPositions.length === 0 ? (
        <div className="hp-empty">
          <div className="hp-empty-icon">🔍</div>
          <div className="hp-empty-text">No hay posiciones cargadas</div>
          <div className="hp-empty-sub">Primero añade una wallet en "Mis Wallets" y escanea sus posiciones.</div>
        </div>
      ) : (
        lpPositions.map(pos => {
          const isExpanded = expandedHaraganPool === pos.id;
          const rangePercent = Math.min(100, Math.max(0, ((pos.rawTick - pos.rawTickLower) / (pos.rawTickUpper - pos.rawTickLower)) * 100));
          
          const feeAprVal = pos.feeApr || 0;
          const feePercent = pos.depositsValue > 0 ? ((pos.unclaimed / pos.depositsValue) * 100) : 0;
          const dailyEarn = pos.ageDays > 0 ? (pos.unclaimed / pos.ageDays) : 0;
          const weeklyEarn = dailyEarn * 7;
          const monthlyEarn = dailyEarn * 30;
          const yearlyEarn = dailyEarn * 365;
          const dailyPct = pos.depositsValue > 0 ? (dailyEarn / pos.depositsValue * 100) : 0;
          const weeklyPct = pos.depositsValue > 0 ? (weeklyEarn / pos.depositsValue * 100) : 0;
          const monthlyPct = pos.depositsValue > 0 ? (monthlyEarn / pos.depositsValue * 100) : 0;
          const yearlyPct = pos.depositsValue > 0 ? (yearlyEarn / pos.depositsValue * 100) : 0;
          const pnlColor = (pos.pnl || 0) >= 0 ? 'green' : 'red';
          const pnlCapColor = (pos.pnlCapital || 0) >= 0 ? 'green' : 'red';
          const aprColor = (pos.apr || 0) >= 0 ? 'green' : 'red';
          const aprCapColor = (pos.aprCapital || 0) >= 0 ? 'green' : 'red';

          return (
            <div className="haragan-pool-card" key={pos.id}>
              {/* HEADER BAR */}
              <div className="hp-header" onClick={() => setExpandedHaraganPool(isExpanded ? null : pos.id)}>
                <div className="hp-header-left">
                  <span className="hp-pair-name">{pos.token0.symbol}/{pos.token1.symbol}</span>
                  <span className={pos.inRange ? 'hp-badge-in' : 'hp-badge-out'}>
                    {pos.inRange ? 'En Rango' : '⚠ Fuera'}
                  </span>
                  <span className="hp-badge-chain">{pos.chain || 'Arbitrum'}</span>
                  <span className="hp-current-price">{formatPrice(pos.priceCurrent)}</span>
                  {activeProtections[pos.id] && (
                    <span className={activeProtections[pos.id].isMonitoring ? 'hp-badge-monitoring' : 'hp-badge-protected'}>
                      {activeProtections[pos.id].isMonitoring ? '👁️ VIGILANDO' : '🛡️ SHORT ACTIVO'}
                    </span>
                  )}
                </div>
                <div className="hp-header-right">
                  <div className="hp-header-stat">
                    <span className="hp-header-stat-label">Valor LP ⓘ</span>
                    <span className="hp-header-stat-value">${pos.totalUsd?.toFixed(2)}</span>
                  </div>
                  <div className="hp-header-stat">
                    <span className="hp-header-stat-label">Entry ⓘ</span>
                    <span className="hp-header-stat-value">{pos.entryPrice ? formatPrice(pos.entryPrice) : '—'}</span>
                  </div>
                  <div className="hp-header-stat">
                    <span className="hp-header-stat-label">PNL ⓘ</span>
                    <span className={`hp-header-stat-value ${pnlColor}`}>
                      {pos.pnl !== null ? `$${pos.pnl.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="hp-header-stat">
                    <span className="hp-header-stat-label">APR ⓘ</span>
                    <span className={`hp-header-stat-value ${aprColor}`}>
                      {pos.apr ? `${pos.apr.toFixed(1)}%` : '—'}
                    </span>
                  </div>
                  <div className="hp-header-stat">
                    <span className="hp-header-stat-label">Fee APR ⓘ</span>
                    <span className="hp-header-stat-value green">{feeAprVal.toFixed(1)}%</span>
                  </div>
                  <div className="hp-header-stat">
                    <span className="hp-header-stat-label">Fees ⓘ</span>
                    <span className="hp-header-stat-value yellow">${pos.unclaimed?.toFixed(2)}</span>
                  </div>
                  <span className={`hp-expand-icon ${isExpanded ? 'open' : ''}`}>▼</span>
                </div>
              </div>

              {/* EXPANDED DETAIL */}
              {isExpanded && (
                <div className="hp-detail">
                  {/* Price Range Bar */}
                  <div className="hp-range-container">
                    <div className="hp-range-min-max">
                      <span>MIN {formatPrice(pos.priceMin)}</span>
                      <span>MAX {formatPrice(pos.priceMax)}</span>
                    </div>
                    <div className="hp-range-bar">
                      <div className="hp-range-bar-bg"></div>
                      <div className="hp-range-bar-fill" style={{
                        left: '0%',
                        right: '0%',
                        background: pos.inRange
                          ? 'linear-gradient(90deg, #10b981, #e6c875)'
                          : 'linear-gradient(90deg, #ef4444, #f59e0b)'
                      }}></div>
                      <div className="hp-range-indicator" style={{ left: `${rangePercent}%` }}>
                        <div className="hp-range-price-label">{formatPrice(pos.priceCurrent)}</div>
                      </div>
                    </div>
                    <div className="hp-range-min-max" style={{ marginTop: '4px' }}>
                      <span>{formatPrice(pos.priceMin)}</span>
                      <span>{formatPrice(pos.priceMax)}</span>
                    </div>
                  </div>

                  {/* Protección Activa */}
                  {activeProtections[pos.id] ? (
                    <div className="hp-protection-active">
                      <div className="hp-prot-badge-row">
                        <span className="hp-prot-icon">🛡️</span>
                        <span className="hp-prot-title">Protección Automática</span>
                        <span className="hp-prot-status-dot" style={{ backgroundColor: activeProtections[pos.id].isMonitoring ? '#3b82f6' : '#ef4444', boxShadow: activeProtections[pos.id].isMonitoring ? '0 0 8px #3b82f6' : '0 0 8px #ef4444' }}></span>
                        <span className="hp-prot-live" style={{ background: activeProtections[pos.id].isMonitoring ? 'rgba(59,130,246,0.1)' : 'rgba(239,68,68,0.1)', color: activeProtections[pos.id].isMonitoring ? '#3b82f6' : '#ef4444', border: activeProtections[pos.id].isMonitoring ? '1px solid rgba(59,130,246,0.3)' : '1px solid rgba(239,68,68,0.3)' }}>
                          {activeProtections[pos.id].isMonitoring ? 'VIGILANDO' : 'SHORT ACTIVO'}
                        </span>
                      </div>

                      {/* ── INDICADOR DE SINCRONÍA CON EL BOT DE RAILWAY ── */}
                      {(() => {
                        const botHasPool = botStatus?.pools?.some(
                          bp => bp.positionId ? String(bp.positionId) === String(pos.id) : (pos.poolAddress && bp.address.toLowerCase() === pos.poolAddress.toLowerCase())
                        );
                        const botOnline = botStatus?.connectedToWSS;
                        if (!botStatus) return null;
                        if (!botOnline) return (
                          <div style={{ margin: '8px 0', padding: '8px 12px', borderRadius: '8px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.78rem', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🔴 <strong>Bot desconectado</strong> — El motor no está corriendo. La vigilancia está INACTIVA.
                          </div>
                        );
                        if (!botHasPool) return (
                          <div style={{ margin: '8px 0', padding: '8px 12px', borderRadius: '8px', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', fontSize: '0.78rem', color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🟡 <strong>Re-sincronizando con el motor...</strong> El bot reinició y está recuperando tu pool automáticamente.
                          </div>
                        );
                        return (
                          <div style={{ margin: '8px 0', padding: '8px 12px', borderRadius: '8px', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '0.78rem', color: '#10b981', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            🟢 <strong>Motor confirmado</strong> — El bot de Railway tiene tu pool registrado y está vigilando.
                          </div>
                        );
                      })()}

                      <div className="hp-prot-details">
                        <div className="hp-prot-detail-item">
                          <span>Par</span>
                          <span>{activeProtections[pos.id].symbol}-PERP SHORT</span>
                        </div>
                        <div className="hp-prot-detail-item">
                          <span>Leverage</span>
                          <span>{activeProtections[pos.id].leverage}x Isolated</span>
                        </div>
                        <div className="hp-prot-detail-item">
                          <span>Precio SHORT abierto</span>
                          <span style={{ color: '#f59e0b', fontWeight: 700 }}>
                            {activeProtections[pos.id].entryPrice
                              ? `$${Number(activeProtections[pos.id].entryPrice).toFixed(2)}`
                              : '—'}
                          </span>
                        </div>
                        <div className="hp-prot-detail-item">
                          <span>Cobertura (Margen Requerido)</span>
                          <span style={{ color: '#10b981', fontWeight: 700 }}>
                            {activeProtections[pos.id].margin != null
                              ? `~$${Number(activeProtections[pos.id].margin).toFixed(2)}`
                              : '—'}
                          </span>
                        </div>
                        <div className="hp-prot-detail-item">
                          <span>Stop Loss</span>
                          <span>+{activeProtections[pos.id].stopLoss}%</span>
                        </div>
                        <div className="hp-prot-detail-item">
                          <span>Activada a las</span>
                          <span>{activeProtections[pos.id].timestamp}</span>
                        </div>
                      </div>
                      <button
                        className="hp-prot-close-btn"
                        onClick={async () => {
                          const prot = activeProtections[pos.id];
                          if (!prot) return;
                          
                          try {
                            await botFetch('/api/bot/unprotect', {
                              method: 'POST',
                              body: JSON.stringify({ poolAddress: pos.poolAddress, positionId: pos.id })
                            });
                            
                            setActiveProtections(prev => { const n = {...prev}; delete n[pos.id]; return n; });
                            setAutoGuardPools(prev => { const n = {...prev}; delete n[String(pos.id)]; return n; });
                          } catch (err) {
                            alert(`❌ Error al desactivar guardia: ${err.message}`);
                          }
                        }}
                      >
                        ❌ Detener Protección
                      </button>
                    </div>
                  ) : (
                    <div className="hp-add-protection" onClick={() => { setSelectedCobPosition(pos.id); setShowCoberturaModal(true); }}>
                      🛡️ + Añadir protección Bitunix
                    </div>
                  )}

                  {/* AUTO-GUARD: Monitoreo Automático */}
                  {(() => {
                    const posIdStr = String(pos.id);
                    const guard = autoGuardPools[posIdStr];
                    const isGuarding = guard?.active;
                    const triggerPrice = pos.priceMin ? (pos.priceMin * 1.02).toFixed(2) : '—';
                    return (
                      <div className={`hp-autoguard-panel ${isGuarding ? 'active' : ''}`}>
                        <div className="hp-autoguard-header">
                          <div className="hp-autoguard-title">
                            <span>🤖</span>
                            <span>Auto-Guard</span>
                            {isGuarding && !guard?.triggered && <span className="hp-guard-dot"></span>}
                            {isGuarding && !guard?.triggered && <span className="hp-guard-monitoring">VIGILANDO</span>}
                            {guard?.triggered && <span className="hp-guard-fired">¡DISPARADO!</span>}
                          </div>
                          <button
                            className={`hp-autoguard-toggle ${isGuarding ? 'on' : 'off'}`}
                            onClick={() => toggleAutoGuard(pos, cobLeverage, cobStopLoss)}
                          >
                            {isGuarding ? 'ON' : 'OFF'}
                          </button>
                        </div>
                        {isGuarding ? (
                          <div className="hp-autoguard-info">
                            <div className="hp-prot-detail-item">
                              <span>Disparar SHORT cuando precio</span>
                              <span style={{ color: '#fbbf24' }}>≤ {formatPrice(parseFloat(triggerPrice))}</span>
                            </div>
                            <div className="hp-prot-detail-item">
                              <span>Precio actual</span>
                              <span style={{ color: pos.priceCurrent <= parseFloat(triggerPrice) ? '#ef4444' : '#10b981' }}>
                                {formatPrice(pos.priceCurrent)}
                              </span>
                            </div>
                            <div className="hp-prot-detail-item">
                              <span>Activado a las</span>
                              <span>{guard.activatedAt}</span>
                            </div>
                            <div className="hp-prot-detail-item">
                              <span>Motor de vigilancia</span>
                              <span style={{ color: botStatus?.connectedToWSS ? '#10b981' : '#fbbf24', fontWeight: 600 }}>
                                {botStatus?.connectedToWSS
                                  ? '🟢 Bot activo (blockchain)'
                                  : '🟡 Solo navegador'}
                              </span>
                            </div>
                            {guard.triggered && (
                              <div style={{ marginTop: '8px', padding: '8px', background: 'rgba(251,191,36,0.1)', borderRadius: '6px', border: '1px solid rgba(251,191,36,0.3)', fontSize: '0.8rem', color: '#fbbf24' }}>
                                ⚡ SHORT ejecutado automáticamente a las {guard.triggeredAt}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="hp-autoguard-desc">
                            Activa para que el bot abra el SHORT automáticamente cuando el precio baje al borde inferior del rango (trigger: {formatPrice(parseFloat(triggerPrice))}).
                            {botStatus?.connectedToWSS
                              ? <span style={{ display:'block', marginTop:'6px', color:'#10b981', fontSize:'0.78rem' }}>✅ El bot está activo — funciona aunque cierres el navegador.</span>
                              : <span style={{ display:'block', marginTop:'6px', color:'#fbbf24', fontSize:'0.78rem' }}>⚠️ El bot no responde — la vigilancia solo funcionará mientras el navegador esté abierto.</span>
                            }
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* RESULTADO TOTAL */}
                  <div className="hp-section-title">RESULTADO TOTAL</div>
                  <div className="hp-stats-grid cols-4">
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">PNL TOTAL <span className="hp-tooltip">?</span></div>
                      <div className={`hp-stat-value ${pnlColor}`}>
                        ${pos.pnl !== null ? pos.pnl.toFixed(2) : '—'}
                      </div>
                      {pos.pnlPercent !== null && <div className="hp-stat-sub">({pos.pnlPercent.toFixed(2)}%)</div>}
                    </div>
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">INVERTIDO <span className="hp-tooltip">?</span></div>
                      <div className="hp-stat-value green">${pos.depositsValue?.toFixed(2)}</div>
                    </div>
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">TIEMPO DE VIDA <span className="hp-tooltip">?</span></div>
                      <div className="hp-stat-value blue">{pos.age || '—'}</div>
                    </div>
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">APR TOTAL <span className="hp-tooltip">?</span></div>
                      <div className={`hp-stat-value ${aprColor}`}>{pos.apr ? `${pos.apr.toFixed(1)}%` : '—'}</div>
                    </div>
                  </div>

                  {/* CAPITAL */}
                  <div className="hp-section-title">CAPITAL</div>
                  <div className="hp-stats-grid cols-2">
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">PNL CAPITAL <span className="hp-tooltip">?</span></div>
                      <div className={`hp-stat-value ${pnlCapColor}`}>
                        {pos.pnlCapital !== null ? `$${pos.pnlCapital.toFixed(2)}` : '—'}
                      </div>
                      {pos.pnlCapital !== null && pos.depositsValue > 0 && (
                        <div className="hp-stat-sub">({((pos.pnlCapital / pos.depositsValue) * 100).toFixed(2)}%)</div>
                      )}
                    </div>
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">APR CAPITAL <span className="hp-tooltip">?</span></div>
                      <div className={`hp-stat-value ${aprCapColor}`}>
                        {pos.aprCapital !== null ? `${pos.aprCapital.toFixed(1)}%` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* FEES GANADAS */}
                  <div className="hp-section-title">FEES GANADAS</div>
                  <div className="hp-stats-grid cols-3">
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">TOTAL FEES <span className="hp-tooltip">?</span></div>
                      <div className="hp-stat-value green">${pos.unclaimed?.toFixed(2)}</div>
                      <div className="hp-stat-sub">uncollected: ${((pos.uncollected0 * pos.price0) + (pos.uncollected1 * pos.price1)).toFixed(2)}</div>
                    </div>
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">% SOBRE CAPITAL <span className="hp-tooltip">?</span></div>
                      <div className="hp-stat-value green">{feePercent.toFixed(2)}%</div>
                    </div>
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">APR FEES <span className="hp-tooltip">?</span></div>
                      <div className="hp-stat-value green">{feeAprVal.toFixed(1)}%</div>
                    </div>
                  </div>

                  {/* PROYECCION FEES */}
                  <div className="hp-section-title">PROYECCION FEES</div>
                  <div className="hp-stats-grid cols-4">
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">DIARIO <span className="hp-tooltip">?</span></div>
                      <div className="hp-stat-value green">${dailyEarn.toFixed(2)}</div>
                      <div className="hp-stat-sub">({dailyPct.toFixed(2)}%)</div>
                    </div>
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">SEMANAL <span className="hp-tooltip">?</span></div>
                      <div className="hp-stat-value green">${weeklyEarn.toFixed(2)}</div>
                      <div className="hp-stat-sub">({weeklyPct.toFixed(2)}%)</div>
                    </div>
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">MENSUAL <span className="hp-tooltip">?</span></div>
                      <div className="hp-stat-value green">${monthlyEarn.toFixed(2)}</div>
                      <div className="hp-stat-sub">({monthlyPct.toFixed(2)}%)</div>
                    </div>
                    <div className="hp-stat-box">
                      <div className="hp-stat-label">ANUAL <span className="hp-tooltip">?</span></div>
                      <div className="hp-stat-value green">${yearlyEarn.toFixed(2)}</div>
                      <div className="hp-stat-sub">({yearlyPct.toFixed(2)}%)</div>
                    </div>
                  </div>

                  {/* INFO */}
                  <div className="hp-section-title">INFO</div>
                  <div className="hp-info-bar">
                    <span><span className="hp-info-label">Edad:</span> {pos.age || '—'}</span>
                    <span><span className="hp-info-label">NFT:</span> #{pos.id}</span>
                    <span><span className="hp-info-label">Chain:</span> {pos.chain || 'Arbitrum'}</span>
                    <span><span className="hp-info-label">DEX:</span> uniswap_v3</span>
                    <span><span className="hp-info-label">Fee Tier:</span> {pos.fee}%</span>
                  </div>

                  {/* ACTIONS */}
                  <div className="hp-actions">
                    <div className="hp-actions-left">
                      <a
                        className="hp-btn-link"
                        href={`https://app.uniswap.org/pools/${pos.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        🔗 Ver en Uniswap
                      </a>
                      <button className="hp-btn-close" onClick={() => setExpandedHaraganPool(null)}>Cerrar</button>
                    </div>
                    <button className="hp-btn-delete">🗑️ Eliminar pool</button>
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
