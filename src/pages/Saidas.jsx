import { useState, useEffect } from 'react';
import { Trash2, TrendingDown, Calendar, Search, Loader } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Saidas.css'; // Módulo de CSS independente (se precisarmos logo)

const CATEGORIAS = [
  { id: 'materiais', label: '📦 Matéria-Prima / Insumos' },
  { id: 'contas', label: '⚡ Contas Fixo/Mensal' },
  { id: 'manutencao', label: '🛠️ Máquina / Manutenção' },
  { id: 'diversos', label: '📄 Diversos / Administrativo' }
];

export default function Saidas() {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [saidas, setSaidas] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Form State
  const [formData, setFormData] = useState({
    data: new Date().toISOString().split('T')[0],
    descricao: '',
    categoria: 'materiais',
    valor: ''
  });

  useEffect(() => {
    fetchSaidas();
  }, [currentMonth]);

  const fetchSaidas = async () => {
    setLoading(true);
    try {
      const [year, month] = currentMonth.split('-');
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const resp = await fetch(
        `${SUPA_URL}/rest/v1/expenses?select=*&year=eq.${year}&month=eq.${month}&order=date.desc`,
        {
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
        }
      );
      
      if (!resp.ok) {
        console.error('Erro ao buscar saídas via fetch:', resp.status);
      } else {
        const data = await resp.json();
        setSaidas(data || []);
      }
    } catch (e) {
      console.error('Exceção ao buscar saídas:', e);
    } finally {
      setLoading(false);
    }
  };


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let safeVal = value;
    if (name === 'valor' && typeof value === 'string') {
      safeVal = value.replace(',', '.');
    }
    setFormData(prev => ({ ...prev, [name]: safeVal }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.descricao.trim() || !formData.valor || isNaN(Number(formData.valor))) {
      return alert("Preencha a descrição e o valor monetário corretamente.");
    }

    const [yearStr, monthStr] = formData.data.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr);

    const novaSaida = {
      id: `S-${Date.now()}`,
      year,
      month,
      date: formData.data,
      description: formData.descricao,
      category: formData.categoria,
      amount: Number(formData.valor),
      type: 'expense'
    };

    const { error } = await supabase
      .from('expenses')
      .insert([novaSaida]);

    if (error) {
      console.error('Erro ao salvar saída:', error);
      alert('Erro ao salvar no banco de dados.');
      return;
    }

    if (`${year}-${String(month).padStart(2, '0')}` === currentMonth) {
      setSaidas(prev => [novaSaida, ...prev].sort((a,b) => b.date.localeCompare(a.date)));
    }

    setFormData(prev => ({
      ...prev,
      descricao: '',
      valor: ''
    }));
  };

  const handleDelete = async (id) => {
    if (window.confirm("Apagar definitivamente este lançamento?")) {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Erro ao deletar:', error);
        alert('Erro ao deletar registro.');
      } else {
        setSaidas(saidas.filter(s => s.id !== id));
      }
    }
  };

  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const totalDoMes = saidas.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  return (
    <div className="page-wrapper saidas-page">
      <div className="saidas-header">
         <div>
            <h1 className="page-title">Relatório de Saídas e Despesas</h1>
            <p className="page-description">Cadastre notas, compras, energia e gastos internos rotineiros.</p>
         </div>
         <div className="month-selector" style={{display: 'flex', alignItems: 'center', gap: '0.8rem'}}>
            <Calendar size={20} color="var(--text-secondary)" />
            <input 
              type="month" 
              value={currentMonth} 
              onChange={(e) => setCurrentMonth(e.target.value)} 
            />
         </div>
      </div>

      <div className="saidas-grid">
         {/* Painel Esquerdo: Cadastro / Status */}
         <div className="saidas-left">
            <div className="card balance-card">
               <div className="balance-icon"><TrendingDown size={28} /></div>
               <p className="balance-label">Total de Despesas em {currentMonth}</p>
               <h2 className="balance-value">{formatCurrency(totalDoMes)}</h2>
            </div>

            <div className="card form-card">
              <h3 style={{marginBottom: '1rem', color: 'var(--text-primary)'}}>Novo Lançamento</h3>
              <form onSubmit={handleSubmit} className="saidas-form">
                
                <div className="input-group">
                  <label>Data Exata da Saída</label>
                  <input type="date" name="data" value={formData.data} onChange={handleInputChange} required />
                </div>

                <div className="input-group">
                  <label>Categoria</label>
                  <select name="categoria" value={formData.categoria} onChange={handleInputChange}>
                     {CATEGORIAS.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                  </select>
                </div>

                <div className="input-group">
                  <label>Descrição</label>
                  <input type="text" name="descricao" value={formData.descricao} onChange={handleInputChange} placeholder="Ex: Rolo de PLA Branco" required />
                </div>

                <div className="input-group">
                  <label>Valor Monetário</label>
                  <div className="input-wrapper">
                    <span className="prefix">R$</span>
                    <input type="number" step="any" name="valor" className="has-prefix" value={formData.valor} onChange={handleInputChange} placeholder="0.00" autoFocus required />
                  </div>
                </div>

                <button type="submit" className="btn-primary" style={{width: '100%', marginTop: '0.5rem', background: 'var(--danger)', borderColor: 'var(--danger)'}}>
                  Registrar Saída (Gasto)
                </button>
              </form>
            </div>
         </div>

         {/* Painel Direito: Listagem do Mês */}
         <div className="saidas-right">
            <div className="card list-card">
               <h3 style={{marginBottom: '1rem', color: 'var(--text-primary)'}}>Histórico de {currentMonth}</h3>
               
                {loading ? (
                  <div className="empty-state" style={{padding: '3rem 0'}}>
                     <Loader size={40} className="spinner" color="var(--primary)" style={{marginBottom: '1rem'}} />
                     <p>Carregando despesas da nuvem...</p>
                  </div>
                ) : saidas.length === 0 ? (
                  <div className="empty-state">
                     <Search size={40} color="var(--text-muted)" style={{marginBottom: '1rem'}} />
                     <p>Nenhuma despesa ou compra cadastrada neste mês.</p>
                  </div>
                ) : (
                  <div className="saidas-table-wrapper">
                    {(() => {
                      const categoriasNoBanco = [...new Set(saidas.map(s => s.category))];
                      const categoriasExtras = categoriasNoBanco
                        .filter(cat => !CATEGORIAS.some(c => c.id === cat))
                        .map(cat => ({ id: cat, label: `📁 ${cat || 'Sem Categoria'} (Antigo)` }));
                      
                      const todasCategorias = [...CATEGORIAS, ...categoriasExtras];

                      return todasCategorias.map(cat => {
                        const itensDaCat = saidas.filter(s => s.category === cat.id);
                        if (itensDaCat.length === 0) return null;

                        const totalCat = itensDaCat.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

                        return (
                          <div key={cat.id} className="category-group" style={{marginBottom: '2rem'}}>
                            <div className="category-header-row" style={{
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'center',
                              padding: '0.5rem 1rem',
                              background: 'var(--bg-primary)',
                              borderRadius: '8px',
                              marginBottom: '0.5rem',
                              borderLeft: '4px solid var(--danger)'
                            }}>
                              <h4 style={{margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)'}}>{cat.label}</h4>
                              <span style={{fontWeight: 'bold', color: 'var(--danger)', fontSize: '0.9rem'}}>Subtotal: {formatCurrency(totalCat)}</span>
                            </div>

                            <table className="saidas-table">
                              <thead>
                                 <tr>
                                    <th>Data</th>
                                    <th>Descrição</th>
                                    <th style={{textAlign: 'right'}}>Valor</th>
                                    <th style={{width: '60px'}}>Ação</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {itensDaCat.map(item => (
                                    <tr key={item.id}>
                                       <td style={{width: '100px'}}>
                                         <span className="date-badge">
                                           {item.date ? item.date.split('-').reverse().join('/') : '-'}
                                         </span>
                                       </td>
                                       <td style={{fontWeight: '500', color: 'var(--text-primary)'}}>{item.description}</td>
                                       <td style={{textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)'}}>
                                         - {formatCurrency(Number(item.amount || 0))}
                                       </td>
                                       <td style={{textAlign: 'center'}}>
                                         <button type="button" className="btn-icon" onClick={() => handleDelete(item.id)} title="Excluir">
                                            <Trash2 size={16} color="var(--text-secondary)" />
                                         </button>
                                       </td>
                                    </tr>
                                 ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
            </div>
         </div>
      </div>
    </div>
  );
}

