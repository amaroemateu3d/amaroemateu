import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import PesquisaEcommerce from './pages/PesquisaEcommerce';
import Dashboard from './pages/Dashboard';
import FichasTecnicas from './pages/FichasTecnicas';
import Orcamentos from './pages/Orcamentos';
import Vendas from './pages/Vendas';
import Saidas from './pages/Saidas';
import Pedidos from './pages/Pedidos';
import Consignados from './pages/Consignados';
import Resumo from './pages/Resumo';
import Usuarios from './pages/Usuarios';
import Estoque from './pages/Estoque';
import Login from './pages/Login';
import Acertos from './pages/Acertos';
import './splash.css';

function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 1800);
    const t2 = setTimeout(() => onDone(), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [onDone]);

  return (
    <div className={`splash-overlay ${fading ? 'splash-fade-out' : ''}`}>
      <div className="splash-card">
        <img src="/logo.png" alt="AM3D Logo" className="splash-logo" />
        <div className="splash-dots">
          <span /><span /><span />
        </div>
      </div>
    </div>
  );
}

// AppContent usa o AuthContext como ÚNICA fonte de verdade
function AppContent() {
  const { session, loading, isAcertos } = useAuth();

  // Aguarda o AuthContext resolver a sessão
  if (loading) return <SplashScreen onDone={() => {}} />;

  // Sem sessão = tela de login
  if (!session) return <Login />;

  // Se o usuário possui acesso restrito de acertos, renderiza apenas a tela de acertos
  if (isAcertos) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Acertos />} />
          <Route path="*" element={<Acertos />} />
        </Routes>
      </BrowserRouter>
    );
  }

  // Logado = app completo
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<PesquisaEcommerce />} />
          <Route path="pesquisa-ecommerce" element={<PesquisaEcommerce />} />
          <Route path="fichas-tecnicas" element={<FichasTecnicas />} />
          <Route path="orcamentos" element={<Orcamentos />} />
          <Route path="estoque" element={<Estoque />} />
          <Route path="vendas" element={<Vendas />} />
          <Route path="pedidos" element={<Pedidos />} />
          <Route path="consignados" element={<Consignados />} />
          <Route path="saidas" element={<Saidas />} />
          <Route path="resumo" element={<Resumo />} />
          <Route path="usuarios" element={<Usuarios />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
