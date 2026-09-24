import { InkColors } from '../components/InkColors';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { deleteDeck, duplicateDeck, listDecks, type SavedDeckSummary } from '../services/deck-api';

export function MyDecksPage() {
  const { csrfToken } = useAuth();
  const [decks, setDecks] = useState<SavedDeckSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listDecks().then(setDecks).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, []);

  async function remove(deck: SavedDeckSummary) {
    if (!window.confirm(`Excluir o deck “${deck.name}”?`)) return;
    try {
      await deleteDeck(deck.id, csrfToken);
      setDecks((current) => current.filter((item) => item.id !== deck.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nao foi possivel excluir o deck.'); }
  }

  async function duplicate(deck: SavedDeckSummary) {
    try {
      const copy = await duplicateDeck(deck.id, csrfToken);
      setDecks((current) => [copy, ...current]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Nao foi possivel duplicar o deck.'); }
  }

  return (
    <div className="my-decks page-container">
      <header className="builder-heading">
        <div><span className="eyebrow"><i /> Sua colecao</span><h1>Meus decks.</h1><p>Continue uma lista salva ou comece uma nova montagem.</p></div>
        <Link className="button button--primary" to="/decks/novo">+ Montar novo deck</Link>
      </header>
      {error && <div className="feedback feedback--error" role="alert">{error}</div>}
      {loading ? <div className="builder-loading">Carregando seus decks…</div> : decks.length === 0 ? (
        <section className="decks-empty"><span>◇</span><h2>Voce ainda nao salvou nenhum deck.</h2><p>Abra o montador, escolha suas cartas e salve mesmo que a lista ainda esteja incompleta.</p><Link className="button button--primary" to="/decks/novo">Criar primeiro deck</Link></section>
      ) : (
        <div className="saved-decks-grid">{decks.map((deck) => (
          <article className="saved-deck-card" key={deck.id}>
            <span className={`deck-status deck-status--${deck.status}`}>{deck.status === 'valido' ? 'Deck valido' : 'Rascunho'}</span>
            <h2>{deck.name}</h2><p>{deck.total_cards} cartas · <InkColors colors={deck.colors} /></p><small>{deck.validation.format?.label || deck.format}</small>
            {!deck.validation.valid && deck.validation.issues[0] && <small>{deck.validation.issues[0]}</small>}
            <div><Link className="button button--primary" to={`/decks/${deck.id}`}>Abrir deck</Link><button className="button button--ghost" type="button" onClick={() => void duplicate(deck)}>Duplicar</button><button className="button button--ghost" type="button" onClick={() => void remove(deck)}>Excluir</button></div>
          </article>
        ))}</div>
      )}
    </div>
  );
}
