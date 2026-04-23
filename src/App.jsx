import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './layouts/AppLayout';
import Dashboard from './pages/Dashboard';
import FichasTecnicas from './pages/FichasTecnicas';
import Orcamentos from './pages/Orcamentos';
import Pecas from './pages/Pecas';
import Vendas from './pages/Vendas';
import Saidas from './pages/Saidas';
import Pedidos from './pages/Pedidos';
import Resumo from './pages/Resumo';
import './splash.css';

function SplashScreen({ onDone }) {
  const [fading, setFading] = useState(false);

  useEffect(() => {
    // Starts fade-out after 1.8s, then calls onDone after transition
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

function App() {
  const [ready, setReady] = useState(false);

  return (
    <>
      {!ready && <SplashScreen onDone={() => setReady(true)} />}
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="fichas-tecnicas" element={<FichasTecnicas />} />
            <Route path="orcamentos" element={<Orcamentos />} />
            <Route path="pecas" element={<Pecas />} />
            <Route path="vendas" element={<Vendas />} />
            <Route path="pedidos" element={<Pedidos />} />
            <Route path="saidas" element={<Saidas />} />
            <Route path="resumo" element={<Resumo />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
