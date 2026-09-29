import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionProvider } from './contexts/PermissionContext';
import { UnitProvider } from './contexts/UnitContext';
import { WhiteLabelProvider, useWhiteLabel } from './contexts/WhiteLabelContext';
import { UnitGatekeeper } from './components/UnitGatekeeper';
import PermissionRoute from './components/PermissionRoute';
import { Topbar } from './components/Topbar';
import { Loader2 } from 'lucide-react';
import defaultBgImage from './assets/capa-login.jpg';

// Páginas
import HomeHub from './pages/HomeHub';
import Dashboard from './pages/Dashboard';
import SurgeryQueue from './pages/SurgeryQueue';
import Settings from './pages/Settings';
import RegrasApaFa from './pages/RegrasApaFa';
import UserManagement from './pages/UserManagement';
import ConfiguracoesHub from './pages/ConfiguracoesHub';
import AtendimentoHub from './pages/AtendimentoHub';
import ImportData from './pages/ImportData';
import Login from './pages/Login';
import RedefinirSenha, { DesvioDeRecuperacao } from './pages/RedefinirSenha';
import WeeklyView from './pages/WeeklyView';
import Aih from './pages/Aih';
import Apa from './pages/Apa';
import FichaAnestesica from './pages/FichaAnestesica';
import Pacientes from './pages/Pacientes';
import Autorizacoes from './pages/Autorizacoes';
import Recepcao from './pages/Recepcao';
import Agenda from './pages/Agenda';
import Internacao from './pages/Internacao';
import PEP from './pages/PEP';
import PEPHub from './pages/PEPHub';
import Escala from './pages/Escala';
// Workspace (Compromisso/Notion) carrega o editor BlockNote, que é pesado:
// lazy-load mantém o bundle das outras telas leve.
const Workspace = lazy(() => import('./pages/Workspace'));

// Páginas Financeiras
import MeusRepasses from './pages/MeusRepasses';
import FinanceDashboard from './pages/finance/FinanceDashboard';
import FluxoCaixa from './pages/finance/FluxoCaixa';
import FinanceTransactions from './pages/finance/FinanceTransactions';
import FinanceConciliation from './pages/finance/FinanceConciliation';
import FinanceGlosas from './pages/finance/FinanceGlosas';
import FinanceSettings from './pages/finance/FinanceSettings';
import AccountsLedger from './pages/finance/AccountsLedger';
import Quotes from './pages/finance/Quotes';
import RelatorioDRE from './pages/finance/RelatorioDRE';
import RelatorioGerencial from './pages/finance/RelatorioGerencial';
import RelatorioVendas from './pages/finance/RelatorioVendas';
import AnaliseContratos from './pages/finance/AnaliseContratos';

