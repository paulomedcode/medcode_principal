import React from 'react';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { linhaDoTempo, resumoConsumo, descreverProcedimentos } from '../../utils/fichaAnestesica/narrativa';
import { CAMPOS_VENTILADOR, paraHoraLocal, tecnicaDaFicha } from '../../utils/fichaAnestesica/vocabulario';
import { resumoFluidos } from '../../utils/fichaAnestesica/projecao';

/**
 * Ficha anestésica impressa (A4).
 *
 * O gráfico não vai para o papel: o que tem valor médico-legal é a sequência
 * de registros com horário, e ela sai como tabela — legível, conferível e
 * imune a resolução de impressora.
 */

const TIPOS_ROTULO = {
    infusao: 'Infusão',
    medida: 'Medida',
    fluido: 'Volume',
    medicacao: 'Medicação',
    marco: 'Marco'
};

/** DR. ou DRA. pelo primeiro nome, como no cabeçalho da APA. */
const prefixoMedico = (nome) => {
    const primeiro = String(nome || '').trim().toUpperCase().split(' ')[0];
    if (!primeiro) return '';
    return primeiro.endsWith('A') ? 'DRA.' : 'DR.';
};

const Campo = ({ rotulo, valor, span = 1 }) => (
    <div style={{ gridColumn: `span ${span}` }}>
        <div style={{ fontSize: '6.5pt', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>{rotulo}</div>
        <div style={{ fontSize: '8.5pt', borderBottom: '1px solid #cbd5e1', paddingBottom: '1px', minHeight: '12px' }}>
            {valor || '—'}
        </div>
    </div>
);

const Secao = ({ titulo, children }) => (
    <div style={{ marginBottom: '8px' }}>
        <div style={{
            fontSize: '7.5pt', fontWeight: 800, textTransform: 'uppercase',
            background: '#e2e8f0', padding: '2px 5px', marginBottom: '4px', letterSpacing: '0.3px'
        }}>
            {titulo}
        </div>
        {children}
    </div>
);

export default function FichaPrintTemplate({ ficha, parametros = [] }) {
    const { theme } = useWhiteLabel();
    if (!ficha) return null;

    const cabecalho = ficha.dados?.cabecalho || {};
    const eventos = ficha.eventos || [];

    const assinante = ficha.assinada_por_nome || ficha.responsavel_nome || ficha.anestesista_nome || '';
    const assinanteEhOAnestesista = !assinante || assinante === ficha.anestesista_nome;

    const extras = ficha.dados?.extras || {};
    const horarios = extras.horarios || {};
    const ventilador = extras.ventilador || {};
    const destino = extras.destino || {};
    const procedimentosFeitos = descreverProcedimentos(extras);
    const parametrosVent = CAMPOS_VENTILADOR.filter(campo => String(ventilador[campo.nome] ?? '').trim());

    const rotulos = parametros.reduce((mapa, p) => ({ ...mapa, [p.codigo]: p.rotulo }), {});
    const registros = linhaDoTempo(eventos, rotulos);
    const consumo = resumoConsumo(eventos);
    const balanco = resumoFluidos(eventos, parametros.filter(p => p.sinal === 'saida').map(p => p.codigo));

    // Data do documento: a da anestesia, ou a de criação da ficha.
    const dataDoDocumento = new Date(ficha.inicio_anestesia || ficha.created_at || ficha.updated_at)
        .toLocaleDateString('pt-BR');

    const dataHora = (valor) => {
        if (!valor) return '—';
        const data = new Date(valor);
        return Number.isNaN(data.getTime()) ? '—' : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    };

    return (
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#0f172a', fontSize: '8.5pt', padding: '4mm' }}>

            {/* Cabeçalho — o mesmo da APA: a identidade que sai no papel é a do
                anestesista e a logo configurada para este deploy. A identidade por
                deploy (`hospitalIdentity`) não serve aqui: ela descreve a empresa,
                não o anestesista. */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '2px solid #1f2937', paddingBottom: '5px', marginBottom: '8px' }}>
                <div style={{ width: '33%' }}>
                    {theme?.logoUrl && (
                        <img
                            src={theme.logoUrl}
                            alt="Logo"
                            style={{ height: '32px', width: 'auto', objectFit: 'contain', objectPosition: 'left', marginBottom: '4px' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    )}
                    <div style={{ fontSize: '7.5pt', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.02em', lineHeight: 1.3 }}>
                        <div>{assinante ? `${prefixoMedico(assinante)} ${assinante}` : ''}</div>
                        <div>
                            {ficha.anestesista_crm ? `CRM ${ficha.anestesista_crm}` : ''}
                            {ficha.anestesista_rqe ? ` | RQE ${ficha.anestesista_rqe}` : ''}
                        </div>
                    </div>
                </div>

                <div style={{ width: '34%', textAlign: 'center' }}>
                    <div style={{ fontSize: '10pt', fontWeight: 900, letterSpacing: '0.08em', color: '#111827' }}>FICHA ANESTÉSICA</div>
                    <div style={{ fontSize: '6.5pt', color: '#6b7280', fontWeight: 500, marginTop: '1px' }}>
                        Conforme Resolução CFM 1.802/2006
                    </div>
                </div>

                <div style={{ width: '33%', textAlign: 'right', fontSize: '7.5pt', color: '#374151' }}>
                    <div style={{ fontSize: '8.5pt', fontWeight: 700, color: '#111827' }}>
                        {ficha.id ? `FA-${String(ficha.id).substring(0, 6).toUpperCase()}` : ''}
                    </div>
                    <div>Data: <strong>{dataDoDocumento}</strong></div>
                    <div style={{ color: '#6b7280' }}>
                        {ficha.status === 'finalizada' ? `Encerrada ${dataHora(ficha.assinada_em)}` : 'Em andamento — via provisória'}
                    </div>
                </div>
            </div>

            <Secao titulo="Identificação">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px 6px' }}>
                    <Campo rotulo="Paciente" valor={cabecalho.paciente || ficha.paciente_nome} span={6} />
                    <Campo rotulo="Idade" valor={cabecalho.idade} />
                    <Campo rotulo="Peso" valor={cabecalho.peso} />
                    <Campo rotulo="Altura" valor={cabecalho.altura} />
                    <Campo rotulo="ASA" valor={cabecalho.asa} />
                    <Campo rotulo="Unidade" valor={ficha.unidade} span={2} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px 6px', marginTop: '4px' }}>
                    <Campo rotulo="Procedimento" valor={cabecalho.procedimento || ficha.procedimento} span={7} />
                    <Campo rotulo="Alergias" valor={cabecalho.alergias} span={5} />
                </div>
            </Secao>

            <Secao titulo="Anestesia e tempos">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px 6px' }}>
                    <Campo rotulo="Entrada em sala" valor={paraHoraLocal(horarios.entradaSala)} span={2} />
                    <Campo rotulo="Início anestesia" valor={dataHora(ficha.inicio_anestesia)} span={3} />
                    <Campo rotulo="Início cirurgia" valor={paraHoraLocal(horarios.inicioCirurgia)} span={2} />
                    <Campo rotulo="Fim cirurgia" valor={paraHoraLocal(horarios.fimCirurgia)} span={2} />
                    <Campo rotulo="Fim anestesia" valor={dataHora(ficha.fim_anestesia)} span={3} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px 6px', marginTop: '4px' }}>
                    <Campo rotulo="Técnica" valor={tecnicaDaFicha(cabecalho)} span={6} />
                    <Campo rotulo="Via aérea" valor={cabecalho.planoAnestesico?.viaAerea} span={6} />
                </div>
            </Secao>

            {parametrosVent.length > 0 && (
                <Secao titulo="Ventilação mecânica">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px 6px' }}>
                        {parametrosVent.map(campo => (
                            <Campo key={campo.nome} rotulo={campo.rotulo} valor={ventilador[campo.nome]} />
                        ))}
                    </div>
                </Secao>
            )}

            {procedimentosFeitos.length > 0 && (
                <Secao titulo="Procedimentos realizados">
                    <ul style={{ margin: 0, paddingLeft: '14px', fontSize: '8pt', lineHeight: 1.5 }}>
                        {procedimentosFeitos.map((texto, i) => <li key={i}>{texto}</li>)}
                    </ul>
                </Secao>
            )}

            {(extras.posicoes || []).length > 0 && (
                <Secao titulo="Posicionamento">
                    <div style={{ fontSize: '8pt' }}>
                        {extras.posicoes.map(p => `${p.nome}${p.horario ? ` (${paraHoraLocal(p.horario)})` : ''}`).join(' · ')}
                    </div>
                </Secao>
            )}

            {registros.length > 0 && (
                <Secao titulo="Registros no tempo">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ border: '1px solid #cbd5e1', padding: '2px 4px', textAlign: 'left', width: '11%' }}>Hora</th>
                                <th style={{ border: '1px solid #cbd5e1', padding: '2px 4px', textAlign: 'left', width: '15%' }}>Tipo</th>
                                <th style={{ border: '1px solid #cbd5e1', padding: '2px 4px', textAlign: 'left' }}>Registro</th>
                                <th style={{ border: '1px solid #cbd5e1', padding: '2px 4px', textAlign: 'right', width: '18%' }}>Valor</th>
                                <th style={{ border: '1px solid #cbd5e1', padding: '2px 4px', textAlign: 'left', width: '12%' }}>Via</th>
                            </tr>
                        </thead>
                        <tbody>
                            {registros.map((registro, i) => (
                                <tr key={i}>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '1px 4px', fontWeight: 700 }}>{registro.hora}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '1px 4px', color: '#475569' }}>{TIPOS_ROTULO[registro.tipo] || registro.tipo}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '1px 4px' }}>
                                        {registro.rotulo}
                                        {registro.observacao ? ` — ${registro.observacao}` : ''}
                                    </td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '1px 4px', textAlign: 'right', fontWeight: 700 }}>
                                        {registro.valor} {registro.unidade}
                                    </td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '1px 4px' }}>{registro.via}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Secao>
            )}

            {consumo.length > 0 && (
                <Secao titulo="Consumo de medicações">
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '7.5pt' }}>
                        <tbody>
                            {consumo.map((item, i) => (
                                <tr key={i}>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '1px 4px' }}>{item.farmaco}</td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '1px 4px', textAlign: 'right', fontWeight: 700, width: '22%' }}>
                                        {item.total} {item.unidade}
                                    </td>
                                    <td style={{ border: '1px solid #cbd5e1', padding: '1px 4px', width: '22%', color: '#475569' }}>
                                        {item.doses} {item.doses === 1 ? 'dose' : 'doses'} {item.vias.join(', ')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Secao>
            )}

            <Secao titulo="Balanço hidroeletrolítico">
                <div style={{ display: 'flex', gap: '16px', fontSize: '8pt' }}>
                    <span>Entradas: <strong>{balanco.totalEntradas} ml</strong></span>
                    <span>Saídas: <strong>{balanco.totalSaidas} ml</strong></span>
                    <span>Saldo: <strong>{balanco.balanco > 0 ? '+' : ''}{balanco.balanco} ml</strong></span>
                </div>
            </Secao>

            {destino.local && (
                <Secao titulo="Encerramento e destino">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: '4px 6px' }}>
                        <Campo rotulo="Destino" valor={destino.local} span={3} />
                        <Campo rotulo="Ventilação na transferência" valor={destino.ventilacao} span={4} />
                        <Campo rotulo="Intercorrências" valor={destino.observacao || 'Sem intercorrências'} span={5} />
                    </div>
                </Secao>
            )}

            {ficha.dados?.narrativa && (
                <Secao titulo="Descrição do ato anestésico">
                    <div style={{ fontSize: '8pt', lineHeight: 1.45, whiteSpace: 'pre-wrap', textAlign: 'justify' }}>
                        {ficha.dados.narrativa}
                    </div>
                </Secao>
            )}

            {(ficha.adendos || []).length > 0 && (
                <Secao titulo="Adendos">
                    {ficha.adendos.map((adendo, i) => (
                        <div key={i} style={{ fontSize: '7.5pt', marginBottom: '3px' }}>
                            <strong>{dataHora(adendo.criado_em)} — {adendo.autor_nome || '—'}:</strong> {adendo.texto}
                        </div>
                    ))}
                </Secao>
            )}

            {/* Quem respondeu pelo caso em cada trecho. Sem isto, o papel mostra um
                anestesista só para uma ficha que passou por dois. */}
            {(ficha.passagens || []).length > 0 && (
                <Secao titulo="Passagem do caso">
                    {ficha.passagens.map((item, i) => (
                        <div key={i} style={{ fontSize: '7.5pt', marginBottom: '2px' }}>
                            {dataHora(item.assumida_em)} — de {item.de_nome || '—'} para {item.para_nome || '—'}
                            {item.motivo ? ` (${item.motivo})` : ''}
                        </div>
                    ))}
                </Secao>
            )}

            {(ficha.reaberturas || []).length > 0 && (
                <Secao titulo="Reaberturas registradas">
                    {ficha.reaberturas.map((item, i) => (
                        <div key={i} style={{ fontSize: '7.5pt', marginBottom: '2px' }}>
                            {dataHora(item.reaberta_em)} — {item.autor_nome || '—'}: {item.motivo}
                        </div>
                    ))}
                </Secao>
            )}

            {/* Assinatura manuscrita: o documento é assinado a caneta depois de impresso,
                por isso o espaço em branco acima da linha e nenhum carimbo eletrônico. */}
            <div style={{ marginTop: '14px', textAlign: 'center' }}>
                <div style={{ height: '46px' }} />
                <div style={{ borderTop: '1px solid #0f172a', width: '70%', margin: '0 auto', paddingTop: '3px' }}>
                    {/* Assina quem encerrou o caso — que nem sempre é quem o abriu, se
                        houve troca de plantão. CRM e RQE só saem quando são dele. */}
                    <div style={{ fontSize: '9pt', fontWeight: 700 }}>
                        {assinante || '—'}
                    </div>
                    <div style={{ fontSize: '7.5pt', color: '#475569' }}>
                        Anestesiologista
                        {assinanteEhOAnestesista && ficha.anestesista_crm ? ` — CRM ${ficha.anestesista_crm}` : ''}
                        {assinanteEhOAnestesista && ficha.anestesista_rqe ? ` — RQE ${ficha.anestesista_rqe}` : ''}
                    </div>
                    <div style={{ fontSize: '7pt', color: '#64748b', marginTop: '2px' }}>
                        Assinatura e carimbo
                    </div>
                </div>
            </div>

            <div style={{ marginTop: '10px', paddingTop: '3px', borderTop: '1px solid #d1d5db', fontSize: '6pt', color: '#6b7280', textAlign: 'center', lineHeight: 1.5 }}>
                Documento gerado eletronicamente em conformidade com as Resoluções CFM 1.802/2006 e 2.174/2017<br />
                Este documento é confidencial e protegido pela LGPD (Lei 13.709/2018). Uso exclusivo para fins médicos.
            </div>
        </div>
    );
}
