import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { NavLink as RouterNavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useInstallApp } from '../pwa/InstallContext';
import { useSiteSettings } from '../settings/SiteSettingsContext';
import { WalletIndicators } from './Shop';
import { RewardShortcuts } from './RewardShortcuts';

export function AppHeader({ clientBase, starterActive = false }: { clientBase?: string; starterActive?: boolean } = {}) {
  const NavLink = (props: ComponentProps<typeof RouterNavLink>) => clientBase
    ? <a href={`${clientBase}#${String(props.to)}`} className={typeof props.className === 'string' ? props.className : undefined} onClick={props.onClick} aria-label={props['aria-label']}>{props.children as ReactNode}</a>
    : <RouterNavLink {...props} />;
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const { playEnabled } = useSiteSettings();
  const { installed, showInstallSuggestion } = useInstallApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const userMenuRef = useRef<HTMLDetailsElement>(null);
  const closeUserMenu = () => { if (userMenuRef.current) userMenuRef.current.open = false; };
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !userMenuRef.current?.contains(event.target)) closeUserMenu();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && userMenuRef.current?.open) {
        closeUserMenu();
        userMenuRef.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, []);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const updateHeight = () => document.documentElement.style.setProperty('--site-header-height', `${header.getBoundingClientRect().height}px`);
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--site-header-height'); };
  }, []);

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
      {user && <NavLink to="/inventario" onClick={() => setMobileMenuOpen(false)}>Meu inventário<small>Personagens, playmats e versos</small></NavLink>}
      {user?.shop_access && <NavLink to="/loja" onClick={() => setMobileMenuOpen(false)}>Loja<small>Playmats e versos de cartas</small></NavLink>}
    </nav>
  </div>;

  return <>
    <header ref={headerRef} className="site-header">
      <div className="site-header__inner">
        <div className="site-header__brand-group">
          <NavLink className="brand" to="/cartas" aria-label="Jogar TCG — catálogo"><img src={`${clientBase || './'}brand/logo-jogar-tcg.png`} alt="Jogar TCG" /></NavLink>
          <button className="install-button" type="button" disabled={installed} onClick={showInstallSuggestion} aria-label={installed ? 'Aplicativo instalado' : 'Instalar aplicativo'} title={installed ? 'Aplicativo instalado' : 'Instalar aplicativo'}><span aria-hidden="true">{installed ? '✓' : '↓'}</span><span className="install-button__label">{installed ? 'Instalado' : 'Instalar'}</span></button>
        </div>
        <nav className="site-nav site-sidebar" aria-label="Navegação principal">
          {user?.shop_access && <NavLink to="/loja">Loja</NavLink>}
          {playEnabled && <NavLink to="/jogar" onClick={showInstallSuggestion}>Modo Versus</NavLink>}<NavLink to="/meus-decks">Meus decks</NavLink><NavLink to="/cartas">Catálogo</NavLink><a href="../starter-decks/" className={starterActive ? 'active' : undefined} aria-current={starterActive ? 'page' : undefined} data-native-starters="true">Starter Deck</a><NavLink to="/gameplay">Aventura Lorcana</NavLink>
        </nav>
        <div className="site-header__actions">
          {user && <RewardShortcuts assetBase={clientBase || './'} />}
          {user && <WalletIndicators assetBase={clientBase || './'} />}
          <div className="site-header__account">{!loading && user ? (
            <details ref={userMenuRef} className="user-menu">
              <summary className="user-chip">{user.foto_perfil ? <img src={user.foto_perfil} alt="" /> : <span>{user.nome.charAt(0)}{user.sobrenome.charAt(0)}</span>}<b>{user.nome}</b><i>⌄</i></summary>
              <div className="user-menu__dropdown" onClick={(event) => { if (event.target instanceof Element && event.target.closest('a, button')) closeUserMenu(); }}>
                <NavLink to="/inventario"><strong>Meu inventário</strong><small>Personagens, playmats e versos</small></NavLink>
                <NavLink to="/meus-decks"><strong>Meus decks</strong><small>Listas salvas</small></NavLink>
                <NavLink to="/meus-dados"><strong>Meus dados</strong><small>Perfil e senha</small></NavLink>
                <button type="button" onClick={() => void handleLogout()}><strong>Sair</strong><small>Encerrar sessão</small></button>
              </div>
            </details>
          ) : <NavLink className="button button--ghost" to="/entrar" state={{ scrollToLogin: true }}>Entrar</NavLink>}
            <button className="mobile-menu-toggle" type="button" aria-expanded={mobileMenuOpen} aria-controls="mobile-site-menu" aria-label={mobileMenuOpen ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMobileMenuOpen((open) => !open)}><span /><span /><span /></button>
          </div>
        </div>
      </div>
    </header>
    {createPortal(mobileMenu, document.body)}
  </>;
}
