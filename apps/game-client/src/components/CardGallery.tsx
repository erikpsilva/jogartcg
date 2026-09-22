import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { CardPrinting } from '../services/catalog-api';

const AUTOPLAY_MS = 3500;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Indice da arte visivel. Com `autoPlay`, avanca sozinho enquanto a galeria esta na
 * tela, a aba esta visivel e ninguem esta com o mouse/foco nela. Quem pede menos
 * movimento no sistema nao ve a troca automatica.
 */
export function useGalleryIndex(count: number, options: { autoPlay?: boolean; rootRef?: RefObject<HTMLElement | null>; initial?: number } = {}) {
  const { autoPlay = false, rootRef, initial = 0 } = options;
  const [index, setIndex] = useState(() => Math.min(Math.max(initial, 0), Math.max(count - 1, 0)));
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(!rootRef);

  useEffect(() => { setIndex((current) => (current < count ? current : 0)); }, [count]);

  useEffect(() => {
    const element = rootRef?.current;
    if (!element || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.25 });
    observer.observe(element);
    return () => observer.disconnect();
  }, [rootRef]);

  useEffect(() => {
    if (!autoPlay || count < 2 || paused || !visible || prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') setIndex((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [autoPlay, count, paused, visible]);

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);
  const pauseHandlers = {
    onMouseEnter: () => setPaused(true),
    onMouseLeave: () => setPaused(false),
    onFocus: () => setPaused(true),
    onBlur: () => setPaused(false),
  };
  return { index, go, pauseHandlers };
}

/** Faixa de imagens que desliza; so carrega a arte visivel e a seguinte. */
export function GalleryTrack({ printings, index, alt, size }: { printings: CardPrinting[]; index: number; alt: string; size: 'thumbnail' | 'full' }) {
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  return <div className="card-gallery__viewport">
    <div className="card-gallery__track" style={{ transform: `translateX(-${index * 100}%)` }}>
      {printings.map((printing, position) => {
        const source = size === 'full' ? printing.image.full || printing.image.thumbnail : printing.image.thumbnail || printing.image.full;
        const near = position === index || position === (index + 1) % printings.length;
        return <div className="card-gallery__slide" key={printing.id} aria-hidden={position !== index}>
          {source && !failed[printing.id]
            ? <img src={source} alt={position === index ? alt : ''} loading={near ? 'eager' : 'lazy'} onError={() => setFailed((current) => ({ ...current, [printing.id]: true }))} />
            : <span className="card-gallery__missing">Imagem indisponível</span>}
        </div>;
      })}
    </div>
  </div>;
}

/** Nome curto da arte: "P1 · Especial", "Coleção 5 · Lendária". */
export function printingLabel(printing: CardPrinting): string {
  // "9/P1 • EN • 1" e "1 TFC • EN • 1/P1" -> P1; "7/204 • EN • 1" -> colecao regular.
  const group = printing.identifier?.match(/\/\s*([A-Za-z]+\d*)(?:\s|$)/)?.[1];
  const origin = group && !/^\d+$/.test(group) ? group : `Coleção ${printing.set_code}`;
  return printing.rarity ? `${origin} · ${printing.rarity}` : origin;
}

export function GalleryDots({ printings, index, onSelect }: { printings: CardPrinting[]; index: number; onSelect: (position: number) => void }) {
  if (printings.length < 2) return null;
  return <div className="card-gallery__dots" role="group" aria-label={`${printings.length} artes desta carta`}>
    {printings.map((printing, position) => <button type="button" key={printing.id} aria-label={`Arte ${position + 1}: ${printingLabel(printing)}`} aria-pressed={position === index} onClick={() => onSelect(position)} />)}
  </div>;
}

export function GalleryThumbs({ printings, index, onSelect }: { printings: CardPrinting[]; index: number; onSelect: (position: number) => void }) {
  if (printings.length < 2) return null;
  return <div className="card-gallery__thumbs" role="group" aria-label="Escolher arte">
    {printings.map((printing, position) => <button type="button" key={printing.id} aria-pressed={position === index} onClick={() => onSelect(position)} title={printingLabel(printing)}>
      {printing.image.thumbnail || printing.image.full ? <img src={printing.image.thumbnail || printing.image.full || ''} alt="" loading="lazy" /> : <span />}
      <small>{printingLabel(printing)}</small>
    </button>)}
  </div>;
}

/** Galeria completa (detalhe da carta e escolha de arte no deck): imagem grande, setas e miniaturas. */
export function CardGallery({ printings, alt, selectedId, onSelect }: { printings: CardPrinting[]; alt: string; selectedId?: number; onSelect?: (printing: CardPrinting) => void }) {
  const selectedIndex = Math.max(0, printings.findIndex((printing) => printing.id === selectedId));
  const { index, go } = useGalleryIndex(printings.length, { initial: selectedIndex });
  const current = selectedId !== undefined ? selectedIndex : index;
  const select = (position: number) => {
    const wrapped = ((position % printings.length) + printings.length) % printings.length;
    go(wrapped);
    onSelect?.(printings[wrapped]);
  };
  return <div className="card-gallery card-gallery--full">
    <div className="card-gallery__stage">
      <GalleryTrack printings={printings} index={current} alt={alt} size="full" />
      {printings.length > 1 && <>
        <button type="button" className="card-gallery__arrow card-gallery__arrow--prev" onClick={() => select(current - 1)} aria-label="Arte anterior">‹</button>
        <button type="button" className="card-gallery__arrow card-gallery__arrow--next" onClick={() => select(current + 1)} aria-label="Próxima arte">›</button>
        <span className="card-gallery__counter">{current + 1} / {printings.length}</span>
      </>}
    </div>
    <GalleryThumbs printings={printings} index={current} onSelect={select} />
  </div>;
}
