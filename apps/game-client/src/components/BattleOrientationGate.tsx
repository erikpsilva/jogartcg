import { useSyncExternalStore, type ReactNode } from 'react';
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

// Used by battle pages and adventure maps, not the site shell or deck preparation.
export function useBattleOrientationBlocked() {
  return useSyncExternalStore(subscribeToOrientation, isPortraitBattleViewport, () => false);
}

export function BattleOrientationGate({ adventure=false }: {adventure?:boolean} = {}) {
  return (
    <section className="rotate-device-gate" aria-labelledby="battle-orientation-title">
      <div className="rotate-device-gate__phone" aria-hidden="true"><span /></div>
      <h1 id="battle-orientation-title">Gire o celular</h1>
      <p>{adventure?'Para explorar os mapas da Aventura Lorcana, vire o celular na horizontal. O mapa aparece automaticamente ao girar.':'Para jogar esta partida, vire o celular na horizontal. Os mapas da aventura também usam a orientação horizontal.'}</p>
      <Link className="button button--primary" to={adventure?'/cartas':'/jogar'}>{adventure?'Voltar ao início':'Voltar ao menu Jogar'}</Link>
    </section>
  );
}

export function AdventureOrientationBoundary({children}:{children:ReactNode}) {
  const blocked=useBattleOrientationBlocked();
  return blocked?<BattleOrientationGate adventure/>:children;
}
