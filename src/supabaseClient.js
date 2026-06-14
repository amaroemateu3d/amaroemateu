import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Faltam variáveis de ambiente do Supabase (VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY).");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Desativa o sistema navigator.locks que causa deadlocks no Chrome durante o Fast Refresh do Vite
    lock: async (name, acquireTimeout, fn) => {
      return await fn();
    }
  }
});

// Interceptor global do fetch para injetar automaticamente o Bearer Token do usuário autenticado
// em requisições diretas de REST API feitas pelo app (que originalmente usavam a anon key).
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async function (url, options) {
    const urlStr = String(url);
    // Intercepta apenas requisições para a API Rest, ignorando autenticação para evitar recursão
    if (urlStr.includes('/rest/v1/') && !urlStr.includes('/auth/v1/')) {
      try {
        // Verifica se já possui um header Authorization com token de usuário (que não seja a anon key)
        let hasUserToken = false;
        if (options && options.headers) {
          let authHeader = null;
          if (options.headers instanceof Headers) {
            authHeader = options.headers.get('Authorization') || options.headers.get('authorization');
          } else {
            authHeader = options.headers['Authorization'] || options.headers['authorization'];
          }
          if (authHeader && authHeader.startsWith('Bearer ') && !authHeader.includes(supabaseAnonKey)) {
            hasUserToken = true;
          }
        }

        if (!hasUserToken) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            options = options || {};
            
            // Trata headers se for um objeto simples
            if (options.headers && !(options.headers instanceof Headers)) {
              const authHeader = options.headers['Authorization'] || options.headers['authorization'];
              if (!authHeader || authHeader.includes(supabaseAnonKey)) {
                options.headers['Authorization'] = `Bearer ${session.access_token}`;
              }
            } 
            // Trata headers se for uma instância de Headers
            else if (options.headers instanceof Headers) {
              const authHeader = options.headers.get('Authorization');
              if (!authHeader || authHeader.includes(supabaseAnonKey)) {
                options.headers.set('Authorization', `Bearer ${session.access_token}`);
              }
            } 
            // Cria headers se não existirem
            else {
              options.headers = {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
              };
            }
          }
        }
      } catch (err) {
        console.warn("Erro ao injetar Bearer Token no fetch interceptor:", err);
      }
    }
    return originalFetch.apply(this, [url, options]);
  };
}
