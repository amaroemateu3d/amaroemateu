const fs = require('fs');
const path = './src/components/fichas/FtInputs.jsx';
let content = fs.readFileSync(path, 'utf8');

// Update function signature to receive new props
content = content.replace(
  /export default function FtInputs\(\{ inputs, onChange, savedFts = \[\], onManageInsumos, onSelectInsumoClick, isCustomProduct = false \}\) \{/,
  `export default function FtInputs({ inputs, onChange, savedFts = [], onManageInsumos, onSelectInsumoClick, isCustomProduct = false, filamentos = [], onManageFilamentos }) {`
);

// Replace InputRow for precoKgMaterial
const oldInput = `<InputRow label="Preço Filamento" name="precoKgMaterial" prefix="R$" suffix="/kg" {...commonProps} />`;
const newInput = `
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
`;

// There might be encoding issues with `Preço` in the file. Let's try matching with regex to be safe.
const oldInputRegex = /<InputRow label="Pre..o Filamento" name="precoKgMaterial".*?\/>/;
content = content.replace(oldInputRegex, newInput);

fs.writeFileSync(path, content, 'utf8');
console.log('FtInputs patched');
