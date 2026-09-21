import { buildGameCards, type DeckEntrySource } from './deck-cards.js';
import {
  activeDecisionPlayer, applyAction, createGame, getLegalActions,
  type CardInstance, type GameAction, type GameCard, type GameState, type LegalAction, type PendingDecision, type PlayerId,
} from './engine.js';

/**
 * Online matches reuse the local engine unchanged. The engine names its sides
 * 'player' and 'bot'; online, seat 1 is always 'player' and seat 2 is always 'bot'.
 * Everything a client receives goes through `viewForSeat`, which re-orients the
 * state so the viewer is 'player' and strips every piece of hidden information.
 */
export type Seat = 1 | 2;
export const seatPlayer = (seat: Seat): PlayerId => (seat === 1 ? 'player' : 'bot');
export const playerSeat = (player: PlayerId): Seat => (player === 'player' ? 1 : 2);

const copy = <T>(value: T): T => structuredClone(value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const ACTION_TYPES = new Set(['choose', 'mulligan', 'ink', 'play', 'shift', 'sing', 'quest', 'challenge', 'move', 'activate', 'boost', 'endTurn', 'concede']);

export function createSeatedGame(decks: Record<Seat, readonly DeckEntrySource[]>, seed: number): GameState {
  return createGame({ decks: { player: buildGameCards(decks[1]), bot: buildGameCards(decks[2]) }, seed });
}

/**
 * Applies an action on behalf of a seat. The client's `player` and `label` are
 * discarded: the seat comes from the authenticated session, and the engine only
 * accepts actions that exactly match one of its own legal actions for that player.
 */
export function applySeatAction(state: GameState, seat: Seat, input: unknown): GameState {
  if (!isRecord(input) || typeof input.type !== 'string' || !ACTION_TYPES.has(input.type)) {
    throw new Error('Ação desconhecida.');
  }
  const { label: _label, player: _player, ...details } = input;
  return applyAction(state, { ...details, player: seatPlayer(seat) } as GameAction);
}

export interface MatchSummary {
  phase: GameState['phase'];
  turn: number;
  decisionSeat: Seat | null;
  winnerSeat: Seat | null;
  finishReason: GameState['finishReason'];
}
export function matchSummary(state: GameState): MatchSummary {
  const decision = activeDecisionPlayer(state);
  return {
    phase: state.phase, turn: state.turn,
    decisionSeat: decision ? playerSeat(decision) : null,
    winnerSeat: state.winner ? playerSeat(state.winner) : null,
    finishReason: state.finishReason,
  };
}

const HIDDEN_CARD: GameCard = {
  id: 0, name: '', type: 'Character', cost: 0, inkwell: false, strength: 0, willpower: 0, lore: 0, moveCost: 0,
  subtypes: [], image: '', text: '',
  rules: { sourceId: 0, keywords: [], static: [], triggered: [], activated: [], action: [], unsupported: [], supported: true },
};
function hidden(iid: string, exerted = false): CardInstance {
  return { iid, card: HIDDEN_CARD, exerted, drying: false, damage: 0, location: null, stack: [], faceDown: true };
}
/** Visible card, but anything placed face down underneath it (Boost) stays hidden. */
function visible(instance: CardInstance, prefix: string): CardInstance {
  return { ...copy(instance), stack: instance.stack.map((under, index) => (under.faceDown ? hidden(`${prefix}:${index}`) : copy(under))) };
}

export interface SeatNames { opponent: string }
export interface SeatView {
  seat: Seat;
  /** Engine-shaped state oriented to the viewer ('player' = you). Hidden zones hold placeholders. */
  state: GameState;
  /** Legal actions for the viewer, oriented ('player' = you). Multi-select choices use the pending dialog. */
  legal: LegalAction[];
  decisionSeat: Seat | null;
}

export function viewForSeat(state: GameState, seat: Seat, names: SeatNames): SeatView {
  const me = seatPlayer(seat);
  const orient = (player: PlayerId): PlayerId => (player === me ? 'player' : 'bot');
  const nameOf = (player: PlayerId): string => (player === me ? 'Você' : names.opponent);
  // The engine always writes 'Você' for the seat-1 side and 'Bot' for seat 2.
  const nameOfEngineLabel = (label: string): string => nameOf(label === 'Você' ? 'player' : 'bot');

  const zones = (owner: PlayerId) => {
    const real = state.players[owner];
    const tag = owner === me ? 'you' : 'opp';
    const isMe = owner === me;
    return {
      ...copy(real),
      // Nobody may know the order of any deck, including their own.
      deck: real.deck.map((_, index) => hidden(`x:${tag}:deck:${index}`)),
      hand: isMe ? real.hand.map((card) => visible(card, `x:${tag}:hand:${card.iid}`)) : real.hand.map((_, index) => hidden(`x:${tag}:hand:${index}`)),
      // Inkwell cards are face down; only whether each one is exerted is public.
      inkwell: real.inkwell.map((card, index) => hidden(`x:${tag}:ink:${index}`, card.exerted)),
      field: real.field.map((card) => visible(card, `x:${tag}:stack:${card.iid}`)),
      discard: real.discard.map((card) => visible(card, `x:${tag}:discard:${card.iid}`)),
    };
  };
  const players = { player: zones(me), bot: zones(me === 'player' ? 'bot' : 'player') };
  const visibleIds = new Set([...players.player.field, ...players.bot.field].map((card) => card.iid));

  let pending: PendingDecision | null = null;
  if (state.pending && state.pending.player === me) {
    pending = {
      ...copy(state.pending), player: 'player',
      options: state.pending.options.map((option) => (
        option.id === 'player' || option.id === 'bot' ? { ...option, label: nameOfEngineLabel(option.label) } : { ...option }
      )),
    };
  } else if (state.pending) {
    // The opponent is deciding: reveal that, never what the options are.
    pending = { id: state.pending.id, kind: state.pending.kind, player: 'bot', label: 'O adversário está escolhendo', options: [], min: 0, max: 0 };
  }

  const log = state.log.map((line) => line
    .replace(/^(Turno \d+: )(Você|Bot)$/, (_, prefix: string, who: string) => prefix + nameOfEngineLabel(who))
    .replace(/^(Você|Bot): /, (_, who: string) => `${nameOfEngineLabel(who)}: `));

  const oriented: GameState = {
    version: state.version, phase: state.phase, players,
    activePlayer: orient(state.activePlayer), firstPlayer: orient(state.firstPlayer),
    turn: state.turn, winner: state.winner ? orient(state.winner) : null, finishReason: state.finishReason,
    // The seed would let a client predict every future shuffle and draw.
    rng: 0, nextId: 0,
    pending,
    // Internal resolution work may reference hidden cards; clients never need it.
    decision: null, queue: [], bag: [], bagPlayer: null,
    modifiers: state.modifiers.filter((modifier) => visibleIds.has(modifier.iid)).map((modifier) => ({ ...modifier, player: orient(modifier.player) })),
    combat: state.combat ? { ...state.combat } : null,
    resolvingAction: state.resolvingAction ? { player: orient(state.resolvingAction.player), card: copy(state.resolvingAction.card) } : null,
    transition: state.transition,
    log,
  };

  const decision = activeDecisionPlayer(state);
  const legal = state.phase === 'finished' ? [] : getLegalActions(state, me)
    // Pending choices are answered through the dialog with explicit option ids.
    .filter((action) => action.type !== 'choose')
    .map((action) => ({ ...action, player: 'player' as PlayerId }));

  return { seat, state: oriented, legal, decisionSeat: decision ? playerSeat(decision) : null };
}
