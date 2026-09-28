import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWhiteLabel } from '../contexts/WhiteLabelContext';
import { useUnit } from '../contexts/UnitContext';
import { supabase } from '../services/supabase';

export default function ApaPrintTemplate({ data }) {
    const { currentUser } = useAuth();
    const { theme } = useWhiteLabel();
    const { unidadesObj } = useUnit();

    const unidadeDoContexto = (unidadesObj || []).find(u => u.nome === data?.unidade) || null;
    // O contexto carrega as unidades uma vez, no login: quem cadastra a logo e
    // imprime na mesma sessão veria a versão velha. Relê a unidade ao montar,
    // partindo do que o contexto já tem para o primeiro paint não sair vazio.
    const [unidadeDaApa, setUnidadeDaApa] = useState(unidadeDoContexto);
    useEffect(() => {
        let ativo = true;
        setUnidadeDaApa(unidadeDoContexto);
        if (!data?.unidade) return undefined;
        supabase.from('unidades').select('*').eq('nome', data.unidade).maybeSingle()
            .then(({ data: u }) => { if (ativo && u) setUnidadeDaApa(u); })
            .catch(() => {});
        return () => { ativo = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data?.unidade]);

    if (!data) return null;

    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    const getDoctorPrefix = (nome, sexo) => {
        if (sexo === 'Masculino' || sexo === 'M') return 'DR.';
        if (sexo === 'Feminino' || sexo === 'F') return 'DRA.';
        if (!nome) return 'DR(A).';
        
        try {
            const pNome = nome.trim().toUpperCase().split(' ')[0];
            const nomesFem = ['ALINE', 'CRISTIANE', 'SIMONE', 'TATIANE', 'LILIAN', 'CARMEN', 'HELEN', 'EVELYN', 'IVONE', 'JAQUELINE', 'KAREN', 'RAQUEL', 'ROSE', 'SUELI', 'THAIS', 'THAIZ', 'ISIS', 'LAIS', 'LAÍS', 'BEATRIZ', 'ALICE'];
            const nomesMasc = ['MARCOS', 'ANDRE', 'ANDRÉ', 'DANIEL', 'GABRIEL', 'LUCAS', 'MATHEUS', 'MATEUS', 'RAFAEL', 'FELIPE', 'GUILHERME', 'ARTHUR', 'HEITOR', 'BERNARDO', 'DAVI', 'MIGUEL', 'THIAGO', 'TIAGO', 'IGOR', 'VITOR', 'DENIS', 'WILLIAN', 'ALLAN', 'ALAN', 'ALEX', 'CAUE', 'CAUÊ', 'GIOVANI', 'GIOVANNI', 'JEFERSON', 'JONATAS', 'JONATHAN', 'LUIZ', 'LUIS', 'MICHEL', 'WAGNER', 'ALESSANDRO', 'ANDERSON'];
            
            if (nomesFem.includes(pNome) || pNome.endsWith('A')) return 'DRA.';
            if (nomesMasc.includes(pNome) || pNome.endsWith('O') || pNome.endsWith('S') || pNome.endsWith('R') || pNome.endsWith('L') || pNome.endsWith('M') || pNome.endsWith('N') || pNome.endsWith('E') || pNome.endsWith('D')) return 'DR.';
        } catch(e) {}
        
        return 'DR.'; // Default fallback para masculino ao invés de ficar o estético DR(A)
    };

    const formatarDataRegistro = (campoData) => {
        if (!campoData) return new Date().toLocaleDateString('pt-BR');

        // Se for uma string ISO (ex: "2026-03-01T12:00:00Z") ou objeto Date
        if (campoData instanceof Date || !isNaN(new Date(campoData).getTime())) {
            // Evita formatar strings que já vêm como "01/03/2026"
            if (typeof campoData === 'string' && campoData.includes('/')) return campoData;
            return new Date(campoData).toLocaleDateString('pt-BR');
        }

        return campoData;
    };

    const parseJsonFallback = (val) => {
        if (Array.isArray(val)) return val;
        try { return JSON.parse(val); } catch { return []; }
    };
    
    const listaAlergias = parseJsonFallback(data?.alergias);
    const listaMedicamentos = parseJsonFallback(data?.medicamentos);

    const calcularIdadeLocal = (dataNasc) => {
        if (!dataNasc) return '--';
        try {
            let dateStr = dataNasc;
            if (dateStr.includes('/')) {
                const [d, m, y] = dateStr.split('/');
                if (d && m && y) dateStr = `${y}-${m}-${d}`;
            }
            const hoje = new Date(); const nasc = new Date(dateStr);
            if (isNaN(nasc.getTime())) return data?.idadeInfo || '--';
            let idade = hoje.getFullYear() - nasc.getFullYear();
            const m = hoje.getMonth() - nasc.getMonth();
            if (m < 0 || (m === 0 && hoje.getDate() < nasc.getDate())) idade--;
            if (idade === 0) return `${m < 0 ? m + 12 : m} meses`;
            return `${idade} anos`;
        } catch { return '--'; }
    };

    const checkIsMenor = () => {
        const idadeInfo = data?.idadeInfo || calcularIdadeLocal(data?.dataNasc);
        if (!idadeInfo || idadeInfo === '--') return false;
        if (idadeInfo.toLowerCase().includes('mes')) return true;
        const anos = parseInt(idadeInfo);
        if (!isNaN(anos) && anos < 18) return true;
        return false;
    };

    const isMenor = checkIsMenor();

    // O Termo de Recusa é assinado pelo próprio paciente ("eu recuso"), então
    // não vale para menor de idade. Enquanto for assim, o consentimento do
    // menor mantém a cláusula de transfusão: sem isso ele não autorizaria nada
    // e também não teria termo de recusa para assinar.
    const recusaHemoVigente = data?.plan_recusa_hemo === 'Sim' && !isMenor;


    const getImcData = (imc) => {
        if (!imc) return { label: '', color: '' };
        const v = parseFloat(imc);
        if (v < 18.5) return { label: ' (Abaixo do peso)', color: 'text-amber-700 bg-amber-50 px-1 border-amber-200 rounded-sm' };
        if (v < 25) return { label: ' (Normal)', color: 'text-emerald-700 bg-emerald-50 px-1 border-emerald-200 rounded-sm' };
        if (v < 30) return { label: ' (Sobrepeso)', color: 'text-orange-700 bg-orange-50 px-1 border-orange-200 rounded-sm' };
        if (v < 35) return { label: ' (Obesidade I)', color: 'text-rose-600 bg-rose-50 px-1 border-rose-200 rounded-sm' };
        if (v < 40) return { label: ' (Obesidade II)', color: 'text-rose-700 bg-rose-100 px-1 border-rose-300 rounded-sm' };
        return { label: ' (Obesidade III)', color: 'text-red-900 bg-red-200 px-1 border-red-400 rounded-sm' };
    };

    const imcLocal = data?.imc || (data?.peso && data?.altura ? (parseFloat(data?.peso.toString().replace(',', '.')) / Math.pow(parseFloat(data?.altura.toString().replace(',', '.')) / 100, 2)).toFixed(1) : null);
    const imcInfo = getImcData(imcLocal);
    const imcDisplay = imcLocal ? `${imcLocal}${imcInfo.label}` : '';

    const dataDocumento = formatarDataRegistro(data?.createdAt || data?.dataCriacao || data?.dataRegistro || data?.data);

    // --- Requisição de Transfusão (folha anexa) ---------------------------------
    // Sai sempre que houver reserva de hemoderivados. Protocolo de recusa e reserva
    // não convivem (a APA bloqueia a combinação), mas a checagem fica aqui também
    // para APAs antigas salvas antes dessa trava.
    // A identidade do papel timbrado é da UNIDADE onde a APA foi feita — este
    // deploy atende 13 unidades, então uma identidade por deploy imprimia o
    // hospital errado. Unidade sem cadastro sai só com o nome, sem inventar.
    const identidadeHospital = {
        nome: unidadeDaApa?.razao_social || data?.unidade || '',
        endereco: unidadeDaApa?.endereco || '',
        cnpj: unidadeDaApa?.cnpj || '',
        cidade: unidadeDaApa?.cidade || data?.unidade || '',
        contato: unidadeDaApa?.contato || '',
        logoUrl: unidadeDaApa?.logo_url || ''
    };
    const temRequisicaoTransfusao = data?.plan_hemoderivados === 'Sim' && data?.plan_recusa_hemo !== 'Sim';
    const procEspeciaisReq = Array.isArray(data?.plan_hemo_esp) ? data.plan_hemo_esp : [];
    const hemocomponentesReq = [
        { label: 'Concentrado de Hemácias (CH)', qtd: data?.plan_hemo_ch },
        { label: 'Concentrado de Plaquetas (CP)', qtd: data?.plan_hemo_plaq },
        { label: 'Plasma Fresco Congelado (PFC)', qtd: data?.plan_hemo_pfc },
        { label: 'Crioprecipitado (CRIO)', qtd: data?.plan_hemo_crio },
        { label: data?.plan_hemo_outros ? `Outros: ${data.plan_hemo_outros}` : 'Outros:', qtd: data?.plan_hemo_outros_qtd }
    ];
    const tipoTransfusaoReq = data?.plan_hemo_tipo || '';
    const nomeMedicoSolicitante = data?.anestesistaNome ? `${getDoctorPrefix(data.anestesistaNome, data.anestesistaSexo)} ${data.anestesistaNome}` : '';
    const crmPartes = String(data?.anestesistaCRM || '').match(/^\s*([\d.\-/\s]*?\d)\s*[/\-\s]\s*([A-Za-z]{2})\s*$/);
    const crmNumero = crmPartes ? crmPartes[1].trim() : (data?.anestesistaCRM || '');
    const crmUf = crmPartes ? crmPartes[2].toUpperCase() : '';
    const crmRotulo = crmUf ? `CRM/${crmUf}` : 'CRM';

    const MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    const dataPorExtenso = (() => {
        const bruto = data?.createdAt || data?.dataCriacao || data?.dataRegistro || data?.data;
        let d = bruto ? new Date(bruto) : new Date();
        if (isNaN(d.getTime()) && typeof bruto === 'string' && bruto.includes('/')) {
            const [dia, mes, ano] = bruto.split('/');
            d = new Date(Number(ano), Number(mes) - 1, Number(dia));
        }
        if (isNaN(d.getTime())) d = new Date();
        return `${String(d.getDate()).padStart(2, '0')} de ${MESES_EXTENSO[d.getMonth()]} de ${d.getFullYear()}`;
    })();



    const Checkbox = ({ label, checked }) => (
        <label className="flex items-center gap-1 text-[8.5px] text-gray-800 font-medium">
            <div className={`w-3 h-3 border border-gray-400 flex flex-shrink-0 items-center justify-center rounded-[2px] ${checked ? 'bg-[#002776] border-[#002776]' : 'bg-white'}`}>
                {checked && <span className="text-slate-800 text-[9px] font-bold leading-none">✓</span>}
            </div>
            <span>{label}</span>
        </label>
    );

    const sectionClass = "mb-1 border border-gray-400 rounded-[2px] p-1 print:break-inside-avoid w-full";
    const titleClass = "font-bold text-gray-800 bg-gray-200 px-1 py-[1px] mb-0.5 text-[10px] uppercase";
    const labelClass = "text-[7.5px] text-gray-500 uppercase font-semibold leading-none";
    const valueClass = "text-[9.5px] font-bold text-[#002776] uppercase leading-snug";

    // Campos que a requisição oficial exige mas a APA ainda não coleta
    // (RG, nome da mãe, clínica/leito, convênio, diagnóstico, fibrinogênio):
    // saem como linha em branco para preenchimento à mão.
    const FieldInline = ({ label, value, className = "" }) => (
        <div className={`flex items-baseline gap-1 border-b border-gray-300 min-h-[13px] pb-0.5 ${className}`}>
            <span className={`${labelClass} shrink-0`}>{label}</span>
            <span className={`${valueClass} break-words min-w-0`}>{value || '--'}</span>
        </div>
    );

    // --- Peças da Requisição de Transfusão ---------------------------------
    // O formulário oficial é uma pilha de faixas com borda; cada faixa tem
    // células. Onde o sistema sabe a resposta, imprime o valor no lugar da
    // linha de preencher à mão.
    // formatDate devolve '--' para data vazia; na folha o certo é linha em branco.
    const dataOuVazio = (valor) => {
        const d = formatDate(valor);
        return d && d !== '--' ? d : '';
    };

    const LinhaReq = ({ children, className = "" }) => (
        <div className={`flex items-stretch border-b border-gray-500 last:border-b-0 ${className}`}>{children}</div>
    );

    const CelulaReq = ({ children, className = "", borda = true }) => (
        <div className={`px-1.5 py-[5px] min-h-[21px] min-w-0 overflow-hidden flex items-baseline gap-1 ${borda ? 'border-r border-gray-500 last:border-r-0' : ''} ${className}`}>{children}</div>
    );

    const RotuloReq = ({ children, nowrap = false }) => (
        <span className={`text-[8px] text-gray-800 leading-tight ${nowrap ? 'shrink-0 whitespace-nowrap' : 'min-w-0'}`}>{children}</span>
    );

    const ValorReq = ({ children }) => (
        <span className="text-[9px] font-bold text-[#002776] uppercase leading-tight break-words min-w-0">{children}</span>
    );

    // Linha para preencher à mão, do jeito que o formulário em papel faz.
    const LinhaVaziaReq = ({ className = "" }) => (
        <span className={`flex-1 self-end border-b border-gray-400 mb-[2px] min-w-[16px] ${className}`}>&nbsp;</span>
    );

    // Rótulo + valor, ou rótulo + linha em branco quando não temos o dado.
    const CampoReq = ({ label, value, className = "", borda = true }) => (
        <CelulaReq className={className} borda={borda}>
            <RotuloReq nowrap>{label}</RotuloReq>
            {value ? <ValorReq>{value}</ValorReq> : <LinhaVaziaReq />}
        </CelulaReq>
    );

    const Field = ({ label, value, className = "", valueClassName = "" }) => (
        <div className={`flex flex-col ${className}`}>
            <span className={`${labelClass} mb-0.5`}>{label}</span>
            <div className={`border-b border-gray-300 pb-0.5 min-h-[14px] break-words whitespace-pre-wrap ${valueClass} ${valueClassName}`}>
                {value || '--'}
            </div>
        </div>
    );

    const SectionBlock = ({ title, children }) => (
        <div className={sectionClass}>
            <div className={titleClass}>
                {title}
            </div>
            {children}
        </div>
    );

    const comorbidadesList = [
        { k: 'has', l: 'Hipertensão Arterial' }, { k: 'dm', l: 'Diabetes Mellitus' },
        { k: 'cardio', l: 'Cardiopatia' }, { k: 'arritmia', l: 'Arritmia' },
        { k: 'icc', l: 'ICC' }, { k: 'iam', l: 'IAM prévio' },
        { k: 'asma', l: 'Asma' }, { k: 'dpoc', l: 'DPOC' },
        { k: 'pneumo', l: 'Outra Pneumopatia' }, { k: 'renal', l: 'Nefropatia' },
        { k: 'hepato', l: 'Hepatopatia' }, { k: 'tireo', l: 'Tireopatia' },
        { k: 'neuro', l: 'Doença Neurológica' }, { k: 'convulsao', l: 'Epilepsia/Convulsão' },
        { k: 'avc', l: 'AVC prévio' }, { k: 'coag', l: 'Coagulopatia' },
        { k: 'apneia', l: 'Apneia do Sono / SAOS' }, { k: 'refluxo', l: 'DRGE / Refluxo' },
        { k: 'obesidade', l: 'Obesidade Mórbida' }, { k: 'marcapasso', l: 'Marca-passo / CDI' },
        { k: 'gestante', l: 'Gestante' }, { k: 'hiv', l: 'HIV / Imunossupressão' },
        { k: 'neoplasia', l: 'Neoplasia' }, { k: 'psiq', l: 'Doença Psiquiátrica' }
    ];

    const formatDate = (dateStr) => {
        if (!dateStr) return '--';
        try {
            return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('pt-BR');
        } catch {
            return dateStr;
        }
    };

    // Processamento de exames empacotados em ex_outros
    let displayEco = data?.ex_eco || '';
    let displayOutrosExames = data?.ex_outros || '';

    if (displayOutrosExames.includes('[Ecocardiograma:')) {
        const matches = displayOutrosExames.match(/\[(.*?)\]/g);
        if (matches) {
            const lastPack = matches[matches.length - 1];
            const content = lastPack.replace('[', '').replace(']', '');
            content.split(' | ').forEach(item => {
                if (item.startsWith('Ecocardiograma: ')) displayEco = item.replace('Ecocardiograma: ', '');
            });
            displayOutrosExames = displayOutrosExames.replace(lastPack, '').trim();
        }
    }

    return (
        <div className="w-full max-w-[210mm] mx-auto bg-white text-slate-800 text-[11px] leading-tight font-sans tracking-normal" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            <style type="text/css" media="print">
                {`
                    @page { size: A4 portrait; margin: 10mm; }
                    body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                `}
            </style>
            
            {/* CABEÇALHO */}
            <div className="flex justify-between items-end border-b-2 border-gray-800 pb-1.5 mb-2 print:break-inside-avoid">
                <div className="flex flex-col justify-end w-1/3">
                    {theme.logoUrl && <img src={theme.logoUrl} alt="Logo" className="h-[32px] w-[auto] object-contain object-left mb-1" onError={(e) => e.target.style.display = 'none'} />}
                    <div className="text-[11px] text-gray-500 font-bold uppercase tracking-wide mt-1">
                        {/* Linha 1: Título Inteligente + Nome */}
                        <div>
                            {data?.anestesistaNome ? `${getDoctorPrefix(data.anestesistaNome, data.anestesistaSexo)} ${data.anestesistaNome}` : ''}
                        </div>
                        {/* Linha 2: CRM quebrado para a linha de baixo */}
                        <div>
                            {data?.anestesistaCRM ? `CRM ${data.anestesistaCRM}` : ''}
                            {data?.anestesistaRQE ? ` | RQE ${data.anestesistaRQE}` : ''}
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-center w-1/3 text-center">
                    <h1 className="text-xs font-black tracking-widest text-gray-900 m-0 leading-tight">AVALIAÇÃO PRÉ-ANESTÉSICA</h1>
                    <div className="text-[7.5px] text-gray-500 font-medium mt-0.5">Conforme Resolução CFM 2.174/2017</div>
                </div>
                <div className="flex flex-col items-end w-1/3 text-[8.5px] text-gray-700 font-medium mb-1">
                    <div className="text-[9.5px] font-bold text-gray-900">
                        {data?.id ? `APA-${String(data.id).substring(0, 6).toUpperCase()}` : ''}
                    </div>
                    <div>Data: <span className="font-bold">{dataDocumento}</span></div>
                </div>
            </div>

            {/* 1. IDENTIFICAÇÃO DO PACIENTE */}
            <SectionBlock title="1. Identificação do Paciente">
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 mb-1.5">
                    <Field label="Nome Completo" value={data?.nome} className="col-span-2" />
                    <Field label="CPF" value={data?.cpf} />
                </div>
                <div className="grid grid-cols-6 gap-x-2 gap-y-1.5">
                    <Field label="Data de Nascimento" value={formatDate(data?.dataNasc)} />
                    <Field label="Idade" value={data?.idadeInfo || calcularIdadeLocal(data?.dataNasc)} />
                    <Field label="Sexo" value={data?.sexo} />
                    <Field label="Peso (kg)" value={data?.peso} />
                    <Field label="Altura (cm)" value={data?.altura} />
                    <Field label="IMC" value={imcDisplay} valueClassName={imcInfo.color} />
                </div>
                {/* SINAIS VITAIS BÁSICOS MOVIDOS PARA CÁ */}
                <div className="grid grid-cols-5 gap-x-2 gap-y-1.5 mt-1.5 pt-1.5 border-t border-gray-300">
                    <Field label="PA (mmHg)" value={data?.pa} />
                    <Field label="FC (bpm)" value={data?.fc} />
                    <Field label="SpO2 (%)" value={data?.spo2} />
                    <Field label="FR (irpm)" value={data?.fr} />
                    <Field label="Temp (°C)" value={data?.temp} />
                </div>
            </SectionBlock>

            {/* 2. PROCEDIMENTO PROPOSTO */}
            <SectionBlock title="2. Procedimento Proposto">
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 mb-1.5">
                    <Field label="Procedimento Cirúrgico" value={data?.procedimento} className="col-span-2" />
                    <Field label="Especialidade" value={data?.profissional} />
                </div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                    <Field label="Data Prevista" value={formatDate(data?.dataProcedimento)} />
                    <Field label="Caráter" value={data?.carater} />
                    <Field label="Posição" value={data?.posicao} />
                </div>
            </SectionBlock>

            {/* 3. ANTECEDENTES PATOLÓGICOS / COMORBIDADES */}
            <SectionBlock title="3. Antecedentes Patológicos / Comorbidades">
                <div className="grid grid-cols-4 gap-x-1.5 gap-y-1.5 mb-1.5">
                    {(() => {
                        let checkedCount = 0;
                        const elements = comorbidadesList.map(item => {
                            const isMarcado = !!data?.[item.k] || (Array.isArray(data?.comorbidadesList) && data.comorbidadesList.includes(item.k));
                            if (!isMarcado) return null;
                            checkedCount++;
                            return <Checkbox key={item.k} label={item.l} checked={true} />;
                        });
                        if (checkedCount === 0) return <div className="text-[8.5px] text-gray-500 italic col-span-4">Nenhuma comorbidade reportada.</div>;
                        return elements;
                    })()}
                </div>
                <div className="w-full">
                    <Field label="Detalhes das Comorbidades" value={data?.detalhes_comorbidades} />
                </div>
            </SectionBlock>

            {/* 4. ALERGIAS */}
            <SectionBlock title="4. Alergias">
                {(!listaAlergias || listaAlergias.length === 0) ? (
                    <div className="mb-1">
                        <Checkbox label="Nega alergias declaradas" checked={!!data?.negaAlergia} />
                    </div>
                ) : null}
                {(listaAlergias && listaAlergias.length > 0) && (
                    <table className="w-full text-left border-collapse mt-1">
                        <thead>
                            <tr className="border-b border-gray-300">
                                <th className="py-0.5 text-[7px] font-bold text-gray-500 uppercase">Substância</th>
                                <th className="py-0.5 text-[7px] font-bold text-gray-500 uppercase">Tipo de Reação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {listaAlergias.map((a, i) => (
                                <tr key={i} className="border-b border-gray-100">
                                    <td className="py-0.5 text-[8.5px] text-[#002776] font-bold uppercase">{a?.substancia || '--'}</td>
                                    <td className="py-0.5 text-[8.5px] text-[#002776] font-bold uppercase">{a?.reacao || '--'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </SectionBlock>

            {/* 5. MEDICAMENTOS EM USO */}
            <SectionBlock title="5. Medicamentos em Uso">
                {(!listaMedicamentos || listaMedicamentos.length === 0) ? (
                    <div className="mb-1">
                        <Checkbox label="Nega uso de medicamentos contínuos" checked={!!data?.negaMed} />
                    </div>
                ) : null}
                {(listaMedicamentos && listaMedicamentos.length > 0) && (
                    <table className="w-full text-left border-collapse mt-1">
                        <thead>
                            <tr className="border-b border-gray-300 bg-gray-50">
                                <th className="p-0.5 text-[7px] font-bold text-gray-500 uppercase">Medicamento</th>
                                <th className="p-0.5 text-[7px] font-bold text-gray-500 uppercase">Dose</th>
                                <th className="p-0.5 text-[7px] font-bold text-gray-500 uppercase">Frequência</th>
                                <th className="p-0.5 text-[7px] font-bold text-gray-500 uppercase">Conduta Periop.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {listaMedicamentos.map((m, i) => (
                                <tr key={i} className="border-b border-gray-200">
                                    <td className="p-0.5 text-[8.5px] text-[#002776] font-bold uppercase">{m?.nome || '--'}</td>
                                    <td className="p-0.5 text-[8.5px] text-[#002776] font-bold uppercase">{m?.dose || '--'}</td>
                                    <td className="p-0.5 text-[8.5px] text-[#002776] font-bold uppercase">{m?.frequencia || '--'}</td>
                                    <td className={`p-0.5 text-[8.5px] font-bold uppercase ${m?.conduta?.toLowerCase().includes('manter') ? 'text-green-600' : m?.conduta?.toLowerCase().includes('suspender') ? 'text-red-600' : 'text-[#002776]'}`}>{m?.conduta || '--'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </SectionBlock>

            {/* 6. ANTECEDENTES CIRÚRGICOS / ANESTÉSICOS */}
            <SectionBlock title="6. Antecedentes Cirúrgicos / Anestésicos">
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                    <Field label="Cirurgias Prévias" value={data?.cirurgias} />
                    <Field label="Anestesias Prévias / Complicações" value={data?.anestesias_previas} />
                </div>
            </SectionBlock>

            {/* 7. HÁBITOS */}
            <SectionBlock title="7. Hábitos">
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 mb-1.5">
                    <Field label="Tabagismo" value={data?.tabagismo} />
                    <Field label="Carga Tabágica (anos-maço)" value={data?.carga_tabagica} />
                    <Field label="Parou há" value={data?.parou_fumo} />
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                    <Field label="Etilismo" value={data?.etilismo} />
                    <Field label="Drogas Ilícitas" value={data?.drogas} />
                </div>
            </SectionBlock>

            {/* 8. EXAME FÍSICO */}
            <SectionBlock title="8. Exame Físico">
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 mb-1.5">
                    <Field label="Cardiovascular (ACV)" value={data?.acv} />
                    <Field label="Respiratório (AR)" value={data?.ar} />
                    <Field label="Abdome" value={data?.abdome} />
                </div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 mb-1.5">
                    <Field label="Capacidade Func. (METS)" value={data?.mets} />
                    <Field label="Consciência" value={data?.neuro_consciencia} />
                    <Field label="Déficit Motor/Sens" value={data?.neuro_deficit} />
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 mb-0.5">
                    <Field label="Coluna/Dorso" value={data?.coluna_dorso} />
                    <Field label="Acesso Venoso" value={data?.acesso_venoso} />
                </div>
            </SectionBlock>

            {/* 9. AVALIAÇÃO DE VIA AÉREA */}
            <SectionBlock title="9. Avaliação de Via Aérea">
                <div className="mb-1.5">
                    <span className={`${labelClass} block mb-1`}>Classificação de Mallampati</span>
                    <div className="grid grid-cols-4 gap-1">
                        {['I', 'II', 'III', 'IV'].map((grade) => {
                            const desc = grade === 'I' ? 'Palato mole, fauces, úvula, pilares' :
                                grade === 'II' ? 'Palato mole, fauces e úvula' :
                                    grade === 'III' ? 'Palato mole e base da úvula' : 'Apenas palato duro visível';
                            const isSelected = data?.mallampati === grade;
                            return (
                                <div key={grade} className={`border rounded-[2px] p-1 flex flex-col items-center justify-center text-center ${isSelected ? 'border-[#002776] bg-blue-50' : 'border-gray-200 opacity-50'}`}>
                                    <div className={`text-[11px] font-black ${isSelected ? 'text-[#002776]' : 'text-gray-400'}`}>{grade}</div>
                                    <div className={`text-[6px] leading-tight mt-0.5 ${isSelected ? 'text-[#002776] font-bold' : 'text-gray-400'}`}>{desc}</div>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="grid grid-cols-4 gap-x-1.5 gap-y-1.5 mb-1.5">
                    <Field label="Abertura Bucal" value={data?.va_abertura} />
                    <Field label="Dist. Tireomentual" value={data?.va_dtm} />
                    <Field label="Dist. Esternomento" value={data?.va_dem} />
                    <Field label="Prótese Dentária" value={data?.va_protese} />
                </div>
                <div className="grid grid-cols-3 gap-x-2 gap-y-1.5">
                    <Field label="Mobilidade Cervical" value={data?.va_cervical} />
                    <div className="flex flex-col">
                        <span className={`${labelClass} mb-0.5`}>Via Aérea Difícil</span>
                        <div className={`border-b border-gray-300 pb-0.5 min-h-[14px] break-words whitespace-pre-wrap ${valueClass} ${data?.va_dificil === 'Sim' ? 'text-red-700 bg-red-50 border-red-200 px-1 rounded-sm' : data?.va_dificil === 'Possível' ? 'text-orange-700 bg-orange-50 border-orange-200 px-1 rounded-sm' : ''}`}>
                            {data?.va_dificil || '--'}
                        </div>
                    </div>
                    <Field label="Obs. Via Aérea" value={data?.va_obs} />
                </div>
            </SectionBlock>

            {/* 10. ESTADO FÍSICO */}
            <SectionBlock title="10. Estado Físico - Classificação ASA">
                <div className="p-1 px-2 border-l-4 border-blue-600 bg-blue-50/50 flex justify-between items-center rounded-r-sm">
                    <div>
                        <div className="text-[14px] font-black text-blue-900 tracking-wide uppercase">ASA {data?.asa ? data.asa.replace('ASA ', '') : '--'}</div>
                    </div>
                    {data?.asa_e === 'true' || data?.asa_e === true ? (
                        <div className="px-2 py-0.5 bg-red-100 text-red-700 font-black border border-red-300 text-[10px] rounded-sm uppercase tracking-widest">
                            Emergência (E)
                        </div>
                    ) : null}
                </div>
            </SectionBlock>

            {/* 11. EXAMES COMPLEMENTARES */}
            <SectionBlock title="11. Exames Complementares">
                <div className="mb-1.5 border border-slate-200 p-1">
                    <div className="flex justify-between items-center mb-1 border-b border-slate-100 pb-0.5">
                        <span className="text-[9px] font-bold text-slate-700 uppercase">Exames Laboratoriais</span>
                        {data?.ex_data_lab && <span className="text-[7px] font-bold text-slate-500 uppercase">Data do Exame: {formatDate(data.ex_data_lab)}</span>}
                    </div>
                    <div className="grid grid-cols-6 gap-x-3 gap-y-1">
                        <FieldInline label="Hb" value={data?.ex_hb} />
                        <FieldInline label="Ht" value={data?.ex_ht} />
                        <FieldInline label="Plaq" value={data?.ex_plaq} />
                        <FieldInline label="Leuco" value={data?.ex_leuco} />
                        <FieldInline label="TAP/INR" value={data?.ex_inr} />
                        <FieldInline label="TTPa" value={data?.ex_ttpa} />
                        <FieldInline label="Glicemia" value={data?.ex_glic} />
                        <FieldInline label="HbA1c" value={data?.ex_hba1c} />
                        <FieldInline label="Ureia" value={data?.ex_ureia} />
                        <FieldInline label="Creat" value={data?.ex_creat} />
                        <FieldInline label="Na+" value={data?.ex_na} />
                        <FieldInline label="K+" value={data?.ex_k} />
                        <FieldInline label="TGO" value={data?.ex_tgo} />
                        <FieldInline label="TGP" value={data?.ex_tgp} />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-1.5">
                    <div className="border border-slate-200 p-1">
                        <div className="flex justify-between items-center mb-1 border-b border-slate-100 pb-0.5">
                            <span className="text-[9px] font-bold text-slate-700 uppercase">Exames Cardíacos</span>
                            {data?.ex_data_cardio && <span className="text-[7px] font-bold text-slate-500 uppercase">Data do Exame: {formatDate(data.ex_data_cardio)}</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                            <Field label="ECG" value={data?.ex_ecg} />
                            <Field label="Ecocardiograma" value={displayEco} />
                        </div>
                    </div>
                    
                    <div className="border border-slate-200 p-1">
                        <div className="flex justify-between items-center mb-1 border-b border-slate-100 pb-0.5">
                            <span className="text-[9px] font-bold text-slate-700 uppercase">Exames de Imagem</span>
                            {data?.ex_data_imagem && <span className="text-[7px] font-bold text-slate-500 uppercase">Data do Exame: {formatDate(data.ex_data_imagem)}</span>}
                        </div>
                        <div className="grid grid-cols-1 gap-x-2 gap-y-1">
                            <Field label="RX Tórax" value={data?.ex_rx} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-x-2">
                    <Field label="Outros Exames" value={displayOutrosExames} />
                    <Field label="Observações sobre Exames" value={data?.ex_obs} />
                </div>
            </SectionBlock>

            {/* 12. JEJUM */}
            <SectionBlock title="12. Jejum Pré-Operatório">
                {['2h', '4h', '6h', '6h (Fórmula)', '8h'].includes(data?.jejum_orientacao) ? (
                    <table className="w-full text-left border border-gray-300 mb-1.5 text-[9px]">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="p-1 border border-gray-300 font-bold text-gray-700 uppercase">Orientação de Jejum Mínimo Recomendada</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="p-1 border border-gray-300 font-bold text-rose-700">Tempo de Jejum indicado para o paciente: {data?.jejum_orientacao}</td>
                            </tr>
                        </tbody>
                    </table>
                ) : (data?.jejum_orientacao === 'Padrão ASA' || data?.jejum_orientacao === '') && (data?.jejum_liquidos || data?.jejum_leite || data?.jejum_formula || data?.jejum_leve || data?.jejum_completa) ? (
                    <table className="w-full text-left border border-gray-300 mb-1.5 text-[9px]">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="p-1 border border-gray-300 font-bold text-gray-700 uppercase">Tipo de Ingesta</th>
                                <th className="p-1 border border-gray-300 font-bold text-gray-700 uppercase">Tempo de Jejum Mínimo</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data?.jejum_liquidos && <tr><td className="p-1 border border-gray-300">Líquidos Claros (Água, Chá)</td><td className="p-1 border border-gray-300 text-center font-bold text-rose-600">{data.jejum_liquidos}</td></tr>}
                            {data?.jejum_leite && <tr><td className="p-1 border border-gray-300">Leite Materno</td><td className="p-1 border border-gray-300 text-center font-bold text-rose-600">{data.jejum_leite}</td></tr>}
                            {data?.jejum_formula && <tr><td className="p-1 border border-gray-300">Fórmula Láctea / Leite não humano</td><td className="p-1 border border-gray-300 text-center font-bold text-rose-600">{data.jejum_formula}</td></tr>}
                            {data?.jejum_leve && <tr><td className="p-1 border border-gray-300">Refeição leve</td><td className="p-1 border border-gray-300 text-center font-bold text-rose-600">{data.jejum_leve}</td></tr>}
                            {data?.jejum_completa && <tr><td className="p-1 border border-gray-300">Refeição completa</td><td className="p-1 border border-gray-300 text-center font-bold text-rose-600">{data.jejum_completa}</td></tr>}
                        </tbody>
                    </table>
                ) : null}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                    <Field label="Orientação Específica de Jejum" value={!['2h', '4h', '6h', '6h (Fórmula)', '8h', 'Padrão ASA', ''].includes(data?.jejum_orientacao) ? data?.jejum_orientacao : ''} />
                    <Field label="Profilaxia de Aspiração" value={data?.profilaxia_asp} valueClassName={data?.profilaxia_asp && data.profilaxia_asp !== 'Não indicada' ? 'text-amber-600' : ''} />
                </div>
            </SectionBlock>

            {/* 13. PLANO ANESTÉSICO */}
            <SectionBlock title="13. Plano Anestésico">
                <div className="grid grid-cols-12 gap-x-2 gap-y-1.5 mb-1.5">
                    <Field label="Técnica Prevista" value={data?.plan_tecnica} className="col-span-4" />
                    <Field label="Reserva de UTI" value={data?.plan_destino} valueClassName={data?.plan_destino === 'Sim' ? 'text-rose-600' : ''} className="col-span-2" />
                    <Field label="Hemoderivados" value={data?.plan_hemoderivados} valueClassName={data?.plan_hemoderivados === 'Sim' ? 'text-rose-600' : ''} className="col-span-2" />
                    <Field label="Protocolo de Recusa de Hemotransfusão?" value={data?.plan_recusa_hemo} valueClassName={data?.plan_recusa_hemo === 'Sim' ? 'text-amber-600' : ''} className="col-span-4" />
                </div>
                {data?.plan_hemoderivados === 'Sim' && (
                    <div className="px-2 py-1.5 mb-1.5 bg-rose-50/40 border-l-2 border-rose-300">
                        <div className="grid grid-cols-5 gap-x-2 gap-y-1">
                            {data?.plan_hemo_ch && <Field label="Hemácias (CH)" value={`${data.plan_hemo_ch} un`} valueClassName="text-rose-900" />}
                            {data?.plan_hemo_plaq && <Field label="Plaquetas (CP)" value={`${data.plan_hemo_plaq} un`} valueClassName="text-rose-900" />}
                            {data?.plan_hemo_pfc && <Field label="Plasma (PFC)" value={`${data.plan_hemo_pfc} un`} valueClassName="text-rose-900" />}
                            {data?.plan_hemo_crio && <Field label="Crioprecipitado" value={`${data.plan_hemo_crio} un`} valueClassName="text-rose-900" />}
                            {data?.plan_hemo_outros && <Field label="Outros" value={data.plan_hemo_outros_qtd ? `${data.plan_hemo_outros} (${data.plan_hemo_outros_qtd} un)` : data.plan_hemo_outros} valueClassName="text-rose-900" />}
                        </div>
                        {data?.plan_hemo_indicacao && <div className="mt-1"><Field label="Indicação para Transfusão" value={data.plan_hemo_indicacao} valueClassName="text-rose-900" /></div>}
                        {temRequisicaoTransfusao && <p className="text-[7.5px] text-gray-600 mt-1 font-semibold">Requisição de Transfusão completa na folha anexa deste documento.</p>}
                    </div>
                )}
                {data?.plan_obs && <Field label="Observações do Plano" value={data?.plan_obs} />}
            </SectionBlock>

            {/* 14. PARECER */}
            <SectionBlock title="14. Parecer Anestésico">
                <div className="flex gap-2 mb-2">
                    {[
                        { val: 'Apto', label: 'APTO', colors: 'border-green-500 bg-green-50 text-green-800' },
                        { val: 'Restricao', altVal: 'Apto com restrições', label: 'APTO C/ RESTRIÇÕES', colors: 'border-amber-500 bg-amber-50 text-amber-800' },
                        { val: 'Inapto', label: 'INAPTO', colors: 'border-red-500 bg-red-50 text-red-800' }
                    ].map((opt) => {
                        const isSelected = data?.parecerFinal === opt.val || data?.parecerFinal === opt.altVal;
                        return (
                            <div key={opt.label} className={`flex items-center gap-1 px-2 py-1 border rounded-[2px] text-[9px] font-bold ${isSelected ? opt.colors : 'border-gray-200 text-gray-400 opacity-50'}`}>
                                <div className={`w-2 h-2 rounded-full border flex items-center justify-center ${isSelected ? 'border-current' : 'border-gray-300'}`}>
                                    {isSelected && <div className="w-1 h-1 rounded-full bg-current"></div>}
                                </div>
                                {opt.label}
                            </div>
                        );
                    })}
                </div>
                <div className="mb-1.5">
                    <Field label="Necessita avaliação especializada prévia?" value={data?.parecer_aval_esp} />
                    {data?.parecer_aval_esp === 'Sim' && (
                        <div className="grid grid-cols-2 gap-x-2 mt-1 border-l-2 border-slate-300 pl-2">
                            <Field label="Especialidade" value={data?.parecer_aval_especialidade} />
                            <Field label="Motivo" value={data?.parecer_aval_motivo} />
                        </div>
                    )}
                </div>
                <Field label="Justificativa / Recomendações Finais" value={data?.parecer_obs || ''} />
            </SectionBlock>

            {/* 16. ASSINATURAS */}
            <div className={sectionClass}>
                <div className={titleClass}>16. Assinatura Médica</div>
                <div className="flex justify-center mt-2 pb-2">
                    {/* Médico (Centro) */}
                    <div className="text-center w-1/2">
                        <div className="h-16 flex items-end justify-center pb-1">
                            {/* Assinatura removida conforme solicitação */}
                        </div>
                        <div className="border-t border-black w-full mb-1"></div>
                        <p className="font-bold text-[10px] uppercase text-[#002776]">
                            {/* Título Inteligente + Nome também na assinatura */}
                            {data?.anestesistaNome ? `${getDoctorPrefix(data.anestesistaNome, data.anestesistaSexo)} ${data.anestesistaNome}` : ''}
                        </p>
                        <p className="text-[7.5px] text-gray-500 uppercase">
                            {data?.anestesistaCRM ? `CRM ${data.anestesistaCRM}` : ''}
                            {data?.anestesistaRQE ? ` | RQE ${data.anestesistaRQE}` : ''}
                        </p>
                        <p className="text-[7.5px] text-gray-500 uppercase">MÉDICO ANESTESIOLOGISTA</p>
                    </div>
                </div>
            </div>

            {/* FOOTER */}
            <div className="mt-2 pt-1 border-t border-gray-300 text-[6px] text-gray-500 text-center leading-relaxed print:break-inside-avoid">
                Documento gerado eletronicamente em conformidade com a Resolução CFM 2.174/2017 e CFM 2.314/2022<br />
                Este documento é confidencial e protegido pela LGPD (Lei 13.709/2018). Uso exclusivo para fins médicos.
            </div>

            {/* FOLHA ANEXA: REQUISIÇÃO DE TRANSFUSÃO — mesmo desenho do formulário
                oficial em papel (RDC 57/2010 - ANVISA). Campo que o sistema já
                conhece sai preenchido; o resto mantém a linha de preencher à mão. */}
            {temRequisicaoTransfusao && (
                <div style={{ pageBreakBefore: 'always' }} className="pt-4 print:pt-1">
                    <div className="border border-gray-500 text-gray-900">

                        {/* CABEÇALHO: logo do hospital | título e identificação | logo MedCode */}
                        <div className="flex items-stretch border-b border-gray-500">
                            <div className={`border-r border-gray-500 flex items-center justify-center p-1 ${identidadeHospital.logoUrl ? 'w-[20%]' : 'w-[8%]'}`}>
                                {identidadeHospital.logoUrl && <img src={identidadeHospital.logoUrl} alt="" className="max-h-[42px] w-auto object-contain" onError={(e) => e.target.style.display = 'none'} />}
                            </div>
                            <div className="flex-1 px-2 py-1 text-center">
                                <h1 className="text-[15px] font-black tracking-wide text-gray-900 leading-none">REQUISIÇÃO DE TRANSFUSÃO</h1>
                                <div className="border-t border-gray-400 mt-1 pt-1 text-[8px] leading-[1.35] text-gray-800">
                                    <div>{identidadeHospital.nome}</div>
                                    {identidadeHospital.endereco && <div>{identidadeHospital.endereco}</div>}
                                    {identidadeHospital.cnpj && <div>{identidadeHospital.cnpj}</div>}
                                    {identidadeHospital.contato && <div>{identidadeHospital.contato}</div>}
                                </div>
                            </div>
                            <div className="w-[15%] border-l border-gray-500 flex flex-col items-center justify-center gap-1 p-1">
                                {theme.logoUrl && <img src={theme.logoUrl} alt="" className="max-h-[22px] w-auto object-contain" onError={(e) => e.target.style.display = 'none'} />}
                                <span className="text-[7.5px] font-bold text-gray-700">{data?.id ? `APA-${String(data.id).substring(0, 6).toUpperCase()}` : ''}</span>
                            </div>
                        </div>

                        <LinhaReq>
                            <CampoReq label="RECEPTOR:" value={data?.nome} className="flex-1" />
                            <CampoReq label="RG:" value="" className="w-[26%]" borda={false} />
                        </LinhaReq>

                        <LinhaReq>
                            <CampoReq label="NOME DA MÃE:" value={data?.nome_mae} className="flex-1" />
                            <CampoReq label="PESO:" value={data?.peso ? `${data.peso} kg` : ''} className="w-[18%]" borda={false} />
                        </LinhaReq>

                        <LinhaReq>
                            <CampoReq label="Data de Nascimento:" value={dataOuVazio(data?.dataNasc)} className="w-[27%]" />
                            <CampoReq label="IDADE:" value={data?.idadeInfo || calcularIdadeLocal(data?.dataNasc)} className="w-[17%]" />
                            <CelulaReq className="w-[24%]">
                                <RotuloReq>SEXO:</RotuloReq>
                                <span className="flex items-center gap-2 shrink-0">
                                    <Checkbox label="MASC" checked={['Masculino', 'M'].includes(data?.sexo)} />
                                    <Checkbox label="FEM" checked={['Feminino', 'F'].includes(data?.sexo)} />
                                </span>
                            </CelulaReq>
                            <CampoReq label="CLÍNICA/LEITO:" value="" className="flex-1" borda={false} />
                        </LinhaReq>

                        <LinhaReq>
                            <CelulaReq className="w-[42%] gap-2 flex-wrap">
                                <Checkbox label="Apto." checked={false} />
                                <Checkbox label="Cl. Médica" checked={false} />
                                <Checkbox label="C.C." checked={false} />
                                <Checkbox label="UTI" checked={false} />
                                <Checkbox label="outro" checked={false} />
                            </CelulaReq>
                            <CelulaReq className="flex-1 gap-2 flex-wrap" borda={false}>
                                <RotuloReq>CONVÊNIO:</RotuloReq>
                                <Checkbox label="SUS" checked={String(data?.convenio || '').toUpperCase() === 'SUS'} />
                                <Checkbox label="UNIMED" checked={String(data?.convenio || '').toUpperCase() === 'UNIMED'} />
                                <Checkbox label="outro:" checked={!!data?.convenio && !['SUS', 'UNIMED'].includes(String(data.convenio).toUpperCase())} />
                                {data?.convenio && !['SUS', 'UNIMED'].includes(String(data.convenio).toUpperCase())
                                    ? <ValorReq>{data.convenio}</ValorReq>
                                    : <LinhaVaziaReq />}
                            </CelulaReq>
                        </LinhaReq>

                        <LinhaReq>
                            <CampoReq label="DIAGNÓSTICO CLÍNICO:" value="" className="flex-1" borda={false} />
                        </LinhaReq>

                        <LinhaReq>
                            <CampoReq label="INDICAÇÃO PARA TRANSFUSÃO:" value={data?.plan_hemo_indicacao} className="flex-1" borda={false} />
                        </LinhaReq>

                        <LinhaReq>
                            <CelulaReq className="w-[31%]">
                                <RotuloReq>PACIENTE JÁ RECEBEU TRANSFUSÃO?</RotuloReq>
                                <span className="flex items-center gap-2 shrink-0">
                                    <Checkbox label="SIM" checked={data?.plan_hemo_transf_previa === 'Sim'} />
                                    <Checkbox label="NÃO" checked={data?.plan_hemo_transf_previa === 'Não'} />
                                </span>
                            </CelulaReq>
                            <CelulaReq className="w-[31%]">
                                <RotuloReq>APRESENTOU REAÇÃO TRANSFUSIONAL?</RotuloReq>
                                <span className="flex items-center gap-2 shrink-0">
                                    <Checkbox label="SIM" checked={data?.plan_hemo_reacao === 'Sim'} />
                                    <Checkbox label="NÃO" checked={data?.plan_hemo_reacao === 'Não'} />
                                </span>
                            </CelulaReq>
                            <CampoReq label="QUAL?:" value={data?.plan_hemo_reacao_qual} className="flex-1" borda={false} />
                        </LinhaReq>

                        <LinhaReq>
                            <CampoReq label="DATA DA ÚLTIMA TRANSFUSÃO:" value={dataOuVazio(data?.plan_hemo_ultima_transf)} className="w-[34%]" />
                            <CelulaReq className="w-[28%]">
                                <RotuloReq>GESTAÇÕES PRÉVIAS?</RotuloReq>
                                <span className="flex items-center gap-2 shrink-0">
                                    <Checkbox label="SIM" checked={data?.plan_hemo_gestacoes === 'Sim'} />
                                    <Checkbox label="NÃO" checked={data?.plan_hemo_gestacoes === 'Não'} />
                                </span>
                            </CelulaReq>
                            <CampoReq label="QUANTAS?:" value={data?.plan_hemo_gestacoes_qtd} className="flex-1" borda={false} />
                        </LinhaReq>

                        <LinhaReq>
                            <CelulaReq className="flex-1 gap-2 flex-wrap" borda={false}>
                                <RotuloReq>TIPO DE TRANSFUSÃO:</RotuloReq>
                                <Checkbox label="PROGRAMADA PARA" checked={tipoTransfusaoReq === 'Programada'} />
                                <span className="text-[8.5px] font-bold text-[#002776]">{dataOuVazio(data?.plan_hemo_prog_data) || '____/____/______'}</span>
                                <RotuloReq>HORA:</RotuloReq>
                                <span className="text-[8.5px] font-bold text-[#002776]">{data?.plan_hemo_prog_hora || '____:____'}</span>
                                <span className="ml-auto flex items-center gap-3">
                                    <Checkbox label="NÃO URGENTE (ATÉ 24H)" checked={tipoTransfusaoReq === 'Não urgente (até 24h)'} />
                                    <Checkbox label="URGENTE (ATÉ 3H)" checked={tipoTransfusaoReq === 'Urgente (até 3h)'} />
                                </span>
                            </CelulaReq>
                        </LinhaReq>

                        {/* TERMO DE RESPONSABILIDADE — EXTREMA URGÊNCIA */}
                        <div className="border-b border-gray-500 px-1.5 py-1">
                            <div className="flex items-baseline gap-1 flex-wrap">
                                <Checkbox label="EXTREMA URGÊNCIA:" checked={tipoTransfusaoReq === 'Extrema urgência'} />
                                <span className="text-[8px] font-bold text-gray-900">TERMO DE RESPONSABILIDADE: EU, Dr.(a)</span>
                                {nomeMedicoSolicitante ? <ValorReq>{nomeMedicoSolicitante}</ValorReq> : <LinhaVaziaReq />}
                            </div>
                            <p className="text-[8px] text-justify text-gray-900 leading-snug mt-0.5">
                                <span className="font-bold">{crmRotulo}:</span> <span className="font-bold text-[#002776]">{crmNumero || '________________'}</span>, autorizo a transfusão de emergência, sem conclusão das provas pré-transfusionais, por se tratar de situação clínica em que o retardo do início da transfusão pode acarretar risco de morte para o paciente. Após o envio do hemocomponente os testes devem ser realizados normalmente e deve ser comunicado(a) em caso de anormalidade nos resultados. Fui informado(a) quanto aos riscos transfusionais associados a esse procedimento.
                            </p>
                            <div className="flex justify-center mt-1">
                                <div className="w-[70%] text-center">
                                    {/* Espaço em branco para assinatura e carimbo */}
                                    <div className="h-[56px]"></div>
                                    <div className="border-t border-black w-full"></div>
                                </div>
                            </div>
                            <p className="text-[7.5px] font-bold text-gray-800 text-center leading-tight mt-0.5">
                                SOMENTE PARA TRANSFUSÃO DE EXTREMA URGÊNCIA / MÉDICO RESPONSÁVEL PELA AUTORIZAÇÃO (ASSINATURA/CRM)
                            </p>
                        </div>

                        <div className="border-b border-gray-500 py-[3px] text-center text-[8.5px] font-bold text-gray-900">
                            SINAIS VITAIS E RESULTADOS LABORATORIAIS QUE JUSTIFIQUEM A TRANSFUSÃO
                        </div>

                        <LinhaReq>
                            <CelulaReq className="flex-1 gap-x-3 gap-y-1 flex-wrap" borda={false}>
                                <span className="flex items-baseline gap-1"><RotuloReq>Hb:</RotuloReq>{data?.ex_hb ? <ValorReq>{data.ex_hb}</ValorReq> : <span className="inline-block w-10 border-b border-gray-400">&nbsp;</span>}<RotuloReq>g/dL</RotuloReq></span>
                                <span className="flex items-baseline gap-1"><RotuloReq>Ht:</RotuloReq>{data?.ex_ht ? <ValorReq>{data.ex_ht}</ValorReq> : <span className="inline-block w-8 border-b border-gray-400">&nbsp;</span>}<RotuloReq>%</RotuloReq></span>
                                <span className="flex items-baseline gap-1"><RotuloReq>Plaquetas:</RotuloReq>{data?.ex_plaq ? <ValorReq>{data.ex_plaq}</ValorReq> : <span className="inline-block w-12 border-b border-gray-400">&nbsp;</span>}<RotuloReq>mm³</RotuloReq></span>
                                <span className="flex items-baseline gap-1"><RotuloReq>TP:</RotuloReq>{data?.ex_inr ? <ValorReq>{data.ex_inr}</ValorReq> : <span className="inline-block w-10 border-b border-gray-400">&nbsp;</span>}</span>
                                <span className="flex items-baseline gap-1"><RotuloReq>TTPa:</RotuloReq>{data?.ex_ttpa ? <ValorReq>{data.ex_ttpa}</ValorReq> : <span className="inline-block w-10 border-b border-gray-400">&nbsp;</span>}</span>
                                <span className="flex items-baseline gap-1"><RotuloReq>fibrinogênio:</RotuloReq><span className="inline-block w-12 border-b border-gray-400">&nbsp;</span><RotuloReq>mg%</RotuloReq></span>
                            </CelulaReq>
                        </LinhaReq>

                        <LinhaReq>
                            <CelulaReq className="flex-1 gap-x-6 flex-wrap" borda={false}>
                                <span className="flex items-baseline gap-1"><RotuloReq>PA:</RotuloReq>{data?.pa ? <ValorReq>{data.pa}</ValorReq> : <span className="inline-block w-16 border-b border-gray-400">&nbsp;</span>}<RotuloReq>mmHg</RotuloReq></span>
                                <span className="flex items-baseline gap-1"><RotuloReq>FC:</RotuloReq>{data?.fc ? <ValorReq>{data.fc}</ValorReq> : <span className="inline-block w-14 border-b border-gray-400">&nbsp;</span>}<RotuloReq>bpm</RotuloReq></span>
                                <span className="flex items-baseline gap-1"><RotuloReq>Temperatura:</RotuloReq>{data?.temp ? <ValorReq>{data.temp}</ValorReq> : <span className="inline-block w-14 border-b border-gray-400">&nbsp;</span>}<RotuloReq>°C</RotuloReq></span>
                                {data?.ex_data_lab && <span className="flex items-baseline gap-1 ml-auto"><RotuloReq>Data dos exames:</RotuloReq><ValorReq>{dataOuVazio(data.ex_data_lab)}</ValorReq></span>}
                            </CelulaReq>
                        </LinhaReq>

                        {/* HEMOCOMPONENTES + PROCEDIMENTOS ESPECIAIS */}
                        <div className="flex items-stretch border-b border-gray-500">
                            <div className="w-[52%] border-r border-gray-500">
                                <div className="flex border-b border-gray-500">
                                    <div className="flex-1 px-1.5 py-[3px] text-center text-[8.5px] font-bold border-r border-gray-500">HEMOCOMPONENTES</div>
                                    <div className="w-[45%] px-1.5 py-[3px] text-center text-[8.5px] font-bold">QUANTIDADE (UNIDADES)</div>
                                </div>
                                {hemocomponentesReq.map((hc) => (
                                    <div key={hc.label} className="flex border-b border-gray-400 last:border-b-0">
                                        <div className="flex-1 px-1.5 py-[3px] text-[8px] border-r border-gray-500 min-h-[18px]">{hc.label}</div>
                                        <div className={`w-[45%] px-1.5 py-[3px] text-center text-[9px] font-bold min-h-[18px] ${hc.qtd ? 'text-[#002776]' : ''}`}>{hc.qtd || ''}</div>
                                    </div>
                                ))}
                            </div>
                            <div className="flex-1 flex flex-col">
                                <div className="px-1.5 py-[3px] text-center text-[8.5px] font-bold border-b border-gray-500">Procedimentos Especiais (justificar)</div>
                                <div className="flex items-center justify-between gap-1 px-1.5 py-[3px] border-b border-gray-400">
                                    {['Filtrado', 'Irradiado', 'Lavado', 'Fenotipado'].map(proc => (
                                        <Checkbox key={proc} label={proc} checked={procEspeciaisReq.includes(proc)} />
                                    ))}
                                </div>
                                {data?.plan_hemo_esp_just ? (
                                    <div className="flex-1 px-1.5 py-[3px] text-[9px] font-bold text-[#002776] uppercase break-words">
                                        {data.plan_hemo_esp_just}
                                    </div>
                                ) : (
                                    <div className="flex-1 flex flex-col justify-end">
                                        {[0, 1, 2].map(i => <div key={i} className="border-b border-gray-400 h-[15px]"></div>)}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="border-b border-gray-500 px-1.5 py-[3px] min-h-[58px]">
                            <RotuloReq>Observações:</RotuloReq>{' '}
                            <span className="text-[9px] font-bold text-[#002776] uppercase break-words">{data?.plan_hemo_obs || ''}</span>
                        </div>

                        {/* ASSINATURA DO MÉDICO SOLICITANTE */}
                        <div className="border-b border-gray-500 px-1.5 pt-1 pb-1">
                            <p className="text-[8.5px] text-gray-900">
                                {identidadeHospital.cidade ? `${identidadeHospital.cidade}, ` : ''}{dataPorExtenso}.
                            </p>
                            <div className="flex justify-center">
                                <div className="w-[70%] text-center">
                                    {/* Espaço em branco para assinatura e carimbo */}
                                    <div className="h-[56px]"></div>
                                    <div className="border-t border-black w-full"></div>
                                    <p className="text-[9px] font-bold uppercase text-[#002776] leading-tight">{nomeMedicoSolicitante}</p>
                                    <p className="text-[7.5px] text-gray-700 leading-tight">
                                        {crmNumero ? `${crmRotulo} ${crmNumero}` : ''}
                                        {data?.anestesistaRQE ? ` | RQE ${data.anestesistaRQE}` : ''}
                                    </p>
                                    <p className="text-[7.5px] text-gray-700 leading-tight">Médico solicitante (CRM/Carimbo/Assinatura)</p>
                                </div>
                            </div>
                        </div>

                        <div className="border-b border-gray-500 py-[3px] text-center text-[8px] font-bold text-gray-900">
                            RDC:57/2010 - ANVISA: “A requisição incompleta, inadequada ou ilegível não será aceita”.
                        </div>

                        <LinhaReq className="border-b-0">
                            <CelulaReq className="flex-1 gap-2">
                                <RotuloReq>Recebimento pela Agência Transfusional:</RotuloReq>
                                <RotuloReq>Hora:</RotuloReq>
                                <span className="inline-block w-14 border-b border-gray-400">&nbsp;</span>
                            </CelulaReq>
                            <CelulaReq className="w-[38%] gap-2" borda={false}>
                                <RotuloReq>Hora da liberação:</RotuloReq>
                                <LinhaVaziaReq />
                            </CelulaReq>
                        </LinhaReq>

                    </div>
                </div>
            )}

            {true && (
                <div style={{ pageBreakBefore: 'always' }} className="pt-8 print:pt-4 relative min-h-screen">
                    
                    {/* Watermark */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none z-0 overflow-hidden">
                        <span className="text-[120px] md:text-[160px] font-black text-gray-500 rotate-[-45deg] tracking-widest leading-none select-none opacity-50">
                            MEDCODE
                        </span>
                    </div>

                    <div className="relative z-10">
                        {/* CABEÇALHO DO TERMO */}
                        <div className="text-center mb-4">
                            <h1 className="text-sm font-black uppercase text-gray-900 tracking-wider">
                                TERMO DE CONSENTIMENTO INFORMADO<br/>
                                ATO ANESTÉSICO
                            </h1>
                        </div>

                        <div className="text-[10px] text-justify text-gray-900 leading-snug space-y-2">
                            <p className="indent-8">
                                Eu, <strong className="uppercase">{data?.nome || ''}</strong>, declaro que o médico anestesiologista, <strong className="uppercase">{data?.anestesistaNome ? `${getDoctorPrefix(data.anestesistaNome, data.anestesistaSexo)} ${data.anestesistaNome}` : ''}</strong>, inscrito(a) no CRM/SP sob o nº <strong>{data?.anestesistaCRM || ''}</strong>, informou-me de que serei submetido (a) ao procedimento anestésico abaixo indicado:
                            </p>
                            
                            <div className="w-full text-center py-0.5 mb-1.5 text-[10px] font-bold text-gray-900">
                                {data?.plan_tecnica || ''}
                            </div>

                            <p className="indent-8">
                                O médico anestesiologista me explicou detalhadamente o procedimento acima descrito, informando sobre os riscos e benefícios, assim como as alternativas disponíveis, inclusive quanto à possibilidade de não realização do procedimento ou de desistência da operação, e as suas repercussões.
                            </p>
                            <p className="indent-8">
                                Estou ciente de que qualquer tipo de anestesia envolve riscos, que não há garantia de resultado e que estou sujeito a dores, mal-estar, hemorragias, reações alérgicas, perda ou danos aos dentes, infecções, perda de movimentos (parcial ou completa) e/ou sentidos (como tato, olfato, visão, paladar e audição) temporária ou permanente, derrames, paralisia temporária ou permanente, danos cerebrais, parada do funcionamento de órgãos vitais, paradas cardiorrespiratórias, morte e outras mais.
                            </p>
                            <p className="indent-8">
                                O médico anestesiologista ainda me explicou que poderá haver necessidade de mudança no procedimento anestésico durante a sua execução, caso ocorra qualquer evento indesejado. Dessa forma, com o intuito de salvaguardar a minha vida e a minha saúde, desde já autorizo a realização das mudanças necessárias nos procedimentos inicialmente programados, assim como novos exames e tratamentos{recusaHemoVigente ? '.' : ', incluída a transfusão de sangue e hemocomponentes, mesmo tendo ciência de que a transfusão de sangue poderá implicar riscos de transmissão de doenças, como Aids e hepatite.'}
                            </p>
                            <p className="indent-8">
                                Foi, ainda, explicado que o médico e sua equipe adotarão a melhor técnica e se utilizarão de todos os meios e recursos científicos disponíveis, mas que este compromisso poderá não ser suficiente para afastar completamente a possibilidade de intercorrências insuperáveis, o que consiste em risco inerente à própria operação.
                            </p>
                            <p className="indent-8">
                                Estou ciente de que o tabagismo, mesmo recreativo (cigarro), álcool, fármacos/drogas de qualquer tipo aumentam o risco de ocorrência de complicações.
                            </p>
                            <p className="indent-8">
                                Declaro que, na entrevista e no ato de preenchimento da "Ficha de Exame/Avaliação Anestésica", informei à equipe médica e ao médico anestesiologista a utilização, no passado ou no presente, de tais substâncias, bem como minhas condições físicas e psicológicas, assim como meus hábitos, sem ocultar qualquer fato ou elemento, e que estou ciente de que posso apresentar reações alérgicas desconhecidas por mim e meus médicos a produtos, medicamentos ou soluções utilizadas no meu tratamento que podem, inclusive, causar minha morte.
                            </p>
                            <p className="indent-8">
                                Estou ciente de que devo seguir as instruções médicas antes, durante e após o procedimento cirúrgico, que o sucesso do tratamento médico depende diretamente do meu comportamento e que o não atendimento das orientações que me foram repassadas poderão ser a causa de danos permanentes ou temporários à minha saúde.
                            </p>
                            <p className="indent-8">
                                Fui devidamente informado da possibilidade de cancelamento da operação e/ou do ato anestésico, sem aviso prévio, devido a circunstâncias alheias à vontade do médico, da equipe ou da instituição onde serão realizados.
                            </p>
                            <p className="indent-8">
                                Confirmo que recebi, li e compreendi todas as explicações prestadas, que estou ciente das informações acima apresentadas e que me foi dada a oportunidade de questionar sobre os pontos com os quais não concordasse.
                            </p>
                            <p className="indent-8">
                                Estou ciente, também, de que o médico que realizou a entrevista pré-anestésica não necessariamente será o mesmo que me acompanhará no dia da operação.
                            </p>
                            <p className="indent-8">
                                Dessa forma, declaro o meu pleno e livre consentimento e autorizo a realização do procedimento anestésico necessário, de acordo com a avaliação da equipe médica.
                            </p>
                        </div>

                        <div className="mt-4 flex flex-col items-center">
                            <p className="text-[9px] text-center mb-10 text-gray-700">
                                {data?.unidade || '__________________________________'}, {dataDocumento}
                            </p>

                            <div className="w-full max-w-md mx-auto">
                                <div className="text-center">
                                    <div className="border-t border-black w-full mb-1"></div>
                                    <p className="font-bold text-[9px] uppercase">{data?.nome || '________________________________________'}</p>
                                    <p className="text-[8px] uppercase text-gray-600 mt-1.5">CPF do Paciente: {data?.cpf || '__________________'}</p>
                                </div>

                                <div className="text-center mt-10">
                                    <div className="border-t border-black w-full mb-1"></div>
                                    <p className="text-[9px]">Assinatura do paciente (parente ou responsável, se for o caso)</p>
                                </div>

                                <div className="text-center mt-10">
                                    <div className="border-t border-black w-full mb-1"></div>
                                    <p className="text-[9px]">Testemunha</p>
                                </div>
                            </div>

                            <h3 className="font-bold text-[10px] mb-2 mt-8 text-center text-gray-900 uppercase">DECLARAÇÃO DO MÉDICO RESPONSÁVEL PELO CONSENTIMENTO INFORMADO</h3>
                            
                            <p className="text-[10px] text-justify mb-12 text-gray-900 leading-snug indent-8 w-full">
                                Declaro, para todos os fins, que expliquei em detalhes para o paciente (familiar ou responsável), e dirimi todas as dúvidas apresentadas por ele(s), sobre o ato anestésico a ser praticado, seus benefícios, riscos e alternativas para o procedimento em questão. Informo ainda crer que o paciente ou o seu responsável entendeu adequadamente o que foi explicado.
                            </p>

                            <div className="w-full max-w-md mx-auto">
                                <div className="text-center">
                                    <div className="border-t border-black w-full mb-1"></div>
                                    <p className="font-bold text-[10px] uppercase">
                                        {data?.anestesistaNome ? `${getDoctorPrefix(data.anestesistaNome, data.anestesistaSexo)} ${data.anestesistaNome}` : '________________________________________'}
                                    </p>
                                    <p className="text-[9px] uppercase text-gray-600">
                                        {data?.anestesistaCRM ? `CRM ${data.anestesistaCRM}` : ''}
                                        {data?.anestesistaRQE ? ` | RQE ${data.anestesistaRQE}` : ''}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {recusaHemoVigente && (
                <div style={{ pageBreakBefore: 'always' }} className="pt-4 print:pt-2">
                    {/* CABEÇALHO DO TERMO DE RECUSA */}
                    <div className="flex justify-between items-end border-b-2 border-gray-800 pb-1.5 mb-3 print:break-inside-avoid">
                        <div className="flex flex-col justify-end w-1/3">
                            {theme.logoUrl && <img src={theme.logoUrl} alt="Logo" className="h-[32px] w-[auto] object-contain object-left mb-1" onError={(e) => e.target.style.display = 'none'} />}
                        </div>
                        <div className="flex-1 text-center pb-0.5">
                            <h1 className="text-xs font-black uppercase text-[#002776] tracking-widest">
                                TERMO DE RECUSA
                            </h1>
                        </div>
                        <div className="w-1/3 flex justify-end pb-0.5">
                            <span className="text-[7px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 font-bold uppercase tracking-wider">Pág Extra</span>
                        </div>
                    </div>

                    <h2 className="text-center font-black text-[12px] uppercase text-gray-800 mb-4">
                        TERMO DE RECUSA DE HEMOTRANSFUSÃO ALOGÊNICA E DIRETIVAS SOBRE SANGUE AUTÓLOGO
                    </h2>

                    <div className="text-[9.5px] text-justify text-gray-800 leading-relaxed space-y-2">
                        <div>
                            <h3 className="font-bold text-[11px] mb-1 text-[#002776]">1. IDENTIFICAÇÃO DO PACIENTE</h3>
                            <div className="mb-1.5 bg-gray-50 py-1.5 px-2 border border-gray-200 rounded flex gap-4 items-center">
                                <p className="flex-1 truncate"><strong>Nome:</strong> <span className="uppercase">{data?.nome || '________________________________________'}</span></p>
                                <p><strong>CPF:</strong> {data?.cpf || '________________'}</p>
                                <p><strong>Idade:</strong> {data?.idadeInfo || calcularIdadeLocal(data?.dataNasc) || '________'}</p>
                            </div>
                            <p className="italic text-[8.5px] text-gray-600">
                                (Declaro ser maior de 18 anos, capaz e estar em pleno gozo das minhas faculdades mentais para tomar esta decisão de forma livre e consciente).
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-[11px] mb-1 text-[#002776]">2. RECUSA DE SANGUE E HEMOCOMPONENTES DE TERCEIROS (ALOGÊNICOS)</h3>
                            <p>
                                No exercício de minha autonomia individual e liberdade de convicção, conforme garantido pela Constituição Federal e ratificado pelo Supremo Tribunal Federal (STF), eu <strong className="uppercase">RECUSO EXPRESSAMENTE</strong> a administração de sangue total e seus hemocomponentes (glóbulos vermelhos, plaquetas, plasma, crioprecipitado e outros) provenientes de doadores terceiros.
                            </p>
                            <p className="font-bold mt-1">
                                Esta recusa aplica-se mesmo em situações de extrema emergência ou risco iminente de morte durante meu tratamento, cirurgia ou período de internação nesta instituição.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-[11px] mb-1 text-[#002776]">3. DIRETIVAS SOBRE O USO DO PRÓPRIO SANGUE (AUTÓLOGO)</h3>
                            <p className="mb-1.5">
                                Fui informado(a) sobre técnicas que utilizam meu próprio sangue para minimizar a necessidade de transfusões externas. Sobre estas opções, manifesto minha vontade de acordo com minha consciência:
                            </p>
                            <div className="space-y-2 pl-2 border-l-2 border-gray-200 mt-1 py-1">
                                <div className="flex gap-3">
                                    <div className="min-w-[80px] pt-4">
                                        <div className="border-b border-black w-16"></div>
                                        <p className="text-[6px] text-center w-16 mt-0.5 uppercase">Rúbrica do Paciente</p>
                                    </div>
                                    <p><strong>ACEITO TOTALMENTE:</strong> Autorizo tanto o armazenamento prévio do meu próprio sangue (doação autóloga) para uso posterior, quanto o uso de máquinas de recuperação intraoperatória (ex: Cell Saver) em circuito contínuo ou hemodiluição.</p>
                                </div>
                                <div className="flex gap-3">
                                    <div className="min-w-[80px] pt-4">
                                        <div className="border-b border-black w-16"></div>
                                        <p className="text-[6px] text-center w-16 mt-0.5 uppercase">Rúbrica do Paciente</p>
                                    </div>
                                    <p><strong>ACEITO APENAS RECUPERAÇÃO EM CIRCUITO CONTÍNUO:</strong> Autorizo o uso de máquinas de recuperação de sangue durante a cirurgia (circuito fechado e contínuo), mas RECUSO o armazenamento prévio de sangue (fora do corpo).</p>
                                </div>
                                <div className="flex gap-3">
                                    <div className="min-w-[80px] pt-4">
                                        <div className="border-b border-black w-16"></div>
                                        <p className="text-[6px] text-center w-16 mt-0.5 uppercase">Rúbrica do Paciente</p>
                                    </div>
                                    <p><strong>RECUSO TOTALMENTE:</strong> Não autorizo nenhuma técnica que envolva meu próprio sangue uma vez que ele tenha saído do meu sistema circulatório, ainda que em circuito contínuo.</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h3 className="font-bold text-[11px] mb-1 text-[#002776]">4. AUTORIZAÇÃO PARA TERAPIAS ALTERNATIVAS</h3>
                            <p>
                                Solicito e autorizo a equipe médica a empregar todos os meios e recursos científicos disponíveis que não envolvam a transfusão de sangue de terceiros, tais como: técnicas cirúrgicas para preservação de sangue, uso de expansores de volume não sanguíneos (cristaloides e coloides), uso de agentes farmacológicos (hemostáticos, eritropoetina, etc.), dentro das possibilidades estruturais deste hospital.
                            </p>
                        </div>

                        <div>
                            <h3 className="font-bold text-[11px] mb-1 text-[#002776]">5. CIÊNCIA DOS RISCOS E ASSUNÇÃO DE RESPONSABILIDADE</h3>
                            <p className="mb-1">Declaro que fui exaustivamente informado(a) pelo <strong>Dr(a). {data?.anestesistaNome ? `${getDoctorPrefix(data.anestesistaNome, data.anestesistaSexo)} ${data.anestesistaNome}` : '________________________________________'}</strong> e sua equipe sobre:</p>
                            <ul className="list-disc pl-5 space-y-0.5">
                                <li>Meu diagnóstico clínico e a necessidade técnica da transfusão de sangue no meu caso.</li>
                                <li>A gravidade dos riscos decorrentes desta recusa, que incluem: anemia grave, falência de órgãos, choque hipovolêmico, danos cerebrais irreversíveis e, fundamentalmente, o <strong>RISCO DE ÓBITO</strong>.</li>
                                <li>Compreendo que a ausência da transfusão pode limitar a eficácia de outros tratamentos e procedimentos realizados pela equipe médica.</li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="font-bold text-[11px] mb-1 text-[#002776]">6. EXONERAÇÃO DE RESPONSABILIDADE JURÍDICA E ÉTICA</h3>
                            <p>
                                Diante da minha decisão, assumo integral e exclusiva responsabilidade pelas consequências diretas e indiretas desta escolha. ISENTO expressamente o médico assistente, a equipe de anestesia, a equipe de enfermagem e esta instituição hospitalar de qualquer responsabilidade civil, penal, ética ou administrativa por danos à minha saúde ou falecimento que ocorram em decorrência direta da não realização da transfusão de sangue ora recusada.
                            </p>
                            <p className="mt-1.5 font-bold">Por ser a expressão fiel da minha vontade, assino o presente termo.</p>
                        </div>
                    </div>

                    <div className="mt-4 print:break-inside-avoid">
                        <p className="text-[10px] text-center mb-6 text-gray-700">
                            {data?.unidade || '__________________________________'}, {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                        </p>

                        <div className="flex justify-between items-end mb-4 px-4 gap-8">
                            <div className="text-center flex-1">
                                <div className="border-t border-black w-full mb-1"></div>
                                <p className="font-bold text-[10px] uppercase">Assinatura do Paciente</p>
                                <p className="text-[9px] mt-1 uppercase text-gray-600">{data?.nome}</p>
                            </div>
                            <div className="text-center flex-1">
                                <div className="border-t border-black w-full mb-1"></div>
                                <p className="font-bold text-[9px] uppercase">Assinatura e Carimbo do Médico</p>
                                <p className="text-[7.5px] mt-1 uppercase text-[#002776] font-bold">{data?.anestesistaNome ? `${getDoctorPrefix(data.anestesistaNome, data.anestesistaSexo)} ${data.anestesistaNome}` : ''}</p>
                                <p className="text-[7.5px] uppercase text-gray-500">{data?.anestesistaCRM ? `CRM ${data.anestesistaCRM}` : ''}</p>
                            </div>
                        </div>

                        <div className="border border-gray-300 p-2.5 rounded bg-gray-50/50 mt-3">
                            <h3 className="font-bold text-[10px] mb-3 uppercase text-gray-700">Testemunhas:</h3>
                            <div className="flex flex-col gap-4">
                                <div className="flex gap-4 items-end">
                                    <div className="flex-[2]">
                                        <div className="border-b border-black w-full"></div>
                                        <p className="text-[7px] text-gray-500 mt-0.5 uppercase">Nome Legível</p>
                                    </div>
                                    <div className="flex-1">
                                        <div className="border-b border-black w-full"></div>
                                        <p className="text-[7px] text-gray-500 mt-0.5 uppercase">CPF</p>
                                    </div>
                                    <div className="flex-[2]">
                                        <div className="border-b border-black w-full"></div>
                                        <p className="text-[7px] text-gray-500 mt-0.5 uppercase">Assinatura</p>
                                    </div>
                                </div>
                                <div className="flex gap-4 items-end">
                                    <div className="flex-[2]">
                                        <div className="border-b border-black w-full"></div>
                                        <p className="text-[7px] text-gray-500 mt-0.5 uppercase">Nome Legível</p>
                                    </div>
                                    <div className="flex-1">
                                        <div className="border-b border-black w-full"></div>
                                        <p className="text-[7px] text-gray-500 mt-0.5 uppercase">CPF</p>
                                    </div>
                                    <div className="flex-[2]">
                                        <div className="border-b border-black w-full"></div>
                                        <p className="text-[7px] text-gray-500 mt-0.5 uppercase">Assinatura</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}