import { useState, useEffect, useCallback, useMemo } from 'react';
import { getUnitProductionTime, formatTime } from '../utils/financeCalculators';
import { supabase } from '../supabaseClient';
import { Loader, Edit2, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './Pedidos.css';
import ConfirmModal from '../components/ConfirmModal';
import FtInputs from '../components/fichas/FtInputs';
import FtResults from '../components/fichas/FtResults';
import { getResultados } from '../utils/financeCalculators';

const INITIAL_FT_STATE = {
  indiceFt: '',
  nomePeca: 'Novo Produto Customizado',
  quantidade: 1,
  pesoGramas: 50,
  tempoImpressao: '01:30', 
  precoKgMaterial: 120, 
  custoKwh: 0.95, 
  custoDepreciacao: 0.50,
  extraNome1: '', extraValor1: '',
  extraNome2: '', extraValor2: '',
  extraNome3: '', extraValor3: '',
  medidaSemCaixa: '',
  pesoSemCaixa: '',
  medidaComCaixa: '',
  pesoComCaixa: '',
};

// Subcomponent: Custom Product Modal
function CustomQuoteProductModal({ onClose, onSave, fts = [], currentItens = [], initialData = null, editUid = null }) {
  const nextId = useMemo(() => {
    if (initialData?.indiceFt) return initialData.indiceFt;
    const list1 = fts.map(f => f.indiceFt);
    const list2 = currentItens.map(f => f.indiceFt);
    const all = [...list1, ...list2];
    const cftNumbers = all
      .filter(id => id && id.startsWith('CFT-'))
      .map(id => parseInt(id.replace('CFT-', ''), 10))
      .filter(n => !isNaN(n));
      
    const max = cftNumbers.length > 0 ? Math.max(...cftNumbers) : 0;
    return `CFT-${String(max + 1).padStart(2, '0')}`;
  }, [fts, currentItens, initialData]);

  const [inputs, setInputs] = useState(initialData || { ...INITIAL_FT_STATE, indiceFt: nextId });

  const handleChange = (e) => {
    let { name, value } = e.target;
    if (typeof value === 'string' && (name.startsWith('preco') || name.startsWith('custo') || name.startsWith('peso') || name.startsWith('extraValor'))) {
      value = value.replace(',', '.');
    }
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    if (!inputs.nomePeca) return alert("O Nome da peça não pode estar vazio.");
    onSave(inputs, editUid);
  };

  const results = getResultados(inputs);

  return (
    <div className="modal-overlay" style={{ zIndex: 9999 }}>
      <div className="modal-content" style={{ maxWidth: '1000px', width: '95%' }}>
        <div className="modal-header">
          <h2>Novo Produto Customizado (CFT)</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <p style={{marginBottom: '1rem', color: 'var(--text-muted)'}}>
            Os itens criados aqui serão salvos com custo unitário e preço ajustável, sem poluir suas Fichas Técnicas (prefixo CFT).
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <FtInputs 
                inputs={inputs} 
                onChange={handleChange} 
                savedFts={[]}
                onManageInsumos={() => {}}
                onSelectInsumoClick={() => {}}
                isCustomProduct={true}
              />
            </div>
            <div>
              <FtResults inputs={inputs} results={results} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>Salvar CFT</button>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) => Number(n || 0).toFixed(2);
const parseN = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return v;
  const clean = String(v).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
};


const BLANK_CLIENTE = {
  nome: '',
  telefone: '',
  email: '',
  endereco: '',
  obs: '',
  temDesconto: false,
  descontoPercent: '',
};

const formatId = (id, tipo) => {
  if (typeof id === 'string' && (id.startsWith('P-') || id.startsWith('C-'))) return id;
  const prefix = tipo === 'consignado' ? 'C' : 'P';
  return `${prefix}-${String(id).padStart(3, '0')}`;
};

// ─── Geração de impressão via nova janela ─────────────────────────────────────
const openPrintWindow = (pedido, tenant = {}) => {
  const subtotal = pedido.itens.reduce((s, it) => s + parseN(it.precoUnit) * parseN(it.qtd), 0);
  const temDesconto = Boolean(pedido.cliente?.temDesconto);
  const percDesconto = temDesconto ? Math.min(100, Math.max(0, parseN(pedido.cliente?.descontoPercent))) : 0;
  const valorDesconto = temDesconto && percDesconto > 0 ? (subtotal * percDesconto) / 100 : 0;
  const total = Math.max(0, subtotal - valorDesconto);
  const isConsignado = pedido.tipo === 'consignado';
  const label = isConsignado ? 'CONSIGNADO' : 'PEDIDO DE VENDA';
  const dateStr = new Date(pedido.createdAt).toLocaleDateString('pt-BR');
  const accentColor = isConsignado ? '#475569' : '#7C3AED';
  const accentBg    = isConsignado ? '#F1F5F9' : '#EDE9FE';

  const itensRows = pedido.itens.map((it, i) => `
    <tr class="${i % 2 === 0 ? 'row-even' : ''}">
      <td class="cell-center text-muted">${i + 1}</td>
      <td class="cell-id">${it.indiceFt}</td>
      <td class="cell-name">${it.nomePeca}</td>
      <td class="cell-right text-muted">R$ ${fmt(it.precoUnit)}</td>
      <td class="cell-center cell-bold">${it.qtd}</td>
      <td class="cell-right cell-bold">R$ ${fmt(parseN(it.precoUnit) * parseN(it.qtd))}</td>
    </tr>
  `).join('');

  const logoHtml = tenant.logo_url 
    ? `<img class="logo-img" src="${tenant.logo_url}" alt="Logo" onerror="this.style.display='none'; document.getElementById('lf').style.display='flex';"/>`
    : `<img class="logo-img" src="${window.location.origin}/logo.png" alt="Logo" onerror="this.style.display='none'; document.getElementById('lf').style.display='flex';"/>`;

  const detailsHtml = `
    ${tenant.email ? `✉️ E-mail: <span>${tenant.email}</span>` : ''}
    ${tenant.telefone ? ` | 📞 Tel: <span>${tenant.telefone}</span>` : ''}
  `;

  const signatureName = tenant.name || 'AM3D';
  const assinaturaBlock = isConsignado ? `
    <div class="sign-section">
      <div class="sign-banner">
        <span class="sign-icon">🤝</span>
        <p>Declaro ter recebido os itens listados em regime de <strong>CONSIGNADO</strong>, comprometendo-me a devolver os produtos não vendidos ou efetuar o pagamento no prazo acordado.</p>
      </div>
      <div class="sign-grid">
        <div class="sign-block">
          <div class="sign-line"></div>
          <p class="sign-label">Assinatura do Cliente</p>
          <p class="sign-name">${pedido.cliente.nome || '________________________________'}</p>
        </div>
        <div class="sign-block">
          <div class="sign-line"></div>
          <p class="sign-label">Responsável ${signatureName}</p>
          <p class="sign-name">Data: _______ / _______ / _________</p>
        </div>
      </div>
    </div>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${label} ${formatId(pedido.id, pedido.tipo)} — ${tenant.name || 'AM3D'}</title>
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
    .tipo-tag.pedido    { background: #EDE9FE; color: #7C3AED; }
    .tipo-tag.consignado { background: #D1FAE5; color: #059669; }

    .status-badge { transition: all 0.2s; }
    .status-badge.paid    { background: #D1FAE5; color: #059669; }
    .status-badge.pending { background: #FEF3C7; color: #D97706; }
    .status-badge:hover   { filter: brightness(0.95); transform: scale(1.02); }

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

    .cell-id { font-weight: 700; color: #1E293B; font-size: 9.5pt; }

    /* ─ Total ─ */
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 8px; }
    .total-box {
      background: ${accentBg}; border-radius: 10px; padding: 13px 22px;
      text-align: right; min-width: 220px;
      print-color-adjust: exact; -webkit-print-color-adjust: exact;
    }
    .total-label { font-size: 7.5pt; font-weight: 700; color: ${accentColor}; text-transform: uppercase; letter-spacing: 1px; }
    .total-value { font-family: 'Outfit',sans-serif; font-size: 20pt; font-weight: 900; color: ${accentColor}; margin-top: 2px; }

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

    <!-- HEADER -->
    <div class="header">
      <div class="logo-area">
        ${logoHtml}
        <div id="lf" class="logo-fallback">
          <div class="logo-box">3D</div>
          <div>
            <div class="company-name">${tenant.name || 'AM3D'}</div>
            <div class="company-sub">${tenant.custom_header || 'Impressão 3D Profissional'}</div>
          </div>
        </div>
        ${tenant.name ? `
        <div class="company-info-text" translate="no" style="display: flex; flex-direction: column; gap: 2px; font-size: 8pt; color: #475569; line-height: 1.3; text-align: left; margin-left: 10px;">
          <div class="company-title" style="font-family: 'Outfit', sans-serif; font-size: 14pt; font-weight: 900; color: #1e293b; line-height: 1.1;">${tenant.name}</div>
          <div class="company-subtitle" style="font-weight: 700; color: #64748b; font-size: 8.5pt;">${tenant.custom_header || 'Impressão 3D'}</div>
          ${tenant.documento ? `<div style="font-size: 7.5pt; color: #94a3b8;">CNPJ/CPF: ${tenant.documento}</div>` : ''}
          ${tenant.endereco ? `<div style="font-size: 7.5pt; color: #64748b;">📍 Endereço: <span>${tenant.endereco}</span></div>` : ''}
          ${tenant.email || tenant.telefone ? `<div style="font-size: 7.5pt; color: #64748b;">${detailsHtml}</div>` : ''}
        </div>
        ` : `
        <div style="margin-left: 10px;">
          <div class="company-name">AM3D</div>
          <div class="company-sub">Impressão 3D Profissional</div>
        </div>
        `}
      </div>
      <div class="doc-badge-wrap">
        <div class="doc-badge">${label}</div>
        <div class="doc-num">${formatId(pedido.id, pedido.tipo)}</div>
        <div class="doc-date">📅 ${dateStr}</div>
      </div>
    </div>

    <div class="divider-accent"></div>

    <!-- CLIENTE -->
    <div class="section-label">Dados do Cliente</div>
    <div class="client-card">
      <div class="client-field"><span class="field-label">Nome:</span><span class="field-value">${pedido.cliente.nome || '—'}</span></div>
      <div class="client-field"><span class="field-label">Telefone:</span><span class="field-value">${pedido.cliente.telefone || '—'}</span></div>
      <div class="client-field"><span class="field-label">E-mail:</span><span class="field-value">${pedido.cliente.email || '—'}</span></div>
      <div class="client-field client-full"><span class="field-label">Endereço:</span><span class="field-value">${pedido.cliente.endereco || '—'}</span></div>
    </div>

    ${pedido.cliente.obs ? `
    <div class="divider"></div>
    <div class="section-label">Observações</div>
    <div class="obs-box">${pedido.cliente.obs}</div>
    ` : ''}

    <div class="divider"></div>

    <!-- ITENS -->
    <div class="section-label">Itens do Pedido</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th style="width:60px">ID</th>
          <th>Descrição</th>
          <th style="width:90px;text-align:right">Preço Unit.</th>
          <th style="width:50px;text-align:center">Qtd</th>
          <th style="width:105px;text-align:right">Subtotal</th>
        </tr>
      </thead>
      <tbody>${itensRows}</tbody>
    </table>

    <!-- TOTAL -->
    <div class="totals-wrap">
      <div class="total-box">
        ${temDesconto && percDesconto > 0 ? `
          <div style="display:flex;justify-content:space-between;gap:20px;font-size:8.5pt;color:#475569;margin-bottom:4px;">
            <span>Subtotal dos Itens:</span>
            <strong>R$ ${fmt(subtotal)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;gap:20px;font-size:8.5pt;color:#DC2626;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(0,0,0,0.1);">
            <span>Desconto (${percDesconto}%):</span>
            <strong>- R$ ${fmt(valorDesconto)}</strong>
          </div>
        ` : ''}
        <div class="total-label">Total Geral</div>
        <div class="total-value">R$ ${fmt(total)}</div>
      </div>
    </div>

    ${assinaturaBlock}

    <!-- FOOTER -->
    <div class="footer">
      <span class="footer-brand">${tenant.name || 'AM3D'} — Impressão 3D Profissional</span>
      <span>Gerado em ${new Date().toLocaleString('pt-BR')}</span>
    </div>
  </div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=780');
  win.document.write(html);
  win.document.close();
};

// ─── Modal Novo/Editar Pedido (Fullscreen) ───────────────────────────────────
function ModalPedido({ fts, onSave, onCancel, initialData }) {
  const [cliente, setCliente] = useState(() =>
    initialData?.cliente ? { ...BLANK_CLIENTE, ...initialData.cliente } : BLANK_CLIENTE
  );
  const [markup, setMarkup] = useState('3');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [editingCft, setEditingCft] = useState(null);

  // Lista apenas com os itens EFETIVAMENTE adicionados ao pedido (não lista todas as FTs)
  const [itens, setItens] = useState(() => {
    const finalItems = [];
    if (initialData?.itens && Array.isArray(initialData.itens)) {
      initialData.itens.forEach(savedItem => {
        if (parseN(savedItem.qtd) <= 0) return;
        const originalFt = Array.isArray(fts) ? fts.find(f => f.indiceFt === savedItem.indiceFt) : null;
        const rawOrc = savedItem._rawOrcData || (originalFt ? originalFt._rawOrcData : null);
        const calcRes = rawOrc ? getResultados(rawOrc) : (originalFt ? getResultados(originalFt) : null);
        const realCusto = parseN(savedItem.custoBase) > 0
          ? parseN(savedItem.custoBase)
          : (parseN(originalFt?._custoFinal) > 0 ? parseN(originalFt._custoFinal) : (calcRes?.custoFisicoUnit || 0));
        finalItems.push({
          _uid: Math.random().toString(36).substring(2, 9),
          indiceFt: savedItem.indiceFt,
          nomePeca: savedItem.nomePeca || 'Item Excluído',
          custoBase: realCusto,
          precoUnit: savedItem.precoUnit || 0,
          qtd: savedItem.qtd || 1,
          isOrcamento: Boolean(savedItem.isOrcamento),
          _rawOrcData: rawOrc,
          _isSaved: true
        });
      });
    }
    return finalItems;
  });

  // Resultados do campo de busca para adicionar FTs / Customizados ao pedido
  const searchResults = useMemo(() => {
    const term = (searchTerm || '').trim().toLowerCase();
    if (!term || !Array.isArray(fts)) return [];
    return fts
      .filter(ft =>
        (ft.nomePeca || '').toLowerCase().includes(term) ||
        String(ft.indiceFt || '').toLowerCase().includes(term)
      )
      .slice(0, 20);
  }, [fts, searchTerm]);

  const handleAddFtFromSearch = (ft) => {
    const existingIdx = itens.findIndex(it => it.indiceFt === ft.indiceFt);
    if (existingIdx >= 0) {
      setItens(prev => {
        const next = [...prev];
        next[existingIdx] = {
          ...next[existingIdx],
          qtd: parseN(next[existingIdx].qtd) + 1
        };
        return next;
      });
    } else {
      const m = parseN(markup) > 0 ? parseN(markup) : 3;
      const calcRes = ft._rawOrcData ? getResultados(ft._rawOrcData) : getResultados(ft);
      const realCusto = parseN(ft._custoFinal) > 0 ? parseN(ft._custoFinal) : (calcRes?.custoFisicoUnit || 0);
      const defaultPreco = realCusto > 0
        ? (realCusto * m).toFixed(2)
        : (ft.precoSugerido ? Number(ft.precoSugerido).toFixed(2) : '0.00');
      setItens(prev => [
        ...prev,
        {
          _uid: Math.random().toString(36).substring(2, 9),
          indiceFt: ft.indiceFt,
          nomePeca: ft.nomePeca || 'Sem Nome',
          custoBase: realCusto,
          precoUnit: defaultPreco,
          margemRaw: realCusto > 0 ? m.toFixed(2) : undefined,
          qtd: 1,
          isOrcamento: Boolean(ft.isOrcamento),
          _rawOrcData: ft._rawOrcData || null
        }
      ]);
    }
    setSearchTerm('');
    setIsSearchFocused(false);
  };

  const handleRemoveOrderItem = (uid) => {
    setItens(prev => prev.filter(row => row._uid !== uid));
  };

  const handleDeleteCft = async (it) => {
    if (!window.confirm(`Deseja realmente excluir o customizado "${it.nomePeca}" permanentemente do sistema?`)) return;

    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      // Remove do banco de dados (tabela orcamentos_rapidos)
      await fetch(`${SUPA_URL}/rest/v1/orcamentos_rapidos?id=eq.${it.indiceFt}`, {
        method: 'DELETE',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`
        }
      });
      
      // Remove da tabela na tela atual
      setItens(prev => prev.filter(row => row._uid !== it._uid));
    } catch (err) {
      alert("Erro ao excluir produto customizado.");
    }
  };

  const handleSaveCustomProduct = async (customInputs, editUid = null) => {
    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    const dbRecord = {
      id: customInputs.indiceFt,
      name: customInputs.nomePeca,
      data: customInputs
    };

    try {
      await fetch(`${SUPA_URL}/rest/v1/orcamentos_rapidos`, {
        method: 'POST',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(dbRecord)
      });
      
      const results = getResultados(customInputs);
      const custoReal = results.custoFisicoUnit || 0;
      const m = parseN(markup) > 0 ? parseN(markup) : 3;
      const precoFinal = parseN(customInputs.precoVendaManual) || results.precoPraticado || (custoReal * m) || 0;
      const margemInicial = custoReal > 0 ? (precoFinal / custoReal).toFixed(2) : m.toFixed(2);
      
      if (editUid) {
        setItens(prev => prev.map(it => {
          if (it._uid !== editUid) return it;
          const mAtual = parseN(it.margemRaw) > 0 ? parseN(it.margemRaw) : parseFloat(margemInicial) || m;
          const novoPreco = parseN(customInputs.precoVendaManual) > 0
            ? parseN(customInputs.precoVendaManual)
            : (custoReal * mAtual);
          return {
            ...it,
            nomePeca: customInputs.nomePeca,
            custoBase: custoReal,
            precoUnit: novoPreco.toFixed(2),
            margemRaw: custoReal > 0 ? (novoPreco / custoReal).toFixed(2) : it.margemRaw,
            _rawOrcData: customInputs
          };
        }));
      } else {
        setItens(prev => [...prev, {
          _uid: Math.random().toString(36).substring(2, 9),
          indiceFt: customInputs.indiceFt,
          nomePeca: customInputs.nomePeca,
          custoBase: custoReal,
          precoUnit: precoFinal.toFixed(2),
          margemRaw: margemInicial,
          qtd: 1,
          isOrcamento: true,
          _rawOrcData: customInputs
        }]);
      }
      
      setShowCustomModal(false);
      setEditingCft(null);
    } catch (err) {
      alert("Erro ao salvar produto customizado.");
    }
  };

  const applyMarkup = () => {
    const m = parseN(markup);
    if (m <= 0) return;
    setItens(prev => prev.map(it => {
      const ftOriginal = Array.isArray(fts) ? fts.find(f => f.indiceFt === it.indiceFt) : null;
      const orcData = it._rawOrcData || (ftOriginal ? ftOriginal._rawOrcData : null);
      const timeSource = orcData || ftOriginal;
      const c = parseN(it.custoBase) > 0
        ? parseN(it.custoBase)
        : (parseN(ftOriginal?._custoFinal) > 0
          ? parseN(ftOriginal._custoFinal)
          : (timeSource ? (getResultados(timeSource)?.custoFisicoUnit || 0) : 0));
      return {
        ...it,
        custoBase: c,
        precoUnit: (c * m).toFixed(2),
        margemRaw: m.toFixed(2)
      };
    }));
  };

  const handleClienteChange = (e) => setCliente(p => ({ ...p, [e.target.name]: e.target.value }));

  const handleDescontoPercentChange = (rawVal) => {
    const num = parseN(rawVal);
    setCliente(p => ({
      ...p,
      temDesconto: num > 0,
      descontoPercent: rawVal
    }));
  };

  const updateItem = (idx, field, value) =>
    setItens(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });

  const itensSelected = itens.filter(it => parseN(it.qtd) > 0);
  const totalQtdPecas = itensSelected.reduce((s, it) => s + parseN(it.qtd), 0);

  const totalBruto = itensSelected.reduce((s, it) => s + (parseN(it.precoUnit) * parseN(it.qtd)), 0);
  const percDesconto = Math.min(100, Math.max(0, parseN(cliente.descontoPercent)));
  const temDesconto = percDesconto > 0;
  const fatorDesconto = 1 - percDesconto / 100;
  const valorDesconto = temDesconto ? (totalBruto * percDesconto) / 100 : 0;
  const totalVenda = Math.max(0, totalBruto - valorDesconto);
  const totalCusto = itensSelected.reduce((s, it) => s + (parseN(it.custoBase) * parseN(it.qtd)), 0);
  const totalLucro = totalVenda - totalCusto;
  const margemPerc = totalVenda > 0 ? (totalLucro / totalVenda) * 100 : 0;

  const totalTime = itensSelected.reduce((acc, it) => {
    const baseFt = Array.isArray(fts) ? fts.find(f => f.indiceFt === it.indiceFt) : null;
    const orcData = it._rawOrcData || (baseFt ? baseFt._rawOrcData : null);
    const timeSource = orcData || baseFt;
    if (!timeSource) return acc;
    return acc + (getUnitProductionTime(timeSource) * parseN(it.qtd));
  }, 0);

  const handleSave = () => {
    if (!cliente.nome.trim()) { alert('Informe o nome do cliente.'); return; }
    if (itensSelected.length === 0) { alert('Adicione pelo menos 1 item com quantidade > 0.'); return; }
    onSave({
      id: initialData?.id,
      cliente: {
        ...cliente,
        temDesconto: percDesconto > 0,
        descontoPercent: percDesconto > 0 ? String(cliente.descontoPercent) : ''
      },
      itens: itensSelected
    });
  };

  return (
    <div className="modal-fullscreen">
      {/* ── Header fixo ── */}
      <div className="modal-topbar">
        <div className="modal-topbar-left">
          <button className="btn-outline btn-sm" onClick={onCancel}>✕ Fechar</button>
          <div>
            <h2 className="modal-title">{initialData?.id ? 'Editar Documento' : 'Novo Documento'}</h2>
            <p className="modal-sub">Preencha os dados do cliente e busque os produtos para adicionar ao pedido</p>
          </div>
        </div>
        <div className="modal-topbar-right">
          <button className="btn-primary" onClick={handleSave}>💾 Salvar Pedido</button>
        </div>
      </div>

      {/* ── Corpo com scroll ── */}
      <div className="modal-scroll-body">
        <div className="modal-content-grid" style={{ maxWidth: '100%' }}>

          {/* ── Seção 1: Dados do Cliente (Largura Total) ── */}
          <section className="modal-section card span-full">
            <h3 className="section-heading">
              <span className="section-num">1</span> Dados do Cliente
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem 1.1rem' }}>
              <div className="form-group">
                <label htmlFor="nome">Nome / Razão Social *</label>
                <input id="nome" name="nome" value={cliente.nome} onChange={handleClienteChange} placeholder="Nome completo ou empresa" />
              </div>
              <div className="form-group">
                <label htmlFor="telefone">Telefone / WhatsApp</label>
                <input id="telefone" name="telefone" value={cliente.telefone} onChange={handleClienteChange} placeholder="(XX) XXXXX-XXXX" />
              </div>
              <div className="form-group">
                <label htmlFor="email">E-mail</label>
                <input id="email" name="email" value={cliente.email} onChange={handleClienteChange} placeholder="email@exemplo.com" />
              </div>
              <div className="form-group">
                <label htmlFor="endereco">Endereço de Entrega</label>
                <input id="endereco" name="endereco" value={cliente.endereco} onChange={handleClienteChange} placeholder="Rua, nº, bairro, cidade" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label htmlFor="obs">Observações</label>
                <textarea id="obs" name="obs" value={cliente.obs} onChange={handleClienteChange} rows={2} placeholder="Prazo, condições de pagamento, etc." />
              </div>
            </div>
          </section>

          {/* ── Seção 2: Tabela de Itens Adicionados ── */}
          <section className="modal-section card span-full">
            <div
              className="section-header-flex"
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'center',
                marginBottom: '1rem',
                flexWrap: 'wrap',
                gap: '1rem'
              }}
            >
              <h3 className="section-heading" style={{ marginBottom: 0, borderBottom: 'none', paddingBottom: 0, whiteSpace: 'nowrap' }}>
                <span className="section-num">2</span> Itens do Pedido ({itens.length})
              </h3>

              {/* Busca de Produtos logo após Itens do Pedido com o dobro da largura */}
              <div className="search-box-wrap" style={{ position: 'relative', flex: '1 1 600px', maxWidth: '880px' }}>
                  <input
                    type="text"
                    placeholder="🔍 Buscar FT ou produto por nome ou ID para adicionar..."
                    value={searchTerm}
                    onFocus={() => setIsSearchFocused(true)}
                    onBlur={() => setTimeout(() => setIsSearchFocused(false), 180)}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setIsSearchFocused(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchResults.length > 0) {
                        e.preventDefault();
                        handleAddFtFromSearch(searchResults[0]);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '0.62rem 1rem',
                      borderRadius: '8px',
                      border: '1.5px solid var(--accent-primary)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontWeight: 600
                    }}
                  />

                  {isSearchFocused && searchTerm.trim() !== '' && (
                    <div className="search-results-dropdown">
                      {searchResults.length === 0 ? (
                        <div style={{ padding: '0.85rem 1rem', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>
                          Nenhum produto encontrado para &ldquo;{searchTerm}&rdquo;.
                        </div>
                      ) : (
                        searchResults.map((ft) => {
                          const jaNoPedido = itens.find(i => i.indiceFt === ft.indiceFt);
                          const m = parseN(markup) > 0 ? parseN(markup) : 3;
                          const sugPreco = ft.isOrcamento
                            ? (ft.precoSugerido || 0)
                            : (parseN(ft._custoFinal) || 0) * m;
                          return (
                            <div
                              key={ft.indiceFt}
                              className="search-result-item"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleAddFtFromSearch(ft);
                              }}
                            >
                              <span
                                className="sr-id"
                                style={ft.isOrcamento ? { background: '#FEF3C7', color: '#D97706' } : {}}
                              >
                                {ft.indiceFt}
                              </span>
                              <div className="sr-name">
                                <div style={{ fontWeight: 700 }}>{ft.nomePeca}</div>
                                <div style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                                  Custo: R$ {fmt(ft._custoFinal || 0)} • Sugerido: R$ {fmt(sugPreco)}
                                  {jaNoPedido ? ` • Já no pedido (${jaNoPedido.qtd} un.)` : ''}
                                </div>
                              </div>
                              <button type="button" className="btn-add-item">
                                {jaNoPedido ? '+1 un.' : '+ Adicionar'}
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={() => {
                    setEditingCft(null);
                    setShowCustomModal(true);
                  }}
                  style={{
                    padding: '0.62rem 1.05rem',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #7C3AED, #2563EB)',
                    fontWeight: 700,
                    flexShrink: 0
                  }}
                >
                  + Novo Produto Customizado
                </button>
            </div>

            {itens.length === 0 ? (
              <div
                style={{
                  padding: '2.5rem 1.5rem',
                  textAlign: 'center',
                  background: 'var(--bg-primary)',
                  border: '1.5px dashed var(--border-color)',
                  borderRadius: '12px',
                  color: 'var(--text-secondary)'
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.4rem' }}>🛒</div>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '4px' }}>
                  Nenhum item adicionado a este pedido ainda
                </strong>
                <span style={{ fontSize: '0.85rem' }}>
                  Use o campo <strong>&ldquo;🔍 Buscar FT ou produto...&rdquo;</strong> acima ou clique em <strong>&ldquo;+ Novo Produto Customizado&rdquo;</strong> para incluir itens na lista.
                </span>
              </div>
            ) : (
              <div className="items-table-wrap" style={{ maxHeight: '56vh', overflowY: 'auto' }}>
                <table className="items-table">
                  <thead style={{ position: 'sticky', top: 0, zIndex: 4 }}>
                    <tr>
                      <th style={{ width: '75px' }}>ID</th>
                      <th>Nome do Produto</th>
                      <th style={{ width: '105px', textAlign: 'right' }}>Custo Prod.</th>
                      <th style={{ width: '95px', textAlign: 'center' }}>Tempo Unit.</th>
                      <th style={{ width: '95px', textAlign: 'center' }}>Margem (x)</th>
                      <th style={{ width: '120px', textAlign: 'right' }}>Preço Unit. (R$)</th>
                      <th style={{ width: '80px', textAlign: 'center' }}>Qtd</th>
                      <th style={{ width: '120px', textAlign: 'right' }}>Subtotal</th>
                      <th style={{ width: '125px', textAlign: 'right', color: '#7C3AED' }}>
                        Unit. c/ Desc.
                      </th>
                      <th style={{ width: '130px', textAlign: 'right', color: '#7C3AED' }}>
                        Subtotal c/ Desc.
                      </th>
                      <th style={{ width: '110px', textAlign: 'right', color: '#059669' }}>Lucro Unit.</th>
                      <th style={{ width: '125px', textAlign: 'right', color: '#059669' }}>Lucro Total</th>
                      <th style={{ width: '50px', textAlign: 'center' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it, originalIdx) => {
                      const qty = parseN(it.qtd);
                      const preco = parseN(it.precoUnit);
                      const sub = preco * qty;
                      const precoComDesc = preco * fatorDesconto;
                      const subComDesc = sub * fatorDesconto;
                      const ftOriginal = Array.isArray(fts) ? fts.find(f => f.indiceFt === it.indiceFt) : null;
                      const orcData = it._rawOrcData || (ftOriginal ? ftOriginal._rawOrcData : null);
                      const timeSource = orcData || ftOriginal;
                      const tempoUnit = timeSource ? getUnitProductionTime(timeSource) : 0;
                      const realCustoRow = parseN(it.custoBase) > 0
                        ? parseN(it.custoBase)
                        : (parseN(ftOriginal?._custoFinal) > 0
                          ? parseN(ftOriginal._custoFinal)
                          : (timeSource ? (getResultados(timeSource)?.custoFisicoUnit || 0) : 0));
                      const custoBase = realCustoRow;
                      const lucroUnit = precoComDesc - custoBase;
                      const lucroTotal = lucroUnit * qty;

                      return (
                        <tr key={it._uid} className="row-active">
                          <td>
                            <span className="badge-sm" style={it.isOrcamento ? { background: '#FEF3C7', color: '#D97706' } : {}}>
                              {it.indiceFt}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}>
                              <span>{it.nomePeca}</span>
                              {it.indiceFt?.startsWith('CFT-') && it._rawOrcData && (
                                <>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    title="Editar Custos do Produto Customizado"
                                    onClick={() => {
                                      setEditingCft(it);
                                      setShowCustomModal(true);
                                    }}
                                    style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)' }}
                                  >
                                    <Edit2 size={14} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    title="Excluir Produto Customizado do Sistema"
                                    onClick={() => handleDeleteCft(it)}
                                    style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: '#EF4444' }}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="cost-cell" style={{ textAlign: 'right' }}>R$ {fmt(custoBase)}</td>
                          <td className="cost-cell" style={{ textAlign: 'center' }}>{formatTime(tempoUnit)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              step="0.1"
                              className="cell-input"
                              style={{ width: '68px', textAlign: 'center' }}
                              value={it.margemRaw ?? (custoBase > 0 ? (preco / custoBase).toFixed(2) : '0.00')}
                              onChange={e => {
                                const raw = e.target.value;
                                const m = parseN(raw);
                                setItens(prev => {
                                  const next = [...prev];
                                  next[originalIdx] = {
                                    ...next[originalIdx],
                                    custoBase,
                                    precoUnit: (custoBase * m).toFixed(2),
                                    margemRaw: raw
                                  };
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <input
                              type="number"
                              step="0.01"
                              className="cell-input"
                              style={{ width: '96px', textAlign: 'right' }}
                              value={it.precoUnit}
                              onChange={e => {
                                setItens(prev => {
                                  const next = [...prev];
                                  next[originalIdx] = { ...next[originalIdx], precoUnit: e.target.value, margemRaw: undefined };
                                  return next;
                                });
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="number"
                              min="1"
                              className="cell-input cell-qty"
                              value={it.qtd}
                              onChange={e => {
                                const v = e.target.value;
                                if (v !== '' && parseN(v) <= 0) {
                                  handleRemoveOrderItem(it._uid);
                                } else {
                                  updateItem(originalIdx, 'qtd', v);
                                }
                              }}
                            />
                          </td>
                          <td style={{ textAlign: 'right', color: percDesconto > 0 ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: percDesconto > 0 ? 'line-through' : 'none' }}>
                            R$ {fmt(sub)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#7C3AED', background: percDesconto > 0 ? 'rgba(139, 92, 246, 0.06)' : 'transparent' }}>
                            R$ {fmt(precoComDesc)}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#6D28D9', background: percDesconto > 0 ? 'rgba(139, 92, 246, 0.09)' : 'transparent' }}>
                            R$ {fmt(subComDesc)}
                          </td>
                          <td style={{ textAlign: 'right' }} className={lucroUnit >= 0 ? 'lucro-pos' : 'lucro-neg'}>
                            R$ {fmt(lucroUnit)}
                          </td>
                          <td style={{ textAlign: 'right' }} className={lucroTotal >= 0 ? 'lucro-pos lucro-bold' : 'lucro-neg lucro-bold'}>
                            R$ {fmt(lucroTotal)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleRemoveOrderItem(it._uid)}
                              title="Remover item do pedido"
                              style={{
                                padding: '4px 7px',
                                borderRadius: '6px',
                                border: '1px solid #FECACA',
                                background: '#FEF2F2',
                                color: '#DC2626',
                                cursor: 'pointer',
                                fontWeight: 700
                              }}
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* ── Linha Fixa Alinhada às Colunas da Tabela (Totais, Markup Global e Desconto %) ── */}
                  <tfoot
                    style={{
                      position: 'sticky',
                      bottom: 0,
                      zIndex: 4,
                      background: 'linear-gradient(135deg, #F5F3FF 0%, #EFF6FF 100%)',
                      borderTop: '2px solid var(--accent-primary)',
                      boxShadow: '0 -3px 10px rgba(139, 92, 246, 0.1)'
                    }}
                  >
                    <tr>
                      {/* Col 1 & 2: Total de Itens */}
                      <td colSpan={2} style={{ padding: '0.75rem 0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        TOTAL ({itensSelected.length} {itensSelected.length === 1 ? 'produto' : 'produtos'})
                      </td>

                      {/* Col 3: Total Custo Prod. */}
                      <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: 800, color: 'var(--text-secondary)' }}>
                        <div style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Custo Total</div>
                        <div>R$ {fmt(totalCusto)}</div>
                      </td>

                      {/* Col 4: Tempo Total */}
                      <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 800, color: 'var(--text-primary)' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Tempo Total</div>
                        <div>⏱️ {formatTime(totalTime)}</div>
                      </td>

                      {/* Col 5: Markup Global na Linha Fixa */}
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '3px', textTransform: 'uppercase' }}>
                          Markup Global
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <input
                            type="number"
                            min="0.1"
                            step="0.1"
                            value={markup}
                            onChange={e => setMarkup(e.target.value)}
                            className="cell-input"
                            style={{ width: '54px', textAlign: 'center', padding: '3px 4px', fontWeight: 700 }}
                            title="Multiplicador global sobre o custo"
                          />
                          <button
                            type="button"
                            onClick={applyMarkup}
                            title="Aplicar este Markup em todos os produtos do pedido"
                            style={{
                              padding: '4px 7px',
                              borderRadius: '5px',
                              background: 'var(--accent-primary)',
                              color: '#fff',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              cursor: 'pointer'
                            }}
                          >
                            ⚡
                          </button>
                        </div>
                      </td>

                      {/* Col 6: Espaço Preço Unit. */}
                      <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                        —
                      </td>

                      {/* Col 7: Soma das Quantidades */}
                      <td style={{ padding: '0.75rem 0.85rem', textAlign: 'center', fontWeight: 900, fontSize: '0.95rem' }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Peças</div>
                        <div>{totalQtdPecas}</div>
                      </td>

                      {/* Col 8: Total Subtotal Bruto (Abaixo da coluna Subtotal) */}
                      <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: 800 }}>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Subtotal Bruto</div>
                        <div style={{ textDecoration: percDesconto > 0 ? 'line-through' : 'none', color: percDesconto > 0 ? 'var(--text-secondary)' : 'var(--text-primary)' }}>
                          R$ {fmt(totalBruto)}
                        </div>
                      </td>

                      {/* Col 9: Input de Desconto (%) que aplica automaticamente em todos os produtos */}
                      <td style={{ padding: '0.6rem 0.5rem', textAlign: 'right', background: 'rgba(139, 92, 246, 0.08)' }}>
                        <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#6D28D9', marginBottom: '3px', textTransform: 'uppercase' }}>
                          Desconto (%)
                        </div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '3px' }}>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            placeholder="0"
                            value={cliente.descontoPercent || ''}
                            onChange={e => handleDescontoPercentChange(e.target.value)}
                            className="cell-input"
                            style={{
                              width: '64px',
                              textAlign: 'right',
                              padding: '3px 6px',
                              fontWeight: 800,
                              borderColor: percDesconto > 0 ? '#7C3AED' : 'var(--border-color)',
                              color: '#6D28D9'
                            }}
                            title="Digite a % de desconto para aplicar automaticamente em todos os produtos"
                          />
                          <span style={{ fontWeight: 800, color: '#6D28D9', fontSize: '0.8rem' }}>%</span>
                        </div>
                        {percDesconto > 0 && (
                          <div style={{ fontSize: '0.68rem', color: '#DC2626', fontWeight: 700, marginTop: '2px' }}>
                            -R$ {fmt(valorDesconto)}
                          </div>
                        )}
                      </td>

                      {/* Col 10: Total Final c/ Desconto (Abaixo da coluna Subtotal c/ Desc.) */}
                      <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: 900, background: 'rgba(139, 92, 246, 0.12)', color: '#5B21B6' }}>
                        <div style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Total Final</div>
                        <div style={{ fontSize: '1rem' }}>R$ {fmt(totalVenda)}</div>
                      </td>

                      {/* Col 11: Margem Média */}
                      <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: 800, color: totalLucro >= 0 ? '#059669' : '#DC2626' }}>
                        <div style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Margem</div>
                        <div>{margemPerc.toFixed(1)}%</div>
                      </td>

                      {/* Col 12: Lucro Total (Abaixo da coluna Lucro Total) */}
                      <td style={{ padding: '0.75rem 0.85rem', textAlign: 'right', fontWeight: 900, color: totalLucro >= 0 ? '#047857' : '#DC2626', background: totalLucro >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)' }}>
                        <div style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}>Lucro Total</div>
                        <div style={{ fontSize: '0.96rem' }}>R$ {fmt(totalLucro)}</div>
                      </td>

                      {/* Col 13: Vazio Ação */}
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>

        </div>
      </div>

      {/* ── Rodapé de ações ── */}
      <div className="modal-footer-bar" style={{ justifyContent: 'space-between' }}>
        <div style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
          {itensSelected.length > 0 ? (
            <span>
              📦 <strong>{itensSelected.length}</strong> {itensSelected.length === 1 ? 'item' : 'itens'} ({totalQtdPecas} peças) • Total Final:{' '}
              <strong style={{ color: 'var(--accent-primary)', fontSize: '0.95rem' }}>R$ {fmt(totalVenda)}</strong>
              {percDesconto > 0 ? ` (${percDesconto}% OFF aplicado)` : ''}
            </span>
          ) : (
            <span>Busque um produto acima para montar o pedido.</span>
          )}
        </div>
        <div className="modal-footer-actions">
          <button className="btn-outline" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>💾 Salvar Pedido</button>
        </div>
      </div>
      {showCustomModal && (
        <CustomQuoteProductModal 
          onClose={() => { setShowCustomModal(false); setEditingCft(null); }}
          onSave={handleSaveCustomProduct}
          fts={fts}
          currentItens={itens}
          initialData={editingCft ? editingCft._rawOrcData : null}
          editUid={editingCft ? editingCft._uid : null}
        />
      )}
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function Pedidos() {
  const { profile } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [fts, setFts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPedido, setEditingPedido] = useState(null);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: 'save', title: '', details: [], onConfirm: null });
  const openConfirm = (type, title, details, onConfirm) => setConfirmModal({ isOpen: true, type, title, details, onConfirm });
  const closeConfirm = () => setConfirmModal(m => ({ ...m, isOpen: false }));

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('realtime-pedidos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fichas_tecnicas' },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      // Busca FTs e Pedidos via fetch direto para evitar deadlock do cliente Supabase
      const [ftsResp, orcsResp, ordersResp] = await Promise.allSettled([
        fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=*&order=id.asc`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/orcamentos_rapidos?select=*&order=id.asc`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/orders?select=*&client_data=not.is.null&order=created_at.desc`, { headers })
      ]);

      const ftsData = ftsResp.status === 'fulfilled' && ftsResp.value.ok ? await ftsResp.value.json() : [];
      // Mapeia garantindo que pegamos o objeto da FT (seja da coluna 'data' ou do root) e calculamos _custoFinal real
      const cleanFts = ftsData
        .map(r => r.data || r)
        .filter(f => f && f.indiceFt)
        .map(f => {
          const ftRes = getResultados(f);
          const realCost = parseN(f._custoFinal) > 0 ? parseN(f._custoFinal) : (ftRes?.custoFisicoUnit || 0);
          return {
            ...f,
            _custoFinal: realCost
          };
        });
      cleanFts.sort((a, b) => String(a.indiceFt).localeCompare(String(b.indiceFt), undefined, { numeric: true }));
      
      const orcsData = orcsResp.status === 'fulfilled' && orcsResp.value.ok ? await orcsResp.value.json() : [];
      const cleanOrcs = orcsData.map(r => {
        const orcResults = r.data ? getResultados(r.data) : null;
        const custoUnit = orcResults?.custoFisicoUnit || 0;
        const isCft = String(r.id || '').startsWith('CFT-');
        const precoCalc = parseN(r.data?.precoVendaManual) || orcResults?.precoPraticado || parseN(r.data?.price) || (custoUnit * 3) || 0;
        return {
          ...(isCft && r.data ? r.data : {}),
          indiceFt: r.id,
          nomePeca: r.name || r.data?.nomePeca || r.id,
          _custoFinal: custoUnit,
          isOrcamento: true,
          isCft,
          precoSugerido: precoCalc,
          _rawOrcData: r.data
        };
      });

      setFts([...cleanFts, ...cleanOrcs]);


      if (ordersResp.status === 'fulfilled' && ordersResp.value.ok) {
        const data = await ordersResp.value.json();
        const mapped = data.map(p => ({
          id: p.id,
          tipo: p.client_data?.tipo || 'pedido',
          cliente: p.client_data || {},
          itens: p.items || [],
          total: p.total || 0,
          status: p.status || 'pending',
          payment_date: p.payment_date,
          createdAt: p.created_at
        }));

        setPedidos(mapped);

      } else {
        console.error('Erro ao buscar pedidos via fetch');
      }
    } catch (e) {
      console.error('Exceção ao buscar dados em Pedidos:', e);
    } finally {
      setLoading(false);
    }
  };

  const updateFtStock = async (ftId, delta) => {
    if (delta === 0) return;
    if (String(ftId).startsWith('ORC-') || String(ftId).startsWith('CFT-')) return;
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const getResp = await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}&select=estoque,data`, {
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
      });
      if (!getResp.ok) return;
      const data = await getResp.json();
      const row = data[0];
      if (!row) return;
      const rawData = row.data || {};
      const hasDual = rawData.estoqueGalpao !== undefined || rawData.estoqueCasa !== undefined;
      let galpao = hasDual ? Number(rawData.estoqueGalpao || 0) : Number(row.estoque || 0);
      let casa = hasDual ? Number(rawData.estoqueCasa || 0) : 0;

      if (delta > 0) {
        if (galpao >= delta) {
          galpao -= delta;
        } else if (galpao > 0) {
          const rem = delta - galpao;
          galpao = 0;
          casa -= rem;
        } else {
          casa -= delta;
        }
      } else {
        galpao -= delta; // delta negativo devolve pro galpão
      }

      const newStock = galpao + casa;
      const newData = { ...rawData, estoqueGalpao: galpao, estoqueCasa: casa };

      await fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?id=eq.${ftId}`, {
        method: 'PATCH',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({ estoque: newStock, data: newData })
      });
    } catch (e) {
      console.error('Erro ao abater estoque:', e);
    }
  };

  const _doSave = useCallback(async ({ id, cliente, itens }) => {
    setLoading(true);
    try {
      const totalBruto = itens.reduce((s, it) => s + (parseN(it.precoUnit) * parseN(it.qtd)), 0);
      const temDesconto = Boolean(cliente?.temDesconto);
      const percDesconto = temDesconto ? Math.min(100, Math.max(0, parseN(cliente?.descontoPercent))) : 0;
      const valorDesconto = temDesconto && percDesconto > 0 ? (totalBruto * percDesconto) / 100 : 0;
      const total = Math.max(0, totalBruto - valorDesconto);

      const cleanCliente = {
        ...cliente,
        temDesconto,
        descontoPercent: temDesconto ? cliente.descontoPercent : ''
      };

      const dbRecord = {
        client_data: cleanCliente,
        items: itens,
        total: total
      };

      if (!id) {
        dbRecord.status = 'pending';
      }

      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 
        'apikey': SUPA_KEY, 
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      };

      let oldItems = [];
      if (id) {
        const oldResp = await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${id}&select=items`, { headers });
        if (oldResp.ok) {
          const oldData = await oldResp.json();
          oldItems = oldData[0]?.items || [];
        }
      }

      let resp;
      if (id) {
        resp = await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(dbRecord)
        });
      } else {
        resp = await fetch(`${SUPA_URL}/rest/v1/orders`, {
          method: 'POST',
          headers,
          body: JSON.stringify(dbRecord)
        });
      }

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Falha ao salvar: ${resp.status} ${errText}`);
      }
      
      const deltas = {};
      oldItems.forEach(oldIt => { deltas[oldIt.indiceFt] = -(parseN(oldIt.qtd)); });
      itens.forEach(newIt => { deltas[newIt.indiceFt] = (deltas[newIt.indiceFt] || 0) + parseN(newIt.qtd); });
      Object.entries(deltas).forEach(([ftId, delta]) => { updateFtStock(ftId, delta); });
      
      setShowModal(false);
      setEditingPedido(null);
      fetchData();
    } catch (e) {
      console.error('Erro ao salvar pedido:', e);
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSave = useCallback(({ id, cliente, itens }) => {
    const totalBruto = itens.reduce((s, it) => s + (parseN(it.precoUnit) * parseN(it.qtd)), 0);
    const temDesconto = Boolean(cliente?.temDesconto);
    const percDesconto = temDesconto ? Math.min(100, Math.max(0, parseN(cliente?.descontoPercent))) : 0;
    const valorDesconto = temDesconto && percDesconto > 0 ? (totalBruto * percDesconto) / 100 : 0;
    const total = Math.max(0, totalBruto - valorDesconto);

    const isEdit = !!id;
    const details = [
      { label: 'Cliente', value: cliente.nome || '—' },
      { label: 'Telefone', value: cliente.telefone || '—' },
      { label: 'Itens no Pedido', value: `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}` },
    ];

    if (temDesconto && percDesconto > 0) {
      details.push({ label: 'Subtotal', value: `R$ ${fmt(totalBruto)}` });
      details.push({ label: `Desconto (${percDesconto}%)`, value: `- R$ ${fmt(valorDesconto)}` });
    }

    details.push({ label: 'Total', value: `R$ ${fmt(total)}` });

    openConfirm(
      isEdit ? 'edit' : 'save',
      isEdit ? 'Confirmar Edição de Pedido' : 'Confirmar Novo Pedido',
      details,
      () => { closeConfirm(); _doSave({ id, cliente, itens }); }
    );
  }, [_doSave]);


  const togglePaymentStatus = async (id, currentStatus) => {
    // Se já está pago ou recusado, volta para pendente com confirmação
    if (currentStatus === 'paid' || currentStatus === 'refused') {
      const label = currentStatus === 'paid' ? 'Pago' : 'Recusado';
      if (!window.confirm(`Voltar o pedido para 'Pendente'? O status '${label}' e a data registrada serão removidos.`)) return;
      try {
        const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const resp = await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${id}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'pending', payment_date: null })
        });
        if (!resp.ok) throw new Error('Falha ao atualizar status');
        setPedidos(prev => prev.map(p => p.id === id ? { ...p, status: 'pending', payment_date: null } : p));
      } catch (e) {
        alert('Erro ao atualizar pagamento: ' + e.message);
      }
      return;
    }

    // Status é 'pending' → abre modal de escolha
    setPaymentModal({ open: true, pedidoId: id });
  };

  const [paymentModal, setPaymentModal] = useState({ open: false, pedidoId: null });

  const handleConfirmPayment = async (newStatus) => {
    const { pedidoId } = paymentModal;
    setPaymentModal({ open: false, pedidoId: null });

    const defaultDate = new Date().toLocaleDateString('pt-BR');
    const label = newStatus === 'paid' ? 'pagamento' : 'recusa';
    const dateStr = window.prompt(`Informe a data do ${label} (DD/MM/AAAA):`, defaultDate);
    if (dateStr === null) return;

    let paymentDate;
    try {
      if (dateStr.trim() !== '') {
        const parts = dateStr.split('/');
        if (parts.length !== 3) throw new Error('Formato inválido');
        paymentDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      } else {
        paymentDate = new Date().toISOString().split('T')[0];
      }
    } catch (e) {
      alert('Data inválida! Use o formato DD/MM/AAAA (ex: 25/04/2024)');
      return;
    }

    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${pedidoId}`, {
        method: 'PATCH',
        headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, payment_date: paymentDate })
      });
      if (!resp.ok) throw new Error('Falha ao atualizar status');
      setPedidos(prev => prev.map(p => p.id === pedidoId ? { ...p, status: newStatus, payment_date: paymentDate } : p));
    } catch (e) {
      alert('Erro ao atualizar: ' + e.message);
    }
  };


  const handleDelete = (id) => {
    const pedido = pedidos.find(p => p.id === id);
    openConfirm(
      'delete',
      'Excluir Documento',
      [
        { label: 'Nº do Pedido', value: formatId(id, pedido?.tipo) },
        { label: 'Cliente', value: pedido?.cliente?.nome || '—' },
        { label: 'Total', value: pedido ? `R$ ${fmt(pedido.total || 0)}` : '—' },
      ],
      async () => {
        closeConfirm();
        try {
          const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
          const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
          const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };
          const oldResp = await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${id}&select=items`, { headers });
          let oldItems = [];
          if (oldResp.ok) {
            const oldData = await oldResp.json();
            oldItems = oldData[0]?.items || [];
          }
          const resp = await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${id}`, { method: 'DELETE', headers });
          if (!resp.ok) throw new Error('Falha ao excluir');
          oldItems.forEach(it => { updateFtStock(it.indiceFt, -(parseN(it.qtd))); });
          setPedidos(prev => prev.filter(p => p.id !== id));
        } catch (e) {
          alert('Erro ao excluir: ' + e.message);
        }
      }
    );
  };


  const totalPedido = (p) => {
    if (p.total !== undefined && p.total !== null && p.total > 0) return p.total;
    const bruto = p.itens?.reduce((s, it) => s + (parseN(it.precoUnit) * parseN(it.qtd)), 0) || 0;
    const temDesconto = Boolean(p.cliente?.temDesconto);
    const percDesconto = temDesconto ? Math.min(100, Math.max(0, parseN(p.cliente?.descontoPercent))) : 0;
    return Math.max(0, bruto - (bruto * percDesconto) / 100);
  };


  return (
    <>
      <div className="page-wrapper pedidos-page">
        <div className="pedidos-header">
          <div>
            <h1 className="page-title">Pedidos</h1>
            <p className="page-description">Gere documentos de venda com base nas suas Fichas Técnicas.</p>
          </div>
          <button className="btn-primary" onClick={() => { setEditingPedido(null); setShowModal(true); }}>
            + Novo Documento
          </button>
        </div>

        <div className="card">
          <h3 className="list-title">📋 Histórico de Documentos</h3>

          {loading ? (
            <div className="empty-state" style={{padding: '3rem 0'}}>
              <Loader size={40} className="spinner" color="var(--primary)" style={{marginBottom: '1rem'}} />
              <p>Carregando pedidos da nuvem...</p>
            </div>
          ) : pedidos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📄</div>
              <p>Nenhum documento gerado ainda.</p>
              <p className="empty-sub">Clique em <strong>"+ Novo Documento"</strong> para começar.</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="pedidos-table">
                <thead>
                  <tr>
                    <th>Nº</th>
                    <th>Tipo</th>
                    <th>Cliente</th>
                    <th>Pagamento</th>
                    <th>Qtd. Itens</th>

                    <th>Total</th>
                    <th>Data</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map(p => (
                    <tr key={p.id}>
                      <td><span className="badge">{formatId(p.id, p.tipo)}</span></td>
                      <td>
                        <span className={`tipo-tag ${p.tipo}`}>
                          {p.tipo === 'consignado' ? '🤝 Consignado' : '🧾 Pedido'}
                        </span>
                      </td>
                      <td className="cliente-cell">{p.cliente.nome}</td>
                      <td>
                        <span 
                          className={`badge status-badge ${p.status || 'pending'}`}
                          onClick={() => togglePaymentStatus(p.id, p.status)}
                          style={{ cursor: 'pointer', fontSize: '0.75rem', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', minWidth: '85px' }}
                        >
                          {p.status === 'paid' ? (
                            <>
                              <span>✅ Pago</span>
                              <span style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>
                                {p.payment_date ? p.payment_date.split('-').reverse().join('/') : '-'}
                              </span>
                            </>
                          ) : p.status === 'refused' ? (
                            <>
                              <span>❌ Recusado</span>
                              <span style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px' }}>
                                {p.payment_date ? p.payment_date.split('-').reverse().join('/') : '-'}
                              </span>
                            </>
                          ) : '⏳ Pendente'}
                        </span>
                      </td>

                      <td>{p.itens.length} {p.itens.length === 1 ? 'item' : 'itens'}</td>

                      <td className="total-cell">
                        R$ {fmt(totalPedido(p))}
                        {Boolean(p.cliente?.temDesconto) && parseN(p.cliente?.descontoPercent) > 0 && (
                          <div style={{ fontSize: '0.72rem', color: '#DC2626', fontWeight: 700 }}>
                            (-{parseN(p.cliente.descontoPercent)}% desc.)
                          </div>
                        )}
                      </td>
                      <td className="date-cell">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn-icon" onClick={() => openPrintWindow(p, profile?.tenants)} title="Imprimir">
                            🖨️
                          </button>
                          <button className="btn-icon" onClick={() => { setEditingPedido(p); setShowModal(true); }} title="Editar">
                            ✏️
                          </button>
                          <button className="btn-icon danger" onClick={() => handleDelete(p.id)} title="Excluir">
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showModal && (
        <ModalPedido
          fts={fts}
          onSave={handleSave}
          onCancel={() => { setShowModal(false); setEditingPedido(null); }}
          initialData={editingPedido}
        />
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        details={confirmModal.details}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />

      {paymentModal.open && (
        <div className="modal-overlay" style={{ zIndex: 9998 }}>
          <div className="modal-content" style={{ maxWidth: '340px', textAlign: 'center' }}>
            <div className="modal-header">
              <h3>Atualizar Pagamento</h3>
              <button className="btn-close" onClick={() => setPaymentModal({ open: false, pedidoId: null })}>×</button>
            </div>
            <div className="modal-body" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>Selecione o novo status para este pedido:</p>
              <button
                className="btn-primary"
                onClick={() => handleConfirmPayment('paid')}
                style={{ background: 'var(--success)', borderColor: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1rem', padding: '0.75rem' }}
              >
                ✅ Marcar como Pago
              </button>
              <button
                className="btn-primary"
                onClick={() => handleConfirmPayment('refused')}
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '1rem', padding: '0.75rem' }}
              >
                ❌ Marcar como Recusado
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
