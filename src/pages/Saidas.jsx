import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../supabaseClient';
import {
  Trash2, TrendingDown, Calendar, Search, Loader,
  PlusCircle, ArrowLeft, AlertCircle, FileText, Check
} from 'lucide-react';
import './Saidas.css';
import ConfirmModal from '../components/ConfirmModal';

const CATEGORIAS = [
  { id: 'materiais', label: '📦 Matéria-Prima / Insumos' },
  { id: 'contas', label: '⚡ Contas Fixo/Mensal' },
  { id: 'manutencao', label: '🛠️ Máquina / Manutenção' },
  { id: 'diversos', label: '📄 Diversos / Administrativo' }
];

const MESES = [
  { id: '01', name: 'Janeiro' },
  { id: '02', name: 'Fevereiro' },
  { id: '03', name: 'Março' },
  { id: '04', name: 'Abril' },
  { id: '05', name: 'Maio' },
  { id: '06', name: 'Junho' },
  { id: '07', name: 'Julho' },
  { id: '08', name: 'Agosto' },
  { id: '09', name: 'Setembro' },
  { id: '10', name: 'Outubro' },
  { id: '11', name: 'Novembro' },
  { id: '12', name: 'Dezembro' }
];

// Auxiliar para somar meses mantendo segurança de dias (ex: 31 de jan + 1 mês = 28/29 de fev)
function addMonths(dateStr, monthsToAdd) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1 + monthsToAdd, day);
  
  const expectedMonth = (month - 1 + monthsToAdd) % 12;
  if (date.getMonth() !== expectedMonth && date.getMonth() === (expectedMonth + 1) % 12) {
    date.setDate(0); 
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function Saidas() {
  const { profile } = useAuth();
  
  // Modos de visualização: 'resumo' ou 'detalhes'
  const [viewMode, setViewMode] = useState('resumo');
  const [activeTab, setActiveTab] = useState('listar'); // 'listar' ou 'cadastrar'
  
  // Ano selecionado para o Resumo
  const [currentYear, setCurrentYear] = useState(() => new Date().getFullYear());
  
  // Filtros de listagem
  const [filterMonth, setFilterMonth] = useState(''); // '' significa Todos os meses
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Dados
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: 'save', title: '', details: [], onConfirm: null });
  const openConfirm = (type, title, details, onConfirm) => setConfirmModal({ isOpen: true, type, title, details, onConfirm });
  const closeConfirm = () => setConfirmModal(m => ({ ...m, isOpen: false }));

  // Form State
  const [formData, setFormData] = useState({
    data: new Date().toISOString().split('T')[0],
    descricao: '',
    categoria: 'materiais',
    valor: '',
    parcelado: false,
    numParcelas: '2',
    notes: ''
  });

  useEffect(() => {
    fetchExpenses();

    const channel = supabase
      .channel('realtime-expenses')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'expenses' },
        () => {
          fetchExpenses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentYear]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const firstDay = `${currentYear}-01-01`;
      const lastDay = `${currentYear}-12-31`;
      
      const query = `select=*&date=gte.${firstDay}&date=lte.${lastDay}&order=date.desc`;
      const resp = await fetch(`${SUPA_URL}/rest/v1/expenses?${query}`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
      });
      
      if (!resp.ok) {
        throw new Error(`Erro ao buscar despesas: ${resp.status}`);
      }
      const data = await resp.json();
      setExpenses(data || []);
    } catch (e) {
      console.error('Erro ao buscar despesas:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    let safeVal = type === 'checkbox' ? checked : value;
    if (name === 'valor' && typeof value === 'string') {
      safeVal = value.replace(',', '.');
    }
    setFormData(prev => ({ ...prev, [name]: safeVal }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.descricao.trim() || !formData.valor || isNaN(Number(formData.valor)) || Number(formData.valor) <= 0) {
      return alert("Preencha a descrição e o valor monetário positivo corretamente.");
    }

    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const targetEmpresaId = profile?.empresa_id || 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9';

    const numP = formData.parcelado ? Number(formData.numParcelas) : 1;
    const novosLancamentos = [];

    for (let i = 0; i < numP; i++) {
      const lancamentoDate = addMonths(formData.data, i);
      novosLancamentos.push({
        date: lancamentoDate,
        description: formData.parcelado ? `${formData.descricao} (${i + 1}/${numP})` : formData.descricao,
        category: formData.categoria,
        amount: Number(formData.valor),
        notes: formData.notes ? formData.notes.trim() : null,
        empresa_id: targetEmpresaId
      });
    }

    const catLabel = CATEGORIAS.find(c => c.id === formData.categoria)?.label || formData.categoria;
    openConfirm(
      'save',
      formData.parcelado ? `Lançar ${numP} Parcelas de Despesa` : 'Registrar Despesa',
      [
        { label: 'Descrição', value: formData.descricao },
        { label: 'Categoria', value: catLabel },
        { label: 'Valor por Parcela', value: 'R$ ' + Number(formData.valor).toFixed(2) },
        { label: 'Data Inicial', value: new Date(formData.data + 'T12:00:00').toLocaleDateString('pt-BR') },
        ...(formData.parcelado ? [{ label: 'Parcelas', value: formData.numParcelas + 'x' }, { label: 'Total', value: 'R$ ' + (Number(formData.valor) * numP).toFixed(2) }] : []),
        ...(formData.notes ? [{ label: 'Obs', value: formData.notes }] : [])
      ],
      async () => {
        closeConfirm();
        try {
          const resp = await fetch(`${SUPA_URL}/rest/v1/expenses`, {
            method: 'POST',
            headers: { 
              'apikey': SUPA_KEY, 
              'Authorization': `Bearer ${SUPA_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(novosLancamentos)
          });

          if (!resp.ok) {
            const err = await resp.text();
            throw new Error(err);
          }

          await fetchExpenses(); // Recarrega todas as despesas do ano corrente

          // Limpa formulário mantendo as configurações básicas
          setFormData(prev => ({
            ...prev,
            descricao: '',
            valor: '',
            notes: '',
            parcelado: false,
            numParcelas: '2'
          }));

          alert(formData.parcelado 
            ? `Lançamento parcelado registrado com sucesso! (${numP} despesas geradas).` 
            : 'Despesa registrada com sucesso!'
          );
          
          // Chaveia para a aba de listagem para que o usuário veja o lançamento
          setActiveTab('listar');
          
          // Se a despesa adicionada foi no ano atual, o filtro do mês vai para o mês do lançamento
          const itemMonth = formData.data.substring(5, 7);
          const itemYear = Number(formData.data.substring(0, 4));
          if (itemYear === currentYear) {
            setFilterMonth(itemMonth);
          }
        } catch (e) {
          console.error('Erro ao salvar lançamento:', e);
          alert('Erro ao salvar no banco: ' + e.message);
        }
      }
    );
  };

  const handleDelete = (id) => {
    const expense = expenses.find(e => e.id === id);
    openConfirm(
      'delete',
      'Excluir Lançamento de Despesa',
      [
        { label: 'Descrição', value: expense?.description || '—' },
        { label: 'Valor', value: expense ? 'R$ ' + Number(expense.amount).toFixed(2) : '—' },
        { label: 'Data', value: expense?.date ? new Date(expense.date + 'T12:00:00').toLocaleDateString('pt-BR') : '—' }
      ],
      async () => {
        closeConfirm();
        try {
          const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
          const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const resp = await fetch(`${SUPA_URL}/rest/v1/expenses?id=eq.${id}`, {
            method: 'DELETE',
            headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
          });
          if (!resp.ok) throw new Error('Falha ao excluir');
          setExpenses(prev => prev.filter(s => s.id !== id));
        } catch (e) {
          alert('Erro ao deletar: ' + e.message);
        }
      }
    );
  };

  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  // Cálculos do Ano
  const totalDoAno = expenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  // Calcula totais mensais para a grade de resumo
  const getMonthlySummary = () => {
    return MESES.map(mes => {
      const mesKey = `${currentYear}-${mes.id}`;
      const itensDoMes = expenses.filter(item => item.date && item.date.startsWith(mesKey));
      const total = itensDoMes.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
      return {
        ...mes,
        total,
        count: itensDoMes.length
      };
    });
  };

  const monthlySummary = getMonthlySummary();

  // Filtros aplicados na listagem de detalhes
  const getFilteredExpenses = () => {
    return expenses.filter(item => {
      if (!item.date) return false;
      
      if (filterMonth) {
        const itemMonth = item.date.substring(5, 7);
        if (itemMonth !== filterMonth) return false;
      }
      
      if (filterCategory && item.category !== filterCategory) return false;
      
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const descMatch = item.description?.toLowerCase().includes(query);
        const notesMatch = item.notes?.toLowerCase().includes(query);
        if (!descMatch && !notesMatch) return false;
      }
      
      return true;
    });
  };

  const filteredExpenses = getFilteredExpenses();
  const totalFiltrado = filteredExpenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);

  // Categorias extras do banco para filtros
  const getTodasCategorias = () => {
    const categoriasNoBanco = [...new Set(expenses.map(s => s.category))];
    const categoriasExtras = categoriasNoBanco
      .filter(cat => cat && !CATEGORIAS.some(c => c.id === cat))
      .map(cat => ({ id: cat, label: `📁 ${cat} (Legado)` }));
    return [...CATEGORIAS, ...categoriasExtras];
  };

  const todasCategorias = getTodasCategorias();

  return (
    <div className="page-wrapper saidas-page">
      
      {/* MODO RESUMO ANUAL */}
      {viewMode === 'resumo' && (
        <div className="resumo-anual-view">
          <div className="saidas-header-resumo">
            <div>
              <h1 className="page-title">Relatório de Saídas e Despesas</h1>
              <p className="page-description">Visão consolidade anual e mensal da saúde financeira.</p>
            </div>
            
            <div className="year-navigator">
              <button onClick={() => setCurrentYear(y => y - 1)} className="year-btn">←</button>
              <span className="year-display">{currentYear}</span>
              <button onClick={() => setCurrentYear(y => y + 1)} className="year-btn">→</button>
            </div>
          </div>

          <div className="kpi-row-annual">
            <div className="card annual-kpi-card">
              <div className="annual-kpi-info">
                <TrendingDown size={36} className="annual-kpi-icon" />
                <div>
                  <p className="kpi-label">Total de Despesas Acumuladas em {currentYear}</p>
                  <h2 className="kpi-value">{formatCurrency(totalDoAno)}</h2>
                </div>
              </div>
              <button 
                onClick={() => { setViewMode('detalhes'); setActiveTab('cadastrar'); }} 
                className="btn-add-expense-annual"
              >
                <PlusCircle size={18} />
                Lançar Despesa
              </button>
            </div>
          </div>

          <div className="section-header-row">
            <h2 className="section-subtitle">Detalhamento Mensal</h2>
            <button 
              onClick={() => { setViewMode('detalhes'); setActiveTab('listar'); setFilterMonth(''); }} 
              className="btn-link-gerenciar"
            >
              Consultar Histórico Completo →
            </button>
          </div>

          {loading ? (
            <div className="loading-container">
              <Loader size={48} className="spinner" />
              <p>Carregando dados financeiros de {currentYear}...</p>
            </div>
          ) : (
            <div className="monthly-grid">
              {monthlySummary.map(mes => {
                const isCurrentMonthReal = new Date().getFullYear() === currentYear && String(new Date().getMonth() + 1).padStart(2, '0') === mes.id;
                return (
                  <div 
                    key={mes.id} 
                    className={`card month-card-summary ${isCurrentMonthReal ? 'current-month-highlight' : ''}`}
                    onClick={() => {
                      setFilterMonth(mes.id);
                      setViewMode('detalhes');
                      setActiveTab('listar');
                    }}
                  >
                    <div className="month-card-header">
                      <span className="month-name">{mes.name}</span>
                      {isCurrentMonthReal && <span className="current-badge">Mês Atual</span>}
                    </div>
                    <div className="month-card-body">
                      <h3 className="month-total">{formatCurrency(mes.total)}</h3>
                      <p className="month-count">
                        {mes.count === 0 ? 'Nenhum lançamento' : `${mes.count} ${mes.count === 1 ? 'lançamento' : 'lançamentos'}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODO DETALHADO (LISTAGEM & CADASTRO) */}
      {viewMode === 'detalhes' && (
        <div className="detalhes-view">
          <div className="detalhes-header">
            <button onClick={() => setViewMode('resumo')} className="btn-back">
              <ArrowLeft size={18} />
              Voltar ao Resumo Anual
            </button>
            <h1 className="page-title-detalhes">Gerenciamento de Despesas</h1>
          </div>

          {/* Abas */}
          <div className="tabs-container">
            <button 
              className={`tab-btn ${activeTab === 'listar' ? 'active' : ''}`}
              onClick={() => setActiveTab('listar')}
            >
              <FileText size={18} />
              Consultar Despesas ({expenses.length})
            </button>
            <button 
              className={`tab-btn ${activeTab === 'cadastrar' ? 'active' : ''}`}
              onClick={() => setActiveTab('cadastrar')}
            >
              <PlusCircle size={18} />
              Cadastrar Nova Despesa
            </button>
          </div>

          {/* CONTEÚDO TAB: LISTAGEM */}
          {activeTab === 'listar' && (
            <div className="tab-content list-tab">
              <div className="filters-card card">
                <h3 className="filters-title">Filtros de Busca</h3>
                <div className="filters-grid">
                  <div className="filter-group">
                    <label>Mês de Referência</label>
                    <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}>
                      <option value="">Todos os meses de {currentYear}</option>
                      {MESES.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-group">
                    <label>Categoria</label>
                    <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                      <option value="">Todas as categorias</option>
                      {todasCategorias.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="filter-group search-filter">
                    <label>Buscar Descrição / Notas</label>
                    <div className="search-input-wrapper">
                      <Search size={16} className="search-icon" />
                      <input 
                        type="text" 
                        placeholder="Ex: filamento, energia..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                <div className="filters-summary-row">
                  <div className="filtered-total-badge">
                    <span>Total Filtrado:</span>
                    <strong>{formatCurrency(totalFiltrado)}</strong>
                  </div>
                </div>
              </div>

              <div className="card table-card">
                {loading ? (
                  <div className="loading-container-table">
                    <Loader size={36} className="spinner" />
                    <p>Sincronizando banco de dados...</p>
                  </div>
                ) : filteredExpenses.length === 0 ? (
                  <div className="empty-state">
                    <AlertCircle size={40} color="var(--text-secondary)" style={{ marginBottom: '1rem' }} />
                    <p>Nenhuma despesa localizada com os filtros aplicados.</p>
                  </div>
                ) : (
                  <div className="saidas-table-wrapper">
                    <table className="saidas-table">
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th>Categoria</th>
                          <th>Descrição</th>
                          <th>Notas</th>
                          <th style={{ textAlign: 'right' }}>Valor</th>
                          <th style={{ width: '60px', textAlign: 'center' }}>Excluir</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredExpenses.map(item => {
                          const catObj = todasCategorias.find(c => c.id === item.category);
                          return (
                            <tr key={item.id}>
                              <td style={{ width: '110px' }}>
                                <span className="date-badge">
                                  {item.date ? item.date.split('-').reverse().join('/') : '-'}
                                </span>
                              </td>
                              <td style={{ width: '220px' }}>
                                <span className="cat-badge-simple">
                                  {catObj ? catObj.label : item.category}
                                </span>
                              </td>
                              <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>{item.description}</td>
                              <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{item.notes || '-'}</td>
                              <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--danger)', fontSize: '1rem' }}>
                                - {formatCurrency(Number(item.amount || 0))}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button type="button" className="btn-delete-row" onClick={() => handleDelete(item.id)} title="Excluir despesa">
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CONTEÚDO TAB: CADASTRO */}
          {activeTab === 'cadastrar' && (
            <div className="tab-content register-tab">
              <div className="card form-card-detalhado">
                <h2 className="form-card-title">Novo Lançamento Financeiro</h2>
                <p className="form-card-desc">Registre saídas individuais ou em parcelas mensais.</p>

                <form onSubmit={handleSubmit} className="saidas-form-detalhado">
                  <div className="form-row-double">
                    <div className="input-group">
                      <label>Data de Lançamento (ou 1ª Parcela)</label>
                      <input type="date" name="data" value={formData.data} onChange={handleInputChange} required />
                    </div>

                    <div className="input-group">
                      <label>Categoria de Despesa</label>
                      <select name="categoria" value={formData.categoria} onChange={handleInputChange}>
                        {CATEGORIAS.map(cat => <option key={cat.id} value={cat.id}>{cat.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="form-row-double">
                    <div className="input-group">
                      <label>Descrição Principal</label>
                      <input 
                        type="text" 
                        name="descricao" 
                        value={formData.descricao} 
                        onChange={handleInputChange} 
                        placeholder="Ex: Rolo de filamento, Conta de luz, Peças de reposição" 
                        required 
                      />
                    </div>

                    <div className="input-group">
                      <label>Valor Monetário {formData.parcelado && '(Por Parcela)'}</label>
                      <div className="input-wrapper">
                        <span className="prefix">R$</span>
                        <input 
                          type="number" 
                          step="any" 
                          name="valor" 
                          className="has-prefix" 
                          value={formData.valor} 
                          onChange={handleInputChange} 
                          placeholder="0.00" 
                          required 
                        />
                      </div>
                    </div>
                  </div>

                  <div className="notes-group input-group">
                    <label>Notas Adicionais (Opcional)</label>
                    <input 
                      type="text" 
                      name="notes" 
                      value={formData.notes} 
                      onChange={handleInputChange} 
                      placeholder="Observações adicionais, número da nota, link da compra, etc." 
                    />
                  </div>

                  {/* Campo de Parcelamento */}
                  <div className="installment-box">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        name="parcelado" 
                        checked={formData.parcelado} 
                        onChange={handleInputChange} 
                      />
                      <span className="custom-checkbox">
                        {formData.parcelado && <Check size={12} />}
                      </span>
                      <span>Esta é uma despesa parcelada (gerar lançamentos futuros)</span>
                    </label>

                    {formData.parcelado && (
                      <div className="installment-details-area">
                        <div className="input-group" style={{ maxWidth: '200px' }}>
                          <label>Quantidade de Parcelas</label>
                          <select name="numParcelas" value={formData.numParcelas} onChange={handleInputChange}>
                            {[2,3,4,5,6,7,8,9,10,11,12,18,24].map(n => (
                              <option key={n} value={n}>{n}x</option>
                            ))}
                          </select>
                        </div>
                        {formData.valor && !isNaN(Number(formData.valor)) && (
                          <div className="installment-preview-text">
                            A despesa será repetida por <strong>{formData.numParcelas} meses</strong> consecutivos. <br/>
                            Total geral previsto: <strong>{formatCurrency(Number(formData.valor) * Number(formData.numParcelas))}</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="form-submit-row">
                    <button type="submit" className="btn-submit-expense">
                      Registrar Lançamento
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        details={confirmModal.details}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
