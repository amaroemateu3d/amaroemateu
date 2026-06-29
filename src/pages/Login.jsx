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
  const [lembrar, setLembrar] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Carrega credenciais salvas se a opção Lembrar estiver ativa
    const savedUsuario = localStorage.getItem('am3d_usuario') || localStorage.getItem('lume_usuario') || '';
    const savedSenha = localStorage.getItem('am3d_senha') || localStorage.getItem('lume_senha') || '';
    const savedLembrar = (localStorage.getItem('am3d_lembrar') || localStorage.getItem('lume_lembrar')) === 'true';

    if (savedLembrar) {
      setUsuario(savedUsuario);
      setSenha(savedSenha);
      setLembrar(true);
    }

    try {
      // Limpa chaves antigas e resíduos do Supabase para garantir login 100% limpo
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.includes('supabase') || key.startsWith('sb-')) && !key.includes('lume_') && !key.includes('am3d_')) {
          localStorage.removeItem(key);
        }
      }
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
      } else {
        // Se logou com sucesso, salva ou remove credenciais
        if (lembrar) {
          localStorage.setItem('am3d_usuario', usuario);
          localStorage.setItem('am3d_senha', senha);
          localStorage.setItem('am3d_lembrar', 'true');
        } else {
          localStorage.removeItem('am3d_usuario');
          localStorage.removeItem('am3d_senha');
          localStorage.setItem('am3d_lembrar', 'false');
        }
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
          <h1 className="login-title">A&M 3D</h1>
          <p className="login-subtitle">Sistema Operacional</p>
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
            <div className="password-input-wrapper">
              <input
                type={mostrarSenha ? "text" : "password"}
                placeholder="Digite sua senha"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button 
                type="button" 
                className="toggle-password-btn" 
                onClick={() => setMostrarSenha(prev => !prev)}
                tabIndex="-1"
                title={mostrarSenha ? "Ocultar Senha" : "Exibir Senha"}
              >
                {mostrarSenha ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <div className="login-remember-container">
            <label className="login-remember-label">
              <input
                type="checkbox"
                checked={lembrar}
                onChange={e => setLembrar(e.target.checked)}
              />
              <span>Lembrar minhas credenciais</span>
            </label>
          </div>

          {erro && <div className="login-error">{erro}</div>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <div className="login-footer">A&M 3D © 2026</div>
      </div>
    </div>
  );
}
