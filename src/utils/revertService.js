/**
 * Servicio para obtener datos profesionales de posiciones Uniswap V3
 * via la API de Revert Finance (datos históricos, PNL, APR, etc.)
 */

const REVERT_BASE_URL = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/revert-api/v1/positions` : (import.meta.env.DEV ? 'http://localhost:3002/revert-api/v1/positions' : '/revert-api/v1/positions');

const CHAIN_MAP = {
  arbitrum: 'arbitrum',
  ethereum: 'mainnet',
  polygon: 'polygon',
  optimism: 'optimism'
};

/**
 * Obtiene datos completos de una posición LP de Revert Finance
 * @param {string} chain - Chain name (arbitrum, ethereum, etc.)
 * @param {string|number} tokenId - NFT token ID de la posición
 * @returns {object|null} Datos enriquecidos de la posición
 */
export async function fetchRevertData(chain, tokenId) {
  const revertChain = CHAIN_MAP[chain] || 'arbitrum';
  const url = `${REVERT_BASE_URL}/${revertChain}/uniswapv3/${tokenId}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Revert API ${response.status}`);
    
    const json = await response.json();
    if (!json.success || !json.data) return null;
    
    const d = json.data;
    const perf = d.performance?.usd || {};
    
    return {
      // Métricas principales
      pnlTotal: parseFloat(perf.pnl) || 0,
      pnlTotalPercent: parseFloat(perf.roi) || 0,
      aprTotal: parseFloat(perf.apr) || 0,
      
      // Pool PNL (incluye IL)
      poolPnl: parseFloat(perf.pool_pnl) || 0,
      poolApr: parseFloat(perf.pool_apr) || 0,
      
      // Impermanent Loss
      il: parseFloat(perf.il) || 0,
      
      // Capital
      depositsValue: parseFloat(d.deposits_value) || 0,
      underlyingValue: parseFloat(d.underlying_value) || 0,
      withdrawalsValue: parseFloat(d.withdrawals_value) || 0,
      
      // PNL Capital (sin fees)
      pnlCapital: (parseFloat(d.underlying_value) || 0) - (parseFloat(d.deposits_value) || 0),
      aprCapital: (parseFloat(perf.apr) || 0) - (parseFloat(perf.fee_apr) || 0),
      
      // Fees
      totalFees: parseFloat(d.fees_value) || 0,
      feeApr: parseFloat(perf.fee_apr) || 0,
      uncollectedFees0: parseFloat(d.uncollected_fees0) || 0,
      uncollectedFees1: parseFloat(d.uncollected_fees1) || 0,
      collectedFees0: parseFloat(d.collected_fees0) || 0,
      collectedFees1: parseFloat(d.collected_fees1) || 0,
      
      // Edad
      ageDays: parseFloat(d.age) || 0,
      firstMintTs: d.first_mint_ts,
      
      // Entry price (promedio ponderado de deposits)
      entryPrice: d.cash_flows?.filter(cf => cf.type === 'deposits').reduce((acc, cf) => {
        return cf.price || acc;
      }, 0) || 0,
      
      // Precios actuales de los tokens
      token0Price: parseFloat(d.tokens?.[d.token0]?.price) || 0,
      token1Price: parseFloat(d.tokens?.[d.token1]?.price) || 0,
      
      // Pool info
      poolAddress: d.pool,
      poolPrice: parseFloat(d.pool_price) || 0,
      priceUpper: parseFloat(d.price_upper) || 0,
      priceLower: parseFloat(d.price_lower) || 0,
      
      // Deltas 24h
      pnl24h: parseFloat(d.deltas_24h?.usd?.pnl) || 0,
      apr24h: parseFloat(d.deltas_24h?.usd?.apr) || 0,
      feeApr24h: parseFloat(d.deltas_24h?.usd?.fee_apr) || 0,
      
      // Estado
      inRange: d.in_range,
      hasWithdrawn: d.has_withdrawn,
      exited: d.exited,
      
      // Datos completos por si se necesitan
      _raw: d
    };
  } catch (err) {
    console.warn(`Revert API error for position ${tokenId}:`, err.message);
    return null;
  }
}

/**
 * Obtiene datos de Revert para múltiples posiciones en paralelo
 * @param {string} chain - Chain name
 * @param {Array} tokenIds - Array de token IDs
 * @returns {Map} Map de tokenId -> datos de Revert
 */
export async function fetchRevertDataBatch(chain, tokenIds) {
  const results = new Map();
  
  // Fetch en paralelo (máx 5 concurrent para no saturar)
  const batchSize = 5;
  for (let i = 0; i < tokenIds.length; i += batchSize) {
    const batch = tokenIds.slice(i, i + batchSize);
    const promises = batch.map(async (id) => {
      const data = await fetchRevertData(chain, id);
      if (data) results.set(String(id), data);
    });
    await Promise.all(promises);
  }
  
  return results;
}
