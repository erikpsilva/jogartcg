import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useSiteSettings } from '../settings/SiteSettingsContext';

export function AppHeader() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const { playEnabled } = useSiteSettings();

  async function handleLogout() {
    try { await logout(); } finally { navigate('/cartas'); }
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <NavLink className="brand" to="/cartas" aria-label="Jogar TCG — catálogo"><img src="./brand/logo-jogar-tcg.png" alt="Jogar TCG" /></NavLink>
        <nav className="site-nav" aria-label="Navegação principal">
          <NavLink to="/cartas">Cartas</NavLink><NavLink to="/meus-decks">Meus decks</NavLink>{playEnabled && <NavLink to="/jogar">Jogar</NavLink>}
        </nav>
        <div className="site-header__actions">
          {!loading && user ? (
            <details className="user-menu">
              <summary className="user-chip">{user.foto_perfil ? <img src={user.foto_perfil} alt="" /> : <span>{user.nome.charAt(0)}{user.sobrenome.charAt(0)}</span>}<b>{user.nome}</b><i>⌄</i></summary>
              <div className="user-menu__dropdown">
                <NavLink to="/meus-decks"><strong>Meus decks</strong><small>Listas salvas</small></NavLink>
                <NavLink to="/meus-dados"><strong>Meus dados</strong><small>Perfil e senha</small></NavLink>
                <button type="button" onClick={() => void handleLogout()}><strong>Sair</strong><small>Encerrar sessão</small></button>
              </div>
            </details>
          ) : <NavLink className="button button--ghost" to="/entrar">Entrar</NavLink>}
          <NavLink className="button button--primary" to="/decks/novo"><span>+</span> Montar deck</NavLink>
        </div>
      </div>
    </header>
  );
}
