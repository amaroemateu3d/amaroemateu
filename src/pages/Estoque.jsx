import { useState, useEffect } from 'react';
import { Package, Search, Save, Loader, AlertCircle, Warehouse, Home as HomeIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import './Estoque.css';

export default function Estoque() {
  const { session } = useAuth();
  const [fts, setFts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [adjustments, setAdjustments] = useState({});
  const [saving, setSaving] = useState(false);

  // Modal de confirmação com escolha de local (Galpão ou Casa)
  const [locationModal, setLocationModal] = useState({
    isOpen: false,
    mode: 'single', // 'single' | 'batch'
    targetId: null,
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

      const resp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=id,data,estoque&order=id.asc`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        const cleanFts = data.map(r => {
          const rawData = r.data || {};
          const hasDualStock = rawData.estoqueGalpao !== undefined || rawData.estoqueCasa !== undefined;
          const estoqueGalpao = hasDualStock ? Number(rawData.estoqueGalpao || 0) : Number(r.estoque || 0);
          const estoqueCasa = hasDualStock ? Number(rawData.estoqueCasa || 0) : 0;
          return {
            id: r.id,
            nome: rawData.nomePeca || 'Produto sem nome',
            estoqueGalpao,
            estoqueCasa,
            estoque: estoqueGalpao + estoqueCasa,
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

  const handleAdjustmentChange = (id, value) => {
    setAdjustments(prev => ({
      ...prev,
      [id]: value
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

  const applyAdjustments = (id) => {
    const adjustment = adjustments[id];
    if (!adjustment || !String(adjustment).trim()) return;

    const item = fts.find(f => f.id === id);
    if (!item) return;

    setLocationModal({
      isOpen: true,
      mode: 'single',
      targetId: id
    });
  };

  const openBatchConfirm = () => {
    const keys = Object.keys(adjustments).filter(k => adjustments[k] && String(adjustments[k]).trim() !== '');
    if (keys.length === 0) return;

    setLocationModal({
      isOpen: true,
      mode: 'batch',
      targetId: null
    });
  };

  const closeLocationModal = () => {
    setLocationModal({ isOpen: false, mode: 'single', targetId: null });
  };

  const updateSingleItemInSupabase = async (item, location, adjustmentStr) => {
    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Busca versão mais recente do item no banco para não perder nada em data
    const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${item.id}&select=data,estoque`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });

    let currentData = item.rawData || {};
    let fallbackEstoque = item.estoque || 0;
    if (getResp.ok) {
      const rows = await getResp.json();
      if (rows && rows[0]) {
        currentData = rows[0].data || currentData;
        fallbackEstoque = rows[0].estoque ?? fallbackEstoque;
      }
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

    const resp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${item.id}`, {
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

    return { galpao, casa, totalEstoque, newData };
  };

  const confirmAndSaveLocation = async (location) => {
    const { mode, targetId } = locationModal;
    closeLocationModal();

    if (mode === 'single' && targetId) {
      const item = fts.find(f => f.id === targetId);
      const adjustment = adjustments[targetId];
      if (!item || !adjustment) return;

      setSaving(true);
      try {
        const { galpao, casa, totalEstoque, newData } = await updateSingleItemInSupabase(item, location, adjustment);

        setFts(prev => prev.map(f => f.id === targetId ? {
          ...f,
          estoqueGalpao: galpao,
          estoqueCasa: casa,
          estoque: totalEstoque,
          rawData: newData
        } : f));

        setAdjustments(prev => {
          const next = { ...prev };
          delete next[targetId];
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

      for (const id of keys) {
        const adjustment = adjustments[id];
        const item = fts.find(f => f.id === id);
        if (item) {
          try {
            const { galpao, casa, totalEstoque, newData } = await updateSingleItemInSupabase(item, location, adjustment);
            setFts(prev => prev.map(f => f.id === id ? {
              ...f,
              estoqueGalpao: galpao,
              estoqueCasa: casa,
              estoque: totalEstoque,
              rawData: newData
            } : f));
          } catch (e) {
            errorCount++;
          }
        }
      }

      if (errorCount > 0) alert(`Houve erro ao salvar ${errorCount} itens.`);
      setAdjustments({});
      setSaving(false);
    }
  };

  const filteredFts = fts.filter(f =>
    f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Dados para exibir no modal de escolha de estoque
  const activeModalItem = locationModal.mode === 'single' && locationModal.targetId
    ? fts.find(f => f.id === locationModal.targetId)
    : null;
  const activeModalAdj = locationModal.mode === 'single' && locationModal.targetId
    ? adjustments[locationModal.targetId]
    : '';
  const batchKeys = Object.keys(adjustments).filter(k => adjustments[k] && String(adjustments[k]).trim() !== '');

  return (
    <div className="page-wrapper estoque-page">
      <div className="estoque-header">
        <div>
          <h1 className="page-title"><Package size={28} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }} />Controle de Estoque</h1>
          <p className="page-description">Gerencie a quantidade física disponível das suas peças no <strong>Galpão</strong> e em <strong>Casa</strong>.</p>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <div className="search-bar" style={{ width: '300px' }}>
            <span className="search-icon"><Search size={18} /></span>
            <input
              type="text"
              placeholder="Buscar por ID ou Nome..."
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
        </div>
      </div>

      <div className="card">
        <div className="alert alert-info" style={{ marginBottom: '1.5rem', display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '12px 16px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
          <AlertCircle size={20} />
          <div>
            <strong>Dica de Ajuste:</strong> Digite um número para somar/subtrair (ex: <code>5</code>, <code>-2</code>) ou use <code>=</code> para definir um valor exato (ex: <code>=10</code>). Pressione <strong>Enter</strong> ou clique no botão de salvar e escolha se o ajuste vai para o <strong>Galpão</strong> ou <strong>Casa</strong>.
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
                  <th style={{ width: '90px' }}>ID</th>
                  <th>Produto</th>
                  <th style={{ width: '280px', textAlign: 'center' }}>Em Estoque (Galpão / Casa)</th>
                  <th style={{ width: '180px' }}>Ajuste</th>
                  <th style={{ width: '170px', textAlign: 'center' }}>Novo Saldo</th>
                  <th style={{ width: '90px', textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filteredFts.length > 0 ? filteredFts.map(item => {
                  const adjustment = adjustments[item.id] || '';
                  const isModified = String(adjustment).trim() !== '';
                  const newGalpao = calculateNewStock(item.estoqueGalpao, adjustment);
                  const newCasa = calculateNewStock(item.estoqueCasa, adjustment);

                  return (
                    <tr key={item.id} className={isModified ? 'row-modified' : ''}>
                      <td><span className="badge">{item.id}</span></td>
                      <td style={{ fontWeight: '500' }}>{item.nome}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="dual-stock-wrap">
                          <span className={`stock-badge stock-loc-badge ${item.estoqueGalpao <= 0 ? 'stock-zero' : 'stock-galpao'}`} title="Estoque no Galpão">
                            🏭 Galpão: {item.estoqueGalpao} un
                          </span>
                          <span className={`stock-badge stock-loc-badge ${item.estoqueCasa <= 0 ? 'stock-zero' : 'stock-casa'}`} title="Estoque em Casa">
                            🏠 Casa: {item.estoqueCasa} un
                          </span>
                        </div>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="adjustment-input"
                          placeholder="ex: +5, -2, =10"
                          value={adjustment}
                          onChange={(e) => handleAdjustmentChange(item.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') applyAdjustments(item.id);
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: isModified ? 'var(--accent-primary)' : 'var(--text-secondary)', fontSize: '0.82rem' }}>
                        {isModified ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center' }}>
                            <span>🏭 Galpão: {newGalpao} un</span>
                            <span>🏠 Casa: {newCasa} un</span>
                          </div>
                        ) : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className={`btn-icon ${isModified ? 'btn-save-active' : ''}`}
                          disabled={!isModified || saving}
                          onClick={() => applyAdjustments(item.id)}
                          title="Salvar ajuste"
                        >
                          <Save size={18} />
                        </button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Nenhum produto encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                  <span className="cm-detail-value">{activeModalItem.id} - {activeModalItem.nome}</span>
                </div>
                <div className="cm-detail-row cm-edit">
                  <span className="cm-detail-label">Ajuste Informado</span>
                  <span className="cm-detail-value">{activeModalAdj}</span>
                </div>
                <div className="cm-detail-row cm-edit">
                  <span className="cm-detail-label">Se escolher 🏭 Galpão</span>
                  <span className="cm-detail-value">
                    {activeModalItem.estoqueGalpao} un → <strong>{calculateNewStock(activeModalItem.estoqueGalpao, activeModalAdj)} un</strong>
                  </span>
                </div>
                <div className="cm-detail-row cm-edit">
                  <span className="cm-detail-label">Se escolher 🏠 Casa</span>
                  <span className="cm-detail-value">
                    {activeModalItem.estoqueCasa} un → <strong>{calculateNewStock(activeModalItem.estoqueCasa, activeModalAdj)} un</strong>
                  </span>
                </div>
              </div>
            )}

            {locationModal.mode === 'batch' && (
              <div className="cm-details" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                {batchKeys.map(id => {
                  const it = fts.find(f => f.id === id);
                  const adj = adjustments[id];
                  return (
                    <div key={id} className="cm-detail-row cm-edit">
                      <span className="cm-detail-label">{it?.nome || id} ({adj})</span>
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
    </div>
  );
}
