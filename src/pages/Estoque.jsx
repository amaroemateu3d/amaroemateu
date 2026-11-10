import { useState, useEffect, useMemo } from 'react';
import {
  Package, Search, Save, Loader, AlertCircle, Warehouse, Home as HomeIcon,
  Trash2, Plus, X, RefreshCw, Link2, ExternalLink, PauseCircle, PlayCircle,
  Settings, ChevronDown, ChevronRight, CheckCircle2, Unplug
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import {
  getMlAuthUrl,
  getMlAppCredentials,
  saveMlAppCredentialsLocal,
  fetchStoredMlToken,
  exchangeMlCodeForToken,
  disconnectMlAccount,
  fetchStoredMlListings,
  syncListingsFromML,
  updateMlListingStock,
  updateMlListingStatus,
  collectUnmappedTargetsFromListings,
  buildFtCatalogOptions,
  parseFtTargetKey,
  saveFtMappingsAndPropagateSku,
  upsertMlListingsToDb
} from '../services/mercadolivre';
import MlFtMappingModal from '../components/vendas/MlFtMappingModal';
import './Estoque.css';

const CHANNELS = [
  { id: 'ml', label: 'Mercado Livre', short: 'ML', icon: '📦', color: '#EAB308' },
  { id: 'amazon', label: 'Amazon', short: 'AMZ', icon: '🅰️', color: '#EA580C' },
  { id: 'shopee', label: 'Shopee', short: 'SHP', icon: '🛍️', color: '#EF4444' },
  { id: 'tiktok', label: 'TikTok', short: 'TTK', icon: '🎵', color: '#0F172A' },
  { id: 'site', label: 'Site Próprio', short: 'SITE', icon: '🌐', color: '#3B82F6' }
];

export default function Estoque() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id || 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9';

  const [activeViewTab, setActiveViewTab] = useState('fisico'); // 'fisico' | 'ml'
  const [fts, setFts] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAnunciados, setFilterAnunciados] = useState(false);
  const [adjustments, setAdjustments] = useState({});
  const [saving, setSaving] = useState(false);
  const [zeroModalOpen, setZeroModalOpen] = useState(false);

  // Estados da Integração Mercado Livre
  const [mlToken, setMlToken] = useState(null);
  const [mlListings, setMlListings] = useState([]);
  const [mlSyncing, setMlSyncing] = useState(false);
  const [mlSearch, setMlSearch] = useState('');
  const [mlStatusFilter, setMlStatusFilter] = useState('all'); // 'all' | 'active' | 'paused' | 'full' | 'unmapped'
  const [expandedMlItems, setExpandedMlItems] = useState({});
  const [mlStockEdits, setMlStockEdits] = useState({});
  const [mlUpdatingKey, setMlUpdatingKey] = useState(null);

  // Modais de OAuth Manual, Credenciais do App ML e Mapeamento de 1ª vez
  const [pasteUrlModalOpen, setPasteUrlModalOpen] = useState(false);
  const [pastedCodeInput, setPastedCodeInput] = useState('');
  const [appConfigModalOpen, setAppConfigModalOpen] = useState(false);
  const [appCredsForm, setAppCredsForm] = useState(() => getMlAppCredentials());
  const [mappingModal, setMappingModal] = useState({ isOpen: false, items: [] });

  // Modal de Variações
  const [varModal, setVarModal] = useState({
    isOpen: false,
    ftId: null,
    ftNome: '',
    isFirstVariation: false,
    firstName: '',
    firstSku: '',
    newName: '',
    newSku: '',
  });

  // Ordenação clicando nos títulos (ID, Produto, Estoque Galpão, Estoque Casa, Estoque Total)
  const [sortField, setSortField] = useState('id');
  const [sortAsc, setSortAsc] = useState(true);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(field === 'id' || field === 'nome');
    }
  };

  const renderSortIcon = (field) => {
    if (sortField !== field) return <span className="sort-indicator inactive">↕</span>;
    return <span className="sort-indicator active">{sortAsc ? '▲' : '▼'}</span>;
  };

  // Modal de confirmação com escolha de local (Galpão ou Casa)
  const [locationModal, setLocationModal] = useState({
    isOpen: false,
    mode: 'single',
    targetKey: null,
  });

  // Modal de clique direto no badge de Galpão ou Casa
  const [directStockModal, setDirectStockModal] = useState({
    isOpen: false,
    step: 'input',
    rowKey: null,
    location: 'galpao',
    inputValue: '',
  });

  useEffect(() => {
    fetchEstoque();
    loadMlInitialState();

    const channel = supabase
      .channel('realtime-estoque')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fichas_tecnicas' },
        () => {
          fetchEstoque();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Captura automática de ?code= na URL quando retorna da autorização OAuth do Mercado Livre
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const oauthCode = params.get('code');
    if (oauthCode) {
      // Limpa o ?code= da barra de endereço imediatamente para não reutilizar
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      setActiveViewTab('ml');
      handleCompleteMlOAuth(oauthCode);
    }
  }, []);

  const loadMlInitialState = async () => {
    try {
      const [storedTok, storedList] = await Promise.all([
        fetchStoredMlToken(empresaId),
        fetchStoredMlListings(empresaId)
      ]);
      setMlToken(storedTok);
      setMlListings(storedList || []);
      // Expande automaticamente itens com variações
      const exp = {};
      (storedList || []).forEach((item) => {
        if (Array.isArray(item.variations) && item.variations.length > 0) {
          exp[item.ml_item_id] = true;
        }
      });
      setExpandedMlItems(exp);
    } catch (e) {
      console.warn('Erro ao inicializar dados ML no estoque:', e);
    }
  };

  const fetchEstoque = async () => {
    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      const [resp, overResp] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=id,data,estoque&order=id.asc`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_overrides?select=*`, { headers })
      ]);

      if (overResp.ok) {
        const overData = await overResp.json();
        const newOverrides = {};
        overData.forEach(o => {
          if (!newOverrides[o.channel_id]) newOverrides[o.channel_id] = {};
          newOverrides[o.channel_id][o.ft_id] = o.settings;
        });
        setOverrides(newOverrides);
      }

      if (resp.ok) {
        const data = await resp.json();
        const cleanFts = data.map(r => {
          const rawData = r.data || {};
          const variacoes = Array.isArray(rawData.variacoesEstoque) && rawData.variacoesEstoque.length > 0
            ? rawData.variacoesEstoque
            : null;

          let estoqueGalpao = 0;
          let estoqueCasa = 0;

          if (variacoes) {
            estoqueGalpao = variacoes.reduce((acc, v) => acc + Number(v.estoqueGalpao || 0), 0);
            estoqueCasa = variacoes.reduce((acc, v) => acc + Number(v.estoqueCasa || 0), 0);
          } else {
            const hasDualStock = rawData.estoqueGalpao !== undefined || rawData.estoqueCasa !== undefined;
            estoqueGalpao = hasDualStock ? Number(rawData.estoqueGalpao || 0) : Number(r.estoque || 0);
            estoqueCasa = hasDualStock ? Number(rawData.estoqueCasa || 0) : 0;
          }

          return {
            id: r.id,
            nome: rawData.nomePeca || 'Produto sem nome',
            sku: rawData.sku || '',
            estoqueGalpao,
            estoqueCasa,
            estoque: estoqueGalpao + estoqueCasa,
            variacoes,
            rawData
          };
        });
        cleanFts.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
        setFts(cleanFts);
      }
    } catch (e) {
      console.error('Erro ao buscar estoque:', e);
    } finally {
      setLoading(false);
    }
  };

  // Canais ativos para uma FT
  const getActiveChannelsForFt = (ftId) => {
    return CHANNELS.filter(ch => overrides[ch.id]?.[ftId]?.cadastrado);
  };

  // Mapa rápido de vínculos ML por rowKey (ex: 'FT-16' ou 'FT-01__var__v_1')
  const mlLinksByRowKey = useMemo(() => {
    const map = {};
    mlListings.forEach((listing) => {
      const hasVars = Array.isArray(listing.variations) && listing.variations.length > 0;
      if (hasVars) {
        listing.variations.forEach((v) => {
          if (v.ft_id && v.ft_id !== '__IGNORED__') {
            if (!map[v.ft_id]) map[v.ft_id] = [];
            map[v.ft_id].push({
              listing,
              variationId: String(v.id),
              variationName: v.name,
              ml_item_id: listing.ml_item_id,
              stock_ml: Number(v.stock_ml ?? 0),
              logistic_type: listing.logistic_type,
              status: listing.status,
              sku: v.sku || listing.sku || ''
            });
          }
        });
      } else if (listing.ft_id && listing.ft_id !== '__IGNORED__') {
        if (!map[listing.ft_id]) map[listing.ft_id] = [];
        map[listing.ft_id].push({
          listing,
          variationId: null,
          variationName: null,
          ml_item_id: listing.ml_item_id,
          stock_ml: Number(listing.stock_ml ?? 0),
          logistic_type: listing.logistic_type,
          status: listing.status,
          sku: listing.sku || ''
        });
      }
    });
    return map;
  }, [mlListings]);

  // Expande cada FT em linhas (se tiver variações, gera 1 linha por variação)
  const allRows = fts.flatMap(ft => {
    const activeChannels = getActiveChannelsForFt(ft.id);
    const isAnunciado = activeChannels.length > 0;
    const channelSku = overrides?.ml?.[ft.id]?.sku || '';

    if (ft.variacoes && ft.variacoes.length > 0) {
      return ft.variacoes.map((v, idx) => {
        const g = Number(v.estoqueGalpao || 0);
        const c = Number(v.estoqueCasa || 0);
        const rKey = `${ft.id}__var__${v.id}`;
        return {
          rowKey: rKey,
          ftId: ft.id,
          varId: v.id,
          varIndex: idx,
          varNome: v.nome,
          sku: v.sku || ft.sku || channelSku || '',
          displayId: `${ft.id} - ${v.nome}`,
          nome: ft.nome,
          estoqueGalpao: g,
          estoqueCasa: c,
          estoque: g + c,
          hasVariacoes: true,
          totalVariacoes: ft.variacoes.length,
          activeChannels,
          isAnunciado,
          mlLinkedItems: mlLinksByRowKey[rKey] || mlLinksByRowKey[ft.id] || [],
          parentFt: ft
        };
      });
    }

    return [{
      rowKey: ft.id,
      ftId: ft.id,
      varId: null,
      varIndex: 0,
      varNome: null,
      sku: ft.sku || channelSku || '',
      displayId: ft.id,
      nome: ft.nome,
      estoqueGalpao: ft.estoqueGalpao,
      estoqueCasa: ft.estoqueCasa,
      estoque: ft.estoque,
      hasVariacoes: false,
      totalVariacoes: 0,
      activeChannels,
      isAnunciado,
      mlLinkedItems: mlLinksByRowKey[ft.id] || [],
      parentFt: ft
    }];
  });

  // ============================================================================
  // FUNÇÕES DA INTEGRAÇÃO COM A API DO MERCADO LIVRE
  // ============================================================================

  const handleStartMlConnect = () => {
    try {
      const creds = getMlAppCredentials();
      if (!creds.clientId || !creds.clientSecret) {
        setAppCredsForm(creds);
        setAppConfigModalOpen(true);
        return;
      }
      const authUrl = getMlAuthUrl();
      window.location.href = authUrl;
    } catch (e) {
      alert(e.message);
    }
  };

  const handleCompleteMlOAuth = async (rawCodeOrUrl) => {
    setMlSyncing(true);
    try {
      const savedTok = await exchangeMlCodeForToken(rawCodeOrUrl, empresaId);
      setMlToken(savedTok);
      setPasteUrlModalOpen(false);
      setPastedCodeInput('');
      // Já sincroniza os anúncios automaticamente após conectar!
      await handleSyncMlListings();
    } catch (e) {
      console.error('Erro na autenticação OAuth do Mercado Livre:', e);
      alert('Falha ao autenticar no Mercado Livre: ' + (e.message || String(e)));
    } finally {
      setMlSyncing(false);
    }
  };

  const handleDisconnectMl = async () => {
    if (!window.confirm('Deseja desconectar a conta do Mercado Livre deste sistema?')) return;
    await disconnectMlAccount(empresaId);
    setMlToken(null);
  };

  const handleSyncMlListings = async () => {
    setMlSyncing(true);
    try {
      const { listings, unmappedItems } = await syncListingsFromML(empresaId);
      setMlListings(listings || []);
      const exp = { ...expandedMlItems };
      (listings || []).forEach((item) => {
        if (Array.isArray(item.variations) && item.variations.length > 0 && exp[item.ml_item_id] === undefined) {
          exp[item.ml_item_id] = true;
        }
      });
      setExpandedMlItems(exp);

      // Se encontrou itens/variações sem vínculo (1ª vez), abre automaticamente o modal de seleção de FT!
      if (Array.isArray(unmappedItems) && unmappedItems.length > 0) {
        setMappingModal({
          isOpen: true,
          items: unmappedItems
        });
      }
    } catch (e) {
      console.error('Erro ao sincronizar anúncios do Mercado Livre:', e);
      alert('Erro ao sincronizar com o Mercado Livre: ' + (e.message || String(e)));
    } finally {
      setMlSyncing(false);
    }
  };

  const handleOpenAllMappingsModal = () => {
    const allTargets = [];
    mlListings.forEach((listing) => {
      const hasVars = Array.isArray(listing.variations) && listing.variations.length > 0;
      if (hasVars) {
        listing.variations.forEach((v) => {
          allTargets.push({
            key: `${listing.ml_item_id}__mlvar__${v.id}`,
            ml_item_id: listing.ml_item_id,
            variation_id: String(v.id),
            title: listing.title,
            variation_name: v.name,
            sku: v.sku || listing.sku || '',
            thumbnail_url: v.thumbnail_url || listing.thumbnail_url || '',
            ft_id: v.ft_id || ''
          });
        });
      } else {
        allTargets.push({
          key: listing.ml_item_id,
          ml_item_id: listing.ml_item_id,
          variation_id: null,
          title: listing.title,
          variation_name: null,
          sku: listing.sku || '',
          thumbnail_url: listing.thumbnail_url || '',
          ft_id: listing.ft_id || ''
        });
      }
    });
    setMappingModal({ isOpen: true, items: allTargets });
  };

  const handleUpdateMlStock = async (listing, newQtyVal, variationId = null) => {
    const editKey = variationId ? `${listing.ml_item_id}__${variationId}` : listing.ml_item_id;
    setMlUpdatingKey(editKey);
    try {
      const updated = await updateMlListingStock({
        empresaId,
        listing,
        newQuantity: newQtyVal,
        variationId
      });
      setMlListings((prev) =>
        prev.map((item) => (item.ml_item_id === updated.ml_item_id ? updated : item))
      );
      setMlStockEdits((prev) => {
        const next = { ...prev };
        delete next[editKey];
        return next;
      });
    } catch (e) {
      alert('Erro ao atualizar estoque no Mercado Livre: ' + (e.message || String(e)));
    } finally {
      setMlUpdatingKey(null);
    }
  };

  const handleToggleMlStatus = async (listing) => {
    const nextStatus = listing.status === 'active' ? 'paused' : 'active';
    const labelAcao = nextStatus === 'paused' ? 'PAUSAR' : 'REATIVAR';
    if (!window.confirm(`Deseja ${labelAcao} o anúncio "${listing.title}" (${listing.ml_item_id}) no Mercado Livre?`)) {
      return;
    }
    setMlUpdatingKey(`status__${listing.ml_item_id}`);
    try {
      const updated = await updateMlListingStatus({
        empresaId,
        listing,
        newStatus: nextStatus
      });
      setMlListings((prev) =>
        prev.map((item) => (item.ml_item_id === updated.ml_item_id ? updated : item))
      );
    } catch (e) {
      alert('Erro ao alterar status do anúncio no Mercado Livre: ' + (e.message || String(e)));
    } finally {
      setMlUpdatingKey(null);
    }
  };

  const handleDirectRowFtSelect = async (listing, variationId, chosenFtKey) => {
    const targetKey = variationId ? `${listing.ml_item_id}__mlvar__${variationId}` : listing.ml_item_id;
    const itemSku = variationId
      ? listing.variations?.find((v) => String(v.id) === String(variationId))?.sku || listing.sku
      : listing.sku;

    try {
      const updatedListings = await saveFtMappingsAndPropagateSku({
        empresaId,
        mappingsByKey: { [targetKey]: chosenFtKey },
        skuByKey: itemSku ? { [targetKey]: itemSku } : {},
        propagateSku: true
      });
      setMlListings(updatedListings);
      await fetchEstoque();
    } catch (e) {
      alert('Erro ao vincular FT: ' + (e.message || String(e)));
    }
  };

  // Resolve o estoque físico (Galpão + Casa) para uma chave de FT/Variação vinculada
  const getPhysicalStockForFtLink = (ftLinkKey, fallbackPhysical = 0) => {
    if (!ftLinkKey || ftLinkKey === '__IGNORED__') return { isLinked: false, total: fallbackPhysical, galpao: 0, casa: 0 };
    const matchedRow = allRows.find((r) => r.rowKey === ftLinkKey) || allRows.find((r) => r.ftId === ftLinkKey);
    if (!matchedRow) return { isLinked: false, total: fallbackPhysical, galpao: 0, casa: 0 };
    return {
      isLinked: true,
      displayId: matchedRow.displayId,
      total: matchedRow.estoque,
      galpao: matchedRow.estoqueGalpao,
      casa: matchedRow.estoqueCasa
    };
  };

  // ============================================================================
  // FUNÇÕES DE VARIAÇÕES E ESTOQUE FÍSICO (GALPÃO & CASA)
  // ============================================================================

  const handleOpenVarModal = (row) => {
    const ft = row.parentFt;
    const isFirst = !ft.variacoes || ft.variacoes.length === 0;
    setVarModal({
      isOpen: true,
      ftId: ft.id,
      ftNome: ft.nome,
      isFirstVariation: isFirst,
      firstName: '',
      firstSku: ft.sku || '',
      newName: '',
      newSku: '',
    });
  };

  const closeVarModal = () => {
    setVarModal({
      isOpen: false,
      ftId: null,
      ftNome: '',
      isFirstVariation: false,
      firstName: '',
      firstSku: '',
      newName: '',
      newSku: '',
    });
  };

  const handleSaveVariation = async () => {
    const { ftId, isFirstVariation, firstName, firstSku, newName, newSku } = varModal;
    if (isFirstVariation && !firstName.trim()) {
      alert('Por favor, informe o nome da 1ª variação (principal) antes de criar outra.');
      return;
    }
    if (!newName.trim()) {
      alert('Por favor, informe o nome da nova variação.');
      return;
    }

    setSaving(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}&select=data,estoque`, { headers });
      if (!getResp.ok) throw new Error('Falha ao buscar FT');
      const rows = await getResp.json();
      const rowData = rows?.[0];
      if (!rowData) throw new Error('FT não encontrada');

      const currentData = rowData.data || {};
      const hasDual = currentData.estoqueGalpao !== undefined || currentData.estoqueCasa !== undefined;
      const baseGalpao = hasDual ? Number(currentData.estoqueGalpao || 0) : Number(rowData.estoque || 0);
      const baseCasa = hasDual ? Number(currentData.estoqueCasa || 0) : 0;

      let nextVariacoes = Array.isArray(currentData.variacoesEstoque) ? [...currentData.variacoesEstoque] : [];

      if (isFirstVariation || nextVariacoes.length === 0) {
        nextVariacoes = [
          {
            id: `v_${Date.now()}_1`,
            nome: firstName.trim(),
            sku: (firstSku || '').trim(),
            estoqueGalpao: baseGalpao,
            estoqueCasa: baseCasa
          },
          {
            id: `v_${Date.now()}_2`,
            nome: newName.trim(),
            sku: (newSku || '').trim(),
            estoqueGalpao: 0,
            estoqueCasa: 0
          }
        ];
      } else {
        nextVariacoes.push({
          id: `v_${Date.now()}`,
          nome: newName.trim(),
          sku: (newSku || '').trim(),
          estoqueGalpao: 0,
          estoqueCasa: 0
        });
      }

      const sumGalpao = nextVariacoes.reduce((acc, v) => acc + Number(v.estoqueGalpao || 0), 0);
      const sumCasa = nextVariacoes.reduce((acc, v) => acc + Number(v.estoqueCasa || 0), 0);
      const totalEstoque = sumGalpao + sumCasa;

      const newData = {
        ...currentData,
        variacoesEstoque: nextVariacoes,
        estoqueGalpao: sumGalpao,
        estoqueCasa: sumCasa
      };

      const patchResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ estoque: totalEstoque, data: newData })
      });

      if (!patchResp.ok) throw new Error('Erro ao salvar variação');

      closeVarModal();
      await fetchEstoque();
    } catch (e) {
      console.error('Erro ao salvar variação:', e);
      alert('Não foi possível salvar a variação.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVariation = async (ftId, varId, varNome) => {
    if (!window.confirm(`Deseja remover a variação "${varNome}" de ${ftId}?`)) return;
    setSaving(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}&select=data,estoque`, { headers });
      if (!getResp.ok) throw new Error('Falha ao buscar FT');
      const rows = await getResp.json();
      const rowData = rows?.[0];
      if (!rowData) return;

      const currentData = rowData.data || {};
      let nextVariacoes = (currentData.variacoesEstoque || []).filter(v => v.id !== varId);

      const sumGalpao = nextVariacoes.reduce((acc, v) => acc + Number(v.estoqueGalpao || 0), 0);
      const sumCasa = nextVariacoes.reduce((acc, v) => acc + Number(v.estoqueCasa || 0), 0);
      const totalEstoque = sumGalpao + sumCasa;

      const newData = {
        ...currentData,
        variacoesEstoque: nextVariacoes,
        estoqueGalpao: sumGalpao,
        estoqueCasa: sumCasa
      };
      if (nextVariacoes.length === 0) {
        delete newData.variacoesEstoque;
      }

      await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ estoque: totalEstoque, data: newData })
      });

      await fetchEstoque();
    } catch (e) {
      console.error('Erro ao excluir variação:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateVariationField = async (ftId, varId, fieldName, newVal) => {
    setSaving(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}&select=data,estoque`, { headers });
      if (!getResp.ok) return;
      const rows = await getResp.json();
      const rowData = rows?.[0];
      if (!rowData) return;

      const currentData = rowData.data || {};
      const nextVariacoes = (currentData.variacoesEstoque || []).map(v =>
        v.id === varId ? { ...v, [fieldName]: String(newVal || '').trim() } : v
      );

      const newData = {
        ...currentData,
        variacoesEstoque: nextVariacoes
      };

      await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}`, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ data: newData })
      });

      await fetchEstoque();
    } catch (e) {
      console.error('Erro ao atualizar variação:', e);
    } finally {
      setSaving(false);
    }
  };

  const calculateNewStock = (currentStock, adjustment) => {
    if (!adjustment) return currentStock;
    const trimmed = String(adjustment).trim();
    if (!trimmed) return currentStock;
    const isAbsolute = trimmed.startsWith('=');
    if (isAbsolute) {
      const val = parseInt(trimmed.substring(1), 10);
      return isNaN(val) ? currentStock : val;
    }
    const val = parseInt(trimmed, 10);
    if (isNaN(val)) return currentStock;
    return currentStock + val;
  };

  const closeLocationModal = () => {
    setLocationModal({ isOpen: false, mode: 'single', targetKey: null });
  };

  const openDirectStockModal = (rowKey, location) => {
    setDirectStockModal({
      isOpen: true,
      step: 'input',
      rowKey,
      location,
      inputValue: '',
    });
  };

  const closeDirectStockModal = () => {
    setDirectStockModal({
      isOpen: false,
      step: 'input',
      rowKey: null,
      location: 'galpao',
      inputValue: '',
    });
  };

  const handleDirectStockOk = () => {
    const val = String(directStockModal.inputValue || '').trim();
    if (!val) {
      alert('Digite a quantidade para adicionar (ex: 5), retirar (ex: -2) ou definir saldo exato (ex: =10).');
      return;
    }
    const numCheck = val.startsWith('=') ? parseInt(val.substring(1), 10) : parseInt(val, 10);
    if (isNaN(numCheck)) {
      alert('Valor inválido. Digite um número válido (ex: +5, -2 ou =10).');
      return;
    }
    setDirectStockModal(prev => ({ ...prev, step: 'confirm' }));
  };

  const handleDirectStockConfirm = async () => {
    const { rowKey, location, inputValue } = directStockModal;
    const item = allRows.find(r => r.rowKey === rowKey);
    closeDirectStockModal();
    if (!item || !inputValue) return;

    setSaving(true);
    try {
      await updateRowInSupabase(item, location, inputValue);
      await fetchEstoque();
    } catch (e) {
      console.error('Erro ao salvar ajuste direto de estoque:', e);
      alert('Erro ao salvar estoque.');
    } finally {
      setSaving(false);
    }
  };

  const updateRowInSupabase = async (rowItem, location, adjustmentStr) => {
    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${rowItem.ftId}&select=data,estoque`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });

    let currentData = rowItem.parentFt?.rawData || {};
    let fallbackEstoque = rowItem.parentFt?.estoque || 0;
    if (getResp.ok) {
      const rows = await getResp.json();
      if (rows && rows[0]) {
        currentData = rows[0].data || currentData;
        fallbackEstoque = rows[0].estoque ?? fallbackEstoque;
      }
    }

    if (rowItem.varId && Array.isArray(currentData.variacoesEstoque)) {
      const updatedVars = currentData.variacoesEstoque.map(v => {
        if (v.id !== rowItem.varId) return v;
        let g = Number(v.estoqueGalpao || 0);
        let c = Number(v.estoqueCasa || 0);
        if (location === 'galpao') {
          g = calculateNewStock(g, adjustmentStr);
        } else {
          c = calculateNewStock(c, adjustmentStr);
        }
        return { ...v, estoqueGalpao: g, estoqueCasa: c };
      });

      const sumGalpao = updatedVars.reduce((acc, v) => acc + Number(v.estoqueGalpao || 0), 0);
      const sumCasa = updatedVars.reduce((acc, v) => acc + Number(v.estoqueCasa || 0), 0);
      const totalEstoque = sumGalpao + sumCasa;

      const newData = {
        ...currentData,
        variacoesEstoque: updatedVars,
        estoqueGalpao: sumGalpao,
        estoqueCasa: sumCasa
      };

      const resp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${rowItem.ftId}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          estoque: totalEstoque,
          data: newData
        })
      });

      if (!resp.ok) throw new Error('Falha ao atualizar estoque da variação');
      return;
    }

    const hasDual = currentData.estoqueGalpao !== undefined || currentData.estoqueCasa !== undefined;
    let galpao = hasDual ? Number(currentData.estoqueGalpao || 0) : Number(fallbackEstoque || 0);
    let casa = hasDual ? Number(currentData.estoqueCasa || 0) : 0;

    if (location === 'galpao') {
      galpao = calculateNewStock(galpao, adjustmentStr);
    } else {
      casa = calculateNewStock(casa, adjustmentStr);
    }

    const totalEstoque = galpao + casa;
    const newData = {
      ...currentData,
      estoqueGalpao: galpao,
      estoqueCasa: casa
    };

    const resp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${rowItem.ftId}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        estoque: totalEstoque,
        data: newData
      })
    });

    if (!resp.ok) throw new Error('Falha ao atualizar estoque');
  };

  const confirmAndSaveLocation = async (location) => {
    const { mode, targetKey } = locationModal;
    closeLocationModal();

    if (mode === 'single' && targetKey) {
      const item = allRows.find(r => r.rowKey === targetKey);
      const adjustment = adjustments[targetKey];
      if (!item || !adjustment) return;

      setSaving(true);
      try {
        await updateRowInSupabase(item, location, adjustment);
        await fetchEstoque();

        setAdjustments(prev => {
          const next = { ...prev };
          delete next[targetKey];
          return next;
        });
      } catch (e) {
        console.error('Erro ao salvar ajuste de estoque', e);
        alert('Erro ao salvar estoque.');
      } finally {
        setSaving(false);
      }
    } else if (mode === 'batch') {
      const keys = Object.keys(adjustments).filter(k => adjustments[k] && String(adjustments[k]).trim() !== '');
      if (keys.length === 0) return;

      setSaving(true);
      let errorCount = 0;

      for (const key of keys) {
        const adjustment = adjustments[key];
        const item = allRows.find(r => r.rowKey === key);
        if (item) {
          try {
            await updateRowInSupabase(item, location, adjustment);
          } catch {
            errorCount++;
          }
        }
      }

      if (errorCount > 0) alert(`Houve erro ao salvar ${errorCount} itens.`);
      await fetchEstoque();
      setAdjustments({});
      setSaving(false);
    }
  };

  const handleZeroStock = async (targetLocation) => {
    setZeroModalOpen(false);
    setSaving(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=id,data,estoque`, { headers });
      if (!getResp.ok) throw new Error('Falha ao buscar itens para zerar');
      const rows = await getResp.json();

      let errorCount = 0;
      for (const r of rows) {
        const currentData = r.data || {};
        const hasDual = currentData.estoqueGalpao !== undefined || currentData.estoqueCasa !== undefined;
        let galpao = hasDual ? Number(currentData.estoqueGalpao || 0) : Number(r.estoque || 0);
        let casa = hasDual ? Number(currentData.estoqueCasa || 0) : 0;

        if (targetLocation === 'ambos') {
          galpao = 0;
          casa = 0;
        } else if (targetLocation === 'galpao') {
          galpao = 0;
        } else if (targetLocation === 'casa') {
          casa = 0;
        }

        let updatedVars = currentData.variacoesEstoque;
        if (Array.isArray(updatedVars) && updatedVars.length > 0) {
          updatedVars = updatedVars.map(v => ({
            ...v,
            estoqueGalpao: (targetLocation === 'ambos' || targetLocation === 'galpao') ? 0 : Number(v.estoqueGalpao || 0),
            estoqueCasa: (targetLocation === 'ambos' || targetLocation === 'casa') ? 0 : Number(v.estoqueCasa || 0)
          }));
          galpao = updatedVars.reduce((acc, v) => acc + Number(v.estoqueGalpao || 0), 0);
          casa = updatedVars.reduce((acc, v) => acc + Number(v.estoqueCasa || 0), 0);
        }

        const totalEstoque = galpao + casa;
        const newData = {
          ...currentData,
          ...(updatedVars ? { variacoesEstoque: updatedVars } : {}),
          estoqueGalpao: galpao,
          estoqueCasa: casa
        };

        const patchResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${r.id}`, {
          method: 'PATCH',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ estoque: totalEstoque, data: newData })
        });
        if (!patchResp.ok) errorCount++;
      }

      if (errorCount > 0) {
        alert(`Houve erro ao zerar ${errorCount} itens.`);
      }
      await fetchEstoque();
      setAdjustments({});
    } catch (e) {
      console.error('Erro ao zerar estoque:', e);
      alert('Erro ao zerar o estoque.');
    } finally {
      setSaving(false);
    }
  };

  // Filtra pelo campo de busca + filtro anunciados + aplica ordenação
  const filteredRows = allRows
    .filter(r => {
      if (filterAnunciados && !r.isAnunciado) return false;
      const term = searchTerm.toLowerCase().trim();
      if (!term) return true;
      return (
        r.nome.toLowerCase().includes(term) ||
        r.displayId.toLowerCase().includes(term) ||
        String(r.sku || '').toLowerCase().includes(term) ||
        String(r.estoque).includes(term) ||
        r.activeChannels.some(c => c.label.toLowerCase().includes(term) || c.short.toLowerCase().includes(term)) ||
        r.mlLinkedItems.some(m => m.ml_item_id.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      if (sortField === 'id') {
        cmp = String(a.ftId).localeCompare(String(b.ftId), undefined, { numeric: true });
        if (cmp === 0) cmp = (a.varIndex || 0) - (b.varIndex || 0);
      } else if (sortField === 'nome') {
        cmp = String(a.nome).localeCompare(String(b.nome), 'pt-BR', { sensitivity: 'base' });
      } else if (sortField === 'galpao') {
        cmp = (a.estoqueGalpao || 0) - (b.estoqueGalpao || 0);
      } else if (sortField === 'casa') {
        cmp = (a.estoqueCasa || 0) - (b.estoqueCasa || 0);
      } else if (sortField === 'total') {
        cmp = (a.estoque || 0) - (b.estoque || 0);
      } else if (sortField === 'anunciados') {
        cmp = (a.activeChannels.length || 0) - (b.activeChannels.length || 0);
      }
      if (cmp === 0) {
        cmp = String(a.displayId).localeCompare(String(b.displayId), undefined, { numeric: true });
      }
      return sortAsc ? cmp : -cmp;
    });

  const totalAnunciadosCount = fts.filter(ft => getActiveChannelsForFt(ft.id).length > 0).length;
  const unmappedCount = useMemo(() => collectUnmappedTargetsFromListings(mlListings).length, [mlListings]);
  const ftCatalogOptions = useMemo(() => buildFtCatalogOptions(fts), [fts]);

  const filteredMlListings = useMemo(() => {
    return mlListings.filter((item) => {
      if (mlStatusFilter === 'active' && item.status !== 'active') return false;
      if (mlStatusFilter === 'paused' && item.status !== 'paused') return false;
      if (mlStatusFilter === 'full' && item.logistic_type !== 'fulfillment') return false;
      if (mlStatusFilter === 'unmapped') {
        const hasVars = Array.isArray(item.variations) && item.variations.length > 0;
        const isUnmapped = hasVars
          ? item.variations.some((v) => !v.ft_id)
          : !item.ft_id;
        if (!isUnmapped) return false;
      }

      if (!mlSearch.trim()) return true;
      const q = mlSearch.toLowerCase().trim();
      const matchParent =
        String(item.title || '').toLowerCase().includes(q) ||
        String(item.ml_item_id || '').toLowerCase().includes(q) ||
        String(item.sku || '').toLowerCase().includes(q) ||
        String(item.ft_id || '').toLowerCase().includes(q);
      if (matchParent) return true;

      if (Array.isArray(item.variations)) {
        return item.variations.some(
          (v) =>
            String(v.name || '').toLowerCase().includes(q) ||
            String(v.sku || '').toLowerCase().includes(q) ||
            String(v.ft_id || '').toLowerCase().includes(q)
        );
      }
      return false;
    });
  }, [mlListings, mlStatusFilter, mlSearch]);

  const renderLogisticBadge = (logisticType) => {
    if (logisticType === 'fulfillment') {
      return <span className="ml-logistic-badge full" title="Estoque no Centro de Distribuição Full do Mercado Livre">⚡ FULL</span>;
    }
    if (logisticType === 'cross_docking' || logisticType === 'xd_drop_off' || logisticType === 'self_service') {
      return <span className="ml-logistic-badge fast" title={`Tipo logístico: ${logisticType}`}>🚚 Envio Rápido</span>;
    }
    return <span className="ml-logistic-badge normal" title={`Tipo logístico: ${logisticType || 'padrão'}`}>📦 Normal</span>;
  };

  // Dados para exibir no modal de escolha de estoque
  const activeModalItem = locationModal.mode === 'single' && locationModal.targetKey
    ? allRows.find(r => r.rowKey === locationModal.targetKey)
    : null;
  const activeModalAdj = locationModal.mode === 'single' && locationModal.targetKey
    ? adjustments[locationModal.targetKey]
    : '';
  const batchKeys = Object.keys(adjustments).filter(k => adjustments[k] && String(adjustments[k]).trim() !== '');

  const currentVarFt = varModal.ftId ? fts.find(f => f.id === varModal.ftId) : null;

  return (
    <div className="page-wrapper estoque-page">
      <div className="estoque-header">
        <div>
          <h1 className="page-title"><Package size={28} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }} />Controle de Estoque</h1>
          <p className="page-description">Gerencie o estoque físico (<strong>Galpão</strong> e <strong>Casa</strong>) e sincronize em tempo real com a <strong>API Oficial do Mercado Livre</strong>.</p>
        </div>

        {/* Seletor de Abas: Estoque Físico vs. API Mercado Livre */}
        <div className="estoque-tabs-bar" style={{ marginBottom: 0 }}>
          <button
            type="button"
            className={`estoque-tab-btn ${activeViewTab === 'fisico' ? 'active' : ''}`}
            onClick={() => setActiveViewTab('fisico')}
          >
            📦 Estoque Físico ({allRows.length})
          </button>
          <button
            type="button"
            className={`estoque-tab-btn ${activeViewTab === 'ml' ? 'active-ml' : ''}`}
            onClick={() => setActiveViewTab('ml')}
          >
            🛒 Anúncios Mercado Livre ({mlListings.length})
            {unmappedCount > 0 && (
              <span
                style={{
                  background: '#DC2626',
                  color: '#FFFFFF',
                  borderRadius: '10px',
                  padding: '1px 7px',
                  fontSize: '0.72rem',
                  fontWeight: 800
                }}
              >
                {unmappedCount} sem FT
              </span>
            )}
          </button>
        </div>
      </div>

      {activeViewTab === 'fisico' ? (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setFilterAnunciados(p => !p)}
                style={{
                  background: filterAnunciados ? 'var(--success)' : 'var(--bg-surface)',
                  color: filterAnunciados ? 'white' : 'var(--text-primary)',
                  border: `1px solid ${filterAnunciados ? 'var(--success)' : 'var(--border-color)'}`,
                  borderRadius: '10px',
                  padding: '0.55rem 1rem',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.2s'
                }}
                title="Filtrar apenas produtos marcados como No Ar nos Marketplaces"
              >
                {filterAnunciados ? '✅' : '☐'} Anunciados no Marketplace ({totalAnunciadosCount})
              </button>

              {mlToken && (
                <button
                  type="button"
                  onClick={handleSyncMlListings}
                  disabled={mlSyncing}
                  style={{
                    background: '#FEF9C3',
                    color: '#854D0E',
                    border: '1px solid #FDE047',
                    borderRadius: '10px',
                    padding: '0.55rem 1rem',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <RefreshCw size={15} className={mlSyncing ? 'spin' : ''} />
                  {mlSyncing ? 'Sincronizando ML...' : 'Atualizar Saldos ML'}
                </button>
              )}
            </div>

            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="search-bar" style={{ width: '290px' }}>
                <span className="search-icon"><Search size={18} /></span>
                <input
                  type="text"
                  placeholder="Buscar ID, variação, SKU, nome ou MLB..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => setZeroModalOpen(true)}
                disabled={saving || fts.length === 0}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '0.6rem 1rem',
                  borderRadius: '10px',
                  background: '#FEE2E2',
                  color: '#DC2626',
                  border: '1px solid #FECACA',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: saving ? 'not-allowed' : 'pointer'
                }}
                title="Zerar todo o estoque físico para iniciar contagem do zero"
              >
                <Trash2 size={16} />
                Zerar Estoque
              </button>
            </div>
          </div>

          <div className="card">
            <div className="alert alert-info" style={{ marginBottom: '1.5rem', display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '12px 16px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
              <AlertCircle size={20} />
              <div>
                <strong>Dica:</strong> Clique diretamente sobre <strong>🏭 Galpão</strong> ou <strong>🏠 Casa</strong> em qualquer linha para abrir a caixa de adicionar/retirar unidades daquele estoque. Use o botão <strong><code>+</code></strong> ao lado do ID para cadastrar variações e SKUs.
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '4rem' }}>
                <Loader size={40} className="spinner" color="var(--primary)" style={{ marginBottom: '1rem' }} />
                <p>Carregando estoque...</p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="estoque-table">
                  <thead>
                    <tr>
                      <th
                        className={`sortable-th ${sortField === 'id' ? 'active-sort' : ''}`}
                        style={{ minWidth: '150px' }}
                        onClick={() => handleSort('id')}
                        title="Clique para ordenar por ID"
                      >
                        ID / Variação {renderSortIcon('id')}
                      </th>
                      <th style={{ width: '44px', textAlign: 'center', padding: '12px 4px' }} title="Adicionar Variação de Estoque">
                        + Var
                      </th>
                      <th
                        className={`sortable-th ${sortField === 'nome' ? 'active-sort' : ''}`}
                        onClick={() => handleSort('nome')}
                        title="Clique para ordenar por Nome do Produto"
                      >
                        Produto / SKU {renderSortIcon('nome')}
                      </th>
                      <th
                        className={`sortable-th ${sortField === 'anunciados' ? 'active-sort' : ''}`}
                        style={{ width: '210px', textAlign: 'center' }}
                        onClick={() => handleSort('anunciados')}
                        title="Canais onde o produto está marcado como No Ar e saldo no Mercado Livre"
                      >
                        Anunciado / Saldo ML {renderSortIcon('anunciados')}
                      </th>
                      <th style={{ width: '360px', textAlign: 'center' }}>
                        <div className="th-stock-filters">
                          <button
                            type="button"
                            className={`th-sort-pill ${sortField === 'galpao' ? 'active' : ''}`}
                            onClick={() => handleSort('galpao')}
                            title="Ordenar por Estoque Galpão"
                          >
                            🏭 Galpão {renderSortIcon('galpao')}
                          </button>
                          <button
                            type="button"
                            className={`th-sort-pill ${sortField === 'casa' ? 'active' : ''}`}
                            onClick={() => handleSort('casa')}
                            title="Ordenar por Estoque Casa"
                          >
                            🏠 Casa {renderSortIcon('casa')}
                          </button>
                          <button
                            type="button"
                            className={`th-sort-pill ${sortField === 'total' ? 'active' : ''}`}
                            onClick={() => handleSort('total')}
                            title="Ordenar por Estoque Total (Casa + Galpão)"
                          >
                            📦 Total {renderSortIcon('total')}
                          </button>
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length > 0 ? filteredRows.map(item => {
                      const totalItem = (item.estoqueGalpao || 0) + (item.estoqueCasa || 0);

                      return (
                        <tr
                          key={item.rowKey}
                          style={item.isAnunciado ? { backgroundColor: 'rgba(16, 185, 129, 0.03)' } : {}}
                        >
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span className="badge" style={item.hasVariacoes ? { background: 'rgba(124, 58, 237, 0.12)', color: 'var(--accent-primary)', border: '1px solid rgba(124, 58, 237, 0.3)' } : {}}>
                              {item.displayId}
                            </span>
                          </td>
                          <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                            <button
                              type="button"
                              className="btn-add-var"
                              onClick={() => handleOpenVarModal(item)}
                              title={`Adicionar ou gerenciar variações de ${item.ftId}`}
                            >
                              <Plus size={15} />
                            </button>
                          </td>
                          <td style={{ fontWeight: '500' }}>
                            <div>{item.nome}</div>
                            {item.sku && (
                              <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', fontFamily: 'monospace', background: 'var(--bg-secondary)', padding: '1px 6px', borderRadius: '4px' }}>
                                SKU: {item.sku}
                              </span>
                            )}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                              {item.activeChannels.length > 0 ? (
                                <div style={{ display: 'inline-flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center' }}>
                                  {item.activeChannels.map(ch => (
                                    <span
                                      key={ch.id}
                                      className="mkt-channel-pill"
                                      title={`Anunciado / No Ar em: ${ch.label}`}
                                    >
                                      {ch.icon} {ch.short}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: 'var(--text-secondary)', opacity: 0.45, fontSize: '0.8rem' }}>—</span>
                              )}

                              {item.mlLinkedItems.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
                                  {item.mlLinkedItems.map((mlRef) => {
                                    const isFull = mlRef.logistic_type === 'fulfillment';
                                    const diffFromPhysical = mlRef.stock_ml !== totalItem;
                                    return (
                                      <div
                                        key={`${mlRef.ml_item_id}_${mlRef.variationId || 'root'}`}
                                        style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          background: '#FEF9C3',
                                          border: '1px solid #FDE047',
                                          color: '#854D0E',
                                          borderRadius: '6px',
                                          padding: '2px 6px',
                                          fontSize: '0.71rem',
                                          fontWeight: 700
                                        }}
                                        title={`${mlRef.ml_item_id}${mlRef.variationName ? ` (${mlRef.variationName})` : ''} — Estoque no Mercado Livre: ${mlRef.stock_ml} un`}
                                      >
                                        <span>📦 ML: {mlRef.stock_ml} un</span>
                                        {isFull && <span style={{ color: '#15803D' }}>(Full)</span>}
                                        {!isFull && diffFromPhysical && (
                                          <button
                                            type="button"
                                            onClick={() => handleUpdateMlStock(mlRef.listing, totalItem, mlRef.variationId)}
                                            disabled={mlUpdatingKey !== null}
                                            style={{
                                              background: '#EAB308',
                                              color: '#0F172A',
                                              border: 'none',
                                              borderRadius: '4px',
                                              padding: '1px 5px',
                                              fontSize: '0.67rem',
                                              fontWeight: 800,
                                              cursor: 'pointer'
                                            }}
                                            title={`Enviar saldo físico (${totalItem} un) para o anúncio ${mlRef.ml_item_id} no Mercado Livre`}
                                          >
                                            Igualar ({totalItem})
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="dual-stock-wrap">
                              <button
                                type="button"
                                className={`stock-badge stock-loc-badge stock-clickable ${item.estoqueGalpao <= 0 ? 'stock-zero' : 'stock-galpao'}`}
                                onClick={() => openDirectStockModal(item.rowKey, 'galpao')}
                                title="Clique para adicionar ou retirar unidades do Galpão"
                              >
                                🏭 Galpão: {item.estoqueGalpao} un
                              </button>
                              <button
                                type="button"
                                className={`stock-badge stock-loc-badge stock-clickable ${item.estoqueCasa <= 0 ? 'stock-zero' : 'stock-casa'}`}
                                onClick={() => openDirectStockModal(item.rowKey, 'casa')}
                                title="Clique para adicionar ou retirar unidades de Casa"
                              >
                                🏠 Casa: {item.estoqueCasa} un
                              </button>
                              <span className={`stock-badge stock-loc-badge ${totalItem <= 0 ? 'stock-zero' : 'stock-total'}`} title="Estoque Total (Casa + Galpão)">
                                📦 Total: {totalItem} un
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>Nenhum produto encontrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        /* ======================================================================
           ABA 2: PAINEL DE INTEGRAÇÃO MERCADO LIVRE (API OFICIAL)
           ====================================================================== */
        <div>
          {/* Banner de Status da Conexão OAuth com a Conta do Mercado Livre */}
          <div className="ml-connection-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '10px',
                  background: '#FACC15',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.4rem',
                  boxShadow: '0 2px 6px rgba(234,179,8,0.25)'
                }}
              >
                🤝
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1rem', color: '#0F172A' }}>
                    Integração Oficial Mercado Livre
                  </strong>
                  {mlToken?.access_token ? (
                    <span
                      style={{
                        background: '#16A34A',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '20px',
                        fontSize: '0.73rem',
                        fontWeight: 800
                      }}
                    >
                      ● CONECTADO {mlToken.ml_nickname ? `(${mlToken.ml_nickname})` : `ID ${mlToken.ml_user_id}`}
                    </span>
                  ) : (
                    <span
                      style={{
                        background: '#DC2626',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '20px',
                        fontSize: '0.73rem',
                        fontWeight: 800
                      }}
                    >
                      ○ DESCONECTADO
                    </span>
                  )}
                </div>
                <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#713F12' }}>
                  {mlToken?.access_token
                    ? `Sincronize seus anúncios, variações, SKUs e atualize o estoque diretamente no Mercado Livre.`
                    : `Conecte sua conta do Mercado Livre para importar anúncios, variações, SKUs e controlar o estoque via API.`}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => {
                  setAppCredsForm(getMlAppCredentials());
                  setAppConfigModalOpen(true);
                }}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #CA8A04',
                  background: 'rgba(255,255,255,0.75)',
                  color: '#713F12',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  cursor: 'pointer'
                }}
                title="Configurar Client ID, Client Secret e Redirect URI do App Mercado Livre"
              >
                <Settings size={15} /> Config. App ML
              </button>

              <button
                type="button"
                onClick={() => setPasteUrlModalOpen(true)}
                style={{
                  padding: '0.5rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #CA8A04',
                  background: 'rgba(255,255,255,0.75)',
                  color: '#713F12',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
                title="Caso o redirecionamento abra em outra aba/URL, cole aqui a URL de retorno (?code=TG-...)"
              >
                📋 Colar URL (?code=)
              </button>

              {!mlToken?.access_token ? (
                <button
                  type="button"
                  onClick={handleStartMlConnect}
                  style={{
                    padding: '0.55rem 1.1rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0F172A',
                    color: '#FFFFFF',
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  🔗 Conectar Conta ML
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleSyncMlListings}
                    disabled={mlSyncing}
                    style={{
                      padding: '0.55rem 1.1rem',
                      borderRadius: '8px',
                      border: 'none',
                      background: '#16A34A',
                      color: '#FFFFFF',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    <RefreshCw size={15} className={mlSyncing ? 'spin' : ''} />
                    {mlSyncing ? 'Sincronizando...' : 'Sincronizar Estoque ML'}
                  </button>

                  {mlListings.length > 0 && (
                    <button
                      type="button"
                      onClick={handleOpenAllMappingsModal}
                      style={{
                        padding: '0.55rem 0.95rem',
                        borderRadius: '8px',
                        border: '1px solid #7C3AED',
                        background: 'var(--accent-subtle)',
                        color: '#6D28D9',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Link2 size={15} />
                      Vínculos FT {unmappedCount > 0 ? `(${unmappedCount} novos)` : ''}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleDisconnectMl}
                    style={{
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      border: '1px solid #FECACA',
                      background: '#FEE2E2',
                      color: '#DC2626',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    title="Desconectar conta do Mercado Livre"
                  >
                    <Unplug size={14} /> Sair ML
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Barra de Filtros dos Anúncios ML */}
          <div className="card" style={{ padding: '1.1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.85rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: `Todos (${mlListings.length})` },
                  { id: 'active', label: `Ativos (${mlListings.filter(l => l.status === 'active').length})` },
                  { id: 'paused', label: `Pausados (${mlListings.filter(l => l.status === 'paused').length})` },
                  { id: 'full', label: `⚡ Full (${mlListings.filter(l => l.logistic_type === 'fulfillment').length})` },
                  { id: 'unmapped', label: `🔗 Sem Vínculo FT (${unmappedCount})` }
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setMlStatusFilter(f.id)}
                    style={{
                      padding: '0.42rem 0.85rem',
                      borderRadius: '8px',
                      border: `1px solid ${mlStatusFilter === f.id ? 'var(--accent-primary)' : 'var(--border-color)'}`,
                      background: mlStatusFilter === f.id ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                      color: mlStatusFilter === f.id ? 'var(--accent-hover)' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      cursor: 'pointer'
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              <div className="search-bar" style={{ width: '310px' }}>
                <span className="search-icon"><Search size={17} /></span>
                <input
                  type="text"
                  placeholder="Buscar por título, MLB, SKU ou FT..."
                  value={mlSearch}
                  onChange={(e) => setMlSearch(e.target.value)}
                />
              </div>
            </div>

            {filteredMlListings.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                <p style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px' }}>
                  {mlListings.length === 0
                    ? 'Nenhum anúncio importado do Mercado Livre ainda.'
                    : 'Nenhum anúncio encontrado para este filtro.'}
                </p>
                {mlListings.length === 0 && (
                  <p style={{ fontSize: '0.85rem' }}>
                    Conecte sua conta do Mercado Livre acima e clique em <strong>&ldquo;Sincronizar Estoque ML&rdquo;</strong> para buscar seus anúncios e variações.
                  </p>
                )}
              </div>
            ) : (
              <div className="table-responsive">
                <table className="estoque-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: '280px' }}>Anúncio / Variações (ML)</th>
                      <th>SKU (ML)</th>
                      <th>Logística</th>
                      <th style={{ minWidth: '220px' }}>Vínculo Interno (FT / Variação)</th>
                      <th style={{ textAlign: 'right' }}>Preço ML</th>
                      <th style={{ textAlign: 'center' }}>Estoque Físico</th>
                      <th style={{ textAlign: 'center', minWidth: '200px' }}>Estoque no ML</th>
                      <th style={{ textAlign: 'center' }}>Status / Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMlListings.flatMap((listing) => {
                      const hasVars = Array.isArray(listing.variations) && listing.variations.length > 0;
                      const isExpanded = !!expandedMlItems[listing.ml_item_id];
                      const isFull = listing.logistic_type === 'fulfillment';
                      const parentEditKey = listing.ml_item_id;
                      const parentEditVal =
                        mlStockEdits[parentEditKey] !== undefined
                          ? mlStockEdits[parentEditKey]
                          : String(listing.stock_ml ?? 0);
                      const parentPhys = getPhysicalStockForFtLink(listing.ft_id, listing.stock_physical);

                      const rows = [
                        <tr key={listing.ml_item_id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              {hasVars && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedMlItems((prev) => ({
                                      ...prev,
                                      [listing.ml_item_id]: !prev[listing.ml_item_id]
                                    }))
                                  }
                                  style={{
                                    background: 'var(--bg-secondary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '6px',
                                    width: '26px',
                                    height: '26px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    flexShrink: 0
                                  }}
                                  title={isExpanded ? 'Recolher variações' : 'Expandir variações'}
                                >
                                  {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                </button>
                              )}
                              {listing.thumbnail_url ? (
                                <img
                                  src={listing.thumbnail_url}
                                  alt={listing.title}
                                  style={{
                                    width: '42px',
                                    height: '42px',
                                    borderRadius: '8px',
                                    objectFit: 'cover',
                                    border: '1px solid var(--border-color)',
                                    flexShrink: 0
                                  }}
                                />
                              ) : (
                                <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📦</div>
                              )}
                              <div style={{ minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <a
                                    href={listing.permalink}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      fontSize: '0.72rem',
                                      fontWeight: 800,
                                      color: '#854D0E',
                                      background: '#FEF9C3',
                                      border: '1px solid #FDE047',
                                      padding: '1px 6px',
                                      borderRadius: '4px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '3px'
                                    }}
                                  >
                                    {listing.ml_item_id} <ExternalLink size={11} />
                                  </a>
                                  {hasVars && (
                                    <span style={{ fontSize: '0.71rem', fontWeight: 700, color: 'var(--accent-primary)', background: 'var(--accent-subtle)', padding: '1px 6px', borderRadius: '4px' }}>
                                      {listing.variations.length} variações
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--text-primary)', marginTop: '2px' }}>
                                  {listing.title}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td>
                            {listing.sku ? (
                              <code style={{ background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 700 }}>
                                {listing.sku}
                              </code>
                            ) : (
                              <span style={{ color: 'var(--text-secondary)', opacity: 0.45, fontSize: '0.78rem' }}>—</span>
                            )}
                          </td>

                          <td>{renderLogisticBadge(listing.logistic_type)}</td>

                          <td>
                            {hasVars ? (
                              <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                ↳ Vinculado por variação abaixo
                              </span>
                            ) : (
                              <select
                                value={listing.ft_id || ''}
                                onChange={(e) => handleDirectRowFtSelect(listing, null, e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '0.4rem 0.55rem',
                                  borderRadius: '7px',
                                  border: `1px solid ${listing.ft_id ? '#10B981' : 'var(--border-color)'}`,
                                  background: listing.ft_id ? 'rgba(16,185,129,0.06)' : 'var(--bg-surface)',
                                  fontSize: '0.8rem',
                                  fontWeight: 600,
                                  color: 'var(--text-primary)'
                                }}
                              >
                                <option value="">-- Vincular FT / Variação --</option>
                                {ftCatalogOptions.map((opt) => (
                                  <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                  </option>
                                ))}
                                <option value="__IGNORED__">🚫 Ignorar</option>
                              </select>
                            )}
                          </td>

                          <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                            {listing.price_promo ? (
                              <div>
                                <div style={{ fontSize: '0.72rem', textDecoration: 'line-through', color: 'var(--text-secondary)' }}>
                                  R$ {Number(listing.price || 0).toFixed(2).replace('.', ',')}
                                </div>
                                <strong style={{ color: '#16A34A', fontSize: '0.9rem' }}>
                                  R$ {Number(listing.price_promo).toFixed(2).replace('.', ',')}
                                </strong>
                              </div>
                            ) : (
                              <strong>R$ {Number(listing.price || 0).toFixed(2).replace('.', ',')}</strong>
                            )}
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            {hasVars ? (
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Ver variações</span>
                            ) : parentPhys.isLinked ? (
                              <span className="stock-badge stock-total" title={`🏭 Galpão: ${parentPhys.galpao} | 🏠 Casa: ${parentPhys.casa}`}>
                                📦 {parentPhys.total} un
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Sem FT</span>
                            )}
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            {hasVars ? (
                              <strong style={{ fontSize: '0.88rem' }}>{listing.stock_ml} un (soma)</strong>
                            ) : (
                              <div className="ml-stock-inline-box">
                                <input
                                  type="number"
                                  min="0"
                                  className="ml-stock-inline-input"
                                  disabled={isFull || mlUpdatingKey === parentEditKey}
                                  value={parentEditVal}
                                  onChange={(e) =>
                                    setMlStockEdits((prev) => ({ ...prev, [parentEditKey]: e.target.value }))
                                  }
                                />
                                {!isFull && (
                                  <>
                                    <button
                                      type="button"
                                      className="btn-primary"
                                      disabled={mlUpdatingKey === parentEditKey || Number(parentEditVal) === Number(listing.stock_ml)}
                                      onClick={() => handleUpdateMlStock(listing, parentEditVal, null)}
                                      style={{ padding: '5px 9px', fontSize: '0.75rem', borderRadius: '6px' }}
                                      title="Enviar esta quantidade para o Mercado Livre"
                                    >
                                      {mlUpdatingKey === parentEditKey ? '...' : 'Salvar'}
                                    </button>
                                    {parentPhys.isLinked && parentPhys.total !== Number(listing.stock_ml) && (
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateMlStock(listing, parentPhys.total, null)}
                                        disabled={mlUpdatingKey === parentEditKey}
                                        style={{
                                          padding: '5px 7px',
                                          fontSize: '0.72rem',
                                          borderRadius: '6px',
                                          background: '#FEF9C3',
                                          color: '#854D0E',
                                          border: '1px solid #FDE047',
                                          fontWeight: 800,
                                          cursor: 'pointer'
                                        }}
                                        title={`Igualar estoque ML ao físico (${parentPhys.total} un)`}
                                      >
                                        ={parentPhys.total}
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleToggleMlStatus(listing)}
                              disabled={mlUpdatingKey === `status__${listing.ml_item_id}`}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                background: listing.status === 'active' ? '#DCFCE7' : '#FEF3C7',
                                color: listing.status === 'active' ? '#15803D' : '#B45309',
                                border: `1px solid ${listing.status === 'active' ? '#86EFAC' : '#FDE68A'}`
                              }}
                              title={listing.status === 'active' ? 'Clique para pausar o anúncio no ML' : 'Clique para reativar o anúncio no ML'}
                            >
                              {listing.status === 'active' ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
                              {listing.status === 'active' ? 'Ativo' : 'Pausado'}
                            </button>
                          </td>
                        </tr>
                      ];

                      if (hasVars && isExpanded) {
                        listing.variations.forEach((v) => {
                          const varEditKey = `${listing.ml_item_id}__${v.id}`;
                          const varEditVal =
                            mlStockEdits[varEditKey] !== undefined
                              ? mlStockEdits[varEditKey]
                              : String(v.stock_ml ?? 0);
                          const varPhys = getPhysicalStockForFtLink(v.ft_id, v.stock_physical);

                          rows.push(
                            <tr key={varEditKey} className="ml-var-subrow">
                              <td style={{ paddingLeft: '3.2rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {v.thumbnail_url && (
                                    <img
                                      src={v.thumbnail_url}
                                      alt={v.name}
                                      style={{ width: '30px', height: '30px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                                    />
                                  )}
                                  <div>
                                    <span style={{ fontWeight: 700, color: 'var(--accent-hover)' }}>↳ {v.name}</span>
                                    <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--text-secondary)' }}>
                                      ID Var: {v.id}
                                    </span>
                                  </div>
                                </div>
                              </td>

                              <td>
                                {v.sku ? (
                                  <code style={{ background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, border: '1px solid var(--border-color)' }}>
                                    {v.sku}
                                  </code>
                                ) : (
                                  <span style={{ color: 'var(--text-secondary)', opacity: 0.45 }}>—</span>
                                )}
                              </td>

                              <td>{renderLogisticBadge(listing.logistic_type)}</td>

                              <td>
                                <select
                                  value={v.ft_id || ''}
                                  onChange={(e) => handleDirectRowFtSelect(listing, v.id, e.target.value)}
                                  style={{
                                    width: '100%',
                                    padding: '0.38rem 0.5rem',
                                    borderRadius: '7px',
                                    border: `1px solid ${v.ft_id ? '#10B981' : 'var(--border-color)'}`,
                                    background: v.ft_id ? 'rgba(16,185,129,0.08)' : 'var(--bg-surface)',
                                    fontSize: '0.78rem',
                                    fontWeight: 600,
                                    color: 'var(--text-primary)'
                                  }}
                                >
                                  <option value="">-- Vincular Variação / FT --</option>
                                  {ftCatalogOptions.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                  <option value="__IGNORED__">🚫 Ignorar</option>
                                </select>
                              </td>

                              <td style={{ textAlign: 'right' }}>
                                R$ {Number(v.price || listing.price_promo || listing.price || 0).toFixed(2).replace('.', ',')}
                              </td>

                              <td style={{ textAlign: 'center' }}>
                                {varPhys.isLinked ? (
                                  <span className="stock-badge stock-total" title={`🏭 Galpão: ${varPhys.galpao} | 🏠 Casa: ${varPhys.casa}`}>
                                    📦 {varPhys.total} un
                                  </span>
                                ) : (
                                  <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Sem FT</span>
                                )}
                              </td>

                              <td style={{ textAlign: 'center' }}>
                                <div className="ml-stock-inline-box">
                                  <input
                                    type="number"
                                    min="0"
                                    className="ml-stock-inline-input"
                                    disabled={isFull || mlUpdatingKey === varEditKey}
                                    value={varEditVal}
                                    onChange={(e) =>
                                      setMlStockEdits((prev) => ({ ...prev, [varEditKey]: e.target.value }))
                                    }
                                  />
                                  {!isFull && (
                                    <>
                                      <button
                                        type="button"
                                        className="btn-primary"
                                        disabled={mlUpdatingKey === varEditKey || Number(varEditVal) === Number(v.stock_ml)}
                                        onClick={() => handleUpdateMlStock(listing, varEditVal, v.id)}
                                        style={{ padding: '4px 8px', fontSize: '0.74rem', borderRadius: '6px' }}
                                      >
                                        {mlUpdatingKey === varEditKey ? '...' : 'Salvar'}
                                      </button>
                                      {varPhys.isLinked && varPhys.total !== Number(v.stock_ml) && (
                                        <button
                                          type="button"
                                          onClick={() => handleUpdateMlStock(listing, varPhys.total, v.id)}
                                          disabled={mlUpdatingKey === varEditKey}
                                          style={{
                                            padding: '4px 6px',
                                            fontSize: '0.7rem',
                                            borderRadius: '6px',
                                            background: '#FEF9C3',
                                            color: '#854D0E',
                                            border: '1px solid #FDE047',
                                            fontWeight: 800,
                                            cursor: 'pointer'
                                          }}
                                          title={`Igualar estoque desta variação no ML ao estoque físico (${varPhys.total} un)`}
                                        >
                                          ={varPhys.total}
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              </td>

                              <td style={{ textAlign: 'center', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                                Variação
                              </td>
                            </tr>
                          );
                        });
                      }

                      return rows;
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de Cadastro e Gerenciamento de Variações (com suporte a SKU) */}
      {varModal.isOpen && (
        <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && closeVarModal()}>
          <div className="cm-modal cm-edit" style={{ maxWidth: '540px' }}>
            <div className="cm-header">
              <span className="cm-icon">🏷️</span>
              <div className="cm-title-block">
                <span className="cm-badge cm-edit">VARIAÇÕES E SKUS DA FT</span>
                <h3 className="cm-title">
                  {varModal.ftId} — {varModal.ftNome}
                </h3>
              </div>
              <button className="cm-close" onClick={closeVarModal} aria-label="Fechar">×</button>
            </div>

            <div style={{ padding: '1rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {varModal.isFirstVariation ? (
                <>
                  <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1E40AF', padding: '10px 12px', borderRadius: '8px', fontSize: '0.83rem', lineHeight: 1.4 }}>
                    ℹ️ Para cadastrar variações nesta FT, dê um nome para a <strong>1ª variação (que ficará com o saldo atual)</strong> e informe o nome da <strong>2ª variação</strong>. Todas passarão a exibir <code>{varModal.ftId} - Nome</code>.
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Nome da 1ª Variação (Principal) *
                      </label>
                      <input
                        type="text"
                        className="adjustment-input"
                        placeholder="Ex: Padrão, Preto..."
                        value={varModal.firstName}
                        onChange={e => setVarModal(prev => ({ ...prev, firstName: e.target.value }))}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        SKU da 1ª Variação (Opcional)
                      </label>
                      <input
                        type="text"
                        className="adjustment-input"
                        placeholder="Ex: SKU-PRETO"
                        value={varModal.firstSku}
                        onChange={e => setVarModal(prev => ({ ...prev, firstSku: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Nome da 2ª Variação (Nova) *
                      </label>
                      <input
                        type="text"
                        className="adjustment-input"
                        placeholder="Ex: Azul, Grande..."
                        value={varModal.newName}
                        onChange={e => setVarModal(prev => ({ ...prev, newName: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveVariation(); }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        SKU da 2ª Variação (Opcional)
                      </label>
                      <input
                        type="text"
                        className="adjustment-input"
                        placeholder="Ex: SKU-AZUL"
                        value={varModal.newSku}
                        onChange={e => setVarModal(prev => ({ ...prev, newSku: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveVariation(); }}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {currentVarFt?.variacoes && currentVarFt.variacoes.length > 0 && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Variações já cadastradas ({currentVarFt.variacoes.length}):
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                        {currentVarFt.variacoes.map((v) => (
                          <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>
                              {varModal.ftId} -
                            </span>
                            <input
                              type="text"
                              defaultValue={v.nome}
                              onBlur={(e) => {
                                if (e.target.value.trim() && e.target.value.trim() !== v.nome) {
                                  handleUpdateVariationField(varModal.ftId, v.id, 'nome', e.target.value);
                                }
                              }}
                              style={{ flex: 1, border: '1px solid transparent', background: 'transparent', fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-primary)', padding: '2px 5px', borderRadius: '4px' }}
                              title="Editar nome da variação"
                            />
                            <input
                              type="text"
                              defaultValue={v.sku || ''}
                              placeholder="SKU..."
                              onBlur={(e) => {
                                if (e.target.value.trim() !== String(v.sku || '')) {
                                  handleUpdateVariationField(varModal.ftId, v.id, 'sku', e.target.value);
                                }
                              }}
                              style={{ width: '105px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', fontSize: '0.76rem', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}
                              title="SKU desta variação"
                            />
                            <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              🏭 {v.estoqueGalpao || 0} | 🏠 {v.estoqueCasa || 0}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteVariation(varModal.ftId, v.id, v.nome)}
                              style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center' }}
                              title="Excluir esta variação"
                            >
                              <X size={15} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Adicionar Nova Variação *
                      </label>
                      <input
                        type="text"
                        className="adjustment-input"
                        placeholder={`Nome (ficará ${varModal.ftId} - ...)`}
                        value={varModal.newName}
                        onChange={e => setVarModal(prev => ({ ...prev, newName: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveVariation(); }}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        SKU da Variação (Opcional)
                      </label>
                      <input
                        type="text"
                        className="adjustment-input"
                        placeholder="Ex: SKU-VAR"
                        value={varModal.newSku}
                        onChange={e => setVarModal(prev => ({ ...prev, newSku: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveVariation(); }}
                      />
                    </div>
                  </div>
                </>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" className="cm-btn-cancel" onClick={closeVarModal}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleSaveVariation}
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  {saving ? <Loader size={16} className="spin" /> : <Plus size={16} />}
                  Salvar Variação
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Clique Direto em Galpão ou Casa */}
      {directStockModal.isOpen && (() => {
        const directItem = allRows.find(r => r.rowKey === directStockModal.rowKey);
        if (!directItem) return null;
        const isGalpao = directStockModal.location === 'galpao';
        const locLabel = isGalpao ? '🏭 Estoque Galpão' : '🏠 Estoque Casa';
        const currentLocStock = isGalpao ? directItem.estoqueGalpao : directItem.estoqueCasa;
        const otherLocStock = isGalpao ? directItem.estoqueCasa : directItem.estoqueGalpao;
        const previewLocStock = calculateNewStock(currentLocStock, directStockModal.inputValue);
        const previewTotalStock = previewLocStock + otherLocStock;

        return (
          <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && closeDirectStockModal()}>
            <div className="cm-modal cm-edit" style={{ maxWidth: '460px' }}>
              <div className="cm-header">
                <span className="cm-icon">{isGalpao ? '🏭' : '🏠'}</span>
                <div className="cm-title-block">
                  <span className="cm-badge cm-edit">
                    {directStockModal.step === 'input' ? `AJUSTAR ${isGalpao ? 'GALPÃO' : 'CASA'}` : 'CONFIRMAR ALTERAÇÃO'}
                  </span>
                  <h3 className="cm-title">
                    {directStockModal.step === 'input'
                      ? `Adicionar ou retirar em ${isGalpao ? 'Galpão' : 'Casa'}`
                      : `Confirmar ajuste no ${locLabel}?`}
                  </h3>
                </div>
                <button className="cm-close" onClick={closeDirectStockModal} aria-label="Fechar">×</button>
              </div>

              {directStockModal.step === 'input' ? (
                <div style={{ padding: '1rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="cm-details" style={{ margin: 0 }}>
                    <div className="cm-detail-row cm-edit">
                      <span className="cm-detail-label">Produto</span>
                      <span className="cm-detail-value">{directItem.displayId} — {directItem.nome}</span>
                    </div>
                    <div className="cm-detail-row cm-edit">
                      <span className="cm-detail-label">Saldo Atual ({locLabel})</span>
                      <span className="cm-detail-value"><strong>{currentLocStock} un</strong></span>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      Unidades para adicionar ou retirar (ex: <code>+5</code>, <code>-2</code> ou <code>=10</code>):
                    </label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <button
                        type="button"
                        onClick={() => {
                          const cur = parseInt(directStockModal.inputValue, 10) || 0;
                          setDirectStockModal(prev => ({ ...prev, inputValue: String(cur - 1) }));
                        }}
                        style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#FEE2E2', color: '#DC2626', fontWeight: 900, fontSize: '1.2rem', cursor: 'pointer' }}
                        title="Retirar 1 unidade"
                      >
                        −
                      </button>
                      <input
                        type="text"
                        className="adjustment-input"
                        style={{ textAlign: 'center', fontSize: '1.1rem', fontWeight: 700 }}
                        placeholder="Ex: 5, -2 ou =10"
                        value={directStockModal.inputValue}
                        onChange={e => setDirectStockModal(prev => ({ ...prev, inputValue: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') handleDirectStockOk(); }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const cur = parseInt(directStockModal.inputValue, 10) || 0;
                          const nextVal = cur + 1;
                          setDirectStockModal(prev => ({ ...prev, inputValue: nextVal > 0 ? `+${nextVal}` : String(nextVal) }));
                        }}
                        style={{ width: '40px', height: '40px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#DCFCE7', color: '#15803D', fontWeight: 900, fontSize: '1.2rem', cursor: 'pointer' }}
                        title="Adicionar 1 unidade"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div style={{ background: isGalpao ? '#EFF6FF' : '#ECFDF5', border: `1px solid ${isGalpao ? '#BFDBFE' : '#A7F3D0'}`, color: isGalpao ? '#1D4ED8' : '#047857', padding: '10px 12px', borderRadius: '8px', fontSize: '0.88rem', textAlign: 'center', fontWeight: 600, minHeight: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {String(directStockModal.inputValue || '').trim() !== '' ? (
                      <span>Novo saldo em {locLabel}: <strong>{currentLocStock} un → {previewLocStock} un</strong> (Total Geral: {previewTotalStock} un)</span>
                    ) : (
                      <span style={{ opacity: 0.7 }}>Novo saldo em {locLabel}: <strong>{currentLocStock} un</strong> (Total Geral: {currentLocStock + otherLocStock} un)</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
                    <button type="button" className="cm-btn-cancel" onClick={closeDirectStockModal}>
                      Cancelar
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleDirectStockOk}
                      style={{ minWidth: '110px', justifyContent: 'center' }}
                    >
                      OK
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div className="cm-details" style={{ margin: 0 }}>
                    <div className="cm-detail-row cm-edit">
                      <span className="cm-detail-label">Produto</span>
                      <span className="cm-detail-value">{directItem.displayId} — {directItem.nome}</span>
                    </div>
                    <div className="cm-detail-row cm-edit">
                      <span className="cm-detail-label">Local Escolhido</span>
                      <span className="cm-detail-value"><strong>{locLabel}</strong></span>
                    </div>
                    <div className="cm-detail-row cm-edit">
                      <span className="cm-detail-label">Movimentação</span>
                      <span className="cm-detail-value"><strong>{directStockModal.inputValue}</strong></span>
                    </div>
                    <div className="cm-detail-row cm-edit">
                      <span className="cm-detail-label">Saldo Anterior → Novo</span>
                      <span className="cm-detail-value">
                        {currentLocStock} un → <strong style={{ color: 'var(--accent-primary)', fontSize: '1rem' }}>{previewLocStock} un</strong>
                      </span>
                    </div>
                    <div className="cm-detail-row cm-edit">
                      <span className="cm-detail-label">Estoque Total Final</span>
                      <span className="cm-detail-value"><strong>📦 {previewTotalStock} un</strong></span>
                    </div>
                  </div>

                  <div className="cm-warning" style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#FDE68A' }}>
                    ⚠️ Confirma a atualização do estoque de <strong>{directItem.displayId}</strong> em <strong>{locLabel}</strong> para <strong>{previewLocStock} unidades</strong>?
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginTop: '4px' }}>
                    <button
                      type="button"
                      className="cm-btn-cancel"
                      onClick={() => setDirectStockModal(prev => ({ ...prev, step: 'input' }))}
                    >
                      ← Voltar
                    </button>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button type="button" className="cm-btn-cancel" onClick={closeDirectStockModal}>
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={handleDirectStockConfirm}
                        disabled={saving}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        {saving ? <Loader size={16} className="spin" /> : <Save size={16} />}
                        Confirmar e Salvar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Modal para escolher entre Estoque Galpão ou Estoque Casa */}
      {locationModal.isOpen && (
        <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && closeLocationModal()}>
          <div className="cm-modal cm-edit" style={{ maxWidth: '460px' }}>
            <div className="cm-header">
              <span className="cm-icon">📦</span>
              <div className="cm-title-block">
                <span className="cm-badge cm-edit">ESCOLHER ESTOQUE</span>
                <h3 className="cm-title">
                  {locationModal.mode === 'single'
                    ? 'Em qual estoque deseja aplicar?'
                    : `Aplicar ${batchKeys.length} ajuste(s) em qual estoque?`}
                </h3>
              </div>
              <button className="cm-close" onClick={closeLocationModal} aria-label="Fechar">×</button>
            </div>

            <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  className="stock-choice-btn galpao"
                  onClick={() => confirmAndSaveLocation('galpao')}
                >
                  <Warehouse size={20} />
                  <div>
                    <strong>Estoque Galpão</strong>
                    {activeModalItem && (
                      <span>Novo saldo: {calculateNewStock(activeModalItem.estoqueGalpao, activeModalAdj)} un</span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  className="stock-choice-btn casa"
                  onClick={() => confirmAndSaveLocation('casa')}
                >
                  <HomeIcon size={20} />
                  <div>
                    <strong>Estoque Casa</strong>
                    {activeModalItem && (
                      <span>Novo saldo: {calculateNewStock(activeModalItem.estoqueCasa, activeModalAdj)} un</span>
                    )}
                  </div>
                </button>
              </div>
              <button
                type="button"
                className="cm-btn-cancel"
                style={{ width: '100%', marginTop: '4px' }}
                onClick={closeLocationModal}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação para Zerar o Estoque */}
      {zeroModalOpen && (
        <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && setZeroModalOpen(false)}>
          <div className="cm-modal cm-delete" style={{ maxWidth: '480px' }}>
            <div className="cm-header">
              <span className="cm-icon">🧹</span>
              <div className="cm-title-block">
                <span className="cm-badge cm-delete">ZERAR ESTOQUE</span>
                <h3 className="cm-title">Qual estoque você deseja zerar?</h3>
              </div>
              <button className="cm-close" onClick={() => setZeroModalOpen(false)} aria-label="Fechar">×</button>
            </div>

            <div className="cm-warning">
              ⚠️ Esta ação definirá a quantidade dos produtos para <strong>0 (zero)</strong> no local selecionado. Use para iniciar uma nova contagem física.
            </div>

            <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <button
                  type="button"
                  className="stock-choice-btn galpao"
                  onClick={() => handleZeroStock('galpao')}
                >
                  <Warehouse size={20} />
                  <div>
                    <strong>Zerar Só Galpão</strong>
                    <span>Mantém o estoque de Casa</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="stock-choice-btn casa"
                  onClick={() => handleZeroStock('casa')}
                >
                  <HomeIcon size={20} />
                  <div>
                    <strong>Zerar Só Casa</strong>
                    <span>Mantém o estoque do Galpão</span>
                  </div>
                </button>
              </div>

              <button
                type="button"
                className="cm-btn-confirm cm-delete"
                style={{ width: '100%', padding: '12px', justifyContent: 'center' }}
                onClick={() => handleZeroStock('ambos')}
              >
                🗑️ Zerar AMBOS (Galpão e Casa = 0)
              </button>

              <button
                type="button"
                className="cm-btn-cancel"
                style={{ width: '100%' }}
                onClick={() => setZeroModalOpen(false)}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Fallback Manual: Colar URL de Retorno (?code=TG-...) */}
      {pasteUrlModalOpen && (
        <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && setPasteUrlModalOpen(false)}>
          <div className="cm-modal cm-edit" style={{ maxWidth: '500px' }}>
            <div className="cm-header">
              <span className="cm-icon">📋</span>
              <div className="cm-title-block">
                <span className="cm-badge cm-edit">AUTORIZAÇÃO MANUAL ML</span>
                <h3 className="cm-title">Colar URL de Retorno ou Código (?code=)</h3>
              </div>
              <button className="cm-close" onClick={() => setPasteUrlModalOpen(false)} aria-label="Fechar">×</button>
            </div>
            <div style={{ padding: '1rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                Se após autorizar no Mercado Livre você caiu em uma URL com <code>?code=TG-...</code> na barra de endereço, cole a URL inteira (ou apenas o código <code>TG-...</code>) abaixo:
              </p>
              <input
                type="text"
                className="adjustment-input"
                placeholder="Ex: https://seu-sistema.vercel.app/estoque?code=TG-6789..."
                value={pastedCodeInput}
                onChange={(e) => setPastedCodeInput(e.target.value)}
                autoFocus
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="cm-btn-cancel" onClick={() => setPasteUrlModalOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!pastedCodeInput.trim() || mlSyncing}
                  onClick={() => handleCompleteMlOAuth(pastedCodeInput)}
                >
                  {mlSyncing ? 'Autenticando...' : 'Concluir Conexão'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Configuração de Credenciais do App Mercado Livre */}
      {appConfigModalOpen && (
        <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && setAppConfigModalOpen(false)}>
          <div className="cm-modal cm-edit" style={{ maxWidth: '520px' }}>
            <div className="cm-header">
              <span className="cm-icon">⚙️</span>
              <div className="cm-title-block">
                <span className="cm-badge cm-edit">CREDENCIAIS DEVCENTER ML</span>
                <h3 className="cm-title">Configurar Aplicativo do Mercado Livre</h3>
              </div>
              <button className="cm-close" onClick={() => setAppConfigModalOpen(false)} aria-label="Fechar">×</button>
            </div>
            <div style={{ padding: '1rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                Informe o <strong>App ID (Client ID)</strong>, <strong>Secret Key</strong> e <strong>Redirect URI</strong> cadastrados em <code>developers.mercadolivre.com.br</code> (ou configure via <code>.env.local</code> / Vercel):
              </p>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>App ID (VITE_ML_CLIENT_ID)</label>
                <input
                  type="text"
                  className="adjustment-input"
                  value={appCredsForm.clientId}
                  onChange={(e) => setAppCredsForm((p) => ({ ...p, clientId: e.target.value }))}
                  placeholder="Ex: 1234567890123456"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>Secret Key (VITE_ML_CLIENT_SECRET)</label>
                <input
                  type="password"
                  className="adjustment-input"
                  value={appCredsForm.clientSecret}
                  onChange={(e) => setAppCredsForm((p) => ({ ...p, clientSecret: e.target.value }))}
                  placeholder="Chave secreta do aplicativo no DevCenter"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, marginBottom: '4px' }}>Redirect URI (VITE_ML_REDIRECT_URI)</label>
                <input
                  type="text"
                  className="adjustment-input"
                  value={appCredsForm.redirectUri}
                  onChange={(e) => setAppCredsForm((p) => ({ ...p, redirectUri: e.target.value }))}
                  placeholder="Ex: https://seu-dominio.vercel.app/estoque"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button type="button" className="cm-btn-cancel" onClick={() => setAppConfigModalOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    saveMlAppCredentialsLocal(appCredsForm);
                    setAppConfigModalOpen(false);
                  }}
                >
                  Salvar Credenciais
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Vínculo de 1ª Vez (Anúncios e Variações ML ↔ FTs e Variações FT + SKU) */}
      <MlFtMappingModal
        isOpen={mappingModal.isOpen}
        itemsToMap={mappingModal.items}
        ftsList={fts}
        empresaId={empresaId}
        onClose={() => setMappingModal({ isOpen: false, items: [] })}
        onSaved={async (updatedListings) => {
          setMappingModal({ isOpen: false, items: [] });
          setMlListings(updatedListings || []);
          await fetchEstoque();
        }}
      />
    </div>
  );
}
