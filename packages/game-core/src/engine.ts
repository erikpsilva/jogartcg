import type {
  CardFilter, CompiledCardRules, Duration, Effect, KeywordRule, RuleCondition,
  RuleTrigger, Stat, TargetSelector,
} from './cards.js';

/** All game randomness and pending work live in this JSON-serializable state. */
export type PlayerId = 'player' | 'bot';
export type CardType = 'Character' | 'Item' | 'Location' | 'Action';
export interface GameCard {
  id: number;
  name: string;
  type: CardType;
  cost: number;
  inkwell: boolean;
  strength: number;
  willpower: number;
  lore: number;
  moveCost: number;
  subtypes: string[];
  image: string;
  text: string;
  fullName?: string;
  displayName?: string;
  textPt?: string;
  rules: CompiledCardRules;
}
export interface CardInstance {
  iid: string;
  card: GameCard;
  exerted: boolean;
  drying: boolean;
  damage: number;
  location: string | null;
  stack: CardInstance[];
  faceDown?: boolean;
  boostedThisTurn?: number;
}
export interface PlayerState {
  deck: CardInstance[];
  hand: CardInstance[];
  field: CardInstance[];
  inkwell: CardInstance[];
  discard: CardInstance[];
  lore: number;
  inkedThisTurn: boolean;
  mulliganDone: boolean;
  mulliganReplaced: number;
  turns: number;
}
export interface CardStats {
  strength: number;
  willpower: number;
  lore: number;
  cost: number;
  moveCost: number;
  keywords: KeywordRule[];
  restrictions: string[];
}
export interface DecisionOption { id: string; label: string; cardId?: number; iid?: string; value?: number }
export interface PendingDecision {
  id: string;
  kind: 'mulligan' | 'targets' | 'optional' | 'order' | 'amount' | 'discard' | 'singers';
  player: PlayerId;
  label: string;
  description?: string;
  options: DecisionOption[];
  min: number;
  max: number;
}
type ActionDetails =
  | { type: 'choose'; optionIds: string[] }
  | { type: 'mulligan'; replace: string[] }
  | { type: 'ink'; iid: string }
  | { type: 'play'; iid: string; exerted?: boolean }
  | { type: 'shift'; iid: string; onto: string; cost: number }
  | { type: 'sing'; iid: string; singers: string[] }
  | { type: 'quest'; iid: string }
  | { type: 'challenge'; iid: string; target: string }
  | { type: 'move'; iid: string; location: string }
  | { type: 'activate'; iid: string; ability: number }
  | { type: 'boost'; iid: string; cost: number }
  | { type: 'endTurn' }
  | { type: 'concede' };
export type GameAction = ActionDetails & { player: PlayerId; label?: string };
export type LegalAction = GameAction & { label: string };
interface Context { player: PlayerId; source: CardInstance; sourceStats?: CardStats }
interface EffectFrame { effect: Effect; context: Context; accepted?: boolean }
interface BagEntry extends Context {
  id: string;
  label: string;
  description?: string;
  effects: Effect[];
  optional: boolean;
  condition?: RuleCondition;
  support?: boolean;
}
interface Modifier {
  iid: string;
  stat: Stat;
  amount: number;
  duration: Duration;
  player: PlayerId;
  createdTurn: number;
  expiresOnOwnTurn: number;
}
type DecisionWork =
  | { kind: 'mulligan' }
  | { kind: 'order' }
  | { kind: 'ability'; ability: BagEntry }
  | { kind: 'optional'; frame: EffectFrame }
  | { kind: 'targets'; frame: EffectFrame }
  | { kind: 'singers'; iid: string; required: number }
  | { kind: 'amount'; frame: EffectFrame; targets: string[]; amounts: number[] }
  | { kind: 'discard'; frame: EffectFrame; victim: PlayerId };
export interface GameState {
  version: 1;
  phase: 'mulligan' | 'main' | 'finished';
  players: Record<PlayerId, PlayerState>;
  activePlayer: PlayerId;
  firstPlayer: PlayerId;
  turn: number;
  winner: PlayerId | null;
  finishReason: 'lore' | 'emptyDeck' | 'concede' | 'draw' | null;
  rng: number;
  nextId: number;
  pending: PendingDecision | null;
  decision: DecisionWork | null;
  queue: EffectFrame[];
  bag: BagEntry[];
  bagPlayer: PlayerId | null;
  modifiers: Modifier[];
  combat: { attacker: string; defender: string; damageDone: boolean } | null;
  resolvingAction: { player: PlayerId; card: CardInstance } | null;
  transition: 'starting' | 'ending' | null;
  log: string[];
}
export interface CreateGameOptions { decks: Record<PlayerId, readonly GameCard[]>; seed?: number }

const PLAYERS: PlayerId[] = ['player', 'bot'];
const ZONES = ['deck', 'hand', 'field', 'inkwell', 'discard'] as const;
const KEYWORDS = new Set(['Alert', 'Bodyguard', 'Boost', 'Challenger', 'Evasive', 'Reckless', 'Resist', 'Rush', 'Shift', 'Singer', 'Sing Together', 'Support', 'Vanish', 'Ward']);
const OPS = new Set(['draw', 'gainLore', 'loseLore', 'damage', 'heal', 'banish', 'returnHand', 'ready', 'exert', 'buff', 'inkTop', 'recover', 'discard']);
const other = (player: PlayerId): PlayerId => player === 'player' ? 'bot' : 'player';
const copy = <T>(value: T): T => structuredClone(value);
const baseName = (name: string): string => name.split(/\s[-–—]\s/)[0].trim();
const uid = (state: GameState, prefix: string): string => `${prefix}${state.nextId++}`;
const note = (state: GameState, message: string): void => { state.log.push(message); if (state.log.length > 1000) state.log.splice(0, state.log.length - 1000); };
const isFinished = (state: GameState): boolean => state.phase === 'finished';
const cardName = (card: GameCard): string => card.displayName || card.fullName || card.name;
const playerName = (player: PlayerId): string => player === 'player' ? 'Você' : 'Bot';
const effectName = (op: Effect['op']): string => ({ draw: 'comprar cartas', gainLore: 'ganhar conhecimento', loseLore: 'perder conhecimento', damage: 'causar dano', heal: 'remover dano', banish: 'banir', returnHand: 'devolver à mão', ready: 'preparar', exert: 'exaurir', buff: 'alterar atributos', inkTop: 'adicionar ao tinteiro', recover: 'recuperar do descarte', discard: 'descartar' }[op]);

