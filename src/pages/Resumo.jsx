import { useState, useEffect } from 'react';
import { getResultados } from '../utils/financeCalculators';
import { TrendingDown, TrendingUp, ClipboardList, ShoppingCart, Calendar, Loader, DollarSign } from 'lucide-react';
import { supabase } from '../supabaseClient';
import './Resumo.css';

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

export default function Resumo() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [summaryData, setSummaryData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  useEffect(() => {
    fetchData();
  }, [selectedYear]);

  const fetchData = async () => {
    setIsLoading(true);
    
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      // Busca consolidada para evitar deadlock e garantir performance
      const [ordersRes, expensesRes, ftsRes, salesRes, overRes, defRes, consignadosRes] = await Promise.allSettled([
        fetch(`${SUPA_URL}/rest/v1/orders?select=*&client_data=not.is.null`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/expenses?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_monthly_sales?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_overrides?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/ecommerce_channel_defaults?select=*`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/consignados?select=*`, { headers })
      ]);

      const getD = async (res) => (res.status === 'fulfilled' && res.value.ok) ? await res.value.json() : [];

      const ordersData = await getD(ordersRes);
      const expensesData = await getD(expensesRes);
      const ftsDataRaw = await getD(ftsRes);
      const salesData = await getD(salesRes);
      const overData = await getD(overRes);
      const defData = await getD(defRes);
      const consignadosData = await getD(consignadosRes);

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

      // Helper para obter preço de um FT e canal específico
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
          taxaFixaVenda: 0, impostosNF: 0, taxaMLPerc: 0
        };
        const channelOps = overrides[channelId]?.[ft.indiceFt] || {};
        const merged = { ...physicalFT, ...defaults, ...channelOps };
        const res = getResultados(merged);
        return res.precoPraticado;
      };

      // Agregar dados por mês
      for (let m = 0; m < 12; m++) {
        const monthStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}`;
        
        // -- Vendas Multi-Canal (Marketplaces) --
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
        let totalConsignadosGerado = 0;

        // Consignados
        (consignadosData || []).forEach(acc => {
          const comissao = acc.cliente?.tipoAcerto === 'comissionado' ? Number(acc.cliente?.comissaoPct || 0) : 0;
          const repasseRate = (100 - comissao) / 100;

          (acc.batches || []).forEach(batch => {
            if (!batch.date) return;
            const bDate = new Date(batch.date);
            const bMonthStr = `${bDate.getUTCFullYear()}-${String(bDate.getUTCMonth() + 1).padStart(2, '0')}`;
            
            if (bMonthStr === monthStr) {
              let bTotal = 0;
              (batch.items || []).forEach(it => {
                bTotal += Number(it.qtd || 0) * Number(it.precoUnit || 0);
              });
              totalConsignadosGerado += bTotal * repasseRate;
            }
          });

          (acc.payments || []).forEach(payment => {
            if (!payment.date) return;
            const pDate = new Date(payment.date);
            const pMonthStr = `${pDate.getUTCFullYear()}-${String(pDate.getUTCMonth() + 1).padStart(2, '0')}`;
            
            if (pMonthStr === monthStr) {
              totalConsignadosPago += Number(payment.amount || 0);
            }
          });
        });

        // Pedidos
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
               else totalPedidosPendente += amount; // fallback legado
               totalConsignadosGerado += amount;
            }
          }
        });

        // -- Saídas e Despesas --
        let totalSaidasGeral = 0;
        saidas.forEach(s => {
          if (!s.date) return;
          const sMonthStr = s.date.substring(0, 7); // 'YYYY-MM'
          if (sMonthStr === monthStr) {
            totalSaidasGeral += Number(s.amount || 0);
          }
        });

        yearlyMonthsData.push({
          monthName: MONTH_NAMES[m],
          monthStr,
          vendasEcommerce: totalVendasEcommerce,
          pedidosPago: totalPedidosPago,
          pedidosPendente: totalPedidosPendente,
          pedidosVenda: totalPedidosPago + totalPedidosPendente,
          consignadosPago: totalConsignadosPago,
          consignadosGerados: totalConsignadosGerado,
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

  const formatCurrency = (val) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
  };

  // ── Totais Anuais (Consolidados para Cards Superiores) ──────────────────────────
  const totalAnualFaturado = summaryData.reduce((acc, curr) => acc + curr.vendasEcommerce + curr.pedidosVenda + curr.consignadosGerados, 0);
  const totalAnualRecebido = summaryData.reduce((acc, curr) => acc + curr.vendasEcommerce + curr.pedidosPago + curr.consignadosPago, 0);
  const totalAnualDespesas = summaryData.reduce((acc, curr) => acc + curr.totalSaidasGeral, 0);
  const totalAnualPendente = summaryData.reduce((acc, curr) => acc + curr.pedidosPendente + Math.max(0, curr.consignadosGerados - curr.consignadosPago), 0);
  const resultadoAnualFaturamento = totalAnualFaturado - totalAnualDespesas;
  const resultadoAnualCaixa = totalAnualRecebido - totalAnualDespesas;

  // Ordena os meses colocando o mês atual no topo (se for o ano atual), seguido pelos meses mais recentes
  const sortedMonths = [...summaryData].sort((a, b) => {
    const isCurrentA = selectedYear === now.getFullYear() && a.monthStr === currentMonthStr;
    const isCurrentB = selectedYear === now.getFullYear() && b.monthStr === currentMonthStr;
    if (isCurrentA) return -1;
    if (isCurrentB) return 1;
    return b.monthStr.localeCompare(a.monthStr);
  });

  return (
    <div className="page-wrapper resumo-page" translate="no">
      <div className="resumo-header">
        <div>
          <h1 className="page-title">Resumo Financeiro</h1>
          <p className="page-description">Acompanhamento consolidado de faturamento, recebimentos, consignados e despesas.</p>
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
           <h2>Consolidando fluxo financeiro...</h2>
           <p>Calculando margens de marketplaces, pedidos de vendas e consignados do ano {selectedYear}.</p>
        </div>
      ) : (
        <>
          {/* ── SEÇÃO: RESUMO ANUAL (ACIMA DE TUDO) ── */}
          <h2 className="section-subtitle">
            <TrendingUp size={20} style={{ color: 'var(--accent-primary)' }} /> Resumo Anual ({selectedYear})
          </h2>
          <div className="resumo-stats-grid">
            <div className="stat-card faturamento">
              <div className="stat-card-header">
                <span className="stat-label">Faturamento Total</span>
                <div className="stat-card-icon"><TrendingUp size={20} /></div>
              </div>
              <h2 className="stat-value">{formatCurrency(totalAnualFaturado)}</h2>
              <span className="stat-sub">Soma de Marketplaces, Pedidos e Remessas</span>
            </div>

            <div className="stat-card caixa">
              <div className="stat-card-header">
                <span className="stat-label">Caixa Realizado</span>
                <div className="stat-card-icon"><DollarSign size={20} /></div>
              </div>
              <h2 className="stat-value">{formatCurrency(totalAnualRecebido)}</h2>
              <span className="stat-sub">Valor de fato já recebido/pago</span>
            </div>

            <div className="stat-card pendente">
              <div className="stat-card-header">
                <span className="stat-label">Aberto / Pendente</span>
                <div className="stat-card-icon"><ClipboardList size={20} /></div>
              </div>
              <h2 className="stat-value">{formatCurrency(totalAnualPendente)}</h2>
              <span className="stat-sub">Valores aguardando acerto ou pagamento</span>
            </div>

            <div className="stat-card despesas">
              <div className="stat-card-header">
                <span className="stat-label">Saídas e Despesas</span>
                <div className="stat-card-icon"><TrendingDown size={20} /></div>
              </div>
              <h2 className="stat-value">{formatCurrency(totalAnualDespesas)}</h2>
              <span className="stat-sub">Matéria-prima, manutenção e custos fixos</span>
            </div>

            <div className="stat-card resultado">
              <div className="stat-card-header">
                <span className="stat-label">Resultado Líquido</span>
                <div className="stat-card-icon"><ShoppingCart size={20} /></div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span className="stat-sub" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                  Contábil: <span className={resultadoAnualFaturamento >= 0 ? 'green-tag' : 'red-tag'}>{formatCurrency(resultadoAnualFaturamento)}</span>
                </span>
                <span className="stat-sub" style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                  Caixa: <span className={resultadoAnualCaixa >= 0 ? 'green-tag' : 'red-tag'}>{formatCurrency(resultadoAnualCaixa)}</span>
                </span>
              </div>
              <span className="stat-sub" style={{ marginTop: 'auto' }}>Margem líquida consolidada</span>
            </div>
          </div>

          {/* ── SEÇÃO: ACOMPANHAMENTO MENSAL TABULAR ── */}
          <div className="card table-card">
            <div className="table-title-area">
              <h2>Acompanhamento Mensal Consolidado</h2>
            </div>
            
            <div className="table-responsive">
              <table className="resumo-table">
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th>Vendas Marketplaces (Multicanal)</th>
                    <th>Pedidos de Venda Direta</th>
                    <th>Vendas Consignados (Remessas)</th>
                    <th>Saídas e Despesas</th>
                    <th style={{ textAlign: 'right' }}>Resumo Total do Mês</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMonths.map((data) => {
                    const isCurrent = data.monthStr === currentMonthStr && selectedYear === now.getFullYear();
                    
                    const billingBalance = data.vendasEcommerce + data.pedidosVenda + data.consignadosGerados - data.totalSaidasGeral;
                    const cashBalance = data.vendasEcommerce + data.pedidosPago + data.consignadosPago - data.totalSaidasGeral;
                    const consignadoAberto = Math.max(0, data.consignadosGerados - data.consignadosPago);

                    const hasMovement = data.vendasEcommerce > 0 || data.pedidosVenda > 0 || data.consignadosGerados > 0 || data.totalSaidasGeral > 0;

                    return (
                      <tr key={data.monthStr} className={`${isCurrent ? 'row-current-month' : ''} ${!hasMovement ? 'empty-row' : ''}`} style={!hasMovement ? { opacity: 0.6 } : {}}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center' }}>
                            <span className="currency-main">{data.monthName}</span>
                            {isCurrent ? (
                              <span className="month-badge current">Mês Atual</span>
                            ) : !hasMovement ? (
                              <span className="month-badge empty">Sem Mov.</span>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <span className="currency-main">{formatCurrency(data.vendasEcommerce)}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <strong className="currency-main">{formatCurrency(data.pedidosVenda)}</strong>
                            <span className="currency-sub green-tag">✔ Pago: {formatCurrency(data.pedidosPago)}</span>
                            <span className="currency-sub orange-tag">⌛ Aberto: {formatCurrency(data.pedidosPendente)}</span>
                          </div>
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <strong className="currency-main">{formatCurrency(data.consignadosGerados)}</strong>
                            <span className="currency-sub green-tag">✔ Pago: {formatCurrency(data.consignadosPago)}</span>
                            <span className="currency-sub orange-tag">⌛ Aberto: {formatCurrency(consignadoAberto)}</span>
                          </div>
                        </td>
                        <td>
                          <span className="currency-main red-tag">{formatCurrency(data.totalSaidasGeral)}</span>
                        </td>
                        <td>
                          <div className="total-summary-cell">
                            <div>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Faturamento Líquido: </span>
                              <strong style={{ color: billingBalance >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
                                {formatCurrency(billingBalance)}
                              </strong>
                            </div>
                            <div style={{ marginTop: '2px' }}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fluxo de Caixa Real: </span>
                              <strong style={{ color: cashBalance >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
                                {formatCurrency(cashBalance)}
                              </strong>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
