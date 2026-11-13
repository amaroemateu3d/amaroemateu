export default function SiteCategoriasModal({
  isOpen,
  onClose,
  categorias = [],
  newCategoriaName,
  setNewCategoriaName,
  onAddCategoria,
  onSeedCategorias,
  onToggleAtivo,
  onDeleteCategoria,
}) {
  if (!isOpen) return null;

  return (
    <div
      className="modal-fullscreen"
      style={{
        backgroundColor: 'rgba(15, 23, 42, 0.45)',
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
          width: '560px',
          maxWidth: '95%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '1.5rem',
          background: 'var(--bg-surface)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>🏷️ Categorias da Loja (aem3d.com.br)</h3>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            style={{ fontSize: '1.2rem', color: 'var(--text-secondary)' }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: 0, marginBottom: '1rem' }}>
          Crie as categorias que aparecerão no menu do site. Você pode marcar <strong>várias categorias</strong> em um mesmo produto (ex.: um chaveiro articulado em <em>Chaveiros</em> e <em>Articulados</em>).
        </p>

        <form onSubmit={onAddCategoria} style={{ display: 'flex', gap: '10px', marginBottom: '1rem', alignItems: 'center' }}>
          <input
            type="text"
            className="input-field"
            value={newCategoriaName}
            onChange={(e) => setNewCategoriaName(e.target.value)}
            placeholder="Ex: Chaveiros, Religiosos, Natal, Articulados..."
            style={{ flex: 1, margin: 0 }}
            required
          />
          <button type="submit" className="btn-primary" style={{ padding: '0.7rem 1.1rem', whiteSpace: 'nowrap' }}>
            + Adicionar
          </button>
        </form>

        {categorias.length === 0 && (
          <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={onSeedCategorias}
              className="btn-secondary"
              style={{ border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)', fontWeight: 700 }}
            >
              ✨ Criar Categorias Iniciais (Chaveiros, Religiosos, Natal, Articulados, Sensoriais, Decoração, Kits)
            </button>
          </div>
        )}

        <div style={{ overflowY: 'auto', flex: 1, border: '1px solid var(--border-color)', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead style={{ background: 'var(--bg-secondary)', position: 'sticky', top: 0 }}>
              <tr>
                <th style={{ padding: '0.7rem 1rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}>Categoria</th>
                <th style={{ padding: '0.7rem 1rem', borderBottom: '1px solid var(--border-color)', color: 'var(--text-secondary)', width: '110px', textAlign: 'center' }}>Visível no Site</th>
                <th style={{ padding: '0.7rem 1rem', borderBottom: '1px solid var(--border-color)', width: '60px', textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((cat) => (
                <tr key={cat.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '0.65rem 1rem', fontWeight: 600 }}>
                    {cat.nome}
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>/{cat.slug}</div>
                  </td>
                  <td style={{ padding: '0.65rem 1rem', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={cat.ativo !== false}
                      onChange={() => onToggleAtivo(cat)}
                      style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#10B981' }}
                    />
                  </td>
                  <td style={{ padding: '0.65rem 1rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn-icon"
                      style={{ color: 'var(--danger)', padding: '4px' }}
                      onClick={() => onDeleteCategoria(cat.id)}
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
              {categorias.length === 0 && (
                <tr>
                  <td colSpan="3" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                    Nenhuma categoria cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
