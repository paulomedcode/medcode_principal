import React from 'react';
import { Globe, LayoutDashboard, Bot, Workflow } from 'lucide-react';
import LogoMedCode from './LogoMedCode';

/*
 * Moldura das telas de fora do sistema (login e nova senha).
 *
 * A tela de entrada é a primeira coisa que cliente e parceiro veem da MedCode,
 * então a metade esquerda é uma vitrine institucional: o que a empresa faz e
 * como trabalha, sem puxar para um produto só. No celular só o formulário
 * aparece.
 */

const FRENTES = [
    { icone: Globe, nome: 'Sites e landing pages', texto: 'Presença profissional que aparece no Google e transforma visita em contato.' },
    { icone: LayoutDashboard, nome: 'Sistemas sob medida', texto: 'Gestão, agenda e processos do jeito que a sua operação funciona.' },
    { icone: Bot, nome: 'Agentes de IA', texto: 'Atendimento e agendamento automáticos, 24 horas por dia.' },
    { icone: Workflow, nome: 'Consultoria e automação', texto: 'Diagnóstico do processo e integração das ferramentas que você já usa.' },
];

const ETAPAS = ['Diagnóstico', 'Projeto', 'Entrega', 'Acompanhamento'];

const CSS = `
@keyframes acesso-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
.acesso-in { opacity: 0; animation: acesso-in .5s ease-out forwards }
@media (prefers-reduced-motion: reduce) { .acesso-in { opacity: 1; animation: none } }
`;

function Vitrine() {
    return (
        <aside className="hidden lg:flex relative flex-col justify-between gap-10 overflow-hidden bg-[#09080f] text-white px-12 py-10 xl:px-16 xl:py-12">
            {/* luz em degradê nas cores do logo + grade bem leve */}
            <div aria-hidden className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(60% 50% at 85% 15%, rgba(139,92,246,.28), transparent 70%), radial-gradient(50% 45% at 10% 95%, rgba(59,130,246,.22), transparent 70%)' }} />
            <div aria-hidden className="absolute inset-0 pointer-events-none opacity-[.07]"
                style={{
                    backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
                    backgroundSize: '44px 44px',
                    maskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)',
                    WebkitMaskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)',
                }} />

            <div className="relative">
                <LogoMedCode escuro altura={34} />
            </div>

            <div className="relative max-w-[560px] space-y-8">
                <div className="space-y-4">
                    <h2 className="text-[30px] xl:text-[34px] 2xl:text-[40px] leading-[1.12] font-semibold tracking-tight">
                        Tecnologia sob medida para clínicas e empresas que querem{' '}
                        <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">crescer</span>.
                    </h2>
                    <p className="text-[15px] leading-relaxed text-white/60">
                        A MedCode cria sites, sistemas e automações com inteligência artificial, do diagnóstico à entrega, e segue junto depois do lançamento.
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    {FRENTES.map((f, i) => (
                        <div key={f.nome} className="acesso-in rounded-xl border border-white/10 bg-white/[.04] p-4"
                            style={{ animationDelay: `${0.2 + i * 0.12}s` }}>
                            <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/80 to-blue-500/80 grid place-items-center mb-3">
                                {React.createElement(f.icone, { size: 16 })}
                            </span>
                            <p className="text-[13.5px] font-semibold">{f.nome}</p>
                            <p className="text-[12.5px] leading-snug text-white/55 mt-1">{f.texto}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="relative">
                <p className="text-[11.5px] text-white/40 mb-2">Como trabalhamos</p>
                <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-white/65">
                    {ETAPAS.map((e, i) => (
                        <li key={e} className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full border border-white/20 grid place-items-center text-[10.5px] text-white/70">{i + 1}</span>
                            {e}
                            {i < ETAPAS.length - 1 && <span className="w-6 h-px bg-white/20 ml-1" aria-hidden />}
                        </li>
                    ))}
                </ol>
            </div>
        </aside>
    );
}

export default function TelaAcesso({ titulo, subtitulo, children, rodape }) {
    return (
        <div className="min-h-full w-full grid lg:grid-cols-[1.15fr_1fr] bg-white font-sans">
            <style>{CSS}</style>
            <Vitrine />

            <main className="flex flex-col min-h-full px-6 sm:px-10 py-10">
                <div className="flex-1 flex flex-col justify-center w-full max-w-[360px] mx-auto">
                    <LogoMedCode altura={30} className="lg:hidden mb-10" />
                    <div className="mb-8">
                        <h1 className="text-[26px] font-semibold tracking-tight text-slate-900">{titulo}</h1>
                        {subtitulo && <p className="text-[14px] text-slate-500 mt-1.5">{subtitulo}</p>}
                    </div>
                    {children}
                </div>
                <p className="text-[12px] text-slate-400 text-center mt-10">
                    {rodape || <>© {new Date().getFullYear()} MedCode Assessoria · <a href="https://medcodedev.com" target="_blank" rel="noreferrer" className="hover:text-slate-600">medcodedev.com</a></>}
                </p>
            </main>
        </div>
    );
}

/* Peças do formulário, para login e nova senha ficarem iguais. */
export const rotuloAcesso = 'block text-[13px] font-medium text-slate-700 mb-1.5';
export const campoAcesso = 'w-full h-11 px-3.5 rounded-lg border border-slate-200 bg-white text-[14px] text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-900/[.06]';
export const botaoAcesso = 'w-full h-11 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[14px] font-medium transition active:scale-[.99] disabled:opacity-60 disabled:cursor-wait';
