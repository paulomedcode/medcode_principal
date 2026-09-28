import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileSignature, CalendarClock, Building, ShieldCheck, Loader2, ClipboardList, AlertTriangle, Check } from 'lucide-react';
import { fetchPendingSignatures } from '../../utils/folhaAssinaturas';
import { tarefasAtribuidas } from '../../services/notificacoes';
import { concluirLembrete } from '../../services/concluirLembrete';
import SignFolhaModal from './SignFolhaModal.jsx';
import { CARD_SHELL, CardHeader } from './cardUI.jsx';

/*
 * PENDÊNCIAS — card único da tela inicial (médico e administrativo).
 *
 * Junta num lugar só tudo que está esperando uma ação da pessoa logada:
 *   • folha de ponto enviada pelo RH aguardando assinatura eletrônica;
 *   • compromisso do módulo Compromisso atribuído a ela E com data marcada
 *     (é a data que transforma a tarefa em lembrete: "quinta que vem").
 *
 * Antes a assinatura vivia num widget próprio, colocado à mão num slot da
 * home; quem tivesse outro layout simplesmente nunca via a folha. Aqui a
 * pendência é do usuário, não do layout: as duas telas iniciais mostram este
 * card, então não existe mais combinação de configuração que a esconda.
 */

// Compromisso muito distante não é pendência, é agenda — encheria o card e
// empurraria o que precisa de ação hoje para fora da vista.
const HORIZONTE_DIAS = 30;

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const formatMonthLabel = (monthVal) => {
    if (!monthVal || !monthVal.includes('-')) return monthVal || '';
    const [y, m] = monthVal.split('-');
    return `${MESES[parseInt(m, 10) - 1] || m} de ${y}`;
};

const hojeZerado = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

