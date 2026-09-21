import {
  activeDecisionPlayer, applyAction, availableInk, getLegalActions, getStats,
  type CardInstance, type CardStats, type GameAction, type GameCard, type GameState,
} from './engine.js';
import type { Effect } from './cards.js';

// At most 24 first decisions and 6 * 8 second decisions are simulated per call.
const ROOT_WIDTH = 24;
const BEAM_WIDTH = 6;
const CHILD_WIDTH = 8;
const WIN = 1_000_000;
const UNKNOWN_ID = -1;

const unknownCard: GameCard = {
  id: UNKNOWN_ID, name: 'Unknown card', type: 'Character', cost: 99,
  inkwell: false, strength: 0, willpower: 1, lore: 0, moveCost: 0,
  subtypes: [], image: '', text: '',
  rules: { sourceId: UNKNOWN_ID, keywords: [], static: [], triggered: [], activated: [], action: [], unsupported: [], supported: true },
};

function unknownInstance(iid: string): CardInstance {
  return { iid, card: unknownCard, exerted: false, drying: false, damage: 0, location: null, stack: [] };
}

function visibleInstance(entry: CardInstance): CardInstance {
  const visible = entry.faceDown ? {
    ...unknownInstance(entry.iid), faceDown: true, exerted: entry.exerted,
    drying: entry.drying, damage: entry.damage, location: entry.location,
    ...(entry.boostedThisTurn === undefined ? {} : { boostedThisTurn: entry.boostedThisTurn }),
  } : { ...entry };
  return { ...visible, stack: entry.stack.map(visibleInstance) };
}

function visibleFrame(frame: GameState['queue'][number]): GameState['queue'][number] {
  return { ...frame, context: { ...frame.context, source: visibleInstance(frame.context.source) } };
}

/** Do not clone the real state first: even cloning would inspect hidden cards. */
function informationSet(state: GameState): GameState {
  const players = { ...state.players };
  for (const player of ['player', 'bot'] as const) {
    const source = state.players[player];
    players[player] = {
      ...source,
      // Neither deck identities nor deck order are known, including our own deck.
      deck: Array.from({ length: source.deck.length }, (_, i) => unknownInstance(`unknown-${player}-${i}`)),
      hand: player === 'bot' ? source.hand.map(visibleInstance) : source.hand.map(entry => unknownInstance(entry.iid)),
      field: source.field.map(visibleInstance),
      discard: source.discard.map(visibleInstance),
      inkwell: source.inkwell.map(entry => ({ ...unknownInstance(entry.iid), exerted: entry.exerted })),
    };
  }
  const visibleAbility = (ability: GameState['bag'][number]): GameState['bag'][number] => ({ ...ability, source: visibleInstance(ability.source) });
  const decision = state.decision && ('frame' in state.decision ? { ...state.decision, frame: visibleFrame(state.decision.frame) }
    : state.decision.kind === 'ability' ? { ...state.decision, ability: visibleAbility(state.decision.ability) } : state.decision);
  const resolvingAction = state.resolvingAction && { ...state.resolvingAction, card: visibleInstance(state.resolvingAction.card) };
  return structuredClone({ ...state, players, rng: 1, log: [], decision, resolvingAction, queue: state.queue.map(visibleFrame), bag: state.bag.map(visibleAbility) });
}

function cardValue(card: GameCard): number {
  if (card.id === UNKNOWN_ID) return 4; // Fixed draw value, independent of actual top card.
  const body = card.type === 'Character' || card.type === 'Location'
    ? card.strength * 0.65 + card.willpower * 0.6 + card.lore * 3.5 : 0;
  return 1.5 + Math.min(8, card.cost) * 0.75 + body
    + card.rules.action.length * 2 + card.rules.triggered.length * 1.5 + card.rules.activated.length;
}

function handValue(state: GameState): number {
  const inkCount = state.players.bot.inkwell.length;
  const copies = new Map<number, number>();
  return state.players.bot.hand.reduce((total, entry) => {
    const count = copies.get(entry.card.id) ?? 0;
    copies.set(entry.card.id, count + 1);
    const delay = Math.max(0, entry.card.cost - inkCount - 1);
    return total + (entry.card.id === UNKNOWN_ID ? 4 : Math.max(1, cardValue(entry.card) * 0.42 - delay * 0.9)) / (1 + count * 0.2);
  }, 0);
}

