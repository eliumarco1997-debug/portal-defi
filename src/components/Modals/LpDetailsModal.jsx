import React from 'react';
import { useAppContext } from '../../context/AppContext';

export default function LpDetailsModal() {
  const { selectedLpDetails, setSelectedLpDetails, formatPrice } = useAppContext();

  if (!selectedLpDetails) return null;

  const pos = selectedLpDetails;
  const rangePercent = Math.min(100, Math.max(0, ((pos.rawTick - pos.rawTickLower) / (pos.rawTickUpper - pos.rawTickLower)) * 100));
  const hasPnl = pos.pnl !== null && pos.pnl !== undefined;
  const isGreen = hasPnl ? pos.pnl >= 0 : true;

  return (
    <div className="modal-overlay" onClick={() => setSelectedLpDetails(null)}>
      <div className="modal-content lp-details-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <button className="modal-close" onClick={() => setSelectedLpDetails(null)}>✕</button>
        <div style={{ marginBottom: '24px' }}>
          <div className="lp-pair-title" style={{ fontSize: '1.4rem' }}>
            {pos.token0.symbol}/{pos.token1.symbol}
            <span className="lp-fee-badge" style={{ verticalAlign: 'middle', marginLeft: '12px' }}>{pos.fee}%</span>
          </div>
          <div className="lp-id-text" style={{ fontSize: '1rem', marginTop: '4px' }}>
            Position #{pos.id} • {pos.chain}
          </div>
        </div>

        <div className="hp-range-container" style={{ background: '#12141a', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
          <div className="hp-range-min-max">
            <span>MIN {formatPrice(pos.priceMin)}</span>
            <span>MAX {formatPrice(pos.priceMax)}</span>
          </div>
          <div className="hp-range-bar" style={{ height: '12px', margin: '16px 0' }}>
            <div className="hp-range-bar-bg" style={{ background: '#1a1d29' }}></div>
            <div className="hp-range-bar-fill" style={{
              left: '0%', right: '0%',
              background: pos.inRange ? 'linear-gradient(90deg, #10b981, #e6c875)' : 'linear-gradient(90deg, #ef4444, #f59e0b)'
            }}></div>
            <div className="hp-range-indicator" style={{ left: `${rangePercent}%`, height: '24px', width: '4px' }}>
              <div className="hp-range-price-label" style={{ top: '-24px' }}>{formatPrice(pos.priceCurrent)}</div>
            </div>
          </div>
        </div>

        <div className="hp-stats-grid cols-2" style={{ gap: '16px' }}>
          <div className="hp-stat-box" style={{ background: '#12141a' }}>
            <div className="hp-stat-label">VALOR TOTAL</div>
            <div className="hp-stat-value" style={{ color: '#fff' }}>${pos.totalUsd ? pos.totalUsd.toFixed(2) : '0.00'}</div>
          </div>
          <div className="hp-stat-box" style={{ background: '#12141a' }}>
            <div className="hp-stat-label">PNL</div>
            <div className={`hp-stat-value ${isGreen ? 'green' : 'red'}`}>
              {hasPnl ? `${isGreen ? '+' : '-'}$${Math.abs(pos.pnl).toFixed(2)}` : '—'}
            </div>
          </div>
          <div className="hp-stat-box" style={{ background: '#12141a' }}>
            <div className="hp-stat-label">FEES SIN RECLAMAR</div>
            <div className="hp-stat-value green">${pos.unclaimed ? pos.unclaimed.toFixed(2) : '0.00'}</div>
          </div>
          <div className="hp-stat-box" style={{ background: '#12141a' }}>
            <div className="hp-stat-label">APR</div>
            <div className="hp-stat-value green">{pos.apr ? `${pos.apr.toFixed(2)}%` : '—'}</div>
          </div>
        </div>

        <div style={{ marginTop: '24px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <a
            className="btn-dark-outline"
            href={`https://app.uniswap.org/pools/${pos.id}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', textAlign: 'center', padding: '10px 16px' }}
          >
            🔗 Ver en Uniswap
          </a>
        </div>
      </div>
    </div>
  );
}
