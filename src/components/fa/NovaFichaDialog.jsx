import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Loader2, CalendarDays, UserRound, FileCheck2, AlertTriangle, ArrowLeft, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../services/supabase';
import { buscarApasDoPaciente } from '../../services/fichaAnestesica';
import { apaMaisRecente, cabecalhoDaApa } from '../../utils/fichaAnestesica/prefill';

const digitos = (valor) => String(valor || '').replace(/\D/g, '');

/** Data em que a avaliação foi feita, com as quedas que os registros antigos exigem. */
function dataDaApa(apa) {
    const bruta = apa?.dataRegistro || apa?.dataAvaliacao || apa?.createdAt;
    if (!bruta) return '';
    const data = new Date(bruta);
    return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR');
}

/**
 * Junta cadastro e APAs numa lista só. O mesmo paciente aparece uma vez: o
 * cadastro tem preferência, porque é ele que carrega o vínculo; a APA entra
 * quando é a única notícia daquela pessoa.
 */
function unirResultados(pacientes, apas) {
    const lista = [];
    const vistos = new Set();
    const chaveDe = (item) => digitos(item.cpf) || String(item.nome || '').trim().toLowerCase();

    (pacientes || []).forEach(paciente => {
        vistos.add(chaveDe(paciente));
        lista.push({
            origem: 'cadastro',
            pacienteId: paciente.id,
            nome: paciente.nome,
            cpf: paciente.cpf,
            nascimento: paciente.dataNascimento
        });
    });

    (apas || []).forEach(apa => {
        const chave = chaveDe(apa);
        if (vistos.has(chave)) return;
        vistos.add(chave);
        lista.push({
            origem: 'apa',
            pacienteId: apa.pacienteId || null,
            nome: apa.nome,
            cpf: apa.cpf,
            nascimento: apa.dataNasc,
            procedimento: apa.procedimento,
            dataApa: apa.dataProcedimento
        });
    });

    return lista;
}

/**
 * Abertura de uma ficha anestésica: a partir da fila cirúrgica ou avulsa.
 *
 * Quando encontra uma APA do paciente, mostra qual encontrou e pede
 * confirmação antes de importar. Nada de dado clínico entra na ficha sem o
 * anestesista ver de onde veio.
 */
