/** Deterministic EN catalog compiler. A card with unsupported text MUST NOT be played.
 * Rules reference: Disney Lorcana Comprehensive Rules 2.2.0 (July 9, 2026).
 * No I/O, card-ID overrides, translation parsing, or partial record compilation.
 */
export type RuleTrigger = 'play' | 'selfQuest' | 'selfBanished' | 'start' | 'end' | 'challenge';
export type Duration = 'thisTurn' | 'untilStartOfYourNextTurn' | 'untilEndOfYourNextTurn';
export type Stat = 'strength' | 'willpower' | 'lore';
export interface CardFilter {
  types?: ('Character' | 'Item' | 'Location' | 'Action')[];
  subtypes?: string[];
  name?: string;
  damaged?: boolean;
  exerted?: boolean;
  costAtMost?: number;
  strengthAtMost?: number;
  excludeSelf?: boolean;
}
export interface TargetSelector {
  kind: 'self' | 'chosen' | 'all' | 'player';
  owner: 'you' | 'opponent' | 'any' | 'eachOpponent';
  zone?: 'play' | 'discard' | 'hand';
  filter?: CardFilter;
  min?: number;
  max?: number;
}
export interface Effect {
  op: 'draw' | 'gainLore' | 'loseLore' | 'damage' | 'heal' | 'banish' | 'returnHand'
    | 'ready' | 'exert' | 'buff' | 'inkTop' | 'recover' | 'discard';
  target: TargetSelector;
  amount?: number;
  optional?: boolean;
  upTo?: boolean;
  duration?: Duration;
  stat?: Stat;
  entersExerted?: boolean;
}
export interface RuleCondition {
  kind: 'selfDamaged' | 'youHave';
  filter?: CardFilter;
  countAtLeast?: number;
}
export interface KeywordRule {
  keyword: string;
  value?: number;
  shiftName?: string;
  sourceText: string;
}
export interface TriggeredRule {
  trigger: RuleTrigger;
  turn?: 'yours' | 'opponents' | 'any';
  condition?: RuleCondition;
  optional?: boolean;
  effects: Effect[];
  sourceText: string;
}
export interface ActivatedRule {
  cost: { exert?: boolean; ink?: number; banish?: boolean };
  optional?: boolean;
  effects: Effect[];
  sourceText: string;
}
export type StaticRule = (
  | { kind: 'buff'; target: TargetSelector; stat: Stat; amount: number; per?: TargetSelector }
  | { kind: 'grantKeyword'; target: TargetSelector; keyword: string; value?: number }
  | { kind: 'restriction'; target: TargetSelector; restriction:
      'cantQuest' | 'cantChallenge' | 'cantSing' | 'cantBeChallenged' | 'cantReadyAtStart' }
  | { kind: 'costReduction'; target: TargetSelector; amount: number }
) & { condition?: RuleCondition; sourceText: string };
export interface CardRuleSource {
  id: number;
  original: {
    name: string | null;
    type: string | null;
    full_text: string | null;
    abilities: readonly unknown[] | null;
    effects: readonly unknown[] | null;
  };
}
export interface CompiledCardRules {
  sourceId: number;
  keywords: KeywordRule[];
  static: StaticRule[];
  triggered: TriggeredRule[];
  activated: ActivatedRule[];
  action: Effect[];
  unsupported: string[];
  supported: boolean;
}

type RecordData = Record<string, unknown>;
const normalize = (text: string): string => text.replace(/[\u2018\u2019]/g, "'").replace(/\s+/gu, ' ').trim();
const isRecord = (value: unknown): value is RecordData => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (text: string): number | null => /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
const amountOf = (text: string): number | null => /^(?:a|an|one)$/i.test(text) ? 1 : integer(text);
const stats: Record<string, Stat> = { '¤': 'strength', '⛉': 'willpower', '◊': 'lore' };
const plainKeywords = new Set(['Alert', 'Bodyguard', 'Evasive', 'Reckless', 'Rush', 'Support', 'Vanish', 'Ward']);
const numericKeywords = new Set(['Boost', 'Challenger', 'Resist', 'Shift', 'Singer', 'Sing Together']);
// A subtype is a classification, never an arbitrary adjective such as "Ruby" or "ready".
const subtypes = new Set(('Alien|Ally|Boss|Broom|Captain|Colossus|Deity|Detective|Dinosaur|Dragon|Dreamborn|Entangled|Fairy|Floodborn|Gargoyle|Ghost|Giant|Hero|Hunny|Hyena|Illusion|Inventor|King|Knight|Madrigal|Mentor|Monster|Musketeer|Pirate|Prince|Princess|Puppy|Queen|Racer|Red Panda|Robot|Seven Dwarfs|Sorcerer|Storyborn|Super|Team|Tigger|Titan|Toy|Villain|Vineling|Whisper|Song').split('|'));
const player = (owner: TargetSelector['owner'] = 'you'): TargetSelector => ({ kind: 'player', owner });
const self = (): TargetSelector => ({ kind: 'self', owner: 'you', zone: 'play' });

