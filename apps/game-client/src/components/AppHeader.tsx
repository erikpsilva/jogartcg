import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useInstallApp } from '../pwa/InstallContext';
import { useSiteSettings } from '../settings/SiteSettingsContext';

export function AppHeader() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const { playEnabled } = useSiteSettings();
  const { installed, showInstallSuggestion } = useInstallApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', closeOnEscape);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', closeOnEscape); };
  }, [mobileMenuOpen]);

  async function handleLogout() {
    try { await logout(); } finally { navigate('/cartas'); }
  }

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <NavLink className="brand" to="/cartas" aria-label="Jogar TCG — catálogo"><img src="./brand/logo-jogar-tcg.png" alt="Jogar TCG" /></NavLink>
        <nav className="site-nav" aria-label="Navegação principal">
          <NavLink to="/cartas">Cartas</NavLink><NavLink to="/meus-decks">Meus decks</NavLink>{playEnabled && <NavLink to="/jogar" onClick={showInstallSuggestion}>Jogar</NavLink>}
        </nav>
        <div className="site-header__actions">
          <button className="install-button" type="button" disabled={installed} onClick={showInstallSuggestion}><span aria-hidden="true">↓</span>{installed ? 'Instalado' : 'Instalar'}</button>
          <div className="site-header__account">{!loading && user ? (
            <details className="user-menu">
              <summary className="user-chip">{user.foto_perfil ? <img src={user.foto_perfil} alt="" /> : <span>{user.nome.charAt(0)}{user.sobrenome.charAt(0)}</span>}<b>{user.nome}</b><i>⌄</i></summary>
              <div className="user-menu__dropdown">
                <NavLink to="/meus-decks"><strong>Meus decks</strong><small>Listas salvas</small></NavLink>
                <NavLink to="/meus-dados"><strong>Meus dados</strong><small>Perfil e senha</small></NavLink>
                <button type="button" onClick={() => void handleLogout()}><strong>Sair</strong><small>Encerrar sessão</small></button>
              </div>
            </details>
          ) : <NavLink className="button button--ghost" to="/entrar">Entrar</NavLink>}
            <button className="mobile-menu-toggle" type="button" aria-expanded={mobileMenuOpen} aria-controls="mobile-site-menu" aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMobileMenuOpen((open) => !open)}><span /><span /><span /></button>
          </div>
          <NavLink className="button button--primary" to="/decks/novo"><span>+</span> Montar deck</NavLink>
        </div>
      </div>
      <div className={`mobile-site-menu ${mobileMenuOpen ? 'mobile-site-menu--open' : ''}`} id="mobile-site-menu" aria-hidden={!mobileMenuOpen}>
        <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu">×</button>
        <nav aria-label="Navegação mobile">
          <NavLink to="/cartas" onClick={() => setMobileMenuOpen(false)}>Cartas<small>Consulte o catálogo completo</small></NavLink>
          <NavLink to="/meus-decks" onClick={() => setMobileMenuOpen(false)}>Meus decks<small>Monte e gerencie suas listas</small></NavLink>
          {playEnabled && <NavLink to="/jogar" onClick={() => { setMobileMenuOpen(false); showInstallSuggestion(); }}>Jogar<small>Entre na arena</small></NavLink>}
        </nav>
      </div>
    </header>
  );
}
