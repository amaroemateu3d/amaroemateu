import { useState, useEffect } from 'react';
import { getResultados, parseNumber, getCustoUnitario, getUnitProductionTime, formatTime } from '../utils/financeCalculators';
import { Settings, Save, X, Printer, CheckCircle2, RefreshCw, Loader, ShoppingBag, Link2 } from 'lucide-react';
import { fetchMlPaidOrdersForMonth, parseFtTargetKey, fetchStoredMlListings, syncListingsFromML } from '../services/mercadolivre';
import { fetchShopeePaidOrdersForMonth } from '../services/shopee';
import {
  fetchLojaCategorias,
  createLojaCategoria,
  seedDefaultLojaCategorias,
  toggleLojaCategoriaAtivo,
  deleteLojaCategoria,
  uploadLojaPhotoFile,
  findMlListingsForFt,
  importMlDataForFt,
} from '../services/lojaAdmin';
import MlFtMappingModal from '../components/vendas/MlFtMappingModal';
import SiteCategoriasModal from '../components/vendas/SiteCategoriasModal';
import SiteLojaOverrideSection from '../components/vendas/SiteLojaOverrideSection';
import SiteMlBatchImportModal from '../components/vendas/SiteMlBatchImportModal';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import './Vendas.css';
import ConfirmModal from '../components/ConfirmModal';

const CHANNELS = [
  { id: 'ml', label: 'Mercado Livre', icon: '📦' },
  { id: 'amazon', label: 'Amazon', icon: '🅰️' },
  { id: 'shopee', label: 'Shopee', icon: '🛍️' },
  { id: 'tiktok', label: 'TikTok', icon: '🎵' },
  { id: 'site', label: 'Site Próprio', icon: '🌐' }
];

