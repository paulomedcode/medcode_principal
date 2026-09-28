import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { Activity, Plus, Loader2, ArrowLeft, Save, Lock, Unlock, Search, ClipboardList, CloudOff, Printer, FileText, Sparkles, MessageSquarePlus, Trash2, Keyboard, ArrowRightLeft, Eye, RotateCcw, Globe, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePermission } from '../contexts/PermissionContext';
import { useAuth } from '../contexts/AuthContext';
import { useUnit } from '../contexts/UnitContext';
import { supabase } from '../services/supabase';
import { logAction } from '../utils/logger';
import NovaFichaDialog from '../components/fa/NovaFichaDialog';
import CabecalhoFicha from '../components/fa/CabecalhoFicha';
import GradeTemporal from '../components/fa/GradeTemporal';
import DialogoMedicacao from '../components/fa/DialogoMedicacao';
import DialogoFinalizar from '../components/fa/DialogoFinalizar';
import FichaPrintTemplate from '../components/fa/FichaPrintTemplate';
import BarraHorarios from '../components/fa/BarraHorarios';
import RodapeFicha from '../components/fa/RodapeFicha';
import DialogoPassagem from '../components/fa/DialogoPassagem';
import VisualizarApaDialog from '../components/fa/VisualizarApaDialog';
import DialogoLinhaExtra from '../components/fa/DialogoLinhaExtra';
import {
    criarFicha, carregarFicha, listarFichas, salvarDados, salvarHorarios,
    registrarEventos, removerEventoDaFicha, lerFila, sincronizarFila,
    finalizarFicha, reabrirFicha, adicionarAdendo, excluirFicha, restaurarFicha,
    indicarProximoResponsavel, assumirFicha
} from '../services/fichaAnestesica';
import { carregarParametros, carregarFarmacos, carregarNarrativas } from '../services/faCatalogos';
import { criarEvento, TIPOS } from '../utils/fichaAnestesica/eventos';
import { lerTecladoNaTela, gravarTecladoNaTela } from '../utils/fichaAnestesica/preferencias';
import { gravarRascunho, lerRascunho, limparRascunho, rascunhoMaisNovo } from '../utils/fichaAnestesica/rascunho';
import { gerarNarrativa } from '../utils/fichaAnestesica/narrativa';
import { resumoFluidos } from '../utils/fichaAnestesica/projecao';

/**
 * Ficha Anestésica — lista e abertura.
 *
 * A grade temporal entra na sequência; esta primeira parte cobre nascer da fila
 * ou avulsa, aproveitar a APA e manter o cabeçalho.
 */
