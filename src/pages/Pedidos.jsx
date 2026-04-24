import { useState, useEffect, useCallback } from 'react';
import { getUnitProductionTime, formatTime } from '../utils/financeCalculators';
import { supabase } from '../supabaseClient';
import { Loader } from 'lucide-react';
import './Pedidos.css';

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
  tipo: 'pedido',
  nome: '',
  telefone: '',
  email: '',
  endereco: '',
  obs: '',
};

const formatId = (id, tipo) => {
  if (typeof id === 'string' && (id.startsWith('P-') || id.startsWith('C-'))) return id;
  const prefix = tipo === 'consignado' ? 'C' : 'P';
  return `${prefix}-${String(id).padStart(3, '0')}`;
};

// ─── Geração de impressão via nova janela ─────────────────────────────────────
const openPrintWindow = (pedido) => {
  const total = pedido.itens.reduce((s, it) => s + parseN(it.precoUnit) * parseN(it.qtd), 0);
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
          <p class="sign-label">Responsável AM3D</p>
          <p class="sign-name">Data: _______ / _______ / _________</p>
        </div>
      </div>
    </div>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${label} ${formatId(pedido.id, pedido.tipo)} — AM3D</title>
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
        <img class="logo-img" src="${window.location.origin}/logo.png" alt="Logo"
          onerror="this.style.display='none'; document.getElementById('lf').style.display='flex';"/>
        <div id="lf" class="logo-fallback">
          <div class="logo-box">3D</div>
          <div>
            <div class="company-name">AM3D</div>
            <div class="company-sub">Impressão 3D Profissional</div>
          </div>
        </div>
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
        <div class="total-label">Total Geral</div>
        <div class="total-value">R$ ${fmt(total)}</div>
      </div>
    </div>

    ${assinaturaBlock}

    <!-- FOOTER -->
    <div class="footer">
      <span class="footer-brand">AM3D — Impressão 3D Profissional</span>
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
  const [cliente, setCliente] = useState(initialData ? initialData.cliente : BLANK_CLIENTE);
  const [markup, setMarkup] = useState('3');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [itens, setItens] = useState(() => {

    // Se estiver editando, preenche com os itens salvos
    if (initialData?.itens) return initialData.itens;
    return [];
  });

  const [availableFts, setAvailableFts] = useState(fts);


  const handleClienteChange = (e) => setCliente(p => ({ ...p, [e.target.name]: e.target.value }));

  const addItem = (ft) => {
    if (itens.some(it => it.indiceFt === ft.indiceFt)) {
      alert("Este item já está no pedido.");
      return;
    }
    const m = parseN(markup) || 3;
    const newItem = {
      indiceFt: ft.indiceFt,
      nomePeca: ft.nomePeca,
      custoBase: ft._custoFinal || 0,
      precoUnit: ((ft._custoFinal || 0) * m).toFixed(2),
      qtd: 1
    };
    setItens(prev => [...prev, newItem]);
    setSearchTerm('');
  };

  const removeItem = (idx) => {
    setItens(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (idx, field, value) =>
    setItens(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });

  const totalVenda = itens.reduce((s, it) => s + (parseN(it.precoUnit) * parseN(it.qtd)), 0);
  const totalCusto = itens.reduce((s, it) => s + (parseN(it.custoBase) * parseN(it.qtd)), 0);
  const totalLucro = totalVenda - totalCusto;
  const margemPerc = totalVenda > 0 ? (totalLucro / totalVenda) * 100 : 0;

  const totalTime = itens.reduce((acc, it) => {
    const baseFt = fts.find(f => f.indiceFt === it.indiceFt);
    if (!baseFt) return acc;
    return acc + (getUnitProductionTime(baseFt) * parseN(it.qtd));
  }, 0);


  const handleSave = () => {
    if (!cliente.nome.trim()) { alert('Informe o nome do cliente.'); return; }
    if (itens.length === 0) { alert('Adicione pelo menos 1 item ao pedido.'); return; }
    onSave({ id: initialData?.id, cliente, itens });
  };


  return (
    <div className="modal-fullscreen">
      {/* ── Header fixo ── */}
      <div className="modal-topbar">
        <div className="modal-topbar-left">
          <button className="btn-outline btn-sm" onClick={onCancel}>✕ Fechar</button>
          <div>
            <h2 className="modal-title">Novo Documento</h2>
            <p className="modal-sub">Preencha os dados do cliente e configure os itens</p>
          </div>
        </div>
        <div className="modal-topbar-right">
          <button className="btn-primary" onClick={handleSave}>💾 Salvar Pedido</button>
        </div>
      </div>

      {/* ── Corpo com scroll ── */}
      <div className="modal-scroll-body">
        <div className="modal-content-grid">

          {/* ── Seção 1: Dados do Cliente ── */}
          <section className="modal-section card">
            <h3 className="section-heading">
              <span className="section-num">1</span> Dados do Cliente
            </h3>
            <div className="form-grid-2">
              <div className="form-group span-2">
                <label>Tipo de Documento</label>
                <div className="tipo-toggle">
                  <button
                    className={cliente.tipo === 'pedido' ? 'tipo-btn active' : 'tipo-btn'}
                    onClick={() => setCliente(p => ({ ...p, tipo: 'pedido' }))}>
                    🧾 Pedido de Venda
                  </button>
                  <button
                    className={cliente.tipo === 'consignado' ? 'tipo-btn active consignado' : 'tipo-btn'}
                    onClick={() => setCliente(p => ({ ...p, tipo: 'consignado' }))}>
                    🤝 Consignado
                  </button>
                </div>
              </div>

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
              <div className="form-group span-2">
                <label htmlFor="obs">Observações</label>
                <textarea id="obs" name="obs" value={cliente.obs} onChange={handleClienteChange} rows={2} placeholder="Prazo, condições de pagamento, etc." />
              </div>
            </div>
          </section>

          {/* ── Seção 2: Busca e Adição de Itens ── */}
          <section className="modal-section card">
            <h3 className="section-heading">
              <span className="section-num">2</span> Buscar e Adicionar Itens
            </h3>
            <div className="search-and-add">
              <div className="form-group">
                <label>Markup Inicial (para novos itens)</label>
                <input type="number" step="0.1" value={markup} onChange={e => setMarkup(e.target.value)} />
              </div>
              <div className="form-group" style={{marginTop: '1rem', position: 'relative'}}>
                <label>Pesquise a FT para adicionar</label>
                <input 
                  type="text" 
                  placeholder="🔍 Digite o nome ou ID da peça..." 
                  value={searchTerm}
                  onFocus={() => setIsSearchFocused(true)}
                  onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                  onChange={e => setSearchTerm(e.target.value)}
                />
                {(isSearchFocused || searchTerm.length > 0) && (
                  <div className="search-results-dropdown">
                    {availableFts
                      .filter(ft => 
                        ft.nomePeca.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        ft.indiceFt.toLowerCase().includes(searchTerm.toLowerCase())
                      )
                      .slice(0, 10)
                      .map(ft => (
                        <div key={ft.indiceFt} className="search-result-item" onClick={() => addItem(ft)}>
                          <span className="sr-id">{ft.indiceFt}</span>
                          <span className="sr-name">{ft.nomePeca}</span>
                          <button className="btn-add-item">+ Adicionar</button>
                        </div>
                      ))}
                    {availableFts.length === 0 && <div className="search-result-item">Nenhuma FT cadastrada.</div>}
                  </div>
                )}

              </div>
            </div>
          </section>

          {/* ── Seção 3: Lista de Itens do Pedido ── */}
          <section className="modal-section card span-full">
            <h3 className="section-heading">
              <span className="section-num">3</span> Itens Selecionados
              {itens.length === 0 && <span className="no-fts-warn"> — Nenhum item adicionado.</span>}
            </h3>

            {itens.length > 0 && (
              <div className="items-table-wrap">
                <table className="items-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Nome</th>
                      <th>Custo Prod.</th>
                      <th style={{ width: 120 }}>Preço Unit. (R$)</th>
                      <th style={{ width: 80, textAlign: 'center' }}>Qtd</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                      <th style={{ width: 60, textAlign: 'center' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((it, idx) => {
                      const qty = parseN(it.qtd);
                      const preco = parseN(it.precoUnit);
                      const sub = preco * qty;
                      return (
                        <tr key={idx}>
                          <td><span className="badge-sm">{it.indiceFt}</span></td>
                          <td>{it.nomePeca}</td>
                          <td className="cost-cell">R$ {fmt(it.custoBase)}</td>
                          <td>
                            <input
                              type="number"
                              className="cell-input"
                              value={it.precoUnit}
                              onChange={e => updateItem(idx, 'precoUnit', e.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              className="cell-input cell-qty"
                              value={it.qtd}
                              onChange={e => updateItem(idx, 'qtd', e.target.value)}
                            />
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 'bold' }}>R$ {fmt(sub)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button className="btn-icon danger" onClick={() => removeItem(idx)}>🗑️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>


        </div>
      </div>

      {/* ── Rodapé fixo com totalizadores ── */}
      <div className="modal-footer-bar">
        <div className="totals-row">
          <div className="total-chip">
            <span className="tc-label">Itens</span>
            <span className="tc-value">{itens.length}</span>
          </div>
          <div className="total-chip">
            <span className="tc-label">Total Venda</span>
            <span className="tc-value accent">R$ {fmt(totalVenda)}</span>
          </div>
          <div className="total-chip">
            <span className="tc-label">Total Custo</span>
            <span className="tc-value muted">R$ {fmt(totalCusto)}</span>
          </div>
          <div className="total-chip">
            <span className="tc-label">Tempo de Produção</span>
            <span className="tc-value">⏱️ {formatTime(totalTime)}</span>
          </div>
          <div className={`total-chip ${totalLucro >= 0 ? 'chip-green' : 'chip-red'}`}>
            <span className="tc-label">Lucro Estimado</span>
            <span className="tc-value">R$ {fmt(totalLucro)} ({margemPerc.toFixed(1)}%)</span>
          </div>
        </div>
        <div className="modal-footer-actions">
          <button className="btn-outline" onClick={onCancel}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>💾 Salvar Pedido</button>
        </div>
      </div>
    </div>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────
export default function Pedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [fts, setFts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPedido, setEditingPedido] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      // Busca FTs e Pedidos via fetch direto para evitar deadlock do cliente Supabase
      const [ftsResp, ordersResp] = await Promise.allSettled([
        fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=*&order=id.asc`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/orders?select=*&client_data=not.is.null&order=created_at.desc`, { headers })
      ]);

      const ftsData = ftsResp.status === 'fulfilled' && ftsResp.value.ok ? await ftsResp.value.json() : [];
      setFts(ftsData.map(r => r.data));

      if (ordersResp.status === 'fulfilled' && ordersResp.value.ok) {
        const data = await ordersResp.value.json();
        const mapped = data.map(p => ({
          id: p.id,
          tipo: p.tipo || 'pedido',
          cliente: p.client_data || {},
          itens: p.items || [],
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


  const handleSave = useCallback(async ({ id, cliente, itens }) => {
    setLoading(true);
    try {
      const total = itens.reduce((s, it) => s + parseN(it.precoUnit) * parseN(it.qtd), 0);
      const dbRecord = {
        tipo: cliente.tipo,
        client_data: cliente,
        client_name: cliente.nome,
        items: itens,
        value: total
      };

      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 
        'apikey': SUPA_KEY, 
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      };

      let resp;
      if (id) {
        // UPDATE via PATCH
        resp = await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify(dbRecord)
        });
      } else {
        // INSERT via POST
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


  const handleDelete = async (id) => {
    if (window.confirm(`Excluir o documento?`)) {
      try {
        const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const resp = await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${id}`, {
          method: 'DELETE',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
        });
        if (!resp.ok) throw new Error('Falha ao excluir');
        setPedidos(prev => prev.filter(p => p.id !== id));
      } catch (e) {
        alert('Erro ao excluir: ' + e.message);
      }
    }
  };


  const totalPedido = (p) => p.itens.reduce((s, it) => s + parseN(it.precoUnit) * parseN(it.qtd), 0);

  return (
    <>
      <div className="page-wrapper pedidos-page">
        <div className="pedidos-header">
          <div>
            <h1 className="page-title">Pedidos &amp; Consignados</h1>
            <p className="page-description">Gere documentos de venda ou consignado com base nas suas Fichas Técnicas.</p>
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
                      <td>{p.itens.length} {p.itens.length === 1 ? 'item' : 'itens'}</td>
                      <td className="total-cell">R$ {fmt(totalPedido(p))}</td>
                      <td className="date-cell">{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td>
                        <div className="row-actions">
                          <button className="btn-icon" onClick={() => openPrintWindow(p)} title="Imprimir">
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
    </>
  );
}
