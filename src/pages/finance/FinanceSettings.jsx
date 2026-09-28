import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../services/supabase';
import { financeService } from '../../services/financeService';
import {
  FolderPlus, Plus, Edit2, Trash2, ShieldCheck, DollarSign,
  Settings, Folder, Palette, HelpCircle, Loader2, Save, UserCheck, CreditCard,
  Search, Download, Upload, ChevronUp, ChevronDown, ChevronRight, X,
  Activity, Users, Percent, Briefcase, FolderTree, ListTree, Printer
} from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { maskDocumento } from '../../utils/masks';
import { todayISO } from '../../utils/date';
import { printReport } from '../../utils/printReport';
import { useWhiteLabel } from '../../contexts/WhiteLabelContext';
import { useAuth } from '../../contexts/AuthContext';
import CurrencyInput from '../../components/finance/CurrencyInput';

const fmtBRL = (v) => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

// Monograma (inicial colorida) para cadastros sem foto.
const MONO_COLORS = ['bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-rose-100 text-rose-700', 'bg-amber-100 text-amber-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700', 'bg-teal-100 text-teal-700', 'bg-fuchsia-100 text-fuchsia-700'];
const initialsOf = (name = '') => name.trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
const monoColor = (name = '') => MONO_COLORS[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % MONO_COLORS.length];

// Ícones disponíveis para categorias DRE (chave salva em finance_categories.icon).
const CATEGORY_ICONS = [
  { key: 'Folder', Comp: Folder, label: 'Pasta' },
  { key: 'DollarSign', Comp: DollarSign, label: 'Dinheiro' },
  { key: 'Activity', Comp: Activity, label: 'Atividade' },
  { key: 'ShieldCheck', Comp: ShieldCheck, label: 'Escudo' },
  { key: 'Users', Comp: Users, label: 'Médicos' },
  { key: 'Percent', Comp: Percent, label: 'Imposto' },
  { key: 'Briefcase', Comp: Briefcase, label: 'Maleta' },
];
const ICON_MAP = Object.fromEntries(CATEGORY_ICONS.map(i => [i.key, i.Comp]));
// Paleta de cores rápidas para categorias.
const CATEGORY_COLORS = [
  '#10b981', '#059669', '#34d399', '#14b8a6',
  '#ef4444', '#f43f5e', '#f59e0b', '#eab308',
  '#6366f1', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#0ea5e9',
];

