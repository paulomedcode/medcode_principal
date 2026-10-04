// ============================================================================
// Os blocos de permissão — a mesma grade da tela inicial, agora como controle.
//
// A matriz antiga era uma coluna de checkbox por perfil: dez listas iguais lado
// a lado, sem nenhuma relação visível com o sistema que elas governam. Aqui o
// bloco é o mesmo bloco que o usuário vê na home: liga/desliga o módulo inteiro
// no interruptor do card, e abre o card para acertar o que se faz lá dentro.
//
// O componente não sabe se está editando um PERFIL ou um USUÁRIO — recebe os
// valores e devolve as mudanças. Quem chama decide o significado:
//  - matriz de perfis: `values` são as permissões do cargo;
//  - extras de um usuário: `values` são os extras e `inherited` é o que o cargo
//    já dá (aparece marcado e travado, porque extra só soma).
// ============================================================================
import React, { useState } from 'react';
import {
    Building2, CalendarRange, Activity, DollarSign, CalendarClock,
    LayoutDashboard, Settings, ClipboardList, ShieldCheck, ShieldAlert,
    Check, Lock, ChevronLeft, Sparkles, Target, FolderKanban, Users, Radar
} from 'lucide-react';
import { chaveDeAcessoDe } from '../../utils/permissoes';

const ICONS = {
    Building2, CalendarRange, Activity, DollarSign, CalendarClock,
    LayoutDashboard, Settings, ClipboardList, ShieldCheck, ShieldAlert,
    Target, FolderKanban, Users, Radar
};

// Interruptor. Não é <input type="checkbox"> estilizado: é um botão com
// aria-pressed, que é o que um interruptor é.
const Switch = ({ on, onClick, disabled, size = 'md', title }) => {
    const w = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6';
    const k = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
    const x = size === 'sm' ? 'translate-x-4' : 'translate-x-5';
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            title={title}
            disabled={disabled}
            onClick={(e) => { e.stopPropagation(); if (!disabled) onClick(); }}
            className={`${w} rounded-full p-0.5 shrink-0 transition-colors duration-200 ${
                on ? 'bg-emerald-500' : 'bg-slate-300'
            } ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-105'}`}
        >
            <span className={`${k} block rounded-full bg-white shadow-sm transition-transform duration-200 ${on ? x : 'translate-x-0'}`} />
        </button>
    );
};

// Tailwind não monta classe por concatenação (o JIT lê o código-fonte), então a
// cor de seleção sai daqui, escrita por extenso.
const SELECIONADO = {
    purple: 'bg-white border-purple-300 ring-2 ring-purple-200 shadow-lg',
    indigo: 'bg-white border-indigo-300 ring-2 ring-indigo-200 shadow-lg',
};