function validateCard(card: GameCard): void {
  const rules = card?.rules;
  const fail = (detail: string): never => { throw new Error(`Carta não suportada ${card?.id} (${card?.name}): ${detail}`); };
  if (!rules || rules.supported !== true || !Array.isArray(rules.unsupported) || rules.unsupported.length) {
    fail(rules?.unsupported?.join('; ') || 'regras compiladas ausentes');
  }
  if (!['Character', 'Item', 'Location', 'Action'].includes(card.type)) fail('tipo de carta desconhecido');
  for (const stat of ['cost', 'strength', 'willpower', 'lore', 'moveCost'] as const) {
    if (!Number.isInteger(card[stat]) || card[stat] < 0) fail(`atributo inválido: ${stat}`);
  }
  if (rules.sourceId !== card.id) fail('as regras compiladas pertencem a outra carta');
  for (const key of ['keywords', 'static', 'triggered', 'activated', 'action'] as const) {
    if (!Array.isArray(rules[key])) fail(`regras ausentes: ${key}`);
  }
  const number = (value: unknown, signed = false): boolean => Number.isSafeInteger(value) && (signed || (value as number) >= 0);
  const validateKeyword = (keyword: string, value?: number): void => {
    if (!KEYWORDS.has(keyword)) fail(`habilidade desconhecida: ${keyword}`);
    if (['Boost', 'Challenger', 'Resist', 'Shift', 'Singer', 'Sing Together'].includes(keyword) && !number(value)) fail(`valor inválido: ${keyword}`);
  };
  for (const keyword of rules.keywords) {
    validateKeyword(keyword.keyword, keyword.value);
  }
  const validateFilter = (filter?: CardFilter): void => {
    if (!filter) return;
    if (Object.keys(filter).some(key => !['types', 'subtypes', 'name', 'damaged', 'exerted', 'costAtMost', 'strengthAtMost', 'excludeSelf'].includes(key))) fail('filtro de carta desconhecido');
    if (filter.types && (!Array.isArray(filter.types) || filter.types.some(type => !['Character', 'Item', 'Location', 'Action'].includes(type)))) fail('tipo de alvo inválido');
    if (filter.subtypes && (!Array.isArray(filter.subtypes) || filter.subtypes.some(type => typeof type !== 'string'))) fail('subtipo de alvo inválido');
    for (const key of ['costAtMost', 'strengthAtMost'] as const) if (filter[key] !== undefined && !number(filter[key])) fail('limite de filtro inválido');
    for (const key of ['damaged', 'exerted', 'excludeSelf'] as const) if (filter[key] !== undefined && typeof filter[key] !== 'boolean') fail('condição de filtro inválida');
  };
  const validateCondition = (condition?: RuleCondition): void => {
    if (!condition) return;
    if (!['selfDamaged', 'youHave'].includes(condition.kind)) fail('condição desconhecida');
    validateFilter(condition.filter);
    if (condition.countAtLeast !== undefined && !number(condition.countAtLeast)) fail('quantidade de condição inválida');
  };
  const validateTarget = (target: TargetSelector): void => {
    if (!target || !['self', 'chosen', 'all', 'player'].includes(target.kind)
      || !['you', 'opponent', 'any', 'eachOpponent'].includes(target.owner)) fail('alvo inválido');
    if (target.zone && !['play', 'discard', 'hand'].includes(target.zone)) fail('zona de alvo inválida');
    if (target.min !== undefined && (!Number.isInteger(target.min) || target.min < 0)) fail('mínimo de alvos inválido');
    if (target.max !== undefined && (!Number.isInteger(target.max) || target.max < (target.min ?? 0))) fail('máximo de alvos inválido');
    validateFilter(target.filter);
  };
  const validateEffects = (effects: Effect[]): void => {
    if (!Array.isArray(effects)) fail('efeitos ausentes');
    for (const effect of effects) {
      if (!OPS.has(effect.op)) fail(`efeito desconhecido: ${effect.op}`);
      validateTarget(effect.target);
      const playerEffect = ['draw', 'gainLore', 'loseLore', 'inkTop'].includes(effect.op);
      const playerSelector = effect.target.kind === 'player' || (effect.target.kind === 'chosen' && !effect.target.zone && !effect.target.filter);
      if (playerEffect !== playerSelector && effect.op !== 'discard') fail('efeito incompatível com o tipo de alvo');
      if (effect.amount !== undefined && (!Number.isInteger(effect.amount) || (effect.amount < 0 && effect.op !== 'buff'))) fail('quantidade de efeito inválida');
      if (effect.op === 'buff' && (!['strength', 'willpower', 'lore'].includes(effect.stat!)
        || !['thisTurn', 'untilStartOfYourNextTurn', 'untilEndOfYourNextTurn'].includes(effect.duration!))) fail('alteração temporária inválida');
    }
  };
  for (const rule of rules.static) {
    if (!['buff', 'grantKeyword', 'restriction', 'costReduction'].includes(rule.kind)) fail('regra estática desconhecida');
    validateTarget(rule.target);
    validateCondition(rule.condition);
    if (rule.kind === 'grantKeyword') validateKeyword(rule.keyword, rule.value);
    if (rule.kind === 'costReduction' && !number(rule.amount)) fail('redução de custo inválida');
    if (rule.kind === 'buff') {
      if (!['strength', 'willpower', 'lore'].includes(rule.stat) || !number(rule.amount, true)) fail('alteração estática inválida');
      if (rule.per) validateTarget(rule.per);
    }
    if (rule.kind === 'restriction' && !['cantQuest', 'cantChallenge', 'cantSing', 'cantBeChallenged', 'cantReadyAtStart'].includes(rule.restriction)) fail('restrição desconhecida');
    // Such selectors create recursive continuous-effect dependencies, outside this compiler contract.
    if (rule.target.filter?.strengthAtMost !== undefined || rule.condition?.filter?.strengthAtMost !== undefined || (rule.kind === 'buff' && rule.per?.filter?.strengthAtMost !== undefined)) fail('seletor estático de força recursivo');
  }
  for (const rule of rules.triggered) {
    if (!['play', 'selfQuest', 'selfBanished', 'start', 'end', 'challenge'].includes(rule.trigger)) fail('gatilho desconhecido');
    if (rule.turn && !['yours', 'opponents', 'any'].includes(rule.turn)) fail('turno de gatilho desconhecido');
    validateCondition(rule.condition);
    validateEffects(rule.effects);
  }
  for (const rule of rules.activated) {
    if (!rule.cost || (rule.cost.ink !== undefined && (!Number.isInteger(rule.cost.ink) || rule.cost.ink < 0))) fail('custo de habilidade inválido');
    validateEffects(rule.effects);
  }
  validateEffects(rules.action);
}

