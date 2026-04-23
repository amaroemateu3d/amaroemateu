import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    setProfile(data);
  }

  async function loadPermissions(userId) {
    const { data } = await supabase
      .from('user_permissions')
      .select('*')
      .eq('user_id', userId);

    if (data && data.length > 0) {
      const perms = {};
      data.forEach(p => {
        perms[p.page] = { can_view: p.can_view, can_edit: p.can_edit };
      });
      setPermissions(perms);
    } else {
      // Sem restrições salvas = acesso total
      setPermissions({});
    }
  }

  useEffect(() => {
    // Fallback: se o Supabase travar por causa de lock no localStorage, libera o app após 3s
    const fallbackTimer = setTimeout(() => {
      console.warn("Supabase getSession timeout - liberando app");
      setLoading(false);
    }, 3000);

    // Inicialização: busca sessão atual e carrega perfil/permissões
    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      clearTimeout(fallbackTimer);
      if (error) console.error("Erro no getSession:", error);
      
      setSession(session);
      if (session?.user) {
        try {
          await Promise.all([
            loadProfile(session.user.id),
            loadPermissions(session.user.id),
          ]);
        } catch (e) {
          console.error("Erro ao carregar perfil/permissões:", e);
        }
      }
      setLoading(false); // só libera o app após tudo carregar
    }).catch(e => {
      clearTimeout(fallbackTimer);
      console.error("Exceção no getSession:", e);
      setLoading(false);
    });

    // Escuta login/logout em tempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session?.user) {
        await Promise.all([
          loadProfile(session.user.id),
          loadPermissions(session.user.id),
        ]);
      } else {
        setProfile(null);
        setPermissions({});
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  function canView(page) {
    if (!permissions[page]) return true; // sem restrição = pode ver
    return permissions[page].can_view;
  }

  function canEdit(page) {
    if (!permissions[page]) return true; // sem restrição = pode editar
    return permissions[page].can_edit;
  }

  const isAdmin = profile?.is_admin === true;

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{ session, profile, permissions, isAdmin, canView, canEdit, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
