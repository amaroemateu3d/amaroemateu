import { useState, useEffect } from 'react';
import { X, Save, Settings, Link2, CheckCircle2 } from 'lucide-react';
import {
  extractShopeeCodeAndShopId,
  getShopeeAppCredentials,
  saveShopeeAppCredentialsLocal
} from '../../services/shopee';

export function ShopeePasteUrlModal({ isOpen, onClose, onConfirm, loading }) {
  const [inputVal, setInputVal] = useState('');
  const [parsed, setParsed] = useState({ code: null, shopId: null });

  useEffect(() => {
    if (isOpen) {
      setInputVal('');
      setParsed({ code: null, shopId: null });
    }
  }, [isOpen]);

  const handleChange = (val) => {
    setInputVal(val);
    const res = extractShopeeCodeAndShopId(val);
    setParsed(res);
  };

  if (!isOpen) return null;

  return (
    <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className="cm-modal cm-edit" style={{ maxWidth: '520px' }}>
        <div className="cm-header" style={{ background: '#FFF7ED', borderBottom: '1px solid #FFEDD5' }}>
          <span className="cm-icon">🛍️</span>
          <div className="cm-title-block">
            <span className="cm-badge" style={{ background: '#EE4D2D', color: '#FFFFFF' }}>CONEXÃO MANUAL SHOPEE</span>
            <h3 className="cm-title" style={{ color: '#9A3412' }}>Colar Código ou URL de Retorno</h3>
          </div>
          <button className="cm-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <div style={{ padding: '1rem 1.4rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Após autorizar sua loja na Shopee, cole aqui a <strong>URL completa da barra de endereços</strong> ou o código retornado (ex: <code>?code=...&shop_id=...</code>).
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '5px' }}>
              URL ou Código da Shopee
            </label>
            <textarea
              rows={3}
              className="cm-input"
              style={{ width: '100%', resize: 'vertical', fontSize: '0.85rem', fontFamily: 'monospace' }}
              placeholder="https://amaroemateu.vercel.app/estoque?code=...&shop_id=..."
              value={inputVal}
              onChange={(e) => handleChange(e.target.value)}
              autoFocus
            />
          </div>

          {(parsed.code || parsed.shopId) && (
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '10px 12px', borderRadius: '8px', fontSize: '0.82rem' }}>
              <div style={{ color: '#166534', fontWeight: 700, marginBottom: '4px' }}>
                ✓ Parâmetros Detectados:
              </div>
              <div><strong>Code:</strong> <code>{parsed.code ? `${parsed.code.slice(0, 16)}...` : 'Não detectado'}</code></div>
              <div><strong>Shop ID:</strong> <code>{parsed.shopId || 'Não detectado'}</code></div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button type="button" className="cm-btn-cancel" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={loading || !parsed.code || !parsed.shopId}
              onClick={() => onConfirm(parsed)}
              style={{
                background: '#EE4D2D',
                borderColor: '#EA580C',
                color: '#FFFFFF',
                padding: '0.55rem 1.2rem',
                minWidth: '130px',
                justifyContent: 'center'
              }}
            >
              {loading ? 'Conectando...' : 'Conectar Loja'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ShopeeAppConfigModal({ isOpen, onClose, onSaved }) {
  const [form, setForm] = useState(() => getShopeeAppCredentials());

  useEffect(() => {
    if (isOpen) {
      setForm(getShopeeAppCredentials());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    saveShopeeAppCredentialsLocal(form);
    if (onSaved) onSaved(form);
    if (onClose) onClose();
  };

  return (
    <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && onClose && onClose()}>
      <div className="cm-modal cm-edit" style={{ maxWidth: '560px' }}>
        <div className="cm-header" style={{ background: '#FFF7ED', borderBottom: '1px solid #FFEDD5' }}>
          <span className="cm-icon">⚙️</span>
          <div className="cm-title-block">
            <span className="cm-badge" style={{ background: '#EE4D2D', color: '#FFFFFF' }}>SHOPEE OPEN PLATFORM v2</span>
            <h3 className="cm-title" style={{ color: '#9A3412' }}>Credenciais do App Shopee</h3>
          </div>
          <button className="cm-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '1.1rem 1.4rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p style={{ margin: 0, fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.45 }}>
            Configure o <strong>Partner ID</strong> e <strong>Partner Key</strong> do aplicativo criado no console oficial da Shopee (<code>open.shopee.com</code>).
          </p>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Partner ID *
            </label>
            <input
              type="text"
              className="cm-input"
              value={form.partnerId}
              onChange={(e) => setForm({ ...form, partnerId: e.target.value })}
              placeholder="Ex: 1252796"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Partner Key (API Key v2) *
            </label>
            <input
              type="password"
              className="cm-input"
              value={form.partnerKey}
              onChange={(e) => setForm({ ...form, partnerKey: e.target.value })}
              placeholder="Chave secreta de 64 caracteres"
              required
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '4px' }}>
              Redirect URI (URL de Redirecionamento) *
            </label>
            <input
              type="url"
              className="cm-input"
              value={form.redirectUri}
              onChange={(e) => setForm({ ...form, redirectUri: e.target.value })}
              placeholder="https://amaroemateu.vercel.app/estoque"
              required
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={form.isTest}
              onChange={(e) => setForm({ ...form, isTest: e.target.checked })}
              style={{ width: '16px', height: '16px', accentColor: '#EE4D2D' }}
            />
            <span>Usar ambiente de Testes da Shopee (<code>partner.test-stable.shopeemobile.com</code>)</span>
          </label>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
            <button type="button" className="cm-btn-cancel" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="btn-primary"
              style={{
                background: '#EE4D2D',
                borderColor: '#EA580C',
                color: '#FFFFFF',
                padding: '0.55rem 1.2rem',
                minWidth: '120px',
                justifyContent: 'center'
              }}
            >
              Salvar Credenciais
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
