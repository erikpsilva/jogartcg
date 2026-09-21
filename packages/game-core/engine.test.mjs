import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, applyAction, getLegalActions, getStats, availableInk, activeDecisionPlayer,
} from './dist/engine.js';
import { compileCardRules } from './dist/cards.js';

const kw = (keyword, value) => ({ keyword, ...(value === undefined ? {} : { value }), sourceText: keyword });
const playerTarget = (owner = 'you') => ({ kind: 'player', owner });
const self = { kind: 'self', owner: 'you', zone: 'play' };
const chosen = (owner = 'any', filter = { types: ['Character'] }) => ({ kind: 'chosen', owner, zone: 'play', filter });
function card(id = 1, properties = {}, rules = {}) {
  return {
    id, name: `Personagem ${id}`, type: 'Character', cost: 2, inkwell: true,
    strength: 2, willpower: 4, lore: 1, moveCost: 0, subtypes: [], image: '', text: '',
    ...properties,
    rules: { sourceId: id, keywords: [], static: [], triggered: [], activated: [], action: [], unsupported: [], supported: true, ...rules },
  };
}
function opening(seed = 1) {
  return createGame({ seed, decks: {
    player: Array.from({ length: 40 }, (_, i) => card(i + 1)),
    bot: Array.from({ length: 40 }, (_, i) => card(i + 101)),
  } });
}
function decide(state, ids = []) {
  return applyAction(state, { type: 'choose', player: activeDecisionPlayer(state), optionIds: ids });
}
function game() {
  let state = opening();
  state = decide(decide(state));
  state.activePlayer = 'player';
  state.players.player.turns = 1;
  return state;
}
function put(state, owner, zone, definition, props = {}) {
  const instance = { iid: `test-${state.nextId++}`, card: definition, exerted: false, drying: false, damage: 0, location: null, stack: [], ...props };
  state.players[owner][zone].push(instance);
  return instance;
}
function ink(state, owner = 'player', count = 5) {
  for (let i = 0; i < count; i++) put(state, owner, 'inkwell', card(9000 + i));
}
function action(state, type, predicate = () => true, player = activeDecisionPlayer(state)) {
  const result = getLegalActions(state, player).find(item => item.type === type && predicate(item));
  assert.ok(result, `missing legal ${type}`);
  return result;
}
function play(state, definition) {
  const source = put(state, 'player', 'hand', definition);
  return [applyAction(state, action(state, 'play', item => item.iid === source.iid)), source.iid];
}
function freeze(value) {
  for (const nested of Object.values(value)) if (nested && typeof nested === 'object') freeze(nested);
  return Object.freeze(value);
}

test('seeded setup is reproducible, detached, serializable, uniquely instantiated, and randomizes first player', () => {
  const state = opening(0);
  assert.deepEqual(state, opening(0));
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  assert.notDeepEqual(state.players.player.hand, opening(8).players.player.hand);
  assert.deepEqual(new Set(Array.from({ length: 20 }, (_, i) => opening(i).firstPlayer)), new Set(['player', 'bot']));
  const instances = Object.values(state.players).flatMap(p => [...p.deck, ...p.hand]);
  assert.equal(new Set(instances.map(instance => instance.iid)).size, 80);
  assert.equal(state.players.player.hand.length, 7);
  assert.equal(state.players.bot.hand.length, 7);
  assert.equal(state.phase, 'mulligan');
});

test('unsupported compiler output, unknown executable rules and mismatched definitions block creation', () => {
  for (const bad of [
    card(1, {}, { supported: false, unsupported: ['Unparsed clause'] }),
    card(1, {}, { supported: true, unsupported: ['Unparsed clause'] }),
    card(1, {}, { keywords: [kw('Invented')] }),
    card(1, {}, { action: [{ op: 'teleport', target: self }] }),
    card(1, {}, { action: [{ op: 'draw', target: self }] }),
    card(1, {}, { static: [{ kind: 'buff', target: self, stat: 'unknown', amount: 1, sourceText: '' }] }),
    card(1, {}, { triggered: [{ trigger: 'play', condition: { kind: 'invented' }, effects: [], sourceText: '' }] }),
    card(1, {}, { sourceId: 2 }),
    { ...card(), rules: undefined },
  ]) {
    assert.throws(() => createGame({ decks: { player: Array(20).fill(bad), bot: Array(20).fill(card()) } }), /não suportada/);
  }
});

test('mulligan draws replacements before reshuffling, once per player, first player skips normal draw', () => {
  let state = opening();
  const first = state.firstPlayer;
  const original = structuredClone(state);
  const swap = state.players[first].hand.slice(0, 3).map(card => card.iid);
  const expected = state.players[first].deck.slice(0, 3).map(card => card.iid);
  state = decide(state, swap);
  assert.equal(state.rng, original.rng, 'both replacement draws must complete before shuffling');
  assert.equal(state.players[first].hand.length, 7);
  assert.ok(expected.every(iid => state.players[first].hand.some(card => card.iid === iid)));
  assert.ok(swap.every(iid => state.players[first].deck.some(card => card.iid === iid)));
  assert.deepEqual(original, opening());
  assert.notEqual(activeDecisionPlayer(state), first);
  state = decide(state);
  assert.equal(state.phase, 'main');
  assert.equal(state.turn, 1);
  assert.equal(state.players[first].hand.length, 7);
  assert.throws(() => applyAction(state, { type: 'mulligan', player: first, replace: [] }));
  state = applyAction(state, action(state, 'endTurn'));
  assert.equal(state.players[state.activePlayer].hand.length, 8);
});

