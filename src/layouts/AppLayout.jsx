import { Outlet, NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Calculator,
  ShoppingCart, TrendingDown, ClipboardList, BarChart3,
  Download, LogOut, Users, Package
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import './AppLayout.css';

export default function AppLayout() {
  const { signOut, profile, isAdmin } = useAuth();

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
        <div className="sidebar-header">
          <img src="/logo.png" alt="AM3D Logo" className="logo-img" />
          <h2>AM3D</h2>
        </div>

        {/* Perfil do usuário */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.6rem',
          padding: '0.75rem 1rem', marginBottom: '0.5rem',
          background: 'rgba(255,255,255,0.05)', borderRadius: 10
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'var(--accent-primary)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '0.85rem', color: 'white', flexShrink: 0
          }}>
            {inicial}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nomeUsuario}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {isAdmin ? '👑 Administrador' : 'Usuário'}
            </div>
          </div>
        </div>

        <nav className="sidebar-nav" style={{ flex: 1 }}>
          <NavLink to="/" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"} end>
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
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

          <NavLink to="/saidas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <TrendingDown size={20} style={{ color: 'var(--danger)' }} />
            <span>Saídas e Despesas</span>
          </NavLink>

          {/* Gestão de Usuários — apenas para admins */}
          {isAdmin && (
            <>
              <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '0.75rem 0' }} />
              <NavLink to="/usuarios" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
                <Users size={20} />
                <span>Gestão de Usuários</span>
              </NavLink>
            </>
          )}
        </nav>

        <div style={{ paddingTop: '0.75rem', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <button
            onClick={handleBackup}
            className="nav-item"
            style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', color: 'var(--accent-primary)' }}
            title="Baixar Cópia de Segurança"
          >
            <Download size={20} />
            <span style={{ fontWeight: 600 }}>Fazer Backup</span>
          </button>

          <button
            onClick={signOut}
            className="nav-item"
            style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', color: 'var(--danger)' }}
            title="Sair do sistema"
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
