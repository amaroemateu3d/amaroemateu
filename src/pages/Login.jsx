import { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';

// Mapeamento: usuário → email no Supabase
const USER_MAP = {
  daniel: 'daniel@am3d.app',
  cintia: 'cintia@am3d.app',
};

export default function Login() {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setErro('');
    setLoading(true);

    const email = USER_MAP[usuario.toLowerCase().trim()];

    if (!email) {
      setErro('Usuário não encontrado.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

    if (error) {
      setErro('Usuário ou senha incorretos.');
    }

    setLoading(false);
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
