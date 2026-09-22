import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { activeDecisionPlayer, availableInk, getStats, type CardInstance, type GameAction, type GameState, type PlayerId } from '@jogartcg/game-core';
import { inkBottleAsset, type BotMatch, type DisplayGameCard } from '../game/bot-session';
import { CardText } from './CardText';

const backImage = './brand/lor-card-back.webp';
const displayCard = (entry: CardInstance) => entry.card as DisplayGameCard;
const title = (entry: CardInstance) => displayCard(entry).displayName || entry.card.name;

export function Dialog({ title: heading, children, close }: { title: string; children: ReactNode; close?: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    return () => previous?.focus();
  }, []);
  return <div className="match-dialog" onMouseDown={(event) => { if (event.target === event.currentTarget) close?.(); }}>
    <div className="match-dialog__panel" ref={panel} role="dialog" aria-modal="true" aria-label={heading} tabIndex={-1} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); close?.(); }
      if (event.key !== 'Tab') return;
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input, select, [tabindex="0"]') ?? [])];
      const first = elements[0]; const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first.focus(); }
    }}>
      <h2>{heading}</h2>{close && <button className="match-dialog__close" onClick={close} aria-label="Fechar">×</button>}{children}
    </div>
  </div>;
}

function MatchCard({ entry, hidden = false, exhausted = false, className = '', style, legal, onClick }: { entry?: CardInstance; hidden?: boolean; exhausted?: boolean; className?: string; style?: CSSProperties; legal?: boolean; onClick?: () => void }) {
  const faceDown = hidden || !entry;
  return <button type="button" style={style} className={`game-card ${faceDown ? 'game-card--back' : ''} ${entry?.exerted || exhausted ? 'game-card--exhausted' : ''} ${legal ? 'game-card--legal' : ''} ${className}`} onClick={onClick} disabled={!onClick} aria-label={faceDown ? `Carta virada para baixo${exhausted ? ', utilizada' : ''}` : title(entry!)}>
    <img src={faceDown ? backImage : entry!.card.image} alt="" />
    {!faceDown && entry && <><span>{entry.card.cost}</span>{entry.damage > 0 && <span className="card-damage" title="Dano recebido">{entry.damage}</span>}{entry.drying && entry.card.type === 'Character' && <span className="card-state">Secando</span>}{entry.card.type !== 'Character' && <span className="card-state">{entry.card.type === 'Item' ? 'Item' : entry.card.type === 'Action' ? 'Ação' : 'Local'}</span>}{entry.location && <span className="card-location" title="Em um local">⌂</span>}</>}
  </button>;
}

function fanStyle(index: number, count: number, opponent: boolean): CSSProperties {
  const offset = index - (count - 1) / 2;
  const spacing = Math.min(opponent ? 25 : 60, 340 / Math.max(1, count - 1));
  return { '--fan-x': `calc(-50% + ${offset * spacing}px)`, '--fan-y': `${-Math.abs(offset) * (opponent ? 4 : -2)}px`, '--fan-r': `${offset * (opponent ? -5 : 4)}deg`, '--fan-z': `${count - Math.round(Math.abs(offset))}` } as CSSProperties;
}

function actionInvolves(action: GameAction, iid: string): boolean {
  return Object.entries(action).some(([key, value]) => key !== 'label' && (value === iid || (Array.isArray(value) && value.includes(iid))));
}

export interface MatchTableProps {
  /** Engine state seen from the viewer: 'player' is always you, 'bot' the opponent. */
  state: GameState;
  /** Legal actions for the viewer on this exact state. */
  legal: GameAction[];
  inkColors: BotMatch['inkColors'];
  deckNames: { player: string; bot: string };
  /** How the opponent is named on the table ("Bot", or the other player's first name). */
  opponentName: string;
  /** Status line while the opponent decides, e.g. "Bot pensando…". */
  opponentThinking: string;
  /** Banner in the middle of the board while the opponent decides. */
  opponentBanner: string;
  /** Extra content under the opponent's name (connection badge online). */
  opponentBadge?: ReactNode;
  /** True while a move is being confirmed; the table stays visible but inert. */
  busy?: boolean;
  error: string;
  onDismissError: () => void;
  /** Resolves true when the move was accepted, so the table can close its dialogs. */
  onAction: (action: GameAction) => boolean | Promise<boolean>;
  /** Body of the "Sair da mesa" dialog. */
  exitDialog: (close: () => void, concede: (() => void) | null) => ReactNode;
  /** Buttons of the end-of-match dialog. */
  finishedActions: (openLog: () => void) => ReactNode;
  finishedMessage?: string;
  /** Dialogs owned by the page (bot failure, lost connection…). */
  overlay?: ReactNode;
  boardLabel: string;
}