const AppLayout = ({ children }) => {
  const { currentUser } = useAuth();
  const { isThemeLoading, theme } = useWhiteLabel();
  const location = useLocation();
  const isHome = location.pathname === '/home';
  // A tela de redefinir senha já tem sessão (o link do e-mail loga), mas não é
  // o sistema ainda: sem Topbar até a senha nova ser gravada.
  const mostraTopbar = currentUser && location.pathname !== '/redefinir-senha';

  if (isThemeLoading) {
    return (
      <div className="flex flex-col h-screen bg-slate-50 items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-500">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">Preparando Ambiente...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-screen relative isolate overflow-hidden text-slate-800"
      style={{
          backgroundImage: `url(${theme.bgImage || defaultBgImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundAttachment: 'fixed'
      }}
    >
      {/* Véu sobre o papel de parede. -z-[1] (com isolate no pai) o mantém acima do
          bg e abaixo do conteúdo, sem precisar de z-index no <main> — z-index no main
          criava um stacking context que prendia os modais (z-[10000]) abaixo da
          Topbar fixa (z-[999]), que ficava sobrepondo o topo dos modais. */}
      <div className="absolute inset-0 -z-[1] pointer-events-none bg-white/50 backdrop-blur-[3px]"></div>
      
      {mostraTopbar && (
        <div className="fixed top-0 left-0 w-full z-[999]">
          <Topbar />
        </div>
      )}
      <main className={`flex-1 overflow-y-auto ${mostraTopbar && !isHome ? 'pt-[64px]' : ''}`}>
        {children}
      </main>
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <PermissionProvider>
        <UnitProvider>
          <WhiteLabelProvider>
            <BrowserRouter>
              <DesvioDeRecuperacao />
              <UnitGatekeeper>
                <AppLayout>
                  <Routes>
                    {/* --- ROTAS PÚBLICAS (Qualquer um acessa) --- */}
                    <Route path="/login" element={<Login />} />
                    <Route path="/redefinir-senha" element={<RedefinirSenha />} />

                    {/* Redirecionamento da Raiz */}
                    <Route path="/" element={<Navigate to="/home" />} />

                    {/* --- ROTAS PROTEGIDAS (Só logado acessa) --- */}
                    {/* Agora envolvemos cada página sensível com <PrivateRoute> */}

                    <Route path="/home" element={
                      <PermissionRoute>
                        <HomeHub />
                      </PermissionRoute>
                    } />

                    <Route path="/dashboard" element={
                      <PermissionRoute requiredPermission="Acessar Relatórios">
                        <Dashboard />
                      </PermissionRoute>
                    } />

                    <Route path="/fila" element={
                      <PermissionRoute requiredPermission="Visualizar Fila">
                        <SurgeryQueue />
                      </PermissionRoute>
                    } />

                    <Route path="/pacientes" element={
                      <PermissionRoute requiredPermission="Visualizar Pacientes">
                        <Pacientes />
                      </PermissionRoute>
                    } />

                    <Route path="/semana" element={
                      <PermissionRoute requiredPermission="Visualizar Mapa/Agenda">
                        <WeeklyView />
                      </PermissionRoute>
                    } />

                    <Route path="/aih" element={
                      <PermissionRoute requiredPermission="Visualizar Atendimentos">
                        <Aih />
                      </PermissionRoute>
                    } />

                    <Route path="/apa" element={
                      <PermissionRoute requiredPermission="Visualizar Atendimentos">
                        <Apa />
                      </PermissionRoute>
                    } />

                    <Route path="/ficha-anestesica" element={
                      <PermissionRoute requiredPermission="Visualizar Atendimentos">
                        <FichaAnestesica />
                      </PermissionRoute>
                    } />

                    {/* Cadastro de usuários tem porta própria: quem cuida das pessoas
                        não precisa das Configurações inteiras. */}
                    <Route path="/usuarios" element={
                      <PermissionRoute requiredPermission="Acessar Usuarios">
                        <UserManagement />
                      </PermissionRoute>
                    } />

                    {/* Porta própria das regras clínicas: não passa pelas Configurações. */}
                    <Route path="/regras-apa-fa" element={
                      <PermissionRoute requiredPermission="Gerenciar Regras APA/FA">
                        <RegrasApaFa />
                      </PermissionRoute>
                    } />

                    <Route path="/configuracoes" element={
                      <PermissionRoute requiredPermission="Acessar Configurações">
                        <ConfiguracoesHub />
                      </PermissionRoute>
                    } />

                    <Route path="/configuracoes-painel" element={
                      <PermissionRoute requiredPermission="Acessar Configurações">
                        <Settings />
                      </PermissionRoute>
                    } />

                    <Route path="/importar-dados" element={
                      <PermissionRoute requiredPermission="Acesso Total (Admin)">
                        <ImportData />
                      </PermissionRoute>
                    } />

                    <Route path="/atendimento" element={
                      <PermissionRoute requiredPermission="Acessar Atendimento">
                        <AtendimentoHub />
                      </PermissionRoute>
                    } />

                    <Route path="/autorizacoes" element={
                      <PermissionRoute requiredPermission="Acessar Autorizações">
                        <Autorizacoes />
                      </PermissionRoute>
                    } />

                    <Route path="/recepcao" element={
                      <PermissionRoute requiredPermission="Acessar Recepção">
                        <Recepcao />
                      </PermissionRoute>
                    } />

                    {/* Agenda de consultas: mora no Atendimento, não no Mapa Cirúrgico. */}
                    <Route path="/agenda" element={
                      <PermissionRoute requiredPermission="Acessar Atendimento">
                        <Agenda />
                      </PermissionRoute>
                    } />

                    <Route path="/internacao" element={
                      <PermissionRoute requiredPermission="Acessar Atendimento">
                        <Internacao />
                      </PermissionRoute>
                    } />

                    <Route path="/escala" element={
                      <PermissionRoute requiredPermission="Acessar Escala">
                        <Escala />
                      </PermissionRoute>
                    } />

                    <Route path="/compromissos" element={
                      <PermissionRoute requiredPermission="Acessar Compromissos">
                        <Suspense fallback={<div className="h-[calc(100vh-64px)] flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={36} /></div>}>
                          <Workspace />
                        </Suspense>
                      </PermissionRoute>
                    } />

                    <Route path="/pep" element={
                      <PermissionRoute requiredPermission="Visualizar Atendimentos">
                        <PEP />
                      </PermissionRoute>
                    } />

                    <Route path="/pep-hub" element={
                      <PermissionRoute requiredPermission="Visualizar Atendimentos">
                        <PEPHub />
                      </PermissionRoute>
                    } />

                    {/* Meus Repasses: a folha assinada e o pagamento dela, do lado do
                        médico. Rota e permissão próprias, fora de /finance de
                        propósito — o módulo Financeiro é o caixa da empresa. */}
                    <Route path="/meus-repasses" element={
                      <PermissionRoute requiredPermission="Acessar Meus Repasses">
                        <MeusRepasses />
                      </PermissionRoute>
                    } />

                    {/* --- ROTAS FINANCEIRAS --- */}
                    <Route path="/finance/dashboard" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <FinanceDashboard />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/fluxo-de-caixa" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <FluxoCaixa />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/orcamentos" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <Quotes />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/contas-pagar" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <AccountsLedger type="SAIDA" />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/contas-receber" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <AccountsLedger type="ENTRADA" />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/transacoes" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <FinanceTransactions />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/conciliacao" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <FinanceConciliation />
                      </PermissionRoute>
                    } />

                    {/* Repasses agora vive só na Escala (botão "Repasses" na barra
                        de ferramentas), lendo escala_plantoes e gerando conta a pagar
                        PENDENTE. A rota antiga saiu junto com o menu: ela abria a
                        tela que lia o blob legado settings.escala e gerava a SAIDA já
                        como PAGO, pulando contas a pagar. A página segue no repositório
                        (pages/finance/FinanceRepasse.jsx), apenas desligada. */}

                    <Route path="/finance/glosas" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <FinanceGlosas />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/relatorios/dre" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <RelatorioDRE />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/relatorios/fluxo" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <FinanceTransactions initialView="flow" />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/relatorios/gerencial" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <RelatorioGerencial />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/relatorios/vendas" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <RelatorioVendas />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/relatorios/contratos" element={
                      <PermissionRoute requiredPermission="Acessar Financeiro">
                        <AnaliseContratos />
                      </PermissionRoute>
                    } />

                    <Route path="/finance/configuracoes" element={
                      <PermissionRoute requiredPermission="Editar Financeiro">
                        <FinanceSettings />
                      </PermissionRoute>
                    } />

                    {/* Proteção contra rota inexistente (404 vira Login) */}
                    <Route path="*" element={<Navigate to="/login" />} />

                  </Routes>
                </AppLayout>
                <Toaster position="top-right" containerStyle={{ zIndex: 999999 }} />
              </UnitGatekeeper>
            </BrowserRouter>
          </WhiteLabelProvider>
        </UnitProvider>
      </PermissionProvider>
    </AuthProvider>
  );
};

export default App;