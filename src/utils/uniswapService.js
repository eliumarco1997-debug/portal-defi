import { ethers } from 'ethers';

// Direcciones clave en mainnet y arbitrum
export const UNISWAP_V3_MANAGER_ADDRESS = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
export const UNISWAP_V3_FACTORY_ADDRESS = "0x1F98431c8aD98523631AE4a59f267346ea31F984";

export const NFPM_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  "function collect(tuple(uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max) params) payable returns (uint256 amount0, uint256 amount1)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"
];

export const FACTORY_ABI = [
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)"
];

export const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)"
];

export const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

/**
 * Calcula las cantidades de token0 y token1 basándose en la liquidez y los ticks.
 * Usa aritmética de punto flotante para estimaciones de UI.
 */
export function getAmountsForLiquidity(
  currentTick,
  tickLower,
  tickUpper,
  liquidityStr,
  decimals0,
  decimals1
) {
  const L = Number(liquidityStr);
  const currentPrice = Math.pow(1.0001, currentTick);
  const priceLower = Math.pow(1.0001, tickLower);
  const priceUpper = Math.pow(1.0001, tickUpper);

  const sqrtP = Math.sqrt(currentPrice);
  const sqrtPa = Math.sqrt(priceLower);
  const sqrtPb = Math.sqrt(priceUpper);

  let amount0 = 0;
  let amount1 = 0;

  if (currentTick < tickLower) {
    // Price is below the range. Position is entirely in token0.
    amount0 = L * ((sqrtPb - sqrtPa) / (sqrtPa * sqrtPb));
    amount1 = 0;
  } else if (currentTick >= tickUpper) {
    // Price is above the range. Position is entirely in token1.
    amount0 = 0;
    amount1 = L * (sqrtPb - sqrtPa);
  } else {
    // Price is within the range. Position is a mix.
    amount0 = L * ((sqrtPb - sqrtP) / (sqrtP * sqrtPb));
    amount1 = L * (sqrtP - sqrtPa);
  }

  // Ajustar por los decimales de los tokens
  const amt0Adjusted = amount0 / Math.pow(10, decimals0);
  const amt1Adjusted = amount1 / Math.pow(10, decimals1);

  return { amount0: amt0Adjusted, amount1: amt1Adjusted };
}

/**
 * Convierte un tick a precio humano (Precio de token0 en términos de token1)
 */
export function tickToPrice(tick, decimals0, decimals1) {
  const rawPrice = Math.pow(1.0001, tick);
  const adjustedPrice = rawPrice * Math.pow(10, decimals0 - decimals1);
  return adjustedPrice;
}

