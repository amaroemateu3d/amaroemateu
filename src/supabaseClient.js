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
    storageKey: 'am3d-auth-token-v2', 
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // Desativa o sistema de locks que costuma travar em ambientes de rede/sincronização (ex: GDrive)
    lock: {
      acquire: () => Promise.resolve(null),
      release: () => Promise.resolve(),
    }
  }
});
