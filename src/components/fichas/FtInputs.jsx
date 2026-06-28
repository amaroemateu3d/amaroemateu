import { Settings2, Zap, PackagePlus } from 'lucide-react';

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

export default function FtInputs({ inputs, onChange, savedFts = [], onManageInsumos, onSelectInsumoClick }) {
  
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
                {Array.from({length: 150}, (_, i) => {
                  const id = `FT-${String(i+1).padStart(2, '0')}`;
                  const hasSaved = savedFts.find(f => f.indiceFt === id);
                  const displayLabel = hasSaved ? `${id} - ${hasSaved.nomePeca}` : `${id} (Vazio)`;
                  return <option key={id} value={id}>{displayLabel}</option>;
                })}
              </select>
            </div>
          </div>
          <div className="input-group" style={{gridColumn: 'span 2'}}>
            <label>Nome do Projeto/Peça</label>
            <div className="input-wrapper">
               <input type="text" name="nomePeca" value={inputs.nomePeca} onChange={onChange} />
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
          <InputRow label="Preço Filamento" name="precoKgMaterial" prefix="R$" suffix="/kg" {...commonProps} />
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

    </div>
  );
}
