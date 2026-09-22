import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getCard, type CardDetail } from '../services/catalog-api';
import { CardText } from '../components/CardText';

export function CardDetailPage() {
  const { cardId } = useParams();
  const numericId = Number(cardId);
  const [card, setCard] = useState<CardDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!Number.isInteger(numericId) || numericId <= 0) {
      setError('Identificador de carta inválido.');
      return;
    }

    const controller = new AbortController();
    getCard(numericId, controller.signal)
      .then((response) => setCard(response.data))
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar a carta.');
        }
      });
    return () => controller.abort();
  }, [numericId]);

  if (error) {
    return <div className="page-container"><div className="feedback feedback--error">{error}</div></div>;
  }

  if (!card) {
    return <div className="page-container"><div className="detail-skeleton">Carregando carta…</div></div>;
  }

  return (
    <div className="card-detail page-container">
      <Link className="back-link" to="/cartas">← Voltar ao catálogo</Link>

      <div className="card-detail__layout">
        <section className="card-detail__visual">
          <img src={card.image.full || card.image.thumbnail || ''} alt={`Carta original ${card.original.full_name || card.full_name}`} />
          <p>A imagem da carta permanece original e sem sobreposição.</p>
        </section>

        <section className="card-detail__content">
          <div className="card-detail__heading">
            <span className="eyebrow">Coleção {card.set_code} · Carta #{card.number ?? '—'}</span>
            <h1>{card.pt_br.full_name || card.full_name}</h1>
            {/* Nomes nao sao traduzidos: o original so aparece se por algum motivo diferir. */}
            {card.original.full_name && card.original.full_name !== (card.pt_br.full_name || card.full_name) && <p>{card.original.full_name}</p>}
          </div>

          <div className="detail-tags">
            <span>{card.color}</span>
            <span>{card.type}</span>
            <span>{card.rarity}</span>
            {card.inkwell && <span>Tinteiro</span>}
          </div>

          <dl className="detail-stats">
            <div><dt>Custo</dt><dd>{card.cost ?? '—'}</dd></div>
            <div><dt>Força</dt><dd>{card.strength ?? '—'}</dd></div>
            <div><dt>Vontade</dt><dd>{card.willpower ?? '—'}</dd></div>
            <div><dt>Lore</dt><dd>{card.lore ?? '—'}</dd></div>
          </dl>

          <div className="translation-panel">
            <span className="translation-panel__label">Tradução PT-BR</span>
            {card.pt_br.subtypes_text && <strong>{card.pt_br.subtypes_text}</strong>}
            <p>{card.pt_br.full_text ? <CardText text={card.pt_br.full_text} /> : 'Esta carta não possui texto de regras.'}</p>
            {card.pt_br.flavor_text && <blockquote>{card.pt_br.flavor_text}</blockquote>}
          </div>

          <details className="original-panel">
            <summary>Conferir texto original em inglês</summary>
            {card.original.subtypes_text && <strong>{card.original.subtypes_text}</strong>}
            <p>{card.original.full_text ? <CardText text={card.original.full_text} /> : 'This card has no rules text.'}</p>
            {card.original.flavor_text && <blockquote>{card.original.flavor_text}</blockquote>}
          </details>

          <div className="card-detail__actions">
            <Link className="button button--primary" to={`/decks/novo?carta=${card.id}`}>Usar em um deck</Link>
            <span>Será necessário entrar para montar e salvar decks.</span>
          </div>
        </section>
      </div>
    </div>
  );
}
