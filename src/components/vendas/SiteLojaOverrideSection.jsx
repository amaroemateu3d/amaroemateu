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
    </div>
  );
}