function openingScore(state: GameState, replaced: readonly string[]): number {
  const hand = state.players.bot.hand.filter(entry => !replaced.includes(entry.iid));
  const curve = new Map<number, number>();
  let value = replaced.length * 4.5;
  for (const { card } of hand) {
    const count = curve.get(card.cost) ?? 0;
    curve.set(card.cost, count + 1);
    const early = card.type === 'Character' ? [0, 10, 9, 7, 4, 1][Math.min(card.cost, 5)] : card.cost <= 3 ? 3 : 0;
    value += early / (1 + count * 0.8) + (card.inkwell ? 2 : -1);
  }
  const inkable = hand.filter(entry => entry.card.inkwell).length;
  value += Math.min(3, inkable) * 2;
  return value;
}

// Tie breaks never use UI labels, locale, random state, or concealed card names.
function actionKey(action: GameAction): string {
  return JSON.stringify(Object.fromEntries(Object.entries(action).filter(([key]) => key !== 'label').sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const statCache = new WeakMap<GameState, Map<string, CardStats>>();
function statsOf(state: GameState, iid: string): CardStats {
  let cache = statCache.get(state);
  if (!cache) { cache = new Map(); statCache.set(state, cache); }
  let stats = cache.get(iid);
  if (!stats) { stats = getStats(state, iid); cache.set(iid, stats); }
  return stats;
}

function keyword(state: GameState, entry: CardInstance, name: string): number {
  return statsOf(state, entry.iid).keywords.filter(rule => rule.keyword === name).reduce((sum, rule) => sum + (rule.value ?? 1), 0);
}

function canQuest(state: GameState, entry: CardInstance): boolean {
  return entry.card.type === 'Character' && !keyword(state, entry, 'Reckless') && !statsOf(state, entry.iid).restrictions.includes('cantQuest');
}

function fieldValue(state: GameState, entry: CardInstance): number {
  const stats = statsOf(state, entry.iid);
  return 2 + stats.strength * 0.75 + Math.max(0, stats.willpower - entry.damage) * 0.85
    + stats.lore * 4 + entry.card.cost * 0.45 + keyword(state, entry, 'Resist') * 2
    + keyword(state, entry, 'Evasive') * 1.5 + entry.card.rules.triggered.length * 1.5;
}

function loreGain(effects: readonly Effect[]): number {
  return effects.reduce((sum, effect) => sum + (effect.op === 'gainLore' && ['you', 'any'].includes(effect.target.owner) ? effect.amount ?? 1 : 0), 0);
}

function questPotential(state: GameState, player: 'player' | 'bot'): number {
  const nextTurn = state.activePlayer !== player;
  return state.players[player].field.reduce((total, entry) => {
    const stats = statsOf(state, entry.iid);
    const canReady = !entry.exerted || (nextTurn && !stats.restrictions.includes('cantReadyAtStart'));
    const canUse = canReady && (nextTurn || !entry.drying);
    const quest = canUse && canQuest(state, entry) ? stats.lore + entry.card.rules.triggered
      .filter(rule => rule.trigger === 'selfQuest' && !rule.condition && rule.turn !== 'opponents')
      .reduce((sum, rule) => sum + loreGain(rule.effects), 0) : 0;
    const passive = nextTurn ? (entry.card.type === 'Location' ? stats.lore : 0) + entry.card.rules.triggered
      .filter(rule => rule.trigger === 'start' && !rule.condition && rule.turn !== 'opponents')
      .reduce((sum, rule) => sum + loreGain(rule.effects), 0) : 0;
    const activated = entry.card.rules.activated.reduce((best, ability) => {
      if ((ability.cost.exert && !canUse) || (ability.cost.ink ?? 0) > state.players[player].inkwell.length) return best;
      const gain = loreGain(ability.effects);
      return Math.max(best, gain && !ability.cost.exert && !ability.cost.ink && !ability.cost.banish ? 20 : gain);
    }, 0);
    return total + passive + Math.max(quest, activated);
  }, 0);
}

function evaluate(state: GameState): number {
  if (state.winner === 'bot') return WIN;
  if (state.winner === 'player') return -WIN;
  const bot = state.players.bot;
  const opponent = state.players.player;
  let value = bot.lore * 13 - opponent.lore * 14 + handValue(state) - opponent.hand.length * 2;
  value += bot.field.reduce((sum, entry) => sum + fieldValue(state, entry), 0);
  value -= opponent.field.reduce((sum, entry) => sum + fieldValue(state, entry), 0);
  // Early resources are valuable; late ink must justify the lost card.
  const inkCount = bot.inkwell.length;
  value += Math.min(inkCount, 3) * 6 + Math.min(Math.max(0, inkCount - 3), 3) * 3 + Math.max(0, inkCount - 6) * 0.3;
  value += Math.min(availableInk(state, 'bot'), 6) * 0.15;
  const threat = opponent.lore + questPotential(state, 'player');
  if (threat >= 20) value -= 50_000 + (threat - 20) * 1_000;
  else value -= Math.max(0, threat - 13) ** 2 * 1.5;

  // Exerted questers may be challenged on the opponent's next turn. Respect the
  // same visible evasion/bodyguard/resist information used for tactical ranking.
  const bodyguard = bot.field.some(entry => entry.exerted && keyword(state, entry, 'Bodyguard'));
  for (const entry of bot.field) {
    if (!entry.exerted || entry.card.type !== 'Character') continue;
    if (bodyguard && !keyword(state, entry, 'Bodyguard')) continue;
    const stats = statsOf(state, entry.iid);
    const vulnerable = opponent.field.some(attacker => attacker.card.type === 'Character'
      && !statsOf(state, attacker.iid).restrictions.includes('cantChallenge')
      && (!keyword(state, entry, 'Evasive') || keyword(state, attacker, 'Evasive') || keyword(state, attacker, 'Alert'))
      && statsOf(state, attacker.iid).strength + keyword(state, attacker, 'Challenger') - keyword(state, entry, 'Resist') >= stats.willpower - entry.damage);
    if (vulnerable) value -= fieldValue(state, entry) * 0.35;
  }
  return value;
}

/** Cheap preselection keeps simulations bounded even for large choice sets. */
function priority(state: GameState, action: GameAction): number {
  if (action.type === 'concede') return -WIN;
  const ids = Object.entries(action).filter(([key]) => !['label', 'player', 'type'].includes(key)).flatMap(([, value]) => Array.isArray(value) ? value : [value]);
  if (action.type === 'choose') {
    for (const option of state.pending?.options ?? []) if (ids.includes(option.id) && option.iid) ids.push(option.iid);
  }
  const own = state.players.bot.field.find(entry => ids.includes(entry.iid));
  const enemy = state.players.player.field.find(entry => ids.includes(entry.iid));
  const hand = state.players.bot.hand.find(entry => ids.includes(entry.iid));
  const effects = action.type === 'activate' ? own?.card.rules.activated[action.ability]?.effects ?? []
    : hand && ['play', 'sing', 'shift'].includes(action.type) ? [...hand.card.rules.action, ...hand.card.rules.triggered.filter(rule => rule.trigger === 'play').flatMap(rule => rule.effects)]
    : action.type === 'quest' && own ? own.card.rules.triggered.filter(rule => rule.trigger === 'selfQuest').flatMap(rule => rule.effects) : [];
  const gain = loreGain(effects) + (action.type === 'quest' && own ? statsOf(state, own.iid).lore : 0);
  if (gain && state.players.bot.lore + gain >= 20) return WIN;
  switch (action.type) {
    case 'quest': return own ? (state.players.bot.lore + statsOf(state, own.iid).lore >= 20 ? WIN : 30 + statsOf(state, own.iid).lore * 10) : 0;
    case 'ink': return hand ? 20 - cardValue(hand.card) + Math.max(0, hand.card.cost - state.players.bot.inkwell.length) * 2 : 0;
    case 'choose': {
      const decision = state.decision;
      const effect = decision && 'frame' in decision ? decision.frame.effect : undefined;
      if (decision?.kind === 'amount') return Number(action.optionIds[0]) * (effect?.op === 'loseLore' ? -1 : 1);
      if (decision?.kind === 'discard') return -(hand ? cardValue(hand.card) : 0);
      const threatening = state.players.player.lore + questPotential(state, 'player') >= 20;
      return [...state.players.bot.field, ...state.players.player.field, ...state.players.bot.discard].filter(entry => ids.includes(entry.iid)).reduce((sum, entry) => {
        const hostile = state.players.player.field.includes(entry);
        const removal = effect && (['banish', 'returnHand'].includes(effect.op) || (effect.op === 'damage' && Math.max(0, (effect.amount ?? 1) - keyword(state, entry, 'Resist')) >= statsOf(state, entry.iid).willpower - entry.damage));
        const benefit = removal ? (hostile ? 1 : -1) : effect && ['heal', 'ready', 'buff', 'recover'].includes(effect.op) ? (hostile ? -1 : 1) : 0;
        return sum + benefit * fieldValue(state, entry) + (hostile && removal && threatening ? 100_000 + statsOf(state, entry.iid).lore * 100 : 0);
      }, hand ? cardValue(hand.card) : 0);
    }
    default: {
      if (own && enemy) {
        const damage = Math.max(0, statsOf(state, own.iid).strength + keyword(state, own, 'Challenger') - keyword(state, enemy, 'Resist'));
        const lethal = damage >= statsOf(state, enemy.iid).willpower - enemy.damage;
        return 20 + damage + (lethal ? fieldValue(state, enemy) * 2 : 0);
      }
      return (hand ? 25 + cardValue(hand.card) : -5) + gain * 20;
    }
  }
}

function candidates(state: GameState, width: number, legal = getLegalActions(state, 'bot')): GameAction[] {
  const ranked = legal.filter(action => action.type !== 'concede')
    .map(action => ({ action, score: priority(state, action), key: actionKey(action) }))
    .sort((a, b) => b.score - a.score || compareKeys(a.key, b.key));
  const selected = ranked.slice(0, width).map(entry => entry.action);
  const end = ranked.find(entry => entry.action.type === 'endTurn');
  if (end && !selected.includes(end.action)) selected[selected.length - 1] = end.action;
  return selected;
}

function gameplayKey(state: GameState): string {
  const { log: _log, rng: _rng, nextId: _nextId, ...gameplay } = state;
  return JSON.stringify(gameplay);
}

function makesProgress(before: GameState, after: GameState, action: GameAction): boolean {
  return !['activate', 'boost', 'move'].includes(action.type) || gameplayKey(before) !== gameplayKey(after);
}

function isFreeRepeatable(state: GameState, action: GameAction): boolean {
  if (action.type === 'boost') return action.cost === 0;
  if (action.type === 'move') return statsOf(state, action.location).moveCost === 0;
  if (action.type !== 'activate') return false;
  const ability = state.players.bot.field.find(entry => entry.iid === action.iid)?.card.rules.activated[action.ability];
  return !!ability && !ability.cost.exert && !ability.cost.ink && !ability.cost.banish;
}

/**
 * Pure deterministic two-decision beam search over the engine's legal actions.
 * Only public state and our own faceup hand enter the search; unknown draws have
 * a fixed value. Up to 72 transitions are simulated, not a full game-tree proof
 * of safety against concealed cards or combinations beyond the search horizon.
 * Throws when the bot does not own a decision (including a finished game).
 */
export function chooseBotAction(state: GameState): GameAction {
  if (activeDecisionPlayer(state) !== 'bot') throw new Error('The bot does not own the current decision.');
  const view = informationSet(state);
  const legal = getLegalActions(view, 'bot').filter(action => action.type !== 'concede');
  if (!legal.length) throw new Error('No legal bot action exists.');
  if (view.phase === 'mulligan') {
    const ranked = legal.map(action => ({ action, key: actionKey(action), score: openingScore(view, action.type === 'choose' ? action.optionIds : action.type === 'mulligan' ? action.replace : []) }));
    ranked.sort((a, b) => b.score - a.score || compareKeys(a.key, b.key));
    return ranked[0].action;
  }
  const roots = candidates(view, ROOT_WIDTH, legal).map(action => {
    const next = applyAction(view, action);
    return { action, next, score: evaluate(next), key: actionKey(action) };
  }).filter(root => makesProgress(view, root.next, root.action));
  if (!roots.length) throw new Error('No progressing legal bot action exists.');
  roots.sort((a, b) => b.score - a.score || compareKeys(a.key, b.key));
  if (roots[0].next.winner === 'bot') return roots[0].action;
  const beam = roots.map(root => ({ root, children: root.next.pending?.player === 'bot' ? candidates(root.next, CHILD_WIDTH) : [] }));
  beam.sort((a, b) => (b.root.score + (b.root.next.pending?.player === 'bot' ? Math.max(0, ...b.children.map(action => priority(b.root.next, action))) : 0))
    - (a.root.score + (a.root.next.pending?.player === 'bot' ? Math.max(0, ...a.children.map(action => priority(a.root.next, action))) : 0)) || compareKeys(a.root.key, b.root.key));
  for (const { root, children } of beam.slice(0, BEAM_WIDTH)) {
    if (activeDecisionPlayer(root.next) !== 'bot') continue;
    let best = root.score;
    for (const action of root.next.pending ? children : candidates(root.next, CHILD_WIDTH)) {
      const next = applyAction(root.next, action);
      if (makesProgress(root.next, next, action)) best = Math.max(best, evaluate(next));
    }
    root.score += (best - root.score) * 0.9;
  }
  roots.sort((a, b) => b.score - a.score || compareKeys(a.key, b.key));
  const baseline = evaluate(view);
  // A free activation can open an optional/target prompt and then return to the
  // exact original position. Pending prompts alone must not justify looping.
  const improving = roots.filter(root => !isFreeRepeatable(view, root.action) || root.score > baseline + 0.001);
  return (improving[0] ?? roots.find(root => root.action.type === 'endTurn') ?? roots[0]).action;
}
