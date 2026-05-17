import { useState, useEffect } from 'react';
import { Search, Plus, Trash2, Edit, ExternalLink, Sparkles, Check, X, Loader } from 'lucide-react';
import './PesquisaEcommerce.css';

const INITIAL_FORM_STATE = {
  id: null,
  nome: '',
  link: '',
  is_full: false,
  valor_produto: '',
  vendas_30d: '',
  vendas_dia: '',
  custo_producao: '',
  foto: ''
};

export default function PesquisaEcommerce() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [form, setForm] = useState({ ...INITIAL_FORM_STATE });
  const [isEditing, setIsEditing] = useState(false);
  const [pasteFocus, setPasteFocus] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!SUPA_URL || !SUPA_KEY) return;

      const headers = { 
        'apikey': SUPA_KEY, 
        'Authorization': `Bearer ${SUPA_KEY}` 
      };

      const resp = await fetch(`${SUPA_URL}/rest/v1/pesquisa_ecommerce?select=*&order=created_at.desc`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        setProducts(data || []);
      }
    } catch (e) {
      console.error('Erro ao buscar produtos da pesquisa:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handlePasteImage = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (!file) continue;

        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            // Redimensionamento automático usando Canvas
            const canvas = document.createElement('canvas');
            const maxDim = 300; // Limite de 300px no lado maior para miniatura rápida
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > maxDim) {
                height *= maxDim / width;
                width = maxDim;
              }
            } else {
              if (height > maxDim) {
                width *= maxDim / height;
                height = maxDim;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Exporta como JPEG compacto (70% de qualidade)
            const base64Data = canvas.toDataURL('image/jpeg', 0.7);
            setForm(prev => ({ ...prev, foto: base64Data }));
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
        e.preventDefault();
        break;
      }
    }
  };

  const handleRemoveImage = (e) => {
    e.stopPropagation();
    setForm(prev => ({ ...prev, foto: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) return alert('Por favor, informe o nome do produto.');

    setSaving(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const payload = {
        nome: form.nome,
        link: form.link,
        is_full: form.is_full,
        valor_produto: parseFloat(form.valor_produto) || 0,
        vendas_30d: parseInt(form.vendas_30d) || 0,
        vendas_dia: parseInt(form.vendas_dia) || 0,
        custo_producao: parseFloat(form.custo_producao) || 0,
        foto: form.foto || null
      };

      if (isEditing && form.id) {
        // Modo Edição (PATCH)
        const resp = await fetch(`${SUPA_URL}/rest/v1/pesquisa_ecommerce?id=eq.${form.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPA_KEY,
            'Authorization': `Bearer ${SUPA_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(payload)
        });

        if (!resp.ok) throw new Error('Erro ao atualizar produto');
      } else {
        // Modo Criação (POST)
        const resp = await fetch(`${SUPA_URL}/rest/v1/pesquisa_ecommerce`, {
          method: 'POST',
          headers: {
            'apikey': SUPA_KEY,
            'Authorization': `Bearer ${SUPA_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(payload)
        });

        if (!resp.ok) throw new Error('Erro ao cadastrar produto');
      }

      // Limpar formulário e re-buscar lista
      setForm({ ...INITIAL_FORM_STATE });
      setIsEditing(false);
      await fetchProducts();
    } catch (err) {
      console.error(err);
      alert('Ocorreu um erro ao salvar o produto.');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (prod) => {
    setForm({
      id: prod.id,
      nome: prod.nome || '',
      link: prod.link || '',
      is_full: !!prod.is_full,
      valor_produto: prod.valor_produto !== undefined ? String(prod.valor_produto) : '',
      vendas_30d: prod.vendas_30d !== undefined ? String(prod.vendas_30d) : '',
      vendas_dia: prod.vendas_dia !== undefined ? String(prod.vendas_dia) : '',
      custo_producao: prod.custo_producao !== undefined ? String(prod.custo_producao) : '',
      foto: prod.foto || ''
    });
    setIsEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Deseja realmente excluir a pesquisa do produto "${name}"?`)) return;

    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const resp = await fetch(`${SUPA_URL}/rest/v1/pesquisa_ecommerce?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`
        }
      });

      if (!resp.ok) throw new Error('Erro ao excluir produto');
      
      // Atualizar lista local
      setProducts(prev => prev.filter(p => p.id !== id));
      if (form.id === id) {
        setForm({ ...INITIAL_FORM_STATE });
        setIsEditing(false);
      }
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir o produto.');
    }
  };

  const handleCancelEdit = () => {
    setForm({ ...INITIAL_FORM_STATE });
    setIsEditing(false);
  };

  // Cálculos rápidos para o formulário
  const calcValorProduto = parseFloat(form.valor_produto) || 0;
  const calcCustoProducao = parseFloat(form.custo_producao) || 0;
  const calcLucroUnit = calcValorProduto - calcCustoProducao;
  const calcMargem = calcValorProduto > 0 ? (calcLucroUnit / calcValorProduto) * 100 : 0;

  const filteredProducts = products.filter(p => 
    (p.nome || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-wrapper pesquisa-page">
      <div className="pesquisa-header">
        <div>
          <h1 className="page-title">
            <Sparkles size={28} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px', color: 'var(--accent-primary)' }} />
            Pesquisa E-commerce
          </h1>
          <p className="page-description">Análise de viabilidade e simulação de produtos para vendas online.</p>
        </div>
      </div>

      <div className="pesquisa-grid">
        {/* Formulário de Cadastro / Edição */}
        <div className="card form-card">
          <h3 style={{ marginBottom: '1.2rem', color: 'var(--text-primary)' }}>
            {isEditing ? '✏️ Editar Produto' : '✨ Cadastrar Novo Produto'}
          </h3>

          <form onSubmit={handleSubmit} onPaste={handlePasteImage}>
            {/* Foto Clipboard */}
            <div className="paste-container">
              <span className="paste-label">Foto do Produto</span>
              <div 
                className={`paste-area ${pasteFocus ? 'focused' : ''}`}
                tabIndex={0}
                onFocus={() => setPasteFocus(true)}
                onBlur={() => setPasteFocus(false)}
                title="Clique aqui e pressione Ctrl+V para colar a foto do produto"
              >
                {form.foto ? (
                  <div className="image-preview-wrapper">
                    <img src={form.foto} alt="Preview" className="image-preview" />
                    <button 
                      type="button" 
                      className="btn-remove-image" 
                      onClick={handleRemoveImage}
                      title="Remover foto"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="paste-icon">📷</span>
                    <span className="paste-text">Clique aqui e cole a foto (Ctrl + V)</span>
                  </>
                )}
              </div>
            </div>

            {/* Nome */}
            <div className="form-group">
              <label>Nome do Produto</label>
              <input 
                type="text" 
                name="nome" 
                className="form-input" 
                placeholder="Ex: Suporte Organizador" 
                value={form.nome} 
                onChange={handleInputChange} 
                required 
              />
            </div>

            {/* Link */}
            <div className="form-group">
              <label>Link de Referência</label>
              <input 
                type="url" 
                name="link" 
                className="form-input" 
                placeholder="Ex: https://produto.mercadolivre.com.br/..." 
                value={form.link} 
                onChange={handleInputChange} 
              />
            </div>

            {/* É Full */}
            <div className="checkbox-group" onClick={() => handleInputChange({ target: { name: 'is_full', type: 'checkbox', checked: !form.is_full } })}>
              <input 
                type="checkbox" 
                name="is_full" 
                className="checkbox-input" 
                checked={form.is_full} 
                onChange={handleInputChange} 
                onClick={(e) => e.stopPropagation()} 
              />
              <span className="checkbox-label">⚡ Produto é FULL</span>
            </div>

            {/* Valor do Produto e Custo de Produção */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>
              <div className="form-group">
                <label>Valor de Venda (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  name="valor_produto" 
                  className="form-input" 
                  placeholder="0.00" 
                  value={form.valor_produto} 
                  onChange={handleInputChange} 
                />
              </div>
              <div className="form-group">
                <label>Custo Produção (R$)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  name="custo_producao" 
                  className="form-input" 
                  placeholder="0.00" 
                  value={form.custo_producao} 
                  onChange={handleInputChange} 
                />
              </div>
            </div>

            {/* Cálculos em Tempo Real no Form */}
            <div className="quick-calc-box">
              <div className="quick-calc-item">
                <span className="quick-calc-label">Lucro Unitário</span>
                <span className={`quick-calc-value ${calcLucroUnit >= 0 ? 'positive' : 'negative'}`}>
                  R$ {calcLucroUnit.toFixed(2)}
                </span>
              </div>
              <div className="quick-calc-item">
                <span className="quick-calc-label">Margem</span>
                <span className={`quick-calc-value ${calcMargem >= 20 ? 'positive' : 'negative'}`}>
                  {calcMargem.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Vendas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem', marginBottom: '1.5rem' }}>
              <div className="form-group">
                <label>Vendas / 30 Dias</label>
                <input 
                  type="number" 
                  min="0" 
                  name="vendas_30d" 
                  className="form-input" 
                  placeholder="Ex: 150" 
                  value={form.vendas_30d} 
                  onChange={handleInputChange} 
                />
              </div>
              <div className="form-group">
                <label>Vendas / Dia</label>
                <input 
                  type="number" 
                  min="0" 
                  name="vendas_dia" 
                  className="form-input" 
                  placeholder="Ex: 5" 
                  value={form.vendas_dia} 
                  onChange={handleInputChange} 
                />
              </div>
            </div>

            {/* Botões */}
            <div style={{ display: 'flex', gap: '8px' }}>
              {isEditing && (
                <button 
                  type="button" 
                  className="btn-submit" 
                  onClick={handleCancelEdit}
                  style={{ backgroundColor: 'var(--text-secondary)', flex: 1 }}
                >
                  Cancelar
                </button>
              )}
              <button 
                type="submit" 
                className="btn-submit" 
                disabled={saving}
                style={{ flex: 2 }}
              >
                {saving ? (
                  <Loader size={18} className="spinner" />
                ) : isEditing ? (
                  <>Salvar Alterações</>
                ) : (
                  <><Plus size={18} /> Cadastrar</>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Catálogo / Listagem de Produtos Pesquisados */}
        <div className="catalog-section">
          <div className="catalog-header">
            <h3 className="catalog-title">
              📚 Catálogo de Pesquisas ({filteredProducts.length})
            </h3>
            <div className="search-bar" style={{ maxWidth: '300px' }}>
              <span className="search-icon">🔍</span>
              <input 
                type="text" 
                placeholder="Filtrar por nome..." 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>

          {loading ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <Loader size={40} className="spinner" color="var(--accent-primary)" style={{ marginBottom: '1rem' }} />
              <p>Buscando pesquisas no banco de dados...</p>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              <p>Nenhuma pesquisa cadastrada ou encontrada para o filtro.</p>
            </div>
          ) : (
            <div className="catalog-cards">
              {filteredProducts.map(p => {
                const profitUnit = (p.valor_produto || 0) - (p.custo_producao || 0);
                const marginPercent = p.valor_produto > 0 ? (profitUnit / p.valor_produto) * 100 : 0;
                
                const faturamentoMes = (p.vendas_30d || 0) * (p.valor_produto || 0);
                const lucroMes = (p.vendas_30d || 0) * profitUnit;
                
                const faturamentoDia = (p.vendas_dia || 0) * (p.valor_produto || 0);
                const lucroDia = (p.vendas_dia || 0) * profitUnit;

                return (
                  <div key={p.id} className="prod-card">
                    {/* Imagem do Produto */}
                    <div className="prod-image-container">
                      {p.foto ? (
                        <img src={p.foto} alt={p.nome} className="prod-img" />
                      ) : (
                        <span className="prod-placeholder-img">📦</span>
                      )}
                      {p.is_full && <span className="badge-full">⚡ FULL</span>}
                      
                      {/* Ações Rápidas em Hover */}
                      <div className="prod-actions">
                        <button 
                          className="btn-card-action edit" 
                          onClick={() => handleEdit(p)}
                          title="Editar"
                        >
                          <Edit size={14} />
                        </button>
                        <button 
                          className="btn-card-action delete" 
                          onClick={() => handleDelete(p.id, p.nome)}
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Corpo do Card */}
                    <div className="prod-body">
                      <div className="prod-name-row">
                        <h4 className="prod-name" title={p.nome}>{p.nome}</h4>
                      </div>
                      
                      {p.link ? (
                        <a href={p.link} target="_blank" rel="noopener noreferrer" className="prod-link">
                          <ExternalLink size={12} /> Acessar Link
                        </a>
                      ) : (
                        <span className="prod-link" style={{ color: 'var(--text-secondary)', cursor: 'default' }}>
                          Sem link associado
                        </span>
                      )}

                      {/* Métricas Principais */}
                      <div className="prod-metrics-grid">
                        <div className="metric-item">
                          <span className="metric-label">Preço</span>
                          <span className="metric-val">R$ {(p.valor_produto || 0).toFixed(2)}</span>
                        </div>
                        <div className="metric-item">
                          <span className="metric-label">Custo Prod.</span>
                          <span className="metric-val">R$ {(p.custo_producao || 0).toFixed(2)}</span>
                        </div>
                        <div className="metric-item">
                          <span className="metric-label">Lucro Unit.</span>
                          <span className="metric-val profit">R$ {profitUnit.toFixed(2)}</span>
                        </div>
                        <div className="metric-item">
                          <span className="metric-label">Margem</span>
                          <span className={`metric-val ${marginPercent >= 20 ? 'profit' : ''}`}>
                            {marginPercent.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Projeções de Desempenho */}
                      <div className="prod-projections">
                        <span className="projection-title">Estimativa Mensal (30d)</span>
                        <div className="projection-row">
                          <span>Vendas:</span>
                          <strong>{p.vendas_30d || 0} un</strong>
                        </div>
                        <div className="projection-row">
                          <span>Faturamento:</span>
                          <strong>R$ {faturamentoMes.toFixed(2)}</strong>
                        </div>
                        <div className="projection-row total-profit">
                          <span>Lucro Estimado:</span>
                          <strong>R$ {lucroMes.toFixed(2)}</strong>
                        </div>

                        <div style={{ height: '1px', background: 'rgba(255,255,255,0.15)', margin: '4px 0' }} />

                        <span className="projection-title">Estimativa Diária</span>
                        <div className="projection-row">
                          <span>Vendas:</span>
                          <strong>{p.vendas_dia || 0} un</strong>
                        </div>
                        <div className="projection-row">
                          <span>Faturamento:</span>
                          <strong>R$ {faturamentoDia.toFixed(2)}</strong>
                        </div>
                        <div className="projection-row total-profit">
                          <span>Lucro Estimado:</span>
                          <strong>R$ {lucroDia.toFixed(2)}</strong>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
