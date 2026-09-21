import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BattleOrientationGate, useBattleOrientationBlocked } from '../components/BattleOrientationGate';
import { getCard, getCards, type CardDetail, type CatalogCard } from '../services/catalog-api';

type ZoneCard = CatalogCard & { exhausted?: boolean; facedown?: boolean };
type CardZone = 'hand' | 'player-field' | 'opponent-field';

function PlayerAvatar({ name, opponent = false }: { name: string; opponent?: boolean }) {
  return <span className={`table-avatar ${opponent ? 'table-avatar--opponent' : ''}`}>{opponent ? 'OP' : name.slice(0, 2).toUpperCase()}</span>;
}

function CardFace({ card, className = '', exhausted = false, onClick }: { card?: ZoneCard; className?: string; exhausted?: boolean; onClick?: () => void }) {
  const facedown = !card || card.facedown;
  return (
    <button className={`game-card ${facedown ? 'game-card--back' : ''} ${card?.exhausted || exhausted ? 'game-card--exhausted' : ''} ${className}`} type="button" onClick={onClick} aria-label={facedown ? 'Carta virada para baixo' : card.full_name}>
      <img src={facedown ? './brand/lor-card-back.webp' : card.image.full || card.image.thumbnail || ''} alt="" />
      {!facedown && <span>{card.cost ?? '—'}</span>}
    </button>
  );
}