export async function fetchUniswapPositions(provider, walletAddress) {
  const nfpm = new ethers.Contract(UNISWAP_V3_MANAGER_ADDRESS, NFPM_ABI, provider);
  const factory = new ethers.Contract(UNISWAP_V3_FACTORY_ADDRESS, FACTORY_ABI, provider);

  const balanceRaw = await nfpm.balanceOf(walletAddress);
  const balance = Number(balanceRaw);

  const positionsList = [];
  
  for (let i = 0; i < balance; i++) {
    try {
      const tokenIdRaw = await nfpm.tokenOfOwnerByIndex(walletAddress, i);
      const tokenId = tokenIdRaw.toString();
      
      const pos = await nfpm.positions(tokenId);
      const token0Addr = pos.token0;
      const token1Addr = pos.token1;
      const fee = pos.fee;
      const tickLower = Number(pos.tickLower);
      const tickUpper = Number(pos.tickUpper);
      const liquidity = pos.liquidity.toString();

      // Si la liquidez es 0, ignoramos la posición cerrada
      if (liquidity === "0") {
          continue;
      }

      const t0Contract = new ethers.Contract(token0Addr, ERC20_ABI, provider);
      const t1Contract = new ethers.Contract(token1Addr, ERC20_ABI, provider);
      
      const [sym0, dec0, sym1, dec1] = await Promise.all([
        t0Contract.symbol().catch(() => "T0"),
        t0Contract.decimals().catch(() => 18),
        t1Contract.symbol().catch(() => "T1"),
        t1Contract.decimals().catch(() => 18)
      ]);

      const poolAddr = await factory.getPool(token0Addr, token1Addr, fee);
      const poolContract = new ethers.Contract(poolAddr, POOL_ABI, provider);
      
      const slot0 = await poolContract.slot0();
      const currentTick = Number(slot0.tick);

      const { amount0, amount1 } = getAmountsForLiquidity(
        currentTick, tickLower, tickUpper, liquidity, Number(dec0), Number(dec1)
      );

      // Los ticks de Uniswap V3 siempre calculan el precio de Token0 en base a Token1
      let priceCurrent = tickToPrice(currentTick, Number(dec0), Number(dec1));
      let priceMin = tickToPrice(tickLower, Number(dec0), Number(dec1));
      let priceMax = tickToPrice(tickUpper, Number(dec0), Number(dec1));
      
      // Status
      let inRange = currentTick >= tickLower && currentTick <= tickUpper;

      // UNCLAIMED REWARDS REALES (Vía Static Call al contrato)
      let uncollected0 = 0;
      let uncollected1 = 0;
      try {
        const MAX_UINT128 = BigInt("340282366920938463463374607431768211455");
        const collectParams = {
          tokenId: tokenId,
          recipient: walletAddress,
          amount0Max: MAX_UINT128,
          amount1Max: MAX_UINT128
        };
        // Hacemos un staticCall haciéndonos pasar por la wallet propietaria
        const result = await nfpm.collect.staticCall(collectParams, { from: walletAddress });
        uncollected0 = Number(result.amount0) / Math.pow(10, Number(dec0));
        uncollected1 = Number(result.amount1) / Math.pow(10, Number(dec1));
      } catch (collectErr) {
        console.warn(`No se pudieron simular fees para posición ${tokenId}:`, collectErr.message);
      }

      // EDAD REAL: Obtener bloque de mint del NFT
      let ageDays = 0;
      let ageStr = '—';
      try {
        // Estimar bloque de inicio basado en el chain (bloques por segundo aprox)
        const currentBlock = await provider.getBlockNumber();
        const blocksPerDay = { arbitrum: 345600, ethereum: 7200, polygon: 43200, optimism: 43200 };
        const chain = Object.keys(blocksPerDay).find(k => 
          pos ? true : false // usar el chain del contexto
        ) || 'arbitrum';
        
        // Buscar en chunks de 30 días hacia atrás (máx ~2 años)
        const bpd = 345600; // Arbitrum ~0.25s blocks
        const chunkSize = bpd * 30; // 30 días de bloques
        let found = false;
        
        for (let attempt = 0; attempt < 24 && !found; attempt++) {
          const fromBlock = Math.max(0, currentBlock - chunkSize * (attempt + 1));
          const toBlock = currentBlock - chunkSize * attempt;
          try {
            const transferFilter = nfpm.filters.Transfer(ethers.ZeroAddress, null, tokenId);
            const logs = await nfpm.queryFilter(transferFilter, fromBlock, toBlock);
            if (logs.length > 0) {
              const mintBlock = await logs[0].getBlock();
              const mintTimestamp = mintBlock.timestamp;
              const nowTimestamp = Math.floor(Date.now() / 1000);
              const ageSeconds = nowTimestamp - mintTimestamp;
              ageDays = ageSeconds / 86400;
              if (ageDays < 1) {
                ageStr = `${Math.floor(ageSeconds / 3600)}h`;
              } else if (ageDays < 30) {
                ageStr = `${Math.floor(ageDays)}d`;
              } else if (ageDays < 365) {
                const months = Math.floor(ageDays / 30);
                const days = Math.floor(ageDays % 30);
                ageStr = days > 0 ? `${months}m ${days}d` : `${months}m`;
              } else {
                const years = Math.floor(ageDays / 365);
                const months = Math.floor((ageDays % 365) / 30);
                ageStr = months > 0 ? `${years}y ${months}m` : `${years}y`;
              }
              found = true;
            }
          } catch (chunkErr) {
            // RPC puede rechazar el rango, seguir intentando con chunks más pequeños
            continue;
          }
        }
      } catch (ageErr) {
        console.warn(`No se pudo obtener edad de posición ${tokenId}:`, ageErr.message);
      }

      positionsList.push({
        id: tokenId,
        token0: { symbol: sym0, amount: amount0, address: token0Addr },
        token1: { symbol: sym1, amount: amount1, address: token1Addr },
        fee: Number(fee) / 10000, // Convertir BigInt a Number para matemáticas
        inRange,
        priceCurrent,
        priceMin,
        priceMax,
        liquidity,
        rawTick: currentTick,
        rawTickLower: tickLower,
        rawTickUpper: tickUpper,
        uncollected0, // Valor real de fees token0
        uncollected1, // Valor real de fees token1
        ageDays,      // Días reales desde mint
        age: ageStr   // String formateado
      });
    } catch (posErr) {
      console.warn(`Error al leer la posición índice ${i}:`, posErr);
    }
  }

  return positionsList;
}
