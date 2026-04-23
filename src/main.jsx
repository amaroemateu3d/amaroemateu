import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  document.getElementById('root').innerHTML = `
    <div style="padding: 2rem; color: #ef4444; font-family: sans-serif; background: #1a1a1a; min-height: 100vh;">
      <h2>Erro Crítico de Configuração</h2>
      <p>As variáveis de ambiente do Supabase não foram encontradas.</p>
      <p>Se você criou um novo projeto no Vercel, você <strong>precisa adicionar</strong> as seguintes variáveis em <strong>Settings > Environment Variables</strong>:</p>
      <ul>
        <li><code>VITE_SUPABASE_URL</code></li>
        <li><code>VITE_SUPABASE_ANON_KEY</code></li>
      </ul>
      <p>Após adicionar as variáveis, você precisará fazer um novo <strong>Deploy</strong> para que elas sejam aplicadas.</p>
    </div>
  `;
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
