import React, { createContext, useState, useEffect, useRef, useMemo, useContext } from 'react';
import { ethers } from 'ethers';
import { fetchUniswapPositions } from '../utils/uniswapService';
import { fetchRevertDataBatch } from '../utils/revertService';
import { toBitunixSymbol } from '../utils/bitunixBot';
import { useAuth } from './AuthContext';
import { supabase, botFetch } from '../utils/supabaseClient';

export const AppContext = createContext();

export const useAppContext = () => useContext(AppContext);

export const AppProvider = ({ children }) => {
  const { session } = useAuth();
  const userId = session?.user?.id;
  const [isSettingsLoaded, setIsSettingsLoaded] = useState(false);

  // Navigation State
  const [activeTab, setActiveTab] = useState(() => localStorage.getItem('activeTab') || 'wallets');
  
  // Wallet & Chain State
  const [walletAddress, setWalletAddress] = useState(() => localStorage.getItem('walletAddress') || '');
  const [selectedChain, setSelectedChain] = useState(() => localStorage.getItem('selectedChain') || 'arbitrum');
  const [activeWalletName, setActiveWalletName] = useState(() => localStorage.getItem('activeWalletName') || '');
  
  // API Keys
  const [newWalletApiKey, setNewWalletApiKey] = useState(() => localStorage.getItem('newWalletApiKey') || '');
  const [newWalletApiSecret, setNewWalletApiSecret] = useState(() => localStorage.getItem('newWalletApiSecret') || '');

  // Data State
  const [poolCount, setPoolCount] = useState(null);
  const [walletBalanceUSD, setWalletBalanceUSD] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [lpPositions, setLpPositions] = useState([]);

  // Filter States
  const [lpSearchTerm, setLpSearchTerm] = useState('');
  const [lpStatusFilter, setLpStatusFilter] = useState('all');
  const [lpChainFilter, setLpChainFilter] = useState('all');
  const [lpSourceFilter, setLpSourceFilter] = useState('all');
  const [lpSortOrder, setLpSortOrder] = useState('recent');
  const [lpViewMode, setLpViewMode] = useState('grid');
  const [hiddenPositions, setHiddenPositions] = useState([]);
  const [showHidden, setShowHidden] = useState(false);

  // Bot & Protection State
  const [botMessage, setBotMessage] = useState('');
  const [isBotLoading, setIsBotLoading] = useState(false);
  const [cobLeverage, setCobLeverage] = useState(10);
  const [cobStopLoss, setCobStopLoss] = useState(0.5);
  const [cobOrderType, setCobOrderType] = useState('LIMIT');
  const [botStatus, setBotStatus] = useState(null);
  
  const [activeProtections, setActiveProtections] = useState(() => {
    const saved = localStorage.getItem('activeProtections');
    return saved ? JSON.parse(saved) : {};
  });
  
  const [autoGuardPools, setAutoGuardPools] = useState(() => {
    const saved = localStorage.getItem('autoGuardPools');
    return saved ? JSON.parse(saved) : {};
  });

  // Modal States
  const [showScannerModal, setShowScannerModal] = useState(false);
  const [showAddWalletModal, setShowAddWalletModal] = useState(false);
  const [showCoberturaModal, setShowCoberturaModal] = useState(false);
  const [selectedCobPosition, setSelectedCobPosition] = useState(null);
  const [selectedLpDetails, setSelectedLpDetails] = useState(null);

  // Load from Supabase on Login
  useEffect(() => {
    if (!userId) {
      setIsSettingsLoaded(true);
      return;
    }

    const loadSettings = async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('id', userId)
        .single();

      if (data) {
        if (data.wallet_address) setWalletAddress(data.wallet_address);
        if (data.selected_chain) setSelectedChain(data.selected_chain);
        if (data.active_wallet_name) setActiveWalletName(data.active_wallet_name);
        if (data.bitunix_api_key) setNewWalletApiKey(data.bitunix_api_key);
        if (data.bitunix_api_secret) setNewWalletApiSecret(data.bitunix_api_secret);
        if (data.active_protections) setActiveProtections(data.active_protections);
        if (data.auto_guard_pools) setAutoGuardPools(data.auto_guard_pools);
        if (data.cob_order_type) setCobOrderType(data.cob_order_type);
      } else {
        // No existe fila aún — migrar localStorage a la nube
        const localSettings = {
          id: userId,
          wallet_address: localStorage.getItem('walletAddress') || null,
          selected_chain: localStorage.getItem('selectedChain') || null,
          active_wallet_name: localStorage.getItem('activeWalletName') || null,
          bitunix_api_key: localStorage.getItem('newWalletApiKey') || null,
          bitunix_api_secret: localStorage.getItem('newWalletApiSecret') || null,
          active_protections: JSON.parse(localStorage.getItem('activeProtections') || '{}'),
          auto_guard_pools: JSON.parse(localStorage.getItem('autoGuardPools') || '{}'),
          cob_order_type: localStorage.getItem('cobOrderType') || 'LIMIT',
        };
        await supabase.from('user_settings').upsert(localSettings);
        // Cargar en estado los datos del localStorage que migramos
        if (localSettings.wallet_address) setWalletAddress(localSettings.wallet_address);
        if (localSettings.selected_chain) setSelectedChain(localSettings.selected_chain);
        if (localSettings.active_wallet_name) setActiveWalletName(localSettings.active_wallet_name);
        if (localSettings.bitunix_api_key) setNewWalletApiKey(localSettings.bitunix_api_key);
        if (localSettings.bitunix_api_secret) setNewWalletApiSecret(localSettings.bitunix_api_secret);
        if (localSettings.active_protections) setActiveProtections(localSettings.active_protections);
        if (localSettings.auto_guard_pools) setAutoGuardPools(localSettings.auto_guard_pools);
        if (localSettings.cob_order_type) setCobOrderType(localSettings.cob_order_type);
      }
      setIsSettingsLoaded(true);
    };

    loadSettings();
  }, [userId]);

  // Persist State to LocalStorage and Supabase
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
    localStorage.setItem('walletAddress', walletAddress);
    localStorage.setItem('selectedChain', selectedChain);
    localStorage.setItem('activeWalletName', activeWalletName);
    localStorage.setItem('newWalletApiKey', newWalletApiKey);
    localStorage.setItem('newWalletApiSecret', newWalletApiSecret);
    localStorage.setItem('activeProtections', JSON.stringify(activeProtections));
    localStorage.setItem('autoGuardPools', JSON.stringify(autoGuardPools));
    localStorage.setItem('cobOrderType', cobOrderType);

    if (userId && isSettingsLoaded) {
      const saveSettings = setTimeout(async () => {
        // upsert: crea la fila si no existe, la actualiza si sí existe
        await supabase.from('user_settings').upsert({
          id: userId,
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
      }, 500);

      return () => clearTimeout(saveSettings);
    }
  }, [userId, isSettingsLoaded, activeTab, walletAddress, selectedChain, activeWalletName, newWalletApiKey, newWalletApiSecret, activeProtections, autoGuardPools, cobOrderType]);

  // Format Helpers
  const formatPrice = (p) => {
    if (!p || isNaN(p)) return '0.00';
    if (p < 0.0001) return p.toExponential(4);
    if (p < 1) return p.toFixed(6);
    if (p < 10) return p.toFixed(4);
    return p.toFixed(2);
  };

  const formatAge = (days) => {
    if (!days || days <= 0) return '—';
    const totalHours = days * 24;
    if (days < 1) return `${Math.floor(totalHours)}h`;
    if (days < 30) {
      const d = Math.floor(days);
      const h = Math.floor((days - d) * 24);
      return h > 0 ? `${d}d ${h}h` : `${d}d`;
    }
    if (days < 365) {
      const m = Math.floor(days / 30);
      const d = Math.floor(days % 30);
      return d > 0 ? `${m}m ${d}d` : `${m}m`;
    }
    const y = Math.floor(days / 365);
    const m = Math.floor((days % 365) / 30);
    return m > 0 ? `${y}y ${m}m` : `${y}y`;
  };

  // Bot Status Polling
  useEffect(() => {
    const fetchBotStatus = async () => {
      try {
        const res = await botFetch('/api/bot/status');
        if (res.ok) {
          const status = await res.json();
          setBotStatus(status);
          
          if (status && status.pools) {
            setActiveProtections(prev => {
              let updated = { ...prev };
              let changed = false;
              Object.keys(updated).forEach(id => {
                const lp = lpPositions.find(p => String(p.id) === String(id));
                if (lp) {
                  const botPool = status.pools.find(bp => 
                    bp.positionId ? String(bp.positionId) === String(id) : bp.address.toLowerCase() === lp.poolAddress.toLowerCase()
                  );
                  if (botPool) {
                    if (botPool.isHedged && updated[id].isMonitoring) {
                      updated[id].isMonitoring = false;
                      updated[id].entryPrice = botPool.hedgeEntryPrice || updated[id].entryPrice;
                      changed = true;
                    } else if (!botPool.isHedged && !updated[id].isMonitoring) {
                      updated[id].isMonitoring = true;
                      changed = true;
                    }
                  } else {
                    // Si el bot no tiene esta posición registrada, la removemos de activeProtections
                    delete updated[id];
                    changed = true;
                  }
                }
              });
              return changed ? updated : prev;
            });

            // ── AUTO-RECOVERY: si el navegador tiene pools activos pero el bot los olvidó
            // (ej. Railway reinició), los re-registramos automáticamente
            const autoGuardSaved = localStorage.getItem('autoGuardPools');
            const savedGuards = autoGuardSaved ? JSON.parse(autoGuardSaved) : {};

            for (const [posId, guard] of Object.entries(savedGuards)) {
              if (!guard?.active || !guard?.poolAddress) continue;

              // Verificar si el bot ya tiene este pool registrado
              const alreadyInBot = status.pools.some(
                bp => bp.positionId ? String(bp.positionId) === String(posId) : bp.address.toLowerCase() === guard.poolAddress.toLowerCase()
              );
              if (alreadyInBot) continue;

              // El bot no lo tiene — buscar los datos del LP para re-registrar
              const lp = lpPositions.find(p => String(p.id) === String(posId));
              if (!lp || !lp.poolAddress) continue;

              const apiKey    = localStorage.getItem('newWalletApiKey')    || '';
              const apiSecret = localStorage.getItem('newWalletApiSecret') || '';

              const stablecoins = ['USDC', 'USDT', 'USDC.E', 'USDT.E', 'DAI'];
              const t0 = lp.token0.symbol.toUpperCase();
              const t1 = lp.token1.symbol.toUpperCase();
              let baseToken, quoteToken;
              if (stablecoins.includes(t1))      { baseToken = lp.token0.symbol; quoteToken = lp.token1.symbol; }
              else if (stablecoins.includes(t0)) { baseToken = lp.token1.symbol; quoteToken = lp.token0.symbol; }
              else                               { baseToken = lp.token0.symbol; quoteToken = 'USDT'; }

              const symMap = { WETH:'ETH', WBTC:'BTC', WMATIC:'MATIC', WAVAX:'AVAX', WBNB:'BNB' };
              const base   = symMap[baseToken.toUpperCase()] || baseToken.toUpperCase();
              const quote  = quoteToken.toUpperCase().includes('USDC') ? 'USDC' : 'USDT';
              const hedgeSymbol = `${base}${quote}`;

              const priceForSize  = lp.priceCurrent || lp.price0 || 1;
              const hedgeQtyTokens = (lp.totalUsd || 0) / priceForSize;

              const lowerBound = guard.triggerPrice || lp.priceMin;
              const upperBound = lp.priceMax;
              const leverage   = guard.leverage  || 10;
              const stopLoss   = guard.stopLoss  || 0.5;

              console.log(`[Auto-Recovery] Re-registrando pool ${lp.token0.symbol}/${lp.token1.symbol} en el bot...`);

              botFetch('/api/bot/protect', {
                method: 'POST',
                body: JSON.stringify({
                  poolAddress:      lp.poolAddress,
                  lowerBound,
                  upperBound,
                  hedgeSymbol,
                  hedgeQty:         String(hedgeQtyTokens.toFixed(4)),
                  hedgeLeverage:    leverage,
                  stopLossPct:      stopLoss,
                  bitunixApiKey:    apiKey,
                  bitunixApiSecret: apiSecret,
                  orderType:        localStorage.getItem('cobOrderType') || 'LIMIT',
                  positionId:       String(posId)
                })
              }).then(r => r.json()).then(data => {
                if (data.success) {
                  console.log(`[Auto-Recovery] ✅ Pool re-registrado correctamente.`);
                } else {
                  console.warn(`[Auto-Recovery] ⚠️ No se pudo re-registrar: ${data.error}`);
                }
              }).catch(err => {
                console.warn('[Auto-Recovery] Error de red:', err.message);
              });
            }
          }
        }
      } catch { setBotStatus(null); }
    };
    fetchBotStatus();
    const interval = setInterval(fetchBotStatus, 20000);
    return () => clearInterval(interval);
  }, [lpPositions]);

  // Scanner Logic
  const RPC_URLS = {
    arbitrum: 'https://arb1.arbitrum.io/rpc',
    ethereum: 'https://eth.llamarpc.com',
    polygon: 'https://polygon-rpc.com',
    optimism: 'https://mainnet.optimism.io'
  };

  const TOP_TOKENS = {
    arbitrum: [
      { id: 'weth', cgId: 'ethereum', address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
      { id: 'usdt', cgId: 'tether', address: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9' },
      { id: 'usdc', cgId: 'usd-coin', address: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' },
      { id: 'wbtc', cgId: 'wrapped-bitcoin', address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f' },
      { id: 'arb', cgId: 'arbitrum', address: '0x912CE59144191C1204E64559FE8253a0e49E6548' }
    ],
    ethereum: [
      { id: 'usdt', cgId: 'tether', address: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
      { id: 'usdc', cgId: 'usd-coin', address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' }
    ],
    polygon: [],
    optimism: []
  };

  const scanPositions = async (addressToScan = walletAddress, chainToScan = selectedChain) => {
    if (!addressToScan || addressToScan.length < 40) return;
    try {
      setIsScanning(true);
      const rpcUrl = RPC_URLS[chainToScan];
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      let positions = await fetchUniswapPositions(provider, addressToScan);
      setPoolCount(positions.length.toString());

      const cgPlatform = {
        arbitrum: 'arbitrum-one', ethereum: 'ethereum', polygon: 'polygon-pos', optimism: 'optimistic-ethereum'
      }[chainToScan] || 'ethereum';

      const nativeCgId = chainToScan === 'polygon' ? 'matic-network' : 'ethereum';
      const tokens = TOP_TOKENS[chainToScan] || [];
      const allCgIds = [nativeCgId, ...tokens.map(t => t.cgId)].join(',');
      const idPrices = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${allCgIds}&vs_currencies=usd&include_24hr_change=true`).then(r => r.json()).catch(() => ({}));
      
      const priceMap = {};
      for (const token of tokens) {
        if (idPrices[token.cgId]?.usd) priceMap[token.address.toLowerCase()] = idPrices[token.cgId];
      }

      const wethAddresses = {
        'arbitrum': '0x82af49447d8a07e3bd95bd0d56f35241523fbab1',
        'ethereum': '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
        'polygon': '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        'optimism': '0x4200000000000000000000000000000000000006'
      };
      const wethAddr = wethAddresses[chainToScan];
      if (wethAddr && idPrices[nativeCgId]?.usd) priceMap[wethAddr] = idPrices[nativeCgId];

      const stablecoinAddresses = {
        arbitrum: ['0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9', '0xaf88d065e77c8cc2239327c5edb3a432268e5831', '0xff970a61a04b1ca14834a43f5de4533ebddb5cc8', '0xda10009cbd5d07dd0cecc66161fc93d7c9000da1'],
        ethereum: ['0xdac17f958d2ee523a2206206994597c13d831ec7', '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', '0x6b175474e89094c44da98b954eedeac495271d0f'],
        polygon: ['0xc2132d05d31c914a87c6611c10748aeb04b58e8f', '0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
        optimism: ['0x94b008aa00579c1307b0ef2c499ad98a8ce58e58', '0x7f5c764cbc14f9669b88837ca1490cca17c31607']
      };
      const stableAddrs = stablecoinAddresses[chainToScan] || [];
      for (const addr of stableAddrs) {
        if (!priceMap[addr]) priceMap[addr] = { usd: 1, usd_24h_change: 0 };
      }

      const unknownAddresses = [];
      positions.forEach(pos => {
        const a0 = pos.token0.address.toLowerCase();
        const a1 = pos.token1.address.toLowerCase();
        if (!priceMap[a0]) unknownAddresses.push(a0);
        if (!priceMap[a1]) unknownAddresses.push(a1);
      });

      if (unknownAddresses.length > 0) {
        try {
          const uniqueUnknown = [...new Set(unknownAddresses)].join(',');
          const tokenPriceUrl = `https://api.coingecko.com/api/v3/simple/token_price/${cgPlatform}?contract_addresses=${uniqueUnknown}&vs_currencies=usd&include_24hr_change=true`;
          const tokenPricesRaw = await fetch(tokenPriceUrl).then(r => {
            if (!r.ok) throw new Error(`CoinGecko ${r.status}`);
            return r.json();
          });
          for (const [addr, data] of Object.entries(tokenPricesRaw)) {
            priceMap[addr.toLowerCase()] = data;
          }
        } catch (cgErr) {
          console.warn('CoinGecko fallback failed:', cgErr.message);
        }
      }

      let totalLpValueUSD = 0;
      const tokenIds = positions.map(p => p.id);
      const revertMap = await fetchRevertDataBatch(chainToScan, tokenIds);

      const enriched = positions.map(pos => {
        const price0 = priceMap[pos.token0.address.toLowerCase()]?.usd || 0;
        const price1 = priceMap[pos.token1.address.toLowerCase()]?.usd || 0;
        const usd0 = pos.token0.amount * price0;
        const usd1 = pos.token1.amount * price1;
        const rv = revertMap.get(String(pos.id));
        const totalUsd = rv ? rv.underlyingValue : (usd0 + usd1);
        totalLpValueUSD += totalUsd;

        const unclaimed = rv ? ((rv.uncollectedFees0 * price0) + (rv.uncollectedFees1 * price1)) : ((pos.uncollected0 * price0) + (pos.uncollected1 * price1));
        const pnl = rv ? rv.pnlTotal : null;
        const pnlPercent = rv ? rv.pnlTotalPercent : null;
        const apr = rv ? rv.aprTotal : 0;
        const feeApr = rv ? rv.feeApr : 0;
        const depositsValue = rv ? rv.depositsValue : totalUsd;
        const pnlCapital = rv ? rv.pnlCapital : null;
        const aprCapital = rv ? rv.aprCapital : null;
        const il = rv ? rv.il : null;
        const entryPrice = rv ? rv.entryPrice : null;
        const ageDays = rv ? rv.ageDays : (pos.ageDays || 0);
        const age = rv ? formatAge(rv.ageDays) : (pos.age || '—');
        const pnl24h = rv ? rv.pnl24h : 0;
        const feeApr24h = rv ? rv.feeApr24h : 0;
        const earn24h = ageDays > 0 ? (unclaimed / ageDays) : 0;

        return {
          ...pos, usd0, usd1, totalUsd, price0, price1,
          pnl, pnlPercent, apr, feeApr, depositsValue,
          pnlCapital, aprCapital, il, entryPrice,
          unclaimed, earn24h, ageDays, age,
          pnl24h, feeApr24h, poolAddress: rv ? rv.poolAddress : null,
          chain: chainToScan, source: 'Uniswap V3',
          hasRevertData: !!rv
        };
      });

      setLpPositions(enriched);
      setWalletBalanceUSD(new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalLpValueUSD));
    } catch (e) {
      console.error(e);
    } finally {
      setIsScanning(false);
      setShowScannerModal(false);
    }
  };

  const hasAutoScanned = useRef(false);
  useEffect(() => {
    if (walletAddress && !hasAutoScanned.current) {
      hasAutoScanned.current = true;
      scanPositions(walletAddress, selectedChain);
    }
  }, [walletAddress, selectedChain]);

  const toggleAutoGuard = async (pos, leverage, stopLoss) => {
    const posId = String(pos.id);
    const isActive = autoGuardPools[posId]?.active;

    if (isActive) {
      setAutoGuardPools(prev => { const u = {...prev}; delete u[posId]; return u; });
      try {
        await botFetch('/api/bot/unprotect', {
          method: 'POST',
          body: JSON.stringify({ poolAddress: pos.poolAddress, positionId: posId })
        });
      } catch (err) {
        console.warn('Bot no disponible:', err.message);
      }
    } else {
      const triggerPrice = pos.priceMin * 1.02;
      // Detectar la stablecoin de la pool
      const stablecoins = ['USDC', 'USDT', 'USDC.E', 'USDT.E', 'DAI'];
      const t0 = pos.token0.symbol.toUpperCase();
      const t1 = pos.token1.symbol.toUpperCase();
      let baseToken, quoteToken;
      if (stablecoins.includes(t1)) {
        baseToken = pos.token0.symbol;
        quoteToken = pos.token1.symbol;
      } else if (stablecoins.includes(t0)) {
        baseToken = pos.token1.symbol;
        quoteToken = pos.token0.symbol;
      } else {
        baseToken = pos.token0.symbol;
        quoteToken = 'USDT';
      }
      const hedgeSymbol = toBitunixSymbol(baseToken, quoteToken);
      const priceForSize = pos.priceCurrent || pos.price0 || 1;
      const hedgeQtyTokens = (pos.totalUsd || 0) / priceForSize;

      setAutoGuardPools(prev => ({
        ...prev,
        [posId]: {
          active: true, triggerPrice, leverage, stopLoss, triggered: false,
          poolAddress: pos.poolAddress, activatedAt: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
        }
      }));

      try {
        await botFetch('/api/bot/protect', {
          method: 'POST',
          body: JSON.stringify({
            poolAddress: pos.poolAddress,
            lowerBound: triggerPrice, upperBound: pos.priceMax,
            hedgeSymbol, hedgeQty: String(hedgeQtyTokens.toFixed(4)),
            hedgeLeverage: leverage, stopLossPct: stopLoss,
            bitunixApiKey: newWalletApiKey, bitunixApiSecret: newWalletApiSecret,
            orderType: cobOrderType
          })
        });
      } catch (err) {
        console.warn('Bot error:', err.message);
      }
    }
  };

  return (
    <AppContext.Provider value={{
      activeTab, setActiveTab,
      walletAddress, setWalletAddress,
      selectedChain, setSelectedChain,
      activeWalletName, setActiveWalletName,
      newWalletApiKey, setNewWalletApiKey,
      newWalletApiSecret, setNewWalletApiSecret,
      poolCount, walletBalanceUSD, isScanning,
      lpPositions, setLpPositions,
      lpSearchTerm, setLpSearchTerm,
      lpStatusFilter, setLpStatusFilter,
      lpChainFilter, setLpChainFilter,
      lpSourceFilter, setLpSourceFilter,
      lpSortOrder, setLpSortOrder,
      lpViewMode, setLpViewMode,
      hiddenPositions, setHiddenPositions,
      showHidden, setShowHidden,
      botMessage, setBotMessage,
      isBotLoading, setIsBotLoading,
      cobLeverage, setCobLeverage,
      cobStopLoss, setCobStopLoss,
      cobOrderType, setCobOrderType,
      botStatus, setBotStatus,
      activeProtections, setActiveProtections,
      autoGuardPools, setAutoGuardPools,
      showScannerModal, setShowScannerModal,
      showAddWalletModal, setShowAddWalletModal,
      showCoberturaModal, setShowCoberturaModal,
      selectedCobPosition, setSelectedCobPosition,
      selectedLpDetails, setSelectedLpDetails,
      scanPositions, toggleAutoGuard, formatPrice, formatAge,
      isSettingsLoaded
    }}>
      {children}
    </AppContext.Provider>
  );
};
