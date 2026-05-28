import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Loader, Trash2, Calendar, Printer } from 'lucide-react';
import './Pedidos.css'; 

const parseN = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  // Extrai apenas dígitos, ponto, vírgula e sinal de menos
  let str = String(v).replace(/[^\d.,-]/g, '');
  // Se a string tem vírgula, vamos assumir que é o separador decimal do padrão BR
  if (str.includes(',')) {
    // remove os pontos de milhar, se houver, e troca a vírgula decimal por ponto
    str = str.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(str);
  return isNaN(n) ? 0 : n;
};

const fmt = (n) => {
  const num = Number(n);
  if (isNaN(num)) return '0,00';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// ─── Geração de impressão via nova janela ─────────────────────────────────────
const getPrintTemplate = (title, docNum, dateStr, accentColor, accentBg, clientData, itemsHtml, totalsHtml, assinaturaHtml = '', obsHtml = '', headersHtml = '') => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${title} — AM3D</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@700;900&display=swap" rel="stylesheet">
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', Arial, sans-serif; font-size: 10pt; color: #1E293B; background: #fff; }

    .top-stripe {
      height: 6px;
      background: linear-gradient(90deg, #8B5CF6, #60A5FA, #34D399);
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .page {
      padding: 1.4cm 2cm 1.4cm 2cm;
      min-height: calc(297mm - 6px);
      display: flex; flex-direction: column; gap: 0;
    }

    /* ─ Header ─ */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .logo-area { display: flex; align-items: center; gap: 14px; }
    .logo-img  { max-height: 66px; max-width: 190px; object-fit: contain; }
    .logo-fallback { display: none; align-items: center; gap: 12px; }
    .logo-box {
      width: 52px; height: 52px;
      background: linear-gradient(135deg,#60A5FA,#8B5CF6,#34D399);
      border-radius: 10px; display: flex; align-items: center; justify-content: center;
      color: #fff; font-family: 'Outfit',sans-serif; font-size: 15pt; font-weight: 900;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .company-name { font-family: 'Outfit',sans-serif; font-size: 20pt; font-weight: 900; color: #1E293B; line-height: 1; }
    .company-sub  { font-size: 8pt; color: #94A3B8; margin-top: 3px; }

    .doc-badge-wrap { text-align: right; }
    .doc-badge {
      display: inline-block; padding: 5px 14px;
      background: ${accentBg}; color: ${accentColor};
      font-size: 8pt; font-weight: 800; letter-spacing: 1.5px;
      border-radius: 20px; margin-bottom: 6px;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .doc-num  { font-family: 'Outfit',sans-serif; font-size: 20pt; font-weight: 900; color: #1E293B; line-height: 1.1; }
    .doc-date { font-size: 8.5pt; color: #64748B; margin-top: 4px; }

    /* ─ Dividers ─ */
    .divider        { height: 1px; background: #E2E8F0; margin: 16px 0; }
    .divider-accent {
      height: 2px; margin: 16px 0;
      background: linear-gradient(90deg, ${accentColor}66, transparent);
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }

    /* ─ Section label ─ */
    .section-label {
      font-size: 7pt; font-weight: 800; text-transform: uppercase;
      letter-spacing: 1.5px; color: ${accentColor}; margin-bottom: 10px;
      display: flex; align-items: center; gap: 8px;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .section-label::after { content: ''; flex: 1; height: 1px; background: #E2E8F0; }

    /* ─ Client card ─ */
    .client-card {
      background: #F8FAFC; border-radius: 10px; border: 1px solid #E2E8F0;
      padding: 14px 18px; display: grid; grid-template-columns: 1fr 1fr;
      gap: 8px 24px; font-size: 9.5pt;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .client-field { display: flex; gap: 5px; }
    .field-label  { font-weight: 700; color: #64748B; white-space: nowrap; }
    .field-value  { color: #1E293B; }
    .client-full  { grid-column: 1 / -1; }

    .obs-box {
      background: #FFFBEB; border-left: 3px solid #FBBF24;
      padding: 10px 14px; border-radius: 0 8px 8px 0;
      font-size: 9pt; color: #92400E; margin-top: 4px;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }

    /* ─ Table ─ */
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    thead tr { background: #1E293B; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    thead th {
      padding: 9px 10px; color: #fff; font-size: 7.5pt;
      font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; text-align: left;
    }
    tbody td { padding: 9px 10px; border-bottom: 1px solid #F1F5F9; font-size: 9.5pt; }
    tbody tr.row-even { background: #F8FAFC; print-color-adjust: exact; -webkit-print-color-adjust: exact; }

    .cell-right  { text-align: right; }
    .cell-center { text-align: center; }
    .cell-bold   { font-weight: 700; }
    .cell-name   { font-weight: 500; }
    .text-muted  { color: #64748B; }
    .text-danger { color: #DC2626; font-weight: 700; }
    .cell-id { font-weight: 700; color: #1E293B; font-size: 9.5pt; }

    /* ─ Total ─ */
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 8px; gap: 10px; }
    .total-box {
      background: ${accentBg}; border-radius: 10px; padding: 13px 22px;
      text-align: right; min-width: 200px;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .total-label { font-size: 7.5pt; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: 1px; }
    .total-value { font-family: 'Outfit',sans-serif; font-size: 18pt; font-weight: 900; color: ${accentColor}; margin-top: 2px; }

    /* ─ Assinatura ─ */
    .sign-section { margin-top: 26px; }
    .sign-banner {
      display: flex; align-items: flex-start; gap: 12px;
      background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px;
      padding: 13px 16px; margin-bottom: 28px;
      font-size: 9pt; color: #475569; line-height: 1.6;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .sign-icon  { font-size: 18pt; flex-shrink: 0; }
    .sign-grid  { display: flex; gap: 48px; }
    .sign-block { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
    .sign-line  { width: 100%; border-bottom: 1.5px solid #64748B; height: 52px; }
    .sign-label { font-size: 8pt; font-weight: 700; color: #64748B; }
    .sign-name  { font-size: 8.5pt; color: #1E293B; font-weight: 500; }

    /* ─ Footer ─ */
    .footer {
      margin-top: auto; padding-top: 16px;
      display: flex; justify-content: space-between; align-items: center;
      border-top: 1px solid #E2E8F0; font-size: 7.5pt; color: #94A3B8;
    }
    .footer-brand { font-weight: 700; color: #64748B; }
  </style>
</head>
<body>
  <div class="top-stripe"></div>
  <div class="page">
    <div class="header">
      <div class="logo-area">
        <img class="logo-img" src="${window.location.origin}/logo.png" alt="Logo"
          onerror="this.style.display='none'; document.getElementById('lf').style.display='flex';"/>
        <div id="lf" class="logo-fallback">
          <div class="logo-box">3D</div>
          <div><div class="company-name">AM3D</div><div class="company-sub">Impressão 3D Profissional</div></div>
        </div>
      </div>
      <div class="doc-badge-wrap">
        <div class="doc-badge">${title}</div>
        ${docNum ? `<div class="doc-num">${docNum}</div>` : ''}
        <div class="doc-date">📅 ${dateStr}</div>
      </div>
    </div>
    <div class="divider-accent"></div>
    <div class="section-label">Dados do Cliente</div>
    <div class="client-card">
      <div class="client-field"><span class="field-label">Nome:</span><span class="field-value">${clientData.nome || '—'}</span></div>
      <div class="client-field"><span class="field-label">Telefone:</span><span class="field-value">${clientData.telefone || '—'}</span></div>
      <div class="client-field"><span class="field-label">E-mail:</span><span class="field-value">${clientData.email || '—'}</span></div>
      <div class="client-field client-full"><span class="field-label">Endereço:</span><span class="field-value">${clientData.endereco || '—'}</span></div>
    </div>
    ${obsHtml}
    <div class="divider"></div>
    <div class="section-label">Itens</div>
    <table>
      <thead>
        ${headersHtml || `
          <tr>
            <th style="width:30px">#</th>
            <th style="width:60px">ID</th>
            <th>Descrição</th>
            <th style="width:90px;text-align:right">Preço Unit.</th>
            <th style="width:70px;text-align:center">Qtd</th>
            <th style="width:105px;text-align:right">Subtotal</th>
          </tr>
        `}
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>
    <div class="totals-wrap">
      ${totalsHtml}
    </div>
    ${assinaturaHtml}
    <div class="footer">
      <span class="footer-brand">AM3D — Impressão 3D Profissional</span>
      <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
    </div>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>
`;

const openPrintBatchWindow = (batch, cliente) => {
  const total = batch.items.reduce((s, it) => s + parseN(it.precoUnit) * parseN(it.qtd), 0);
  const dateStr = new Date(batch.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const accentColor = '#475569';
  const accentBg = '#F1F5F9';

  const sortedItems = [...batch.items].sort((a, b) => String(a.indiceFt || '').localeCompare(String(b.indiceFt || '')));
  const itemsHtml = sortedItems.map((it, i) => `
    <tr class="${i % 2 === 0 ? 'row-even' : ''}">
      <td class="cell-center text-muted">${i + 1}</td>
      <td class="cell-id">${it.indiceFt}</td>
      <td class="cell-name">${it.nomePeca}</td>
      <td class="cell-right text-muted">R$ ${fmt(parseN(it.precoUnit))}</td>
      <td class="cell-center cell-bold">${parseN(it.qtd)}</td>
      <td class="cell-right cell-bold">R$ ${fmt(parseN(it.precoUnit) * parseN(it.qtd))}</td>
    </tr>
  `).join('');

  const assinaturaHtml = `
    <div class="sign-section">
      <div class="sign-banner">
        <span class="sign-icon">🤝</span>
        <p>Declaro ter recebido os itens listados em regime de <strong>CONSIGNADO</strong>, comprometendo-me a devolver os produtos não vendidos ou efetuar o pagamento no prazo acordado.</p>
      </div>
      <div class="sign-grid">
        <div class="sign-block">
          <div class="sign-line"></div>
          <p class="sign-label">Assinatura do Cliente</p>
          <p class="sign-name">${cliente.nome || '________________________________'}</p>
        </div>
        <div class="sign-block">
          <div class="sign-line"></div>
          <p class="sign-label">Responsável AM3D</p>
          <p class="sign-name">Data: _______ / _______ / _________</p>
        </div>
      </div>
    </div>
  `;

  const totalsHtml = `
    <div class="total-box">
      <div class="total-label">Total da Remessa</div>
      <div class="total-value">R$ ${fmt(total)}</div>
    </div>
  `;

  const obsHtml = cliente.obs ? `
    <div class="divider"></div>
    <div class="section-label">Observações</div>
    <div class="obs-box">${cliente.obs}</div>
  ` : '';

  const html = getPrintTemplate('REMESSA CONSIGNADO', '', dateStr, accentColor, accentBg, cliente, itemsHtml, totalsHtml, assinaturaHtml, obsHtml);
  const win = window.open('', '_blank', 'width=960,height=780');
  win.document.write(html);
  win.document.close();
};

const openPrintBalanceWindow = (aggregatedItems, cliente, stats) => {
  const openItems = Object.values(aggregatedItems).filter(it => (it.totalQtd - it.totalPago) > 0);
  openItems.sort((a, b) => String(a.indiceFt || '').localeCompare(String(b.indiceFt || '')));
  
  const accentColor = '#059669';
  const accentBg = '#D1FAE5';
  const dateStr = new Date().toLocaleDateString('pt-BR');

  const itemsHtml = openItems.length === 0 ? `
    <tr><td colspan="8" class="cell-center text-muted" style="padding: 2rem;">Não há peças em aberto no momento. 🎉</td></tr>
  ` : openItems.map((it, i) => {
    const emAberto = it.totalQtd - it.totalPago;
    return `
      <tr class="${i % 2 === 0 ? 'row-even' : ''}">
        <td class="cell-center text-muted">${i + 1}</td>
        <td class="cell-id">${it.indiceFt}</td>
        <td class="cell-name">${it.nomePeca}</td>
        <td class="cell-right text-muted">R$ ${fmt(parseN(it.precoUnit))}</td>
        <td class="cell-center cell-bold">${it.totalQtd}</td>
        <td class="cell-center" style="color: #059669; font-weight: bold;">${it.totalPago}</td>
        <td class="cell-center text-danger">${emAberto}</td>
        <td class="cell-right cell-bold">R$ ${fmt(parseN(it.precoUnit) * emAberto)}</td>
      </tr>
    `;
  }).join('');

  const headersHtml = `
    <tr>
      <th style="width:30px">#</th>
      <th style="width:60px">ID</th>
      <th>Descrição</th>
      <th style="width:90px;text-align:right">Preço Unit.</th>
      <th style="width:70px;text-align:center">Enviados</th>
      <th style="width:70px;text-align:center">Pagos</th>
      <th style="width:70px;text-align:center">Aberto</th>
      <th style="width:105px;text-align:right">Subtotal</th>
    </tr>
  `;

  const totalsHtml = `
    <div class="total-box">
      <div class="total-label">Saldo Devedor</div>
      <div class="total-value">R$ ${fmt(stats.balance)}</div>
    </div>
  `;

  const html = getPrintTemplate('EXTRATO DE SALDO EM ABERTO', 'CONSIGNADO', dateStr, accentColor, accentBg, cliente, itemsHtml, totalsHtml, '', '', headersHtml);
  const win = window.open('', '_blank', 'width=960,height=780');
  win.document.write(html);
  win.document.close();
};

export default function Consignados() {
  const [accounts, setAccounts] = useState([]);
  const [fts, setFts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // States for views
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showNewPaymentModal, setShowNewPaymentModal] = useState(false);

  // Form states
  const [newClient, setNewClient] = useState({ nome: '', telefone: '', email: '', endereco: '', obs: '', tipoAcerto: 'integral', comissaoPct: '0' });
  const [newBatchItems, setNewBatchItems] = useState([]);
  const [newBatchDate, setNewBatchDate] = useState('');
  const [batchMarkup, setBatchMarkup] = useState('1');
  
  // Payment states
  const [itemsToPay, setItemsToPay] = useState([]);
  const [paymentObs, setPaymentObs] = useState('');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [modalSortField, setModalSortField] = useState('id');
  const [modalSortAsc, setModalSortAsc] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      const [accResp, ftsResp, orcsResp] = await Promise.allSettled([
        fetch(`${SUPA_URL}/rest/v1/consignados?select=*&order=created_at.desc`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=*&order=id.asc`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/orcamentos_rapidos?select=*&order=id.asc`, { headers })
      ]);

      if (accResp.status === 'fulfilled' && accResp.value.ok) {
        setAccounts(await accResp.value.json());
      }

      const ftsData = ftsResp.status === 'fulfilled' && ftsResp.value.ok ? await ftsResp.value.json() : [];
      const cleanFts = ftsData.map(r => r.data || r).filter(f => f && f.indiceFt);
      
      const orcsData = orcsResp.status === 'fulfilled' && orcsResp.value.ok ? await orcsResp.value.json() : [];
      const cleanOrcs = orcsData.map(r => ({
        indiceFt: r.id,
        nomePeca: r.name,
        _custoFinal: 0,
        isOrcamento: true,
        precoSugerido: r.data?.price || 0
      }));

      setFts([...cleanFts, ...cleanOrcs]);
    } catch (e) {
      console.error('Erro ao buscar dados:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateFtStock = async (ftId, delta) => {
    if (delta === 0) return;
    if (String(ftId).startsWith('ORC-')) return;
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}&select=estoque`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
      });
      if (!getResp.ok) return;
      const data = await getResp.json();
      const currentStock = data[0]?.estoque || 0;
      const newStock = currentStock - delta;

      await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ estoque: newStock })
      });
    } catch (e) {
      console.error('Erro ao abater estoque:', e);
    }
  };

  const handleCreateAccount = async () => {
    if (!newClient.nome.trim()) return alert("O nome do cliente é obrigatório.");
    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const resp = await fetch(`${SUPA_URL}/rest/v1/consignados`, {
        method: 'POST',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cliente: newClient,
          batches: [],
          payments: []
        })
      });

      if (!resp.ok) throw new Error("Erro ao criar conta.");
      
      setShowNewAccountModal(false);
      setNewClient({ nome: '', telefone: '', email: '', endereco: '', obs: '' });
      fetchData();
    } catch (e) {
      alert(e.message);
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (account, e) => {
    if (e) e.stopPropagation();
    
    if (!window.confirm(`⚠️ EXCLUIR CLIENTE PERMANENTEMENTE?\n\nTem certeza que deseja excluir o cliente "${account.cliente?.nome}"?\n\nTodos os registros de remessas e pagamentos deste cliente serão apagados para sempre. Esta ação NÃO pode ser desfeita.`)) {
      return;
    }

    const devolverEstoque = window.confirm("Deseja devolver as peças das remessas em aberto deste cliente de volta ao estoque físico antes de excluí-lo?\n\n• Clique em [OK] para DEVOLVER os itens ao estoque.\n• Clique em [Cancelar] para APAGAR o cliente sem alterar o estoque atual.");

    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (devolverEstoque && account.batches && account.batches.length > 0) {
        // Devolver itens de todas as remessas
        for (const batch of account.batches) {
          for (const it of (batch.items || [])) {
            const openQty = parseN(it.qtd) - parseN(it.qtdPago);
            if (openQty > 0) {
              await updateFtStock(it.indiceFt, -openQty); // Negativo devolve pro estoque
            }
          }
        }
      }

      const resp = await fetch(`${SUPA_URL}/rest/v1/consignados?id=eq.${account.id}`, {
        method: 'DELETE',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`
        }
      });

      if (!resp.ok) throw new Error("Erro ao excluir conta do cliente.");

      alert("Cliente excluído com sucesso!");
      setSelectedAccount(null);
      fetchData();
    } catch (err) {
      alert(err.message);
      setLoading(false);
    }
  };

  const handleSortClick = (field) => {
    if (modalSortField === field) {
      setModalSortAsc(prev => !prev);
    } else {
      setModalSortField(field);
      setModalSortAsc(true);
    }
  };

  const renderSortIndicator = (field) => {
    if (modalSortField !== field) return '';
    return modalSortAsc ? ' ▲' : ' ▼';
  };

  const openBatchModal = () => {
    setNewBatchItems(fts.map(ft => ({
      indiceFt: ft.indiceFt,
      nomePeca: ft.nomePeca,
      custoBase: ft._custoFinal || 0,
      precoUnit: ft.isOrcamento ? (ft.precoSugerido || 0).toFixed(2) : ((ft._custoFinal || 0) * parseN(batchMarkup)).toFixed(2),
      qtd: '', // Use empty string for better UX
      qtdPago: 0,
      isOrcamento: ft.isOrcamento
    })));
    setSearchTerm('');
    setModalSortField('id');
    setModalSortAsc(true);
    // Formato YYYY-MM-DD para input date
    const today = new Date();
    // Compensar timezone para garantir que pegamos a data local correta
    const offsetDate = new Date(today.getTime() - (today.getTimezoneOffset() * 60000));
    setNewBatchDate(offsetDate.toISOString().split('T')[0]);
    setShowNewBatchModal(true);
  };

  const updateBatchItem = (idx, field, value) => {
    setNewBatchItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx] }; // Clone profundo para garantir re-render do React
      if (field === 'qtd') {
        next[idx][field] = value === '' ? '' : parseN(value);
      } else {
        next[idx][field] = value;
      }
      return next;
    });
  };

  const applyBatchMarkup = () => {
    const m = parseN(batchMarkup);
    if (m <= 0) return;
    setNewBatchItems(prev => prev.map(it => {
      if (it.isOrcamento) return it;
      return { ...it, precoUnit: (it.custoBase * m).toFixed(2) };
    }));
  };

  const handleSaveBatch = async () => {
    const selectedItems = newBatchItems.filter(it => parseN(it.qtd) > 0);
    if (selectedItems.length === 0) return alert("Adicione pelo menos 1 item.");
    if (!newBatchDate) return alert("Defina a data da remessa.");

    setLoading(true);
    try {
      const formattedItems = selectedItems.map(it => ({
        ...it,
        qtd: parseN(it.qtd),
        precoUnit: parseN(it.precoUnit)
      }));

      // Forçamos um T12:00:00 para manter a data escolhida corretamente no display sem pular de dia
      const batchDateStr = `${newBatchDate}T12:00:00Z`;

      const newBatch = {
        id: `B-${Date.now()}`,
        date: batchDateStr,
        items: formattedItems
      };

      const updatedBatches = [...(selectedAccount.batches || []), newBatch];

      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const resp = await fetch(`${SUPA_URL}/rest/v1/consignados?id=eq.${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ batches: updatedBatches })
      });

      if (!resp.ok) throw new Error("Erro ao salvar remessa.");

      for (const it of formattedItems) {
        await updateFtStock(it.indiceFt, it.qtd); // Positivo abate do estoque
      }

      setShowNewBatchModal(false);
      fetchData();
      setSelectedAccount(prev => ({ ...prev, batches: updatedBatches }));
    } catch (e) {
      alert(e.message);
      setLoading(false);
    }
  };

  const handleDeleteBatch = async (batchId) => {
    if (!window.confirm("⚠️ TEM CERTEZA?\n\nIsso irá apagar esta remessa inteira! Os itens voltarão para o seu estoque físico e os valores cobrados serão removidos desta conta.")) return;
    
    setLoading(true);
    try {
      const targetBatch = (selectedAccount.batches || []).find(b => b.id === batchId);
      if (!targetBatch) throw new Error("Remessa não encontrada.");

      // Verificar se já tem pagamentos atrelados a esta remessa
      const temPagamento = targetBatch.items.some(it => parseN(it.qtdPago) > 0);
      if (temPagamento) {
        if (!window.confirm("Esta remessa já possui itens pagos! Se você excluí-la, o extrato ficará inconsistente, pois os pagamentos não são apagados automaticamente. Deseja excluir mesmo assim?")) {
          setLoading(false);
          return;
        }
      }

      const updatedBatches = (selectedAccount.batches || []).filter(b => b.id !== batchId);

      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const resp = await fetch(`${SUPA_URL}/rest/v1/consignados?id=eq.${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ batches: updatedBatches })
      });

      if (!resp.ok) throw new Error("Erro ao excluir remessa.");

      // Voltar pro estoque (negativo incrementa)
      for (const it of targetBatch.items) {
        await updateFtStock(it.indiceFt, -parseN(it.qtd)); 
      }

      fetchData();
      setSelectedAccount(prev => ({ ...prev, batches: updatedBatches }));
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openPaymentModal = () => {
    const openItems = [];
    (selectedAccount.batches || []).forEach((batch) => {
      (batch.items || []).forEach(it => {
        const qTotal = parseN(it.qtd);
        const qPago = parseN(it.qtdPago);
        const open = qTotal - qPago;
        if (open > 0) {
          openItems.push({
            // Identificadores
            batchId: batch.id,
            batchDate: batch.date,
            indiceFt: it.indiceFt,
            nomePeca: it.nomePeca,
            
            // Valores financeiros e qtd
            precoUnit: parseN(it.precoUnit),
            maxQtd: open,
            
            // Estado temporário
            payQtd: '', // string vazia para facilitar input numérico
            
            // Chave global no array
            globalIndex: openItems.length
          });
        }
      });
    });

    setItemsToPay(openItems);
    setPaymentObs('');
    setShowNewPaymentModal(true);
  };

  const updatePayItem = (globalIndex, value) => {
    setItemsToPay(prev => {
      const next = [...prev];
      next[globalIndex] = { ...next[globalIndex] }; // Clone profundo para o React garantir re-render

      if (value === '') {
        next[globalIndex].payQtd = '';
      } else {
        let val = parseN(value);
        if (val < 0) val = 0;
        if (val > next[globalIndex].maxQtd) val = next[globalIndex].maxQtd;
        next[globalIndex].payQtd = val;
      }
      return next;
    });
  };

  const handleSavePayment = async () => {
    const selectedToPay = itemsToPay.filter(it => parseN(it.payQtd) > 0);
    if (selectedToPay.length === 0) return alert("Selecione a quantidade de pelo menos 1 item para registrar o pagamento.");

    setLoading(true);
    try {
      let totalAmount = 0;
      const paymentItemsRecord = [];
      const updatedBatches = JSON.parse(JSON.stringify(selectedAccount.batches || []));

      // Obter taxa de repasse com base na comissão do cliente
      const comissaoPct = selectedAccount.cliente?.tipoAcerto === 'comissionado' ? parseN(selectedAccount.cliente?.comissaoPct) : 0;
      const repasseRate = (100 - comissaoPct) / 100;

      selectedToPay.forEach(payIt => {
        const qty = parseN(payIt.payQtd);
        const preco = parseN(payIt.precoUnit);
        
        // Garante precisão financeira com base na taxa de repasse
        const itemSubtotal = qty * (preco * repasseRate);
        totalAmount += itemSubtotal;
        
        paymentItemsRecord.push({
          batchId: payIt.batchId,
          indiceFt: payIt.indiceFt,
          nomePeca: payIt.nomePeca,
          qtd: qty,
          precoUnit: Number((preco * repasseRate).toFixed(2)) // Preço líquido
        });

        const targetBatch = updatedBatches.find(b => b.id === payIt.batchId);
        if (targetBatch) {
          const targetItem = targetBatch.items.find(i => i.indiceFt === payIt.indiceFt);
          if (targetItem) {
            targetItem.qtdPago = parseN(targetItem.qtdPago) + qty;
          }
        }
      });

      totalAmount = Number(totalAmount.toFixed(2));

      const paymentObj = {
        id: `P-${Date.now()}`,
        date: new Date().toISOString(),
        amount: totalAmount,
        obs: paymentObs,
        itemsPaid: paymentItemsRecord
      };

      const updatedPayments = [...(selectedAccount.payments || []), paymentObj];

      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const resp = await fetch(`${SUPA_URL}/rest/v1/consignados?id=eq.${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          batches: updatedBatches,
          payments: updatedPayments 
        })
      });

      if (!resp.ok) throw new Error("Erro ao registrar pagamento.");

      setShowNewPaymentModal(false);
      fetchData();
      setSelectedAccount(prev => ({ ...prev, batches: updatedBatches, payments: updatedPayments }));
    } catch (e) {
      alert(e.message);
      setLoading(false);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!window.confirm("⚠️ TEM CERTEZA?\n\nExcluir este pagamento irá devolver o status 'Em Aberto' para os itens que foram pagos nesta transação.")) return;

    setLoading(true);
    try {
      const targetPayment = (selectedAccount.payments || []).find(p => p.id === paymentId);
      if (!targetPayment) throw new Error("Pagamento não encontrado.");

      const updatedPayments = (selectedAccount.payments || []).filter(p => p.id !== paymentId);
      const updatedBatches = JSON.parse(JSON.stringify(selectedAccount.batches || []));

      // Reverter o qtdPago dos itens afetados
      (targetPayment.itemsPaid || []).forEach(paidIt => {
        const tBatch = updatedBatches.find(b => b.id === paidIt.batchId);
        if (tBatch) {
          const tItem = tBatch.items.find(i => i.indiceFt === paidIt.indiceFt);
          if (tItem) {
            tItem.qtdPago = Math.max(0, parseN(tItem.qtdPago) - parseN(paidIt.qtd));
          }
        }
      });

      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const resp = await fetch(`${SUPA_URL}/rest/v1/consignados?id=eq.${selectedAccount.id}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          batches: updatedBatches,
          payments: updatedPayments 
        })
      });

      if (!resp.ok) throw new Error("Erro ao excluir pagamento.");

      fetchData();
      setSelectedAccount(prev => ({ ...prev, batches: updatedBatches, payments: updatedPayments }));
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateAccountStats = (acc) => {
    const totalSent = (acc.batches || []).reduce((sum, batch) => {
      return sum + (batch.items || []).reduce((bsum, it) => bsum + (parseN(it.qtd) * parseN(it.precoUnit)), 0);
    }, 0);
    
    const comissao = acc.cliente?.tipoAcerto === 'comissionado' ? parseN(acc.cliente?.comissaoPct) : 0;
    const repasseRate = (100 - comissao) / 100;
    const totalExpected = totalSent * repasseRate;

    const totalPaid = (acc.payments || []).reduce((sum, p) => sum + parseN(p.amount), 0);
    const balance = totalExpected - totalPaid;

    return { totalSent, totalPaid, balance };
  };

  // Views rendering
  if (selectedAccount) {
    const stats = calculateAccountStats(selectedAccount);
    
    // Aggregating items for Extrato
    const aggregatedItems = {};
    (selectedAccount.batches || []).forEach(batch => {
      (batch.items || []).forEach(it => {
        if (!aggregatedItems[it.indiceFt]) {
          aggregatedItems[it.indiceFt] = { ...it, totalQtd: 0, totalPago: 0, totalValue: 0 };
        }
        aggregatedItems[it.indiceFt].totalQtd += parseN(it.qtd);
        aggregatedItems[it.indiceFt].totalPago += parseN(it.qtdPago);
        aggregatedItems[it.indiceFt].totalValue += parseN(it.qtd) * parseN(it.precoUnit);
      });
    });

    // Grouping items to pay by Batch for UI rendering
    const groupedItemsToPay = itemsToPay.reduce((acc, it) => {
      if (!acc[it.batchId]) acc[it.batchId] = { date: it.batchDate, items: [] };
      acc[it.batchId].items.push(it);
      return acc;
    }, {});

    return (
      <div className="page-wrapper" translate="no">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <button className="btn-outline btn-sm" onClick={() => setSelectedAccount(null)}>
            ← Voltar para Contas
          </button>
          <button className="btn-outline btn-sm" onClick={(e) => handleDeleteAccount(selectedAccount, e)} style={{ borderColor: 'var(--danger)', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Trash2 size={16} /> Excluir Cliente
          </button>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, #1e293b, #0f172a)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
            <h2 style={{ color: '#fff', margin: 0 }}>Conta Consignado: {selectedAccount.cliente?.nome}</h2>
            {selectedAccount.cliente?.tipoAcerto === 'comissionado' ? (
              <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.4)', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                Comissionado ({selectedAccount.cliente?.comissaoPct}%)
              </span>
            ) : (
              <span className="badge" style={{ background: 'rgba(52, 211, 153, 0.2)', color: 'var(--success)', border: '1px solid rgba(52, 211, 153, 0.4)', padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                Valor Integral (100% Repasse)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px', minWidth: '180px' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>Total Enviado</p>
              <h3 style={{ color: '#fff', margin: 0 }}>R$ {fmt(stats.totalSent)}</h3>
            </div>
            {selectedAccount.cliente?.tipoAcerto === 'comissionado' && (
              <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px', minWidth: '180px' }}>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>Repasse Esperado ({100 - parseN(selectedAccount.cliente?.comissaoPct)}%)</p>
                <h3 style={{ color: 'var(--accent-primary)', margin: 0 }}>R$ {fmt(stats.totalSent * ((100 - parseN(selectedAccount.cliente?.comissaoPct)) / 100))}</h3>
              </div>
            )}
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px', minWidth: '180px' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>Total Pago</p>
              <h3 style={{ color: '#34d399', margin: 0 }}>R$ {fmt(stats.totalPaid)}</h3>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px', minWidth: '180px' }}>
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>Saldo Devedor</p>
              <h3 style={{ color: stats.balance > 0 ? '#f87171' : '#fff', margin: 0 }}>R$ {fmt(stats.balance)}</h3>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Extrato de Itens */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Extrato de Itens</h3>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button className="btn-outline btn-sm" onClick={() => openPrintBalanceWindow(aggregatedItems, selectedAccount.cliente, stats)} title="Imprimir Saldo em Aberto">
                  <Printer size={16} /> Saldo
                </button>
                <button className="btn-primary btn-sm" onClick={openBatchModal}>+ Nova Remessa</button>
              </div>
            </div>
            {Object.keys(aggregatedItems).length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Nenhum item enviado ainda.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem' }}>Item</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Enviados</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--success)' }}>Pagos</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--danger)' }}>Aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(aggregatedItems).map(it => {
                    const emAberto = it.totalQtd - it.totalPago;
                    return (
                      <tr key={it.indiceFt} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span className="badge-sm" style={{ marginRight: '8px' }}>{it.indiceFt}</span>
                          {it.nomePeca}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontWeight: 'bold' }}>{it.totalQtd}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--success)', fontWeight: 'bold' }}>{it.totalPago}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: emAberto > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: 'bold' }}>{emAberto}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pagamentos */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0 }}>Histórico de Pagamentos</h3>
              <button className="btn-primary btn-sm" onClick={openPaymentModal}>+ Registrar Pgto</button>
            </div>
            {(selectedAccount.payments || []).length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Nenhum pagamento registrado.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-color)', textAlign: 'left', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '0.5rem' }}>Data</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Valor</th>
                    <th style={{ padding: '0.5rem' }}>Itens Pagos</th>
                    <th style={{ padding: '0.5rem', width: '30px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {[...(selectedAccount.payments || [])].sort((a,b) => new Date(b.date) - new Date(a.date)).map(p => (
                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '0.75rem 0.5rem' }}>{new Date(p.date).toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', color: 'var(--success)', fontWeight: 'bold' }}>R$ {fmt(p.amount)}</td>
                      <td style={{ padding: '0.75rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {(p.itemsPaid || []).map((it, i) => (
                          <div key={i}>{it.qtd}x {it.nomePeca}</div>
                        ))}
                        {p.obs && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>Obs: {p.obs}</div>}
                      </td>
                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right' }}>
                        <button className="btn-icon" onClick={() => handleDeletePayment(p.id)} title="Excluir Pagamento">
                          <Trash2 size={16} color="var(--danger)" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Historico de Remessas */}
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <h3 style={{ marginBottom: '1rem' }}>Histórico de Remessas (Lotes Enviados)</h3>
          {(selectedAccount.batches || []).length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Nenhuma remessa registrada.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {[...(selectedAccount.batches || [])].sort((a,b) => new Date(b.date) - new Date(a.date)).map(batch => (
                <div key={batch.id} style={{ border: '1px solid var(--border-color)', borderRadius: '8px', padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', alignItems: 'center' }}>
                    <div style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>
                      Data de Envio: {new Date(batch.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn-outline btn-sm" onClick={() => openPrintBatchWindow(batch, selectedAccount.cliente)} title="Imprimir Guia da Remessa">
                        <Printer size={16} /> Imprimir
                      </button>
                      <button className="btn-icon" onClick={() => handleDeleteBatch(batch.id)} title="Excluir Remessa inteira">
                        <Trash2 size={16} color="var(--danger)" />
                      </button>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                    {batch.items.map((it, i) => {
                      const qTotal = parseN(it.qtd);
                      const qPago = parseN(it.qtdPago);
                      const open = qTotal - qPago;
                      return (
                        <span key={i} style={{ 
                          background: open === 0 ? 'rgba(52, 211, 153, 0.1)' : 'var(--bg-secondary)', 
                          border: open === 0 ? '1px solid rgba(52, 211, 153, 0.3)' : '1px solid transparent',
                          padding: '0.4rem 0.8rem', 
                          borderRadius: '6px', 
                          fontSize: '0.85rem' 
                        }}>
                          <strong>{qTotal}x</strong> {it.nomePeca} (R$ {fmt(it.precoUnit)}) 
                          <span style={{ marginLeft: '6px', fontSize: '0.75rem', color: open === 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                            [{qPago} pagos / {open} abertos]
                          </span>
                        </span>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MODAL NOVA REMESSA */}
        {showNewBatchModal && (
          <div className="modal-fullscreen">
            <div className="modal-topbar">
              <div className="modal-topbar-left">
                <button className="btn-outline btn-sm" onClick={() => setShowNewBatchModal(false)}>✕ Cancelar</button>
                <div>
                  <h2 className="modal-title">Nova Remessa de Itens</h2>
                  <p className="modal-sub">Selecione os itens e as quantidades (irá abater do estoque físico)</p>
                </div>
              </div>
              <div className="modal-topbar-right">
                <button className="btn-primary" onClick={handleSaveBatch} disabled={loading}>
                  {loading ? 'Salvando...' : '💾 Salvar Remessa'}
                </button>
              </div>
            </div>
            <div className="modal-scroll-body" style={{ padding: '2rem' }}>
              
              <div style={{ display: 'flex', gap: '2rem', marginBottom: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0, width: '200px' }}>
                  <label style={{ fontWeight: 'bold' }}>Data do Lançamento *</label>
                  <input 
                    type="date" 
                    value={newBatchDate} 
                    onChange={e => setNewBatchDate(e.target.value)} 
                    style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)'}}
                  />
                </div>

                <div className="markup-bar" style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', background: 'var(--bg-secondary)', padding: '0.6rem', borderRadius: '8px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '4px' }}>Markup Global</label>
                    <input
                      type="number"
                      step="0.1"
                      value={batchMarkup}
                      onChange={e => setBatchMarkup(e.target.value)}
                      style={{ width: '80px', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <button onClick={applyBatchMarkup} style={{ padding: '0.4rem 0.8rem', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
                    Aplicar
                  </button>
                </div>
                
                <div className="search-box-wrap" style={{ width: '100%', maxWidth: '400px', flex: 1 }}>
                  <label style={{ visibility: 'hidden', display: 'block', marginBottom: '4px' }}>Buscar</label>
                  <input 
                    type="text" 
                    placeholder="🔍 Buscar produto por nome ou ID..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{width: '100%', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)'}}
                  />
                </div>
              </div>

              {(() => {
                const sendingItems = newBatchItems.filter(it => parseN(it.qtd) > 0);
                const totalQtd = sendingItems.reduce((acc, it) => acc + parseN(it.qtd), 0);
                const totalVal = sendingItems.reduce((acc, it) => acc + (parseN(it.qtd) * parseN(it.precoUnit)), 0);
                if (totalQtd === 0) return null;
                return (
                  <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(52, 211, 153, 0.1)', borderRadius: '8px', border: '1px solid rgba(52, 211, 153, 0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '1.1rem' }}>
                      <strong style={{ color: 'var(--success)' }}>Total de Itens: </strong>
                      <span style={{ fontWeight: 'bold' }}>{totalQtd}</span>
                    </div>
                    <div style={{ fontSize: '1.1rem' }}>
                      <strong style={{ color: 'var(--success)' }}>Valor Total: </strong>
                      <span style={{ fontWeight: 'bold' }}>R$ {fmt(totalVal)}</span>
                    </div>
                  </div>
                );
              })()}

              <table className="items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', background: 'var(--bg-secondary)' }}>
                    <th 
                      style={{ padding: '0.75rem', cursor: 'pointer', userSelect: 'none' }} 
                      onClick={() => handleSortClick('id')}
                    >
                      ID{renderSortIndicator('id')}
                    </th>
                    <th 
                      style={{ padding: '0.75rem', cursor: 'pointer', userSelect: 'none' }} 
                      onClick={() => handleSortClick('nome')}
                    >
                      Nome{renderSortIndicator('nome')}
                    </th>
                    <th 
                      style={{ padding: '0.75rem', cursor: 'pointer', userSelect: 'none' }} 
                      onClick={() => handleSortClick('custo')}
                    >
                      Preço de Custo{renderSortIndicator('custo')}
                    </th>
                    <th 
                      style={{ padding: '0.75rem', width: '150px', cursor: 'pointer', userSelect: 'none' }} 
                      onClick={() => handleSortClick('venda')}
                    >
                      Preço de Venda (R$){renderSortIndicator('venda')}
                    </th>
                    <th style={{ padding: '0.75rem', width: '120px', userSelect: 'none' }}>
                      Qtd a Enviar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {newBatchItems
                    .filter(it => (it.nomePeca || '').toLowerCase().includes(searchTerm.toLowerCase()) || (it.indiceFt || '').toLowerCase().includes(searchTerm.toLowerCase()))
                    .sort((a, b) => {
                      const qA = parseN(a.qtd) > 0 ? 1 : 0;
                      const qB = parseN(b.qtd) > 0 ? 1 : 0;
                      if (qA !== qB) return qB - qA; // Selected items always at the top
                      
                      let valA, valB;
                      if (modalSortField === 'id') {
                        valA = a.indiceFt || '';
                        valB = b.indiceFt || '';
                        return modalSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                      } else if (modalSortField === 'nome') {
                        valA = a.nomePeca || '';
                        valB = b.nomePeca || '';
                        return modalSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
                      } else if (modalSortField === 'custo') {
                        valA = parseN(a.custoBase);
                        valB = parseN(b.custoBase);
                        return modalSortAsc ? valA - valB : valB - valA;
                      } else if (modalSortField === 'venda') {
                        valA = parseN(a.precoUnit);
                        valB = parseN(b.precoUnit);
                        return modalSortAsc ? valA - valB : valB - valA;
                      }
                      return 0;
                    })
                    .map((it) => {
                      const active = parseN(it.qtd) > 0;
                      const originalIdx = newBatchItems.findIndex(oi => oi.indiceFt === it.indiceFt);
                      return (
                        <tr key={it.indiceFt} style={{ borderBottom: '1px solid var(--border-color)', background: active ? 'rgba(124, 58, 237, 0.05)' : 'transparent' }}>
                          <td style={{ padding: '0.5rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                          <td style={{ padding: '0.5rem', fontWeight: active ? 'bold' : 'normal' }}>{it.nomePeca}</td>
                          <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>R$ {fmt(it.custoBase)}</td>
                          <td style={{ padding: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                              <span>R$</span>
                              <input type="number" className="cell-input" value={it.precoUnit} onChange={e => updateBatchItem(originalIdx, 'precoUnit', e.target.value)} />
                            </div>
                          </td>
                          <td style={{ padding: '0.5rem' }}>
                            <input type="number" className="cell-input cell-qty" value={it.qtd} onChange={e => updateBatchItem(originalIdx, 'qtd', e.target.value)} />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MODAL PAGAMENTO (BAIXA DE ITENS) */}
        {showNewPaymentModal && (() => {
          const comissaoPct = selectedAccount.cliente?.tipoAcerto === 'comissionado' ? parseN(selectedAccount.cliente?.comissaoPct) : 0;
          const repasseRate = (100 - comissaoPct) / 100;
          const grossTotal = itemsToPay.reduce((sum, it) => sum + (parseN(it.payQtd) * parseN(it.precoUnit)), 0);
          const netTotal = grossTotal * repasseRate;
          return (
            <div className="modal-fullscreen">
              <div className="modal-topbar">
                <div className="modal-topbar-left">
                  <button className="btn-outline btn-sm" onClick={() => setShowNewPaymentModal(false)}>✕ Cancelar</button>
                  <div>
                    <h2 className="modal-title">Registrar Pagamento (Baixa de Itens)</h2>
                    <p className="modal-sub">Selecione a quantidade que está sendo paga de cada remessa em aberto.</p>
                  </div>
                </div>
                <div className="modal-topbar-right">
                  {selectedAccount.cliente?.tipoAcerto === 'comissionado' && (
                    <div style={{ marginRight: '1.5rem', textAlign: 'right', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      <span>Venda Bruta: R$ {fmt(grossTotal)}</span><br/>
                      <span>Comissão (-{comissaoPct}%): - R$ {fmt(grossTotal * (comissaoPct / 100))}</span>
                    </div>
                  )}
                  <div style={{ marginRight: '1.5rem', textAlign: 'right' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      {selectedAccount.cliente?.tipoAcerto === 'comissionado' ? 'Líquido a Receber:' : 'Total a Registrar:'}
                    </span><br/>
                    <span style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--success)' }}>
                      R$ {fmt(netTotal)}
                    </span>
                  </div>
                  <button className="btn-primary" onClick={handleSavePayment} disabled={loading}>
                    {loading ? 'Salvando...' : '💰 Salvar Pagamento'}
                  </button>
                </div>
              </div>
              
              <div className="modal-scroll-body" style={{ padding: '2rem' }}>
                {itemsToPay.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <h3>Não há itens em aberto aguardando pagamento! 🎉</h3>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: '2rem', maxWidth: '600px' }}>
                      <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '0.5rem' }}>Observação do Pagamento (Opcional)</label>
                      <input 
                        type="text" 
                        style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                        placeholder="Ex: Pagamento PIX referente às vendas da Remessa 1..."
                        value={paymentObs} 
                        onChange={e => setPaymentObs(e.target.value)} 
                      />
                    </div>
                    
                    {Object.entries(groupedItemsToPay).sort((a, b) => new Date(a[1].date) - new Date(b[1].date)).map(([batchId, batchData]) => (
                      <div key={batchId} style={{ marginBottom: '2.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <Calendar size={18} color="var(--primary)" />
                          <h4 style={{ margin: 0 }}>Remessa de {new Date(batchData.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</h4>
                        </div>
                        <table className="items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>
                              <th style={{ padding: '0.75rem' }}>ID</th>
                              <th style={{ padding: '0.75rem' }}>Nome do Item</th>
                              <th style={{ padding: '0.75rem', textAlign: 'center' }}>Em Aberto</th>
                              <th style={{ padding: '0.75rem', width: '150px' }}>Preço Unit.</th>
                              <th style={{ padding: '0.75rem', width: '120px' }}>Qtd Pagando</th>
                              <th style={{ padding: '0.75rem', textAlign: 'right', width: '150px' }}>Subtotal (R$)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batchData.items.map((it) => {
                              const active = parseN(it.payQtd) > 0;
                              const preco = parseN(it.precoUnit);
                              const sub = parseN(it.payQtd) * preco * repasseRate;
                              return (
                                <tr key={it.globalIndex} style={{ borderBottom: '1px solid var(--border-color)', background: active ? 'rgba(52, 211, 153, 0.05)' : 'transparent' }}>
                                  <td style={{ padding: '0.75rem 0.5rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                                  <td style={{ padding: '0.75rem 0.5rem', fontWeight: active ? 'bold' : 'normal' }}>{it.nomePeca}</td>
                                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--danger)', fontWeight: 'bold' }}>{it.maxQtd}</td>
                                  <td style={{ padding: '0.75rem 0.5rem' }}>
                                    {selectedAccount.cliente?.tipoAcerto === 'comissionado' ? (
                                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ textDecoration: 'line-through', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bruto: R$ {fmt(preco)}</span>
                                        <span style={{ fontWeight: '600', color: 'var(--success)', fontSize: '0.9rem' }}>Líq: R$ {fmt(preco * repasseRate)}</span>
                                      </div>
                                    ) : (
                                      <span>R$ {fmt(preco)}</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '0.5rem' }}>
                                    <input 
                                      type="number" 
                                      className="cell-input cell-qty" 
                                      style={{ borderColor: active ? 'var(--success)' : 'var(--border-color)' }}
                                      min="0" 
                                      max={it.maxQtd} 
                                      value={it.payQtd} 
                                      onChange={e => updatePayItem(it.globalIndex, e.target.value)} 
                                    />
                                  </td>
                                  <td style={{ padding: '0.75rem 0.5rem', textAlign: 'right', fontWeight: active ? 'bold' : 'normal', color: active ? 'var(--success)' : 'inherit' }}>
                                    R$ {fmt(sub)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
        })()}

      </div>
    );
  }

  // List of accounts view
  return (
    <div className="page-wrapper" translate="no">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 className="page-title">Consignados</h1>
          <p className="page-description">Gerencie contas de clientes consignados, remessas enviadas e recebimentos de vendas.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowNewAccountModal(true)}>+ Nova Conta Cliente</button>
      </div>

      {loading && accounts.length === 0 ? (
        <div style={{textAlign: 'center', padding: '3rem'}}>
           <Loader size={40} className="spinner" color="var(--primary)" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="card" style={{textAlign: 'center', padding: '3rem'}}>
          <p>Nenhuma conta de consignado cadastrada.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
          {accounts.map(acc => {
            const stats = calculateAccountStats(acc);
            return (
              <div key={acc.id} className="card" style={{ cursor: 'pointer', border: '2px solid transparent' }} onClick={() => setSelectedAccount(acc)} onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-primary)'} onMouseLeave={e => e.currentTarget.style.borderColor = 'transparent'}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', margin: '0 0 0.5rem 0' }}>
                  <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>{acc.cliente?.nome}</h3>
                  <button 
                    className="btn-icon" 
                    onClick={(e) => handleDeleteAccount(acc, e)} 
                    title="Excluir Cliente"
                    style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <Trash2 size={18} color="var(--danger)" />
                  </button>
                </div>
                {acc.cliente?.tipoAcerto === 'comissionado' ? (
                  <span className="badge-sm" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.2)', marginBottom: '8px', display: 'inline-block' }}>
                    Comissionado
                  </span>
                ) : (
                  <span className="badge-sm" style={{ background: 'rgba(52, 211, 153, 0.1)', color: 'var(--success)', border: '1px solid rgba(52, 211, 153, 0.2)', marginBottom: '8px', display: 'inline-block' }}>
                    Valor Integral
                  </span>
                )}
                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>{acc.cliente?.telefone || 'Sem telefone'}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL NOVA CONTA */}
      {showNewAccountModal && (
        <div className="modal-fullscreen" style={{ backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="card" style={{ width: '500px', maxWidth: '90%' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Nova Conta de Consignado</h3>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Nome do Cliente *</label>
              <input type="text" value={newClient.nome} onChange={e => setNewClient({...newClient, nome: e.target.value})} />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Telefone</label>
              <input type="text" value={newClient.telefone} onChange={e => setNewClient({...newClient, telefone: e.target.value})} />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Endereço</label>
              <input type="text" value={newClient.endereco} onChange={e => setNewClient({...newClient, endereco: e.target.value})} />
            </div>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <label>Tipo de Acerto Consignado</label>
              <select 
                value={newClient.tipoAcerto || 'integral'} 
                onChange={e => setNewClient({...newClient, tipoAcerto: e.target.value, comissaoPct: e.target.value === 'integral' ? '0' : newClient.comissaoPct})}
                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
              >
                <option value="integral">Valor Integral (100% Repasse)</option>
                <option value="comissionado">Comissionado (% de Comissão do Cliente)</option>
              </select>
            </div>
            {newClient.tipoAcerto === 'comissionado' && (
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Comissão do Cliente (%) *</label>
                <input 
                  type="number" 
                  min="0" 
                  max="100" 
                  value={newClient.comissaoPct || ''} 
                  onChange={e => setNewClient({...newClient, comissaoPct: e.target.value})} 
                  placeholder="Ex: 30"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', outline: 'none' }}
                />
              </div>
            )}
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label>Observações</label>
              <textarea rows={2} value={newClient.obs} onChange={e => setNewClient({...newClient, obs: e.target.value})} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn-outline" onClick={() => setShowNewAccountModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleCreateAccount} disabled={loading}>{loading ? 'Salvando...' : 'Criar Conta'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
