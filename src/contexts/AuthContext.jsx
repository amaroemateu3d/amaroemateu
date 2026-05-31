import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId) {
    console.log("AuthContext: Carregando perfil para o ID:", userId);
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (profileError || !profileData) {
      console.error("AuthContext: Erro ao carregar perfil:", profileError);
      setProfile(null);
      return;
    }

    // Carrega os dados da empresa separadamente para evitar travamentos de join
    let tenantData = null;
    if (profileData.empresa_id) {
      try {
        const { data: tData } = await supabase
          .from('tenants')
          .select('name, limit_fts')
          .eq('id', profileData.empresa_id)
          .single();
        tenantData = tData;
      } catch (err) {
        console.error("AuthContext: Erro ao carregar empresa:", err);
      }
    }

    const fullProfile = {
      ...profileData,
      tenants: tenantData || { name: 'A&M 3D', limit_fts: 99999 }
    };

    console.log("AuthContext: Perfil carregado com sucesso:", fullProfile);
    setProfile(fullProfile);
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

    // Inicialização assíncrona robusta e instantânea do estado de autenticação
    async function initializeAuth() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mounted) return;

        if (initialSession?.user) {
          console.log("AuthContext: Sessão inicial detectada para o ID:", initialSession.user.id);
          const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', initialSession.user.id)
            .single();

          if (!profileError && profileData) {
            // Carrega empresa separadamente
            let tenantData = null;
            if (profileData.empresa_id) {
              try {
                const { data: tData } = await supabase
                  .from('tenants')
                  .select('name, limit_fts')
                  .eq('id', profileData.empresa_id)
                  .single();
                tenantData = tData;
              } catch (err) {
                console.error("AuthContext Init: Erro ao carregar empresa:", err);
              }
            }

            const fullProfile = {
              ...profileData,
              tenants: tenantData || { name: 'A&M 3D', limit_fts: 99999 }
            };

            setSession(initialSession);
            setProfile(fullProfile);
            await loadPermissions(initialSession.user.id);
          } else {
            console.warn("AuthContext Init: Perfil não encontrado ou inativo para a sessão inicial.");
          }
        }
      } catch (err) {
        console.error("Erro na inicialização rápida do AuthContext:", err);
      } finally {
        if (mounted) {
          clearTimeout(fallback);
          setLoading(false);
        }
      }
    }

    initializeAuth();

    // Escuta ativa de eventos de autenticação
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;
      console.log(`AuthContext event: ${event}`);

      if (currentSession?.user) {
        try {
          const { data: profileData, error: profileError } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', currentSession.user.id)
            .single();

          if (profileError || !profileData) {
            console.warn("AuthContext Event: Perfil não encontrado ou inativo, deslogando.");
            setSession(null);
            setProfile(null);
            setPermissions({});
            await supabase.auth.signOut();
          } else {
            // Carrega empresa separadamente
            let tenantData = null;
            if (profileData.empresa_id) {
              try {
                const { data: tData } = await supabase
                  .from('tenants')
                  .select('name, limit_fts')
                  .eq('id', profileData.empresa_id)
                  .single();
                tenantData = tData;
              } catch (err) {
                console.error("AuthContext Event: Erro ao carregar empresa:", err);
              }
            }

            const fullProfile = {
              ...profileData,
              tenants: tenantData || { name: 'A&M 3D', limit_fts: 99999 }
            };

            setSession(currentSession);
            setProfile(fullProfile);
            await loadPermissions(currentSession.user.id);
          }
        } catch (e) {
          console.error("Erro ao carregar perfil/permissões no evento de Auth:", e);
        }
      } else {
        setSession(null);
        setProfile(null);
        setPermissions({});
      }

      clearTimeout(fallback);
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
  const isAcertos = profile?.is_acertos === true;
  const isDaniel = profile?.id === '45a50fe2-fb93-4d1f-a1b9-c95eb470d38f' || profile?.nome?.toLowerCase() === 'daniel';

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("Erro no signOut do Supabase:", e);
    }
    // Força a limpeza local e recarrega para garantir o logout em caso de deadlock
    localStorage.clear();
    window.location.href = '/';
  }

  return (
    <AuthContext.Provider value={{ session, profile, permissions, isAdmin, isAcertos, isDaniel, canView, canEdit, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