function random(state: GameState): number {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let value = state.rng;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
}
function shuffle(state: GameState, cards: CardInstance[]): void {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random(state) * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
}
function fresh(state: GameState, card: GameCard): CardInstance {
  return { iid: uid(state, 'c'), card: copy(card), exerted: false, drying: false, damage: 0, location: null, stack: [] };
}
function emptyPlayer(): PlayerState {
  return { deck: [], hand: [], field: [], inkwell: [], discard: [], lore: 0, inkedThisTurn: false, mulliganDone: false, mulliganReplaced: 0, turns: 0 };
}
export function createGame(options: CreateGameOptions): GameState {
  if (!options || !options.decks) throw new Error('Os dois decks são obrigatórios');
  if (options.seed !== undefined && !Number.isSafeInteger(options.seed)) throw new Error('A semente deve ser um número inteiro válido');
  for (const player of PLAYERS) {
    if (!Array.isArray(options.decks[player]) || options.decks[player].length < 7) throw new Error(`${playerName(player)} precisa de pelo menos 7 cartas`);
    options.decks[player].forEach(validateCard);
  }
  const state: GameState = {
    version: 1, phase: 'mulligan', players: { player: emptyPlayer(), bot: emptyPlayer() },
    activePlayer: 'player', firstPlayer: 'player', turn: 0, winner: null, finishReason: null,
    rng: (options.seed ?? 1) >>> 0, nextId: 1, pending: null, decision: null,
    queue: [], bag: [], bagPlayer: null, modifiers: [], combat: null, resolvingAction: null, transition: null, log: [],
  };
  state.firstPlayer = state.activePlayer = random(state) < 0.5 ? 'player' : 'bot';
  for (const player of PLAYERS) {
    state.players[player].deck = options.decks[player].map(card => fresh(state, card));
    shuffle(state, state.players[player].deck);
    draw(state, player, 7);
  }
  mulliganPrompt(state, state.firstPlayer);
  return state;
}

function find(state: GameState, iid: string): { instance: CardInstance; player: PlayerId; zone: typeof ZONES[number] } | null {
  for (const player of PLAYERS) for (const zone of ZONES) {
    const instance = state.players[player][zone].find(card => card.iid === iid);
    if (instance) return { instance, player, zone };
  }
  return null;
}
function sourceOf(state: GameState, context: Context): CardInstance {
  const found = find(state, context.source.iid);
  return found?.zone === 'field' ? found.instance : context.source;
}
function owners(player: PlayerId, owner: TargetSelector['owner']): PlayerId[] {
  return owner === 'you' ? [player] : owner === 'any' ? PLAYERS : [other(player)];
}
function matches(state: GameState, instance: CardInstance, filter: CardFilter | undefined, source: CardInstance): boolean {
  if (!filter) return true;
  if (filter.types && !filter.types.includes(instance.card.type)) return false;
  if (filter.subtypes && !filter.subtypes.every(type => instance.card.subtypes.includes(type))) return false;
  if (filter.name && instance.card.name !== filter.name && baseName(instance.card.name) !== filter.name) return false;
  if (filter.excludeSelf && instance.iid === source.iid) return false;
  if (filter.damaged !== undefined && (instance.damage > 0) !== filter.damaged) return false;
  if (filter.exerted !== undefined && instance.exerted !== filter.exerted) return false;
  if (filter.costAtMost !== undefined && instance.card.cost > filter.costAtMost) return false;
  if (filter.strengthAtMost !== undefined && getStats(state, instance.iid).strength > filter.strengthAtMost) return false;
  return true;
}
function conditionMet(state: GameState, context: Context, condition?: RuleCondition): boolean {
  if (!condition) return true;
  if (condition.kind === 'selfDamaged') return sourceOf(state, context).damage > 0;
  return state.players[context.player].field.filter(card => matches(state, card, condition.filter, context.source)).length >= (condition.countAtLeast ?? 1);
}
function selectedBy(state: GameState, target: TargetSelector, context: Context, instance: CardInstance, owner: PlayerId, zone: string): boolean {
  if (target.kind === 'self') return instance.iid === context.source.iid;
  return owners(context.player, target.owner).includes(owner)
    && (!target.zone || target.zone === (zone === 'field' ? 'play' : zone))
    && matches(state, instance, target.filter, context.source);
}
function targets(state: GameState, target: TargetSelector, context: Context, protectWard = true): string[] {
  if (target.kind === 'player' || (target.kind === 'chosen' && !target.zone && !target.filter)) return owners(context.player, target.owner);
  const result: string[] = [];
  for (const player of PLAYERS) for (const zone of ['field', 'hand', 'discard'] as const) {
    if (target.kind !== 'self' && (target.zone ?? 'play') !== (zone === 'field' ? 'play' : zone)) continue;
    if (target.kind === 'self' && zone !== 'field') continue;
    for (const instance of state.players[player][zone]) {
      if (!selectedBy(state, target, context, instance, player, zone)) continue;
      if (protectWard && target.kind === 'chosen' && zone === 'field' && player !== context.player && hasKeyword(state, instance.iid, 'Ward')) continue;
      result.push(instance.iid);
    }
  }
  return result;
}
export function getStats(state: GameState, iid: string): CardStats {
  const found = find(state, iid);
  if (!found) throw new Error(`Instância de carta desconhecida: ${iid}`);
  const { instance, player, zone } = found;
  const stats: CardStats = {
    strength: instance.card.strength, willpower: instance.card.willpower, lore: instance.card.lore,
    cost: effectiveCost(state, iid, instance.card.cost), moveCost: instance.card.moveCost,
    keywords: copy(instance.card.rules.keywords), restrictions: [],
  };
  if (zone === 'field') for (const modifier of state.modifiers) if (modifier.iid === iid) stats[modifier.stat] += modifier.amount;
  const sources = PLAYERS.flatMap(owner => state.players[owner].field.map(source => ({ player: owner, source })));
  for (const context of sources) for (const rule of context.source.card.rules.static) {
    if (zone !== 'field' || rule.kind === 'costReduction') continue;
    if (!conditionMet(state, context, rule.condition) || !selectedBy(state, rule.target, context, instance, player, zone)) continue;
    if (rule.kind === 'buff') stats[rule.stat] += rule.amount * (rule.per ? targets(state, rule.per, context, false).length : 1);
    else if (rule.kind === 'grantKeyword') stats.keywords.push({ keyword: rule.keyword, ...(rule.value !== undefined ? { value: rule.value } : {}), sourceText: rule.sourceText });
    else if (rule.kind === 'restriction') stats.restrictions.push(rule.restriction);
  }
  if (state.combat?.attacker === iid) stats.strength += stats.keywords.filter(rule => rule.keyword === 'Challenger').reduce((sum, rule) => sum + (rule.value ?? 0), 0);
  for (const stat of ['strength', 'willpower', 'lore', 'cost', 'moveCost'] as const) stats[stat] = Math.max(0, stats[stat]);
  return stats;
}
function effectiveCost(state: GameState, iid: string, baseCost: number): number {
  const found = find(state, iid)!;
  const sources = PLAYERS.flatMap(player => state.players[player].field.map(source => ({ player, source })));
  if (found.zone === 'hand') sources.push({ player: found.player, source: found.instance });
  for (const context of sources) for (const rule of context.source.card.rules.static) {
    if (rule.kind !== 'costReduction') continue;
    // Only a self-referential cost ability functions while its source is still in hand.
    if (context.source.iid === iid && found.zone === 'hand' && rule.target.kind !== 'self') continue;
    if (conditionMet(state, context, rule.condition) && selectedBy(state, rule.target, context, found.instance, found.player, found.zone)) baseCost -= rule.amount;
  }
  return Math.max(0, baseCost);
}
function hasKeyword(state: GameState, iid: string, keyword: string): boolean {
  return getStats(state, iid).keywords.some(rule => rule.keyword === keyword);
}
function keywordValue(state: GameState, iid: string, keyword: string): number {
  return getStats(state, iid).keywords.filter(rule => rule.keyword === keyword).reduce((sum, rule) => sum + (rule.value ?? 0), 0);
}
function restricted(state: GameState, iid: string, restriction: string): boolean {
  return getStats(state, iid).restrictions.includes(restriction);
}
export function availableInk(state: GameState, player: PlayerId): number {
  return state.players[player].inkwell.filter(card => !card.exerted).length;
}
export function activeDecisionPlayer(state: GameState): PlayerId | null {
  return state.phase === 'finished' ? null : state.pending?.player ?? state.activePlayer;
}
export function actionLabel(action: GameAction): string {
  return action.label ?? ({ choose: 'Escolher', mulligan: 'Trocar cartas', ink: 'Colocar no tinteiro', play: 'Jogar', shift: 'Transformar', sing: 'Cantar', quest: 'Explorar', challenge: 'Desafiar', move: 'Mover', activate: 'Usar habilidade', boost: 'Impulsionar', endTurn: 'Encerrar turno', concede: 'Conceder' }[action.type]);
}

