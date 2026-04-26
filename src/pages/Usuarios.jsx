import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, UserPlus, Trash2, Shield, LayoutDashboard,
  Calculator, FileText, Package2, ShoppingCart,
  TrendingDown, ClipboardList, BarChart3, Check, X
} from 'lucide-react';
import './Usuarios.css';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const PAGES = [
  { id: 'dashboard',       label: 'Dashboard',          icon: <LayoutDashboard size={16} /> },
  { id: 'resumo',          label: 'Resumo',             icon: <BarChart3 size={16} /> },
  { id: 'fichas-tecnicas', label: 'Fichas Técnicas',    icon: <Calculator size={16} /> },
  { id: 'vendas',          label: 'Vendas Multi-Canal', icon: <ShoppingCart size={16} /> },
  { id: 'pedidos',         label: 'Pedidos',            icon: <ClipboardList size={16} /> },
  { id: 'saidas',          label: 'Saídas e Despesas',  icon: <TrendingDown size={16} /> },
];

const COLORS = ['#8B5CF6','#3B82F6','#10B981','#F59E0B','#EC4899','#06B6D4','#84CC16'];

function getColor(index) {
  return COLORS[index % COLORS.length];
}

function getInitials(nome, email) {
  const name = nome || email || '?';
  return name.slice(0, 2).toUpperCase();
}

