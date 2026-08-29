import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Loader, Trash2, Calendar, Printer } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
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
const getPrintTemplate = (title, docNum, dateStr, accentColor, accentBg, clientData, itemsHtml, totalsHtml, assinaturaHtml = '', obsHtml = '', headersHtml = '', tenant = {}) => {
  const logoHtml = tenant.logo_url 
    ? `<img class="logo-img" src="${tenant.logo_url}" alt="Logo" onerror="this.style.display='none'; document.getElementById('lf').style.display='flex';"/>`
    : `<img class="logo-img" src="${window.location.origin}/logo.png" alt="Logo" onerror="this.style.display='none'; document.getElementById('lf').style.display='flex';"/>`;

  const detailsHtml = `
    ${tenant.email ? `✉️ E-mail: <span>${tenant.email}</span>` : ''}
    ${tenant.telefone ? ` | 📞 Tel: <span>${tenant.telefone}</span>` : ''}
  `;

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${title} — ${tenant.name || 'AM3D'}</title>
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
    .logo-area { display: flex; align-items: center; gap: 20px; }
    .logo-img  { height: 80px; max-width: 170px; object-fit: contain; }
    .logo-fallback { display: none; align-items: center; }
    .logo-box {
      width: 80px; height: 80px;
      background: linear-gradient(135deg,#60A5FA,#8B5CF6,#34D399);
      border-radius: 12px; display: flex; align-items: center; justify-content: center;
      color: #fff; font-family: 'Outfit',sans-serif; font-size: 22pt; font-weight: 900;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .company-info-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      font-size: 8pt;
      color: #475569;
      line-height: 1.3;
      text-align: left;
    }
    .company-title {
      font-family: 'Outfit', sans-serif;
      font-size: 14pt;
      font-weight: 900;
      color: #1e293b;
      line-height: 1.1;
    }
    .company-subtitle {
      font-weight: 700;
      color: #64748b;
      font-size: 8.5pt;
    }
    .company-slogan {
      font-style: italic;
      color: #94a3b8;
      font-size: 7.5pt;
      margin-bottom: 2px;
    }
    .company-details-row, .company-contacts-row {
      font-size: 7.5pt;
      color: #64748b;
    }
    .company-details-row span, .company-contacts-row span {
      font-weight: 600;
      color: #334155;
    }

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
        ${logoHtml}
        <div id="lf" class="logo-fallback">
          <div class="logo-box">3D</div>
        </div>
        <div class="company-info-text" translate="no">
          <div class="company-title">${tenant.name || 'Amaro & Mateu 3D'}</div>
          <div class="company-subtitle">${tenant.custom_header || 'Produtos em Impressão 3D'}</div>
          ${tenant.documento ? `<div class="company-slogan">CNPJ/CPF: ${tenant.documento}</div>` : ''}
          ${tenant.endereco ? `<div class="company-details-row">📍 Endereço: <span>${tenant.endereco}</span></div>` : ''}
          ${tenant.email || tenant.telefone ? `<div class="company-contacts-row">${detailsHtml}</div>` : `
            <div class="company-details-row" style="white-space: nowrap;">
              📸 Instagram: <span>@aem3d_</span> | ✉️ E-mail: <span>amaroemateu3d@gmail.com</span>
            </div>
            <div class="company-contacts-row" style="white-space: nowrap;">
              Cíntia: <span>19 9 8143-2080</span> | Daniel: <span>19 9 9672-5045</span>
            </div>
          `}
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
      <span class="footer-brand">${tenant.name || 'AM3D'} — Impressão 3D Profissional</span>
      <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
    </div>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>
`;
};

const openPrintBatchWindow = (batch, cliente, tenant = {}) => {
  const total = batch.items.reduce((s, it) => s + parseN(it.precoUnit) * parseN(it.qtd), 0);
  const dateStr = new Date(batch.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  const accentColor = '#475569';
  const accentBg = '#F1F5F9';

  const sortedItems = [...batch.items].sort((a, b) => String(a.indiceFt || '').localeCompare(String(b.indiceFt || ''), undefined, { numeric: true }));
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

  const signatureName = tenant.name || 'AM3D';
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
          <p class="sign-label">Responsável ${signatureName}</p>
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

  const html = getPrintTemplate('REMESSA CONSIGNADO', '', dateStr, accentColor, accentBg, cliente, itemsHtml, totalsHtml, assinaturaHtml, obsHtml, '', tenant);
  const win = window.open('', '_blank', 'width=960,height=780');
  win.document.write(html);
  win.document.close();
};

const openPrintBalanceWindow = (aggregatedItems, cliente, stats, tenant = {}) => {
  const openItems = Object.values(aggregatedItems).filter(it => (it.totalQtd - it.totalPago - it.totalRetirado) > 0);
  openItems.sort((a, b) => String(a.indiceFt || '').localeCompare(String(b.indiceFt || ''), undefined, { numeric: true }));
  
  const accentColor = '#059669';
  const accentBg = '#D1FAE5';
  const dateStr = new Date().toLocaleDateString('pt-BR');

  const itemsHtml = openItems.length === 0 ? `
    <tr><td colspan="9" class="cell-center text-muted" style="padding: 2rem;">Não há peças em aberto no momento. 🎉</td></tr>
  ` : openItems.map((it, i) => {
    const emAberto = it.totalQtd - it.totalPago - it.totalRetirado;
    return `
      <tr class="${i % 2 === 0 ? 'row-even' : ''}">
        <td class="cell-center text-muted">${i + 1}</td>
        <td class="cell-id">${it.indiceFt}</td>
        <td class="cell-name">${it.nomePeca}</td>
        <td class="cell-right text-muted">R$ ${fmt(parseN(it.precoUnit))}</td>
        <td class="cell-center cell-bold">${it.totalQtd}</td>
        <td class="cell-center" style="color: #3b82f6; font-weight: bold;">${it.totalRetirado}</td>
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
      <th style="width:70px;text-align:center">Retirados</th>
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

  const html = getPrintTemplate('EXTRATO DE SALDO EM ABERTO', 'CONSIGNADO', dateStr, accentColor, accentBg, cliente, itemsHtml, totalsHtml, '', '', headersHtml, tenant);
  const win = window.open('', '_blank', 'width=960,height=780');
  win.document.write(html);
  win.document.close();
};

export default function Consignados() {
  const { profile, session } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [fts, setFts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // States for views
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [showNewAccountModal, setShowNewAccountModal] = useState(false);
  const [showNewBatchModal, setShowNewBatchModal] = useState(false);
  const [showNewPaymentModal, setShowNewPaymentModal] = useState(false);
  const [withdrawBatch, setWithdrawBatch] = useState(null);
  const [withdrawItems, setWithdrawItems] = useState([]);
  
  // Global withdraw states
  const [showGlobalWithdrawModal, setShowGlobalWithdrawModal] = useState(false);
  const [globalWithdrawItems, setGlobalWithdrawItems] = useState([]);
  const [globalWithdrawSearch, setGlobalWithdrawSearch] = useState('');

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

  // Edit batch states
  const [showEditBatchModal, setShowEditBatchModal] = useState(false);
  const [editBatch, setEditBatch] = useState(null);
  const [editBatchItems, setEditBatchItems] = useState([]);    // existing items (editable qty)
  const [editBatchNewItems, setEditBatchNewItems] = useState([]); // new items to add
  const [editBatchSearch, setEditBatchSearch] = useState('');

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
      cleanFts.sort((a, b) => String(a.indiceFt).localeCompare(String(b.indiceFt), undefined, { numeric: true }));
      
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
      const token = session?.access_token;
      if (!token) { console.warn('updateFtStock [Consignados]: sem JWT, abortando'); return; }
      
      const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}&select=estoque`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${token}` }
      });
      if (!getResp.ok) return;
      const data = await getResp.json();
      const currentStock = data[0]?.estoque ?? 0;
      const newStock = Math.max(0, currentStock - delta);

      await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${token}`,
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
            const openQty = parseN(it.qtd) - parseN(it.qtdPago) - parseN(it.qtdRetirado);
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

  const getLastPriceForAccount = (account, indiceFt) => {
    if (!account || !account.batches || account.batches.length === 0) return null;
    const sortedBatches = [...account.batches].sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const batch of sortedBatches) {
      const item = batch.items?.find(it => it.indiceFt === indiceFt);
      if (item && item.precoUnit !== undefined) {
        return parseN(item.precoUnit);
      }
    }
    return null;
  };

  const openBatchModal = () => {
    const globalM = parseN(batchMarkup) > 0 ? parseN(batchMarkup) : 1;
    setNewBatchItems(fts.map(ft => {
      const lastPrice = getLastPriceForAccount(selectedAccount, ft.indiceFt);
      const custo = ft._custoFinal || 0;
      let precoUnit, itemMarkup;
      if (ft.isOrcamento) {
        precoUnit = (ft.precoSugerido || 0).toFixed(2);
        itemMarkup = '';
      } else if (lastPrice !== null) {
        precoUnit = lastPrice.toFixed(2);
        // Deriva o markup a partir do último preço usado
        itemMarkup = custo > 0 ? (lastPrice / custo).toFixed(2) : globalM.toFixed(2);
      } else {
        precoUnit = (custo * globalM).toFixed(2);
        itemMarkup = globalM.toFixed(2);
      }
      return {
        indiceFt: ft.indiceFt,
        nomePeca: ft.nomePeca,
        custoBase: custo,
        precoUnit,
        itemMarkup,
        qtd: '',
        tempQtd: '',
        qtdPago: 0,
        isOrcamento: ft.isOrcamento
      };
    }));
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
      next[idx] = { ...next[idx] };
      if (field === 'qtd') {
        next[idx][field] = value === '' ? '' : parseN(value);
      } else if (field === 'tempQtd') {
        next[idx][field] = value === '' ? '' : parseN(value);
      } else if (field === 'itemMarkup') {
        // Atualiza o markup individual e recalcula precoUnit automaticamente
        next[idx].itemMarkup = value;
        const m = parseN(value);
        const custo = parseN(next[idx].custoBase);
        if (m > 0 && custo > 0 && !next[idx].isOrcamento) {
          next[idx].precoUnit = (custo * m).toFixed(2);
        }
      } else {
        next[idx][field] = value;
      }
      return next;
    });
  };

  const handleAddItem = (originalIdx) => {
    setNewBatchItems(prev => {
      const next = [...prev];
      const item = { ...next[originalIdx] };
      const q = parseN(item.tempQtd);
      item.qtd = q <= 0 ? 1 : q;
      item.tempQtd = '';
      next[originalIdx] = item;
      return next;
    });
  };

  const handleRemoveItem = (originalIdx) => {
    setNewBatchItems(prev => {
      const next = [...prev];
      const item = { ...next[originalIdx] };
      item.qtd = '';
      item.tempQtd = '';
      next[originalIdx] = item;
      return next;
    });
  };

  const applyBatchMarkup = () => {
    const m = parseN(batchMarkup);
    if (m <= 0) return;
    setNewBatchItems(prev => prev.map(it => {
      if (it.isOrcamento) return it;
      // Reseta o markup individual de todos os itens para o global
      return { ...it, itemMarkup: m.toFixed(2), precoUnit: (it.custoBase * m).toFixed(2) };
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
    const allItems = [];
    (selectedAccount.batches || []).forEach((batch) => {
      (batch.items || []).forEach(it => {
        const qTotal = parseN(it.qtd);
        const qPago = parseN(it.qtdPago);
        const qRetirado = parseN(it.qtdRetirado);
        const open = qTotal - qPago - qRetirado;

        // Inclui itens em aberto E itens com retirada (para exibição como referência)
        if (open > 0 || qRetirado > 0) {
          allItems.push({
            // Identificadores
            batchId: batch.id,
            batchDate: batch.date,
            indiceFt: it.indiceFt,
            nomePeca: it.nomePeca,

            // Valores financeiros e qtd
            precoUnit: parseN(it.precoUnit),
            maxQtd: open,
            qtdTotal: qTotal,
            qtdPago: qPago,
            qtdRetirado: qRetirado,

            // Estado temporário
            payQtd: '', // string vazia para facilitar input numérico

            // Flag: item totalmente retirado (sem saldo a pagar)
            isRetired: open === 0 && qRetirado > 0,

            // Chave global no array
            globalIndex: allItems.length
          });
        }
      });
    });

    setItemsToPay(allItems);
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
    const selectedToPay = itemsToPay.filter(it => parseN(it.payQtd) > 0 && !it.isRetired);
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
    
    const totalNetSent = (acc.batches || []).reduce((sum, batch) => {
      return sum + (batch.items || []).reduce((bsum, it) => bsum + ((parseN(it.qtd) - parseN(it.qtdRetirado)) * parseN(it.precoUnit)), 0);
    }, 0);

    const comissao = acc.cliente?.tipoAcerto === 'comissionado' ? parseN(acc.cliente?.comissaoPct) : 0;
    const repasseRate = (100 - comissao) / 100;
    const totalExpected = totalNetSent * repasseRate;

    const totalPaid = (acc.payments || []).reduce((sum, p) => sum + parseN(p.amount), 0);
    const balance = totalExpected - totalPaid;

    return { totalSent, totalPaid, balance };
  };

  const openWithdrawModal = (batch) => {
    setWithdrawBatch(batch);
    const items = (batch.items || []).map(it => {
      const qTotal = parseN(it.qtd);
      const qPago = parseN(it.qtdPago);
      const qRetirado = parseN(it.qtdRetirado);
      const maxWithdraw = qTotal - qPago - qRetirado;
      return {
        indiceFt: it.indiceFt,
        nomePeca: it.nomePeca,
        maxQtd: maxWithdraw,
        withdrawQtd: ''
      };
    }).filter(it => it.maxQtd > 0);
    
    setWithdrawItems(items);
  };

  const updateWithdrawItem = (idx, value) => {
    setWithdrawItems(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx] };
      if (value === '') {
        next[idx].withdrawQtd = '';
      } else {
        let val = parseN(value);
        if (val < 0) val = 0;
        if (val > next[idx].maxQtd) val = next[idx].maxQtd;
        next[idx].withdrawQtd = val;
      }
      return next;
    });
  };

  const handleSaveWithdraw = async () => {
    const selectedToWithdraw = withdrawItems.filter(it => parseN(it.withdrawQtd) > 0);
    if (selectedToWithdraw.length === 0) return alert("Selecione a quantidade de pelo menos 1 item para registrar a retirada.");

    setLoading(true);
    try {
      const updatedBatches = JSON.parse(JSON.stringify(selectedAccount.batches || []));
      const targetBatch = updatedBatches.find(b => b.id === withdrawBatch.id);
      
      if (!targetBatch) throw new Error("Remessa não encontrada.");

      for (const withdrawIt of selectedToWithdraw) {
        const qty = parseN(withdrawIt.withdrawQtd);
        const targetItem = targetBatch.items.find(i => i.indiceFt === withdrawIt.indiceFt);
        if (targetItem) {
          targetItem.qtdRetirado = parseN(targetItem.qtdRetirado) + qty;
          await updateFtStock(withdrawIt.indiceFt, -qty);
        }
      }

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

      if (!resp.ok) throw new Error("Erro ao registrar retirada.");

      setWithdrawBatch(null);
      setWithdrawItems([]);
      fetchData();
      setSelectedAccount(prev => ({ ...prev, batches: updatedBatches }));
      alert("Retirada registrada com sucesso! Os itens foram devolvidos ao estoque físico.");
    } catch (e) {
      alert(e.message);
      setLoading(false);
    }
  };

  const openGlobalWithdrawModal = () => {
    if (!selectedAccount) return;
    const itemsMap = {};
    (selectedAccount.batches || []).forEach(batch => {
      (batch.items || []).forEach(it => {
        const qTotal = parseN(it.qtd);
        const qPago = parseN(it.qtdPago);
        const qRetirado = parseN(it.qtdRetirado);
        if (!itemsMap[it.indiceFt]) {
          itemsMap[it.indiceFt] = {
            indiceFt: it.indiceFt,
            nomePeca: it.nomePeca,
            totalQtd: 0,
            totalPago: 0,
            totalRetirado: 0
          };
        }
        itemsMap[it.indiceFt].totalQtd += qTotal;
        itemsMap[it.indiceFt].totalPago += qPago;
        itemsMap[it.indiceFt].totalRetirado += qRetirado;
      });
    });

    const items = Object.values(itemsMap)
      .map(it => {
        const maxWithdraw = it.totalQtd - it.totalPago - it.totalRetirado;
        return {
          ...it,
          maxQtd: maxWithdraw,
          withdrawQtd: ''
        };
      })
      .filter(it => it.maxQtd > 0)
      .sort((a, b) => String(a.indiceFt || '').localeCompare(String(b.indiceFt || ''), undefined, { numeric: true }));

    setGlobalWithdrawItems(items);
    setGlobalWithdrawSearch('');
    setShowGlobalWithdrawModal(true);
  };

  const updateGlobalWithdrawItem = (indiceFt, value) => {
    setGlobalWithdrawItems(prev => prev.map(it => {
      if (it.indiceFt !== indiceFt) return it;
      if (value === '') return { ...it, withdrawQtd: '' };
      let val = parseN(value);
      if (val < 0) val = 0;
      if (val > it.maxQtd) val = it.maxQtd;
      return { ...it, withdrawQtd: val };
    }));
  };

  const handleSaveGlobalWithdraw = async () => {
    const selectedToWithdraw = globalWithdrawItems.filter(it => parseN(it.withdrawQtd) > 0);
    if (selectedToWithdraw.length === 0) return alert("Selecione a quantidade de pelo menos 1 item para registrar a retirada.");

    setLoading(true);
    try {
      // Clonar batches e ordenar da remessa MAIS ANTIGA para a MAIS NOVA (FIFO)
      const updatedBatches = JSON.parse(JSON.stringify(selectedAccount.batches || []));
      updatedBatches.sort((a, b) => new Date(a.date) - new Date(b.date));

      for (const withdrawIt of selectedToWithdraw) {
        let remainingToWithdraw = parseN(withdrawIt.withdrawQtd);
        const ftId = withdrawIt.indiceFt;

        for (const batch of updatedBatches) {
          if (remainingToWithdraw <= 0) break;
          const targetItem = (batch.items || []).find(i => i.indiceFt === ftId);
          if (targetItem) {
            const qTotal = parseN(targetItem.qtd);
            const qPago = parseN(targetItem.qtdPago);
            const qRetirado = parseN(targetItem.qtdRetirado);
            const openInBatch = qTotal - qPago - qRetirado;

            if (openInBatch > 0) {
              const deduct = Math.min(remainingToWithdraw, openInBatch);
              targetItem.qtdRetirado = qRetirado + deduct;
              remainingToWithdraw -= deduct;
            }
          }
        }

        // Devolver a quantidade total retirada ao estoque físico (negativo devolve)
        await updateFtStock(ftId, -parseN(withdrawIt.withdrawQtd));
      }

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

      if (!resp.ok) throw new Error("Erro ao registrar retirada.");

      setShowGlobalWithdrawModal(false);
      setGlobalWithdrawItems([]);
      fetchData();
      setSelectedAccount(prev => ({ ...prev, batches: updatedBatches }));
      alert("Retirada registrada com sucesso! Os itens foram devolvidos ao estoque físico.");
    } catch (e) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Edit Batch ───────────────────────────────────────────────────────────────
  const openEditBatchModal = (batch) => {
    setEditBatch(batch);

    // Existing items: pre-fill with current qty and lock minimum at paid+withdrawn
    const existing = (batch.items || []).map(it => ({
      ...it,
      originalQtd: parseN(it.qtd),
      minQtd: parseN(it.qtdPago) + parseN(it.qtdRetirado),
      editQtd: String(parseN(it.qtd)),
    }));
    setEditBatchItems(existing);

    // New items: FTs/ORC not yet in this batch
    const existingIds = new Set((batch.items || []).map(i => i.indiceFt));
    const globalM = parseN(batchMarkup) > 0 ? parseN(batchMarkup) : 1;
    const newAvailable = fts
      .filter(ft => !existingIds.has(ft.indiceFt))
      .map(ft => {
        const lastPrice = getLastPriceForAccount(selectedAccount, ft.indiceFt);
        const custo = ft._custoFinal || 0;
        const precoUnit = ft.isOrcamento
          ? String(ft.precoSugerido || 0)
          : lastPrice !== null
            ? lastPrice.toFixed(2)
            : (custo * globalM).toFixed(2);
        return {
          indiceFt: ft.indiceFt,
          nomePeca: ft.nomePeca,
          custoBase: custo,
          precoUnit,
          addQtd: '',         // quantity the user wants to add
          isOrcamento: ft.isOrcamento,
        };
      });
    setEditBatchNewItems(newAvailable);
    setEditBatchSearch('');
    setShowEditBatchModal(true);
  };

  const updateEditExistingItem = (indiceFt, value) => {
    setEditBatchItems(prev => prev.map(it => {
      if (it.indiceFt !== indiceFt) return it;
      return { ...it, editQtd: value };
    }));
  };

  const updateEditNewItem = (indiceFt, value) => {
    setEditBatchNewItems(prev => prev.map(it => {
      if (it.indiceFt !== indiceFt) return it;
      return { ...it, addQtd: value };
    }));
  };

  const handleSaveEditBatch = async () => {
    // Validate minimums for existing items
    for (const it of editBatchItems) {
      const q = parseN(it.editQtd);
      if (q < it.minQtd) {
        return alert(`Quantidade mínima para "${it.nomePeca}" é ${it.minQtd} (${it.minQtd} já pagos/retirados). Não é possível reduzir abaixo disso.`);
      }
    }

    const addedNew = editBatchNewItems.filter(it => parseN(it.addQtd) > 0);
    const hasChanges = editBatchItems.some(it => parseN(it.editQtd) !== it.originalQtd) || addedNew.length > 0;
    if (!hasChanges) return alert('Nenhuma alteração detectada.');

    setLoading(true);
    try {
      const updatedBatches = JSON.parse(JSON.stringify(selectedAccount.batches || []));
      const targetBatch = updatedBatches.find(b => b.id === editBatch.id);
      if (!targetBatch) throw new Error('Remessa não encontrada.');

      // ── Update existing items + adjust stock ──
      for (const it of editBatchItems) {
        const newQtd = parseN(it.editQtd);
        const delta = newQtd - it.originalQtd; // + → deduct stock, - → return to stock
        const targetItem = targetBatch.items.find(i => i.indiceFt === it.indiceFt);
        if (targetItem) targetItem.qtd = newQtd;
        if (delta !== 0) await updateFtStock(it.indiceFt, delta);
      }

      // ── Add new items + deduct stock ──
      for (const it of addedNew) {
        const qty = parseN(it.addQtd);
        targetBatch.items.push({
          indiceFt: it.indiceFt,
          nomePeca: it.nomePeca,
          precoUnit: parseN(it.precoUnit),
          qtd: qty,
          qtdPago: 0,
          qtdRetirado: 0,
          isOrcamento: it.isOrcamento,
        });
        await updateFtStock(it.indiceFt, qty);
      }

      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${SUPA_URL}/rest/v1/consignados?id=eq.${selectedAccount.id}`, {
        method: 'PATCH',
        headers: {
          'apikey': SUPA_KEY,
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ batches: updatedBatches }),
      });

      if (!resp.ok) throw new Error('Erro ao salvar edição da remessa.');

      setShowEditBatchModal(false);
      setEditBatch(null);
      fetchData();
      setSelectedAccount(prev => ({ ...prev, batches: updatedBatches }));
      alert('Remessa atualizada com sucesso! O estoque foi ajustado automaticamente.');
    } catch (e) {
      alert(e.message);
      setLoading(false);
    }
  };

  // Views rendering
  if (selectedAccount) {
    const stats = calculateAccountStats(selectedAccount);
    
    // Aggregating items for Extrato
    const aggregatedItems = {};
    (selectedAccount.batches || []).forEach(batch => {
      (batch.items || []).forEach(it => {
        if (!aggregatedItems[it.indiceFt]) {
          aggregatedItems[it.indiceFt] = { ...it, totalQtd: 0, totalPago: 0, totalRetirado: 0, totalValue: 0 };
        }
        aggregatedItems[it.indiceFt].totalQtd += parseN(it.qtd);
        aggregatedItems[it.indiceFt].totalPago += parseN(it.qtdPago);
        aggregatedItems[it.indiceFt].totalRetirado += parseN(it.qtdRetirado);
        aggregatedItems[it.indiceFt].totalValue += (parseN(it.qtd) - parseN(it.qtdRetirado)) * parseN(it.precoUnit);
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
                <button className="btn-outline btn-sm" onClick={openGlobalWithdrawModal} style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }} title="Retirar Itens Devolvidos pelo Cliente">
                  ↩️ Retirar Itens
                </button>
                <button className="btn-outline btn-sm" onClick={() => openPrintBalanceWindow(aggregatedItems, selectedAccount.cliente, stats, profile?.tenants)} title="Imprimir Saldo em Aberto">
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
                    <th style={{ padding: '0.5rem', textAlign: 'center', color: '#3b82f6' }}>Retirados</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--success)' }}>Pagos</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--danger)' }}>Aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.values(aggregatedItems).map(it => {
                    const emAberto = it.totalQtd - it.totalPago - it.totalRetirado;
                    return (
                      <tr key={it.indiceFt} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '0.75rem 0.5rem' }}>
                          <span className="badge-sm" style={{ marginRight: '8px' }}>{it.indiceFt}</span>
                          {it.nomePeca}
                        </td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontWeight: 'bold' }}>{it.totalQtd}</td>
                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#3b82f6', fontWeight: 'bold' }}>{it.totalRetirado}</td>
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
                      <button className="btn-outline btn-sm" onClick={() => openPrintBatchWindow(batch, selectedAccount.cliente, profile?.tenants)} title="Imprimir Guia da Remessa">
                        <Printer size={16} /> Imprimir
                      </button>
                      <button className="btn-outline btn-sm" onClick={() => openEditBatchModal(batch)} style={{ borderColor: '#f59e0b', color: '#f59e0b' }} title="Editar itens desta remessa">
                        ✏️ Editar
                      </button>
                      <button className="btn-outline btn-sm" onClick={() => openWithdrawModal(batch)} style={{ borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }} title="Retirar Itens Devolvidos">
                        ↩️ Retirar Itens
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
                      const qRetirado = parseN(it.qtdRetirado);
                      const open = qTotal - qPago - qRetirado;
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
                            [{qPago} pagos / {qRetirado} retirados / {open} abertos]
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
                const addedItems = newBatchItems.filter(it => parseN(it.qtd) > 0);
                const availableItems = newBatchItems.filter(it => !parseN(it.qtd));
                const totalQtd = addedItems.reduce((acc, it) => acc + parseN(it.qtd), 0);
                const totalVal = addedItems.reduce((acc, it) => acc + (parseN(it.qtd) * parseN(it.precoUnit)), 0);
                
                const isComissionado = selectedAccount.cliente?.tipoAcerto === 'comissionado';
                const comissaoPct = isComissionado ? parseN(selectedAccount.cliente?.comissaoPct) : 0;
                
                const totalComissao = addedItems.reduce((acc, it) => {
                  return acc + (parseN(it.precoUnit) * (comissaoPct / 100) * parseN(it.qtd));
                }, 0);
                
                const totalLucro = addedItems.reduce((acc, it) => {
                  const qty = parseN(it.qtd);
                  const pVenda = parseN(it.precoUnit);
                  const vLucro = isComissionado
                    ? (pVenda * (100 - comissaoPct) / 100) - parseN(it.custoBase)
                    : pVenda - parseN(it.custoBase);
                  return acc + (vLucro * qty);
                }, 0);

                return (
                  <>
                    {/* Tabela 1: Itens Adicionados */}
                    <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: '12px' }}>
                      <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="badge" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)', padding: '0.2rem 0.6rem', borderRadius: '6px' }}>
                          {addedItems.length}
                        </span>
                        Itens Adicionados ao Pedido
                      </h3>

                      {addedItems.length === 0 ? (
                        <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', margin: 0, padding: '1rem 0' }}>
                          Nenhum item adicionado ao pedido ainda. Use a lista de Produtos Disponíveis abaixo para buscar e adicionar itens.
                        </p>
                      ) : (
                        <table className="items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--bg-primary)' }}>
                              <th style={{ padding: '0.75rem' }}>ID</th>
                              <th style={{ padding: '0.75rem' }}>Nome</th>
                              <th style={{ padding: '0.75rem' }}>Preço de Custo</th>
                              <th style={{ padding: '0.75rem', width: '90px', textAlign: 'center' }} title="Markup aplicado neste item. Edite para usar um valor diferente do global.">Markup</th>
                              <th style={{ padding: '0.75rem', width: '150px' }}>Preço de Venda (R$)</th>
                              {isComissionado && (
                                <th style={{ padding: '0.75rem', width: '130px' }}>
                                  Comissão ({comissaoPct}%)
                                </th>
                              )}
                              <th style={{ padding: '0.75rem', width: '130px' }}>Lucro</th>
                              <th style={{ padding: '0.75rem', width: '130px' }}>Valor Total</th>
                              <th style={{ padding: '0.75rem', width: '120px' }}>Qtd no Pedido</th>
                              <th style={{ padding: '0.75rem', width: '80px', textAlign: 'center' }}>Remover</th>
                            </tr>
                          </thead>
                          <tbody>
                            {addedItems.map((it) => {
                              const originalIdx = newBatchItems.findIndex(oi => oi.indiceFt === it.indiceFt);
                              const pVenda = parseN(it.precoUnit);
                              const vComissao = pVenda * (comissaoPct / 100);
                              const vLucro = isComissionado 
                                ? (pVenda * (100 - comissaoPct) / 100) - parseN(it.custoBase)
                                : pVenda - parseN(it.custoBase);

                              return (
                                <tr key={it.indiceFt} style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(124, 58, 237, 0.03)' }}>
                                  <td style={{ padding: '0.5rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                                  <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>{it.nomePeca}</td>
                                  <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>R$ {fmt(it.custoBase)}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                    {!it.isOrcamento ? (
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>×</span>
                                        <input
                                          type="number"
                                          step="0.1"
                                          min="0.1"
                                          className="cell-input"
                                          value={it.itemMarkup}
                                          onChange={e => updateBatchItem(originalIdx, 'itemMarkup', e.target.value)}
                                          style={{ width: '55px', textAlign: 'center' }}
                                          title="Markup deste item. Altere para sobrescrever o global."
                                        />
                                      </div>
                                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <span>R$</span>
                                      <input 
                                        type="number" 
                                        className="cell-input" 
                                        value={it.precoUnit} 
                                        onChange={e => updateBatchItem(originalIdx, 'precoUnit', e.target.value)} 
                                      />
                                    </div>
                                  </td>
                                  {isComissionado && (
                                    <td style={{ padding: '0.5rem' }}>
                                      <div style={{ color: '#fbbf24', fontWeight: '600' }}>R$ {fmt(vComissao)}</div>
                                      {parseN(it.qtd) > 1 && (
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                          Total: R$ {fmt(vComissao * parseN(it.qtd))}
                                        </div>
                                      )}
                                    </td>
                                  )}
                                  <td style={{ padding: '0.5rem' }}>
                                    <div style={{ fontWeight: 'bold', color: vLucro > 0 ? '#34d399' : vLucro < 0 ? '#f87171' : 'inherit' }}>
                                      R$ {fmt(vLucro)}
                                    </div>
                                    {parseN(it.qtd) > 1 && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        Total: R$ {fmt(vLucro * parseN(it.qtd))}
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>
                                    R$ {fmt(pVenda * parseN(it.qtd))}
                                  </td>
                                  <td style={{ padding: '0.5rem' }}>
                                    <input 
                                      type="number" 
                                      className="cell-input cell-qty" 
                                      value={it.qtd} 
                                      onChange={e => updateBatchItem(originalIdx, 'qtd', e.target.value)} 
                                    />
                                  </td>
                                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                    <button 
                                      type="button" 
                                      className="btn-icon" 
                                      onClick={() => handleRemoveItem(originalIdx)}
                                      style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        margin: '0 auto',
                                        border: '1px solid #fca5a5',
                                        background: '#fef2f2',
                                        padding: '0.4rem',
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                      }}
                                      title="Remover do Pedido"
                                    >
                                      <Trash2 size={16} color="var(--danger)" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                            
                            {/* Linha consolidada de Totais */}
                            <tr style={{ 
                              background: 'var(--bg-secondary)', 
                              borderTop: '2.5px solid var(--border-color)', 
                              fontWeight: '800',
                              fontSize: '0.9rem',
                              color: 'var(--text-primary)'
                            }}>
                              <td style={{ padding: '0.75rem 0.5rem', color: 'var(--accent-primary)', fontSize: '0.8rem', letterSpacing: '0.5px' }} colSpan="3">
                                📊 TOTAIS DA REMESSA
                              </td>
                              <td style={{ padding: '0.75rem 0.5rem' }}>
                                {/* Markup column empty */}
                              </td>
                              <td style={{ padding: '0.75rem 0.5rem' }}>
                                {/* Preço de Venda column empty */}
                              </td>
                              {isComissionado && (
                                <td style={{ padding: '0.75rem 0.5rem', color: '#fbbf24' }}>
                                  R$ {fmt(totalComissao)}
                                </td>
                              )}
                              <td style={{ padding: '0.75rem 0.5rem', color: totalLucro >= 0 ? '#34d399' : '#f87171' }}>
                                R$ {fmt(totalLucro)}
                              </td>
                              <td style={{ padding: '0.75rem 0.5rem', fontWeight: '900' }}>
                                R$ {fmt(totalVal)}
                              </td>
                              <td style={{ padding: '0.75rem 0.5rem', fontWeight: '900', color: 'var(--accent-primary)' }} colSpan="2">
                                {totalQtd} itens
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Tabela 2: Produtos Disponíveis */}
                    <div className="card" style={{ padding: '1.5rem', borderRadius: '12px' }}>
                      <h3 style={{ marginBottom: '1rem' }}>Produtos Disponíveis</h3>
                      
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
                            <th style={{ padding: '0.75rem', width: '90px', textAlign: 'center', userSelect: 'none' }} title="Markup aplicado neste item. Edite para usar um valor diferente do global.">
                              Markup
                            </th>
                            <th 
                              style={{ padding: '0.75rem', width: '150px', cursor: 'pointer', userSelect: 'none' }} 
                              onClick={() => handleSortClick('venda')}
                            >
                              Preço de Venda (R$){renderSortIndicator('venda')}
                            </th>
                            {isComissionado && (
                              <th style={{ padding: '0.75rem', width: '130px', userSelect: 'none' }}>
                                Comissão ({comissaoPct}%)
                              </th>
                            )}
                            <th style={{ padding: '0.75rem', width: '130px', userSelect: 'none' }}>
                              Lucro
                            </th>
                            <th style={{ padding: '0.75rem', width: '160px', userSelect: 'none' }}>
                              Qtd a Enviar
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {availableItems
                            .filter(it => (it.nomePeca || '').toLowerCase().includes(searchTerm.toLowerCase()) || (it.indiceFt || '').toLowerCase().includes(searchTerm.toLowerCase()))
                            .sort((a, b) => {
                              let valA, valB;
                              if (modalSortField === 'id') {
                                  valA = a.indiceFt || '';
                                  valB = b.indiceFt || '';
                                  return modalSortAsc ? valA.localeCompare(valB, undefined, { numeric: true }) : valB.localeCompare(valA, undefined, { numeric: true });
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
                              const originalIdx = newBatchItems.findIndex(oi => oi.indiceFt === it.indiceFt);
                              const pVenda = parseN(it.precoUnit);
                              const vComissao = pVenda * (comissaoPct / 100);
                              const vLucro = isComissionado 
                                ? (pVenda * (100 - comissaoPct) / 100) - parseN(it.custoBase)
                                : pVenda - parseN(it.custoBase);

                              return (
                                <tr key={it.indiceFt} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                  <td style={{ padding: '0.5rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                                  <td style={{ padding: '0.5rem' }}>{it.nomePeca}</td>
                                  <td style={{ padding: '0.5rem', color: 'var(--text-muted)' }}>R$ {fmt(it.custoBase)}</td>
                                  <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                    {!it.isOrcamento ? (
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>×</span>
                                        <input
                                          type="number"
                                          step="0.1"
                                          min="0.1"
                                          className="cell-input"
                                          value={it.itemMarkup}
                                          onChange={e => updateBatchItem(originalIdx, 'itemMarkup', e.target.value)}
                                          style={{ width: '55px', textAlign: 'center' }}
                                          title="Markup deste item. Altere para sobrescrever o global."
                                        />
                                      </div>
                                    ) : <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>}
                                  </td>
                                  <td style={{ padding: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                      <span>R$</span>
                                      <input 
                                        type="number" 
                                        className="cell-input" 
                                        value={it.precoUnit} 
                                        onChange={e => updateBatchItem(originalIdx, 'precoUnit', e.target.value)} 
                                      />
                                    </div>
                                  </td>
                                  {isComissionado && (
                                    <td style={{ padding: '0.5rem' }}>
                                      <div style={{ color: '#fbbf24', fontWeight: '600' }}>R$ {fmt(vComissao)}</div>
                                    </td>
                                  )}
                                  <td style={{ padding: '0.5rem' }}>
                                    <div style={{ fontWeight: 'bold', color: vLucro > 0 ? '#34d399' : vLucro < 0 ? '#f87171' : 'inherit' }}>
                                      R$ {fmt(vLucro)}
                                    </div>
                                  </td>
                                  <td style={{ padding: '0.5rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      <input 
                                        type="number" 
                                        className="cell-input cell-qty" 
                                        placeholder="0"
                                        value={it.tempQtd} 
                                        onChange={e => updateBatchItem(originalIdx, 'tempQtd', e.target.value)}
                                        onKeyDown={e => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleAddItem(originalIdx);
                                          }
                                        }}
                                      />
                                      <button 
                                        type="button" 
                                        onClick={() => handleAddItem(originalIdx)}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          padding: '0.4rem 0.6rem',
                                          background: 'var(--accent-primary, #7c3aed)',
                                          color: 'white',
                                          border: 'none',
                                          borderRadius: '6px',
                                          cursor: 'pointer',
                                          fontWeight: 'bold',
                                          fontSize: '1.2rem',
                                          lineHeight: '1',
                                          height: '32px',
                                          width: '32px',
                                          transition: 'opacity 0.2s'
                                        }}
                                        title="Adicionar ao pedido"
                                      >
                                        +
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* MODAL PAGAMENTO (BAIXA DE ITENS) */}
        {showNewPaymentModal && (() => {
          const comissaoPct = selectedAccount.cliente?.tipoAcerto === 'comissionado' ? parseN(selectedAccount.cliente?.comissaoPct) : 0;
          const repasseRate = (100 - comissaoPct) / 100;
          const grossTotal = itemsToPay.filter(it => !it.isRetired).reduce((sum, it) => sum + (parseN(it.payQtd) * parseN(it.precoUnit)), 0);
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
                    
                    {Object.entries(groupedItemsToPay).sort((a, b) => new Date(a[1].date) - new Date(b[1].date)).map(([batchId, batchData]) => {
                      const hasRetired = batchData.items.some(it => it.isRetired);
                      const hasOpen = batchData.items.some(it => !it.isRetired);
                      return (
                        <div key={batchId} style={{ marginBottom: '2.5rem', border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                          <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                              <Calendar size={18} color="var(--primary)" />
                              <h4 style={{ margin: 0 }}>Remessa de {new Date(batchData.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</h4>
                            </div>
                            {hasRetired && (
                              <span style={{ fontSize: '0.78rem', background: 'rgba(59,130,246,0.12)', color: '#3b82f6', padding: '3px 10px', borderRadius: '12px', fontWeight: '700', border: '1px solid rgba(59,130,246,0.25)' }}>
                                ↩️ Possui itens retirados
                              </span>
                            )}
                          </div>
                          <table className="items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', background: '#f8fafc' }}>
                                <th style={{ padding: '0.75rem' }}>ID</th>
                                <th style={{ padding: '0.75rem' }}>Nome do Item</th>
                                <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>Enviados</th>
                                <th style={{ padding: '0.75rem', textAlign: 'center', color: '#3b82f6' }}>↩ Retirados</th>
                                <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--danger)' }}>Em Aberto</th>
                                <th style={{ padding: '0.75rem', width: '150px' }}>Preço Unit.</th>
                                <th style={{ padding: '0.75rem', width: '120px' }}>Qtd Pagando</th>
                                <th style={{ padding: '0.75rem', textAlign: 'right', width: '150px' }}>Subtotal (R$)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {batchData.items.map((it) => {
                                const preco = parseN(it.precoUnit);

                                // ── Item totalmente retirado: exibe como referência (somente leitura) ──
                                if (it.isRetired) {
                                  return (
                                    <tr key={it.globalIndex} style={{ borderBottom: '1px solid var(--border-color)', background: 'rgba(59,130,246,0.04)', opacity: 0.75 }}>
                                      <td style={{ padding: '0.75rem 0.5rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                                      <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>{it.nomePeca}</td>
                                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>{it.qtdTotal}</td>
                                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#3b82f6', fontWeight: 'bold' }}>{it.qtdRetirado}</td>
                                      <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>0</td>
                                      <td colSpan={3} style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                        <span style={{ fontSize: '0.78rem', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '3px 10px', borderRadius: '12px', fontWeight: '700' }}>
                                          ↩️ Totalmente Retirado — sem saldo a pagar
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                }

                                // ── Item em aberto: exibe com input de quantidade ──
                                const active = parseN(it.payQtd) > 0;
                                const sub = parseN(it.payQtd) * preco * repasseRate;
                                return (
                                  <tr key={it.globalIndex} style={{ borderBottom: '1px solid var(--border-color)', background: active ? 'rgba(52, 211, 153, 0.05)' : 'transparent' }}>
                                    <td style={{ padding: '0.75rem 0.5rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: active ? 'bold' : 'normal' }}>{it.nomePeca}</td>
                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>{it.qtdTotal}</td>
                                    <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: it.qtdRetirado > 0 ? '#3b82f6' : 'var(--text-muted)', fontWeight: it.qtdRetirado > 0 ? 'bold' : 'normal' }}>
                                      {it.qtdRetirado > 0 ? it.qtdRetirado : '—'}
                                    </td>
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
                      );
                    })}
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* MODAL RETIRADA DE ITENS DE BATCH INDIVIDUAL */}
        {withdrawBatch && (() => {
          const dateObj = withdrawBatch.date ? new Date(withdrawBatch.date) : null;
          const dateLabel = dateObj && !isNaN(dateObj.getTime()) 
            ? dateObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) 
            : 'Data não informada';
          return (
            <div className="modal-fullscreen">
              <div className="modal-topbar">
                <div className="modal-topbar-left">
                  <button className="btn-outline btn-sm" onClick={() => { setWithdrawBatch(null); setWithdrawItems([]); }}>✕ Cancelar</button>
                  <div>
                    <h2 className="modal-title">Retirar Itens Devolvidos</h2>
                    <p className="modal-sub">Insira a quantidade que está sendo retirada. Estes itens voltarão para o seu estoque físico.</p>
                  </div>
                </div>
                <div className="modal-topbar-right">
                  <button className="btn-primary" onClick={handleSaveWithdraw} disabled={loading} style={{ background: 'var(--accent-primary)' }}>
                    {loading ? 'Salvando...' : '↩️ Confirmar Retirada'}
                  </button>
                </div>
              </div>
              <div className="modal-scroll-body" style={{ padding: '2rem' }}>
                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2rem' }}>
                  <Calendar size={18} color="var(--primary)" />
                  <h4 style={{ margin: 0 }}>Remessa de {dateLabel}</h4>
                </div>

                {withdrawItems.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '3rem' }}>
                    <h3>Não há itens em aberto nesta remessa para retirar! 🎉</h3>
                  </div>
                ) : (
                  <table className="items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                        <th style={{ padding: '0.75rem' }}>ID</th>
                        <th style={{ padding: '0.75rem' }}>Nome do Item</th>
                        <th style={{ padding: '0.75rem', textAlign: 'center' }}>Saldo em Aberto</th>
                        <th style={{ padding: '0.75rem', width: '200px' }}>Qtd a Retirar (Devolver ao Estoque)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withdrawItems.map((it, idx) => {
                        const active = parseN(it.withdrawQtd) > 0;
                        return (
                          <tr key={it.indiceFt} style={{ borderBottom: '1px solid var(--border-color)', background: active ? 'rgba(59, 130, 246, 0.05)' : 'transparent' }}>
                            <td style={{ padding: '0.75rem 0.5rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: active ? 'bold' : 'normal' }}>{it.nomePeca}</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--danger)', fontWeight: 'bold' }}>{it.maxQtd}</td>
                            <td style={{ padding: '0.5rem' }}>
                              <input 
                                type="number" 
                                className="cell-input cell-qty" 
                                style={{ borderColor: active ? 'var(--accent-primary)' : 'var(--border-color)', width: '100px' }}
                                min="0" 
                                max={it.maxQtd} 
                                placeholder="0"
                                value={it.withdrawQtd} 
                                onChange={e => updateWithdrawItem(idx, e.target.value)} 
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          );
        })()}

        {/* MODAL RETIRADA GLOBAL DE ITENS (FIFO) */}
        {showGlobalWithdrawModal && (
          <div className="modal-fullscreen">
            <div className="modal-topbar">
              <div className="modal-topbar-left">
                <button className="btn-outline btn-sm" onClick={() => { setShowGlobalWithdrawModal(false); setGlobalWithdrawItems([]); }}>✕ Cancelar</button>
                <div>
                  <h2 className="modal-title">Retirar Itens do Consignado (Devolução ao Estoque)</h2>
                  <p className="modal-sub">Selecione a quantidade de cada item que o cliente está devolvendo. O abatimento será feito automaticamente da remessa mais antiga para a mais nova.</p>
                </div>
              </div>
              <div className="modal-topbar-right">
                <button className="btn-primary" onClick={handleSaveGlobalWithdraw} disabled={loading} style={{ background: 'var(--accent-primary)' }}>
                  {loading ? 'Salvando...' : '↩️ Confirmar Retirada'}
                </button>
              </div>
            </div>
            <div className="modal-scroll-body" style={{ padding: '2rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <input 
                  type="text" 
                  placeholder="🔍 Buscar por ID ou Nome do item..." 
                  className="cell-input"
                  value={globalWithdrawSearch}
                  onChange={e => setGlobalWithdrawSearch(e.target.value)}
                  style={{ width: '350px', padding: '0.6rem 1rem', fontSize: '0.95rem' }}
                />
                <button 
                  type="button" 
                  className="btn-outline btn-sm" 
                  onClick={() => setGlobalWithdrawItems(prev => prev.map(it => ({ ...it, withdrawQtd: it.maxQtd })))}
                  title="Preencher a retirada de todo o estoque em aberto do cliente"
                >
                  ⚡ Preencher Devolução Total
                </button>
              </div>

              {globalWithdrawItems.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem' }}>
                  <h3>Não há nenhum item em aberto com este cliente para retirar! 🎉</h3>
                </div>
              ) : (
                <table className="items-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-secondary)' }}>
                      <th style={{ padding: '0.75rem' }}>ID</th>
                      <th style={{ padding: '0.75rem' }}>Nome do Item</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center' }}>Total Enviado</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--success)' }}>Já Pagos</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', color: '#3b82f6' }}>Já Retirados</th>
                      <th style={{ padding: '0.75rem', textAlign: 'center', color: 'var(--danger)' }}>Saldo em Aberto</th>
                      <th style={{ padding: '0.75rem', width: '200px' }}>Qtd a Retirar (Devolver ao Estoque)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {globalWithdrawItems
                      .filter(it => (it.nomePeca || '').toLowerCase().includes(globalWithdrawSearch.toLowerCase()) || (it.indiceFt || '').toLowerCase().includes(globalWithdrawSearch.toLowerCase()))
                      .map((it) => {
                        const active = parseN(it.withdrawQtd) > 0;
                        return (
                          <tr key={it.indiceFt} style={{ borderBottom: '1px solid var(--border-color)', background: active ? 'rgba(59, 130, 246, 0.05)' : 'transparent' }}>
                            <td style={{ padding: '0.75rem 0.5rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                            <td style={{ padding: '0.75rem 0.5rem', fontWeight: active ? 'bold' : 'normal' }}>{it.nomePeca}</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>{it.totalQtd}</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--success)', fontWeight: 'bold' }}>{it.totalPago}</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: '#3b82f6', fontWeight: 'bold' }}>{it.totalRetirado}</td>
                            <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center', color: 'var(--danger)', fontWeight: 'bold' }}>{it.maxQtd}</td>
                            <td style={{ padding: '0.5rem' }}>
                              <input 
                                type="number" 
                                className="cell-input cell-qty" 
                                style={{ borderColor: active ? 'var(--accent-primary)' : 'var(--border-color)', width: '100px' }}
                                min="0" 
                                max={it.maxQtd} 
                                placeholder="0"
                                value={it.withdrawQtd} 
                                onChange={e => updateGlobalWithdrawItem(it.indiceFt, e.target.value)} 
                              />
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* MODAL EDITAR REMESSA */}
        {showEditBatchModal && editBatch && (() => {
          const dateLabel = editBatch.date
            ? new Date(editBatch.date).toLocaleDateString('pt-BR', { timeZone: 'UTC' })
            : '';
          const filteredNew = editBatchNewItems.filter(it =>
            (it.nomePeca || '').toLowerCase().includes(editBatchSearch.toLowerCase()) ||
            String(it.indiceFt || '').toLowerCase().includes(editBatchSearch.toLowerCase())
          );
          const hasNewAdded = editBatchNewItems.some(it => parseN(it.addQtd) > 0);
          const hasExistingChanged = editBatchItems.some(it => parseN(it.editQtd) !== it.originalQtd);

          return (
            <div className="modal-fullscreen">
              <div className="modal-topbar">
                <div className="modal-topbar-left">
                  <button className="btn-outline btn-sm" onClick={() => { setShowEditBatchModal(false); setEditBatch(null); }}>✕ Cancelar</button>
                  <div>
                    <h2 className="modal-title">✏️ Editar Remessa — {dateLabel}</h2>
                    <p className="modal-sub">Ajuste quantidades ou adicione itens esquecidos. O estoque é corrigido automaticamente.</p>
                  </div>
                </div>
                <div className="modal-topbar-right">
                  <button className="btn-primary" onClick={handleSaveEditBatch} disabled={loading || (!hasNewAdded && !hasExistingChanged)}>
                    {loading ? 'Salvando...' : '💾 Salvar Alterações'}
                  </button>
                </div>
              </div>

              <div className="modal-scroll-body" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

                {/* ── Seção 1: Itens existentes ── */}
                <div className="card" style={{ padding: '1.5rem' }}>
                  <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    Itens da Remessa
                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: 'var(--text-muted)' }}>— altere as quantidades abaixo (mínimo = pagos + retirados)</span>
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', background: 'var(--bg-secondary)', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                        <th style={{ padding: '0.6rem 0.75rem' }}>ID</th>
                        <th style={{ padding: '0.6rem 0.75rem' }}>Produto</th>
                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Pagos</th>
                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Retirados</th>
                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Mínimo</th>
                        <th style={{ padding: '0.6rem 0.75rem', width: '140px' }}>Qtd na Remessa</th>
                        <th style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>Δ Alteração</th>
                      </tr>
                    </thead>
                    <tbody>
                      {editBatchItems.map(it => {
                        const current = parseN(it.editQtd);
                        const delta = current - it.originalQtd;
                        const isValid = current >= it.minQtd;
                        return (
                          <tr key={it.indiceFt} style={{ borderBottom: '1px solid var(--border-color)', background: delta !== 0 ? 'rgba(245,158,11,0.04)' : 'transparent' }}>
                            <td style={{ padding: '0.6rem 0.75rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                            <td style={{ padding: '0.6rem 0.75rem', fontWeight: 500 }}>{it.nomePeca}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--success)', fontWeight: 'bold' }}>{parseN(it.qtdPago)}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: '#3b82f6', fontWeight: 'bold' }}>{parseN(it.qtdRetirado)}</td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>≥ {it.minQtd}</td>
                            <td style={{ padding: '0.4rem 0.75rem' }}>
                              <input
                                type="number"
                                className="cell-input cell-qty"
                                min={it.minQtd}
                                value={it.editQtd}
                                style={{ borderColor: !isValid ? 'var(--danger)' : delta !== 0 ? '#f59e0b' : 'var(--border-color)', width: '90px' }}
                                onChange={e => updateEditExistingItem(it.indiceFt, e.target.value)}
                              />
                            </td>
                            <td style={{ padding: '0.6rem 0.75rem', textAlign: 'center' }}>
                              {delta === 0 ? (
                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                              ) : (
                                <span style={{ fontWeight: 'bold', color: delta > 0 ? '#f59e0b' : 'var(--success)', fontSize: '0.9rem' }}>
                                  {delta > 0 ? `+${delta} ▼ estoque` : `${delta} ▲ estoque`}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* ── Seção 2: Adicionar novos itens ── */}
                <div className="card" style={{ padding: '1.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                    <h3 style={{ margin: 0 }}>
                      Adicionar Novos Itens
                      {hasNewAdded && (
                        <span style={{ marginLeft: '10px', fontSize: '0.82rem', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', padding: '2px 10px', borderRadius: '12px', fontWeight: 700 }}>
                          {editBatchNewItems.filter(it => parseN(it.addQtd) > 0).length} item(s) a adicionar
                        </span>
                      )}
                    </h3>
                    <input
                      type="text"
                      placeholder="🔍 Buscar por nome ou ID..."
                      value={editBatchSearch}
                      onChange={e => setEditBatchSearch(e.target.value)}
                      style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-primary)', color: 'var(--text-primary)', width: '300px' }}
                    />
                  </div>

                  {filteredNew.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Todos os produtos já estão nesta remessa, ou nenhum resultado para a busca.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', background: 'var(--bg-secondary)', fontSize: '0.83rem', color: 'var(--text-muted)' }}>
                          <th style={{ padding: '0.6rem 0.75rem' }}>ID</th>
                          <th style={{ padding: '0.6rem 0.75rem' }}>Produto</th>
                          <th style={{ padding: '0.6rem 0.75rem' }}>Preço Unit.</th>
                          <th style={{ padding: '0.6rem 0.75rem', width: '180px' }}>Qtd a Adicionar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredNew.map(it => {
                          const qty = parseN(it.addQtd);
                          const active = qty > 0;
                          return (
                            <tr key={it.indiceFt} style={{ borderBottom: '1px solid var(--border-color)', background: active ? 'rgba(245,158,11,0.05)' : 'transparent' }}>
                              <td style={{ padding: '0.6rem 0.75rem' }}><span className="badge-sm">{it.indiceFt}</span></td>
                              <td style={{ padding: '0.6rem 0.75rem', fontWeight: active ? 600 : 400 }}>{it.nomePeca}</td>
                              <td style={{ padding: '0.6rem 0.75rem', color: 'var(--text-muted)' }}>R$ {fmt(parseN(it.precoUnit))}</td>
                              <td style={{ padding: '0.4rem 0.75rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <input
                                    type="number"
                                    className="cell-input cell-qty"
                                    min="0"
                                    placeholder="0"
                                    value={it.addQtd}
                                    style={{ borderColor: active ? '#f59e0b' : 'var(--border-color)', width: '80px' }}
                                    onChange={e => updateEditNewItem(it.indiceFt, e.target.value)}
                                  />
                                  {active && (
                                    <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 700 }}>
                                      +{qty} → ▼ estoque
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
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