function prompt(state: GameState, pending: Omit<PendingDecision, 'id'>, work: DecisionWork): void {
  state.pending = { id: uid(state, 'd'), ...pending };
  state.decision = work;
}
function cardOption(state: GameState, iid: string): DecisionOption {
  if (iid === 'player' || iid === 'bot') return { id: iid, label: iid === 'player' ? 'Você' : 'Bot' };
  const instance = find(state, iid)!.instance;
  return { id: iid, iid, cardId: instance.card.id, label: cardName(instance.card) };
}
function mulliganPrompt(state: GameState, player: PlayerId): void {
  prompt(state, { kind: 'mulligan', player, label: 'Escolha as cartas para trocar (ou mantenha a mão)', options: state.players[player].hand.map(card => cardOption(state, card.iid)), min: 0, max: Math.min(7, state.players[player].deck.length) }, { kind: 'mulligan' });
}
function draw(state: GameState, player: PlayerId, amount: number): void {
  const cards = state.players[player].deck.splice(0, amount);
  state.players[player].hand.push(...cards);
  // The 2026 empty-deck rule is checked at the end of the player's turn.
}
function pay(state: GameState, player: PlayerId, amount: number): void {
  if (availableInk(state, player) < amount) throw new Error('Tinta disponível insuficiente');
  for (const card of state.players[player].inkwell) if (!card.exerted && amount > 0) { card.exerted = true; amount--; }
}
function finish(state: GameState, winner: PlayerId | null, reason: GameState['finishReason']): void {
  if (state.resolvingAction) state.players[state.resolvingAction.player].discard.push(state.resolvingAction.card);
  state.phase = 'finished'; state.winner = winner; state.finishReason = reason;
  state.pending = null; state.decision = null; state.queue = []; state.bag = []; state.bagPlayer = null;
  state.combat = null; state.resolvingAction = null; state.transition = null;
}
function addAbility(state: GameState, context: Context, effects: Effect[], label: string, optional = false, condition?: RuleCondition): void {
  const found = find(state, context.source.iid);
  const sourceStats = found?.zone === 'field' ? getStats(state, context.source.iid) : context.sourceStats;
  state.bag.push({ ...copy(context), ...(sourceStats ? { sourceStats } : {}), id: uid(state, 'b'), effects: copy(effects), label, optional, ...(condition ? { condition: copy(condition) } : {}) });
}
function trigger(state: GameState, player: PlayerId, source: CardInstance, event: RuleTrigger): void {
  const context = { player, source };
  for (const rule of source.card.rules.triggered) {
    if (rule.trigger !== event) continue;
    if (rule.turn === 'yours' && state.activePlayer !== player) continue;
    if (rule.turn === 'opponents' && state.activePlayer === player) continue;
    addAbility(state, context, rule.effects, `${cardName(source.card)}: ${rule.effects.map(effect => effectName(effect.op)).join(', ')}`, rule.optional, rule.condition);
  }
}
function flatten(instance: CardInstance): CardInstance[] {
  return [instance, ...instance.stack.flatMap(flatten)];
}
function leaveField(state: GameState, iid: string, destination: 'discard' | 'hand', banished: boolean): void {
  const found = find(state, iid);
  if (!found || found.zone !== 'field') return;
  const { instance, player } = found;
  const snapshot = copy(instance);
  const sourceStats = getStats(state, iid);
  for (const ability of state.bag) if (ability.source.iid === iid) { ability.source = copy(snapshot); ability.sourceStats = sourceStats; }
  for (const frame of state.queue) if (frame.context.source.iid === iid) { frame.context.source = copy(snapshot); frame.context.sourceStats = sourceStats; }
  state.players[player].field = state.players[player].field.filter(card => card.iid !== iid);
  state.modifiers = state.modifiers.filter(modifier => modifier.iid !== iid);
  for (const owner of PLAYERS) for (const card of state.players[owner].field) if (card.location === iid) card.location = null;
  for (const card of flatten(instance)) {
    card.exerted = false; card.drying = false; card.damage = 0; card.location = null; card.stack = [];
    delete card.faceDown; delete card.boostedThisTurn;
    state.players[player][destination].push(card);
  }
  if (banished) trigger(state, player, snapshot, 'selfBanished');
}
function stateCheck(state: GameState): void {
  if (isFinished(state)) return;
  const winners = PLAYERS.filter(player => state.players[player].lore >= 20);
  if (winners.length) { finish(state, winners.length === 1 ? winners[0] : state.activePlayer, 'lore'); return; }
  // Determine the whole lethal set before removing anything: combat and area damage are simultaneous.
  for (;;) {
    const lethal = PLAYERS.flatMap(player => state.players[player].field)
      .filter(card => ['Character', 'Location'].includes(card.card.type) && card.damage >= getStats(state, card.iid).willpower);
    if (!lethal.length) break;
    for (const card of lethal) leaveField(state, card.iid, 'discard', true);
  }
}
function startTurn(state: GameState): void {
  state.phase = 'main'; state.transition = 'starting'; state.turn++;
  const player = state.activePlayer;
  const own = state.players[player];
  own.turns++; own.inkedThisTurn = false;
  const dontReady = new Set(own.field.filter(card => restricted(state, card.iid, 'cantReadyAtStart')).map(card => card.iid));
  for (const card of [...own.field, ...own.inkwell]) {
    if (!dontReady.has(card.iid)) card.exerted = false;
    card.drying = false;
  }
  state.modifiers = state.modifiers.filter(modifier => !(modifier.duration === 'untilStartOfYourNextTurn' && modifier.player === player && own.turns >= modifier.expiresOnOwnTurn));
  // Start triggers are already waiting when the Ready-step state check removes lethal cards.
  for (const owner of PLAYERS) for (const card of state.players[owner].field) trigger(state, owner, card, 'start');
  stateCheck(state);
  if (isFinished(state)) return;
  for (const card of own.field) if (card.card.type === 'Location') own.lore += getStats(state, card.iid).lore;
  stateCheck(state);
  if (isFinished(state)) return;
  note(state, `Turno ${state.turn}: ${playerName(player)}`);
}
function completeEnd(state: GameState): void {
  const player = state.activePlayer;
  state.modifiers = state.modifiers.filter(modifier => modifier.duration !== 'thisTurn'
    && !(modifier.duration === 'untilEndOfYourNextTurn' && modifier.player === player && state.players[player].turns >= modifier.expiresOnOwnTurn));
  stateCheck(state);
  if (state.phase === 'finished' || state.bag.length) return;
  if (!state.players[player].deck.length) { finish(state, other(player), 'emptyDeck'); return; }
  state.transition = null;
  state.activePlayer = other(player);
  startTurn(state);
}

