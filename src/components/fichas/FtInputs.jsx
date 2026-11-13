import { useState } from 'react';
import { Settings2, Zap, PackagePlus, Globe, Download, ImagePlus, Tag } from 'lucide-react';

const InputRow = ({ label, name, type = "number", suffix = "", prefix = "", step = "any", placeholder = "", value, inputs, onChange, onChangeOverride }) => {
  const val = value !== undefined ? value : inputs[name];
  const changeHandler = onChangeOverride || onChange;

  return (
    <div className="input-group">
      <label>{label}</label>
      <div className="input-wrapper">
        {prefix && <span className="prefix">{prefix}</span>}
        <input 
          type={type} 
          name={name} 
          value={val} 
          onChange={changeHandler}
          step={step}
          placeholder={placeholder}
          className={prefix ? "has-prefix" : ""}
        />
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
    </div>
  );
};

// Sub-componente para cada linha de gasto extra
const ExtraRow = ({ index, inputs, onChange, showLabels, onSelectInsumoClick }) => {
  const nomeKey  = `extraNome${index}`;
  const valorKey = `extraValor${index}`;

  return (
    <div className="extra-row" style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
      <div className="input-group" style={{ flex: 2 }}>
        {showLabels && <label>Descrição</label>}
        <div className="input-wrapper" style={{ display: 'flex', gap: '4px' }}>
          <input
            type="text"
            name={nomeKey}
            value={inputs[nomeKey] || ''}
            onChange={onChange}
            placeholder={`Extra ${index}`}
            style={{ flex: 1 }}
          />
          <button 
            type="button" 
            onClick={() => onSelectInsumoClick && onSelectInsumoClick(index)}
            style={{ 
              padding: '0 10px', 
              background: 'var(--bg-secondary)', 
              border: '1px solid var(--border-color)', 
              borderRadius: '8px', 
              fontSize: '0.9rem',
              color: 'var(--accent-primary)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold'
            }}
            title="Puxar Insumo Pré-Cadastrado"
          >
            ➕
          </button>
        </div>
      </div>
      <div className="input-group" style={{ flex: 1 }}>
        {showLabels && <label>Valor (R$)</label>}
        <div className="input-wrapper">
          <span className="prefix">R$</span>
          <input
            type="number"
            name={valorKey}
            value={inputs[valorKey] || ''}
            onChange={onChange}
            step="0.01"
            min="0"
            placeholder="0,00"
            className="has-prefix"
          />
        </div>
      </div>
    </div>
  );
};

