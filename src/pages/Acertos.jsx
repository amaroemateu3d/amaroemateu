import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { Loader, LogOut, User, Search, RefreshCw, ShoppingBag, DollarSign, CheckCircle2 } from 'lucide-react';
import './Acertos.css';

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

const fmt = (n) => {
  const num = Number(n);
  if (isNaN(num)) return '0,00';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export default function Acertos() {
  const { signOut, profile } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [productNames, setProductNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [salesToRegister, setSalesToRegister] = useState({}); // { [ftId]: quantity }
  
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [receiptData, setReceiptData] = useState(null);

  const shareWhatsApp = async (settlement) => {
    if (!settlement) return;
    const comissaoText = settlement.tipoAcerto === 'comissionado' 
      ? `*Comissão (${settlement.comissaoPct}%):* - R$ ${fmt(settlement.grossTotal * (parseN(settlement.comissaoPct) / 100))}\n*Valor Líquido Recebido:* R$ ${fmt(settlement.netTotal)}`
      : `*Valor Recebido:* R$ ${fmt(settlement.netTotal)}`;

    const itemsText = settlement.items.map(it => {
      const displayNome = it.nomePeca || productNames[it.indiceFt] || 'Sem Nome';
      return `• ${it.qtd}x ${displayNome} (R$ ${fmt(it.precoUnit)}/un)`;
    }).join('\n');

    const message = `*AM3D - COMPROVANTE DE ACERTO CONSIGNADO*\n\n` +
      `🤝 *Cliente:* ${settlement.cliente.nome}\n` +
      `📅 *Data:* ${settlement.date}\n\n` +
      `*Peças Acertadas:*\n${itemsText}\n\n` +
      `*Resumo Financeiro:*\n` +
      `*Venda Bruta:* R$ ${fmt(settlement.grossTotal)}\n` +
      `${comissaoText}\n\n` +
      `Obrigado pela parceria! 🚀`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Comprovante AM3D',
          text: message
        });
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          return;
        }
      }
    }

    const encoded = encodeURIComponent(message);
    const phone = settlement.cliente.telefone ? settlement.cliente.telefone.replace(/\D/g, '') : '';
    const url = phone ? `https://api.whatsapp.com/send?phone=${phone}&text=${encoded}` : `https://api.whatsapp.com/send?text=${encoded}`;
    window.open(url, '_blank');
  };

  const printLastSettlement = (settlement) => {
    if (!settlement) return;
    const dateStr = settlement.date;
    const accentColor = '#10B981';
    const accentBg = '#D1FAE5';

    const itemsHtml = settlement.items.map((it, i) => {
      const displayNome = it.nomePeca || productNames[it.indiceFt] || 'Sem Nome';
      return `
        <tr class="${i % 2 === 0 ? 'row-even' : ''}">
          <td class="cell-center text-muted" style="padding: 9px 10px; border-bottom: 1px solid #F1F5F9; text-align: center; color: #64748B;">${i + 1}</td>
          <td class="cell-id" style="padding: 9px 10px; border-bottom: 1px solid #F1F5F9; font-weight: 700; color: #1E293B;">${it.indiceFt}</td>
          <td class="cell-name" style="padding: 9px 10px; border-bottom: 1px solid #F1F5F9; font-weight: 500;">${displayNome}</td>
          <td class="cell-center cell-bold" style="padding: 9px 10px; border-bottom: 1px solid #F1F5F9; font-weight: 700; text-align: center;">${it.qtd}</td>
          <td class="cell-right text-muted" style="padding: 9px 10px; border-bottom: 1px solid #F1F5F9; text-align: right; color: #64748B;">R$ ${fmt(it.precoUnit)}</td>
          <td class="cell-right cell-bold" style="padding: 9px 10px; border-bottom: 1px solid #F1F5F9; text-align: right; font-weight: 700;">R$ ${fmt(it.qtd * it.precoUnit)}</td>
        </tr>
      `;
    }).join('');

    const totalsHtml = settlement.tipoAcerto === 'comissionado' ? `
      <div style="background: ${accentBg}; border-radius: 10px; padding: 13px 22px; text-align: right; min-width: 240px; display: flex; flex-direction: column; gap: 4px; print-color-adjust: exact; -webkit-print-color-adjust: exact; margin-left: auto;">
        <div style="font-size: 8pt; font-weight: 700; color: #047857; text-transform: uppercase; letter-spacing: 1px;">Venda Bruta: R$ ${fmt(settlement.grossTotal)}</div>
        <div style="font-size: 8pt; font-weight: 700; color: #dc2626; text-transform: uppercase; letter-spacing: 1px;">Comissão (-${settlement.comissaoPct}%): - R$ ${fmt(settlement.grossTotal * (parseN(settlement.comissaoPct) / 100))}</div>
        <div style="height: 1px; background: rgba(0,0,0,0.1); margin: 6px 0;"></div>
        <div style="font-size: 8pt; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: 1px;">Valor Líquido Recebido</div>
        <div style="font-family: 'Outfit',sans-serif; font-size: 18pt; font-weight: 900; color: ${accentColor}; margin-top: 2px;">R$ ${fmt(settlement.netTotal)}</div>
      </div>
    ` : `
      <div style="background: ${accentBg}; border-radius: 10px; padding: 13px 22px; text-align: right; min-width: 200px; print-color-adjust: exact; -webkit-print-color-adjust: exact; margin-left: auto;">
        <div style="font-size: 7.5pt; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: 1px;">Total Recebido</div>
        <div style="font-family: 'Outfit',sans-serif; font-size: 18pt; font-weight: 900; color: ${accentColor}; margin-top: 2px;">R$ ${fmt(settlement.netTotal)}</div>
      </div>
    `;

    const printHtml = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8"/>
      <title>Comprovante de Acerto — AM3D</title>
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@700;900&display=swap" rel="stylesheet">
      <style>
        @page { size: A4; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Inter', Arial, sans-serif; font-size: 10pt; color: #1E293B; background: #fff; }
        .top-stripe { height: 6px; background: linear-gradient(90deg, #10B981, #60A5FA, #8B5CF6); print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .page { padding: 1.4cm 2cm 1.4cm 2cm; min-height: calc(297mm - 6px); display: flex; flex-direction: column; gap: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .logo-area { display: flex; align-items: center; gap: 20px; }
        .logo-box { width: 80px; height: 80px; background: linear-gradient(135deg,#10B981,#60A5FA,#8B5CF6); border-radius: 12px; display: flex; align-items: center; justify-content: center; color: #fff; font-family: 'Outfit',sans-serif; font-size: 22pt; font-weight: 900; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .company-info-text { display: flex; flex-direction: column; gap: 2px; font-size: 8pt; color: #475569; line-height: 1.3; text-align: left; }
        .company-title { font-family: 'Outfit', sans-serif; font-size: 14pt; font-weight: 900; color: #1e293b; line-height: 1.1; }
        .company-subtitle { font-weight: 700; color: #64748b; font-size: 8.5pt; }
        .company-slogan { font-style: italic; color: #94a3b8; font-size: 7.5pt; margin-bottom: 2px; }
        .company-details-row, .company-contacts-row { font-size: 7.5pt; color: #64748b; }
        .company-details-row span, .company-contacts-row span { font-weight: 600; color: #334155; }
        .doc-badge-wrap { text-align: right; }
        .doc-badge { display: inline-block; padding: 5px 14px; background: ${accentBg}; color: ${accentColor}; font-size: 8pt; font-weight: 800; letter-spacing: 1.5px; border-radius: 20px; margin-bottom: 6px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .doc-num  { font-family: 'Outfit',sans-serif; font-size: 18pt; font-weight: 900; color: #1E293B; line-height: 1.1; }
        .doc-date { font-size: 8.5pt; color: #64748B; margin-top: 4px; }
        .divider-accent { height: 2px; margin: 16px 0; background: linear-gradient(90deg, ${accentColor}66, transparent); print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .section-label { font-size: 7pt; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: ${accentColor}; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .section-label::after { content: ''; flex: 1; height: 1px; background: #E2E8F0; }
        .client-card { background: #F8FAFC; border-radius: 10px; border: 1px solid #E2E8F0; padding: 14px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 9.5pt; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .client-field { display: flex; gap: 5px; }
        .field-label  { font-weight: 700; color: #64748B; white-space: nowrap; }
        .field-value  { color: #1E293B; }
        .client-full  { grid-column: 1 / -1; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; }
        thead tr { background: #1E293B; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        thead th { padding: 9px 10px; color: #fff; font-size: 7.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; text-align: left; }
        tbody tr.row-even { background: #F8FAFC; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .totals-wrap { display: flex; justify-content: flex-end; margin-top: 8px; }
        .footer { margin-top: auto; padding-top: 16px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid #E2E8F0; font-size: 7.5pt; color: #94A3B8; }
        .footer-brand { font-weight: 700; color: #64748B; }
      </style>
    </head>
    <body>
      <div class="top-stripe"></div>
      <div class="page">
        <div class="header">
          <div class="logo-area">
            <div class="logo-box">3D</div>
            <div class="company-info-text" translate="no">
              <div class="company-title">Amaro & Mateu 3D</div>
              <div class="company-subtitle">Produtos em Impressão 3D</div>
              <div class="company-slogan">Funcionais, criativos e prontos para você!</div>
              <div class="company-details-row" style="white-space: nowrap;">
                📸 Instagram: <span>@aem3d_</span> | ✉️ E-mail: <span>amaroemateu3d@gmail.com</span>
              </div>
              <div class="company-contacts-row" style="white-space: nowrap;">
                <svg viewBox="0 0 24 24" width="11" height="11" style="fill: #25D366; vertical-align: middle; margin-right: 3px; display: inline-block;"><path d="M12.004 0C5.378 0 .004 5.374.004 12.004c0 2.115.548 4.183 1.588 6.006L.004 24l6.17-1.619c1.767.964 3.765 1.47 5.83 1.474h.005c6.626 0 12-5.374 12-12.004C24.009 5.374 18.63 0 12.004 0zm6.815 17.382c-.296.83-1.72 1.572-2.393 1.674-.46.069-.912.127-2.955-.674-2.613-1.023-4.298-3.687-4.43-3.86-.13-.173-1.077-1.43-1.077-2.729 0-1.3.676-1.939.917-2.204.24-.266.526-.333.7-.333h.498c.12 0 .28-.046.439.34.16.386.548 1.343.598 1.445.05.102.083.22.016.353-.067.133-.1.22-.2.339-.1.119-.21.266-.3.353-.1.102-.204.213-.087.414.117.2.52 1.83.82 2.102.302.27.564.385.803.486.24.1.385.053.53-.119.146-.173.628-.73 1.077-1.42.067-.102.133-.12.23-.083.1.037.628.297.747.353.12.057.2.087.23.137.03.05.03.287-.07.618z"/></svg> Cíntia: <span>19 9 8143-2080</span> | <svg viewBox="0 0 24 24" width="11" height="11" style="fill: #25D366; vertical-align: middle; margin-right: 3px; display: inline-block;"><path d="M12.004 0C5.378 0 .004 5.374.004 12.004c0 2.115.548 4.183 1.588 6.006L.004 24l6.17-1.619c1.767.964 3.765 1.47 5.83 1.474h.005c6.626 0 12-5.374 12-12.004C24.009 5.374 18.63 0 12.004 0zm6.815 17.382c-.296.83-1.72 1.572-2.393 1.674-.46.069-.912.127-2.955-.674-2.613-1.023-4.298-3.687-4.43-3.86-.13-.173-1.077-1.43-1.077-2.729 0-1.3.676-1.939.917-2.204.24-.266.526-.333.7-.333h.498c.12 0 .28-.046.439.34.16.386.548 1.343.598 1.445.05.102.083.22.016.353-.067.133-.1.22-.2.339-.1.119-.21.266-.3.353-.1.102-.204.213-.087.414.117.2.52 1.83.82 2.102.302.27.564.385.803.486.24.1.385.053.53-.119.146-.173.628-.73 1.077-1.42.067-.102.133-.12.23-.083.1.037.628.297.747.353.12.057.2.087.23.137.03.05.03.287-.07.618z"/></svg> Daniel: <span>19 9 9672-5045</span>
              </div>
            </div>
          </div>
          <div class="doc-badge-wrap">
            <div class="doc-badge">COMPROVANTE DE ACERTO</div>
            <div class="doc-num">#${Date.now().toString().slice(-6)}</div>
            <div class="doc-date">📅 ${dateStr}</div>
          </div>
        </div>
        <div class="divider-accent"></div>
        <div class="section-label">Dados do Cliente</div>
        <div class="client-card">
          <div class="client-field"><span class="field-label">Nome:</span><span class="field-value">${settlement.cliente.nome || '—'}</span></div>
          <div class="client-field"><span class="field-label">Telefone:</span><span class="field-value">${settlement.cliente.telefone || '—'}</span></div>
          <div class="client-field"><span class="field-label">E-mail:</span><span class="field-value">${settlement.cliente.email || '—'}</span></div>
          <div class="client-field client-full"><span class="field-label">Endereço:</span><span class="field-value">${settlement.cliente.endereco || '—'}</span></div>
        </div>
        <table style="width:100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="width:30px; text-align: center;">#</th>
              <th style="width:60px">ID</th>
              <th>Descrição</th>
              <th style="width:70px; text-align: center;">Qtd</th>
              <th style="width:90px; text-align: right;">Preço Unit.</th>
              <th style="width:105px; text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
        </table>
        <div class="totals-wrap">
          ${totalsHtml}
        </div>
        <div class="footer">
          <span class="footer-brand">AM3D — Impressão 3D Profissional</span>
          <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
        </div>
      </div>
      <script>window.onload = () => { window.print(); }<\/script>
    </body>
    </html>
    `;

    const win = window.open('', '_blank', 'width=960,height=780');
    win.document.write(printHtml);
    win.document.close();
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
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
        nomePeca: r.name
      }));

      const namesMap = {};
      cleanFts.forEach(f => {
        namesMap[f.indiceFt] = f.nomePeca;
      });
      cleanOrcs.forEach(o => {
        namesMap[o.indiceFt] = o.nomePeca;
      });

      setProductNames(namesMap);
    } catch (e) {
      console.error('Erro ao buscar dados:', e);
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

  // Aggregating open items
  const getOpenItems = (acc) => {
    if (!acc) return [];
    const aggregated = {};
    (acc.batches || []).forEach(batch => {
      (batch.items || []).forEach(it => {
        if (!aggregated[it.indiceFt]) {
          aggregated[it.indiceFt] = { ...it, totalQtd: 0, totalPago: 0, totalValue: 0 };
        }
        aggregated[it.indiceFt].totalQtd += parseN(it.qtd);
        aggregated[it.indiceFt].totalPago += parseN(it.qtdPago);
        aggregated[it.indiceFt].totalValue += parseN(it.qtd) * parseN(it.precoUnit);
      });
    });

    return Object.values(aggregated)
      .map(it => ({
        ...it,
        emAberto: it.totalQtd - it.totalPago
      }))
      .filter(it => it.emAberto > 0)
      .sort((a, b) => String(a.indiceFt).localeCompare(String(b.indiceFt), undefined, { numeric: true }));
  };

  const updateSaleQty = (ftId, maxQty, val) => {
    let num = val === '' ? '' : parseInt(val, 10);
    if (isNaN(num) || num < 0) num = 0;
    if (num > maxQty) num = maxQty;
    setSalesToRegister(prev => ({
      ...prev,
      [ftId]: num
    }));
  };

  const adjustSaleQty = (ftId, maxQty, delta) => {
    const current = salesToRegister[ftId] || 0;
    let next = current + delta;
    if (next < 0) next = 0;
    if (next > maxQty) next = maxQty;
    setSalesToRegister(prev => ({
      ...prev,
      [ftId]: next
    }));
  };

  const openItems = selectedAccount ? getOpenItems(selectedAccount) : [];

  // Calculate total amount to receive in this quick settlement
  const comissaoPct = selectedAccount?.cliente?.tipoAcerto === 'comissionado' ? parseN(selectedAccount?.cliente?.comissaoPct) : 0;
  const repasseRate = (100 - comissaoPct) / 100;

  const currentTotalReceipt = openItems.reduce((sum, it) => {
    const qty = salesToRegister[it.indiceFt] || 0;
    return sum + (qty * parseN(it.precoUnit));
  }, 0) * repasseRate;

  const handleSaveAcerto = async () => {
    const selectedVendas = Object.entries(salesToRegister).filter(([_, qty]) => qty > 0);
    if (selectedVendas.length === 0) {
      return alert("Por favor, preencha a quantidade vendida de pelo menos 1 item.");
    }

    if (!window.confirm(`💰 REGISTRAR ACERTO?\n\nConfirmar venda dos itens informados e o recebimento de R$ ${fmt(currentTotalReceipt)}?`)) {
      return;
    }

    setSaving(true);
    try {
      let totalAmount = 0;
      const paymentItemsRecord = [];
      const updatedBatches = JSON.parse(JSON.stringify(selectedAccount.batches || []));

      // Oldest batches first for FIFO allocation
      const sortedBatches = [...updatedBatches].sort((a, b) => new Date(a.date) - new Date(b.date));

      selectedVendas.forEach(([ftId, qtyToSettle]) => {
        let remaining = qtyToSettle;

        for (const batch of sortedBatches) {
          if (remaining <= 0) break;

          const item = (batch.items || []).find(it => it.indiceFt === ftId);
          if (item) {
            const qTotal = parseN(item.qtd);
            const qPago = parseN(item.qtdPago);
            const open = qTotal - qPago;

            if (open > 0) {
              const toAllocate = Math.min(open, remaining);
              item.qtdPago = qPago + toAllocate;
              remaining -= toAllocate;

              const netPrecoUnit = Number((parseN(item.precoUnit) * repasseRate).toFixed(2));

              paymentItemsRecord.push({
                batchId: batch.id,
                indiceFt: item.indiceFt,
                nomePeca: item.nomePeca,
                qtd: toAllocate,
                precoUnit: netPrecoUnit
              });

              totalAmount += toAllocate * netPrecoUnit;
            }
          }
        }
      });

      totalAmount = Number(totalAmount.toFixed(2));

      const paymentObj = {
        id: `P-${Date.now()}`,
        date: new Date().toISOString(),
        amount: totalAmount,
        obs: "Acerto operacional registrado em campo/celular",
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

      if (!resp.ok) throw new Error("Erro ao salvar dados no Supabase.");

      const rawGross = selectedVendas.reduce((sum, [ftId, qtyToSettle]) => {
        const item = openItems.find(it => it.indiceFt === ftId);
        return sum + (qtyToSettle * parseN(item?.precoUnit));
      }, 0);

      setReceiptData({
        cliente: selectedAccount.cliente,
        date: new Date().toLocaleDateString('pt-BR'),
        tipoAcerto: selectedAccount.cliente?.tipoAcerto,
        comissaoPct: selectedAccount.cliente?.comissaoPct,
        grossTotal: rawGross,
        netTotal: totalAmount,
        items: paymentItemsRecord
      });
      setShowReceiptModal(true);
      
      // Reset local values
      setSalesToRegister({});
      
      // Reload fresh selected account
      const freshAccResp = await fetch(`${SUPA_URL}/rest/v1/consignados?id=eq.${selectedAccount.id}&select=*`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
      });
      if (freshAccResp.ok) {
        const freshData = await freshAccResp.json();
        if (freshData && freshData[0]) {
          setSelectedAccount(freshData[0]);
          // Sync with the general list
          setAccounts(prev => prev.map(a => a.id === selectedAccount.id ? freshData[0] : a));
        }
      }
    } catch (e) {
      alert("Erro no registro: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredAccounts = accounts.filter(acc => {
    const nome = (acc.cliente?.nome || '').toLowerCase();
    const tel = (acc.cliente?.telefone || '').toLowerCase();
    const query = searchTerm.toLowerCase();
    return nome.includes(query) || tel.includes(query);
  });

  return (
    <div className="acertos-app-wrapper" translate="no">
      {/* HEADER SUPERIOR */}
      <header className="acertos-header">
        <div className="header-brand">
          <div className="logo-badge">3D</div>
          <div>
            <h1>AM3D Operacional</h1>
            <p>Olá, {profile?.nome || 'Operador'}</p>
          </div>
        </div>
        <button className="logout-circle-btn" onClick={signOut} title="Sair do Sistema">
          <LogOut size={18} />
        </button>
      </header>

      {loading && accounts.length === 0 ? (
        <div className="acertos-loading-state">
          <Loader size={36} className="spinner" />
          <p>Carregando dados da rota...</p>
        </div>
      ) : !selectedAccount ? (
        /* VISTA 1: LISTA DE CLIENTES */
        <main className="acertos-main">
          <div className="section-title-wrap">
            <h2>Escolha o Cliente para Acerto</h2>
            <button className="refresh-btn" onClick={fetchAccounts} title="Atualizar dados">
              <RefreshCw size={16} />
            </button>
          </div>

          <div className="search-bar-container">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Buscar cliente por nome ou telefone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {filteredAccounts.length === 0 ? (
            <div className="empty-route-card">
              <p>Nenhum cliente de consignado localizado.</p>
            </div>
          ) : (
            <div className="client-cards-grid">
              {filteredAccounts.map(acc => {
                const stats = calculateAccountStats(acc);
                return (
                  <div key={acc.id} className="client-touch-card" onClick={() => {
                    setSelectedAccount(acc);
                    setSalesToRegister({});
                  }}>
                    <div className="card-top">
                      <div className="client-avatar">
                        <User size={18} />
                      </div>
                      <div className="client-details">
                        <h3>{acc.cliente?.nome}</h3>
                        <p>{acc.cliente?.telefone || 'Sem telefone'}</p>
                        {acc.cliente?.tipoAcerto === 'comissionado' ? (
                          <span style={{ fontSize: '0.7rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.2)', display: 'inline-block', marginTop: '4px' }}>
                            Comissionado
                          </span>
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: '#34d399', background: 'rgba(52, 211, 153, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(52,211,153,0.2)', display: 'inline-block', marginTop: '4px' }}>
                            Integral
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      ) : (
        /* VISTA 2: DETALHES E FORMULÁRIO DE ACERTO */
        <main className="acertos-main">
          <button className="back-btn" onClick={() => setSelectedAccount(null)}>
            ← Voltar para a lista de clientes
          </button>

          {(() => {
            const stats = calculateAccountStats(selectedAccount);
            return (
              <div className="selected-client-hero">
                <div className="hero-info">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0 }}>{selectedAccount.cliente?.nome}</h2>
                    {selectedAccount.cliente?.tipoAcerto === 'comissionado' ? (
                      <span style={{ fontSize: '0.75rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.15)', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(245,158,11,0.3)', fontWeight: 'bold' }}>
                        Comissionado ({selectedAccount.cliente?.comissaoPct}%)
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.75rem', color: 'var(--acerto-success)', background: 'rgba(16, 185, 129, 0.15)', padding: '3px 8px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.3)', fontWeight: 'bold' }}>
                        Valor Integral
                      </span>
                    )}
                  </div>
                  <p style={{ marginTop: '4px' }}>📞 {selectedAccount.cliente?.telefone || 'Sem telefone'}</p>
                  {selectedAccount.cliente?.obs && (
                    <div className="client-obs-badge">
                      <strong>Obs:</strong> {selectedAccount.cliente.obs}
                    </div>
                  )}
                </div>
                <div className="hero-balance-box">
                  <span className="box-lbl">Saldo de Consignados</span>
                  <span className="box-val">R$ {fmt(stats.balance)}</span>
                </div>
              </div>
            );
          })()}

          <div className="items-section-header">
            <h3>Peças em Aberto com o Cliente</h3>
            <span className="items-count-badge">{openItems.length} tipos de peça</span>
          </div>

          {openItems.length === 0 ? (
            <div className="all-settled-card">
              <CheckCircle2 size={48} className="success-icon" />
              <h3>Tudo em dia! 🎉</h3>
              <p>Este cliente não possui nenhuma peça pendente de acerto no momento.</p>
            </div>
          ) : (
            <div className="acerto-items-list">
              {openItems.map(it => {
                const selectedQty = salesToRegister[it.indiceFt] || 0;
                const subtotal = selectedQty * parseN(it.precoUnit);
                const displayNome = it.nomePeca || productNames[it.indiceFt] || 'Sem Nome';
                return (
                  <div key={it.indiceFt} className={`acerto-item-row ${selectedQty > 0 ? 'active' : ''}`}>
                    <div className="item-meta">
                      <div className="item-title">
                        <span className="item-ft-badge">{it.indiceFt}</span>
                        <h4>{displayNome}</h4>
                      </div>
                      <div className="item-summary-row">
                        <span>Enviados: <strong>{it.totalQtd}</strong></span>
                        <span>Pagos: <strong className="green-txt">{it.totalPago}</strong></span>
                        <span>Em Aberto: <strong className="red-txt">{it.emAberto}</strong></span>
                      </div>
                      <div className="price-tag-row">
                        <span>Preço de Venda: <strong>R$ {fmt(it.precoUnit)}</strong></span>
                      </div>
                    </div>

                      <div className="item-action-controls">
                        {/* Nome visível próximo à quantidade para celular */}
                        <div style={{ fontSize: '0.85rem', color: 'var(--acerto-primary)', fontWeight: '600', marginBottom: '0.25rem', textAlign: 'right', display: 'flex', gap: '4px', justifyContent: 'flex-end', width: '100%' }}>
                          <span>{it.indiceFt} -</span>
                          <span style={{color: 'var(--acerto-text-primary)'}}>{displayNome}</span>
                        </div>
                        <div className="touch-qty-selector">
                          <button 
                            className="qty-btn minus" 
                            onClick={() => adjustSaleQty(it.indiceFt, it.emAberto, -1)}
                            disabled={selectedQty <= 0}
                          >
                            -
                          </button>
                          <input
                            type="number"
                            value={salesToRegister[it.indiceFt] ?? ''}
                            placeholder="0"
                            min="0"
                            max={it.emAberto}
                            onChange={(e) => updateSaleQty(it.indiceFt, it.emAberto, e.target.value)}
                          />
                          <button 
                            className="qty-btn plus" 
                            onClick={() => adjustSaleQty(it.indiceFt, it.emAberto, 1)}
                            disabled={selectedQty >= it.emAberto}
                          >
                            +
                          </button>
                        </div>
                      {selectedQty > 0 && (
                        <div className="item-subtotal-tag">
                          + R$ {fmt(subtotal)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* BARRA DE AÇÃO FLUTUANTE / RODAPÉ */}
          {currentTotalReceipt > 0 && (
            <div className="acerto-checkout-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.6rem' }}>
              {selectedAccount.cliente?.tipoAcerto === 'comissionado' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.4rem', color: 'var(--acerto-text-muted)' }}>
                  <span>Venda Bruta: R$ {fmt(openItems.reduce((sum, it) => sum + ((salesToRegister[it.indiceFt] || 0) * parseN(it.precoUnit)), 0))}</span>
                  <span>Comissão ({comissaoPct}%): - R$ {fmt(openItems.reduce((sum, it) => sum + ((salesToRegister[it.indiceFt] || 0) * parseN(it.precoUnit)), 0) * (comissaoPct / 100))}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div className="checkout-info">
                  <span>{selectedAccount.cliente?.tipoAcerto === 'comissionado' ? 'Valor com Desconto de Comissão' : 'Total a Receber'}</span>
                  <h3>R$ {fmt(currentTotalReceipt)}</h3>
                </div>
                <button className="confirm-acerto-btn" onClick={handleSaveAcerto} disabled={saving}>
                  {saving ? 'Registrando...' : '💰 Confirmar Acerto'}
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      {showReceiptModal && receiptData && (
        <div className="receipt-modal-overlay">
          <div className="receipt-modal-card" translate="no">
            <div className="receipt-modal-header">
              <div className="receipt-success-badge">✓</div>
              <h2>Acerto Confirmado!</h2>
              <p>Recebimento registrado com sucesso.</p>
            </div>
            <div className="receipt-modal-body">
              <div className="receipt-details-paper">
                <div className="receipt-client-info">
                  <strong>Cliente:</strong> {receiptData.cliente?.nome}<br/>
                  {receiptData.cliente?.telefone && <><strong>Tel:</strong> {receiptData.cliente.telefone}<br/></>}
                  <strong>Data:</strong> {receiptData.date}
                </div>
                <div className="receipt-items-list">
                  {receiptData.items.map((it, i) => (
                    <div key={i} className="receipt-item-line">
                      <span className="receipt-item-name">{it.qtd}x {it.nomePeca}</span>
                      <span>R$ {fmt(it.qtd * it.precoUnit)}</span>
                    </div>
                  ))}
                </div>
                <div className="receipt-financial-summary">
                  <div className="receipt-summary-line">
                    <span>Venda Bruta:</span>
                    <span>R$ {fmt(receiptData.grossTotal)}</span>
                  </div>
                  {receiptData.tipoAcerto === 'comissionado' && (
                    <div className="receipt-summary-line">
                      <span>Comissão (-{receiptData.comissaoPct}%):</span>
                      <span>- R$ {fmt(receiptData.grossTotal * (parseN(receiptData.comissaoPct) / 100))}</span>
                    </div>
                  )}
                  <div className="receipt-summary-line bold">
                    <span>{receiptData.tipoAcerto === 'comissionado' ? 'Valor Líquido:' : 'Valor Recebido:'}</span>
                    <span>R$ {fmt(receiptData.netTotal)}</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="receipt-modal-actions">
              <button className="action-btn-whatsapp" onClick={() => shareWhatsApp(receiptData)}>
                💬 Compartilhar Comprovante
              </button>
              <button className="action-btn-pdf" onClick={() => printLastSettlement(receiptData)}>
                📄 Imprimir / Salvar PDF
              </button>
              <button className="action-btn-close" onClick={() => {
                setShowReceiptModal(false);
                setReceiptData(null);
              }}>
                ✕ Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