const PermissionBlocks = ({
    modules,
    values = {},
    inherited = null,      // null = modo perfil; objeto = modo extras (mostra o que o cargo já dá)
    onChange,              // (proximoMapaCompleto) => void
    accentClass = 'purple',
    emptyHint,
}) => {
    const [openId, setOpenId] = useState(null);
    const open = modules.find(m => m.id === openId) || null;

    const isOn = (permId) => !!values[permId];

    /**
     * Herdada do cargo só quando o cargo também abre o módulo.
     *
     * Sem isso, um cargo com a porta fechada e permissões finas ligadas por
     * resquício — o caso do Médico com Compromissos — exibia "já vem do Perfil"
     * e travava o botão, impedindo o admin de conceder o extra de verdade.
     */
    const isInherited = (permId) => {
        if (!inherited?.[permId]) return false;
        const chave = chaveDeAcessoDe(permId);
        return !chave || chave === permId || !!inherited[chave];
    };

    // No modo extras, o cargo manda: o que ele já dá aparece ligado e travado.
    const isEffective = (permId) => isOn(permId) || isInherited(permId);

    const setMany = (patch) => onChange({ ...values, ...patch });
    const togglePerm = (permId) => {
        if (isInherited(permId)) return; // já vem do perfil — extra não tem o que somar
        setMany({ [permId]: !values[permId] });
    };

    const moduleStats = (mod) => {
        const ids = mod.permissions.map(p => p.id);
        const ativas = ids.filter(isEffective).length;
        return { ativas, total: ids.length, aberto: isEffective(mod.accessKey) };
    };

    const toggleModule = (mod) => {
        const { aberto } = moduleStats(mod);
        if (isInherited(mod.accessKey)) return;
        // Desligar o módulo só fecha a porta; as permissões finas ficam guardadas
        // para voltarem como estavam se o módulo for religado.
        setMany({ [mod.accessKey]: !aberto });
    };

    const marcarTudo = (mod, next) => {
        const patch = {};
        mod.permissions.forEach(p => { if (!isInherited(p.id)) patch[p.id] = next; });
        setMany(patch);
    };

    return (
        <div className="flex flex-col lg:flex-row gap-4 lg:gap-5 items-start">
            {/* Grade de blocos — espelha a tela inicial */}
            <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 gap-2.5 w-full ${open ? 'lg:w-[58%]' : ''}`}>
                {modules.map(mod => {
                    const Icon = ICONS[mod.icon] || LayoutDashboard;
                    const { ativas, total, aberto } = moduleStats(mod);
                    const selecionado = openId === mod.id;
                    const travado = isInherited(mod.accessKey);
                    return (
                        // <div> e não <button>: o interruptor do módulo é um botão e
                        // botão dentro de botão é HTML inválido (o React reclama e o
                        // clique no interruptor fica ambíguo). O papel e o teclado
                        // ficam explícitos aqui.
                        <div
                            key={mod.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => setOpenId(selecionado ? null : mod.id)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setOpenId(selecionado ? null : mod.id);
                                }
                            }}
                            className={`group relative text-left cursor-pointer rounded-2xl p-3 border transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                                selecionado
                                    ? (SELECIONADO[accentClass] || SELECIONADO.purple)
                                    : aberto
                                        ? 'bg-white/80 border-white shadow-sm hover:shadow-md hover:-translate-y-0.5'
                                        : 'bg-slate-50/70 border-slate-200/70 hover:bg-white/70'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 bg-gradient-to-br ${mod.gradient} ${
                                    aberto ? 'shadow-md opacity-100' : 'opacity-25 saturate-0'
                                }`}>
                                    <Icon size={18} className="text-white" strokeWidth={2.2} />
                                </div>
                                <Switch
                                    on={aberto}
                                    disabled={travado}
                                    size="sm"
                                    title={travado ? 'Já concedido pelo Perfil' : aberto ? 'Desligar módulo' : 'Ligar módulo'}
                                    onClick={() => toggleModule(mod)}
                                />
                            </div>
                            <p className={`text-[13px] font-black leading-tight ${aberto ? 'text-slate-800' : 'text-slate-400'}`}>
                                {mod.label}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5 leading-tight line-clamp-2">
                                {aberto ? `${ativas} de ${total} liberadas` : 'Sem acesso'}
                            </p>
                            {travado && (
                                <span className="absolute top-1.5 left-1.5 text-slate-400" title="Vem do Perfil">
                                    <Lock size={10} />
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Painel do bloco aberto */}
            {open && (
                <div className="w-full lg:w-[42%] lg:sticky lg:top-2 bg-white rounded-2xl border border-slate-200 shadow-lg overflow-hidden animate-in fade-in duration-200">
                    <div className={`px-4 py-3 border-b border-slate-100 bg-gradient-to-br ${open.gradient} bg-opacity-10 flex items-center gap-3`}>
                        <button
                            type="button"
                            onClick={() => setOpenId(null)}
                            className="lg:hidden p-1 -ml-1 text-white/90 hover:text-white"
                            title="Voltar"
                        >
                            <ChevronLeft size={18} />
                        </button>
                        <div className="min-w-0 flex-1">
                            <h4 className="text-sm font-black text-white leading-tight truncate drop-shadow-sm">{open.label}</h4>
                            <p className="text-[10px] font-bold text-white/80 truncate">{open.desc}</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => marcarTudo(open, !open.permissions.every(p => isEffective(p.id)))}
                            className="text-[10px] font-black uppercase tracking-wide text-white/90 hover:text-white bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                        >
                            {open.permissions.every(p => isEffective(p.id)) ? 'Limpar' : 'Tudo'}
                        </button>
                    </div>

                    <div className="p-2 max-h-[46vh] overflow-y-auto custom-scrollbar">
                        {open.permissions.map(perm => {
                            const gate = perm.id === open.accessKey;
                            const ligada = isEffective(perm.id);
                            const herdada = isInherited(perm.id);
                            // Sem a chave de acesso, o resto do módulo não é alcançável.
                            const inerte = !gate && !isEffective(open.accessKey);
                            return (
                                <div
                                    key={perm.id}
                                    className={`flex items-start gap-3 p-2.5 rounded-xl transition-colors ${
                                        gate ? 'bg-slate-50 mb-1' : 'hover:bg-slate-50'
                                    } ${inerte ? 'opacity-45' : ''}`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-xs font-bold leading-snug ${ligada ? 'text-slate-800' : 'text-slate-500'}`}>
                                            {perm.label}
                                            {gate && <span className="ml-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">porta de entrada</span>}
                                        </p>
                                        {perm.desc && <p className="text-[10px] font-semibold text-slate-400 mt-0.5 leading-snug">{perm.desc}</p>}
                                        {herdada && (
                                            <p className="text-[10px] font-black text-emerald-600 mt-1 flex items-center gap-1">
                                                <Check size={10} strokeWidth={3} /> já vem do Perfil
                                            </p>
                                        )}
                                    </div>
                                    <Switch
                                        on={ligada}
                                        disabled={herdada}
                                        size="sm"
                                        title={herdada ? 'Concedida pelo Perfil — não precisa de extra' : undefined}
                                        onClick={() => togglePerm(perm.id)}
                                    />
                                </div>
                            );
                        })}
                        {!isEffective(open.accessKey) && (
                            <p className="text-[10px] font-bold text-slate-400 px-2.5 pb-2 pt-1 leading-snug">
                                Módulo desligado: as permissões acima ficam guardadas, mas não valem
                                enquanto a porta de entrada estiver fechada.
                            </p>
                        )}
                    </div>
                </div>
            )}

            {!open && emptyHint && (
                <div className="hidden lg:flex w-[0%] lg:w-auto flex-1 items-center justify-center text-center px-4 py-8">
                    <p className="text-[11px] font-bold text-slate-400 flex items-center gap-2">
                        <Sparkles size={14} /> {emptyHint}
                    </p>
                </div>
            )}
        </div>
    );
};

export default PermissionBlocks;