test('every returned legal action is executable without mutating a frozen input, including all mulligans', () => {
  const state = freeze(opening());
  const before = JSON.stringify(state);
  for (const legal of getLegalActions(state)) {
    assert.ok(legal.label);
    assert.doesNotThrow(() => applyAction(state, legal));
  }
  assert.equal(JSON.stringify(state), before);
});

test('illegal actions and invalid decisions leave the entire input unchanged', () => {
  const states = [opening(), game()];
  for (const state of states) {
    const before = JSON.stringify(state);
    for (const invalid of [
      { type: 'play', player: 'player', iid: 'missing' },
      { type: 'choose', player: activeDecisionPlayer(state), optionIds: ['missing'] },
      { type: 'choose', player: 'not-a-player', optionIds: [] },
      { type: 'challenge', player: 'player', iid: 'missing', target: 'missing' },
    ]) assert.throws(() => applyAction(state, invalid));
    assert.equal(JSON.stringify(state), before);
  }
});

test('one ink per turn, automatic cost payment and insufficient-ink rejection', () => {
  let state = game();
  state = applyAction(state, action(state, 'ink'));
  assert.equal(availableInk(state, 'player'), 1);
  assert.equal(getLegalActions(state).filter(a => a.type === 'ink').length, 0);
  const cheap = put(state, 'player', 'hand', card(600, { cost: 1 }));
  const expensive = put(state, 'player', 'hand', card(601, { cost: 7 }));
  state = applyAction(state, action(state, 'play', a => a.iid === cheap.iid));
  assert.equal(availableInk(state, 'player'), 0);
  assert.throws(() => applyAction(state, { type: 'play', player: 'player', iid: expensive.iid }));
});

test('drying prevents quest, sing and exert abilities; Rush permits only challenge', () => {
  let state = game(); ink(state);
  const target = put(state, 'bot', 'field', card(600), { exerted: true });
  const definition = card(601, {}, {
    keywords: [kw('Rush'), kw('Singer', 9)],
    activated: [{ cost: { exert: true }, effects: [{ op: 'gainLore', amount: 1, target: playerTarget() }], sourceText: 'Ability' }],
  });
  let iid; [state, iid] = play(state, definition);
  put(state, 'player', 'hand', card(602, { type: 'Action', subtypes: ['Song'], cost: 5 }));
  const actions = getLegalActions(state);
  assert.ok(actions.some(a => a.type === 'challenge' && a.iid === iid && a.target === target.iid));
  assert.ok(!actions.some(a => (a.type === 'quest' || a.type === 'activate') && a.iid === iid));
  assert.ok(!actions.some(a => a.type === 'sing' && a.singers.includes(iid)));
});

test('items can activate immediately and characters can pay non-exert ability costs while drying', () => {
  let state = game(); ink(state);
  let iid; [state, iid] = play(state, card(601, { type: 'Item' }, { activated: [{ cost: { exert: true }, effects: [{ op: 'gainLore', amount: 1, target: playerTarget() }], sourceText: '' }] }));
  state = applyAction(state, action(state, 'activate', a => a.iid === iid));
  assert.equal(state.players.player.lore, 1);
  const dry = put(state, 'player', 'field', card(602, {}, { activated: [{ cost: { ink: 1 }, effects: [{ op: 'gainLore', amount: 1, target: playerTarget() }], sourceText: '' }] }), { drying: true });
  assert.ok(getLegalActions(state).some(a => a.type === 'activate' && a.iid === dry.iid));
});

test('ready/set/draw readies field and ink, dries characters, resets ink, and gains location lore', () => {
  let state = game();
  const character = put(state, 'bot', 'field', card(600), { exerted: true, drying: true, damage: 1 });
  put(state, 'bot', 'field', card(601, { type: 'Location', lore: 2 }));
  const resource = put(state, 'bot', 'inkwell', card(602), { exerted: true });
  state.players.bot.inkedThisTurn = true;
  const hand = state.players.bot.hand.length;
  state = applyAction(state, action(state, 'endTurn'));
  assert.equal(state.activePlayer, 'bot');
  const ready = state.players.bot.field.find(c => c.iid === character.iid);
  assert.equal(ready.drying, false); assert.equal(ready.exerted, false); assert.equal(ready.damage, 1);
  assert.equal(state.players.bot.inkwell.find(c => c.iid === resource.iid).exerted, false);
  assert.equal(state.players.bot.inkedThisTurn, false);
  assert.equal(state.players.bot.lore, 2); assert.equal(state.players.bot.hand.length, hand + 1);
});

test('beginning triggers resolve after Set but BEFORE the normal Draw', () => {
  let state = game();
  put(state, 'bot', 'field', card(600, {}, { triggered: [{ trigger: 'start', turn: 'yours', optional: true, effects: [{ op: 'gainLore', target: playerTarget(), amount: 1 }], sourceText: '' }] }));
  const hand = state.players.bot.hand.length;
  state = applyAction(state, action(state, 'endTurn'));
  assert.equal(state.pending.kind, 'optional');
  assert.equal(state.pending.player, 'bot');
  assert.equal(state.players.bot.hand.length, hand);
  state = decide(state, ['yes']);
  assert.equal(state.players.bot.hand.length, hand + 1);
  assert.equal(state.players.bot.lore, 1);
});

