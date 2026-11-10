import { useState, useMemo, useEffect } from 'react';
import { X, Save, Link2, Search, CheckCircle2 } from 'lucide-react';
import { buildFtCatalogOptions, saveFtMappingsAndPropagateSku } from '../../services/mercadolivre';

export default function MlFtMappingModal({
  isOpen,
  itemsToMap,
  unmappedItems,
  ftsList,
  savedFts,
  empresaId,
  onClose,
  onSaved
}) {
  const effectiveItems = itemsToMap || unmappedItems || [];
  const effectiveFts = ftsList || savedFts || [];
  const ftOptions = useMemo(() => buildFtCatalogOptions(effectiveFts), [effectiveFts]);

  const [selections, setSelections] = useState({});
  const [skus, setSkus] = useState({});
  const [filterText, setFilterText] = useState('');
  const [propagateSku, setPropagateSku] = useState(true);
  const [saving, setSaving] = useState(false);

  // Inicializa seleções tentando casar automaticamente por SKU ou por código FT no título/SKU
  useEffect(() => {
    if (!isOpen) return;
    const initSel = {};
    const initSkus = {};

    effectiveItems.forEach((it) => {
      const itemSku = String(it.sku || '').trim();
      initSkus[it.key] = itemSku;

      if (it.ft_id) {
        initSel[it.key] = it.ft_id;
        return;
      }

      if (itemSku) {
        // 1. Tenta casar pelo SKU exato já salvo na FT/variação
        const bySku = ftOptions.find(
          (opt) => opt.sku && opt.sku.toLowerCase() === itemSku.toLowerCase()
        );
        if (bySku) {
          initSel[it.key] = bySku.value;
          return;
        }

        // 2. Extrai o número da FT do SKU do ML (ex: "FT 16 Preto", "FT35", "FT21B", "FT 131 Lilás")
        const ftMatch = itemSku.match(/^FT\s*-?\s*(\d+)\s*(.*)$/i);
        if (ftMatch) {
          const rawNum = ftMatch[1];
          const suffix = (ftMatch[2] || '').trim().toLowerCase();
          const paddedCode = `FT-${rawNum.padStart(2, '0')}`;
          const unpaddedCode = `FT-${rawNum}`;

          // Procura opções que pertencem a essa FT
          const matchingFtOpts = ftOptions.filter(
            (opt) =>
              opt.ftId?.toUpperCase() === paddedCode.toUpperCase() ||
              opt.ftId?.toUpperCase() === unpaddedCode.toUpperCase()
          );

          if (matchingFtOpts.length > 0) {
            // Se houver sufixo (ex: "Preto", "Branco") ou nome de variação no ML, tenta achar a variação correspondente
            const hint = `${suffix} ${String(it.variation_name || '').toLowerCase()}`.trim();
            if (hint) {
              const varMatch = matchingFtOpts.find(
                (opt) => opt.varId && opt.varNome && hint.includes(opt.varNome.toLowerCase())
              );
              if (varMatch) {
                initSel[it.key] = varMatch.value;
                return;
              }
            }
            // Caso contrário, sugere a FT principal
            const parentOpt = matchingFtOpts.find((opt) => !opt.varId) || matchingFtOpts[0];
            initSel[it.key] = parentOpt.value;
            return;
          }
        }
      }

      initSel[it.key] = '';
    });

    setSelections(initSel);
    setSkus(initSkus);
  }, [isOpen, effectiveItems, ftOptions]);

  if (!isOpen) return null;

  const filteredItems = effectiveItems.filter((it) => {
    if (!filterText.trim()) return true;
    const q = filterText.toLowerCase().trim();
    return (
      String(it.title || '').toLowerCase().includes(q) ||
      String(it.ml_item_id || '').toLowerCase().includes(q) ||
      String(it.variation_name || '').toLowerCase().includes(q) ||
      String(skus[it.key] || it.sku || '').toLowerCase().includes(q)
    );
  });

  const mappedCount = Object.values(selections).filter((v) => v && v !== '').length;

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedListings = await saveFtMappingsAndPropagateSku({
        empresaId,
        mappingsByKey: selections,
        skuByKey: skus,
        propagateSku
      });
      if (onSaved) {
        await onSaved(updatedListings, selections);
      } else if (onClose) {
        onClose();
      }
    } catch (err) {
      alert('Erro ao salvar vínculos de FT: ' + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 10020, padding: '1rem' }}
      onClick={(e) => e.target === e.currentTarget && onClose && onClose()}
    >
      <div
        className="modal-content"
        style={{
          maxWidth: '980px',
          width: '96%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '14px',
          overflow: 'hidden'
        }}
      >
        {/* CABEÇALHO */}
        <div
          className="modal-header"
          style={{
            background: 'linear-gradient(135deg, #1E293B, #0F172A)',
            color: 'white',
            padding: '1rem 1.4rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span
                style={{
                  background: '#EAB308',
                  color: '#0F172A',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  fontWeight: 800,
                  fontSize: '0.76rem'
                }}
              >
                MERCADO LIVRE ↔ FT
              </span>
              <h3 style={{ margin: 0, color: 'white', fontSize: '1.1rem' }}>
                🔗 Vincular Anúncios / Variações do Mercado Livre às Fichas Técnicas
              </h3>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: '#CBD5E1' }}>
              Escolha qual FT (ou variação de FT) corresponde a cada item do Mercado Livre. Uma vez vinculado, o sistema memoriza para sempre no Estoque e nas Vendas!
            </p>
          </div>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            style={{ color: 'white', background: 'rgba(255,255,255,0.14)', borderRadius: '8px', padding: '6px' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* BARRA DE OPÇÕES E BUSCA */}
        <div
          style={{
            padding: '0.85rem 1.4rem',
            background: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.83rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: 'pointer'
            }}
          >
            <input
              type="checkbox"
              checked={propagateSku}
              onChange={(e) => setPropagateSku(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent-primary)' }}
            />
            <span>
              Salvar automaticamente o <strong>SKU do Produto</strong> no cadastro da FT / Marketplace e marcar como <strong>No Ar</strong>
            </span>
          </label>

          <div className="search-bar" style={{ maxWidth: '280px' }}>
            <span className="search-icon">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Filtrar anúncio, MLB ou SKU..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
        </div>

        {/* LISTA DE ITENS PARA VINCULAR */}
        <div
          className="modal-body"
          style={{
            padding: '1rem 1.4rem',
            overflowY: 'auto',
            flex: 1,
            maxHeight: 'none',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
          }}
        >
          {filteredItems.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              Nenhum item pendente encontrado para este filtro.
            </div>
          ) : (
            filteredItems.map((it) => {
              const currentSelection = selections[it.key] || '';
              const currentSku = skus[it.key] ?? it.sku ?? '';
              return (
                <div
                  key={it.key}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.55fr) minmax(0, 1.15fr)',
                    gap: '0.85rem',
                    alignItems: 'center',
                    padding: '0.8rem 1rem',
                    borderRadius: '10px',
                    border: `1px solid ${currentSelection ? '#10B981' : 'var(--border-color)'}`,
                    background: currentSelection ? 'rgba(16, 185, 129, 0.04)' : 'var(--bg-surface)'
                  }}
                >
                  {/* Coluna 1: Anúncio / Variação no ML */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    {it.thumbnail_url ? (
                      <img
                        src={it.thumbnail_url}
                        alt={it.title}
                        style={{
                          width: '46px',
                          height: '46px',
                          objectFit: 'cover',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '46px',
                          height: '46px',
                          borderRadius: '8px',
                          background: 'var(--bg-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.2rem',
                          flexShrink: 0
                        }}
                      >
                        📦
                      </div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            padding: '1px 6px',
                            borderRadius: '4px',
                            background: '#FEF9C3',
                            color: '#854D0E',
                            border: '1px solid #FDE047'
                          }}
                        >
                          {it.ml_item_id}
                        </span>
                        {it.variation_name && (
                          <span
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              padding: '1px 7px',
                              borderRadius: '4px',
                              background: 'var(--accent-subtle)',
                              color: 'var(--accent-hover)'
                            }}
                          >
                            Variação ML: {it.variation_name}
                          </span>
                        )}
                        {it.quantitySold > 0 && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              background: '#DCFCE7',
                              color: '#166534'
                            }}
                          >
                            {it.quantitySold} un vendidas no mês
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.86rem',
                          color: 'var(--text-primary)',
                          marginTop: '3px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={it.title}
                      >
                        {it.title}
                      </div>
                    </div>
                  </div>

                  {/* Coluna 2: SKU do Produto (Trazido do ML ou Editável) */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                      SKU do Produto (ML → FT)
                    </label>
                    <input
                      type="text"
                      value={currentSku}
                      onChange={(e) => setSkus((prev) => ({ ...prev, [it.key]: e.target.value }))}
                      placeholder="Sem SKU no ML"
                      style={{
                        width: '100%',
                        padding: '0.45rem 0.6rem',
                        borderRadius: '7px',
                        border: '1px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)'
                      }}
                    />
                  </div>

                  {/* Coluna 3: Seleção da FT / Variação Interna */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '3px' }}>
                      Ficha Técnica / Variação Correspondente *
                    </label>
                    <select
                      value={currentSelection}
                      onChange={(e) => setSelections((prev) => ({ ...prev, [it.key]: e.target.value }))}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.65rem',
                        borderRadius: '8px',
                        border: `2px solid ${currentSelection ? '#10B981' : 'var(--accent-primary)'}`,
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        fontWeight: 700,
                        fontSize: '0.84rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">-- Selecione a FT ou Variação --</option>
                      {ftOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                      <option value="__IGNORED__">🚫 Ignorar este anúncio (Não vincular a FT)</option>
                    </select>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* RODAPÉ */}
        <div
          className="modal-footer"
          style={{
            padding: '0.9rem 1.4rem',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.75rem'
          }}
        >
          <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
            <CheckCircle2 size={16} style={{ verticalAlign: 'middle', color: '#10B981', marginRight: '5px' }} />
            <strong>{mappedCount}</strong> de <strong>{effectiveItems.length}</strong> item(ns) selecionados para vínculo
          </span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Pular por Agora
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || mappedCount === 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Save size={16} />
              {saving ? 'Salvando Vínculos...' : `Salvar Vínculos (${mappedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
