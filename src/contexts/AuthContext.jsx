import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const initializedRef = useRef(false);

  async function loadProfileAndPermissions(userId) {
    try {
      // Carrega perfil
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError || !profileData) {
        console.warn('AuthContext: Perfil não encontrado para', userId);
        return null;
      }

      // Carrega empresa separadamente
      let tenantData = null;
      if (profileData.empresa_id) {
        try {
          const { data: tData } = await supabase
            .from('tenants')
            .select('*')
            .eq('id', profileData.empresa_id)
            .single();
          tenantData = tData;
        } catch (err) {
          console.error('AuthContext: Erro ao carregar empresa:', err);
        }
      }

      const fullProfile = {
        ...profileData,
        tenants: tenantData || { 
          name: 'A&M 3D', 
          limit_fts: 99999,
          logo_url: '',
          telefone: '19 9 9672-5045',
          endereco: 'Campinas, SP',
          email: 'amaroemateu3d@gmail.com',
          documento: '',
          custom_header: 'Produtos em Impressão 3D'
        }
      };

      // Carrega permissões
      const { data: permsData } = await supabase
        .from('user_permissions')
        .select('*')
        .eq('user_id', userId);

      const perms = {};
      if (permsData && permsData.length > 0) {
        permsData.forEach(p => {
          perms[p.page] = { can_view: p.can_view, can_edit: p.can_edit };
        });
      }

      return { fullProfile, perms };
    } catch (err) {
      console.error('AuthContext: Erro ao carregar perfil/permissões:', err);
      return null;
    }
  }

  useEffect(() => {
    let mounted = true;

    // Fallback de segurança: se tudo travar, libera em 8s
    const fallback = setTimeout(() => {
      console.warn('AuthContext: Fallback de 8s ativado - liberando app');
      if (mounted) setLoading(false);
    }, 8000);

    // Única fonte de verdade: onAuthStateChange
    // O evento INITIAL_SESSION dispara automaticamente na inicialização
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      console.log('AuthContext event:', event, '| user:', currentSession?.user?.id ?? 'none');

      if (currentSession?.user) {
        const result = await loadProfileAndPermissions(currentSession.user.id);

        if (!mounted) return;

        if (result) {
          setSession(currentSession);
          setProfile(result.fullProfile);
          setPermissions(result.perms);
        } else {
          // Perfil não encontrado: faz logout
          setSession(null);
          setProfile(null);
          setPermissions({});
          await supabase.auth.signOut();
        }
      } else {
        setSession(null);
        setProfile(null);
        setPermissions({});
      }

      if (mounted) {
        clearTimeout(fallback);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  function canView(page) {
    if (!permissions[page]) return true;
    return permissions[page].can_view;
  }

  function canEdit(page) {
    if (!permissions[page]) return true;
    return permissions[page].can_edit;
  }

  const isAdmin = profile?.is_admin === true;
  const isAcertos = profile?.is_acertos === true;
  const isDaniel =
    profile?.id === '45a50fe2-fb93-4d1f-a1b9-c95eb470d38f' ||
    profile?.nome?.toLowerCase() === 'daniel';
  const isCintia = profile?.nome?.toLowerCase() === 'cintia';
  const isPessoal = isDaniel || isCintia;

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Erro no signOut:', e);
    }
    localStorage.clear();
    window.location.href = '/';
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, permissions, isAdmin, isAcertos, isDaniel, isCintia, isPessoal, canView, canEdit, signOut, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
