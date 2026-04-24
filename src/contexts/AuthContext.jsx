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
    let mounted = true;

    // Fallback de segurança MÁXIMA: se o Supabase travar 100%, libera a tela após 6s
    const fallback = setTimeout(() => {
      console.warn("Supabase onAuthStateChange timeout - Forçando liberação do app (6s)");
      if (mounted) setLoading(false);
    }, 6000);

    // onAuthStateChange dispara o evento 'INITIAL_SESSION' assim que é registrado
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      
      setSession(session);
      if (session?.user) {
        try {
          await Promise.all([
            loadProfile(session.user.id),
            loadPermissions(session.user.id),
          ]);
        } catch (e) {
          console.error("Erro ao carregar perfil/permissões no AuthContext:", e);
        }
      } else {
        setProfile(null);
        setPermissions({});
      }
      
      // Limpa o timer de fallback já que o Supabase respondeu
      clearTimeout(fallback);

      // Libera a tela de loading após o evento inicial ou após login/logout
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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