test('challenge damage is simultaneous, persistent, applies Challenger/Resist and banishes both lethal cards', () => {
  let state = game();
  const attacker = put(state, 'player', 'field', card(600, { strength: 1, willpower: 3 }, { keywords: [kw('Challenger', 3)] }));
  const defender = put(state, 'bot', 'field', card(601, { strength: 3, willpower: 3 }, { keywords: [kw('Resist', 1)] }), { exerted: true });
  state = applyAction(state, action(state, 'challenge', a => a.iid === attacker.iid && a.target === defender.iid));
  assert.equal(state.players.player.field.length, 0);
  assert.equal(state.players.bot.field.length, 0);
  assert.equal(state.players.player.discard[0].iid, attacker.iid);
  assert.equal(state.players.bot.discard[0].iid, defender.iid);
  assert.equal(state.players.player.discard[0].damage, 0);
});

test('Bodyguard restricts character challenges, not location challenges; Evasive and Alert are distinct', () => {
  const state = game();
  const attacker = put(state, 'player', 'field', card(600, {}, { keywords: [kw('Alert')] }));
  const guard = put(state, 'bot', 'field', card(601, {}, { keywords: [kw('Bodyguard'), kw('Evasive')] }), { exerted: true });
  const regular = put(state, 'bot', 'field', card(602), { exerted: true });
  const location = put(state, 'bot', 'field', card(603, { type: 'Location' }));
  const legal = getLegalActions(state).filter(a => a.type === 'challenge' && a.iid === attacker.iid);
  assert.ok(legal.some(a => a.target === guard.iid));
  assert.ok(legal.some(a => a.target === location.iid));
  assert.ok(!legal.some(a => a.target === regular.iid));
  assert.ok(!getStats(state, attacker.iid).keywords.some(k => k.keyword === 'Evasive'));
});

test('Reckless cannot quest or end turn while a legal challenge remains', () => {
  let state = game();
  const source = put(state, 'player', 'field', card(600, {}, { keywords: [kw('Reckless')] }));
  put(state, 'bot', 'field', card(601), { exerted: true });
  assert.ok(!getLegalActions(state).some(a => a.type === 'endTurn' || (a.type === 'quest' && a.iid === source.iid)));
  state = applyAction(state, action(state, 'challenge', a => a.iid === source.iid));
  assert.ok(getLegalActions(state).some(a => a.type === 'endTurn'));
});

test('singing uses printed cost or Singer, exerts singers, and pays no ink', () => {
  let state = game(); ink(state);
  const singer = put(state, 'player', 'field', card(600, { cost: 2 }, { keywords: [kw('Singer', 5)] }));
  const song = put(state, 'player', 'hand', card(601, { type: 'Action', cost: 5, subtypes: ['Song'] }, { action: [{ op: 'gainLore', amount: 2, target: playerTarget() }] }));
  state = applyAction(state, action(state, 'sing', a => a.iid === song.iid));
  assert.equal(availableInk(state, 'player'), 5);
  assert.equal(state.players.player.field.find(c => c.iid === singer.iid).exerted, true);
  assert.equal(state.players.player.lore, 2);
});

test('Sing Together totals chosen singers and never allows insufficient combined cost', () => {
  let state = game();
  const a = put(state, 'player', 'field', card(600, { cost: 4 }));
  const b = put(state, 'player', 'field', card(601, { cost: 3 }));
  const song = put(state, 'player', 'hand', card(602, { type: 'Action', cost: 7, subtypes: ['Song'] }, { keywords: [kw('Sing Together', 7)] }));
  const legal = getLegalActions(state).filter(x => x.type === 'sing' && x.iid === song.iid);
  assert.equal(legal.length, 1); assert.deepEqual(legal[0].singers, []);
  state = applyAction(state, legal[0]);
  assert.equal(state.pending.kind, 'singers');
  assert.throws(() => decide(state, [a.iid]));
  state = decide(state, [a.iid, b.iid]);
  assert.ok(state.players.player.field.every(c => c.exerted));
});

test('Shift matches base name and inherits damage, exertion, drying, location, and stack disposal', () => {
  let state = game(); ink(state, 'player', 10);
  const location = put(state, 'player', 'field', card(600, { type: 'Location' }));
  const base = put(state, 'player', 'field', card(601, { name: 'Mickey Mouse - Apprentice' }), { damage: 2, exerted: true, drying: true, location: location.iid });
  const shifted = put(state, 'player', 'hand', card(602, { name: 'Mickey Mouse', cost: 6 }, { keywords: [kw('Shift', 3)] }));
  state = applyAction(state, action(state, 'shift', a => a.iid === shifted.iid));
  const top = state.players.player.field.find(c => c.iid === shifted.iid);
  assert.equal(top.damage, 2); assert.equal(top.exerted, true); assert.equal(top.drying, true);
  assert.equal(top.location, location.iid); assert.equal(top.stack[0].iid, base.iid);
  assert.equal(availableInk(state, 'player'), 7);
  [state] = play(state, card(603, { type: 'Action', cost: 0 }, { action: [{ op: 'banish', target: chosen('you') }] }));
  state = decide(state, [top.iid]);
  assert.ok([base.iid, top.iid].every(iid => state.players.player.discard.some(c => c.iid === iid)));
});

