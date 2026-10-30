import { useEffect, useState } from 'react';
import { Video, Loader2, Copy, Check, ExternalLink, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../services/supabase';
import { statusGoogle, marcarReuniao } from '../../services/google';
import { Janela, Campo, inputCls, textareaCls, btnPrimario, btnSecundario } from './ui';
import CampoData from '../ui/CampoData';

/*
 * Marcar reunião com link do Meet, de dentro do histórico (venda, cliente ou
 * projeto). O servidor cria o evento no Google Agenda de quem marcou, manda o
 * convite para os e-mails e registra no histórico — que é o que faz a reunião
 * aparecer na agenda do Início, com o botão do Meet.
 *
 * Depois de marcar, a janela mostra o link e um texto pronto para mandar pelo
 * WhatsApp (o convite por e-mail o Google já mandou).
 */

const hojeISO = () => { const d = new Date(); const p = (x) => String(x).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const dataBR = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }); };
const soDigitos = (t) => String(t || '').replace(/\D/g, '');

export default function MarcarReuniao({ vinculo, onClose, onMarcada }) {
    const [google, setGoogle] = useState(null);
    const [empresa, setEmpresa] = useState(null);
    const [form, setForm] = useState({ titulo: '', data: hojeISO(), hora: '10:00', duracaoMin: 60, convidados: '', descricao: '' });
    const [salvando, setSalvando] = useState(false);
    const [feito, setFeito] = useState(null);
    const [copiado, setCopiado] = useState(false);
    const set = (p) => setForm((f) => ({ ...f, ...p }));

    useEffect(() => {
        statusGoogle().then(setGoogle).catch(() => setGoogle({ configurado: false, conectado: false }));
        if (!vinculo?.party_id) return;
        // E-mails do cliente para já virem no convite.
        Promise.all([
            supabase.from('finance_parties').select('name, email, telefone').eq('id', vinculo.party_id).maybeSingle(),
            supabase.from('crm_contatos').select('nome, email, telefone, principal').eq('party_id', vinculo.party_id),
        ]).then(([{ data: emp }, { data: contatos }]) => {
            setEmpresa({ ...emp, contatos: contatos || [] });
            const emails = [emp?.email, ...(contatos || []).sort((a, b) => Number(b.principal) - Number(a.principal)).map((c) => c.email)].filter(Boolean);
            setForm((f) => ({
                ...f,
                titulo: f.titulo || (emp?.name ? `Reunião com ${emp.name}` : ''),
                convidados: f.convidados || [...new Set(emails)].join(', '),
            }));
        });
    }, [vinculo?.party_id]);

    const marcar = async () => {
        if (!form.titulo.trim()) return toast.error('Dê um nome para a reunião.');
        if (!form.data || !form.hora) return toast.error('Escolha dia e hora.');
        setSalvando(true);
        try {
            const r = await marcarReuniao({
                ...vinculo, titulo: form.titulo.trim(), data: form.data, hora: form.hora,
                duracaoMin: Number(form.duracaoMin), descricao: form.descricao,
                convidados: form.convidados.split(/[,;\s]+/).filter(Boolean),
            });
            setFeito(r);
            onMarcada?.();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSalvando(false);
        }
    };

    const convite = feito
        ? `Olá! Nossa reunião "${form.titulo.trim()}" ficou marcada para ${dataBR(form.data)}, às ${form.hora}.\nLink do Google Meet: ${feito.meet}`
        : '';
    const telefone = soDigitos(empresa?.contatos?.find((c) => c.principal && c.telefone)?.telefone || empresa?.telefone || empresa?.contatos?.find((c) => c.telefone)?.telefone);
    const whats = telefone ? `https://wa.me/${telefone.length <= 11 ? `55${telefone}` : telefone}?text=${encodeURIComponent(convite)}` : null;

    const copiar = async () => {
        try { await navigator.clipboard.writeText(convite); setCopiado(true); setTimeout(() => setCopiado(false), 2000); }
        catch { toast.error('Não deu para copiar.'); }
    };

    // ---- Depois de marcar ----
    if (feito) {
        return (
            <Janela titulo="Reunião marcada" icone={Video} onClose={onClose} largura="max-w-lg"
                rodape={<button onClick={onClose} className={btnPrimario}>Fechar</button>}>
                <p className="text-[13px] text-slate-700">
                    Está no seu Google Agenda e na agenda do Início.
                    {feito.convidados > 0 ? ` O Google mandou o convite para ${feito.convidados} e-mail(s).` : ' Ninguém foi convidado por e-mail.'}
                </p>
                {feito.meet ? (
                    <div className="bg-white border border-black/[.07] rounded-xl p-3 space-y-2">
                        <p className="text-[11px] font-medium text-slate-500">Link do Meet</p>
                        <a href={feito.meet} target="_blank" rel="noopener noreferrer" className="text-[14px] font-semibold text-sky-600 hover:underline break-all">{feito.meet}</a>
                    </div>
                ) : (
                    <p className="text-[12px] text-amber-700">O Google não devolveu o link do Meet. Abra o evento no Google Agenda para conferir.</p>
                )}
                <div className="bg-white border border-black/[.07] rounded-xl p-3">
                    <p className="text-[11px] font-medium text-slate-500 mb-1">Mensagem pronta</p>
                    <p className="text-[12.5px] text-slate-700 whitespace-pre-wrap">{convite}</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={copiar} className={btnSecundario + ' border border-black/[.08] flex items-center gap-1.5'}>
                            {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}
                        </button>
                        {whats && (
                            <a href={whats} target="_blank" rel="noopener noreferrer" className={btnSecundario + ' border border-black/[.08] flex items-center gap-1.5'}>
                                <MessageCircle size={13} /> Mandar no WhatsApp
                            </a>
                        )}
                        {feito.link && (
                            <a href={feito.link} target="_blank" rel="noopener noreferrer" className={btnSecundario + ' flex items-center gap-1.5'}>
                                <ExternalLink size={13} /> Ver no Google
                            </a>
                        )}
                    </div>
                </div>
            </Janela>
        );
    }

    const semGoogle = google && !google.conectado;

    return (
        <Janela titulo="Marcar reunião" icone={Video} onClose={onClose} largura="max-w-lg"
            rodape={<>
                <button onClick={onClose} className={btnSecundario}>Cancelar</button>
                <button onClick={marcar} disabled={salvando || !google || semGoogle} className={btnPrimario}>
                    {salvando ? <Loader2 size={13} className="animate-spin" /> : <Video size={13} />} Marcar e gerar Meet
                </button>
            </>}>
            {!google ? (
                <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-slate-300" /></div>
            ) : semGoogle ? (
                <p className="text-[12.5px] text-amber-700 bg-amber-50 rounded-lg p-3">
                    {google.configurado
                        ? 'Conecte seu Google Agenda primeiro: no Início, botão "Conectar Google Agenda" acima da agenda.'
                        : 'A integração com o Google ainda não foi configurada no servidor.'}
                </p>
            ) : null}
            <Campo label="Assunto">
                <input value={form.titulo} onChange={(e) => set({ titulo: e.target.value })} className={inputCls} placeholder="Ex: Apresentação da proposta" autoFocus />
            </Campo>
            <div className="grid grid-cols-3 gap-2">
                <Campo label="Dia"><CampoData min={hojeISO()} value={form.data} onChange={(e) => set({ data: e.target.value })} className={inputCls} /></Campo>
                <Campo label="Hora"><input type="time" value={form.hora} onChange={(e) => set({ hora: e.target.value })} className={inputCls} /></Campo>
                <Campo label="Duração">
                    <select value={form.duracaoMin} onChange={(e) => set({ duracaoMin: e.target.value })} className={inputCls}>
                        {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`.replace('.5', ',5')}</option>)}
                    </select>
                </Campo>
            </div>
            <Campo label="Convidar por e-mail (separe por vírgula)">
                <input value={form.convidados} onChange={(e) => set({ convidados: e.target.value })} className={inputCls} placeholder="cliente@empresa.com" />
            </Campo>
            <Campo label="Pauta (opcional — vai no convite)">
                <textarea value={form.descricao} onChange={(e) => set({ descricao: e.target.value })} className={`${textareaCls} h-16`} />
            </Campo>
        </Janela>
    );
}