function adminFetch(path, options = {}, session) {
  return fetch(`${SUPABASE_URL}/functions/v1/manage-users${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      ...options.headers,
    },
  }).then(r => r.json());
}

export default function Usuarios() {
  const { session, isAdmin } = useAuth();
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ nome: '', email: '', password: '', is_admin: false });
  const [adding, setAdding] = useState(false);
  const [erro, setErro] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);

  const loadUsers = useCallback(async () => {
    if (!session) return; // guard: não executa sem sessão
    setLoadingUsers(true);
    const data = await adminFetch('', {}, session);
    if (Array.isArray(data)) {
      setUsers(data);
    }

    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const profileResp = await fetch(`${SUPABASE_URL}/rest/v1/user_profiles?select=*`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    const profileData = profileResp.ok ? await profileResp.json() : [];
    if (profileData) {
      const map = {};
      profileData.forEach(p => { map[p.id] = p; });
      setProfiles(map);
    }
    setLoadingUsers(false);
  }, [session]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  async function selectUser(user) {
    setSelectedUser(user);
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const permResp = await fetch(`${SUPABASE_URL}/rest/v1/user_permissions?select=*&user_id=eq.${user.id}`, {
      headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` }
    });
    const data = permResp.ok ? await permResp.json() : [];

    const perms = {};
    PAGES.forEach(p => {
      perms[p.id] = { can_view: true, can_edit: true };
    });
    if (data) {
      data.forEach(p => {
        perms[p.page] = { can_view: p.can_view, can_edit: p.can_edit };
      });
    }
    setPermissions(perms);
  }

  async function savePermissions() {
    if (!selectedUser) return;
    setSaving(true);
    const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
    for (const page of PAGES) {
      const perm = permissions[page.id];
      await fetch(`${SUPABASE_URL}/rest/v1/user_permissions`, {
        method: 'POST',
        headers: { 
          'apikey': SUPA_KEY, 
          'Authorization': `Bearer ${SUPA_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          user_id: selectedUser.id,
          page: page.id,
          can_view: perm.can_view,
          can_edit: perm.can_edit,
          updated_at: new Date().toISOString(),
        })
      });
    }
    setSaving(false);
  }

  function togglePerm(pageId, type) {
    setPermissions(prev => ({
      ...prev,
      [pageId]: {
        ...prev[pageId],
        [type]: !prev[pageId][type],
      }
    }));
  }

  async function handleAddUser(e) {
    e.preventDefault();
    setErro('');
    setAdding(true);
    const result = await adminFetch('', {
      method: 'POST',
      body: JSON.stringify(newUser),
    }, session);

    if (result.error) {
      setErro(result.error);
    } else {
      setShowModal(false);
      setNewUser({ nome: '', email: '', password: '', is_admin: false });
      await loadUsers();
    }
    setAdding(false);
  }

  async function handleDeleteUser(user) {
    const profile = profiles[user.id];
    if (profile?.is_admin) return alert('Não é possível remover administradores.');
    if (!confirm(`Remover o usuário ${user.email}?`)) return;
    await adminFetch('', {
      method: 'DELETE',
      body: JSON.stringify({ user_id: user.id, email: user.email }),
    }, session);
    if (selectedUser?.id === user.id) setSelectedUser(null);
    await loadUsers();
  }

  if (!isAdmin) {
    return (
      <div className="usuarios-page">
        <div className="empty-select">
          <Shield size={64} />
          <h2>Acesso Restrito</h2>
          <p>Apenas administradores podem acessar esta área.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="usuarios-page">
      <div className="usuarios-header">
        <div>
          <h1>Gestão de Usuários</h1>
          <p>Adicione, remova e configure as permissões de acesso de cada usuário.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <UserPlus size={16} style={{ marginRight: 6 }} />
          Novo Usuário
        </button>
      </div>

      <div className="users-grid">
        {/* Lista de Usuários */}
        <div className="card user-list-card">
          <h3 style={{ marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} /> Usuários ({users.length})
          </h3>
          <div className="user-list">
            {loadingUsers ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando...</p>
            ) : users.map((user, i) => {
              const profile = profiles[user.id];
              return (
                <div
                  key={user.id}
                  className={`user-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                  onClick={() => selectUser(user)}
                >
                  <div className="user-avatar" style={{ background: getColor(i) }}>
                    {getInitials(profile?.nome, user.email)}
                  </div>
                  <div className="user-info">
                    <div className="user-name">{profile?.nome || user.email.split('@')[0]}</div>
                    <div className="user-email">{user.email}</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <span className={`user-badge ${profile?.is_admin ? 'admin' : 'user'}`}>
                      {profile?.is_admin ? 'Admin' : 'Usuário'}
                    </span>
                    {!profile?.is_admin && (
                      <button
                        className="btn-delete-user"
                        onClick={e => { e.stopPropagation(); handleDeleteUser(user); }}
                        title="Remover usuário"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Painel de Permissões */}
        <div className="card permissions-card">
          {!selectedUser ? (
            <div className="empty-select">
              <Shield size={48} />
              <p>Selecione um usuário para configurar as permissões</p>
            </div>
          ) : (
            <>
              <h3>
                Permissões — {profiles[selectedUser.id]?.nome || selectedUser.email.split('@')[0]}
              </h3>
              <table className="permissions-table">
                <thead>
                  <tr>
                    <th>Área do Sistema</th>
                    <th>Visualizar</th>
                    <th>Editar</th>
                  </tr>
                </thead>
                <tbody>
                  {PAGES.map(page => {
                    const perm = permissions[page.id] || { can_view: true, can_edit: true };
                    const isAdminUser = profiles[selectedUser.id]?.is_admin;
                    return (
                      <tr key={page.id}>
                        <td>
                          <span className="page-icon">
                            {page.icon} {page.label}
                          </span>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            className="perm-checkbox"
                            checked={isAdminUser ? true : perm.can_view}
                            disabled={isAdminUser}
                            onChange={() => togglePerm(page.id, 'can_view')}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            className="perm-checkbox"
                            checked={isAdminUser ? true : perm.can_edit}
                            disabled={isAdminUser || !perm.can_view}
                            onChange={() => togglePerm(page.id, 'can_edit')}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="permissions-footer">
                {saving && (
                  <div className="saving-indicator">
                    <div className="dot-pulse" />
                    Salvando...
                  </div>
                )}
                <button className="btn-secondary" onClick={() => setSelectedUser(null)}>
                  Cancelar
                </button>
                <button className="btn-primary" onClick={savePermissions} disabled={saving}>
                  <Check size={16} style={{ marginRight: 6 }} />
                  Salvar Permissões
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Novo Usuário */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Novo Usuário</h3>
                <p>Preencha os dados para criar o acesso.</p>
              </div>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form className="modal-body add-user-form" onSubmit={handleAddUser}>
              <div className="input-group">
                <label>Nome</label>
                <input
                  type="text"
                  placeholder="Ex: João Silva"
                  value={newUser.nome}
                  onChange={e => setNewUser(p => ({ ...p, nome: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label>E-mail</label>
                <input
                  type="email"
                  placeholder="Ex: joao@am3d.app"
                  value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label>Senha</label>
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={newUser.password}
                  onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={newUser.is_admin}
                  onChange={e => setNewUser(p => ({ ...p, is_admin: e.target.checked }))}
                />
                <span style={{ fontWeight: 600 }}>Administrador</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  Acesso total ao sistema
                </span>
              </label>
              {erro && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '0.75rem', borderRadius: 10, fontSize: '0.88rem' }}>
                  {erro}
                </div>
              )}
              <div className="modal-footer" style={{ padding: 0, paddingTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={adding}>
                  {adding ? 'Criando...' : 'Criar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
