import React, { useState, useEffect, useMemo } from 'react';
import { financeService } from '../../services/financeService';
import { supabase } from '../../services/supabase';
import { 
  AlertCircle, CheckCircle, XCircle, Search, Plus, Save,
  Loader2, Filter, DollarSign, Calendar, Edit2, ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';
import { todayISO, formatDateBR } from '../../utils/date';
import { usePermission } from '../../contexts/PermissionContext';
import CurrencyInput from '../../components/finance/CurrencyInput';
import SearchableSelect from '../../components/finance/SearchableSelect';

export default function FinanceGlosas() {
  const { hasPermission } = usePermission();
  const canEdit = hasPermission('Editar Financeiro'); // sem ela: modo somente-leitura
  const [loading, setLoading] = useState(false);
  const [glosas, setGlosas] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [surgeries, setSurgeries] = useState([]);
  
  // Modais
  const [isGlosaModalOpen, setIsGlosaModalOpen] = useState(false);
  const [selectedGlosaId, setSelectedGlosaId] = useState(null);
  
  // Filtros
  const [filters, setFilters] = useState({ status: '', doctorId: '', convenio: '' });
  
  // Form de Glosa
  const [glosaForm, setGlosaForm] = useState({
    surgery_id: '',
    convenio: '',
    doctor_id: '',
    glosa_date: todayISO(),
    amount: '',
    reason: '',
    status: 'PENDENTE',
    recovered_amount: 0
  });

  useEffect(() => {
    loadInitialData();
  }, [filters]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [data, { data: users }, { data: surgs }] = await Promise.all([
        financeService.getGlosas(filters),
        supabase.from('users').select('id, name, role').order('name'),
        supabase.from('surgeries').select('id, paciente, procedimento, dataAgendado').order('dataAgendado', { ascending: false }).limit(200)
      ]);
      setGlosas(data || []);
      setDoctors(users?.filter(u => ['Médico', 'Médico Coordenador', 'Administrador'].includes(u.role)) || []);
      setSurgeries(surgs || []);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar dados de glosas.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveGlosa = async (e) => {
    e.preventDefault();
    if (!glosaForm.convenio.trim()) return toast.error('Convênio é obrigatório');
    if (!glosaForm.doctor_id) return toast.error('Médico responsável é obrigatório');
    if (!glosaForm.amount || parseFloat(glosaForm.amount) <= 0) return toast.error('Valor da glosa deve ser maior que zero');

    setLoading(true);
    try {
      const payload = {
        ...glosaForm,
        amount: parseFloat(glosaForm.amount),
        recovered_amount: parseFloat(glosaForm.recovered_amount) || 0,
        surgery_id: glosaForm.surgery_id || null
      };

      if (selectedGlosaId) {
        await financeService.updateGlosa(selectedGlosaId, payload);
        toast.success('Glosa atualizada com sucesso!');
      } else {
        await financeService.createGlosa(payload);
        toast.success('Glosa lançada com sucesso!');
      }

      setGlosaForm({
        surgery_id: '',
        convenio: '',
        doctor_id: '',
        glosa_date: todayISO(),
        amount: '',
        reason: '',
        status: 'PENDENTE',
        recovered_amount: 0
      });
      setSelectedGlosaId(null);
      setIsGlosaModalOpen(false);
      loadInitialData();
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar glosa.');
    } finally {
      setLoading(false);
    }
  };

  const handleEditGlosa = (g) => {
    setGlosaForm({
      surgery_id: g.surgery_id || '',
      convenio: g.convenio,
      doctor_id: g.doctor_id || '',
      glosa_date: g.glosa_date,
      amount: g.amount.toString(),
      reason: g.reason || '',
      status: g.status,
      recovered_amount: g.recovered_amount
    });
    setSelectedGlosaId(g.id);
    setIsGlosaModalOpen(true);
  };

  // --- CÁLCULO DE TOTAIS ---
  const glosaTotals = useMemo(() => {
    let totalGlosed = 0;
    let totalRecovered = 0;

    glosas.forEach(g => {
      totalGlosed += parseFloat(g.amount);
      totalRecovered += parseFloat(g.recovered_amount || 0);
    });

    return {
      glosed: totalGlosed,
      recovered: totalRecovered,
      netLoss: totalGlosed - totalRecovered
    };
  }, [glosas]);

  const baseInputStyle = "w-full h-10 px-3 bg-white border border-black/[.085] rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-[#0071e3] focus:ring-2 focus:ring-indigo-500/10 transition-all shadow-sm";

  return (
    <div className="px-4 sm:px-6 pr-8 py-4 min-h-full bg-[#f5f5f7] font-sans text-slate-900">

      {/* Header Premium */}
      <div className="mb-4 border-b border-black/[.085] pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-base font-semibold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
            <ShieldAlert className="text-rose-600" size={18} />
            Controle de Glosas
          </h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Auditoria e dedução de faturamentos recusados por convênios</p>
        </div>

        {canEdit && (
          <button
            onClick={() => { setSelectedGlosaId(null); setIsGlosaModalOpen(true); }}
            className="h-9 px-5 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl font-bold text-xs uppercase shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center gap-2 transition-all"
          >
            <Plus size={16} /> Lançar Glosa
          </button>
        )}
      </div>

      {/* Grid de KPIs de Auditoria */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-white/85 border border-black/[.085] p-4 rounded-2xl shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center text-rose-600">
            <AlertCircle size={22} />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Glosado</span>
            <p className="text-base font-semibold text-slate-900 mt-0.5">R$ {glosaTotals.glosed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="bg-white/85 border border-black/[.085] p-4 rounded-2xl shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
            <CheckCircle size={22} />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Total Recuperado</span>
            <p className="text-base font-semibold text-slate-900 mt-0.5">R$ {glosaTotals.recovered.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>

        <div className="bg-white/85 border border-black/[.085] p-4 rounded-2xl shadow-sm flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-slate-900 border border-slate-900 rounded-2xl flex items-center justify-center text-white">
            <DollarSign size={22} />
          </div>
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Perda Líquida</span>
            <p className="text-base font-semibold text-slate-900 mt-0.5">R$ {glosaTotals.netLoss.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </div>
        </div>
      </div>

      {/* Tabela de Glosas e Filtros */}
      <div className="bg-white/80 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm flex flex-col min-h-[50vh]">
        
        {/* Filtros Rápidos */}
        <div className="flex flex-wrap items-center gap-2 mb-4 border-b border-black/[.06] pb-5">
          <select 
            value={filters.status} 
            onChange={e => setFilters({ ...filters, status: e.target.value })} 
            className="h-9 px-3 bg-white border border-black/[.085] rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-[#0071e3] shadow-sm cursor-pointer"
          >
            <option value="">Todos os Status</option>
            <option value="PENDENTE">Pendente</option>
            <option value="PAGO_PARCIAL">Pago Parcial</option>
            <option value="GLOSADO">Glosado Definitivo</option>
          </select>

          <div className="w-52">
            <SearchableSelect
              options={[{ value: '', label: 'Filtrar por Médico...' }, ...doctors.map(d => ({ value: d.id, label: d.name }))]}
              value={filters.doctorId} onChange={v => setFilters({ ...filters, doctorId: v })}
              placeholder="Filtrar por Médico..." searchPlaceholder="Buscar médico…" />
          </div>

          <input 
            type="text" 
            placeholder="Filtrar por Convênio..." 
            value={filters.convenio}
            onChange={e => setFilters({ ...filters, convenio: e.target.value })}
            className="h-9 px-3 bg-white border border-black/[.085] rounded-lg text-xs font-bold text-slate-700 outline-none focus:border-[#0071e3] shadow-sm placeholder:font-normal"
          />

          <button 
            onClick={() => setFilters({ status: '', doctorId: '', convenio: '' })}
            className="h-9 px-3 rounded-lg border border-black/[.085] bg-white text-slate-500 hover:text-rose-500 text-[10px] font-semibold uppercase transition-all shadow-sm"
          >
            Limpar
          </button>
        </div>

        {/* Tabela */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 size={36} className="text-[#0071e3] animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-black/[.06] text-[10px] font-semibold text-slate-400 uppercase tracking-widest bg-[#f5f5f7]">
                  <th className="py-3 px-4">Data Glosa</th>
                  <th className="py-3 px-4">Convênio</th>
                  <th className="py-3 px-4">Médico Responsável</th>
                  <th className="py-3 px-4">Vínculo Cirúrgico</th>
                  <th className="py-3 px-4">Motivo / OBS</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Valor Glosado</th>
                  <th className="py-3 px-4 text-right">Valor Recuperado</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[.055]">
                {glosas.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-12 text-slate-400 text-xs font-bold uppercase">Nenhuma glosa pendente ou auditada.</td>
                  </tr>
                ) : (
                  glosas.map(g => (
                    <tr key={g.id} className="hover:bg-[#f5f5f7] transition-colors text-xs font-bold text-slate-700">
                      <td className="py-2 px-4 text-slate-400 font-medium">{formatDateBR(g.glosa_date)}</td>
                      <td className="py-2 px-4 text-slate-800 uppercase font-semibold">{g.convenio}</td>
                      <td className="py-2 px-4 text-slate-600">{g.users?.name || 'Não informado'}</td>
                      <td className="py-2 px-4 text-slate-400 font-medium">
                        {g.surgeries ? (
                          <span className="text-slate-600">Pac: {g.surgeries.paciente}</span>
                        ) : 'Geral / Outros'}
                      </td>
                      <td className="py-2 px-4 text-slate-500 font-medium truncate max-w-[150px]" title={g.reason}>{g.reason || '-'}</td>
                      <td className="py-2 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider ${g.status === 'PENDENTE' ? 'bg-amber-50 text-amber-600 border border-amber-100' : g.status === 'PAGO_PARCIAL' ? 'bg-indigo-50 text-[#0071e3] border border-indigo-100' : 'bg-rose-50 text-rose-600 border border-rose-100'}`}>
                          {g.status === 'PENDENTE' ? 'Pendente' : g.status === 'PAGO_PARCIAL' ? 'Pago Parcial' : 'Glosado'}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-right text-rose-600 font-semibold">R$ {g.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-4 text-right text-emerald-600 font-semibold">R$ {(g.recovered_amount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="py-2 px-4">
                        {canEdit && (
                          <div className="flex items-center justify-center">
                            <button
                              onClick={() => handleEditGlosa(g)}
                              className="p-1.5 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg transition-colors"
                            >
                              <Edit2 size={13} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

      </div>

      {/* Modal de Nova / Editar Glosa */}
      {isGlosaModalOpen && (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/25 backdrop-blur-sm" onClick={() => setIsGlosaModalOpen(false)}></div>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden border border-black/[.06] max-h-[90vh]">
            <div className="p-4 border-b border-black/[.06] flex items-center justify-between shrink-0">
              <h3 className="text-base font-semibold text-slate-800 tracking-tight uppercase">{selectedGlosaId ? 'Editar Auditoria' : 'Lançar Nova Glosa'}</h3>
              <button onClick={() => setIsGlosaModalOpen(false)} className="text-slate-400 hover:text-slate-700 p-1">
                <Plus size={20} className="rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleSaveGlosa} className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Médico Responsável */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Médico Responsável</label>
                  <select
                    value={glosaForm.doctor_id}
                    onChange={e => setGlosaForm({ ...glosaForm, doctor_id: e.target.value })}
                    className={`${baseInputStyle} cursor-pointer`}
                    required
                  >
                    <option value="" disabled>Selecione...</option>
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>

                {/* Convênio */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Convênio Recusante</label>
                  <input
                    type="text"
                    required
                    value={glosaForm.convenio}
                    onChange={e => setGlosaForm({ ...glosaForm, convenio: e.target.value })}
                    className={baseInputStyle}
                    placeholder="Ex: UNIMED, AMIL"
                  />
                </div>

                {/* Cirurgia Vinculada */}
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Cirurgia Correspondente (Opcional)</label>
                  <select
                    value={glosaForm.surgery_id}
                    onChange={e => setGlosaForm({ ...glosaForm, surgery_id: e.target.value })}
                    className={`${baseInputStyle} cursor-pointer`}
                  >
                    <option value="">Não Vinculada (Glosa Geral)</option>
                    {surgeries.map(s => (
                      <option key={s.id} value={s.id}>Pac: {s.paciente} ({s.procedimento || 'Sem proc.'}) - {formatDateBR(s.dataAgendado)}</option>
                    ))}
                  </select>
                </div>

                {/* Data da Glosa */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Data da Glosa</label>
                  <input
                    type="date"
                    required
                    value={glosaForm.glosa_date}
                    onChange={e => setGlosaForm({ ...glosaForm, glosa_date: e.target.value })}
                    className={baseInputStyle}
                  />
                </div>

                {/* Valor Glosado */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Valor Recusado (R$)</label>
                  <CurrencyInput
                    required
                    value={glosaForm.amount}
                    onChange={v => setGlosaForm({ ...glosaForm, amount: v })}
                    className={baseInputStyle}
                  />
                </div>

                {/* Status da Contestação */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Status de Auditoria</label>
                  <select
                    value={glosaForm.status}
                    onChange={e => setGlosaForm({ ...glosaForm, status: e.target.value })}
                    className={`${baseInputStyle} cursor-pointer`}
                  >
                    <option value="PENDENTE">Em Recurso (Pendente)</option>
                    <option value="PAGO_PARCIAL">Pago Parcial (Recuperação)</option>
                    <option value="GLOSADO">Glosado Definitivo (Perda)</option>
                  </select>
                </div>

                {/* Valor Recuperado se aplicável */}
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Valor Recuperado (R$)</label>
                  <CurrencyInput
                    value={glosaForm.recovered_amount}
                    disabled={glosaForm.status === 'PENDENTE'}
                    onChange={v => setGlosaForm({ ...glosaForm, recovered_amount: v })}
                    className={baseInputStyle}
                  />
                </div>

                {/* Motivação */}
                <div className="md:col-span-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Justificativa / Motivo</label>
                  <textarea
                    value={glosaForm.reason}
                    onChange={e => setGlosaForm({ ...glosaForm, reason: e.target.value })}
                    className={`${baseInputStyle} h-16 resize-none py-1.5`}
                    placeholder="Ex: Falta de justificativa clínica na guia de solicitação..."
                  />
                </div>

              </div>

              <div className="pt-2 flex justify-end gap-2 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setIsGlosaModalOpen(false)}
                  className="h-10 px-4 font-bold text-slate-500 hover:bg-slate-100 rounded-xl text-xs uppercase"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  disabled={loading}
                  className="h-10 px-6 bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold rounded-xl text-xs uppercase transition-all shadow-md flex items-center gap-2"
                >
                  {loading ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                  Salvar Glosa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
