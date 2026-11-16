import { useState, useEffect } from 'react';
import { X, RefreshCw, Truck, ExternalLink, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../../supabaseClient';

const LOJA_API_BASE = 'https://aem3d-loja.vercel.app';

export default function SitePedidosModal({ isOpen, onClose, empresaId }) {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generatingId, setGeneratingId] = useState(null);

  const loadPedidos = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('loja_pedidos')
        .select('*')
        .eq('empresa_id', empresaId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setPedidos(data || []);
    } catch (err) {
      alert('Erro ao carregar pedidos do site: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) loadPedidos();
  }, [isOpen, empresaId]);

  if (!isOpen) return null;

  const handleStatusChange = async (pedidoId, nextStatus) => {
    try {
      const { error } = await supabase
        .from('loja_pedidos')
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', pedidoId);
      if (error) throw error;
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedidoId ? { ...p, status: nextStatus } : p))
      );
    } catch (err) {
      alert('Erro ao atualizar status: ' + err.message);
    }
  };

  const handleGerarEtiqueta = async (pedido) => {
    setGeneratingId(pedido.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token || '';

      const res = await fetch(`${LOJA_API_BASE}/api/etiqueta`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ pedidoId: pedido.id }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Falha ao enviar para o Melhor Envio.');
      }

      alert(
        `✅ Etiqueta enviada para o seu carrinho do Melhor Envio (Protocolo: ${data.protocol || data.melhorEnvioOrderId})! Abrindo o Melhor Envio para impressão...`
      );
      window.open(data.etiquetaUrl || 'https://melhorenvio.com.br/carrinho', '_blank');
      loadPedidos();
    } catch (err) {
      alert('Erro ao gerar etiqueta no Melhor Envio: ' + err.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const formatBRL = (v) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '980px', width: '95%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="modal-header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <div>
            <h3 style={{ margin: 0 }}>📦 Pedidos do Site Próprio (aem3d.com.br)</h3>
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Acompanhe os pedidos recebidos, pagamentos via Mercado Pago e gere etiquetas no Melhor Envio.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              onClick={loadPedidos}
              disabled={loading}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <RefreshCw size={15} className={loading ? 'spin' : ''} />
              Atualizar
            </button>
            <button type="button" className="btn-icon" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="modal-body" style={{ maxHeight: '72vh', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Carregando pedidos...
            </div>
          ) : pedidos.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Nenhum pedido registrado ainda na loja <strong>aem3d.com.br</strong>.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {pedidos.map((p) => {
                const end = p.endereco || {};
                const itens = Array.isArray(p.itens) ? p.itens : [];
                const isPaid = p.status === 'pago' || p.mp_status === 'approved';
                return (
                  <div
                    key={p.id}
                    style={{
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      padding: '14px 16px',
                      background: 'var(--bg-surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '8px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.96rem' }}>
                          Pedido #{p.numero_pedido}
                        </strong>
                        <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                          {new Date(p.created_at).toLocaleString('pt-BR')}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '999px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: isPaid ? 'rgba(16,185,129,0.14)' : 'rgba(245,158,11,0.14)',
                            color: isPaid ? '#059669' : '#D97706',
                          }}
                        >
                          {isPaid ? <CheckCircle2 size={13} /> : <Clock size={13} />}
                          {p.status.toUpperCase()} ({p.metodo_pagamento?.toUpperCase()})
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <select
                          value={p.status}
                          onChange={(e) => handleStatusChange(p.id, e.target.value)}
                          style={{
                            padding: '5px 8px',
                            borderRadius: '6px',
                            border: '1px solid var(--border-color)',
                            background: 'var(--bg-primary)',
                            color: 'var(--text-primary)',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                          }}
                        >
                          <option value="pendente">Pendente</option>
                          <option value="aguardando_pagamento">Aguardando Pagamento</option>
                          <option value="pago">Pago</option>
                          <option value="em_producao">Em Produção</option>
                          <option value="enviado">Enviado</option>
                          <option value="cancelado">Cancelado</option>
                        </select>

                        {p.melhor_envio_order_id ? (
                          <a
                            href={p.melhor_envio_etiqueta_url || 'https://melhorenvio.com.br/carrinho'}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '5px 10px',
                              borderRadius: '7px',
                              background: 'rgba(16,185,129,0.14)',
                              color: '#059669',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              textDecoration: 'none',
                            }}
                          >
                            <ExternalLink size={13} /> Abrir Etiqueta no Melhor Envio
                          </a>
                        ) : (
                          <button
                            type="button"
                            disabled={generatingId === p.id}
                            onClick={() => handleGerarEtiqueta(p)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '5px 11px',
                              borderRadius: '7px',
                              border: '1px solid rgba(37,99,235,0.4)',
                              background: 'rgba(37,99,235,0.1)',
                              color: '#2563EB',
                              fontSize: '0.76rem',
                              fontWeight: 700,
                              cursor: generatingId === p.id ? 'wait' : 'pointer',
                            }}
                          >
                            <Truck size={14} />
                            {generatingId === p.id
                              ? 'Gerando etiqueta...'
                              : '🏷️ Gerar Etiqueta Melhor Envio'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '10px',
                        fontSize: '0.8rem',
                      }}
                    >
                      <div>
                        <strong>Cliente:</strong> {p.cliente_nome}
                        {p.cliente_cpf ? ` • CPF: ${p.cliente_cpf}` : ''}
                        <br />
                        <strong>WhatsApp:</strong> {p.cliente_whatsapp || '—'}{' '}
                        {p.cliente_email ? `• ${p.cliente_email}` : ''}
                      </div>
                      <div>
                        <strong>Endereço:</strong> {end.rua || ''}, {end.numero || ''}{' '}
                        {end.complemento ? `(${end.complemento})` : ''} — {end.bairro || ''},{' '}
                        {end.cidade || ''}/{end.uf || ''} • CEP: {end.cep || '—'}
                      </div>
                      <div>
                        <strong>Valores:</strong> Subtotal {formatBRL(p.subtotal)}{' '}
                        {Number(p.desconto_pix) > 0 ? `• Pix -${formatBRL(p.desconto_pix)} ` : ''}
                        • Frete ({p.frete_servico || 'A combinar'}): {formatBRL(p.frete_valor)}
                        <br />
                        <strong style={{ color: 'var(--accent-primary)' }}>
                          Total: {formatBRL(p.total)}
                        </strong>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                        paddingTop: '6px',
                        borderTop: '1px dashed var(--border-color)',
                      }}
                    >
                      {itens.map((it, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: '0.75rem',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                          }}
                        >
                          <strong>{it.qty}x</strong> {it.titulo}
                          {it.variacaoNome ? ` (${it.variacaoNome})` : ''} — {formatBRL(it.preco)}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
