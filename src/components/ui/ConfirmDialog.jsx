import React, { useEffect } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Modal de confirmação estilizado — substitui o confirm() nativo do navegador.
 * Controlado: renderize sempre e controle por `open`.
 *
 * Props:
 *  - open: boolean
 *  - title, message: textos (message aceita string ou ReactNode)
 *  - confirmLabel (default 'Confirmar'), cancelLabel (default 'Cancelar')
 *  - tone: 'danger' (default) | 'primary'
 *  - busy: trava os botões durante a operação
 *  - onConfirm(), onCancel()
 */
export default function ConfirmDialog({
  open,
  title = 'Confirmar ação',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  // Esc cancela; Enter confirma.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.();
      if (e.key === 'Enter' && !busy) onConfirm?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onConfirm, onCancel]);

  if (!open) return null;

  const danger = tone === 'danger';
  const confirmBtn = danger
    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-600/20';
  const iconWrap = danger ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600';

  return (
    <div className="fixed inset-0 z-[11200] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in" onClick={() => !busy && onCancel?.()}></div>
      <div className="relative z-10 w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-5 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 grid place-items-center h-10 w-10 rounded-xl ${iconWrap}`}>
            <AlertTriangle size={18} strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-black text-slate-800 tracking-tight">{title}</h4>
            {message && <p className="mt-1 text-xs font-medium text-slate-500 leading-relaxed">{message}</p>}
          </div>
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-9 px-4 rounded-xl text-[11px] font-black uppercase tracking-wider text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`h-9 px-5 rounded-xl text-[11px] font-black uppercase tracking-wider text-white shadow-md transition-colors flex items-center gap-2 disabled:opacity-60 ${confirmBtn}`}
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
