import { type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { AppFooter } from './components/AppFooter';
import { AppHeader } from './components/AppHeader';
import { CardDetailPage } from './pages/CardDetailPage';
import { CatalogPage } from './pages/CatalogPage';
import { DeckBuilderPage } from './pages/DeckBuilderPage';
import { LoginPage } from './pages/LoginPage';
import { RegistrationPage } from './pages/RegistrationPage';
import { MyDecksPage } from './pages/MyDecksPage';
import { ProfilePage } from './pages/ProfilePage';
import { GameTablePage } from './pages/GameTablePage';
import { PlayLobbyPage } from './pages/PlayLobbyPage';
import { BotGamePage } from './pages/BotGamePage';
import { OnlineGamePage } from './pages/OnlineGamePage';
import { GameplayPage } from './pages/GameplayPage';
import { PlayAvailability, useSiteSettings } from './settings/SiteSettingsContext';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="route-loading page-container">Verificando sua conta…</div>;
  if (!user) return <Navigate to={`/entrar?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

export function App() {
  const location = useLocation();
  const { playEnabled, loading } = useSiteSettings();
  const isGameTable = playEnabled && !loading && (['/jogar/bot', '/jogar/mesa-teste'].includes(location.pathname) || location.pathname.startsWith('/jogar/online/'));
  return (
    <div className={`app-shell ${isGameTable ? 'app-shell--game' : ''}`}>
      {!isGameTable && <AppHeader />}
      <main className={isGameTable ? 'game-main' : 'site-main'}>
        <Routes>
          <Route path="/" element={<Navigate to="/cartas" replace />} />
          <Route path="/cartas" element={<CatalogPage />} />
          <Route path="/gameplay" element={<GameplayPage />} />
          <Route path="/cartas/:cardId" element={<CardDetailPage />} />
          <Route path="/meus-decks" element={<ProtectedRoute><MyDecksPage /></ProtectedRoute>} />
          <Route path="/meus-dados" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/decks" element={<Navigate to="/meus-decks" replace />} />
          <Route path="/decks/novo" element={<ProtectedRoute><DeckBuilderPage /></ProtectedRoute>} />
          <Route path="/decks/:deckId" element={<ProtectedRoute><DeckBuilderPage /></ProtectedRoute>} />
          <Route path="/jogar" element={<PlayAvailability><ProtectedRoute><PlayLobbyPage /></ProtectedRoute></PlayAvailability>} />
          <Route path="/jogar/bot" element={<PlayAvailability><ProtectedRoute><BotGamePage /></ProtectedRoute></PlayAvailability>} />
          <Route path="/jogar/online/:roomId" element={<PlayAvailability><ProtectedRoute><OnlineGamePage /></ProtectedRoute></PlayAvailability>} />
          <Route path="/jogar/mesa-teste" element={<PlayAvailability><ProtectedRoute><GameTablePage /></ProtectedRoute></PlayAvailability>} />
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/cadastro" element={<RegistrationPage />} />
          <Route path="*" element={<Navigate to="/cartas" replace />} />
        </Routes>
      </main>
      {!isGameTable && <AppFooter />}
    </div>
  );
}
