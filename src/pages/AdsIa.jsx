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
import { parseNumber } from '../utils/financeCalculators';
import {
  fetchStoredMlListings,
  syncListingsFromML,
  mlProxyFetch,
  getValidMlToken,
} from '../services/mercadolivre';
import {
  calculateAdShieldMetrics,
  evaluateAiRecommendation,
  evaluateAdsChoice,
  fetchMlCompetitorIntel,
  fetchMlPromosAndAdsStats,
  updateMlAdStatusOrCampaign,
  createMlAdCampaign,
  updateMlAdCampaign,
  loadPromosAdsCache,
  askGeminiStrategist,
  loadAdsIaRules,
  saveAdsIaRules,
  loadManualAdsMetrics,
  saveManualAdsMetrics,
} from '../services/adsIntelligence';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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

  // Promoções (% OFF) e Gastos de Ads (7d / 15d / 30d)
  const [adsPeriod, setAdsPeriod] = useState(30);
  const [promosAdsCache, setPromosAdsCache] = useState(() => loadPromosAdsCache());
  const [syncingPromosAds, setSyncingPromosAds] = useState(false);
  const [promosAdsNote, setPromosAdsNote] = useState('');
  const [showCampaignsModal, setShowCampaignsModal] = useState(false);
  const [updatingAdKey, setUpdatingAdKey] = useState(null);
  const [newCampForm, setNewCampForm] = useState({ name: '', acosTarget: 10, dailyBudget: 15 });
  const [savingCamp, setSavingCamp] = useState(false);

  const getHeaders = () => ({
    apikey: SUPA_KEY,
    Authorization: `Bearer ${session?.access_token || SUPA_KEY}`,
    'Content-Type': 'application/json',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const headers = getHeaders();
      const [ftsResp, defResp, overResp, salesResp, mlStored] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_channel_defaults?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_overrides?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_monthly_sales?select=*`, { headers }),
        fetchStoredMlListings(profile?.empresa_id),
      ]);

      const ftsData = ftsResp.ok ? await ftsResp.json() : [];
      const defData = defResp.ok ? await defResp.json() : [];
      const overData = overResp.ok ? await overResp.json() : [];
      const salesData = salesResp.ok ? await salesResp.json() : [];

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
    } catch (err) {
      console.error('[AdsIA] Erro ao carregar dados:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (session) fetchData();
  }, [session]);

  const handleRuleChange = (key, val) => {
    setRules((prev) => {
      const next = { ...prev, [key]: val };
      saveAdsIaRules(next);
      return next;
    });
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
    const normalizeStr = (s) =>
      String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    const expanded = [];

    savedFts.forEach((ft) => {
      const isCadastrado = Boolean(overrides[activeChannel]?.[ft.indiceFt]?.cadastrado);
      const effFtBase = getEffectiveFt(ft, activeChannel);
      const vendasMesFt = Number(
        vendasMensal[currentMonth]?.[activeChannel]?.[ft.indiceFt] || 0
      );

      // Todos os anúncios do ML vinculados a esta FT
      const linkedListings = mlListings.filter((l) => {
        const base = String(l.ft_id || '').split('__var__')[0];
        return base === ft.indiceFt;
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
          const promoInfo = mlId ? promosAdsCache?.promosByItem?.[mlId] : null;
          const adsPeriodStats = mlId ? promosAdsCache?.adsByItem?.[mlId] : null;
          const apiAdsForPeriod = adsPeriodStats?.[adsPeriod] || null;

          const liveMlPrice =
            activeChannel === 'ml' && parseNumber(promoInfo?.price) > 0
              ? parseNumber(promoInfo.price)
              : activeChannel === 'ml' && parseNumber(matchedMl?.price) > 0
              ? parseNumber(matchedMl.price)
              : null;

          const effFtVar = {
            ...effFtBase,
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

          const metrics = calculateAdShieldMetrics(effFtVar, rules, {
            ...effectiveManualAds,
            vendasMes: vendasMesFt,
          });

          const competitor = competitorMap[rowKey] || competitorMap[ft.indiceFt] || null;
          const soldQuantityTotal =
            matchedMl?.sold_quantity !== undefined
              ? Number(matchedMl.sold_quantity || 0)
              : null;

          const aiRec = evaluateAiRecommendation(
            {
              ft,
              metrics,
              estoqueTotal: varStock,
              vendasMes: vendasMesFt,
              soldQuantityTotal,
              competitor,
            },
            rules
          );

          expanded.push({
            rowKey,
            ft,
            ftId: ft.indiceFt,
            nomePeca: ft.nomePeca,
            variacaoNome: varName,
            sku: matchedMl?.sku || fv.sku || effFtBase.sku || ft.sku || '',
            isCadastrado,
            estoqueTotal: varStock,
            vendasMes: vendasMesFt,
            soldQuantityTotal,
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
            parseNumber(promoInfo?.price) > 0
              ? parseNumber(promoInfo.price)
              : parseNumber(l.price) > 0
              ? parseNumber(l.price)
              : null;
          const effFtMl = {
            ...effFtBase,
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

          const metrics = calculateAdShieldMetrics(effFtMl, rules, {
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
              soldQuantityTotal: null,
              competitor,
            },
            rules
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
            soldQuantityTotal: null,
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
      const promoInfo = mlId ? promosAdsCache?.promosByItem?.[mlId] : null;
      const adsPeriodStats = mlId ? promosAdsCache?.adsByItem?.[mlId] : null;
      const apiAdsForPeriod = adsPeriodStats?.[adsPeriod] || null;
      const estoqueTotal = getEstoqueTotalFt(ft);

      const liveMlPrice =
        activeChannel === 'ml' && parseNumber(promoInfo?.price) > 0
          ? parseNumber(promoInfo.price)
          : null;
      const effFtSimple = {
        ...effFtBase,
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

      const metrics = calculateAdShieldMetrics(effFtSimple, rules, {
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
          soldQuantityTotal: null,
          competitor,
        },
        rules
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
        soldQuantityTotal: null,
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
  ]);

  // Totais do painel superior
  const summaryStats = useMemo(() => {
    const baseList = analyzedRows;
    const criticos = baseList.filter((r) => r.aiRec.severity === 'critico').length;
    const oportunidades = baseList.filter((r) => r.aiRec.severity === 'oportunidade').length;
    const saudaveis = baseList.filter((r) => r.aiRec.severity === 'saudavel').length;
    const totalAdsGasto = baseList.reduce((acc, r) => acc + r.metrics.gastoAdsMes, 0);
    return {
      total: baseList.length,
      criticos,
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

  const handleApplyRecommendedPrice = async (row, newPrice) => {
    const safePrice = Number(newPrice);
    if (!safePrice || safePrice < row.metrics.precoPiso - 0.02) {
      return alert(
        `🛑 Bloqueado pelo Escudo de Margem! O valor R$ ${safePrice.toFixed(2)} está abaixo do seu Preço Piso (R$ ${row.metrics.precoPiso.toFixed(2)}).`
      );
    }

    const key = row.rowKey || row.ftId;
    setApplyingFtId(key);
    try {
      const curOv = overrides[activeChannel]?.[row.ftId] || {};
      const nextSettings = {
        ...curOv,
        cadastrado: true,
        precoVendaManual: String(safePrice.toFixed(2)),
      };

      // Atualiza também o preço real ativo se existia para refletir imediatamente na margem
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

      // Se for Mercado Livre e tiver anúncio vinculado, oferece atualizar no ML também
      if (activeChannel === 'ml' && row.primaryMl?.ml_item_id) {
        const pushToMl = window.confirm(
          `✅ Preço R$ ${safePrice.toFixed(2)} salvo no sistema para ${row.ftId}!\n\nDeseja também enviar esse novo preço agora diretamente para o anúncio ${row.primaryMl.ml_item_id} no Mercado Livre?`
        );
        if (pushToMl) {
          const tok = await getValidMlToken(profile?.empresa_id);
          await mlProxyFetch(
            `/items/${encodeURIComponent(row.primaryMl.ml_item_id)}`,
            {
              method: 'PUT',
              headers: { Authorization: `Bearer ${tok.access_token}` },
              body: JSON.stringify({ price: Number(safePrice.toFixed(2)) }),
            }
          );
          alert(`🚀 Preço do anúncio ${row.primaryMl.ml_item_id} atualizado no Mercado Livre para R$ ${safePrice.toFixed(2)}!`);
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
        dailyBudget: Number(newCampForm.dailyBudget || 15),
        empresaId: profile?.empresa_id,
      });
      setNewCampForm({ name: '', acosTarget: 10, dailyBudget: 15 });
      await handleSyncPromosAndAds();
    } catch (err) {
      alert('Erro ao criar campanha no ML: ' + err.message);
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

  const formatBRL = (v) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
            className="btn-secondary"
            onClick={() => setShowRulesPanel((p) => !p)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 700 }}
          >
            <Sliders size={16} />
            {showRulesPanel ? 'Ocultar Travas de Margem' : '🛡️ Configurar Travas de Margem'}
          </button>
          {activeChannel === 'ml' && (
            <>
              <button
                type="button"
                onClick={handleSyncPromosAndAds}
                disabled={syncingPromosAds}
                style={{
                  padding: '0.52rem 0.95rem',
                  borderRadius: '8px',
                  border: '1px solid #EAB308',
                  background: '#FFE600',
                  color: '#1F2937',
                  fontWeight: 800,
                  fontSize: '0.84rem',
                  cursor: syncingPromosAds ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
                title="Puxa a % de promoção ativa e os gastos de Product Ads (7, 15 e 30 dias) direto do Mercado Livre"
              >
                <RefreshCw size={15} className={syncingPromosAds ? 'spin' : ''} />
                {syncingPromosAds ? 'Puxando ML...' : '📡 Puxar Promoções & Ads (7/15/30d)'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowCampaignsModal(true)}
                style={{ fontWeight: 700 }}
                title="Ver, criar, ativar ou pausar suas campanhas de Product Ads"
              >
                📊 Campanhas Ads ({promosAdsCache?.campaigns?.length || 0})
              </button>
            </>
          )}
          <button
            type="button"
            className="btn-primary"
            disabled={batchCompLoading}
            onClick={handleBatchCompetitorScan}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Busca o Price to Win e os preços dos concorrentes da 1ª página para os produtos listados"
          >
            <Search size={16} />
            {batchCompLoading ? 'Analisando Concorrência...' : '🔍 Analisar Concorrentes (Lote)'}
          </button>
        </div>
      </div>

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
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
                Margem Líquida Mínima Intocável (%)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                step="0.5"
                value={rules.margemMinimaPerc}
                onChange={(e) => handleRuleChange('margemMinimaPerc', e.target.value)}
                style={ruleInputStyle}
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
                  <th style={{ textAlign: 'center' }}>🔍 Concorrentes</th>
                  <th>🤖 Diagnóstico &amp; Ação (Copiloto IA)</th>
                </tr>
              </thead>
              <tbody>
                {analyzedRows.map((row) => {
                  const { metrics, aiRec, competitor } = row;
                  const isCritico = aiRec.severity === 'critico';
                  const isOportunidade = aiRec.severity === 'oportunidade';

                  return (
                    <tr
                      key={row.rowKey || row.ftId}
                      style={
                        isCritico
                          ? { background: 'rgba(239, 68, 68, 0.05)' }
                          : isOportunidade
                          ? { background: 'rgba(37, 99, 235, 0.04)' }
                          : undefined
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
                      </td>

                      {/* Preço Piso Intocável */}
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
                          title={`Abaixo de ${formatBRL(metrics.precoPiso)} sua margem líquida cai para menos de ${rules.margemMinimaPerc}%`}
                        >
                          {formatBRL(metrics.precoPiso)}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Empate 0%: {formatBRL(metrics.precoQueima)}
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
                        {row.promoInfo?.originalPrice > row.promoInfo?.price && (
                          <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textDecoration: 'line-through' }}>
                            de {formatBRL(row.promoInfo.originalPrice)}
                          </div>
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
                              metrics.margemPosAdsPerc >= parseNumber(rules.margemMinimaPerc)
                                ? 'var(--success)'
                                : 'var(--danger)',
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

                      {/* Radar de Concorrentes */}
                      <td style={{ textAlign: 'center', minWidth: '145px' }}>
                        {competitor ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                            {competitor.priceToWin > 0 && (
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#2563EB' }}>
                                Win: {formatBRL(competitor.priceToWin)}
                              </span>
                            )}
                            {competitor.minPrice > 0 && (
                              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                1ª Pág: {formatBRL(competitor.minPrice)} a {formatBRL(competitor.maxPrice)}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => setSelectedCompDetail({ row, competitor })}
                              style={{
                                padding: '2px 7px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                background: 'var(--bg-secondary)',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Ver {competitor.competitors?.length || 0} concorrentes
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            disabled={loadingCompFt === (row.rowKey || row.ftId)}
                            onClick={() => handleAnalyzeSingleCompetitor(row)}
                            style={{
                              padding: '4px 9px',
                              borderRadius: '7px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                            }}
                          >
                            {loadingCompFt === (row.rowKey || row.ftId) ? 'Buscando...' : '🔍 Espionar'}
                          </button>
                        )}
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

                            {aiRec.suggestedPrice && (
                              <button
                                type="button"
                                disabled={applyingFtId === (row.rowKey || row.ftId)}
                                onClick={() =>
                                  handleApplyRecommendedPrice(row, aiRec.suggestedPrice)
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
                              >
                                {applyingFtId === (row.rowKey || row.ftId)
                                  ? 'Aplicando...'
                                  : `✅ ${aiRec.actionLabel}`}
                              </button>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                            {aiRec.explanation}
                          </span>
                          {activeChannel === 'ml' && row.primaryMl?.ml_item_id && (() => {
                            const adsChoice = evaluateAdsChoice({
                              adStatus: row.adsPeriodStats?.adStatus,
                              campaignId: row.adsPeriodStats?.campaignId,
                              campaigns: promosAdsCache?.campaigns || [],
                              metrics,
                              estoqueTotal: row.estoqueTotal,
                              vendasMes: row.vendasMes,
                              soldQuantityTotal: row.soldQuantityTotal,
                              rules,
                            });
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
                                </span>
                                {adsChoice.buttonLabel && (
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
                <h3 style={{ margin: 0 }}>📊 Campanhas de Product Ads (Mercado Livre)</h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  Recomendamos manter 3 ou 4 campanhas fixas (ex: Campeões, Lançamentos, Kits, Giro de Estoque) e mover os anúncios entre elas.
                </p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setShowCampaignsModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