test('movement pays location cost without exerting and permits drying characters', () => {
  let state = game(); ink(state);
  const character = put(state, 'player', 'field', card(600), { drying: true });
  const location = put(state, 'player', 'field', card(601, { type: 'Location', moveCost: 2 }));
  state = applyAction(state, action(state, 'move', a => a.iid === character.iid));
  assert.equal(state.players.player.field.find(c => c.iid === character.iid).location, location.iid);
  assert.equal(state.players.player.field.find(c => c.iid === character.iid).exerted, false);
  assert.equal(availableInk(state, 'player'), 3);
  assert.ok(!getLegalActions(state).some(a => a.type === 'move' && a.iid === character.iid));
});

test('static stats are dynamic and reductions apply to cards in hand', () => {
  const state = game();
  const ally = put(state, 'player', 'field', card(600, { subtypes: ['Villain'] }));
  const leader = put(state, 'player', 'field', card(601, {}, { static: [
    { kind: 'buff', target: self, stat: 'lore', amount: 1, per: { kind: 'all', owner: 'you', zone: 'play', filter: { subtypes: ['Villain'], excludeSelf: true } }, sourceText: '' },
    { kind: 'costReduction', target: { kind: 'all', owner: 'you', filter: { types: ['Character'] } }, amount: 1, sourceText: '' },
  ] }));
  assert.equal(getStats(state, leader.iid).lore, 2);
  assert.equal(getStats(state, state.players.player.hand[0].iid).cost, 1);
  state.players.player.field = state.players.player.field.filter(c => c.iid !== ally.iid);
  assert.equal(getStats(state, leader.iid).lore, 1);
});

test('Ward blocks only opposing chosen effects, not area effects', () => {
  let state = game();
  const ward = put(state, 'bot', 'field', card(600, {}, { keywords: [kw('Ward')] }));
  const other = put(state, 'bot', 'field', card(601));
  [state] = play(state, card(602, { type: 'Action', cost: 0 }, { action: [{ op: 'damage', amount: 1, target: chosen('opponent') }] }));
  assert.deepEqual(state.pending.options.map(o => o.iid), [other.iid]);
  state = decide(state, [other.iid]);
  [state] = play(state, card(603, { type: 'Action', cost: 0 }, { action: [{ op: 'damage', amount: 1, target: { kind: 'all', owner: 'opponent', zone: 'play', filter: { types: ['Character'] } } }] }));
  assert.equal(state.players.bot.field.find(c => c.iid === ward.iid).damage, 1);
});

test('optional sequences, target choices and up-to amounts survive JSON round trips', () => {
  let state = game();
  const target = put(state, 'player', 'field', card(600), { damage: 3 });
  [state] = play(state, card(601, { type: 'Action', cost: 0 }, { action: [{ op: 'heal', amount: 3, optional: true, upTo: true, target: chosen('you') }] }));
  assert.equal(state.pending.kind, 'optional');
  state = decide(JSON.parse(JSON.stringify(state)), ['yes']);
  state = decide(JSON.parse(JSON.stringify(state)), [target.iid]);
  assert.equal(state.pending.kind, 'amount');
  state = decide(JSON.parse(JSON.stringify(state)), ['1']);
  assert.equal(state.players.player.field.find(c => c.iid === target.iid).damage, 2);
});

test('an entire effect sequence resolves before game-state checks; lethal damage can be healed within it', () => {
  let state = game();
  const target = put(state, 'player', 'field', card(600, { willpower: 2 }));
  [state] = play(state, card(601, { type: 'Action', cost: 0 }, { action: [
    { op: 'damage', amount: 2, target: chosen('you') },
    { op: 'heal', amount: 2, target: chosen('you') },
  ] }));
  state = decide(state, [target.iid]);
  assert.equal(state.players.player.field[0].damage, 2);
  assert.equal(state.pending.kind, 'targets');
  state = decide(state, [target.iid]);
  assert.equal(state.players.player.field[0].damage, 0);
});

test('missing targets skip only the dependent effect and continue the sequence', () => {
  let state = game();
  [state] = play(state, card(600, { type: 'Action', cost: 0 }, { action: [
    { op: 'banish', target: chosen('opponent') },
    { op: 'gainLore', amount: 2, target: playerTarget() },
  ] }));
  assert.equal(state.pending, null); assert.equal(state.players.player.lore, 2);
});

test('simultaneous trigger bag permits chosen ordering and checks secondary conditions on resolution', () => {
  let state = game();
  let source; [state, source] = play(state, card(600, { cost: 0 }, { triggered: [
    { trigger: 'play', effects: [{ op: 'damage', target: self, amount: 1 }], sourceText: 'damage' },
    { trigger: 'play', condition: { kind: 'selfDamaged' }, effects: [{ op: 'gainLore', target: playerTarget(), amount: 3 }], sourceText: 'lore' },
  ] }));
  assert.equal(state.pending.kind, 'order');
  assert.equal(state.pending.options.length, 2);
  const damage = state.bag.find(b => b.effects[0].op === 'damage').id;
  state = decide(state, [damage]);
  assert.equal(state.players.player.lore, 3);
  assert.equal(state.players.player.field.find(c => c.iid === source).damage, 1);
});

