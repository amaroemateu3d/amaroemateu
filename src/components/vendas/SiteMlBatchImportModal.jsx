import { useState, useEffect, useMemo } from 'react';
import { RefreshCw, Search, Download } from 'lucide-react';

export default function SiteMlBatchImportModal({
  isOpen,
  onClose,
  mlListings = [],
  savedFts = [],
  siteOverrides = {},
  onSyncMlList,
  syncingMlList = false,
  onRunBatchImport,
  batchStatus = null,
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // 'active' | 'all'
  const [overwriteExisting, setOverwriteExisting] = useState(true);
  const [assignments, setAssignments] = useState({}); // ml_item_id -> ftId
  const [checkedIds, setCheckedIds] = useState({}); // ml_item_id -> boolean

  // Inicializa mapeamentos com os vínculos já salvos em marketplace_listings
  useEffect(() => {
    if (!isOpen) return;
    const initAssign = {};
    const initCheck = {};
    mlListings.forEach((l) => {
      let baseFt = l.ft_id ? String(l.ft_id).split('__var__')[0] : '';
      if (!baseFt && Array.isArray(l.variations)) {
        const vWithFt = l.variations.find((v) => v.ft_id);
        if (vWithFt) baseFt = String(vWithFt.ft_id).split('__var__')[0];
      }
      if (baseFt && baseFt !== '__IGNORED__') {
        initAssign[l.ml_item_id] = baseFt;
        initCheck[l.ml_item_id] = l.status === 'active';
      }
    });
    setAssignments(initAssign);
    setCheckedIds(initCheck);
  }, [isOpen, mlListings]);

  const sortedFts = useMemo(() => {
    return [...savedFts].sort((a, b) =>
      (a.indiceFt || '').localeCompare(b.indiceFt || '', undefined, { numeric: true })
    );
  }, [savedFts]);

  const filteredListings = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mlListings.filter((l) => {
      if (statusFilter === 'active' && l.status !== 'active') return false;
      if (!q) return true;
      return (
        String(l.title || '').toLowerCase().includes(q) ||
        String(l.ml_item_id || '').toLowerCase().includes(q) ||
        String(l.sku || '').toLowerCase().includes(q)
      );
    });
  }, [mlListings, statusFilter, search]);

  if (!isOpen) return null;

  const selectedItems = mlListings
    .filter((l) => checkedIds[l.ml_item_id] && assignments[l.ml_item_id])
    .map((l) => ({
      mlItemId: l.ml_item_id,
      ftId: assignments[l.ml_item_id],
      title: l.title,
    }));

  const handleSelectFt = (mlItemId, ftId) => {
    setAssignments((prev) => ({ ...prev, [mlItemId]: ftId }));
    setCheckedIds((prev) => ({ ...prev, [mlItemId]: Boolean(ftId) }));
  };

  const handleToggleCheck = (mlItemId) => {
    if (!assignments[mlItemId]) return;
    setCheckedIds((prev) => ({ ...prev, [mlItemId]: !prev[mlItemId] }));
  };

  const handleSelectAllVisible = (checked) => {
    setCheckedIds((prev) => {
      const next = { ...prev };
      filteredListings.forEach((l) => {
        if (assignments[l.ml_item_id]) {
          next[l.ml_item_id] = checked;
        }
      });
      return next;
    });
  };

  return (
    <div
      className="modal-fullscreen"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
    >
      <div
        className="card"
        style={{
          width: '960px',
          maxWidth: '96%',
          height: '88vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.35rem',
          background: 'var(--bg-surface)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '0.9rem' }}>
          <div>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Download size={18} color="#D97706" />
              Vincular e Importar Anúncios do Mercado Livre → Site Próprio
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              Escolha qual <strong>FT</strong> corresponde a cada anúncio do Mercado Livre. Os vínculos ficam salvos e as fotos, descrições e medidas serão importadas para o Site Próprio.
            </p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            disabled={Boolean(batchStatus)}
            style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}
          >
            ✕
          </button>
        </div>

        {/* Barra de controles */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '0.85rem',
            padding: '0.75rem',
            borderRadius: '10px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ position: 'relative', flex: 1, minWidth: '210px' }}>
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar anúncio, MLB ou SKU..."
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                borderRadius: '7px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.83rem',
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setStatusFilter('active')}
              style={{
                padding: '5px 10px',
                borderRadius: '7px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid var(--border-color)',
                background: statusFilter === 'active' ? '#7C3AED' : 'var(--bg-primary)',
                color: statusFilter === 'active' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Ativos ({mlListings.filter((l) => l.status === 'active').length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              style={{
                padding: '5px 10px',
                borderRadius: '7px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                border: '1px solid var(--border-color)',
                background: statusFilter === 'all' ? '#7C3AED' : 'var(--bg-primary)',
                color: statusFilter === 'all' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Todos ({mlListings.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onSyncMlList}
            disabled={syncingMlList || Boolean(batchStatus)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              borderRadius: '7px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: syncingMlList ? 'wait' : 'pointer',
            }}
          >
            <RefreshCw size={13} className={syncingMlList ? 'spin' : ''} />
            {syncingMlList ? 'Sincronizando...' : 'Atualizar Lista ML'}
          </button>

          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', color: 'var(--text-primary)' }}>
            <input
              type="checkbox"
              checked={overwriteExisting}
              onChange={(e) => setOverwriteExisting(e.target.checked)}
              style={{ width: '15px', height: '15px', accentColor: '#F59E0B', cursor: 'pointer' }}
            />
            Substituir fotos/descrição se a FT já tiver
          </label>
        </div>

        {/* Tabela */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
            <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ padding: '0.65rem 0.75rem', width: '42px', textAlign: 'center', borderBottom: '1px solid var(--border-color)' }}>
                  <input
                    type="checkbox"
                    onChange={(e) => handleSelectAllVisible(e.target.checked)}
                    title="Marcar/desmarcar todos visíveis com FT vinculada"
                    style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '0.65rem 0.75rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Anúncio Mercado Livre</th>
                <th style={{ padding: '0.65rem 0.75rem', width: '320px', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>FT de Destino no Sistema</th>
                <th style={{ padding: '0.65rem 0.75rem', width: '110px', textAlign: 'center', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>No Site</th>
              </tr>
            </thead>
            <tbody>
              {filteredListings.map((listing) => {
                const chosenFtId = assignments[listing.ml_item_id] || '';
                const isChecked = Boolean(checkedIds[listing.ml_item_id] && chosenFtId);
                const ftOverride = chosenFtId ? siteOverrides[chosenFtId] : null;
                const fotosCount = ftOverride?.fotosLoja?.length || 0;

                return (
                  <tr
                    key={listing.ml_item_id}
                    style={{
                      borderBottom: '1px solid var(--border-color)',
                      background: isChecked ? 'rgba(124, 58, 237, 0.04)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!chosenFtId || Boolean(batchStatus)}
                        onChange={() => handleToggleCheck(listing.ml_item_id)}
                        style={{ width: '16px', height: '16px', cursor: chosenFtId ? 'pointer' : 'not-allowed', accentColor: '#7C3AED' }}
                      />
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {listing.thumbnail_url ? (
                          <img
                            src={String(listing.thumbnail_url).replace(/^http:\/\//i, 'https://')}
                            alt=""
                            style={{ width: '42px', height: '42px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }}
                          />
                        ) : (
                          <div style={{ width: '42px', height: '42px', borderRadius: '6px', background: 'var(--bg-secondary)', flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.25 }}>{listing.title}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '3px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                            <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{listing.ml_item_id}</span>
                            <span
                              style={{
                                padding: '0 5px',
                                borderRadius: '4px',
                                fontWeight: 700,
                                background: listing.status === 'active' ? 'rgba(16, 185, 129, 0.14)' : 'var(--bg-secondary)',
                                color: listing.status === 'active' ? '#059669' : 'var(--text-secondary)',
                              }}
                            >
                              {listing.status === 'active' ? 'Ativo' : listing.status || '—'}
                            </span>
                            {listing.sku && <span>SKU: {listing.sku}</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem' }}>
                      <select
                        value={chosenFtId}
                        disabled={Boolean(batchStatus)}
                        onChange={(e) => handleSelectFt(listing.ml_item_id, e.target.value)}
                        style={{
                          width: '100%',
                          padding: '6px 8px',
                          borderRadius: '7px',
                          border: chosenFtId ? '1.5px solid #7C3AED' : '1px solid var(--border-color)',
                          background: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                          fontWeight: chosenFtId ? 600 : 400,
                        }}
                      >
                        <option value="">— Não vincular / Ignorar —</option>
                        {sortedFts.map((ft) => (
                          <option key={ft.indiceFt} value={ft.indiceFt}>
                            {ft.indiceFt} — {ft.nomePeca}{ft.sku ? ` [${ft.sku}]` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', fontSize: '0.75rem' }}>
                      {chosenFtId ? (
                        fotosCount > 0 ? (
                          <span style={{ padding: '2px 7px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.14)', color: '#059669', fontWeight: 700 }}>
                            📷 {fotosCount}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-secondary)' }}>Sem fotos</span>
                        )
                      ) : (
                        <span style={{ color: 'var(--border-color)' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredListings.length === 0 && (
                <tr>
                  <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Nenhum anúncio encontrado. Clique em <strong>Atualizar Lista ML</strong> acima se precisar sincronizar seus anúncios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '1rem' }}>
          <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
            {batchStatus ? (
              <strong style={{ color: '#D97706' }}>
                ⏳ Importando {batchStatus.done} de {batchStatus.total}... ({batchStatus.errors} erro(s))
              </strong>
            ) : (
              <span>
                <strong>{selectedItems.length}</strong> anúncio(s) selecionado(s) para importar
              </span>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={Boolean(batchStatus)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={Boolean(batchStatus) || selectedItems.length === 0}
              onClick={() => onRunBatchImport({ selectedItems, overwriteExisting, allAssignments: assignments })}
              style={{ background: '#7C3AED', borderColor: '#7C3AED' }}
            >
              {batchStatus
                ? `Importando (${batchStatus.done}/${batchStatus.total})...`
                : `✅ Salvar Vínculos e Importar (${selectedItems.length})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
