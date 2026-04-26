import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard';
import FichasTecnicas from './pages/FichasTecnicas';
import Vendas from './pages/Vendas';
import Saidas from './pages/Saidas';
import Pedidos from './pages/Pedidos';
import Resumo from './pages/Resumo';
import Usuarios from './pages/Usuarios';
import Login from './pages/Login';
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
  const { session, loading } = useAuth();

  // Aguarda o AuthContext resolver a sessão
  if (loading) return <SplashScreen onDone={() => {}} />;

  // Sem sessão = tela de login
  if (!session) return <Login />;

  // Logado = app completo
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="fichas-tecnicas" element={<FichasTecnicas />} />
          <Route path="vendas" element={<Vendas />} />
          <Route path="pedidos" element={<Pedidos />} />
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
