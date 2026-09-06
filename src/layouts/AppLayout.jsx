import { Outlet, NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard, Calculator,
  ShoppingCart, TrendingDown, ClipboardList, BarChart3,
  Download, LogOut, Users, Package, Search, Wallet
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './AppLayout.css';

export default function AppLayout() {
  const { signOut, profile, isAdmin, isDaniel, isPessoal } = useAuth();

  const handleBackup = () => {
    try {
      const backupData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        backupData[key] = localStorage.getItem(key);
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
      const a = document.createElement('a');
      a.setAttribute("href", dataStr);
      const dataHora = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      a.setAttribute("download", `am3d_backup_${dataHora}.json`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      alert("Erro ao gerar backup.");
    }
  };

  const nomeUsuario = profile?.nome || 'Usuário';
  const inicial = nomeUsuario.charAt(0).toUpperCase();

  return (
    <div className="app-container">
      <aside className="sidebar">
        <Link to="/" className="sidebar-header" style={{ textDecoration: 'none', color: 'inherit' }}>
          <img src="/logo.png" alt="AM3D Logo" className="logo-img" />
          <h2>AM3D</h2>
        </Link>

        {/* Perfil do usuário */}
        <div className="user-profile">
          <div className="user-avatar">
            {inicial}
          </div>
          <div className="user-info">
            <div className="user-name">
              {nomeUsuario}
            </div>
            <div className="user-role">
              {isAdmin ? '👑 Administrador' : 'Usuário'}
            </div>
            {profile?.tenants?.name && (
              <div className="user-tenant">
                🏢 {profile.tenants.name}
              </div>
            )}
          </div>
        </div>

        <nav className="sidebar-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <LayoutDashboard size={20} />
            <span>Início</span>
          </NavLink>

          <NavLink to="/pesquisa-ecommerce" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Search size={20} />
            <span>Pesquisa E-commerce</span>
          </NavLink>

          <NavLink to="/resumo" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <BarChart3 size={20} />
            <span>Resumo</span>
          </NavLink>

          <NavLink to="/fichas-tecnicas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Calculator size={20} />
            <span>Cadastro de FTs</span>
          </NavLink>



          <NavLink to="/estoque" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Package size={20} />
            <span>Estoque</span>
          </NavLink>

          <NavLink to="/vendas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <ShoppingCart size={20} />
            <span>Vendas Multi-Canal</span>
          </NavLink>

          <NavLink to="/pedidos" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <ClipboardList size={20} />
            <span>Pedidos</span>
          </NavLink>

          <NavLink to="/consignados" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <ClipboardList size={20} />
            <span>Consignados</span>
          </NavLink>

          <NavLink to="/saidas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <TrendingDown size={20} style={{ color: 'var(--danger)' }} />
            <span>Saídas e Despesas</span>
          </NavLink>

          {/* Gestão de Usuários — apenas para Daniel */}
          {isDaniel && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
              <NavLink to="/usuarios" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                <Users size={20} />
                <span>Gestão de Usuários</span>
              </NavLink>
            </>
          )}

          {/* Finanças Pessoais — Daniel e Cintia */}
          {isPessoal && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '0.5rem 0' }} />
              <NavLink to="/financas-pessoais" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                <Wallet size={20} style={{ color: '#F97316' }} />
                <span style={{ color: '#F97316', fontWeight: 600 }}>Finanças Pessoais</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            onClick={handleBackup}
            className="nav-item"
            title="Baixar Cópia de Segurança"
            style={{ color: 'var(--accent-primary)' }}
          >
            <Download size={20} />
            <span style={{ fontWeight: 600 }}>Fazer Backup</span>
          </button>

          <button
            onClick={signOut}
            className="nav-item"
            title="Sair do sistema"
            style={{ color: 'var(--danger)' }}
          >
            <LogOut size={20} />
            <span style={{ fontWeight: 600 }}>Sair</span>
          </button>
        </div>
      </aside>

      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
}