export default function FichaAnestesica() {
    const location = useLocation();
    const navigate = useNavigate();
    const { hasPermission } = usePermission();
    const { currentUser: user } = useAuth();
    const { unidadeAtual, unidades } = useUnit();

    const podeEditar = hasPermission('Criar/Editar FA') || hasPermission('Acesso Total (Admin)');
    const podeFinalizar = hasPermission('Finalizar FA') || hasPermission('Acesso Total (Admin)');
    const podeReabrir = hasPermission('Reabrir FA Finalizada') || hasPermission('Acesso Total (Admin)');
    const podeAssumirDeOutro = hasPermission('Assumir FA de Outro') || hasPermission('Acesso Total (Admin)');
    // Excluir ficha FINALIZADA é permissão; excluir a própria ficha ainda em
    // aberto é do dono do caso, sem chave nenhuma.
    const podeExcluirFinalizada = hasPermission('Excluir AIH/APA') || hasPermission('Acesso Total (Admin)');
    const podeVerTodasUnidades = hasPermission('Ver Fichas de Todas as Unidades') || hasPermission('Acesso Total (Admin)');
    const nomeUsuario = user?.name || user?.nome || user?.displayName || '';
    const meuId = user?.uid || user?.id || null;

    /**
     * Quem pode mandar esta ficha para a lixeira.
     *
     * Em aberto: só o dono do caso — nem quem tem a permissão de excluir tira a
     * ficha da mão de quem está com o paciente agora. Para isso existe assumir o
     * caso ([[Assumir FA de Outro]]), que fica registrado.
     * Finalizada: só quem tem 'Excluir AIH/APA'.
     * Nos dois casos a ficha vai para a lixeira e fica lá — ficha anestésica
     * nunca é apagada de verdade.
     */
    const podeApagar = (item) => {
        if (item?.status === 'finalizada') return podeExcluirFinalizada;
        const minha = !item?.responsavel_id || item.responsavel_id === meuId;
        return minha && podeEditar;
    };

    // A lixeira aparece para quem pode apagar alguma coisa — o dono precisa dela
    // para restaurar a própria ficha.
    const podeVerLixeira = podeEditar || podeExcluirFinalizada;

    const [modo, setModo] = useState('lista');
    const [fichas, setFichas] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [busca, setBusca] = useState('');
    const [mostrarDialogo, setMostrarDialogo] = useState(false);
    const [cirurgiaSugerida, setCirurgiaSugerida] = useState(null);
    const [mostrarLixeira, setMostrarLixeira] = useState(false);
    // Filtros da lista, no mesmo espírito da APA.
    const [mostrarTodasUnidades, setMostrarTodasUnidades] = useState(false);
    const [filtroStatus, setFiltroStatus] = useState('Todos');
    const [filtroDataInicio, setFiltroDataInicio] = useState('');
    const [filtroDataFim, setFiltroDataFim] = useState('');
    const [filtroAnestesista, setFiltroAnestesista] = useState('Todos');

    const [ficha, setFicha] = useState(null);
    const [cabecalho, setCabecalho] = useState({});
    const [salvando, setSalvando] = useState(false);
    const [pendentes, setPendentes] = useState(0);
    const [parametros, setParametros] = useState([]);
    const [eventos, setEventos] = useState([]);
    const [passoMin, setPassoMin] = useState(5);
    const [farmacos, setFarmacos] = useState([]);
    const [colunaMedicacao, setColunaMedicacao] = useState(null);
    const [medicacaoEmEdicao, setMedicacaoEmEdicao] = useState(null);
    const [modelosNarrativa, setModelosNarrativa] = useState([]);
    const [dialogoAssinatura, setDialogoAssinatura] = useState(null);
    const [narrativa, setNarrativa] = useState('');
    const [imprimindo, setImprimindo] = useState(false);
    const [novoAdendo, setNovoAdendo] = useState('');
    const [extras, setExtras] = useState({});
    // Preferência do aparelho, não do usuário: o tablet da sala quer o teclado na
    // tela, o desktop não.
    const [tecladoNaTela, setTecladoNaTela] = useState(lerTecladoNaTela);
    const [dialogoPassagem, setDialogoPassagem] = useState(null);   // 'passar' | 'assumir'
    const [statusSalvamento, setStatusSalvamento] = useState('salvo'); // salvo | pendente | salvando | erro
    const [salvoEm, setSalvoEm] = useState(null);
    const [rascunhoPendente, setRascunhoPendente] = useState(null);
    const [vendoApa, setVendoApa] = useState(false);
    const [adicionandoLinha, setAdicionandoLinha] = useState(false);

    // O que o banco já tem, para não ficar salvando o que não mudou.
    const referenciaSalva = useRef('');
    // Os valores de agora, para o salvamento de saída (a aba fechando não espera render).
    const emEdicao = useRef({ cabecalho: {}, narrativa: '', extras: {} });

    const alternarTeclado = () => {
        setTecladoNaTela(atual => {
            gravarTecladoNaTela(!atual);
            return !atual;
        });
    };

    const marcarComoSalvo = (conteudo) => {
        referenciaSalva.current = JSON.stringify(conteudo);
        setStatusSalvamento('salvo');
    };

    /* --- estado do caso (quem pode escrever) ------------------------------- */

    const finalizada = ficha?.status === 'finalizada';
    const souResponsavel = !ficha?.responsavel_id || ficha.responsavel_id === meuId;
    const somenteLeitura = finalizada || !podeEditar || !souResponsavel;

    // Quem não tem a permissão nunca sai da própria unidade, mesmo que o estado
    // tenha ficado ligado de antes (permissão revogada com a tela aberta).
    const buscandoTodasUnidades = podeVerTodasUnidades && mostrarTodasUnidades;

    const filtrosDaLista = useMemo(() => ({
        unidade: unidadeAtual,
        unidades: buscandoTodasUnidades && unidades?.length ? unidades : null,
        lixeira: mostrarLixeira,
        status: filtroStatus === 'Todos' ? null : filtroStatus,
        dataInicio: filtroDataInicio || null,
        dataFim: filtroDataFim || null
    }), [unidadeAtual, unidades, buscandoTodasUnidades, mostrarLixeira, filtroStatus, filtroDataInicio, filtroDataFim]);

    const recarregarLista = useCallback(async () => {
        setCarregando(true);
        const { data, error } = await listarFichas(filtrosDaLista);
        if (error) toast.error('Erro ao carregar fichas: ' + error.message);
        setFichas(data || []);
        setCarregando(false);
    }, [filtrosDaLista]);

    useEffect(() => {
        let ativo = true;
        setCarregando(true);
        listarFichas(filtrosDaLista).then(({ data }) => {
            if (!ativo) return;
            setFichas(data || []);
            setCarregando(false);
        });
        return () => { ativo = false; };
    }, [filtrosDaLista]);

    useEffect(() => {
        let ativo = true;
        carregarParametros().then(lista => { if (ativo) setParametros(lista); });
        carregarFarmacos().then(lista => { if (ativo) setFarmacos(lista); });
        carregarNarrativas().then(lista => { if (ativo) setModelosNarrativa(lista); });
        return () => { ativo = false; };
    }, []);

    /**
     * Entrada vinda de fora: o widget da home manda `fichaId` para retomar, e a
     * fila cirúrgica manda `surgery` para já abrir com aquele paciente.
     */
    useEffect(() => {
        const estado = location.state;
        if (!estado) return;

        navigate(location.pathname, { replace: true, state: null });

        if (estado.fichaId) {
            abrirFicha(estado.fichaId);
        } else if (estado.surgery) {
            setCirurgiaSugerida(estado.surgery);
            setMostrarDialogo(true);
        }
        // Só reage ao que chegou na navegação; o resto do fluxo é local.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.state]);

    /* --- abrir e criar ---------------------------------------------------- */

    const abrirFicha = async (id) => {
        const { data, error } = await carregarFicha(id);
        if (error || !data) return toast.error('Não foi possível abrir a ficha.');
        setFicha(data);
        setCabecalho(data.dados?.cabecalho || {});
        // A fila local entra na projeção junto com o que já está no banco, para
        // o que foi registrado sem rede continuar visível na grade.
        setEventos([...(data.eventos || []), ...lerFila(data.id)]);
        setNarrativa(data.dados?.narrativa || '');
        setExtras(data.dados?.extras || {});
        setPendentes(lerFila(data.id).length);
        setModo('ficha');

        // O que já está no banco vira a referência do salvamento automático: sem
        // isto, abrir a ficha dispararia um salvamento do que acabou de chegar.
        marcarComoSalvo({ cabecalho: data.dados?.cabecalho || {}, narrativa: data.dados?.narrativa || '', extras: data.dados?.extras || {} });
        setSalvoEm(data.updated_at || null);

        // Anotação que ficou no aparelho e não chegou ao banco (bateria, rede,
        // aba fechada). Não entra sozinha: quem decide é o médico, porque o que
        // está no servidor pode ser de outro aparelho e mais completo.
        const rascunho = lerRascunho(data.id);
        setRascunhoPendente(rascunhoMaisNovo(rascunho, data.updated_at) ? rascunho : null);
        if (!rascunhoMaisNovo(rascunho, data.updated_at)) limparRascunho(data.id);

        if (lerFila(data.id).length > 0) {
            const resultado = await sincronizarFila(data.id);
            setPendentes(resultado.pendentes);
            if (resultado.enviados) toast.success('Registros pendentes enviados.');
        }
    };

    const criar = async (escolha) => {
        setMostrarDialogo(false);

        // A tabela `users` usa `name`; deploys antigos podem ter `nome`.
        let nome = user?.name || user?.nome || user?.displayName || '';
        let crm = user?.crm || '';
        let rqe = user?.rqe || '';
        const idMedico = user?.uid || user?.id || null;

        if (idMedico) {
            const { data: dadosUsuario } = await supabase.from('users').select('*').eq('id', idMedico).maybeSingle();
            if (dadosUsuario) {
                nome = dadosUsuario.name || dadosUsuario.nome || nome;
                crm = dadosUsuario.crm || crm;
                rqe = dadosUsuario.rqe || rqe;
            }
        }

        if (!nome) {
            toast.error('Não foi possível identificar o anestesista logado. Verifique seu cadastro de usuário.');
            return;
        }

        const nova = {
            paciente_id: escolha.pacienteId,
            apa_id: escolha.apaId,
            surgery_id: escolha.surgeryId,
            unidade: unidadeAtual || null,
            paciente_nome: escolha.pacienteNome,
            procedimento: escolha.procedimento,
            anestesista_id: idMedico,
            anestesista_nome: nome,
            anestesista_crm: crm,
            anestesista_rqe: rqe,
            // Quem abre a ficha fica com o caso. Enquanto não passar para outra
            // pessoa, é o único que registra nela.
            responsavel_id: idMedico,
            responsavel_nome: nome,
            criado_por: idMedico,
            status: 'em_andamento',
            dados: { cabecalho: escolha.cabecalho }
        };

        const { data, error } = await criarFicha(nova);
        if (error) return toast.error('Erro ao criar ficha: ' + error.message);

        await logAction('CRIAÇÃO DE FICHA ANESTÉSICA', `Ficha criada para ${escolha.pacienteNome}.`);
        toast.success('Ficha aberta!');
        setFicha(data);
        setCabecalho(data.dados?.cabecalho || {});
        marcarComoSalvo({ cabecalho: data.dados?.cabecalho || {}, narrativa: '', extras: {} });
        setSalvoEm(data.updated_at || null);
        setRascunhoPendente(null);
        setEventos([]);
        setNarrativa('');
        setExtras({});
        setPendentes(0);
        setModo('ficha');
    };

    const salvarCabecalho = async () => {
        if (!ficha) return;
        setSalvando(true);
        const { error } = await salvarDados(ficha.id, { ...(ficha.dados || {}), cabecalho, narrativa, extras });
        setSalvando(false);

        if (error) {
            setStatusSalvamento('erro');
            return toast.error('Erro ao salvar: ' + error.message);
        }
        setFicha(atual => ({ ...atual, dados: { ...(atual.dados || {}), cabecalho, narrativa, extras } }));
        marcarComoSalvo({ cabecalho, narrativa, extras });
        setSalvoEm(new Date().toISOString());
        limparRascunho(ficha.id);
        toast.success('Ficha salva.');
    };

    /* --- salvamento automático --------------------------------------------- */

    // O que está sendo digitado fica sempre à mão do salvamento de saída.
    emEdicao.current = { cabecalho, narrativa, extras };

    /**
     * Grava sozinho o que não é registro da grade — cabeçalho, descrição,
     * ventilador, destino. A grade tem fila própria; isto aqui era o que se
     * perdia quando o tablet descarregava antes de alguém clicar em Salvar.
     *
     * O espelho local é escrito na hora, a cada tecla; o banco recebe depois de
     * uma pausa na digitação. Assim nem a rede oscilando nem a bateria acabando
     * levam junto o que já foi anotado.
     */
    useEffect(() => {
        if (modo !== 'ficha' || !ficha?.id || somenteLeitura) return;

        const conteudo = JSON.stringify({ cabecalho, narrativa, extras });
        if (conteudo === referenciaSalva.current) return;

        gravarRascunho(ficha.id, { cabecalho, narrativa, extras });
        setStatusSalvamento('pendente');

        const temporizador = setTimeout(async () => {
            setStatusSalvamento('salvando');
            const { error } = await salvarDados(ficha.id, { ...(ficha.dados || {}), cabecalho, narrativa, extras });

            if (error) {
                // Não some da tela nem do aparelho: fica pendente e tenta de novo
                // na próxima alteração ou no botão de salvar.
                setStatusSalvamento('erro');
                return;
            }

            referenciaSalva.current = conteudo;
            limparRascunho(ficha.id);
            setFicha(atual => (atual?.id === ficha.id
                ? { ...atual, dados: { ...(atual.dados || {}), cabecalho, narrativa, extras } }
                : atual));
            setStatusSalvamento('salvo');
            setSalvoEm(new Date().toISOString());
        }, 1200);

        return () => clearTimeout(temporizador);
        // `ficha.dados` muda como consequência do próprio salvamento; entrar na
        // lista faria o efeito se perseguir.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cabecalho, narrativa, extras, modo, ficha?.id, somenteLeitura]);

    /** Aba escondida ou fechando: o que estiver na mão vai agora, sem esperar a pausa. */
    useEffect(() => {
        if (modo !== 'ficha' || !ficha?.id || somenteLeitura) return;
        const fichaId = ficha.id;
        const dadosDaFicha = ficha.dados || {};

        const descarregar = () => {
            const atual = emEdicao.current;
            if (JSON.stringify(atual) === referenciaSalva.current) return;
            gravarRascunho(fichaId, atual);
            salvarDados(fichaId, { ...dadosDaFicha, ...atual });
        };

        const aoEsconder = () => { if (document.visibilityState === 'hidden') descarregar(); };
        document.addEventListener('visibilitychange', aoEsconder);
        window.addEventListener('pagehide', descarregar);
        return () => {
            document.removeEventListener('visibilitychange', aoEsconder);
            window.removeEventListener('pagehide', descarregar);
        };
    }, [modo, ficha?.id, ficha?.dados, somenteLeitura]);

    /** Traz de volta o que ficou no aparelho e nunca chegou ao banco. */
    const restaurarRascunho = () => {
        const conteudo = rascunhoPendente?.conteudo;
        if (!conteudo) return;
        setCabecalho(conteudo.cabecalho || {});
        setNarrativa(conteudo.narrativa || '');
        setExtras(conteudo.extras || {});
        setRascunhoPendente(null);
        toast.success('Anotações do aparelho restauradas — confira antes de seguir.');
    };

    const descartarRascunho = () => {
        limparRascunho(ficha.id);
        setRascunhoPendente(null);
    };

    const voltarParaLista = async () => {
        setModo('lista');
        setFicha(null);
        setEventos([]);
        await recarregarLista();
    };

    /**
     * Ao voltar para a aba, recarrega os registros do banco.
     *
     * Cobre o caso real de trocar de aparelho no meio da cirurgia: o tablet
     * ficou aberto, o registro foi feito no desktop, e ao tocar no tablet ele se
     * atualiza sozinho. Só os eventos e os horários são recarregados — o que
     * está sendo digitado (cabeçalho, descrição, rodapé) não é tocado, para não
     * apagar trabalho em andamento.
     */
    useEffect(() => {
        if (modo !== 'ficha' || !ficha?.id) return;

        const fichaId = ficha.id;
        let ocupado = false;

        const atualizar = async () => {
            if (document.visibilityState !== 'visible' || ocupado) return;
            ocupado = true;
            const { data } = await carregarFicha(fichaId);
            ocupado = false;
            if (!data) return;

            setEventos([...(data.eventos || []), ...lerFila(fichaId)]);
            setFicha(atual => (atual?.id !== fichaId ? atual : {
                ...atual,
                status: data.status,
                inicio_anestesia: data.inicio_anestesia,
                fim_anestesia: data.fim_anestesia,
                eventos: data.eventos,
                adendos: data.adendos,
                reaberturas: data.reaberturas,
                assinada_em: data.assinada_em,
                assinada_por_nome: data.assinada_por_nome,
                // A passagem de plantão pode ter acontecido no outro aparelho: sem
                // isto, quem passou o caso continuaria vendo a ficha como sua.
                responsavel_id: data.responsavel_id,
                responsavel_nome: data.responsavel_nome,
                passagem_para_id: data.passagem_para_id,
                passagem_para_nome: data.passagem_para_nome,
                passagens: data.passagens
            }));
        };

        document.addEventListener('visibilitychange', atualizar);
        window.addEventListener('focus', atualizar);
        return () => {
            document.removeEventListener('visibilitychange', atualizar);
            window.removeEventListener('focus', atualizar);
        };
    }, [modo, ficha?.id]);

    /* --- linha do tempo ---------------------------------------------------- */

    /**
     * Marcos de tempo. Início e fim da anestesia são colunas (ancoram a régua e
     * as buscas); entrada em sala e tempos cirúrgicos ficam nos dados da ficha.
     */
    const horariosDaFicha = {
        entradaSala: extras.horarios?.entradaSala || null,
        inicioAnestesia: ficha?.inicio_anestesia || null,
        inicioCirurgia: extras.horarios?.inicioCirurgia || null,
        fimCirurgia: extras.horarios?.fimCirurgia || null,
        fimAnestesia: ficha?.fim_anestesia || null
    };

    const alterarHorario = async (campo, valorIso) => {
        if (campo === 'inicioAnestesia' || campo === 'fimAnestesia') {
            const chave = campo === 'inicioAnestesia' ? 'inicioAnestesia' : 'fimAnestesia';
            const { error } = await salvarHorarios(ficha.id, { [chave]: valorIso });
            if (error) return toast.error('Erro ao salvar horário: ' + error.message);

            setFicha(atual => ({
                ...atual,
                [campo === 'inicioAnestesia' ? 'inicio_anestesia' : 'fim_anestesia']: valorIso
            }));
            await logAction('FICHA ANESTÉSICA', `${campo === 'inicioAnestesia' ? 'Início' : 'Fim'} da anestesia registrado para ${ficha.paciente_nome}.`);
            return;
        }

        const novosExtras = { ...extras, horarios: { ...(extras.horarios || {}), [campo]: valorIso } };
        setExtras(novosExtras);
        const { error } = await salvarDados(ficha.id, { ...(ficha.dados || {}), cabecalho, narrativa, extras: novosExtras });
        if (error) toast.error('Erro ao salvar horário: ' + error.message);
    };

    const iniciarAnestesia = async () => {
        const inicio = new Date().toISOString();
        const { error } = await salvarHorarios(ficha.id, { inicioAnestesia: inicio });
        if (error) return toast.error('Erro ao iniciar: ' + error.message);

        setFicha(atual => ({ ...atual, inicio_anestesia: inicio }));
        await logAction('FICHA ANESTÉSICA', `Início da anestesia registrado para ${ficha.paciente_nome}.`);
        toast.success('Anestesia iniciada.');
    };

    /**
     * Registro na grade. O evento entra no estado imediatamente e vai para a
     * fila local: em sala, o que foi lançado não pode sumir da tela porque a
     * rede oscilou.
     */
    const registrarNaGrade = async ({ parametro, valor, t, observacao, substituiIds = [] }) => {
        // O gráfico e o arrasto também passam por aqui: nenhum caminho registra
        // no trecho de quem estava com o caso antes.
        if (ficha.responsavel_desde && new Date(t).getTime() < new Date(ficha.responsavel_desde).getTime()) {
            return toast.error('Este trecho é do anestesista anterior. Você registra a partir de quando assumiu o caso.');
        }

        // Lista (ECG) também é medida pontual — muda só a forma de escolher o valor.
        const tipo = parametro.tipo === 'infusao' ? TIPOS.INFUSAO
            : parametro.tipo === 'fluido' ? TIPOS.FLUIDO
                : TIPOS.MEDIDA;

        let evento;
        try {
            evento = criarEvento({
                tipo,
                alvo: parametro.codigo,
                valor,
                unidade: parametro.unidade,
                observacao,
                t,
                autorId: user?.uid || user?.id || null,
                substitui: substituiIds[0] || null
            });
        } catch (erro) {
            return toast.error(erro.message);
        }

        setEventos(atual => [...atual, evento]);

        const resultado = await registrarEventos(ficha.id, [evento]);
        setPendentes(resultado.pendentes);

        // Um volume pode ter sido lançado em várias parcelas na mesma coluna;
        // ao corrigir, o valor digitado passa a ser o único da célula.
        for (const extra of substituiIds.slice(1)) {
            await removerEventoDaFicha(ficha.id, extra, user?.uid || user?.id || null);
            setEventos(atual => atual.map(item => item.id === extra ? { ...item, removido: true } : item));
        }

        if (resultado.bloqueada) {
            toast.error(resultado.erro?.message || 'A ficha não aceita novos registros.');
            setEventos(atual => atual.filter(item => item.id !== evento.id));
        } else if (!resultado.enviados) {
            toast('Registro guardado no aparelho — será enviado quando a conexão voltar.', { icon: '📶' });
        }
    };

    const registrarMedicacao = async ({ farmaco, dose, via, observacao, t, substituiId }) => {
        let evento;
        try {
            evento = criarEvento({
                tipo: TIPOS.MEDICACAO,
                alvo: farmaco.rotulo_curto || farmaco.nome,
                valor: dose,
                unidade: farmaco.unidade,
                via,
                observacao,
                // Horário informado pelo médico; o da coluna é só o padrão.
                t: t || new Date(colunaMedicacao?.inicioMs || Date.now()),
                autorId: user?.uid || user?.id || null,
                substitui: substituiId || null
            });
        } catch (erro) {
            return toast.error(erro.message);
        }

        setEventos(atual => [...atual, evento]);
        setColunaMedicacao(null);
        setMedicacaoEmEdicao(null);

        const resultado = await registrarEventos(ficha.id, [evento]);
        setPendentes(resultado.pendentes);

        if (resultado.bloqueada) {
            toast.error(resultado.erro?.message || 'A ficha não aceita novos registros.');
            setEventos(atual => atual.filter(item => item.id !== evento.id));
        } else if (!resultado.enviados) {
            toast('Medicação guardada no aparelho — será enviada quando a conexão voltar.', { icon: '📶' });
        }
    };

    /* --- linhas e posicionamento da grade ----------------------------------- */

    /**
     * A grade mostra o catálogo do hospital mais o que foi acrescentado nesta
     * ficha. A linha extra mora nos dados da própria ficha: em sala não se para
     * para cadastrar item novo no sistema.
     */
    const linhasDaFicha = [...parametros, ...(extras.linhasExtras || [])];

    const adicionarLinha = ({ rotulo, unidade }) => {
        const codigo = `extra_${String(rotulo).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30)}_${Date.now().toString(36)}`;

        setExtras(atual => ({
            ...atual,
            linhasExtras: [...(atual.linhasExtras || []), {
                codigo, rotulo, unidade,
                secao: 'agentes', tipo: 'infusao', ordem: 900, ativo: true
            }]
        }));
        setAdicionandoLinha(false);
        toast.success(`${rotulo} entrou na grade desta ficha.`);
    };

    const adicionarPosicao = (nome) => {
        if (!nome) return;
        setExtras(atual => ({
            ...atual,
            posicoes: [...(atual.posicoes || []), { nome, horario: new Date().toISOString() }]
        }));
    };

    const removerPosicao = (indice) => {
        setExtras(atual => ({
            ...atual,
            posicoes: (atual.posicoes || []).filter((_, i) => i !== indice)
        }));
    };

    /* --- narrativa e impressão --------------------------------------------- */

    const rotulosParametros = linhasDaFicha.reduce((mapa, p) => ({ ...mapa, [p.codigo]: p.rotulo }), {});

    const montarNarrativa = () => gerarNarrativa({
        cabecalho,
        ficha,
        extras,
        eventos,
        balanco: resumoFluidos(eventos, parametros.filter(p => p.sinal === 'saida').map(p => p.codigo)),
        rotulos: rotulosParametros,
        modelos: modelosNarrativa
    });

    /**
     * A descrição se escreve sozinha enquanto ninguém escreveu à mão.
     *
     * Antes era preciso lembrar de clicar em "Gerar dos registros" — e quem
     * esquecia assinava a ficha sem descrição. Agora ela acompanha o que está
     * sendo registrado; assim que o médico digita no texto, o automático para
     * naquela ficha e não encosta mais no que ele escreveu.
     */
    useEffect(() => {
        if (modo !== 'ficha' || !ficha?.id || somenteLeitura) return;
        if (extras.narrativaManual) return;
        if (parametros.length === 0) return;   // catálogo ainda carregando

        const temporizador = setTimeout(() => {
            const texto = montarNarrativa();
            setNarrativa(atual => (atual === texto ? atual : texto));
        }, 700);

        return () => clearTimeout(temporizador);
        // A própria narrativa não entra: ela é a saída, não a entrada.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cabecalho, extras, eventos, parametros, modelosNarrativa, modo, ficha?.id,
        ficha?.inicio_anestesia, ficha?.fim_anestesia, somenteLeitura]);

    /** Texto tocado pela mão do médico é dele: o automático se cala. */
    const editarNarrativa = (texto) => {
        setNarrativa(texto);
        if (!extras.narrativaManual) setExtras(atual => ({ ...atual, narrativaManual: true }));
    };

    const gerarDescricao = () => {
        if (extras.narrativaManual && !window.confirm('Isto substitui o texto que você escreveu pelo texto montado a partir dos registros. Continuar?')) return;
        setNarrativa(montarNarrativa());
        setExtras(atual => ({ ...atual, narrativaManual: false }));
        toast.success('Descrição refeita a partir dos registros.');
    };

    /**
     * Imprime sempre o que está no banco: o que não foi salvo não sai no papel,
     * para o documento impresso nunca divergir do registro.
     */
    const imprimir = async () => {
        setImprimindo(true);
        const { data, error } = await carregarFicha(ficha.id);
        if (error || !data) {
            setImprimindo(false);
            return toast.error('Não foi possível preparar a impressão.');
        }
        setFicha(data);
        setTimeout(() => {
            window.print();
            setImprimindo(false);
        }, 300);
    };

    /* --- assinatura -------------------------------------------------------- */

    /**
     * De quem se pergunta o consumo ao encerrar: infusão usada na ficha **e** que
     * venha em frasco ou ampola. Oxigênio e ar comprimido saem da rede do
     * hospital — perguntar "quantos frascos" de oxigênio não faz sentido nenhum,
     * e era o que a tela fazia.
     */
    const infusoesUsadas = linhasDaFicha.filter(parametro =>
        parametro.tipo === 'infusao' &&
        parametro.apresentacao &&
        eventos.some(evento => evento.alvo === parametro.codigo && !evento.removido)
    );

    const alterarConsumo = (codigo, alteracoes) => {
        setExtras(atual => ({
            ...atual,
            consumo: { ...(atual.consumo || {}), [codigo]: { ...(atual.consumo?.[codigo] || {}), ...alteracoes } }
        }));
    };

    const finalizar = async () => {
        // O consumo é informado no próprio diálogo de encerramento: precisa
        // estar salvo antes de a ficha travar.
        await salvarDados(ficha.id, { ...(ficha.dados || {}), cabecalho, narrativa, extras });

        const { data, error } = await finalizarFicha(ficha.id, {
            usuarioId: user?.uid || user?.id || null,
            usuarioNome: nomeUsuario,
            fimAnestesia: ficha.fim_anestesia || new Date().toISOString()
        });

        if (error) return toast.error(error.message);
        setFicha(data);
        setDialogoAssinatura(null);
        await logAction('FICHA ANESTÉSICA', `Ficha de ${ficha.paciente_nome} finalizada.`);
        toast.success('Ficha finalizada.');
    };

    const reabrir = async (motivo) => {
        const { data, error } = await reabrirFicha(ficha.id, {
            motivo,
            usuarioId: user?.uid || user?.id || null,
            usuarioNome: nomeUsuario
        });

        if (error) return toast.error(error.message);
        setFicha(data);
        setDialogoAssinatura(null);
        await logAction('FICHA ANESTÉSICA', `Ficha de ${ficha.paciente_nome} reaberta. Motivo: ${motivo}`);
        toast.success('Ficha reaberta.');
    };

    /**
     * Complemento depois do encerramento. É o caminho legítimo para acrescentar
     * informação a uma ficha fechada sem reabrir nem alterar o que foi registrado.
     */
    const salvarAdendo = async () => {
        if (!novoAdendo.trim()) return;
        const { data, error } = await adicionarAdendo(ficha.id, {
            texto: novoAdendo,
            usuarioId: user?.uid || user?.id || null,
            usuarioNome: nomeUsuario
        });

        if (error) return toast.error('Erro ao salvar adendo: ' + error.message);
        setFicha(data);
        setNovoAdendo('');
        await logAction('FICHA ANESTÉSICA', `Adendo acrescentado à ficha de ${ficha.paciente_nome}.`);
        toast.success('Adendo registrado.');
    };

    /* --- responsável pelo caso --------------------------------------------- */

    const indicarProximo = async (medico) => {
        const { data, error } = await indicarProximoResponsavel(ficha.id, {
            paraId: medico?.id || null,
            paraNome: medico?.name || null
        });
        if (error) return toast.error('Erro ao passar o caso: ' + error.message);

        setFicha(data);
        setDialogoPassagem(null);
        await logAction('FICHA ANESTÉSICA', `Caso de ${ficha.paciente_nome} passado para ${medico?.name || '—'}, aguardando aceite.`);
        toast.success(`${medico?.name || 'Anestesista'} foi indicado — o caso segue com você até ele assumir.`);
    };

    const cancelarIndicacao = async () => {
        const { data, error } = await indicarProximoResponsavel(ficha.id, { paraId: null, paraNome: null });
        if (error) return toast.error('Erro ao cancelar: ' + error.message);
        setFicha(data);
        setDialogoPassagem(null);
        toast.success('Passagem cancelada.');
    };

    const assumir = async (motivo) => {
        const { data, error } = await assumirFicha(ficha.id, {
            usuarioId: meuId,
            usuarioNome: nomeUsuario,
            motivo
        });
        if (error) return toast.error(error.message);

        setFicha(data);
        setDialogoPassagem(null);
        await logAction('FICHA ANESTÉSICA', `${nomeUsuario} assumiu o caso de ${ficha.paciente_nome}${motivo ? ` — ${motivo}` : ''}.`);
        toast.success('Caso assumido. Os próximos registros são seus.');
    };

    const excluir = async (item) => {
        if (!podeApagar(item)) {
            return toast.error(item.status === 'finalizada'
                ? 'Ficha finalizada só pode ser excluída por quem tem essa permissão.'
                : 'Ficha em andamento só pode ser excluída pelo anestesista responsável por ela.');
        }
        const finalizada = item.status === 'finalizada';
        const aviso = finalizada
            ? `A ficha de ${item.paciente_nome || 'paciente'} está FINALIZADA e assinada.\n\nEnviar para a lixeira? Ela continua guardada lá e pode ser restaurada.`
            : `Enviar a ficha de ${item.paciente_nome || 'paciente'} para a lixeira? Ela continua guardada lá e pode ser restaurada.`;
        if (!window.confirm(aviso)) return;
        const { error } = await excluirFicha(item.id);
        if (error) return toast.error('Erro ao excluir: ' + error.message);
        await logAction('FICHA ANESTÉSICA', `Ficha de ${item.paciente_nome} enviada para a lixeira${finalizada ? ' (estava finalizada)' : ''}.`);
        toast.success('Ficha enviada para a lixeira.');
        recarregarLista();
    };

    const restaurar = async (item) => {
        if (!podeApagar(item)) return toast.error('Você não tem permissão para restaurar esta ficha.');
        const { error } = await restaurarFicha(item.id);
        if (error) return toast.error('Erro ao restaurar: ' + error.message);
        await logAction('FICHA ANESTÉSICA', `Ficha de ${item.paciente_nome} restaurada da lixeira.`);
        toast.success('Ficha restaurada.');
        recarregarLista();
    };

    const removerDaGrade = async (eventoIds) => {
        for (const eventoId of eventoIds) {
            const { error } = await removerEventoDaFicha(ficha.id, eventoId, user?.uid || user?.id || null);
            if (error) return toast.error('Erro ao remover: ' + error.message);
        }
        setEventos(atual => atual.map(evento =>
            eventoIds.includes(evento.id) ? { ...evento, removido: true } : evento
        ));
        toast.success('Registro removido.');
    };

    /* --- render ------------------------------------------------------------ */

    const formatarDataHora = (valor) => {
        if (!valor) return '—';
        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };

    // Anestesista sai da própria lista carregada: sem cadastro paralelo, e só
    // aparece quem de fato tem ficha no recorte atual.
    const anestesistas = [...new Set(fichas.map(f => f.anestesista_nome).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const filtradas = fichas.filter(item => {
        if (filtroAnestesista !== 'Todos' && item.anestesista_nome !== filtroAnestesista) return false;
        if (!busca.trim()) return true;
        const termo = busca.trim().toLowerCase();
        return `${item.paciente_nome || ''} ${item.procedimento || ''} ${item.anestesista_nome || ''}`.toLowerCase().includes(termo);
    });

    const temFiltro = Boolean(busca) || filtroStatus !== 'Todos' || filtroDataInicio || filtroDataFim || filtroAnestesista !== 'Todos';
    const limparFiltros = () => {
        setBusca(''); setFiltroStatus('Todos'); setFiltroDataInicio(''); setFiltroDataFim(''); setFiltroAnestesista('Todos');
    };

    if (modo === 'ficha' && ficha) {
        const fuiIndicado = ficha.passagem_para_id === meuId;
        const passagens = ficha.passagens || [];

        return (
            <div className="min-h-full py-5 px-3 sm:px-6" style={{ background: 'radial-gradient(circle at 12% 10%, rgba(56,189,248,.15), transparent 28%), linear-gradient(135deg,#e8f0fb,#dbe7f8)' }}>
                <div className="max-w-[1400px] mx-auto rounded-[20px] overflow-hidden bg-white" style={{ boxShadow: '0 24px 70px rgba(15,37,75,.18)', border: '1px solid rgba(52,73,94,.35)' }}>

                    {/* Faixa de identificação, no desenho do protótipo */}
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                        style={{ background: 'linear-gradient(110deg,#071a3d,#123b73 60%,#2563eb)' }}>
                        <div className="flex items-center gap-3 min-w-0">
                            <button onClick={voltarParaLista} className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors shrink-0">
                                <ArrowLeft size={19} />
                            </button>
                            <div className="min-w-0">
                                <h1 className="text-base font-black text-white truncate">{ficha.paciente_nome || 'Ficha anestésica'}</h1>
                                <p className="text-[11px] font-bold text-blue-100/90 truncate">
                                    {ficha.procedimento || 'Procedimento não informado'} · {ficha.anestesista_nome || '—'}
                                    {ficha.inicio_anestesia && (
                                        <> · anestesia {formatarDataHora(ficha.inicio_anestesia)}
                                            {ficha.fim_anestesia ? ` até ${formatarDataHora(ficha.fim_anestesia)}` : ' (em curso)'}</>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* No celular esta fileira não cabe em uma linha só, e sem
                            quebrar ela empurrava Finalizar para fora da tela — a ficha
                            só encerrava girando o aparelho. Quebra em linhas: ação
                            escondida em documento médico-legal não é opção. */}
                        <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto">
                            {pendentes > 0 && (
                                <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-amber-400/90 text-amber-950 text-[11px] font-black">
                                    <CloudOff size={13} /> {pendentes} na fila
                                </span>
                            )}
                            <span className={`px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase ${finalizada ? 'bg-white/20 text-white' : 'bg-emerald-400 text-emerald-950'}`}>
                                {finalizada ? 'Finalizada' : 'Em andamento'}
                            </span>
                            {!finalizada && podeEditar && souResponsavel && ficha.responsavel_id && (
                                <button
                                    onClick={() => setDialogoPassagem('passar')}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors
                                        ${ficha.passagem_para_id ? 'bg-amber-400 text-amber-950 border-amber-400' : 'bg-white/15 hover:bg-white/25 border-white/25 text-white'}`}
                                >
                                    <ArrowRightLeft size={14} />
                                    {ficha.passagem_para_id ? `Aguardando ${ficha.passagem_para_nome || 'aceite'}` : 'Passar o caso'}
                                </button>
                            )}
                            {!finalizada && podeEditar && souResponsavel && (
                                <button
                                    onClick={alternarTeclado}
                                    title={tecladoNaTela ? 'Usar o teclado do aparelho' : 'Usar o teclado na tela'}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors
                                        ${tecladoNaTela ? 'bg-white text-blue-800 border-white' : 'bg-white/15 hover:bg-white/25 border-white/25 text-white'}`}
                                >
                                    <Keyboard size={14} /> Teclado na tela
                                </button>
                            )}
                            {/* A APA inteira a um toque — é o que permite o cabeçalho
                                da ficha ser curto. Sem APA de origem, o botão fica apagado. */}
                            <button
                                onClick={() => ficha.apa_id && setVendoApa(true)}
                                disabled={!ficha.apa_id}
                                title={ficha.apa_id ? 'Ver a avaliação pré-anestésica deste paciente' : 'Esta ficha não nasceu de uma APA'}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-colors
                                    ${ficha.apa_id
                                        ? 'bg-white/15 hover:bg-white/25 border-white/25 text-white'
                                        : 'bg-white/5 border-white/10 text-white/40 cursor-not-allowed'}`}
                            >
                                <FileText size={14} /> Ver APA
                            </button>
                            {hasPermission('Imprimir Documentos') && (
                                <button onClick={imprimir} disabled={imprimindo} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 border border-white/25 text-white text-[11px] font-bold">
                                    {imprimindo ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />} Imprimir
                                </button>
                            )}
                            {/* A ficha se salva sozinha; o botão fica para quem quer
                                a confirmação na hora — e o estado diz sempre onde o
                                trabalho está. */}
                            {!somenteLeitura && (
                                <button
                                    onClick={salvarCabecalho}
                                    disabled={salvando || statusSalvamento === 'salvando'}
                                    title={salvoEm ? `Último salvamento: ${formatarDataHora(salvoEm)}` : 'Ainda não salvo'}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-black disabled:opacity-70
                                        ${statusSalvamento === 'erro' ? 'bg-rose-500 text-white' : 'bg-white text-blue-800'}`}
                                >
                                    {salvando || statusSalvamento === 'salvando'
                                        ? <><Loader2 size={14} className="animate-spin" /> Salvando…</>
                                        : statusSalvamento === 'erro'
                                            ? <><CloudOff size={14} /> Não salvou — tentar de novo</>
                                            : statusSalvamento === 'pendente'
                                                ? <><Save size={14} /> Salvando em instantes…</>
                                                : <><Save size={14} /> Salvo{salvoEm ? ` ${new Date(salvoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}</>}
                                </button>
                            )}
                            {!finalizada && podeFinalizar && souResponsavel && ficha.inicio_anestesia && (
                                <button onClick={() => setDialogoAssinatura('finalizar')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black">
                                    <Lock size={14} /> Finalizar
                                </button>
                            )}
                            {finalizada && podeReabrir && (
                                <button onClick={() => setDialogoAssinatura('reabrir')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-black">
                                    <Unlock size={14} /> Reabrir
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Sobrou anotação neste aparelho que nunca chegou ao banco. Quem
                        decide é o médico: o servidor pode ter versão de outro aparelho. */}
                    {rascunhoPendente && !somenteLeitura && (
                        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-indigo-50 border-b border-indigo-200">
                            <CloudOff size={18} className="text-indigo-600 shrink-0" />
                            <div className="flex-1 min-w-[240px]">
                                <p className="text-xs font-black text-indigo-900">
                                    Este aparelho tem anotações que não chegaram a ser enviadas
                                    ({formatarDataHora(rascunhoPendente.em)}).
                                </p>
                                <p className="text-[11px] font-semibold text-indigo-800 mt-0.5">
                                    Restaurar substitui o que está na tela pelo que ficou guardado aqui.
                                </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                                <button onClick={restaurarRascunho} className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black">
                                    Restaurar
                                </button>
                                <button onClick={descartarRascunho} className="px-3 py-2 rounded-lg text-indigo-700 hover:bg-indigo-100 text-xs font-bold">
                                    Descartar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Assumiu no meio do caso: o que veio antes é do colega. */}
                    {!finalizada && souResponsavel && ficha.responsavel_desde && (
                        <div className="flex items-center gap-3 px-4 py-2 bg-slate-100 border-b border-slate-200">
                            <Lock size={15} className="text-slate-500 shrink-0" />
                            <p className="text-[11px] font-bold text-slate-600">
                                Você assumiu este caso às {new Date(ficha.responsavel_desde).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
                                O que foi registrado antes disso é do anestesista anterior e não pode ser alterado —
                                para corrigir aquele trecho, o caso precisa voltar para quem o registrou.
                            </p>
                        </div>
                    )}

                    {/* O caso é de outra pessoa: dá para acompanhar tudo, não para
                        escrever. Quem precisa continuar o atendimento assume — e a
                        passagem fica registrada. */}
                    {!finalizada && !souResponsavel && (
                        <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-amber-50 border-b border-amber-200">
                            <Eye size={18} className="text-amber-600 shrink-0" />
                            <div className="flex-1 min-w-[240px]">
                                <p className="text-xs font-black text-amber-900">
                                    Ficha em andamento com {ficha.responsavel_nome || 'outro anestesista'} — somente leitura.
                                </p>
                                <p className="text-[11px] font-semibold text-amber-800 mt-0.5">
                                    {fuiIndicado
                                        ? 'Você foi indicado para assumir este caso. Ao assumir, os próximos registros passam a ser seus.'
                                        : 'Para registrar nesta ficha é preciso assumir o caso, e a passagem fica registrada.'}
                                </p>
                            </div>
                            {podeEditar && (fuiIndicado || podeAssumirDeOutro) && (
                                <button
                                    onClick={() => setDialogoPassagem('assumir')}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-black text-white shadow-sm shrink-0 ${fuiIndicado ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-900'}`}
                                >
                                    <ArrowRightLeft size={14} />
                                    {fuiIndicado ? 'Assumir o caso' : 'Assumir com justificativa'}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Cabeçalho e marcos de tempo na mesma faixa, como na ficha de
                        papel: em sala o que importa é ver tudo de relance. */}
                    <div className="p-3 space-y-2" style={{ background: 'linear-gradient(115deg,#f3f7fc,#dbeafe)' }}>
                        <CabecalhoFicha
                            cabecalho={cabecalho}
                            onChange={setCabecalho}
                            isReadOnly={somenteLeitura}
                        />
                        <BarraHorarios
                            horarios={horariosDaFicha}
                            onAlterar={alterarHorario}
                            isReadOnly={somenteLeitura}
                        />
                    </div>

                    <div className="p-4 space-y-4 bg-white">

                    <GradeTemporal
                        parametros={linhasDaFicha}
                        eventos={eventos}
                        inicioAnestesia={ficha.inicio_anestesia}
                        fimAnestesia={ficha.fim_anestesia}
                        passoMin={passoMin}
                        onTrocarPasso={setPassoMin}
                        onIniciarAnestesia={iniciarAnestesia}
                        onRegistrar={registrarNaGrade}
                        onRemover={removerDaGrade}
                        onRegistrarMedicacao={setColunaMedicacao}
                        onEditarMedicacao={setMedicacaoEmEdicao}
                        isReadOnly={somenteLeitura}
                        tecladoNaTela={tecladoNaTela}
                        registroDesde={ficha.responsavel_desde}
                        posicoes={extras.posicoes || []}
                        onAdicionarPosicao={adicionarPosicao}
                        onRemoverPosicao={removerPosicao}
                        onAdicionarLinha={() => setAdicionandoLinha(true)}
                    />

                    <RodapeFicha
                        dados={extras}
                        onAlterar={setExtras}
                        isReadOnly={somenteLeitura}
                        referenciaHorario={ficha.inicio_anestesia}
                    />

                    <div className="rounded-lg border border-slate-300 bg-white p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="flex items-center gap-2 text-sm font-black text-slate-700">
                                <FileText size={16} /> Descrição do ato anestésico
                            </h3>
                            {!somenteLeitura && (
                                <button onClick={gerarDescricao} className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-bold rounded-lg shadow-sm">
                                    <Sparkles size={13} /> Refazer dos registros
                                </button>
                            )}
                        </div>
                        <p className="text-[11px] font-semibold text-slate-500">
                            {extras.narrativaManual
                                ? 'Texto escrito por você — o automático não mexe mais nele. "Refazer" substitui pelo que está registrado.'
                                : 'Vai se escrevendo sozinho, a partir do que foi registrado. Ao editar, o texto passa a ser seu e para de ser refeito.'}
                        </p>
                        <textarea
                            value={narrativa}
                            onChange={e => editarNarrativa(e.target.value)}
                            disabled={somenteLeitura}
                            rows={8}
                            placeholder="Vai se preenchendo conforme a ficha é registrada — ou escreva livremente."
                            className="w-full px-3 py-2 text-xs font-medium leading-relaxed bg-white/70 border-2 border-white shadow-sm rounded-xl outline-none focus:border-blue-400 disabled:opacity-70"
                        />
                    </div>

                    {(finalizada || (ficha.adendos || []).length > 0) && (
                        <div className="rounded-lg border border-slate-300 bg-white p-4 space-y-3">
                            <h3 className="flex items-center gap-2 text-sm font-black text-slate-700">
                                <MessageSquarePlus size={16} /> Adendos
                            </h3>

                            {(ficha.adendos || []).map((adendo, i) => (
                                <div key={i} className="p-3 rounded-xl bg-white/70 border border-white">
                                    <p className="text-[10px] font-black text-slate-400 uppercase">
                                        {formatarDataHora(adendo.criado_em)} · {adendo.autor_nome || '—'}
                                    </p>
                                    <p className="text-xs font-medium text-slate-700 mt-0.5 whitespace-pre-wrap">{adendo.texto}</p>
                                </div>
                            ))}

                            {finalizada && podeEditar && (
                                <div className="space-y-2">
                                    <textarea
                                        value={novoAdendo}
                                        onChange={e => setNovoAdendo(e.target.value)}
                                        rows={3}
                                        placeholder="Acrescentar informação sem reabrir a ficha..."
                                        className="w-full px-3 py-2 text-xs font-medium bg-white/70 border-2 border-white shadow-sm rounded-xl outline-none focus:border-blue-400"
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            onClick={salvarAdendo}
                                            disabled={!novoAdendo.trim()}
                                            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-sm"
                                        >
                                            Registrar adendo
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Quem esteve com o caso, e quando. Em ficha de plantão longo é
                        isto que explica por que a letra muda no meio do documento. */}
                    {passagens.length > 0 && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                            <ArrowRightLeft size={15} className="text-blue-600 shrink-0 mt-0.5" />
                            <div className="text-[11px] font-semibold text-slate-700">
                                <p className="font-black text-blue-900 mb-0.5">Passagens do caso</p>
                                {passagens.map((item, i) => (
                                    <p key={i}>
                                        {formatarDataHora(item.assumida_em)} — de <strong>{item.de_nome || '—'}</strong> para <strong>{item.para_nome || '—'}</strong>
                                        {item.motivo ? ` · ${item.motivo}` : ''}
                                    </p>
                                ))}
                                {ficha.responsavel_nome && !finalizada && (
                                    <p className="text-blue-800 mt-0.5">Agora com <strong>{ficha.responsavel_nome}</strong>.</p>
                                )}
                            </div>
                        </div>
                    )}

                    {(finalizada || (ficha.reaberturas || []).length > 0) && (
                        <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-100 border border-slate-200">
                            {finalizada
                                ? <Lock size={15} className="text-slate-500 shrink-0 mt-0.5" />
                                : <Unlock size={15} className="text-amber-600 shrink-0 mt-0.5" />}
                            <div className="text-[11px] font-semibold text-slate-600">
                                {ficha.assinada_por_nome && (
                                    <p>
                                        {finalizada ? 'Encerrada' : 'Encerramento anterior'} por <strong>{ficha.assinada_por_nome}</strong>
                                        {ficha.assinada_em ? ` em ${formatarDataHora(ficha.assinada_em)}` : ''}.
                                    </p>
                                )}
                                {/* A trilha de reaberturas continua à vista com a ficha em andamento:
                                    é enquanto se corrige que saber o que foi reaberto importa. */}
                                {(ficha.reaberturas || []).map((item, i) => (
                                    <p key={i} className="text-amber-700 mt-0.5">
                                        Reaberta por {item.autor_nome || '—'} em {formatarDataHora(item.reaberta_em)} — {item.motivo}
                                    </p>
                                ))}
                            </div>
                        </div>
                    )}

                    {dialogoAssinatura && (
                        <DialogoFinalizar
                            modo={dialogoAssinatura}
                            assinante={nomeUsuario}
                            pendentes={pendentes}
                            infusoesUsadas={dialogoAssinatura === 'finalizar' ? infusoesUsadas : []}
                            consumo={extras.consumo || {}}
                            onAlterarConsumo={alterarConsumo}
                            onConfirmar={dialogoAssinatura === 'reabrir' ? reabrir : finalizar}
                            onFechar={() => setDialogoAssinatura(null)}
                        />
                    )}

                    </div>

                    {/* Com a APA aberta, quem vai para o papel é a APA: só um
                        `print-master-container` pode existir por vez. */}
                    {!vendoApa && createPortal(
                        <div className="print-master-container">
                            <FichaPrintTemplate ficha={ficha} parametros={linhasDaFicha} />
                        </div>,
                        document.body
                    )}

                    {adicionandoLinha && (
                        <DialogoLinhaExtra onSalvar={adicionarLinha} onFechar={() => setAdicionandoLinha(false)} />
                    )}

                    {vendoApa && ficha.apa_id && (
                        <VisualizarApaDialog apaId={ficha.apa_id} onFechar={() => setVendoApa(false)} />
                    )}

                    {dialogoPassagem && (
                        <DialogoPassagem
                            modo={dialogoPassagem}
                            responsavelNome={ficha.responsavel_nome || ''}
                            indicadoNome={ficha.passagem_para_nome || ''}
                            indicadoId={ficha.passagem_para_id || null}
                            meuId={meuId}
                            onIndicar={indicarProximo}
                            onCancelarIndicacao={cancelarIndicacao}
                            onAssumir={assumir}
                            onFechar={() => setDialogoPassagem(null)}
                        />
                    )}

                    {(colunaMedicacao || medicacaoEmEdicao) && (
                        <DialogoMedicacao
                            farmacos={farmacos}
                            emEdicao={medicacaoEmEdicao}
                            horarioSugerido={medicacaoEmEdicao ? 'Ajuste o horário se precisar' : colunaMedicacao?.rotulo}
                            instanteSugerido={medicacaoEmEdicao?.t || (colunaMedicacao ? new Date(colunaMedicacao.inicioMs).toISOString() : null)}
                            onSalvar={registrarMedicacao}
                            onRemover={(id) => { removerDaGrade([id]); setMedicacaoEmEdicao(null); }}
                            onFechar={() => { setColunaMedicacao(null); setMedicacaoEmEdicao(null); }}
                        />
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-full py-6 px-4 sm:px-8">
            <div className="max-w-[1200px] mx-auto space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="p-2.5 rounded-2xl bg-white/70 text-slate-800 shadow-sm border border-white/80">
                            <Activity size={22} strokeWidth={2.5} />
                        </span>
                        <div>
                            <h1 className="text-2xl font-black text-slate-800">Ficha Anestésica</h1>
                            <p className="text-xs font-bold text-slate-500">
                                {mostrarLixeira
                                    ? 'Lixeira — fichas excluídas, que podem ser restauradas'
                                    : (buscandoTodasUnidades
                                        ? `Todas as minhas unidades (${unidades?.length || 0})`
                                        : (unidadeAtual ? `Unidade: ${unidadeAtual}` : 'Todas as unidades'))}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* A lixeira é do mesmo dono da exclusão: quem não pode apagar
                            também não precisa ver o que foi apagado. */}
                        {podeVerLixeira && (
                            <button
                                onClick={() => setMostrarLixeira(atual => !atual)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold rounded-xl border transition-colors
                                    ${mostrarLixeira ? 'bg-rose-600 text-white border-rose-600' : 'bg-white/70 text-slate-600 border-white hover:border-rose-300'}`}
                            >
                                <Trash2 size={15} /> {mostrarLixeira ? 'Voltar às fichas' : 'Lixeira'}
                            </button>
                        )}
                        {podeEditar && !mostrarLixeira && (
                            <button onClick={() => setMostrarDialogo(true)} className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-sm">
                                <Plus size={16} /> Nova ficha
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-white/60 backdrop-blur-2xl border border-white rounded-3xl shadow-xl shadow-slate-300/40 p-5 md:p-7 space-y-4">
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            value={busca}
                            onChange={e => setBusca(e.target.value)}
                            placeholder="Buscar por paciente, procedimento ou anestesista..."
                            className="w-full pl-9 pr-3 py-2.5 text-xs font-semibold bg-white/80 border-2 border-white shadow-sm rounded-xl outline-none focus:border-blue-400"
                        />
                    </div>

                    {/* Filtros — status e anestesista peneiram a lista carregada,
                        o período vai ao banco (é ele que decide o que vem). */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative flex-1 min-w-[150px]">
                            <select
                                value={filtroStatus}
                                onChange={e => setFiltroStatus(e.target.value)}
                                className="w-full appearance-none pl-3 pr-8 py-2.5 text-xs font-bold text-slate-600 bg-white/80 border-2 border-white shadow-sm rounded-xl outline-none focus:border-blue-400 cursor-pointer"
                            >
                                <option value="Todos">Todos os status</option>
                                <option value="em_andamento">Em andamento</option>
                                <option value="finalizada">Finalizada</option>
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>

                        <div className="relative w-[47%] sm:w-36">
                            <input
                                type="date"
                                value={filtroDataInicio}
                                onChange={e => setFiltroDataInicio(e.target.value)}
                                className="w-full px-3 py-2.5 text-xs font-bold text-slate-600 bg-white/80 border-2 border-white shadow-sm rounded-xl outline-none focus:border-blue-400 cursor-pointer"
                            />
                            <span className="absolute -top-2 left-3 px-1 text-[9px] font-black uppercase tracking-widest text-blue-600 bg-white/90 rounded pointer-events-none">De</span>
                        </div>
                        <div className="relative w-[47%] sm:w-36">
                            <input
                                type="date"
                                value={filtroDataFim}
                                onChange={e => setFiltroDataFim(e.target.value)}
                                className="w-full px-3 py-2.5 text-xs font-bold text-slate-600 bg-white/80 border-2 border-white shadow-sm rounded-xl outline-none focus:border-blue-400 cursor-pointer"
                            />
                            <span className="absolute -top-2 left-3 px-1 text-[9px] font-black uppercase tracking-widest text-blue-600 bg-white/90 rounded pointer-events-none">Até</span>
                        </div>

                        <div className="relative flex-1 min-w-[150px]">
                            <select
                                value={filtroAnestesista}
                                onChange={e => setFiltroAnestesista(e.target.value)}
                                className="w-full appearance-none pl-3 pr-8 py-2.5 text-xs font-bold text-slate-600 bg-white/80 border-2 border-white shadow-sm rounded-xl outline-none focus:border-blue-400 cursor-pointer"
                            >
                                <option value="Todos">Todos os anestesistas</option>
                                {anestesistas.map(nome => <option key={nome} value={nome}>{nome}</option>)}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>

                        {temFiltro && (
                            <button
                                onClick={limparFiltros}
                                className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors"
                            >
                                Limpar
                            </button>
                        )}
                    </div>

                    {/* Sair da unidade da sessão é permissão, não conveniência. */}
                    {podeVerTodasUnidades && (
                        <label className="flex items-center gap-2 cursor-pointer w-fit">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    className="sr-only"
                                    checked={mostrarTodasUnidades}
                                    onChange={e => setMostrarTodasUnidades(e.target.checked)}
                                />
                                <div className={`block w-10 h-6 rounded-full transition-colors border ${mostrarTodasUnidades ? 'bg-blue-500 border-blue-500' : 'bg-slate-200/60 border-slate-200'}`}></div>
                                <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full shadow-sm transition-transform ${mostrarTodasUnidades ? 'translate-x-4' : ''}`}></div>
                            </div>
                            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                                <Globe size={14} className={mostrarTodasUnidades ? 'text-blue-500' : 'text-slate-400'} />
                                Buscar em todas as minhas unidades
                            </span>
                        </label>
                    )}

                    {carregando && <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-blue-600" size={32} /></div>}

                    {!carregando && filtradas.length === 0 && (
                        <div className="py-16 text-center">
                            <ClipboardList className="mx-auto text-slate-300 mb-3" size={40} />
                            <p className="text-sm font-bold text-slate-500">
                                {temFiltro
                                    ? 'Nenhuma ficha encontrada para esses filtros.'
                                    : (mostrarLixeira ? 'A lixeira está vazia.' : 'Nenhuma ficha anestésica ainda.')}
                            </p>
                            {temFiltro && (
                                <button onClick={limparFiltros} className="mt-2 text-xs font-black uppercase tracking-widest text-blue-600 hover:underline">
                                    Limpar filtros
                                </button>
                            )}
                            {!temFiltro && podeEditar && (
                                <p className="text-xs font-semibold text-slate-400 mt-1">Use &quot;Nova ficha&quot; para abrir a primeira.</p>
                            )}
                        </div>
                    )}

                    <div className="space-y-2">
                        {filtradas.map(item => (
                            <button
                                key={item.id}
                                onClick={() => (mostrarLixeira
                                    ? toast('Restaure a ficha para poder abri-la.', { icon: '🗑️' })
                                    : abrirFicha(item.id))}
                                className="w-full text-left p-4 rounded-2xl bg-white/80 border-2 border-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all flex flex-wrap items-center gap-3"
                            >
                                <div className="flex-1 min-w-[200px]">
                                    <p className="text-sm font-black text-slate-800">{item.paciente_nome || 'Sem nome'}</p>
                                    <p className="text-xs font-semibold text-slate-500 mt-0.5">{item.procedimento || '—'}</p>
                                    <p className="text-[10px] font-bold text-slate-400 mt-1">
                                        Início: {formatarDataHora(item.inicio_anestesia)} · {item.anestesista_nome || '—'}
                                        {buscandoTodasUnidades && ` · ${item.unidade || 'sem unidade'}`}
                                    </p>
                                    {/* Quem está com o caso agora — antes de abrir já se sabe se dá
                                        para registrar ou se é só acompanhar. */}
                                    {item.status !== 'finalizada' && item.responsavel_id && item.responsavel_id !== meuId && (
                                        <p className="text-[10px] font-black text-amber-700 mt-1">
                                            Em andamento com {item.responsavel_nome || 'outro anestesista'}
                                            {item.passagem_para_id === meuId ? ' · indicado para você assumir' : ' · somente leitura'}
                                        </p>
                                    )}
                                </div>
                                <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase ${item.status === 'finalizada' ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                                    {item.status === 'finalizada' ? <span className="flex items-center gap-1"><Lock size={11} /> Finalizada</span> : 'Em andamento'}
                                </span>
                                {/* Ficha em aberto é do dono; finalizada é de quem tem a
                                    permissão. Fora isso, nem aparece o botão. */}
                                {podeApagar(item) && (
                                    mostrarLixeira ? (
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => { e.stopPropagation(); restaurar(item); }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); restaurar(item); } }}
                                            title="Restaurar esta ficha"
                                            className="flex items-center gap-1.5 px-3 py-2 text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer text-xs font-black"
                                        >
                                            <RotateCcw size={14} /> Restaurar
                                        </span>
                                    ) : (
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => { e.stopPropagation(); excluir(item); }}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); excluir(item); } }}
                                            title="Enviar para a lixeira"
                                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                        >
                                            <Trash2 size={15} />
                                        </span>
                                    )
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {mostrarDialogo && (
                <NovaFichaDialog
                    unidadeAtual={unidadeAtual}
                    cirurgiaSugerida={cirurgiaSugerida}
                    onFechar={() => { setMostrarDialogo(false); setCirurgiaSugerida(null); }}
                    onConfirmar={criar}
                />
            )}
        </div>
    );
}
