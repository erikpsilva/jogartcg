import { Link } from 'react-router-dom';
import type { CatalogCard } from '../services/catalog-api';

function colorKey(color: string | null): string {
  return (color || 'neutro').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function CardTile({ card, setName }: { card: CatalogCard; setName: string | undefined }) {
  return (
    <article className="card-tile">
      <Link className="card-tile__image-link" to={`/cartas/${card.id}`} aria-label={`Ver ${card.full_name}`}>
        {card.image.thumbnail || card.image.full ? (
          <img
            src={card.image.thumbnail || card.image.full || ''}
            alt={`Carta original ${card.full_name}`}
            loading="lazy"
          />
        ) : (
          <span className="card-tile__image-placeholder">Imagem indisponível</span>
        )}
        <span className="card-tile__view">Ver carta <b>→</b></span>
      </Link>

      <div className="card-tile__content">
        <div className="card-tile__meta">
          <span className="color-dot" data-color={colorKey(card.color)} />
          <span>{card.color || 'Sem cor'}</span>
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