test('opponent owns discard decisions and chooses exactly the required number', () => {
  let state = game();
  [state] = play(state, card(600, { type: 'Action', cost: 0 }, { action: [{ op: 'discard', amount: 2, target: playerTarget('opponent') }] }));
  assert.equal(activeDecisionPlayer(state), 'bot');
  const ids = state.players.bot.hand.slice(0, 2).map(c => c.iid);
  assert.throws(() => decide(state, [ids[0]]));
  assert.throws(() => decide(state, [ids[0], ids[0]]));
  state = decide(state, ids);
  assert.equal(state.players.bot.hand.length, 5);
  assert.equal(state.players.bot.discard.length, 2);
});

test('chosen player effects select players instead of cards', () => {
  let state = game();
  [state] = play(state, card(600, { type: 'Action', cost: 0 }, { action: [{ op: 'gainLore', amount: 2, target: { kind: 'chosen', owner: 'any' } }] }));
  assert.deepEqual(state.pending.options.map(o => o.id), ['player', 'bot']);
  state = decide(state, ['bot']);
  assert.equal(state.players.bot.lore, 2);
});

test('recover chooses discard cards and inkTop obeys entersExerted without consuming normal ink action', () => {
  let state = game();
  const recovered = put(state, 'player', 'discard', card(600));
  [state] = play(state, card(601, { type: 'Action', cost: 0 }, { action: [
    { op: 'recover', amount: 1, target: { kind: 'chosen', owner: 'you', zone: 'discard', filter: { types: ['Character'] } } },
    { op: 'inkTop', amount: 1, entersExerted: true, target: playerTarget() },
  ] }));
  state = decide(state, [recovered.iid]);
  assert.ok(state.players.player.hand.some(c => c.iid === recovered.iid));
  assert.equal(state.players.player.inkwell.length, 1);
  assert.equal(availableInk(state, 'player'), 0);
  assert.equal(state.players.player.inkedThisTurn, false);
});

test('temporary buffs expire at specified turn boundaries', () => {
  let state = game();
  const target = put(state, 'player', 'field', card(600));
  [state] = play(state, card(601, { type: 'Action', cost: 0 }, { action: [{ op: 'buff', amount: 3, stat: 'strength', duration: 'untilStartOfYourNextTurn', target: chosen('you') }] }));
  state = decide(state, [target.iid]);
  assert.equal(getStats(state, target.iid).strength, 5);
  state = applyAction(state, action(state, 'endTurn'));
  assert.equal(getStats(state, target.iid).strength, 5);
  state = applyAction(state, action(state, 'endTurn'));
  assert.equal(getStats(state, target.iid).strength, 2);
});

test('Vanish triggers after opposing action finishes and not from an item ability', () => {
  let state = game();
  const vanish = put(state, 'bot', 'field', card(600, {}, { keywords: [kw('Vanish')] }));
  const source = put(state, 'player', 'field', card(601, { type: 'Item' }, { activated: [{ cost: { exert: true }, effects: [{ op: 'exert', target: chosen('opponent') }], sourceText: '' }] }));
  state = applyAction(state, action(state, 'activate', a => a.iid === source.iid));
  state = decide(state, [vanish.iid]);
  assert.equal(state.players.bot.field.length, 1);
  [state] = play(state, card(602, { type: 'Action', cost: 0 }, { action: [{ op: 'ready', target: chosen('opponent') }, { op: 'gainLore', target: playerTarget(), amount: 1 }] }));
  state = decide(state, [vanish.iid]);
  assert.equal(state.players.player.lore, 1);
  assert.equal(state.players.bot.field.length, 0);
});

test('Boost pays once per turn, works while drying, puts one facedown card under source and disposes it with source', () => {
  let state = game(); ink(state);
  const boost = put(state, 'player', 'field', card(600, {}, { keywords: [kw('Boost', 2)] }), { drying: true });
  const top = state.players.player.deck[0].iid;
  state = applyAction(state, action(state, 'boost', a => a.iid === boost.iid));
  const boosted = state.players.player.field.find(c => c.iid === boost.iid);
  assert.equal(boosted.stack[0].iid, top); assert.equal(boosted.stack[0].faceDown, true);
  assert.equal(availableInk(state, 'player'), 3);
  assert.ok(!getLegalActions(state).some(a => a.type === 'boost' && a.iid === boost.iid));
  [state] = play(state, card(601, { type: 'Action', cost: 0 }, { action: [{ op: 'returnHand', target: chosen('you') }] }));
  state = decide(state, [boost.iid]);
  assert.ok(state.players.player.hand.some(c => c.iid === top && !c.faceDown));
});