const parseISO = (dataISO) => {
    const [y, m, d] = String(dataISO || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
};

// "Hoje", "Amanhã", "Atrasado há 3 dias", "Em 5 dias" — a régua que faz a
// pessoa entender a urgência sem precisar comparar datas de cabeça.
const prazoLabel = (data) => {
    const dias = Math.round((data - hojeZerado()) / 86400000);
    if (dias === 0) return { texto: 'Hoje', urgente: true };
    if (dias === 1) return { texto: 'Amanhã', urgente: true };
    if (dias < 0) return { texto: dias === -1 ? 'Atrasado 1 dia' : `Atrasado ${Math.abs(dias)} dias`, urgente: true, atrasado: true };
    return { texto: `Em ${dias} dias`, urgente: false };
};

const dataCurta = (data, hora) => {
    const dia = `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
    return hora ? `${dia} · ${hora}` : dia;
};

// ---------------------------------------------------------------------------

const LinhaPendencia = ({ item, onClick, onConcluir }) => {
    const assinatura = item.tipo === 'assinatura';
    const atrasado = !!item.prazo?.atrasado;
    const Icone = assinatura ? Building : ClipboardList;

    // Um tom por estado, aplicado de leve: o que pede ação fica quente, o resto
    // fica neutro. Sem borda grossa — a cor já separa a linha do fundo.
    const fundo = assinatura ? 'bg-amber-400/[0.12] hover:bg-amber-400/20'
        : atrasado ? 'bg-rose-400/[0.12] hover:bg-rose-400/20'
            : 'bg-white/55 hover:bg-white/80';
    const tomIcone = assinatura ? 'text-amber-600' : atrasado ? 'text-rose-500' : 'text-slate-400';
    const tomTitulo = assinatura ? 'text-amber-900' : atrasado ? 'text-rose-900' : 'text-slate-800';
    const tomApoio = assinatura ? 'text-amber-700/70' : atrasado ? 'text-rose-700/70' : 'text-slate-400';

    // Dois botões lado a lado, e não um dentro do outro: abrir a pendência e
    // dar baixa nela são ações diferentes, e botão dentro de botão não é HTML
    // válido (o clique de dentro vazaria para o de fora).
    //
    // O título ocupa até duas linhas: lembrete escrito à mão ("Verificar 2.450
    // do Leo, se foi pago ou não") não cabe em uma só, e cortado no meio a
    // linha vira um enigma. Passando de duas linhas ainda tem reticências —
    // o texto inteiro fica no title e no Compromisso. Como a linha cresce, o
    // ícone, o prazo e o Concluir se alinham pelo topo, na altura da primeira
    // linha, em vez de flutuarem no meio do bloco.
    return (
        <div className={`w-full rounded-2xl transition-colors flex items-start shrink-0 ${fundo}`}>
            <button onClick={onClick} className="min-w-0 flex-1 text-left px-2.5 py-2 flex items-start gap-2.5">
                <Icone size={14} className={`shrink-0 mt-[2px] ${tomIcone}`} />
                <div className="min-w-0 flex-1">
                    <p className={`text-[12.5px] font-semibold leading-snug line-clamp-2 break-words ${tomTitulo}`} title={item.titulo}>{item.titulo}</p>
                    <p className={`text-[10.5px] font-medium leading-snug mt-0.5 truncate ${tomApoio}`}>{item.legenda}</p>
                </div>
                {item.prazo && (
                    <span className={`text-[10px] font-medium shrink-0 mt-[2px] ${item.prazo.urgente ? 'text-rose-500' : 'text-slate-400'}`}>
                        {item.prazo.texto}
                    </span>
                )}
            </button>

            {/* Só compromisso: folha de ponto não se "conclui", se assina. */}
            {onConcluir && (
                <button
                    onClick={onConcluir}
                    title="Concluir este lembrete"
                    aria-label={`Concluir: ${item.titulo}`}
                    className="shrink-0 mr-1.5 ml-0.5 mt-1 w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-100/70 transition-colors"
                >
                    <Check size={15} strokeWidth={3} />
                </button>
            )}
        </div>
    );
};

export const PendenciasWidget = ({ currentUser }) => {
    const navigate = useNavigate();
    const [itens, setItens] = useState([]);
    const [loading, setLoading] = useState(true);
    const [folhaAberta, setFolhaAberta] = useState(null);
    // Lembrete esperando o "sim" da confirmação, e o que está sendo gravado.
    const [confirmar, setConfirmar] = useState(null);
    const [concluindo, setConcluindo] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            if (!currentUser) return;
            // As duas origens são independentes: uma falhando (banco sem as tabelas
            // do Compromisso, por exemplo) não pode derrubar a outra.
            const [folhas, tarefas] = await Promise.all([
                fetchPendingSignatures(currentUser).catch((e) => { console.error('Erro ao buscar folhas pendentes', e); return []; }),
                tarefasAtribuidas(currentUser.id).catch((e) => { console.error('Erro ao buscar compromissos', e); return []; }),
            ]);

            const limite = new Date(hojeZerado().getTime() + HORIZONTE_DIAS * 86400000);

            const deFolhas = folhas.map((f) => ({
                id: `folha:${f.id}`,
                tipo: 'assinatura',
                titulo: `Assinar folha · ${f.hospital_name}`,
                legenda: formatMonthLabel(f.month_val),
                prazo: null,
                registro: f,
            }));

            const deTarefas = tarefas
                .map((t) => ({ t, data: parseISO(t.dataISO) }))
                // Sem data não é lembrete — fica só no sino, como tarefa atribuída.
                .filter(({ data }) => data && data <= limite)
                .sort((a, b) => a.data - b.data)
                .map(({ t, data }) => ({
                    id: t.id,
                    tipo: 'compromisso',
                    titulo: t.titulo,
                    legenda: dataCurta(data, t.hora),
                    prazo: prazoLabel(data),
                    rowId: t.rowId,
                }));

            // Assinatura na frente: trava o repasse ao financeiro, então é a
            // pendência que segura dinheiro.
            if (active) { setItens([...deFolhas, ...deTarefas]); setLoading(false); }
        })();
        return () => { active = false; };
    }, [currentUser]);

    const abrir = (item) => {
        if (item.tipo === 'assinatura') return setFolhaAberta(item.registro);
        navigate(item.rowId ? `/compromissos?abrir=${item.rowId}` : '/compromissos');
    };

    const aoAssinar = (id) => {
        setFolhaAberta(null);
        setItens((prev) => prev.filter((i) => i.id !== `folha:${id}`));
    };

    // Dar baixa sem sair da tela inicial: é aqui que a pessoa vê a pendência,
    // e mandá-la abrir o Compromisso só para clicar em Concluir era um desvio.
    const confirmarConclusao = async () => {
        if (!confirmar) return;
        setConcluindo(true);
        try {
            const r = await concluirLembrete(confirmar.rowId, currentUser);
            if (!r.ok) { toast.error(r.motivo); return; }
            setItens((prev) => prev.filter((i) => i.id !== confirmar.id));
            toast.success('Lembrete concluído.');
            setConfirmar(null);
        } catch (e) {
            console.error(e);
            toast.error('Não deu para concluir o lembrete.');
        } finally {
            setConcluindo(false);
        }
    };

    return (
        <>
            <div className={`${CARD_SHELL} flex-1 min-h-0 p-4 flex flex-col overflow-hidden`}>
                <CardHeader
                    icon={AlertTriangle}
                    title="Pendências"
                    action={itens.length > 0 && (
                        <span className="shrink-0 min-w-[18px] text-center text-[10px] font-semibold text-white bg-rose-500 rounded-full px-1.5 py-[3px] leading-none tabular-nums">
                            {itens.length}
                        </span>
                    )}
                />
                <div className="flex flex-col gap-1.5 overflow-y-auto no-scrollbar flex-1 min-h-0">
                    {loading ? (
                        <div className="flex-1 flex items-center justify-center">
                            <Loader2 size={16} className="animate-spin text-indigo-300" />
                        </div>
                    ) : itens.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center gap-1.5 py-2">
                            <ShieldCheck size={20} className="text-emerald-400/70" />
                            <span className="text-[11.5px] font-medium text-slate-400">Nada pendente</span>
                        </div>
                    ) : (
                        itens.map((item) => (
                            <LinhaPendencia
                                key={item.id}
                                item={item}
                                onClick={() => abrir(item)}
                                onConcluir={item.tipo === 'compromisso' && item.rowId ? () => setConfirmar(item) : null}
                            />
                        ))
                    )}
                </div>
            </div>

            {confirmar && (
                <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] p-4" onClick={() => !concluindo && setConfirmar(null)}>
                    <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-5" onClick={(e) => e.stopPropagation()}>
                        <p className="text-[15px] font-bold text-slate-800">Você já resolveu essa pendência?</p>
                        <p className="text-[12.5px] font-medium text-slate-500 mt-1.5 leading-snug">
                            <span className="font-bold text-slate-700">{confirmar.titulo}</span> sai daqui e fica registrado no Compromisso, com a data e o seu nome.
                        </p>
                        <div className="flex justify-end gap-2 mt-4">
                            <button onClick={() => setConfirmar(null)} disabled={concluindo}
                                className="px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
                                Ainda não
                            </button>
                            <button onClick={confirmarConclusao} disabled={concluindo}
                                className="px-3.5 py-2 rounded-xl text-[12.5px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-60">
                                {concluindo ? 'Registrando…' : 'Sim, concluir'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {folhaAberta && (
                <SignFolhaModal
                    record={folhaAberta}
                    currentUser={currentUser}
                    onClose={() => setFolhaAberta(null)}
                    onSigned={aoAssinar}
                />
            )}
        </>
    );
};
