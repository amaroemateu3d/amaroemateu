import { useState, useEffect } from 'react';
import { getResultados } from '../utils/financeCalculators';
import { TrendingDown, TrendingUp, ClipboardList, ShoppingCart, Calendar, Loader } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Resumo.css';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const CATEGORIES_LABELS = {
  materiais: '📦 Matéria-Prima',
  contas: '⚡ Contas Fixas',
  manutencao: '🛠️ Manutenção',
  diversos: '📄 Diversos'
};

export default function Resumo() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [summaryData, setSummaryData] = useState([]);
  
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    setIsLoading(true);
    
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      // Busca consolidada via fetch direto para evitar deadlock do cliente Supabase
      const [ordersRes, expensesRes, ftsRes, salesRes, overRes, defRes] = await Promise.allSettled([
        fetch(`${SUPA_URL}/rest/v1/orders?select=*&client_data=not.is.null`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/expenses?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_monthly_sales?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_overrides?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_channel_defaults?select=*`, { headers })
      ]);

      const getD = async (res) => (res.status === 'fulfilled' && res.value.ok) ? await res.value.json() : [];

      const ordersData = await getD(ordersRes);
      const expensesData = await getD(expensesRes);
      const ftsDataRaw = await getD(ftsRes);
      const salesData = await getD(salesRes);
      const overData = await getD(overRes);
      const defData = await getD(defRes);

      const savedFts = ftsDataRaw.map(r => r.data);
      const pedidos = ordersData || [];
      const saidas = expensesData || [];
    
    const vendasQty = {};
    (salesData || []).forEach(s => {
       if(!vendasQty[s.month]) vendasQty[s.month] = {};
       if(!vendasQty[s.month][s.channel_id]) vendasQty[s.month][s.channel_id] = {};
       vendasQty[s.month][s.channel_id][s.ft_id] = s.quantity;
    });

    const overrides = {};
    (overData || []).forEach(o => {
       if(!overrides[o.channel_id]) overrides[o.channel_id] = {};
       overrides[o.channel_id][o.ft_id] = o.settings;
    });

    const channelDefaults = {};
    (defData || []).forEach(d => {
       channelDefaults[d.channel_id] = d.settings;
    });

    const yearlyMonthsData = [];

    // Helper to get price for a specific FT and channel
    const getFtPrice = (ft, channelId) => {
      const physicalFT = {
        indiceFt: ft.indiceFt,
        nomePeca: ft.nomePeca,
        quantidade: ft.quantidade,
        pesoGramas: ft.pesoGramas,
        tempoImpressao: ft.tempoImpressao,
        precoKgMaterial: ft.precoKgMaterial,
        custoKwh: ft.custoKwh,
        custoDepreciacao: ft.custoDepreciacao,
        extraValor1: ft.extraValor1,
        extraValor2: ft.extraValor2,
        extraValor3: ft.extraValor3
      };
      const defaults = channelDefaults[channelId] || {
        custoEmbalagem: 1.5, custoExtra: 0, custoEnvio: 0,
        taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0, markup: 3
      };
      const channelOps = overrides[channelId]?.[ft.indiceFt] || {};
      const merged = { ...physicalFT, ...defaults, ...channelOps };
      const res = getResultados(merged);
      return res.precoSugerido;
    };

    // 2. Aggregate by month
    for (let m = 0; m < 12; m++) {
      const monthStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}`;
      
      // -- Vendas Multi-Canal --
      let totalVendasEcommerce = 0;
      const channelData = vendasQty[monthStr] || {};
      Object.entries(channelData).forEach(([channelId, ftsQty]) => {
        Object.entries(ftsQty).forEach(([ftId, qty]) => {
          const ft = savedFts.find(f => f.indiceFt === ftId);
          if (ft && qty > 0) {
            totalVendasEcommerce += getFtPrice(ft, channelId) * qty;
          }
        });
      });

      // -- Pedidos e Consignados --
      let totalPedidosPago = 0;
      let totalPedidosPendente = 0;
      let totalConsignadosPago = 0;
      let totalConsignadosPendente = 0;
      pedidos.forEach(p => {
        const pDate = new Date(p.created_at);
        const pMonthStr = `${pDate.getFullYear()}-${String(pDate.getMonth() + 1).padStart(2, '0')}`;
        if (pMonthStr === monthStr) {
          const amount = Number(p.total || 0);
          const pTipo = p.client_data?.tipo || 'pedido';
          if (pTipo === 'pedido') {
             if (p.status === 'paid') totalPedidosPago += amount;
             else totalPedidosPendente += amount;
          } else if (pTipo === 'consignado') {
             if (p.status === 'paid') totalConsignadosPago += amount;
             else totalConsignadosPendente += amount;
          }
        }
      });



      // -- Saídas e Despesas --
      const totalSaidasPorCategoria = { materiais: 0, contas: 0, manutencao: 0, diversos: 0 };
      saidas.forEach(s => {
        // Agora extraímos o mês da coluna 'date' (YYYY-MM-DD)
        if (!s.date) return;
        const sMonthStr = s.date.substring(0, 7); // Pega 'YYYY-MM'

        if (sMonthStr === monthStr) {
          totalSaidasPorCategoria[s.category] = (totalSaidasPorCategoria[s.category] || 0) + Number(s.amount || 0);
          
          // Se for uma categoria fora do padrão, garante que seja somada se já não foi
          if (s.category && !['materiais', 'contas', 'manutencao', 'diversos'].includes(s.category)) {
             totalSaidasPorCategoria[s.category] = (totalSaidasPorCategoria[s.category] || 0) + Number(s.amount || 0);
          }
        }
      });

      
      const totalSaidasGeral = Object.values(totalSaidasPorCategoria).reduce((a, b) => a + b, 0);

      yearlyMonthsData.push({
        monthName: MONTH_NAMES[m],
        monthStr,
        vendasEcommerce: totalVendasEcommerce,
        pedidosPago: totalPedidosPago,
        pedidosPendente: totalPedidosPendente,
        pedidosVenda: totalPedidosPago + totalPedidosPendente,
        consignadosPago: totalConsignadosPago,
        consignadosPendente: totalConsignadosPendente,
        consignados: totalConsignadosPago + totalConsignadosPendente,
        saidasPorCategoria: totalSaidasPorCategoria,
        totalSaidasGeral


      });
    }

    setSummaryData(yearlyMonthsData);
    } catch (e) {
      console.error('[Resumo] Erro ao consolidar dados:', e);
    } finally {
      setIsLoading(false);
    }
  };


  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);

  // Calcula totais anuais
  const totalAnualVendas = summaryData.reduce((acc, curr) => acc + curr.vendasEcommerce + curr.pedidosVenda, 0);
  const totalAnualSaidas = summaryData.reduce((acc, curr) => acc + curr.totalSaidasGeral, 0);

  // Separa o mês atual para destaque
  const currentMonthData = summaryData.find(d => d.monthStr === currentMonthStr);
  const otherMonths = summaryData.filter(d => d.monthStr !== currentMonthStr);

  const renderMonthCard = (data) => {
    const hasMovement = data.vendasEcommerce > 0 || data.pedidosVenda > 0 || data.consignados > 0 || data.totalSaidasGeral > 0;
    const isCurrent = data.monthStr === currentMonthStr;

    return (
      <div key={data.monthStr} className={`card month-card ${!hasMovement ? 'empty-month' : ''} ${isCurrent ? 'current-month' : ''}`}>
        <div className="month-card-header">
          <div style={{display: 'flex', flexDirection: 'column', gap: '4px'}}>
            <h3 style={{display: 'flex', alignItems: 'center', gap: '8px'}}>
              {data.monthName} / {selectedYear}
              {isCurrent && (
                <span className="current-badge">Mês Atual</span>
              )}
            </h3>
          </div>
          {hasMovement && (
            <span className={`balance-tag ${data.vendasEcommerce + data.pedidosVenda - data.totalSaidasGeral >= 0 ? 'positive' : 'negative'}`}>
              Saldo: {formatCurrency(data.vendasEcommerce + data.pedidosVenda - data.totalSaidasGeral)}
            </span>
          )}
        </div>

        <div className="month-sections">
          <section>
            <h4><ShoppingCart size={14} /> Vendas e Pedidos</h4>
            <div className="row">
              <span>Vendas Online (E-commerce)</span>
              <span>{formatCurrency(data.vendasEcommerce)}</span>
            </div>
            <div className="row">
              <span>Pedidos de Venda Direta</span>
              <span>{formatCurrency(data.pedidosVenda)}</span>
            </div>
            <div className="row subtotal">
              <span>Total em Vendas</span>
              <span style={{color: 'var(--success)', fontWeight: 'bold'}}>{formatCurrency(data.vendasEcommerce + data.pedidosVenda)}</span>
            </div>
            <div className="row" style={{fontSize: '0.8rem', paddingLeft: '0.5rem', color: 'var(--text-secondary)'}}>
              <span>└ Recebido (Pago)</span>
              <span style={{color: 'var(--success)'}}>{formatCurrency(data.pedidosPago)}</span>
            </div>
            <div className="row" style={{fontSize: '0.8rem', paddingLeft: '0.5rem', color: 'var(--text-secondary)'}}>
              <span>└ Pendente</span>
              <span style={{color: 'var(--warning)'}}>{formatCurrency(data.pedidosPendente)}</span>
            </div>

            <div className="row subtotal" style={{marginTop: '0.4rem', color: 'var(--accent-secondary)'}}>
              <span>Consignados Gerados</span>
              <span style={{fontWeight: 'bold'}}>{formatCurrency(data.consignados)}</span>
            </div>
            <div className="row" style={{fontSize: '0.8rem', paddingLeft: '0.5rem', color: 'var(--text-secondary)'}}>
              <span>└ Recebido (Pago)</span>
              <span style={{color: 'var(--success)'}}>{formatCurrency(data.consignadosPago)}</span>
            </div>
            <div className="row" style={{fontSize: '0.8rem', paddingLeft: '0.5rem', color: 'var(--text-secondary)'}}>
              <span>└ Pendente</span>
              <span style={{color: 'var(--warning)'}}>{formatCurrency(data.consignadosPendente)}</span>
            </div>

          </section>

          <div className="divider" />

          <section>
            <h4><TrendingDown size={14} /> Despesas (Saídas)</h4>
            {Object.entries(data.saidasPorCategoria).map(([cat, val]) => (
              <div className="row" key={cat}>
                <span>{CATEGORIES_LABELS[cat]}</span>
                <span>{formatCurrency(val)}</span>
              </div>
            ))}
            <div className="row subtotal">
              <span>Total Despesas</span>
              <span style={{color: 'var(--danger)', fontWeight: 'bold'}}>{formatCurrency(data.totalSaidasGeral)}</span>
            </div>
          </section>
        </div>
      </div>
    );
  };

  return (
    <div className="page-wrapper resumo-page">
      <div className="resumo-header">
        <div>
          <h1 className="page-title">Resumo Financeiro Anual</h1>
          <p className="page-description">Visão consolidada de todas as movimentações do ano.</p>
        </div>
        
        <div className="year-selector">
          <Calendar size={20} color="var(--text-secondary)" />
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))}>
            {Array.from({length: 5}, (_, i) => {
              const year = new Date().getFullYear() - 2 + i;
              return <option key={year} value={year}>{year}</option>;
            })}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div style={{textAlign: 'center', padding: '5rem', color: 'var(--text-secondary)'}}>
           <Loader size={50} className="spinner" color="var(--primary)" style={{marginBottom: '1rem'}} />
           <h2>Consolidando dados financeiros da nuvem...</h2>
           <p>Calculando margens de pedidos, vendas e despesas de todos os meses de {selectedYear}.</p>
        </div>
      ) : (
        <>
          <div className="resumo-stats-grid">
            <div className="card stat-card total-vendas">
              <div className="stat-icon"><TrendingUp size={28} /></div>
          <div>
            <p className="stat-label">Total em Vendas ({selectedYear})</p>
            <h2 className="stat-value">{formatCurrency(totalAnualVendas)}</h2>
            <small style={{color: 'var(--text-secondary)'}}>Soma de E-commerce + Pedidos Diretos</small>
          </div>
        </div>

        <div className="card stat-card total-saidas">
          <div className="stat-icon"><TrendingDown size={28} /></div>
          <div>
            <p className="stat-label">Total de Despesas ({selectedYear})</p>
            <h2 className="stat-value">{formatCurrency(totalAnualSaidas)}</h2>
            <small style={{color: 'var(--text-secondary)'}}>Insumos, Contas e Manutenção</small>
          </div>
        </div>
      </div>

      {/* SEÇÃO EM DESTAQUE (MÊS ATUAL) */}
      {currentMonthData && selectedYear === now.getFullYear() && (
        <div className="featured-month">
          <h2 className="section-subtitle">Mês em Destaque</h2>
          <div className="featured-container">
            {renderMonthCard(currentMonthData)}
          </div>
          <div className="divider" style={{margin: '2.5rem 0'}} />
        </div>
      )}

      <h2 className="section-subtitle">Acompanhamento Mensal</h2>
      <div className="months-grid">
        {otherMonths.map((data) => renderMonthCard(data))}
      </div>
        </>
      )}
    </div>
  );
}