test('20 lore finishes immediately after a quest, and concede works during another player decision', () => {
  let state = game(); state.players.player.lore = 19;
  const quester = put(state, 'player', 'field', card(600));
  state = applyAction(state, action(state, 'quest', a => a.iid === quester.iid));
  assert.equal(state.phase, 'finished'); assert.equal(state.winner, 'player');
  assert.equal(activeDecisionPlayer(state), null); assert.deepEqual(getLegalActions(state), []);
  assert.throws(() => applyAction(state, { type: 'endTurn', player: 'player' }));
  const conceded = applyAction(opening(), { type: 'concede', player: 'bot' });
  assert.equal(conceded.winner, 'player'); assert.equal(conceded.finishReason, 'concede');
});

test('empty deck only loses at end of OWN turn, allowing a win earlier in the same turn', () => {
  let state = game(); state.players.player.deck = [];
  assert.notEqual(state.phase, 'finished');
  let lost = applyAction(state, action(state, 'endTurn'));
  assert.equal(lost.winner, 'bot'); assert.equal(lost.finishReason, 'emptyDeck');
  state.players.player.lore = 19;
  const quester = put(state, 'player', 'field', card(600));
  state = applyAction(state, action(state, 'quest', a => a.iid === quester.iid));
  assert.equal(state.winner, 'player'); assert.equal(state.finishReason, 'lore');
});

test('compiled catalog-style rules integrate without a parallel card parser', () => {
  let state = game();
  const source = { id: 600, original: { name: 'Ação', type: 'Action', full_text: 'Draw 2 cards.', abilities: null, effects: ['Draw 2 cards.'] } };
  const compiled = compileCardRules(source);
  assert.equal(compiled.supported, true);
  const before = state.players.player.hand.length;
  [state] = play(state, card(600, { type: 'Action', cost: 0 }, compiled));
  assert.equal(state.players.player.hand.length, before + 2);
});

test('gameplay labels use PT metadata and deterministic replay preserves final state', () => {
  let left = game(); ink(left);
  put(left, 'player', 'hand', card(600, { name: 'Mickey Mouse', displayName: 'Mickey Mouse - Amigo Verdadeiro' }));
  let right = JSON.parse(JSON.stringify(left));
  const selected = action(left, 'play', a => a.iid.startsWith('test-') && a.label.includes('Amigo Verdadeiro'));
  for (const move of [selected]) { left = applyAction(left, move); right = applyAction(right, move); }
  assert.deepEqual(left, right);
  assert.ok(left.log.at(-1).includes('Amigo Verdadeiro'));
});

test('Ready-end state check banishes expiring lethal locations before Set lore; their start trigger remains', () => {
  let state = game(); state.activePlayer = 'bot'; state.players.player.lore = 19;
  const location = put(state, 'player', 'field', card(600, { type: 'Location', willpower: 2, lore: 1 }, { triggered: [
    { trigger: 'start', turn: 'yours', effects: [{ op: 'draw', target: playerTarget(), amount: 1 }], sourceText: '' },
  ] }), { damage: 2 });
  state.modifiers.push({ iid: location.iid, stat: 'willpower', amount: 1, duration: 'untilStartOfYourNextTurn', player: 'player', createdTurn: 0, expiresOnOwnTurn: 2 });
  const cardsBefore = state.players.player.hand.length;
  state = applyAction(state, action(state, 'endTurn'));
  assert.equal(state.winner, null); assert.equal(state.players.player.lore, 19);
  assert.ok(state.players.player.discard.some(c => c.iid === location.iid));
  assert.equal(state.players.player.hand.length, cardsBefore + 2);
});

test('a global hand reducer cannot discount itself; self-referential hand reductions work', () => {
  const state = game(); ink(state, 'player', 2);
  const global = put(state, 'player', 'hand', card(600, { cost: 3 }, { static: [
    { kind: 'costReduction', target: { kind: 'all', owner: 'you', filter: { types: ['Character'] } }, amount: 1, sourceText: '' },
  ] }));
  const personal = put(state, 'player', 'hand', card(601, { cost: 3 }, { static: [
    { kind: 'costReduction', target: self, amount: 1, sourceText: '' },
  ] }));
  assert.equal(getStats(state, global.iid).cost, 3);
  assert.ok(!getLegalActions(state).some(a => a.type === 'play' && a.iid === global.iid));
  assert.equal(getStats(state, personal.iid).cost, 2);
  assert.ok(getLegalActions(state).some(a => a.type === 'play' && a.iid === personal.iid));
});

test('Challenger applies to raw strength before flooring and is visible during the declaration bag', () => {
  let state = game();
  const attacker = put(state, 'player', 'field', card(600, { strength: 2 }, { keywords: [kw('Challenger', 3)], triggered: [
    { trigger: 'challenge', optional: true, effects: [{ op: 'gainLore', target: playerTarget(), amount: 1 }], sourceText: '' },
  ] }));
  const target = put(state, 'bot', 'field', card(601, { willpower: 8 }), { exerted: true });
  state.modifiers.push({ iid: attacker.iid, stat: 'strength', amount: -4, duration: 'thisTurn', player: 'player', createdTurn: state.turn, expiresOnOwnTurn: 2 });
  assert.equal(getStats(state, attacker.iid).strength, 0);
  state = applyAction(state, action(state, 'challenge', a => a.iid === attacker.iid));
  assert.equal(state.pending.kind, 'optional');
  assert.equal(getStats(state, attacker.iid).strength, 1);
  state = decide(state);
  assert.equal(state.players.bot.field.find(c => c.iid === target.iid).damage, 1);
  assert.equal(getStats(state, attacker.iid).strength, 0);
});