function challengeTargets(state: GameState, attacker: CardInstance, player: PlayerId): CardInstance[] {
  if (attacker.card.type !== 'Character' || attacker.exerted || (attacker.drying && !hasKeyword(state, attacker.iid, 'Rush')) || restricted(state, attacker.iid, 'cantChallenge')) return [];
  const eligible = state.players[other(player)].field.filter(target => {
    if (restricted(state, target.iid, 'cantBeChallenged')) return false;
    if (hasKeyword(state, target.iid, 'Evasive') && !hasKeyword(state, attacker.iid, 'Evasive') && !hasKeyword(state, attacker.iid, 'Alert')) return false;
    if (target.card.type === 'Location') return true;
    return target.card.type === 'Character' && target.exerted;
  });
  const guards = eligible.filter(target => target.card.type === 'Character' && hasKeyword(state, target.iid, 'Bodyguard'));
  return eligible.filter(target => target.card.type === 'Location' || !guards.length || guards.includes(target));
}
function combinations<T>(items: T[], min: number, max: number, limit = 128): T[][] {
  const result: T[][] = [];
  function visit(index: number, chosen: T[]): void {
    if (chosen.length >= min) result.push([...chosen]);
    if (chosen.length >= max || result.length >= limit) return;
    for (let i = index; i < items.length && result.length < limit; i++) { chosen.push(items[i]); visit(i + 1, chosen); chosen.pop(); }
  }
  visit(0, []);
  return result;
}
function singingCost(state: GameState, card: CardInstance): number {
  return Math.max(card.card.cost, ...getStats(state, card.iid).keywords.filter(rule => rule.keyword === 'Singer').map(rule => rule.value ?? 0));
}
function eligibleSingers(state: GameState, player: PlayerId): CardInstance[] {
  return state.players[player].field.filter(card => card.card.type === 'Character' && !card.exerted && !card.drying && !restricted(state, card.iid, 'cantSing'));
}
function singerSelections(options: DecisionOption[], required: number): DecisionOption[][] {
  // Present a bounded set of executable bot choices; the UI may choose ANY valid subset.
  const result: DecisionOption[][] = [];
  const keys = new Set<string>();
  for (let start = 0; start <= options.length; start++) {
    const ordered = start === options.length ? options : [options[start], ...options.filter((_, index) => index !== start).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))];
    const selection: DecisionOption[] = [];
    let value = 0;
    for (const option of ordered) {
      selection.push(option); value += option.value ?? 0;
      if (value >= required && start !== options.length) break;
    }
    const key = selection.map(option => option.id).sort().join(',');
    if (value >= required && !keys.has(key)) { keys.add(key); result.push(selection); }
  }
  return result;
}
export function getLegalActions(state: GameState, player: PlayerId = activeDecisionPlayer(state) ?? state.activePlayer): LegalAction[] {
  if (state.phase === 'finished') return [];
  const actions: LegalAction[] = [];
  const add = (details: ActionDetails, label: string): void => { actions.push({ ...details, player, label }); };
  if (state.pending) {
    if (state.pending.player === player) {
      const pending = state.pending;
      // Multi-select options remain complete; enumerate bounded concrete choices for local search.
      // applyAction validates any chosen subset against pending, not membership in this list.
      const selections = state.decision?.kind === 'singers' ? singerSelections(pending.options, state.decision.required) : combinations(pending.options, pending.min, pending.max);
      for (const selection of selections) {
        add({ type: 'choose', optionIds: selection.map(option => option.id) }, selection.length ? selection.map(option => option.label).join(' + ') : pending.kind === 'mulligan' ? 'Manter a mão' : 'Não / passar');
      }
    }
  } else if (state.phase === 'main' && state.activePlayer === player) {
    const own = state.players[player];
    const ink = availableInk(state, player);
    const singers = eligibleSingers(state, player);
    for (const card of own.hand) {
      if (!own.inkedThisTurn && card.card.inkwell) add({ type: 'ink', iid: card.iid }, `Tinteiro: ${cardName(card.card)}`);
      if (getStats(state, card.iid).cost <= ink) {
        add({ type: 'play', iid: card.iid }, `Jogar: ${cardName(card.card)}`);
        if (hasKeyword(state, card.iid, 'Bodyguard')) add({ type: 'play', iid: card.iid, exerted: true }, `Jogar exaurido: ${cardName(card.card)}`);
      }
      if (card.card.type === 'Character') for (const shift of card.card.rules.keywords.filter(rule => rule.keyword === 'Shift')) {
        const cost = effectiveCost(state, card.iid, shift.value ?? 0);
        if (cost > ink) continue;
        for (const target of own.field) if (target.card.type === 'Character' && baseName(target.card.name) === (shift.shiftName ?? baseName(card.card.name))) {
          add({ type: 'shift', iid: card.iid, onto: target.iid, cost }, `Transformar: ${cardName(card.card)} sobre ${cardName(target.card)}`);
        }
      }
      if (card.card.type === 'Action' && card.card.subtypes.includes('Song')) {
        const together = card.card.rules.keywords.find(rule => rule.keyword === 'Sing Together');
        if (together) {
          if (singers.length && singers.reduce((sum, singer) => sum + singingCost(state, singer), 0) >= together.value!) add({ type: 'sing', iid: card.iid, singers: [] }, `Cantar juntos: ${cardName(card.card)} (escolher personagens)`);
        } else for (const singer of singers) if (singingCost(state, singer) >= card.card.cost) {
          add({ type: 'sing', iid: card.iid, singers: [singer.iid] }, `Cantar: ${cardName(card.card)} (${cardName(singer.card)})`);
        }
      }
    }
    let mustChallenge = false;
    for (const card of own.field) {
      if (card.card.type === 'Character') {
        if (!card.exerted && !card.drying && !hasKeyword(state, card.iid, 'Reckless') && !restricted(state, card.iid, 'cantQuest')) add({ type: 'quest', iid: card.iid }, `Explorar: ${cardName(card.card)}`);
        const opponents = challengeTargets(state, card, player);
        if (opponents.length && hasKeyword(state, card.iid, 'Reckless')) mustChallenge = true;
        for (const target of opponents) add({ type: 'challenge', iid: card.iid, target: target.iid }, `Desafiar: ${cardName(card.card)} → ${cardName(target.card)}`);
        for (const location of own.field) if (location.card.type === 'Location' && location.iid !== card.location && getStats(state, location.iid).moveCost <= ink) add({ type: 'move', iid: card.iid, location: location.iid }, `Mover: ${cardName(card.card)} → ${cardName(location.card)}`);
      }
      if (card.boostedThisTurn !== state.turn) for (const boost of getStats(state, card.iid).keywords.filter(rule => rule.keyword === 'Boost')) {
        if (boost.value! <= ink) add({ type: 'boost', iid: card.iid, cost: boost.value! }, `Impulsionar: ${cardName(card.card)}`);
      }
      card.card.rules.activated.forEach((ability, index) => {
        if ((ability.cost.ink ?? 0) > ink) return;
        if (ability.cost.exert && (card.exerted || (card.card.type === 'Character' && card.drying))) return;
        add({ type: 'activate', iid: card.iid, ability: index }, `${cardName(card.card)}: ${ability.effects.map(effect => effectName(effect.op)).join(', ')}`);
      });
    }
    if (!mustChallenge) add({ type: 'endTurn' }, 'Encerrar turno');
  }
  add({ type: 'concede' }, 'Conceder');
  return actions;
}

