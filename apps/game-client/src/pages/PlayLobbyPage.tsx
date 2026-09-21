import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { compileCardRules } from '@jogartcg/game-core';
import { useAuth } from '../auth/AuthContext';
import { listDecks, type SavedDeckSummary } from '../services/deck-api';
import { getGameCatalog, getGameDeck, type GameDeck } from '../services/game-api';
import { beginBotMatch, loadBotMatch } from '../game/bot-session';
import { trainingDecks } from '../game/training-decks';

function DeckCheck({ deck, label }: { deck: GameDeck; label: string }) {
  const unsupported = deck.cards.filter(({ card }) => !compileCardRules(card).supported);
  return <article className="match-deck-check">
    <span>{label}</span><h3>{deck.name}</h3>
    <p>{deck.total_cards} cartas · {deck.colors.join(' + ')}</p>
    {!deck.validation.valid && <div className="feedback feedback--error">{deck.validation.issues.join(' ')}</div>}
    {!['core', 'infinity'].includes(deck.format) && <p>O treino atual usa decks Core ou Infinity. Outros formatos terão preparação própria.</p>}
    {unsupported.length > 0 ? <details open><summary>{unsupported.length} carta(s) ainda precisam de habilidades implementadas</summary>
      <p>O deck está liberado para teste. As regras reconhecidas funcionarão normalmente; somente os efeitos abaixo ainda serão ignorados.</p>
      <ul>{unsupported.map(({ card }) => <li key={card.id}><Link to={`/cartas/${card.id}`}>{card.full_name}</Link><small>{compileCardRules(card).unsupported.join(' · ')}</small></li>)}</ul>
    </details> : <p className="match-deck-check__ready">✓ Todas as habilidades desta lista são reconhecidas.</p>}
  </article>;
}

export function PlayLobbyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<SavedDeckSummary[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [botId, setBotId] = useState('');
  const [prepared, setPrepared] = useState<[GameDeck, GameDeck] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(false);
  const [training, setTraining] = useState(false);
  const hasMatch = user ? Boolean(loadBotMatch(user.id)) : false;

  useEffect(() => {
    let alive = true;
    listDecks().then((items) => { if (alive) setDecks(items); })
      .catch((reason: Error) => { if (alive) setError(reason.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setPrepared(null);
    if (!playerId || !botId) return;
    const abort = new AbortController();
    setChecking(true); setError('');
    Promise.all([getGameDeck(Number(playerId), abort.signal), getGameDeck(Number(botId), abort.signal)])
      .then((result) => { if (!abort.signal.aborted) setPrepared(result); })
      .catch((reason: Error) => { if (!abort.signal.aborted) setError(reason.message); })
      .finally(() => { if (!abort.signal.aborted) setChecking(false); });
    return () => abort.abort();
  }, [playerId, botId]);

  const ready = prepared?.every((deck) => ['core', 'infinity'].includes(deck.format) && deck.validation.valid);
  async function quickTraining() {
    if (!user || training) return;
    setTraining(true); setError('');
    try {
      const pair = trainingDecks(await getGameCatalog());
      beginBotMatch(user.id, user.nome, pair[0], pair[1]);
      navigate('/jogar/bot');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o treino.'); }
    finally { setTraining(false); }
  }
  function start() {
    if (!prepared || !ready || !user) return;
    try {
      beginBotMatch(user.id, user.nome, prepared[0], prepared[1]);
      navigate('/jogar/bot');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar.'); }
  }

  return <div className="play-lobby page-container">
    <header className="builder-heading"><div><span className="eyebrow"><i /> Arena</span><h1>Hora de jogar.</h1><p>Escolha seu adversário e leve seus decks para a mesa.</p></div>
      {hasMatch && <Link className="button button--ghost" to="/jogar/bot">Continuar treino</Link>}
    </header>
    <div className="play-modes">
      <button className={`play-mode ${mode ? 'play-mode--active' : ''}`} onClick={() => setMode(true)}><span aria-hidden="true">◇</span><strong>Contra o bot</strong><p>Escolha os dois decks. Tinta, combate e efeitos são resolvidos durante a partida.</p><b>Preparar partida →</b></button>
      <div className="play-mode play-mode--soon"><span aria-hidden="true">＋</span><strong>Criar sala</strong><p>Convide outro jogador para a sua mesa.</p><b>Em breve</b></div>
      <div className="play-mode play-mode--soon"><span aria-hidden="true">↪</span><strong>Entrar em uma sala</strong><p>Encontre uma partida com um código de convite.</p><b>Em breve</b></div>
    </div>
    {error && <div className="feedback feedback--error" role="alert">{error}</div>}
    {mode && <section className="bot-setup" aria-label="Preparar partida contra o bot">
      <div className="bot-setup__heading"><h2>Você escolhe os dois lados.</h2><p>O bot usa um dos seus decks salvos. Você pode escolher a mesma lista para os dois.</p></div>
      <div className="bot-setup__actions"><button className="button button--ghost" disabled={training} onClick={() => void quickTraining()}>{training ? 'Preparando cartas…' : 'Testar com duas listas prontas'}</button><span>Treino de 60 cartas com habilidades já disponíveis.</span></div>
      {loading ? <p role="status">Carregando seus decks…</p> : !decks.length ? <p>Você ainda não possui decks. <Link to="/decks/novo">Monte e salve seu primeiro deck.</Link></p> : <>
        <div className="bot-setup__fields">{([{ label: 'Seu deck', value: playerId, set: setPlayerId }, { label: 'Deck do bot', value: botId, set: setBotId }]).map(({ label, value, set }) => <label key={label}><span>{label}</span><select value={value} onChange={(event) => set(event.target.value)}><option value="">Selecione um deck salvo</option>{decks.map((deck) => <option value={deck.id} key={deck.id}>{deck.name} · {deck.total_cards} cartas</option>)}</select></label>)}</div>
        {checking && <p role="status">Conferindo formato e habilidades das cartas…</p>}
        {prepared && <div className="bot-setup__checks"><DeckCheck deck={prepared[0]} label="Você" /><DeckCheck deck={prepared[1]} label="Bot" /></div>}
        <div className="bot-setup__actions"><button className="button button--primary" disabled={!ready || checking} onClick={start}>Iniciar partida contra o bot</button><Link to="/meus-decks">Gerenciar meus decks</Link></div>
        <p className="bot-setup__note">Treino neste dispositivo, com retomada ao atualizar a página. Efeitos ainda não implementados são ignorados e estas partidas não valem para ranking.</p>
      </>}
    </section>}
    <Link className="play-lobby__prototype" to="/jogar/mesa-teste">Abrir a mesa de demonstração visual</Link>
  </div>;
}