test('Support uses resolution-time strength and duplicate granted Support triggers only once', () => {
  let state = game();
  const source = put(state, 'player', 'field', card(600, { strength: 2 }, {
    keywords: [kw('Support')],
    static: [{ kind: 'grantKeyword', target: self, keyword: 'Support', sourceText: '' }],
    triggered: [{ trigger: 'selfQuest', effects: [{ op: 'buff', target: self, stat: 'strength', amount: 4, duration: 'thisTurn' }], sourceText: '' }],
  }));
  const recipient = put(state, 'player', 'field', card(601, { strength: 1 }));
  state = applyAction(state, action(state, 'quest', a => a.iid === source.iid));
  assert.equal(state.bag.filter(entry => entry.support).length, 1);
  const buff = state.bag.find(entry => !entry.support).id;
  state = decide(state, [buff]);
  assert.equal(state.pending.kind, 'optional');
  state = decide(state, ['yes']);
  state = decide(state, [recipient.iid]);
  assert.equal(getStats(state, recipient.iid).strength, 7);
});

test('Support retains last-known effective strength when its source leaves before resolution', () => {
  let state = game();
  const source = put(state, 'player', 'field', card(600, { strength: 2 }, {
    keywords: [kw('Support')],
    triggered: [{ trigger: 'selfQuest', effects: [{ op: 'buff', target: self, stat: 'strength', amount: 4, duration: 'thisTurn' }, { op: 'banish', target: self }], sourceText: '' }],
  }));
  const recipient = put(state, 'player', 'field', card(601, { strength: 1 }));
  state = applyAction(state, action(state, 'quest', a => a.iid === source.iid));
  state = decide(state, [state.bag.find(entry => !entry.support).id]);
  state = decide(state, ['yes']);
  state = decide(state, [recipient.iid]);
  assert.equal(getStats(state, recipient.iid).strength, 7);
});

test('an action cannot recover itself from discard and remains transient throughout pending choices', () => {
  let state = game();
  let iid; [state, iid] = play(state, card(600, { type: 'Action', cost: 0 }, { action: [
    { op: 'recover', target: { kind: 'chosen', owner: 'you', zone: 'discard', filter: { types: ['Action'] } } },
    { op: 'gainLore', amount: 1, optional: true, target: playerTarget() },
  ] }));
  assert.equal(state.pending.kind, 'optional');
  assert.equal(state.resolvingAction.card.iid, iid);
  assert.ok(!state.players.player.discard.some(c => c.iid === iid));
  state = decide(state);
  assert.equal(state.resolvingAction, null);
  assert.ok(state.players.player.discard.some(c => c.iid === iid));
  assert.ok(!state.players.player.hand.some(c => c.iid === iid));
});

test('Boost on empty deck pays but does not consume its once-per-turn successful use', () => {
  let state = game(); ink(state);
  const booster = put(state, 'player', 'field', card(600, {}, { keywords: [kw('Boost', 1)] }));
  state.players.player.deck = [];
  state = applyAction(state, action(state, 'boost', a => a.iid === booster.iid));
  assert.equal(availableInk(state, 'player'), 4);
  assert.ok(getLegalActions(state).some(a => a.type === 'boost' && a.iid === booster.iid));
  assert.equal(state.players.player.field[0].boostedThisTurn, undefined);
});

test('Shift alternative cost receives the full reduction before clamping', () => {
  const state = game();
  put(state, 'player', 'field', card(600, { name: 'Mickey Mouse' }, { static: [{ kind: 'costReduction', target: { kind: 'all', owner: 'you', filter: { types: ['Character'] } }, amount: 5, sourceText: '' }] }));
  const shift = put(state, 'player', 'hand', card(601, { name: 'Mickey Mouse', cost: 2 }, { keywords: [kw('Shift', 4)] }));
  assert.equal(action(state, 'shift', a => a.iid === shift.iid).cost, 0);
});

test('large Sing Together fields expose complete options without exponential legal-action expansion', () => {
  let state = game();
  for (let i = 0; i < 32; i++) put(state, 'player', 'field', card(600 + i, { cost: 1 }));
  const song = put(state, 'player', 'hand', card(700, { type: 'Action', subtypes: ['Song'], cost: 10 }, { keywords: [kw('Sing Together', 10)] }));
  assert.equal(getLegalActions(state).filter(a => a.type === 'sing').length, 1);
  state = applyAction(state, action(state, 'sing', a => a.iid === song.iid));
  assert.equal(state.pending.options.length, 32);
  assert.ok(getLegalActions(state).length <= 34);
  const arbitrary = state.pending.options.slice(7, 17).map(o => o.id);
  state = decide(state, arbitrary);
  assert.equal(state.pending, null);
  assert.equal(state.players.player.field.filter(c => c.exerted).length, 10);
});