export default function NovaFichaDialog({ unidadeAtual, cirurgiaSugerida = null, onFechar, onConfirmar }) {
    // Vindo do card da fila, o diálogo já nasce na etapa de confirmação.
    const [etapa, setEtapa] = useState(cirurgiaSugerida ? 'confirmar' : 'escolher');
    const [aba, setAba] = useState('fila');           // fila | avulsa

    const [cirurgias, setCirurgias] = useState([]);
    const [carregandoFila, setCarregandoFila] = useState(true);

    const [buscaPaciente, setBuscaPaciente] = useState('');
    const [pacientes, setPacientes] = useState([]);
    const [buscando, setBuscando] = useState(false);
    const [buscou, setBuscou] = useState(false);

    const [selecionado, setSelecionado] = useState(() => (cirurgiaSugerida ? {
        surgeryId: cirurgiaSugerida.id,
        paciente: cirurgiaSugerida.nomePaciente,
        cpf: cirurgiaSugerida.cpf,
        procedimento: cirurgiaSugerida.procedimento
    } : null));
    const [apaEncontrada, setApaEncontrada] = useState(null);
    const [confiancaApa, setConfiancaApa] = useState('nenhuma');
    const [usarApa, setUsarApa] = useState(true);
    const [verificandoApa, setVerificandoApa] = useState(!!cirurgiaSugerida);

    useEffect(() => {
        let ativo = true;
        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
        const fim = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 2);
        const iso = (data) => data.toISOString().slice(0, 10);

        let consulta = supabase
            .from('surgeries')
            .select('id, nomePaciente, cpf, procedimento, cirurgiao, sala, horario, dataAgendado, unidade, nascimento')
            .gte('dataAgendado', iso(inicio))
            .lte('dataAgendado', iso(fim))
            .order('horario', { ascending: true })
            .limit(80);
        if (unidadeAtual) consulta = consulta.eq('unidade', unidadeAtual);

        consulta.then(({ data }) => {
            if (!ativo) return;
            setCirurgias(data || []);
            setCarregandoFila(false);
        });
        return () => { ativo = false; };
    }, [unidadeAtual]);

    /**
     * Busca enquanto se digita, no cadastro e nas APAs.
     *
     * Nas APAs porque é o caso real do plantão: o paciente não está no mapa de
     * hoje, mas tem avaliação pré-anestésica feita — e é ali que está o nome
     * escrito do jeito certo.
     *
     * Cada busca leva um número: resposta que chega atrasada, de um termo que
     * não é mais o digitado, é descartada. Sem isso a lista pisca resultado
     * velho enquanto se digita.
     */
    const buscaEmCurso = useRef(0);

    const buscarPacientes = async (termoBruto) => {
        const termo = String(termoBruto ?? buscaPaciente).trim();
        const minhaVez = ++buscaEmCurso.current;

        if (termo.length < 3) {
            setPacientes([]);
            setBuscou(false);
            setBuscando(false);
            return;
        }

        setBuscando(true);

        const [doCadastro, dasApas] = await Promise.all([
            supabase.from('pacientes').select('id, nome, cpf, "dataNascimento"').ilike('nome', `%${termo}%`).limit(25),
            supabase.from('apas').select('id, nome, cpf, "dataNasc", "pacienteId", procedimento, "dataProcedimento"')
                .is('deleted_at', null).ilike('nome', `%${termo}%`).limit(25)
        ]);

        if (minhaVez !== buscaEmCurso.current) return;   // já digitou mais

        setBuscando(false);
        setBuscou(true);

        if (doCadastro.error && dasApas.error) {
            // Falha de consulta não pode virar "nenhum resultado": o médico
            // concluiria que o paciente não existe e cadastraria duplicado.
            toast.error('Erro ao buscar pacientes: ' + doCadastro.error.message);
            setPacientes([]);
            return;
        }

        setPacientes(unirResultados(doCadastro.data, dasApas.data));
    };

    // Digitou: espera a mão parar um instante e busca sozinha.
    useEffect(() => {
        const termo = buscaPaciente.trim();
        if (aba !== 'avulsa') return;
        if (termo.length < 3) {
            setPacientes([]);
            setBuscou(false);
            return;
        }

        const temporizador = setTimeout(() => buscarPacientes(termo), 350);
        return () => clearTimeout(temporizador);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [buscaPaciente, aba]);

    /** Escolheu o paciente: procura a APA antes de confirmar. */
    const escolher = async (origem) => {
        setSelecionado(origem);
        setEtapa('confirmar');
        setVerificandoApa(true);

        const { apas, confianca } = await buscarApasDoPaciente({
            pacienteId: origem.pacienteId || null,
            cpf: origem.cpf,
            nome: origem.paciente
        });

        const apa = apaMaisRecente(apas);
        setApaEncontrada(apa);
        setConfiancaApa(apa ? confianca : 'nenhuma');
        setUsarApa(!!apa);
        setVerificandoApa(false);
    };

    /**
     * Aberta pelo card da fila: a APA daquele paciente é procurada de imediato.
     * O médico continua vendo e confirmando o que será importado.
     */
    useEffect(() => {
        if (!cirurgiaSugerida) return;
        let ativo = true;

        buscarApasDoPaciente({
            pacienteId: null,
            cpf: cirurgiaSugerida.cpf,
            nome: cirurgiaSugerida.nomePaciente
        }).then(({ apas, confianca }) => {
            if (!ativo) return;
            const apa = apaMaisRecente(apas);
            setApaEncontrada(apa);
            setConfiancaApa(apa ? confianca : 'nenhuma');
            setUsarApa(!!apa);
            setVerificandoApa(false);
        });

        return () => { ativo = false; };
    }, [cirurgiaSugerida]);

    const confirmar = () => {
        const cabecalho = usarApa && apaEncontrada
            ? cabecalhoDaApa(apaEncontrada)
            : cabecalhoDaApa(null);

        onConfirmar({
            surgeryId: selecionado.surgeryId || null,
            pacienteId: selecionado.pacienteId || null,
            apaId: usarApa && apaEncontrada ? apaEncontrada.id : null,
            pacienteNome: selecionado.paciente,
            procedimento: selecionado.procedimento || cabecalho.procedimento || '',
            cabecalho: { ...cabecalho, paciente: cabecalho.paciente || selecionado.paciente }
        });
    };

    const formatarData = (valor) => {
        if (!valor) return '';
        const data = new Date(`${String(valor).slice(0, 10)}T12:00:00`);
        return Number.isNaN(data.getTime()) ? '' : data.toLocaleDateString('pt-BR');
    };

    return (
        <div className="fixed top-16 inset-x-0 bottom-0 z-[1000] bg-slate-900/50 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto print:hidden">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
                <div className="flex items-center justify-between p-4 border-b border-slate-200">
                    <h3 className="text-sm font-black text-slate-800">
                        {etapa === 'escolher' ? 'Nova ficha anestésica' : 'Confirmar abertura'}
                    </h3>
                    <button onClick={onFechar} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
                </div>

                {etapa === 'escolher' && (
                    <div className="p-4 space-y-4">
                        <div className="inline-flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                            <button onClick={() => setAba('fila')} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${aba === 'fila' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
                                <CalendarDays size={14} /> Da fila cirúrgica
                            </button>
                            <button onClick={() => setAba('avulsa')} className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${aba === 'avulsa' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>
                                <UserRound size={14} /> Avulsa
                            </button>
                        </div>

                        {aba === 'fila' && (
                            <div className="space-y-2">
                                <p className="text-[11px] font-semibold text-slate-500">Cirurgias agendadas de ontem a depois de amanhã{unidadeAtual ? ` — ${unidadeAtual}` : ''}.</p>
                                {carregandoFila && <div className="py-8 flex justify-center"><Loader2 className="animate-spin text-blue-600" size={24} /></div>}
                                {!carregandoFila && cirurgias.length === 0 && (
                                    <p className="py-6 text-center text-xs font-bold text-slate-400">Nenhuma cirurgia agendada no período. Use a aba &quot;Avulsa&quot;.</p>
                                )}
                                <div className="max-h-[320px] overflow-y-auto space-y-1.5">
                                    {cirurgias.map(cirurgia => (
                                        <button
                                            key={cirurgia.id}
                                            onClick={() => escolher({
                                                surgeryId: cirurgia.id,
                                                paciente: cirurgia.nomePaciente,
                                                cpf: cirurgia.cpf,
                                                procedimento: cirurgia.procedimento
                                            })}
                                            className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                                        >
                                            <p className="text-xs font-black text-slate-800">{cirurgia.nomePaciente || 'Sem nome'}</p>
                                            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">{cirurgia.procedimento || '—'}</p>
                                            <p className="text-[10px] font-bold text-slate-400 mt-1">
                                                {formatarData(cirurgia.dataAgendado)} {cirurgia.horario || ''} · {cirurgia.sala || 'sala não definida'} · {cirurgia.cirurgiao || '—'}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {aba === 'avulsa' && (
                            <div className="space-y-2">
                                <div className="relative">
                                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input
                                        value={buscaPaciente}
                                        onChange={e => setBuscaPaciente(e.target.value)}
                                        autoFocus
                                        placeholder="Comece a digitar o nome do paciente..."
                                        className="w-full pl-9 pr-9 py-2 text-xs font-semibold bg-white border border-slate-300 rounded-lg outline-none focus:border-blue-500"
                                    />
                                    {buscando && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-600 animate-spin" />}
                                </div>

                                <p className="text-[10px] font-bold text-slate-400">
                                    Procura no cadastro e nas avaliações pré-anestésicas, a partir de 3 letras.
                                </p>

                                <div className="max-h-[280px] overflow-y-auto space-y-1.5">
                                    {pacientes.map((paciente, i) => (
                                        <button
                                            key={`${paciente.origem}-${paciente.pacienteId || i}`}
                                            onClick={() => escolher({
                                                pacienteId: paciente.pacienteId,
                                                paciente: paciente.nome,
                                                cpf: paciente.cpf
                                            })}
                                            className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
                                        >
                                            <p className="flex items-center gap-1.5 text-xs font-black text-slate-800">
                                                {paciente.nome}
                                                {paciente.origem === 'apa' && (
                                                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase">
                                                        <FileText size={9} /> só na APA
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                                                {paciente.cpf || 'sem CPF'} {paciente.nascimento ? `· ${formatarData(paciente.nascimento)}` : ''}
                                                {paciente.procedimento ? ` · ${paciente.procedimento}` : ''}
                                            </p>
                                        </button>
                                    ))}
                                </div>

                                {buscou && !buscando && pacientes.length === 0 && (
                                    <p className="py-4 text-center text-xs font-bold text-slate-400">
                                        Nenhum paciente encontrado com esse nome.
                                    </p>
                                )}

                                <button
                                    onClick={() => escolher({ paciente: buscaPaciente.trim() || 'Paciente não identificado' })}
                                    className="w-full py-2 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg border border-dashed border-slate-300"
                                >
                                    Abrir sem vincular a um cadastro (emergência)
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {etapa === 'confirmar' && (
                    <div className="p-4 space-y-4">
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Paciente</p>
                            <p className="text-sm font-black text-slate-800">{selecionado?.paciente}</p>
                            {selecionado?.procedimento && <p className="text-xs font-semibold text-slate-500 mt-0.5">{selecionado.procedimento}</p>}
                        </div>

                        {verificandoApa && (
                            <div className="py-6 flex items-center justify-center gap-2 text-xs font-bold text-slate-500">
                                <Loader2 className="animate-spin" size={16} /> Procurando avaliação pré-anestésica…
                            </div>
                        )}

                        {!verificandoApa && apaEncontrada && (
                            <div className={`p-3 rounded-xl border ${confiancaApa === 'alta' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                                <div className="flex items-start gap-2">
                                    {confiancaApa === 'alta'
                                        ? <FileCheck2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
                                        : <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />}
                                    <div className="flex-1">
                                        <p className="text-xs font-black text-slate-800">
                                            APA encontrada — {apaEncontrada.nome}
                                        </p>
                                        <p className="text-[11px] font-semibold text-slate-600 mt-0.5">
                                            {apaEncontrada.procedimento || 'procedimento não informado'}
                                            {apaEncontrada.asa ? ` · ${apaEncontrada.asa}` : ''}
                                        </p>
                                        {/* Quando a avaliação foi feita é o que diz se ela ainda
                                            vale: APA de três meses atrás não descreve o paciente
                                            de hoje. Nem toda APA tem data do procedimento, então a
                                            data da avaliação é a que sempre aparece. */}
                                        <p className="text-[11px] font-bold text-slate-500 mt-1">
                                            Avaliação de {dataDaApa(apaEncontrada) || 'data não informada'}
                                            {apaEncontrada.dataProcedimento ? ` · cirurgia prevista ${formatarData(apaEncontrada.dataProcedimento)}` : ''}
                                        </p>
                                        {confiancaApa === 'media' && (
                                            <p className="text-[11px] font-bold text-amber-700 mt-1.5">
                                                Encontrada apenas pelo nome, sem CPF para conferir. Confirme que é o mesmo paciente antes de importar.
                                            </p>
                                        )}
                                        <label className="flex items-center gap-2 mt-2 text-xs font-bold text-slate-700">
                                            <input type="checkbox" checked={usarApa} onChange={e => setUsarApa(e.target.checked)} className="w-4 h-4 rounded" />
                                            Trazer os dados desta APA para a ficha
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!verificandoApa && !apaEncontrada && (
                            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-500">
                                Nenhuma APA encontrada para este paciente. A ficha abre em branco.
                            </div>
                        )}
                    </div>
                )}

                <div className="flex justify-between gap-2 p-4 border-t border-slate-200">
                    {etapa === 'confirmar' ? (
                        <button onClick={() => { setEtapa('escolher'); setApaEncontrada(null); }} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">
                            <ArrowLeft size={14} /> Voltar
                        </button>
                    ) : <span />}

                    <div className="flex gap-2">
                        <button onClick={onFechar} className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                        {etapa === 'confirmar' && (
                            <button
                                onClick={confirmar}
                                disabled={verificandoApa}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-lg shadow-sm"
                            >
                                Abrir ficha
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
