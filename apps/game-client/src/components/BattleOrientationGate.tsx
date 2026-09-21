import { useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';

const portraitBattleQuery = '(max-width: 950px) and (orientation: portrait)';

function isPortraitBattleViewport() {
  return window.matchMedia(portraitBattleQuery).matches;
}

function subscribeToOrientation(onChange: () => void) {
  const query = window.matchMedia(portraitBattleQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

// Use only inside a battle page, never in the site shell or deck preparation.
export function useBattleOrientationBlocked() {
  return useSyncExternalStore(subscribeToOrientation, isPortraitBattleViewport, () => false);
}

export function BattleOrientationGate() {
  return (
    <section className="rotate-device-gate" aria-labelledby="battle-orientation-title">
      <div className="rotate-device-gate__phone" aria-hidden="true"><span /></div>
      <h1 id="battle-orientation-title">Gire o celular</h1>
      <p>Para jogar esta partida, vire o celular na horizontal. As outras telas podem ser usadas em pé.</p>
      <Link className="button button--primary" to="/jogar">Voltar ao menu Jogar</Link>
    </section>
  );
}