test('current bag controller finishes its entries before a newly triggered active-player ability', () => {
  let state = game();
  const victim = put(state, 'player', 'field', card(600, {}, { triggered: [
    { trigger: 'selfBanished', optional: true, effects: [{ op: 'gainLore', target: playerTarget(), amount: 1 }], sourceText: '' },
  ] }));
  put(state, 'bot', 'field', card(601, {}, { triggered: [
    { trigger: 'end', turn: 'opponents', effects: [{ op: 'banish', target: chosen('opponent') }], sourceText: '' },
    { trigger: 'end', turn: 'opponents', optional: true, effects: [{ op: 'gainLore', target: playerTarget(), amount: 1 }], sourceText: '' },
  ] }));
  state = applyAction(state, action(state, 'endTurn'));
  assert.equal(state.pending.kind, 'order'); assert.equal(state.pending.player, 'bot');
  state = decide(state, [state.bag.find(entry => entry.effects[0].op === 'banish').id]);
  state = decide(state, [victim.iid]);
  assert.equal(state.pending.kind, 'optional'); assert.equal(state.pending.player, 'bot');
  state = decide(state);
  assert.equal(state.pending.kind, 'optional'); assert.equal(state.pending.player, 'player');
  state = decide(state);
  assert.equal(state.activePlayer, 'bot');
});

test('conceding during an action decision preserves every physical card instance', () => {
  let state = game();
  let iid; [state, iid] = play(state, card(600, { type: 'Action', cost: 0 }, { action: [{ op: 'draw', target: playerTarget(), amount: 1, optional: true }] }));
  assert.equal(state.resolvingAction.card.iid, iid);
  state = applyAction(state, { type: 'concede', player: 'player' });
  assert.equal(state.phase, 'finished'); assert.equal(state.resolvingAction, null);
  assert.ok(state.players.player.discard.some(c => c.iid === iid));
});

test('failed multi-singer decisions are transactional, even after structural decision validation', () => {
  let state = game();
  put(state, 'player', 'field', card(600, { cost: 10 }));
  const low = put(state, 'player', 'field', card(601, { cost: 1 }));
  const song = put(state, 'player', 'hand', card(602, { type: 'Action', subtypes: ['Song'], cost: 10 }, { keywords: [kw('Sing Together', 10)] }));
  state = applyAction(state, action(state, 'sing', a => a.iid === song.iid));
  assert.equal(state.pending.min, 1);
  const before = JSON.stringify(state);
  assert.throws(() => decide(state, [low.iid]), /somar/);
  assert.equal(JSON.stringify(state), before);
});

test('static keyword snapshots contain no generated undefined fields and logs stay bounded', () => {
  let state = game();
  const source = put(state, 'player', 'field', card(600, {}, {
    static: [{ kind: 'grantKeyword', target: self, keyword: 'Ward', sourceText: '' }],
    triggered: [{ trigger: 'selfQuest', optional: true, effects: [{ op: 'draw', target: playerTarget(), amount: 1 }], sourceText: '' }],
  }));
  state = applyAction(state, action(state, 'quest', a => a.iid === source.iid));
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  state = decide(state);
  state.log = Array(1000).fill('Evento anterior');
  state = applyAction(state, action(state, 'endTurn'));
  assert.equal(state.log.length, 1000);
});

test('area damage calculates every Resist modifier before placing any simultaneous damage', () => {
  let state = game();
  const aura = put(state, 'bot', 'field', card(600, {}, { static: [{ kind: 'grantKeyword', target: { kind: 'all', owner: 'you', zone: 'play', filter: { types: ['Character'] } }, condition: { kind: 'selfDamaged' }, keyword: 'Resist', value: 1, sourceText: '' }] }));
  const ally = put(state, 'bot', 'field', card(601));
  [state] = play(state, card(602, { type: 'Action', cost: 0 }, { action: [{ op: 'damage', amount: 2, target: { kind: 'all', owner: 'opponent', zone: 'play', filter: { types: ['Character'] } } }] }));
  assert.equal(state.players.bot.field.find(c => c.iid === aura.iid).damage, 2);
  assert.equal(state.players.bot.field.find(c => c.iid === ally.iid).damage, 2);
});

test('declining an optional sentence makes no target choice, but accepting and choosing zero amount triggers Vanish', () => {
  let state = game();
  const target = put(state, 'bot', 'field', card(600, {}, { keywords: [kw('Vanish')] }), { damage: 1 });
  const effect = { op: 'heal', amount: 1, upTo: true, optional: true, target: chosen('opponent') };
  [state] = play(state, card(601, { type: 'Action', cost: 0 }, { action: [effect] }));
  state = decide(state);
  assert.ok(state.players.bot.field.some(c => c.iid === target.iid));
  [state] = play(state, card(602, { type: 'Action', cost: 0 }, { action: [effect] }));
  state = decide(state, ['yes']);
  state = decide(state, [target.iid]);
  state = decide(state, ['0']);
  assert.ok(!state.players.bot.field.some(c => c.iid === target.iid));
});

test('up-to target count permits choosing nobody and does not trigger Vanish', () => {
  let state = game();
  const target = put(state, 'bot', 'field', card(600, {}, { keywords: [kw('Vanish')] }));
  [state] = play(state, card(601, { type: 'Action', cost: 0 }, { action: [{ op: 'damage', amount: 1, target: { ...chosen('opponent'), min: 0, max: 2 } }] }));
  state = decide(state);
  assert.equal(state.players.bot.field[0].iid, target.iid);
  assert.equal(state.players.bot.field[0].damage, 0);
});