/** Parse a complete card description, including every limiter. */
function filterFor(text: string): CardFilter | null {
  let rest = normalize(text);
  const filter: CardFilter = {};
  if (/^(?:other|another) /i.test(rest)) { filter.excludeSelf = true; rest = rest.replace(/^(?:other|another) /i, ''); }
  if (/^damaged /i.test(rest)) { filter.damaged = true; rest = rest.slice(8); }
  if (/^(?:ready|exerted) /i.test(rest)) { filter.exerted = /^exerted /i.test(rest); rest = rest.replace(/^(?:ready|exerted) /i, ''); }
  let m = rest.match(/ with (?:cost (\d+)|(\d+) ¤) or less$/);
  if (m) {
    const n = integer(m[1] ?? m[2]); if (n === null) return null;
    if (m[1] !== undefined) filter.costAtMost = n; else filter.strengthAtMost = n;
    rest = rest.slice(0, m.index);
  }
  m = rest.match(/ named ([A-Za-zÀ-ž0-9][A-Za-zÀ-ž0-9 .'!&-]*)$/);
  if (m) {
    // OR names need a union selector not present in this contract.
    if (/\b(?:or|and|with|while|this turn)\b/.test(m[1]) || /\./.test(m[1].replace(/\b(?:Mr|Mrs|Ms|Dr|St)\. /g, ''))) return null;
    filter.name = m[1]; rest = rest.slice(0, m.index);
  }
  rest = rest.replace(/ cards?$/i, '');
  const alternatives = rest.split(/ (?:or|and\/or) /);
  const types: NonNullable<CardFilter['types']> = [];
  let classification: string | undefined;
  for (const alternative of alternatives) {
    const part = alternative.match(/^(?:(.+) )?(character|item|location|action|song)s?$/i);
    if (!part) return null;
    const type = part[2].toLowerCase();
    if (part[1]) {
      if (!subtypes.has(part[1]) || alternatives.length > 1) return null;
      classification = part[1];
    }
    if (type === 'song') { if (classification || alternatives.length > 1) return null; classification = 'Song'; }
    const typeNames: Record<string, NonNullable<CardFilter['types']>[number]> = { character: 'Character', item: 'Item', location: 'Location', action: 'Action', song: 'Action' };
    types.push(typeNames[type]);
  }
  filter.types = types;
  if (classification) filter.subtypes = [classification];
  return filter;
}

function targetFor(text: string): TargetSelector | null {
  let rest = normalize(text);
  if (/^this (?:character|item|location)$/i.test(rest)) return self();
  let kind: TargetSelector['kind'];
  let owner: TargetSelector['owner'] = 'any';
  let min = 1, max = 1;
  let excludeSelf = false;
  let m = rest.match(/^up to (\d+) chosen /i);
  if (m) { const n = integer(m[1]); if (n === null) return null; kind = 'chosen'; min = 0; max = n; rest = rest.slice(m[0].length); }
  else if (/^(?:another |other )?chosen /i.test(rest)) {
    kind = 'chosen'; excludeSelf = /^(?:another|other) /i.test(rest); rest = rest.replace(/^(?:another |other )?chosen /i, '');
  } else if (/^one of your /i.test(rest)) { kind = 'chosen'; owner = 'you'; rest = rest.slice(12); }
  else if (/^(?:each of your|your) /i.test(rest)) { kind = 'all'; owner = 'you'; rest = rest.replace(/^(?:each of your|your) /i, ''); }
  else if (/^(?:all |each )/i.test(rest)) { kind = 'all'; rest = rest.replace(/^(?:all|each) /i, ''); }
  else if (/^opposing /i.test(rest)) { kind = 'all'; owner = 'opponent'; rest = rest.slice(9); }
  else if (/^other /i.test(rest)) { kind = 'all'; excludeSelf = true; rest = rest.slice(6); }
  else return null;
  if (/^opposing /i.test(rest)) { if (owner === 'you') return null; owner = 'opponent'; rest = rest.slice(9); }
  if (/ of yours$/i.test(rest)) { if (owner === 'opponent') return null; owner = 'you'; rest = rest.replace(/ of yours$/i, ''); }
  const filter = filterFor(rest);
  if (!filter) return null;
  if (excludeSelf) filter.excludeSelf = true;
  return { kind, owner, zone: 'play', filter, ...(kind === 'chosen' ? { min, max } : {}) };
}

function keywordSpec(text: string): { keyword: string; value?: number } | null {
  if (plainKeywords.has(text)) return { keyword: text };
  const m = text.match(/^(Boost|Challenger|Resist|Shift|Singer|Sing Together) (\+?\d+)(?: ⬡)?$/);
  if (!m) return null;
  const value = integer(m[2].replace(/^\+/, ''));
  if (value === null || (/^(Challenger|Resist)$/.test(m[1]) !== m[2].startsWith('+'))) return null;
  return { keyword: m[1], value };
}

function expectedReminders(keyword: string, value: number | undefined, name: string, type: string): string[] {
  switch (keyword) {
    case 'Alert': return ['This character can challenge as if they had Evasive.'];
    case 'Bodyguard': return ["This character may enter play exerted. An opposing character who challenges one of your characters must choose one with Bodyguard if able.", "This character may enter play exerted. An opposing character who challenges one of your characters must choose a character with Bodyguard if able."];
    case 'Evasive': return [`Only characters with Evasive can challenge this ${type.toLowerCase()}.`];
    case 'Reckless': return ["This character can't quest and must challenge each turn if able."];
    case 'Rush': return ["This character can challenge the turn they're played."];
    case 'Support': return ["Whenever this character quests, you may add their ¤ to another chosen character's ¤ this turn.", "Whenever this character quests, you may add their ¤ to chosen character's ¤ this turn."];
    case 'Vanish': return ['When an opponent chooses this character for an action, banish them.'];
    case 'Ward': return [`Opponents can't choose this ${type.toLowerCase()} except to challenge.`];
    case 'Boost': return [`Once during your turn, you may pay ${value} ⬡ to put the top card of your deck facedown under this ${type.toLowerCase()}.`];
    case 'Challenger': return [`While challenging, this character gets +${value} ¤.`, `When challenging, this character gets +${value} ¤.`];
    case 'Resist': return [`Damage dealt to this ${type.toLowerCase()} is reduced by ${value}.`];
    case 'Shift': return [`You may pay ${value} ⬡ to play this on top of one of your characters named ${name}.`, `You may pay ${value} ⬡ to play this on top of one of your characters named ${name}`,
      ...(!subtypes.has(name) ? [`You may pay ${value} ⬡ to play this on top of one of your ${name} characters.`] : [])];
    case 'Singer': return [`This character counts as cost ${value} to sing songs.`];
    case 'Sing Together': return [`Any number of your or your teammates' characters with total cost ${value} or more may ⟳ to sing this song for free.`];
    default: return [];
  }
}

function compileKeyword(a: RecordData, card: CardRuleSource): KeywordRule | null {
  if (Object.keys(a).some(k => !['type', 'keyword', 'keywordValue', 'keywordValueNumber', 'fullText', 'reminderText'].includes(k))) return null;
  if (typeof a.keyword !== 'string' || typeof a.fullText !== 'string') return null;
  const text = normalize(a.fullText);
  const m = text.match(/^([^()]+?)(?: \(([^()]+)\))?$/);
  if (!m) return null;
  const spec = keywordSpec(m[1]);
  if (!spec || a.keyword !== spec.keyword) return null;
  if (numericKeywords.has(spec.keyword)) {
    if (a.keywordValue !== undefined && String(a.keywordValue) !== String(spec.value) && String(a.keywordValue) !== `+${spec.value}`) return null;
    if (a.keywordValueNumber !== undefined && a.keywordValueNumber !== spec.value) return null;
  } else if (a.keywordValue !== undefined || a.keywordValueNumber !== undefined) return null;
  if (a.reminderText !== undefined && (typeof a.reminderText !== 'string' || normalize(a.reminderText) !== (m[2] ?? ''))) return null;
  const type = card.original.type ?? '';
  const name = normalize(card.original.name ?? '');
  if (spec.keyword === 'Sing Together' ? type !== 'Action' : ['Ward', 'Resist', 'Evasive', 'Boost'].includes(spec.keyword) ? !['Character', 'Location'].includes(type) : type !== 'Character') return null;
  if (spec.keyword === 'Shift' && (!name || / & /.test(name))) return null;
  if (m[2] && !expectedReminders(spec.keyword, spec.value, name, type).some(reminder =>
    spec.keyword === 'Shift' ? reminder.toLowerCase() === m[2].toLowerCase() : reminder === m[2])) return null;
  return { ...spec, ...(spec.keyword === 'Shift' ? { shiftName: name } : {}), sourceText: a.fullText };
}

/** A single complete sentence. No prefix matches or removal of unknown reminder text. */
function effectSentence(text: string): Effect[] | null {
  let rest = text;
  let optional = false;
  if (/^you may /i.test(rest)) { optional = true; rest = rest.slice(8); }
  const wrap = (effects: Effect[]): Effect[] => optional ? effects.map(e => ({ ...e, optional: true })) : effects;
  let m = rest.match(/^(?:you )?(draw|gain|lose) (a|an|one|\d+) (cards?|lore)$/i);
  if (m) {
    const amount = amountOf(m[2]); if (amount === null || (m[1].toLowerCase() === 'draw') !== /^cards?$/i.test(m[3])) return null;
    return wrap([{ op: ({ draw: 'draw', gain: 'gainLore', lose: 'loseLore' } as const)[m[1].toLowerCase() as 'draw'], amount, target: player() }]);
  }
  m = rest.match(/^(each player|each opponent|each opposing player|chosen player|chosen opponent) (may )?(draws?|gains?|loses?) (a|one|\d+) (cards?|lore)$/i);
  if (m) {
    const verb = m[3].toLowerCase().replace(/s$/, '');
    const amount = amountOf(m[4]); if (amount === null || (verb === 'draw') !== /^cards?$/i.test(m[5]) || optional || m[2]) return null;
    const who = m[1].toLowerCase();
    return [{ op: ({ draw: 'draw', gain: 'gainLore', lose: 'loseLore' } as const)[verb as 'draw'], amount,
      target: { kind: who.startsWith('chosen') ? 'chosen' : 'player', owner: who.endsWith('player') && !who.includes('opposing') ? 'any' : who.startsWith('chosen') ? 'opponent' : 'eachOpponent' }, ...(m[2] ? { optional: true } : {}) }];
  }
  m = rest.match(/^(?:choose and )?discard (a|one|\d+) cards?$/i);
  if (m) { const amount = amountOf(m[1]); return amount === null ? null : wrap([{ op: 'discard', amount, target: player() }]); }
  m = rest.match(/^each opponent (?:chooses and )?discards (a|one|\d+) cards?$/i);
  if (m) { const amount = amountOf(m[1]); return amount === null ? null : wrap([{ op: 'discard', amount, target: player('eachOpponent') }]); }
  m = rest.match(/^deal (\d+) damage(?: each)? to (.+)$/i);
  if (m) { const target = targetFor(m[2]), amount = integer(m[1]); return !target || amount === null ? null : wrap([{ op: 'damage', amount, target }]); }
  m = rest.match(/^remove (up to )?(\d+) damage(?: each)? from (.+)$/i);
  if (m) { const target = targetFor(m[3]), amount = integer(m[2]); return !target || amount === null ? null : wrap([{ op: 'heal', amount, target, ...(m[1] ? { upTo: true } : {}) }]); }
  m = rest.match(/^(banish|ready|exert) (.+)$/i);
  if (m) { const target = targetFor(m[2]); return target ? wrap([{ op: m[1].toLowerCase() as Effect['op'], target }]) : null; }
  m = rest.match(/^return (.+) (?:to|into) (their player's hand|their players' hands|your hand)$/i);
  if (m) {
    let description = m[1];
    if (/ from your discard$/i.test(description)) {
      if (m[2] !== 'your hand') return null;
      description = description.replace(/ from your discard$/i, '');
      const count = description.match(/^(a|an|one|another|up to \d+|\d+) (.+)$/i);
      if (!count) return null;
      const upTo = /^up to /i.test(count[1]);
      const amount = count[1].toLowerCase() === 'another' ? 1 : amountOf(count[1].replace(/^up to /i, ''));
      const filter = filterFor(`${count[1].toLowerCase() === 'another' ? 'other ' : ''}${count[2]}`);
      if (amount === null || !filter) return null;
      return wrap([{ op: 'recover', amount, target: { kind: 'chosen', owner: 'you', zone: 'discard', filter, min: upTo ? 0 : amount, max: amount } }]);
    }
    const target = targetFor(description);
    if (!target || (m[2] === 'your hand' && target.owner !== 'you')) return null;
    return wrap([{ op: 'returnHand', target }]);
  }
  m = rest.match(/^put the top card of your deck into your inkwell facedown(?: and (exerted|ready))?$/i);
  if (m) return wrap([{ op: 'inkTop', amount: 1, target: player(), entersExerted: m[1]?.toLowerCase() === 'exerted' }]);
  m = rest.match(/^(.+?) gets? ([+-]\d+) ([¤⛉◊]) (this turn|until the start of your next turn|until the end of your next turn)$/i);
  if (m) {
    const target = targetFor(m[1]), amount = Number(m[2]);
    if (!target || !Number.isSafeInteger(amount)) return null;
    const duration: Duration = m[4] === 'this turn' ? 'thisTurn' : m[4].includes('start') ? 'untilStartOfYourNextTurn' : 'untilEndOfYourNextTurn';
    return wrap([{ op: 'buff', target, amount, stat: stats[m[3]], duration }]);
  }
  return null;
}

function compileEffects(text: string): Effect[] | null {
  // A sentence with a sequential cost or a dependency cannot be flattened into independent ops.
  let rest = normalize(text);
  if (!rest || /[()]/.test(rest)) return null;
  // "May" scopes an entire sentence, including a comma-then continuation (CR 6.1.4).
  // There is no effect-group node in this contract, so do not invent independent choices.
  if (/\bmay\b[^.]*, then /.test(rest)) return null;
  // These connectors are unconditionally sequential, unlike "to", "if you do", or "or".
  rest = rest.replace(/, then /g, '. ').replace(/\. Then,? /g, '. ');
  const sentences = rest.replace(/\.$/, '').split(/\. /);
  const result: Effect[] = [];
  for (const sentence of sentences) {
    let effects = effectSentence(sentence);
    if (!effects && !/^you may /i.test(sentence)) {
      // Only independent clauses that each parse in full may share "and".
      for (const match of sentence.matchAll(/ and /g)) {
        const left = effectSentence(sentence.slice(0, match.index));
        const right = effectSentence(sentence.slice(match.index! + 5));
        if (left && right) { effects = [...left, ...right]; break; }
      }
    }
    if (!effects) return null;
    result.push(...effects);
  }
  return result.length ? result : null;
}

function conditionFor(text: string): RuleCondition | null {
  if (text === 'this character has damage') return { kind: 'selfDamaged' };
  const m = text.match(/^you have (a|an|another|\d+ or more) (.+) in play$/);
  if (!m) return null;
  const filter = filterFor(`${m[1] === 'another' ? 'other ' : ''}${m[2]}`);
  const count = /^(?:a|an|another)$/.test(m[1]) ? 1 : integer(m[1].replace(' or more', ''));
  return filter && count !== null ? { kind: 'youHave', filter, countAtLeast: count } : null;
}

function compileTrigger(text: string, sourceText: string, cardType: string): TriggeredRule | null {
  const m = text.match(/^(When(?:ever)? you play this (character|item|location)|When(?:ever)? this character quests|When(?:ever)? this (character|item|location) is banished|At the (start|end) of (your turn|each opponent's turn|each turn)|When(?:ever)? this character challenges), (.+)$/);
  if (!m || (m[2] && m[2] !== cardType.toLowerCase()) || (m[3] && m[3] !== cardType.toLowerCase())) return null;
  let body = m[6];
  const trigger: RuleTrigger = m[2] ? 'play' : m[3] ? 'selfBanished' : m[4] ? m[4] as 'start' | 'end' : m[1].endsWith('quests') ? 'selfQuest' : 'challenge';
  if (['selfQuest', 'challenge'].includes(trigger) && cardType !== 'Character') return null;
  let condition: RuleCondition | undefined;
  const conditional = body.match(/^if (.+?), (.+)$/);
  if (conditional) {
    const parsed = conditionFor(conditional[1]); if (!parsed) return null;
    // This contract conditions the entire rule, not only one of several sentences.
    if (conditional[2].replace(/\.$/, '').includes('. ')) return null;
    condition = parsed; body = conditional[2];
  }
  const effects = compileEffects(body);
  if (!effects) return null;
  return { trigger, ...(m[4] ? { turn: m[5] === 'your turn' ? 'yours' as const : m[5] === 'each turn' ? 'any' as const : 'opponents' as const } : {}), ...(condition ? { condition } : {}), effects, sourceText };
}

function compileStatic(text: string, sourceText: string): StaticRule[] | null {
  const parenthetical = text.match(/^([^()]+) \(([^()]+)\)$/);
  const reminder = parenthetical?.[2];
  let rest = (parenthetical?.[1] ?? text).replace(/\.$/, '');
  let condition: RuleCondition | undefined;
  const conditional = rest.match(/^(?:While|If) (.+?), (.+)$/);
  if (conditional) {
    const parsed = conditionFor(conditional[1]); if (!parsed) return null;
    condition = parsed; rest = conditional[2];
    if (condition.kind === 'selfDamaged') rest = rest.replace(/^(?:he|she|they) /, 'This character ');
  }
  // Only an explicitly recognized keyword grant may carry a reminder. Never strip
  // arbitrary parenthesized text from a buff, restriction, condition, or payment.
  if (reminder && !/ gains? /.test(rest)) return null;
  const finish = (rules: StaticRule[]): StaticRule[] => rules.map(r => ({ ...r, ...(condition ? { condition } : {}) }));
  let m = rest.match(/^(.+?) gets? ([+-]\d+) ([¤⛉◊])(?: for each (.+))?$/);
  if (m) {
    const target = targetFor(m[1]), amount = Number(m[2]);
    if (!target || !Number.isSafeInteger(amount)) return null;
    let per: TargetSelector | undefined;
    if (m[4]) {
      const owned = m[4].match(/^(.+) you have in play$/);
      const filter = owned ? filterFor(owned[1]) : null;
      if (!filter) return null;
      per = { kind: 'all', owner: 'you', zone: 'play', filter };
    }
    return finish([{ kind: 'buff', target, stat: stats[m[3]], amount, ...(per ? { per } : {}), sourceText }]);
  }
  m = rest.match(/^(.+?) gets? ([+-]\d+) ([¤⛉◊]) and ([+-]\d+) ([¤⛉◊])$/);
  if (m) {
    const target = targetFor(m[1]); if (!target || !Number.isSafeInteger(Number(m[2])) || !Number.isSafeInteger(Number(m[4]))) return null;
    return finish([{ kind: 'buff', target, amount: Number(m[2]), stat: stats[m[3]], sourceText }, { kind: 'buff', target, amount: Number(m[4]), stat: stats[m[5]], sourceText }]);
  }
  m = rest.match(/^(.+?) gains? (.+)$/);
  if (m) {
    const target = targetFor(m[1]), specs = m[2].split(' and ').map(keywordSpec);
    if (!target || specs.some(spec => !spec || ['Shift', 'Boost', 'Sing Together'].includes(spec.keyword))) return null;
    if (reminder) {
      let candidates = [''];
      for (const spec of specs) {
        const options = grantReminders(spec!.keyword, spec!.value);
        candidates = candidates.flatMap(prefix => options.map(option => `${prefix}${prefix ? ' ' : ''}${option}`));
      }
      if (!candidates.includes(reminder)) return null;
    }
    return finish(specs.map(spec => ({ kind: 'grantKeyword', target, ...spec!, sourceText })));
  }
  m = rest.match(/^(.+?) can't (quest|challenge|(?:⟳|exert) to sing songs|be challenged|ready at the start of your turn)$/);
  if (m) {
    const target = targetFor(m[1]); if (!target) return null;
    const restrictions: Record<string, 'cantQuest' | 'cantChallenge' | 'cantSing' | 'cantBeChallenged' | 'cantReadyAtStart'> = {
      quest: 'cantQuest', challenge: 'cantChallenge', '⟳ to sing songs': 'cantSing', 'exert to sing songs': 'cantSing', 'be challenged': 'cantBeChallenged', 'ready at the start of your turn': 'cantReadyAtStart',
    };
    return finish([{ kind: 'restriction', target, restriction: restrictions[m[2]], sourceText }]);
  }
  m = rest.match(/^[Yy]ou pay (\d+) ⬡ less to play (.+)$/);
  if (m) {
    const amount = integer(m[1]);
    const target = /^this (?:character|item|location)$/.test(m[2]) ? { kind: 'self' as const, owner: 'you' as const } : (() => {
      const filter = filterFor(m![2]); return filter ? { kind: 'all' as const, owner: 'you' as const, filter } : null;
    })();
    return target && amount !== null ? finish([{ kind: 'costReduction', target, amount, sourceText }]) : null;
  }
  return null;
}

function grantReminders(keyword: string, value?: number): string[] {
  const standard = expectedReminders(keyword, value, '', 'Character');
  switch (keyword) {
    case 'Evasive': return [...standard, 'Only characters with Evasive can challenge them.', 'Only characters with Evasive can challenge it.'];
    case 'Ward': return [...standard, "Opponents can't choose them except to challenge."];
    case 'Rush': return [...standard, "They can challenge the turn they're played."];
    case 'Resist': return [...standard, `Damage dealt to them is reduced by ${value}.`];
    case 'Challenger': return [...standard, `They get +${value} ¤ while challenging.`];
    case 'Support': return [...standard, "Whenever they quest, you may add their ¤ to another chosen character's ¤ this turn."];
    default: return standard;
  }
}

function compileCost(a: RecordData, cardType: string): ActivatedRule['cost'] | null {
  if (!Array.isArray(a.costs) || !a.costs.length || typeof a.costsText !== 'string') return null;
  if (a.costs.some(c => typeof c !== 'string') || normalize(a.costs.join(', ')) !== normalize(a.costsText)) return null;
  const cost: ActivatedRule['cost'] = {};
  for (const raw of a.costs) {
    const part = normalize(raw as string);
    if (part === '⟳' && cost.exert === undefined) cost.exert = true;
    else if (part === `Banish this ${cardType.toLowerCase()}` && cost.banish === undefined) cost.banish = true;
    else {
      const m = part.match(/^(\d+) ⬡$/);
      const ink = m ? integer(m[1]) : null;
      if (ink === null || cost.ink !== undefined) return null;
      cost.ink = ink;
    }
  }
  return cost;
}

/** Exact fullText reconstruction prevents hidden suffixes in catalog records. */
function validatedAbility(a: RecordData): boolean {
  if (Object.keys(a).some(k => !['type', 'name', 'effect', 'fullText', 'costs', 'costsText'].includes(k))) return false;
  if (typeof a.effect !== 'string' || typeof a.fullText !== 'string' || !normalize(a.effect)) return false;
  if (a.name !== undefined && typeof a.name !== 'string') return false;
  const prefix = typeof a.name === 'string' && a.name ? `${a.name} ` : '';
  if (a.type === 'activated') return typeof a.costsText === 'string' && normalize(a.fullText) === normalize(`${prefix}${a.costsText} — ${a.effect}`);
  if (a.costs !== undefined || a.costsText !== undefined) return false;
  return normalize(a.fullText) === normalize(`${prefix}${a.effect}`)
    || (a.type === 'static' && !a.name && normalize(a.fullText) === `(${normalize(a.effect)})`);
}

export function compileCardRules(card: CardRuleSource): CompiledCardRules {
  const result: CompiledCardRules = { sourceId: card?.id, keywords: [], static: [], triggered: [], activated: [], action: [], unsupported: [], supported: false };
  if (!card || !Number.isSafeInteger(card.id) || card.id <= 0 || !isRecord(card.original)) {
    result.unsupported.push('Invalid card rule source'); return result;
  }
  const original = card.original;
  if (typeof original.name !== 'string' || !original.name.trim() || !['Character', 'Item', 'Location', 'Action'].includes(original.type ?? '')) result.unsupported.push('Missing or invalid EN name/type');
  const diagnostic = (value: unknown): string => typeof value === 'string' ? value : isRecord(value) && typeof value.fullText === 'string' ? value.fullText : `Malformed rule record: ${JSON.stringify(value) ?? String(value)}`;
  const abilities = Array.isArray(original.abilities) ? original.abilities : [];
  const effects = Array.isArray(original.effects) ? original.effects : [];
  if (original.abilities !== null && !Array.isArray(original.abilities)) result.unsupported.push('Invalid abilities array');
  if (original.effects !== null && !Array.isArray(original.effects)) result.unsupported.push('Invalid effects array');
  for (const raw of abilities) {
    if (!isRecord(raw)) { result.unsupported.push(diagnostic(raw)); continue; }
    if (raw.type === 'keyword') {
      const keyword = compileKeyword(raw, card);
      if (keyword) result.keywords.push(keyword); else result.unsupported.push(diagnostic(raw));
      continue;
    }
    if (!validatedAbility(raw)) { result.unsupported.push(diagnostic(raw)); continue; }
    const text = normalize(raw.effect as string), sourceText = raw.fullText as string;
    // CR 1.10.1.3: these exact catalog clauses affect construction only. The backend
    // validates max_copies_in_deck. Do not generalize this exception to arbitrary prose.
    if (raw.type === 'static' && (
      (original.type === 'Character' && original.name === 'Dalmatian Puppy'
        && text === 'You may have up to 99 copies of Dalmatian Puppy - Tail Wagger in your deck.')
      || (original.type === 'Item' && original.name === 'The Glass Slipper'
        && text === 'You may only have 2 copies of The Glass Slipper in your deck.')
    )) continue;
    // CR 5.4.4.2: intrinsic song alternate cost, implemented by the engine via Song/cost.
    // This exact reminder is fully understood; it is not a persistent static effect.
    if (original.type === 'Action' && raw.type === 'static' && !raw.name
      && /^A character with cost \d+ or more can ⟳ to sing this song for free\.$/.test(text)
      && normalize(sourceText) === `(${text})`) continue;
    if (original.type === 'Action') { result.unsupported.push(sourceText); continue; }
    if (raw.type === 'static') {
      const rules = compileStatic(text, sourceText);
      if (rules) result.static.push(...rules); else result.unsupported.push(sourceText);
    } else if (raw.type === 'triggered') {
      const rule = compileTrigger(text, sourceText, original.type ?? '');
      if (rule) result.triggered.push(rule); else result.unsupported.push(sourceText);
    } else if (raw.type === 'activated') {
      const cost = compileCost(raw, original.type ?? ''), compiled = compileEffects(text);
      if (cost && compiled) result.activated.push({ cost, effects: compiled, sourceText }); else result.unsupported.push(sourceText);
    } else result.unsupported.push(sourceText);
  }
  for (const raw of effects) {
    const compiled = typeof raw === 'string' && original.type === 'Action' ? compileEffects(raw) : null;
    if (compiled) result.action.push(...compiled); else result.unsupported.push(diagnostic(raw));
  }
  // The full rules box must account for every record, in order, with no orphan text.
  const reconstructed = [...abilities.map(a => isRecord(a) && typeof a.fullText === 'string' ? a.fullText : ''), ...effects.map(e => typeof e === 'string' ? e : '')].join(' ');
  if (typeof original.full_text !== 'string') result.unsupported.push('Missing EN full_text; cannot verify rules completeness');
  else if (normalize(original.full_text) !== normalize(reconstructed)) result.unsupported.push(`Unaccounted EN full_text: ${original.full_text}`);
  result.supported = result.unsupported.length === 0;
  return result;
}
