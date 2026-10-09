import React, { useState } from 'react';
import { Plus, Trash, Wand2, BookmarkPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import CurrencyInput from '../finance/CurrencyInput';
import { cronogramaSugerido, salvarPadraoDoServico } from '../../services/propostas';

const inputCls = "w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-xs font-semibold text-slate-700 outline-none focus:border-[#0071e3] transition-all shadow-sm";
const areaCls = "w-full px-3 py-2 bg-white border border-black/[.085] rounded-lg text-xs font-medium text-slate-700 outline-none focus:border-[#0071e3] transition-all shadow-sm resize-y leading-relaxed";
const btnLink = "text-[10px] font-semibold text-[#0071e3] hover:text-indigo-700 uppercase flex items-center gap-1";

function Campo({ label, dica, children, className = '' }) {
    return (
        <div className={className}>
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">{label}</label>
            {children}
            {dica && <p className="text-[10px] text-slate-400 ml-1 mt-0.5">{dica}</p>}
        </div>
    );
}

function Secao({ titulo, descricao, aberta = false, children }) {
    return (
        <details open={aberta} className="group bg-white border border-black/[.085] rounded-xl">
            <summary className="cursor-pointer select-none px-3 py-2.5 flex items-baseline gap-2 list-none">
                <span className="text-slate-400 text-[10px] transition-transform group-open:rotate-90">▶</span>
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">{titulo}</span>
                {descricao && <span className="text-[10px] text-slate-400 font-medium truncate">{descricao}</span>}
            </summary>
            <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
        </details>
    );
}

/** Lista de textos editada como "um por linha" (ou parágrafos separados por linha em branco). */
function ListaTexto({ value, onChange, rows = 4, paragrafos = false, placeholder }) {
    const sep = paragrafos ? '\n\n' : '\n';
    const [texto, setTexto] = useState(() => (value || []).join(sep));
    const mudar = (t) => {
        setTexto(t);
        onChange(t.split(paragrafos ? /\n\s*\n/ : '\n').map((x) => x.trim()).filter(Boolean));
    };
    return <textarea value={texto} onChange={(e) => mudar(e.target.value)} rows={rows} className={areaCls} placeholder={placeholder} />;
}

/**
 * Textos de um serviço na proposta (rótulo, prazo, descrição, entregáveis…).
 * Usado no item do orçamento e no cadastro do serviço (o texto padrão).
 * `compacto` empilha tudo numa coluna, para formulários estreitos.
 */
export function CamposTextoServico({ detalhes = {}, onChange, nome = '', compacto = false }) {
    const d = detalhes;
    const g3 = compacto ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-1 md:grid-cols-3 gap-2';
    const g2 = compacto ? 'grid grid-cols-1 gap-2' : 'grid grid-cols-1 md:grid-cols-2 gap-2';
    return (<>
        <div className={g3}>
            <Campo label="Rótulo"><input value={d.rotulo || ''} onChange={(e) => onChange({ rotulo: e.target.value })} className={inputCls} placeholder="Ex.: Presença digital" /></Campo>
            <Campo label="Prazo"><input value={d.prazo || ''} onChange={(e) => onChange({ prazo: e.target.value })} className={inputCls} placeholder="Ex.: 10 dias" /></Campo>
            <Campo label="Nome na tabela de valores"><input value={d.nomeTabela || ''} onChange={(e) => onChange({ nomeTabela: e.target.value })} className={inputCls} placeholder={nome} /></Campo>
        </div>
        <Campo label="Descrição"><textarea value={d.descricao || ''} onChange={(e) => onChange({ descricao: e.target.value })} rows={compacto ? 3 : 2} className={areaCls} /></Campo>
        <div className={g2}>
            <Campo label="Entregáveis (um por linha)"><ListaTexto value={d.entregaveis} onChange={(entregaveis) => onChange({ entregaveis })} rows={5} /></Campo>
            <Campo label="Resumo na tabela de valores"><textarea value={d.resumo || ''} onChange={(e) => onChange({ resumo: e.target.value })} rows={compacto ? 2 : 5} className={areaCls} /></Campo>
        </div>
    </>);
}

/** Tabela pequena de objetos (destaques, etapas, cronograma…). */
function Tabela({ value, onChange, colunas, novo, max }) {
    const linhas = value || [];
    const set = (i, campo, v) => onChange(linhas.map((l, j) => (j === i ? { ...l, [campo]: v } : l)));
    const grid = { gridTemplateColumns: `${colunas.map((c) => c.largura || '1fr').join(' ')} 28px` };
    return (
        <div className="space-y-1.5">
            <div className="grid gap-1.5 px-0.5" style={grid}>
                {colunas.map((c) => <span key={c.campo} className="text-[9px] font-bold text-slate-400 uppercase ml-1">{c.label}</span>)}
            </div>
            {linhas.map((l, i) => (
                <div key={i} className="grid gap-1.5 items-center" style={grid}>
                    {colunas.map((c) => (
                        <input key={c.campo} type={c.tipo || 'text'} step={c.tipo === 'number' ? '0.1' : undefined} min={c.tipo === 'number' ? 0 : undefined}
                            value={l[c.campo] ?? ''} placeholder={c.placeholder}
                            onChange={(e) => set(i, c.campo, c.tipo === 'number' ? e.target.value : e.target.value)}
                            className={`${inputCls} ${c.tipo === 'number' ? 'text-right' : ''}`} />
                    ))}
                    <button type="button" onClick={() => onChange(linhas.filter((_, j) => j !== i))}
                        className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg"><Trash size={13} /></button>
                </div>
            ))}
            {(!max || linhas.length < max) && (
                <button type="button" onClick={() => onChange([...linhas, novo()])} className={btnLink}><Plus size={12} /> Adicionar</button>
            )}
        </div>
    );
}

/** Título em linhas: parte normal + parte em destaque (itálico lilás). */
function LinhasTitulo({ value, onChange, max = 3 }) {
    return (
        <Tabela value={value} onChange={onChange} max={max} novo={() => ({ texto: '', destaque: '' })}
            colunas={[{ campo: 'texto', label: 'Texto' }, { campo: 'destaque', label: 'Destaque (itálico)' }]} />
    );
}

const FORMAS = [['pix', 'À vista no PIX'], ['5050', '50% + 50%'], ['cartao', 'Cartão parcelado']];

/**
 * Textos da proposta em PDF — tudo que muda de um cliente para outro.
 * `proposta` é o objeto salvo em finance_quotes.proposta; `items` são os itens
 * do orçamento, cada um com seus `detalhes`.
 */
export default function PropostaEditor({ proposta, onChange, items, onItemDetalhes, subtotal }) {
    const p = proposta;
    const set = (patch) => onChange({ ...p, ...patch });
    const setIn = (chave, patch) => onChange({ ...p, [chave]: { ...p[chave], ...patch } });
    const inv = p.investimento;
    const setInv = (patch) => setIn('investimento', patch);
    const [versaoCrono, setVersaoCrono] = useState(0);

    const salvarPadrao = async (it) => {
        try { await salvarPadraoDoServico(it.service_id, it.detalhes); toast.success('Salvo como padrão do serviço.'); }
        catch (e) { console.error(e); toast.error('Não foi possível salvar o padrão.'); }
    };

    const formas = inv.formasPagamento || [];
    const alternarForma = (f) => setInv({ formasPagamento: formas.includes(f) ? formas.filter((x) => x !== f) : FORMAS.map(([k]) => k).filter((k) => k === f || formas.includes(k)) });

    return (
        <div className="space-y-2">
            <p className="text-[11px] text-slate-500 font-medium px-1">
                Em qualquer texto, <code className="bg-slate-100 px-1 rounded">{'{cliente}'}</code> vira o nome do cliente e{' '}
                <code className="bg-slate-100 px-1 rounded">{'{contato}'}</code> o nome de quem recebe. <b>**negrito**</b> também funciona.
            </p>

            <Secao titulo="Capa" descricao="título, subtítulo e para quem vai" aberta>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Campo label="Aos cuidados de" dica="Usado na saudação da carta"><input value={p.contato || ''} onChange={(e) => set({ contato: e.target.value })} className={inputCls} placeholder="Ex.: Sr. João" /></Campo>
                    <Campo label="Linha acima do título" dica="Deixe vazio para não mostrar"><input value={p.capa.eyebrow || ''} onChange={(e) => setIn('capa', { eyebrow: e.target.value })} className={inputCls} /></Campo>
                </div>
                <Campo label="Título da capa"><LinhasTitulo value={p.capa.titulo} onChange={(titulo) => setIn('capa', { titulo })} /></Campo>
                <Campo label="Subtítulo"><textarea value={p.capa.subtitulo || ''} onChange={(e) => setIn('capa', { subtitulo: e.target.value })} rows={2} className={areaCls} /></Campo>
            </Secao>

            <Secao titulo="Carta de apresentação" descricao="saudação, texto e destaques">
                <Campo label="Saudação" dica="Vazio = “Olá, {contato},”"><input value={p.carta.saudacao || ''} onChange={(e) => setIn('carta', { saudacao: e.target.value })} className={inputCls} placeholder="Olá, **{contato}**," /></Campo>
                <Campo label="Parágrafos" dica="Separe os parágrafos com uma linha em branco">
                    <ListaTexto paragrafos rows={9} value={p.carta.paragrafos} onChange={(paragrafos) => setIn('carta', { paragrafos, usarTextoPadrao: false })} />
                </Campo>
                <Campo label="Destaques (cartão ao lado da carta)">
                    <Tabela value={p.destaques} onChange={(destaques) => set({ destaques })} max={5} novo={() => ({ valor: '', legenda: '' })}
                        colunas={[{ campo: 'valor', label: 'Número', largura: '110px' }, { campo: 'legenda', label: 'Legenda' }]} />
                </Campo>
            </Secao>

            <Secao titulo="Cenário do cliente" descricao="o que identificamos e onde queremos chegar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <input value={p.cenario.tituloProblemas || ''} onChange={(e) => setIn('cenario', { tituloProblemas: e.target.value })} className={inputCls} />
                        <ListaTexto value={p.cenario.problemas} onChange={(problemas) => setIn('cenario', { problemas })} rows={5} placeholder="Um problema por linha" />
                    </div>
                    <div className="space-y-2">
                        <input value={p.cenario.tituloObjetivos || ''} onChange={(e) => setIn('cenario', { tituloObjetivos: e.target.value })} className={inputCls} />
                        <ListaTexto value={p.cenario.objetivos} onChange={(objetivos) => setIn('cenario', { objetivos })} rows={5} placeholder="Um objetivo por linha" />
                    </div>
                </div>
                <p className="text-[10px] text-slate-400 ml-1">Se as duas listas ficarem vazias, o bloco não aparece.</p>
            </Secao>

            <Secao titulo="Serviços" descricao="prazo, descrição e entregáveis de cada item" aberta>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Campo label="Título — texto"><input value={p.solucao.titulo?.texto || ''} onChange={(e) => setIn('solucao', { titulo: { ...p.solucao.titulo, texto: e.target.value } })} className={inputCls} /></Campo>
                    <Campo label="Título — destaque"><input value={p.solucao.titulo?.destaque || ''} onChange={(e) => setIn('solucao', { titulo: { ...p.solucao.titulo, destaque: e.target.value } })} className={inputCls} /></Campo>
                </div>
                <Campo label="Introdução"><textarea value={p.solucao.introducao || ''} onChange={(e) => setIn('solucao', { introducao: e.target.value })} rows={2} className={areaCls} /></Campo>
                {items.map((it, i) => it.description?.trim() ? (
                    <div key={i} className="border border-black/[.07] rounded-lg p-3 bg-slate-50/60 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-[#0071e3] text-white text-[10px] font-bold grid place-items-center">{String.fromCharCode(65 + i)}</span>
                            <b className="text-xs text-slate-700 flex-1 truncate">{it.description}</b>
                            {it.service_id && (
                                <button type="button" onClick={() => salvarPadrao(it)} className={btnLink} title="Os próximos orçamentos com este serviço já vêm com estes textos">
                                    <BookmarkPlus size={12} /> Salvar como padrão do serviço
                                </button>
                            )}
                        </div>
                        <CamposTextoServico detalhes={it.detalhes} onChange={(patch) => onItemDetalhes(i, patch)} nome={it.description} />
                    </div>
                ) : null)}
            </Secao>

            <Secao titulo="Investimento" descricao="desconto, formas de pagamento, suporte">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Campo label="Rótulo do desconto" className="md:col-span-2"><input value={inv.desconto?.rotulo || ''} onChange={(e) => setInv({ desconto: { ...inv.desconto, rotulo: e.target.value } })} className={inputCls} /></Campo>
                    <Campo label="Desconto (R$)" dica={`Subtotal: ${subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}>
                        <CurrencyInput value={inv.desconto?.valor || 0} onChange={(v) => setInv({ desconto: { ...inv.desconto, valor: v } })} className={`${inputCls} text-right`} />
                    </Campo>
                    <div />
                    <Campo label="Desconto no PIX (%)"><input type="number" min="0" max="100" step="0.5" value={inv.pixDescontoPercentual ?? 0} onChange={(e) => setInv({ pixDescontoPercentual: e.target.value })} className={`${inputCls} text-right`} /></Campo>
                    <Campo label="Parcelas no cartão"><input type="number" min="1" max="24" value={inv.parcelasCartao ?? 1} onChange={(e) => setInv({ parcelasCartao: e.target.value })} className={`${inputCls} text-right`} /></Campo>
                    <Campo label="Formas de pagamento" className="md:col-span-2">
                        <div className="flex flex-wrap gap-3 h-9 items-center">
                            {FORMAS.map(([k, l]) => (
                                <label key={k} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 cursor-pointer">
                                    <input type="checkbox" checked={formas.includes(k)} onChange={() => alternarForma(k)} /> {l}
                                </label>
                            ))}
                        </div>
                    </Campo>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border border-black/[.07] rounded-lg p-2.5 space-y-2">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 uppercase cursor-pointer">
                            <input type="checkbox" checked={!!inv.suporteMensal} onChange={(e) => setInv({ suporteMensal: e.target.checked ? { descricao: 'Ajustes, pequenas melhorias e monitoramento contínuo por', valor: 0 } : null })} />
                            Suporte mensal (opcional)
                        </label>
                        {inv.suporteMensal && (<>
                            <textarea value={inv.suporteMensal.descricao || ''} onChange={(e) => setInv({ suporteMensal: { ...inv.suporteMensal, descricao: e.target.value } })} rows={2} className={areaCls} />
                            <CurrencyInput value={inv.suporteMensal.valor || 0} onChange={(v) => setInv({ suporteMensal: { ...inv.suporteMensal, valor: v } })} className={`${inputCls} text-right`} />
                        </>)}
                    </div>
                    <div className="border border-black/[.07] rounded-lg p-2.5 space-y-2">
                        <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600 uppercase cursor-pointer">
                            <input type="checkbox" checked={!!inv.custosTerceiros} onChange={(e) => setInv({ custosTerceiros: e.target.checked ? { descricao: 'Domínio, hospedagem e APIs são pagos direto aos fornecedores. Estimativa atual:', estimativa: '' } : null })} />
                            Custos de terceiros
                        </label>
                        {inv.custosTerceiros && (<>
                            <textarea value={inv.custosTerceiros.descricao || ''} onChange={(e) => setInv({ custosTerceiros: { ...inv.custosTerceiros, descricao: e.target.value } })} rows={2} className={areaCls} />
                            <input value={inv.custosTerceiros.estimativa || ''} onChange={(e) => setInv({ custosTerceiros: { ...inv.custosTerceiros, estimativa: e.target.value } })} className={inputCls} placeholder="Ex.: R$ 80 a R$ 180/mês" />
                        </>)}
                    </div>
                </div>
            </Secao>

            <Secao titulo="Cronograma" descricao="barras por semana; vazio = não aparece">
                <div className="flex justify-end">
                    <button type="button" className={btnLink} onClick={() => { set({ cronograma: cronogramaSugerido(items) }); setVersaoCrono((v) => v + 1); }}>
                        <Wand2 size={12} /> Sugerir pelos prazos dos serviços
                    </button>
                </div>
                <Tabela key={versaoCrono} value={p.cronograma} onChange={(cronograma) => set({ cronograma })} novo={() => ({ etapa: '', descricao: '', inicio: 0, duracao: 1 })}
                    colunas={[
                        { campo: 'etapa', label: 'Etapa' },
                        { campo: 'descricao', label: 'Descrição' },
                        { campo: 'inicio', label: 'Início (sem.)', tipo: 'number', largura: '90px' },
                        { campo: 'duracao', label: 'Duração (sem.)', tipo: 'number', largura: '90px' },
                    ]} />
            </Secao>

            <Secao titulo="Método e escopo" descricao="etapas, o que está e o que não está incluso">
                <Campo label="Etapas do método">
                    <Tabela value={p.etapas} onChange={(etapas) => set({ etapas })} max={5} novo={() => ({ titulo: '', texto: '' })}
                        colunas={[{ campo: 'titulo', label: 'Etapa', largura: '150px' }, { campo: 'texto', label: 'Texto' }]} />
                </Campo>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Campo label="Está incluso (um por linha)"><ListaTexto value={p.incluso} onChange={(incluso) => set({ incluso })} rows={6} /></Campo>
                    <Campo label="Não está incluso (um por linha)"><ListaTexto value={p.naoIncluso} onChange={(naoIncluso) => set({ naoIncluso })} rows={6} /></Campo>
                </div>
            </Secao>

            <Secao titulo="Fechamento" descricao="chamada final e próximos passos">
                <Campo label="Título do fechamento"><LinhasTitulo value={p.fechamento.titulo} onChange={(titulo) => setIn('fechamento', { titulo })} /></Campo>
                <Campo label="Próximos passos">
                    <Tabela value={p.proximosPassos} onChange={(proximosPassos) => set({ proximosPassos })} max={4} novo={() => ({ titulo: '', texto: '' })}
                        colunas={[{ campo: 'titulo', label: 'Passo', largura: '150px' }, { campo: 'texto', label: 'Texto' }]} />
                </Campo>
            </Secao>
        </div>
    );
}
