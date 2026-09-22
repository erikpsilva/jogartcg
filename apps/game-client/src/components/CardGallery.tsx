import { useState } from 'react';
import type { CardPrinting } from '../services/catalog-api';

/** Faixa de imagens que desliza; so carrega a arte visivel e a seguinte. */
function GalleryTrack({ printings, index, alt }: { printings: CardPrinting[]; index: number; alt: string }) {
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  return <div className="card-gallery__viewport">
    <div className="card-gallery__track" style={{ transform: `translateX(-${index * 100}%)` }}>
      {printings.map((printing, position) => {
        const source = printing.image.full || printing.image.thumbnail;
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

function GalleryThumbs({ printings, index, onSelect }: { printings: CardPrinting[]; index: number; onSelect: (position: number) => void }) {
  if (printings.length < 2) return null;
  return <div className="card-gallery__thumbs" role="group" aria-label="Escolher arte">
    {printings.map((printing, position) => <button type="button" key={printing.id} aria-pressed={position === index} onClick={() => onSelect(position)} title={printingLabel(printing)}>
      {printing.image.thumbnail || printing.image.full ? <img src={printing.image.thumbnail || printing.image.full || ''} alt="" loading="lazy" /> : <span />}
      <small>{printingLabel(printing)}</small>
    </button>)}
  </div>;
}

/**
 * Galeria das artes de uma carta (detalhe da carta e escolha de arte no deck):
 * imagem grande, setas e miniaturas. So troca de arte quando a pessoa escolhe.
 */
export function CardGallery({ printings, alt, selectedId, onSelect }: { printings: CardPrinting[]; alt: string; selectedId?: number; onSelect?: (printing: CardPrinting) => void }) {
  const selectedIndex = Math.max(0, printings.findIndex((printing) => printing.id === selectedId));
  const [ownIndex, setOwnIndex] = useState(selectedIndex);
  const current = selectedId !== undefined ? selectedIndex : Math.min(ownIndex, printings.length - 1);
  const select = (position: number) => {
    const wrapped = ((position % printings.length) + printings.length) % printings.length;
    setOwnIndex(wrapped);
    onSelect?.(printings[wrapped]);
  };
  return <div className="card-gallery card-gallery--full">
    <div className="card-gallery__stage">
      <GalleryTrack printings={printings} index={current} alt={alt} />
      {printings.length > 1 && <>
        <button type="button" className="card-gallery__arrow card-gallery__arrow--prev" onClick={() => select(current - 1)} aria-label="Arte anterior">‹</button>
        <button type="button" className="card-gallery__arrow card-gallery__arrow--next" onClick={() => select(current + 1)} aria-label="Próxima arte">›</button>
        <span className="card-gallery__counter">{current + 1} / {printings.length}</span>
      </>}
    </div>
    <GalleryThumbs printings={printings} index={current} onSelect={select} />
  </div>;
}
