import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';

// Mapeamento: usuário → email no Supabase
const USER_MAP = {
  daniel: 'daniel@am3d.app',
  cintia: 'cintia@am3d.app',
  vendas: 'vendas@am3d.app',
};

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      // Limpa chaves antigas e resíduos do Supabase para garantir login 100% limpo
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.includes('am3d') || key.startsWith('sb-'))) {
          localStorage.removeItem(key);
        }
      }
      console.log("Login: Resíduos de sessão local limpos com sucesso.");
    } catch (e) {
      console.error("Erro ao limpar localStorage no Login:", e);
    }
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setErro('');
    setLoading(true);

    const cleanUser = usuario.toLowerCase().trim();
    let email = USER_MAP[cleanUser];

    if (!email) {
      if (cleanUser.includes('@')) {
        email = cleanUser;
      } else if (cleanUser.length > 0) {
        email = `${cleanUser}@am3d.app`;
      }
    }

    if (!email) {
      setErro('Usuário não encontrado.');
      setLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) {
        setErro('Usuário ou senha incorretos: ' + error.message);
      }
    } catch (err) {
      console.error("Erro de execução no signInWithPassword:", err);
      setErro('Erro de conexão: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg-glow" />
      <div className="login-card">
        <div className="login-logo">
          <img src="/logo.png" alt="AM3D Logo" />
          <h1>AM3D</h1>
          <p>Sistema de Gestão</p>
        </div>

        <form className="login-form" onSubmit={handleLogin}>
          <div className="login-field">
            <label>Usuário</label>
            <input
              type="text"
              placeholder="Digite seu usuário"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="login-field">
            <label>Senha</label>
            <input
              type="password"
              placeholder="Digite sua senha"
              value={senha}
              onChange={e => setSenha(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {erro && <div className="login-error">{erro}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-footer">AM3D Impressão 3D © 2025</div>
      </div>
    </div>
  );
}