export function GameTablePage() {
  const orientationBlocked = useBattleOrientationBlocked();
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [selected, setSelected] = useState<ZoneCard | null>(null);
  const [selectedZone, setSelectedZone] = useState<CardZone>('hand');
  const [selectedDetail, setSelectedDetail] = useState<CardDetail | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [playerTurn, setPlayerTurn] = useState(true);
  const playerLore = 6;
  const opponentLore = 8;
  const totalPlayerInk = 6;
  const totalOpponentInk = 6;
  const [playerInkUsed, setPlayerInkUsed] = useState(2);
  const opponentInkUsed = 2;
  const playerInk = totalPlayerInk - playerInkUsed;
  const opponentInk = totalOpponentInk - opponentInkUsed;
  const [showDiscard, setShowDiscard] = useState(false);
  const [discardPile, setDiscardPile] = useState<CatalogCard[]>([]);
  const [opponentDiscardPile, setOpponentDiscardPile] = useState<CatalogCard[]>([]);
  const [discardOwner, setDiscardOwner] = useState<'player' | 'opponent'>('player');
  const [discardMessage, setDiscardMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ format: 'core', page: '2' });
    getCards(params, controller.signal).then((response) => {
      setCards(response.data.slice(0, 14));
      setDiscardPile(response.data.slice(14, 18));
      setOpponentDiscardPile(response.data.slice(18, 21));
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!selected) {
      setSelectedDetail(null);
      return;
    }
    const controller = new AbortController();
    setSelectedDetail(null);
    getCard(selected.id, controller.signal).then((response) => setSelectedDetail(response.data)).catch(() => undefined);
    return () => controller.abort();
  }, [selected?.id]);

  const hand = useMemo(() => cards.slice(0, 6), [cards]);
  const playerField = useMemo(() => cards.slice(6, 11).map((card, index) => ({ ...card, exhausted: index === 2 })), [cards]);
  const opponentField = useMemo(() => cards.slice(11, 13), [cards]);
  const topDiscard = discardPile[0];
  const topOpponentDiscard = opponentDiscardPile[0];
  const viewedDiscardPile = discardOwner === 'player' ? discardPile : opponentDiscardPile;
  const inspectCard = (card: ZoneCard, zone: CardZone) => {
    setSelected(card);
    setSelectedZone(zone);
    setActionMessage('');
  };
  const simulateAction = (message: string) => setActionMessage(`${message} — ação visual simulada.`);
  const recoverDiscard = (card: CatalogCard) => {
    setDiscardPile((current) => current.filter((item) => item.id !== card.id));
    setDiscardMessage(`${card.full_name} voltou para sua mão.`);
  };
  const openDiscard = (owner: 'player' | 'opponent') => {
    setDiscardOwner(owner);
    setDiscardMessage('');
    setShowDiscard(true);
  };

  if (orientationBlocked) return <BattleOrientationGate />;

  return (
    <div className="game-table-page">
      <div className="game-table-topbar">
        <Link className="game-table-brand" to="/cartas"><img src="./brand/logo-jogar-tcg.png" alt="Jogar TCG" /></Link>
        <div className="game-table-round"><span>Partida de teste</span><strong>{playerTurn ? 'Seu turno' : 'Turno do oponente'}</strong></div>
        <div className="game-table-topactions"><Link to="/meus-decks" aria-label="Sair da mesa"><span aria-hidden="true">↪</span>Sair</Link></div>
      </div>

      <main className="game-board">
        <div className="board-ornament board-ornament--top" />
        <div className="opponent-hand" aria-label="Mão do oponente">{Array.from({ length: 5 }, (_, index) => <CardFace key={index} className={`opponent-hand__card opponent-hand__card--${index + 1}`} />)}</div>
        <div className="opponent-zone">
          <div className="field-row field-row--opponent">{opponentField.map((card) => <CardFace card={card} key={card.id} onClick={() => inspectCard(card, 'opponent-field')} />)}</div>
        </div>
        <div className="deck-stack deck-stack--opponent"><CardFace /><i>32</i></div>
        <div className="ink-zone ink-zone--opponent"><div>{Array.from({ length: totalOpponentInk }, (_, index) => <CardFace key={index} exhausted={index >= totalOpponentInk - opponentInkUsed} />)}</div></div>
        <button className="discard-board-pile discard-board-pile--opponent" type="button" onClick={() => openDiscard('opponent')} aria-label={`Abrir descarte do oponente com ${opponentDiscardPile.length} cartas`}>
          {topOpponentDiscard ? <img src={topOpponentDiscard.image.thumbnail || topOpponentDiscard.image.full || ''} alt="" /> : <span>Vazia</span>}
          <b>{opponentDiscardPile.length}</b><small>Descarte</small>
        </button>
        <div className="board-divider"><span>CAMPO DE DESAFIO</span></div>
        <div className="player-zone">
          <div className="field-row">{playerField.map((card) => <CardFace card={card} key={card.id} onClick={() => inspectCard(card, 'player-field')} />)}</div>
        </div>
        <div className="deck-stack deck-stack--player"><CardFace /><i>28</i></div>
        <div className="ink-zone ink-zone--player"><div>{Array.from({ length: totalPlayerInk }, (_, index) => <CardFace key={index} exhausted={index < playerInkUsed} onClick={() => setPlayerInkUsed(index < playerInkUsed ? index : index + 1)} />)}</div></div>
        <button className="discard-board-pile discard-board-pile--player" type="button" onClick={() => openDiscard('player')} aria-label={`Abrir pilha de descarte com ${discardPile.length} cartas`}>
          {topDiscard ? <img src={topDiscard.image.thumbnail || topDiscard.image.full || ''} alt="" /> : <span>Vazia</span>}
          <b>{discardPile.length}</b><small>Descarte</small>
        </button>
        {selected && <div className="selected-card-preview">
          <CardFace card={selected} />
          <div className="selected-card-preview__content">
            <button className="selected-card-preview__close" type="button" onClick={() => setSelected(null)} aria-label="Fechar detalhes">×</button>
            <small>{selectedZone === 'hand' ? 'Carta na sua mão' : selectedZone === 'player-field' ? 'Carta no seu campo' : 'Carta do oponente'}</small>
            <strong>{selectedDetail?.pt_br.full_name || selected.full_name}</strong>
            <span>{[selectedDetail?.pt_br.type || selected.type, selected.color, selected.cost != null ? `Custo ${selected.cost}` : null].filter(Boolean).join(' · ')}</span>
            <p>{selectedDetail?.pt_br.full_text || (selectedDetail ? 'Esta carta não possui texto de regra.' : 'Carregando tradução e habilidades...')}</p>
            {selectedDetail?.pt_br.flavor_text && <blockquote>{selectedDetail.pt_br.flavor_text}</blockquote>}
            <div className="selected-card-preview__actions">
              {selectedZone === 'hand' && <><button type="button" onClick={() => simulateAction('Jogar no campo')}>Jogar no campo</button>{selected.inkwell && <button type="button" onClick={() => simulateAction('Adicionar à tinta')}>Adicionar à tinta</button>}</>}
              {selectedZone === 'player-field' && <><button type="button" onClick={() => simulateAction('Enviar em missão')}>Enviar em missão</button><button type="button" onClick={() => simulateAction('Desafiar')}>Desafiar</button></>}
              {selectedZone === 'opponent-field' && <button type="button" onClick={() => simulateAction('Selecionar como alvo')}>Selecionar como alvo</button>}
              <button className="button-secondary" type="button" onClick={() => setSelected({ ...selected, facedown: !selected.facedown })}>{selected.facedown ? 'Revelar carta' : 'Virar para baixo'}</button>
            </div>
            {actionMessage && <em>{actionMessage}</em>}
          </div>
        </div>}
        <div className="player-hand" aria-label="Sua mão">{hand.map((card, index) => <CardFace card={card} key={card.id} className={`player-hand__card player-hand__card--${index + 1}`} onClick={() => inspectCard(card, 'hand')} />)}</div>
      </main>

      <aside className="game-table-right">
        <section className="table-player-card table-player-card--opponent"><PlayerAvatar name="Oponente" opponent /><div><strong>Oponente</strong><span className={!playerTurn ? 'online' : ''}>{!playerTurn ? 'Jogando' : 'Aguardando'}</span></div></section>
        <div className="resource-block"><div className="ink-gem"><b>{opponentInk}</b></div><span>Tinta disponível</span></div>
        <div className="right-deck"><CardFace /><i>32</i><span>Deck</span></div>
        <div className="lore-counter"><b>{opponentLore}</b><span>Lore do oponente</span></div>
        <button className="pass-turn" type="button" onClick={() => setPlayerTurn(!playerTurn)}>{playerTurn ? 'Passar turno' : 'Simular oponente'}</button>
        <div className="lore-counter lore-counter--player"><b>{playerLore}</b><span>Seu lore</span></div>
        <div className="resource-block resource-block--player"><div className="ink-gem"><b>{playerInk}</b></div><span>Sua tinta disponível</span></div>
        <div className="right-deck right-deck--player"><CardFace /><i>28</i><span>Seu deck</span></div>
        <button className="discard-list-button" type="button" onClick={() => openDiscard('player')}>Descartes <b>{discardPile.length}</b></button>
      </aside>

      {showDiscard && <div className="discard-modal" onMouseDown={() => setShowDiscard(false)}><section onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span>Pilha de descarte</span><h2>{discardOwner === 'player' ? 'Suas cartas descartadas' : 'Descarte do oponente'}</h2></div><button type="button" onClick={() => setShowDiscard(false)} aria-label="Fechar descarte">×</button></header>
        {discardOwner === 'player' && discardMessage && <p className="discard-modal__message">{discardMessage}</p>}
        {viewedDiscardPile.length > 0 ? <div className="discard-modal__list">{viewedDiscardPile.map((card) => <article key={card.id}><img src={card.image.thumbnail || card.image.full || ''} alt="" /><div><strong>{card.full_name}</strong><span>{[card.type, card.color, card.cost != null ? `Custo ${card.cost}` : null].filter(Boolean).join(' · ')}</span></div>{discardOwner === 'player' && <button type="button" onClick={() => recoverDiscard(card)}>Recuperar</button>}</article>)}</div> : <div className="discard-modal__empty"><strong>Pilha vazia</strong><span>Não há cartas neste descarte.</span></div>}
        <footer>{discardOwner === 'player' ? 'Simulação local: recuperar uma carta ainda não altera as regras da partida.' : 'As cartas do descarte adversário podem ser consultadas durante a partida.'}</footer>
      </section></div>}
    </div>
  );
}
