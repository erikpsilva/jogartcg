import { InkColors } from './InkColors';
import { Link } from 'react-router-dom';
import type { CardPrinting, CatalogCard } from '../services/catalog-api';


/** Artes da carta; sem galeria (resposta antiga ou sem agrupamento), a imagem da propria carta. */
export function cardPrintingsOf(card: CatalogCard): CardPrinting[] {
  if (card.printings?.length) return card.printings;
  return [{ id: card.id, set_code: card.set_code, number: card.number, identifier: null, rarity: card.rarity, image: { full: card.image.full, thumbnail: card.image.thumbnail } }];
}

/** No catalogo aparece a arte principal; as outras artes sao escolhidas nos detalhes da carta. */
export function CardTile({ card, setName }: { card: CatalogCard; setName: string | undefined }) {
  const printings = cardPrintingsOf(card);
  const image = printings[0].image.thumbnail || printings[0].image.full;

  return (
    <article className="card-tile">
      <Link className="card-tile__image-link" to={`/cartas/${card.id}`} aria-label={`Ver ${card.full_name}`}>
        {image ? (
          <img src={image} alt={`Carta original ${card.full_name}`} loading="lazy" />
        ) : (
          <span className="card-tile__image-placeholder">Imagem indisponível</span>
        )}
        <span className="card-tile__view">Ver carta <b>→</b></span>
        {printings.length > 1 && <span className="card-tile__arts">{printings.length} artes</span>}
      </Link>

      <div className="card-tile__content">
        <div className="card-tile__meta">
          
          <InkColors colors={card.color} />
          <span>•</span>
          <span>{card.rarity || 'Sem raridade'}</span>
        </div>
        <h2><Link to={`/cartas/${card.id}`}>{card.name}</Link></h2>
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