export default function FinanceSettings() {
  const { theme } = useWhiteLabel();
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('services');
  const [loading, setLoading] = useState(false);
  // Confirmação estilizada (substitui confirm() nativo). askConfirm(...) -> Promise<boolean>.
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const closeConfirm = (ok) => { if (confirmState) confirmState.resolve(ok); setConfirmState(null); };

  // States para Serviços
  const [services, setServices] = useState([]);
  const [serviceForm, setServiceForm] = useState({ name: '', description: '', base_price: 0, is_active: true });
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [serviceSearch, setServiceSearch] = useState('');
  const [serviceStatusFilter, setServiceStatusFilter] = useState('all'); // all | active | inactive
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);
  const [servicePageSize, setServicePageSize] = useState(20);
  const [servicePage, setServicePage] = useState(1);

  // States para Médicos
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState('');
  const [doctorSearch, setDoctorSearch] = useState('');
  const [doctorCfg, setDoctorCfg] = useState({}); // doctor_id -> true se tem dados bancários/PIX
  const [doctorSettingsForm, setDoctorSettingsForm] = useState({
    admin_fee_rate: 10.00,
    bank_name: '',
    bank_agency: '',
    bank_account: '',
    pix_key: ''
  });

  // States para Categorias
  const [categories, setCategories] = useState([]);
  const [categoryForm, setCategoryForm] = useState({ name: '', type: 'SAIDA', parent_id: '', color: '#10b981', icon: 'Folder', in_result: true, in_cash_flow: true, is_profit_tax: false });
  const [editingCategoryId, setEditingCategoryId] = useState(null);
  const [collapsedCats, setCollapsedCats] = useState(() => new Set()); // ids de nós recolhidos
  const [catModalOpen, setCatModalOpen] = useState(false); // form de categoria em pop-up

  // States para Centros de Custo (árvore hierárquica)
  const [costCenters, setCostCenters] = useState([]);
  const [ccForm, setCcForm] = useState({ name: '', code: '', parent_id: '', color: '#6366f1' });
  const [editingCcId, setEditingCcId] = useState(null);
  const [collapsedCc, setCollapsedCc] = useState(() => new Set());
  const [ccModalOpen, setCcModalOpen] = useState(false);
  const DEFAULT_CC_ID = '30000000-0000-0000-0000-000000000001';

  // States para Contas Bancárias
  const [bankAccounts, setBankAccounts] = useState([]);
  const [accForm, setAccForm] = useState({ name: '', bank_name: '', agency: '', account_number: '', initial_balance: 0, initial_balance_date: todayISO(), overdraft_limit: 0 });
  const [editingAccId, setEditingAccId] = useState(null);
  const [accModalOpen, setAccModalOpen] = useState(false);

  // States para Pagadores / Fornecedores (sempre AMBOS — sem distinção pagador/fornecedor)
  const [parties, setParties] = useState([]);
  const [partyForm, setPartyForm] = useState({ name: '', document: '', notes: '' });
  const [editingPartyId, setEditingPartyId] = useState(null);
  const [partySearch, setPartySearch] = useState('');

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'services') {
        const data = await financeService.getServices();
        setServices(data || []);
      } else if (activeTab === 'doctors') {
        // Carrega usuários que são médicos ou administradores
        const { data: usersData, error } = await supabase
          .from('users')
          .select('id, name, role')
          .order('name');
        if (error) throw error;
        
        // Filtra para médicos (ou perfil adequado)
        const medicos = usersData.filter(u => ['Médico', 'Médico Coordenador', 'Administrador'].includes(u.role));
        setDoctors(medicos);

        // Mapa de quem já tem dados de pagamento (banco ou PIX) -> selo configurado/pendente.
        const { data: cfgRows } = await supabase
          .from('finance_doctor_settings')
          .select('doctor_id, bank_name, bank_account, pix_key');
        const cfg = {};
        (cfgRows || []).forEach(r => { cfg[r.doctor_id] = !!(r.bank_name || r.bank_account || r.pix_key); });
        setDoctorCfg(cfg);

        if (medicos.length > 0) {
          const firstDocId = medicos[0].id;
          setSelectedDoctorId(firstDocId);
          await loadDoctorSettings(firstDocId);
        }
      } else if (activeTab === 'categories') {
        const cats = await financeService.getCategories();
        setCategories(cats || []);
      } else if (activeTab === 'parties') {
        const pts = await financeService.getParties();
        setParties(pts || []);
      } else if (activeTab === 'costcenters') {
        const ccs = await financeService.getCostCenters();
        setCostCenters(ccs || []);
      } else if (activeTab === 'bankaccounts') {
        const accs = await financeService.getAccounts();
        setBankAccounts(accs || []);
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar dados de configurações.');
    } finally {
      setLoading(false);
    }
  };

  // --- LÓGICA DE SERVIÇOS ---
  const handleSaveService = async (e) => {
    e.preventDefault();
    if (!serviceForm.name.trim()) return toast.error('Nome do serviço é obrigatório');
    
    try {
      if (editingServiceId) {
        await financeService.updateService(editingServiceId, serviceForm);
        toast.success('Serviço atualizado com sucesso!');
      } else {
        await financeService.createService(serviceForm);
        toast.success('Serviço cadastrado com sucesso!');
      }
      setServiceForm({ name: '', description: '', base_price: 0, is_active: true });
      setEditingServiceId(null);
      const data = await financeService.getServices();
      setServices(data || []);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar o serviço.');
    }
  };

  const handleEditService = (service) => {
    setServiceForm({
      name: service.name,
      description: service.description || '',
      base_price: service.base_price,
      is_active: service.is_active !== false
    });
    setEditingServiceId(service.id);
  };

  const handleDeleteService = async (id) => {
    if (!(await askConfirm({ title: 'Remover serviço', message: 'Deseja realmente remover este serviço?', confirmLabel: 'Remover' }))) return;
    try {
      await financeService.deleteService(id);
      toast.success('Serviço removido com sucesso!');
      setServices(services.filter(s => s.id !== id));
      setSelectedServiceIds(ids => ids.filter(x => x !== id));
    } catch (error) {
      console.error(error);
      toast.error('Erro ao remover serviço (pode estar vinculado a vendas).');
    }
  };

  // Alterna ativo/inativo de um serviço.
  const handleToggleServiceActive = async (service) => {
    const next = !(service.is_active !== false);
    try {
      await financeService.updateService(service.id, { is_active: next });
      setServices(services.map(s => s.id === service.id ? { ...s, is_active: next } : s));
    } catch (error) {
      console.error(error);
      toast.error('Erro ao alterar status do serviço.');
    }
  };

  // Exclusão em massa dos serviços selecionados.
  const handleBulkDeleteServices = async () => {
    if (selectedServiceIds.length === 0) return;
    if (!(await askConfirm({ title: 'Excluir serviços', message: `Excluir ${selectedServiceIds.length} serviço(s) selecionado(s)? Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir' }))) return;
    try {
      await Promise.all(selectedServiceIds.map(id => financeService.deleteService(id)));
      toast.success(`${selectedServiceIds.length} serviço(s) removido(s).`);
      setServices(services.filter(s => !selectedServiceIds.includes(s.id)));
      setSelectedServiceIds([]);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao remover alguns serviços (podem estar vinculados a vendas).');
    }
  };

  // Exporta os serviços (respeitando o filtro atual) para XLSX.
  const handleExportServices = () => {
    const rows = filteredServices.map(s => ({
      Nome: s.name,
      Descrição: s.description || '',
      'Preço Base': Number(s.base_price) || 0,
      Status: s.is_active !== false ? 'Ativo' : 'Inativo'
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Serviços');
    XLSX.writeFile(wb, `servicos_financeiro_${todayISO()}.xlsx`);
  };

  // Importa serviços de uma planilha XLSX (colunas: Nome, Descrição, Preço Base, Status).
  const handleImportServices = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: false });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
      const toInsert = raw.map(r => {
        const name = String(r.Nome ?? r.name ?? r.nome ?? '').trim();
        if (!name) return null;
        const priceStr = String(r['Preço Base'] ?? r.preco ?? r.base_price ?? '0').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
        const statusStr = String(r.Status ?? r.status ?? 'Ativo').trim().toLowerCase();
        return {
          name,
          description: String(r.Descrição ?? r.descricao ?? r.description ?? '').trim(),
          base_price: parseFloat(priceStr) || 0,
          is_active: !statusStr.startsWith('inat')
        };
      }).filter(Boolean);
      if (toInsert.length === 0) return toast.error('Planilha sem linhas válidas (coluna "Nome" obrigatória).');
      await Promise.all(toInsert.map(s => financeService.createService(s)));
      toast.success(`${toInsert.length} serviço(s) importado(s).`);
      const data = await financeService.getServices();
      setServices(data || []);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao importar a planilha. Verifique o formato.');
    }
  };

  // --- LÓGICA DE CONFIGURAÇÃO DE MÉDICOS ---
  const loadDoctorSettings = async (docId) => {
    try {
      const settings = await financeService.getDoctorSettings(docId);
      if (settings) {
        setDoctorSettingsForm({
          admin_fee_rate: settings.admin_fee_rate,
          bank_name: settings.bank_name || '',
          bank_agency: settings.bank_agency || '',
          bank_account: settings.bank_account || '',
          pix_key: settings.pix_key || ''
        });
      } else {
        setDoctorSettingsForm({
          admin_fee_rate: 10.00,
          bank_name: '',
          bank_agency: '',
          bank_account: '',
          pix_key: ''
        });
      }
    } catch (error) {
      console.error(error);
      toast.error('Erro ao carregar configurações do médico.');
    }
  };

  const handleSaveDoctorSettings = async (e) => {
    e.preventDefault();
    if (!selectedDoctorId) return toast.error('Nenhum médico selecionado');
    try {
      await financeService.updateDoctorSettings(selectedDoctorId, doctorSettingsForm);
      const configured = !!(doctorSettingsForm.bank_name || doctorSettingsForm.bank_account || doctorSettingsForm.pix_key);
      setDoctorCfg(prev => ({ ...prev, [selectedDoctorId]: configured }));
      toast.success('Configurações salvas com sucesso!');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar as configurações.');
    }
  };

  // --- LÓGICA DE CATEGORIAS ---
  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) return toast.error('Nome da categoria é obrigatório');
    try {
      // parent_id é UUID: "" (Nenhuma) precisa virar null, senão o Postgres rejeita (22P02).
      const payload = { ...categoryForm, parent_id: categoryForm.parent_id || null };
      if (editingCategoryId) {
        await financeService.updateCategory(editingCategoryId, payload);
        toast.success('Categoria atualizada com sucesso!');
      } else {
        await financeService.createCategory(payload);
        toast.success('Categoria criada com sucesso!');
      }
      resetCategoryForm();
      setCatModalOpen(false);
      const cats = await financeService.getCategories();
      setCategories(cats || []);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar categoria.');
    }
  };

  const handleEditCategory = (cat) => {
    setCategoryForm({
      name: cat.name,
      type: cat.type,
      parent_id: cat.parent_id || '',
      color: cat.color || '#cbd5e1',
      icon: cat.icon || 'Folder',
      in_result: cat.in_result !== false,
      in_cash_flow: cat.in_cash_flow !== false,
      is_profit_tax: cat.is_profit_tax === true
    });
    setEditingCategoryId(cat.id);
    setCatModalOpen(true);
  };

  const handleDeleteCategory = async (id) => {
    if (!(await askConfirm({ title: 'Remover categoria', message: 'Deseja remover esta categoria? Só é possível se não houver subcategorias nem lançamentos vinculados.', confirmLabel: 'Remover' }))) return;
    try {
      await financeService.deleteCategory(id);
      toast.success('Categoria removida com sucesso!');
      setCategories(categories.filter(c => c.id !== id));
      if (editingCategoryId === id) resetCategoryForm();
    } catch (error) {
      console.error(error);
      toast.error(error.code === 'HAS_CHILDREN' || error.code === 'HAS_TRANSACTIONS' ? error.message : 'Erro ao deletar categoria.');
    }
  };

  // Reordena uma categoria dentro do seu grupo (mesma categoria pai). dir = -1 (sobe) ou +1 (desce).
  const handleMoveCategory = async (cat, dir) => {
    const siblings = categories.filter(c => (c.parent_id || null) === (cat.parent_id || null));
    const idx = siblings.findIndex(c => c.id === cat.id);
    const target = idx + dir;
    if (target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    // Atualização otimista da lista local seguindo a nova ordem.
    const orderMap = {};
    reordered.forEach((c, i) => { orderMap[c.id] = i + 1; });
    setCategories(cats => cats.map(c => orderMap[c.id] ? { ...c, position: orderMap[c.id] } : c)
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)));
    try {
      await financeService.updateCategoriesOrder(reordered.map(c => c.id));
    } catch (error) {
      console.error(error);
      toast.error('Erro ao reordenar. Recarregando.');
      const cats = await financeService.getCategories();
      setCategories(cats || []);
    }
  };

  // --- Helpers da árvore de categorias ---
  const resetCategoryForm = () => { setEditingCategoryId(null); setCategoryForm({ name: '', type: 'SAIDA', parent_id: '', color: '#10b981', icon: 'Folder', in_result: true, in_cash_flow: true, is_profit_tax: false }); };
  const sortCats = (arr) => [...arr].sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));
  const childrenOf = (pid) => sortCats(categories.filter(c => (c.parent_id || null) === (pid || null)));
  // ids descendentes de um nó (para impedir ciclo ao escolher pai).
  const descendantIds = (id) => {
    const acc = new Set();
    const rec = (p) => categories.filter(c => c.parent_id === p).forEach(c => { acc.add(c.id); rec(c.id); });
    rec(id);
    return acc;
  };
  // Lista achatada em ordem de árvore com profundidade, para o <select> de pai.
  const flattenForSelect = (pid = null, depth = 0, out = []) => {
    childrenOf(pid).forEach(c => { out.push({ cat: c, depth }); flattenForSelect(c.id, depth + 1, out); });
    return out;
  };
  // Inicia criação de subcategoria já com o pai/tipo herdados.
  const startAddChild = (parent) => {
    setEditingCategoryId(null);
    setCategoryForm({ name: '', type: parent.type, parent_id: parent.id, color: parent.color || '#10b981', icon: 'Folder', in_result: parent.in_result !== false, in_cash_flow: parent.in_cash_flow !== false, is_profit_tax: false });
    setCollapsedCats(prev => { const n = new Set(prev); n.delete(parent.id); return n; }); // garante pai expandido
    setCatModalOpen(true);
  };
  const toggleCollapse = (id) => setCollapsedCats(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const collapseAll = () => setCollapsedCats(new Set(categories.filter(c => categories.some(x => x.parent_id === c.id)).map(c => c.id)));
  const expandAll = () => setCollapsedCats(new Set());

  // Render recursivo de um nó da árvore (aninhamento ilimitado).
  const renderCategoryNode = (cat, depth, siblings, idx) => {
    const kids = childrenOf(cat.id);
    const hasKids = kids.length > 0;
    const isCollapsed = collapsedCats.has(cat.id);
    const Icon = ICON_MAP[cat.icon] || Folder;
    const isEntrada = cat.type === 'ENTRADA';
    const editing = editingCategoryId === cat.id;
    return (
      <div key={cat.id}>
        <div className={`group flex items-center gap-1.5 py-1.5 pr-1 rounded-lg transition-colors ${editing ? 'bg-indigo-50/70 ring-1 ring-[#0071e3]/30' : 'hover:bg-slate-50'}`}>
          {hasKids ? (
            <button type="button" onClick={() => toggleCollapse(cat.id)} title={isCollapsed ? 'Expandir' : 'Recolher'}
              className="p-0.5 text-slate-400 hover:text-[#0071e3] rounded shrink-0">
              <ChevronRight size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
            </button>
          ) : <span className="w-[19px] shrink-0" />}

          <div className="flex flex-col -space-y-1 shrink-0">
            <button type="button" onClick={() => handleMoveCategory(cat, -1)} disabled={idx === 0}
              className="text-slate-300 hover:text-[#0071e3] disabled:opacity-20 disabled:cursor-not-allowed leading-none"><ChevronUp size={12} /></button>
            <button type="button" onClick={() => handleMoveCategory(cat, 1)} disabled={idx === siblings.length - 1}
              className="text-slate-300 hover:text-[#0071e3] disabled:opacity-20 disabled:cursor-not-allowed leading-none"><ChevronDown size={12} /></button>
          </div>

          <div className="w-6 h-6 rounded-lg grid place-items-center text-white shrink-0 shadow-sm" style={{ backgroundColor: cat.color || '#64748b' }}>
            <Icon size={12} />
          </div>

          <div className="min-w-0 flex items-center gap-2 flex-1">
            <span className={`truncate ${depth === 0 ? 'font-semibold text-slate-800 text-sm' : 'font-bold text-slate-600 text-[13px]'}`}>{cat.name}</span>
            {depth === 0 && (
              <span className={`text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${isEntrada ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>{isEntrada ? 'Entrada' : 'Saída'}</span>
            )}
            {hasKids && <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 rounded-full">{kids.length}</span>}
            {cat.in_result === false && (
              <span title="Não entra no Resultado Líquido do DRE (item não-operacional)"
                className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-amber-50 text-amber-600 border-amber-100 shrink-0">Fora do DRE</span>
            )}
            {cat.in_cash_flow === false && (
              <span title="Competência pura: conta no DRE, mas R$ 0,00 no Fluxo de Caixa (ex.: depreciação)"
                className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-sky-50 text-sky-600 border-sky-100 shrink-0">Sem caixa</span>
            )}
            {cat.is_profit_tax === true && (
              <span title="Imposto sobre o lucro (IRPJ/CSLL): subtraído após o LAIR, antes do Lucro Líquido"
                className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-violet-50 text-violet-600 border-violet-100 shrink-0">IRPJ/CSLL</span>
            )}
          </div>

          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button type="button" title="Adicionar subcategoria" onClick={() => startAddChild(cat)}
              className="p-1 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg transition-colors"><Plus size={13} /></button>
            <button type="button" title="Editar" onClick={() => handleEditCategory(cat)}
              className="p-1 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={13} /></button>
            <button type="button" title="Excluir" onClick={() => handleDeleteCategory(cat.id)}
              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
          </div>
        </div>
        {hasKids && !isCollapsed && (
          <div className="ml-[19px] border-l border-black/[.085] pl-2">
            {kids.map((k, i) => renderCategoryNode(k, depth + 1, kids, i))}
          </div>
        )}
      </div>
    );
  };

  // --- LÓGICA / ÁRVORE DE CENTROS DE CUSTO ---
  const resetCcForm = () => { setEditingCcId(null); setCcForm({ name: '', code: '', parent_id: '', color: '#6366f1' }); };
  const sortCc = (arr) => [...arr].sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name));
  const ccChildrenOf = (pid) => sortCc(costCenters.filter(c => (c.parent_id || null) === (pid || null)));
  const ccDescendantIds = (id) => {
    const acc = new Set();
    const rec = (p) => costCenters.filter(c => c.parent_id === p).forEach(c => { acc.add(c.id); rec(c.id); });
    rec(id);
    return acc;
  };
  const ccFlattenForSelect = (pid = null, depth = 0, out = []) => {
    ccChildrenOf(pid).forEach(c => { out.push({ cc: c, depth }); ccFlattenForSelect(c.id, depth + 1, out); });
    return out;
  };
  const startAddCcChild = (parent) => {
    setEditingCcId(null);
    setCcForm({ name: '', code: '', parent_id: parent.id, color: parent.color || '#6366f1' });
    setCollapsedCc(prev => { const n = new Set(prev); n.delete(parent.id); return n; });
    setCcModalOpen(true);
  };
  const toggleCollapseCc = (id) => setCollapsedCc(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const collapseAllCc = () => setCollapsedCc(new Set(costCenters.filter(c => costCenters.some(x => x.parent_id === c.id)).map(c => c.id)));
  const expandAllCc = () => setCollapsedCc(new Set());

  const handleSaveCc = async (e) => {
    e.preventDefault();
    if (!ccForm.name.trim()) return toast.error('Nome do centro de custo é obrigatório');
    try {
      const payload = { name: ccForm.name, code: ccForm.code || null, color: ccForm.color, parent_id: ccForm.parent_id || null };
      if (editingCcId) { await financeService.updateCostCenter(editingCcId, payload); toast.success('Centro de custo atualizado!'); }
      else { await financeService.createCostCenter(payload); toast.success('Centro de custo criado!'); }
      resetCcForm();
      setCcModalOpen(false);
      const ccs = await financeService.getCostCenters();
      setCostCenters(ccs || []);
    } catch (error) { console.error(error); toast.error('Erro ao salvar centro de custo.'); }
  };

  const handleEditCc = (cc) => {
    setCcForm({ name: cc.name, code: cc.code || '', parent_id: cc.parent_id || '', color: cc.color || '#6366f1' });
    setEditingCcId(cc.id);
    setCcModalOpen(true);
  };

  const handleDeleteCc = async (id) => {
    if (!(await askConfirm({ title: 'Excluir centro de custo', message: 'Deseja excluir este centro de custo?', confirmLabel: 'Excluir' }))) return;
    try {
      await financeService.deleteCostCenter(id);
      toast.success('Centro de custo excluído.');
      if (editingCcId === id) resetCcForm();
      setCostCenters(cs => cs.filter(c => c.id !== id));
    } catch (error) {
      // Avisa por segurança em vez de excluir (integridade).
      const msg = error?.code === 'HAS_TRANSACTIONS'
        ? 'Não dá pra excluir: há lançamentos vinculados a este centro de custo.'
        : error?.code === 'HAS_CHILDREN'
          ? 'Não dá pra excluir: este centro possui subcentros. Remova-os antes.'
          : error?.code === 'IS_DEFAULT'
            ? 'O centro "Geral" não pode ser excluído (é o padrão do sistema).'
            : 'Erro ao excluir centro de custo.';
      toast.error(msg);
    }
  };

  const handleMoveCc = async (cc, dir) => {
    const siblings = costCenters.filter(c => (c.parent_id || null) === (cc.parent_id || null));
    const idx = siblings.findIndex(c => c.id === cc.id);
    const target = idx + dir;
    if (target < 0 || target >= siblings.length) return;
    const reordered = [...siblings];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    const orderMap = {};
    reordered.forEach((c, i) => { orderMap[c.id] = i + 1; });
    setCostCenters(cs => cs.map(c => orderMap[c.id] ? { ...c, position: orderMap[c.id] } : c)
      .sort((a, b) => (a.position || 0) - (b.position || 0) || a.name.localeCompare(b.name)));
    try { await financeService.updateCostCentersOrder(reordered.map(c => c.id)); }
    catch (error) { console.error(error); toast.error('Erro ao reordenar.'); const ccs = await financeService.getCostCenters(); setCostCenters(ccs || []); }
  };

  const renderCcNode = (cc, depth, siblings, idx) => {
    const kids = ccChildrenOf(cc.id);
    const hasKids = kids.length > 0;
    const isCollapsed = collapsedCc.has(cc.id);
    const editing = editingCcId === cc.id;
    const isDefault = cc.id === DEFAULT_CC_ID;
    return (
      <div key={cc.id}>
        <div className={`group flex items-center gap-1.5 py-1.5 pr-1 rounded-lg transition-colors ${editing ? 'bg-indigo-50/70 ring-1 ring-[#0071e3]/30' : 'hover:bg-slate-50'}`}>
          {hasKids ? (
            <button type="button" onClick={() => toggleCollapseCc(cc.id)} title={isCollapsed ? 'Expandir' : 'Recolher'}
              className="p-0.5 text-slate-400 hover:text-[#0071e3] rounded shrink-0">
              <ChevronRight size={14} className={`transition-transform ${isCollapsed ? '' : 'rotate-90'}`} />
            </button>
          ) : <span className="w-[19px] shrink-0" />}
          <div className="flex flex-col -space-y-1 shrink-0">
            <button type="button" onClick={() => handleMoveCc(cc, -1)} disabled={idx === 0}
              className="text-slate-300 hover:text-[#0071e3] disabled:opacity-20 disabled:cursor-not-allowed leading-none"><ChevronUp size={12} /></button>
            <button type="button" onClick={() => handleMoveCc(cc, 1)} disabled={idx === siblings.length - 1}
              className="text-slate-300 hover:text-[#0071e3] disabled:opacity-20 disabled:cursor-not-allowed leading-none"><ChevronDown size={12} /></button>
          </div>
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cc.color || '#64748b' }} />
          <div className="min-w-0 flex items-center gap-2 flex-1">
            <span className={`truncate ${depth === 0 ? 'font-semibold text-slate-800 text-sm' : 'font-bold text-slate-600 text-[13px]'}`}>{cc.name}</span>
            {cc.code && <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{cc.code}</span>}
            {isDefault && <span className="text-[8px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-indigo-50 text-[#0071e3] border border-indigo-100">Padrão</span>}
            {hasKids && <span className="text-[9px] font-semibold text-slate-400 bg-slate-100 px-1.5 rounded-full">{kids.length}</span>}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button type="button" title="Adicionar subcentro" onClick={() => startAddCcChild(cc)}
              className="p-1 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg transition-colors"><Plus size={13} /></button>
            <button type="button" title="Editar" onClick={() => handleEditCc(cc)}
              className="p-1 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={13} /></button>
            {!isDefault && (
              <button type="button" title="Excluir" onClick={() => handleDeleteCc(cc.id)}
                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={13} /></button>
            )}
          </div>
        </div>
        {hasKids && !isCollapsed && (
          <div className="ml-[19px] border-l border-black/[.085] pl-2">
            {kids.map((k, i) => renderCcNode(k, depth + 1, kids, i))}
          </div>
        )}
      </div>
    );
  };

  // --- LÓGICA DE CONTAS BANCÁRIAS ---
  const resetAccForm = () => { setEditingAccId(null); setAccForm({ name: '', bank_name: '', agency: '', account_number: '', initial_balance: 0, initial_balance_date: todayISO(), overdraft_limit: 0 }); };
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    if (!accForm.name.trim()) return toast.error('Nome da conta é obrigatório');
    try {
      if (editingAccId) {
        // Ao mudar o saldo inicial, o saldo atual é ajustado pela MESMA diferença — mas de
        // forma RELATIVA no banco (_balanceDelta → RPC adjust_account_balance). NUNCA enviamos
        // current_balance cru: isso evita sobrescrever com um snapshot velho e "apagar" baixas
        // que aconteceram em paralelo (o saldo é dirigido pelas baixas).
        const orig = bankAccounts.find(b => b.id === editingAccId);
        const newInitial = parseFloat(accForm.initial_balance) || 0;
        const delta = newInitial - parseFloat(orig?.initial_balance || 0);
        await financeService.updateAccount(editingAccId, {
          name: accForm.name, bank_name: accForm.bank_name, agency: accForm.agency, account_number: accForm.account_number,
          initial_balance_date: accForm.initial_balance_date,
          overdraft_limit: parseFloat(accForm.overdraft_limit) || 0,
          _balanceDelta: delta, // initial_balance é ajustado dentro da RPC junto com o current
        });
        toast.success('Conta atualizada!');
      } else {
        await financeService.createAccount({ ...accForm, current_balance: accForm.initial_balance });
        toast.success('Conta criada!');
      }
      resetAccForm();
      setAccModalOpen(false);
      const accs = await financeService.getAccounts();
      setBankAccounts(accs || []);
    } catch (error) { console.error(error); toast.error('Erro ao salvar conta.'); }
  };
  const handleEditAccount = (a) => {
    setAccForm({ name: a.name, bank_name: a.bank_name || '', agency: a.agency || '', account_number: a.account_number || '', initial_balance: a.initial_balance || 0, initial_balance_date: a.initial_balance_date || todayISO(), overdraft_limit: a.overdraft_limit || 0 });
    setEditingAccId(a.id);
    setAccModalOpen(true);
  };
  const handleDeleteAccount = async (id) => {
    if (!(await askConfirm({ title: 'Excluir conta bancária', message: 'Excluir esta conta? Só é possível se não houver lançamentos vinculados.', confirmLabel: 'Excluir' }))) return;
    try {
      await financeService.deleteAccount(id);
      toast.success('Conta excluída.');
      setBankAccounts(bs => bs.filter(b => b.id !== id));
    } catch (error) {
      console.error(error);
      toast.error(error.code === 'HAS_TRANSACTIONS' ? error.message : 'Não foi possível excluir a conta.');
    }
  };

  // --- LÓGICA DE PAGADORES / FORNECEDORES ---
  const handleSaveParty = async (e) => {
    e.preventDefault();
    if (!partyForm.name.trim()) return toast.error('Nome do pagador/fornecedor é obrigatório');
    try {
      // Todo cadastro é AMBOS: aparece tanto em contas a pagar quanto a receber.
      const payload = { ...partyForm, kind: 'AMBOS' };
      if (editingPartyId) {
        await financeService.updateParty(editingPartyId, payload);
        toast.success('Cadastro atualizado com sucesso!');
      } else {
        await financeService.createParty(payload);
        toast.success('Cadastro salvo com sucesso!');
      }
      setPartyForm({ name: '', document: '', notes: '' });
      setEditingPartyId(null);
      const pts = await financeService.getParties();
      setParties(pts || []);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao salvar o cadastro.');
    }
  };

  const handleEditParty = (party) => {
    setPartyForm({
      name: party.name,
      document: maskDocumento(party.document || ''),
      notes: party.notes || ''
    });
    setEditingPartyId(party.id);
  };

  const handleDeleteParty = async (id) => {
    if (!(await askConfirm({ title: 'Remover cadastro', message: 'Deseja remover este pagador/fornecedor? Os lançamentos vinculados ficam sem vínculo.', confirmLabel: 'Remover' }))) return;
    try {
      await financeService.deleteParty(id);
      toast.success('Cadastro removido com sucesso!');
      setParties(parties.filter(p => p.id !== id));
    } catch (error) {
      console.error(error);
      toast.error('Erro ao remover cadastro.');
    }
  };

  // --- DERIVADOS DE SERVIÇOS (busca + filtro de status + paginação) ---
  const filteredServices = useMemo(() => {
    const q = serviceSearch.trim().toLowerCase();
    return services.filter(s => {
      if (serviceStatusFilter === 'active' && s.is_active === false) return false;
      if (serviceStatusFilter === 'inactive' && s.is_active !== false) return false;
      if (!q) return true;
      return (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q);
    });
  }, [services, serviceSearch, serviceStatusFilter]);

  const serviceTotalPages = Math.max(1, Math.ceil(filteredServices.length / servicePageSize));
  const currentServicePage = Math.min(servicePage, serviceTotalPages);
  const pagedServices = useMemo(
    () => filteredServices.slice((currentServicePage - 1) * servicePageSize, currentServicePage * servicePageSize),
    [filteredServices, currentServicePage, servicePageSize]
  );
  // Volta para a 1ª página sempre que filtro/busca/tamanho muda.
  useEffect(() => { setServicePage(1); }, [serviceSearch, serviceStatusFilter, servicePageSize]);

  const pagedAllSelected = pagedServices.length > 0 && pagedServices.every(s => selectedServiceIds.includes(s.id));
  const toggleSelectAllPaged = () => {
    setSelectedServiceIds(ids => pagedAllSelected
      ? ids.filter(id => !pagedServices.some(s => s.id === id))
      : [...new Set([...ids, ...pagedServices.map(s => s.id)])]);
  };
  const toggleSelectService = (id) => {
    setSelectedServiceIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  };

  const baseInputStyle = "w-full h-9 px-3 py-2 bg-white/50 border border-black/[.085] rounded-lg text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-800";

  // Impressão do cadastro da aba ativa (estilo planilha).
  const TAB_TITLES = {
    services: 'Serviços Ofertados', doctors: 'Regras de Médicos', parties: 'Pagadores / Fornecedores',
    categories: 'Plano de Contas (Categorias DRE)', costcenters: 'Centros de Custo', bankaccounts: 'Contas Bancárias',
  };
  const printActiveTab = () => {
    const base = { theme, userName: currentUser?.name || currentUser?.email || 'Usuário do Sistema', periodText: 'Cadastro', orientation: 'portrait', title: TAB_TITLES[activeTab] || 'Configurações' };
    let columns = [], rows = [], totalLabel = 'Total de Registros';
    if (activeTab === 'services') {
      columns = [{ header: 'Serviço' }, { header: 'Descrição' }, { header: 'Preço base (R$)', align: 'right' }, { header: 'Status' }];
      rows = services.map(s => [s.name || '—', s.description || '—', fmtBRL(s.base_price).replace('R$ ', ''), s.is_active !== false ? 'Ativo' : 'Inativo']);
      totalLabel = 'Total de Serviços';
    } else if (activeTab === 'parties') {
      columns = [{ header: 'Nome' }, { header: 'Documento' }, { header: 'Tipo' }, { header: 'Observações' }];
      rows = parties.map(p => [p.name || '—', p.document || '—', p.kind || '—', p.notes || '—']);
      totalLabel = 'Total de Cadastros';
    } else if (activeTab === 'categories') {
      columns = [{ header: 'Categoria' }, { header: 'Tipo' }, { header: 'No DRE' }, { header: 'Move caixa' }];
      rows = [...categories].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'))
        .map(c => [c.name || '—', c.type === 'ENTRADA' ? 'Receita' : 'Despesa', c.in_result === false ? 'Não' : 'Sim', c.in_cash_flow === false ? 'Não' : 'Sim']);
      totalLabel = 'Total de Categorias';
    } else if (activeTab === 'costcenters') {
      columns = [{ header: 'Centro de custo' }, { header: 'Código' }];
      rows = [...costCenters].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR')).map(c => [c.name || '—', c.code || '—']);
      totalLabel = 'Total de Centros de Custo';
    } else if (activeTab === 'bankaccounts') {
      columns = [{ header: 'Conta' }, { header: 'Banco' }, { header: 'Agência' }, { header: 'Conta nº' }, { header: 'Saldo atual (R$)', align: 'right' }];
      rows = bankAccounts.map(a => [a.name || '—', a.bank_name || '—', a.agency || '—', a.account_number || '—', fmtBRL(a.current_balance).replace('R$ ', '')]);
      totalLabel = 'Total de Contas';
    } else {
      columns = [{ header: 'Médico' }, { header: 'Dados de pagamento' }];
      rows = doctors.map(d => [d.name || '—', doctorCfg[d.id] ? 'Configurado' : 'Pendente']);
      totalLabel = 'Total de Médicos';
    }
    if (!rows.length) return toast.error('Nada para imprimir nesta aba.');
    printReport({ ...base, columns, rows, totalLabel });
  };

  return (
    <div className="px-4 sm:px-6 pr-8 py-4 min-h-full bg-[#f5f5f7] font-sans text-slate-900">
      
      {/* Header Premium */}
      <div className="mb-4 border-b border-black/[.085] pb-4 flex justify-between items-center gap-3">
        <div>
          <h1 className="text-base font-semibold text-[#1d1d1f] uppercase tracking-tight flex items-center gap-2">
            <Settings className="text-[#0071e3]" size={18} />
            Configurações Financeiras
          </h1>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">Parâmetros, Serviços e Repasse do ERP</p>
        </div>
        <button onClick={printActiveTab} title="Imprimir o cadastro desta aba"
          className="h-9 px-3 bg-white hover:bg-slate-50 border border-black/[.085] text-slate-600 rounded-lg font-semibold text-[10px] uppercase tracking-wide shadow-sm flex items-center gap-1.5 transition-all shrink-0">
          <Printer size={14} /> Imprimir
        </button>
      </div>

      {/* Tabs Layout */}
      <div className="flex gap-2 sm:gap-3 mb-4 bg-white/60 backdrop-blur-md border border-white/50 shadow-sm p-1.5 rounded-2xl max-w-full overflow-x-auto no-scrollbar [&>button]:shrink-0">
        <button 
          onClick={() => setActiveTab('services')}
          className={`px-5 py-2 text-[10px] font-semibold uppercase tracking-wide transition-all rounded-xl ${activeTab === 'services' ? 'bg-[#0071e3] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Serviços Ofertados
        </button>
        <button 
          onClick={() => setActiveTab('doctors')}
          className={`px-5 py-2 text-[10px] font-semibold uppercase tracking-wide transition-all rounded-xl ${activeTab === 'doctors' ? 'bg-[#0071e3] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Regras de Médicos
        </button>
        <button
          onClick={() => setActiveTab('parties')}
          className={`px-5 py-2 text-[10px] font-semibold uppercase tracking-wide transition-all rounded-xl ${activeTab === 'parties' ? 'bg-[#0071e3] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Pagadores / Fornecedores
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={`px-5 py-2 text-[10px] font-semibold uppercase tracking-wide transition-all rounded-xl ${activeTab === 'categories' ? 'bg-[#0071e3] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Categorias DRE
        </button>
        <button
          onClick={() => setActiveTab('costcenters')}
          className={`px-5 py-2 text-[10px] font-semibold uppercase tracking-wide transition-all rounded-xl ${activeTab === 'costcenters' ? 'bg-[#0071e3] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Centros de Custo
        </button>
        <button
          onClick={() => setActiveTab('bankaccounts')}
          className={`px-5 py-2 text-[10px] font-semibold uppercase tracking-wide transition-all rounded-xl ${activeTab === 'bankaccounts' ? 'bg-[#0071e3] text-white shadow-md' : 'text-slate-500 hover:text-slate-800'}`}
        >
          Contas Bancárias
        </button>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={32} className="text-[#0071e3] animate-spin" />
        </div>
      )}

      {/* Tab Content: SERVICES */}
      {!loading && activeTab === 'services' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Formulário */}
          <div className="lg:col-span-4 bg-white/70 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm">
            <h3 className="text-[10px] font-semibold text-[#0071e3] uppercase tracking-widest mb-5 flex items-center gap-2">
              <Plus size={16} /> {editingServiceId ? 'Editar Serviço' : 'Novo Serviço'}
            </h3>
            
            <form onSubmit={handleSaveService} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Nome do Serviço</label>
                <input 
                  type="text" 
                  value={serviceForm.name} 
                  onChange={e => setServiceForm({ ...serviceForm, name: e.target.value })} 
                  className={baseInputStyle}
                  placeholder="Ex: Plantão Extra 12h"
                />
              </div>
              
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Descrição</label>
                <textarea 
                  value={serviceForm.description} 
                  onChange={e => setServiceForm({ ...serviceForm, description: e.target.value })} 
                  className={`${baseInputStyle} h-20 resize-none py-1.5`}
                  placeholder="Explicação do serviço financeiro..."
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Preço Base (R$)</label>
                <CurrencyInput
                  value={serviceForm.base_price}
                  onChange={v => setServiceForm({ ...serviceForm, base_price: v })}
                  className={baseInputStyle}
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={serviceForm.is_active}
                  onChange={e => setServiceForm({ ...serviceForm, is_active: e.target.checked })}
                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                />
                <span className="text-[11px] font-bold text-slate-600">Serviço ativo (disponível para venda)</span>
              </label>

              <div className="pt-2">
                <button type="submit" className="w-full h-10 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl font-bold text-xs uppercase shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center justify-center gap-2 transition-all">
                  <Save size={14} /> Salvar Serviço
                </button>
                {editingServiceId && (
                  <button
                    type="button"
                    onClick={() => { setEditingServiceId(null); setServiceForm({ name: '', description: '', base_price: 0, is_active: true }); }}
                    className="w-full h-8 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase mt-2"
                  >
                    Cancelar Edição
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Listagem */}
          <div className="lg:col-span-8 bg-white/70 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm">
            {/* Toolbar: busca, filtro de status, import/export */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={serviceSearch}
                  onChange={e => setServiceSearch(e.target.value)}
                  placeholder="Pesquisar serviço..."
                  className={`${baseInputStyle} pl-9 pr-8`}
                />
                {serviceSearch && (
                  <button onClick={() => setServiceSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500">
                    <X size={14} />
                  </button>
                )}
              </div>
              <select
                value={serviceStatusFilter}
                onChange={e => setServiceStatusFilter(e.target.value)}
                className={`${baseInputStyle} sm:w-36 cursor-pointer`}
              >
                <option value="all">Todos</option>
                <option value="active">Ativos</option>
                <option value="inactive">Inativos</option>
              </select>
              <div className="flex items-center gap-1.5">
                <button onClick={handleExportServices} title="Exportar XLSX"
                  className="h-9 px-3 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-600 bg-white border border-black/[.085] rounded-lg hover:bg-slate-50 transition-colors">
                  <Download size={14} /> Exportar
                </button>
                <label title="Importar XLSX"
                  className="h-9 px-3 flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-600 bg-white border border-black/[.085] rounded-lg hover:bg-slate-50 transition-colors cursor-pointer">
                  <Upload size={14} /> Importar
                  <input type="file" accept=".xlsx,.xls" onChange={handleImportServices} className="hidden" />
                </label>
              </div>
            </div>

            {/* Barra de seleção em massa + cabeçalho */}
            <div className="flex items-center justify-between gap-2 px-1 pb-2 border-b border-black/[.085]">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={pagedAllSelected} onChange={toggleSelectAllPaged}
                  className="w-4 h-4 rounded accent-indigo-600 cursor-pointer" />
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                  {selectedServiceIds.length > 0 ? `${selectedServiceIds.length} selecionado(s)` : `${filteredServices.length} serviço(s)`}
                </span>
              </label>
              {selectedServiceIds.length > 0 && (
                <button onClick={handleBulkDeleteServices}
                  className="h-7 px-3 flex items-center gap-1.5 text-[10px] font-bold uppercase text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors">
                  <Trash2 size={13} /> Excluir selecionados
                </button>
              )}
            </div>

            <div className="divide-y divide-black/[.055] max-h-[52vh] overflow-y-auto pr-2 custom-scrollbar">
              {filteredServices.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-300"><Briefcase size={22} /></div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{services.length === 0 ? 'Nenhum serviço cadastrado' : 'Nenhum serviço encontrado'}</p>
                </div>
              ) : (
                pagedServices.map(s => {
                  const active = s.is_active !== false;
                  return (
                    <div key={s.id} className="py-3 flex items-center gap-3 group">
                      <input type="checkbox" checked={selectedServiceIds.includes(s.id)} onChange={() => toggleSelectService(s.id)}
                        className="w-4 h-4 rounded accent-indigo-600 cursor-pointer shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-bold text-sm truncate ${active ? 'text-slate-800' : 'text-slate-400 line-through'}`}>{s.name}</h4>
                          <button onClick={() => handleToggleServiceActive(s)} title="Alternar ativo/inativo"
                            className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 transition-colors ${active ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-slate-100 text-slate-400 border-black/[.085] hover:bg-slate-200'}`}>
                            {active ? 'Ativo' : 'Inativo'}
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 font-medium mt-0.5 truncate">{s.description || 'Sem descrição'}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-semibold text-emerald-600 text-sm bg-emerald-50 border border-emerald-100/50 px-3 py-1 rounded-lg">
                          R$ {Number(s.base_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEditService(s)}
                            className="p-1.5 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDeleteService(s.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Paginação */}
            {filteredServices.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 mt-1 border-t border-black/[.085]">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Por página:</span>
                  {[10, 20, 50, 100].map(n => (
                    <button key={n} onClick={() => setServicePageSize(n)}
                      className={`px-2 h-7 rounded-md text-[10px] font-semibold transition-all ${servicePageSize === n ? 'bg-[#0071e3] text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setServicePage(p => Math.max(1, p - 1))} disabled={currentServicePage <= 1}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronUp size={15} className="rotate-[-90deg]" />
                  </button>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                    {currentServicePage} / {serviceTotalPages}
                  </span>
                  <button onClick={() => setServicePage(p => Math.min(serviceTotalPages, p + 1))} disabled={currentServicePage >= serviceTotalPages}
                    className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronDown size={15} className="rotate-[-90deg]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: DOCTORS */}
      {!loading && activeTab === 'doctors' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Seletor Lateral */}
          <div className="lg:col-span-4 bg-white/70 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <UserCheck size={16} /> Profissionais
              </h3>
              {(() => {
                const pend = doctors.filter(d => !doctorCfg[d.id]).length;
                return pend > 0 ? (
                  <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">{pend} sem dados</span>
                ) : doctors.length > 0 ? (
                  <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">Tudo ok</span>
                ) : null;
              })()}
            </div>

            <div className="relative mb-3">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={doctorSearch}
                onChange={e => setDoctorSearch(e.target.value)}
                placeholder="Buscar profissional..."
                className={`${baseInputStyle} h-9 pl-8 text-xs`}
              />
            </div>

            <div className="overflow-y-auto flex-1 custom-scrollbar space-y-1 pr-1 -mx-1">
              {(() => {
                const q = doctorSearch.trim().toLowerCase();
                const list = doctors.filter(d => !q || (d.name || '').toLowerCase().includes(q));
                if (list.length === 0) return (
                  <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-300"><Users size={22} /></div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Nenhum profissional</p>
                  </div>
                );
                return list.map(d => {
                  const active = selectedDoctorId === d.id;
                  const ok = !!doctorCfg[d.id];
                  return (
                    <button
                      key={d.id}
                      onClick={() => { setSelectedDoctorId(d.id); loadDoctorSettings(d.id); }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl transition-all border flex items-center gap-2.5 ${active ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'border-transparent hover:bg-slate-100/80'}`}
                    >
                      <div className={`shrink-0 grid place-items-center h-8 w-8 rounded-lg text-[10px] font-semibold ${monoColor(d.name)}`}>{initialsOf(d.name)}</div>
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-bold truncate ${active ? 'text-indigo-700' : 'text-slate-700'}`}>{d.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[8px] font-semibold uppercase tracking-wide px-1 py-0.5 rounded bg-slate-200/60 text-slate-500">{d.role === 'Administrador' ? 'ADM' : 'MED'}</span>
                          <span className={`inline-flex items-center gap-1 text-[8px] font-semibold uppercase tracking-wide ${ok ? 'text-emerald-600' : 'text-amber-500'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                            {ok ? 'Configurado' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </div>

          {/* Formulário de Configuração */}
          <div className="lg:col-span-8 bg-white/70 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm">
            <h3 className="text-[10px] font-semibold text-[#0071e3] uppercase tracking-widest mb-4 flex items-center gap-2">
              <DollarSign size={16} /> Parâmetros de Rateio & Dados Bancários
            </h3>

            {selectedDoctorId ? (
              <form onSubmit={handleSaveDoctorSettings} className="space-y-4">
                
                {/* Parâmetros do Repasse */}
                <div className="bg-[#f5f5f7] border border-black/[.085] p-4 rounded-2xl">
                  <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <Palette size={14} className="text-[#0071e3]" /> Taxas Administrativas
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Retenção de Taxa Administrativa (%)</label>
                      <div className="relative">
                        <input 
                          type="number" 
                          step="0.01"
                          value={doctorSettingsForm.admin_fee_rate} 
                          onChange={e => setDoctorSettingsForm({ ...doctorSettingsForm, admin_fee_rate: parseFloat(e.target.value) || 0 })} 
                          className={`${baseInputStyle} pr-8`}
                          placeholder="10.00"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">%</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium mt-1 ml-1">Descontada da PJ no cálculo do repasse do profissional.</p>
                    </div>
                  </div>
                </div>

                {/* Dados de Pagamento */}
                <div className="bg-[#f5f5f7] border border-black/[.085] p-4 rounded-2xl">
                  <h4 className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <CreditCard size={14} className="text-emerald-500" /> Informações para Pagamento
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Banco</label>
                      <input 
                        type="text" 
                        value={doctorSettingsForm.bank_name} 
                        onChange={e => setDoctorSettingsForm({ ...doctorSettingsForm, bank_name: e.target.value })} 
                        className={baseInputStyle}
                        placeholder="Ex: Itaú Unibanco"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Agência</label>
                      <input 
                        type="text" 
                        value={doctorSettingsForm.bank_agency} 
                        onChange={e => setDoctorSettingsForm({ ...doctorSettingsForm, bank_agency: e.target.value })} 
                        className={baseInputStyle}
                        placeholder="0001"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Conta Corrente / Poupança</label>
                      <input 
                        type="text" 
                        value={doctorSettingsForm.bank_account} 
                        onChange={e => setDoctorSettingsForm({ ...doctorSettingsForm, bank_account: e.target.value })} 
                        className={baseInputStyle}
                        placeholder="12345-6"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Chave PIX</label>
                      <input 
                        type="text" 
                        value={doctorSettingsForm.pix_key} 
                        onChange={e => setDoctorSettingsForm({ ...doctorSettingsForm, pix_key: e.target.value })} 
                        className={baseInputStyle}
                        placeholder="CPF, CNPJ, Celular, E-mail ou Chave Aleatória"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button type="submit" className="h-10 px-8 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl font-bold text-xs uppercase shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center gap-2 transition-all">
                    <Save size={14} /> Salvar Parâmetros
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center py-12 text-slate-400 text-xs font-bold uppercase">Selecione um médico na lista ao lado para configurar.</div>
            )}
          </div>
        </div>
      )}

      {/* Tab Content: PARTIES (Pagadores / Fornecedores) */}
      {!loading && activeTab === 'parties' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          {/* Formulário */}
          <div className="lg:col-span-4 bg-white/70 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm">
            <h3 className="text-[10px] font-semibold text-[#0071e3] uppercase tracking-widest mb-5 flex items-center gap-2">
              <Plus size={16} /> {editingPartyId ? 'Editar Cadastro' : 'Novo Pagador / Fornecedor'}
            </h3>

            <form onSubmit={handleSaveParty} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Nome</label>
                <input
                  type="text"
                  value={partyForm.name}
                  onChange={e => setPartyForm({ ...partyForm, name: e.target.value })}
                  className={baseInputStyle}
                  placeholder="Ex: UNIMED, Hospital São Lucas, Fornecedor X"
                />
                <p className="text-[10px] text-slate-400 font-medium mt-1 ml-1">Disponível tanto em contas a pagar quanto a receber.</p>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">CNPJ / CPF (Opcional)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={partyForm.document}
                  onChange={e => setPartyForm({ ...partyForm, document: maskDocumento(e.target.value) })}
                  className={baseInputStyle}
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Observações (Opcional)</label>
                <textarea
                  value={partyForm.notes}
                  onChange={e => setPartyForm({ ...partyForm, notes: e.target.value })}
                  className={`${baseInputStyle} h-20 resize-none py-1.5`}
                  placeholder="Contato, condições de pagamento, etc."
                />
              </div>

              <div className="pt-2">
                <button type="submit" className="w-full h-10 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl font-bold text-xs uppercase shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center justify-center gap-2 transition-all">
                  <Save size={14} /> Salvar Cadastro
                </button>
                {editingPartyId && (
                  <button
                    type="button"
                    onClick={() => { setEditingPartyId(null); setPartyForm({ name: '', document: '', notes: '' }); }}
                    className="w-full h-8 text-xs font-bold text-slate-400 hover:text-slate-600 uppercase mt-2"
                  >
                    Cancelar Edição
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Listagem */}
          <div className="lg:col-span-8 bg-white/70 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
                Cadastrados <span className="ml-1 text-slate-400">· {parties.length}</span>
              </h3>
              <div className="relative w-56 max-w-[55%]">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={partySearch}
                  onChange={e => setPartySearch(e.target.value)}
                  placeholder="Buscar por nome ou documento..."
                  className={`${baseInputStyle} h-8 pl-8 text-xs`}
                />
              </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar -mx-1">
              {(() => {
                const q = partySearch.trim().toLowerCase();
                const list = parties.filter(p => !q || (p.name || '').toLowerCase().includes(q) || (p.document || '').toLowerCase().includes(q));
                if (parties.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-300"><Users size={22} /></div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Nenhum pagador/fornecedor</p>
                      <p className="text-[11px] text-slate-400">Cadastre o primeiro no formulário ao lado.</p>
                    </div>
                  );
                }
                if (list.length === 0) {
                  return <div className="text-center py-10 text-xs font-bold text-slate-400 uppercase">Nada encontrado para “{partySearch}”.</div>;
                }
                return list.map(p => (
                  <div key={p.id} className="group flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className={`shrink-0 grid place-items-center h-9 w-9 rounded-xl text-[11px] font-semibold ${monoColor(p.name)}`}>
                      {initialsOf(p.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-bold text-slate-800 text-sm truncate">{p.name}</h4>
                      <p className="text-[11px] font-medium text-slate-400 truncate">
                        {p.document ? <span className="tabular-nums">{maskDocumento(p.document)}</span> : <span className="italic text-slate-300">Sem documento</span>}
                        {p.notes ? <span className="text-slate-400"> · {p.notes}</span> : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => handleEditParty(p)} title="Editar"
                        className="p-1.5 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteParty(p.id)} title="Excluir"
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: CATEGORIES */}
      {!loading && activeTab === 'categories' && (
        <div className="space-y-3">
          {/* Modal do formulário de categoria */}
          {catModalOpen && (
          <div className="fixed inset-0 z-[11100] flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={() => { setCatModalOpen(false); resetCategoryForm(); }}></div>
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-black/[.06] bg-white shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-black/[.06] flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                <FolderPlus size={16} className="text-[#0071e3]" /> {editingCategoryId ? 'Editar Categoria' : 'Nova Categoria DRE'}
              </h3>
              <button type="button" onClick={() => { setCatModalOpen(false); resetCategoryForm(); }} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 hover:bg-rose-50 rounded-xl transition-colors"><X size={18} /></button>
            </div>
            <form onSubmit={handleSaveCategory} className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Nome da Categoria</label>
                <input 
                  type="text" 
                  value={categoryForm.name} 
                  onChange={e => setCategoryForm({ ...categoryForm, name: e.target.value })} 
                  className={baseInputStyle}
                  placeholder="Ex: Consultoria Externa"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Tipo</label>
                <select 
                  value={categoryForm.type} 
                  onChange={e => setCategoryForm({ ...categoryForm, type: e.target.value })} 
                  className={`${baseInputStyle} cursor-pointer`}
                >
                  <option value="ENTRADA">RECEITA (ENTRADA)</option>
                  <option value="SAIDA">DESPESA (SAÍDA)</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Categoria Pai (opcional — vira subcategoria)</label>
                <select
                  value={categoryForm.parent_id}
                  onChange={e => setCategoryForm({ ...categoryForm, parent_id: e.target.value })}
                  className={`${baseInputStyle} cursor-pointer`}
                >
                  <option value="">Nenhuma (categoria principal)</option>
                  {(() => {
                    const blocked = new Set();
                    if (editingCategoryId) { blocked.add(editingCategoryId); descendantIds(editingCategoryId).forEach(id => blocked.add(id)); }
                    return flattenForSelect().filter(({ cat }) => !blocked.has(cat.id)).map(({ cat, depth }) => (
                      <option key={cat.id} value={cat.id}>{`${'   '.repeat(depth)}${depth > 0 ? '└ ' : ''}${cat.name}`}</option>
                    ));
                  })()}
                </select>
              </div>

              {/* Entra no resultado do DRE? Desligar p/ itens não-operacionais (ex.: Amortização de Empréstimo). */}
              <div className="rounded-xl border border-black/[.085] bg-[#f5f5f7] p-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                  <span>
                    <span className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Entra no resultado (DRE)</span>
                    <span className="block text-[10px] font-medium text-slate-400 mt-0.5 leading-snug">
                      Desligue para itens <b>não-operacionais</b> (amortização de principal, aportes, empréstimos): contam no caixa, mas ficam <b>fora</b> do Resultado Líquido.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={categoryForm.in_result !== false}
                    onChange={e => setCategoryForm({ ...categoryForm, in_result: e.target.checked })}
                    className="h-4 w-4 accent-indigo-600 cursor-pointer shrink-0"
                  />
                </label>
              </div>

              {/* Gera caixa? Desligue p/ COMPETÊNCIA PURA (ex.: 3.7 Depreciação): conta no DRE, R$ 0,00 no Fluxo de Caixa. */}
              <div className="rounded-xl border border-black/[.085] bg-[#f5f5f7] p-3">
                <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                  <span>
                    <span className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Gera caixa (Fluxo de Caixa)</span>
                    <span className="block text-[10px] font-medium text-slate-400 mt-0.5 leading-snug">
                      Desligue para <b>competência pura</b> (depreciação, amortização contábil de ativos): conta no DRE como despesa, mas vale <b>R$ 0,00</b> no Fluxo de Caixa (não há saída física de dinheiro).
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={categoryForm.in_cash_flow !== false}
                    onChange={e => setCategoryForm({ ...categoryForm, in_cash_flow: e.target.checked })}
                    className="h-4 w-4 accent-indigo-600 cursor-pointer shrink-0"
                  />
                </label>
              </div>

              {/* Imposto sobre o lucro (IRPJ/CSLL): posicionado no DRE após o LAIR, antes do Lucro Líquido. Só faz sentido p/ SAÍDA. */}
              {categoryForm.type === 'SAIDA' && (
                <div className="rounded-xl border border-black/[.085] bg-[#f5f5f7] p-3">
                  <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
                    <span>
                      <span className="block text-[11px] font-semibold text-slate-700 uppercase tracking-wide">Imposto sobre o lucro (IRPJ/CSLL)</span>
                      <span className="block text-[10px] font-medium text-slate-400 mt-0.5 leading-snug">
                        Ligue para <b>IRPJ e CSLL</b>. No DRE sai da cascata operacional e é subtraído <b>no final</b>, logo após o Lucro Antes dos Impostos (LAIR), imediatamente antes do Lucro Líquido. Não é dedução de faturamento (2.1).
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={categoryForm.is_profit_tax === true}
                      onChange={e => setCategoryForm({ ...categoryForm, is_profit_tax: e.target.checked })}
                      className="h-4 w-4 accent-indigo-600 cursor-pointer shrink-0"
                    />
                  </label>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Cor</label>
                <div className="flex flex-wrap gap-1.5 items-center">
                  {CATEGORY_COLORS.map(col => (
                    <button key={col} type="button" title={col} onClick={() => setCategoryForm({ ...categoryForm, color: col })}
                      className={`w-6 h-6 rounded-lg transition-transform ${categoryForm.color === col ? 'ring-2 ring-offset-1 ring-slate-700 scale-110' : 'hover:scale-110'}`}
                      style={{ backgroundColor: col }} />
                  ))}
                  <label className="w-6 h-6 rounded-lg border border-dashed border-slate-300 grid place-items-center cursor-pointer hover:border-indigo-400 relative overflow-hidden" title="Cor personalizada">
                    <Palette size={12} className="text-slate-400" />
                    <input type="color" value={categoryForm.color} onChange={e => setCategoryForm({ ...categoryForm, color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
                  </label>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Ícone</label>
                <div className="grid grid-cols-7 gap-1.5">
                  {CATEGORY_ICONS.map(({ key, Comp, label }) => (
                    <button key={key} type="button" title={label} onClick={() => setCategoryForm({ ...categoryForm, icon: key })}
                      className={`h-9 rounded-lg grid place-items-center transition-all ${categoryForm.icon === key ? 'bg-[#0071e3] text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                      <Comp size={15} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-1 flex gap-2">
                <button type="button" onClick={() => { setCatModalOpen(false); resetCategoryForm(); }}
                  className="flex-1 h-10 rounded-xl text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                <button type="submit" className="flex-[2] h-10 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl font-bold text-xs uppercase shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center justify-center gap-2 transition-all">
                  <Save size={14} /> {editingCategoryId ? 'Salvar Alterações' : 'Criar Categoria'}
                </button>
              </div>
            </form>
            </div>
          </div>
          )}

          {/* Listagem (largura total) */}
          <div className="bg-white/70 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Estrutura de Categorias (DRE)</h3>
                <p className="text-[10px] font-medium text-slate-400">Setas reordenam · <span className="text-[#0071e3]">+</span> cria subcategoria · lápis edita.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={expandAll} title="Expandir tudo"
                  className="flex items-center gap-1 h-8 px-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                  <ListTree size={12} /> Expandir
                </button>
                <button type="button" onClick={collapseAll} title="Recolher tudo"
                  className="flex items-center gap-1 h-8 px-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                  <FolderTree size={12} /> Recolher
                </button>
                <button type="button" onClick={() => { resetCategoryForm(); setCatModalOpen(true); }}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[10px] font-semibold uppercase tracking-wide text-white bg-[#0071e3] hover:bg-[#0077ed] shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] transition-colors">
                  <Plus size={14} /> Nova Categoria
                </button>
              </div>
            </div>

            <div className="max-h-[62vh] overflow-y-auto pr-2 custom-scrollbar">
              {categories.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-300"><FolderTree size={22} /></div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Nenhuma categoria cadastrada</p>
                  <button type="button" onClick={() => { resetCategoryForm(); setCatModalOpen(true); }}
                    className="mt-1 text-[11px] font-semibold text-[#0071e3] hover:text-indigo-700 uppercase tracking-wide">+ Criar primeira categoria</button>
                </div>
              ) : (
                childrenOf(null).map((c, i) => renderCategoryNode(c, 0, childrenOf(null), i))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content: CENTROS DE CUSTO */}
      {!loading && activeTab === 'costcenters' && (
        <div className="bg-white/70 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Centros de Custo</h3>
              <p className="text-[10px] font-medium text-slate-400">Dimensão obrigatória dos lançamentos · <span className="text-[#0071e3]">+</span> cria subcentro · lápis edita.</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button type="button" onClick={expandAllCc} title="Expandir tudo"
                className="flex items-center gap-1 h-8 px-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                <ListTree size={12} /> Expandir
              </button>
              <button type="button" onClick={collapseAllCc} title="Recolher tudo"
                className="flex items-center gap-1 h-8 px-2.5 rounded-lg text-[9px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                <FolderTree size={12} /> Recolher
              </button>
              <button type="button" onClick={() => { resetCcForm(); setCcModalOpen(true); }}
                className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[10px] font-semibold uppercase tracking-wide text-white bg-[#0071e3] hover:bg-[#0077ed] shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] transition-colors">
                <Plus size={14} /> Novo Centro
              </button>
            </div>
          </div>

          <div className="max-h-[66vh] overflow-y-auto pr-2 custom-scrollbar">
            {costCenters.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-300"><FolderTree size={22} /></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Nenhum centro de custo</p>
                <button type="button" onClick={() => { resetCcForm(); setCcModalOpen(true); }}
                  className="mt-1 text-[11px] font-semibold text-[#0071e3] hover:text-indigo-700 uppercase tracking-wide">+ Criar primeiro centro</button>
              </div>
            ) : (
              ccChildrenOf(null).map((c, i) => renderCcNode(c, 0, ccChildrenOf(null), i))
            )}
          </div>

          {/* Modal do formulário de centro de custo */}
          {ccModalOpen && (
            <div className="fixed inset-0 z-[11100] flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={() => { setCcModalOpen(false); resetCcForm(); }}></div>
              <div className="relative z-10 w-full max-w-md rounded-2xl border border-black/[.06] bg-white shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-black/[.06] flex items-center justify-between shrink-0">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
                    <FolderPlus size={16} className="text-[#0071e3]" /> {editingCcId ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
                  </h3>
                  <button type="button" onClick={() => { setCcModalOpen(false); resetCcForm(); }}
                    className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 hover:bg-rose-50 rounded-xl transition-colors"><X size={18} /></button>
                </div>
                <form onSubmit={handleSaveCc} className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Nome do Centro</label>
                    <input type="text" autoFocus value={ccForm.name}
                      onChange={e => setCcForm({ ...ccForm, name: e.target.value })}
                      className={baseInputStyle} placeholder="Ex: Centro Cirúrgico, Administrativo, Unidade X" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Sigla / Código (opcional)</label>
                    <input type="text" value={ccForm.code}
                      onChange={e => setCcForm({ ...ccForm, code: e.target.value })}
                      className={baseInputStyle} placeholder="Ex: CC-ADM" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Centro Pai (opcional — vira subcentro)</label>
                    <select value={ccForm.parent_id} onChange={e => setCcForm({ ...ccForm, parent_id: e.target.value })} className={`${baseInputStyle} cursor-pointer`}>
                      <option value="">Nenhum (centro principal)</option>
                      {(() => {
                        const blocked = new Set();
                        if (editingCcId) { blocked.add(editingCcId); ccDescendantIds(editingCcId).forEach(id => blocked.add(id)); }
                        return ccFlattenForSelect().filter(({ cc }) => !blocked.has(cc.id)).map(({ cc, depth }) => (
                          <option key={cc.id} value={cc.id}>{`${'   '.repeat(depth)}${depth > 0 ? '└ ' : ''}${cc.name}`}</option>
                        ));
                      })()}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Cor</label>
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {CATEGORY_COLORS.map(col => (
                        <button key={col} type="button" title={col} onClick={() => setCcForm({ ...ccForm, color: col })}
                          className={`w-6 h-6 rounded-lg transition-transform ${ccForm.color === col ? 'ring-2 ring-offset-1 ring-slate-700 scale-110' : 'hover:scale-110'}`}
                          style={{ backgroundColor: col }} />
                      ))}
                      <label className="w-6 h-6 rounded-lg border border-dashed border-slate-300 grid place-items-center cursor-pointer hover:border-indigo-400 relative overflow-hidden" title="Cor personalizada">
                        <Palette size={12} className="text-slate-400" />
                        <input type="color" value={ccForm.color} onChange={e => setCcForm({ ...ccForm, color: e.target.value })} className="absolute inset-0 opacity-0 cursor-pointer" />
                      </label>
                    </div>
                  </div>
                  <div className="pt-1 flex gap-2">
                    <button type="button" onClick={() => { setCcModalOpen(false); resetCcForm(); }}
                      className="flex-1 h-10 rounded-xl text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                    <button type="submit" className="flex-[2] h-10 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl font-bold text-xs uppercase shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center justify-center gap-2 transition-all">
                      <Save size={14} /> {editingCcId ? 'Salvar Alterações' : 'Criar Centro'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab Content: CONTAS BANCÁRIAS */}
      {!loading && activeTab === 'bankaccounts' && (
        <div className="bg-white/70 backdrop-blur-lg border border-black/[.085] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-1">Contas Bancárias</h3>
              <p className="text-[10px] font-medium text-slate-400">Caixas e contas usadas nos lançamentos e conciliação.</p>
            </div>
            <button type="button" onClick={() => { resetAccForm(); setAccModalOpen(true); }}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-[10px] font-semibold uppercase tracking-wide text-white bg-[#0071e3] hover:bg-[#0077ed] shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] transition-colors">
              <Plus size={14} /> Nova Conta
            </button>
          </div>

          <div className="max-h-[66vh] overflow-y-auto pr-1 custom-scrollbar">
            {bankAccounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
                <div className="w-12 h-12 rounded-2xl bg-slate-100 grid place-items-center text-slate-300"><CreditCard size={22} /></div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Nenhuma conta cadastrada</p>
              </div>
            ) : bankAccounts.map(a => {
              const bal = parseFloat(a.current_balance || 0);
              return (
                <div key={a.id} className="group flex items-center gap-3 px-2 py-2.5 rounded-xl hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0">
                  <div className="shrink-0 grid place-items-center h-9 w-9 rounded-xl bg-indigo-50 text-[#0071e3]"><CreditCard size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-slate-800 text-sm truncate">{a.name}</h4>
                    <p className="text-[11px] font-medium text-slate-400 truncate">
                      {a.bank_name || 'Sem banco'}{a.agency ? ` · Ag ${a.agency}` : ''}{a.account_number ? ` · Cc ${a.account_number}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`text-sm font-semibold tabular-nums block ${bal < 0 ? 'text-rose-600' : 'text-slate-700'}`}>{fmtBRL(bal)}</span>
                    {parseFloat(a.overdraft_limit || 0) > 0 && (
                      <span className="text-[9px] font-bold text-slate-400 tabular-nums block">c/ limite {fmtBRL(bal + parseFloat(a.overdraft_limit))}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button type="button" title="Editar" onClick={() => handleEditAccount(a)}
                      className="p-1.5 text-slate-400 hover:text-[#0071e3] hover:bg-indigo-50 rounded-lg transition-colors"><Edit2 size={14} /></button>
                    <button type="button" title="Excluir" onClick={() => handleDeleteAccount(a.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal Conta */}
          {accModalOpen && (
            <div className="fixed inset-0 z-[11100] flex items-center justify-center p-4">
              <div className="fixed inset-0 bg-black/25 backdrop-blur-sm animate-in fade-in" onClick={() => { setAccModalOpen(false); resetAccForm(); }}></div>
              <div className="relative z-10 w-full max-w-md rounded-2xl border border-black/[.06] bg-white shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-black/[.06] flex items-center justify-between shrink-0">
                  <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2"><CreditCard size={16} className="text-[#0071e3]" /> {editingAccId ? 'Editar Conta' : 'Nova Conta Bancária'}</h3>
                  <button type="button" onClick={() => { setAccModalOpen(false); resetAccForm(); }} className="p-2 text-slate-400 hover:text-rose-500 bg-slate-50 hover:bg-rose-50 rounded-xl transition-colors"><X size={18} /></button>
                </div>
                <form onSubmit={handleSaveAccount} className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Nome da Conta / Caixa</label>
                    <input type="text" autoFocus value={accForm.name} onChange={e => setAccForm({ ...accForm, name: e.target.value })} className={baseInputStyle} placeholder="Ex: Caixa Interno, Itaú Corrente PJ" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Banco</label>
                    <input type="text" value={accForm.bank_name} onChange={e => setAccForm({ ...accForm, bank_name: e.target.value })} className={baseInputStyle} placeholder="Ex: Itaú Unibanco" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Agência</label>
                      <input type="text" value={accForm.agency} onChange={e => setAccForm({ ...accForm, agency: e.target.value })} className={baseInputStyle} placeholder="0001" />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Conta</label>
                      <input type="text" value={accForm.account_number} onChange={e => setAccForm({ ...accForm, account_number: e.target.value })} className={baseInputStyle} placeholder="12345-6" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Saldo Inicial (R$)</label>
                      <CurrencyInput value={accForm.initial_balance} onChange={v => setAccForm({ ...accForm, initial_balance: v })} className={baseInputStyle} />
                      {editingAccId && <p className="text-[9px] text-slate-400 mt-1 ml-1">Alterar aqui ajusta o saldo atual pela mesma diferença.</p>}
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Data do Saldo</label>
                      <input type="date" value={accForm.initial_balance_date} onChange={e => setAccForm({ ...accForm, initial_balance_date: e.target.value })} className={baseInputStyle} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 mb-1 block">Limite de Cheque Especial (R$)</label>
                    <CurrencyInput value={accForm.overdraft_limit} onChange={v => setAccForm({ ...accForm, overdraft_limit: v })} className={baseInputStyle} />
                    <p className="text-[9px] text-slate-400 mt-1 ml-1">Se maior que zero, a tela de contas mostra também o disponível (saldo + limite).</p>
                  </div>
                  <div className="pt-1 flex gap-2">
                    <button type="button" onClick={() => { setAccModalOpen(false); resetAccForm(); }} className="flex-1 h-10 rounded-xl text-xs font-bold uppercase text-slate-500 hover:bg-slate-100 transition-colors">Cancelar</button>
                    <button type="submit" className="flex-[2] h-10 bg-[#0071e3] hover:bg-[#0077ed] text-white rounded-xl font-bold text-xs uppercase shadow-md shadow-[0_1px_2px_rgba(0,113,227,.35)] flex items-center justify-center gap-2 transition-all"><Save size={14} /> {editingAccId ? 'Salvar' : 'Criar Conta'}</button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmState}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        tone={confirmState?.tone || 'danger'}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
    </div>
  );
}
