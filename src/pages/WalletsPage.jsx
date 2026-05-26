import React from 'react';
import { useAppContext } from '../context/AppContext';

export default function WalletsPage() {
  const {
    poolCount, walletBalanceUSD, lpPositions,
    lpSearchTerm, setLpSearchTerm,
    lpStatusFilter, setLpStatusFilter,
    lpChainFilter, setLpChainFilter,
    lpSourceFilter, setLpSourceFilter,
    lpSortOrder, setLpSortOrder,
    lpViewMode, setLpViewMode,
    hiddenPositions, setHiddenPositions,
    showHidden, setShowHidden,
    activeWalletName, walletAddress,
    scanPositions, setShowCoberturaModal,
    setShowAddWalletModal, setSelectedLpDetails,
    formatPrice
  } = useAppContext();

  const toggleHide = (id) => setHiddenPositions(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const filteredPositions = React.useMemo(() => {
    let filtered = lpPositions.filter(p => showHidden ? hiddenPositions.includes(p.id) : !hiddenPositions.includes(p.id));

    if (lpSearchTerm) {
      const t = lpSearchTerm.toLowerCase();
      filtered = filtered.filter(p => p.token0.symbol.toLowerCase().includes(t) || p.token1.symbol.toLowerCase().includes(t) || p.id.includes(t));
    }
    if (lpStatusFilter !== 'all') filtered = filtered.filter(p => lpStatusFilter === 'inRange' ? p.inRange : !p.inRange);
    if (lpChainFilter !== 'all') filtered = filtered.filter(p => p.chain === lpChainFilter);
    if (lpSourceFilter !== 'all') filtered = filtered.filter(p => p.source === lpSourceFilter);

    if (lpSortOrder === 'value') filtered.sort((a, b) => b.totalUsd - a.totalUsd);
    else filtered.sort((a, b) => parseInt(b.id) - parseInt(a.id));

    return filtered;
  }, [lpPositions, lpSearchTerm, lpStatusFilter, lpChainFilter, lpSourceFilter, lpSortOrder, showHidden, hiddenPositions]);

  return (
    <div className="page-container">
      <div className="metrics-row">
        <div className="metric-card-small"><div>📊 Total Positions</div><div className="metric-value">{poolCount || 0}</div></div>
        <div className="metric-card-small"><div>✅ In Range</div><div className="metric-value" style={{ color: '#4ade80' }}>{lpPositions.filter(p => p.inRange).length}</div></div>
        <div className="metric-card-small"><div>⚠️ Out of Range</div><div className="metric-value" style={{ color: '#fbbf24' }}>{lpPositions.filter(p => !p.inRange).length}</div></div>
        <div className="metric-card-small"><div>💰 Total Value</div><div className="metric-value">{walletBalanceUSD || '$0.00'}</div></div>
      </div>

      <div className="filters-bar">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="filters-search"
            placeholder="Buscar por token, pool o ID..."
            value={lpSearchTerm}
            onChange={(e) => setLpSearchTerm(e.target.value)}
          />
        </div>

        <div className="filters-dropdowns">
          <select className="filter-select-v2" value={lpStatusFilter} onChange={(e) => setLpStatusFilter(e.target.value)}>
            <option value="all">Todos los estados</option>
            <option value="inRange">En Rango</option>
            <option value="outOfRange">Fuera de Rango</option>
          </select>

          <select className="filter-select-v2" value={lpChainFilter} onChange={(e) => setLpChainFilter(e.target.value)}>
            <option value="all">Todas las redes</option>
            <option value="arbitrum">Arbitrum</option>
            <option value="ethereum">Ethereum</option>
            <option value="polygon">Polygon</option>
          </select>

          <select className="filter-select-v2" value={lpSourceFilter} onChange={(e) => setLpSourceFilter(e.target.value)}>
            <option value="all">Todos los orígenes</option>
            <option value="Uniswap V3">Uniswap V3</option>
            <option value="Bitunix">Bitunix</option>
          </select>

          <select className="filter-select-v2" value={lpSortOrder} onChange={(e) => setLpSortOrder(e.target.value)}>
            <option value="recent">Más recientes</option>
            <option value="value">Mayor valor</option>
          </select>

          <button className={`filter-btn-v2 ${showHidden ? 'active' : ''}`} onClick={() => setShowHidden(!showHidden)}>
            <span style={{ marginRight: '6px' }}>{showHidden ? '👁️' : '👁️‍🗨️'}</span> Hidden
          </button>

          <div style={{ flex: 1 }}></div>

          <button className="btn-scan" style={{ padding: '8px 16px', fontSize: '0.85rem', marginRight: '12px' }} onClick={() => setShowCoberturaModal(true)}>
            + Crear Nueva Cobertura
          </button>

          <div className="view-toggle-v2">
            <button className={`view-btn-v2 ${lpViewMode === 'grid' ? 'active' : ''}`} onClick={() => setLpViewMode('grid')}>⊞</button>
            <button className={`view-btn-v2 ${lpViewMode === 'list' ? 'active' : ''}`} onClick={() => setLpViewMode('list')}>≡</button>
          </div>
        </div>
      </div>

      <div className="wallet-banner">
        <div className="wallet-banner-left">
          <div className="wallet-icon-box">💼</div>
          <div>
            <div className="wallet-banner-name">{activeWalletName || 'Mis Wallets'}</div>
            <div className="wallet-banner-address">{walletAddress ? `${walletAddress.substring(0, 6)}...${walletAddress.slice(-4)}` : 'No conectada'}</div>
          </div>
        </div>
        <div className="wallet-banner-right">
          <div className="wallet-banner-value">{walletBalanceUSD || '$0.00'}</div>
          <button className="refresh-btn-v2" onClick={() => scanPositions()}>↺</button>
        </div>
      </div>

      <div className={lpViewMode === 'grid' ? 'lp-grid-container' : 'lp-list-container'}>
        {lpViewMode === 'grid' ? (
          filteredPositions.map(pos => (
            <div className="lp-card" key={pos.id} onClick={() => setSelectedLpDetails(pos)}>
              <div className="lp-card-header">
                <div>
                  <div className="lp-pair-title">{pos.token0.symbol}/{pos.token1.symbol} <span className="lp-fee-badge">{pos.fee}%</span></div>
                  <div className="lp-id-text">#{pos.id} • {pos.chain}</div>
                </div>
                <div className="lp-status-box">
                  <div className="badge-cubierta">{pos.inRange ? '✅ En Rango' : '⚠️ Fuera'}</div>
                  <span style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); toggleHide(pos.id); }}>{hiddenPositions.includes(pos.id) ? '👁️' : '👁️‍🗨️'}</span>
                </div>
              </div>
              <div className="lp-mid-section">
                <div><div className="lp-value-label">Valor</div><div className="lp-value-big">${pos.totalUsd.toFixed(2)}</div></div>
                <div><div className="lp-price-label">Precio</div><div className="lp-price-big">{pos.priceCurrent.toFixed(2)}</div></div>
              </div>
              <div className="lp-progress-container">
                <div className="lp-progress-fill" style={{ width: `${Math.min(100, Math.max(0, ((pos.rawTick - pos.rawTickLower) / (pos.rawTickUpper - pos.rawTickLower)) * 100))}%` }}></div>
              </div>
            </div>
          ))
        ) : (
          <div style={{ width: '100%', overflowX: 'auto' }}>
            <table className="lp-list-table">
              <thead>
                <tr>
                  <th>Pool Name</th>
                  <th>Liquidity ↕</th>
                  <th>Profit & Loss ↕</th>
                  <th>Unclaimed Rewards</th>
                  <th>24h Earning ↕</th>
                  <th>APR ↕</th>
                  <th>Price Range</th>
                  <th>Age ↕</th>
                </tr>
              </thead>
              <tbody>
                {filteredPositions.map(pos => {
                  const hasPnl = pos.pnl !== null && pos.pnl !== undefined;
                  const isGreen = hasPnl ? pos.pnl >= 0 : true;
                  const pnlDisplay = hasPnl ? `${pos.pnl >= 0 ? '' : '-'}$${Math.abs(pos.pnl).toFixed(0)}` : '—';
                  const rangePercent = Math.min(100, Math.max(0, ((pos.rawTick - pos.rawTickLower) / (pos.rawTickUpper - pos.rawTickLower)) * 100));

                  return (
                    <tr className="lp-list-row" key={pos.id} onClick={() => setSelectedLpDetails(pos)}>
                      <td className="lp-list-cell">
                        <div className="lp-list-pool-name">
                          <div className="lp-list-icons">
                            <div className="lp-list-icon1">{pos.token0.symbol[0]}</div>
                            <div className="lp-list-icon2" style={{ background: pos.token1.symbol === 'USDT' ? '#10b981' : '#3b82f6' }}>{pos.token1.symbol[0]}</div>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <span className="lp-list-pair">{pos.token0.symbol}/{pos.token1.symbol}</span>
                              <span className="lp-list-fee">{pos.fee}%</span>
                              <span className="lp-list-v3">v3</span>
                            </div>
                            <div className="lp-list-sub">
                              <span style={{ color: pos.inRange ? '#10b981' : '#ef4444' }}>●</span> Position #{pos.id} 🧩
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="lp-list-cell lp-list-liquidity">${pos.totalUsd ? pos.totalUsd.toFixed(0) : '0'}</td>
                      <td className={`lp-list-cell ${isGreen ? 'lp-list-pnl-green' : 'lp-list-pnl-red'}`}>{pnlDisplay}</td>
                      <td className="lp-list-cell" style={{ color: '#10b981', fontWeight: 500 }}>${pos.unclaimed ? pos.unclaimed.toFixed(2) : '0.00'}</td>
                      <td className="lp-list-cell" style={{ color: '#10b981', fontWeight: 500 }}>${pos.earn24h ? pos.earn24h.toFixed(2) : '0'}</td>
                      <td className="lp-list-cell lp-list-apr">{pos.apr ? pos.apr.toFixed(2) : '0'}%</td>
                      <td className="lp-list-cell">
                        <div className="lp-list-range-wrapper">
                          <div className="lp-list-range-labels">
                            <span>{formatPrice(pos.priceMin)}</span>
                            <span>{formatPrice(pos.priceMax)}</span>
                          </div>
                          <div className="lp-list-range-bar-bg">
                            {pos.inRange ? (
                              <div className="lp-list-range-bar-fill" style={{ left: '10%', right: '10%', background: '#10b981' }}></div>
                            ) : (
                              <div className="lp-list-range-bar-fill" style={{ left: '10%', right: '10%', background: '#ef4444' }}></div>
                            )}
                            <div className="lp-list-range-indicator" style={{ left: `${rangePercent}%` }}></div>
                          </div>
                          <div className="lp-list-range-percents">
                            <span>{pos.priceCurrent && pos.priceMin ? ((pos.priceMin / pos.priceCurrent - 1) * 100).toFixed(2) : '0.00'}%</span>
                            <span>+{pos.priceCurrent && pos.priceMax ? ((pos.priceMax / pos.priceCurrent - 1) * 100).toFixed(2) : '0.00'}%</span>
                          </div>
                        </div>
                      </td>
                      <td className="lp-list-cell">{pos.age || 'about 1 month'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <button className="btn-yellow" style={{ marginTop: '20px' }} onClick={() => setShowAddWalletModal(true)}>+ Añadir Wallet</button>
    </div>
  );
}
