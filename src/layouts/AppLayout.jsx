import { Outlet, NavLink } from 'react-router-dom';
import { LayoutDashboard, Calculator, FileText, Package2, ShoppingCart, TrendingDown, ClipboardList, BarChart3, Download } from 'lucide-react';
import './AppLayout.css';

export default function AppLayout() {
  const handleBackup = () => {
    try {
      const backupData = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // Backup apenas das chaves da nossa aplicação (opcional, mas seguro filtrar por prefixo 'am3d_' ou pegar tudo)
        if (key.startsWith('am3d_') || true) { 
           backupData[key] = localStorage.getItem(key);
        }
      }
      
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href",     dataStr);
      const dataHora = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
      downloadAnchorNode.setAttribute("download", `am3d_backup_${dataHora}.json`);
      document.body.appendChild(downloadAnchorNode); // required for firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (e) {
      alert("Erro ao gerar backup.");
      console.error(e);
    }
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="sidebar-header">
          <img src="/logo.png" alt="AM3D Logo" className="logo-img" />
          <h2>AM3D</h2>
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
          
          <NavLink to="/orcamentos" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <FileText size={20} />
            <span>Orçamentos</span>
          </NavLink>

          <NavLink to="/pecas" className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}>
            <Package2 size={20} />
            <span>Peças e Catálogo</span>
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
            <TrendingDown size={20} style={{color: 'var(--danger)'}} />
            <span>Saídas e Despesas</span>
          </NavLink>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.5)' }}>
          <button 
            onClick={handleBackup} 
            className="nav-item" 
            style={{ width: '100%', border: 'none', background: 'transparent', textAlign: 'left', cursor: 'pointer', color: 'var(--accent-primary)' }}
            title="Baixar Cópia de Segurança de todos os dados salvos"
          >
            <Download size={20} />
            <span style={{ fontWeight: 600 }}>Fazer Backup</span>
          </button>
        </div>
      </aside>
      
      <main className="content-area">
        <Outlet />
      </main>
    </div>
  );
}
