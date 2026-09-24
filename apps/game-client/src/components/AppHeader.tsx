import { useEffect, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useInstallApp } from '../pwa/InstallContext';
import { useSiteSettings } from '../settings/SiteSettingsContext';

export function AppHeader({ clientBase, starterActive = false }: { clientBase?: string; starterActive?: boolean } = {}) {
  const NavLink = (props: ComponentProps<typeof RouterNavLink>) => clientBase
    ? <a href={`${clientBase}#${String(props.to)}`} className={typeof props.className === 'string' ? props.className : undefined} onClick={props.onClick} aria-label={props['aria-label']}>{props.children as ReactNode}</a>
    : <RouterNavLink {...props} />;
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
    try { await logout(); } finally { if (clientBase) window.location.assign(`${clientBase}#/cartas`); else navigate('/cartas'); }
  }

  const mobileMenu = <div className={`mobile-site-menu ${mobileMenuOpen ? 'mobile-site-menu--open' : ''}`} id="mobile-site-menu" aria-hidden={!mobileMenuOpen}>
    <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="Fechar menu">×</button>
    <nav aria-label="Navegação mobile">
      {playEnabled && <NavLink to="/jogar" onClick={() => { setMobileMenuOpen(false); showInstallSuggestion(); }}>Modo Versus<small>Entre na arena</small></NavLink>}
      <NavLink to="/meus-decks" onClick={() => setMobileMenuOpen(false)}>Meus decks<small>Monte e gerencie suas listas</small></NavLink>
      <NavLink to="/cartas" onClick={() => setMobileMenuOpen(false)}>Catálogo<small>Consulte o catálogo completo</small></NavLink>
      <a href="../starter-decks/" className={starterActive ? 'active' : undefined} aria-current={starterActive ? 'page' : undefined} data-native-starters="true">Starter Deck<small>Listas originais para sua coleção</small></a>
      <NavLink to="/gameplay" onClick={() => setMobileMenuOpen(false)}>Aventura Lorcana</NavLink>
    </nav>
  </div>;

  return <>
    <header className="site-header">
      <div className="site-header__inner">
        <NavLink className="brand" to="/cartas" aria-label="Jogar TCG — catálogo"><img src={`${clientBase || './'}brand/logo-jogar-tcg.png`} alt="Jogar TCG" /></NavLink>
        <nav className="site-nav" aria-label="Navegação principal">
          {playEnabled && <NavLink to="/jogar" onClick={showInstallSuggestion}>Modo Versus</NavLink>}<NavLink to="/meus-decks">Meus decks</NavLink><NavLink to="/cartas">Catálogo</NavLink><a href="../starter-decks/" className={starterActive ? 'active' : undefined} aria-current={starterActive ? 'page' : undefined} data-native-starters="true">Starter Deck</a><NavLink to="/gameplay">Aventura Lorcana</NavLink>
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
          ) : <NavLink className="button button--ghost" to="/entrar" state={{ scrollToLogin: true }}>Entrar</NavLink>}
            <button className="mobile-menu-toggle" type="button" aria-expanded={mobileMenuOpen} aria-controls="mobile-site-menu" aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMobileMenuOpen((open) => !open)}><span /><span /><span /></button>
          </div>
          <NavLink className="button button--primary" to="/decks/novo"><span>+</span> Montar deck</NavLink>
        </div>
      </div>
    </header>
    {createPortal(mobileMenu, document.body)}
  </>;
}
