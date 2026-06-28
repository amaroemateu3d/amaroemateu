import { useEffect } from 'react';
import './ConfirmModal.css';

/**
 * Modal de Confirmação Reutilizável
 *
 * Props:
 * - isOpen: boolean — controla visibilidade
 * - type: 'save' | 'delete' | 'edit' — define paleta de cores
 * - title: string — título do modal
 * - details: Array<{ label: string, value: string }> — itens de detalhe
 * - onConfirm: () => void — callback de confirmação
 * - onCancel: () => void — callback de cancelamento
 * - confirmText: string (opcional) — texto do botão confirmar
 * - cancelText: string (opcional) — texto do botão cancelar
 */
export default function ConfirmModal({
  isOpen,
  type = 'save',
  title,
  details = [],
  onConfirm,
  onCancel,
  confirmText,
  cancelText = 'Cancelar',
}) {
  // Fecha com ESC
  useEffect(() => {
    if (!isOpen) return;
    const handle = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const config = {
    save: {
      icon: '💾',
      accentClass: 'cm-save',
      confirmLabel: confirmText || 'Salvar',
      badge: 'SALVAR',
    },
    edit: {
      icon: '✏️',
      accentClass: 'cm-edit',
      confirmLabel: confirmText || 'Atualizar',
      badge: 'EDITAR',
    },
    delete: {
      icon: '🗑️',
      accentClass: 'cm-delete',
      confirmLabel: confirmText || 'Excluir',
      badge: 'EXCLUIR',
    },
  }[type] || {};

  return (
    <div className="cm-overlay" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className={`cm-modal ${config.accentClass}`}>
        {/* Header */}
        <div className="cm-header">
          <span className="cm-icon">{config.icon}</span>
          <div className="cm-title-block">
            <span className={`cm-badge ${config.accentClass}`}>{config.badge}</span>
            <h3 className="cm-title">{title}</h3>
          </div>
          <button className="cm-close" onClick={onCancel} aria-label="Fechar">×</button>
        </div>

        {/* Detalhes */}
        {details.length > 0 && (
          <div className="cm-details">
            {details.map((item, i) => (
              <div key={i} className={`cm-detail-row ${config.accentClass}`}>
                <span className="cm-detail-label">{item.label}</span>
                <span className="cm-detail-value">{item.value ?? '—'}</span>
              </div>
            ))}
          </div>
        )}

        {/* Aviso para delete */}
        {type === 'delete' && (
          <div className="cm-warning">
            ⚠️ Esta ação <strong>não pode ser desfeita</strong>. Confirme antes de prosseguir.
          </div>
        )}

        {/* Ações */}
        <div className="cm-actions">
          <button className="cm-btn-cancel" onClick={onCancel}>{cancelText}</button>
          <button className={`cm-btn-confirm ${config.accentClass}`} onClick={onConfirm}>
            {config.icon} {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
