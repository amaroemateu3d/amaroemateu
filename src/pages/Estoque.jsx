import { useState, useEffect } from 'react';
import { Package, Search, Plus, Minus, Save, Loader, AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Estoque.css';

export default function Estoque() {
  const { session } = useAuth();
  const [fts, setFts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [adjustments, setAdjustments] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchEstoque();
  }, []);

  const fetchEstoque = async () => {
    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      const resp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=id,data,estoque&order=id.asc`, { headers });
      if (resp.ok) {
        const data = await resp.json();
        const cleanFts = data.map(r => ({
          id: r.id,
          nome: r.data?.nomePeca || 'Produto sem nome',
          estoque: r.estoque || 0
        }));
        setFts(cleanFts);
      }
    } catch (e) {
      console.error('Erro ao buscar estoque:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAdjustmentChange = (id, value) => {
    setAdjustments(prev => ({
      ...prev,
      [id]: value
    }));
  };

  const calculateNewStock = (currentStock, adjustment) => {
    if (!adjustment) return currentStock;
    const isAbsolute = adjustment.startsWith('=');
    if (isAbsolute) {
      const val = parseInt(adjustment.substring(1));
      return isNaN(val) ? currentStock : val;
    }
    const val = parseInt(adjustment);
    if (isNaN(val)) return currentStock;
    return currentStock + val;
  };

  const applyAdjustments = (id) => {
    const adjustment = adjustments[id];
    if (!adjustment) return;
    
    const item = fts.find(f => f.id === id);
    if (!item) return;

    const newStock = calculateNewStock(item.estoque, adjustment);
    
    // Atualiza individualmente no DB
    saveStockUpdate(id, newStock);
  };

  const saveStockUpdate = async (id, newStock) => {
    setSaving(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const resp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${id}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ estoque: newStock })
      });

      if (!resp.ok) throw new Error('Falha ao atualizar estoque');
      
      // Atualiza estado local
      setFts(prev => prev.map(f => f.id === id ? { ...f, estoque: newStock } : f));
      
      // Limpa ajuste
      setAdjustments(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

    } catch (e) {
      console.error('Erro ao salvar ajuste de estoque', e);
      alert('Erro ao salvar estoque.');
    } finally {
      setSaving(false);
    }
  };

  const saveAllAdjustments = async () => {
    const keys = Object.keys(adjustments).filter(k => adjustments[k]);
    if (keys.length === 0) return;
    
    setSaving(true);
    let errorCount = 0;
    
    for (const id of keys) {
      const adjustment = adjustments[id];
      const item = fts.find(f => f.id === id);
      if (item) {
        const newStock = calculateNewStock(item.estoque, adjustment);
        try {
          const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
          const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const resp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${id}`, {
            method: 'PATCH',
            headers: { 
              'apikey': SUPA_KEY, 
              'Authorization': `Bearer ${SUPA_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ estoque: newStock })
          });
          if (resp.ok) {
            setFts(prev => prev.map(f => f.id === id ? { ...f, estoque: newStock } : f));
          } else {
            errorCount++;
          }
        } catch (e) {
          errorCount++;
        }
      }
    }
    
    if (errorCount > 0) alert(`Houve erro ao salvar ${errorCount} itens.`);
    setAdjustments({});
    setSaving(false);
  };

  const filteredFts = fts.filter(f => 
    f.nome.toLowerCase().includes(searchTerm.toLowerCase()) || 
    f.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="page-wrapper estoque-page">
      <div className="estoque-header">
        <div>
          <h1 className="page-title"><Package size={28} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '10px' }} />Controle de Estoque</h1>
          <p className="page-description">Gerencie a quantidade física disponível das suas peças.</p>
        </div>
        <div style={{ display: 'flex', gap: '15px' }}>
          <div className="search-bar" style={{ width: '300px' }}>
            <span className="search-icon"><Search size={18} /></span>
            <input 
              type="text" 
              placeholder="Buscar por ID ou Nome..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
            />
          </div>
          <button 
            className="btn-primary" 
            onClick={saveAllAdjustments} 
            disabled={saving || Object.keys(adjustments).filter(k => adjustments[k]).length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {saving ? <Loader size={18} className="spin" /> : <Save size={18} />}
            Salvar Lote
          </button>
        </div>
      </div>

      <div className="card">
        <div className="alert alert-info" style={{ marginBottom: '1.5rem', display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#EFF6FF', color: '#1E40AF', padding: '12px 16px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
          <AlertCircle size={20} />
          <div>
            <strong>Dica de Ajuste:</strong> Digite um número para somar/subtrair (ex: <code>5</code>, <code>-2</code>) ou use <code>=</code> para definir um valor exato (ex: <code>=10</code>). Pressione Enter para salvar individualmente.
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem' }}>
            <Loader size={40} className="spinner" color="var(--primary)" style={{ marginBottom: '1rem' }} />
            <p>Carregando estoque...</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="estoque-table">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>ID</th>
                  <th>Produto</th>
                  <th style={{ width: '150px', textAlign: 'center' }}>Em Estoque</th>
                  <th style={{ width: '200px' }}>Ajuste</th>
                  <th style={{ width: '150px', textAlign: 'center' }}>Novo Saldo</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {filteredFts.length > 0 ? filteredFts.map(item => {
                  const adjustment = adjustments[item.id] || '';
                  const newStock = calculateNewStock(item.estoque, adjustment);
                  const isModified = adjustment !== '';

                  return (
                    <tr key={item.id} className={isModified ? 'row-modified' : ''}>
                      <td><span className="badge">{item.id}</span></td>
                      <td style={{ fontWeight: '500' }}>{item.nome}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className={`stock-badge ${item.estoque <= 0 ? 'stock-zero' : 'stock-ok'}`}>
                          {item.estoque} un
                        </div>
                      </td>
                      <td>
                        <input 
                          type="text" 
                          className="adjustment-input" 
                          placeholder="ex: +5, -2, =10" 
                          value={adjustment}
                          onChange={(e) => handleAdjustmentChange(item.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') applyAdjustments(item.id);
                          }}
                        />
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold', color: isModified ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                        {isModified ? `${newStock} un` : '-'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button 
                          className={`btn-icon ${isModified ? 'btn-save-active' : ''}`} 
                          disabled={!isModified || saving}
                          onClick={() => applyAdjustments(item.id)}
                          title="Salvar ajuste"
                        >
                          <Save size={18} />
                        </button>
                      </td>
                    </tr>
                  )
                }) : (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>Nenhum produto encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
