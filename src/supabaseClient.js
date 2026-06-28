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

let currentSessionToken = null;

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    currentSessionToken = session?.access_token || null;
  });
}

function getCachedToken() {
  if (currentSessionToken) return currentSessionToken;
  if (typeof window === 'undefined') return null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
        const jsonStr = localStorage.getItem(key);
        if (jsonStr) {
          const data = JSON.parse(jsonStr);
          currentSessionToken = data?.access_token || null;
          return currentSessionToken;
        }
      }
    }
  } catch (e) {
    console.warn("Erro ao obter token do localStorage:", e);
  }
  return null;
}

// Interceptor global do fetch para injetar síncronamente o Bearer Token do usuário
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async function (url, options) {
    const urlStr = String(url);
    if (urlStr.includes('/rest/v1/') && !urlStr.includes('/auth/v1/')) {
      try {
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
          const token = getCachedToken();
          if (token) {
            options = options || {};
            if (options.headers && !(options.headers instanceof Headers)) {
              const authHeader = options.headers['Authorization'] || options.headers['authorization'];
              if (!authHeader || authHeader.includes(supabaseAnonKey)) {
                options.headers['Authorization'] = `Bearer ${token}`;
              }
            } else if (options.headers instanceof Headers) {
              const authHeader = options.headers.get('Authorization');
              if (!authHeader || authHeader.includes(supabaseAnonKey)) {
                options.headers.set('Authorization', `Bearer ${token}`);
              }
            } else {
              options.headers = {
                'apikey': supabaseAnonKey,
                'Authorization': `Bearer ${token}`,
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
