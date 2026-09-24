import { Link } from 'react-router-dom';
import { WalletIndicators } from '../components/Shop';
import { useEffect, useRef, useState } from 'react';

import { findInkRoute, inkEdges, islandPoints } from './adventure-paths';

const chapters = [
  { name: 'The First Chapter', x: 11, y: 65 },
  { name: 'Rise of the Floodborn', x: 29, y: 85 },
  { name: 'Into the Inklands', x: 29, y: 42 },
  { name: 'Ursula’s Return', x: 49, y: 64 },
  { name: 'Azurite Sea', x: 49, y: 30 },
  { name: 'Reign of Jafar', x: 68, y: 20 },
  { name: 'Winterspell', x: 87, y: 20 },
  { name: 'Whispers in the Well', x: 72, y: 48 },
  { name: 'Castelo das Histórias', x: 65, y: 86 },
  { name: 'A Taça das Histórias', x: 89, y: 78 },
];

export function GameplayPage() {
  const [selected, setSelected] = useState<number | null>(null);
  const [position, setPosition] = useState(-1);
  const [destination, setDestination] = useState<number | null>(null);
  const [heroPoint, setHeroPoint] = useState(islandPoints[-1]);
  const [entered, setEntered] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const hero = useRef<HTMLDivElement>(null);
  const moving = destination !== null;
  const selectChapter = (index: number) => {
    if (moving) return;
    setEntered(false);
    if (position === index) { setSelected(index < 0 ? null : index); return; }
    setSelected(null);
    setDestination(index);

  };
  useEffect(() => {
    if (destination === null) return;
    const route = findInkRoute(position, destination);
    if (route.length < 2) { setDestination(null); return; }
    let frame = 0;
    let cancelled = false;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const travel = async () => {
      for (let i = 1; i < route.length; i++) {
        const from = route[i - 1], to = route[i];
        const edge = inkEdges.find(e => (e.a === from && e.b === to) || (e.b === from && e.a === to))!;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', edge.curve);
        const length = path.getTotalLength();
        const duration = reduced ? 0 : Math.max(1200, length * 65);
        const start = performance.now();
        await new Promise<void>(resolve => {
          const tick = (now: number) => {
            if (cancelled) { resolve(); return; }
            const progress = duration ? Math.min(1, (now - start) / duration) : 1;
            const point = path.getPointAtLength(length * (edge.a === from ? progress : 1 - progress));
            setHeroPoint([point.x, point.y]);
            const viewport = hero.current?.closest('.adventure__viewport');
            if (viewport && hero.current) viewport.scrollLeft = hero.current.offsetLeft - viewport.clientWidth / 2;
            if (progress < 1) frame = requestAnimationFrame(tick);
            else resolve();
          };
          frame = requestAnimationFrame(tick);
        });
        if (cancelled) return;
      }
      setPosition(destination);
      setHeroPoint(islandPoints[destination]);
      setSelected(destination < 0 ? null : destination);
      setDestination(null);
    };
    void travel();
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [destination, position]);
  useEffect(() => {
    if (selected !== null && !dialog.current?.open) dialog.current?.showModal();
    else if (selected === null) dialog.current?.close();
  }, [selected]);
  const chapter = selected === null ? null : chapters[selected];
  // Anchor the feet above the number badge, leaving room for Mickey's label.
  const parkedChapter = !moving && position >= 0 ? chapters[position] : null;
  const heroStyle = parkedChapter
    ? { left: `${parkedChapter.x}%`, top: `calc(${parkedChapter.y}% - 48px)` }
    : { left: `${heroPoint[0]}%`, top: `${heroPoint[1]}%` };
  return <section className="adventure adventure--map" aria-label="Mapa da Aventura Lorcana">
    <nav className="adventure-map-toolbar" aria-label="Controles da aventura">
      <Link to="/cartas" className="adventure-map-exit"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h10" /></svg><span>SAIR</span></Link>
      <span>Aventura Lorcana</span>
      <WalletIndicators />
    </nav>
    <div className="adventure__viewport" tabIndex={0} role="region" aria-label="Mapa dos capítulos da campanha"><div className="adventure__map">
      <img className="adventure__islands" src="./adventure/ilhas-inicio-v2.png" alt="Ilhas de fantasia conectadas por caminhos de tinta" />
      <div ref={hero} className="adventure__hero adventure__hero--on-path" style={heroStyle}><img src="./adventure/mickey-idle.gif" alt="Mickey cavaleiro" /><span>{moving ? 'A caminho…' : position < 0 ? 'Você está aqui' : chapters[position].name}</span></div>
      {chapters.map((item, index) => <button key={item.name} type="button" className={`adventure__chapter${position === index ? ' is-selected' : ''}`} style={{ left: `${item.x}%`, top: `${item.y}%` }} onClick={() => selectChapter(index)} disabled={moving} aria-pressed={position === index} aria-haspopup="dialog"><span className="adventure__chapter-number">{String(index + 1).padStart(2, '0')}</span><strong>{item.name}</strong><small>{destination === index ? 'Destino' : 'Visitar ilha'}</small></button>)}
      <button type="button" className={`adventure__chapter${position === -1 ? ' is-selected' : ''}`} style={{ left: `${islandPoints[-1][0]}%`, top: '27%' }} onClick={() => selectChapter(-1)} disabled={moving} aria-pressed={position === -1} aria-label="Voltar ao início pelos caminhos de tinta"><strong>Início</strong><small>{destination === -1 ? 'Voltando ao início…' : 'Ponto de partida'}</small></button>
    </div></div>
    <dialog ref={dialog} className="adventure__world-dialog" aria-labelledby="adventure-world-title" onCancel={() => setSelected(null)} onClose={() => setSelected(null)}>
      {chapter && <><span className="adventure__eyebrow">Capítulo {String((selected ?? 0) + 1).padStart(2, '0')}</span><h2 id="adventure-world-title">{chapter.name}</h2><p>{entered ? 'Este mundo ainda está em preparação. Os desafios e adversários serão adicionados depois.' : 'Mickey chegou ao seu destino. Deseja entrar neste mundo?'}</p><div className="adventure__world-actions"><button type="button" className="adventure__enter" onClick={() => setEntered(true)} disabled={entered}>Entrar no mundo de {chapter.name}</button><button type="button" onClick={() => setSelected(null)}>Fechar</button></div></>}
    </dialog>
  </section>;
}
