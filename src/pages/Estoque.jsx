import { useState, useEffect } from 'react';
import { Package, Search, Save, Loader, AlertCircle, Warehouse, Home as HomeIcon, Trash2, Plus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import './Estoque.css';

const CHANNELS = [
  { id: 'ml', label: 'Mercado Livre', short: 'ML', icon: '📦', color: '#EAB308' },
  { id: 'amazon', label: 'Amazon', short: 'AMZ', icon: '🅰️', color: '#EA580C' },
  { id: 'shopee', label: 'Shopee', short: 'SHP', icon: '🛍️', color: '#EF4444' },
  { id: 'tiktok', label: 'TikTok', short: 'TTK', icon: '🎵', color: '#0F172A' },
  { id: 'site', label: 'Site Próprio', short: 'SITE', icon: '🌐', color: '#3B82F6' }
];

export default function Estoque() {
  const { session } = useAuth();
  const [fts, setFts] = useState([]);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAnunciados, setFilterAnunciados] = useState(false);
  const [adjustments, setAdjustments] = useState({});
  const [saving, setSaving] = useState(false);
  const [zeroModalOpen, setZeroModalOpen] = useState(false);

  // Modal de Variações
  const [varModal, setVarModal] = useState({
    isOpen: false,
    ftId: null,
    ftNome: '',
    isFirstVariation: false,
    firstName: '',
    newName: '',
  });

  // Ordenação clicando nos títulos (ID, Produto, Estoque Galpão, Estoque Casa, Estoque Total)
  const [sortField, setSortField] = useState('id'); // 'id' | 'nome' | 'galpao' | 'casa' | 'total'
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
    mode: 'single', // 'single' | 'batch'
    targetKey: null,
  });

  useEffect(() => {
    fetchEstoque();

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

  // Expande cada FT em linhas (se tiver variações, gera 1 linha por variação)
  const allRows = fts.flatMap(ft => {
    const activeChannels = getActiveChannelsForFt(ft.id);
    const isAnunciado = activeChannels.length > 0;

    if (ft.variacoes && ft.variacoes.length > 0) {
      return ft.variacoes.map((v, idx) => {
        const g = Number(v.estoqueGalpao || 0);
        const c = Number(v.estoqueCasa || 0);
        return {
          rowKey: `${ft.id}__var__${v.id}`,
          ftId: ft.id,
          varId: v.id,
          varIndex: idx,
          varNome: v.nome,
          displayId: `${ft.id} - ${v.nome}`,
          nome: ft.nome,
          estoqueGalpao: g,
          estoqueCasa: c,
          estoque: g + c,
          hasVariacoes: true,
          totalVariacoes: ft.variacoes.length,
          activeChannels,
          isAnunciado,
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
      displayId: ft.id,
      nome: ft.nome,
      estoqueGalpao: ft.estoqueGalpao,
      estoqueCasa: ft.estoqueCasa,
      estoque: ft.estoque,
      hasVariacoes: false,
      totalVariacoes: 0,
      activeChannels,
      isAnunciado,
      parentFt: ft
    }];
  });

  // Abrir modal de adicionar variação
  const handleOpenVarModal = (row) => {
    const ft = row.parentFt;
    const isFirst = !ft.variacoes || ft.variacoes.length === 0;
    setVarModal({
      isOpen: true,
      ftId: ft.id,
      ftNome: ft.nome,
      isFirstVariation: isFirst,
      firstName: '',
      newName: '',
    });
  };

  const closeVarModal = () => {
    setVarModal({
      isOpen: false,
      ftId: null,
      ftNome: '',
      isFirstVariation: false,
      firstName: '',
      newName: '',
    });
  };

  const handleSaveVariation = async () => {
    const { ftId, isFirstVariation, firstName, newName } = varModal;
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
            estoqueGalpao: baseGalpao,
            estoqueCasa: baseCasa
          },
          {
            id: `v_${Date.now()}_2`,
            nome: newName.trim(),
            estoqueGalpao: 0,
            estoqueCasa: 0
          }
        ];
      } else {
        nextVariacoes.push({
          id: `v_${Date.now()}`,
          nome: newName.trim(),
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

  const handleRenameVariation = async (ftId, varId, newNome) => {
    if (!newNome || !newNome.trim()) return;
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
        v.id === varId ? { ...v, nome: newNome.trim() } : v
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
      console.error('Erro ao renomear variação:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustmentChange = (rowKey, value) => {
    setAdjustments(prev => ({
      ...prev,
      [rowKey]: value
    }));
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

  const applyAdjustments = (rowKey) => {
    const adjustment = adjustments[rowKey];
    if (!adjustment || !String(adjustment).trim()) return;

    const item = allRows.find(r => r.rowKey === rowKey);
    if (!item) return;

    setLocationModal({
      isOpen: true,
      mode: 'single',
      targetKey: rowKey
    });
  };

  const openBatchConfirm = () => {
    const keys = Object.keys(adjustments).filter(k => adjustments[k] && String(adjustments[k]).trim() !== '');
    if (keys.length === 0) return;

    setLocationModal({
      isOpen: true,
      mode: 'batch',
      targetKey: null
    });
  };

  const closeLocationModal = () => {
    setLocationModal({ isOpen: false, mode: 'single', targetKey: null });
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
          } catch (e) {
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
        String(r.estoque).includes(term) ||
        r.activeChannels.some(c => c.label.toLowerCase().includes(term) || c.short.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => {
      // Fixa anunciados no topo quando ordenando por ID padrão ou sempre?
      // Vamos manter a ordenação escolhida pelo usuário, mas se empatar no ID, ordena pela variação
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
          <p className="page-description">Gerencie a quantidade física disponível das suas peças e variações no <strong>Galpão</strong> e em <strong>Casa</strong>.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
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

          <div className="search-bar" style={{ width: '280px' }}>
            <span className="search-icon"><Search size={18} /></span>
            <input
              type="text"
              placeholder="Buscar ID, variação, nome ou canal..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <button
            className="btn-primary"
            onClick={openBatchConfirm}
            disabled={saving || batchKeys.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {saving ? <Loader size={18} className="spin" /> : <Save size={18} />}
            Salvar Lote
          </button>
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
            <strong>Dica:</strong> Clique no botão <strong><code>+</code></strong> entre o ID e o nome do produto para cadastrar variações de estoque (ex: <code>FT-01 - Azul</code>). A coluna <strong>Anunciado (Mkt)</strong> exibe em quais plataformas o item está ativo à venda.
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
                    Produto {renderSortIcon('nome')}
                  </th>
                  <th
                    className={`sortable-th ${sortField === 'anunciados' ? 'active-sort' : ''}`}
                    style={{ width: '175px', textAlign: 'center' }}
                    onClick={() => handleSort('anunciados')}
                    title="Canais onde o produto está marcado como No Ar (clique para ordenar)"
                  >
                    Anunciado (Mkt) {renderSortIcon('anunciados')}
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
                  <th style={{ width: '150px' }}>Ajuste</th>
                  <th style={{ width: '165px', textAlign: 'center' }}>Novo Saldo</th>
                  <th style={{ width: '70px', textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length > 0 ? filteredRows.map(item => {
                  const adjustment = adjustments[item.rowKey] || '';
                  const isModified = String(adjustment).trim() !== '';
                  const newGalpao = calculateNewStock(item.estoqueGalpao, adjustment);
                  const newCasa = calculateNewStock(item.estoqueCasa, adjustment);
                  const totalItem = (item.estoqueGalpao || 0) + (item.estoqueCasa || 0);

                  return (
                    <tr
                      key={item.rowKey}
                      className={isModified ? 'row-modified' : ''}
                      style={item.isAnunciado && !isModified ? { backgroundColor: 'rgba(16, 185, 129, 0.03)' } : {}}
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
                        {item.nome}
                      </td>
                      <td style={{ textAlign: 'center' }}>
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
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="dual-stock-wrap">
                          <span className={`stock-badge stock-loc-badge ${item.estoqueGalpao <= 0 ? 'stock-zero' : 'stock-galpao'}`} title="Estoque no Galpão">
                            🏭 Galpão: {item.estoqueGalpao} un
                          </span>
                          <span className={`stock-badge stock-loc-badge ${item.estoqueCasa <= 0 ? 'stock-zero' : 'stock-casa'}`} title="Estoque em Casa">
                            🏠 Casa: {item.estoqueCasa} un
                          </span>
                          <span className={`stock-badge stock-loc-badge ${totalItem <= 0 ? 'stock-zero' : 'stock-total'}`} title="Estoque Total (Casa + Galpão)">
                            📦 Total: {totalItem} un
                          </span>
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="adjustment-input"
                          placeholder="ex: +5, -2, =10"
                          value={adjustment}
                          onChange={(e) => handleAdjustmentChange(item.rowKey, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') applyAdjustments(item.rowKey);
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: isModified ? 'var(--accent-primary)' : 'var(--text-secondary)', fontSize: '0.8rem' }}>
                        {isModified ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                            <span>🏭 se Galpão: {newGalpao} (Total: {newGalpao + item.estoqueCasa})</span>
                            <span>🏠 se Casa: {newCasa} (Total: {item.estoqueGalpao + newCasa})</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className={`btn-icon ${isModified ? 'btn-save-active' : ''}`}
                          disabled={!isModified || saving}
                          onClick={() => applyAdjustments(item.rowKey)}
                          title="Salvar ajuste"
                        >
                          <Save size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '2rem' }}>Nenhum produto encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de Cadastro e Gerenciamento de Variações */}
      {varModal.isOpen && (
        <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && closeVarModal()}>
          <div className="cm-modal cm-edit" style={{ maxWidth: '500px' }}>
            <div className="cm-header">
              <span className="cm-icon">🏷️</span>
              <div className="cm-title-block">
                <span className="cm-badge cm-edit">VARIAÇÕES DA FT</span>
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
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Nome da 1ª Variação (Principal) *
                    </label>
                    <input
                      type="text"
                      className="adjustment-input"
                      placeholder={`Ex: Padrão, Preto, Branca... (ficará ${varModal.ftId} - ...)`}
                      value={varModal.firstName}
                      onChange={e => setVarModal(prev => ({ ...prev, firstName: e.target.value }))}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Nome da 2ª Variação (Nova) *
                    </label>
                    <input
                      type="text"
                      className="adjustment-input"
                      placeholder={`Ex: Azul, Grande, Kit c/ 2... (ficará ${varModal.ftId} - ...)`}
                      value={varModal.newName}
                      onChange={e => setVarModal(prev => ({ ...prev, newName: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveVariation(); }}
                    />
                  </div>
                </>
              ) : (
                <>
                  {currentVarFt?.variacoes && currentVarFt.variacoes.length > 0 && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Variações já cadastradas ({currentVarFt.variacoes.length}):
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '4px' }}>
                        {currentVarFt.variacoes.map((v) => (
                          <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent-primary)', whiteSpace: 'nowrap' }}>
                              {varModal.ftId} -
                            </span>
                            <input
                              type="text"
                              defaultValue={v.nome}
                              onBlur={(e) => {
                                if (e.target.value.trim() && e.target.value.trim() !== v.nome) {
                                  handleRenameVariation(varModal.ftId, v.id, e.target.value);
                                }
                              }}
                              style={{ flex: 1, border: '1px solid transparent', background: 'transparent', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-primary)', padding: '2px 6px', borderRadius: '4px' }}
                              title="Clique para editar o nome da variação"
                            />
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
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

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                      Adicionar Nova Variação *
                    </label>
                    <input
                      type="text"
                      className="adjustment-input"
                      placeholder={`Nome da variação (ficará ${varModal.ftId} - ...)`}
                      value={varModal.newName}
                      onChange={e => setVarModal(prev => ({ ...prev, newName: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveVariation(); }}
                      autoFocus
                    />
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

            {locationModal.mode === 'single' && activeModalItem && (
              <div className="cm-details">
                <div className="cm-detail-row cm-edit">
                  <span className="cm-detail-label">Produto</span>
                  <span className="cm-detail-value">{activeModalItem.displayId} — {activeModalItem.nome}</span>
                </div>
                <div className="cm-detail-row cm-edit">
                  <span className="cm-detail-label">Ajuste Informado</span>
                  <span className="cm-detail-value">{activeModalAdj}</span>
                </div>
                <div className="cm-detail-row cm-edit">
                  <span className="cm-detail-label">Se escolher 🏭 Galpão</span>
                  <span className="cm-detail-value">
                    {activeModalItem.estoqueGalpao} un → <strong>{calculateNewStock(activeModalItem.estoqueGalpao, activeModalAdj)} un</strong> (Total: {calculateNewStock(activeModalItem.estoqueGalpao, activeModalAdj) + activeModalItem.estoqueCasa} un)
                  </span>
                </div>
                <div className="cm-detail-row cm-edit">
                  <span className="cm-detail-label">Se escolher 🏠 Casa</span>
                  <span className="cm-detail-value">
                    {activeModalItem.estoqueCasa} un → <strong>{calculateNewStock(activeModalItem.estoqueCasa, activeModalAdj)} un</strong> (Total: {activeModalItem.estoqueGalpao + calculateNewStock(activeModalItem.estoqueCasa, activeModalAdj)} un)
                  </span>
                </div>
              </div>
            )}

            {locationModal.mode === 'batch' && (
              <div className="cm-details" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                {batchKeys.map(key => {
                  const it = allRows.find(r => r.rowKey === key);
                  const adj = adjustments[key];
                  return (
                    <div key={key} className="cm-detail-row cm-edit">
                      <span className="cm-detail-label">{it ? `${it.displayId} - ${it.nome}` : key} ({adj})</span>
                      <span className="cm-detail-value" style={{ fontSize: '0.8rem' }}>
                        🏭 {it?.estoqueGalpao ?? 0}→{calculateNewStock(it?.estoqueGalpao ?? 0, adj)} | 🏠 {it?.estoqueCasa ?? 0}→{calculateNewStock(it?.estoqueCasa ?? 0, adj)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.88rem', color: 'var(--text-secondary)', textAlign: 'center', fontWeight: 600 }}>
                Selecione o destino do ajuste de estoque:
              </p>
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

            <div className="cm-details">
              <div className="cm-detail-row cm-delete">
                <span className="cm-detail-label">Total de Produtos</span>
                <span className="cm-detail-value">{fts.length} itens cadastrados</span>
              </div>
              <div className="cm-detail-row cm-delete">
                <span className="cm-detail-label">Pedidos e Consignados</span>
                <span className="cm-detail-value" style={{ color: '#059669', fontWeight: 700 }}>
                  ✅ Não serão afetados
                </span>
              </div>
            </div>

            <div className="cm-warning">
              ⚠️ Escolha abaixo se deseja zerar apenas o <strong>Galpão</strong>, apenas a <strong>Casa</strong> ou <strong>Ambos (Tudo = 0)</strong>.
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
                    <span>Casa permanece intacto</span>
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
                    <span>Galpão permanece intacto</span>
                  </div>
                </button>
              </div>
              <button
                type="button"
                className="cm-btn-confirm cm-delete"
                style={{ width: '100%', padding: '12px', fontSize: '0.95rem', justifyContent: 'center' }}
                onClick={() => handleZeroStock('ambos')}
              >
                🧹 Zerar AMBOS (Galpão = 0 e Casa = 0)
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
    </div>
  );
}
