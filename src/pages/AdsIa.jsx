import { useState, useEffect, useMemo } from 'react';
import {
  Bot,
  ShieldCheck,
  Search,
  Sparkles,
  ExternalLink,
  CheckCircle2,
  RefreshCw,
  Sliders,
  X,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getResultados, parseNumber } from '../utils/financeCalculators';
import {
  fetchStoredMlListings,
  syncListingsFromML,
  mlProxyFetch,
  getValidMlToken,
} from '../services/mercadolivre';
import { fetchStoredShopeeListings } from '../services/shopee';
import {
  calculateAdShieldMetrics,
  evaluateAiRecommendation,
  evaluateAdsChoice,
  resolveDynamicTargetMargin,
  loadRampState,
  saveRampState,
  fetchMlCompetitorIntel,
  fetchMlPromosAndAdsStats,
  fetchSingleMlItemPromo,
  fetchShopeePromosAndAdsStats,
  updateMlAdStatusOrCampaign,
  createMlAdCampaign,
  updateMlAdCampaign,
  applyMlSellerPromotion,
  removeMlSellerPromotion,
  applyShopeeCustomPromoPrice,
  syncMlBaseCadastroAndPromo,
  syncShopeeBaseCadastroAndPromo,
  loadPromosAdsCache,
  askGeminiStrategist,
  loadAdsIaRules,
  saveAdsIaRules,
  loadManualAdsMetrics,
  saveManualAdsMetrics,
} from '../services/adsIntelligence';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const normalizeStr = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export default function AdsIa() {
  const { session, profile } = useAuth();
  const [activeChannel, setActiveChannel] = useState('ml'); // 'ml' | 'shopee'
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [savedFts, setSavedFts] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [channelDefaults, setChannelDefaults] = useState({});
  const [vendasMensal, setVendasMensal] = useState({});
  const [mlListings, setMlListings] = useState([]);
  const [shopeeListings, setShopeeListings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [rules, setRules] = useState(() => loadAdsIaRules());
  const [showRulesPanel, setShowRulesPanel] = useState(true);
  const [adsMetricsMap, setAdsMetricsMap] = useState(() => loadManualAdsMetrics());

  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'critico' | 'oportunidade' | 'saudavel'
  const [onlyCadastrados, setOnlyCadastrados] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Cache de inteligência de concorrentes por ftId
  const [competitorMap, setCompetitorMap] = useState({});
  const [loadingCompFt, setLoadingCompFt] = useState(null);
  const [batchCompLoading, setBatchCompLoading] = useState(false);
  const [selectedCompDetail, setSelectedCompDetail] = useState(null);

  // Consultor Narrativo Gemini
  const [aiReportText, setAiReportText] = useState('');
  const [loadingAiReport, setLoadingAiReport] = useState(false);
  const [applyingFtId, setApplyingFtId] = useState(null);
  const [customTargetPrices, setCustomTargetPrices] = useState({});
  const [minMarginAlert, setMinMarginAlert] = useState({ open: false, targetMin: 30, belowRows: [], fixingAll: false });
  const [dailySalesOrders, setDailySalesOrders] = useState([]);
  const [lastHourlySyncLog, setLastHourlySyncLog] = useState(null);
  const [showDailySalesPanel, setShowDailySalesPanel] = useState(true);
  const [salesChannelFilter, setSalesChannelFilter] = useState('all'); // 'all' | 'ml' | 'shopee'
  const [runningOrderSyncNow, setRunningOrderSyncNow] = useState(false);
  const [shopeeAdsGroupMap, setShopeeAdsGroupMap] = useState(() => {
    try {
      const raw = localStorage.getItem('am3d_shopee_ads_group_v1');
      return raw ? JSON.parse(raw) || {} : {};
    } catch {
      return {};
    }
  });
  const handleShopeeAdsGroupChange = (rowIdKey, groupVal) => {
    setShopeeAdsGroupMap((prev) => {
      const next = { ...prev, [rowIdKey]: groupVal };
      try {
        localStorage.setItem('am3d_shopee_ads_group_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Promoções (% OFF) e Gastos de Ads (7d / 15d / 30d)
  const [adsPeriod, setAdsPeriod] = useState(30);
  const [promosAdsCache, setPromosAdsCache] = useState(() => loadPromosAdsCache());
  const [syncingPromosAds, setSyncingPromosAds] = useState(false);
  const [promosAdsNote, setPromosAdsNote] = useState('');
  const [showCampaignsModal, setShowCampaignsModal] = useState(false);
  const [updatingAdKey, setUpdatingAdKey] = useState(null);
  const [newCampForm, setNewCampForm] = useState({ name: '', acosTarget: 10, dailyBudget: 15 });
  const [savingCamp, setSavingCamp] = useState(false);
  const [rampState, setRampState] = useState(() => loadRampState());
  const [showStandardizeModal, setShowStandardizeModal] = useState(false);
  const [targetBaseMargin, setTargetBaseMargin] = useState(35);
  const [standardizingBusy, setStandardizingBusy] = useState(false);
  const [standardizeProgress, setStandardizeProgress] = useState('');

  const handleToggleRamp = (rowKey) => {
    setRampState((prev) => {
      const next = { ...prev };
      if (next[rowKey]) {
        delete next[rowKey];
      } else {
        next[rowKey] = new Date().toISOString();
      }
      saveRampState(next);
      return next;
    });
  };

  const getHeaders = () => ({
    apikey: SUPA_KEY,
    Authorization: `Bearer ${session?.access_token || SUPA_KEY}`,
    'Content-Type': 'application/json',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getHeaders();
      const [ftsResp, defResp, overResp, salesResp, mlStored, shopeeStored, ordersResp, syncLogResp] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_channel_defaults?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_overrides?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_monthly_sales?select=*`, { headers }),
        fetchStoredMlListings(profile?.empresa_id),
        fetchStoredShopeeListings(profile?.empresa_id),
        fetch(`${SUPA_URL}/rest/v1/marketplace_orders_synced?status=eq.paid&order=order_date.desc&limit=500`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/marketplace_sync_logs?order=created_at.desc&limit=1`, { headers }),
      ]);

      const ftsData = ftsResp.ok ? await ftsResp.json() : [];
      const defData = defResp.ok ? await defResp.json() : [];
      const overData = overResp.ok ? await overResp.json() : [];
      const salesData = salesResp.ok ? await salesResp.json() : [];
      const ordersData = ordersResp?.ok ? await ordersResp.json() : [];
      const syncLogData = syncLogResp?.ok ? await syncLogResp.json() : [];
      setDailySalesOrders(Array.isArray(ordersData) ? ordersData : []);
      if (Array.isArray(syncLogData) && syncLogData.length > 0) setLastHourlySyncLog(syncLogData[0]);

      const cleanFts = ftsData
        .map((r) => ({ ...r.data, estoque: r.estoque }))
        .filter((f) => f && f.indiceFt)
        .sort((a, b) =>
          (a.indiceFt || '').localeCompare(b.indiceFt || '', undefined, { numeric: true })
        );

      const nextDefaults = {};
      defData.forEach((d) => {
        nextDefaults[d.channel_id] = d.settings;
      });

      const nextOverrides = {};
      overData.forEach((o) => {
        if (!nextOverrides[o.channel_id]) nextOverrides[o.channel_id] = {};
        nextOverrides[o.channel_id][o.ft_id] = o.settings;
      });

      const nextVendas = {};
      salesData.forEach((s) => {
        if (!nextVendas[s.month]) nextVendas[s.month] = {};
        if (!nextVendas[s.month][s.channel_id]) nextVendas[s.month][s.channel_id] = {};
        nextVendas[s.month][s.channel_id][s.ft_id] = s.quantity;
      });

      setSavedFts(cleanFts);
      setChannelDefaults(nextDefaults);
      setOverrides(nextOverrides);
      setVendasMensal(nextVendas);
      setMlListings(mlStored || []);
      setShopeeListings(shopeeStored || []);
    } catch (err) {
      console.error('[AdsIA] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.id) fetchData();
  }, [session?.user?.id]);

  // Atualiza APENAS 1 anúncio MLB no cache local (0.3s), sem recarregar a tabela inteira nem voltar ao topo
  const handleRefreshSingleMlItem = async (mlItemId) => {
    if (!mlItemId) return;
    try {
      const fresh = await fetchSingleMlItemPromo({
        mlItemId,
        empresaId: profile?.empresa_id,
      });
      if (fresh) {
        setPromosAdsCache((prev) => {
          const next = {
            ...(prev || {}),
            promosByItem: {
              ...(prev?.promosByItem || {}),
              [mlItemId]: fresh,
            },
          };
          try {
            localStorage.setItem('am3d_ml_promos_ads_cache_v1', JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        });
      }
    } catch {
      // silencioso
    }
  };

  const handleRuleChange = (key, val) => {
    setRules((prev) => {
      const next = { ...prev, [key]: val };
      if (key === 'margemMinimaPerc') {
        const minN = parseNumber(val);
        const healthyN = parseNumber(prev.margemSaudavelPerc ?? val);
        if (healthyN < minN) next.margemSaudavelPerc = val;
      }
      saveAdsIaRules(next);
      return next;
    });
  };

  const handleCheckMinMarginAlert = (valOverride = null) => {
    const targetMin = Math.max(0, parseNumber(valOverride ?? rules.margemMinimaPerc));
    const belowRows = analyzedRows.filter((r) => {
      if (r.metrics.precoPraticado <= 0) return false;
      return r.metrics.margemPosAdsPerc < targetMin - 0.15 || r.metrics.precoPraticado < r.metrics.precoPiso - 0.05;
    });
    if (belowRows.length > 0) {
      setMinMarginAlert({ open: true, targetMin, belowRows, fixingAll: false });
    }
  };

  const handleFixAllBelowMinMargin = async () => {
    if (minMarginAlert.belowRows.length === 0) return;
    setMinMarginAlert((p) => ({ ...p, fixingAll: true }));
    let ok = 0;
    let err = 0;
    try {
      for (const row of minMarginAlert.belowRows) {
        const newPrice = Number(row.metrics.precoPiso.toFixed(2));
        try {
          const curOv = overrides[activeChannel]?.[row.ftId] || {};
          const nextSettings = {
            ...curOv,
            cadastrado: true,
            precoVendaManual: String(newPrice.toFixed(2)),
          };
          if (nextSettings.precoRealVenda) nextSettings.precoRealVenda = String(newPrice.toFixed(2));
          if (nextSettings.precoRealVendaMes?.[currentMonth]) {
            nextSettings.precoRealVendaMes = { ...nextSettings.precoRealVendaMes, [currentMonth]: newPrice };
          }
          await fetch(`${SUPA_URL}/rest/v1/ecommerce_overrides?on_conflict=channel_id,ft_id`, {
            method: 'POST',
            headers: { ...getHeaders(), Prefer: 'resolution=merge-duplicates,return=minimal' },
            body: JSON.stringify({ channel_id: activeChannel, ft_id: row.ftId, settings: nextSettings }),
          });
          setOverrides((prev) => ({
            ...prev,
            [activeChannel]: { ...(prev[activeChannel] || {}), [row.ftId]: nextSettings },
          }));

          if (activeChannel === 'shopee' && row.primaryMl?.ml_item_id) {
            const matchedVar = Array.isArray(row.primaryMl?.variations)
              ? row.primaryMl.variations.find((v) => String(v.ft_id || '').split('__var__')[0] === row.ftId)
              : null;
            const cadastroRef = row.promoInfo?.originalPrice || row.metrics.precoCadastro || Number((newPrice / 0.7).toFixed(2));
            await applyShopeeCustomPromoPrice({
              itemId: row.primaryMl.ml_item_id,
              modelId: matchedVar?.model_id || matchedVar?.id || null,
              targetPrice: newPrice,
              cadastroPrice: cadastroRef > newPrice ? cadastroRef : Number((newPrice / 0.7).toFixed(2)),
              empresaId: profile?.empresa_id,
            });
          } else if (activeChannel === 'ml' && row.primaryMl?.ml_item_id) {
            await applyMlSellerPromotion({
              mlItemId: row.primaryMl.ml_item_id,
              targetPrice: newPrice,
              empresaId: profile?.empresa_id,
            });
          }
          ok++;
        } catch {
          err++;
        }
      }
      await handleSyncPromosAndAds();
      setMinMarginAlert({ open: false, targetMin: minMarginAlert.targetMin, belowRows: [], fixingAll: false });
      alert(`✅ Ajuste de Piso concluído!\n\n• Atualizados para o Piso (${minMarginAlert.targetMin}%): ${ok}\n• Falhas/Manual: ${err}`);
    } finally {
      setMinMarginAlert((p) => ({ ...p, fixingAll: false }));
    }
  };

  const handleAdsSpendChange = (channel, ftId, gastoVal) => {
    setAdsMetricsMap((prev) => {
      const key = `${channel}_${currentMonth}_${ftId}`;
      const next = {
        ...prev,
        [key]: {
          ...(prev[key] || {}),
          gastoAds: gastoVal,
        },
      };
      saveManualAdsMetrics(next);
      return next;
    });
  };

  const getEstoqueTotalFt = (ft) => {
    const vars = Array.isArray(ft.variacoesEstoque) ? ft.variacoesEstoque : [];
    if (vars.length > 0) {
      return vars.reduce(
        (acc, v) => acc + Number(v.estoqueCasa || 0) + Number(v.estoqueGalpao || 0),
        0
      );
    }
    if (ft.estoqueCasa !== undefined || ft.estoqueGalpao !== undefined) {
      return Number(ft.estoqueCasa || 0) + Number(ft.estoqueGalpao || 0);
    }
    return Number(ft.estoque || 0);
  };

  const getEffectiveFt = (baseFt, chId) => {
    const defaults = channelDefaults[chId] || {
      custoEmbalagem: 1.5,
      custoExtra: 0,
      custoEnvio: 0,
      custoEnvioPerc: 0,
      taxaFixaVenda: chId === 'shopee' ? 4 : 6,
      impostosNF: 0,
      taxaMLPerc: chId === 'shopee' ? 20 : 16.5,
    };
    const itemOv = overrides[chId]?.[baseFt.indiceFt] || {};
    const merged = { ...baseFt, ...defaults, ...itemOv };
    const realMonthPrice =
      merged?.precoRealVendaMes?.[currentMonth] || merged?.precoRealVenda;
    const precoRealAtivo =
      parseNumber(realMonthPrice) > 0 ? parseNumber(realMonthPrice) : null;
    return {
      ...merged,
      precoRealAtivo,
      precoVendaManual:
        precoRealAtivo !== null
          ? String(precoRealAtivo)
          : merged.precoVendaManual,
    };
  };

  // Monta a lista completa analisada pelo motor de IA (expandindo variações e anúncios múltiplos)
  const analyzedRows = useMemo(() => {
    const expanded = [];
    const channelListings = activeChannel === 'shopee' ? shopeeListings : mlListings;

    savedFts.forEach((ft) => {
      const isCadastrado = Boolean(overrides[activeChannel]?.[ft.indiceFt]?.cadastrado);
      const effFtBase = getEffectiveFt(ft, activeChannel);
      const vendasMesFt = Number(
        vendasMensal[currentMonth]?.[activeChannel]?.[ft.indiceFt] || 0
      );

      // Todos os anúncios do canal atual (ML ou Shopee) vinculados a esta FT (no pai ou nas variações)
      const linkedListings = channelListings.filter((l) => {
        const base = String(l.ft_id || '').split('__var__')[0];
        if (base === ft.indiceFt) return true;
        if (Array.isArray(l.variations)) {
          return l.variations.some((v) => String(v.ft_id || '').split('__var__')[0] === ft.indiceFt);
        }
        return false;
      });

      const ftVars = Array.isArray(ft.variacoesEstoque) ? ft.variacoesEstoque : [];

      // Caso 1: FT possui variações cadastradas no estoque (ex: FT-16 com Preto, Vermelho, Branco, Rosa)
      if (ftVars.length > 0) {
        ftVars.forEach((fv, vIdx) => {
          const varName = String(fv.nome || `Variação ${vIdx + 1}`).trim();
          const normVar = normalizeStr(varName);
          const varTokens = normVar.split(/[\s/|,-]+/).filter((t) => t.length >= 2);
          const varStock = Number(fv.estoqueCasa || 0) + Number(fv.estoqueGalpao || 0);

          // Procura anúncio do ML específico desta variação
          const matchedMl =
            linkedListings.find((l) => String(l.ft_id || '') === `${ft.indiceFt}__var__${fv.id}`) ||
            linkedListings.find((l) => {
              const normTitleSku = normalizeStr(`${l.sku || ''} ${l.title || ''}`);
              return (
                normTitleSku.includes(normVar) ||
                (varTokens.length > 0 && varTokens.every((t) => normTitleSku.includes(t)))
              );
            }) ||
            (linkedListings.length === 1 ? linkedListings[0] : null);

          const rowKey = `${ft.indiceFt}__var__${fv.id || vIdx}`;
          const manualKey = `${activeChannel}_${currentMonth}_${rowKey}`;
          const manualAds = adsMetricsMap[manualKey] || adsMetricsMap[`${activeChannel}_${currentMonth}_${ft.indiceFt}`] || {};
          const mlId = matchedMl?.ml_item_id || '';
          const matchedChildVar = Array.isArray(matchedMl?.variations)
            ? matchedMl.variations.find((v) => {
                const vFt = String(v.ft_id || '').split('__var__')[0];
                if (vFt === ft.indiceFt && (normalizeStr(v.name || v.label || '').includes(normVar) || normVar.includes(normalizeStr(v.name || v.label || '')))) {
                  return true;
                }
                return false;
              }) || matchedMl.variations.find((v) => String(v.ft_id || '').split('__var__')[0] === ft.indiceFt)
            : null;
          const rawPromoInfo = mlId ? promosAdsCache?.promosByItem?.[mlId] : null;
          const promoInfo = (() => {
            if (!matchedMl) return rawPromoInfo;
            const origP = Number(
              matchedChildVar?.original_price ||
              (matchedChildVar?.price_promo ? matchedChildVar?.price : 0) ||
              matchedMl.price ||
              0
            );
            const curP = Number(
              matchedChildVar?.price_promo ||
              matchedChildVar?.price ||
              matchedMl.price_promo ||
              matchedMl.price ||
              0
            );
            if (activeChannel === 'shopee' && origP > 0 && curP > 0) {
              const discP = origP > curP ? ((origP - curP) / origP) * 100 : 0;
              return {
                ...(rawPromoInfo || {}),
                price: curP,
                originalPrice: origP,
                promoPerc: discP,
                status: matchedMl.status || 'active',
                activePromos: discP >= 0.5 ? [{
                  id: `SHOPEE_PROMO_${mlId}_${ft.indiceFt}`,
                  type: 'PRICE_DISCOUNT',
                  name: 'Promoção da Loja Shopee',
                  label: 'Oferta da Loja Shopee',
                  status: 'started',
                  price: curP,
                  originalPrice: origP,
                  suggestedPrice: curP,
                  discountPerc: discP,
                  meliPercentage: 0,
                }] : [],
                candidatePromos: discP < 0.5 ? (rawPromoInfo?.candidatePromos || []) : [],
              };
            }
            return rawPromoInfo;
          })();
          const adsPeriodStats = mlId ? promosAdsCache?.adsByItem?.[mlId] : null;
          const apiAdsForPeriod = adsPeriodStats?.[adsPeriod] || null;

          const liveMlPrice =
            parseNumber(promoInfo?.price) > 0 ? parseNumber(promoInfo.price) : null;

          const effFtVar = {
            ...effFtBase,
            precoVendaSistema: effFtBase.precoVendaManual,
            ...(liveMlPrice
              ? { precoRealAtivo: liveMlPrice, precoVendaManual: String(liveMlPrice) }
              : {}),
          };

          const effectiveManualAds = {
            ...manualAds,
            ...(manualAds.gastoAds === undefined || manualAds.gastoAds === ''
              ? apiAdsForPeriod
                ? { gastoAds: apiAdsForPeriod.cost, acosPerc: apiAdsForPeriod.acos }
                : {}
              : {}),
          };

          const metricsBase = {
            ...effectiveManualAds,
            vendasMes: vendasMesFt,
          };

          const lastSaleIso = mlId ? promosAdsCache?.lastSaleByItem?.[mlId] : null;
          const daysSinceLastSale = lastSaleIso
            ? Math.max(0, Math.floor((Date.now() - new Date(lastSaleIso).getTime()) / (1000 * 60 * 60 * 24)))
            : null;
          const soldQuantityTotal =
            promoInfo?.soldQuantity !== undefined
              ? Number(promoInfo.soldQuantity)
              : matchedMl?.sold_quantity !== undefined
              ? Number(matchedMl.sold_quantity || 0)
              : null;

          const minTargetVal = Math.max(0, parseNumber(rules.margemMinimaPerc ?? 30));
          const dynamicMargin = {
            targetPerc: minTargetVal,
            phase: 'fixed',
            badge: daysSinceLastSale !== null && daysSinceLastSale >= 30
              ? '⏳ 30+ dias s/ venda'
              : daysSinceLastSale !== null && daysSinceLastSale >= 15
              ? '⏳ 15+ dias s/ venda'
              : `🛡️ Mín: ${minTargetVal}%`,
            color: daysSinceLastSale !== null && daysSinceLastSale >= 30
              ? '#7C3AED'
              : daysSinceLastSale !== null && daysSinceLastSale >= 15
              ? '#D97706'
              : '#059669',
            reason: `Escudo ativo com Margem Mínima de ${minTargetVal}% e Saudável de ${Math.max(minTargetVal, parseNumber(rules.margemSaudavelPerc ?? minTargetVal))}%.`,
          };
          const rowRules = { ...rules, margemMinimaPerc: dynamicMargin.targetPerc };

          const metrics = calculateAdShieldMetrics(effFtVar, rowRules, metricsBase);

          const competitor = competitorMap[rowKey] || competitorMap[ft.indiceFt] || null;

          const aiRec = evaluateAiRecommendation(
            {
              ft,
              metrics,
              estoqueTotal: varStock,
              vendasMes: vendasMesFt,
              soldQuantityTotal,
              competitor,
              promoInfo,
              dynamicMargin,
            },
            rowRules
          );

          const varKey = `${ft.indiceFt}__var__${fv.id}`;
          const vendasMesVarRaw = vendasMensal[currentMonth]?.[activeChannel]?.[varKey];
          const vendasMesVar = vendasMesVarRaw !== undefined ? Number(vendasMesVarRaw || 0) : 0;

          expanded.push({
            rowKey,
            ft,
            ftId: ft.indiceFt,
            nomePeca: ft.nomePeca,
            variacaoNome: varName,
            sku: matchedMl?.sku || fv.sku || effFtBase.sku || ft.sku || '',
            isCadastrado,
            estoqueTotal: varStock,
            vendasMes: vendasMesVar,
            vendasMesFtTotal: vendasMesFt,
            soldQuantityTotal,
            daysSinceLastSale,
            dynamicMargin,
            rowRules,
            primaryMl: matchedMl,
            linkedListings,
            promoInfo,
            adsPeriodStats,
            metrics,
            competitor,
            aiRec,
            gastoAdsInput: manualAds.gastoAds ?? '',
          });
        });
        return;
      }

      // Caso 2: Sem variacoesEstoque na FT, mas possui múltiplos anúncios do ML vinculados (ex: FT-67, FT-131)
      if (activeChannel === 'ml' && linkedListings.length > 1) {
        linkedListings.forEach((l, lIdx) => {
          const rowKey = `${ft.indiceFt}__ml__${l.ml_item_id || lIdx}`;
          const manualKey = `${activeChannel}_${currentMonth}_${rowKey}`;
          const manualAds = adsMetricsMap[manualKey] || {};
          const mlId = l.ml_item_id || '';
          const promoInfo = mlId ? promosAdsCache?.promosByItem?.[mlId] : null;
          const adsPeriodStats = mlId ? promosAdsCache?.adsByItem?.[mlId] : null;
          const apiAdsForPeriod = adsPeriodStats?.[adsPeriod] || null;
          const liveMlPrice =
            parseNumber(promoInfo?.price) > 0 ? parseNumber(promoInfo.price) : null;
          const effFtMl = {
            ...effFtBase,
            precoVendaSistema: effFtBase.precoVendaManual,
            ...(liveMlPrice
              ? { precoRealAtivo: liveMlPrice, precoVendaManual: String(liveMlPrice) }
              : {}),
          };

          const estoqueAnuncio =
            Number(l.stock_physical ?? l.stock_ml ?? getEstoqueTotalFt(ft));

          const effectiveManualAds = {
            ...manualAds,
            ...(manualAds.gastoAds === undefined || manualAds.gastoAds === ''
              ? apiAdsForPeriod
                ? { gastoAds: apiAdsForPeriod.cost, acosPerc: apiAdsForPeriod.acos }
                : {}
              : {}),
          };

          const lastSaleIso = mlId ? promosAdsCache?.lastSaleByItem?.[mlId] : null;
          const daysSinceLastSale = lastSaleIso
            ? Math.max(0, Math.floor((Date.now() - new Date(lastSaleIso).getTime()) / (1000 * 60 * 60 * 24)))
            : null;
          const soldQtyMl = promoInfo?.soldQuantity !== undefined ? Number(promoInfo.soldQuantity) : null;
          const dynamicMargin = resolveDynamicTargetMargin(
            {
              vendasMes: vendasMesFt,
              soldQuantityTotal: soldQtyMl,
              daysSinceLastSale,
              rampStartDate: rampState[rowKey],
            },
            rules
          );
          const rowRules = { ...rules, margemMinimaPerc: dynamicMargin.targetPerc };

          const metrics = calculateAdShieldMetrics(effFtMl, rowRules, {
            ...effectiveManualAds,
            vendasMes: vendasMesFt,
          });

          const competitor = competitorMap[rowKey] || competitorMap[ft.indiceFt] || null;
          const aiRec = evaluateAiRecommendation(
            {
              ft,
              metrics,
              estoqueTotal: estoqueAnuncio,
              vendasMes: vendasMesFt,
              soldQuantityTotal: soldQtyMl,
              competitor,
              promoInfo,
              dynamicMargin,
            },
            rowRules
          );

          const suffixFromSku = String(l.sku || '')
            .replace(new RegExp(`^FT\\s*-?\\s*\\d+\\s*`, 'i'), '')
            .trim();

          expanded.push({
            rowKey,
            ft,
            ftId: ft.indiceFt,
            nomePeca: ft.nomePeca,
            variacaoNome: suffixFromSku || l.title,
            sku: l.sku || effFtBase.sku || ft.sku || '',
            isCadastrado,
            estoqueTotal: estoqueAnuncio,
            vendasMes: vendasMesFt,
            soldQuantityTotal: soldQtyMl,
            daysSinceLastSale,
            dynamicMargin,
            rowRules,
            primaryMl: l,
            linkedListings,
            promoInfo,
            adsPeriodStats,
            metrics,
            competitor,
            aiRec,
            gastoAdsInput: manualAds.gastoAds ?? '',
          });
        });
        return;
      }

      // Caso 3: Produto simples (sem variações)
      const rowKey = ft.indiceFt;
      const manualKey = `${activeChannel}_${currentMonth}_${rowKey}`;
      const manualAds = adsMetricsMap[manualKey] || {};
      const primaryMl = linkedListings[0] || null;
      const mlId = primaryMl?.ml_item_id || '';
      const matchedChildVar = Array.isArray(primaryMl?.variations)
        ? primaryMl.variations.find((v) => String(v.ft_id || '').split('__var__')[0] === ft.indiceFt)
        : null;
      const rawPromoInfo = mlId ? promosAdsCache?.promosByItem?.[mlId] : null;
      const promoInfo = (() => {
        if (!primaryMl) return rawPromoInfo;
        const origP = Number(
          matchedChildVar?.original_price ||
          (matchedChildVar?.price_promo ? matchedChildVar?.price : 0) ||
          primaryMl.price ||
          0
        );
        const curP = Number(
          matchedChildVar?.price_promo ||
          matchedChildVar?.price ||
          primaryMl.price_promo ||
          primaryMl.price ||
          0
        );
        if (activeChannel === 'shopee' && origP > 0 && curP > 0) {
          const discP = origP > curP ? ((origP - curP) / origP) * 100 : 0;
          return {
            ...(rawPromoInfo || {}),
            price: curP,
            originalPrice: origP,
            promoPerc: discP,
            status: primaryMl.status || 'active',
            activePromos: discP >= 0.5 ? [{
              id: `SHOPEE_PROMO_${mlId}_${ft.indiceFt}`,
              type: 'PRICE_DISCOUNT',
              name: 'Promoção da Loja Shopee',
              label: 'Oferta da Loja Shopee',
              status: 'started',
              price: curP,
              originalPrice: origP,
              suggestedPrice: curP,
              discountPerc: discP,
              meliPercentage: 0,
            }] : [],
            candidatePromos: discP < 0.5 ? (rawPromoInfo?.candidatePromos || []) : [],
          };
        }
        return rawPromoInfo;
      })();
      const adsPeriodStats = mlId ? promosAdsCache?.adsByItem?.[mlId] : null;
      const apiAdsForPeriod = adsPeriodStats?.[adsPeriod] || null;
      const estoqueTotal = getEstoqueTotalFt(ft);

      const liveMlPrice =
        parseNumber(promoInfo?.price) > 0 ? parseNumber(promoInfo.price) : null;
      const effFtSimple = {
        ...effFtBase,
        precoVendaSistema: effFtBase.precoVendaManual,
        ...(liveMlPrice
          ? { precoRealAtivo: liveMlPrice, precoVendaManual: String(liveMlPrice) }
          : {}),
      };

      const effectiveManualAds = {
        ...manualAds,
        ...(manualAds.gastoAds === undefined || manualAds.gastoAds === ''
          ? apiAdsForPeriod
            ? { gastoAds: apiAdsForPeriod.cost, acosPerc: apiAdsForPeriod.acos }
            : {}
          : {}),
      };

      const lastSaleIso = mlId ? promosAdsCache?.lastSaleByItem?.[mlId] : null;
      const daysSinceLastSale = lastSaleIso
        ? Math.max(0, Math.floor((Date.now() - new Date(lastSaleIso).getTime()) / (1000 * 60 * 60 * 24)))
        : null;
      const soldQtySimple = promoInfo?.soldQuantity !== undefined ? Number(promoInfo.soldQuantity) : null;
      const minTargetVal = Math.max(0, parseNumber(rules.margemMinimaPerc ?? 30));
      const dynamicMargin = {
        targetPerc: minTargetVal,
        phase: 'fixed',
        badge: daysSinceLastSale !== null && daysSinceLastSale >= 30
          ? '⏳ 30+ dias s/ venda'
          : daysSinceLastSale !== null && daysSinceLastSale >= 15
          ? '⏳ 15+ dias s/ venda'
          : `🛡️ Mín: ${minTargetVal}%`,
        color: daysSinceLastSale !== null && daysSinceLastSale >= 30
          ? '#7C3AED'
          : daysSinceLastSale !== null && daysSinceLastSale >= 15
          ? '#D97706'
          : '#059669',
        reason: `Escudo ativo com Margem Mínima de ${minTargetVal}% e Saudável de ${Math.max(minTargetVal, parseNumber(rules.margemSaudavelPerc ?? minTargetVal))}%.`,
      };
      const rowRules = { ...rules, margemMinimaPerc: dynamicMargin.targetPerc };

      const metrics = calculateAdShieldMetrics(effFtSimple, rowRules, {
        ...effectiveManualAds,
        vendasMes: vendasMesFt,
      });

      const competitor = competitorMap[rowKey] || null;
      const aiRec = evaluateAiRecommendation(
        {
          ft,
          metrics,
          estoqueTotal,
          vendasMes: vendasMesFt,
          soldQuantityTotal: soldQtySimple,
          competitor,
          promoInfo,
          dynamicMargin,
        },
        rowRules
      );

      expanded.push({
        rowKey,
        ft,
        ftId: ft.indiceFt,
        nomePeca: ft.nomePeca,
        variacaoNome: '',
        sku: primaryMl?.sku || effFtBase.sku || ft.sku || '',
        isCadastrado,
        estoqueTotal,
        vendasMes: vendasMesFt,
        soldQuantityTotal: soldQtySimple,
        daysSinceLastSale,
        dynamicMargin,
        rowRules,
        primaryMl,
        linkedListings,
        promoInfo,
        adsPeriodStats,
        metrics,
        competitor,
        aiRec,
        gastoAdsInput: manualAds.gastoAds ?? '',
      });
    });

    return expanded.filter((row) => {
      if (onlyCadastrados && !row.isCadastrado) return false;
      if (statusFilter !== 'all' && row.aiRec.severity !== statusFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          row.nomePeca.toLowerCase().includes(q) ||
          row.ftId.toLowerCase().includes(q) ||
          (row.variacaoNome || '').toLowerCase().includes(q) ||
          row.sku.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [
    savedFts,
    overrides,
    channelDefaults,
    vendasMensal,
    mlListings,
    shopeeListings,
    activeChannel,
    currentMonth,
    rules,
    adsMetricsMap,
    competitorMap,
    onlyCadastrados,
    statusFilter,
    searchTerm,
    promosAdsCache,
    adsPeriod,
    rampState,
  ]);

  // Totais do painel superior
  const summaryStats = useMemo(() => {
    const baseList = analyzedRows;
    const criticos = baseList.filter((r) => r.aiRec.severity === 'critico').length;
    const atencao = baseList.filter((r) => r.aiRec.severity === 'atencao').length;
    const oportunidades = baseList.filter((r) => r.aiRec.severity === 'oportunidade').length;
    const saudaveis = baseList.filter((r) => r.aiRec.severity === 'saudavel').length;
    const totalAdsGasto = baseList.reduce((acc, r) => acc + r.metrics.gastoAdsMes, 0);
    return {
      total: baseList.length,
      criticos,
      atencao,
      oportunidades,
      saudaveis,
      totalAdsGasto,
    };
  }, [analyzedRows]);

  const handleAnalyzeSingleCompetitor = async (row) => {
    const key = row.rowKey || row.ftId;
    setLoadingCompFt(key);
    try {
      const intel = await fetchMlCompetitorIntel({
        mlItemId: row.primaryMl?.ml_item_id || '',
        searchTitle: row.primaryMl?.title || `${row.nomePeca} ${row.variacaoNome || ''}`.trim(),
        empresaId: profile?.empresa_id,
      });
      setCompetitorMap((prev) => ({ ...prev, [key]: intel }));
    } catch (err) {
      alert('Erro ao analisar concorrentes: ' + err.message);
    } finally {
      setLoadingCompFt(null);
    }
  };

  const handleBatchCompetitorScan = async () => {
    const targets = analyzedRows.slice(0, 12);
    if (targets.length === 0) return;
    setBatchCompLoading(true);
    try {
      for (const row of targets) {
        const key = row.rowKey || row.ftId;
        try {
          const intel = await fetchMlCompetitorIntel({
            mlItemId: row.primaryMl?.ml_item_id || '',
            searchTitle: row.primaryMl?.title || `${row.nomePeca} ${row.variacaoNome || ''}`.trim(),
            empresaId: profile?.empresa_id,
          });
          setCompetitorMap((prev) => ({ ...prev, [key]: intel }));
        } catch {
          // continua próximo item
        }
      }
    } finally {
      setBatchCompLoading(false);
    }
  };

  const handleApplyRecommendedPrice = async (row, newPrice, promoTarget = null) => {
    const safePrice = Number(newPrice);
    if (!safePrice || safePrice < row.metrics.precoPiso - 0.02) {
      return alert(
        `🛑 Bloqueado pelo Escudo de Margem! O valor R$ ${safePrice.toFixed(2)} está abaixo do seu Preço Piso (R$ ${row.metrics.precoPiso.toFixed(2)}).`
      );
    }

    const chosenPromo = promoTarget || row.aiRec?.recommendedPromo || null;
    const key = row.rowKey || row.ftId;
    const isVariationRow = Boolean(row.variacaoNome && Array.isArray(row.ft?.variacoesEstoque) && row.ft.variacoesEstoque.length > 0);
    setApplyingFtId(key);
    try {
      // Só salva preço único na FT pai quando o produto NÃO tem variações independentes de cor/modelo
      if (!isVariationRow) {
        const curOv = overrides[activeChannel]?.[row.ftId] || {};
        const nextSettings = {
          ...curOv,
          cadastrado: true,
          precoVendaManual: String(safePrice.toFixed(2)),
        };
        if (nextSettings.precoRealVenda) {
          nextSettings.precoRealVenda = String(safePrice.toFixed(2));
        }
        if (nextSettings.precoRealVendaMes?.[currentMonth]) {
          nextSettings.precoRealVendaMes = {
            ...nextSettings.precoRealVendaMes,
            [currentMonth]: safePrice,
          };
        }

        const headers = {
          ...getHeaders(),
          Prefer: 'resolution=merge-duplicates,return=minimal',
        };
        await fetch(
          `${SUPA_URL}/rest/v1/ecommerce_overrides?on_conflict=channel_id,ft_id`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({
              channel_id: activeChannel,
              ft_id: row.ftId,
              settings: nextSettings,
            }),
          }
        );

        setOverrides((prev) => ({
          ...prev,
          [activeChannel]: {
            ...(prev[activeChannel] || {}),
            [row.ftId]: nextSettings,
          },
        }));
      }

      // Se for Shopee e tiver anúncio vinculado, aplica a promoção direto na Shopee (por variação ou item inteiro)
      if (activeChannel === 'shopee' && row.primaryMl?.ml_item_id) {
        const vars = Array.isArray(row.primaryMl?.variations) ? row.primaryMl.variations : [];
        const normVar = normalizeStr(row.variacaoNome || '');
        const matchedVar =
          (normVar
            ? vars.find((v) => {
                const vName = normalizeStr(v.name || v.label || '');
                return vName === normVar || (vName && (vName.includes(normVar) || normVar.includes(vName)));
              })
            : null) ||
          vars.find((v) => String(v.ft_id || '').split('__var__')[0] === row.ftId) ||
          null;
        const cadastroRef =
          row.promoInfo?.originalPrice ||
          row.metrics.precoCadastro ||
          Number((safePrice / 0.7).toFixed(2));
        const resShp = await applyShopeeCustomPromoPrice({
          itemId: row.primaryMl.ml_item_id,
          modelId: matchedVar?.model_id || matchedVar?.id || null,
          targetPrice: safePrice,
          cadastroPrice: cadastroRef > safePrice ? cadastroRef : Number((safePrice / 0.7).toFixed(2)),
          empresaId: profile?.empresa_id,
        });
        setShopeeListings((prev) =>
          prev.map((l) => {
            if (String(l.ml_item_id) !== String(row.primaryMl.ml_item_id)) return l;
            const nextVars = Array.isArray(l.variations)
              ? l.variations.map((v) =>
                  !resShp.modelId || String(v.model_id || v.id) === String(resShp.modelId)
                    ? { ...v, price: resShp.cadastroPrice, price_promo: resShp.promoPrice, original_price: resShp.cadastroPrice }
                    : v
                )
              : l.variations;
            return {
              ...l,
              price: !resShp.modelId ? resShp.cadastroPrice : l.price,
              price_promo: !resShp.modelId ? resShp.promoPrice : l.price_promo,
              variations: nextVars,
            };
          })
        );
        setCustomTargetPrices((prev) => {
          const next = { ...prev };
          delete next[`${activeChannel}__${key}`];
          return next;
        });
        alert(
          `🚀 Promoção aplicada na Shopee (${row.primaryMl.ml_item_id}${matchedVar ? ` • ${matchedVar.name || matchedVar.label}` : ''})!\n\n• Preço de Cadastro: R$ ${resShp.cadastroPrice.toFixed(2)}\n• Preço Promocional: R$ ${resShp.promoPrice.toFixed(2)} (-${resShp.pctOff}% OFF)`
        );
        await handleSyncPromosAndAds();
      } else if (activeChannel === 'ml' && row.primaryMl?.ml_item_id) {
        const cadastroRef =
          row.promoInfo?.originalPrice ||
          row.metrics.precoCadastro ||
          safePrice / 0.7;
        const pctOffCadastro =
          cadastroRef > safePrice
            ? Math.round(((cadastroRef - safePrice) / cadastroRef) * 100)
            : 0;

        const promoLabel = chosenPromo?.label || 'Central de Promoções';
        const pushToMl = window.confirm(
          `✅ Preço alvo R$ ${safePrice.toFixed(2)} (${pctOffCadastro}% OFF s/ Cadastro de R$ ${cadastroRef.toFixed(2)}) salvo no sistema!\n\nDeseja ativar/atualizar "${promoLabel}" no anúncio ${row.primaryMl.ml_item_id} no Mercado Livre (mantendo o Preço de Cadastro intacto)?`
        );
        if (pushToMl) {
          const promoRes = await applyMlSellerPromotion({
            mlItemId: row.primaryMl.ml_item_id,
            targetPrice: safePrice,
            promotionId: chosenPromo?.id,
            promotionType: chosenPromo?.type,
            empresaId: profile?.empresa_id,
          });
          if (promoRes.appliedAs === 'promotion') {
            const removedNote =
              promoRes.removedBlocking?.length > 0
                ? `\n(O anúncio também foi retirado automaticamente da campanha "${promoRes.removedBlocking.map((p) => p.name || p.type).join(', ')}" que travava o preço abaixo do Piso.)`
                : '';
            alert(
              `🚀 Promoção (${promoRes.promotion?.name || promoRes.promotion?.type || promoLabel}) aplicada no anúncio ${row.primaryMl.ml_item_id}! Preço promocional: R$ ${safePrice.toFixed(2)} (${pctOffCadastro}% OFF mantendo o Cadastro intacto).${removedNote}`
            );
            await handleRefreshSingleMlItem(row.primaryMl.ml_item_id);
          } else if (promoRes.appliedAs === 'removed_blocking_deal') {
            alert(
              `✅ Retiramos o anúncio ${row.primaryMl.ml_item_id} da campanha "${promoRes.removedBlocking.map((p) => p.name || p.type).join(', ')}" que estava forçando o preço abaixo do seu Piso!\n\nAgora você pode ativar um Desconto Individual de ${pctOffCadastro}% OFF (R$ ${safePrice.toFixed(2)}) na Central de Promoções.`
            );
            await handleRefreshSingleMlItem(row.primaryMl.ml_item_id);
          } else {
            alert(
              `ℹ️ O anúncio ${row.primaryMl.ml_item_id} não retornou uma campanha elegível aberta pela API.\n\nPara não apagar seu Preço de Cadastro (R$ ${cadastroRef.toFixed(2)}), não alteramos o preço base.\n👉 Entre na Central de Promoções do ML e coloque o preço promocional em R$ ${safePrice.toFixed(2)} (${pctOffCadastro}% OFF).`
            );
          }
        }
      }
    } catch (err) {
      alert('Erro ao aplicar preço sugerido: ' + err.message);
    } finally {
      setApplyingFtId(null);
    }
  };

  const handleGenerateGeminiReport = async () => {
    setLoadingAiReport(true);
    try {
      const payload = analyzedRows.slice(0, 20).map((r) => ({
        ft: r.ftId,
        produto: r.nomePeca,
        estoquePronto: r.estoqueTotal,
        vendasNoMes: r.vendasMes,
        precoAtual: Number(r.metrics.precoPraticado.toFixed(2)),
        precoPisoIntocavel: Number(r.metrics.precoPiso.toFixed(2)),
        margemLiquidaAtualPerc: Number(r.metrics.margemPosAdsPerc.toFixed(1)),
        gastoAdsMes: r.metrics.gastoAdsMes,
        concorrentePrecoRef: r.competitor?.priceToWin || r.competitor?.minPrice || null,
        diagnosticoAutomatico: r.aiRec.title,
      }));
      const text = await askGeminiStrategist({
        apiKey: rules.geminiApiKey,
        itemsSummary: payload,
        rules,
      });
      setAiReportText(text);
    } catch (err) {
      alert(err.message);
    } finally {
      setLoadingAiReport(false);
    }
  };

  const handleSyncPromosAndAds = async () => {
    setSyncingPromosAds(true);
    setPromosAdsNote('');
    try {
      if (activeChannel === 'shopee') {
        const res = await fetchShopeePromosAndAdsStats({
          empresaId: profile?.empresa_id,
        });
        if (Array.isArray(res.listings) && res.listings.length > 0) {
          setShopeeListings(res.listings);
        }
        setPromosAdsCache((prev) => ({
          ...prev,
          promosByItem: { ...(prev?.promosByItem || {}), ...(res.promosByItem || {}) },
          adsByItem: { ...(prev?.adsByItem || {}), ...(res.adsByItem || {}) },
          lastSaleByItem: { ...(prev?.lastSaleByItem || {}), ...(res.lastSaleByItem || {}) },
        }));
        const promoCount = Object.values(res.promosByItem || {}).filter((p) => p.promoPerc > 0).length;
        const adsCount = Object.keys(res.adsByItem || {}).length;
        setPromosAdsNote(
          `✅ Shopee sincronizada: ${res.listings?.length || 0} anúncio(s), ${promoCount} em promoção e ${adsCount} em Shopee Ads.`
        );
        return;
      }

      const mlIds = mlListings.map((l) => l.ml_item_id).filter(Boolean);
      const res = await fetchMlPromosAndAdsStats({
        mlItemIds: mlIds,
        empresaId: profile?.empresa_id,
      });
      setPromosAdsCache(res);
      const promoCount = Object.values(res.promosByItem || {}).filter((p) => p.promoPerc > 0).length;
      const adsCount = Object.keys(res.adsByItem || {}).length;
      if (res.adsStatusNote) {
        setPromosAdsNote(res.adsStatusNote);
      } else {
        setPromosAdsNote(
          `✅ Sincronizado: ${promoCount} anúncio(s) em promoção, ${res.campaigns?.length || 0} campanha(s) e ${adsCount} anúncio(s) em Ads.`
        );
      }
    } catch (err) {
      alert('Erro ao sincronizar promoções e Ads: ' + err.message);
    } finally {
      setSyncingPromosAds(false);
    }
  };

  const handleToggleAdStatus = async (row, nextStatus) => {
    const mlId = row.primaryMl?.ml_item_id;
    const advId = promosAdsCache?.advertiserId;
    if (!mlId) return alert('Nenhum anúncio MLB vinculado a esta linha.');
    if (!advId) return alert('Clique primeiro em "📡 Puxar Promoções & Ads" para identificar sua conta de Ads.');

    const key = row.rowKey || row.ftId;
    setUpdatingAdKey(key);
    try {
      await updateMlAdStatusOrCampaign({
        advertiserId: advId,
        mlItemId: mlId,
        status: nextStatus,
        campaignId: row.adsPeriodStats?.campaignId,
        empresaId: profile?.empresa_id,
      });
      setPromosAdsCache((prev) => {
        const nextAdsByItem = {
          ...(prev.adsByItem || {}),
          [mlId]: {
            ...(prev.adsByItem?.[mlId] || {}),
            adStatus: nextStatus,
          },
        };
        return { ...prev, adsByItem: nextAdsByItem };
      });
    } catch (err) {
      alert(`Erro ao ${nextStatus === 'paused' ? 'pausar' : 'ativar'} Ads no ML: ` + err.message);
    } finally {
      setUpdatingAdKey(null);
    }
  };

  const handleMoveAdCampaign = async (row, nextCampaignId) => {
    const mlId = row.primaryMl?.ml_item_id;
    const advId = promosAdsCache?.advertiserId;
    if (!mlId || !advId || !nextCampaignId) return;
    const key = row.rowKey || row.ftId;
    setUpdatingAdKey(key);
    try {
      await updateMlAdStatusOrCampaign({
        advertiserId: advId,
        mlItemId: mlId,
        campaignId: Number(nextCampaignId),
        status: 'active',
        empresaId: profile?.empresa_id,
      });
      setPromosAdsCache((prev) => ({
        ...prev,
        adsByItem: {
          ...(prev.adsByItem || {}),
          [mlId]: {
            ...(prev.adsByItem?.[mlId] || {}),
            campaignId: Number(nextCampaignId),
            adStatus: 'active',
          },
        },
      }));
    } catch (err) {
      alert('Erro ao mover anúncio de campanha: ' + err.message);
    } finally {
      setUpdatingAdKey(null);
    }
  };

  const handleCreateCampaign = async (e) => {
    e.preventDefault();
    const advId = promosAdsCache?.advertiserId;
    if (!advId) return alert('Clique primeiro em "📡 Puxar Promoções & Ads".');
    if (!newCampForm.name.trim()) return alert('Informe o nome da campanha.');
    setSavingCamp(true);
    try {
      await createMlAdCampaign({
        advertiserId: advId,
        name: newCampForm.name.trim(),
        acosTarget: Number(newCampForm.acosTarget || 10),
        dailyBudget: Number(newCampForm.dailyBudget || 50),
        empresaId: profile?.empresa_id,
      });
      setNewCampForm({ name: '', acosTarget: 10, dailyBudget: 50 });
      await handleSyncPromosAndAds();
    } catch (err) {
      alert('Erro ao criar campanha no ML: ' + err.message);
    } finally {
      setSavingCamp(false);
    }
  };

  const handleCreateFourStandardCampaigns = async () => {
    const standardPack = [
      { name: '1 - Campeoes (Escala)', acosTarget: 8, dailyBudget: 50 },
      { name: '2 - Lancamentos (Rankear)', acosTarget: 15, dailyBudget: 50 },
      { name: '3 - Giro de Estoque', acosTarget: 12, dailyBudget: 50 },
      { name: '4 - Teste e Baixo Custo', acosTarget: 6, dailyBudget: 50 },
    ];

    let advId = promosAdsCache?.advertiserId;
    let existingList = promosAdsCache?.campaigns || [];

    setSavingCamp(true);
    try {
      if (!advId) {
        const mlIds = mlListings.map((l) => l.ml_item_id).filter(Boolean);
        const fresh = await fetchMlPromosAndAdsStats({
          mlItemIds: mlIds,
          empresaId: profile?.empresa_id,
        });
        setPromosAdsCache(fresh);
        advId = fresh?.advertiserId;
        existingList = fresh?.campaigns || [];
      }

      if (!advId) {
        alert('Não foi possível identificar sua conta de Product Ads no Mercado Livre. Verifique se o ML está conectado.');
        return;
      }

      const createdNames = [];
      const updatedNames = [];
      const errors = [];

      for (const preset of standardPack) {
        const found = existingList.find(
          (c) => String(c.name || '').trim().toLowerCase() === preset.name.toLowerCase()
        );
        try {
          if (found) {
            await updateMlAdCampaign({
              advertiserId: advId,
              campaignId: found.id,
              acosTarget: preset.acosTarget,
              dailyBudget: preset.dailyBudget,
              empresaId: profile?.empresa_id,
            });
            updatedNames.push(preset.name);
          } else {
            await createMlAdCampaign({
              advertiserId: advId,
              name: preset.name,
              acosTarget: preset.acosTarget,
              dailyBudget: preset.dailyBudget,
              empresaId: profile?.empresa_id,
            });
            createdNames.push(preset.name);
          }
        } catch (err) {
          errors.push(`${preset.name}: ${err.message}`);
        }
      }

      await handleSyncPromosAndAds();

      const msgParts = [];
      if (createdNames.length > 0) {
        msgParts.push(`✅ Criadas com R$ 50,00/dia:\n- ${createdNames.join('\n- ')}`);
      }
      if (updatedNames.length > 0) {
        msgParts.push(`🔄 Atualizadas para R$ 50,00/dia:\n- ${updatedNames.join('\n- ')}`);
      }
      if (errors.length > 0) {
        msgParts.push(`⚠️ Avisos:\n- ${errors.join('\n- ')}`);
      }
      alert(msgParts.join('\n\n') || 'Campanhas processadas!');
    } catch (err) {
      alert('Erro ao criar pacote de 4 campanhas: ' + err.message);
    } finally {
      setSavingCamp(false);
    }
  };

  const handleToggleCampaignStatus = async (camp) => {
    const advId = promosAdsCache?.advertiserId;
    if (!advId) return;
    const nextStatus = camp.status === 'active' ? 'paused' : 'active';
    setSavingCamp(true);
    try {
      await updateMlAdCampaign({
        advertiserId: advId,
        campaignId: camp.id,
        status: nextStatus,
        empresaId: profile?.empresa_id,
      });
      await handleSyncPromosAndAds();
    } catch (err) {
      alert('Erro ao alterar status da campanha: ' + err.message);
    } finally {
      setSavingCamp(false);
    }
  };

  // Calcula para qualquer FT o Preço de Venda (com 30% OFF e targetMargin% de margem líquida) e o Preço de Cadastro (Venda / 0,70)
  const computeStandardizedPair = (ftBase, marginPerc = targetBaseMargin) => {
    const eff = getEffectiveFt(ftBase, activeChannel);
    const m = calculateAdShieldMetrics(eff, { ...rules, margemMinimaPerc: marginPerc }, {});
    const denom = 1 - (m.aliquotaCanalPerc + Number(marginPerc || 35)) / 100;
    const vendaIdeal =
      denom > 0.08
        ? Number((m.custoFixoUnit / denom).toFixed(2))
        : Number((m.precoQueima * 1.5).toFixed(2));
    const cadastroIdeal = Number((vendaIdeal / 0.7).toFixed(2));
    const queimaIdeal = Number(m.precoQueima.toFixed(2));
    return {
      custoFixoUnit: m.custoFixoUnit,
      aliquotaCanalPerc: m.aliquotaCanalPerc,
      vendaIdeal,
      cadastroIdeal,
      queimaIdeal,
    };
  };

  const handleStandardizeSystemPrices = async (onlyActive = true) => {
    const targetFts = savedFts.filter((ft) =>
      onlyActive ? Boolean(overrides[activeChannel]?.[ft.indiceFt]?.cadastrado) : true
    );
    if (targetFts.length === 0) return alert('Nenhum produto selecionado para padronizar.');

    setStandardizingBusy(true);
    setStandardizeProgress(`Atualizando ${targetFts.length} produtos no sistema...`);
    try {
      const headers = {
        ...getHeaders(),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      };
      const nextChOverrides = { ...(overrides[activeChannel] || {}) };

      for (const ft of targetFts) {
        const pair = computeStandardizedPair(ft, targetBaseMargin);
        const curOv = nextChOverrides[ft.indiceFt] || {};
        const cleaned = { ...curOv };
        delete cleaned.precoRealVenda;
        delete cleaned.precoRealVendaMes;

        const nextSettings = {
          ...cleaned,
          cadastrado: curOv.cadastrado ?? true,
          precoVendaManual: pair.vendaIdeal.toFixed(2),
          precoAnuncio: pair.cadastroIdeal.toFixed(2),
          precoRankeamento: pair.queimaIdeal.toFixed(2),
        };

        await fetch(`${SUPA_URL}/rest/v1/ecommerce_overrides?on_conflict=channel_id,ft_id`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            channel_id: activeChannel,
            ft_id: ft.indiceFt,
            settings: nextSettings,
          }),
        });
        nextChOverrides[ft.indiceFt] = nextSettings;
      }

      setOverrides((prev) => ({
        ...prev,
        [activeChannel]: nextChOverrides,
      }));
      alert(
        `✅ ${targetFts.length} produtos padronizados no sistema!\n\n• Valor de Venda (com 30% OFF) = ${targetBaseMargin}% de margem líquida\n• Preço de Cadastro = Valor de Venda / 0,70`
      );
    } catch (err) {
      alert('Erro ao padronizar preços no sistema: ' + err.message);
    } finally {
      setStandardizingBusy(false);
      setStandardizeProgress('');
    }
  };

  const handlePushStandardizedToMl = async (specificFt = null) => {
    const targetFts = specificFt
      ? [specificFt]
      : savedFts.filter((ft) => Boolean(overrides[activeChannel]?.[ft.indiceFt]?.cadastrado));

    if (targetFts.length === 0) return;

    const channelName = activeChannel === 'shopee' ? 'Shopee' : 'Mercado Livre';
    const currentChannelListings = activeChannel === 'shopee' ? shopeeListings : mlListings;

    if (
      !specificFt &&
      !window.confirm(
        `Deseja atualizar no(a) ${channelName} o Preço de Cadastro (Venda / 0,70) e ativar a promoção de 30% OFF (com ${targetBaseMargin}% de margem líquida) para todos os anúncios vinculados a essas ${targetFts.length} FTs?`
      )
    ) {
      return;
    }

    setStandardizingBusy(true);
    let updatedMlCount = 0;
    let promoAppliedCount = 0;
    const errors = [];

    try {
      const headers = {
        ...getHeaders(),
        Prefer: 'resolution=merge-duplicates,return=minimal',
      };
      const nextChOverrides = { ...(overrides[activeChannel] || {}) };

      for (let i = 0; i < targetFts.length; i++) {
        const ft = targetFts[i];
        const pair = computeStandardizedPair(ft, targetBaseMargin);
        const curOv = nextChOverrides[ft.indiceFt] || {};
        const cleaned = { ...curOv };
        delete cleaned.precoRealVenda;
        delete cleaned.precoRealVendaMes;

        const nextSettings = {
          ...cleaned,
          cadastrado: true,
          precoVendaManual: pair.vendaIdeal.toFixed(2),
          precoAnuncio: pair.cadastroIdeal.toFixed(2),
          precoRankeamento: pair.queimaIdeal.toFixed(2),
        };

        await fetch(`${SUPA_URL}/rest/v1/ecommerce_overrides?on_conflict=channel_id,ft_id`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            channel_id: activeChannel,
            ft_id: ft.indiceFt,
            settings: nextSettings,
          }),
        });
        nextChOverrides[ft.indiceFt] = nextSettings;

        // Encontra todos os anúncios vinculados a esta FT no canal atual (ML ou Shopee)
        const linked = currentChannelListings.filter((l) => {
          const base = String(l.ft_id || '').split('__var__')[0];
          return base === ft.indiceFt && l.ml_item_id;
        });

        for (const l of linked) {
          setStandardizeProgress(
            `Enviando ${ft.indiceFt} (${l.ml_item_id}) p/ ${channelName} -> Cadastro R$ ${pair.cadastroIdeal.toFixed(2)} | Promo 30% OFF R$ ${pair.vendaIdeal.toFixed(2)}...`
          );
          try {
            const resSync =
              activeChannel === 'shopee'
                ? await syncShopeeBaseCadastroAndPromo({
                    itemId: l.ml_item_id,
                    variations: l.variations || [],
                    cadastroPrice: pair.cadastroIdeal,
                    vendaPrice: pair.vendaIdeal,
                    empresaId: profile?.empresa_id,
                  })
                : await syncMlBaseCadastroAndPromo({
                    mlItemId: l.ml_item_id,
                    cadastroPrice: pair.cadastroIdeal,
                    vendaPrice: pair.vendaIdeal,
                    empresaId: profile?.empresa_id,
                  });
            if (resSync.baseUpdated) updatedMlCount++;
            if (resSync.promoApplied) promoAppliedCount++;
          } catch (mlErr) {
            errors.push(`${ft.indiceFt} (${l.ml_item_id}): ${mlErr.message}`);
          }
        }
      }

      setOverrides((prev) => ({
        ...prev,
        [activeChannel]: nextChOverrides,
      }));

      await handleSyncPromosAndAds();

      const summary = [
        `✅ Padronização concluída (${channelName})!`,
        `• Anúncios com Preço de Cadastro atualizado: ${updatedMlCount}`,
        `• Promoções de 30% OFF aplicadas via API: ${promoAppliedCount}`,
      ];
      if (errors.length > 0) {
        summary.push(`\n⚠️ Avisos (${errors.length}):\n- ${errors.slice(0, 6).join('\n- ')}`);
      }
      alert(summary.join('\n'));
    } catch (err) {
      alert(`Erro ao sincronizar preços com ${channelName}: ` + err.message);
    } finally {
      setStandardizingBusy(false);
      setStandardizeProgress('');
    }
  };

  const formatBRL = (v) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const handleRunHourlyOrderSyncNow = async () => {
    if (runningOrderSyncNow) return;
    setRunningOrderSyncNow(true);
    try {
      const resp = await fetch(`/api/sync-sales?source=manual_ads_ia&month=${encodeURIComponent(currentMonth)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      if (!resp.ok || data?.ok === false) throw new Error(data?.error || `HTTP ${resp.status}`);
      await fetchData();
    } catch (err) {
      alert('Erro ao atualizar vendas agora: ' + (err?.message || err));
    } finally {
      setRunningOrderSyncNow(false);
    }
  };

  // Resumo Diário, Gráfico de 14 dias, Top Produtos e Histórico Dia a Dia
  const dailySalesIntel = useMemo(() => {
    const toBrDateKey = (isoStr) => {
      if (!isoStr) return '';
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return '';
      const br = new Date(d.getTime() - 3 * 3600 * 1000);
      return br.toISOString().slice(0, 10);
    };
    const toBrTimeStr = (isoStr) => {
      if (!isoStr) return '--:--';
      const d = new Date(isoStr);
      if (Number.isNaN(d.getTime())) return '--:--';
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    const nowBr = new Date(Date.now() - 3 * 3600 * 1000);
    const todayKey = nowBr.toISOString().slice(0, 10);
    const yestBr = new Date(nowBr.getTime() - 86400 * 1000);
    const yesterdayKey = yestBr.toISOString().slice(0, 10);
    const sevenDaysAgoKey = new Date(nowBr.getTime() - 6 * 86400 * 1000).toISOString().slice(0, 10);

    const ftNameMap = new Map();
    const ftMap = new Map();
    savedFts.forEach((f) => {
      ftNameMap.set(f.indiceFt, f.nomePeca);
      ftMap.set(f.indiceFt, f);
    });

    const calcOrderBreakdown = (r) => {
      const q = Number(r.quantity || 0);
      const p = Number(r.unit_price || 0);
      const rev = q * p;
      if (q <= 0 || p <= 0) {
        return { profit: 0, prodCost: 0, packShipCost: 0, mktFeeCost: 0, taxCost: 0 };
      }
      const chId = r.platform === 'shopee' ? 'shopee' : 'ml';
      const baseFt = ftMap.get(r.ft_id);
      if (!baseFt) {
        const mktFee = rev * (chId === 'shopee' ? 0.20 : 0.165) + q * (chId === 'shopee' ? 4 : 6);
        const prod = rev * 0.25;
        const pack = q * 1.5;
        const profit = Math.max(0, rev - mktFee - prod - pack);
        return { profit, prodCost: prod, packShipCost: pack, mktFeeCost: mktFee, taxCost: 0 };
      }
      const effFt = getEffectiveFt(baseFt, chId);
      const res = getResultados({
        ...effFt,
        precoVendaManual: String(p),
      });
      const prodCost = q * Number(res.custoFisicoUnit || 0);
      const packShipCost = q * Number(res.custoExtrasUnit || 0);
      const mktFeeCost = q * Number(res.aliquotaMarketplaceTotal || 0);
      const taxCost = q * Number(res.aliquotaImpostos || 0);
      const profit = q * Number(res.lucroLiquido || 0);
      return { profit, prodCost, packShipCost, mktFeeCost, taxCost };
    };

    const filtered = (dailySalesOrders || []).filter((o) => {
      if (salesChannelFilter !== 'all' && o.platform !== salesChannelFilter) return false;
      return true;
    });

    const calcBucket = (rows) => {
      let units = 0, rev = 0, profit = 0, mlUnits = 0, shpUnits = 0;
      let prodCost = 0, packShipCost = 0, mktFeeCost = 0, taxCost = 0;
      rows.forEach((r) => {
        const q = Number(r.quantity || 0);
        const p = Number(r.unit_price || 0);
        const bd = r.orderBreakdown || calcOrderBreakdown(r);
        units += q;
        rev += q * p;
        profit += bd.profit;
        prodCost += bd.prodCost;
        packShipCost += bd.packShipCost;
        mktFeeCost += bd.mktFeeCost;
        taxCost += bd.taxCost;
        if (r.platform === 'ml') mlUnits += q;
        if (r.platform === 'shopee') shpUnits += q;
      });
      const marginPerc = rev > 0 ? (profit / rev) * 100 : 0;
      return { units, rev, profit, marginPerc, mlUnits, shpUnits, prodCost, packShipCost, mktFeeCost, taxCost };
    };

    const withDate = filtered.map((o) => {
      const bd = calcOrderBreakdown(o);
      return {
        ...o,
        dateKey: toBrDateKey(o.order_date || o.synced_at),
        timeStr: toBrTimeStr(o.order_date || o.synced_at),
        ftNome: ftNameMap.get(o.ft_id) || o.title || o.ft_id || 'Item',
        orderProfit: bd.profit,
        orderBreakdown: bd,
      };
    });

    const todayStats = calcBucket(withDate.filter((o) => o.dateKey === todayKey));
    const yesterdayStats = calcBucket(withDate.filter((o) => o.dateKey === yesterdayKey));
    const last7dStats = calcBucket(withDate.filter((o) => o.dateKey >= sevenDaysAgoKey && o.dateKey <= todayKey));
    const monthStats = calcBucket(withDate.filter((o) => (o.month || o.dateKey.slice(0, 7)) === currentMonth));

    // Últimos 14 dias para o gráfico de barras
    const chartDays = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(nowBr.getTime() - i * 86400 * 1000);
      const dKey = d.toISOString().slice(0, 10);
      const label = `${dKey.slice(8, 10)}/${dKey.slice(5, 7)}`;
      const dayRows = withDate.filter((o) => o.dateKey === dKey);
      const b = calcBucket(dayRows);
      chartDays.push({ dateKey: dKey, label, ...b });
    }
    const maxChartUnits = Math.max(1, ...chartDays.map((c) => c.units));

    // Top Produtos do mês selecionado
    const byProd = new Map();
    withDate
      .filter((o) => (o.month || o.dateKey.slice(0, 7)) === currentMonth)
      .forEach((o) => {
        const k = o.ft_id || o.title || 'SEM_FT';
        const prev = byProd.get(k) || { ftId: o.ft_id || '—', nome: o.ftNome, units: 0, mlUnits: 0, shpUnits: 0, rev: 0, profit: 0 };
        const q = Number(o.quantity || 0);
        prev.units += q;
        prev.rev += q * Number(o.unit_price || 0);
        prev.profit += Number(o.orderProfit || 0);
        if (o.platform === 'ml') prev.mlUnits += q;
        if (o.platform === 'shopee') prev.shpUnits += q;
        byProd.set(k, prev);
      });
    const topProducts = Array.from(byProd.values()).sort((a, b) => b.units - a.units || b.rev - a.rev).slice(0, 8);

    // Agrupamento Dia a Dia para o histórico detalhado
    const byDayMap = new Map();
    withDate.forEach((o) => {
      if (!o.dateKey) return;
      if (!byDayMap.has(o.dateKey)) byDayMap.set(o.dateKey, []);
      byDayMap.get(o.dateKey).push(o);
    });
    const dailyGroups = Array.from(byDayMap.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 15)
      .map(([dKey, items]) => {
        const [y, m, d] = dKey.split('-');
        const prefix = dKey === todayKey ? 'Hoje — ' : dKey === yesterdayKey ? 'Ontem — ' : '';
        return {
          dateKey: dKey,
          dateLabel: `${prefix}${d}/${m}/${y}`,
          ...calcBucket(items),
          items,
        };
      });

    return {
      todayStats,
      yesterdayStats,
      last7dStats,
      monthStats,
      chartDays,
      maxChartUnits,
      topProducts,
      dailyGroups,
    };
  }, [dailySalesOrders, salesChannelFilter, currentMonth, savedFts, channelDefaults, overrides]);

  return (
    <div className="page-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Bot size={28} color="var(--accent-primary)" />
            IA de Ads, Promoções &amp; Concorrentes
          </h1>
          <p className="page-description">
            Copiloto inteligente com Escudo de Margem Mínima para Mercado Livre e Shopee.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <input
            type="month"
            value={currentMonth}
            onChange={(e) => setCurrentMonth(e.target.value)}
            style={{
              padding: '0.48rem 0.8rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              fontWeight: 700,
            }}
          />
          <button
            type="button"
            onClick={() => setShowDailySalesPanel((p) => !p)}
            style={{
              padding: '0.52rem 1rem',
              borderRadius: '8px',
              border: 'none',
              background: showDailySalesPanel
                ? 'linear-gradient(135deg, #2563EB, #7C3AED)'
                : 'linear-gradient(135deg, #059669, #10B981)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: '7px',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
            }}
          >
            {showDailySalesPanel ? (
              <>
                <Sliders size={16} />
                🤖 Abrir Controles de Preços &amp; Ads (ML / Shopee) →
              </>
            ) : (
              <>
                <TrendingUp size={16} />
                ← 📈 Voltar ao Resumo de Vendas Diárias
              </>
            )}
          </button>
          {!showDailySalesPanel && (
            <>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowRulesPanel((p) => !p)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
              >
                <Sliders size={16} />
                {showRulesPanel ? 'Ocultar Travas de Margem' : '🛡️ Configurar Travas de Margem'}
              </button>
              <button
                type="button"
                onClick={handleSyncPromosAndAds}
                disabled={syncingPromosAds}
                style={{
                  padding: '0.52rem 0.95rem',
                  borderRadius: '8px',
                  border: activeChannel === 'shopee' ? '1px solid #EA580C' : '1px solid #EAB308',
                  background: activeChannel === 'shopee' ? '#EE4D2D' : '#FFE600',
                  color: activeChannel === 'shopee' ? '#fff' : '#1F2937',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  cursor: syncingPromosAds ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title={
                  activeChannel === 'shopee'
                    ? 'Sincroniza anúncios, promoções e histórico de vendas da Shopee'
                    : 'Puxa a % de promoção ativa e os gastos de Product Ads (7, 15 e 30 dias) direto do Mercado Livre'
                }
              >
                <RefreshCw size={15} className={syncingPromosAds ? 'spin' : ''} />
                {syncingPromosAds
                  ? `Puxando ${activeChannel === 'shopee' ? 'Shopee' : 'ML'}...`
                  : activeChannel === 'shopee'
                  ? '📡 Puxar Promoções & Ads Shopee'
                  : '📡 Puxar Promoções & Ads (7/15/30d)'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCampaignsModal(true)}
                style={{ fontWeight: 700 }}
                title="Ver os 4 grupos estratégicos de Ads e quais produtos colocar em cada um"
              >
                {activeChannel === 'shopee'
                  ? '📊 Estratégia Shopee Ads (4 Grupos ROAS)'
                  : `📊 Campanhas Ads (${promosAdsCache?.campaigns?.length || 0})`}
              </button>
              <button
                type="button"
                onClick={() => setShowStandardizeModal(true)}
                style={{
                  padding: '0.52rem 0.95rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'linear-gradient(135deg, #7C3AED, #2563EB)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title="Recalcula todos os Preços de Cadastro (Venda / 0,70) e Preços de Venda (com 30% OFF garantindo 30% a 40% de margem líquida)"
              >
                🎯 Padronizar Preços (Cadastro + 30% OFF)
              </button>
            </>
          )}
        </div>
      </div>

      {/* VISÃO 1 (Padrão ao abrir): Painel Completo de Resumo & Histórico de Vendas Diárias */}
      {showDailySalesPanel ? (
        <div
          className="card"
          style={{
            padding: '1.35rem 1.5rem',
            border: '1px solid rgba(16, 185, 129, 0.35)',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.04), rgba(37, 99, 235, 0.03))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '0.96rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                📈 Resumo &amp; Histórico de Vendas Diárias
              </strong>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(16, 185, 129, 0.14)',
                  color: '#047857',
                }}
              >
                🟢 Sinc. 1h/1h ativa
                {lastHourlySyncLog?.created_at
                  ? ` • Última: ${new Date(lastHourlySyncLog.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </span>
              <button
                type="button"
                onClick={handleRunHourlyOrderSyncNow}
                disabled={runningOrderSyncNow}
                style={{
                  padding: '2px 9px',
                  borderRadius: '999px',
                  border: '1px solid rgba(37, 99, 235, 0.35)',
                  background: 'var(--bg-surface)',
                  color: '#2563EB',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: runningOrderSyncNow ? 'wait' : 'pointer',
                }}
              >
                {runningOrderSyncNow ? '⏳ Sincronizando...' : '🔄 Atualizar Vendas Agora'}
              </button>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { id: 'all', label: '🌐 Todos (ML + Shopee)' },
                { id: 'ml', label: '📦 Só Mercado Livre' },
                { id: 'shopee', label: '🛍️ Só Shopee' },
              ].map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setSalesChannelFilter(ch.id)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '999px',
                    border: '1px solid var(--border-color)',
                    background: salesChannelFilter === ch.id ? 'var(--accent-primary)' : 'var(--bg-surface)',
                    color: salesChannelFilter === ch.id ? '#fff' : 'var(--text-primary)',
                    fontSize: '0.73rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {ch.label}
                </button>
              ))}
            </div>
          </div>

          {/* 4 KPI Cards de Vendas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: '10px', marginBottom: '14px' }}>
            {[
              { title: 'VENDAS HOJE', stats: dailySalesIntel.todayStats, color: '#059669' },
              { title: 'VENDAS ONTEM', stats: dailySalesIntel.yesterdayStats, color: '#2563EB' },
              { title: 'ÚLTIMOS 7 DIAS', stats: dailySalesIntel.last7dStats, color: '#7C3AED' },
              { title: `MÊS (${currentMonth})`, stats: dailySalesIntel.monthStats, color: '#EA580C' },
            ].map((card) => (
              <div
                key={card.title}
                style={{
                  padding: '0.75rem 0.9rem',
                  borderRadius: '10px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: card.color }}>{card.title}</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '3px' }}>
                  {card.stats.units} un • {formatBRL(card.stats.rev)}
                </div>
                <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#059669', marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span>💰 Lucro: {formatBRL(card.stats.profit)}</span>
                  <span
                    style={{
                      fontSize: '0.66rem',
                      padding: '1px 6px',
                      borderRadius: '999px',
                      background: 'rgba(16, 185, 129, 0.14)',
                      color: '#047857',
                    }}
                  >
                    {card.stats.marginPerc.toFixed(1)}%
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  📦 ML: <strong>{card.stats.mlUnits}</strong> un • 🛍️ Shopee: <strong>{card.stats.shpUnits}</strong> un
                </div>
              </div>
            ))}
          </div>

          {/* Gráfico Diário Moderno (14 dias) + Gráfico Pizza % Gastos E-commerce + Top Produtos Vendidos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(310px, 1fr))', gap: '14px', marginBottom: '14px' }}>
            {/* 1. Gráfico Moderno de Evolução Diária (Padrão Roxo + Azul + Verde) */}
            <div style={{ padding: '1rem 1.1rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
                <div>
                  <strong style={{ fontSize: '0.84rem', display: 'block' }}>📊 Evolução Diária (Últimos 14 Dias)</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Unidades vendidas por canal e dia</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.72rem', fontWeight: 700 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#6366F1' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'linear-gradient(135deg, #60A5FA, #6366F1)', display: 'inline-block' }} />
                    Mercado Livre
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#7C3AED' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'linear-gradient(135deg, #A78BFA, #7C3AED)', display: 'inline-block' }} />
                    Shopee
                  </span>
                </div>
              </div>

              <div style={{ position: 'relative', height: '148px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingTop: '18px' }}>
                {/* Linhas guias horizontais */}
                {[0.25, 0.5, 0.75, 1].map((lvl) => (
                  <div
                    key={lvl}
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: `${Math.round(lvl * 96) + 22}px`,
                      borderTop: '1px dashed rgba(139, 92, 246, 0.14)',
                      pointerEvents: 'none',
                    }}
                  />
                ))}

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '7px', height: '120px', position: 'relative', zIndex: 1 }}>
                  {dailySalesIntel.chartDays.map((d) => {
                    const totalH = Math.round((d.units / dailySalesIntel.maxChartUnits) * 92);
                    const mlH = d.units > 0 ? Math.round((d.mlUnits / d.units) * totalH) : 0;
                    const shpH = Math.max(0, totalH - mlH);
                    return (
                      <div
                        key={d.dateKey}
                        style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px' }}
                        title={`${d.label}: ${d.units} un (${formatBRL(d.rev)} | Lucro: ${formatBRL(d.profit)}) — ML: ${d.mlUnits} | Shopee: ${d.shpUnits}`}
                      >
                        <span
                          style={{
                            fontSize: '0.66rem',
                            fontWeight: 800,
                            padding: d.units > 0 ? '1px 5px' : '0',
                            borderRadius: '999px',
                            background: d.units > 0 ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
                            color: d.units > 0 ? '#6D28D9' : 'transparent',
                            minHeight: '16px',
                          }}
                        >
                          {d.units > 0 ? d.units : '·'}
                        </span>
                        <div
                          style={{
                            width: '100%',
                            maxWidth: '22px',
                            height: '92px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'flex-end',
                            borderRadius: '999px',
                            overflow: 'hidden',
                            background: 'linear-gradient(180deg, rgba(139, 92, 246, 0.05) 0%, rgba(96, 165, 250, 0.10) 100%)',
                            border: '1px solid rgba(139, 92, 246, 0.12)',
                            padding: '2px',
                            gap: '2px',
                          }}
                        >
                          {shpH > 0 && (
                            <div
                              style={{
                                height: `${Math.max(6, shpH)}px`,
                                borderRadius: '999px',
                                background: 'linear-gradient(180deg, #A78BFA 0%, #7C3AED 100%)',
                                boxShadow: '0 2px 6px rgba(124, 58, 237, 0.25)',
                                transition: 'height 0.3s ease',
                              }}
                            />
                          )}
                          {mlH > 0 && (
                            <div
                              style={{
                                height: `${Math.max(6, mlH)}px`,
                                borderRadius: '999px',
                                background: 'linear-gradient(180deg, #60A5FA 0%, #3B82F6 100%)',
                                boxShadow: '0 2px 6px rgba(59, 130, 246, 0.25)',
                                transition: 'height 0.3s ease',
                              }}
                            />
                          )}
                        </div>
                        <span style={{ fontSize: '0.64rem', fontWeight: 700, color: d.units > 0 ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                          {d.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* 2. Gráfico Pizza (Donut) — % de Gastos & Lucro do E-commerce no Mês */}
            {(() => {
              const ms = dailySalesIntel.monthStats;
              const rev = Math.max(0, Number(ms.rev || 0));
              const mktFee = Math.max(0, Number(ms.mktFeeCost || 0));
              const prod = Math.max(0, Number(ms.prodCost || 0));
              const pack = Math.max(0, Number(ms.packShipCost || 0) + Number(ms.taxCost || 0));
              const profit = Math.max(0, Number(ms.profit || 0));
              const totalBase = Math.max(0.01, mktFee + prod + pack + profit);

              const pctMkt = (mktFee / totalBase) * 100;
              const pctProd = (prod / totalBase) * 100;
              const pctPack = (pack / totalBase) * 100;
              const pctProfit = Math.max(0, 100 - pctMkt - pctProd - pctPack);
              const totalGastosPct = rev > 0 ? ((mktFee + prod + pack) / rev) * 100 : 0;

              const c1 = pctMkt;
              const c2 = c1 + pctProd;
              const c3 = c2 + pctPack;

              const slices = [
                { label: 'Taxas & Comissões (ML/Shopee)', val: mktFee, pct: pctMkt, color: '#8B5CF6' },
                { label: 'Custo Produção 3D (Filamento/Luz)', val: prod, pct: pctProd, color: '#3B82F6' },
                { label: 'Embalagem, Envio & Extras', val: pack, pct: pctPack, color: '#38BDF8' },
                { label: 'Lucro Líquido Real', val: profit, pct: pctProfit, color: '#10B981' },
              ];

              return (
                <div style={{ padding: '1rem 1.1rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <div>
                      <strong style={{ fontSize: '0.84rem', display: 'block' }}>🍩 % de Gastos &amp; Lucro E-commerce ({currentMonth})</strong>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Para onde vai cada R$ vendido nos marketplaces</span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(139, 92, 246, 0.12)',
                        color: '#7C3AED',
                      }}
                    >
                      Gastos: {totalGastosPct.toFixed(1)}%
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', margin: 'auto 0' }}>
                    {/* Donut Chart com conic-gradient */}
                    <div
                      style={{
                        width: '122px',
                        height: '122px',
                        borderRadius: '50%',
                        background:
                          rev > 0
                            ? `conic-gradient(#8B5CF6 0% ${c1.toFixed(1)}%, #3B82F6 ${c1.toFixed(1)}% ${c2.toFixed(1)}%, #38BDF8 ${c2.toFixed(1)}% ${c3.toFixed(1)}%, #10B981 ${c3.toFixed(1)}% 100%)`
                            : 'rgba(148,163,184,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(139, 92, 246, 0.15)',
                      }}
                    >
                      <div
                        style={{
                          width: '78px',
                          height: '78px',
                          borderRadius: '50%',
                          background: 'var(--bg-surface)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          textAlign: 'center',
                          padding: '4px',
                        }}
                      >
                        <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-secondary)', lineHeight: 1.1 }}>Lucro</span>
                        <span style={{ fontSize: '0.92rem', fontWeight: 900, color: '#059669', lineHeight: 1.2 }}>
                          {pctProfit.toFixed(1)}%
                        </span>
                        <span style={{ fontSize: '0.58rem', color: 'var(--text-secondary)' }}>Gastos {totalGastosPct.toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* Legenda Detalhada */}
                    <div style={{ flex: 1, minWidth: '170px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {slices.map((s) => (
                        <div
                          key={s.label}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            fontSize: '0.73rem',
                            gap: '6px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                            <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.label}
                            </span>
                          </div>
                          <div style={{ whiteSpace: 'nowrap', fontWeight: 800 }}>
                            <span style={{ color: s.color }}>{s.pct.toFixed(1)}%</span>{' '}
                            <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.69rem' }}>
                              ({formatBRL(s.val)})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 3. Top Produtos Mais Vendidos no Mês */}
            <div style={{ padding: '1rem 1.1rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
              <strong style={{ fontSize: '0.84rem', display: 'block', marginBottom: '8px' }}>
                🏆 Top Produtos Vendidos ({currentMonth})
              </strong>
              {dailySalesIntel.topProducts.length === 0 ? (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', padding: '1rem 0' }}>
                  Nenhuma venda registrada neste filtro/mês.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {dailySalesIntel.topProducts.map((tp, idx) => (
                    <div
                      key={tp.ftId + idx}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        fontSize: '0.76rem',
                        padding: '6px 10px',
                        borderRadius: '8px',
                        background: 'var(--bg-secondary)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                        <span className="badge" style={{ fontSize: '0.68rem' }}>{tp.ftId}</span>
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                          {tp.nome}
                        </span>
                      </div>
                      <div style={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
                        {tp.units} un <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>({tp.mlUnits} ML / {tp.shpUnits} SHP)</span> •{' '}
                        <span style={{ color: 'var(--text-primary)' }}>{formatBRL(tp.rev)}</span> •{' '}
                        <span style={{ color: '#059669' }}>Lucro: {formatBRL(tp.profit)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Histórico Diário Detalhado em Linhas (Tabela Dia + Cada Linha um Produto Vendido) */}
          <div style={{ padding: '1rem 1.15rem', borderRadius: '12px', background: 'var(--bg-surface)', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
              <strong style={{ fontSize: '0.9rem' }}>
                🗓️ Histórico de Vendas Dia a Dia (Cada linha = 1 produto vendido)
              </strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#047857', display: 'inline-block' }} />
                  &gt; 35% (Excelente)
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#34D399', display: 'inline-block' }} />
                  25% a 35% (Saudável)
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#FBBF24', display: 'inline-block' }} />
                  15% a 25% (Atenção)
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#EF4444', display: 'inline-block' }} />
                  &lt; 15% (Crítica)
                </span>
              </div>
            </div>
            {dailySalesIntel.dailyGroups.length === 0 ? (
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Nenhuma venda sincronizada ainda.</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left', borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ padding: '9px 12px', fontWeight: 800 }}>Data / Hora</th>
                      <th style={{ padding: '9px 12px', fontWeight: 800 }}>Canal</th>
                      <th style={{ padding: '9px 12px', fontWeight: 800 }}>FT</th>
                      <th style={{ padding: '9px 12px', fontWeight: 800 }}>Produto Vendido</th>
                      <th style={{ padding: '9px 12px', fontWeight: 800 }}>Variação</th>
                      <th style={{ padding: '9px 12px', fontWeight: 800, textAlign: 'center' }}>Qtd</th>
                      <th style={{ padding: '9px 12px', fontWeight: 800, textAlign: 'right' }}>Preço Unit.</th>
                      <th style={{ padding: '9px 12px', fontWeight: 800, textAlign: 'right' }}>Total Venda</th>
                      <th style={{ padding: '9px 12px', fontWeight: 800, textAlign: 'right' }}>Lucro Líquido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dailySalesIntel.dailyGroups.flatMap((dg) => [
                      <tr
                        key={`hdr_${dg.dateKey}`}
                        style={{
                          background: 'rgba(139, 92, 246, 0.07)',
                          borderTop: '1px solid var(--border-color)',
                          borderBottom: '1px solid var(--border-color)',
                        }}
                      >
                        <td colSpan={9} style={{ padding: '7px 12px', fontWeight: 800, fontSize: '0.8rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ color: '#6D28D9' }}>📅 {dg.dateLabel}</span>
                            <span>
                              Total do Dia: <strong>{dg.units} un.</strong> • Faturamento: <strong>{formatBRL(dg.rev)}</strong> •{' '}
                              <span style={{ color: '#059669' }}>
                                💰 Lucro do Dia: <strong>{formatBRL(dg.profit)}</strong> ({dg.marginPerc.toFixed(1)}%)
                              </span>{' '}
                              <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                                (📦 {dg.mlUnits} ML | 🛍️ {dg.shpUnits} Shopee)
                              </span>
                            </span>
                          </div>
                        </td>
                      </tr>,
                      ...dg.items.map((it) => {
                        const rowRev = Number(it.quantity || 0) * Number(it.unit_price || 0);
                        const rowMargin = rowRev > 0 ? (Number(it.orderProfit || 0) / rowRev) * 100 : 0;
                        const dotInfo =
                          rowMargin > 35
                            ? { bg: '#047857', ring: 'rgba(4, 120, 87, 0.25)', text: '#047857', label: 'Margem Excelente (> 35%)' }
                            : rowMargin >= 25
                            ? { bg: '#34D399', ring: 'rgba(52, 211, 153, 0.30)', text: '#059669', label: 'Margem Saudável (25% a 35%)' }
                            : rowMargin >= 15
                            ? { bg: '#FBBF24', ring: 'rgba(251, 191, 36, 0.32)', text: '#D97706', label: 'Margem de Atenção (15% a 25%)' }
                            : { bg: '#EF4444', ring: 'rgba(239, 68, 68, 0.28)', text: '#DC2626', label: 'Margem Crítica (< 15%)' };
                        return (
                          <tr
                            key={`${it.platform}_${it.order_id}_${it.order_item_key}`}
                            style={{ borderBottom: '1px solid var(--border-color)' }}
                          >
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 600 }}>
                              {dg.dateKey.split('-').reverse().join('/')} • {it.timeStr}
                            </td>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                              <span
                                style={{
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  fontSize: '0.72rem',
                                  fontWeight: 800,
                                  background: it.platform === 'shopee' ? 'rgba(139, 92, 246, 0.14)' : 'rgba(59, 130, 246, 0.14)',
                                  color: it.platform === 'shopee' ? '#6D28D9' : '#1D4ED8',
                                }}
                              >
                                {it.platform === 'shopee' ? '🛍️ Shopee' : '📦 Mercado Livre'}
                              </span>
                            </td>
                            <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>
                              {it.ft_id ? <span className="badge" style={{ fontSize: '0.72rem' }}>{it.ft_id}</span> : '—'}
                            </td>
                            <td style={{ padding: '8px 12px', fontWeight: 700, color: 'var(--text-primary)' }}>
                              {it.ftNome}
                            </td>
                            <td style={{ padding: '8px 12px', color: '#7C3AED', fontWeight: 700 }}>
                              {it.variation_name || '—'}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 800 }}>
                              {it.quantity}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                              {formatBRL(it.unit_price)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>
                              {formatBRL(rowRev)}
                            </td>
                            <td style={{ padding: '8px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 800 }}>
                              <span
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', color: dotInfo.text }}
                                title={dotInfo.label}
                              >
                                <span
                                  style={{
                                    width: '10px',
                                    height: '10px',
                                    borderRadius: '50%',
                                    background: dotInfo.bg,
                                    boxShadow: `0 0 0 3px ${dotInfo.ring}`,
                                    display: 'inline-block',
                                    flexShrink: 0,
                                  }}
                                />
                                <span>{formatBRL(it.orderProfit)}</span>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                                  ({rowMargin.toFixed(1)}%)
                                </span>
                              </span>
                            </td>
                          </tr>
                        );
                      }),
                    ])}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Abas de Canal (Mercado Livre / Shopee) */}
          <div className="channels-tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`channel-tab ${activeChannel === 'ml' ? 'active' : ''}`}
              onClick={() => setActiveChannel('ml')}
            >
              <span className="icon">📦</span>
              <span className="label">Mercado Livre (Promoções &amp; Product Ads)</span>
            </button>
            <button
              type="button"
              className={`channel-tab ${activeChannel === 'shopee' ? 'active' : ''}`}
              onClick={() => setActiveChannel('shopee')}
            >
              <span className="icon">🛍️</span>
              <span className="label">Shopee (Ofertas &amp; Shopee Ads)</span>
            </button>
          </div>

      {/* Painel 1: Escudo de Margem (Trava Financeira) */}
      {showRulesPanel && (
        <div
          className="card"
          style={{
            padding: '1.15rem 1.35rem',
            border: '1px solid rgba(124, 58, 237, 0.35)',
            background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.05), rgba(16, 185, 129, 0.04))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={20} color="#7C3AED" />
              <strong style={{ fontSize: '0.96rem' }}>
                🛡️ Escudo de Margem &amp; Regras do Agente (Trava Anti-Prejuízo)
              </strong>
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              O sistema calcula o <strong>Preço Piso</strong> de cada FT somando Produção + Embalagem + Taxa Fixa + Comissão + Ads + Sua Margem Mínima.
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
              gap: '12px',
              marginBottom: '12px',
            }}
          >
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#DC2626', display: 'block', marginBottom: '4px' }}>
                🛡️ Margem Mínima (%)
              </label>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input
                  type="number"
                  min="0"
                  max="60"
                  step="0.5"
                  value={rules.margemMinimaPerc}
                  onChange={(e) => handleRuleChange('margemMinimaPerc', e.target.value)}
                  onBlur={(e) => handleCheckMinMarginAlert(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCheckMinMarginAlert(e.currentTarget.value); }}
                  style={ruleInputStyle}
                  title="Trava rígida: nenhum produto ou promoção pode ficar abaixo desta margem"
                />
                <button
                  type="button"
                  onClick={() => handleCheckMinMarginAlert(rules.margemMinimaPerc)}
                  style={{
                    padding: '0 8px',
                    borderRadius: '8px',
                    border: '1px solid #FCA5A5',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                  title="Verificar imediatamente quais anúncios estão abaixo desta Margem Mínima"
                >
                  Verificar
                </button>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', display: 'block', marginBottom: '4px' }}>
                🟢 Margem Saudável (%)
              </label>
              <input
                type="number"
                min="0"
                max="70"
                step="0.5"
                value={rules.margemSaudavelPerc ?? rules.margemMinimaPerc}
                onChange={(e) => handleRuleChange('margemSaudavelPerc', e.target.value)}
                style={ruleInputStyle}
                title="Meta verde: itens entre a Mínima e a Saudável ficam em amarelo (atenção)"
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Desconto Máx. s/ Preço Atual (%)
              </label>
              <input
                type="number"
                min="0"
                max="50"
                step="1"
                value={rules.maxDescontoCadastroPerc}
                onChange={(e) => handleRuleChange('maxDescontoCadastroPerc', e.target.value)}
                style={ruleInputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                ACOS Máx. Alvo em Ads (%)
              </label>
              <input
                type="number"
                min="1"
                max="35"
                step="0.5"
                value={rules.acosAlvoPerc}
                onChange={(e) => handleRuleChange('acosAlvoPerc', e.target.value)}
                style={ruleInputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Estoque Alto p/ Girar c/ Promo (un)
              </label>
              <input
                type="number"
                min="1"
                value={rules.estoqueAltoGiroMin}
                onChange={(e) => handleRuleChange('estoqueAltoGiroMin', e.target.value)}
                style={ruleInputStyle}
              />
            </div>

            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Orçamento Diário Máx. Ads (R$)
              </label>
              <input
                type="number"
                min="0"
                value={
                  activeChannel === 'ml'
                    ? rules.orcamentoDiarioMaxMl
                    : rules.orcamentoDiarioMaxShopee
                }
                onChange={(e) =>
                  handleRuleChange(
                    activeChannel === 'ml'
                      ? 'orcamentoDiarioMaxMl'
                      : 'orcamentoDiarioMaxShopee',
                    e.target.value
                  )
                }
                style={ruleInputStyle}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                🧠 Regras da Minha Loja (Instruções extras para a IA)
              </label>
              <input
                type="text"
                value={rules.regrasPersonalizadas || ''}
                onChange={(e) => handleRuleChange('regrasPersonalizadas', e.target.value)}
                placeholder="Ex: Nos chaveiros religiosos manter no mínimo 20% de margem..."
                style={ruleInputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="password"
                value={rules.geminiApiKey || ''}
                onChange={(e) => handleRuleChange('geminiApiKey', e.target.value)}
                placeholder="Chave Gemini API (opcional p/ texto)"
                style={{ ...ruleInputStyle, flex: 1 }}
                title="Opcional: insira uma chave gratuita do Google AI Studio para relatórios em texto corrido"
              />
              <button
                type="button"
                onClick={handleGenerateGeminiReport}
                disabled={loadingAiReport}
                style={{
                  padding: '0.52rem 0.9rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(124,58,237,0.4)',
                  background: 'rgba(124,58,237,0.12)',
                  color: '#7C3AED',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {loadingAiReport ? 'Gerando...' : '✨ Relatório IA'}
              </button>
            </div>
          </div>

          {aiReportText && (
            <div
              style={{
                marginTop: '12px',
                padding: '12px 14px',
                borderRadius: '8px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                fontSize: '0.83rem',
                whiteSpace: 'pre-line',
                lineHeight: 1.55,
                position: 'relative',
              }}
            >
              <button
                type="button"
                onClick={() => setAiReportText('')}
                style={{ position: 'absolute', top: '8px', right: '8px', border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
              <strong>📋 Plano Estratégico Gerado pela IA:</strong>
              <div style={{ marginTop: '6px' }}>{aiReportText}</div>
            </div>
          )}
        </div>
      )}

      {/* Cards de Resumo / Semáforo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        <div
          className="card"
          onClick={() => setStatusFilter('all')}
          style={{ padding: '1rem', cursor: 'pointer', border: statusFilter === 'all' ? '2px solid var(--accent-primary)' : undefined }}
        >
          <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 700 }}>
            PRODUTOS ANALISADOS
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, marginTop: '4px' }}>
            {summaryStats.total}
          </div>
        </div>

        <div
          className="card"
          onClick={() => setStatusFilter('critico')}
          style={{ padding: '1rem', cursor: 'pointer', border: statusFilter === 'critico' ? '2px solid #DC2626' : undefined }}
        >
          <span style={{ fontSize: '0.76rem', color: '#DC2626', fontWeight: 700 }}>
            🔴 ALERTA / ABAIXO DO PISO
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>
            {summaryStats.criticos}
          </div>
        </div>

        <div
          className="card"
          onClick={() => setStatusFilter('atencao')}
          style={{ padding: '1rem', cursor: 'pointer', border: statusFilter === 'atencao' ? '2px solid #D97706' : undefined }}
        >
          <span style={{ fontSize: '0.76rem', color: '#D97706', fontWeight: 700 }}>
            🟡 ABAIXO DA SAUDÁVEL
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#D97706', marginTop: '4px' }}>
            {summaryStats.atencao}
          </div>
        </div>

        <div
          className="card"
          onClick={() => setStatusFilter('oportunidade')}
          style={{ padding: '1rem', cursor: 'pointer', border: statusFilter === 'oportunidade' ? '2px solid #2563EB' : undefined }}
        >
          <span style={{ fontSize: '0.76rem', color: '#2563EB', fontWeight: 700 }}>
            🎯 OPORTUNIDADES (PROMO / ATAQUE)
          </span>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563EB', marginTop: '4px' }}>
            {summaryStats.oportunidades}
          </div>
        </div>

        <div
          className="card"
          onClick={() => setStatusFilter('saudavel')}
          style={{ padding: '1rem', cursor: 'pointer', border: statusFilter === 'saudavel' ? '2px solid #059669' : undefined }}
        >
          <span style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 700 }}>
            🟢 SAUDÁVEIS • GASTO ADS MÊS
          </span>
          <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#059669', marginTop: '4px' }}>
            {summaryStats.saudaveis} un • {formatBRL(summaryStats.totalAdsGasto)}
          </div>
        </div>
      </div>

      {/* Tabela Principal do Copiloto IA */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setOnlyCadastrados((p) => !p)}
              style={{
                padding: '0.45rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: onlyCadastrados ? 'var(--success)' : 'var(--bg-secondary)',
                color: onlyCadastrados ? '#fff' : 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              {onlyCadastrados ? '✅ Apenas No Ar no Canal' : '☐ Todos do Catálogo'}
            </button>

            <div style={{ display: 'inline-flex', alignItems: 'center', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
              {[7, 15, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setAdsPeriod(d)}
                  style={{
                    padding: '0.42rem 0.75rem',
                    border: 'none',
                    background: adsPeriod === d ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                    color: adsPeriod === d ? '#fff' : 'var(--text-primary)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Ads {d}d
                </button>
              ))}
            </div>

            {promosAdsNote && (
              <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                {promosAdsNote}
              </span>
            )}

            {statusFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Limpar filtro ({statusFilter}) ×
              </button>
            )}
          </div>

          <div className="search-bar" style={{ maxWidth: '280px', margin: 0 }}>
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar FT, peça ou SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
            Calculando custos, margens e recomendações da IA...
          </div>
        ) : (
          <div className="table-responsive">
            <table className="fts-table">
              <thead>
                <tr>
                  <th>ID / Produto</th>
                  <th style={{ textAlign: 'center' }}>Est. / Vendas</th>
                  <th style={{ textAlign: 'center' }} title="Preço mínimo que garante sua Margem Líquida Mínima">
                    🛡️ Preço Piso ({rules.margemMinimaPerc}%)
                  </th>
                  <th style={{ textAlign: 'center' }}>Preço Atual &amp; Folga</th>
                  <th style={{ textAlign: 'center' }}>Gasto Ads (R$) / ACOS</th>
                  <th style={{ textAlign: 'center' }}>Margem Real</th>
                  <th style={{ textAlign: 'center' }}>🏷️ Promoção Vigente</th>
                  <th>🤖 Diagnóstico &amp; Ação (Copiloto IA)</th>
                </tr>
              </thead>
              <tbody>
                {analyzedRows.map((row) => {
                  const { metrics, aiRec, competitor } = row;
                  const isCritico = aiRec.severity === 'critico';
                  const isAtencao = aiRec.severity === 'atencao';
                  const isOportunidade = aiRec.severity === 'oportunidade';

                  return (
                    <tr
                      key={row.rowKey || row.ftId}
                      style={
                        isCritico
                          ? { background: 'rgba(239, 68, 68, 0.06)' }
                          : isAtencao
                          ? { background: 'rgba(245, 158, 11, 0.08)' }
                          : isOportunidade
                          ? { background: 'rgba(37, 99, 235, 0.04)' }
                          : { background: 'rgba(16, 185, 129, 0.03)' }
                      }
                    >
                      {/* Produto */}
                      <td style={{ minWidth: '210px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span className="badge">{row.ftId}</span>
                            <strong style={{ fontSize: '0.86rem' }}>{row.nomePeca}</strong>
                            {row.variacaoNome && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 800,
                                  padding: '1px 7px',
                                  borderRadius: '999px',
                                  background: 'rgba(124, 58, 237, 0.14)',
                                  color: '#7C3AED',
                                }}
                              >
                                🎨 {row.variacaoNome}
                              </span>
                            )}
                          </div>
                          {row.sku && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              🏷️ SKU: {row.sku}
                            </span>
                          )}
                          {row.primaryMl?.ml_item_id && activeChannel === 'ml' && (
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                              ML: {row.primaryMl.ml_item_id}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Estoque e Vendas */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                          📦 {row.estoqueTotal} un
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          🛒 {row.vendasMes} no mês
                        </div>
                        {row.variacaoNome && row.vendasMesFtTotal !== undefined && row.vendasMesFtTotal !== row.vendasMes && (
                          <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', opacity: 0.8 }}>
                            (Total FT: {row.vendasMesFtTotal})
                          </div>
                        )}
                      </td>

                      {/* Preço Piso Dinâmico (por fase) */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(124, 58, 237, 0.12)',
                            color: '#7C3AED',
                            fontWeight: 800,
                            fontSize: '0.86rem',
                          }}
                          title={`Mínima travada: ${row.dynamicMargin?.targetPerc}% (${formatBRL(metrics.precoPiso)}) | Saudável: ${metrics.margemSaudavelPerc}% (${formatBRL(metrics.precoSaudavel)})`}
                        >
                          {formatBRL(metrics.precoPiso)} (Mín {row.dynamicMargin?.targetPerc}%)
                        </div>
                        {metrics.margemSaudavelPerc > row.dynamicMargin?.targetPerc && (
                          <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#059669', marginTop: '2px' }}>
                            🟢 Saudável: {formatBRL(metrics.precoSaudavel)} ({metrics.margemSaudavelPerc}%)
                          </div>
                        )}
                        <div style={{ fontSize: '0.67rem', fontWeight: 700, color: row.dynamicMargin?.color || 'var(--text-secondary)', marginTop: '2px' }}>
                          {row.dynamicMargin?.badge}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '2px' }}>
                          <span style={{ fontSize: '0.66rem', color: 'var(--text-secondary)' }}>
                            0%: {formatBRL(metrics.precoQueima)}
                          </span>
                        </div>
                      </td>

                      {/* Preço Atual, Promoção Ativa e Folga de Desconto */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>
                            {metrics.precoPraticado > 0 ? formatBRL(metrics.precoPraticado) : '—'}
                          </span>
                          {row.promoInfo?.promoPerc > 0 && (
                            <span
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '1px 6px',
                                borderRadius: '999px',
                                background: 'rgba(16, 185, 129, 0.16)',
                                color: '#059669',
                              }}
                              title={`Em promoção no ML! Preço cheio: ${formatBRL(row.promoInfo.originalPrice)}`}
                            >
                              -{row.promoInfo.promoPerc.toFixed(0)}% PROMO
                            </span>
                          )}
                        </div>
                        {row.promoInfo?.originalPrice > row.promoInfo?.price ? (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                            de {formatBRL(row.promoInfo.originalPrice)}
                          </div>
                        ) : (
                          metrics.precoBaseVenda > 0 &&
                          metrics.precoPraticado > metrics.precoBaseVenda + 0.5 && (
                            <div style={{ fontSize: '0.68rem', color: '#D97706', fontWeight: 700 }}>
                              Meta c/ -30%: {formatBRL(metrics.precoBaseVenda)}
                            </div>
                          )
                        )}
                        {metrics.descMaxSobrePraticadoPerc > 0 ? (
                          <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 700 }}>
                            Folga: até -{metrics.descMaxSobrePraticadoPerc.toFixed(0)}% OFF
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 700 }}>
                            0% folga (no limite)
                          </div>
                        )}
                      </td>

                      {/* Gasto em Ads (7d / 15d / 30d) */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        {row.adsPeriodStats ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                            <strong style={{ fontSize: '0.86rem' }}>
                              {adsPeriod}d: {formatBRL(row.adsPeriodStats[adsPeriod]?.cost || 0)}
                            </strong>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                              7d: {formatBRL(row.adsPeriodStats[7]?.cost || 0)} • 15d: {formatBRL(row.adsPeriodStats[15]?.cost || 0)} • 30d: {formatBRL(row.adsPeriodStats[30]?.cost || 0)}
                            </span>
                            <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                              {row.adsPeriodStats[adsPeriod]?.clicks || 0} cliques • ACOS {(row.adsPeriodStats[adsPeriod]?.acos || 0).toFixed(1)}%
                            </span>
                            {activeChannel === 'ml' && (promosAdsCache?.campaigns?.length || 0) > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '3px' }}>
                                <select
                                  disabled={updatingAdKey === (row.rowKey || row.ftId)}
                                  value={row.adsPeriodStats.campaignId || ''}
                                  onChange={(e) => handleMoveAdCampaign(row, e.target.value)}
                                  style={{
                                    maxWidth: '130px',
                                    padding: '2px 4px',
                                    borderRadius: '5px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.68rem',
                                  }}
                                  title="Mover este anúncio para outra campanha de Ads"
                                >
                                  <option value="">Sem campanha</option>
                                  {(promosAdsCache.campaigns || []).map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.name} ({c.acosTarget}%)
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={updatingAdKey === (row.rowKey || row.ftId)}
                                  onClick={() =>
                                    handleToggleAdStatus(
                                      row,
                                      row.adsPeriodStats.adStatus === 'active' ? 'paused' : 'active'
                                    )
                                  }
                                  style={{
                                    padding: '2px 6px',
                                    borderRadius: '5px',
                                    border: 'none',
                                    background:
                                      row.adsPeriodStats.adStatus === 'active'
                                        ? 'rgba(16,185,129,0.16)'
                                        : 'rgba(148,163,184,0.2)',
                                    color:
                                      row.adsPeriodStats.adStatus === 'active' ? '#059669' : '#64748B',
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                  }}
                                  title={
                                    row.adsPeriodStats.adStatus === 'active'
                                      ? 'Ads Ativo — Clique para pausar'
                                      : 'Ads Pausado — Clique para ativar'
                                  }
                                >
                                  {row.adsPeriodStats.adStatus === 'active' ? '▶️ Ativo' : '⏸️ Pausado'}
                                </button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>R$</span>
                              <input
                                type="number"
                                min="0"
                                step="0.5"
                                placeholder="0,00"
                                value={row.gastoAdsInput}
                                onChange={(e) =>
                                  handleAdsSpendChange(activeChannel, row.rowKey || row.ftId, e.target.value)
                                }
                                style={{
                                  width: '66px',
                                  padding: '3px 5px',
                                  borderRadius: '6px',
                                  border: '1px solid var(--border-color)',
                                  background: 'var(--bg-secondary)',
                                  color: 'var(--text-primary)',
                                  fontSize: '0.78rem',
                                  textAlign: 'right',
                                }}
                                title="Informe quanto este anúncio gastou em Ads ou clique em Puxar Promoções & Ads no topo"
                              />
                            </div>
                            {metrics.acosRealPerc > 0 && (
                              <div
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  color:
                                    metrics.acosRealPerc > parseNumber(rules.acosAlvoPerc)
                                      ? '#DC2626'
                                      : '#059669',
                                  marginTop: '2px',
                                }}
                              >
                                ACOS: {metrics.acosRealPerc.toFixed(1)}%
                              </div>
                            )}
                            {activeChannel === 'shopee' && (
                              <div style={{ marginTop: '4px' }}>
                                <select
                                  value={shopeeAdsGroupMap[row.rowKey || row.ftId] ?? shopeeAdsGroupMap[row.ftId] ?? ''}
                                  onChange={(e) => handleShopeeAdsGroupChange(row.rowKey || row.ftId, e.target.value)}
                                  style={{
                                    maxWidth: '140px',
                                    padding: '2px 4px',
                                    borderRadius: '5px',
                                    border: '1px solid var(--border-color)',
                                    background: 'var(--bg-secondary)',
                                    color: 'var(--text-primary)',
                                    fontSize: '0.67rem',
                                    fontWeight: 700,
                                  }}
                                  title="Marque em qual dos 4 grupos ROAS do Shopee Ads este item está rodando"
                                >
                                  <option value="">Grupo Shopee Ads...</option>
                                  <option value="campeoes">🏆 Campeões (ROAS 12,5)</option>
                                  <option value="giro">📦 Giro (ROAS 8,3)</option>
                                  <option value="lancamentos">🚀 Lançamentos (ROAS 6,7)</option>
                                  <option value="defesa">🛡️ Defesa (ROAS 16,5)</option>
                                  <option value="pausado">⏸️ Pausado / Sem Ads</option>
                                </select>
                              </div>
                            )}
                          </>
                        )}
                      </td>

                      {/* Margem Líquida Pós-Ads */}
                      <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: '0.9rem',
                            color:
                              metrics.margemPosAdsPerc >= parseNumber(rules.margemSaudavelPerc ?? rules.margemMinimaPerc) - 0.2
                                ? '#059669'
                                : metrics.margemPosAdsPerc >= parseNumber(rules.margemMinimaPerc) - 0.2
                                ? '#D97706'
                                : '#DC2626',
                          }}
                        >
                          {metrics.precoPraticado > 0
                            ? `${metrics.margemPosAdsPerc.toFixed(1)}%`
                            : '—'}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                          {metrics.precoPraticado > 0
                            ? formatBRL(metrics.lucroLiquidoPosAds)
                            : ''}
                        </div>
                      </td>

                      {/* Promoção Vigente & Convites da Central de Promoções ML */}
                      <td style={{ textAlign: 'center', minWidth: '175px' }}>
                        {(() => {
                          const activePromos = row.promoInfo?.activePromos || [];
                          const candidatePromos = row.promoInfo?.candidatePromos || [];
                          const hasPromoPerc = (row.promoInfo?.promoPerc || 0) >= 0.5;
                          const nonIndividualInvites = candidatePromos.filter(
                            (p) => p.type !== 'PRICE_DISCOUNT'
                          );

                          return (
                            <div
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px',
                                alignItems: 'center',
                              }}
                            >
                              {activePromos.length > 0 ? (
                                activePromos.map((ap) => (
                                  <div
                                    key={ap.id}
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: '1px',
                                      padding: '3px 7px',
                                      borderRadius: '6px',
                                      background: 'rgba(16, 185, 129, 0.12)',
                                      border: '1px solid rgba(16, 185, 129, 0.3)',
                                      width: '100%',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        color: '#059669',
                                      }}
                                    >
                                      🟢 {ap.label}
                                      {ap.discountPerc > 0
                                        ? ` (-${ap.discountPerc.toFixed(0)}%)`
                                        : ''}
                                    </span>
                                    {ap.originalPrice > (ap.price || row.promoInfo?.price || 0) && (
                                      <span
                                        style={{
                                          fontSize: '0.66rem',
                                          color: 'var(--text-secondary)',
                                        }}
                                      >
                                        De {formatBRL(ap.originalPrice)} por{' '}
                                        <strong>
                                          {formatBRL(ap.price || row.promoInfo?.price)}
                                        </strong>
                                      </span>
                                    )}
                                    {ap.meliPercentage > 0 && (
                                      <span
                                        style={{
                                          fontSize: '0.64rem',
                                          fontWeight: 700,
                                          color: '#7C3AED',
                                        }}
                                      >
                                        🎁 ML co-participa {ap.meliPercentage}%
                                      </span>
                                    )}
                                    <button
                                      type="button"
                                      disabled={applyingFtId === (row.rowKey || row.ftId)}
                                      onClick={async () => {
                                        if (
                                          !window.confirm(
                                            `Deseja retirar o anúncio ${row.primaryMl?.ml_item_id} da promoção "${ap.label}" no Mercado Livre?`
                                          )
                                        )
                                          return;
                                        const key = row.rowKey || row.ftId;
                                        setApplyingFtId(key);
                                        try {
                                          await removeMlSellerPromotion({
                                            mlItemId: row.primaryMl.ml_item_id,
                                            promotionId: ap.id,
                                            promotionType: ap.type,
                                            offerId: ap.offerId || null,
                                            empresaId: profile?.empresa_id,
                                          });
                                          await handleRefreshSingleMlItem(row.primaryMl.ml_item_id);
                                        } catch (err) {
                                          alert('Erro ao sair da promoção: ' + err.message);
                                        } finally {
                                          setApplyingFtId(null);
                                        }
                                      }}
                                      style={{
                                        marginTop: '2px',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        border: '1px solid rgba(220,38,38,0.35)',
                                        background: 'rgba(220,38,38,0.08)',
                                        color: '#DC2626',
                                        fontSize: '0.62rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                      }}
                                      title={`Sair da campanha "${ap.label}" no Mercado Livre`}
                                    >
                                      ✕ Sair desta Promo
                                    </button>
                                  </div>
                                ))
                              ) : hasPromoPerc ? (
                                <div
                                  style={{
                                    padding: '3px 7px',
                                    borderRadius: '6px',
                                    background: 'rgba(16, 185, 129, 0.12)',
                                    color: '#059669',
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                  }}
                                >
                                  🟢 Promo Ativa (-{row.promoInfo.promoPerc.toFixed(0)}% OFF)
                                  <div
                                    style={{
                                      fontSize: '0.65rem',
                                      fontWeight: 600,
                                      color: 'var(--text-secondary)',
                                    }}
                                  >
                                    De {formatBRL(row.promoInfo.originalPrice)} por{' '}
                                    {formatBRL(row.promoInfo.price)}
                                  </div>
                                </div>
                              ) : (
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: '#64748B',
                                    padding: '2px 7px',
                                    borderRadius: '6px',
                                    background: 'rgba(100,116,139,0.1)',
                                  }}
                                >
                                  ⚪ Sem promo ativa
                                </span>
                              )}

                              {/* Convites / Oportunidades de Campanha disponíveis no ML */}
                              {nonIndividualInvites.slice(0, 2).map((inv) => {
                                const reqPrice =
                                  inv.maxDiscountedPrice > 0
                                    ? inv.maxDiscountedPrice
                                    : inv.suggestedPrice;
                                const isViable =
                                  reqPrice <= 0 || reqPrice >= metrics.precoPiso - 0.05;
                                const targetDeal =
                                  reqPrice > 0
                                    ? Number(Math.max(metrics.precoPiso, reqPrice).toFixed(2))
                                    : Number(
                                        Math.max(
                                          metrics.precoPiso,
                                          metrics.precoPraticado
                                        ).toFixed(2)
                                      );

                                return isViable ? (
                                  <div
                                    key={inv.id}
                                    style={{
                                      display: 'flex',
                                      flexDirection: 'column',
                                      alignItems: 'center',
                                      gap: '2px',
                                      padding: '3px 6px',
                                      borderRadius: '6px',
                                      background: 'rgba(124, 58, 237, 0.1)',
                                      border: '1px dashed rgba(124, 58, 237, 0.4)',
                                      width: '100%',
                                    }}
                                  >
                                    <span
                                      style={{
                                        fontSize: '0.66rem',
                                        fontWeight: 800,
                                        color: '#7C3AED',
                                      }}
                                    >
                                      ✨ Convite: {inv.label}
                                      {inv.meliPercentage > 0
                                        ? ` (ML +${inv.meliPercentage}%)`
                                        : ''}
                                    </span>
                                    <button
                                      type="button"
                                      disabled={applyingFtId === (row.rowKey || row.ftId)}
                                      onClick={() =>
                                        handleApplyRecommendedPrice(row, targetDeal, inv)
                                      }
                                      style={{
                                        padding: '2px 7px',
                                        borderRadius: '5px',
                                        border: 'none',
                                        background: '#7C3AED',
                                        color: '#fff',
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                      }}
                                      title={`Entrar na promoção "${inv.label}" por ${formatBRL(targetDeal)} (acima do Piso ${formatBRL(metrics.precoPiso)})`}
                                    >
                                      Entrar por {formatBRL(targetDeal)}
                                    </button>
                                  </div>
                                ) : (
                                  <span
                                    key={inv.id}
                                    style={{
                                      fontSize: '0.64rem',
                                      color: '#D97706',
                                      fontWeight: 600,
                                    }}
                                    title={`Convite "${inv.label}" exige preço máximo de ${formatBRL(reqPrice)}, que fica abaixo do seu Preço Piso (${formatBRL(metrics.precoPiso)})`}
                                  >
                                    ⚠️ {inv.label} (pede {formatBRL(reqPrice)} &lt; Piso)
                                  </span>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </td>

                      {/* Recomendação do Agente Copiloto */}
                      <td style={{ minWidth: '300px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 800,
                                padding: '2px 7px',
                                borderRadius: '999px',
                                background:
                                  aiRec.severity === 'critico'
                                    ? 'rgba(220,38,38,0.14)'
                                    : aiRec.severity === 'oportunidade'
                                    ? 'rgba(37,99,235,0.14)'
                                    : aiRec.severity === 'atencao'
                                    ? 'rgba(245,158,11,0.16)'
                                    : 'rgba(16,185,129,0.14)',
                                color:
                                  aiRec.severity === 'critico'
                                    ? '#DC2626'
                                    : aiRec.severity === 'oportunidade'
                                    ? '#2563EB'
                                    : aiRec.severity === 'atencao'
                                    ? '#D97706'
                                    : '#059669',
                              }}
                            >
                              {aiRec.badge} — {aiRec.title}
                            </span>

                            {aiRec.suggestedPrice && (() => {
                              const cadastroRef =
                                row.promoInfo?.originalPrice ||
                                metrics.precoCadastro ||
                                aiRec.suggestedPrice / 0.7;
                              const offCadastro =
                                cadastroRef > aiRec.suggestedPrice
                                  ? Math.round(((cadastroRef - aiRec.suggestedPrice) / cadastroRef) * 100)
                                  : 0;
                              return (
                                <button
                                  type="button"
                                  disabled={applyingFtId === (row.rowKey || row.ftId)}
                                  onClick={() =>
                                    handleApplyRecommendedPrice(
                                      row,
                                      aiRec.suggestedPrice,
                                      aiRec.recommendedPromo || null
                                    )
                                  }
                                  style={{
                                    padding: '3px 9px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background:
                                      aiRec.severity === 'critico' ? '#DC2626' : '#2563EB',
                                    color: '#fff',
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                  }}
                                  title={`Aplica R$ ${aiRec.suggestedPrice.toFixed(2)} como Promoção (${offCadastro}% OFF sobre Cadastro de R$ ${cadastroRef.toFixed(2)})`}
                                >
                                  {applyingFtId === (row.rowKey || row.ftId)
                                    ? 'Aplicando...'
                                    : `✅ ${aiRec.actionLabel}${offCadastro > 0 ? ` (-${offCadastro}% s/ Cad.)` : ''}`}
                                </button>
                              );
                            })()}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                            {aiRec.explanation}
                          </span>

                          {/* Campo de Preço Desejado -> IA calcula % OFF da Promo + Margem/Lucro e aplica */}
                          {(() => {
                            const rowIdKey = row.rowKey || row.ftId;
                            const priceInputKey = `${activeChannel}__${rowIdKey}`;
                            const rawTyped = customTargetPrices[priceInputKey] ?? '';
                            const desiredVal = parseNumber(String(rawTyped).replace(',', '.'));
                            const cadRef =
                              row.promoInfo?.originalPrice ||
                              metrics.precoCadastro ||
                              (desiredVal > 0 ? Number((desiredVal / 0.7).toFixed(2)) : 0);
                            const previewRes =
                              desiredVal > 0
                                ? getResultados({
                                    ...getEffectiveFt(row.ft, activeChannel),
                                    precoVendaManual: String(desiredVal),
                                  })
                                : null;
                            const needRaiseCad = desiredVal > 0 && cadRef <= desiredVal;
                            const effectiveCad = needRaiseCad
                              ? Number((desiredVal / 0.7).toFixed(2))
                              : cadRef;
                            const pctOffCalc =
                              desiredVal > 0 && effectiveCad > desiredVal
                                ? (((effectiveCad - desiredVal) / effectiveCad) * 100).toFixed(1)
                                : '0.0';
                            const isBelowZero = previewRes && previewRes.margemContribuicaoPerc < 0;
                            const isBelowFloor = desiredVal > 0 && desiredVal < metrics.precoPiso - 0.02;

                            return (
                              <div
                                style={{
                                  marginTop: '4px',
                                  padding: '5px 7px',
                                  borderRadius: '7px',
                                  background: 'rgba(15, 23, 42, 0.04)',
                                  border: '1px solid var(--border-color)',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '4px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.67rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                                    🎯 Valor desejado:
                                  </span>
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    placeholder={metrics.precoPraticado.toFixed(2).replace('.', ',')}
                                    value={rawTyped}
                                    onChange={(e) =>
                                      setCustomTargetPrices((prev) => ({
                                        ...prev,
                                        [priceInputKey]: e.target.value,
                                      }))
                                    }
                                    style={{
                                      width: '72px',
                                      padding: '2px 6px',
                                      borderRadius: '5px',
                                      border: '1px solid var(--border-color)',
                                      background: 'var(--bg-surface)',
                                      color: 'var(--text-primary)',
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      textAlign: 'right',
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={
                                      !desiredVal ||
                                      desiredVal <= 0 ||
                                      isBelowFloor ||
                                      applyingFtId === rowIdKey
                                    }
                                    onClick={() => handleApplyRecommendedPrice(row, desiredVal)}
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: '5px',
                                      border: 'none',
                                      background:
                                        !desiredVal || isBelowFloor
                                          ? '#CBD5E1'
                                          : activeChannel === 'shopee'
                                          ? '#EE4D2D'
                                          : '#059669',
                                      color: '#fff',
                                      fontSize: '0.68rem',
                                      fontWeight: 800,
                                      cursor: !desiredVal || isBelowFloor ? 'not-allowed' : 'pointer',
                                    }}
                                    title={
                                      isBelowFloor
                                        ? `Valor abaixo do Piso (${formatBRL(metrics.precoPiso)})`
                                        : `Aplicar R$ ${desiredVal.toFixed(2)} como Promoção (-${pctOffCalc}% OFF)`
                                    }
                                  >
                                    {applyingFtId === rowIdKey ? 'Aplicando...' : 'Aplicar Promo'}
                                  </button>
                                </div>
                                {previewRes && (
                                  <div
                                    style={{
                                      fontSize: '0.67rem',
                                      fontWeight: 600,
                                      color: isBelowZero
                                        ? '#DC2626'
                                        : isBelowFloor
                                        ? '#D97706'
                                        : '#047857',
                                    }}
                                  >
                                    Promo calculada: <strong>-{pctOffCalc}% OFF</strong> s/ Cad. ({formatBRL(effectiveCad)})
                                    {needRaiseCad ? ' (sobe Cad.)' : ''} • Margem:{' '}
                                    <strong>{previewRes.margemContribuicaoPerc.toFixed(1)}%</strong> (
                                    {formatBRL(previewRes.lucroLiquido)})
                                    {isBelowFloor ? ` • ⚠️ Abaixo do Piso ${formatBRL(metrics.precoPiso)}` : ''}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Alerta Extra da IA quando houver Promoção Interessante no ML (e não for a ação principal já exibida) */}
                          {(() => {
                            const candidates = row.promoInfo?.candidatePromos || [];
                            const interestingPromo = candidates.find((p) => {
                              if (p.type === 'PRICE_DISCOUNT') return false;
                              if (aiRec.recommendedPromo?.id === p.id) return false;
                              const reqP =
                                p.maxDiscountedPrice > 0
                                  ? p.maxDiscountedPrice
                                  : p.suggestedPrice;
                              return reqP <= 0 || reqP >= metrics.precoPiso - 0.05;
                            });
                            if (!interestingPromo) return null;
                            const reqP =
                              interestingPromo.maxDiscountedPrice > 0
                                ? interestingPromo.maxDiscountedPrice
                                : interestingPromo.suggestedPrice;
                            const dealPrice =
                              reqP > 0
                                ? Number(Math.max(metrics.precoPiso, reqP).toFixed(2))
                                : Number(
                                    Math.max(
                                      metrics.precoPiso,
                                      metrics.precoPraticado
                                    ).toFixed(2)
                                  );
                            return (
                              <div
                                style={{
                                  marginTop: '3px',
                                  padding: '5px 8px',
                                  borderRadius: '7px',
                                  background: 'rgba(124, 58, 237, 0.09)',
                                  border: '1px solid rgba(124, 58, 237, 0.28)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '6px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    color: '#7C3AED',
                                  }}
                                >
                                  💡 IA: Convite <strong>{interestingPromo.label}</strong> vale a pena! (Pede{' '}
                                  {formatBRL(dealPrice)} ≥ Piso {formatBRL(metrics.precoPiso)})
                                </span>
                                <button
                                  type="button"
                                  disabled={applyingFtId === (row.rowKey || row.ftId)}
                                  onClick={() =>
                                    handleApplyRecommendedPrice(row, dealPrice, interestingPromo)
                                  }
                                  style={{
                                    padding: '2px 8px',
                                    borderRadius: '5px',
                                    border: 'none',
                                    background: '#7C3AED',
                                    color: '#fff',
                                    fontSize: '0.67rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                  }}
                                >
                                  ✨ Ativar Promo ({formatBRL(dealPrice)})
                                </button>
                              </div>
                            );
                          })()}
                          {(activeChannel === 'shopee' || row.primaryMl?.ml_item_id) && (() => {
                            const adsChoice = evaluateAdsChoice({
                              adStatus: row.adsPeriodStats?.adStatus,
                              campaignId: row.adsPeriodStats?.campaignId,
                              campaigns: promosAdsCache?.campaigns || [],
                              metrics,
                              estoqueTotal: row.estoqueTotal,
                              vendasMes: row.vendasMes,
                              soldQuantityTotal: row.soldQuantityTotal,
                              rules: row.rowRules || rules,
                            });
                            const shopeeRoasHint =
                              activeChannel === 'shopee'
                                ? (row.soldQuantityTotal ?? 0) >= 10 && row.vendasMes >= 2
                                  ? ' • Perfil 1 Campeões (ROAS Alvo: 12,5 | R$ 10/dia)'
                                  : (row.soldQuantityTotal ?? 0) < 10 || (row.daysSinceLastSale ?? 0) >= 30
                                  ? ' • Perfil 2 Lançamento (ROAS Alvo: 6,7 | R$ 7/dia)'
                                  : row.estoqueTotal >= parseNumber(rules.estoqueAltoGiroMin || 12)
                                  ? ' • Perfil 3 Giro Estoque (ROAS Alvo: 8,3 | R$ 7/dia)'
                                  : ' • Perfil 4 Teste/Baixo Custo (ROAS Alvo: 16,5 | R$ 5/dia)'
                                : '';
                            return (
                              <div
                                style={{
                                  marginTop: '4px',
                                  paddingTop: '4px',
                                  borderTop: '1px dashed var(--border-color)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  gap: '6px',
                                  flexWrap: 'wrap',
                                }}
                              >
                                <span style={{ fontSize: '0.7rem', color: adsChoice.color, fontWeight: 700 }}>
                                  <strong>{adsChoice.badge}:</strong> {adsChoice.reason}
                                  {shopeeRoasHint}
                                </span>
                                {activeChannel === 'ml' && adsChoice.buttonLabel && (
                                  <button
                                    type="button"
                                    disabled={updatingAdKey === (row.rowKey || row.ftId)}
                                    onClick={() =>
                                      handleToggleAdStatus(
                                        row,
                                        adsChoice.action === 'pause' ? 'paused' : 'active'
                                      )
                                    }
                                    style={{
                                      padding: '2px 8px',
                                      borderRadius: '5px',
                                      border: `1px solid ${adsChoice.color}`,
                                      background: 'transparent',
                                      color: adsChoice.color,
                                      fontSize: '0.7rem',
                                      fontWeight: 800,
                                      cursor: 'pointer',
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {updatingAdKey === (row.rowKey || row.ftId)
                                      ? 'Enviando...'
                                      : adsChoice.buttonLabel}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>
      )}

      {/* Modal de Detalhes dos Concorrentes da 1ª Página */}
      {selectedCompDetail && (
        <div className="modal-overlay" onClick={() => setSelectedCompDetail(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '760px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  🔍 Concorrentes da 1ª Página — {selectedCompDetail.row.nomePeca}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Busca analisada: &quot;{selectedCompDetail.competitor.queryUsed}&quot; • Seu Preço Piso Intocável:{' '}
                  <strong>{formatBRL(selectedCompDetail.row.metrics.precoPiso)}</strong>
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setSelectedCompDetail(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                <div style={{ padding: '10px', borderRadius: '8px', background: 'var(--bg-secondary)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>MENOR PREÇO 1ª PÁG.</div>
                  <strong style={{ fontSize: '1.1rem', color: '#059669' }}>
                    {formatBRL(selectedCompDetail.competitor.minPrice)}
                  </strong>
                </div>
                <div style={{ padding: '10px', borderRadius: '8px', background: 'var(--bg-secondary)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>PREÇO MÉDIO CONCORRENTES</div>
                  <strong style={{ fontSize: '1.1rem' }}>
                    {formatBRL(selectedCompDetail.competitor.avgPrice)}
                  </strong>
                </div>
                <div style={{ padding: '10px', borderRadius: '8px', background: 'var(--bg-secondary)', textAlign: 'center' }}>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>SEU PREÇO PISO ({rules.margemMinimaPerc}%)</div>
                  <strong style={{ fontSize: '1.1rem', color: '#7C3AED' }}>
                    {formatBRL(selectedCompDetail.row.metrics.precoPiso)}
                  </strong>
                </div>
              </div>

              {selectedCompDetail.competitor.promotions?.length > 0 && (
                <div style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(37,99,235,0.35)', background: 'rgba(37,99,235,0.06)' }}>
                  <strong style={{ fontSize: '0.8rem', color: '#2563EB' }}>
                    🏷️ Campanhas / Promoções do Mercado Livre neste anúncio:
                  </strong>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                    {selectedCompDetail.competitor.promotions.map((p, idx) => (
                      <span
                        key={p.id || idx}
                        style={{
                          fontSize: '0.74rem',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-color)',
                        }}
                      >
                        <strong>{p.name}</strong> ({p.status}) {p.price > 0 ? `• Sugerido ML: ${formatBRL(p.price)}` : ''}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {(selectedCompDetail.competitor.competitors || []).map((c) => {
                  const isBelowFloor = c.price < selectedCompDetail.row.metrics.precoPiso;
                  return (
                    <div
                      key={c.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '52px 1fr auto',
                        gap: '10px',
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                      }}
                    >
                      <img
                        src={c.thumbnail}
                        alt={c.title}
                        style={{ width: '52px', height: '52px', borderRadius: '6px', objectFit: 'contain', background: '#fff' }}
                      />
                      <div>
                        <div style={{ fontSize: '0.84rem', fontWeight: 700 }}>{c.title}</div>
                        <div style={{ display: 'flex', gap: '8px', fontSize: '0.73rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          <span>ID: {c.id}</span>
                          {c.freeShipping && <span style={{ color: '#059669', fontWeight: 700 }}>• Frete Grátis</span>}
                          {isBelowFloor ? (
                            <span style={{ color: '#DC2626', fontWeight: 700 }}>
                              • Abaixo do seu Piso (não copiar)
                            </span>
                          ) : (
                            <span style={{ color: '#059669', fontWeight: 700 }}>
                              • Você consegue bater com lucro!
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                          {formatBRL(c.price)}
                        </div>
                        {c.permalink && (
                          <a
                            href={c.permalink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                          >
                            Abrir anúncio <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Campanhas Product Ads (ML) */}
      {showCampaignsModal && (
        <div className="modal-overlay" onClick={() => setShowCampaignsModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '820px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  {activeChannel === 'shopee'
                    ? '📊 Estratégia Shopee Ads — Os 4 Grupos de ROAS Alvo & Orçamento'
                    : '📊 Campanhas de Product Ads (Mercado Livre)'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  {activeChannel === 'shopee'
                    ? 'Na Shopee o Ads é configurado por produto usando ROAS Alvo (100 ÷ ACOS). Veja abaixo os 4 grupos equivalentes às suas campanhas do ML e quais produtos ativar em cada ROAS:'
                    : 'Recomendamos manter 3 ou 4 campanhas fixas (ex: Campeões, Lançamentos, Kits, Giro de Estoque) e mover os anúncios entre elas.'}
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setShowCampaignsModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {activeChannel === 'ml' ? (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(37, 99, 235, 0.08))',
                    border: '1px solid rgba(124, 58, 237, 0.35)',
                  }}
                >
                  <div style={{ fontSize: '0.78rem', lineHeight: 1.4 }}>
                    <strong style={{ color: '#7C3AED' }}>⚡ Pacote 4 Campanhas Estratégicas (R$ 50,00/dia cada)</strong>
                    <div style={{ color: 'var(--text-secondary)' }}>
                      1-Campeões (ACOS 8%) • 2-Lançamentos (ACOS 15%) • 3-Giro de Estoque (ACOS 12%) • 4-Teste/Baixo Custo (ACOS 6%)
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={savingCamp}
                    onClick={handleCreateFourStandardCampaigns}
                    style={{
                      padding: '7px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#7C3AED',
                      color: '#fff',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {savingCamp ? 'Criando no ML...' : '⚡ Criar / Atualizar as 4 Campanhas (R$ 50/dia)'}
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, rgba(238, 77, 45, 0.12), rgba(245, 158, 11, 0.08))',
                    border: '1px solid rgba(238, 77, 45, 0.35)',
                    fontSize: '0.78rem',
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ color: '#EA580C' }}>
                    🛍️ Como funcionam as 4 Categorias no Shopee Ads (Busca / Descoberta por Produto):
                  </strong>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '3px' }}>
                    Diferente do Mercado Livre (onde você cria 4 pastas), na Shopee você ativa o <strong>Anúncio de Busca/Descoberta nos produtos abaixo</strong> aplicando o <strong>ROAS Personalizado</strong> e o <strong>Orçamento Diário</strong> do grupo correspondente:
                  </div>
                </div>
              )}

              {/* Guia Automático da IA: Quem vai em cada uma das 4 Campanhas / Grupos ROAS */}
              {(() => {
                const validRows = analyzedRows.filter(
                  (r) =>
                    (activeChannel === 'shopee' || r.primaryMl?.ml_item_id) &&
                    r.estoqueTotal > parseNumber(rules.estoqueBaixoProtecaoMax || 3) &&
                    r.metrics.precoPraticado >= r.metrics.precoPiso - 0.05
                );
                const seenKey = new Set();
                const uniqueRows = validRows.filter((r) => {
                  const id = r.primaryMl?.ml_item_id || r.ftId;
                  if (seenKey.has(id)) return false;
                  seenKey.add(id);
                  return true;
                });

                const buckets = {
                  campeoes: [],
                  lancamentos: [],
                  giro: [],
                  teste: [],
                };

                uniqueRows.forEach((r) => {
                  const sold = r.soldQuantityTotal ?? 0;
                  const daysNoSale = r.daysSinceLastSale ?? 0;
                  const highStock = r.estoqueTotal >= parseNumber(rules.estoqueAltoGiroMin || 12);

                  if ((sold >= 10 || r.vendasMes >= 3) && r.vendasMes >= 2 && r.metrics.margemSemAdsPerc >= 22) {
                    buckets.campeoes.push(r);
                  } else if (r.vendasMes === 0 || (r.soldQuantityTotal !== null && sold < 10) || daysNoSale >= 30) {
                    buckets.lancamentos.push(r);
                  } else if (highStock || daysNoSale >= 15) {
                    buckets.giro.push(r);
                  } else {
                    buckets.teste.push(r);
                  }
                });

                const cards =
                  activeChannel === 'shopee'
                    ? [
                        {
                          key: 'campeoes',
                          title: '1 - Campeões (Escala)',
                          meta: 'ROAS Alvo: 12,5 (ACOS 8%) • R$ 10 a R$ 15/dia por item',
                          color: '#059669',
                          items: buckets.campeoes,
                        },
                        {
                          key: 'lancamentos',
                          title: '2 - Lançamentos (Rankear)',
                          meta: 'ROAS Alvo: 6,7 (ACOS 15%) • R$ 7 a R$ 10/dia por item',
                          color: '#2563EB',
                          items: buckets.lancamentos,
                        },
                        {
                          key: 'giro',
                          title: '3 - Giro de Estoque',
                          meta: 'ROAS Alvo: 8,3 (ACOS 12%) • R$ 7 a R$ 10/dia por item',
                          color: '#D97706',
                          items: buckets.giro,
                        },
                        {
                          key: 'teste',
                          title: '4 - Teste e Baixo Custo',
                          meta: 'ROAS Alvo: 16,5 (ACOS 6%) • R$ 5/dia por item',
                          color: '#64748B',
                          items: buckets.teste,
                        },
                      ]
                    : [
                        {
                          key: 'campeoes',
                          title: '1 - Campeoes (Escala)',
                          meta: 'ACOS 8% • R$ 50/dia',
                          color: '#059669',
                          items: buckets.campeoes,
                        },
                        {
                          key: 'lancamentos',
                          title: '2 - Lancamentos (Rankear)',
                          meta: 'ACOS 15% • R$ 50/dia',
                          color: '#2563EB',
                          items: buckets.lancamentos,
                        },
                        {
                          key: 'giro',
                          title: '3 - Giro de Estoque',
                          meta: 'ACOS 12% • R$ 50/dia',
                          color: '#D97706',
                          items: buckets.giro,
                        },
                        {
                          key: 'teste',
                          title: '4 - Teste e Baixo Custo',
                          meta: 'ACOS 6% • R$ 50/dia',
                          color: '#64748B',
                          items: buckets.teste,
                        },
                      ];

                return (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {cards.map((b) => (
                      <div
                        key={b.key}
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: `1px solid ${b.color}55`,
                          background: 'var(--bg-surface)',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '6px',
                          }}
                        >
                          <strong style={{ fontSize: '0.82rem', color: b.color }}>
                            {b.title} ({b.items.length})
                          </strong>
                          <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                            {b.meta}
                          </span>
                        </div>
                        <div
                          style={{
                            maxHeight: '115px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '4px',
                            fontSize: '0.73rem',
                          }}
                        >
                          {b.items.length === 0 ? (
                            <span style={{ color: 'var(--text-secondary)' }}>
                              Nenhum item neste perfil agora.
                            </span>
                          ) : (
                            b.items.map((it) => {
                              const codeToCopy = it.primaryMl?.ml_item_id || it.sku || it.ftId;
                              return (
                                <div
                                  key={it.rowKey || it.ftId}
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    gap: '6px',
                                    padding: '3px 6px',
                                    borderRadius: '5px',
                                    background: 'var(--bg-secondary)',
                                  }}
                                >
                                  <span style={{ fontWeight: 700 }}>
                                    {it.ftId} — {it.nomePeca}
                                  </span>
                                  <code
                                    onClick={() => {
                                      navigator.clipboard?.writeText(codeToCopy);
                                    }}
                                    title="Clique para copiar o código/SKU"
                                    style={{
                                      cursor: 'pointer',
                                      color: b.color,
                                      fontWeight: 800,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {codeToCopy} 📋
                                  </code>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}

              <form
                onSubmit={handleCreateCampaign}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr auto',
                  gap: '8px',
                  alignItems: 'end',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                    Nova Campanha (ex: Campeões / Lançamentos)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nome da campanha"
                    value={newCampForm.name}
                    onChange={(e) => setNewCampForm({ ...newCampForm, name: e.target.value })}
                    style={ruleInputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                    ACOS Alvo (%)
                  </label>
                  <input
                    type="number"
                    min="2"
                    max="40"
                    value={newCampForm.acosTarget}
                    onChange={(e) => setNewCampForm({ ...newCampForm, acosTarget: e.target.value })}
                    style={ruleInputStyle}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.72rem', fontWeight: 700, display: 'block', marginBottom: '3px' }}>
                    Orçamento/Dia (R$)
                  </label>
                  <input
                    type="number"
                    min="5"
                    value={newCampForm.dailyBudget}
                    onChange={(e) => setNewCampForm({ ...newCampForm, dailyBudget: e.target.value })}
                    style={ruleInputStyle}
                  />
                </div>
                <button type="submit" className="btn-primary" disabled={savingCamp} style={{ whiteSpace: 'nowrap' }}>
                  {savingCamp ? 'Criando...' : '+ Criar Campanha'}
                </button>
              </form>

              {(promosAdsCache?.campaigns || []).length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  Clique em <strong>&quot;📡 Puxar Promoções &amp; Ads (7/15/30d)&quot;</strong> para carregar suas campanhas do Mercado Livre.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {promosAdsCache.campaigns.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-surface)',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.9rem' }}>{c.name}</strong>
                        <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
                          ID: {c.id} • Orçamento/dia: <strong>{formatBRL(c.dailyBudget)}</strong> • ACOS Alvo: <strong>{c.acosTarget}%</strong> • Gasto 30d: <strong>{formatBRL(c.metrics30d?.cost || 0)}</strong>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: c.status === 'active' ? 'rgba(16,185,129,0.14)' : 'rgba(148,163,184,0.2)',
                            color: c.status === 'active' ? '#059669' : '#64748B',
                          }}
                        >
                          {c.status === 'active' ? 'ATIVA' : 'PAUSADA'}
                        </span>
                        <button
                          type="button"
                          disabled={savingCamp}
                          onClick={() => handleToggleCampaignStatus(c)}
                          className="btn-secondary"
                          style={{ fontSize: '0.76rem', padding: '4px 10px' }}
                        >
                          {c.status === 'active' ? '⏸️ Pausar' : '▶️ Ativar'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Padronizador de Preços de Cadastro + Venda c/ 30% OFF (Margem 30% a 40%) */}
      {showStandardizeModal && (
        <div className="modal-overlay" onClick={() => !standardizingBusy && setShowStandardizeModal(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '960px', width: '96%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0 }}>
                  🎯 Padronizar Preços de Cadastro &amp; Venda (-30% OFF com Margem de 30% a 40%)
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Define um <strong>Preço de Cadastro (X)</strong> para cada item de modo que, ao aplicar <strong>30% de promoção</strong>, o <strong>Valor de Venda Final</strong> já entregue entre 30% e 40% de margem líquida (sobrando folga para as promoções da IA até 25%, 20% ou 15%).
                </p>
              </div>
              <button
                type="button"
                className="btn-icon"
                disabled={standardizingBusy}
                onClick={() => setShowStandardizeModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, rgba(124, 58, 237, 0.1), rgba(16, 185, 129, 0.08))',
                  border: '1px solid rgba(124, 58, 237, 0.35)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 800 }}>
                    Margem Líquida Alvo no Preço de Venda (após 30% OFF):
                  </label>
                  {[30, 35, 40].map((mVal) => (
                    <button
                      key={mVal}
                      type="button"
                      onClick={() => setTargetBaseMargin(mVal)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '8px',
                        border: targetBaseMargin === mVal ? '2px solid #7C3AED' : '1px solid var(--border-color)',
                        background: targetBaseMargin === mVal ? '#7C3AED' : 'var(--bg-surface)',
                        color: targetBaseMargin === mVal ? '#fff' : 'var(--text-primary)',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                      }}
                    >
                      {mVal}% {mVal === 35 ? '(Recomendado)' : ''}
                    </button>
                  ))}
                  <input
                    type="number"
                    min="25"
                    max="50"
                    value={targetBaseMargin}
                    onChange={(e) => setTargetBaseMargin(Number(e.target.value || 35))}
                    style={{ ...ruleInputStyle, width: '75px', textAlign: 'center' }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={standardizingBusy}
                    onClick={() => handleStandardizeSystemPrices(true)}
                    className="btn-secondary"
                    style={{ fontWeight: 800, fontSize: '0.8rem' }}
                  >
                    💾 1. Salvar Todos no Sistema ({targetBaseMargin}%)
                  </button>
                  <button
                    type="button"
                    disabled={standardizingBusy}
                    onClick={() => handlePushStandardizedToMl(null)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: activeChannel === 'shopee' ? '#EE4D2D' : '#059669',
                      color: '#fff',
                      fontWeight: 800,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    🚀 2. Enviar Cadastro + Promo 30% OFF p/ Todos ({activeChannel === 'shopee' ? 'Shopee' : 'ML'})
                  </button>
                </div>
              </div>

              {standardizeProgress && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(37, 99, 235, 0.12)',
                    color: '#2563EB',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                  }}
                >
                  ⏳ {standardizeProgress}
                </div>
              )}

              <div className="table-responsive">
                <table className="fts-table" style={{ fontSize: '0.8rem' }}>
                  <thead>
                    <tr>
                      <th>FT / Produto</th>
                      <th style={{ textAlign: 'center' }}>Custo Fixo (Prod+Emb+Taxa)</th>
                      <th style={{ textAlign: 'center' }}>Comissão Canal</th>
                      <th style={{ textAlign: 'center' }}>🛡️ Piso 25%</th>
                      <th style={{ textAlign: 'center', color: '#7C3AED' }}>
                        Novo Preço Cadastro (X)
                      </th>
                      <th style={{ textAlign: 'center', color: '#059669' }}>
                        Venda c/ 30% OFF ({targetBaseMargin}% Margem)
                      </th>
                      <th style={{ textAlign: 'center' }}>
                        Enviar p/ {activeChannel === 'shopee' ? 'Shopee' : 'ML'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {savedFts
                      .filter((ft) => Boolean(overrides[activeChannel]?.[ft.indiceFt]?.cadastrado))
                      .map((ft) => {
                        const pair = computeStandardizedPair(ft, targetBaseMargin);
                        const piso25 = computeStandardizedPair(ft, 25).vendaIdeal;
                        const currentList = activeChannel === 'shopee' ? shopeeListings : mlListings;
                        const linkedCount = currentList.filter((l) => {
                          const base = String(l.ft_id || '').split('__var__')[0];
                          return base === ft.indiceFt && l.ml_item_id;
                        }).length;

                        return (
                          <tr key={ft.indiceFt}>
                            <td>
                              <strong>{ft.indiceFt}</strong> — {ft.nomePeca}
                              {linkedCount > 0 && (
                                <span
                                  style={{
                                    marginLeft: '6px',
                                    fontSize: '0.68rem',
                                    color: 'var(--text-secondary)',
                                  }}
                                >
                                  ({linkedCount} anúncio{linkedCount > 1 ? 's' : ''})
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {formatBRL(pair.custoFixoUnit)}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {pair.aliquotaCanalPerc}%
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 700 }}>
                              {formatBRL(piso25)}
                            </td>
                            <td
                              style={{
                                textAlign: 'center',
                                fontWeight: 800,
                                color: '#7C3AED',
                                fontSize: '0.88rem',
                              }}
                            >
                              {formatBRL(pair.cadastroIdeal)}
                            </td>
                            <td
                              style={{
                                textAlign: 'center',
                                fontWeight: 800,
                                color: '#059669',
                                fontSize: '0.88rem',
                              }}
                            >
                              {formatBRL(pair.vendaIdeal)}{' '}
                              <span style={{ fontSize: '0.68rem', fontWeight: 600 }}>
                                (-30% OFF)
                              </span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                disabled={standardizingBusy || linkedCount === 0}
                                onClick={() => handlePushStandardizedToMl(ft)}
                                style={{
                                  padding: '4px 9px',
                                  borderRadius: '6px',
                                  border: 'none',
                                  background:
                                    linkedCount > 0
                                      ? activeChannel === 'shopee'
                                        ? '#EE4D2D'
                                        : '#2563EB'
                                      : '#94A3B8',
                                  color: '#fff',
                                  fontSize: '0.72rem',
                                  fontWeight: 700,
                                  cursor: linkedCount > 0 ? 'pointer' : 'not-allowed',
                                }}
                              >
                                🚀 Atualizar {activeChannel === 'shopee' ? 'Shopee' : 'ML'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Modal de Aviso quando há itens abaixo da nova Margem Mínima */}
      {minMarginAlert.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            zIndex: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
          onClick={(e) => e.target === e.currentTarget && !minMarginAlert.fixingAll && setMinMarginAlert((p) => ({ ...p, open: false }))}
        >
          <div
            className="card"
            style={{
              maxWidth: '760px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '1.25rem',
              border: '2px solid #EF4444',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#DC2626', fontSize: '1.05rem' }}>
                  🛡️ {minMarginAlert.belowRows.length} produto(s) abaixo da Margem Mínima de {minMarginAlert.targetMin}%
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                  O Escudo de {minMarginAlert.targetMin}% já está ativo (nenhuma nova promoção poderá furar esse piso). O que deseja fazer com os itens abaixo?
                </p>
              </div>
              <button
                type="button"
                disabled={minMarginAlert.fixingAll}
                onClick={() => setMinMarginAlert((p) => ({ ...p, open: false }))}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ×
              </button>
            </div>

            <div className="table-responsive" style={{ maxHeight: '46vh', overflowY: 'auto', marginBottom: '14px' }}>
              <table className="fts-table" style={{ fontSize: '0.8rem' }}>
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th style={{ textAlign: 'right' }}>Atual</th>
                    <th style={{ textAlign: 'center' }}>Margem Atual</th>
                    <th style={{ textAlign: 'right' }}>Piso ({minMarginAlert.targetMin}%)</th>
                  </tr>
                </thead>
                <tbody>
                  {minMarginAlert.belowRows.map((r) => (
                    <tr key={r.rowKey || r.ftId}>
                      <td>
                        <span className="badge" style={{ marginRight: '6px' }}>{r.ftId}</span>
                        <strong>{r.nomePeca}</strong>
                        {r.variacaoNome ? ` (${r.variacaoNome})` : ''}
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatBRL(r.metrics.precoPraticado)}</td>
                      <td style={{ textAlign: 'center', color: '#DC2626', fontWeight: 800 }}>
                        {r.metrics.margemPosAdsPerc.toFixed(1)}%
                      </td>
                      <td style={{ textAlign: 'right', color: '#059669', fontWeight: 800 }}>
                        {formatBRL(r.metrics.precoPiso)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={minMarginAlert.fixingAll}
                onClick={() => setMinMarginAlert((p) => ({ ...p, open: false }))}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ✋ Manter Assim por Enquanto
              </button>
              <button
                type="button"
                disabled={minMarginAlert.fixingAll}
                onClick={handleFixAllBelowMinMargin}
                style={{
                  padding: '0.55rem 1.15rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#DC2626',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: minMarginAlert.fixingAll ? 'wait' : 'pointer',
                }}
              >
                {minMarginAlert.fixingAll
                  ? '⏳ Ajustando nos Marketplaces...'
                  : `🚀 Ajustar Todos p/ Piso (${minMarginAlert.targetMin}%)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ruleInputStyle = {
  width: '100%',
  padding: '0.48rem 0.7rem',
  borderRadius: '8px',
  border: '1px solid var(--border-color)',
  background: 'var(--bg-surface)',
  color: 'var(--text-primary)',
  fontSize: '0.84rem',
  fontWeight: 700,
};
