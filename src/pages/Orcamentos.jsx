import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { Loader, Printer, Trash2, Edit2, FileText, CheckCircle, XCircle, Plus } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import FtInputs from '../components/fichas/FtInputs';
import FtResults from '../components/fichas/FtResults';
import { getResultados } from '../utils/financeCalculators';
import ConfirmModal from '../components/ConfirmModal';
import './Pedidos.css'; 

// --- Helpers ---
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
};

const INITIAL_FT_STATE = {
  indiceFt: '',
  nomePeca: 'Novo Item Orçamento',
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

// --- PRINT FUNCTION ---
const openPrintOrcamento = (orcamento, tenant = {}) => {
  const total = orcamento.items.reduce((s, it) => s + parseN(it.precoUnit) * parseN(it.qtd), 0);
  const label = 'ORÇAMENTO';
  const dateStr = new Date(orcamento.created_at).toLocaleDateString('pt-BR');
  const accentColor = '#3b82f6';
  const accentBg    = '#DBEAFE';

  const itensRows = orcamento.items.map((it, i) => `
    <tr class="${i % 2 === 0 ? 'row-even' : ''}">
      <td class="cell-center text-muted">${i + 1}</td>
      <td class="cell-id">${it.indiceFt || 'CUST'}</td>
      <td class="cell-name">${it.nomePeca}</td>
      <td class="cell-right text-muted">R$ ${fmt(it.precoUnit)}</td>
      <td class="cell-center cell-bold">${it.qtd}</td>
      <td class="cell-right cell-bold">R$ ${fmt(parseN(it.precoUnit) * parseN(it.qtd))}</td>
    </tr>
  `).join('');

  const logoHtml = tenant.logo_url 
    ? `<img class="logo-img" src="${tenant.logo_url}" alt="Logo" onerror="this.style.display='none'; document.getElementById('lf').style.display='flex';"/>`
    : `<img class="logo-img" src="${window.location.origin}/logo.png" alt="Logo" onerror="this.style.display='none'; document.getElementById('lf').style.display='flex';"/>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>${label} - ${tenant.name || 'AM3D'}</title>
  <style>
    @page { size: A4; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #1E293B; background: #fff; }
    .page { padding: 1.4cm 2cm; display: flex; flex-direction: column; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .logo-img { max-height: 80px; max-width: 170px; object-fit: contain; }
    .doc-badge { display: inline-block; padding: 5px 14px; background: ${accentBg}; color: ${accentColor}; font-size: 10pt; font-weight: bold; border-radius: 20px; margin-bottom: 6px; }
    .divider { height: 1px; background: #E2E8F0; margin: 10px 0; }
    .section-label { font-size: 8pt; font-weight: bold; text-transform: uppercase; color: ${accentColor}; margin-bottom: 6px; }
    .client-card { background: #F8FAFC; border-radius: 8px; border: 1px solid #E2E8F0; padding: 10px 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 9pt; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    thead tr { background: #1E293B; color: #fff; }
    thead th { padding: 8px; font-size: 8pt; text-align: left; }
    tbody td { padding: 8px; border-bottom: 1px solid #F1F5F9; font-size: 9pt; }
    .cell-right { text-align: right; }
    .cell-center { text-align: center; }
    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 10px; }
    .total-box { background: ${accentBg}; border-radius: 8px; padding: 10px 20px; text-align: right; }
    .total-label { font-size: 8pt; font-weight: bold; color: ${accentColor}; text-transform: uppercase; }
    .total-value { font-size: 16pt; font-weight: bold; color: ${accentColor}; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      ${logoHtml}
      <div style="text-align: right;">
        <div class="doc-badge">${label}</div>
        <div style="font-size: 9pt; color: #64748B;">📅 ${dateStr}</div>
      </div>
    </div>
    <div class="section-label">Dados do Cliente</div>
    <div class="client-card">
      <div><strong>Nome:</strong> ${orcamento.client_data.nome || '—'}</div>
      <div><strong>Telefone:</strong> ${orcamento.client_data.telefone || '—'}</div>
      <div><strong>E-mail:</strong> ${orcamento.client_data.email || '—'}</div>
      <div><strong>Endereço:</strong> ${orcamento.client_data.endereco || '—'}</div>
      ${orcamento.client_data.obs ? `<div style="grid-column: 1 / -1; margin-top: 8px;"><strong>Obs:</strong> ${orcamento.client_data.obs}</div>` : ''}
    </div>
    <div class="divider"></div>
    <div class="section-label">Itens do Orçamento</div>
    <table>
      <thead>
        <tr>
          <th style="width:30px">#</th>
          <th style="width:70px">Ref</th>
          <th>Descrição</th>
          <th style="width:90px;text-align:right">Preço Unit.</th>
          <th style="width:50px;text-align:center">Qtd</th>
          <th style="width:105px;text-align:right">Subtotal</th>
        </tr>
      </thead>
      <tbody>${itensRows}</tbody>
    </table>
    <div class="totals-wrap">
      <div class="total-box">
        <div class="total-label">Total do Orçamento</div>
        <div class="total-value">R$ ${fmt(total)}</div>
      </div>
    </div>
  </div>
  <script>window.onload = () => { window.print(); }</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=960,height=780');
  win.document.write(html);
  win.document.close();
};


// --- COMPONENTS ---

function CustomQuoteProductModal({ onClose, onSave }) {
  const [inputs, setInputs] = useState({ ...INITIAL_FT_STATE, indiceFt: `CUST-${Date.now().toString().slice(-4)}` });

  const handleChange = (e) => {
    let { name, value } = e.target;
    if (typeof value === 'string' && (name.startsWith('preco') || name.startsWith('custo') || name.startsWith('peso') || name.startsWith('extraValor'))) {
      value = value.replace(',', '.');
    }
    setInputs(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    if (!inputs.nomePeca) return alert("O Nome da peça não pode estar vazio.");
    onSave(inputs);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: '1000px', width: '95%' }}>
        <div className="modal-header">
          <h2>Novo Produto Customizado (Orçamento)</h2>
          <button className="btn-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <p style={{marginBottom: '1rem', color: 'var(--text-muted)'}}>
            Os itens criados aqui serão salvos apenas para orçamentos e não misturam com suas Fichas Técnicas originais.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <div>
              <FtInputs 
                inputs={inputs} 
                onChange={handleChange} 
                savedFts={[]}
                onManageInsumos={() => {}}
                onSelectInsumoClick={() => {}}
              />
            </div>
            <div>
              <FtResults inputs={inputs} />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" onClick={handleSave}>Salvar Produto</button>
        </div>
      </div>
    </div>
  );
}


function ModalOrcamento({ fts, customProducts, onSave, onCancel, initialData }) {
  const [cliente, setCliente] = useState(initialData?.client_data || { ...BLANK_CLIENTE });
  const [items, setItems] = useState(initialData?.items || []);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleClientChange = (e) => {
    const { name, value } = e.target;
    setCliente(prev => ({ ...prev, [name]: value }));
  };

  const handleAddItem = (e) => {
    const val = e.target.value;
    if (!val) return;
    
    // Check if it's FT or Custom
    let found = fts.find(f => f.indiceFt === val);
    let preco = 0;
    let isCustom = false;

    if (found) {
      preco = parseN(found.data?.precoVendaManual) || parseN(found.data?.precoPraticado) || 0;
    } else {
      found = customProducts.find(c => c.id === val);
      if (found) {
        preco = parseN(found.data?.precoVendaManual) || parseN(found.data?.precoPraticado) || 0;
        isCustom = true;
      }
    }

    if (found) {
      setItems(prev => [...prev, {
        indiceFt: isCustom ? found.id : found.indiceFt,
        nomePeca: isCustom ? found.name : found.nomePeca,
        qtd: 1,
        precoUnit: preco
      }]);
    }
    e.target.value = '';
  };

  const handleItemChange = (index, field, value) => {
    setItems(prev => {
      const next = [...prev];
      next[index][field] = value;
      return next;
    });
  };

  const handleRemoveItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveCustomProduct = async (customInputs) => {
    // Save to orcamentos_rapidos
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
      
      const precoFinal = parseN(customInputs.precoVendaManual) || getResultados(customInputs).precoPraticado || 0;
      setItems(prev => [...prev, {
        indiceFt: customInputs.indiceFt,
        nomePeca: customInputs.nomePeca,
        qtd: customInputs.quantidade,
        precoUnit: precoFinal
      }]);
      setShowCustomModal(false);
      // We should ideally refresh customProducts here, but since we add directly to items, it's fine.
    } catch (err) {
      alert("Erro ao salvar produto customizado.");
    }
  };

  const handleSaveOrcamento = async () => {
    if (!cliente.nome) return alert('Preencha o nome do cliente.');
    if (items.length === 0) return alert('Adicione pelo menos um item.');
    setIsSaving(true);
    await onSave({ cliente, items, id: initialData?.id });
    setIsSaving(false);
  };

  const totalGeral = items.reduce((s, it) => s + parseN(it.precoUnit) * parseN(it.qtd), 0);

  return (
    <div className="card orcamento-form-card" style={{ padding: '24px', animation: 'fadeIn 0.3s' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, color: 'var(--text-primary)' }}>{initialData ? 'Editar Orçamento' : 'Novo Orçamento'}</h2>
        <button className="btn-secondary btn-sm" onClick={onCancel}>Voltar para Lista</button>
      </div>
      <div className="card-body">
        <div className="form-grid">
          <div className="form-group">
            <label>Nome do Cliente</label>
            <input type="text" name="nome" value={cliente.nome} onChange={handleClientChange} />
          </div>
          <div className="form-group">
            <label>Telefone</label>
            <input type="text" name="telefone" value={cliente.telefone} onChange={handleClientChange} />
          </div>
          <div className="form-group">
            <label>E-mail</label>
            <input type="text" name="email" value={cliente.email} onChange={handleClientChange} />
          </div>
          <div className="form-group">
            <label>Endereço</label>
            <input type="text" name="endereco" value={cliente.endereco} onChange={handleClientChange} />
          </div>
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label>Observações</label>
            <input type="text" name="obs" value={cliente.obs} onChange={handleClientChange} />
          </div>
        </div>

        <div style={{ marginTop: '32px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          <h3 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0 }}>Itens do Orçamento</h3>
          <button className="btn-secondary btn-sm" onClick={() => setShowCustomModal(true)}>
            <Plus size={16} style={{marginRight: '6px'}}/> Novo Produto Customizado
          </button>
        </div>
        
        <div className="form-group" style={{ maxWidth: '400px' }}>
          <select onChange={handleAddItem} value="">
            <option value="">+ Selecionar Produto Existente...</option>
            <optgroup label="Fichas Técnicas">
              {fts.map(ft => (
                <option key={ft.indiceFt} value={ft.indiceFt}>{ft.indiceFt} - {ft.nomePeca}</option>
              ))}
            </optgroup>
            {customProducts.length > 0 && (
              <optgroup label="Produtos de Orçamentos">
                {customProducts.map(cp => (
                  <option key={cp.id} value={cp.id}>{cp.id} - {cp.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>

        <div className="items-table-wrapper" style={{ marginTop: '20px' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Descrição</th>
                <th style={{width: '120px'}}>R$ Unit.</th>
                <th style={{width: '100px'}}>Qtd</th>
                <th style={{width: '120px'}}>Subtotal</th>
                <th style={{width: '60px', textAlign: 'center'}}>Remover</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan="6" style={{textAlign: 'center', padding: '2rem', color: 'var(--text-muted)'}}>Nenhum item adicionado ao orçamento.</td></tr>}
              {items.map((it, idx) => {
                const subtot = parseN(it.precoUnit) * parseN(it.qtd);
                return (
                  <tr key={idx}>
                    <td style={{fontWeight: 'bold', color: 'var(--text-secondary)'}}>{it.indiceFt}</td>
                    <td>{it.nomePeca}</td>
                    <td>
                      <input type="number" step="0.01" className="input-sm" style={{width: '100%'}} value={it.precoUnit} onChange={(e) => handleItemChange(idx, 'precoUnit', e.target.value)} />
                    </td>
                    <td>
                      <input type="number" className="input-sm" style={{width: '100%'}} value={it.qtd} onChange={(e) => handleItemChange(idx, 'qtd', e.target.value)} />
                    </td>
                    <td style={{fontWeight: 'bold', color: 'var(--accent-primary)', fontSize: '1.1rem'}}>
                      R$ {fmt(subtot)}
                    </td>
                    <td style={{textAlign: 'center'}}>
                      <button className="btn-icon danger" onClick={() => handleRemoveItem(idx)}><Trash2 size={18} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        <div style={{ marginTop: '24px', padding: '16px', backgroundColor: 'var(--bg-secondary)', borderRadius: '8px', textAlign: 'right', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '24px' }}>
          <div style={{ fontSize: '1.4rem', color: 'var(--text-primary)' }}>
            Total: <strong style={{ color: 'var(--accent-primary)', fontSize: '1.8rem' }}>R$ {fmt(totalGeral)}</strong>
          </div>
        </div>
      </div>
      <div className="card-footer" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button className="btn-secondary" onClick={onCancel} style={{ padding: '10px 24px' }}>Cancelar</button>
        <button className="btn-primary" onClick={handleSaveOrcamento} disabled={isSaving} style={{ padding: '10px 32px', fontSize: '1.1rem' }}>
          {isSaving ? 'Salvando...' : 'Salvar Orçamento'}
        </button>
      </div>

      {showCustomModal && (
        <CustomQuoteProductModal 
          onClose={() => setShowCustomModal(false)}
          onSave={handleSaveCustomProduct}
        />
      )}
    </div>
  );
}

export default function Orcamentos() {
  const { profile } = useAuth();
  const [orcamentos, setOrcamentos] = useState([]);
  const [fts, setFts] = useState([]);
  const [customProducts, setCustomProducts] = useState([]);
  const [loadingDb, setLoadingDb] = useState(true);
  
  const [showModal, setShowModal] = useState(false);
  const [editingOrcamento, setEditingOrcamento] = useState(null);

  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: 'save', title: '', details: [], onConfirm: null });
  const closeConfirm = () => setConfirmModal(m => ({ ...m, isOpen: false }));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoadingDb(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      const [ordersResp, ftsResp, customResp] = await Promise.all([
        fetch(`${SUPA_URL}/rest/v1/orders?select=*&order=created_at.desc`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/fichas_tecnicas?select=id,name,data&order=name.asc`, { headers }),
        fetch(`${SUPA_URL}/rest/v1/orcamentos_rapidos?select=*&order=name.asc`, { headers })
      ]);

      if (ordersResp.ok) {
        const data = await ordersResp.json();
        setOrcamentos(data.filter(o => o.client_data?.tipo === 'orcamento'));
      }
      if (ftsResp.ok) {
        const data = await ftsResp.json();
        setFts(data.map(d => ({ indiceFt: d.data?.indiceFt || d.id, nomePeca: d.name, data: d.data })));
      }
      if (customResp.ok) {
        setCustomProducts(await customResp.json());
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingDb(false);
    }
  };

  const handleSaveOrcamento = async ({ cliente, items, id }) => {
    const total = items.reduce((s, it) => s + parseN(it.precoUnit) * parseN(it.qtd), 0);
    
    const dbRecord = {
      client_data: { ...cliente, tipo: 'orcamento' },
      items,
      total,
      status: 'pending' 
    };

    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const headers = { 
      'apikey': SUPA_KEY, 
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };

    let url = `${SUPA_URL}/rest/v1/orders`;
    let method = 'POST';

    if (id) {
      url += `?id=eq.${id}`;
      method = 'PATCH';
    }

    try {
      const resp = await fetch(url, { method, headers, body: JSON.stringify(dbRecord) });
      if (!resp.ok) throw new Error('Erro ao salvar');
      await fetchData();
      setShowModal(false);
      setEditingOrcamento(null);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleFaturar = (orc) => {
    setConfirmModal({
      isOpen: true,
      type: 'save',
      title: 'Faturar Orçamento (Aprovar)',
      details: ['Ao faturar este orçamento, ele será convertido em um Pedido de Venda aprovado (Pago) e entrará no Resumo financeiro. Confirmar?'],
      onConfirm: async () => {
        closeConfirm();
        const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const dbRecord = {
          client_data: { ...orc.client_data, tipo: 'pedido' },
          status: 'paid',
          payment_date: new Date().toISOString().split('T')[0]
        };
        await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${orc.id}`, {
          method: 'PATCH',
          headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(dbRecord)
        });
        await fetchData();
        alert('Orçamento faturado com sucesso! Agora ele consta como um Pedido na tela de Pedidos e Resumo.');
      }
    });
  };

  const handleRecusar = async (orc) => {
    if (!window.confirm('Tem certeza que deseja marcar este orçamento como Recusado?')) return;
    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${orc.id}`, {
      method: 'PATCH',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'rejected' })
    });
    fetchData();
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Excluir este orçamento definitivamente?')) return;
    const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    await fetch(`${SUPA_URL}/rest/v1/orders?id=eq.${id}`, {
      method: 'DELETE',
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    fetchData();
  };

  return (
    <div className="page-wrapper pedidos-page">
      {showModal ? (
        <ModalOrcamento
          fts={fts}
          customProducts={customProducts}
          onSave={handleSaveOrcamento}
          onCancel={() => { setShowModal(false); setEditingOrcamento(null); }}
          initialData={editingOrcamento}
        />
      ) : (
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">Orçamentos</h1>
              <p className="page-description">Crie orçamentos rápidos, cadastre clientes e aprove pedidos para o financeiro.</p>
            </div>
            <button className="btn-primary" onClick={() => { setEditingOrcamento(null); setShowModal(true); }}>
              + Novo Orçamento
            </button>
          </div>

          <div className="card">
            {loadingDb ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <Loader className="spinner" size={40} style={{ margin: '0 auto', color: 'var(--accent-primary)' }} />
              </div>
            ) : orcamentos.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                Nenhum orçamento pendente.
              </div>
            ) : (
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Cliente</th>
                      <th>Itens</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orcamentos.map(orc => (
                      <tr key={orc.id}>
                        <td>{new Date(orc.created_at).toLocaleDateString('pt-BR')}</td>
                        <td style={{ fontWeight: '600' }}>{orc.client_data?.nome}</td>
                        <td>{orc.items?.map(i => `${i.qtd}x ${i.nomePeca}`).join(', ')}</td>
                        <td style={{ fontWeight: 'bold', color: 'var(--accent-primary)' }}>R$ {fmt(orc.total)}</td>
                        <td>
                          {orc.status === 'pending' && <span className="badge" style={{background: '#FEF3C7', color: '#D97706'}}>Pendente</span>}
                          {orc.status === 'rejected' && <span className="badge" style={{background: '#FEE2E2', color: '#DC2626'}}>Recusado</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="action-buttons" style={{ justifyContent: 'flex-end' }}>
                            {orc.status === 'pending' && (
                              <>
                                <button className="btn-icon" onClick={() => handleFaturar(orc)} title="Faturar (Aprovar) e gerar pedido">
                                  <CheckCircle size={18} color="#059669" />
                                </button>
                                <button className="btn-icon" onClick={() => handleRecusar(orc)} title="Recusar Orçamento">
                                  <XCircle size={18} color="#DC2626" />
                                </button>
                              </>
                            )}
                            <button className="btn-icon" onClick={() => openPrintOrcamento(orc, profile?.tenants)} title="Imprimir Orçamento">
                              <Printer size={18} />
                            </button>
                            <button className="btn-icon" onClick={() => { setEditingOrcamento(orc); setShowModal(true); }} title="Editar">
                              <Edit2 size={18} />
                            </button>
                            <button className="btn-icon danger" onClick={() => handleDelete(orc.id)} title="Excluir">
                              <Trash2 size={18} />
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
        </>
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
