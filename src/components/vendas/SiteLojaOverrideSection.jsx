import { useState } from 'react';
import { Globe, Download, ImagePlus, Tag } from 'lucide-react';

export default function SiteLojaOverrideSection({
  customData,
  ftBase,
  onChange,
  categorias = [],
  onManageCategorias,
  onToggleCategoria,
  onUploadFotos,
  onRemoveFoto,
  onMoveFoto,
  uploadingFotos = false,
  mlLinkedListings = [],
  allMlListings = [],
  onImportFromMl,
  importingMl = false,
  onPullVariationPhotosFromMl,
  onUploadVariationPhoto,
}) {
  const [selectedMlId, setSelectedMlId] = useState('');
  const fotos = Array.isArray(customData.fotosLoja) ? customData.fotosLoja : [];
  const selectedCats = Array.isArray(customData.categoriasLoja) ? customData.categoriasLoja : [];

  return (
    <div
      className="costs-group editable-costs"
      style={{
        gridColumn: '1 / -1',
        marginTop: '0.5rem',
        border: '1px solid rgba(124, 58, 237, 0.25)',
        background: 'rgba(124, 58, 237, 0.03)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '0.85rem' }}>
        <h4 className="group-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Globe size={16} color="#7C3AED" />
          <span>Anúncio no Site Próprio (aem3d.com.br)</span>
        </h4>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '5px 11px',
              borderRadius: '8px',
              border: customData.destaqueLoja ? '1.5px solid #F59E0B' : '1px solid var(--border-color)',
              background: customData.destaqueLoja ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              color: customData.destaqueLoja ? '#D97706' : 'var(--text-primary)',
            }}
            title="Exibir este produto no carrossel de destaques da página inicial"
          >
            <input
              type="checkbox"
              checked={Boolean(customData.destaqueLoja)}
              onChange={(e) => onChange({ target: { name: 'destaqueLoja', value: e.target.checked } })}
              style={{ width: '15px', height: '15px', accentColor: '#F59E0B', cursor: 'pointer' }}
            />
            <span>⭐ Destaque no Carrossel</span>
          </label>

          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '5px 11px',
              borderRadius: '8px',
              border: customData.cadastrado ? '1.5px solid #10B981' : '1px solid var(--border-color)',
              background: customData.cadastrado ? 'rgba(16, 185, 129, 0.12)' : 'var(--bg-secondary)',
              cursor: 'pointer',
              fontWeight: 700,
              fontSize: '0.82rem',
              color: customData.cadastrado ? '#059669' : 'var(--text-primary)',
            }}
          >
            <input
              type="checkbox"
              checked={Boolean(customData.cadastrado)}
              onChange={(e) => onChange({ target: { name: 'cadastrado', value: e.target.checked } })}
              style={{ width: '15px', height: '15px', accentColor: '#10B981', cursor: 'pointer' }}
            />
            <span>Anunciar no Site (No Ar)</span>
          </label>
        </div>
      </div>

      {/* Importar do Mercado Livre */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '9px 12px',
          borderRadius: '8px',
          background: 'rgba(251, 191, 36, 0.09)',
          border: '1px solid rgba(251, 191, 36, 0.35)',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
          <Download size={15} color="#D97706" />
          {mlLinkedListings.length > 0 ? (
            <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
              Vinculado ao ML: <strong>{mlLinkedListings[0].ml_item_id}</strong> — {mlLinkedListings[0].title}
            </span>
          ) : (
            <select
              value={selectedMlId}
              onChange={(e) => setSelectedMlId(e.target.value)}
              style={{
                flex: 1,
                maxWidth: '380px',
                padding: '5px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
              }}
            >
              <option value="">-- Escolha um anúncio do Mercado Livre para importar --</option>
              {allMlListings.map((l) => (
                <option key={l.ml_item_id} value={l.ml_item_id}>
                  {l.ml_item_id} — {l.title}
                </option>
              ))}
            </select>
          )}
        </div>

        <button
          type="button"
          disabled={importingMl || (!mlLinkedListings.length && !selectedMlId)}
          onClick={() => onImportFromMl(mlLinkedListings[0]?.ml_item_id || selectedMlId)}
          style={{
            padding: '6px 12px',
            borderRadius: '7px',
            border: 'none',
            background: importingMl ? '#94A3B8' : '#F59E0B',
            color: '#fff',
            fontWeight: 700,
            fontSize: '0.78rem',
            cursor: importingMl || (!mlLinkedListings.length && !selectedMlId) ? 'not-allowed' : 'pointer',
            opacity: !mlLinkedListings.length && !selectedMlId ? 0.55 : 1,
          }}
        >
          {importingMl ? '⏳ Importando...' : '⬇️ Puxar Fotos, Descrição e Medidas do ML'}
        </button>
      </div>

      {/* Título Comercial + Medidas/Peso de Envio */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '0.9rem' }}>
        <div className="input-group" style={{ margin: 0 }}>
          <label>Título Comercial no Site</label>
          <input
            type="text"
            name="tituloLoja"
            value={customData.tituloLoja || ''}
            onChange={onChange}
            placeholder={ftBase?.nomePeca || 'Ex: Porta Batom 3D'}
            style={{
              width: '100%',
              padding: '0.55rem 0.7rem',
              borderRadius: '7px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          />
        </div>

        <div className="input-group" style={{ margin: 0 }}>
          <label>Medida c/ Caixa (frete)</label>
          <input
            type="text"
            name="medidaComCaixa"
            value={customData.medidaComCaixa ?? ftBase?.medidaComCaixa ?? ''}
            onChange={onChange}
            placeholder="Ex: 15x15x10 cm"
            style={{
              width: '100%',
              padding: '0.55rem 0.7rem',
              borderRadius: '7px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          />
        </div>

        <div className="input-group" style={{ margin: 0 }}>
          <label>Peso c/ Caixa (g)</label>
          <input
            type="text"
            name="pesoComCaixa"
            value={customData.pesoComCaixa ?? ftBase?.pesoComCaixa ?? ''}
            onChange={onChange}
            placeholder="Ex: 250"
            style={{
              width: '100%',
              padding: '0.55rem 0.7rem',
              borderRadius: '7px',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
            }}
          />
        </div>
      </div>

      {/* Categorias Múltiplas */}
      <div style={{ marginBottom: '0.9rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
            <Tag size={13} /> Categorias no Site (pode marcar várias)
          </label>
          <button
            type="button"
            onClick={onManageCategorias}
            style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.76rem', cursor: 'pointer', fontWeight: 700 }}
          >
            ⚙️ Gerenciar Categorias
          </button>
        </div>

        {categorias.length === 0 ? (
          <div style={{ padding: '8px 10px', borderRadius: '7px', border: '1px dashed var(--border-color)', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Nenhuma categoria cadastrada. Clique em <strong>⚙️ Gerenciar Categorias</strong> acima.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {categorias.filter((c) => c.ativo !== false).map((cat) => {
              const isSel = selectedCats.includes(cat.id);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onToggleCategoria(cat.id)}
                  style={{
                    padding: '4px 11px',
                    borderRadius: '999px',
                    fontSize: '0.76rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: isSel ? '1.5px solid #7C3AED' : '1px solid var(--border-color)',
                    background: isSel ? 'rgba(124, 58, 237, 0.14)' : 'var(--bg-secondary)',
                    color: isSel ? '#7C3AED' : 'var(--text-secondary)',
                  }}
                >
                  {isSel ? '✓ ' : ''}{cat.nome}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Descrição */}
      <div style={{ marginBottom: '0.9rem' }}>
        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
          Descrição do Produto na Loja
        </label>
        <textarea
          name="descricaoLoja"
          rows={3}
          value={customData.descricaoLoja || ''}
          onChange={onChange}
          placeholder="Descreva material, acabamento, uso e detalhes para o cliente..."
          style={{
            width: '100%',
            padding: '0.6rem 0.75rem',
            borderRadius: '7px',
            border: '1px solid var(--border-color)',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: '0.84rem',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Fotos */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Fotos do Produto ({fotos.length}/8) — a 1ª foto é a capa
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {fotos.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  onChange({ target: { name: 'fotosLoja', value: [] } });
                }}
                style={{
                  padding: '4px 9px',
                  borderRadius: '7px',
                  border: '1px solid rgba(220,38,38,0.35)',
                  background: 'rgba(220,38,38,0.08)',
                  color: '#DC2626',
                  fontSize: '0.74rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
                title="Remover todas as fotos deste item no Site Próprio"
              >
                🗑️ Limpar Fotos
              </button>
            )}
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '7px',
                background: 'var(--accent-primary)',
                color: '#fff',
                fontSize: '0.76rem',
                fontWeight: 700,
                cursor: uploadingFotos ? 'wait' : 'pointer',
                opacity: uploadingFotos ? 0.65 : 1,
              }}
            >
              <ImagePlus size={13} />
              {uploadingFotos ? 'Enviando...' : '+ Adicionar Fotos'}
              <input
                type="file"
                accept="image/*"
                multiple
                disabled={uploadingFotos}
                onChange={(e) => {
                  if (e.target.files?.length) onUploadFotos(Array.from(e.target.files));
                  e.target.value = '';
                }}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </div>

        {fotos.length === 0 ? (
          <div style={{ padding: '10px', borderRadius: '7px', border: '1px dashed var(--border-color)', textAlign: 'center', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            Nenhuma foto adicionada ainda.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '8px' }}>
            {fotos.map((url, idx) => (
              <div
                key={`${url}_${idx}`}
                style={{
                  position: 'relative',
                  borderRadius: '7px',
                  border: idx === 0 ? '2px solid #7C3AED' : '1px solid var(--border-color)',
                  overflow: 'hidden',
                  background: 'var(--bg-secondary)',
                  aspectRatio: '1 / 1',
                }}
              >
                <img src={url} alt={`Foto ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {idx === 0 && (
                  <span style={{ position: 'absolute', top: '3px', left: '3px', background: '#7C3AED', color: '#fff', fontSize: '0.6rem', fontWeight: 800, padding: '1px 4px', borderRadius: '4px' }}>
                    CAPA
                  </span>
                )}
                <div style={{ position: 'absolute', bottom: '3px', left: '3px', right: '3px', display: 'flex', justifyContent: 'space-between', gap: '2px' }}>
                  <div style={{ display: 'flex', gap: '2px' }}>
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => onMoveFoto(idx, -1)}
                        style={{ background: 'rgba(15,23,42,0.75)', color: '#fff', border: 'none', borderRadius: '4px', padding: '1px 4px', fontSize: '0.68rem', cursor: 'pointer' }}
                      >
                        ←
                      </button>
                    )}
                    {idx < fotos.length - 1 && (
                      <button
                        type="button"
                        onClick={() => onMoveFoto(idx, 1)}
                        style={{ background: 'rgba(15,23,42,0.75)', color: '#fff', border: 'none', borderRadius: '4px', padding: '1px 4px', fontSize: '0.68rem', cursor: 'pointer' }}
                      >
                        →
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveFoto(idx)}
                    style={{ background: 'rgba(220,38,38,0.85)', color: '#fff', border: 'none', borderRadius: '4px', padding: '1px 5px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Variações do Produto na Loja */}
      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        {(() => {
          const variacoes = Array.isArray(customData.variacoesLoja) ? customData.variacoesLoja : [];
          const ftVars = Array.isArray(ftBase?.variacoesEstoque) ? ftBase.variacoesEstoque : [];
          const updateVariacoes = (next) => onChange({ target: { name: 'variacoesLoja', value: next } });

          const handlePullFromFt = () => {
            if (ftVars.length === 0) return;
            const existingByFtId = new Map(
              variacoes.filter((v) => v.variacaoEstoqueId).map((v) => [v.variacaoEstoqueId, v])
            );
            const existingByName = new Map(
              variacoes.map((v) => [String(v.nome || '').trim().toLowerCase(), v])
            );

            const merged = [...variacoes];
            ftVars.forEach((fv, idx) => {
              const ftVarId = String(fv.id || `ftvar_${idx}`);
              const ftName = String(fv.nome || `Variação ${idx + 1}`).trim();
              const ftStock = Number(fv.estoqueCasa || 0) + Number(fv.estoqueGalpao || 0);
              const match =
                existingByFtId.get(ftVarId) || existingByName.get(ftName.toLowerCase());

              if (match) {
                const mIdx = merged.indexOf(match);
                if (mIdx >= 0) {
                  merged[mIdx] = {
                    ...match,
                    variacaoEstoqueId: ftVarId,
                    sku: match.sku || fv.sku || '',
                    estoque: ftStock,
                  };
                }
              } else {
                merged.push({
                  id: `var_${ftVarId}_${Date.now()}_${idx}`,
                  nome: ftName,
                  sku: fv.sku || '',
                  foto: fotos[0] || '',
                  estoque: ftStock,
                  ativo: true,
                  variacaoEstoqueId: ftVarId,
                });
              }
            });
            updateVariacoes(merged);
          };

          const handleAddVar = () => {
            updateVariacoes([
              ...variacoes,
              {
                id: `var_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
                nome: '',
                sku: '',
                foto: fotos[0] || '',
                estoque: 0,
                ativo: true,
                variacaoEstoqueId: '',
              },
            ]);
          };

          const handlePatchVar = (idx, patch) => {
            const next = variacoes.map((v, i) => (i === idx ? { ...v, ...patch } : v));
            updateVariacoes(next);
          };

          const handleRemoveVar = (idx) => {
            updateVariacoes(variacoes.filter((_, i) => i !== idx));
          };

          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  🎨 Variações do Produto na Loja ({variacoes.length})
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {variacoes.length > 0 && mlLinkedListings.length > 0 && onPullVariationPhotosFromMl && (
                    <button
                      type="button"
                      disabled={importingMl}
                      onClick={onPullVariationPhotosFromMl}
                      style={{
                        padding: '4px 9px',
                        borderRadius: '7px',
                        border: '1px solid rgba(5,150,105,0.35)',
                        background: 'rgba(5,150,105,0.1)',
                        color: '#059669',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: importingMl ? 'wait' : 'pointer',
                        opacity: importingMl ? 0.65 : 1,
                      }}
                      title="Cruza o nome de cada variação com os anúncios vinculados do Mercado Livre e baixa a foto específica de cada cor/modelo"
                    >
                      {importingMl ? 'Buscando...' : '🖼️ Puxar Fotos do ML'}
                    </button>
                  )}
                  {ftVars.length > 0 && (
                    <button
                      type="button"
                      onClick={handlePullFromFt}
                      style={{
                        padding: '4px 9px',
                        borderRadius: '7px',
                        border: '1px solid rgba(37,99,235,0.35)',
                        background: 'rgba(37,99,235,0.08)',
                        color: '#2563EB',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                      title="Sincronizar variações cadastradas no estoque da Ficha Técnica"
                    >
                      📦 Puxar do Estoque da FT ({ftVars.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddVar}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '7px',
                      border: '1px solid rgba(124,58,237,0.35)',
                      background: 'rgba(124,58,237,0.1)',
                      color: '#7C3AED',
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    + Nova Variação
                  </button>
                </div>
              </div>

              {variacoes.length === 0 ? (
                <div style={{ padding: '10px', borderRadius: '7px', border: '1px dashed var(--border-color)', textAlign: 'center', fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                  Nenhuma variação configurada. Se este produto tem cores, tamanhos ou modelos diferentes, importe do ML ou adicione acima.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {variacoes.map((v, idx) => {
                    const photoOptions = Array.from(
                      new Set([v.foto, ...fotos].filter(Boolean))
                    );
                    return (
                      <div
                        key={v.id || idx}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '48px 1fr auto',
                          gap: '10px',
                          alignItems: 'center',
                          padding: '8px',
                          borderRadius: '8px',
                          border: '1px solid var(--border-color)',
                          background: v.ativo === false ? 'rgba(148,163,184,0.08)' : 'var(--bg-primary)',
                          opacity: v.ativo === false ? 0.65 : 1,
                        }}
                      >
                        {/* Miniatura + Upload direto */}
                        <label
                          title="Clique para enviar uma foto específica para esta variação"
                          style={{
                            position: 'relative',
                            width: '48px',
                            height: '48px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-secondary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: uploadingFotos ? 'wait' : 'pointer',
                          }}
                        >
                          {v.foto ? (
                            <img src={v.foto} alt={v.nome || 'Var'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.1 }}>+ Foto</span>
                          )}
                          <span style={{ position: 'absolute', bottom: '1px', right: '1px', background: 'rgba(15,23,42,0.75)', color: '#fff', borderRadius: '3px', padding: '0 3px', fontSize: '0.58rem' }}>
                            📷
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            disabled={uploadingFotos}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file && onUploadVariationPhoto) onUploadVariationPhoto(file, idx);
                              e.target.value = '';
                            }}
                            style={{ display: 'none' }}
                          />
                        </label>

                        {/* Campos */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '6px', alignItems: 'center' }}>
                          <input
                            type="text"
                            placeholder="Nome (ex: Azul / 10cm)"
                            value={v.nome || ''}
                            onChange={(e) => handlePatchVar(idx, { nome: e.target.value })}
                            style={{ padding: '0.38rem 0.55rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                          />
                          <input
                            type="text"
                            placeholder="SKU (opcional)"
                            value={v.sku || ''}
                            onChange={(e) => handlePatchVar(idx, { sku: e.target.value })}
                            style={{ padding: '0.38rem 0.55rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Est.:</span>
                            <input
                              type="number"
                              min="0"
                              value={v.estoque ?? 0}
                              onChange={(e) => handlePatchVar(idx, { estoque: Math.max(0, Number(e.target.value) || 0) })}
                              style={{ width: '68px', padding: '0.38rem 0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                            />
                          </div>
                          {photoOptions.length > 0 && (
                            <select
                              value={v.foto || ''}
                              onChange={(e) => handlePatchVar(idx, { foto: e.target.value })}
                              style={{ padding: '0.38rem 0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.75rem' }}
                              title="Foto desta variação"
                            >
                              <option value="">Sem foto específica</option>
                              {photoOptions.map((u, pIdx) => (
                                <option key={u} value={u}>
                                  {u === v.foto && !fotos.includes(u) ? 'Foto importada ML' : `Foto ${fotos.indexOf(u) + 1 || pIdx + 1}`}
                                </option>
                              ))}
                            </select>
                          )}
                          {ftVars.length > 0 && (
                            <select
                              value={v.variacaoEstoqueId || ''}
                              onChange={(e) => {
                                const selectedId = e.target.value;
                                const found = ftVars.find((fv, fIdx) => String(fv.id || `ftvar_${fIdx}`) === selectedId);
                                handlePatchVar(idx, {
                                  variacaoEstoqueId: selectedId,
                                  ...(found
                                    ? { estoque: Number(found.estoqueCasa || 0) + Number(found.estoqueGalpao || 0) }
                                    : {}),
                                });
                              }}
                              style={{ padding: '0.38rem 0.45rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '0.75rem' }}
                              title="Vincular ao estoque da variação na FT"
                            >
                              <option value="">Sem vínculo FT</option>
                              {ftVars.map((fv, fIdx) => {
                                const fId = String(fv.id || `ftvar_${fIdx}`);
                                const fStock = Number(fv.estoqueCasa || 0) + Number(fv.estoqueGalpao || 0);
                                return (
                                  <option key={fId} value={fId}>
                                    FT: {fv.nome} ({fStock} un)
                                  </option>
                                );
                              })}
                            </select>
                          )}
                        </div>

                        {/* Ações */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                            <input
                              type="checkbox"
                              checked={v.ativo !== false}
                              onChange={(e) => handlePatchVar(idx, { ativo: e.target.checked })}
                            />
                            Ativa
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveVar(idx)}
                            style={{ background: 'rgba(220,38,38,0.12)', color: '#DC2626', border: 'none', borderRadius: '6px', padding: '4px 8px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                            title="Remover variação"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
