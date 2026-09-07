const fs = require('fs');
const path = './src/pages/FichasTecnicas.jsx';
let content = fs.readFileSync(path, 'utf8');

const insumosModalRegex = /\{\/\* MODAL GERENCIAR INSUMOS \*\/\}/;
const filamentosModal = `
      {/* MODAL GERENCIAR FILAMENTOS */}
      {showFilamentosManager && (
        <div className="modal-fullscreen" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
          <div className="card" style={{ width: '550px', maxWidth: '95%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '1.5rem', background: 'var(--bg-surface)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h3 style={{ margin: 0 }}>⚙️ Gerenciar Preços de Filamentos</h3>
              <button className="btn-icon" onClick={() => setShowFilamentosManager(false)} style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}>✕</button>
            </div>
            
            <p style={{fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem', marginTop: 0}}>
              Atualizar o preço de um filamento nesta tela irá <strong>recalcular automaticamente</strong> todas as Fichas Técnicas que o utilizam, e consequentemente os custos nos canais de venda!
            </p>

            <form onSubmit={handleAddFilamento} style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem', alignItems: 'flex-end', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Nome do Filamento (ex: PLA Silk)</label>
                <input type="text" className="input-field" value={newFilamento.nome} onChange={e => setNewFilamento({...newFilamento, nome: e.target.value})} placeholder="Nome" required />
              </div>
              <div style={{ width: '120px' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Custo/Kg (R$)</label>
                <input type="number" step="0.01" className="input-field" value={newFilamento.preco_kg} onChange={e => setNewFilamento({...newFilamento, preco_kg: e.target.value})} placeholder="120.00" required />
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '0.75rem 1rem' }}>Adicionar</button>
            </form>

            <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--border-color)', borderRadius: '8px' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
                  <tr>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600 }}>Nome</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', fontWeight: 600, width: '130px' }}>Custo (Kg)</th>
                    <th style={{ padding: '0.75rem', borderBottom: '1px solid var(--border-color)', width: '60px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filamentos.map(fil => (
                    <tr key={fil.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem', fontWeight: 500 }}>{fil.nome}</td>
                      <td style={{ padding: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={{color: 'var(--text-secondary)', marginRight: '4px', fontSize: '0.8rem'}}>R$</span>
                          <input 
                            type="number" 
                            className="input-field" 
                            style={{ padding: '4px 8px', margin: 0, height: '30px', fontSize: '0.9rem', width: '80px' }} 
                            defaultValue={fil.preco_kg}
                            onBlur={(e) => handleUpdateFilamentoCost(fil, e.target.value)}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                        <button className="btn-icon" style={{ color: 'var(--danger)', padding: '4px' }} onClick={() => handleDeleteFilamento(fil.id)}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                  {filamentos.length === 0 && (
                    <tr><td colSpan="3" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Nenhum filamento cadastrado.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {isUpdatingFts && <p style={{ color: 'var(--accent-primary)', textAlign: 'center', marginTop: '1rem', fontWeight: 'bold' }}>Atualizando Fichas Técnicas em lote...</p>}
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR INSUMOS */}
`;

content = content.replace(insumosModalRegex, filamentosModal);

// Also pass the filamentos info down to FtInputs
content = content.replace(
  /onSelectInsumoClick=\{\(index\) => setSelectInsumoIndex\(index\)\}/,
  `onSelectInsumoClick={(index) => setSelectInsumoIndex(index)}
                filamentos={filamentos}
                onManageFilamentos={() => setShowFilamentosManager(true)}`
);

fs.writeFileSync(path, content, 'utf8');
console.log('Modal patched');
