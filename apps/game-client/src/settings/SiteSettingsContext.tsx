import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import { useAuth } from '../auth/AuthContext';

const SiteSettingsContext = createContext({ playEnabled: false, loading: true, failed: false });

export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { user, loading: authLoading } = useAuth();
  const scope = `${pathname}:${authLoading ? 'pending' : user?.id ?? 'anonymous'}`;
  const [state, setState] = useState({ playEnabled: false, checkedPath: '', failed: false });
  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    let request: AbortController | undefined;
    const refresh = async () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch(`${API_BASE_URL}/settings`, { credentials: 'include', cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
        const body = await response.json();
        if (!response.ok || typeof body.data?.can_play !== 'boolean') throw new Error('settings_unavailable');
        const permitted = body.data.can_play && (!user || body.data.viewer_id === user.id);
        if (alive && !controller.signal.aborted) setState({ playEnabled: permitted, checkedPath: scope, failed: false });
      } catch {
        if (alive && !controller.signal.aborted) setState({ playEnabled: false, checkedPath: scope, failed: true });
      }
    };
    const onVisible = () => { if (!document.hidden) void refresh(); };
    void refresh();
    const timer = window.setInterval(onVisible, 15000);
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; request?.abort(); clearInterval(timer); window.removeEventListener('focus', onVisible); document.removeEventListener('visibilitychange', onVisible); };
  }, [scope, authLoading]);
  const loading = state.checkedPath !== scope || authLoading;
  return <SiteSettingsContext.Provider value={{ playEnabled: !loading && state.playEnabled, failed: state.failed, loading }}>{children}</SiteSettingsContext.Provider>;
}

export const useSiteSettings = () => useContext(SiteSettingsContext);

export function PlayAvailability({ children }: { children: ReactNode }) {
  const { playEnabled, loading, failed } = useSiteSettings();
  if (loading) return <div className="route-loading page-container" role="status">Verificando disponibilidade da arena…</div>;
  if (!playEnabled) return <section className="page-container play-lobby"><span className="eyebrow">Arena</span><h1>Voltamos em breve.</h1><p>{failed ? 'Não foi possível verificar a disponibilidade do jogo. Tente novamente em instantes.' : 'O acesso ao jogo está temporariamente desativado.'}</p><p>Você pode continuar consultando cartas e montando seus decks.</p><div className="bot-setup__actions"><Link className="button button--primary" to="/cartas">Explorar cartas</Link><Link className="button button--ghost" to="/meus-decks">Meus decks</Link></div></section>;
  return children;
}