function PriceInput({ initialValue, onSave }) {
  const [localValue, setLocalValue] = useState(initialValue !== undefined && initialValue !== null ? String(initialValue).replace('.', ',') : '');

  useEffect(() => {
    setLocalValue(initialValue !== undefined && initialValue !== null ? String(initialValue).replace('.', ',') : '');
  }, [initialValue]);

  const handleBlur = () => {
    const cleanValue = localValue.trim();
    const oldVal = initialValue !== undefined && initialValue !== null ? String(initialValue).replace('.', ',') : '';
    if (cleanValue !== oldVal) {
      onSave(cleanValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur();
  };

  return (
    <div className="input-wrapper" style={{maxWidth: '110px'}}>
      <span className="prefix" style={{color: 'var(--accent-primary)', fontWeight: 'bold'}}>R$</span>
      <input 
        type="text" 
        className="has-prefix" 
        style={{color: 'var(--accent-primary)', fontWeight: 'bold'}} 
        value={localValue} 
        placeholder="0,00" 
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}

function QtyInput({ initialValue, onSave }) {
  const [localValue, setLocalValue] = useState(initialValue || '');

  useEffect(() => {
    setLocalValue(initialValue || '');
  }, [initialValue]);

  const handleBlur = () => {
    if (String(localValue) !== String(initialValue || '')) {
      onSave(localValue);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') e.target.blur();
  };

  return (
    <input 
      type="number" 
      min="0" 
      className="qty-input" 
      value={localValue} 
      placeholder="0" 
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
}

export default function Vendas() {
  const { session, profile } = useAuth();
  const [activeChannel, setActiveChannel] = useState('ml');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [savedFts, setSavedFts] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [vendasMensal, setVendasMensal] = useState({});
  const [channelDefaults, setChannelDefaults] = useState({});
  const [loadingDb, setLoadingDb] = useState(true);

  const [editingOverride, setEditingOverride] = useState(null);
  const [editingGlobal, setEditingGlobal] = useState(false);
  const [globalFormData, setGlobalFormData] = useState({});
  const [showReport, setShowReport] = useState(false);
  const [selectedFts, setSelectedFts] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAutoPrecos, setShowAutoPrecos] = useState(false);
  const [autoCanais, setAutoCanais] = useState(['ml']);
  const [autoFiltro, setAutoFiltro] = useState('');
  const [apenasComPreco, setApenasComPreco] = useState(false);
  const [filterCadastrados, setFilterCadastrados] = useState(false);
  const [mainSort, setMainSort] = useState({ key: null, dir: 'desc' });

  const handleMainSort = (key) => {
    setMainSort(prev => {
      if (prev.key !== key) return { key, dir: 'desc' };
      if (prev.dir === 'desc') return { key, dir: 'asc' };
      return { key: null, dir: 'desc' };
    });
  };
  const renderMainSortArrow = (key) => mainSort.key === key ? (mainSort.dir === 'desc' ? ' ▼' : ' ▲') : '';

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: 'save', title: '', details: [], onConfirm: null });
  const openConfirm = (type, title, details, onConfirm) => setConfirmModal({ isOpen: true, type, title, details, onConfirm });
  const closeConfirm = () => setConfirmModal(m => ({ ...m, isOpen: false }));

  // Estados de integração de vendas do Mercado Livre
  const [pullingMlSales, setPullingMlSales] = useState(false);
  const [mlSalesModal, setMlSalesModal] = useState(null);
  const [mlUnmappedModal, setMlUnmappedModal] = useState({ open: false, items: [], pendingResult: null });
  const [applyingMlSales, setApplyingMlSales] = useState(false);

  // Estados de Vendas Shopee
  const [pullingShopeeSales, setPullingShopeeSales] = useState(false);
  const [shopeeSalesModal, setShopeeSalesModal] = useState(null);
  const [shopeeUnmappedModal, setShopeeUnmappedModal] = useState({ open: false, items: [], pendingResult: null });
  const [applyingShopeeSales, setApplyingShopeeSales] = useState(false);

  // Estados da Loja Própria (aba Site Próprio)
  const [lojaCategorias, setLojaCategorias] = useState([]);
  const [showCategoriasModal, setShowCategoriasModal] = useState(false);
  const [newCategoriaName, setNewCategoriaName] = useState('');
  const [mlListings, setMlListings] = useState([]);
  const [uploadingSiteFotos, setUploadingSiteFotos] = useState(false);
  const [importingSiteMl, setImportingSiteMl] = useState(false);
  const [batchSiteImportStatus, setBatchSiteImportStatus] = useState(null);
  const [showSiteMlBatchModal, setShowSiteMlBatchModal] = useState(false);
  const [syncingMlList, setSyncingMlList] = useState(false);

  const loadLojaCategorias = async () => {
    try {
      const list = await fetchLojaCategorias();
      setLojaCategorias(list);
    } catch (err) {
      console.error('Erro ao buscar categorias da loja:', err);
    }
  };

  useEffect(() => {
    loadLojaCategorias();
    fetchStoredMlListings(profile?.empresa_id).then(setMlListings).catch(() => {});
  }, [profile?.empresa_id]);

  const buildMlSalesPreview = (result) => {
    const byFt = {};
    Object.entries(result.salesByFtTarget || {}).forEach(([targetKey, qty]) => {
      const { ftId, varId } = parseFtTargetKey(targetKey);
      if (!ftId) return;
      const rev = Number(result.revenueByFtTarget?.[targetKey] || 0);
      if (!byFt[ftId]) {
        const ftObj = savedFts.find(f => f.indiceFt === ftId);
        byFt[ftId] = {
          ftId,
          nomePeca: ftObj?.nomePeca || ftId,
          sku: overrides?.ml?.[ftId]?.sku || ftObj?.sku || '',
          oldQty: Number(vendasMensal[currentMonth]?.ml?.[ftId] || 0),
          newQty: 0,
          totalRevenue: 0,
          breakdown: [],
        };
      }
      byFt[ftId].newQty += Number(qty || 0);
      byFt[ftId].totalRevenue += rev;
      if (varId) {
        const ftObj = savedFts.find(f => f.indiceFt === ftId);
        const varObj = (ftObj?.variacoesEstoque || []).find(v => v.id === varId);
        byFt[ftId].breakdown.push({
          varId,
          varNome: varObj?.nome || varId,
          qty: Number(qty || 0),
        });
      }
    });

    const summaryList = Object.values(byFt).map(item => ({
      ...item,
      realUnitPrice: item.newQty > 0 ? Number((item.totalRevenue / item.newQty).toFixed(2)) : 0,
      delta: item.newQty - item.oldQty,
    })).sort((a, b) => a.ftId.localeCompare(b.ftId, undefined, { numeric: true }));

    setMlSalesModal({
      monthStr: currentMonth,
      totalOrdersCount: result.totalOrdersCount || 0,
      unmappedCount: (result.unmappedSoldItems || []).length,
      unmappedItems: result.unmappedSoldItems || [],
      items: summaryList,
      deductStock: true,
    });
  };

  const handlePullMlSales = async (skipUnmappedPrompt = false) => {
    setPullingMlSales(true);
    try {
      const result = await fetchMlPaidOrdersForMonth({
        empresaId: profile?.empresa_id,
        monthStr: currentMonth,
      });

      if (!skipUnmappedPrompt && result.unmappedSoldItems && result.unmappedSoldItems.length > 0) {
        setMlUnmappedModal({
          open: true,
          items: result.unmappedSoldItems,
          pendingResult: result,
        });
      } else {
        buildMlSalesPreview(result);
      }
    } catch (err) {
      alert('Erro ao puxar vendas do Mercado Livre: ' + err.message);
    } finally {
      setPullingMlSales(false);
    }
  };

  const handleApplyMlSales = async () => {
    if (!mlSalesModal) return;
    setApplyingMlSales(true);
    try {
      const newVendas = { ...vendasMensal };
      if (!newVendas[currentMonth]) newVendas[currentMonth] = {};
      if (!newVendas[currentMonth].ml) newVendas[currentMonth].ml = {};

      const newOverrides = { ...overrides };
      if (!newOverrides.ml) newOverrides.ml = {};

      for (const item of mlSalesModal.items) {
        newVendas[currentMonth].ml[item.ftId] = item.newQty;

        // Salva quantidade vendida no mês em ecommerce_monthly_sales
        if (item.newQty > 0) {
          await supaWrite('ecommerce_monthly_sales', 'POST', {
            month: currentMonth,
            channel_id: 'ml',
            ft_id: item.ftId,
            quantity: item.newQty,
          }, {}, 'month,channel_id,ft_id');
        }

        // Marca automaticamente o produto como "No Ar" (cadastrado) no ML e salva o Valor Real de Venda do ML
        const curOps = newOverrides.ml[item.ftId] || {};
        const realPriceStr = item.realUnitPrice > 0 ? String(item.realUnitPrice.toFixed(2)) : curOps.precoRealVenda;
        const updatedOps = {
          ...curOps,
          cadastrado: true,
          ...(realPriceStr ? { precoRealVenda: realPriceStr } : {}),
          ...(item.realUnitPrice > 0
            ? {
                precoRealVendaMes: {
                  ...(curOps.precoRealVendaMes || {}),
                  [currentMonth]: String(item.realUnitPrice.toFixed(2)),
                },
              }
            : {}),
        };
        newOverrides.ml[item.ftId] = updatedOps;
        await supaWrite('ecommerce_overrides', 'POST', {
          channel_id: 'ml',
          ft_id: item.ftId,
          settings: updatedOps,
        }, {}, 'channel_id,ft_id');

        // Se o usuário marcou para abater a diferença no Estoque Físico
        if (mlSalesModal.deductStock && item.delta !== 0) {
          await updateFtStock(item.ftId, item.delta);
        }
      }

      setVendasMensal(newVendas);
      setOverrides(newOverrides);
      setMlSalesModal(null);
    } catch (err) {
      alert('Erro ao aplicar vendas do Mercado Livre: ' + err.message);
    } finally {
      setApplyingMlSales(false);
    }
  };

  const buildShopeeSalesPreview = (result) => {
    const byFt = {};
    Object.entries(result.salesByFtTarget || {}).forEach(([targetKey, qty]) => {
      const { ftId, varId } = parseFtTargetKey(targetKey);
      if (!ftId) return;
      const rev = Number(result.revenueByFtTarget?.[targetKey] || 0);
      if (!byFt[ftId]) {
        const ftObj = savedFts.find(f => f.indiceFt === ftId);
        byFt[ftId] = {
          ftId,
          nomePeca: ftObj?.nomePeca || ftId,
          sku: overrides?.shopee?.[ftId]?.sku || ftObj?.sku || '',
          oldQty: Number(vendasMensal[currentMonth]?.shopee?.[ftId] || 0),
          newQty: 0,
          totalRevenue: 0,
          breakdown: [],
        };
      }
      byFt[ftId].newQty += Number(qty || 0);
      byFt[ftId].totalRevenue += rev;
      if (varId) {
        const ftObj = savedFts.find(f => f.indiceFt === ftId);
        const varObj = (ftObj?.variacoesEstoque || []).find(v => v.id === varId);
        byFt[ftId].breakdown.push({
          varId,
          varNome: varObj?.nome || varId,
          qty: Number(qty || 0),
        });
      }
    });

    const summaryList = Object.values(byFt).map(item => ({
      ...item,
      realUnitPrice: item.newQty > 0 ? Number((item.totalRevenue / item.newQty).toFixed(2)) : 0,
      delta: item.newQty - item.oldQty,
    })).sort((a, b) => a.ftId.localeCompare(b.ftId, undefined, { numeric: true }));

    setShopeeSalesModal({
      monthStr: currentMonth,
      totalOrdersCount: result.totalOrdersCount || 0,
      unmappedCount: (result.unmappedSoldItems || []).length,
      unmappedItems: result.unmappedSoldItems || [],
      items: summaryList,
      deductStock: true,
    });
  };

  const handlePullShopeeSales = async (skipUnmappedPrompt = false) => {
    setPullingShopeeSales(true);
    try {
      const result = await fetchShopeePaidOrdersForMonth({
        empresaId: profile?.empresa_id,
        monthStr: currentMonth,
      });

      if (!skipUnmappedPrompt && result.unmappedSoldItems && result.unmappedSoldItems.length > 0) {
        setShopeeUnmappedModal({
          open: true,
          items: result.unmappedSoldItems,
          pendingResult: result,
        });
      } else {
        buildShopeeSalesPreview(result);
      }
    } catch (err) {
      alert('Erro ao puxar vendas da Shopee: ' + err.message);
    } finally {
      setPullingShopeeSales(false);
    }
  };

  const handleApplyShopeeSales = async () => {
    if (!shopeeSalesModal) return;
    setApplyingShopeeSales(true);
    try {
      const newVendas = { ...vendasMensal };
      if (!newVendas[currentMonth]) newVendas[currentMonth] = {};
      if (!newVendas[currentMonth].shopee) newVendas[currentMonth].shopee = {};

      const newOverrides = { ...overrides };
      if (!newOverrides.shopee) newOverrides.shopee = {};

      for (const item of shopeeSalesModal.items) {
        newVendas[currentMonth].shopee[item.ftId] = item.newQty;

        if (item.newQty > 0) {
          await supaWrite('ecommerce_monthly_sales', 'POST', {
            month: currentMonth,
            channel_id: 'shopee',
            ft_id: item.ftId,
            quantity: item.newQty,
          }, {}, 'month,channel_id,ft_id');
        }

        const curOps = newOverrides.shopee[item.ftId] || {};
        const realPriceStr = item.realUnitPrice > 0 ? String(item.realUnitPrice.toFixed(2)) : curOps.precoRealVenda;
        const updatedOps = {
          ...curOps,
          cadastrado: true,
          ...(realPriceStr ? { precoRealVenda: realPriceStr } : {}),
          ...(item.realUnitPrice > 0
            ? {
                precoRealVendaMes: {
                  ...(curOps.precoRealVendaMes || {}),
                  [currentMonth]: String(item.realUnitPrice.toFixed(2)),
                },
              }
            : {}),
        };
        newOverrides.shopee[item.ftId] = updatedOps;
        await supaWrite('ecommerce_overrides', 'POST', {
          channel_id: 'shopee',
          ft_id: item.ftId,
          settings: updatedOps,
        }, {}, 'channel_id,ft_id');

        if (shopeeSalesModal.deductStock && item.delta !== 0) {
          await updateFtStock(item.ftId, item.delta);
        }
      }

      setVendasMensal(newVendas);
      setOverrides(newOverrides);
      setShopeeSalesModal(null);
    } catch (err) {
      alert('Erro ao aplicar vendas da Shopee: ' + err.message);
    } finally {
      setApplyingShopeeSales(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoadingDb(true);
    
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      // FTs: usa fetch direto para evitar deadlock do cliente Supabase
      const ftsController = new AbortController();
      const ftsTimeout = setTimeout(() => ftsController.abort(), 10000);
      let ftsData = [];
      try {
        const ftsResp = await fetch(
          `${SUPA_URL}/rest/v1/fichas_tecnicas?select=*,id,estoque&order=id.asc`,
          { signal: ftsController.signal, headers }
        );
        if (ftsResp.ok) ftsData = await ftsResp.json();
      } catch (e) {
        console.error('[Vendas] Timeout/erro ao buscar FTs:', e);
      } finally {
        clearTimeout(ftsTimeout);
      }

      // Outras tabelas via fetch direto para máxima performance e evitar deadlocks
      const [defResp, overResp, salesResp] = await Promise.allSettled([
        fetch(`${SUPA_URL}/rest/v1/ecommerce_channel_defaults?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_overrides?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_monthly_sales?select=*`, { headers }),
      ]);

      const defData = defResp.status === 'fulfilled' && defResp.value.ok ? await defResp.value.json() : [];
      const overData = overResp.status === 'fulfilled' && overResp.value.ok ? await overResp.value.json() : [];
      const salesData = salesResp.status === 'fulfilled' && salesResp.value.ok ? await salesResp.value.json() : [];

      const cleanFts = ftsData.map(r => ({ ...r.data, estoque: r.estoque })).filter(f => f && f.indiceFt);
      cleanFts.sort((a, b) => (a.indiceFt || '').localeCompare(b.indiceFt || '', undefined, { numeric: true }));
      setSavedFts(cleanFts);

      const newDefaults = {};
      defData.forEach(d => { newDefaults[d.channel_id] = d.settings; });
      setChannelDefaults(newDefaults);

      const newOverrides = {};
      overData.forEach(o => {
        if (!newOverrides[o.channel_id]) newOverrides[o.channel_id] = {};
        newOverrides[o.channel_id][o.ft_id] = o.settings;
      });
      setOverrides(newOverrides);

      const newVendas = {};
      salesData.forEach(s => {
        if (!newVendas[s.month]) newVendas[s.month] = {};
        if (!newVendas[s.month][s.channel_id]) newVendas[s.month][s.channel_id] = {};
        newVendas[s.month][s.channel_id][s.ft_id] = s.quantity;
      });
      setVendasMensal(newVendas);
    } catch (e) {
      console.error('[Vendas] Erro geral no fetchData:', e);
    } finally {
      setLoadingDb(false);
    }
  };

  const supaWrite = async (table, method, body, filters = {}, onConflict = null) => {
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const token = session?.access_token || SUPA_KEY;
      
      let url = `${SUPA_URL}/rest/v1/${table}`;
      const queryParams = [];
      Object.entries(filters).forEach(([key, val]) => {
        queryParams.push(`${key}=eq.${encodeURIComponent(val)}`);
      });
      if (onConflict) queryParams.push(`on_conflict=${onConflict}`);
      
      if (queryParams.length > 0) url += `?${queryParams.join('&')}`;

      const options = {
        method,
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': method === 'POST' ? 'resolution=merge-duplicates' : 'return=minimal'
        }
      };
      if (body) options.body = JSON.stringify(body);

      const res = await fetch(url, options);
      if (!res.ok) {
        const txt = await res.text();
        console.error(`[SupaWrite] Falha em ${table}:`, txt);
      }
      return res;
    } catch (e) {
      console.error(`[SupaWrite] Erro de rede em ${table}:`, e);
    }
  };

  const updateFtStock = async (ftId, delta) => {
    if (delta === 0) return;
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const token = session?.access_token;
      if (!token) { console.warn('updateFtStock: sem JWT, abortando'); return; }
      
      // Busca estoque atual
      const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}&select=estoque,data`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}` }
      });
      if (!getResp.ok) return;
      const data = await getResp.json();
      const row = data[0];
      if (!row) return;
      const rawData = row.data || {};
      const hasDual = rawData.estoqueGalpao !== undefined || rawData.estoqueCasa !== undefined;
      let galpao = hasDual ? Number(rawData.estoqueGalpao || 0) : Number(row.estoque ?? 0);
      let casa = hasDual ? Number(rawData.estoqueCasa || 0) : 0;

      if (delta > 0) {
        if (galpao >= delta) {
          galpao -= delta;
        } else if (galpao > 0) {
          const rem = delta - galpao;
          galpao = 0;
          casa = Math.max(0, casa - rem);
        } else {
          casa = Math.max(0, casa - delta);
        }
      } else {
        galpao -= delta; // delta negativo devolve pro galpão
      }

      const newStock = Math.max(0, galpao + casa); // nunca negativo
      const newData = { ...rawData, estoqueGalpao: galpao, estoqueCasa: casa };

      await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ estoque: newStock, data: newData })
      });
    } catch (e) {
      console.error('Erro ao abater estoque:', e);
    }
  };

  const handleQtyChange = async (ftId, stringVal) => {
    const val = parseInt(stringVal, 10) || 0;
    
    const currentVal = vendasMensal[currentMonth]?.[activeChannel]?.[ftId] || 0;
    const delta = val - currentVal;
    
    const newVendas = { ...vendasMensal };
    if (!newVendas[currentMonth]) newVendas[currentMonth] = {};
    if (!newVendas[currentMonth][activeChannel]) newVendas[currentMonth][activeChannel] = {};
    
    newVendas[currentMonth][activeChannel][ftId] = val;
    setVendasMensal(newVendas);

    // Abater/adicionar no estoque baseado no delta
    if (delta !== 0) {
      updateFtStock(ftId, delta);
    }

    if (val > 0) {
      await supaWrite('ecommerce_monthly_sales', 'POST', {
        month: currentMonth,
        channel_id: activeChannel,
        ft_id: ftId,
        quantity: val
      }, {}, 'month,channel_id,ft_id');
    } else {
      await supaWrite('ecommerce_monthly_sales', 'DELETE', null, {
        month: currentMonth,
        channel_id: activeChannel,
        ft_id: ftId
      });
    }
  };

  const handleSync = (ftId = null) => {
    setIsSyncing(true);
    setTimeout(async () => {
      try {
        const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const resp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=*&order=id.asc`, {
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
        });
        if (!resp.ok) throw new Error("Falha ao sincronizar");
        const data = await resp.json();
        const freshFts = (data || []).map(r => r.data);
        
        if (ftId) {
          const latestFt = freshFts.find(f => f.indiceFt === ftId);
          if (latestFt) {
            setSavedFts(prev => prev.map(f => f.indiceFt === ftId ? latestFt : f));
          }
        } else if (selectedFts.length > 0) {
          setSavedFts(prev => prev.map(f => {
            if (selectedFts.includes(f.indiceFt)) {
              const latest = freshFts.find(x => x.indiceFt === f.indiceFt);
              return latest || f;
            }
            return f;
          }));
          setSelectedFts([]);
        } else {
          setSavedFts(freshFts);
        }
      } catch (err) {
        console.error("[Vendas] Erro no handleSync:", err);
      } finally {
        setIsSyncing(false);
      }
    }, 400);
  };

  const toggleSelect = (ftId) => {
    setSelectedFts(prev => 
      prev.includes(ftId) ? prev.filter(id => id !== ftId) : [...prev, ftId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedFts.length === savedFts.length) {
      setSelectedFts([]);
    } else {
      setSelectedFts(savedFts.map(f => f.indiceFt));
    }
  };

  const getChannelQty = (ftId) => {
    return vendasMensal[currentMonth]?.[activeChannel]?.[ftId] || 0;
  };

  const handlePriceChange = async (ftId, stringVal) => {
    let safeVal = stringVal;
    if (typeof stringVal === 'string') safeVal = stringVal.replace(',', '.');
    
    const nov = { ...overrides };
    if (!nov[activeChannel]) nov[activeChannel] = {};
    const currentOps = nov[activeChannel][ftId] || {};
    
    let finalOps;
    if (safeVal === "") {
       finalOps = { ...currentOps };
       delete finalOps.precoVendaManual;
       delete finalOps.precoAnuncio;
       delete finalOps.precoRankeamento;
    } else {
       const baseFt = savedFts.find(f => f.indiceFt === ftId);
       const channelFt = getFtWithOverrides(baseFt);
       const tempFt = { ...channelFt, ...currentOps, precoVendaManual: safeVal };
       const res = getResultados(tempFt);
       const custosFixos = res.custoFisicoUnit + res.custosExtras + parseNumber(tempFt.taxaFixaVenda);
       const aliquotasPerc = (parseNumber(tempFt.impostosNF) + parseNumber(tempFt.taxaMLPerc) + parseNumber(tempFt.custoEnvioPerc)) / 100;
       
       const precoVenda = parseNumber(safeVal);
       const precoRank = precoVenda > 0 && aliquotasPerc < 1 ? (custosFixos / (1 - aliquotasPerc)).toFixed(2) : "";
       const precoAnuncio = precoVenda > 0 ? (precoVenda / 0.7).toFixed(2) : "";

       finalOps = { 
         ...currentOps, 
         precoVendaManual: safeVal,
         precoAnuncio: precoAnuncio,
         precoRankeamento: precoRank
       };
    }
    
    if (Object.keys(finalOps).length === 0) {
       delete nov[activeChannel][ftId];
       await supaWrite('ecommerce_overrides', 'DELETE', null, {
          channel_id: activeChannel,
          ft_id: ftId
       });
    } else {
       nov[activeChannel][ftId] = finalOps;
        await supaWrite('ecommerce_overrides', 'POST', {
          channel_id: activeChannel,
          ft_id: ftId,
          settings: finalOps
        }, {}, 'channel_id,ft_id');
    }
    setOverrides(nov);
  };

  const getFtWithOverrides = (ftBase) => {
    const physicalFT = { ...ftBase };
    const defaults = channelDefaults[activeChannel] || {
      custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0, custoEnvioPerc: 0,
      taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0
    };
    const channelOps = overrides[activeChannel]?.[ftBase.indiceFt] || {};
    return { ...physicalFT, ...defaults, ...channelOps }; 
  };

  const getEffectiveFtForCalc = (channelFt, month = currentMonth) => {
    const realPrice = channelFt?.precoRealVendaMes?.[month] || channelFt?.precoRealVenda;
    if (parseNumber(realPrice) > 0) {
      return {
        ...channelFt,
        precoVendaSistema: channelFt.precoVendaManual,
        precoRealAtivo: String(realPrice),
        precoVendaManual: String(realPrice),
      };
    }
    return channelFt;
  };

  const getFtWithOverridesForChannel = (ftBase, channelId) => {
    const physicalFT = { ...ftBase };
    const defaults = channelDefaults[channelId] || {
      custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0, custoEnvioPerc: 0,
      taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0
    };
    const channelOps = overrides[channelId]?.[ftBase.indiceFt] || {};
    return { ...physicalFT, ...defaults, ...channelOps };
  };

  const handleAutoPriceChange = async (ftId, channelId, stringVal) => {
    let safeVal = stringVal;
    if (typeof stringVal === 'string') safeVal = stringVal.replace(',', '.');

    const nov = { ...overrides };
    if (!nov[channelId]) nov[channelId] = {};
    const currentOps = nov[channelId][ftId] || {};

    let finalOps;
    if (safeVal === '' || safeVal === '0') {
      finalOps = { ...currentOps };
      delete finalOps.precoVendaManual;
      delete finalOps.precoAnuncio;
      delete finalOps.precoRankeamento;
    } else {
      const baseFt = savedFts.find(f => f.indiceFt === ftId);
      const channelFt = getFtWithOverridesForChannel(baseFt, channelId);
      const tempFt = { ...channelFt, ...currentOps, precoVendaManual: safeVal };
      const res = getResultados(tempFt);
      const custosFixos = res.custoFisicoUnit + res.custosExtras + parseNumber(tempFt.taxaFixaVenda);
      const aliquotasPerc = (parseNumber(tempFt.impostosNF) + parseNumber(tempFt.taxaMLPerc) + parseNumber(tempFt.custoEnvioPerc)) / 100;
      const precoVenda = parseNumber(safeVal);
      const precoRank = precoVenda > 0 && aliquotasPerc < 1 ? (custosFixos / (1 - aliquotasPerc)).toFixed(2) : '';
      const precoAnuncio = precoVenda > 0 ? (precoVenda / 0.7).toFixed(2) : '';
      finalOps = { ...currentOps, precoVendaManual: safeVal, precoAnuncio, precoRankeamento: precoRank };
    }

    if (Object.keys(finalOps).length === 0) {
      delete nov[channelId][ftId];
      await supaWrite('ecommerce_overrides', 'DELETE', null, { channel_id: channelId, ft_id: ftId });
    } else {
      nov[channelId][ftId] = finalOps;
      await supaWrite('ecommerce_overrides', 'POST', { channel_id: channelId, ft_id: ftId, settings: finalOps }, {}, 'channel_id,ft_id');
    }
    setOverrides(nov);
  };

  const handleToggleCadastrado = async (ftId) => {
    const nov = { ...overrides };
    if (!nov[activeChannel]) nov[activeChannel] = {};
    const currentOps = nov[activeChannel][ftId] || {};
    const newVal = !currentOps.cadastrado;
    
    const finalOps = { ...currentOps };
    if (newVal) {
      finalOps.cadastrado = true;
    } else {
      delete finalOps.cadastrado;
    }
    
    if (Object.keys(finalOps).length === 0) {
      delete nov[activeChannel][ftId];
      await supaWrite('ecommerce_overrides', 'DELETE', null, {
        channel_id: activeChannel,
        ft_id: ftId
      });
    } else {
      nov[activeChannel][ftId] = finalOps;
      await supaWrite('ecommerce_overrides', 'POST', {
        channel_id: activeChannel,
        ft_id: ftId,
        settings: finalOps
      }, {}, 'channel_id,ft_id');
    }
    setOverrides(nov);
  };

  const handleOpenOverride = (ft) => {
    const merged = getFtWithOverrides(ft);
    setEditingOverride({ ftBase: ft, customData: merged });
  };

  const handleOverrideChange = (e) => {
    const { name, value } = e.target;
    let safeVal = value;
    const textOrComplexFields = ['sku', 'tituloLoja', 'descricaoLoja', 'medidaComCaixa', 'cadastrado', 'destaqueLoja', 'categoriasLoja', 'fotosLoja', 'variacoesLoja'];
    if (!textOrComplexFields.includes(name) && typeof value === 'string') safeVal = value.replace(',', '.');

    setEditingOverride(prev => {
      const updatedData = { ...prev.customData, [name]: safeVal };
      return { ...prev, customData: updatedData };
    });
  };

  const handleToggleSiteCategoria = (catId) => {
    setEditingOverride(prev => {
      const atual = Array.isArray(prev.customData.categoriasLoja) ? prev.customData.categoriasLoja : [];
      const existe = atual.includes(catId);
      return {
        ...prev,
        customData: {
          ...prev.customData,
          categoriasLoja: existe ? atual.filter(id => id !== catId) : [...atual, catId]
        }
      };
    });
  };

  const handleUploadSiteFotos = async (files) => {
    if (!files?.length || !editingOverride) return;
    const empresaId = profile?.empresa_id;
    if (!empresaId) return alert('Empresa não identificada.');
    const currentFotos = Array.isArray(editingOverride.customData.fotosLoja) ? editingOverride.customData.fotosLoja : [];
    const remaining = Math.max(0, 8 - currentFotos.length);
    if (remaining === 0) return alert('Limite máximo de 8 fotos por produto.');

    setUploadingSiteFotos(true);
    try {
      const toUpload = files.slice(0, remaining);
      const uploadedUrls = [];
      for (const file of toUpload) {
        const url = await uploadLojaPhotoFile(file, empresaId, editingOverride.ftBase.indiceFt);
        uploadedUrls.push(url);
      }
      setEditingOverride(prev => ({
        ...prev,
        customData: {
          ...prev.customData,
          fotosLoja: [...(Array.isArray(prev.customData.fotosLoja) ? prev.customData.fotosLoja : []), ...uploadedUrls]
        }
      }));
    } catch (err) {
      alert('Erro ao enviar foto(s): ' + err.message);
    } finally {
      setUploadingSiteFotos(false);
    }
  };

  const handleRemoveSiteFoto = (idx) => {
    setEditingOverride(prev => ({
      ...prev,
      customData: {
        ...prev.customData,
        fotosLoja: (prev.customData.fotosLoja || []).filter((_, i) => i !== idx)
      }
    }));
  };

  const handleMoveSiteFoto = (idx, dir) => {
    setEditingOverride(prev => {
      const arr = [...(prev.customData.fotosLoja || [])];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return prev;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return {
        ...prev,
        customData: { ...prev.customData, fotosLoja: arr }
      };
    });
  };

  const handleImportSiteFromMl = async (mlItemId) => {
    if (!mlItemId || !editingOverride) return;
    setImportingSiteMl(true);
    try {
      const imported = await importMlDataForFt({
        mlItemId,
        ftId: editingOverride.ftBase.indiceFt,
        empresaId: profile?.empresa_id,
        copyPhotosToStorage: true,
      });

      setEditingOverride(prev => ({
        ...prev,
        customData: {
          ...prev.customData,
          tituloLoja: prev.customData.tituloLoja || imported.tituloLoja || prev.ftBase.nomePeca,
          descricaoLoja: imported.descricaoLoja || prev.customData.descricaoLoja,
          fotosLoja: imported.fotosLoja?.length ? imported.fotosLoja : prev.customData.fotosLoja,
          variacoesLoja: imported.variacoesLoja?.length ? imported.variacoesLoja : (prev.customData.variacoesLoja || []),
          medidaComCaixa: imported.medidaComCaixa || prev.customData.medidaComCaixa,
          pesoComCaixa: imported.pesoComCaixa || prev.customData.pesoComCaixa,
          mlItemIdVinculado: imported.mlItemId,
        }
      }));

      alert(`✅ Importado do ML (${imported.mlItemId}): ${imported.fotosLoja?.length || 0} foto(s)${imported.variacoesLoja?.length ? `, ${imported.variacoesLoja.length} variação(ões)` : ''}${imported.descricaoLoja ? ', descrição' : ''}${imported.medidaComCaixa ? ', medidas' : ''}${imported.pesoComCaixa ? ' e peso' : ''}. Clique em "Salvar Substituição Local" para gravar.`);
    } catch (err) {
      alert('Erro ao importar do Mercado Livre: ' + err.message);
    } finally {
      setImportingSiteMl(false);
    }
  };

  const handleSyncMlListForSite = async () => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return alert('Empresa não identificada.');
    setSyncingMlList(true);
    try {
      const fresh = await syncListingsFromML(empresaId);
      setMlListings(fresh || []);
    } catch (err) {
      alert('Erro ao atualizar anúncios do Mercado Livre: ' + err.message);
    } finally {
      setSyncingMlList(false);
    }
  };

  const handleRunSiteMlBatchImport = async ({ selectedItems, overwriteExisting, allAssignments }) => {
    const empresaId = profile?.empresa_id;
    if (!empresaId) return alert('Empresa não identificada.');

    setBatchSiteImportStatus({ total: selectedItems.length, done: 0, errors: 0 });
    let done = 0;
    let errors = 0;
    const nextSiteOverrides = { ...(overrides.site || {}) };

    try {
      // 1. Persiste os vínculos escolhidos em marketplace_listings para não perder nunca mais
      const updatedMlList = mlListings.map((l) => {
        if (Object.prototype.hasOwnProperty.call(allAssignments, l.ml_item_id)) {
          const newFt = allAssignments[l.ml_item_id] || null;
          if (newFt !== l.ft_id) {
            return { ...l, ft_id: newFt };
          }
        }
        return l;
      });

      for (const l of mlListings) {
        if (Object.prototype.hasOwnProperty.call(allAssignments, l.ml_item_id)) {
          const newFt = allAssignments[l.ml_item_id] || null;
          if (newFt !== (l.ft_id || null)) {
            await supabase
              .from('marketplace_listings')
              .update({ ft_id: newFt })
              .eq('ml_item_id', l.ml_item_id);
          }
        }
      }
      setMlListings(updatedMlList);

      // 2. Importa fotos, descrições, medidas e pesos para cada item marcado
      for (const item of selectedItems) {
        try {
          const ft = savedFts.find((f) => f.indiceFt === item.ftId);
          const imported = await importMlDataForFt({
            mlItemId: item.mlItemId,
            ftId: item.ftId,
            empresaId,
            copyPhotosToStorage: true,
          });

          const cur = nextSiteOverrides[item.ftId] || {};
          const mergedSettings = {
            ...cur,
            tituloLoja: overwriteExisting ? (imported.tituloLoja || cur.tituloLoja || ft?.nomePeca || '') : (cur.tituloLoja || imported.tituloLoja || ft?.nomePeca || ''),
            descricaoLoja: overwriteExisting ? (imported.descricaoLoja || cur.descricaoLoja || '') : (cur.descricaoLoja || imported.descricaoLoja || ''),
            fotosLoja: overwriteExisting ? (imported.fotosLoja?.length ? imported.fotosLoja : (cur.fotosLoja || [])) : (cur.fotosLoja?.length ? cur.fotosLoja : imported.fotosLoja),
            variacoesLoja: overwriteExisting
              ? (imported.variacoesLoja?.length ? imported.variacoesLoja : (cur.variacoesLoja || []))
              : (cur.variacoesLoja?.length ? cur.variacoesLoja : (imported.variacoesLoja || [])),
            medidaComCaixa: overwriteExisting ? (imported.medidaComCaixa || cur.medidaComCaixa || ft?.medidaComCaixa || '') : (cur.medidaComCaixa || ft?.medidaComCaixa || imported.medidaComCaixa || ''),
            pesoComCaixa: overwriteExisting ? (imported.pesoComCaixa || cur.pesoComCaixa || ft?.pesoComCaixa || '') : (cur.pesoComCaixa || ft?.pesoComCaixa || imported.pesoComCaixa || ''),
            mlItemIdVinculado: imported.mlItemId,
          };

          await supaWrite('ecommerce_overrides', 'POST', {
            channel_id: 'site',
            ft_id: item.ftId,
            settings: mergedSettings,
          }, {}, 'channel_id,ft_id');

          nextSiteOverrides[item.ftId] = mergedSettings;
        } catch (err) {
          console.warn(`[Batch ML Import Site] Falha em ${item.mlItemId} -> ${item.ftId}:`, err);
          errors++;
        }
        done++;
        setBatchSiteImportStatus({ total: selectedItems.length, done, errors });
      }

      setOverrides((prev) => ({ ...prev, site: nextSiteOverrides }));
      setShowSiteMlBatchModal(false);
      alert(`✅ Vínculos salvos e importação concluída! Importados: ${done - errors} | Erros: ${errors}`);
    } finally {
      setBatchSiteImportStatus(null);
    }
  };

  const handleAddCategoria = async (e) => {
    e.preventDefault();
    if (!newCategoriaName.trim()) return;
    try {
      await createLojaCategoria({
        empresaId: profile?.empresa_id,
        nome: newCategoriaName,
        ordem: lojaCategorias.length + 1,
      });
      setNewCategoriaName('');
      await loadLojaCategorias();
    } catch (err) {
      alert('Erro ao criar categoria: ' + err.message);
    }
  };

  const handleSeedCategorias = async () => {
    try {
      await seedDefaultLojaCategorias(profile?.empresa_id);
      await loadLojaCategorias();
    } catch (err) {
      alert('Erro ao criar categorias iniciais: ' + err.message);
    }
  };

  const handleToggleCatAtivo = async (cat) => {
    try {
      await toggleLojaCategoriaAtivo(cat.id, !cat.ativo);
      await loadLojaCategorias();
    } catch (err) {
      alert('Erro ao atualizar categoria: ' + err.message);
    }
  };

  const handleDeleteCategoria = async (id) => {
    if (!window.confirm('Excluir esta categoria da loja?')) return;
    try {
      await deleteLojaCategoria(id);
      await loadLojaCategorias();
    } catch (err) {
      alert('Erro ao excluir categoria: ' + err.message);
    }
  };

  const _doSaveOverride = async () => {
    const { ftBase, customData } = editingOverride;
    const keysToOverride = [
      'sku', 'custoEmbalagem', 'custoExtra', 'custoEnvio', 'custoEnvioPerc',
      'taxaFixaVenda', 'impostosNF', 'taxaMLPerc', 'precoVendaManual',
      'precoAnuncio', 'precoRankeamento',
      'tituloLoja', 'descricaoLoja', 'categoriasLoja', 'fotosLoja', 'variacoesLoja', 'destaqueLoja',
      'medidaComCaixa', 'pesoComCaixa', 'mlItemIdVinculado'
    ];
    const finalOps = {};
    const defaults = channelDefaults[activeChannel] || {
      custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0, custoEnvioPerc: 0,
      taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0
    };

    const res = getResultados(customData);
    const custosFixos = res.custoFisicoUnit + res.custosExtras + parseNumber(customData.taxaFixaVenda);
    const aliquotasPerc = (parseNumber(customData.impostosNF) + parseNumber(customData.taxaMLPerc) + parseNumber(customData.custoEnvioPerc)) / 100;
    
    const precoVenda = parseNumber(customData.precoVendaManual);
    const precoRank = precoVenda > 0 && aliquotasPerc < 1 ? (custosFixos / (1 - aliquotasPerc)).toFixed(2) : "";
    const precoAnuncio = precoVenda > 0 ? (precoVenda / 0.7).toFixed(2) : "";

    customData.precoAnuncio = precoAnuncio;
    customData.precoRankeamento = precoRank;

    keysToOverride.forEach(k => {
      const val = customData[k];
      const isSet = Array.isArray(val) ? val.length > 0 : (val !== undefined && val !== null && val !== "");
      const isDifferentFromGlobal = Array.isArray(val) ? true : String(val ?? "") !== String(defaults[k] ?? "");
      if (isSet && isDifferentFromGlobal) finalOps[k] = val;
    });

    const existingOps = overrides[activeChannel]?.[ftBase.indiceFt] || {};
    if (existingOps.precoRealVenda) finalOps.precoRealVenda = existingOps.precoRealVenda;
    if (existingOps.precoRealVendaMes) finalOps.precoRealVendaMes = existingOps.precoRealVendaMes;
    if (activeChannel === 'site') {
      if (customData.cadastrado) finalOps.cadastrado = true;
    } else if (existingOps.cadastrado) {
      finalOps.cadastrado = true;
    }

    const newOverrides = { ...overrides };
    if (!newOverrides[activeChannel]) newOverrides[activeChannel] = {};
    
    if (Object.keys(finalOps).length === 0) {
       delete newOverrides[activeChannel][ftBase.indiceFt];
       await supaWrite('ecommerce_overrides', 'DELETE', null, {
          channel_id: activeChannel,
          ft_id: ftBase.indiceFt
       });
    } else {
       newOverrides[activeChannel][ftBase.indiceFt] = finalOps;
       await supaWrite('ecommerce_overrides', 'POST', {
      channel_id: activeChannel,
      ft_id: ftBase.indiceFt,
      settings: finalOps
    }, {}, 'channel_id,ft_id');
    }
    
    setOverrides(newOverrides);
    setEditingOverride(null);
  };

  const saveOverrideModal = () => {
    const { ftBase, customData } = editingOverride;
    const channelLabel = CHANNELS.find(c => c.id === activeChannel)?.label || activeChannel;
    openConfirm(
      'edit',
      'Salvar Substituição Local',
      [
        { label: 'Produto', value: `${ftBase.nomePeca} (${ftBase.indiceFt})` },
        { label: 'Canal', value: channelLabel },
        { label: 'Embalagem', value: `R$ ${String(customData.custoEmbalagem ?? '0').replace('.', ',')}` },
        { label: 'Envio/Frete', value: `R$ ${String(customData.custoEnvio ?? '0').replace('.', ',')}` },
        { label: 'Preço de Venda', value: customData.precoVendaManual ? `R$ ${String(customData.precoVendaManual).replace('.', ',')}` : '(sem override)' },
      ],
      _doSaveOverride
    );
  };

  const _doResetOverride = async () => {
    const { ftBase } = editingOverride;
    const newOverrides = { ...overrides };
    const wasCadastrado = newOverrides[activeChannel]?.[ftBase.indiceFt]?.cadastrado;
    
    if (wasCadastrado) {
      newOverrides[activeChannel][ftBase.indiceFt] = { cadastrado: true };
      await supaWrite('ecommerce_overrides', 'POST', {
        channel_id: activeChannel,
        ft_id: ftBase.indiceFt,
        settings: { cadastrado: true }
      }, {}, 'channel_id,ft_id');
    } else {
      if (newOverrides[activeChannel]) delete newOverrides[activeChannel][ftBase.indiceFt];
      await supaWrite('ecommerce_overrides', 'DELETE', null, {
        channel_id: activeChannel,
        ft_id: ftBase.indiceFt
      });
    }
    setOverrides(newOverrides);
    setEditingOverride(null);
  };

  const handleResetOverride = () => {
    const { ftBase } = editingOverride;
    const channelLabel = CHANNELS.find(c => c.id === activeChannel)?.label || activeChannel;
    openConfirm(
      'delete',
      'Resetar Regras do Produto',
      [
        { label: 'Produto', value: `${ftBase.nomePeca} (${ftBase.indiceFt})` },
        { label: 'Canal', value: channelLabel },
        { label: 'Ação', value: 'A customização será apagada e o produto voltará a obedecer 100% da Regra Global.' },
      ],
      _doResetOverride
    );
  };

  const openGlobalModal = () => {
    const baseline = {
      custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0, custoEnvioPerc: 0,
      taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0
    };
    const defaults = { ...baseline, ...(channelDefaults[activeChannel] || {}) };
    setGlobalFormData(defaults);
    setEditingGlobal(true);
  };

  const handleGlobalChange = (e) => {
    const { name, value } = e.target;
    let safeVal = value;
    if (name !== 'sku' && typeof value === 'string') safeVal = value.replace(',', '.');
    setGlobalFormData(prev => ({ ...prev, [name]: safeVal }));
  };

  const _doSaveGlobal = async () => {
    const newDefaults = { ...channelDefaults, [activeChannel]: globalFormData };
    setChannelDefaults(newDefaults);
    setEditingGlobal(false);

    await supaWrite('ecommerce_channel_defaults', 'POST', {
      channel_id: activeChannel,
      settings: globalFormData
    }, {}, 'channel_id');
  };

  const saveGlobalModal = () => {
    const channelLabel = CHANNELS.find(c => c.id === activeChannel)?.label || activeChannel;
    openConfirm(
      'save',
      'Salvar Regra Mestre do Canal',
      [
        { label: 'Canal', value: channelLabel },
        { label: 'Embalagem Padrão', value: `R$ ${String(globalFormData.custoEmbalagem ?? '0').replace('.', ',')}` },
        { label: 'Taxa Plataforma', value: `${String(globalFormData.taxaMLPerc ?? '0').replace('.', ',')}%` },
        { label: 'Nota Fiscal', value: `${String(globalFormData.impostosNF ?? '0').replace('.', ',')}%` },
      ],
      _doSaveGlobal
    );
  };

  const handleShopeePreset = (e) => {
    const val = e.target.value;
    if (!val) return;
    const [taxaPerc, taxaFixa] = val.split('|');
    setGlobalFormData(prev => ({
      ...prev,
      taxaMLPerc: taxaPerc,
      taxaFixaVenda: taxaFixa
    }));
    e.target.value = '';
  };

  const totalProductionTime = Object.entries(vendasMensal[currentMonth]?.[activeChannel] || {}).reduce((acc, [ftId, qty]) => {
    if (qty <= 0) return acc;
    const baseFt = savedFts.find(f => f.indiceFt === ftId);
    if (!baseFt) return acc;
    const unitTime = getUnitProductionTime(baseFt);
    return acc + (unitTime * qty);
  }, 0);

  const filteredFts = savedFts.filter(ft => {
    if (filterCadastrados && !overrides[activeChannel]?.[ft.indiceFt]?.cadastrado) {
      return false;
    }
    return (
      ft.nomePeca.toLowerCase().includes(searchTerm.toLowerCase()) || 
      ft.indiceFt.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (ft.sku || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (overrides[activeChannel]?.[ft.indiceFt]?.sku || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const totalCadastrados = savedFts.filter(ft => overrides[activeChannel]?.[ft.indiceFt]?.cadastrado).length;

  return (
    <div className="page-wrapper vendas-page">
      <div className="vendas-header">
        <div>
          <h1 className="page-title">Vendas Multi-Canal</h1>
          <p className="page-description">Controle suas vendas e customize configurações (taxas, fretes e envios) por Marketplace.</p>
        </div>
        <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
          <button className="btn-secondary" onClick={() => handleSync()} disabled={isSyncing} style={{background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--accent-primary)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <RefreshCw size={16} className={isSyncing ? 'spin' : ''} />
            {selectedFts.length > 0 ? `Sincronizar (${selectedFts.length})` : 'Sincronizar Catálogo'}
          </button>
          <button className="btn-secondary" onClick={openGlobalModal} style={{background: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)'}}>
            ⚙️ Regras Globais ({CHANNELS.find(c => c.id === activeChannel)?.label})
          </button>
          <div className="total-production-chip" style={{background: 'var(--bg-surface)', border: '1px solid var(--border-color)', padding: '0.4rem 0.8rem', borderRadius: '8px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px'}}>
            <span style={{fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 'bold'}}>Produção Total</span>
            <span style={{fontSize: '1rem', color: 'var(--accent-primary)', fontWeight: 'bold'}}>⏱️ {formatTime(totalProductionTime)}</span>
          </div>
          <div className="month-selector">
            <input type="month" value={currentMonth} onChange={(e) => setCurrentMonth(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => setShowReport(true)} style={{background: 'var(--accent-primary)', borderColor: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '8px'}}>
            <CheckCircle2 size={18} /> Fechar Mês
          </button>
        </div>
      </div>

      <div className="channels-tabs" style={{ flexWrap: 'wrap' }}>
        {CHANNELS.map(ch => (
          <button key={ch.id} className={`channel-tab ${activeChannel === ch.id ? 'active' : ''}`} onClick={() => setActiveChannel(ch.id)}>
            <span className="icon">{ch.icon}</span>
            <span className="label">{ch.label}</span>
          </button>
        ))}
        <button
          onClick={() => setShowAutoPrecos(true)}
          style={{
            marginLeft: 'auto',
            background: 'linear-gradient(135deg, #7C3AED, #4F46E5)',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            padding: '0.5rem 1rem',
            fontWeight: 700,
            fontSize: '0.85rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 8px rgba(124,58,237,0.4)',
            whiteSpace: 'nowrap'
          }}
        >
          ⚡ Automação de Preços
        </button>
      </div>

      <div className="card vendas-table-card">
        {loadingDb ? (
           <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)'}}>
             <Loader size={40} className="spinner" color="var(--primary)" style={{marginBottom: '1rem'}} />
             <p>Sincronizando vendas e regras na nuvem...</p>
           </div>
        ) : savedFts.length === 0 ? (
           <div style={{textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)'}}>
             <p>Você não possui Fichas Técnicas cadastradas ainda.</p>
           </div>
        ) : (
          <div className="table-responsive">
            <div style={{padding: '1.25rem', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem'}}>
               <div style={{display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap'}}>
                 {activeChannel === 'site' && (
                   <>
                     <button
                       type="button"
                       onClick={() => setShowCategoriasModal(true)}
                       style={{
                         background: 'var(--bg-secondary)',
                         color: 'var(--text-primary)',
                         border: '1px solid var(--border-color)',
                         borderRadius: '8px',
                         padding: '0.48rem 0.9rem',
                         fontWeight: 700,
                         fontSize: '0.82rem',
                         cursor: 'pointer',
                         whiteSpace: 'nowrap'
                       }}
                     >
                       🏷️ Categorias da Loja ({lojaCategorias.length})
                     </button>
                     <button
                       type="button"
                       onClick={() => setShowSiteMlBatchModal(true)}
                       style={{
                         background: 'rgba(251, 191, 36, 0.1)',
                         color: '#D97706',
                         border: '1px solid rgba(245, 158, 11, 0.5)',
                         borderRadius: '8px',
                         padding: '0.48rem 0.9rem',
                         fontWeight: 700,
                         fontSize: '0.82rem',
                         cursor: 'pointer',
                         whiteSpace: 'nowrap'
                       }}
                       title="Abrir lista de anúncios do Mercado Livre para vincular às FTs e importar fotos/descrições"
                     >
                       🛍️ Vincular &amp; Importar do ML
                     </button>
                   </>
                 )}
                 {activeChannel === 'ml' && (
                   <button
                     onClick={() => handlePullMlSales(false)}
                     disabled={pullingMlSales}
                     style={{
                       background: '#FFE600',
                       color: '#1f2937',
                       border: '1px solid #EAB308',
                       borderRadius: '8px',
                       padding: '0.5rem 1rem',
                       fontWeight: 800,
                       fontSize: '0.84rem',
                       cursor: pullingMlSales ? 'wait' : 'pointer',
                       display: 'flex',
                       alignItems: 'center',
                       gap: '6px',
                       boxShadow: '0 2px 6px rgba(234,179,8,0.25)',
                       whiteSpace: 'nowrap'
                     }}
                     title="Puxa os pedidos pagos do Mercado Livre neste mês. Na 1ª vez que um item ou variação aparecer, abre a janela para você vincular à FT correta e memoriza para sempre!"
                   >
                     <RefreshCw size={15} className={pullingMlSales ? 'spin' : ''} />
                     {pullingMlSales ? 'Buscando vendas no ML...' : `📦 Puxar Vendas ML (${currentMonth})`}
                   </button>
                 )}
                 <button
                   onClick={() => setFilterCadastrados(p => !p)}
                   style={{
                     background: filterCadastrados ? 'var(--success)' : 'var(--bg-secondary)',
                     color: filterCadastrados ? 'white' : 'var(--text-primary)',
                     border: `1px solid ${filterCadastrados ? 'var(--success)' : 'var(--border-color)'}`,
                     borderRadius: '8px',
                     padding: '0.5rem 1rem',
                     fontWeight: 600,
                     fontSize: '0.85rem',
                     cursor: 'pointer',
                     display: 'flex',
                     alignItems: 'center',
                     gap: '6px',
                     transition: 'all 0.2s'
                   }}
                 >
                   {filterCadastrados ? '✅' : '☐'} Apenas Cadastrados ({totalCadastrados})
                 </button>
                 <span style={{fontSize: '0.78rem', color: 'var(--text-secondary)'}}>
                   💡 Marque a coluna <strong>"No Ar"</strong> para fixar os produtos à venda no topo da lista de <strong>{CHANNELS.find(c => c.id === activeChannel)?.label}</strong>.
                 </span>
               </div>
               <div className="search-bar" style={{maxWidth: '300px'}}>
                  <span className="search-icon">🔍</span>
                  <input type="text" placeholder="Buscar peça ou código..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
               </div>
            </div>
            <table className="fts-table">
              <thead>
                <tr>
                  <th style={{textAlign: 'center'}}><input type="checkbox" onChange={toggleSelectAll} checked={selectedFts.length === savedFts.length && savedFts.length > 0} /></th>
                  <th style={{textAlign: 'center', width: '50px'}} title="Marcar se o produto está cadastrado à venda nesta plataforma">No Ar</th>
                  <th style={{textAlign: 'center', width: '40px'}} title="Status Ativo na Plataforma">✅</th>
                  <th style={{textAlign: 'center', width: '40px'}} title="Regras Customizadas no Canal">⚙️</th>
                  <th className="col-id" onClick={() => handleMainSort('id')} style={{cursor: 'pointer', userSelect: 'none'}} title="Clique para ordenar por ID">ID{renderMainSortArrow('id')}</th>
                  <th className="col-product" onClick={() => handleMainSort('nome')} style={{cursor: 'pointer', userSelect: 'none'}} title="Clique para ordenar por Produto">Produto{renderMainSortArrow('nome')}</th>
                  <th className="col-time" onClick={() => handleMainSort('peso')} style={{cursor: 'pointer', userSelect: 'none'}} title="Clique para ordenar por Peso">Peso{renderMainSortArrow('peso')}</th>
                  <th className="col-cost" onClick={() => handleMainSort('prod')} style={{cursor: 'pointer', userSelect: 'none'}} title="Clique para ordenar por Custo de Produção">Prod.{renderMainSortArrow('prod')}</th>
                  <th className="col-sell" onClick={() => handleMainSort('venda')} style={{cursor: 'pointer', userSelect: 'none'}} title="Clique para ordenar por Despesas de Venda">Venda{renderMainSortArrow('venda')}</th>
                  <th className="col-final" onClick={() => handleMainSort('custoFinal')} style={{cursor: 'pointer', userSelect: 'none'}} title="Clique para ordenar por Custo Final">Custo Final{renderMainSortArrow('custoFinal')}</th>
                  <th className="col-price" style={{color: 'var(--text-secondary)', textAlign: 'center'}}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', lineHeight: '1.1', color: 'var(--text-secondary)' }}>
                      <span onClick={() => handleMainSort('precoVenda')} style={{cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)'}} title="Clique para ordenar por Valor de Venda">VALOR DE:</span>
                      <div style={{ display: 'grid', gridTemplateColumns: '90px 110px 90px', gap: '8px', fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 700, width: '100%', textAlign: 'center' }}>
                        <span onClick={() => handleMainSort('precoCadastro')} style={{cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)'}} title="Clique para ordenar por Cadastro">CADASTRO{renderMainSortArrow('precoCadastro')}</span>
                        <span onClick={() => handleMainSort('precoVenda')} style={{cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)'}} title="Clique para ordenar por Valor de Venda">VENDA{renderMainSortArrow('precoVenda')}</span>
                        <span onClick={() => handleMainSort('precoQueima')} style={{cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)'}} title="Clique para ordenar por Queima">QUEIMA{renderMainSortArrow('precoQueima')}</span>
                      </div>
                    </div>
                  </th>
                  <th className="col-marg" onClick={() => handleMainSort('margem')} style={{color: 'var(--success)', cursor: 'pointer', userSelect: 'none'}} title="Clique para ordenar por % Margem">% Marg.{renderMainSortArrow('margem')}</th>
                  <th className="col-profit" onClick={() => handleMainSort('lucro')} style={{color: 'var(--success)', cursor: 'pointer', userSelect: 'none'}} title="Clique para ordenar por Lucro">Lucro{renderMainSortArrow('lucro')}</th>
                  <th className="col-qty" onClick={() => handleMainSort('qty')} style={{textAlign: 'center', cursor: 'pointer', userSelect: 'none'}} title="Clique para ordenar por Quantidade">Qtd.{renderMainSortArrow('qty')}</th>
                  <th className="col-actions" style={{textAlign: 'right'}}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {[...filteredFts].sort((a, b) => {
                  const cadA = overrides[activeChannel]?.[a.indiceFt]?.cadastrado ? 1 : 0;
                  const cadB = overrides[activeChannel]?.[b.indiceFt]?.cadastrado ? 1 : 0;
                  if (cadA !== cadB) return cadB - cadA;

                  if (mainSort.key) {
                    const mult = mainSort.dir === 'desc' ? -1 : 1;
                    if (mainSort.key === 'id') return mult * (a.indiceFt || '').localeCompare(b.indiceFt || '', undefined, { numeric: true });
                    if (mainSort.key === 'nome') return mult * (a.nomePeca || '').localeCompare(b.nomePeca || '');
                    if (mainSort.key === 'peso') {
                      const pA = parseNumber(a.pesoGramas) / Math.max(1, parseNumber(a.quantidade));
                      const pB = parseNumber(b.pesoGramas) / Math.max(1, parseNumber(b.quantidade));
                      return mult * (pA - pB);
                    }
                    const chA = getFtWithOverrides(a);
                    const chB = getFtWithOverrides(b);
                    const effA = getEffectiveFtForCalc(chA);
                    const effB = getEffectiveFtForCalc(chB);
                    const resA = getResultados(effA);
                    const resB = getResultados(effB);
                    if (mainSort.key === 'prod') return mult * (resA.despesasProducao - resB.despesasProducao);
                    if (mainSort.key === 'venda') return mult * (resA.despesasVenda - resB.despesasVenda);
                    if (mainSort.key === 'custoFinal') return mult * (resA.custoUnitario - resB.custoUnitario);
                    if (mainSort.key === 'precoVenda') return mult * (parseNumber(chA.precoVendaManual) - parseNumber(chB.precoVendaManual));
                    if (mainSort.key === 'precoCadastro') return mult * ((parseNumber(chA.precoVendaManual) / 0.7) - (parseNumber(chB.precoVendaManual) / 0.7));
                    if (mainSort.key === 'precoQueima') {
                      const cfA = resA.custoFisicoUnit + resA.custosExtras + parseNumber(chA.taxaFixaVenda);
                      const alA = (parseNumber(chA.impostosNF) + parseNumber(chA.taxaMLPerc) + parseNumber(chA.custoEnvioPerc)) / 100;
                      const rkA = parseNumber(chA.precoVendaManual) > 0 && alA < 1 ? cfA / (1 - alA) : 0;
                      const cfB = resB.custoFisicoUnit + resB.custosExtras + parseNumber(chB.taxaFixaVenda);
                      const alB = (parseNumber(chB.impostosNF) + parseNumber(chB.taxaMLPerc) + parseNumber(chB.custoEnvioPerc)) / 100;
                      const rkB = parseNumber(chB.precoVendaManual) > 0 && alB < 1 ? cfB / (1 - alB) : 0;
                      return mult * (rkA - rkB);
                    }
                    if (mainSort.key === 'margem') return mult * (resA.margemContribuicaoPerc - resB.margemContribuicaoPerc);
                    if (mainSort.key === 'lucro') return mult * (resA.lucroLiquido - resB.lucroLiquido);
                    if (mainSort.key === 'qty') return mult * (getChannelQty(a.indiceFt) - getChannelQty(b.indiceFt));
                  }

                  const qtyA = getChannelQty(a.indiceFt);
                  const qtyB = getChannelQty(b.indiceFt);
                  if (qtyA > 0 && qtyB === 0) return -1;
                  if (qtyA === 0 && qtyB > 0) return 1;
                  return (a.indiceFt || '').localeCompare(b.indiceFt || '', undefined, { numeric: true });
                }).map(baseFt => {
                  const channelFt = getFtWithOverrides(baseFt);
                  const effectiveFt = getEffectiveFtForCalc(channelFt);
                  const res = getResultados(effectiveFt);
                  const qty = getChannelQty(baseFt.indiceFt);
                  const precoRealVenda = effectiveFt.precoRealAtivo;
                  const isCadastrado = !!overrides[activeChannel]?.[baseFt.indiceFt]?.cadastrado;
                  const customKeys = Object.keys(overrides[activeChannel]?.[baseFt.indiceFt] || {}).filter(k => k !== 'cadastrado');
                  const hasCustom = customKeys.length > 0;
                  const pesoUnit = (parseNumber(baseFt.pesoGramas) / Math.max(1, parseNumber(baseFt.quantidade))).toFixed(1);
                  return (
                    <tr key={baseFt.indiceFt} className={selectedFts.includes(baseFt.indiceFt) ? 'row-selected' : ''} style={isCadastrado ? {background: 'rgba(16, 185, 129, 0.04)'} : {}}>
                      <td style={{textAlign: 'center'}}><input type="checkbox" checked={selectedFts.includes(baseFt.indiceFt)} onChange={() => toggleSelect(baseFt.indiceFt)} /></td>
                      <td style={{textAlign: 'center'}}>
                        <input
                          type="checkbox"
                          checked={isCadastrado}
                          onChange={() => handleToggleCadastrado(baseFt.indiceFt)}
                          title={isCadastrado ? "Produto cadastrado nesta plataforma (clique para desmarcar)" : "Marcar como cadastrado nesta plataforma"}
                          style={{width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--success)'}}
                        />
                      </td>
                      <td style={{textAlign: 'center', width: '40px'}}>
                        {isCadastrado ? <span className="override-badge" style={{marginLeft: 0, background: 'rgba(16, 185, 129, 0.15)', color: '#059669', borderColor: '#059669', padding: '2px 5px'}} title="Produto ativo/cadastrado nesta plataforma">✅</span> : <span style={{color: 'var(--border-color)', fontSize: '0.75rem'}}>—</span>}
                      </td>
                      <td style={{textAlign: 'center', width: '40px'}}>
                        {hasCustom ? <span className="override-badge" style={{marginLeft: 0, padding: '2px 5px'}} title="Possui custos editados isoladamente para este canal.">⚙️</span> : <span style={{color: 'var(--border-color)', fontSize: '0.75rem'}}>—</span>}
                      </td>
                      <td><span className="badge">{baseFt.indiceFt}</span></td>
                      <td style={{fontWeight: '600', whiteSpace: 'nowrap'}}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <span>{baseFt.nomePeca}</span>
                          {(channelFt.sku || baseFt.sku) && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontFamily: 'monospace', fontWeight: 600 }}>
                              🏷️ SKU: {channelFt.sku || baseFt.sku}
                            </span>
                          )}
                          {activeChannel === 'site' && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '2px' }}>
                              {channelFt.destaqueLoja && (
                                <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.16)', color: '#D97706', fontWeight: 700 }} title="Destaque no Carrossel">
                                  ⭐ Carrossel
                                </span>
                              )}
                              {channelFt.fotosLoja?.length > 0 ? (
                                <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669', fontWeight: 700 }}>
                                  📷 {channelFt.fotosLoja.length}
                                </span>
                              ) : isCadastrado ? (
                                <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.12)', color: '#DC2626', fontWeight: 700 }}>
                                  ⚠️ Sem foto
                                </span>
                              ) : null}
                              {Array.isArray(channelFt.variacoesLoja) && channelFt.variacoesLoja.length > 0 && (
                                <span style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(37, 99, 235, 0.12)', color: '#2563EB', fontWeight: 700 }} title="Variações configuradas na loja">
                                  🎨 {channelFt.variacoesLoja.filter(v => v.ativo !== false).length} var.
                                </span>
                              )}
                              {(channelFt.categoriasLoja || []).map(catId => {
                                const cat = lojaCategorias.find(c => c.id === catId);
                                if (!cat) return null;
                                return (
                                  <span key={catId} style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '999px', background: 'rgba(124, 58, 237, 0.12)', color: '#7C3AED', fontWeight: 600 }}>
                                    {cat.nome}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{color: 'var(--text-secondary)', whiteSpace: 'nowrap'}}>{pesoUnit}g</td>
                      <td style={{color: 'var(--text-secondary)', whiteSpace: 'nowrap'}}>R$ {res.despesasProducao.toFixed(2)}</td>
                      <td style={{color: 'var(--danger)', whiteSpace: 'nowrap'}}>R$ {res.despesasVenda.toFixed(2)}</td>
                      <td style={{whiteSpace: 'nowrap'}}><strong>R$ {res.custoUnitario.toFixed(2)}</strong></td>
                      <td>
                         <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                           <div style={{ display: 'grid', gridTemplateColumns: '90px 110px 90px', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', justifyContent: 'center' }}>
                             {channelFt.precoVendaManual ? (
                               <span className="mini-price-tag" style={{ textAlign: 'center' }} title="Valor de Cadastro / Anúncio (Venda / 0,70)">R$ {String((parseNumber(channelFt.precoVendaManual) / 0.7).toFixed(2)).replace('.', ',')}</span>
                             ) : (
                               <span className="mini-price-tag" style={{ textAlign: 'center', opacity: 0.45 }}>—</span>
                             )}
                             <PriceInput 
                                initialValue={channelFt.precoVendaManual} 
                                onSave={(val) => handlePriceChange(baseFt.indiceFt, val)} 
                             />
                             {channelFt.precoVendaManual ? (
                               <span className="mini-price-tag" style={{ textAlign: 'center' }} title="Valor de Queima / Rankeamento (Margem 0%)">R$ {(() => {
                                  const custosFixos = res.custoFisicoUnit + res.custosExtras + parseNumber(channelFt.taxaFixaVenda);
                                  const aliquotasPerc = (parseNumber(channelFt.impostosNF) + parseNumber(channelFt.taxaMLPerc) + parseNumber(channelFt.custoEnvioPerc)) / 100;
                                  const rankVal = aliquotasPerc < 1 ? custosFixos / (1 - aliquotasPerc) : 0;
                                  return String(rankVal.toFixed(2)).replace('.', ',');
                               })()}</span>
                             ) : (
                               <span className="mini-price-tag" style={{ textAlign: 'center', opacity: 0.45 }}>—</span>
                             )}
                           </div>
                           {precoRealVenda && (
                             <div
                               style={{
                                 fontSize: '0.68rem',
                                 color: '#047857',
                                 background: 'rgba(16, 185, 129, 0.12)',
                                 border: '1px solid rgba(16, 185, 129, 0.35)',
                                 borderRadius: '4px',
                                 padding: '1px 6px',
                                 fontWeight: 700,
                                 cursor: 'help'
                               }}
                               title={`Vendido no Mercado Livre por R$ ${String(Number(precoRealVenda).toFixed(2)).replace('.', ',')}. Despesas, % Margem e Lucro estão calculados sobre este valor real!`}
                             >
                               📦 ML Real: R$ {String(Number(precoRealVenda).toFixed(2)).replace('.', ',')}
                             </div>
                           )}
                         </div>
                      </td>
                      <td style={{whiteSpace: 'nowrap'}}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <strong style={{color: res.margemContribuicaoPerc > 0 ? 'var(--success)' : (res.margemContribuicaoPerc === 0 ? 'var(--text-secondary)' : 'var(--danger)')}}>
                            {res.margemContribuicaoPerc.toFixed(1)}%
                          </strong>
                          {precoRealVenda && (
                            <span style={{ fontSize: '0.62rem', color: '#059669', fontWeight: 600 }} title="Calculado sobre o valor real vendido no Mercado Livre">
                              (s/ ML real)
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{whiteSpace: 'nowrap'}}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <strong style={{color: res.lucroLiquido >= 0 ? 'var(--success)' : 'var(--danger)'}}>
                            R$ {res.lucroLiquido.toFixed(2)}
                          </strong>
                          {precoRealVenda && (
                            <span style={{ fontSize: '0.62rem', color: '#059669', fontWeight: 600 }} title="Calculado sobre o valor real vendido no Mercado Livre">
                              (s/ ML real)
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{textAlign: 'center'}}>
                         <QtyInput 
                            initialValue={qty === 0 ? '' : qty} 
                            onSave={(val) => handleQtyChange(baseFt.indiceFt, val)} 
                         />
                      </td>
                      <td style={{textAlign: 'right'}}><div style={{display: 'flex', gap: '8px', justifyContent: 'flex-end'}}><button className="btn-icon sync-btn" title="Sincronizar esta FT" onClick={() => handleSync(baseFt.indiceFt)}><RefreshCw size={14} /></button><button className="btn-icon adjust-btn" onClick={() => handleOpenOverride(baseFt)} title="Config. do Canal"><Settings size={16} /></button></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editingOverride && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-body" style={{maxHeight: '75vh'}}>
               {(() => {
                  const res = getResultados(editingOverride.customData);
                  return (
                    <div className="modal-unified-layout">
                      {/* Métricas de Lucratividade Consolidadas (Agora no topo) */}
                      <div className="modal-profitability-metrics">
                        <div className="metric-box">
                          <span className="metric-label">Custo Unitário Total</span>
                          <h4 className="metric-value">R$ {res.custoUnitario.toFixed(2)}</h4>
                        </div>
                        <div className={`metric-box ${res.margemContribuicaoPerc > 0 ? 'positive' : 'negative'}`}>
                          <span className="metric-label">Margem de Contribuição</span>
                          <h4 className="metric-value">{res.margemContribuicaoPerc.toFixed(1)}%</h4>
                        </div>
                        <div className={`metric-box ${res.lucroLiquido >= 0 ? 'positive' : 'negative'}`}>
                          <span className="metric-label">Lucro Líquido</span>
                          <h4 className="metric-value">R$ {res.lucroLiquido.toFixed(2)}</h4>
                        </div>
                      </div>

                      {/* Propriedades do Produto */}
                      <div className="modal-prod-summary">
                        <span style={{color: 'var(--accent-primary)', fontWeight: 'bold'}}>💎 {editingOverride.ftBase.nomePeca} ({editingOverride.ftBase.indiceFt})</span>
                        <span>⚖️ Peso: {(parseNumber(editingOverride.ftBase.pesoGramas) / Math.max(1, parseNumber(editingOverride.ftBase.quantidade))).toFixed(1)}g</span>
                        <span>⏱️ Impressão: {formatTime(getUnitProductionTime(editingOverride.ftBase))}</span>
                        {editingOverride.ftBase.medidaSemCaixa && <span>📦 Sem Caixa: {editingOverride.ftBase.medidaSemCaixa}</span>}
                        {editingOverride.ftBase.medidaComCaixa && <span>🏷️ Com Caixa: {editingOverride.ftBase.medidaComCaixa}</span>}
                      </div>

                      {/* Lista de Custos Unificados */}
                      <div className="costs-unified-section">
                        
                        {/* Grupo: Custos de Produção (Fixo) */}
                        <div className="costs-group fixed-costs">
                          <h4 className="group-title">🛠️ Custos de Produção (Fixo / Ficha Técnica)</h4>
                          <div className="costs-list-fixed">
                            <div className="cost-row-fixed">
                              <span>Matéria-Prima (Filamento)</span>
                              <strong>R$ {res.custoMaterialUnit.toFixed(2)}</strong>
                            </div>
                            <div className="cost-row-fixed">
                              <span>Consumo de Energia Elétrica</span>
                              <strong>R$ {res.custoEnergiaUnit.toFixed(2)}</strong>
                            </div>
                            <div className="cost-row-fixed">
                              <span>Depreciação de Máquina</span>
                              <strong>R$ {res.custoMaquinaUnit.toFixed(2)}</strong>
                            </div>
                            <div className="cost-row-fixed">
                              <span>Gastos Extras de Produção</span>
                              <strong>R$ {res.custosExtrasAdic.toFixed(2)}</strong>
                            </div>
                            <div className="cost-row-fixed subtotal">
                              <span>Subtotal Produção</span>
                              <strong>R$ {res.custoFisicoUnit.toFixed(2)}</strong>
                            </div>
                          </div>
                        </div>

                        {/* Grupo: Configurações de Venda & Marketplace (Editável) */}
                        <div className="costs-group editable-costs">
                          <h4 className="group-title">🌐 Custos e Taxas do Marketplace (Editável)</h4>
                          <div style={{ marginBottom: '0.85rem', padding: '0.7rem 0.9rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>🏷️ SKU do Produto ({CHANNELS.find(c => c.id === activeChannel)?.label}):</label>
                            <input
                              type="text"
                              name="sku"
                              value={editingOverride.customData.sku ?? editingOverride.ftBase.sku ?? ''}
                              onChange={handleOverrideChange}
                              placeholder="Ex: AM3D-FT16-ML (preenchido ao vincular ML ou manual)"
                              style={{ flex: 1, minWidth: '200px', padding: '0.4rem 0.65rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }}
                            />
                          </div>
                          
                          <div className="override-grid">
                            <div className="input-group">
                              <label>Embalagem</label>
                              <div className="input-wrapper">
                                <span className="prefix">R$</span>
                                <input type="text" name="custoEmbalagem" className="has-prefix" value={String(editingOverride.customData.custoEmbalagem ?? '').replace('.', ',')} onChange={handleOverrideChange} placeholder="0,00" />
                              </div>
                            </div>
                            
                            <div className="input-group">
                              <label>Extras Venda</label>
                              <div className="input-wrapper">
                                <span className="prefix">R$</span>
                                <input type="text" name="custoExtra" className="has-prefix" value={String(editingOverride.customData.custoExtra ?? '').replace('.', ',')} onChange={handleOverrideChange} placeholder="0,00" />
                              </div>
                            </div>
                            
                            <div className="input-group">
                              <label>Envio/Frete Fixo</label>
                              <div className="input-wrapper">
                                <span className="prefix">R$</span>
                                <input type="text" name="custoEnvio" className="has-prefix" value={String(editingOverride.customData.custoEnvio ?? '').replace('.', ',')} onChange={handleOverrideChange} placeholder="0,00" />
                              </div>
                            </div>
                            
                            <div className="input-group">
                              <label>Frete %</label>
                              <div className="input-wrapper">
                                <span className="suffix">%</span>
                                <input type="text" name="custoEnvioPerc" className="has-suffix" value={String(editingOverride.customData.custoEnvioPerc ?? '').replace('.', ',')} onChange={handleOverrideChange} placeholder="0,00" />
                              </div>
                            </div>
                            
                            <div className="input-group">
                              <label>Taxa Fixa Venda</label>
                              <div className="input-wrapper">
                                <span className="prefix">R$</span>
                                <input type="text" name="taxaFixaVenda" className="has-prefix" value={String(editingOverride.customData.taxaFixaVenda ?? '').replace('.', ',')} onChange={handleOverrideChange} placeholder="0,00" />
                              </div>
                            </div>
                            
                            <div className="input-group">
                              <label>Nota Fiscal</label>
                              <div className="input-wrapper">
                                <span className="suffix">%</span>
                                <input type="text" name="impostosNF" className="has-suffix" value={String(editingOverride.customData.impostosNF ?? '').replace('.', ',')} onChange={handleOverrideChange} placeholder="0,00" />
                              </div>
                            </div>
                            
                            <div className="input-group">
                              <label>Taxa Plataforma</label>
                              <div className="input-wrapper">
                                <span className="suffix">%</span>
                                <input type="text" name="taxaMLPerc" className="has-suffix" value={String(editingOverride.customData.taxaMLPerc ?? '').replace('.', ',')} onChange={handleOverrideChange} placeholder="0,00" />
                              </div>
                            </div>

                            {/* Seção de Precificação Tripla */}
                            <div className="override-highlight" style={{ gridColumn: 'span 3', display: 'flex', flexDirection: 'column', gap: '0.8rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '10px', textAlign: 'left' }}>
                              <h5 style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🏷️ VALOR DE:</h5>
                              
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.8rem' }}>
                                
                                {/* 1. Valor de Cadastro (Auto-calculado) */}
                                <div className="input-group" style={{ margin: 0 }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>CADASTRO</label>
                                  <div className="input-wrapper" style={{ marginTop: '4px' }}>
                                    <span className="prefix">R$</span>
                                    <input 
                                      type="text" 
                                      name="precoAnuncio" 
                                      className="has-prefix" 
                                      value={editingOverride.customData.precoVendaManual ? String((parseNumber(editingOverride.customData.precoVendaManual) / 0.7).toFixed(2)).replace('.', ',') : '0,00'} 
                                      disabled 
                                      style={{ background: 'var(--bg-primary)', opacity: 0.85, fontWeight: 'bold', color: 'var(--text-secondary)', cursor: 'not-allowed' }}
                                    />
                                  </div>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>Venda / 0,70 (Margem 30%)</span>
                                </div>

                                {/* 2. Valor de Venda (Preço Ideal) */}
                                <div className="input-group" style={{ margin: 0 }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>VENDA</label>
                                  <div className="input-wrapper" style={{ marginTop: '4px' }}>
                                    <span className="prefix">R$</span>
                                    <input 
                                      type="text" 
                                      name="precoVendaManual" 
                                      className="has-prefix" 
                                      value={String(editingOverride.customData.precoVendaManual ?? '').replace('.', ',')} 
                                      onChange={handleOverrideChange} 
                                      placeholder="0,00" 
                                      style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}
                                    />
                                  </div>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>Preço ideal praticado</span>
                                </div>

                                {/* 3. Valor de Queima (Auto-calculado) */}
                                <div className="input-group" style={{ margin: 0 }}>
                                  <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-secondary)' }}>QUEIMA</label>
                                  <div className="input-wrapper" style={{ marginTop: '4px' }}>
                                    <span className="prefix">R$</span>
                                    <input 
                                      type="text" 
                                      name="precoRankeamento" 
                                      className="has-prefix" 
                                      value={(() => {
                                        const res = getResultados(editingOverride.customData);
                                        const custosFixos = res.custoFisicoUnit + res.custosExtras + parseNumber(editingOverride.customData.taxaFixaVenda);
                                        const aliquotasPerc = (parseNumber(editingOverride.customData.impostosNF) + parseNumber(editingOverride.customData.taxaMLPerc) + parseNumber(editingOverride.customData.custoEnvioPerc)) / 100;
                                        const rankVal = aliquotasPerc < 1 ? custosFixos / (1 - aliquotasPerc) : 0;
                                        return String(rankVal.toFixed(2)).replace('.', ',');
                                      })()} 
                                      disabled 
                                      style={{ background: 'var(--bg-primary)', opacity: 0.85, fontWeight: 'bold', color: 'var(--text-secondary)', cursor: 'not-allowed' }}
                                    />
                                  </div>
                                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'block', marginTop: '2px' }}>Break-even (Contrib. 0%)</span>
                                </div>

                              </div>
                            </div>
                          </div>
                        </div>

                        {activeChannel === 'site' && (
                          <SiteLojaOverrideSection
                            customData={editingOverride.customData}
                            ftBase={editingOverride.ftBase}
                            onChange={handleOverrideChange}
                            categorias={lojaCategorias}
                            onManageCategorias={() => setShowCategoriasModal(true)}
                            onToggleCategoria={handleToggleSiteCategoria}
                            onUploadFotos={handleUploadSiteFotos}
                            onRemoveFoto={handleRemoveSiteFoto}
                            onMoveFoto={handleMoveSiteFoto}
                            uploadingFotos={uploadingSiteFotos}
                            mlLinkedListings={findMlListingsForFt(mlListings, editingOverride.ftBase.indiceFt)}
                            allMlListings={mlListings}
                            onImportFromMl={handleImportSiteFromMl}
                            importingMl={importingSiteMl}
                          />
                        )}

                      </div>

                    </div>
                  );
               })()}
            </div>
            <div className="modal-footer" style={{justifyContent: 'space-between'}}><button className="btn-secondary" onClick={handleResetOverride} style={{color: 'var(--danger)', borderColor: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px'}}>🗑️ Resetar Regras</button><div style={{display: 'flex', gap: '10px'}}><button className="btn-secondary" onClick={() => setEditingOverride(null)}>Cancelar</button><button className="btn-primary" onClick={saveOverrideModal}><Save size={18}/> Salvar Substituição Local</button></div></div>
          </div>
        </div>
      )}

      {editingGlobal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header"><div><h3>⚙️ Configurações Gerais - {CHANNELS.find(c => c.id === activeChannel)?.label}</h3><p>Defina o formato de comissão, imposto e precificação <strong>PADRÃO</strong> para todas as peças vendidas neste canal.</p></div><button className="btn-icon" onClick={() => setEditingGlobal(false)}><X size={24}/></button></div>
            <div className="modal-body">
               {activeChannel === 'shopee' && (
                 <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px' }}><label style={{ display: 'block', fontWeight: 'bold', color: '#B91C1C', marginBottom: '0.5rem', fontSize: '0.9rem' }}>🛍️ Preenchimento Automático Shopee</label><select onChange={handleShopeePreset} defaultValue="" style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #FCA5A5', cursor: 'pointer' }}><option value="" disabled>Selecione a faixa de preço para preencher as taxas...</option><option value="20|4">Até R$ 79,99 (20% + R$ 4,00)</option><option value="14|16">R$ 80,00 até R$ 99,99 (14% + R$ 16,00)</option><option value="14|20">R$ 100,00 até R$ 199,99 (14% + R$ 20,00)</option><option value="14|26">R$ 200,00 até R$ 499,99 (14% + R$ 26,00)</option><option value="14|26">Acima de R$ 500,00 (14% + R$ 26,00)</option></select></div>
               )}
               <div className="override-grid">
                  <div className="input-group"><label>Embalagem Padrão</label><div className="input-wrapper"><span className="prefix">R$</span><input type="text" name="custoEmbalagem" className="has-prefix" value={String(globalFormData.custoEmbalagem ?? '').replace('.', ',')} onChange={handleGlobalChange} placeholder="0,00" /></div></div>
                  <div className="input-group"><label>Extras Padrão</label><div className="input-wrapper"><span className="prefix">R$</span><input type="text" name="custoExtra" className="has-prefix" value={String(globalFormData.custoExtra ?? '').replace('.', ',')} onChange={handleGlobalChange} placeholder="0,00" /></div></div>
                  <div className="input-group"><label>Envio/Frete Fixo</label><div className="input-wrapper"><span className="prefix">R$</span><input type="text" name="custoEnvio" className="has-prefix" value={String(globalFormData.custoEnvio ?? '').replace('.', ',')} onChange={handleGlobalChange} placeholder="0,00" /></div></div>
                  <div className="input-group"><label>Frete %</label><div className="input-wrapper"><span className="suffix">%</span><input type="text" name="custoEnvioPerc" className="has-suffix" value={String(globalFormData.custoEnvioPerc ?? '').replace('.', ',')} onChange={handleGlobalChange} placeholder="0,00" /></div></div>
                  <div className="input-group"><label>Taxa Fixa Venda</label><div className="input-wrapper"><span className="prefix">R$</span><input type="text" name="taxaFixaVenda" className="has-prefix" value={String(globalFormData.taxaFixaVenda ?? '').replace('.', ',')} onChange={handleGlobalChange} placeholder="0,00" /></div></div>
                  <div className="input-group"><label>Nota Fiscal</label><div className="input-wrapper"><span className="suffix">%</span><input type="text" name="impostosNF" className="has-suffix" value={String(globalFormData.impostosNF ?? '').replace('.', ',')} onChange={handleGlobalChange} placeholder="0,00" /></div></div>
                  <div className="input-group"><label>Taxa Master Plataforma</label><div className="input-wrapper"><span className="suffix">%</span><input type="text" name="taxaMLPerc" className="has-suffix" value={String(globalFormData.taxaMLPerc ?? '').replace('.', ',')} onChange={handleGlobalChange} placeholder="0,00" /></div></div>
                  <div className="input-group override-highlight" style={{gridColumn: 'span 2', textAlign: 'center'}}><p style={{color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '1rem'}}>* O modelo de Preço por Markup foi substituído pela entrada direta de Preço na Tabela Principal.</p></div>
               </div>
            </div>
            <div className="modal-footer"><button className="btn-secondary" onClick={() => setEditingGlobal(false)}>Cancelar</button><button className="btn-primary" onClick={saveGlobalModal}><Save size={18}/> Salvar Regra Mestre</button></div>
          </div>
        </div>
      )}
      {showReport && (<MonthlyReportOverlay month={currentMonth} vendasMensal={vendasMensal[currentMonth] || {}} savedFts={savedFts} overrides={overrides} channelDefaults={channelDefaults} onClose={() => setShowReport(false)} />)}

      <MlFtMappingModal
        isOpen={mlUnmappedModal.open}
        unmappedItems={mlUnmappedModal.items}
        savedFts={savedFts}
        title="🔗 Vincular Itens Vendidos no Mercado Livre à FT Correta"
        subtitle={`Encontramos ${mlUnmappedModal.items.length} item(ns) ou variação(ões) vendidos em ${currentMonth} que ainda não têm Ficha Técnica associada. Escolha a FT abaixo (o sistema memorizará para sempre e já copiará o SKU!):`}
        onClose={() => {
          const pending = mlUnmappedModal.pendingResult;
          setMlUnmappedModal({ open: false, items: [], pendingResult: null });
          if (pending) buildMlSalesPreview(pending);
        }}
        onSaved={async () => {
          setMlUnmappedModal({ open: false, items: [], pendingResult: null });
          await fetchData();
          await handlePullMlSales(true);
        }}
      />

      {mlSalesModal && (
        <div className="modal-overlay" style={{ zIndex: 9998 }}>
          <div className="modal-content" style={{ maxWidth: '760px', width: '95%' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, rgba(250,204,21,0.16), rgba(59,130,246,0.08))' }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  📦 Vendas Mercado Livre — {mlSalesModal.monthStr}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  Foram encontrados <strong>{mlSalesModal.totalOrdersCount}</strong> pedidos pagos no mês. Confira as quantidades por Ficha Técnica antes de aplicar:
                </p>
              </div>
              <button className="btn-icon" onClick={() => setMlSalesModal(null)}><X size={22} /></button>
            </div>

            <div className="modal-body" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
              {mlSalesModal.unmappedCount > 0 && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.83rem', color: '#D97706', fontWeight: 600 }}>
                    ⚠️ {mlSalesModal.unmappedCount} item(ns)/variação(ões) vendido(s) ainda estão sem vínculo com FT e não entraram na soma abaixo.
                  </span>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      const items = mlSalesModal.unmappedItems;
                      setMlSalesModal(null);
                      setMlUnmappedModal({ open: true, items, pendingResult: null });
                    }}
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', borderColor: '#D97706', color: '#D97706', fontWeight: 700 }}
                  >
                    🔗 Vincular Agora
                  </button>
                </div>
              )}

              {mlSalesModal.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)' }}>
                  Nenhuma venda vinculada a FTs encontrada para o mês <strong>{mlSalesModal.monthStr}</strong>.
                </div>
              ) : (
                <table className="fts-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>FT</th>
                      <th>Produto / Variações Vendidas</th>
                      <th style={{ textAlign: 'center' }}>Qtd Atual na Tabela</th>
                      <th style={{ textAlign: 'center' }}>Qtd Vendida no ML</th>
                      <th style={{ textAlign: 'center' }}>Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mlSalesModal.items.map(item => (
                      <tr key={item.ftId}>
                        <td><span className="badge">{item.ftId}</span></td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{item.nomePeca}</div>
                          {item.sku && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              🏷️ SKU: {item.sku}
                            </div>
                          )}
                          {item.breakdown && item.breakdown.length > 0 && (
                            <div style={{ fontSize: '0.74rem', color: 'var(--accent-primary)', marginTop: '3px' }}>
                              {item.breakdown.map(b => `${b.varNome}: ${b.qty} un`).join(' • ')}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>{item.oldQty} un</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--accent-primary)', fontSize: '0.95rem' }}>{item.newQty} un</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: item.delta > 0 ? 'var(--success)' : (item.delta < 0 ? 'var(--danger)' : 'var(--text-secondary)') }}>
                          {item.delta > 0 ? `+${item.delta} un` : `${item.delta} un`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {mlSalesModal.items.length > 0 && (
                <label style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={mlSalesModal.deductStock}
                    onChange={e => setMlSalesModal(prev => ({ ...prev, deductStock: e.target.checked }))}
                    style={{ width: '17px', height: '17px', accentColor: 'var(--accent-primary)' }}
                  />
                  <span>Abater automaticamente a diferença de unidades no Estoque Físico (Galpão / Casa)</span>
                </label>
              )}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn-secondary" onClick={() => setMlSalesModal(null)} disabled={applyingMlSales}>
                Cancelar
              </button>
              {mlSalesModal.items.length > 0 && (
                <button className="btn-primary" onClick={handleApplyMlSales} disabled={applyingMlSales} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle2 size={17} />
                  {applyingMlSales ? 'Aplicando vendas...' : `Aplicar ${mlSalesModal.items.length} FT(s) em Vendas (${mlSalesModal.monthStr})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {shopeeSalesModal && (
        <div className="modal-overlay" style={{ zIndex: 9998 }}>
          <div className="modal-content" style={{ maxWidth: '760px', width: '95%' }}>
            <div className="modal-header" style={{ background: 'linear-gradient(135deg, rgba(238,77,45,0.18), rgba(249,115,22,0.08))' }}>
              <div>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#9A3412' }}>
                  🛍️ Vendas Shopee — {shopeeSalesModal.monthStr}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  Foram encontrados <strong>{shopeeSalesModal.totalOrdersCount}</strong> pedidos pagos no mês. Confira as quantidades por Ficha Técnica antes de aplicar:
                </p>
              </div>
              <button className="btn-icon" onClick={() => setShopeeSalesModal(null)}><X size={22} /></button>
            </div>

            <div className="modal-body" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
              {shopeeSalesModal.unmappedCount > 0 && (
                <div style={{ marginBottom: '1rem', padding: '0.75rem 1rem', borderRadius: '8px', background: 'rgba(238,77,45,0.12)', border: '1px solid rgba(238,77,45,0.35)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.83rem', color: '#C2410C', fontWeight: 600 }}>
                    ⚠️ {shopeeSalesModal.unmappedCount} item(ns)/modelo(s) vendido(s) ainda estão sem vínculo com FT e não entraram na soma abaixo.
                  </span>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      const items = shopeeSalesModal.unmappedItems;
                      setShopeeSalesModal(null);
                      setShopeeUnmappedModal({ open: true, items, pendingResult: null });
                    }}
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem', borderColor: '#EA580C', color: '#EA580C', fontWeight: 700 }}
                  >
                    🔗 Vincular Agora
                  </button>
                </div>
              )}

              {shopeeSalesModal.items.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-secondary)' }}>
                  Nenhuma venda vinculada a FTs encontrada para o mês <strong>{shopeeSalesModal.monthStr}</strong> na Shopee.
                </div>
              ) : (
                <table className="fts-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>FT</th>
                      <th>Produto / Modelos Vendidos</th>
                      <th style={{ textAlign: 'center' }}>Qtd Atual na Tabela</th>
                      <th style={{ textAlign: 'center' }}>Qtd Vendida na Shopee</th>
                      <th style={{ textAlign: 'center' }}>Diferença</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopeeSalesModal.items.map(item => (
                      <tr key={item.ftId}>
                        <td><span className="badge">{item.ftId}</span></td>
                        <td>
                          <div style={{ fontWeight: 700 }}>{item.nomePeca}</div>
                          {item.sku && (
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              🏷️ SKU: {item.sku}
                            </div>
                          )}
                          {item.breakdown && item.breakdown.length > 0 && (
                            <div style={{ fontSize: '0.74rem', color: '#EA580C', marginTop: '3px' }}>
                              {item.breakdown.map(b => `${b.varNome}: ${b.qty} un`).join(' • ')}
                            </div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', color: 'var(--text-secondary)', fontWeight: 600 }}>{item.oldQty} un</td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#EA580C', fontSize: '0.95rem' }}>{item.newQty} un</td>
                        <td style={{ textAlign: 'center', fontWeight: 700, color: item.delta > 0 ? 'var(--success)' : (item.delta < 0 ? 'var(--danger)' : 'var(--text-secondary)') }}>
                          {item.delta > 0 ? `+${item.delta} un` : `${item.delta} un`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {shopeeSalesModal.items.length > 0 && (
                <label style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.84rem', fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={shopeeSalesModal.deductStock}
                    onChange={e => setShopeeSalesModal(prev => ({ ...prev, deductStock: e.target.checked }))}
                    style={{ width: '17px', height: '17px', accentColor: '#EE4D2D' }}
                  />
                  <span>Abater automaticamente a diferença de unidades no Estoque Físico (Galpão / Casa)</span>
                </label>
              )}
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button className="btn-secondary" onClick={() => setShopeeSalesModal(null)} disabled={applyingShopeeSales}>
                Cancelar
              </button>
              {shopeeSalesModal.items.length > 0 && (
                <button
                  className="btn-primary"
                  onClick={handleApplyShopeeSales}
                  disabled={applyingShopeeSales}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#EE4D2D',
                    borderColor: '#EA580C',
                    color: '#FFFFFF'
                  }}
                >
                  <CheckCircle2 size={17} />
                  {applyingShopeeSales ? 'Aplicando vendas...' : `Aplicar ${shopeeSalesModal.items.length} FT(s) em Vendas Shopee (${shopeeSalesModal.monthStr})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showAutoPrecos && (
        <AutoPrecosOverlay
          savedFts={savedFts}
          overrides={overrides}
          channelDefaults={channelDefaults}
          autoCanais={autoCanais}
          setAutoCanais={setAutoCanais}
          autoFiltro={autoFiltro}
          setAutoFiltro={setAutoFiltro}
          apenasComPreco={apenasComPreco}
          setApenasComPreco={setApenasComPreco}
          onPriceChange={handleAutoPriceChange}
          onClose={() => setShowAutoPrecos(false)}
          getFtWithOverridesForChannel={getFtWithOverridesForChannel}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        details={confirmModal.details}
        onConfirm={async () => { closeConfirm(); await confirmModal.onConfirm?.(); }}
        onCancel={closeConfirm}
      />

      <SiteCategoriasModal
        isOpen={showCategoriasModal}
        onClose={() => setShowCategoriasModal(false)}
        categorias={lojaCategorias}
        newCategoriaName={newCategoriaName}
        setNewCategoriaName={setNewCategoriaName}
        onAddCategoria={handleAddCategoria}
        onSeedCategorias={handleSeedCategorias}
        onToggleAtivo={handleToggleCatAtivo}
        onDeleteCategoria={handleDeleteCategoria}
      />

      <SiteMlBatchImportModal
        isOpen={showSiteMlBatchModal}
        onClose={() => setShowSiteMlBatchModal(false)}
        mlListings={mlListings}
        savedFts={savedFts}
        siteOverrides={overrides.site || {}}
        onSyncMlList={handleSyncMlListForSite}
        syncingMlList={syncingMlList}
        onRunBatchImport={handleRunSiteMlBatchImport}
        batchStatus={batchSiteImportStatus}
      />
    </div>
  );
}

function AutoPrecosOverlay({ savedFts, overrides, channelDefaults, autoCanais, setAutoCanais, autoFiltro, setAutoFiltro, apenasComPreco, setApenasComPreco, onPriceChange, onClose, getFtWithOverridesForChannel }) {
  const [sortCfg, setSortCfg] = useState({ key: null, channelId: null, dir: 'desc' });

  const handleSort = (key, channelId = null) => {
    setSortCfg(prev => {
      if (prev.key === key && prev.channelId === channelId) {
        if (prev.dir === 'desc') return { key, channelId, dir: 'asc' };
        return { key: null, channelId: null, dir: 'desc' };
      }
      return { key, channelId, dir: 'desc' };
    });
  };

  const renderSortArrow = (key, channelId = null) => {
    if (sortCfg.key !== key || sortCfg.channelId !== channelId) return '';
    return sortCfg.dir === 'desc' ? ' ▼' : ' ▲';
  };

  const toggleCanal = (id) => {
    setAutoCanais(prev => prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]);
  };

  const activeChannelList = CHANNELS.filter(c => autoCanais.includes(c.id));

  const filteredFts = savedFts.filter(ft => {
    // Filtro: apenas com preço cadastrado em pelo menos um dos canais selecionados
    if (apenasComPreco) {
      const temPreco = autoCanais.some(chId => {
        const merged = getFtWithOverridesForChannel(ft, chId);
        return parseNumber(merged.precoVendaManual) > 0;
      });
      if (!temPreco) return false;
    }

    if (!autoFiltro) return true;
    const q = autoFiltro.toLowerCase();
    const ftRes0 = getFtWithOverridesForChannel(ft, autoCanais[0] || 'ml');
    const res0 = getResultados(ftRes0);
    const preco = parseNumber(ftRes0.precoVendaManual);
    const margem = res0.margemContribuicaoPerc;
    return (
      ft.nomePeca.toLowerCase().includes(q) ||
      ft.indiceFt.toLowerCase().includes(q) ||
      (preco > 0 && String(preco.toFixed(2)).includes(q)) ||
      (String(margem.toFixed(1)).includes(q))
    );
  }).sort((a, b) => {
    const cadA = autoCanais.some(chId => overrides[chId]?.[a.indiceFt]?.cadastrado) ? 1 : 0;
    const cadB = autoCanais.some(chId => overrides[chId]?.[b.indiceFt]?.cadastrado) ? 1 : 0;
    if (cadA !== cadB) return cadB - cadA;

    if (sortCfg.key) {
      const mult = sortCfg.dir === 'desc' ? -1 : 1;
      if (sortCfg.key === 'id') return mult * (a.indiceFt || '').localeCompare(b.indiceFt || '', undefined, { numeric: true });
      if (sortCfg.key === 'nome') return mult * (a.nomePeca || '').localeCompare(b.nomePeca || '');
      if (sortCfg.key === 'tempo') return mult * (getUnitProductionTime(a) - getUnitProductionTime(b));

      const chId = sortCfg.channelId || autoCanais[0] || 'ml';
      const mA = getFtWithOverridesForChannel(a, chId);
      const mB = getFtWithOverridesForChannel(b, chId);
      const rA = getResultados(mA);
      const rB = getResultados(mB);
      const pA = parseNumber(mA.precoVendaManual);
      const pB = parseNumber(mB.precoVendaManual);
      const tA = getUnitProductionTime(a);
      const tB = getUnitProductionTime(b);
      const u24A = tA > 0 ? Math.floor(24 / tA) : 0;
      const u24B = tB > 0 ? Math.floor(24 / tB) : 0;

      if (sortCfg.key === 'preco') return mult * (pA - pB);
      if (sortCfg.key === 'margem') return mult * ((pA > 0 ? rA.margemContribuicaoPerc : -999999) - (pB > 0 ? rB.margemContribuicaoPerc : -999999));
      if (sortCfg.key === 'lucro') return mult * ((pA > 0 ? rA.lucroLiquido : -999999) - (pB > 0 ? rB.lucroLiquido : -999999));
      if (sortCfg.key === 'lucro24h') return mult * ((pA > 0 ? rA.lucroLiquido * u24A : -999999) - (pB > 0 ? rB.lucroLiquido * u24B : -999999));
      if (sortCfg.key === 'lucroMes') return mult * ((pA > 0 ? rA.lucroLiquido * u24A * 30 : -999999) - (pB > 0 ? rB.lucroLiquido * u24B * 30 : -999999));
    }

    return (a.indiceFt || '').localeCompare(b.indiceFt || '', undefined, { numeric: true });
  });

  const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #7C3AED, #4F46E5)', padding: '1rem 1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h2 style={{ margin: 0, color: 'white', fontSize: '1.2rem' }}>⚡ Automação de Preços</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.75)', fontSize: '0.82rem' }}>Edite preços inline e veja margens em todos os canais simultaneamente</p>
        </div>
        <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white', borderRadius: '8px', padding: '0.5rem 0.9rem', cursor: 'pointer', fontWeight: 700, fontSize: '1.1rem' }}>✕</button>
      </div>

      {/* Controls */}
      <div style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-color)', padding: '0.75rem 1.5rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600, marginRight: '4px' }}>Canais:</span>
          {CHANNELS.map(ch => (
            <label key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', background: autoCanais.includes(ch.id) ? 'var(--accent-primary)' : 'var(--bg-secondary)', color: autoCanais.includes(ch.id) ? 'white' : 'var(--text-primary)', padding: '4px 10px', borderRadius: '20px', fontSize: '0.82rem', fontWeight: 600, border: '1px solid var(--border-color)', transition: 'all 0.15s' }}>
              <input type="checkbox" checked={autoCanais.includes(ch.id)} onChange={() => toggleCanal(ch.id)} style={{ display: 'none' }} />
              {ch.icon} {ch.label}
            </label>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setApenasComPreco(p => !p)}
            style={{
              background: apenasComPreco ? 'var(--success)' : 'var(--bg-secondary)',
              color: apenasComPreco ? 'white' : 'var(--text-secondary)',
              border: `1px solid ${apenasComPreco ? 'var(--success)' : 'var(--border-color)'}`,
              borderRadius: '8px',
              padding: '0.4rem 0.85rem',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              transition: 'all 0.15s'
            }}
          >
            {apenasComPreco ? '✅' : '☐'} Com preço cadastrado
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.4rem 0.75rem' }}>
            <span>🔍</span>
            <input
              type="text"
              placeholder="Buscar por nome, FT, preço ou margem..."
              value={autoFiltro}
              onChange={e => setAutoFiltro(e.target.value)}
              style={{ border: 'none', background: 'transparent', color: 'var(--text-primary)', outline: 'none', width: '260px', fontSize: '0.88rem' }}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1rem 1.5rem' }}>
        {activeChannelList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-secondary)' }}>Selecione ao menos um canal acima.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 10 }}>
                <th style={{ padding: '0.6rem 0.5rem', textAlign: 'center', borderBottom: '2px solid var(--border-color)', width: '40px', color: 'var(--text-secondary)', fontWeight: 700 }} title="Produto Cadastrado / No Ar nos Canais Selecionados">✅</th>
                <th onClick={() => handleSort('id')} style={{ padding: '0.6rem 0.8rem', textAlign: 'left', borderBottom: '2px solid var(--border-color)', whiteSpace: 'nowrap', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }} title="Clique para ordenar por ID">ID{renderSortArrow('id')}</th>
                <th onClick={() => handleSort('nome')} style={{ padding: '0.6rem 0.8rem', textAlign: 'left', borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', userSelect: 'none' }} title="Clique para ordenar por Produto">Produto{renderSortArrow('nome')}</th>
                <th onClick={() => handleSort('tempo')} style={{ padding: '0.6rem 0.8rem', textAlign: 'center', borderBottom: '2px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 700, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Clique para ordenar por Tempo">⏱ Tempo{renderSortArrow('tempo')}</th>
                {activeChannelList.map(ch => (
                  <th key={ch.id} colSpan={5} style={{ padding: '0.6rem 0.8rem', textAlign: 'center', borderBottom: '2px solid var(--border-color)', borderLeft: '2px solid var(--border-color)', color: 'var(--accent-primary)', fontWeight: 700, background: 'var(--bg-surface)' }}>
                    {ch.icon} {ch.label}
                  </th>
                ))}
              </tr>
              <tr style={{ background: 'var(--bg-secondary)', position: 'sticky', top: '37px', zIndex: 9 }}>
                <th colSpan={4} style={{ borderBottom: '1px solid var(--border-color)' }}></th>
                {activeChannelList.map(ch => (
                  <>
                    <th key={ch.id + '_preco'} onClick={() => handleSort('preco', ch.id)} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', borderLeft: '2px solid var(--border-color)', color: 'var(--accent-primary)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Clique para ordenar por Preço de Venda">Preço Venda{renderSortArrow('preco', ch.id)}</th>
                    <th key={ch.id + '_marg'} onClick={() => handleSort('margem', ch.id)} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: 'var(--success)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Clique para ordenar por Margem %">Margem %{renderSortArrow('margem', ch.id)}</th>
                    <th key={ch.id + '_lucro'} onClick={() => handleSort('lucro', ch.id)} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: 'var(--success)', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Clique para ordenar por Lucro R$">Lucro R${renderSortArrow('lucro', ch.id)}</th>
                    <th key={ch.id + '_24h'} onClick={() => handleSort('lucro24h', ch.id)} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: '#F59E0B', fontWeight: 600, fontSize: '0.75rem', background: 'rgba(245,158,11,0.06)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Clique para ordenar por Lucro 24h">🕒 Lucro 24h{renderSortArrow('lucro24h', ch.id)}</th>
                    <th key={ch.id + '_mes'} onClick={() => handleSort('lucroMes', ch.id)} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: '#8B5CF6', fontWeight: 600, fontSize: '0.75rem', background: 'rgba(139,92,246,0.06)', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} title="Clique para ordenar por Lucro Mensal">📅 Lucro Mensal{renderSortArrow('lucroMes', ch.id)}</th>
                  </>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredFts.map((ft, idx) => {
                const unitTimeHours = getUnitProductionTime(ft);
                const unidades24h = unitTimeHours > 0 ? Math.floor(24 / unitTimeHours) : 0;
                const unidadesMes = unidades24h * 30;
                const isAtivoAlgumCanal = autoCanais.some(chId => overrides[chId]?.[ft.indiceFt]?.cadastrado);

                return (
                  <tr key={ft.indiceFt} style={{ borderBottom: '1px solid var(--border-color)', background: isAtivoAlgumCanal ? 'rgba(16, 185, 129, 0.04)' : (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)') }}>
                    <td style={{ padding: '0.55rem 0.5rem', textAlign: 'center' }}>
                      {isAtivoAlgumCanal ? <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#059669', border: '1px solid #059669', padding: '2px 5px', borderRadius: '4px', fontSize: '0.72rem' }} title="Produto cadastrado / no ar">✅</span> : <span style={{ color: 'var(--border-color)', fontSize: '0.75rem' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem', whiteSpace: 'nowrap' }}>
                      <span style={{ background: 'var(--bg-secondary)', color: 'var(--accent-primary)', padding: '2px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '0.78rem' }}>{ft.indiceFt}</span>
                    </td>
                    <td style={{ padding: '0.55rem 0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{ft.nomePeca}</td>
                    <td style={{ padding: '0.55rem 0.8rem', textAlign: 'center', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{formatTime(unitTimeHours)}</td>

                    {activeChannelList.map(ch => {
                      const merged = getFtWithOverridesForChannel(ft, ch.id);
                      const res = getResultados(merged);
                      const preco = parseNumber(merged.precoVendaManual);
                      const marg = res.margemContribuicaoPerc;
                      const lucro = res.lucroLiquido;
                      const lucro24h = lucro * unidades24h;
                      const lucroMes = lucro * unidadesMes;
                      const margColor = marg > 20 ? 'var(--success)' : marg > 0 ? '#F59E0B' : 'var(--danger)';

                      return (
                        <>
                          <td key={ch.id + '_p'} style={{ padding: '0.4rem 0.6rem', borderLeft: '2px solid var(--border-color)', textAlign: 'center', minWidth: '110px' }}>
                            <AutoPriceInput
                              initialValue={merged.precoVendaManual}
                              onSave={(val) => onPriceChange(ft.indiceFt, ch.id, val)}
                            />
                          </td>
                          <td key={ch.id + '_m'} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', fontWeight: 700, color: margColor, whiteSpace: 'nowrap' }}>
                            {preco > 0 ? `${marg.toFixed(1)}%` : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                          </td>
                          <td key={ch.id + '_l'} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', fontWeight: 700, color: lucro >= 0 ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
                            {preco > 0 ? `R$ ${fmt(lucro)}` : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                          </td>
                          <td key={ch.id + '_24'} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', background: 'rgba(245,158,11,0.06)', whiteSpace: 'nowrap' }}>
                            {preco > 0 && unidades24h > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                                <span style={{ fontWeight: 700, color: lucro24h >= 0 ? '#F59E0B' : 'var(--danger)', fontSize: '0.88rem' }}>R$ {fmt(lucro24h)}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{unidades24h} un/dia</span>
                              </div>
                            ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                          </td>
                          <td key={ch.id + '_mes'} style={{ padding: '0.4rem 0.6rem', textAlign: 'center', background: 'rgba(139,92,246,0.06)', whiteSpace: 'nowrap' }}>
                            {preco > 0 && unidadesMes > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                                <span style={{ fontWeight: 700, color: lucroMes >= 0 ? '#8B5CF6' : 'var(--danger)', fontSize: '0.88rem' }}>R$ {fmt(lucroMes)}</span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{unidadesMes} un/mês</span>
                              </div>
                            ) : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                          </td>
                        </>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function AutoPriceInput({ initialValue, onSave }) {
  const [val, setVal] = useState(initialValue !== undefined && initialValue !== null ? String(initialValue).replace('.', ',') : '');

  useEffect(() => {
    setVal(initialValue !== undefined && initialValue !== null ? String(initialValue).replace('.', ',') : '');
  }, [initialValue]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', justifyContent: 'center' }}>
      <span style={{ color: 'var(--accent-primary)', fontWeight: 700, fontSize: '0.8rem' }}>R$</span>
      <input
        type="text"
        value={val}
        placeholder="0,00"
        onChange={e => setVal(e.target.value)}
        onBlur={() => { const old = initialValue !== undefined && initialValue !== null ? String(initialValue).replace('.', ',') : ''; if (val !== old) onSave(val); }}
        onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); }}
        style={{
          width: '70px',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          padding: '3px 6px',
          background: 'var(--bg-secondary)',
          color: 'var(--accent-primary)',
          fontWeight: 700,
          fontSize: '0.85rem',
          textAlign: 'right',
          outline: 'none'
        }}
      />
    </div>
  );
}

function MonthlyReportOverlay({ month, vendasMensal, savedFts, overrides, channelDefaults, onClose }) {
  const [year, monthNum] = month.split('-');
  const monthName = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][parseInt(monthNum)-1];
  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  const getFtWithOverridesForReport = (ftBase, channelId) => {
    const physicalFT = { indiceFt: ftBase.indiceFt, nomePeca: ftBase.nomePeca, quantidade: ftBase.quantidade, pesoGramas: ftBase.pesoGramas, tempoImpressao: ftBase.tempoImpressao, precoKgMaterial: ftBase.precoKgMaterial, custoKwh: ftBase.custoKwh, custoDepreciacao: ftBase.custoDepreciacao, extraValor1: ftBase.extraValor1, extraValor2: ftBase.extraValor2, extraValor3: ftBase.extraValor3 };
    const defaults = channelDefaults[channelId] || { custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0, custoEnvioPerc: 0, taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0 };
    const channelOps = overrides[channelId]?.[ftBase.indiceFt] || {};
    return { ...physicalFT, ...defaults, ...channelOps }; 
  };
  const reportData = [];
  let grandTotalRevenue = 0;
  let grandTotalProfit = 0;
  let grandTotalItems = 0;
  Object.entries(vendasMensal).forEach(([channelId, ftsQty]) => {
    const channelLabel = CHANNELS.find(c => c.id === channelId)?.label || channelId;
    const channelItems = [];
    let channelRevenue = 0;
    let channelProfit = 0;
    Object.entries(ftsQty).forEach(([ftId, qty]) => {
      if (qty <= 0) return;
      const baseFt = savedFts.find(f => f.indiceFt === ftId);
      if (!baseFt) return;
      const merged = getFtWithOverridesForReport(baseFt, channelId);
      const realPrice = merged?.precoRealVendaMes?.[month] || merged?.precoRealVenda;
      const effectiveMerged = parseNumber(realPrice) > 0 ? { ...merged, precoVendaManual: String(realPrice) } : merged;
      const res = getResultados(effectiveMerged);
      const itemRevenue = res.precoPraticado * qty;
      const itemProfit = res.lucroLiquido * qty;
      channelItems.push({ id: ftId, nome: baseFt.nomePeca, qty, precoUnit: res.precoPraticado, lucroUnit: res.lucroLiquido, subtotal: itemRevenue, lucroTotal: itemProfit });
      channelRevenue += itemRevenue;
      channelProfit += itemProfit;
      grandTotalItems += qty;
    });
    if (channelItems.length > 0) {
      reportData.push({ channelId, channelLabel, items: channelItems, revenue: channelRevenue, profit: channelProfit });
      grandTotalRevenue += channelRevenue;
      grandTotalProfit += channelProfit;
    }
  });
  return (
    <div className="report-overlay">
      <div className="report-container">
        <header className="report-header no-print"><div style={{display: 'flex', alignItems: 'center', gap: '15px'}}><CheckCircle2 size={32} color="var(--success)" /><div><h2 style={{margin: 0}}>Fechamento de Mês</h2><p style={{margin: 0, opacity: 0.8}}>{monthName} de {year}</p></div></div><div style={{display: 'flex', gap: '10px'}}><button className="btn-secondary" onClick={() => window.print()} style={{display: 'flex', alignItems: 'center', gap: '8px'}}><Printer size={18} /> Imprimir / PDF</button><button className="btn-icon" onClick={onClose} style={{background: 'rgba(255,255,255,0.1)', color: 'white', borderRadius: '50%'}}><X size={24}/></button></div></header>
        <main className="report-main"><div className="print-only-header"><h1 style={{textAlign: 'center', marginBottom: '0.5rem'}}>Relatório de Fechamento Mensal</h1><p style={{textAlign: 'center', marginBottom: '2rem'}}>Período: {monthName} / {year} | AM3D Soluções</p></div><div className="report-summary-cards"><div className="card r-stat"><span>Faturamento Total</span><h2>{formatCurrency(grandTotalRevenue)}</h2></div><div className="card r-stat highlight"><span>Lucro Líquido Estimado</span><h2 style={{color: 'var(--success)'}}>{formatCurrency(grandTotalProfit)}</h2></div><div className="card r-stat"><span>Total de Itens Vendidos</span><h2>{grandTotalItems} <small>un</small></h2></div></div><div className="report-details-sections">{reportData.length === 0 ? (<div style={{textAlign: 'center', padding: '4rem'}}>Nenhuma venda registrada neste mês.</div>) : (reportData.map(group => (<div key={group.channelId} className="report-channel-block"><div className="r-channel-header"><h3>{group.channelLabel}</h3><div className="r-channel-totals"><span>Faturamento: <strong>{formatCurrency(group.revenue)}</strong></span><span style={{marginLeft: '20px'}}>Lucro: <strong style={{color: 'var(--success)'}}>{formatCurrency(group.profit)}</strong></span></div></div><table className="report-table"><thead><tr><th>Cód</th><th>Produto / Peça</th><th style={{textAlign: 'center'}}>Qtd</th><th style={{textAlign: 'right'}}>Preço Unit.</th><th style={{textAlign: 'right'}}>Preço Total</th><th style={{textAlign: 'right'}}>Lucro Total</th></tr></thead><tbody>{group.items.map(item => (<tr key={item.id}><td style={{width: '60px'}}><span className="badge">{item.id}</span></td><td style={{fontWeight: '500'}}>{item.nome}</td><td style={{textAlign: 'center'}}>{item.qty}</td><td style={{textAlign: 'right'}}>{formatCurrency(item.precoUnit)}</td><td style={{textAlign: 'right', fontWeight: 'bold'}}>{formatCurrency(item.subtotal)}</td><td style={{textAlign: 'right', color: 'var(--success)'}}>{formatCurrency(item.lucroTotal)}</td></tr>))}</tbody></table></div>)))}</div></main>
        <footer className="report-footer no-print"><p>Relatório gerado em {new Date().toLocaleString('pt-BR')}</p></footer>
      </div>
    </div>
  );
}
