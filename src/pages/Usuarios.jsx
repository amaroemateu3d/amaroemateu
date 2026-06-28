import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import {
  Users, UserPlus, Trash2, Shield, LayoutDashboard,
  Calculator, ShoppingCart, TrendingDown, ClipboardList,
  BarChart3, Check, X, Building2, Plus, Lock
} from 'lucide-react';
import './Usuarios.css';
import ConfirmModal from '../components/ConfirmModal';

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

export default function Usuarios() {
  const { session, isAdmin, profile, isDaniel } = useAuth();
  const [users, setUsers] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [newUser, setNewUser] = useState({ nome: '', email: '', password: '', is_admin: false, is_acertos: false, empresa_id: 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9' });
  const [adding, setAdding] = useState(false);
  const [erro, setErro] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Estados do Modal de Confirmação Global
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: 'save', title: '', details: [], onConfirm: null });
  const openConfirm = (type, title, details, onConfirm) => setConfirmModal({ isOpen: true, type, title, details, onConfirm });
  const closeConfirm = () => setConfirmModal(m => ({ ...m, isOpen: false }));

  // Estados Multi-Tenant SaaS
  const [tenants, setTenants] = useState([]);
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', limit_fts: 50 });
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState('usuarios'); // 'usuarios' ou 'empresas'

  // Estados para redefinição de senha
  const [tempPassword, setTempPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // O super-administrador do SaaS é exclusivamente o Daniel
  const isSuperAdmin = isDaniel;

  // Carrega lista de usuários direto da tabela user_profiles (Isolação por RLS automática!)
  const loadUsers = useCallback(async () => {
    if (!session) return;
    setLoadingUsers(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('nome', { ascending: true });

      if (error) throw error;

      if (data) {
        const mappedUsers = data.map(p => ({
          id: p.id,
          email: p.email || `${p.nome?.toLowerCase().replace(/\s+/g, '') || 'usuario'}@am3d.app`,
          nome: p.nome
        }));
        setUsers(mappedUsers);

        const map = {};
        data.forEach(p => { map[p.id] = p; });
        setProfiles(map);
      }
    } catch (e) {
      console.error("Erro ao carregar usuários:", e);
    } finally {
      setLoadingUsers(false);
    }
  }, [session]);

  // Carrega as empresas cadastradas (Exclusivo para Super-Admin)
  const loadTenants = useCallback(async () => {
    if (!isSuperAdmin) return;
    setLoadingTenants(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setTenants(data || []);
    } catch (e) {
      console.error("Erro ao carregar empresas:", e);
    } finally {
      setLoadingTenants(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    loadUsers();
    if (isSuperAdmin) {
      loadTenants();
    }
  }, [loadUsers, loadTenants, isSuperAdmin]);

  async function selectUser(user) {
    setSelectedUser(user);
    setTempPassword('');
    try {
      const { data, error } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', user.id);

      if (error) throw error;

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
    } catch (err) {
      console.error("Erro ao carregar permissões do usuário:", err);
    }
  }

  function savePermissions() {
    if (!selectedUser) return;
    const userName = profiles[selectedUser.id]?.nome || selectedUser.email;
    openConfirm(
      'save',
      'Salvar Permissões do Usuário',
      [
        { label: 'Usuário', value: userName },
        { label: 'Ação', value: 'Atualizar as regras de visualização e edição das áreas do sistema para este usuário.' }
      ],
      () => {
        closeConfirm();
        executeSavePermissions();
      }
    );
  }

  async function executeSavePermissions() {
    setSaving(true);
    try {
      const targetUser = profiles[selectedUser.id];
      const targetEmpresaId = targetUser?.empresa_id || profile?.empresa_id || 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9';

      for (const page of PAGES) {
        const perm = permissions[page.id] || { can_view: true, can_edit: true };
        const { error } = await supabase
          .from('user_permissions')
          .upsert({
            user_id: selectedUser.id,
            page: page.id,
            can_view: perm.can_view,
            can_edit: perm.can_edit,
            empresa_id: targetEmpresaId,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'user_id,page'
          });

        if (error) throw error;
      }
      alert("Permissões salvas com sucesso!");
    } catch (err) {
      alert("Erro ao salvar permissões: " + err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleAcertos(userId, currentValue) {
    const newValue = !currentValue;
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_acertos: newValue })
        .eq('id', userId);

      if (error) throw error;
      
      setProfiles(prev => {
        const next = { ...prev };
        if (next[userId]) {
          next[userId] = { ...next[userId], is_acertos: newValue };
        }
        return next;
      });
    } catch (err) {
      alert("Erro ao alterar acesso a acertos: " + err.message);
    }
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

  // Criação segura de usuário usando client secundário (Evita logout do admin)
  function handleAddUserSubmit(e) {
    e.preventDefault();
    setErro('');
    if (!newUser.nome.trim() || !newUser.email.trim() || !newUser.password) {
      return alert("Preencha todos os campos obrigatórios.");
    }
    if (newUser.password.length < 6) {
      return alert("A senha deve conter no mínimo 6 caracteres.");
    }

    const empName = tenants.find(t => t.id === newUser.empresa_id)?.name || 'A&M 3D';
    openConfirm(
      'save',
      'Criar Novo Usuário',
      [
        { label: 'Nome', value: newUser.nome },
        { label: 'Login/Email', value: newUser.email },
        { label: 'Senha Provisória', value: newUser.password },
        { label: 'Administrador', value: newUser.is_admin ? 'Sim' : 'Não' },
        { label: 'Empresa', value: empName }
      ],
      () => {
        closeConfirm();
        executeAddUser();
      }
    );
  }

  async function executeAddUser() {
    setAdding(true);
    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      });

      let finalEmail = newUser.email.toLowerCase().trim();
      if (!finalEmail.includes('@')) {
        finalEmail = `${finalEmail.replace(/\s+/g, '')}@am3d.app`;
      }

      // 1. Registrar no Auth do Supabase
      const { data: authData, error: authError } = await tempClient.auth.signUp({
        email: finalEmail,
        password: newUser.password,
        options: {
          data: {
            nome: newUser.nome
          }
        }
      });

      if (authError) throw authError;

      const newUserId = authData.user?.id;
      if (!newUserId) throw new Error("Falha ao registrar ID no Auth do Supabase.");

      const targetEmpresaId = isSuperAdmin
        ? (newUser.empresa_id || 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9')
        : (profile?.empresa_id || 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9');

      // 2. Inserir perfil na tabela user_profiles (com senha em texto plano)
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: newUserId,
          nome: newUser.nome,
          email: finalEmail,
          is_admin: newUser.is_admin,
          is_acertos: newUser.is_acertos,
          empresa_id: targetEmpresaId,
          password_plain: newUser.password
        });

      if (profileError) throw profileError;

      // 3. Gerar permissões padrão do novo usuário
      for (const page of PAGES) {
        await supabase
          .from('user_permissions')
          .insert({
            user_id: newUserId,
            page: page.id,
            can_view: !newUser.is_acertos,
            can_edit: !newUser.is_acertos,
            empresa_id: targetEmpresaId
          });
      }

      setShowModal(false);
      setNewUser({ nome: '', email: '', password: '', is_admin: false, is_acertos: false, empresa_id: 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9' });
      await loadUsers();
      alert("Usuário criado com sucesso!");
    } catch (err) {
      console.error(err);
      setErro(err.message || "Erro ao salvar usuário no banco.");
    } finally {
      setAdding(false);
    }
  }

  // Remoção segura de usuário (Exclui o perfil para bloquear o acesso)
  async function handleDeleteUser(user) {
    if (user.id === '45a50fe2-fb93-4d1f-a1b9-c95eb470d38f') {
      return alert('Não é possível remover o administrador master Daniel.');
    }

    openConfirm(
      'delete',
      'Excluir Usuário',
      [
        { label: 'Nome', value: profiles[user.id]?.nome || '—' },
        { label: 'Email', value: user.email },
        { label: 'Ação', value: 'O usuário será removido completamente do banco de dados e do sistema de autenticação.' }
      ],
      async () => {
        closeConfirm();
        try {
          const { error } = await supabase.rpc('excluir_usuario_completo', { usr_id: user.id });
          if (error) throw error;

          if (selectedUser?.id === user.id) setSelectedUser(null);
          await loadUsers();
          alert("Usuário removido com sucesso!");
        } catch (err) {
          alert("Erro ao remover usuário: " + err.message);
        }
      }
    );
  }

  async function handleDeleteTenant(tenant) {
    if (tenant.id === 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9') {
      return alert('Não é possível remover a empresa master A&M 3D.');
    }

    openConfirm(
      'delete',
      'Excluir Empresa SaaS',
      [
        { label: 'Empresa', value: tenant.name },
        { label: 'ID', value: tenant.id },
        { label: 'Ação', value: 'Todos os usuários, fichas técnicas, pedidos, despesas e dados vinculados a esta empresa serão excluídos para sempre.' }
      ],
      async () => {
        closeConfirm();
        setLoadingTenants(true);
        try {
          const { error } = await supabase.rpc('excluir_tenant_completo', { tnt_id: tenant.id });
          if (error) throw error;

          alert("Empresa excluída com sucesso!");
          await loadTenants();
          await loadUsers(); // Recarrega os usuários também
        } catch (err) {
          alert("Erro ao excluir empresa: " + err.message);
        } finally {
          setLoadingTenants(false);
        }
      }
    );
  }

  // Redefinir senha de qualquer usuário (Exclusivo para o Daniel)
  function handleUpdatePassword() {
    if (tempPassword.length < 6) return alert("A senha deve conter no mínimo 6 caracteres.");
    const userName = profiles[selectedUser.id]?.nome || selectedUser.email;
    
    openConfirm(
      'edit',
      'Alterar Senha do Usuário',
      [
        { label: 'Usuário', value: userName },
        { label: 'Nova Senha', value: tempPassword }
      ],
      () => {
        closeConfirm();
        executeUpdatePassword();
      }
    );
  }

  async function executeUpdatePassword() {
    setChangingPassword(true);
    try {
      const { error } = await supabase.rpc('alterar_senha_usuario', {
        usr_id: selectedUser.id,
        nova_senha: tempPassword
      });

      if (error) throw error;

      alert("Senha alterada com sucesso!");
      
      // Atualiza localmente no estado profiles
      setProfiles(prev => {
        const next = { ...prev };
        if (next[selectedUser.id]) {
          next[selectedUser.id] = { ...next[selectedUser.id], password_plain: tempPassword };
        }
        return next;
      });
      setTempPassword('');
    } catch (err) {
      alert("Erro ao alterar senha: " + err.message);
    } finally {
      setChangingPassword(false);
    }
  }

  // Cadastro de novas empresas (SaaS)
  async function handleAddTenant(e) {
    e.preventDefault();
    if (!newTenant.name.trim()) return alert("O nome da empresa é obrigatório.");
    setCreatingTenant(true);

    try {
      const { error } = await supabase
        .from('tenants')
        .insert({
          name: newTenant.name,
          limit_fts: parseInt(newTenant.limit_fts) || 50
        });

      if (error) throw error;

      alert(`Empresa "${newTenant.name}" cadastrada com sucesso!`);
      setShowTenantModal(false);
      setNewTenant({ name: '', limit_fts: 50 });
      await loadTenants();
    } catch (err) {
      alert("Erro ao cadastrar empresa: " + err.message);
    } finally {
      setCreatingTenant(false);
    }
  }

  // Atualizar limite/plano de Fichas Técnicas da empresa em tempo real
  async function handleUpdateTenantLimit(tenantId, newLimit) {
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ limit_fts: parseInt(newLimit) })
        .eq('id', tenantId);

      if (error) throw error;

      setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, limit_fts: parseInt(newLimit) } : t));
      alert("Plano da empresa atualizado com sucesso!");
    } catch (err) {
      alert("Erro ao atualizar o plano da empresa: " + err.message);
    }
  }

  // Agrupar usuários por empresa para renderização agrupada na lista (Blindagem contra null/undefined)
  const groupedUsers = {};
  
  // Inicializa os grupos das empresas carregadas
  if (Array.isArray(tenants)) {
    tenants.forEach(t => {
      if (t && t.id) {
        groupedUsers[t.id] = { name: t.name || 'Empresa sem Nome', usersList: [] };
      }
    });
  }

  const masterTenantId = 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9';
  if (!groupedUsers[masterTenantId]) {
    groupedUsers[masterTenantId] = { name: 'A&M 3D', usersList: [] };
  }

  // Preenche os grupos com os usuários correspondentes
  if (Array.isArray(users)) {
    users.forEach(user => {
      if (user && user.id) {
        const prof = profiles ? profiles[user.id] : null;
        const empId = prof?.empresa_id || masterTenantId;
        
        if (!groupedUsers[empId]) {
          const matchingTenant = Array.isArray(tenants) ? tenants.find(t => t.id === empId) : null;
          groupedUsers[empId] = { name: matchingTenant?.name || (empId === masterTenantId ? 'A&M 3D' : 'Outra Empresa'), usersList: [] };
        }
        groupedUsers[empId].usersList.push(user);
      }
    });
  }

  if (!isDaniel) {
    return (
      <div className="usuarios-page">
        <div className="empty-select">
          <Lock size={64} style={{ color: 'var(--danger)', opacity: 0.8 }} />
          <h2>Acesso Restrito</h2>
          <p>Apenas o administrador master Daniel da empresa A&M 3D pode acessar esta área.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="usuarios-page">
      <div className="usuarios-header">
        <div>
          <h1>Gestão {isSuperAdmin ? 'do Sistema SaaS' : 'de Usuários'}</h1>
          <p>{isSuperAdmin ? 'Gerencie empresas cadastradas, controle limites e configure usuários.' : 'Adicione, remova e configure as permissões de acesso de cada usuário.'}</p>
        </div>
        {activeSubTab === 'usuarios' ? (
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            <UserPlus size={16} style={{ marginRight: 6 }} />
            Novo Usuário
          </button>
        ) : (
          <button className="btn-primary" onClick={() => setShowTenantModal(true)}>
            <Building2 size={16} style={{ marginRight: 6 }} />
            Nova Empresa
          </button>
        )}
      </div>

      {/* Abas SaaS super administrador */}
      {isSuperAdmin && (
        <div className="saas-tabs">
          <button
            className={`saas-tab ${activeSubTab === 'usuarios' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('usuarios')}
          >
            <Users size={16} />
            Usuários do Sistema
          </button>
          <button
            className={`saas-tab ${activeSubTab === 'empresas' ? 'active' : ''}`}
            onClick={() => setActiveSubTab('empresas')}
          >
            <Building2 size={16} />
            Empresas Cadastradas
          </button>
        </div>
      )}

      {/* CONTEÚDO DA ABA DE EMPRESAS */}
      {isSuperAdmin && activeSubTab === 'empresas' ? (
        <div className="card">
          <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={18} /> Empresas Cadastradas no SaaS ({tenants.length})
          </h3>
          {loadingTenants ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando empresas...</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="tenants-table">
                <thead>
                  <tr>
                    <th>Nome da Empresa</th>
                    <th>Limite de FTs</th>
                    <th>Cadastrada em</th>
                    <th>ID do Tenant</th>
                    <th style={{ textAlign: 'right' }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                        {t.name} {t.id === 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9' && '⭐️ (A&M 3D)'}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="tenant-badge-limit">
                            {t.limit_fts >= 9999 ? 'Ilimitado' : `${t.limit_fts} itens`}
                          </span>
                          <select
                            value={t.limit_fts >= 9999 ? '99999' : String(t.limit_fts)}
                            onChange={e => handleUpdateTenantLimit(t.id, e.target.value)}
                            style={{
                              padding: '0.25rem 0.5rem',
                              borderRadius: '6px',
                              border: '1px solid var(--border-color)',
                              background: 'var(--bg-secondary)',
                              color: 'var(--text-primary)',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              fontWeight: 600,
                              outline: 'none'
                            }}
                          >
                            <option value="50">50 FTs (Bronze)</option>
                            <option value="200">200 FTs (Silver)</option>
                            <option value="99999">Ilimitado (Gold)</option>
                          </select>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {new Date(t.created_at).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                        {t.id}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {t.id !== 'a0d8e8fc-66de-4e31-8c4d-eb4044c3c3a9' && (
                          <button
                            type="button"
                            onClick={() => handleDeleteTenant(t)}
                            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '1.1rem' }}
                            title="Excluir Empresa"
                          >
                            🗑️
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* CONTEÚDO DA ABA DE USUÁRIOS (PADRÃO) */
        <div className="users-grid">
          {/* Lista de Usuários */}
          <div className="card user-list-card">
            <h3 style={{ marginBottom: '1rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Users size={18} /> Usuários ({users.length})
            </h3>
            <div className="user-list" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {loadingUsers ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Carregando...</p>
              ) : Object.keys(groupedUsers).map(empId => {
                const group = groupedUsers[empId];
                if (group.usersList.length === 0) return null; // Não exibe empresas sem usuários

                return (
                  <div key={empId} className="company-users-section" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <div className="company-group-header" style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.6px',
                      color: 'var(--accent-primary)',
                      padding: '0.2rem 0.6rem',
                      background: 'rgba(139, 92, 246, 0.08)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      width: 'fit-content',
                      marginBottom: '0.2rem',
                      border: '1px solid rgba(139, 92, 246, 0.15)'
                    }}>
                      <Building2 size={11} /> {group.name}
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      {group.usersList.map((user, i) => {
                        const prof = profiles[user.id];
                        return (
                          <div
                            key={user.id}
                            className={`user-item ${selectedUser?.id === user.id ? 'selected' : ''}`}
                            onClick={() => selectUser(user)}
                            style={{ margin: 0 }}
                          >
                            <div className="user-avatar" style={{ background: getColor(i) }}>
                              {getInitials(prof?.nome, user.email)}
                            </div>
                            <div className="user-info">
                              <div className="user-name">{prof?.nome || user.email.split('@')[0]}</div>
                              <div className="user-email">{user.email}</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                              <span className={`user-badge ${prof?.is_admin ? 'admin' : 'user'}`}>
                                {prof?.is_admin ? 'Admin' : 'Usuário'}
                              </span>
                              {user.id !== '45a50fe2-fb93-4d1f-a1b9-c95eb470d38f' && (
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <h3 style={{ margin: 0 }}>
                      Permissões — {profiles[selectedUser.id]?.nome || selectedUser.email.split('@')[0]}
                    </h3>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      🔑 Senha Cadastrada: <strong style={{ color: 'var(--success)', fontFamily: 'monospace', fontSize: '0.95rem' }}>{profiles[selectedUser.id]?.password_plain || '—'}</strong>
                    </span>
                  </div>
                  {!profiles[selectedUser.id]?.is_admin && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', background: 'var(--bg-secondary)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                      <input
                        type="checkbox"
                        checked={profiles[selectedUser.id]?.is_acertos || false}
                        onChange={() => handleToggleAcertos(selectedUser.id, profiles[selectedUser.id]?.is_acertos)}
                      />
                      <strong style={{ color: 'var(--accent-primary)' }}>Acesso Restrito a Acertos</strong>
                    </label>
                  )}
                </div>

                {/* Painel de Redefinição de Senha */}
                <div style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '1rem'
                }}>
                  <div className="input-group" style={{ flex: 1, margin: 0 }}>
                    <label style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem', display: 'block', letterSpacing: '0.5px' }}>
                      Alterar Senha do Usuário
                    </label>
                    <input
                      type="password"
                      placeholder="Nova senha (mínimo 6 caracteres)"
                      value={tempPassword}
                      onChange={e => setTempPassword(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.8rem',
                        borderRadius: '8px',
                        border: '1.5px solid var(--border-color)',
                        background: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleUpdatePassword}
                    disabled={changingPassword || tempPassword.length < 6}
                    style={{
                      padding: '0.62rem 1.25rem',
                      borderRadius: '8px',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      height: 'fit-content'
                    }}
                  >
                    {changingPassword ? 'Alterando...' : 'Alterar Senha'}
                  </button>
                </div>

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
      )}

      {/* Modal Novo Usuário */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Novo Usuário</h3>
                <p>Preencha os dados para criar o acesso.</p>
              </div>
              <button className="btn-icon" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form className="modal-body add-user-form" onSubmit={handleAddUserSubmit}>
              {isSuperAdmin && (
                <div className="input-group">
                  <label>Empresa Vinculada</label>
                  <select
                    value={newUser.empresa_id}
                    onChange={e => setNewUser(p => ({ ...p, empresa_id: e.target.value }))}
                    required
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      borderRadius: 10,
                      border: '1.5px solid var(--border-color)',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      fontSize: '0.95rem'
                    }}
                  >
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}
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
                <label>Usuário / Login</label>
                <input
                  type="text"
                  placeholder="Ex: joao ou joao@cliente.com"
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
                  Acesso administrativo
                </span>
              </label>
              <label className="admin-toggle" style={{ marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  checked={newUser.is_acertos}
                  onChange={e => setNewUser(p => ({ ...p, is_acertos: e.target.checked }))}
                />
                <span style={{ fontWeight: 600 }}>Acesso a Acertos</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                  Apenas tela de acertos
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

      {/* Modal Nova Empresa (Tenant) */}
      {showTenantModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Nova Empresa SaaS</h3>
                <p>Preencha os dados para cadastrar a nova empresa.</p>
              </div>
              <button className="btn-icon" onClick={() => setShowTenantModal(false)}><X size={18} /></button>
            </div>
            <form className="modal-body add-user-form" onSubmit={handleAddTenant}>
              <div className="input-group">
                <label>Nome da Empresa</label>
                <input
                  type="text"
                  placeholder="Ex: Impressões 3D Prime"
                  value={newTenant.name}
                  onChange={e => setNewTenant(p => ({ ...p, name: e.target.value }))}
                  required
                />
              </div>
              <div className="input-group">
                <label>Plano / Limite de Fichas Técnicas</label>
                <select
                  value={newTenant.limit_fts}
                  onChange={e => setNewTenant(p => ({ ...p, limit_fts: e.target.value }))}
                  required
                  style={{
                    width: '100%',
                    padding: '0.75rem 1rem',
                    borderRadius: 10,
                    border: '1.5px solid var(--border-color)',
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.95rem',
                    outline: 'none'
                  }}
                >
                  <option value="50">Bronze (50 FTs)</option>
                  <option value="200">Silver (200 FTs)</option>
                  <option value="99999">Gold (Ilimitado)</option>
                </select>
              </div>
              <div className="modal-footer" style={{ padding: 0, paddingTop: '1rem' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowTenantModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={creatingTenant}>
                  {creatingTenant ? 'Cadastrando...' : 'Cadastrar Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        type={confirmModal.type}
        title={confirmModal.title}
        details={confirmModal.details}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirm}
      />
    </div>
  );
}
