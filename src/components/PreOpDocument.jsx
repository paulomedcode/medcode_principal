import React from 'react';
import { getHospitalIdentity } from '../config/hospitalIdentity';

export const PreOpDocument = ({ surgery }) => {
    if (!surgery) return null;

    const identity = getHospitalIdentity();

    // Helpers de Data
    const formatDate = (dateString) => {
        if (!dateString) return '___/___/_____';
        const [year, month, day] = dateString.split('-');
        return `${day}/${month}/${year}`;
    };

    const getDayOfWeek = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString + 'T12:00:00');
        const dias = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
        return dias[date.getDay()];
    };

    const getPreviousDay = (dateString) => {
        if (!dateString) return '___/___/_____';
        const date = new Date(dateString + 'T12:00:00');
        date.setDate(date.getDate() - 1);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    };

    // Dados dinâmicos
    const pacienteNome = (surgery.nomePaciente || surgery.paciente || 'NOME DO PACIENTE').toUpperCase();
    const dataNascimento = formatDate(surgery.nascimento || surgery.dataNascimento);
    const procedimento = (surgery.procedimento || 'PROCEDIMENTO NÃO INFORMADO').toUpperCase();
    const dataCirurgia = formatDate(surgery.dataAgendado);
    const diaDaSemana = getDayOfWeek(surgery.dataAgendado);
    const diaAnterior = getPreviousDay(surgery.dataAgendado);
    
    // 🎯 AQUI ESTÁ A MÁGICA: Puxa o estático primeiro. Se não tiver, puxa o do mapa.
    const horario = surgery.horarioEstaticoPdf || surgery.horario || '--:--';
    
    const cirurgiao = (surgery.cirurgiao || 'MÉDICO NÃO INFORMADO').toUpperCase();

    // Inteligência da Regra de Internação
    const regraObj = surgery.regraInternacaoObj || { tipo: 'anterior', horario: '19:00' };
    let textoInternacao = '';
    
    if (regraObj.tipo === 'anterior') {
        textoInternacao = `Você deverá internar no dia anterior, na data ${diaAnterior} às ${regraObj.horario} horas.`;
    } else {
        textoInternacao = `Você deverá internar no MESMO DIA da cirurgia, na data ${dataCirurgia} às ${regraObj.horario} horas.`;
    }

    return (
        <div className="w-[794px] h-[1123px] bg-white px-8 py-5 text-slate-800 font-sans mx-auto relative shadow-sm border border-slate-200 box-border flex flex-col overflow-hidden">
            
            {/* Cabeçalho Enxuto */}
            <div className="flex justify-between items-end border-b-2 border-slate-800 pb-2 mb-3 shrink-0">
                <div>
                    <h1 className="text-lg font-black uppercase text-slate-900 tracking-normal leading-tight">{identity.headerLine1}<br/>{identity.headerLine2}</h1>
                    <h2 className="text-[11px] font-bold text-slate-600 uppercase tracking-widest mt-0.5">{identity.headerSubtitle}</h2>
                </div>
                {identity.slogan && (
                    <div className="text-right">
                        <p className="text-[11px] font-black italic text-slate-500 bg-slate-100 px-2 py-1 rounded">{identity.slogan}</p>
                    </div>
                )}
            </div>

            {/* Título Principal */}
            <div className="text-center mb-3 shrink-0">
                <h2 className="text-[15px] font-black uppercase tracking-widest text-slate-900 border-2 border-slate-900 inline-block px-4 py-1 rounded bg-slate-50">
                    Agendamento Cirúrgico
                </h2>
            </div>

            {/* Dados do Paciente */}
            <div className="bg-slate-50 p-2 rounded border border-slate-200 mb-3 flex justify-between items-center shrink-0">
                <p className="text-[11.5px]"><span className="font-black">PACIENTE:</span> {pacienteNome}</p>
                <p className="text-[11.5px]"><span className="font-black">NASC.:</span> {dataNascimento}</p>
            </div>

            {/* Texto Principal Dinâmico */}
            <div className="space-y-2 text-justify text-[11.5px] leading-snug mb-3 shrink-0">
                <p>
                    Seu procedimento cirúrgico de <span className="font-black uppercase">{procedimento}</span> está agendado para <span className="font-black bg-yellow-100 px-1">{dataCirurgia} ({diaDaSemana})</span> às <span className="font-black bg-yellow-100 px-1">{horario} horas</span> com <span className="font-black">Dr(a). {cirurgiao}</span>.
                </p>
                
                <div className="font-black text-[12px] text-center bg-slate-100 p-1.5 rounded border border-slate-300 shadow-sm mx-4">
                    {textoInternacao}
                </div>
                
                <p>
                    Você deve se apresentar {identity.localApresentacao}. Não é necessário levar esse documento impresso.
                </p>
                {identity.mostrarTransporte && (
                    <p>
                        Se você mora em outro município e precisa de transporte, você deverá procurar sua secretaria de saúde ou central de vagas do seu município e solicitar o transporte.
                    </p>
                )}

                <div className="bg-slate-50 p-2 rounded border border-slate-200 mt-1.5">
                    <p className="font-black underline underline-offset-2 mb-0.5 text-xs">
                        Você deverá agendar seu retorno pós-cirúrgico assim que receber alta do hospital, pelo WhatsApp {identity.whatsappRetorno}.
                    </p>
                    <p className="text-[11px] font-semibold text-slate-600 leading-tight">
                        Envie sua mensagem e aguarde. A demanda é grande, por isso não é necessário ligar. O atendimento é feito por mensagem de texto, mas você também pode enviar áudio, se preferir.
                    </p>
                </div>
            </div>

            {/* Orientações Expandidas */}
            <div className="mb-1 flex-1 min-h-0">
                <div className="mt-0">
                    <h3 className="font-bold border-b border-slate-800 pb-1 mb-2.5 uppercase text-xs">
                        Orientações para Cirurgia {surgery.tipoOrientacao ? `(${surgery.tipoOrientacao})` : ''}
                    </h3>
                    
                    <div className="text-[11px] text-justify columns-2 gap-8">
                        {(surgery.textoOrientacao || 'Trazer todos os exames, documentos (RG, CPF e Cartão SUS). \nJejum absoluto de 8 horas.')
                            .split('\n')
                            .filter(linha => linha.trim() !== '') 
                            .map((linha, index) => {
                                
                                const trimmedLine = linha.trim();
                                const isBullet = trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ');
                                const cleanLine = isBullet ? trimmedLine.substring(2).trim() : trimmedLine;

                                const formattedParts = cleanLine.split(/\*\*(.*?)\*\*/g).map((part, i) =>
                                    i % 2 === 1 ? <strong key={i} className="font-black text-slate-900">{part}</strong> : part
                                );

                                const isHeading = !isBullet && cleanLine.endsWith(':');
                                const wrapperClass = "inline-block w-full break-inside-avoid align-top";

                                if (isBullet) {
                                    return (
                                        <div key={index} className={`${wrapperClass} mb-1.5`}>
                                            <div className="flex gap-2">
                                                <span className="font-black text-slate-800 mt-[1px]">•</span>
                                                <p className="leading-snug">{formattedParts}</p>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={index} className={wrapperClass}>
                                        <p className={`leading-snug ${isHeading ? 'mt-2.5 mb-1 font-bold text-[10.5px]' : 'mb-2'}`}>
                                            {formattedParts}
                                        </p>
                                    </div>
                                );
                            })
                        }
                    </div>
                </div>
            </div>

            {/* Rodapé Micro/Compacto */}
            <div className="mt-auto border-t border-slate-300 pt-2 text-center text-slate-500 font-bold shrink-0 bg-white">
                <p className="text-[10px] text-slate-800 font-black italic mb-1">Desejamos que tenha uma ótima cirurgia e que se recupere o mais breve possível.</p>
                <p className="text-slate-700 font-black uppercase text-[9px]">{identity.footerName}</p>
                <p className="text-[7.5px] mt-0.5">{identity.footerAddress}</p>
                <div className="flex justify-center items-center gap-2 mt-0.5 text-[7.5px]">
                    {identity.footerContacts.map((contato, i) => (
                        <React.Fragment key={i}>
                            {i > 0 && <span>•</span>}
                            <span>{contato}</span>
                        </React.Fragment>
                    ))}
                </div>
                {identity.footerCnpj && <p className="mt-0.5 font-normal text-[6.5px]">{identity.footerCnpj}</p>}
            </div>
        </div>
    );
};
