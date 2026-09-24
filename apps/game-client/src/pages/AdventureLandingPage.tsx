import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { GameplayPage } from './GameplayPage';

export function AdventureMapPage() {
  const { user, loading } = useAuth();
  if (loading) return <p className="adventure-access-loading">Verificando acesso à aventura…</p>;
  // No browser storage, query parameter or purchase-button click can grant access.
  if (user?.adventure_access !== true) return <Navigate to="/gameplay" replace />;
  return <GameplayPage />;
}

export function AdventureLandingPage() {
  const { user, loading } = useAuth();
  const [notice, setNotice] = useState(false);
  const unlocked = user?.adventure_access === true;
  if (loading) return <p className="adventure-access-loading" role="status">Verificando acesso à aventura…</p>;
  if (unlocked) return <Navigate to="/gameplay/mapa" replace />;
  return <section className="adventure adventure--landing" aria-labelledby="adventure-title">
    <header className="adventure__heading"><span className="adventure__eyebrow">Aventura Lorcana · Modo campanha</span><h1 id="adventure-title">Toda história começa<br />com uma aventura.</h1><p>Explore as ilhas e descubra o caminho até a Taça das Histórias.</p></header>
    <div className="adventure-offer"><span className="adventure__crest" aria-hidden="true">✦</span><h2>Sua jornada está prestes a começar</h2><p>Viaje com Mickey por um mapa de histórias e prepare-se para os desafios de cada mundo.</p>
      <div className="adventure-offer__price"><span>Libere o modo aventura por</span><strong>R$ 4,99</strong><small>Acesso pago ao modo campanha</small></div>
      {loading ? <p role="status">Verificando seu acesso…</p> : unlocked ? <Link className="adventure-offer__button" to="/gameplay/mapa">Começar aventura <span aria-hidden="true">→</span></Link> : !user ? <Link className="adventure-offer__button" to="/entrar?redirect=%2Fgameplay">Entrar para liberar a aventura</Link> : <button type="button" className="adventure-offer__button" onClick={() => setNotice(true)}>Liberar aventura · R$ 4,99</button>}
      {!unlocked && <p className="adventure-offer__note">Vendas em preparação. O acesso será liberado após a confirmação do pagamento.</p>}
      {notice && <p className="adventure-offer__notice" role="status">O pagamento ainda não está disponível. Nenhuma cobrança foi realizada.</p>}
    </div>
  </section>;
}
