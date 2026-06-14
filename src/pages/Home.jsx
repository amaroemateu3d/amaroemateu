import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Calculator, ShoppingCart, BarChart3, Package,
  ArrowRight, Calendar
} from 'lucide-react';
import './Home.css';

export default function Home() {
  const { profile, canView } = useAuth();
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const nomeUsuario = profile?.nome || 'Usuário';

  const formatDate = (date) => {
    return date.toLocaleDateString('pt-BR', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (date) => {
    return date.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Atalhos disponíveis com validação de permissões
  const shortcuts = [
    {
      to: '/fichas-tecnicas',
      name: 'Cadastro de FTs',
      desc: 'Fichas técnicas, pesos e custos de produção',
      icon: <Calculator size={22} />,
      page: 'fichas-tecnicas'
    },
    {
      to: '/estoque',
      name: 'Estoque',
      desc: 'Acompanhe e controle saldo de peças 3D',
      icon: <Package size={22} />,
      page: 'estoque'
    },
    {
      to: '/vendas',
      name: 'Vendas Multi-Canal',
      desc: 'Lance vendas do Mercado Livre, Shopee, Site, etc.',
      icon: <ShoppingCart size={22} />,
      page: 'vendas'
    },
    {
      to: '/resumo',
      name: 'Resumo Financeiro',
      desc: 'Faturamento, despesas e lucratividade mensal',
      icon: <BarChart3 size={22} />,
      page: 'resumo'
    }
  ].filter(s => canView(s.page));

  return (
    <div className="home-container">
      <div className="home-welcome-card">
        <div className="home-content">
          <div className="home-logo-wrapper">
            <div className="home-logo-glow" />
            <img src="/logo.png" alt="A&M 3D Logo" className="home-logo" />
          </div>

          <h1 className="home-title">Bem-vindo, {nomeUsuario}!</h1>
          <p className="home-subtitle">
            Sistema de Gestão e Controle de Produção 3D da A&M 3D.
          </p>

          <div className="home-datetime">
            <Calendar size={15} />
            <span>{formatDate(currentTime)} às {formatTime(currentTime)}</span>
          </div>

          {shortcuts.length > 0 && (
            <>
              <h3 className="home-shortcuts-title">Atalhos Rápidos</h3>
              <div className="home-shortcuts-grid">
                {shortcuts.map(shortcut => (
                  <Link key={shortcut.to} to={shortcut.to} className="home-shortcut-card">
                    <div className="home-shortcut-icon-wrapper">
                      {shortcut.icon}
                    </div>
                    <div className="home-shortcut-info">
                      <div className="home-shortcut-name">{shortcut.name}</div>
                      <div className="home-shortcut-desc">{shortcut.desc}</div>
                    </div>
                    <ArrowRight className="home-shortcut-arrow" size={18} />
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
