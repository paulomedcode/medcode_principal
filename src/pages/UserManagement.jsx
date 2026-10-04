import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase, urlRedefinirSenha } from '../services/supabase';
import { createClient } from '@supabase/supabase-js';
import {
    Edit2, Trash2, Loader2, X, KeyRound, UserPlus,
    Shield, Check, Shuffle, AlertTriangle, Lock, Edit, LayoutGrid, CheckSquare, Settings,
    Minus, ChevronDown, ChevronRight, Search
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { usePermission } from '../contexts/PermissionContext';
import { maskTelefone } from '../utils/masks';
import { logAction } from '../utils/logger';
import { ROLES, PERMISSION_MODULES, EXTRA_MODULES, ADMIN_KEY } from '../config/permissions';
import PermissionBlocks from '../components/permissions/PermissionBlocks';

// Cargo com Acesso Total libera tudo — o painel de extras precisa refletir isso.
// Menos os módulos PESSOAIS (Meus Repasses): o coringa não abre esses, então
// eles continuam concedíveis individualmente. Marcá-los como herdados aqui faria
// a tela mentir e travar o único jeito de dar a chave a alguém.
const ALL_PERMISSIONS_TRUE = Object.fromEntries(
    PERMISSION_MODULES.filter(m => !m.pessoal).flatMap(m => m.permissions.map(p => [p.id, true]))
);

// --- PERMISSÕES INDIVIDUAIS (EXTRAS) ---
// Exceções concedidas a UM usuário, somando ao que o cargo libera. O valor salvo
// continua um mapa plano { [id]: bool } em permissoes_extras — o que mudou é que
// a lista de permissões agora vem do catálogo (src/config/permissions.js), a
// mesma que alimenta a matriz de perfis, e não de uma cópia à parte que
// divergia dela.
const ExtraPermissionsSelection = ({ value = {}, onChange, role }) => {
    const { permissionsMatrix, recarregarPermissoes } = usePermission();

    // Relê a matriz ao abrir: o que manda aqui é o que está salvo no cargo agora,
    // não o que foi lido quando o app abriu. Sem isto, mexer nas permissões de
    // grupo e vir conferir no usuário mostrava a matriz antiga — permissão
    // aparecia como "já vem do Perfil", travada, sem estar mais no cargo.
    useEffect(() => { recarregarPermissoes?.(); }, [recarregarPermissoes]);

    // O que o cargo já dá aparece marcado e travado: extra não tira acesso.
    const doCargo = permissionsMatrix?.[role] || {};
    const activeCount = Object.values(value || {}).filter(Boolean).length;

    return (
        <div className="mt-4 p-4 border border-purple-100 bg-purple-50/50 rounded-2xl space-y-4">
            <div>
                <h4 className="text-[11px] font-black text-purple-600 uppercase tracking-wide flex items-center gap-1.5">
                    <Shield size={14} /> Permissões Individuais (Extras){activeCount > 0 && <span className="text-purple-400">· {activeCount}</span>}
                </h4>
                <p className="text-[10px] text-slate-500 font-medium mt-1">
                    Liberadas apenas para ESTE usuário, <b>somando</b> ao que o perfil <b>{role}</b> já concede (nunca tiram acesso).
                    O que já vem do perfil aparece travado. Clique num bloco para abrir as permissões dele.
                </p>
            </div>
            <PermissionBlocks
                modules={EXTRA_MODULES}
                values={value}
                inherited={doCargo[ADMIN_KEY] ? ALL_PERMISSIONS_TRUE : doCargo}
                onChange={onChange}
                emptyHint="Escolha um bloco para liberar exceções"
            />
            {doCargo[ADMIN_KEY] && (
                <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                    O perfil <b>{role}</b> tem <b>Acesso Total (Admin)</b>: este usuário já pode tudo, e nenhum extra
                    muda nada — exceto os módulos pessoais (Meus Repasses), que nenhum coringa abre e continuam
                    liberáveis aqui. Para restringi-lo, mude o perfil dele ou tire o Acesso Total na Matriz de Permissões.
                </p>
            )}
        </div>
    );
};

// 1. Instância Secundária do Supabase Declarativa (Evita Multi-Instances Warnings)
const secondarySupabase = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY,
    { auth: { storageKey: 'auth-manager-secondary', persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const PROTECTED_EMAILS = [];

// --- MATRIZ DE PERMISSÕES (por perfil) ---
// Um perfil por vez, e os módulos desenhados como os blocos da tela inicial:
// o que o administrador liga aqui é literalmente o bloco que o usuário vai ver.
// A lista de módulos e permissões vem de src/config/permissions.js.
const PermissionsModal = ({ onClose }) => {
    const { recarregarPermissoes } = usePermission();
    const availableRoles = ROLES.filter(p => !['desenvolvedor', 'developer'].includes(p.toLowerCase()));
    const [permissions, setPermissions] = useState({});
    const [role, setRole] = useState(availableRoles[0]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [sujo, setSujo] = useState(false);

    useEffect(() => {
        const loadPermissions = async () => {
            try {
                const { data: permData } = await supabase.from('settings').select('data').eq('id', 'permissions').maybeSingle();
                if (permData && permData.data) setPermissions(permData.data);
            } catch (error) {
                console.error(error);
                toast.error("Erro ao carregar permissões");
            } finally {
                setLoading(false);
            }
        };
        loadPermissions();
    }, []);

    const doPerfil = permissions[role] || {};
    const temAcessoTotal = !!doPerfil[ADMIN_KEY];

    const aplicar = (proximo) => {
        setPermissions(prev => ({ ...prev, [role]: proximo }));
        setSujo(true);
    };

    // Quantos módulos este perfil abre — mostrado na aba do perfil.
    const contarModulos = (r) => {
        const p = permissions[r] || {};
        // Acesso Total abre todos, menos os pessoais — esses só com a chave.
        if (p[ADMIN_KEY]) return PERMISSION_MODULES.filter(m => !m.pessoal || p[m.accessKey]).length;
        return PERMISSION_MODULES.filter(m => p[m.accessKey]).length;
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await supabase.from('settings').upsert({ id: 'permissions', data: permissions });
            if (error) throw error;
            // A tela de permissões individuais e o resto do sistema leem a matriz
            // do contexto: sem reler aqui, continuariam com a versão antiga até
            // alguém recarregar a página.
            await recarregarPermissoes?.();
            await logAction('ALTERAÇÃO DE PERMISSÕES', `Permissões gerais de papéis foram atualizadas no gerenciamento.`);
            toast.success("Permissões salvas!");
            onClose();
        } catch (error) {
            toast.error("Erro ao salvar.");
        } finally {
            setSaving(false);
        }
    };

    const fechar = () => {
        if (sujo && !window.confirm('Há alterações não salvas. Fechar mesmo assim?')) return;
        onClose();
    };

    return createPortal(
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[10000] overflow-y-auto p-3 sm:p-4 flex">
            <div className="m-auto bg-white/95 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/60 max-w-5xl w-full h-[86vh] flex flex-col overflow-hidden">
                {/* Cabeçalho */}
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-white/70 backdrop-blur-md shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white flex items-center justify-center shadow-lg shadow-purple-500/25">
                            <Shield size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-slate-900 leading-tight">Matriz de Permissões</h2>
                            <p className="text-[11px] text-slate-500 font-bold">Ligue os blocos que cada perfil enxerga — e abra um bloco para afinar o que se faz dentro dele</p>
                        </div>
                    </div>
                    <button onClick={fechar} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                        <X size={20} className="text-slate-400" />
                    </button>
                </div>

                {/* Abas de perfil */}
                <div className="px-5 pt-3 pb-2 border-b border-slate-100 bg-white/60 shrink-0 overflow-x-auto custom-scrollbar">
                    <div className="flex gap-1.5 min-w-max">
                        {availableRoles.map(r => {
                            const ativo = r === role;
                            const n = contarModulos(r);
                            return (
                                <button
                                    key={r}
                                    onClick={() => setRole(r)}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
                                        ativo
                                            ? 'bg-slate-900 text-white shadow-md'
                                            : 'text-slate-500 hover:bg-slate-100'
                                    }`}
                                >
                                    {r}
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md ${
                                        ativo ? 'bg-white/20 text-white' : n > 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                                    }`}>
                                        {n}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Blocos */}
                <div className="flex-1 overflow-auto p-5 custom-scrollbar">
                    {loading ? (
                        <div className="flex justify-center items-center h-full"><Loader2 className="animate-spin text-purple-600" /></div>
                    ) : (
                        <>
                            {temAcessoTotal && (
                                <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200">
                                    <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
                                    <p className="text-[11px] font-bold text-amber-800 leading-snug">
                                        <b>{role}</b> está com <b>Acesso Total (Admin)</b>: ele entra em tudo, marcado ou não.
                                        Desligue o bloco <b>Administração Geral</b> para que os blocos abaixo passem a valer.
                                    </p>
                                </div>
                            )}
                            <PermissionBlocks
                                modules={PERMISSION_MODULES}
                                values={doPerfil}
                                onChange={aplicar}
                                emptyHint="Clique num bloco para ver as permissões dele"
                            />
                        </>
                    )}
                </div>

                {/* Rodapé */}
                <div className="px-5 py-3.5 border-t border-slate-100 bg-white/70 flex justify-between items-center gap-3 backdrop-blur-md shrink-0">
                    <p className="text-[10px] font-bold text-slate-400 hidden sm:block">
                        Alterações valem para todos os usuários do perfil <b className="text-slate-600">{role}</b>
                    </p>
                    <div className="flex gap-2">
                        <button onClick={fechar} className="px-5 py-2.5 text-slate-500 font-bold text-sm hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-6 py-2.5 bg-slate-900 text-white font-bold text-sm rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-2"
                        >
                            {saving && <Loader2 size={16} className="animate-spin" />}
                            Salvar Alterações
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- USER CREATION MODAL ---
const UserCreationModal = ({ onClose, onSave }) => {
    const { currentUser } = useAuth();
    const { hasPermission, permissionsMatrix } = usePermission();
    // Cadastrar pessoa e distribuir acesso são coisas diferentes, mas dizer se
    // alguém é médico ou assistente faz parte do cadastro: quem cadastra
    // escolhe o perfil. O que continua reservado a quem cuida das permissões é
    // criar gente que administra acesso — senão bastava criar um perfil com
    // 'Acesso Total' e entrar com a senha que a própria pessoa acabou de definir.
    const podeGerenciarPermissoes = hasPermission('Gerenciar Permissões') || hasPermission('Acesso Total (Admin)');
    const cargoAdministraAcesso = (cargo) => {
        if (cargo === 'Desenvolvedor') return true;
        const doCargo = permissionsMatrix?.[cargo] || {};
        return !!(doCargo['Acesso Total (Admin)'] || doCargo['Gerenciar Permissões']);
    };
    const availableRoles = ROLES
        .filter(r => r !== 'Desenvolvedor' || currentUser?.role === 'Desenvolvedor')
        .filter(r => podeGerenciarPermissoes || !cargoAdministraAcesso(r));
    const cargosOcultos = !podeGerenciarPermissoes && ROLES.some(r => r !== 'Desenvolvedor' && cargoAdministraAcesso(r));
    const [formData, setFormData] = useState({
        name: '', email: '', password: '', role: 'Visualizador',
        sexo: '', telefone: '', categoria_agenda_id: '', permissoes_extras: {}
    });
    const [categoriasAgenda, setCategoriasAgenda] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        supabase.from('agenda_categorias').select('*').order('nome').then(({data}) => setCategoriasAgenda(data || []));
    }, []);

    const handleCreate = async () => {
        if (!formData.name || !formData.email || !formData.password) return toast.error("Preencha todos os campos");

        setLoading(true);

        try {
            // 2. Create User in Auth via REST Fetch API for a specific isolation bypass
            const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/auth/v1/signup`, {
                method: 'POST',
                headers: {
                    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email: formData.email, password: formData.password })
            });

            if (!response.ok) {
                const errData = await response.json();
                const bruto = String(errData.msg || errData.message || errData.error_description || '');
                // As mensagens do Supabase chegam em inglês e cru; quem cadastra
                // precisa entender o que fazer sem abrir o console.
                const traduzida =
                    /password should be at least (\d+)/i.test(bruto) ? `A senha provisória é curta demais: use pelo menos ${bruto.match(/at least (\d+)/i)[1]} caracteres (o botão do dado gera uma válida).` :
                    /signups? not allowed|signup is disabled/i.test(bruto) ? 'O cadastro de novas contas está desligado no Supabase (Authentication > Providers).' :
                    /rate limit/i.test(bruto) ? 'Muitas tentativas seguidas. Espere alguns minutos e tente de novo.' :
                    /invalid.*email|unable to validate email/i.test(bruto) ? 'E-mail inválido. Confira o endereço digitado.' :
                    '';
                if (traduzida) throw new Error(traduzida);
                if (errData.msg === 'User already registered' || errData.message === 'User already registered') {
                    throw new Error("Este email já está cadastrado no sistema (Supabase Auth). Se você deletou este usuário recentemente, você precisa ir no painel do Supabase > Authentication > Users e deletá-lo lá também antes de recriar com o mesmo email.");
                }
                throw new Error(errData.msg || errData.message || "Erro ao criar credenciais.");
            }

            const data = await response.json();
            const uid = data?.id || data?.user?.id;

            if (!uid) throw new Error("Não foi possível gerar um ID de usuário na nuvem.");

            // 3. Create User in Table
            const userData = {
                name: formData.name,
                email: formData.email,
                role: formData.role,
                sexo: formData.sexo || '',
                status: 'Ativo',
                createdAt: new Date().toISOString()
            };
            userData.telefone = formData.telefone || '';
            userData.categoria_agenda_id = formData.categoria_agenda_id || null;
            userData.permissoes_extras = formData.permissoes_extras || {};

            const { error: insertError } = await supabase.from('users').insert([{ id: uid, ...userData }]);
            if (insertError) throw new Error(`A conta de acesso foi criada, mas o cadastro não salvou: ${insertError.message}`);

            // Auditoria
            await logAction('CRIAÇÃO DE USUÁRIO', `USUÁRIO ${formData.email} CRIADO COM PERFIL ${formData.role}.`);

            // 4. Cleanup
            toast.success("Usuário criado com sucesso!");
            onSave();
            onClose();

        } catch (error) {
            console.error(error);
            toast.error("Erro ao criar usuário: " + (error.message || error));
        } finally {
            setLoading(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[10000] overflow-y-auto p-4 flex">
            <div className="m-auto bg-white/95 backdrop-blur-2xl rounded-2xl shadow-2xl border border-white/60 max-w-2xl w-full p-8 relative">
                <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-500 hover:text-slate-600 hover:bg-white/70 rounded-lg transition-all"><X size={20} /></button>

                <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest mb-1">Novo Usuário</h2>
                <p className="text-xs text-slate-500 mb-6">Preencha os dados para criar um novo acesso.</p>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Nome Completo</label>
                            <input
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-sm text-slate-900 font-semibold outline-none focus:border-blue-500"
                                placeholder="Ex: Dr. João Silva"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Email Corporativo</label>
                            <input
                                value={formData.email}
                                onChange={e => setFormData({ ...formData, email: e.target.value })}
                                className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-sm text-slate-900 font-semibold outline-none focus:border-blue-500"
                                placeholder="usuario@hospital.com.br"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Senha Provisória</label>
                            <div className="flex gap-2">
                                <input
                                    value={formData.password}
                                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                                    type="text"
                                    className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-sm text-slate-900 font-semibold outline-none focus:border-blue-500 font-mono"
                                    placeholder="******"
                                />
                                <button onClick={() => setFormData({ ...formData, password: Math.random().toString(36).slice(-8) })} className="p-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg hover:bg-white/80 text-slate-500" title="Gerar Senha"><Shuffle size={18} /></button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Perfil de Acesso</label>
                            <select
                                value={formData.role}
                                onChange={e => setFormData({ ...formData, role: e.target.value })}
                                className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-sm text-slate-900 font-semibold outline-none focus:border-blue-500 transition-all"
                            >
                                {availableRoles.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>
                            {cargosOcultos && <p className="mt-1 text-[10px] font-bold text-slate-400">Perfis que administram permissões só aparecem para quem cuida das permissões.</p>}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Equipe</label>
                            <select
                                value={formData.categoria_agenda_id || ''}
                                onChange={e => setFormData({ ...formData, categoria_agenda_id: e.target.value || null })}
                                className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-sm text-slate-900 font-semibold outline-none focus:border-blue-500"
                            >
                                <option value="">Geral (toda a equipe)</option>
                                {categoriasAgenda.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Gênero</label>
                            <select
                                value={formData.sexo}
                                onChange={e => setFormData({ ...formData, sexo: e.target.value })}
                                className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-sm text-slate-900 font-semibold outline-none focus:border-blue-500"
                            >
                                <option value="">Selecione...</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Feminino">Feminino</option>
                            </select>
                        </div>
                    </div>

                    {/* Telefone é campo base de TODOS os usuários (não só médicos) */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Telefone (Celular)</label>
                        <input
                            value={formData.telefone}
                            onChange={e => setFormData({ ...formData, telefone: maskTelefone(e.target.value) })}
                            className="w-full px-3 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-lg text-sm text-slate-900 font-semibold outline-none focus:border-blue-500"
                            placeholder="Ex: (11) 99999-9999"
                            maxLength="15"
                        />
                    </div>

                    
                    {podeGerenciarPermissoes && (
                        <ExtraPermissionsSelection role={formData.role} value={formData.permissoes_extras} onChange={(v) => setFormData({ ...formData, permissoes_extras: v })} />
                    )}

                </div>

                <div className="flex gap-3 mt-8">
                    <button onClick={onClose} className="flex-1 py-3 text-slate-500 font-bold text-sm hover:bg-white/60 rounded-lg">Cancelar</button>
                    <button
                        onClick={handleCreate}
                        disabled={loading}
                        className="flex-1 py-3 bg-blue-600 text-white font-bold text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2"
                    >
                        {loading ? <Loader2 className="animate-spin" size={18} /> : <><UserPlus size={18} /> Criar Usuário</>}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- USER EDIT MODAL ---
const UserEditModal = ({ user, onClose, onSave }) => {
    const { currentUser } = useAuth();
    const { hasPermission } = usePermission();
    const podeGerenciarPermissoes = hasPermission('Gerenciar Permissões') || hasPermission('Acesso Total (Admin)');
    const availableRoles = ROLES.filter(r => r !== 'Desenvolvedor' || currentUser?.role === 'Desenvolvedor');
    const [formData, setFormData] = useState({
        name: user.name || '',
        role: user.role || 'Visualizador',
        status: user.status || 'Ativo',
        sexo: user.sexo || '',
        telefone: user.telefone || '',
        categoria_agenda_id: user.categoria_agenda_id || '',
        permissoes_extras: user.permissoes_extras || {}
    });
    const [categoriasAgenda, setCategoriasAgenda] = useState([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        supabase.from('agenda_categorias').select('*').order('nome').then(({data}) => setCategoriasAgenda(data || []));
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const dataToSave = { ...formData };
            // Coluna uuid não aceita string vazia — converte '' para null
            dataToSave.categoria_agenda_id = dataToSave.categoria_agenda_id || null;
            const { error } = await supabase.from('users').update(dataToSave).eq('id', user.id);
            if (error) throw error;
            await logAction('EDIÇÃO DE USUÁRIO', `Usuário ${dataToSave.name || dataToSave.email} atualizado.`);
            toast.success("Usuário atualizado!");
            onSave();
            onClose();
        } catch (error) {
            console.error(error);
            toast.error("Erro ao salvar.");
        } finally {
            setSaving(false);
        }
    };

    const handleResetPassword = async () => {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: urlRedefinirSenha() });
            if (error) throw error;
            toast.success(`Email de redefinição enviado para ${user.email}`);
        } catch (error) {
            console.error(error);
            toast.error("Erro ao enviar email de redefinição.");
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-white/40 backdrop-blur-sm z-[10000] overflow-y-auto p-4 flex">
            <div className="m-auto bg-white/95 backdrop-blur-2xl rounded-[2rem] shadow-2xl border border-white/60 max-w-2xl w-full p-8 relative">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-slate-500 hover:text-slate-600 hover:bg-white/70 rounded-lg transition-all"
                >
                    <X size={20} />
                </button>

                <h2 className="text-xl font-black text-slate-800 uppercase tracking-widest mb-2">
                    Editar Usuário
                </h2>
                <p className="text-xs text-slate-500 font-bold mb-6">{user.email}</p>

                <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-2">Nome</label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                className="w-full px-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500/10 transition-all"
                                placeholder="Nome completo"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-2">Perfil de Acesso</label>
                            {podeGerenciarPermissoes ? (
                                <select
                                    value={formData.role}
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                    className="w-full px-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer"
                                >
                                    {availableRoles.map(role => (
                                        <option key={role} value={role}>{role}</option>
                                    ))}
                                </select>
                            ) : (
                                <>
                                    <div className="w-full px-4 py-2 bg-slate-100 border-2 border-slate-100 rounded-xl text-sm text-slate-500 font-bold flex items-center gap-2">
                                        <Lock size={14} /> {formData.role}
                                    </div>
                                    <p className="mt-1 text-[10px] font-bold text-slate-400">Trocar o perfil é com quem cuida das permissões.</p>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-2">Equipe</label>
                            <select
                                value={formData.categoria_agenda_id || ''}
                                onChange={(e) => setFormData({ ...formData, categoria_agenda_id: e.target.value || null })}
                                className="w-full px-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer"
                            >
                                <option value="">Geral (toda a equipe)</option>
                                {categoriasAgenda.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-2">Gênero</label>
                            <select
                                value={formData.sexo}
                                onChange={(e) => setFormData({ ...formData, sexo: e.target.value })}
                                className="w-full px-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer"
                            >
                                <option value="">Selecione...</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Feminino">Feminino</option>
                            </select>
                        </div>
                    </div>

                    {/* Telefone é campo base de TODOS os usuários (não só médicos) */}
                    <div>
                        <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-2">Telefone (Celular)</label>
                        <input
                            value={formData.telefone}
                            onChange={e => setFormData({ ...formData, telefone: maskTelefone(e.target.value) })}
                            className="w-full px-4 py-2 bg-white/70 backdrop-blur-xl border-2 border-white shadow-xl rounded-xl text-sm text-slate-900 font-bold outline-none focus:ring-2 focus:ring-blue-500/10 transition-all"
                            placeholder="Ex: (11) 99999-9999"
                            maxLength="15"
                        />
                    </div>

                    
                    {podeGerenciarPermissoes && (
                        <ExtraPermissionsSelection role={formData.role} value={formData.permissoes_extras} onChange={(v) => setFormData({ ...formData, permissoes_extras: v })} />
                    )}


                    {/* Status Toggle */}
                    <div>
                        <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wide mb-2">
                            Status
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setFormData({ ...formData, status: 'Ativo' })}
                                className={`flex-1 px-4 py-3 rounded-xl text-xs font-black uppercase transition-all ${formData.status === 'Ativo'
                                    ? 'bg-emerald-500/20 text-white shadow-lg'
                                    : 'bg-white/70 text-slate-500 hover:bg-white/80'
                                    }`}
                            >
                                Ativo
                            </button>
                            <button
                                onClick={() => setFormData({ ...formData, status: 'Inativo' })}
                                className={`flex-1 px-4 py-3 rounded-xl text-xs font-black uppercase transition-all ${formData.status === 'Inativo'
                                    ? 'bg-rose-500/20 text-white shadow-lg'
                                    : 'bg-white/70 text-slate-500 hover:bg-white/80'
                                    }`}
                            >
                                Inativo
                            </button>
                        </div>
                    </div>

                    {/* Reset Password Button */}
                    <button
                        onClick={handleResetPassword}
                        className="w-full px-4 py-3 bg-amber-500/20 text-amber-600 border border-amber-100 rounded-xl text-xs font-black uppercase hover:bg-amber-100 transition-all flex items-center justify-center gap-2"
                    >
                        <KeyRound size={16} />
                        Resetar Senha
                    </button>
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 px-6 py-3 bg-white/70 text-slate-600 rounded-xl font-black text-sm uppercase hover:bg-white/80 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-sm uppercase hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// --- MAIN COMPONENT ---
const UserManagement = ({ isEmbedded = false }) => {
    const { hasPermission } = usePermission();
    const podeGerenciarPermissoes = hasPermission('Gerenciar Permissões') || hasPermission('Acesso Total (Admin)');
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showPermissionsModal, setShowPermissionsModal] = useState(false);
    const [activeFilter, setActiveFilter] = useState('todos'); // 'todos' | 'ativos' | 'inativos'
    const [searchTerm, setSearchTerm] = useState('');
    const { currentUser } = useAuth();

    const loadUsers = async () => {
        try {
            const { data, error } = await supabase.from('users').select('*').order('name', { ascending: true });
            if (error) throw error;
            setUsers(data || []);
        } catch (err) {
            console.error("Erro buscar usuários", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadUsers();
    }, []);

    const handleDelete = async (id, userName, userEmail) => {
        if (window.confirm(`Remover acesso de ${userName}?`)) {
            try {
                const { error } = await supabase.from('users').delete().eq('id', id);
                if (error) throw error;
                setUsers(prev => prev.filter(u => u.id !== id));
                await logAction('EXCLUSÃO DE USUÁRIO', `USUÁRIO ${userEmail || userName} REMOVIDO DO SISTEMA.`);
                toast.success("Acesso removido");
            } catch (error) {
                toast.error("Erro ao remover.");
            }
        }
    };

    if (loading) return (
        <div className="flex justify-center items-center h-full">
            <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
    );

    const getRoleBadgeColor = (role) => {
        const colors = {
            'Desenvolvedor': 'bg-white/40 text-amber-400 border-amber-500/50 shadow-sm shadow-amber-900/20',
            'Administrador': 'bg-blue-600 text-white shadow-[0_4px_15px_rgba(59,130,246,0.4)] border-none border-blue-100',
            'Visualizador': 'bg-white/60 text-slate-600 border-white/40',
            'Sócio': 'bg-violet-600 text-white shadow-[0_4px_15px_rgba(124,58,237,0.35)] border-none',
            'Comercial': 'bg-emerald-500/20 text-emerald-700 border-emerald-100',
            'Gestor de Projetos': 'bg-indigo-500/15 text-indigo-700 border-indigo-100',
            'Produção': 'bg-sky-500/15 text-sky-700 border-sky-100',
            'Financeiro': 'bg-amber-500/15 text-amber-700 border-amber-100'
        };
        return colors[role] || colors['Visualizador'];
    };

    const termo = searchTerm.trim().toLowerCase();
    const filteredUsers = users.filter(user => {
        const matchFilter =
            activeFilter === 'todos' ? true :
            activeFilter === 'ativos' ? (user.status || 'Ativo') !== 'Inativo' :
            activeFilter === 'inativos' ? user.status === 'Inativo' :
            true;
        if (!matchFilter) return false;
        if (!termo) return true;
        return (user.name || '').toLowerCase().includes(termo) ||
               (user.email || '').toLowerCase().includes(termo);
    });

    const content = (
        <div className="flex flex-col h-full bg-white/60 backdrop-blur-lg rounded-lg border border-white/400 shadow-sm overflow-hidden animate-in fade-in duration-500">
            {/* Header Actions */}
            <div className="p-4 md:p-6 border-b border-white/60 flex flex-col gap-5 bg-white/60 backdrop-blur-md">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 w-full">
                    <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-slate-900 drop-shadow-none uppercase tracking-widest">
                            Gestão de Acessos
                        </h3>
                    </div>
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        {podeGerenciarPermissoes && (
                            <button
                                onClick={() => setShowPermissionsModal(true)}
                                className="flex-1 md:flex-none px-4 py-2 border border-white/60 bg-white/60 text-slate-600 rounded-lg text-xs font-bold uppercase hover:bg-white/80 hover:border-purple-300 hover:text-purple-600 transition-all flex items-center justify-center gap-2 backdrop-blur-md shadow-sm"
                            >
                                <Shield size={14} /> Permissões
                            </button>
                        )}
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="flex-1 md:flex-none px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-black uppercase hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all flex items-center justify-center gap-2"
                        >
                            <UserPlus size={14} strokeWidth={3} /> Novo Usuário
                        </button>
                    </div>
                </div>

                {/* BUSCA POR NOME/EMAIL */}
                <div className="relative w-full md:max-w-sm">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Buscar por nome ou email..."
                        className="w-full h-10 pl-10 pr-9 rounded-xl border border-white/60 bg-white/70 text-sm font-semibold text-slate-700 placeholder:text-slate-400 placeholder:font-medium outline-none focus:border-blue-500 focus:bg-white shadow-sm transition-colors"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            title="Limpar busca"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                        >
                            <X size={15} />
                        </button>
                    )}
                </div>

                {/* TABS PREMIUM */}
                <div className="flex gap-2 bg-slate-100/50 p-1.5 rounded-xl border border-white/60 self-start">
                    <button 
                        onClick={() => setActiveFilter('todos')} 
                        className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeFilter === 'todos' ? 'bg-white/60 text-slate-900 drop-shadow-none shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Todos <span className={`px-1.5 py-0.5 rounded-md ${activeFilter === 'todos' ? 'bg-white/70 text-slate-500' : 'bg-slate-200/50'}`}>{users.length}</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter('ativos')}
                        className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeFilter === 'ativos' ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Ativos <span className={`px-1.5 py-0.5 rounded-md ${activeFilter === 'ativos' ? 'bg-white/80 text-slate-800' : 'bg-slate-200/50'}`}>{users.filter(u => (u.status || 'Ativo') !== 'Inativo').length}</span>
                    </button>
                    <button
                        onClick={() => setActiveFilter('inativos')}
                        className={`px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeFilter === 'inativos' ? 'bg-slate-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        Inativos <span className={`px-1.5 py-0.5 rounded-md ${activeFilter === 'inativos' ? 'bg-white/80 text-slate-800' : 'bg-slate-200/50'}`}>{users.filter(u => u.status === 'Inativo').length}</span>
                    </button>
                </div>
            </div>

            {/* Table Container with Scroll */}
            <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-white/60 backdrop-blur-md sticky top-0 z-10 shadow-sm border-b border-white/400">
                        <tr>
                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-white/60">Nome</th>
                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-white/60">Email</th>
                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-white/60">Perfil</th>
                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-white/60">Status</th>
                            <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-white/60 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/50">
                        {filteredUsers.map((user) => {
                            const isDeveloper = user.role === 'Desenvolvedor';
                            // Blindagem: Apenas o PRÓPRIO desenvolvedor pode editar sua conta
                            const isProtectedRole = isDeveloper && currentUser?.id !== user.id;

                            return (
                                <tr key={user.id} className="hover:bg-white/60 transition-colors group">
                                    <td className="px-4 py-2.5">
                                        <div className="text-sm font-bold text-slate-700 uppercase">{user.name || '---'}</div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <div className="text-sm font-medium text-slate-500">{user.email}</div>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${getRoleBadgeColor(user.role)}`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5">
                                        <span className={`flex items-center gap-1.5 text-xs font-bold uppercase ${user.status === 'Ativo' ? 'text-emerald-600' : 'text-slate-500'}`}>
                                            <div className={`w-1.5 h-1.5 rounded-full ${user.status === 'Ativo' ? 'bg-emerald-500/20' : 'bg-slate-300'}`}></div>
                                            {user.status || 'Inativo'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                        <div className="flex items-center justify-center gap-1 opacity-100 transition-opacity">
                                            {/* Edit Button Logic */}
                                            {PROTECTED_EMAILS.includes(user.email) || isProtectedRole ? (
                                                <div className="p-1.5 text-slate-600 cursor-not-allowed" title={isProtectedRole ? "Perfil Protegido (God Mode)" : "Usuário Sistema (Protegido)"}>
                                                    <Lock size={14} />
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => setEditingUser(user)}
                                                    className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-500/20 rounded transition-all"
                                                    title="Editar"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                            )}

                                            {/* Delete Button Logic */}
                                            {PROTECTED_EMAILS.includes(user.email) || user.email === currentUser?.email || isProtectedRole ? (
                                                <div className="p-1.5 w-[26px]"></div> // Espaço vazio para alinhar
                                            ) : (
                                                <button
                                                    onClick={() => handleDelete(user.id, user.name, user.email)}
                                                    className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-500/20 rounded transition-all"
                                                    title="Excluir/Desativar"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredUsers.length === 0 && (
                            <tr>
                                <td colSpan="5" className="py-12 text-center text-slate-500 text-[11px] uppercase font-bold tracking-widest">
                                    {termo ? `Nenhum usuário encontrado para "${searchTerm.trim()}".` : 'Nenhum usuário encontrado nesta aba.'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer Compacto com Legenda */}
            <div className="border-t border-white/60 bg-white/60 backdrop-blur-md p-2 flex gap-3 overflow-x-auto">
                {ROLES.filter(r => r !== 'Desenvolvedor' || currentUser?.role === 'Desenvolvedor').map(role => (
                    <span key={role} className="flex items-center gap-1 text-[11.5px] font-medium text-slate-500 whitespace-nowrap">
                        <div className={`w-1.5 h-1.5 rounded-full ${getRoleBadgeColor(role).split(' ')[0].replace('bg-', 'bg-').replace('-50', '-400')}`}></div>
                        {role}
                    </span>
                ))}
            </div>
        </div>
    );

    // If embedded (inside Settings), return only content
    if (isEmbedded) {
        return (
            <>
                {content}
                {editingUser && (
                    <UserEditModal
                        user={editingUser}
                        onClose={() => setEditingUser(null)}
                        onSave={() => {
                            setEditingUser(null);
                            // Sem recarregar, a lista em memória segue com o
                            // usuário antigo: reabrir a edição mostrava os
                            // valores de antes e parecia que o salvamento
                            // tinha se perdido.
                            loadUsers();
                        }}
                    />
                )}
                {showCreateModal && <UserCreationModal onClose={() => setShowCreateModal(false)} onSave={() => { }} />}
                {showPermissionsModal && podeGerenciarPermissoes && <PermissionsModal onClose={() => setShowPermissionsModal(false)} />}
            </>
        );
    }

    // Standalone (rota /usuarios). Aqui faltavam os modais de criar e de
    // permissões: a tela só era usada embutida nas Configurações, então os
    // botões existiam sem nada por trás.
    return (
        <div className="px-4 lg:px-4 pr-4 py-8 space-y-6 bg-slate-50/20 min-h-full font-sans">
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-widest">
                {podeGerenciarPermissoes ? 'Equipe e Permissões' : 'Equipe'}
            </h1>
            {content}
            {editingUser && (
                <UserEditModal
                    user={editingUser}
                    onClose={() => setEditingUser(null)}
                    onSave={() => {
                        setEditingUser(null);
                        loadUsers();
                    }}
                />
            )}
            {showCreateModal && <UserCreationModal onClose={() => setShowCreateModal(false)} onSave={loadUsers} />}
            {showPermissionsModal && podeGerenciarPermissoes && <PermissionsModal onClose={() => setShowPermissionsModal(false)} />}
        </div>
    );
};

export default UserManagement;