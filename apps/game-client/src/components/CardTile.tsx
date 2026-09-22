import { useRef } from 'react';
import { Link } from 'react-router-dom';
import type { CardPrinting, CatalogCard } from '../services/catalog-api';
import { GalleryDots, GalleryTrack, useGalleryIndex } from './CardGallery';

function colorKey(color: string | null): string {
  return (color || 'neutro').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Artes da carta; sem galeria (resposta antiga ou sem agrupamento), a imagem da propria carta. */
export function cardPrintingsOf(card: CatalogCard): CardPrinting[] {
  if (card.printings?.length) return card.printings;
  return [{ id: card.id, set_code: card.set_code, number: card.number, identifier: null, rarity: card.rarity, image: { full: card.image.full, thumbnail: card.image.thumbnail } }];
}

export function CardTile({ card, setName }: { card: CatalogCard; setName: string | undefined }) {
  const mediaRef = useRef<HTMLDivElement>(null);
  const printings = cardPrintingsOf(card);
  const { index, go, pauseHandlers } = useGalleryIndex(printings.length, { autoPlay: true, rootRef: mediaRef });
  const current = printings[index] ?? printings[0];

  return (
    <article className="card-tile">
      <div className="card-tile__media" ref={mediaRef} {...pauseHandlers}>
        {/* O link abre a arte que esta na tela. */}
        <Link className="card-tile__image-link" to={`/cartas/${current.id}`} aria-label={`Ver ${card.full_name}`}>
          <GalleryTrack printings={printings} index={index} alt={`Carta original ${card.full_name}`} size="thumbnail" />
          <span className="card-tile__view">Ver carta <b>→</b></span>
          {printings.length > 1 && <span className="card-tile__arts">{printings.length} artes</span>}
        </Link>
        <GalleryDots printings={printings} index={index} onSelect={go} />
      </div>

      <div className="card-tile__content">
        <div className="card-tile__meta">
          <span className="color-dot" data-color={colorKey(card.color)} />
          <span>{card.color || 'Sem cor'}</span>
          <span>•</span>
          <span>{current.rarity || card.rarity || 'Sem raridade'}</span>
        </div>
        <h2><Link to={`/cartas/${current.id}`}>{card.name}</Link></h2>
        {card.version && <p>{card.version}</p>}
        <small>{setName || `Coleção ${card.set_code}`} · #{card.number ?? '—'}</small>

        <div className="card-tile__stats" aria-label="Atributos da carta">
          <span><small>Custo</small><b>{card.cost ?? '—'}</b></span>
          <span><small>Força</small><b>{card.strength ?? '—'}</b></span>
          <span><small>Vontade</small><b>{card.willpower ?? '—'}</b></span>
          <span><small>Lore</small><b>{card.lore ?? '—'}</b></span>
        </div>
      </div>
    </article>
  );
}