function enqueue(state: GameState, context: Context, effects: Effect[]): void {
  state.queue.unshift(...effects.map(effect => ({ effect: copy(effect), context: copy(context) })));
}
function resolveAbility(state: GameState, ability: BagEntry, accepted = false): void {
  if (!conditionMet(state, ability, ability.condition)) return;
  if (ability.optional && !accepted) {
    prompt(state, { kind: 'optional', player: ability.player, label: ability.label, description: ability.description ?? ability.source.card.textPt ?? ability.source.card.text, options: [{ id: 'yes', label: 'Usar efeito' }], min: 0, max: 1 }, { kind: 'ability', ability });
  } else {
    if (ability.support) {
      const found = find(state, ability.source.iid);
      const strength = found?.zone === 'field' ? getStats(state, found.instance.iid).strength : ability.sourceStats?.strength ?? ability.source.card.strength;
      ability.effects[0].amount = strength;
    }
    enqueue(state, ability, ability.effects);
  }
}
function beginEffect(state: GameState, frame: EffectFrame): void {
  const { effect, context } = frame;
  if (effect.optional && !frame.accepted) {
    prompt(state, { kind: 'optional', player: context.player, label: `${cardName(context.source.card)}: ${effectName(effect.op)}?`, description: context.source.card.textPt ?? context.source.card.text, options: [{ id: 'yes', label: 'Usar efeito' }], min: 0, max: 1 }, { kind: 'optional', frame });
    return;
  }
  const eligible = targets(state, effect.target, context);
  if (!eligible.length) return;
  if (effect.target.kind === 'chosen') {
    const max = Math.min(effect.target.max ?? 1, eligible.length);
    const min = Math.min(effect.target.min ?? 1, max);
    prompt(state, { kind: 'targets', player: context.player, label: `${cardName(context.source.card)}: ${effectName(effect.op)}`, description: context.source.card.textPt ?? context.source.card.text, options: eligible.map(iid => cardOption(state, iid)), min, max }, { kind: 'targets', frame });
  } else prepareAmounts(state, frame, eligible, []);
}
function prepareAmounts(state: GameState, frame: EffectFrame, chosen: string[], amounts: number[]): void {
  if (frame.effect.upTo && amounts.length < chosen.length) {
    const target = chosen[amounts.length];
    const maximum = frame.effect.op === 'heal' ? Math.min(frame.effect.amount ?? 0, find(state, target)?.instance.damage ?? 0) : frame.effect.amount ?? 0;
    prompt(state, { kind: 'amount', player: frame.context.player, label: `${cardName(frame.context.source.card)}: quantidade (${cardOption(state, target).label})`, description: frame.context.source.card.textPt ?? frame.context.source.card.text, options: Array.from({ length: maximum + 1 }, (_, amount) => ({ id: String(amount), label: String(amount) })), min: 1, max: 1 }, { kind: 'amount', frame, targets: chosen, amounts });
    return;
  }
  executeEffect(state, frame, chosen, amounts);
}
function executeEffect(state: GameState, frame: EffectFrame, chosen: string[], amounts: number[]): void {
  const { effect, context } = frame;
  if (effect.op === 'damage') {
    // Calculate every damage packet against the same pre-damage continuous effects.
    const packets = chosen.map((iid, index) => {
      const found = find(state, iid);
      return found?.zone === 'field' ? { card: found.instance, damage: Math.max(0, (amounts[index] ?? effect.amount ?? 1) - keywordValue(state, iid, 'Resist')) } : null;
    });
    for (const packet of packets) if (packet) packet.card.damage += packet.damage;
    return;
  }
  for (let index = 0; index < chosen.length; index++) {
    const target = chosen[index];
    const amount = amounts[index] ?? effect.amount ?? 1;
    const found = find(state, target);
    if (effect.op === 'draw' && PLAYERS.includes(target as PlayerId)) draw(state, target as PlayerId, amount);
    else if ((effect.op === 'gainLore' || effect.op === 'loseLore') && PLAYERS.includes(target as PlayerId)) state.players[target as PlayerId].lore = Math.max(0, state.players[target as PlayerId].lore + (effect.op === 'gainLore' ? amount : -amount));
    else if (effect.op === 'inkTop' && PLAYERS.includes(target as PlayerId)) {
      const player = state.players[target as PlayerId];
      for (const card of player.deck.splice(0, amount)) { card.exerted = effect.entersExerted ?? true; player.inkwell.push(card); }
    } else if (effect.op === 'discard' && PLAYERS.includes(target as PlayerId)) {
      const victim = target as PlayerId;
      const hand = state.players[victim].hand;
      if (!hand.length || amount === 0) continue;
      // Each affected player chooses their own discards. Remaining players resolve in order.
      if (index + 1 < chosen.length) state.queue.unshift(...chosen.slice(index + 1).map(next => ({ effect: { ...effect, target: { kind: 'player' as const, owner: next === context.player ? 'you' as const : 'opponent' as const } }, context })));
      prompt(state, { kind: 'discard', player: victim, label: `Descartar ${Math.min(amount, hand.length)} carta(s)`, description: frame.context.source.card.textPt ?? frame.context.source.card.text, options: hand.map(card => cardOption(state, card.iid)), min: Math.min(amount, hand.length), max: Math.min(amount, hand.length) }, { kind: 'discard', frame, victim });
      return;
    } else if (found) {
      const card = found.instance;
      if (effect.op === 'heal' && found.zone === 'field') card.damage = Math.max(0, card.damage - amount);
      else if (effect.op === 'banish') leaveField(state, card.iid, 'discard', true);
      else if (effect.op === 'returnHand') leaveField(state, card.iid, 'hand', false);
      else if (effect.op === 'ready' && found.zone === 'field') card.exerted = false;
      else if (effect.op === 'exert' && found.zone === 'field') card.exerted = true;
      else if (effect.op === 'buff' && found.zone === 'field') state.modifiers.push({ iid: card.iid, stat: effect.stat!, amount, duration: effect.duration!, player: context.player, createdTurn: state.turn, expiresOnOwnTurn: state.players[context.player].turns + 1 });
      else if (effect.op === 'recover' && found.zone === 'discard') {
        state.players[found.player].discard = state.players[found.player].discard.filter(item => item.iid !== card.iid);
        state.players[found.player].hand.push(card);
      } else if (effect.op === 'discard' && found.zone === 'hand') {
        state.players[found.player].hand = state.players[found.player].hand.filter(item => item.iid !== card.iid);
        state.players[found.player].discard.push(card);
      }
    }
  }
}
function combatDamage(state: GameState): void {
  const combat = state.combat!;
  combat.damageDone = true;
  const attacker = find(state, combat.attacker);
  const defender = find(state, combat.defender);
  if (!attacker || !defender || attacker.zone !== 'field' || defender.zone !== 'field') return;
  const attack = getStats(state, attacker.instance.iid);
  const defend = getStats(state, defender.instance.iid);
  const outgoing = Math.max(0, attack.strength - keywordValue(state, defender.instance.iid, 'Resist'));
  const incoming = defender.instance.card.type === 'Character' ? Math.max(0, defend.strength - keywordValue(state, attacker.instance.iid, 'Resist')) : 0;
  defender.instance.damage += outgoing;
  attacker.instance.damage += incoming;
  stateCheck(state);
}
function drain(state: GameState): void {
  let steps = 0;
  while (state.phase !== 'finished' && !state.pending) {
    if (++steps > 10000) throw new Error('A resolução dos efeitos excedeu o limite de segurança');
    if (state.queue.length) { beginEffect(state, state.queue.shift()!); continue; }
    if (state.resolvingAction) {
      state.players[state.resolvingAction.player].discard.push(state.resolvingAction.card);
      state.resolvingAction = null;
    }
    // One printed effect sequence finishes before a game-state check or another bag ability.
    stateCheck(state);
    if (isFinished(state)) break;
    if (state.bag.length) {
      const player = state.bagPlayer && state.bag.some(ability => ability.player === state.bagPlayer)
        ? state.bagPlayer : state.bag.some(ability => ability.player === state.activePlayer) ? state.activePlayer : other(state.activePlayer);
      state.bagPlayer = player;
      const abilities = state.bag.filter(ability => ability.player === player);
      if (abilities.length > 1) prompt(state, { kind: 'order', player, label: 'Escolha a próxima habilidade para resolver', options: abilities.map(ability => ({ id: ability.id, label: ability.label, cardId: ability.source.card.id, iid: ability.source.iid })), min: 1, max: 1 }, { kind: 'order' });
      else {
        state.bag = state.bag.filter(ability => ability.id !== abilities[0].id);
        resolveAbility(state, abilities[0]);
      }
      continue;
    }
    state.bagPlayer = null;
    if (state.combat) {
      if (!state.combat.damageDone) combatDamage(state);
      else state.combat = null;
      continue;
    }
    if (state.transition === 'starting') {
      // Ready/Set abilities resolve before the normal draw (CR 3.2).
      state.transition = null;
      if (state.turn !== 1) draw(state, state.activePlayer, 1);
      continue;
    }
    if (state.transition === 'ending') { completeEnd(state); continue; }
    break;
  }
}