export default function FtInputs({
  inputs,
  onChange,
  savedFts = [],
  onManageInsumos,
  onSelectInsumoClick,
  isCustomProduct = false,
  filamentos = [],
  onManageFilamentos,
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
  const commonProps = { inputs, onChange };

  return (
    <div className="inputs-container desktop-layout">
      
      {/* SEÇÃO 1: Dados Modelo */}
      <section className="input-section card card-full">
        <div className="section-header">
          <div className="icon-box"><Settings2 size={18} /></div>
          <h3>Dados do Modelo e Produção</h3>
        </div>
        
        <div className="inputs-grid-3">
          <div className="input-group">
            <label>Índice (ID)</label>
            <div className="input-wrapper">
              {isCustomProduct ? (
                <input 
                  type="text" 
                  value={inputs.indiceFt} 
                  readOnly 
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-surface-hover)',
                    color: 'var(--text-muted)',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    fontFamily: 'Outfit, sans-serif'
                  }}
                />
              ) : (
                <select 
                  name="indiceFt" 
                  value={inputs.indiceFt} 
                  onChange={onChange}
                  style={{
                    width: '100%',
                    padding: '0.8rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    fontFamily: 'Outfit, sans-serif'
                  }}
                >
                  {(() => {
                    const maxSavedNum = savedFts.reduce((max, f) => {
                      const num = parseInt(String(f?.indiceFt || '').replace(/[^\d]/g, ''), 10);
                      return !isNaN(num) && num > max ? num : max;
                    }, 150);
                    const totalCount = Math.max(150, maxSavedNum + 5);
                    return Array.from({length: totalCount}, (_, i) => {
                      const id = `FT-${String(i+1).padStart(2, '0')}`;
                      const hasSaved = savedFts.find(f => f.indiceFt === id);
                      const displayLabel = hasSaved ? `${id} - ${hasSaved.nomePeca}` : `${id} (Vazio)`;
                      return <option key={id} value={id}>{displayLabel}</option>;
                    });
                  })()}
                </select>
              )}
            </div>
          </div>
          <div className="input-group">
            <label>Nome do Projeto/Peça</label>
            <div className="input-wrapper">
               <input type="text" name="nomePeca" value={inputs.nomePeca} onChange={onChange} />
            </div>
          </div>
          <div className="input-group">
            <label>SKU do Produto</label>
            <div className="input-wrapper">
               <input type="text" name="sku" value={inputs.sku || ''} onChange={onChange} placeholder="Ex: AM3D-PORTA-BATOM" />
            </div>
          </div>
          
          <InputRow label="Qtd. Produzida" name="quantidade" suffix="un" {...commonProps} />
          <InputRow label="Peso Bruto (Lote)" name="pesoGramas" suffix="g" {...commonProps} />
          <InputRow label="Tempo Impressão (Lote)" name="tempoImpressao" type="text" placeholder="01:30" {...commonProps} />

          <div style={{ gridColumn: '1 / -1', height: '1px', background: 'rgba(0,0,0,0.05)', margin: '1rem 0 0.5rem' }} />
          
          <InputRow label="Medida Sem Caixa" name="medidaSemCaixa" type="text" placeholder="Ex: 10x10x5 cm" {...commonProps} />
          <InputRow label="Peso Sem Caixa" name="pesoSemCaixa" suffix="g" {...commonProps} />
          <div style={{ gridColumn: 'span 1' }} /> {/* Espaçador */}
          
          <InputRow label="Medida Com Caixa" name="medidaComCaixa" type="text" placeholder="Ex: 15x15x10 cm" {...commonProps} />
          <InputRow label="Peso Com Caixa" name="pesoComCaixa" suffix="g" {...commonProps} />
        </div>
      </section>

      {/* SEÇÃO 2: Material e Energia */}
      <section className="input-section card">
        <div className="section-header">
          <div className="icon-box" style={{background: '#E0F2FE', color: '#3B82F6'}}><Zap size={18} /></div>
          <h3>Material e Energia</h3>
        </div>
        
        <div className="inputs-grid-1">
          
            <div className="input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ marginBottom: 0 }}>Filamento / Material</label>
                {onManageFilamentos && (
                  <button type="button" onClick={onManageFilamentos} style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>⚙️ Gerenciar</button>
                )}
              </div>
              <select 
                className="input-field" 
                value={inputs.filamento_id || ''} 
                onChange={(e) => {
                  const val = e.target.value;
                  onChange({ target: { name: 'filamento_id', value: val } });
                  if (val) {
                    const selected = filamentos.find(f => f.id === val);
                    if (selected) onChange({ target: { name: 'precoKgMaterial', value: selected.preco_kg } });
                  } else {
                    onChange({ target: { name: 'precoKgMaterial', value: '' } });
                  }
                }}
              >
                <option value="">-- Selecione ou digite manualmente abaixo --</option>
                {filamentos?.map(f => (
                  <option key={f.id} value={f.id}>{f.nome} (R$ {Number(f.preco_kg).toFixed(2)}/kg)</option>
                ))}
              </select>
              
              {!inputs.filamento_id && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center' }}>
                  <span className="input-prefix">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    name="precoKgMaterial"
                    className="input-field with-prefix with-suffix"
                    placeholder="Valor avulso"
                    value={inputs.precoKgMaterial || ''}
                    onChange={onChange}
                  />
                  <span className="input-suffix">/kg</span>
                </div>
              )}
            </div>

          <InputRow label="Energia/Hora" name="custoKwh" prefix="R$" suffix="/h" {...commonProps} />
          <InputRow label="Máquina/Hora (Deprec.)" name="custoDepreciacao" prefix="R$" suffix="/h" {...commonProps} />
        </div>
      </section>

      {/* SEÇÃO 3: Gastos Extras */}
      <section className="input-section card">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="icon-box" style={{background: '#FEF3C7', color: '#D97706'}}><PackagePlus size={18} /></div>
            <div>
              <h3>Gastos Extras</h3>
              <span style={{fontSize: '0.72rem', color: '#D97706', fontWeight: '600', background: '#FEF9EE', padding: '1px 7px', borderRadius: '10px'}}>por unidade</span>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onManageInsumos} 
            className="btn-outline btn-sm" 
            style={{ 
              padding: '4px 10px', 
              fontSize: '0.75rem', 
              display: 'flex', 
              alignItems: 'center', 
              gap: '4px', 
              borderColor: 'var(--border-color)', 
              color: 'var(--text-secondary)',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            ⚙️ Gerenciar Insumos
          </button>
        </div>
        
        <div className="extras-stack">
          <ExtraRow index={1} inputs={inputs} onChange={onChange} showLabels onSelectInsumoClick={onSelectInsumoClick} />
          <ExtraRow index={2} inputs={inputs} onChange={onChange} onSelectInsumoClick={onSelectInsumoClick} />
          <ExtraRow index={3} inputs={inputs} onChange={onChange} onSelectInsumoClick={onSelectInsumoClick} />
        </div>
        <p className="extras-hint">Cada valor é somado ao custo unitário da peça (não dividido pelo lote).</p>
      </section>

      {/* SEÇÃO 4: Loja Própria / Site */}
      {!isCustomProduct && (
        <section className="input-section card card-full">
          <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div className="icon-box" style={{ background: '#EDE9FE', color: '#7C3AED' }}><Globe size={18} /></div>
              <div>
                <h3 style={{ margin: 0 }}>Loja Própria (aem3d.com.br)</h3>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Fotos, categorias e descrição exibidas no site (o preço vem da aba Vendas → Site Próprio)
                </span>
              </div>
            </div>

            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: inputs.anunciarSite ? '1.5px solid #10B981' : '1px solid var(--border-color)',
                background: inputs.anunciarSite ? 'rgba(16, 185, 129, 0.1)' : 'var(--bg-secondary)',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '0.85rem',
                color: inputs.anunciarSite ? '#059669' : 'var(--text-primary)',
              }}
            >
              <input
                type="checkbox"
                name="anunciarSite"
                checked={Boolean(inputs.anunciarSite)}
                onChange={(e) => onChange({ target: { name: 'anunciarSite', value: e.target.checked } })}
                style={{ width: '16px', height: '16px', accentColor: '#10B981', cursor: 'pointer' }}
              />
              <span>Anunciar no Site Próprio</span>
            </label>
          </div>

          {/* Barra de Importação do Mercado Livre */}
          {onImportFromMl && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(251, 191, 36, 0.08)',
                border: '1px solid rgba(251, 191, 36, 0.35)',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
                <Download size={16} color="#D97706" />
                {mlLinkedListings.length > 0 ? (
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                    Vinculado ao ML: <strong>{mlLinkedListings[0].ml_item_id}</strong> — {mlLinkedListings[0].title}
                  </span>
                ) : (
                  <select
                    value={selectedMlId}
                    onChange={(e) => setSelectedMlId(e.target.value)}
                    style={{
                      flex: 1,
                      maxWidth: '380px',
                      padding: '6px 10px',
                      borderRadius: '7px',
                      border: '1px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
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
                  padding: '6px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  background: importingMl ? '#94A3B8' : '#F59E0B',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: importingMl || (!mlLinkedListings.length && !selectedMlId) ? 'not-allowed' : 'pointer',
                  opacity: (!mlLinkedListings.length && !selectedMlId) ? 0.55 : 1,
                }}
              >
                {importingMl ? '⏳ Importando do ML...' : '⬇️ Puxar Fotos, Descrição e Medidas do ML'}
              </button>
            </div>
          )}

          {/* Título Comercial */}
          <div className="input-group" style={{ marginBottom: '1rem' }}>
            <label>Título Comercial no Site (se vazio, usa o Nome do Projeto/Peça)</label>
            <div className="input-wrapper">
              <input
                type="text"
                name="tituloLoja"
                value={inputs.tituloLoja || ''}
                onChange={onChange}
                placeholder={inputs.nomePeca || 'Ex: Porta Batom Organizador 3D'}
              />
            </div>
          </div>

          {/* Categorias Múltiplas */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                <Tag size={14} /> Categorias no Site (pode marcar várias)
              </label>
              {onManageCategorias && (
                <button
                  type="button"
                  onClick={onManageCategorias}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 700 }}
                >
                  ⚙️ Gerenciar Categorias
                </button>
              )}
            </div>

            {categorias.length === 0 ? (
              <div style={{ padding: '10px', borderRadius: '8px', border: '1px dashed var(--border-color)', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Nenhuma categoria criada ainda. Clique em <strong>⚙️ Gerenciar Categorias</strong> para criar (ex: Chaveiros, Religiosos, Natal, Articulados, Sensoriais).
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {categorias.filter((c) => c.ativo !== false).map((cat) => {
                  const selected = Array.isArray(inputs.categoriasLoja) && inputs.categoriasLoja.includes(cat.id);
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => onToggleCategoria && onToggleCategoria(cat.id)}
                      style={{
                        padding: '5px 12px',
                        borderRadius: '999px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: selected ? '1.5px solid #7C3AED' : '1px solid var(--border-color)',
                        background: selected ? 'rgba(124, 58, 237, 0.14)' : 'var(--bg-secondary)',
                        color: selected ? '#7C3AED' : 'var(--text-secondary)',
                        transition: 'all 0.15s',
                      }}
                    >
                      {selected ? '✓ ' : ''}{cat.nome}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Descrição */}
          <div className="input-group" style={{ marginBottom: '1rem' }}>
            <label>Descrição do Produto para a Loja</label>
            <textarea
              name="descricaoLoja"
              rows={4}
              value={inputs.descricaoLoja || ''}
              onChange={onChange}
              placeholder="Descreva material, acabamento, uso, tamanho aproximado..."
              style={{
                width: '100%',
                padding: '0.7rem 0.85rem',
                borderRadius: '8px',
                border: '1px solid var(--border-color)',
                background: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Fotos do Produto (até 8) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                Fotos do Produto ({(inputs.fotosLoja || []).length}/8) — a 1ª foto é a capa na loja
              </label>
              <label
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  background: 'var(--accent-primary)',
                  color: '#fff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: uploadingFotos ? 'wait' : 'pointer',
                  opacity: uploadingFotos ? 0.65 : 1,
                }}
              >
                <ImagePlus size={14} />
                {uploadingFotos ? 'Enviando...' : '+ Adicionar Fotos'}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadingFotos}
                  onChange={(e) => {
                    if (e.target.files?.length && onUploadFotos) {
                      onUploadFotos(Array.from(e.target.files));
                    }
                    e.target.value = '';
                  }}
                  style={{ display: 'none' }}
                />
              </label>
            </div>

            {(inputs.fotosLoja || []).length === 0 ? (
              <div style={{ padding: '14px', borderRadius: '8px', border: '1px dashed var(--border-color)', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Nenhuma foto adicionada ainda. Você pode enviar fotos do computador ou puxar direto do Mercado Livre acima.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: '10px' }}>
                {(inputs.fotosLoja || []).map((url, idx) => (
                  <div
                    key={`${url}_${idx}`}
                    style={{
                      position: 'relative',
                      borderRadius: '8px',
                      border: idx === 0 ? '2px solid #7C3AED' : '1px solid var(--border-color)',
                      overflow: 'hidden',
                      background: 'var(--bg-secondary)',
                      aspectRatio: '1 / 1',
                    }}
                  >
                    <img src={url} alt={`Foto ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    {idx === 0 && (
                      <span style={{ position: 'absolute', top: '4px', left: '4px', background: '#7C3AED', color: '#fff', fontSize: '0.62rem', fontWeight: 800, padding: '1px 5px', borderRadius: '4px' }}>
                        CAPA
                      </span>
                    )}
                    <div style={{ position: 'absolute', bottom: '4px', left: '4px', right: '4px', display: 'flex', justifyContent: 'space-between', gap: '3px' }}>
                      <div style={{ display: 'flex', gap: '3px' }}>
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => onMoveFoto && onMoveFoto(idx, -1)}
                            title="Mover para esquerda"
                            style={{ background: 'rgba(15,23,42,0.75)', color: '#fff', border: 'none', borderRadius: '4px', padding: '1px 5px', fontSize: '0.7rem', cursor: 'pointer' }}
                          >
                            ←
                          </button>
                        )}
                        {idx < (inputs.fotosLoja || []).length - 1 && (
                          <button
                            type="button"
                            onClick={() => onMoveFoto && onMoveFoto(idx, 1)}
                            title="Mover para direita"
                            style={{ background: 'rgba(15,23,42,0.75)', color: '#fff', border: 'none', borderRadius: '4px', padding: '1px 5px', fontSize: '0.7rem', cursor: 'pointer' }}
                          >
                            →
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveFoto && onRemoveFoto(idx)}
                        title="Remover foto"
                        style={{ background: 'rgba(220,38,38,0.85)', color: '#fff', border: 'none', borderRadius: '4px', padding: '1px 6px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

    </div>
  );
}
