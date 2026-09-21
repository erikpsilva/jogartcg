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

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="route-loading page-container">Verificando sua conta…</div>;
  if (!user) return <Navigate to={`/entrar?redirect=${encodeURIComponent(location.pathname)}`} replace />;
  return children;
}

export function App() {
  const location = useLocation();
  const isGameTable = location.pathname === '/jogar';
  return (
    <div className={`app-shell ${isGameTable ? 'app-shell--game' : ''}`}>
      {!isGameTable && <AppHeader />}
      <main className={isGameTable ? 'game-main' : 'site-main'}>
        <Routes>
          <Route path="/" element={<Navigate to="/cartas" replace />} />
          <Route path="/cartas" element={<CatalogPage />} />
          <Route path="/cartas/:cardId" element={<CardDetailPage />} />
          <Route path="/meus-decks" element={<ProtectedRoute><MyDecksPage /></ProtectedRoute>} />
          <Route path="/meus-dados" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/decks" element={<Navigate to="/meus-decks" replace />} />
          <Route path="/decks/novo" element={<ProtectedRoute><DeckBuilderPage /></ProtectedRoute>} />
          <Route path="/decks/:deckId" element={<ProtectedRoute><DeckBuilderPage /></ProtectedRoute>} />
          <Route path="/jogar" element={<ProtectedRoute><GameTablePage /></ProtectedRoute>} />
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/cadastro" element={<RegistrationPage />} />
          <Route path="*" element={<Navigate to="/cartas" replace />} />
        </Routes>
      </main>
      {!isGameTable && <AppFooter />}
    </div>
  );
}