export function MatchTable({
  state, legal, inkColors, deckNames, opponentName, opponentThinking, opponentBanner, opponentBadge,
  busy = false, error, onDismissError, onAction, exitDialog, finishedActions, finishedMessage, overlay, boardLabel,
}: MatchTableProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPile, setSelectedPile] = useState<PlayerId | null>(null);
  const [pile, setPile] = useState<PlayerId | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [choiceIds, setChoiceIds] = useState<string[]>([]);
  const [targetActions, setTargetActions] = useState<GameAction[] | null>(null);
  const decisionPlayer = activeDecisionPlayer(state);

  useEffect(() => { setChoiceIds([]); }, [state.pending?.id]);

  const player = state.players.player;
  const bot = state.players.bot;
  const visibleCards = [...player.hand, ...player.field, ...player.discard, ...bot.field, ...bot.discard];
  const selected = visibleCards.find((card) => card.iid === selectedId);
  const selectedActions = selected ? legal.filter((action) => actionInvolves(action, selected.iid)) : [];
  const passAction = legal.find((action) => ['end-turn', 'endTurn', 'pass'].includes(action.type));
  const concedeAction = legal.find((action) => action.type === 'concede');
  const pending = state.pending?.player === 'player' ? state.pending : null;
  const opponentPossessive = opponentName === 'Bot' ? 'do bot' : `de ${opponentName}`;

  async function dispatch(action: GameAction) {
    if (busy) return;
    if (await onAction(action)) { setSelectedId(null); setSelectedPile(null); setTargetActions(null); }
  }
  function chooseOption(id: string) {
    if (!pending) return;
    onDismissError();
    setChoiceIds((values) => values.includes(id) ? values.filter((value) => value !== id) : pending.max === 1 ? [id] : values.length < pending.max ? [...values, id] : values);
  }
  function inspectCard(iid: string, sourcePile: PlayerId | null = null) {
    setSelectedPile(sourcePile);
    setSelectedId(iid);
  }
  function closeCardDetails() {
    setSelectedId(null);
    if (selectedPile) setPile(selectedPile);
    setSelectedPile(null);
  }
  /**
   * Rótulo curto para os botões do diálogo da carta. O motor gera "Tinteiro: Ariel - ..."
   * (usado também no histórico), mas aqui a carta já está aberta, então repetir o nome
   * dela só polui. Mantemos apenas o nome da *outra* carta envolvida, quando houver.
   */
  function shortLabel(action: GameAction): string {
    const nameOf = (iid: string) => { const entry = visibleCards.find((card) => card.iid === iid); return entry ? title(entry) : ''; };
    const isSelected = (iid: string) => iid === selected?.iid;
    switch (action.type) {
      case 'ink': return 'Tinteiro';
      case 'play': return action.exerted ? 'Jogar exaurido' : 'Jogar';
      case 'quest': return 'Explorar';
      case 'boost': return 'Impulsionar';
      case 'challenge': return isSelected(action.iid) ? `Desafiar ${nameOf(action.target)}`.trim() : `Desafiar com ${nameOf(action.iid)}`.trim();
      case 'move': return `Mover para ${nameOf(action.location)}`.trim();
      case 'shift': return isSelected(action.iid) ? `Transformar sobre ${nameOf(action.onto)}`.trim() : `Transformar com ${nameOf(action.iid)}`.trim();
      case 'sing':
        if (!action.singers.length) return 'Cantar juntos';
        return isSelected(action.iid) ? `Cantar com ${action.singers.map(nameOf).join(' + ')}`.trim() : `Cantar ${nameOf(action.iid)}`.trim();
      case 'activate': return `Habilidade: ${(action.label ?? '').split(': ').pop()}`;
      default: return action.label ?? '';
    }
  }
  function actionButtons() {
    if (!selected) return null;
    const groups = new Map<string, GameAction[]>();
    for (const action of selectedActions) groups.set(action.type, [...(groups.get(action.type) ?? []), action]);
    return [...groups].map(([kind, actions]) => <button key={kind} disabled={busy} onClick={() => actions.length === 1 ? void dispatch(actions[0]) : setTargetActions(actions)}>{actions.length === 1 ? shortLabel(actions[0]) : kind === 'challenge' ? 'Desafiar' : kind === 'move' ? 'Mover' : kind === 'play' ? 'Jogar' : kind === 'sing' ? 'Cantar' : kind === 'shift' ? 'Transformar' : 'Habilidade'}</button>);
  }
  function renderField(owner: PlayerId) {
    const field = state.players[owner].field;
    return <div className={`field-row ${owner === 'bot' ? 'field-row--opponent' : ''}`}>{field.length ? field.map((entry) => <MatchCard key={entry.iid} entry={entry} legal={owner === 'player' && legal.some((action) => actionInvolves(action, entry.iid))} onClick={() => inspectCard(entry.iid)} />) : <span className="bot-table__empty" aria-label={owner === 'player' ? 'Seu campo vazio' : `Campo ${opponentPossessive} vazio`} />}</div>;
  }
  function discard(owner: PlayerId) {
    const entries = state.players[owner].discard;
    return <button className={`discard-board-pile discard-board-pile--${owner === 'bot' ? 'opponent' : 'player'}`} onClick={() => { setSelectedPile(null); setPile(owner); }} aria-label={`Consultar descarte ${owner === 'bot' ? opponentPossessive : 'seu'}: ${entries.length} cartas`}>
      {entries.length ? <img src={entries[entries.length - 1].card.image} alt="" /> : <span aria-hidden="true">—</span>}<b>{entries.length}</b><small>Descarte</small>
    </button>;
  }
  const statusText = state.phase === 'finished' ? 'Partida encerrada' : decisionPlayer === 'bot' ? opponentThinking : pending ? 'Sua escolha' : 'Seu turno';

  return <div className="game-table-page bot-table" aria-busy={busy || undefined}>
    <header className="game-table-topbar"><Link className="game-table-brand" to="/jogar"><img src="./brand/logo-jogar-tcg.png" alt="Jogar TCG" /></Link><div className="game-table-round"><span>Turno {state.turn}</span><strong aria-live="polite">{statusText}</strong></div><div className="game-table-topactions"><button onClick={() => setShowLog(true)} aria-label="Histórico da partida">☷</button><button onClick={() => setExitOpen(true)} aria-label="Sair da mesa">↪ Sair</button></div></header>
    <main className="game-board" aria-label={boardLabel}>
      <div className="board-skin" aria-hidden="true"><span className="board-skin__opponent" /><span className="board-skin__middle" /><span className="board-skin__player" /></div>
      <div className="board-ornament board-ornament--top" />
      <div className="opponent-hand" aria-label={`Mão ${opponentPossessive}: ${bot.hand.length} cartas`}>{bot.hand.map((entry, index) => <MatchCard key={entry.iid} hidden style={fanStyle(index, bot.hand.length, true)} />)}</div>
      <span className="field-zone-label field-zone-label--opponent">Campo do oponente</span>
      <div className="opponent-zone">{renderField('bot')}</div>
      <div className="deck-stack deck-stack--opponent" aria-label={`Deck ${opponentPossessive}: ${bot.deck.length} cartas`}><MatchCard hidden /><i>{bot.deck.length}</i></div>
      <div className="ink-zone ink-zone--opponent" aria-label={`Tinta ${opponentPossessive}: ${availableInk(state, 'bot')} de ${bot.inkwell.length}`}><div>{[...bot.inkwell].reverse().map((entry) => <MatchCard key={entry.iid} hidden exhausted={entry.exerted} />)}</div></div>
      {discard('bot')}
      <div className="board-divider"><span>{decisionPlayer === 'bot' ? opponentBanner : player.inkwell.length === 0 ? 'COLOQUE UMA CARTA NO TINTEIRO' : 'ESCOLHA UMA CARTA PARA AGIR'}</span></div>
      <span className="field-zone-label field-zone-label--player">Seu campo</span>
      <div className="player-zone">{renderField('player')}</div>
      <div className="deck-stack deck-stack--player" aria-label={`Seu deck: ${player.deck.length} cartas`}><MatchCard hidden /><i>{player.deck.length}</i></div>
      <div className="ink-zone ink-zone--player" aria-label={`Sua tinta: ${availableInk(state, 'player')} de ${player.inkwell.length}`}><div>{player.inkwell.map((entry) => <MatchCard key={entry.iid} hidden exhausted={entry.exerted} />)}</div></div>
      {discard('player')}
      <div className="player-hand" aria-label={`Sua mão: ${player.hand.length} cartas`}>{player.hand.map((entry, index) => <MatchCard key={entry.iid} entry={entry} style={fanStyle(index, player.hand.length, false)} onClick={() => inspectCard(entry.iid)} />)}</div>
    </main>
    <aside className="game-table-right" aria-label="Contadores da partida">
      <section className="table-player-card table-player-card--opponent"><strong>{opponentName}</strong>{opponentBadge}</section>
      <div className="resource-block resource-block--opponent"><img src={inkBottleAsset(inkColors.bot)} alt="" /><div><span>Tinta</span><b>{availableInk(state, 'bot')} <i>/ {bot.inkwell.length}</i></b></div></div>
      <div className="lore-counter lore-counter--opponent"><img src="./brand/lorcana-items/iconDourado.png" alt="" /><div><span>Lore</span><b>{bot.lore} <i>/ 20</i></b></div></div>
      <button className="pass-turn" disabled={!passAction || busy} onClick={() => passAction && void dispatch(passAction)}><span aria-hidden="true">▶▶</span>Passar turno</button>
      <section className="table-player-card table-player-card--you"><span className="online">Você</span></section>
      <div className="lore-counter lore-counter--player"><img src="./brand/lorcana-items/iconDourado.png" alt="" /><div><span>Lore</span><b>{player.lore} <i>/ 20</i></b></div></div>
      <div className="resource-block resource-block--player"><img src={inkBottleAsset(inkColors.player)} alt="" /><div><span>Tinta</span><b>{availableInk(state, 'player')} <i>/ {player.inkwell.length}</i></b></div></div>
    </aside>

    {selected && !pending && !targetActions && <Dialog title={title(selected)} close={closeCardDetails}><div className="match-card-detail"><img src={selected.card.image} alt={title(selected)} /><div className="match-card-detail__body">
      <div className="match-card-detail__description">
        <p className="match-card-detail__meta">{displayCard(selected).fullName || selected.card.name} · Custo {getStats(state, selected.iid).cost}</p>
        <p>Força {getStats(state, selected.iid).strength} · Vontade {getStats(state, selected.iid).willpower} · Lore {getStats(state, selected.iid).lore}{selected.damage > 0 ? ` · Dano ${selected.damage}` : ''}</p>
        <p className="match-card-detail__text">{(displayCard(selected).textPt || selected.card.text) ? <CardText text={displayCard(selected).textPt || selected.card.text} /> : 'Esta carta não possui habilidades.'}</p>
        {selected.card.text && <details><summary>Texto original</summary><p className="match-card-detail__text"><CardText text={selected.card.text} /></p></details>}
      </div>
      <div className="match-card-detail__action-panel">
        <div className="match-actions">{actionButtons()}</div>
        {!selectedActions.length && <p>{decisionPlayer !== 'player' ? 'Aguarde a sua vez.' : selected.exerted ? 'Esta carta já está virada.' : selected.drying ? 'Este personagem está secando. Ele poderá agir no seu próximo turno.' : player.hand.some((card) => card.iid === selected.iid) ? 'Sem ação disponível: confira a tinta e o limite de uma carta no tinteiro por turno.' : 'Nenhuma ação está disponível para esta carta agora.'}</p>}
      </div>
    </div></div></Dialog>}
    {targetActions && <Dialog title="Escolha como resolver a jogada" close={() => setTargetActions(null)}><div className="match-choice-grid">{targetActions.map((action, index) => {
      const targetId = 'target' in action ? action.target : 'location' in action ? action.location : 'onto' in action ? action.onto : null;
      const target = visibleCards.find((card) => card.iid === targetId);
      return <button className="match-choice" key={index} disabled={busy} onClick={() => void dispatch(action)}>{target && <img src={target.card.image} alt="" />}<span>{shortLabel(action)}</span></button>;
    })}</div></Dialog>}
    {pending && <Dialog key={pending.id} title={pending.label}><div className={`pending-effect pending-effect--${pending.kind}`}><strong>{pending.kind === 'optional' ? 'Efeito opcional' : pending.kind === 'mulligan' ? 'Troca inicial' : 'Escolha necessária'}</strong>{pending.description && <p><CardText text={pending.description} /></p>}</div>{pending.kind !== 'optional' && <p>{pending.min === 0 ? 'Você pode continuar sem selecionar nenhuma opção.' : `Selecione ${pending.min === pending.max ? pending.min : `${pending.min} a ${pending.max}`} opção(ões).`}</p>}{pending.kind !== 'optional' && <div className="match-choice-grid">{pending.options.map((option) => {
      const entry = visibleCards.find((card) => card.iid === option.iid || card.iid === option.id);
      return <button className="match-choice" key={option.id} aria-pressed={choiceIds.includes(option.id)} onClick={() => chooseOption(option.id)}>{entry && <img src={entry.card.image} alt="" />}<span>{option.label}</span></button>;
    })}</div>}{pending.kind === 'optional' ? <div className="pending-effect__actions"><button type="button" disabled={busy} onClick={() => void dispatch({ type: 'choose', player: 'player', optionIds: ['yes'] })}>Usar efeito</button><button type="button" disabled={busy} onClick={() => void dispatch({ type: 'choose', player: 'player', optionIds: [] })}>Não usar</button></div> : <button className="match-choice-confirm" disabled={busy || choiceIds.length < pending.min || choiceIds.length > pending.max} onClick={() => void dispatch({ type: 'choose', player: 'player', optionIds: choiceIds })}>{choiceIds.length ? `Confirmar (${choiceIds.length})` : state.phase === 'mulligan' ? 'Manter minha mão' : pending.min > 0 ? 'Confirmar escolha' : 'Continuar sem selecionar'}</button>}</Dialog>}
    {pile && <Dialog title={pile === 'player' ? 'Seu descarte' : `Descarte ${opponentPossessive}`} close={() => setPile(null)}><div className="match-pile-list">{state.players[pile].discard.map((entry) => <button key={entry.iid} onClick={() => { inspectCard(entry.iid, pile); setPile(null); }}><img src={entry.card.image} alt="" />{title(entry)}</button>)}</div>{!state.players[pile].discard.length && <p>Não há cartas neste descarte.</p>}<p>Cartas só podem voltar para a mão por um efeito que permita recuperá-las.</p></Dialog>}
    {showLog && <Dialog title="Histórico da partida" close={() => setShowLog(false)}><p>{deckNames.player} × {deckNames.bot}</p><ol className="match-log">{state.log.map((entry, index) => <li key={index}>{typeof entry === 'string' ? entry : JSON.stringify(entry)}</li>)}</ol></Dialog>}
    {exitOpen && <Dialog title="Sair da mesa" close={() => setExitOpen(false)}>{exitDialog(() => setExitOpen(false), concedeAction ? () => { void dispatch(concedeAction); setExitOpen(false); } : null)}</Dialog>}
    {overlay}
    {error && <div className="bot-table__error" role="alert"><span>{error}</span><button onClick={onDismissError} aria-label="Fechar aviso">×</button></div>}
    {state.phase === 'finished' && !exitOpen && !showLog && <Dialog title={state.winner === 'player' ? 'Você venceu!' : state.winner === 'bot' ? (opponentName === 'Bot' ? 'O bot venceu' : `${opponentName} venceu`) : 'Partida encerrada'}><p>{finishedMessage ?? (state.finishReason === 'lore' ? 'A meta de 20 pontos de lore foi alcançada.' : state.finishReason === 'emptyDeck' ? 'Um jogador terminou o próprio turno com o deck vazio.' : state.finishReason === 'concede' ? 'A partida terminou por desistência.' : 'A partida chegou ao fim.')}</p><p>Seu lore: {player.lore} · Lore {opponentPossessive}: {bot.lore}</p><div className="match-actions">{finishedActions(() => setShowLog(true))}</div></Dialog>}
  </div>;
}