function choose(state: GameState, action: Extract<GameAction, { type: 'choose' }>): void {
  const pending = state.pending;
  const work = state.decision;
  if (!pending || !work || pending.player !== action.player || !Array.isArray(action.optionIds)) throw new Error('Não há uma decisão correspondente');
  const ids = action.optionIds;
  if (new Set(ids).size !== ids.length || ids.length < pending.min || ids.length > pending.max || ids.some(id => !pending.options.some(option => option.id === id))) throw new Error('Seleção de decisão inválida');
  state.pending = null; state.decision = null;
  if (work.kind === 'mulligan') {
    const player = state.players[action.player];
    const replacements = player.hand.filter(card => ids.includes(card.iid));
    player.hand = player.hand.filter(card => !ids.includes(card.iid));
    // Replacements cannot be redrawn: draw first, then return and shuffle.
    draw(state, action.player, replacements.length);
    player.deck.push(...replacements);
    player.mulliganReplaced = replacements.length;
    player.mulliganDone = true;
    if (!state.players[other(action.player)].mulliganDone) mulliganPrompt(state, other(action.player));
    else {
      // Both players finish their replacement draws before either altered deck is shuffled.
      for (const owner of [state.firstPlayer, other(state.firstPlayer)]) if (state.players[owner].mulliganReplaced) shuffle(state, state.players[owner].deck);
      startTurn(state);
    }
  } else if (work.kind === 'order') {
    const ability = state.bag.find(entry => entry.id === ids[0])!;
    state.bag = state.bag.filter(entry => entry.id !== ability.id);
    resolveAbility(state, ability);
  } else if (work.kind === 'ability') {
    if (ids.length) resolveAbility(state, work.ability, true);
  } else if (work.kind === 'optional') {
    if (ids.length) beginEffect(state, { ...work.frame, accepted: true });
  } else if (work.kind === 'targets') {
    if (work.frame.context.source.card.type === 'Action') for (const iid of ids) {
      const target = find(state, iid);
      if (target?.zone === 'field' && target.player !== work.frame.context.player && hasKeyword(state, iid, 'Vanish')) {
        addAbility(state, { player: target.player, source: target.instance }, [{ op: 'banish', target: { kind: 'self', owner: 'you', zone: 'play' } }], `Desvanecer: ${cardName(target.instance.card)}`);
      }
    }
    prepareAmounts(state, work.frame, ids, []);
  }
  else if (work.kind === 'amount') prepareAmounts(state, work.frame, work.targets, [...work.amounts, Number(ids[0])]);
  else if (work.kind === 'discard') {
    const player = state.players[work.victim];
    player.discard.push(...player.hand.filter(card => ids.includes(card.iid)));
    player.hand = player.hand.filter(card => !ids.includes(card.iid));
  } else if (work.kind === 'singers') {
    const eligible = eligibleSingers(state, action.player);
    if (!ids.every(iid => eligible.some(card => card.iid === iid)) || ids.reduce((sum, iid) => sum + singingCost(state, eligible.find(card => card.iid === iid)!), 0) < work.required) throw new Error(`Os cantores precisam somar pelo menos ${work.required} de custo`);
    playCard(state, { type: 'sing', player: action.player, iid: work.iid, singers: ids });
  }
}
function canonical(action: GameAction): string {
  const { label: _label, ...details } = action;
  return JSON.stringify(Object.fromEntries(Object.entries(details).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
}
function playCard(state: GameState, action: Extract<GameAction, { type: 'play' | 'shift' | 'sing' }>): void {
  const own = state.players[action.player];
  const card = own.hand.find(item => item.iid === action.iid)!;
  if (action.type === 'sing' && !action.singers.length) {
    const required = card.card.rules.keywords.find(rule => rule.keyword === 'Sing Together')!.value!;
    const singers = eligibleSingers(state, action.player);
    const options = singers.map(singer => ({ ...cardOption(state, singer.iid), value: singingCost(state, singer), label: `${cardName(singer.card)} (${singingCost(state, singer)})` }));
    let minimum = 0, sum = 0;
    for (const value of options.map(option => option.value).sort((a, b) => b - a)) { minimum++; sum += value; if (sum >= required) break; }
    prompt(state, { kind: 'singers', player: action.player, label: `Cantar ${cardName(card.card)}: somar pelo menos ${required} de custo`, options, min: minimum, max: options.length }, { kind: 'singers', iid: card.iid, required });
    return;
  }
  own.hand = own.hand.filter(item => item.iid !== card.iid);
  if (action.type === 'sing') for (const iid of action.singers) find(state, iid)!.instance.exerted = true;
  else pay(state, action.player, action.type === 'shift' ? action.cost : getStatsForHand(state, card, action.player));
  if (action.type === 'shift') {
    const base = own.field.find(item => item.iid === action.onto)!;
    card.exerted = base.exerted; card.drying = base.drying; card.damage = base.damage; card.location = base.location;
    card.stack = [base];
    own.field = own.field.map(item => item.iid === base.iid ? card : item);
    for (const modifier of state.modifiers) if (modifier.iid === base.iid) modifier.iid = card.iid;
  } else if (card.card.type === 'Action') {
    state.resolvingAction = { player: action.player, card };
    enqueue(state, { player: action.player, source: card }, card.card.rules.action);
  } else {
    card.drying = card.card.type === 'Character';
    card.exerted = action.type === 'play' && action.exerted === true;
    own.field.push(card);
  }
  trigger(state, action.player, card, 'play');
  note(state, `${playerName(action.player)}: ${actionLabel(action)}`);
}
function getStatsForHand(state: GameState, card: CardInstance, player: PlayerId): number {
  state.players[player].hand.push(card);
  const cost = getStats(state, card.iid).cost;
  state.players[player].hand.pop();
  return cost;
}
export function applyAction(input: GameState, action: GameAction): GameState {
  if (!action || !PLAYERS.includes(action.player)) throw new Error('Jogador da ação inválido');
  if (input.phase === 'finished') throw new Error('A partida já terminou');
  const state = copy(input);
  if (action.type === 'concede') { finish(state, other(action.player), 'concede'); return state; }
  if (action.type === 'mulligan') {
    if (state.pending?.kind !== 'mulligan') throw new Error('A troca da mão inicial só está disponível uma vez');
    choose(state, { type: 'choose', player: action.player, optionIds: action.replace });
  } else if (action.type === 'choose') choose(state, action);
  else {
    const legal = getLegalActions(input, action.player).find(candidate => canonical(candidate) === canonical(action));
    if (!legal) throw new Error(`Ação inválida: ${actionLabel(action)}`);
    const own = state.players[action.player];
    if (action.type === 'ink') {
      const card = own.hand.find(item => item.iid === action.iid)!;
      own.hand = own.hand.filter(item => item.iid !== card.iid);
      card.exerted = false; own.inkwell.push(card); own.inkedThisTurn = true;
    } else if (action.type === 'play' || action.type === 'shift' || action.type === 'sing') playCard(state, legal as typeof action);
    else if (action.type === 'quest') {
      const card = own.field.find(item => item.iid === action.iid)!;
      card.exerted = true;
      own.lore += getStats(state, card.iid).lore;
      trigger(state, action.player, card, 'selfQuest');
      if (hasKeyword(state, card.iid, 'Support')) {
        addAbility(state, { player: action.player, source: card }, [{ op: 'buff', stat: 'strength', amount: getStats(state, card.iid).strength, duration: 'thisTurn', target: { kind: 'chosen', owner: 'any', zone: 'play', filter: { types: ['Character'], excludeSelf: true } } }], `Suporte: ${cardName(card.card)}`, true);
        state.bag[state.bag.length - 1].support = true;
      }
    } else if (action.type === 'challenge') {
      const card = own.field.find(item => item.iid === action.iid)!;
      card.exerted = true;
      state.combat = { attacker: card.iid, defender: action.target, damageDone: false };
      trigger(state, action.player, card, 'challenge');
    } else if (action.type === 'move') {
      pay(state, action.player, getStats(state, action.location).moveCost);
      own.field.find(item => item.iid === action.iid)!.location = action.location;
    } else if (action.type === 'activate') {
      const card = own.field.find(item => item.iid === action.iid)!;
      const ability = card.card.rules.activated[action.ability];
      const context = { player: action.player, source: copy(card) };
      pay(state, action.player, ability.cost.ink ?? 0);
      if (ability.cost.exert) card.exerted = true;
      if (ability.cost.banish) leaveField(state, card.iid, 'discard', true);
      if (ability.optional) resolveAbility(state, { ...context, effects: ability.effects, optional: true, id: uid(state, 'b'), label: `${cardName(card.card)}: usar habilidade?` });
      else enqueue(state, context, ability.effects);
    } else if (action.type === 'boost') {
      const card = own.field.find(item => item.iid === action.iid)!;
      pay(state, action.player, action.cost);
      const underneath = own.deck.shift();
      if (underneath) { underneath.faceDown = true; card.stack.push(underneath); card.boostedThisTurn = state.turn; }
    } else if (action.type === 'endTurn') {
      state.transition = 'ending';
      for (const owner of PLAYERS) for (const card of state.players[owner].field) trigger(state, owner, card, 'end');
    }
  }
  drain(state);
  return state;
}
