import { useState, useMemo } from 'react';
import {
  Search, RefreshCw, Link2, ExternalLink, PauseCircle, PlayCircle,
  Settings, ChevronDown, ChevronRight, CheckCircle2, AlertCircle, Loader, Unplug
} from 'lucide-react';
import { buildFtCatalogOptions } from '../../services/mercadolivre';

export default function ShopeeEstoquePanel({
  token,
  listings = [],
  syncing,
  ftsList = [],
  onStartConnect,
  onOpenPasteModal,
  onOpenConfigModal,
  onDisconnect,
  onSyncListings,
  onOpenMappingModal,
  onUpdateStock,
  onUpdateStatus,
  onDirectRowFtSelect
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'paused' | 'unmapped'
  const [expandedItems, setExpandedItems] = useState({});
  const [stockEdits, setStockEdits] = useState({});
  const [updatingKey, setUpdatingKey] = useState(null);

  const ftCatalogOptions = useMemo(() => buildFtCatalogOptions(ftsList), [ftsList]);

  // Mapeamento rápido de FTs para busca de estoque físico
  const ftsMap = useMemo(() => {
    const map = new Map();
    ftsList.forEach((ft) => {
      map.set(String(ft.id), ft);
    });
    return map;
  }, [ftsList]);

  const resolvePhysicalStock = (ftTargetKey) => {
    if (!ftTargetKey || ftTargetKey === '__IGNORED__') {
      return { total: 0, galpao: 0, casa: 0, isLinked: false, label: null };
    }
    const isVarKey = ftTargetKey.includes('__var__');
    const ftId = isVarKey ? ftTargetKey.split('__var__')[0] : ftTargetKey;
    const varId = isVarKey ? ftTargetKey.split('__var__')[1] : null;

    const ft = ftsMap.get(String(ftId));
    if (!ft) return { total: 0, galpao: 0, casa: 0, isLinked: false, label: null };

    if (varId && Array.isArray(ft.variacoes)) {
      const v = ft.variacoes.find((item) => String(item.id) === String(varId));
      if (v) {
        const galpao = Number(v.estoqueGalpao || 0);
        const casa = Number(v.estoqueCasa || 0);
        return {
          total: galpao + casa,
          galpao,
          casa,
          isLinked: true,
          label: `${ftId} - ${v.nome}`
        };
      }
    }

    return {
      total: Number(ft.estoque || 0),
      galpao: Number(ft.estoqueGalpao || 0),
      casa: Number(ft.estoqueCasa || 0),
      isLinked: true,
      label: `${ftId} — ${ft.nome}`
    };
  };

  const toggleExpand = (itemId) => {
    setExpandedItems((prev) => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const handleStockInputChange = (key, val) => {
    setStockEdits((prev) => ({ ...prev, [key]: val }));
  };

  const handleSaveStock = async (listing, newQty, modelId = 0) => {
    const key = `${listing.ml_item_id}_${modelId}`;
    setUpdatingKey(key);
    try {
      await onUpdateStock({
        itemId: listing.ml_item_id,
        modelId,
        availableQuantity: Number(newQty)
      });
      setStockEdits((prev) => {
        const copy = { ...prev };
        delete copy[key];
        return copy;
      });
    } catch (err) {
      alert('Erro ao atualizar estoque na Shopee: ' + (err?.message || String(err)));
    } finally {
      setUpdatingKey(null);
    }
  };

  const unmappedCount = useMemo(() => {
    return listings.filter((l) => {
      if (!l.ft_id) return true;
      if (Array.isArray(l.variations) && l.variations.some((v) => !v.ft_id)) return true;
      return false;
    }).length;
  }, [listings]);

  const activeCount = useMemo(() => listings.filter((l) => l.status === 'active').length, [listings]);
  const pausedCount = useMemo(() => listings.filter((l) => l.status === 'paused').length, [listings]);

  const filteredListings = useMemo(() => {
    return listings.filter((item) => {
      if (statusFilter === 'active' && item.status !== 'active') return false;
      if (statusFilter === 'paused' && item.status !== 'paused') return false;
      if (statusFilter === 'unmapped') {
        const isUnmapped = !item.ft_id || (Array.isArray(item.variations) && item.variations.some((v) => !v.ft_id));
        if (!isUnmapped) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const titleMatch = String(item.title || '').toLowerCase().includes(q);
        const skuMatch = String(item.sku || '').toLowerCase().includes(q);
        const idMatch = String(item.ml_item_id || '').toLowerCase().includes(q);
        const ftMatch = String(item.ft_id || '').toLowerCase().includes(q);
        const varMatch = Array.isArray(item.variations) && item.variations.some(
          (v) => String(v.sku || '').toLowerCase().includes(q) || String(v.label || v.name || '').toLowerCase().includes(q)
        );
        return titleMatch || skuMatch || idMatch || ftMatch || varMatch;
      }
      return true;
    });
  }, [listings, statusFilter, searchTerm]);

  return (
    <div>
      {/* Banner de Conexão com a Loja Shopee */}
      <div className="shopee-connection-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: '#EE4D2D',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              boxShadow: '0 2px 8px rgba(238,77,45,0.3)',
              color: 'white'
            }}
          >
            🛍️
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: '1.05rem', color: '#9A3412' }}>
                Integração Oficial Shopee Open Platform v2
              </strong>
              {token?.access_token ? (
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
                  ● CONECTADO {token.ml_nickname ? `(${token.ml_nickname})` : `Shop ID ${token.ml_user_id}`}
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
            <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#7C2D12' }}>
              {token?.access_token
                ? 'Sincronize seus anúncios, modelos, variações e envie atualizações de estoque diretamente para a Shopee.'
                : 'Conecte sua loja de vendedor da Shopee para importar produtos, variações, SKUs e sincronizar estoques.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {token?.access_token ? (
            <>
              <button
                type="button"
                onClick={onSyncListings}
                disabled={syncing}
                style={{
                  padding: '0.55rem 1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#EE4D2D',
                  color: '#FFFFFF',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(238,77,45,0.25)'
                }}
              >
                <RefreshCw size={15} className={syncing ? 'spin' : ''} />
                {syncing ? 'Sincronizando...' : 'Sincronizar Anúncios Shopee'}
              </button>

              <button
                type="button"
                onClick={onDisconnect}
                style={{
                  padding: '0.55rem 0.85rem',
                  borderRadius: '8px',
                  border: '1px solid #FCA5A5',
                  background: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
                title="Desconectar loja Shopee deste sistema"
              >
                <Unplug size={14} /> Desconectar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onStartConnect}
                style={{
                  padding: '0.55rem 1.1rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#EE4D2D',
                  color: '#FFFFFF',
                  fontSize: '0.88rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 6px rgba(238,77,45,0.3)'
                }}
              >
                🛍️ Conectar Loja Shopee
              </button>

              <button
                type="button"
                onClick={onOpenPasteModal}
                style={{
                  padding: '0.55rem 0.9rem',
                  borderRadius: '8px',
                  border: '1px solid #EA580C',
                  background: '#FFF7ED',
                  color: '#C2410C',
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                <Link2 size={14} /> Colar Código / URL
              </button>
            </>
          )}

          <button
            type="button"
            onClick={onOpenConfigModal}
            style={{
              padding: '0.55rem 0.85rem',
              borderRadius: '8px',
              border: '1px solid #FED7AA',
              background: '#FFFFFF',
              color: '#9A3412',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px'
            }}
            title="Configurar credenciais da API Shopee (Partner ID / Key)"
          >
            <Settings size={14} /> App Shopee
          </button>
        </div>
      </div>

      {/* Barra de Filtros e Busca */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="estoque-tabs-bar" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`estoque-tab-btn ${statusFilter === 'all' ? 'active-shopee' : ''}`}
              onClick={() => setStatusFilter('all')}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              Todos ({listings.length})
            </button>
            <button
              type="button"
              className={`estoque-tab-btn ${statusFilter === 'active' ? 'active-shopee' : ''}`}
              onClick={() => setStatusFilter('active')}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              Ativos ({activeCount})
            </button>
            <button
              type="button"
              className={`estoque-tab-btn ${statusFilter === 'paused' ? 'active-shopee' : ''}`}
              onClick={() => setStatusFilter('paused')}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              Pausados ({pausedCount})
            </button>
            <button
              type="button"
              className={`estoque-tab-btn ${statusFilter === 'unmapped' ? 'active-shopee' : ''}`}
              onClick={() => setStatusFilter('unmapped')}
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              Sem Vínculo FT ({unmappedCount})
            </button>
          </div>

          {listings.length > 0 && (
            <button
              type="button"
              onClick={onOpenMappingModal}
              style={{
                padding: '0.5rem 0.95rem',
                borderRadius: '8px',
                border: '1px solid #EA580C',
                background: '#FFF7ED',
                color: '#C2410C',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Link2 size={14} /> Vincular com FTs ({unmappedCount} pendentes)
            </button>
          )}
        </div>

        <div className="search-bar" style={{ width: '280px' }}>
          <span className="search-icon"><Search size={18} /></span>
          <input
            type="text"
            placeholder="Buscar anúncio Shopee, SKU, ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Tabela de Anúncios Shopee */}
      {listings.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3.5rem 1rem', background: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
          <span style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem' }}>🛍️</span>
          <h3 style={{ margin: '0 0 0.5rem 0' }}>Nenhum anúncio da Shopee carregado ainda</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', maxWidth: '480px', margin: '0 auto 1.2rem' }}>
            {token?.access_token
              ? 'Sua loja está conectada! Clique no botão abaixo para buscar seus anúncios e variações na API v2 da Shopee.'
              : 'Conecte sua conta de vendedor da Shopee para sincronizar anúncios, controlar estoques e mapear com suas Fichas Técnicas.'}
          </p>
          {token?.access_token ? (
            <button
              type="button"
              className="btn-primary"
              onClick={onSyncListings}
              disabled={syncing}
              style={{ background: '#EE4D2D', borderColor: '#EA580C', color: '#FFFFFF', padding: '0.65rem 1.4rem', fontWeight: 800 }}
            >
              <RefreshCw size={16} className={syncing ? 'spin' : ''} />
              {syncing ? 'Buscando Anúncios...' : 'Buscar Anúncios na Shopee'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={onStartConnect}
              style={{ background: '#EE4D2D', borderColor: '#EA580C', color: '#FFFFFF', padding: '0.65rem 1.4rem', fontWeight: 800 }}
            >
              🛍️ Conectar Conta Shopee
            </button>
          )}
        </div>
      ) : (
        <div className="table-responsive">
          <table className="estoque-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>Status</th>
                <th style={{ minWidth: '280px' }}>Foto & Título na Shopee</th>
                <th style={{ width: '130px' }}>ID Shopee / SKU</th>
                <th style={{ width: '180px', textAlign: 'center' }}>Vínculo FT AM3D</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Preço Venda</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Estoque Físico</th>
                <th style={{ width: '160px', textAlign: 'center' }}>Estoque Shopee</th>
                <th style={{ width: '50px', textAlign: 'center' }}>Link</th>
              </tr>
            </thead>
            <tbody>
              {filteredListings.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    Nenhum anúncio encontrado com os filtros selecionados.
                  </td>
                </tr>
              ) : (
                filteredListings.flatMap((listing) => {
                  const hasVars = Array.isArray(listing.variations) && listing.variations.length > 0;
                  const isExpanded = Boolean(expandedItems[listing.ml_item_id]);
                  const physStock = resolvePhysicalStock(listing.ft_id);
                  const isPaused = listing.status === 'paused';

                  const rootKey = `${listing.ml_item_id}_0`;
                  const editVal = stockEdits[rootKey] !== undefined ? stockEdits[rootKey] : listing.stock_ml;

                  const rows = [
                    <tr key={listing.ml_item_id} style={{ background: isPaused ? 'rgba(0,0,0,0.02)' : undefined }}>
                      {/* Status */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => onUpdateStatus(listing, isPaused ? 'active' : 'paused')}
                          disabled={updatingKey === `${listing.ml_item_id}_status`}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: isPaused ? '#DC2626' : '#16A34A',
                            padding: '4px'
                          }}
                          title={isPaused ? 'Anúncio Pausado na Shopee (clique para Ativar)' : 'Anúncio Ativo na Shopee (clique para Pausar)'}
                        >
                          {isPaused ? <PauseCircle size={20} /> : <PlayCircle size={20} />}
                        </button>
                      </td>

                      {/* Foto & Título */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {hasVars && (
                            <button
                              type="button"
                              onClick={() => toggleExpand(listing.ml_item_id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '2px',
                                color: 'var(--text-secondary)'
                              }}
                              title={isExpanded ? 'Recolher variações' : 'Expandir variações'}
                            >
                              {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                            </button>
                          )}
                          {listing.thumbnail_url ? (
                            <img
                              src={listing.thumbnail_url}
                              alt={listing.title}
                              style={{ width: '40px', height: '40px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)' }}
                            />
                          ) : (
                            <div style={{ width: '40px', height: '40px', borderRadius: '6px', background: '#FFEDD5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>
                              🛍️
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.88rem', color: isPaused ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                              {listing.title}
                            </div>
                            {hasVars && (
                              <span style={{ fontSize: '0.72rem', color: '#EA580C', fontWeight: 700 }}>
                                {listing.variations.length} variações / modelos
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* ID Shopee / SKU */}
                      <td>
                        <div style={{ fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                          ID: {listing.ml_item_id}
                        </div>
                        {listing.sku && (
                          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--accent-primary)' }}>
                            SKU: {listing.sku}
                          </div>
                        )}
                      </td>

                      {/* Vínculo FT */}
                      <td style={{ textAlign: 'center' }}>
                        {hasVars ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            (Ver variações)
                          </span>
                        ) : (
                          <select
                            value={listing.ft_id || ''}
                            onChange={(e) => onDirectRowFtSelect(listing, null, e.target.value)}
                            style={{
                              width: '100%',
                              padding: '0.35rem 0.5rem',
                              borderRadius: '7px',
                              border: `1px solid ${listing.ft_id ? '#10B981' : 'var(--border-color)'}`,
                              background: listing.ft_id ? 'rgba(16,185,129,0.08)' : 'var(--bg-surface)',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              color: 'var(--text-primary)'
                            }}
                          >
                            <option value="">-- Vincular FT --</option>
                            {ftCatalogOptions.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                            <option value="__IGNORED__">🚫 Ignorar</option>
                          </select>
                        )}
                      </td>

                      {/* Preço */}
                      <td style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 700 }}>
                        {listing.price_promo ? (
                          <>
                            <div style={{ textDecoration: 'line-through', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                              R$ {Number(listing.price).toFixed(2)}
                            </div>
                            <div style={{ color: '#16A34A' }}>
                              R$ {Number(listing.price_promo).toFixed(2)}
                            </div>
                          </>
                        ) : (
                          <div>R$ {Number(listing.price || 0).toFixed(2)}</div>
                        )}
                      </td>

                      {/* Estoque Físico */}
                      <td style={{ textAlign: 'center', fontWeight: 700 }}>
                        {physStock.isLinked ? (
                          <span style={{ fontSize: '0.85rem' }}>
                            {physStock.total} un
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)', opacity: 0.5 }}>—</span>
                        )}
                      </td>

                      {/* Estoque Shopee */}
                      <td style={{ textAlign: 'center' }}>
                        {hasVars ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            (Total: {listing.stock_ml} un)
                          </span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                            <input
                              type="number"
                              min="0"
                              value={editVal}
                              onChange={(e) => handleStockInputChange(rootKey, e.target.value)}
                              style={{
                                width: '55px',
                                textAlign: 'center',
                                padding: '3px 4px',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                fontSize: '0.82rem',
                                fontWeight: 700
                              }}
                            />
                            <button
                              type="button"
                              className="btn-primary"
                              disabled={updatingKey === rootKey || Number(editVal) === Number(listing.stock_ml)}
                              onClick={() => handleSaveStock(listing, editVal, 0)}
                              style={{
                                background: '#EE4D2D',
                                borderColor: '#EA580C',
                                color: '#FFFFFF',
                                padding: '3px 8px',
                                fontSize: '0.74rem',
                                borderRadius: '4px'
                              }}
                            >
                              {updatingKey === rootKey ? '...' : 'Salvar'}
                            </button>
                            {physStock.isLinked && physStock.total !== Number(listing.stock_ml) && (
                              <button
                                type="button"
                                onClick={() => handleSaveStock(listing, physStock.total, 0)}
                                disabled={updatingKey === rootKey}
                                style={{
                                  padding: '3px 6px',
                                  fontSize: '0.7rem',
                                  borderRadius: '4px',
                                  background: '#FFEDD5',
                                  color: '#9A3412',
                                  border: '1px solid #FDBA74',
                                  fontWeight: 800,
                                  cursor: 'pointer'
                                }}
                                title={`Igualar estoque na Shopee ao saldo físico (${physStock.total} un)`}
                              >
                                ={physStock.total}
                              </button>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Ações */}
                      <td style={{ textAlign: 'center' }}>
                        <a
                          href={listing.permalink}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: 'var(--text-secondary)', display: 'inline-block', padding: '4px' }}
                          title="Abrir página do produto na Shopee"
                        >
                          <ExternalLink size={16} />
                        </a>
                      </td>
                    </tr>
                  ];

                  // Sub-linhas das variações quando expandido
                  if (hasVars && isExpanded) {
                    listing.variations.forEach((v) => {
                      const vIdStr = String(v.id || v.model_id);
                      const varKey = `${listing.ml_item_id}_${vIdStr}`;
                      const varEditVal = stockEdits[varKey] !== undefined ? stockEdits[varKey] : v.stock_ml;
                      const varPhys = resolvePhysicalStock(v.ft_id || listing.ft_id);

                      rows.push(
                        <tr key={varKey} style={{ background: 'rgba(255, 237, 213, 0.25)' }}>
                          <td style={{ textAlign: 'center', color: '#EA580C', fontSize: '0.75rem' }}>
                            ↳
                          </td>

                          <td style={{ paddingLeft: '2.5rem' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.83rem', color: '#9A3412' }}>
                              {v.label || v.name || `Variação ${vIdStr}`}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              Model ID: {vIdStr}
                            </span>
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

                          <td>
                            <select
                              value={v.ft_id || ''}
                              onChange={(e) => onDirectRowFtSelect(listing, vIdStr, e.target.value)}
                              style={{
                                width: '100%',
                                padding: '0.35rem 0.5rem',
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

                          <td style={{ textAlign: 'center', fontSize: '0.82rem', fontWeight: 600 }}>
                            R$ {Number(v.price || listing.price || 0).toFixed(2)}
                          </td>

                          <td style={{ textAlign: 'center', fontWeight: 700 }}>
                            {varPhys.isLinked ? (
                              <span style={{ fontSize: '0.82rem' }}>
                                {varPhys.total} un
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Sem FT</span>
                            )}
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                              <input
                                type="number"
                                min="0"
                                value={varEditVal}
                                onChange={(e) => handleStockInputChange(varKey, e.target.value)}
                                style={{
                                  width: '55px',
                                  textAlign: 'center',
                                  padding: '3px 4px',
                                  borderRadius: '4px',
                                  border: '1px solid var(--border-color)',
                                  fontSize: '0.82rem',
                                  fontWeight: 700
                                }}
                              />
                              <button
                                type="button"
                                className="btn-primary"
                                disabled={updatingKey === varKey || Number(varEditVal) === Number(v.stock_ml)}
                                onClick={() => handleSaveStock(listing, varEditVal, v.id || v.model_id)}
                                style={{
                                  background: '#EE4D2D',
                                  borderColor: '#EA580C',
                                  color: '#FFFFFF',
                                  padding: '3px 8px',
                                  fontSize: '0.74rem',
                                  borderRadius: '4px'
                                }}
                              >
                                {updatingKey === varKey ? '...' : 'Salvar'}
                              </button>
                              {varPhys.isLinked && varPhys.total !== Number(v.stock_ml) && (
                                <button
                                  type="button"
                                  onClick={() => handleSaveStock(listing, varPhys.total, v.id || v.model_id)}
                                  disabled={updatingKey === varKey}
                                  style={{
                                    padding: '3px 6px',
                                    fontSize: '0.7rem',
                                    borderRadius: '4px',
                                    background: '#FFEDD5',
                                    color: '#9A3412',
                                    border: '1px solid #FDBA74',
                                    fontWeight: 800,
                                    cursor: 'pointer'
                                  }}
                                  title={`Igualar estoque da variação na Shopee ao saldo físico (${varPhys.total} un)`}
                                >
                                  ={varPhys.total}
                                </button>
                              )}
                            </div>
                          </td>

                          <td style={{ textAlign: 'center', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                            Var
                          </td>
                        </tr>
                      );
                    });
                  }

                  return rows;
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
