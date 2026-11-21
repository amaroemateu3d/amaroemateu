import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Calculator, ShoppingCart, BarChart3, Package,
  ArrowRight, Calendar, Sparkles, RefreshCw,
  ClipboardList, Handshake, AlertTriangle, TrendingUp,
  CheckCircle2, Clock, Bot, History
} from 'lucide-react';
import './Home.css';

const parseN = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  let str = String(v).replace(/[^\d.,-]/g, '');
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
};

const fmtBRL = (n) => {
  const num = Number(n || 0);
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getBrazilDateStr = (offsetDays = 0) => {
  const now = new Date();
  // Ajusta para fuso America/Sao_Paulo (-03:00)
  const brTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  if (offsetDays !== 0) {
    brTime.setDate(brTime.getDate() + offsetDays);
  }
  const y = brTime.getFullYear();
  const m = String(brTime.getMonth() + 1).padStart(2, '0');
  const d = String(brTime.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const formatDateBR = (isoDateStr) => {
  if (!isoDateStr) return '—';
  const parts = String(isoDateStr).slice(0, 10).split('-');
  if (parts.length !== 3) return isoDateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const daysBetween = (dateStr, refDateStr) => {
  if (!dateStr) return 0;
  const d1 = new Date(String(dateStr).slice(0, 10) + 'T12:00:00Z');
  const d2 = new Date(String(refDateStr).slice(0, 10) + 'T12:00:00Z');
  const diff = Math.floor((d2 - d1) / 86400000);
  return Math.max(0, isNaN(diff) ? 0 : diff);
};

export default function Home() {
  const { session, profile, canView } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Estados do Briefing Diário IA (1x ao dia, salvo no banco por usuário)
  const [briefingLoading, setBriefingLoading] = useState(true);
  const [refreshingBriefing, setRefreshingBriefing] = useState(false);
  const [currentBriefing, setCurrentBriefing] = useState(null);
  const [savedBriefingsList, setSavedBriefingsList] = useState([]);
  const [selectedBriefingDate, setSelectedBriefingDate] = useState(() => getBrazilDateStr(0));

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nomeUsuario = profile?.nome || 'Usuário';
  const userId = String(profile?.id || session?.user?.id || 'default-user');
  const empresaId = profile?.empresa_id || 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9';

  const getGreeting = () => {
    const h = currentTime.getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  // Gera o payload completo do Resumo do Dia (sem Finanças Pessoais)
  const buildDailyBriefingPayload = useCallback(async (targetDateStr) => {
    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const headers = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

    const todayStr = targetDateStr || getBrazilDateStr(0);
    const yesterdayStr = getBrazilDateStr(-1);
    const monthPrefix = todayStr.slice(0, 7); // YYYY-MM

    const [
      mktOrdersResp,
      ordersResp,
      consignadosResp,
      ftsResp,
      listingsResp
    ] = await Promise.allSettled([
      fetch(`${SUPA_URL}/rest/v1/marketplace_orders_synced?select=*&order=order_date.desc&limit=1000`, { headers }),
      fetch(`${SUPA_URL}/rest/v1/orders?select=*&client_data=not.is.null&order=created_at.desc`, { headers }),
      fetch(`${SUPA_URL}/rest/v1/consignados?select=*&order=id.asc`, { headers }),
      fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=id,estoque,data&order=id.asc`, { headers }),
      fetch(`${SUPA_URL}/rest/v1/marketplace_listings?select=platform,ml_item_id,title,ft_id,price,stock_ml,status`, { headers })
    ]);

    const mktOrders = mktOrdersResp.status === 'fulfilled' && mktOrdersResp.value.ok ? await mktOrdersResp.value.json() : [];
    const orders = ordersResp.status === 'fulfilled' && ordersResp.value.ok ? await ordersResp.value.json() : [];
    const consignados = consignadosResp.status === 'fulfilled' && consignadosResp.value.ok ? await consignadosResp.value.json() : [];
    const ftsRows = ftsResp.status === 'fulfilled' && ftsResp.value.ok ? await ftsResp.value.json() : [];
    const listings = listingsResp.status === 'fulfilled' && listingsResp.value.ok ? await listingsResp.value.json() : [];

    // Map de nomes das FTs
    const ftMap = {};
    ftsRows.forEach(r => {
      const d = r.data || {};
      const id = r.id || d.indiceFt;
      if (!id) return;
      ftMap[id] = {
        id,
        nome: d.nomePeca || id,
        estoqueTotal: parseN(r.estoque ?? d.estoque ?? 0),
        variacoes: Array.isArray(d.variacoes) ? d.variacoes : []
      };
    });

    // 1. Vendas dos Marketplaces (Ontem, Hoje e Mês)
    const summarizeSales = (rows) => {
      let units = 0;
      let revenue = 0;
      let mlUnits = 0;
      let mlRevenue = 0;
      let shopeeUnits = 0;
      let shopeeRevenue = 0;
      const byFt = {};

      rows.forEach(r => {
        const q = parseN(r.quantity || 1);
        const rev = q * parseN(r.unit_price || 0);
        units += q;
        revenue += rev;
        if (r.platform === 'ml') {
          mlUnits += q;
          mlRevenue += rev;
        } else {
          shopeeUnits += q;
          shopeeRevenue += rev;
        }
        const ftKey = r.ft_id || 'Sem FT';
        if (!byFt[ftKey]) {
          byFt[ftKey] = {
            ft_id: ftKey,
            nome: ftMap[ftKey]?.nome || ftKey,
            units: 0,
            revenue: 0
          };
        }
        byFt[ftKey].units += q;
        byFt[ftKey].revenue += rev;
      });

      const topProducts = Object.values(byFt).sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, 3);
      return { units, revenue, mlUnits, mlRevenue, shopeeUnits, shopeeRevenue, topProducts };
    };

    const yesterdayOrders = mktOrders.filter(o => String(o.order_date || '').slice(0, 10) === yesterdayStr);
    const todayOrders = mktOrders.filter(o => String(o.order_date || '').slice(0, 10) === todayStr);
    const monthOrders = mktOrders.filter(o => String(o.order_date || '').slice(0, 7) === monthPrefix);

    const salesYesterday = summarizeSales(yesterdayOrders);
    const salesToday = summarizeSales(todayOrders);
    const salesMonth = summarizeSales(monthOrders);

    // 2. Pedidos & Produção (tabela public.orders)
    const calcOrderTotal = (p) => {
      if (p.total !== undefined && p.total !== null && parseN(p.total) > 0) return parseN(p.total);
      const bruto = (p.items || []).reduce((s, it) => s + (parseN(it.precoUnit) * parseN(it.qtd)), 0);
      const temDesc = Boolean(p.client_data?.temDesconto);
      const perc = temDesc ? Math.min(100, Math.max(0, parseN(p.client_data?.descontoPercent))) : 0;
      return Math.max(0, bruto - (bruto * perc) / 100);
    };

    const pendingOrdersList = [];
    let paidOrdersCount = 0;
    let paidOrdersMonthCount = 0;
    let paidOrdersMonthRevenue = 0;
    let refusedOrdersCount = 0;

    orders.forEach(p => {
      const st = p.status || 'pending';
      const val = calcOrderTotal(p);
      const createdDate = String(p.created_at || '').slice(0, 10);
      const daysOpen = daysBetween(createdDate, todayStr);

      if (st === 'paid') {
        paidOrdersCount++;
        const refMonth = String(p.payment_date || p.created_at || '').slice(0, 7);
        if (refMonth === monthPrefix) {
          paidOrdersMonthCount++;
          paidOrdersMonthRevenue += val;
        }
      } else if (st === 'refused') {
        refusedOrdersCount++;
      } else {
        pendingOrdersList.push({
          id: p.id,
          tipo: p.client_data?.tipo || 'pedido',
          cliente: p.client_data?.nome || 'Cliente',
          total: val,
          itensCount: Array.isArray(p.items) ? p.items.length : 0,
          createdAt: createdDate,
          daysOpen
        });
      }
    });

    pendingOrdersList.sort((a, b) => b.daysOpen - a.daysOpen);
    const pendingOrdersTotalValue = pendingOrdersList.reduce((s, o) => s + o.total, 0);
    const maxPendingOrderDays = pendingOrdersList.length > 0 ? pendingOrdersList[0].daysOpen : 0;

    // 3. Consignados em Aberto (tabela public.consignados)
    const consignadosSummary = [];
    let totalConsignadoOpenUnits = 0;
    let totalConsignadoOpenValue = 0;
    let totalConsignadoOpenBatches = 0;

    consignados.forEach(acc => {
      const clienteNome = acc.cliente?.nome || `Parceiro #${acc.id}`;
      const batches = Array.isArray(acc.batches) ? acc.batches : [];
      const payments = Array.isArray(acc.payments) ? acc.payments : [];

      let accOpenUnits = 0;
      let accOpenValue = 0;
      let accOpenBatches = 0;
      let oldestOpenBatchDate = null;
      let newestOpenBatchDate = null;

      batches.forEach(b => {
        const items = Array.isArray(b.items) ? b.items : [];
        let batchOpenUnits = 0;
        let batchOpenVal = 0;
        items.forEach(it => {
          const open = Math.max(0, parseN(it.qtd) - parseN(it.qtdPago) - parseN(it.qtdRetirado));
          if (open > 0) {
            batchOpenUnits += open;
            batchOpenVal += open * parseN(it.precoUnit);
          }
        });
        if (batchOpenUnits > 0) {
          accOpenBatches++;
          accOpenUnits += batchOpenUnits;
          accOpenValue += batchOpenVal;
          const bDate = String(b.date || '').slice(0, 10);
          if (bDate) {
            if (!oldestOpenBatchDate || bDate < oldestOpenBatchDate) oldestOpenBatchDate = bDate;
            if (!newestOpenBatchDate || bDate > newestOpenBatchDate) newestOpenBatchDate = bDate;
          }
        }
      });

      const sortedPayments = [...payments].sort((a, b) => new Date(b.date) - new Date(a.date));
      const lastPaymentDate = sortedPayments.length > 0 ? String(sortedPayments[0].date || '').slice(0, 10) : null;
      const daysSinceLastPayment = lastPaymentDate ? daysBetween(lastPaymentDate, todayStr) : null;

      if (accOpenUnits > 0) {
        totalConsignadoOpenUnits += accOpenUnits;
        totalConsignadoOpenValue += accOpenValue;
        totalConsignadoOpenBatches += accOpenBatches;

        consignadosSummary.push({
          id: acc.id,
          cliente: clienteNome,
          openBatches: accOpenBatches,
          openUnits: accOpenUnits,
          openValue: accOpenValue,
          oldestOpenBatchDate,
          oldestDaysOpen: oldestOpenBatchDate ? daysBetween(oldestOpenBatchDate, todayStr) : 0,
          newestOpenBatchDate,
          lastPaymentDate,
          daysSinceLastPayment
        });
      }
    });

    // 4. Estoque Crítico & Produtos a Melhorar (Anúncios Ativos ML + Shopee)
    const soldLast30dByFt = {};
    const thirtyDaysAgoStr = getBrazilDateStr(-30);
    mktOrders.forEach(o => {
      const d = String(o.order_date || '').slice(0, 10);
      if (d >= thirtyDaysAgoStr && o.ft_id) {
        soldLast30dByFt[o.ft_id] = (soldLast30dByFt[o.ft_id] || 0) + parseN(o.quantity || 1);
      }
    });

    const activeLinkedFts = new Set();
    listings.forEach(l => {
      if (l.ft_id && (l.status === 'active' || l.status === 'NORMAL')) {
        activeLinkedFts.add(l.ft_id);
      }
    });

    const criticalStockItems = [];
    const productsToImprove = [];

    activeLinkedFts.forEach(ftId => {
      const ft = ftMap[ftId];
      if (!ft) return;
      const sold30 = soldLast30dByFt[ftId] || 0;

      // Checa variações ou estoque geral da FT
      if (ft.variacoes.length > 0) {
        ft.variacoes.forEach(v => {
          const vStock = parseN(v.estoque ?? v.estoqueGalpao ?? 0) + parseN(v.estoqueCasa ?? 0);
          if (vStock <= 2) {
            criticalStockItems.push({
              ft_id: ftId,
              nome: ft.nome,
              variacao: v.nome || null,
              estoque: vStock,
              sold30
            });
          }
        });
      } else if (ft.estoqueTotal <= 2) {
        criticalStockItems.push({
          ft_id: ftId,
          nome: ft.nome,
          variacao: null,
          estoque: ft.estoqueTotal,
          sold30
        });
      }

      // Produto anunciado ativo, com estoque disponível mas sem vendas nos últimos 30 dias
      if (ft.estoqueTotal >= 5 && sold30 === 0) {
        productsToImprove.push({
          ft_id: ftId,
          nome: ft.nome,
          estoque: ft.estoqueTotal,
          sold30: 0,
          motivo: ft.estoqueTotal >= 15 ? 'Estoque alto parado (30d sem giro)' : 'Anunciado sem venda há 30+ dias'
        });
      }
    });

    criticalStockItems.sort((a, b) => a.estoque - b.estoque || b.sold30 - a.sold30);
    productsToImprove.sort((a, b) => b.estoque - a.estoque);

    // 5. Recomendações Inteligentes / Prioridades do Dia
    const priorities = [];

    if (pendingOrdersList.length > 0) {
      priorities.push({
        type: 'pedidos',
        severity: maxPendingOrderDays >= 7 ? 'high' : 'medium',
        title: `${pendingOrdersList.length} ${pendingOrdersList.length === 1 ? 'pedido não finalizado' : 'pedidos não finalizados'} (R$ ${fmtBRL(pendingOrdersTotalValue)})`,
        detail: `O mais antigo está em aberto há ${maxPendingOrderDays} dias (${pendingOrdersList[0].cliente}). Verifique entregas e baixas de pagamento.`,
        to: '/pedidos',
        cta: 'Ver Pedidos'
      });
    }

    if (consignadosSummary.length > 0) {
      const topConsig = consignadosSummary[0];
      priorities.push({
        type: 'consignados',
        severity: topConsig.oldestDaysOpen >= 30 ? 'high' : 'medium',
        title: `${consignadosSummary.length} ${consignadosSummary.length === 1 ? 'parceiro consignado' : 'parceiros consignados'} com ${totalConsignadoOpenUnits} peças em aberto (R$ ${fmtBRL(totalConsignadoOpenValue)})`,
        detail: `${topConsig.cliente}: ${topConsig.openBatches} lotes com saldo pendente (lote mais antigo há ${topConsig.oldestDaysOpen} dias${topConsig.daysSinceLastPayment !== null ? ` • último acerto há ${topConsig.daysSinceLastPayment} dias` : ''}).`,
        to: '/consignados',
        cta: 'Conferir Consignados'
      });
    }

    if (criticalStockItems.length > 0) {
      priorities.push({
        type: 'estoque',
        severity: 'high',
        title: `${criticalStockItems.length} ${criticalStockItems.length === 1 ? 'item anunciado' : 'itens anunciados'} com estoque crítico (≤ 2 un.)`,
        detail: `Destaque: ${criticalStockItems.slice(0, 3).map(i => `${i.ft_id}${i.variacao ? ` (${i.variacao})` : ''}: ${i.estoque} un.`).join(' • ')}. Programe impressão para não pausar anúncios.`,
        to: '/estoque',
        cta: 'Repor Estoque'
      });
    }

    if (productsToImprove.length > 0) {
      priorities.push({
        type: 'ads',
        severity: 'normal',
        title: `${productsToImprove.length} produtos ativos com estoque parado (0 vendas em 30 dias)`,
        detail: `Sugestão IA: testar Oferta Relâmpago ou campanha Giro de Estoque para ${productsToImprove.slice(0, 2).map(p => `${p.ft_id} (${p.estoque} un.)`).join(' e ')}.`,
        to: '/ads-ia',
        cta: 'Otimizar na IA'
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      briefingDate: todayStr,
      yesterdayDate: yesterdayStr,
      userName: nomeUsuario,
      sales: {
        yesterday: salesYesterday,
        today: salesToday,
        month: salesMonth
      },
      pedidos: {
        pendingCount: pendingOrdersList.length,
        pendingTotalValue: pendingOrdersTotalValue,
        maxPendingDays: maxPendingOrderDays,
        pendingList: pendingOrdersList.slice(0, 5),
        paidTotalCount: paidOrdersCount,
        paidMonthCount: paidOrdersMonthCount,
        paidMonthRevenue: paidOrdersMonthRevenue,
        refusedCount: refusedOrdersCount
      },
      consignados: {
        openAccountsCount: consignadosSummary.length,
        totalOpenBatches: totalConsignadoOpenBatches,
        totalOpenUnits: totalConsignadoOpenUnits,
        totalOpenValue: totalConsignadoOpenValue,
        accounts: consignadosSummary
      },
      estoque: {
        criticalCount: criticalStockItems.length,
        criticalList: criticalStockItems.slice(0, 6),
        improveCount: productsToImprove.length,
        improveList: productsToImprove.slice(0, 6)
      },
      priorities
    };
  }, [nomeUsuario]);

  // Carrega histórico de resumos salvos do usuário e gera 1x ao dia automaticamente se ainda não existir hoje
  const loadOrGenerateBriefing = useCallback(async (forceRegenerateToday = false) => {
    if (!userId) return;
    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const headers = {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json'
    };

    const todayStr = getBrazilDateStr(0);

    try {
      if (forceRegenerateToday) {
        setRefreshingBriefing(true);
      } else {
        setBriefingLoading(true);
      }

      // 1. Busca últimos 15 resumos salvos deste usuário
      const listResp = await fetch(
        `${SUPA_URL}/rest/v1/daily_briefings?user_id=eq.${encodeURIComponent(userId)}&select=id,briefing_date,user_name,payload,created_at,updated_at&order=briefing_date.desc&limit=15`,
        { headers }
      );
      const savedRows = listResp.ok ? await listResp.json() : [];
      const existingToday = savedRows.find(r => r.briefing_date === todayStr);

      if (existingToday && !forceRegenerateToday) {
        setSavedBriefingsList(savedRows);
        setCurrentBriefing(existingToday);
        setSelectedBriefingDate(todayStr);
        return;
      }

      // 2. Ainda não existe resumo de hoje para este usuário (ou pediu atualização manual) -> gera agora e salva no banco
      const freshPayload = await buildDailyBriefingPayload(todayStr);

      const upsertResp = await fetch(
        `${SUPA_URL}/rest/v1/daily_briefings?on_conflict=user_id,briefing_date`,
        {
          method: 'POST',
          headers: {
            ...headers,
            Prefer: 'resolution=merge-duplicates,return=representation'
          },
          body: JSON.stringify({
            empresa_id: empresaId,
            user_id: userId,
            user_name: nomeUsuario,
            briefing_date: todayStr,
            payload: freshPayload,
            updated_at: new Date().toISOString()
          })
        }
      );

      let savedRecord = {
        briefing_date: todayStr,
        user_name: nomeUsuario,
        payload: freshPayload,
        updated_at: new Date().toISOString()
      };

      if (upsertResp.ok) {
        const upsertedArr = await upsertResp.json();
        if (Array.isArray(upsertedArr) && upsertedArr[0]) {
          savedRecord = upsertedArr[0];
        }
      }

      const updatedList = [
        savedRecord,
        ...savedRows.filter(r => r.briefing_date !== todayStr)
      ].slice(0, 15);

      setSavedBriefingsList(updatedList);
      setCurrentBriefing(savedRecord);
      setSelectedBriefingDate(todayStr);
    } catch (err) {
      console.error('Erro ao carregar/gerar Resumo Diário:', err);
    } finally {
      setBriefingLoading(false);
      setRefreshingBriefing(false);
    }
  }, [userId, empresaId, nomeUsuario, buildDailyBriefingPayload]);

  useEffect(() => {
    if (profile?.id || session?.user?.id) {
      loadOrGenerateBriefing(false);
    }
  }, [profile?.id, session?.user?.id, loadOrGenerateBriefing]);

  const handleSelectSavedDate = (dateStr) => {
    setSelectedBriefingDate(dateStr);
    const found = savedBriefingsList.find(r => r.briefing_date === dateStr);
    if (found) {
      setCurrentBriefing(found);
    }
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Atalhos disponíveis com validação de permissões (Sem Finanças Pessoais)
  const shortcuts = [
    {
      to: '/ads-ia',
      name: 'IA de Vendas & Ads',
      desc: 'Histórico diário de vendas, promoções e ROAS ML/Shopee',
      icon: <Bot size={22} />,
      page: 'vendas'
    },
    {
      to: '/pedidos',
      name: 'Pedidos & Produção',
      desc: 'Documentos de venda, status de entrega e baixas',
      icon: <ClipboardList size={22} />,
      page: 'pedidos'
    },
    {
      to: '/consignados',
      name: 'Consignados',
      desc: 'Controle de remessas, lotes em aberto e acertos',
      icon: <Handshake size={22} />,
      page: 'consignados'
    },
    {
      to: '/estoque',
      name: 'Estoque & Anúncios',
      desc: 'Saldo unificado de FTs e sincronização ML/Shopee',
      icon: <Package size={22} />,
      page: 'estoque'
    },
    {
      to: '/vendas',
      name: 'Precificação Multi-Canal',
      desc: 'Simulador de margens, taxas e preços por canal',
      icon: <ShoppingCart size={22} />,
      page: 'vendas'
    },
    {
      to: '/fichas-tecnicas',
      name: 'Cadastro de FTs',
      desc: 'Fichas técnicas, pesos e custos de produção 3D',
      icon: <Calculator size={22} />,
      page: 'fichas-tecnicas'
    },
    {
      to: '/resumo',
      name: 'Resumo Financeiro Empresa',
      desc: 'Faturamento empresarial, despesas e lucratividade',
      icon: <BarChart3 size={22} />,
      page: 'resumo'
    }
  ].filter(s => canView(s.page));

  const b = currentBriefing?.payload;
  const todayStr = getBrazilDateStr(0);
  const isViewingToday = selectedBriefingDate === todayStr;

  return (
    <div className="home-container">
      <div className="home-dashboard-shell">
        {/* ── Hero / Boas-Vindas Personalizado para o Usuário Logado ── */}
        <div className="home-hero-banner">
          <div className="home-hero-left">
            <div className="home-logo-wrapper">
              <div className="home-logo-glow" />
              <img src="/logo.png" alt="A&M 3D Logo" className="home-logo" />
            </div>
            <div className="home-hero-titles">
              <div className="home-greeting-pill">
                <Sparkles size={14} />
                <span>Resumo Diário Personalizado • {nomeUsuario}</span>
              </div>
              <h1 className="home-title">{getGreeting()}, {nomeUsuario}!</h1>
              <div className="home-datetime">
                <Calendar size={14} />
                <span>{formatDate(currentTime)} às {formatTime(currentTime)}</span>
              </div>
            </div>
          </div>

          <div className="home-hero-controls">
            {savedBriefingsList.length > 0 && (
              <div className="home-history-selector">
                <History size={15} className="home-history-icon" />
                <label htmlFor="briefing-date-select">Resumos Salvos:</label>
                <select
                  id="briefing-date-select"
                  value={selectedBriefingDate}
                  onChange={(e) => handleSelectSavedDate(e.target.value)}
                  className="home-history-select"
                >
                  {savedBriefingsList.map((item) => (
                    <option key={item.briefing_date} value={item.briefing_date}>
                      {formatDateBR(item.briefing_date)} {item.briefing_date === todayStr ? '(Hoje)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              className="home-refresh-btn"
              onClick={() => loadOrGenerateBriefing(true)}
              disabled={refreshingBriefing || briefingLoading}
              title="Recalcular e atualizar o resumo de hoje com os dados mais recentes"
            >
              <RefreshCw size={15} className={refreshingBriefing ? 'spin-icon' : ''} />
              <span>{refreshingBriefing ? 'Atualizando...' : 'Atualizar Resumo de Hoje'}</span>
            </button>
          </div>
        </div>

        {/* ── Barra de Status do Briefing Salvo ── */}
        <div className="home-briefing-status-bar">
          <div className="home-briefing-status-left">
            <span className="home-status-dot" />
            <span>
              {isViewingToday
                ? `✨ Resumo oficial de hoje (${formatDateBR(selectedBriefingDate)}) — gerado 1x ao dia automaticamente e salvo na sua conta.`
                : `📂 Visualizando resumo arquivado do dia ${formatDateBR(selectedBriefingDate)} para ${nomeUsuario}.`}
            </span>
          </div>
          {b?.generatedAt && (
            <div className="home-briefing-timestamp">
              <Clock size={13} />
              <span>
                Salvo às {new Date(b.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}
        </div>

        {/* ── Conteúdo do Resumo Inteligente do Dia ── */}
        {briefingLoading && !b ? (
          <div className="home-loading-card">
            <RefreshCw size={28} className="spin-icon" />
            <h3>Montando o seu Resumo Inteligente do Dia...</h3>
            <p>Analisando vendas de ontem dos marketplaces, pedidos em aberto, lotes consignados e alertas de estoque.</p>
          </div>
        ) : b ? (
          <>
            {/* 1. Cards executivos principais (4 KPIs de topo) */}
            <div className="home-kpi-grid">
              {/* Vendas de Ontem Marketplaces */}
              <Link to="/ads-ia" className="home-kpi-card kpi-purple">
                <div className="home-kpi-header">
                  <span className="home-kpi-tag">🛍️ Vendas de Ontem ({formatDateBR(b.yesterdayDate)})</span>
                  <TrendingUp size={18} className="home-kpi-icon" />
                </div>
                <div className="home-kpi-main">
                  <span className="home-kpi-value">R$ {fmtBRL(b.sales?.yesterday?.revenue)}</span>
                  <span className="home-kpi-badge">{b.sales?.yesterday?.units || 0} un.</span>
                </div>
                <div className="home-kpi-channels">
                  <span>📦 ML: <strong>{b.sales?.yesterday?.mlUnits || 0} un.</strong> (R$ {fmtBRL(b.sales?.yesterday?.mlRevenue)})</span>
                  <span>🛍️ Shopee: <strong>{b.sales?.yesterday?.shopeeUnits || 0} un.</strong> (R$ {fmtBRL(b.sales?.yesterday?.shopeeRevenue)})</span>
                </div>
                <div className="home-kpi-footer">
                  <span>Hoje parcial: <strong>{b.sales?.today?.units || 0} un.</strong> (R$ {fmtBRL(b.sales?.today?.revenue)})</span>
                  <span>Mês: <strong>R$ {fmtBRL(b.sales?.month?.revenue)}</strong></span>
                </div>
              </Link>

              {/* Pedidos em Aberto / Implementados */}
              <Link to="/pedidos" className="home-kpi-card kpi-blue">
                <div className="home-kpi-header">
                  <span className="home-kpi-tag">📋 Pedidos & Produção</span>
                  <ClipboardList size={18} className="home-kpi-icon" />
                </div>
                <div className="home-kpi-main">
                  <span className="home-kpi-value">{b.pedidos?.pendingCount || 0} em aberto</span>
                  <span className={`home-kpi-badge ${(b.pedidos?.pendingCount || 0) > 0 ? 'badge-warn' : 'badge-ok'}`}>
                    R$ {fmtBRL(b.pedidos?.pendingTotalValue)}
                  </span>
                </div>
                <div className="home-kpi-channels">
                  {(b.pedidos?.pendingCount || 0) > 0 ? (
                    <span>⏳ Mais antigo em aberto há <strong>{b.pedidos?.maxPendingDays} dias</strong></span>
                  ) : (
                    <span>✅ Nenhum pedido pendente de baixa</span>
                  )}
                </div>
                <div className="home-kpi-footer">
                  <span>✅ Finalizados (Mês): <strong>{b.pedidos?.paidMonthCount || 0}</strong> (R$ {fmtBRL(b.pedidos?.paidMonthRevenue)})</span>
                  <span>Total pagos: <strong>{b.pedidos?.paidTotalCount || 0}</strong></span>
                </div>
              </Link>

              {/* Consignados em Aberto */}
              <Link to="/consignados" className="home-kpi-card kpi-amber">
                <div className="home-kpi-header">
                  <span className="home-kpi-tag">🤝 Consignados em Aberto</span>
                  <Handshake size={18} className="home-kpi-icon" />
                </div>
                <div className="home-kpi-main">
                  <span className="home-kpi-value">{b.consignados?.totalOpenUnits || 0} peças</span>
                  <span className="home-kpi-badge badge-amber">
                    R$ {fmtBRL(b.consignados?.totalOpenValue)}
                  </span>
                </div>
                <div className="home-kpi-channels">
                  <span>
                    <strong>{b.consignados?.openAccountsCount || 0}</strong> {b.consignados?.openAccountsCount === 1 ? 'cliente ativo' : 'clientes ativos'} • <strong>{b.consignados?.totalOpenBatches || 0}</strong> remessas c/ saldo
                  </span>
                </div>
                <div className="home-kpi-footer">
                  {b.consignados?.accounts?.[0] ? (
                    <>
                      <span>{b.consignados.accounts[0].cliente}: <strong>há {b.consignados.accounts[0].oldestDaysOpen} dias</strong></span>
                      <span>Últ. acerto: <strong>{b.consignados.accounts[0].daysSinceLastPayment ?? '—'}d</strong></span>
                    </>
                  ) : (
                    <span>✅ Todos os lotes acertados</span>
                  )}
                </div>
              </Link>

              {/* Estoque & Produtos a Melhorar */}
              <Link to="/estoque" className="home-kpi-card kpi-emerald">
                <div className="home-kpi-header">
                  <span className="home-kpi-tag">📦 Estoque & Giro (30d)</span>
                  <AlertTriangle size={18} className="home-kpi-icon" />
                </div>
                <div className="home-kpi-main">
                  <span className="home-kpi-value">{b.estoque?.criticalCount || 0} críticos</span>
                  <span className="home-kpi-badge badge-emerald">
                    {b.estoque?.improveCount || 0} a melhorar
                  </span>
                </div>
                <div className="home-kpi-channels">
                  <span>🔴 Reposição urgente (≤ 2 un.): <strong>{b.estoque?.criticalCount || 0} itens</strong></span>
                </div>
                <div className="home-kpi-footer">
                  <span>🟡 Anunciados s/ venda 30d: <strong>{b.estoque?.improveCount || 0} FTs</strong></span>
                  <span>Ver Estoque →</span>
                </div>
              </Link>
            </div>

            {/* 2. Foco Recomendado do Dia (Checklist de Ação Rápida) */}
            {Array.isArray(b.priorities) && b.priorities.length > 0 && (
              <div className="home-priorities-card">
                <div className="home-section-header">
                  <div className="home-section-title">
                    <CheckCircle2 size={18} className="text-purple" />
                    <h3>Foco & Prioridades do Dia para {nomeUsuario}</h3>
                  </div>
                  <span className="home-section-sub">Gerado automaticamente com base nas pendências reais do sistema</span>
                </div>
                <div className="home-priorities-list">
                  {b.priorities.map((item, idx) => (
                    <div key={idx} className={`home-priority-row severity-${item.severity}`}>
                      <div className="home-priority-indicator" />
                      <div className="home-priority-body">
                        <div className="home-priority-title">{item.title}</div>
                        <div className="home-priority-detail">{item.detail}</div>
                      </div>
                      <Link to={item.to} className="home-priority-cta">
                        <span>{item.cta}</span>
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 3. Painéis Detalhados em Grid (Pedidos + Consignados | Vendas + Produtos a Melhorar) */}
            <div className="home-details-grid">
              {/* Coluna Esquerda: Pedidos Não Finalizados & Consignados */}
              <div className="home-detail-panel">
                <div className="home-panel-header">
                  <h4>📋 Pedidos Não Finalizados ({b.pedidos?.pendingCount || 0})</h4>
                  <Link to="/pedidos" className="home-panel-link">Abrir Pedidos →</Link>
                </div>

                {Array.isArray(b.pedidos?.pendingList) && b.pedidos.pendingList.length > 0 ? (
                  <div className="home-mini-list">
                    {b.pedidos.pendingList.map((ped) => (
                      <div key={ped.id} className="home-mini-row">
                        <div className="home-mini-main">
                          <span className="home-mini-badge">#{String(ped.id).padStart(4, '0')}</span>
                          <span className="home-mini-title">{ped.cliente}</span>
                          <span className="home-mini-sub">({ped.itensCount} {ped.itensCount === 1 ? 'item' : 'itens'})</span>
                        </div>
                        <div className="home-mini-right">
                          <span className={`home-days-tag ${ped.daysOpen >= 10 ? 'days-alert' : 'days-warn'}`}>
                            há {ped.daysOpen} {ped.daysOpen === 1 ? 'dia' : 'dias'}
                          </span>
                          <span className="home-mini-price">R$ {fmtBRL(ped.total)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="home-empty-mini">✅ Todos os pedidos estão finalizados!</div>
                )}

                <div className="home-panel-divider" />

                <div className="home-panel-header">
                  <h4>🤝 Detalhe dos Consignados em Aberto</h4>
                  <Link to="/consignados" className="home-panel-link">Abrir Consignados →</Link>
                </div>

                {Array.isArray(b.consignados?.accounts) && b.consignados.accounts.length > 0 ? (
                  <div className="home-mini-list">
                    {b.consignados.accounts.map((acc) => (
                      <div key={acc.id} className="home-mini-row">
                        <div className="home-mini-main">
                          <span className="home-mini-badge badge-amber-soft">{acc.cliente}</span>
                          <span className="home-mini-sub">
                            {acc.openBatches} remessas • {acc.openUnits} peças na loja
                          </span>
                        </div>
                        <div className="home-mini-right">
                          <span className="home-days-tag days-amber">
                            em aberto há {acc.oldestDaysOpen}d
                          </span>
                          <span className="home-mini-price">R$ {fmtBRL(acc.openValue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="home-empty-mini">✅ Nenhum consignado pendente no momento.</div>
                )}
              </div>

              {/* Coluna Direita: Produtos a Melhorar, Reposição & Destaques de Vendas */}
              <div className="home-detail-panel">
                <div className="home-panel-header">
                  <h4>🚀 Produtos a Melhorar & Reposição de Estoque</h4>
                  <Link to="/ads-ia" className="home-panel-link">Ir para IA de Vendas →</Link>
                </div>

                {Array.isArray(b.estoque?.criticalList) && b.estoque.criticalList.length > 0 && (
                  <div className="home-subblock">
                    <div className="home-subblock-title text-danger">
                      🔴 Reposição Urgente — Anunciados com Estoque ≤ 2 un.
                    </div>
                    <div className="home-chips-wrap">
                      {b.estoque.criticalList.map((it, i) => (
                        <Link to="/estoque" key={i} className="home-stock-chip chip-critical">
                          <strong>{it.ft_id}</strong>
                          <span>{it.nome}{it.variacao ? ` (${it.variacao})` : ''}</span>
                          <span className="chip-qty">{it.estoque} un.</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(b.estoque?.improveList) && b.estoque.improveList.length > 0 && (
                  <div className="home-subblock">
                    <div className="home-subblock-title text-amber">
                      🟡 Produtos a Melhorar — Estoque Alto s/ Venda há 30+ dias
                    </div>
                    <div className="home-chips-wrap">
                      {b.estoque.improveList.map((it, i) => (
                        <Link to="/ads-ia" key={i} className="home-stock-chip chip-improve">
                          <strong>{it.ft_id}</strong>
                          <span>{it.nome}</span>
                          <span className="chip-qty">{it.estoque} un. paradas</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                <div className="home-panel-divider" />

                <div className="home-panel-header">
                  <h4>🏆 Campeões de Venda no Mês ({b.sales?.month?.units || 0} un. • R$ {fmtBRL(b.sales?.month?.revenue)})</h4>
                  <Link to="/ads-ia" className="home-panel-link">Ver Histórico Diário →</Link>
                </div>

                {Array.isArray(b.sales?.month?.topProducts) && b.sales.month.topProducts.length > 0 ? (
                  <div className="home-mini-list">
                    {b.sales.month.topProducts.map((prod, idx) => (
                      <div key={prod.ft_id} className="home-mini-row">
                        <div className="home-mini-main">
                          <span className="home-mini-badge">{idx + 1}º • {prod.ft_id}</span>
                          <span className="home-mini-title">{prod.nome}</span>
                        </div>
                        <div className="home-mini-right">
                          <span className="home-days-tag days-emerald">{prod.units} un.</span>
                          <span className="home-mini-price">R$ {fmtBRL(prod.revenue)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="home-empty-mini">Nenhuma venda sincronizada neste mês ainda.</div>
                )}
              </div>
            </div>
          </>
        ) : null}

        {/* ── Atalhos Rápidos do Sistema ── */}
        {shortcuts.length > 0 && (
          <div className="home-shortcuts-section">
            <h3 className="home-shortcuts-title">Acesso Rápido aos Módulos</h3>
            <div className="home-shortcuts-grid">
              {shortcuts.map(shortcut => (
                <Link key={shortcut.to} to={shortcut.to} className="home-shortcut-card">
                  <div className="home-shortcut-icon-wrapper">
                    {shortcut.icon}
                  </div>
                  <div className="home-shortcut-info">
                    <div className="home-shortcut-name">{shortcut.name}</div>
                    <div className="home-shortcut-desc">{shortcut.desc}</div>
                  </div>
                  <ArrowRight className="home-shortcut-arrow" size={18} />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
