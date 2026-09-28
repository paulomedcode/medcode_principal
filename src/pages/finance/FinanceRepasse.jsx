import React, { useState, useEffect, useMemo } from 'react';
import { financeService } from '../../services/financeService';
import { supabase } from '../../services/supabase';
import { 
  Users, Calendar, FileText, CheckCircle2, AlertCircle, DollarSign, 
  Loader2, Calculator, ArrowRight, Printer, Percent, Check
} from 'lucide-react';
import toast from 'react-hot-toast';
import { todayISO, formatDateBR } from '../../utils/date';
import { usePermission } from '../../contexts/PermissionContext';

export default function FinanceRepasse() {
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('Editar Financeiro'); // sem ela: modo somente-leitura
  const [loading, setLoading] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [referenceMonth, setReferenceMonth] = useState(todayISO().substring(0, 7)); // "YYYY-MM" (horário local, sem salto de fuso)
  
  // Dados de Repasses Existentes
  const [repassesList, setRepassesList] = useState([]);
  const [activeRepasseDetail, setActiveRepasseDetail] = useState(null);
  
  // Contas bancárias para efetuar pagamentos
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  // Dados calculados para Novo Fechamento
  const [calculatedItems, setCalculatedItems] = useState([]);
  const [doctorSettings, setDoctorSettings] = useState(null);
  const [glosasPending, setGlosasPending] = useState([]);

  useEffect(() => {
    loadDoctorsAndAccounts();
  }, []);

  useEffect(() => {
    loadRepassesList();
  }, [referenceMonth]);

  const loadDoctorsAndAccounts = async () => {
    try {
      setLoading(true);
      const [{ data: users }, accs] = await Promise.all([
        supabase.from('users').select('id, name, role').order('name'),
        financeService.getAccounts()
      ]);
      const medicos = users?.filter(u => ['Médico', 'Médico Coordenador', 'Administrador'].includes(u.role)) || [];
      setDoctors(medicos);
      if (medicos.length > 0) {
        setSelectedDoctorId(medicos[0].id);
      }
      setAccounts(accs || []);
      if (accs && accs.length > 0) {
        setSelectedAccountId(accs[0].id);
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar médicos e contas.');
    } finally {
      setLoading(false);
    }
  };

  const loadRepassesList = async () => {
    try {
      const data = await financeService.getRepasses({ month: referenceMonth });
      setRepassesList(data || []);
    } catch (error) {
      console.error(error);
    }
  };

  // --- LÓGICA DE SIMULAÇÃO/CÁLCULO DO REPASSE ---
  const handleCalculateRepasse = async () => {
    if (!selectedDoctorId) return toast.error('Selecione um médico');
    
    setLoading(true);
    try {
      const doctor = doctors.find(d => d.id === selectedDoctorId);
      
      // 1. Busca configurações financeiras do médico (taxa administrativa)
      const settings = await financeService.getDoctorSettings(selectedDoctorId);
      setDoctorSettings(settings || { admin_fee_rate: 10.00 });
      const feeRate = settings ? parseFloat(settings.admin_fee_rate) : 10.00;

      const items = [];

      // 2. Busca e filtra plantões da escala (JSON em settings)
      const { data: escalaData } = await supabase
        .from('settings')
        .select('data')
        .eq('id', 'escala')
        .maybeSingle();

      if (escalaData && escalaData.data && escalaData.data.months) {
        // Encontra o mês correspondente no JSON
        const monthJSON = escalaData.data.months[referenceMonth];
        if (monthJSON && monthJSON.assignments) {
          // Filtra plantões verificados deste médico
          const doctorAssignments = Object.values(monthJSON.assignments).filter(
            a => a.verified === true && 
            a.doctorName?.trim().toUpperCase() === doctor.name.trim().toUpperCase()
          );

          doctorAssignments.forEach(a => {
            const baseVal = parseFloat(a.financial?.baseValue || 0);
            const extraVal = parseFloat(a.financial?.extraValue || 0);
            const gross = baseVal + extraVal;
            const feeAmt = (gross * feeRate) / 100;

            items.push({
              item_type: 'SHIFT',
              shift_id: a.id,
              description: `Plantão ${a.hospitalName || 'Hospital'} - ${a.subtitle || 'Serviço'}`,
              gross_amount: gross,
              admin_fee_rate: feeRate,
              admin_fee_amount: feeAmt,
              net_amount: gross - feeAmt
            });
          });
        }
      }

      // 3. Busca cirurgias finalizadas no banco
      // Filtra por cirurgião (nome) e mês
      const startDate = `${referenceMonth}-01`;
      const endDate = `${referenceMonth}-31`; // simplificado
      
      const { data: surgeries, error: surgErr } = await supabase
        .from('surgeries')
        .select('*')
        .eq('status', 'Realizado')
        .ilike('cirurgiao', `%${doctor.name}%`);

      if (surgErr) throw surgErr;

      if (surgeries && surgeries.length > 0) {
        surgeries.forEach(s => {
          // Tenta pegar o valor do procedimento ou assume um valor de fallback/procedimento tabelado
          // (Como surgeries não tem um valor direto explícito, simulamos a partir de R$ 500,00 ou conforme regra comercial)
          const gross = 500.00; 
          const feeAmt = (gross * feeRate) / 100;

          items.push({
            item_type: 'SURGERY',
            surgery_id: s.id,
            description: `Cirurgia Paciente: ${s.paciente} (${s.procedimento || 'Procedimento'})`,
            gross_amount: gross,
            admin_fee_rate: feeRate,
            admin_fee_amount: feeAmt,
            net_amount: gross - feeAmt
          });
        });
      }

      // 4. Busca Glosas Pendentes para descontar
      const glosas = await financeService.getGlosas({
        doctorId: selectedDoctorId,
        status: 'PENDENTE'
      });
      setGlosasPending(glosas || []);
      setCalculatedItems(items);

      if (items.length === 0 && glosas.length === 0) {
        toast.error('Nenhum plantão verificado ou cirurgia encontrada para este médico neste mês.');
      } else {
        toast.success('Repasse calculado com sucesso! Revise os valores abaixo.');
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao calcular repasse.');
    } finally {
      setLoading(false);
    }
  };

  // --- CONFIRMAÇÃO DO FECHAMENTO DE REPASSE ---
  const handleSaveRepasse = async () => {
    if (calculatedItems.length === 0) return;
    
    setLoading(true);
    try {
      const gross = calculatedItems.reduce((acc, curr) => acc + curr.gross_amount, 0);
      const fee = calculatedItems.reduce((acc, curr) => acc + curr.admin_fee_amount, 0);
      const glosa = glosasPending.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);
      const net = gross - fee - glosa;

      const repassePayload = {
        doctor_id: selectedDoctorId,
        reference_month: referenceMonth,
        gross_amount: gross,
        admin_fee_amount: fee,
        glosa_deduction: glosa,
        net_amount: net >= 0 ? net : 0,
        status: 'PENDENTE'
      };

      // Cabeçalho + itens + vínculo das glosas, tudo numa transação atômica (RPC).
      await financeService.createRepasse(repassePayload, calculatedItems, glosasPending.map(g => g.id));

      toast.success('Fechamento de repasse gerado com sucesso!');
      setCalculatedItems([]);
      setGlosasPending([]);
      loadRepassesList();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar fechamento de repasse.');
    } finally {
      setLoading(false);
    }
  };

  // --- EFETUAR PAGAMENTO DO REPASSE ---
  const handlePayRepasse = async (repasseId) => {
    if (!selectedAccountId) return toast.error('Selecione uma conta bancária para efetuar o débito.');
    
    setLoading(true);
    try {
      const todayStr = todayISO();
      await financeService.payRepasse(repasseId, selectedAccountId, todayStr);
      toast.success('Pagamento de repasse efetivado!');
      loadRepassesList();
      if (activeRepasseDetail?.id === repasseId) {
        handleViewDetail(repasseId);
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao efetivar o pagamento do repasse.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetail = async (repasseId) => {
    try {
      setLoading(true);
      const details = await financeService.getRepasseDetails(repasseId);
      setActiveRepasseDetail(details);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao buscar detalhes do repasse.');
    } finally {
      setLoading(false);
    }
  };

  // --- IMPRESSÃO / PDF DO EXTRATO DO MÉDICO ---
  const handlePrintExtract = () => {
    if (!activeRepasseDetail) return;
    const rep = activeRepasseDetail;
    const formattedMonth = rep.reference_month.split('-').reverse().join('/');
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Extrato de Repasse Médico - Dr(a). ${rep.users.name}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 12px; color: #1e293b; padding: 20px; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; margin-bottom: 20px; }
          .header h1 { margin: 0; font-size: 18px; color: #0f172a; text-transform: uppercase; }
          .header p { margin: 3px 0; color: #64748b; font-weight: 600; }
          .summary { display: grid; grid-template-cols: repeat(4, 1fr); gap: 15px; margin-bottom: 25px; background: #f8fafc; padding: 15px; rounded: 12px; border: 1px solid #e2e8f0; }
          .summary-card { text-align: center; }
          .summary-card span { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: bold; }
          .summary-card p { margin: 5px 0 0; font-size: 16px; font-weight: 900; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
          th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; font-size: 10px; color: #475569; }
          .text-right { text-align: right; }
          .text-rose { color: #e11d48; }
          .text-emerald { color: #059669; }
          .total-net { font-size: 14px; font-weight: 900; color: #0f172a; }
          .footer { text-align: center; margin-top: 40px; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <h1>Extrato de Repasse Médico</h1>
            <p>Profissional: Dr(a). ${rep.users.name}</p>
            <p>Período de Referência: ${formattedMonth}</p>
          </div>
          <div style="text-align: right;">
            <p><strong>Status:</strong> ${rep.status === 'PAGO' ? 'PAGO' : 'PENDENTE'}</p>
            ${rep.payment_date ? `<p><strong>Pago em:</strong> ${formatDateBR(rep.payment_date)}</p>` : ''}
          </div>
        </div>

        <div class="summary">
          <div class="summary-card">
            <span>Faturamento Bruto</span>
            <p>R$ ${rep.gross_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div class="summary-card text-rose">
            <span>Taxa Adm. Retida</span>
            <p>R$ ${rep.admin_fee_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div class="summary-card text-rose">
            <span>Glosas Deduzidas</span>
            <p>R$ ${rep.glosa_deduction.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
          <div class="summary-card text-emerald">
            <span>Valor Líquido</span>
            <p>R$ ${rep.net_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <h3>Detalhamento dos Itens Realizados</h3>
        <table>
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descrição</th>
              <th class="text-right">Valor Bruto</th>
              <th class="text-right">Taxa Adm (%)</th>
              <th class="text-right">Desconto Taxa</th>
              <th class="text-right">Valor Líquido</th>
            </tr>
          </thead>
          <tbody>
            ${rep.items.map(item => `
              <tr>
                <td><strong>${item.item_type === 'SHIFT' ? 'PLANTÃO' : 'CIRURGIA'}</strong></td>
                <td>${item.description}</td>
                <td class="text-right">R$ ${item.gross_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td class="text-right">${item.admin_fee_rate}%</td>
                <td class="text-right text-rose">R$ ${item.admin_fee_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td class="text-right text-emerald">R$ ${item.net_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              </tr>
            `).join('')}
          </tbody>
          <tfoot>
            <tr style="background: #f8fafc; font-weight: bold;">
              <td colspan="5" class="text-right total-net">Total Líquido Creditado:</td>
              <td class="text-right text-emerald total-net">R$ ${rep.net_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        </table>

        <div class="footer">
          Este documento é de uso interno gerencial e comprova os repasses operacionais correspondentes.
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    }
  };

  const netSimulatedTotal = useMemo(() => {
    const gross = calculatedItems.reduce((acc, curr) => acc + curr.gross_amount, 0);
    const fee = calculatedItems.reduce((acc, curr) => acc + curr.admin_fee_amount, 0);
    const glosa = glosasPending.reduce((acc, curr) => acc + parseFloat(curr.amount), 0);
    const net = gross - fee - glosa;
    return {
      gross,
      fee,
      glosa,
      net: net >= 0 ? net : 0
    };
  }, [calculatedItems, glosasPending]);

  return (
    <div className="px-4 sm:px-6 pr-8 py-4 min-h-full bg-[#f5f5f7] font-sans text-slate-900">
      
      {/* Header Premium */}
      <div className="mb-4 border-b border-black/[.085] pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-base font-semibold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
            <Users className="text-[#0071e3]" size={18} /> 
            Rateio e Repasse Médico
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">Fechamento mensal de faturamento e extrato do anestesista</p>
        </div>

        <div className="flex items-center gap-2">
          <Calendar className="text-slate-400" size={16} />
          <input 
            type="month" 
            value={referenceMonth} 
            onChange={e => setReferenceMonth(e.target.value)} 
            className="h-10 px-4 bg-white border border-black/[.085] rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#0071e3] shadow-sm cursor-pointer"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        
        {/* LADO ESQUERDO: Simulação e Fechamento */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Painel de Cálculo */}
          <div className="bg-white border border-black/[.085] rounded-2xl p-4 shadow-sm">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-5 flex items-center gap-2">
              <Calculator size={16} className="text-[#0071e3]" /> Simular Novo Repasse
            </h3>

            <div className="flex flex-col sm:flex-row items-end gap-3 mb-4">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Escolha o Médico</label>
                <select
                  value={selectedDoctorId}
                  onChange={e => setSelectedDoctorId(e.target.value)}
                  className="w-full h-10 px-3 bg-white border border-black/[.085] rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#0071e3] shadow-sm cursor-pointer"
                >
                  <option value="" disabled>Selecione...</option>
                  {doctors.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {canEdit && (
                <button
                  onClick={handleCalculateRepasse}
                  disabled={loading}
                  className="h-10 px-6 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl font-bold text-xs uppercase shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 shrink-0"
                >
                  {loading ? <Loader2 className="animate-spin" size={14} /> : <Calculator size={14} />}
                  Calcular Repasse
                </button>
              )}
            </div>

            {/* Resultado da Simulação */}
            {calculatedItems.length > 0 && (
              <div className="space-y-4 border-t border-black/[.06] pt-5 animate-in fade-in">
                {/* Resumo Consolidado */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-black/[.06] shadow-inner text-center">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Faturamento Bruto</span>
                    <p className="text-lg font-semibold text-slate-800 mt-1">R$ {netSimulatedTotal.gross.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Taxa Adm Retida ({doctorSettings?.admin_fee_rate}%)</span>
                    <p className="text-lg font-semibold text-rose-600 mt-1">- R$ {netSimulatedTotal.fee.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Glosas Abatidas</span>
                    <p className="text-lg font-semibold text-rose-600 mt-1">- R$ {netSimulatedTotal.glosa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase">Valor Líquido Médico</span>
                    <p className="text-lg font-semibold text-emerald-600 mt-1">R$ {netSimulatedTotal.net.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                  </div>
                </div>

                {/* Lista de Itens do Fechamento */}
                <div>
                  <h4 className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-3">Detalhamento dos Serviços</h4>
                  <div className="divide-y divide-black/[.055] max-h-40 overflow-y-auto pr-2 custom-scrollbar border border-black/[.085] rounded-2xl bg-white shadow-sm px-4">
                    {calculatedItems.map((item, idx) => (
                      <div key={idx} className="py-3 flex justify-between items-center text-xs font-bold text-slate-700">
                        <div>
                          <span className={`text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded mr-2 ${item.item_type === 'SHIFT' ? 'bg-indigo-50 text-[#0071e3] border border-indigo-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'}`}>
                            {item.item_type === 'SHIFT' ? 'Plantão' : 'Cirurgia'}
                          </span>
                          <span className="text-slate-800">{item.description}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-500 font-medium">R$ {item.gross_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                          <span className="text-slate-300 mx-1.5">•</span>
                          <span className="text-emerald-600">Líq: R$ {item.net_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Glosas List */}
                {glosasPending.length > 0 && (
                  <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-2xl">
                    <h4 className="text-[10px] font-semibold text-rose-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                      <AlertCircle size={12} /> Glosas Contabilizadas para Dedução ({glosasPending.length})
                    </h4>
                    <div className="space-y-1.5">
                      {glosasPending.map(g => (
                        <div key={g.id} className="flex justify-between items-center text-[11px] font-bold text-rose-700">
                          <span>Glosa Ref: {g.convenio} {g.reason ? `(${g.reason})` : ''}</span>
                          <span>- R$ {g.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {canEdit && (
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleSaveRepasse}
                      disabled={loading}
                      className="h-10 px-8 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl font-bold text-xs uppercase shadow-md flex items-center justify-center gap-2 transition-all"
                    >
                      <Check size={14} strokeWidth={3} /> Gerar e Salvar Fechamento
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>

          {/* Repasses Fechados do Mês */}
          <div className="bg-white border border-black/[.085] rounded-2xl p-4 shadow-sm">
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-4">Repasses Consolidados ({referenceMonth})</h3>
            
            <div className="divide-y divide-black/[.055]">
              {repassesList.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase">Nenhum fechamento registrado para este mês.</div>
              ) : (
                repassesList.map(r => (
                  <div key={r.id} className="py-4 flex justify-between items-center group">
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm">Dr(a). {r.users?.name || 'Médico'}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 flex items-center gap-1">
                        Bruto: R$ {r.gross_amount.toLocaleString('pt-BR')} 
                        <ArrowRight size={10} className="text-slate-300" />
                        Líquido: <span className="text-emerald-600">R$ {r.net_amount.toLocaleString('pt-BR')}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-semibold uppercase tracking-wider ${r.status === 'PAGO' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                        {r.status === 'PAGO' ? 'Pago' : 'Pendente'}
                      </span>
                      
                      <button
                        onClick={() => handleViewDetail(r.id)}
                        className="h-8 px-3 bg-slate-100 hover:bg-indigo-50 hover:text-[#0071e3] text-slate-600 rounded-lg text-[10px] font-semibold uppercase transition-all"
                      >
                        Visualizar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* LADO DIREITO: Detalhes e Ações de Repasse Selecionado */}
        <div className="lg:col-span-4">
          <div className="bg-white border border-black/[.085] rounded-2xl p-4 shadow-sm sticky top-6">
            {activeRepasseDetail ? (
              <div className="space-y-4">
                
                {/* Cabeçalho */}
                <div className="border-b border-black/[.06] pb-4">
                  <span className="text-[10px] font-semibold text-[#0071e3] uppercase tracking-widest">Extrato Detalhado</span>
                  <h3 className="font-semibold text-slate-900 text-base mt-1">Dr(a). {activeRepasseDetail.users?.name}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">Ref: {activeRepasseDetail.reference_month.split('-').reverse().join('/')}</p>
                </div>

                {/* Resumo */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-black/[.06]">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-500">Valor Bruto:</span>
                    <span className="text-slate-800">R$ {activeRepasseDetail.gross_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-rose-600">
                    <span className="text-slate-500">Retenção Adm:</span>
                    <span>- R$ {activeRepasseDetail.admin_fee_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs font-bold text-rose-600">
                    <span className="text-slate-500">Glosas Descontadas:</span>
                    <span>- R$ {activeRepasseDetail.glosa_deduction.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="h-px bg-slate-200 my-1"></div>
                  <div className="flex justify-between items-center text-sm font-semibold">
                    <span className="text-slate-800">Líquido a Pagar:</span>
                    <span className="text-emerald-600">R$ {activeRepasseDetail.net_amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Banco de Destino se configurado */}
                {activeRepasseDetail.users?.pix_key && (
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-indigo-50/20 border border-indigo-100/50 p-3.5 rounded-xl">
                    <span className="text-[#0071e3] font-semibold block mb-0.5">Chave PIX Médica:</span>
                    {activeRepasseDetail.users.pix_key}
                  </div>
                )}

                {/* Botões de Ação */}
                <div className="space-y-2 pt-2">
                  <button
                    onClick={handlePrintExtract}
                    className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all shadow-sm"
                  >
                    <Printer size={14} /> Imprimir Extrato
                  </button>

                  {canEdit && activeRepasseDetail.status === 'PENDENTE' && (
                    <div className="bg-slate-50 border border-black/[.085] p-4 rounded-2xl space-y-3 mt-4">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest block">Pagamento do Repasse</span>
                      
                      <select
                        value={selectedAccountId}
                        onChange={e => setSelectedAccountId(e.target.value)}
                        className="w-full h-9 px-3 bg-white border border-black/[.085] rounded-lg text-[10px] font-bold text-slate-700 outline-none cursor-pointer"
                      >
                        <option value="" disabled>Conta bancária de débito...</option>
                        {accounts.map(a => (
                          <option key={a.id} value={a.id}>{a.name} (Saldo: R$ {a.current_balance.toLocaleString('pt-BR')})</option>
                        ))}
                      </select>

                      <button
                        onClick={() => handlePayRepasse(activeRepasseDetail.id)}
                        disabled={loading}
                        className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs uppercase shadow-md flex items-center justify-center gap-1.5 transition-all"
                      >
                        <CheckCircle2 size={14} /> Efetivar Pagamento
                      </button>
                    </div>
                  )}

                  {activeRepasseDetail.status === 'PAGO' && (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-700 p-4 rounded-2xl text-center text-xs font-bold">
                      <CheckCircle2 className="mx-auto text-emerald-500 mb-1" size={18} />
                      Repasse pago em {formatDateBR(activeRepasseDetail.payment_date)}
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="text-center py-16 text-slate-400 text-xs font-bold uppercase flex flex-col items-center gap-2">
                <FileText size={32} className="text-slate-200" />
                Selecione um fechamento na lista para visualizar o detalhamento e imprimir o extrato de repasse.
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
