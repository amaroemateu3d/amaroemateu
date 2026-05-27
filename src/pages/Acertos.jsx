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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [salesToRegister, setSalesToRegister] = useState({}); // { [ftId]: quantity }

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    setLoading(true);
    try {
      const SUPA_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

      const resp = await fetch(`${SUPA_URL}/rest/v1/consignados?select=*&order=created_at.desc`, { headers });
      if (resp.ok) {
        setAccounts(await resp.json());
      }
    } catch (e) {
      console.error('Erro ao buscar contas:', e);
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
      .sort((a, b) => String(a.indiceFt).localeCompare(String(b.indiceFt)));
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

              paymentItemsRecord.push({
                batchId: batch.id,
                indiceFt: item.indiceFt,
                nomePeca: item.nomePeca,
                qtd: toAllocate,
                precoUnit: parseN(item.precoUnit)
              });

              totalAmount += toAllocate * parseN(item.precoUnit);
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

      alert(`Acerto registrado com sucesso!\n\nRecebido: R$ ${fmt(totalAmount)}`);
      
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
                        {acc.cliente?.tipoAcerto === 'comissionado' && (
                          <span style={{ fontSize: '0.7rem', color: '#fbbf24', background: 'rgba(245, 158, 11, 0.1)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(245,158,11,0.2)', display: 'inline-block', marginTop: '4px' }}>
                            Comissionado ({acc.cliente?.comissaoPct}%)
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="card-bottom">
                      <span className="balance-label">Saldo em Aberto:</span>
                      <span className={`balance-value ${stats.balance > 0 ? 'red' : 'green'}`}>
                        R$ {fmt(stats.balance)}
                      </span>
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
                return (
                  <div key={it.indiceFt} className={`acerto-item-row ${selectedQty > 0 ? 'active' : ''}`}>
                    <div className="item-meta">
                      <div className="item-title">
                        <span className="item-ft-badge">{it.indiceFt}</span>
                        <h4>{it.nomePeca}</h4>
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
    </div>
  );
}
