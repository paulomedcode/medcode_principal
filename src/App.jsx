import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PermissionProvider } from './contexts/PermissionContext';
import { WhiteLabelProvider, useWhiteLabel } from './contexts/WhiteLabelContext';
import PermissionRoute from './components/PermissionRoute';
import { Topbar } from './components/Topbar';
import BuscaGlobal from './components/BuscaGlobal';
import BarraInferior from './components/BarraInferior';
import NovoGlobal from './components/NovoGlobal';
import { Loader2 } from 'lucide-react';
import defaultBgImage from './assets/capa-login.jpg';

// Páginas
import HomeHub from './pages/HomeHub';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';
import ConfiguracoesHub from './pages/ConfiguracoesHub';
import Login from './pages/Login';
import RedefinirSenha, { DesvioDeRecuperacao } from './pages/RedefinirSenha';
import Clientes from './pages/crm/Clientes';
import ClienteDetalhe from './pages/crm/ClienteDetalhe';
import Funil from './pages/vendas/Funil';
import Prospeccao from './pages/prospeccao/Prospeccao';
import Projetos from './pages/projetos/Projetos';
import ProjetoDetalhe from './pages/projetos/ProjetoDetalhe';
// Workspace (Compromisso/Notion) carrega o editor BlockNote, que é pesado:
// lazy-load mantém o bundle das outras telas leve.
const Workspace = lazy(() => import('./pages/Workspace'));

// Páginas Financeiras
import FinanceDashboard from './pages/finance/FinanceDashboard';
import FluxoCaixa from './pages/finance/FluxoCaixa';
import FinanceTransactions from './pages/finance/FinanceTransactions';
import FinanceConciliation from './pages/finance/FinanceConciliation';
import FinanceSettings from './pages/finance/FinanceSettings';
import AccountsLedger from './pages/finance/AccountsLedger';
import Quotes from './pages/finance/Quotes';
import RelatorioDRE from './pages/finance/RelatorioDRE';
import RelatorioGerencial from './pages/finance/RelatorioGerencial';

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
      className="flex flex-col min-h-dvh md:h-screen relative isolate md:overflow-hidden text-slate-800"
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
      {mostraTopbar && <BuscaGlobal />}
      {mostraTopbar && <NovoGlobal />}
      {/* Celular: a página inteira rola (a barra do Safari recolhe e tocar no
          relógio volta ao topo) e sobra espaço embaixo para a barra inferior.
          Computador: rola só o <main>, com a barra superior parada. */}
      <main className={`flex-1 md:overflow-y-auto ${mostraTopbar && !isHome ? 'pt-[64px]' : ''} ${mostraTopbar ? 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0' : ''}`}>
        {children}
      </main>
      {mostraTopbar && <BarraInferior />}
    </div>
  );
};

const App = () => {
  return (
    <AuthProvider>
      <PermissionProvider>
          <WhiteLabelProvider>
            <BrowserRouter>
              <DesvioDeRecuperacao />
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

                    {/* Cadastro de usuários tem porta própria: quem cuida das pessoas
                        não precisa das Configurações inteiras. */}
                    <Route path="/usuarios" element={
                      <PermissionRoute requiredPermission="Acessar Usuarios">
                        <UserManagement />
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

                    <Route path="/compromissos" element={
                      <PermissionRoute requiredPermission="Acessar Compromissos">
                        <Suspense fallback={<div className="h-[calc(100vh-64px)] flex items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={36} /></div>}>
                          <Workspace />
                        </Suspense>
                      </PermissionRoute>
                    } />

                    {/* --- CRM, VENDAS E PROJETOS --- */}
                    {/* O Painel virou a aba "Números" do Início; o endereço antigo leva para lá. */}
                    <Route path="/painel" element={<Navigate to="/home?aba=numeros" replace />} />

                    <Route path="/clientes" element={
                      <PermissionRoute requiredPermission="Acessar Clientes">
                        <Clientes />
                      </PermissionRoute>
                    } />

                    <Route path="/clientes/:id" element={
                      <PermissionRoute requiredPermission="Acessar Clientes">
                        <ClienteDetalhe />
                      </PermissionRoute>
                    } />

                    <Route path="/prospeccao" element={
                      <PermissionRoute requiredPermission="Acessar Prospecção">
                        <Prospeccao />
                      </PermissionRoute>
                    } />

                    <Route path="/vendas" element={
                      <PermissionRoute requiredPermission="Acessar Vendas">
                        <Funil />
                      </PermissionRoute>
                    } />

                    <Route path="/vendas/propostas" element={
                      <PermissionRoute requiredPermission="Acessar Vendas">
                        <Quotes />
                      </PermissionRoute>
                    } />

                    <Route path="/projetos" element={
                      <PermissionRoute requiredPermission="Acessar Projetos">
                        <Projetos />
                      </PermissionRoute>
                    } />

                    <Route path="/projetos/:id" element={
                      <PermissionRoute requiredPermission="Acessar Projetos">
                        <ProjetoDetalhe />
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
            </BrowserRouter>
          </WhiteLabelProvider>
      </PermissionProvider>
    </AuthProvider>
  );
};

export default App;