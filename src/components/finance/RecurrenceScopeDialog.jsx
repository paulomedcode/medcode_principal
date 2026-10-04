import React from 'react';
import { Repeat } from 'lucide-react';

/**
 * Diálogo de escopo para grupos de lançamentos (esta / futuras / todas).
 * Usado na exclusão de conta fixa, parcelamento e rateio.
 *
 * Props:
 *  - open: boolean
 *  - title, description: textos
 *  - busy: trava os botões durante a operação
 *  - onPick(scope): 'this' | 'future' | 'all'
 *  - onClose(): fecha sem agir
 *  - labels: sobrescreve os rótulos { this, future, all }
 *  - hideFuture: esconde o botão do meio (grupos sem noção de "próximas", ex.: rateio)
 */
export default function RecurrenceScopeDialog({ open, title = 'Aplicar em', description, busy = false, onPick, onClose, labels = {}, hideFuture = false }) {
  if (!open) return null;
  const L = { this: 'Só esta ocorrência', future: 'Esta e as próximas', all: 'Toda a série', ...labels };
  return (
    <div className="fixed inset-0 z-[11060] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" onClick={() => !busy && onClose()}></div>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm relative z-10 p-5 border border-black/[.06] animate-in zoom-in-95 duration-200">
        <div className="flex items-center gap-2 mb-1">
          <Repeat size={16} className="text-[#0071e3]" />
          <h4 className="text-base font-semibold text-slate-800 tracking-tight">{title}</h4>
        </div>
        {description && <p className="text-xs font-medium text-slate-500 mb-4">{description}</p>}
        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => onPick('this')}
            className="w-full h-11 px-4 text-left text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-black/[.085] rounded-xl transition-colors disabled:opacity-60">
            {L.this}
          </button>
          {!hideFuture && (
            <button type="button" disabled={busy} onClick={() => onPick('future')}
              className="w-full h-11 px-4 text-left text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-black/[.085] rounded-xl transition-colors disabled:opacity-60">
              {L.future}
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => onPick('all')}
            className="w-full h-11 px-4 text-left text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors disabled:opacity-60">
            {L.all}
          </button>
        </div>
        <button type="button" disabled={busy} onClick={onClose}
          className="mt-3 w-full text-[12.5px] font-medium text-slate-400 hover:text-slate-600">
          Cancelar
        </button>
      </div>
    </div>
  );
}
