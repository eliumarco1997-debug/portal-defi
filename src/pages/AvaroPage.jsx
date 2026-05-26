import React, { useMemo } from 'react';
import { useAppContext } from '../context/AppContext';

export default function AvaroPage() {
  const { lpPositions, formatPrice } = useAppContext();

  // Filtrar solo posiciones con fees recolectables
  const poolsWithFees = useMemo(() => {
    return lpPositions.filter(p => p.unclaimed && p.unclaimed > 0).sort((a, b) => b.unclaimed - a.unclaimed);
  }, [lpPositions]);

  const totalUnclaimed = poolsWithFees.reduce((acc, p) => acc + p.unclaimed, 0);

  return (
    <div className="haragan-container">
      <h2 className="haragan-title">📈 El Avaro — Auto-Compounder</h2>
      <p className="haragan-subtitle">Recolección automática de fees y re-inversión (compounding) para maximizar el APR compuesto de tus piscinas de liquidez.</p>

      <div className="metrics-row" style={{ marginTop: '20px', marginBottom: '24px' }}>
        <div className="metric-card-small" style={{ background: 'rgba(16, 185, 129, 0.1)', borderColor: '#10b981' }}>
          <div style={{ color: '#10b981' }}>💰 Fees sin reclamar</div>
          <div className="metric-value" style={{ color: '#10b981' }}>${totalUnclaimed.toFixed(2)}</div>
        </div>
        <div className="metric-card-small">
          <div>🔄 LPs Elegibles</div>
          <div className="metric-value">{poolsWithFees.length}</div>
        </div>
        <div className="metric-card-small">
          <div>⛽ Costo Estimado Gas</div>
          <div className="metric-value" style={{ color: '#fbbf24' }}>~$0.85</div>
        </div>
      </div>

      {poolsWithFees.length === 0 ? (
        <div className="hp-empty">
          <div className="hp-empty-icon">🏜️</div>
          <div className="hp-empty-text">No hay fees disponibles para compound</div>
          <div className="hp-empty-sub">Tus LPs no han generado fees suficientes o necesitas escanear tus wallets.</div>
        </div>
      ) : (
        <div style={{ background: '#12141a', borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ padding: '20px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Piscinas con Recompensas</h3>
            <button className="btn-yellow" style={{ padding: '8px 16px', fontSize: '0.9rem' }}>
              ⚡ Ejecutar Compound Manual
            </button>
          </div>
          <table className="lp-list-table">
            <thead>
              <tr>
                <th>Pool</th>
                <th>Red</th>
                <th>Fees (USD)</th>
                <th>Earning Diario</th>
                <th>Acción Bot</th>
              </tr>
            </thead>
            <tbody>
              {poolsWithFees.map(pos => (
                <tr className="lp-list-row" key={pos.id}>
                  <td className="lp-list-cell">
                    <div className="lp-list-pool-name">
                      <div className="lp-list-icons">
                        <div className="lp-list-icon1">{pos.token0.symbol[0]}</div>
                        <div className="lp-list-icon2">{pos.token1.symbol[0]}</div>
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span className="lp-list-pair">{pos.token0.symbol}/{pos.token1.symbol}</span>
                          <span className="lp-list-fee">{pos.fee}%</span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="lp-list-cell">{pos.chain}</td>
                  <td className="lp-list-cell" style={{ color: '#10b981', fontWeight: 600 }}>${pos.unclaimed.toFixed(2)}</td>
                  <td className="lp-list-cell">${pos.earn24h ? pos.earn24h.toFixed(2) : '0.00'}/día</td>
                  <td className="lp-list-cell">
                    {pos.unclaimed > 50 ? (
                      <span style={{ color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>Listo para Re-Invertir</span>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Acumulando...</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
