import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { registerHooks, stripTypeScriptTypes } from 'node:module';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

// Test the actual sources without generating dist files outside this task's scope.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.includes('/packages/game-core/src/') && specifier.startsWith('.') && specifier.endsWith('.js')) {
      return nextResolve(specifier.slice(0, -3) + '.ts', context);
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts') && url.includes('/packages/game-core/src/')) {
      return { format: 'module', shortCircuit: true, source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8')) };
    }
    return nextLoad(url, context);
  },
});

const { createGame, applyAction, getLegalActions, activeDecisionPlayer } = await import('../src/engine.ts');
const { chooseBotAction } = await import('../src/bot.ts');
const { compileCardRules } = await import('../src/cards.ts');
const { TRAINING_DECKS } = await import('../src/training.ts');

let nextCardId = 1;
function card(overrides = {}) {
  const id = nextCardId++;
  return {
    id, name: `Fixture ${id}`, type: 'Character', cost: 2, inkwell: true,
    strength: 2, willpower: 3, lore: 1, moveCost: 0, subtypes: [], image: '', text: '',
    rules: { sourceId: id, keywords: [], static: [], triggered: [], activated: [], action: [], unsupported: [], supported: true },
    ...overrides,
  };
}

function instance(iid, definition = card(), overrides = {}) {
  return { iid, card: definition, exerted: false, drying: false, damage: 0, location: null, stack: [], ...overrides };
}

function fixture() {
  const state = createGame({ decks: { player: Array.from({ length: 40 }, () => card()), bot: Array.from({ length: 40 }, () => card()) }, seed: 123 });
  state.phase = 'main';
  state.pending = null;
  state.decision = null;
  state.activePlayer = 'bot';
  state.turn = 5;
  state.winner = null;
  for (const player of Object.values(state.players)) {
    player.hand = [];
    player.field = [];
    player.inkwell = [];
    player.discard = [];
    player.lore = 0;
  }
  return state;
}

function ink(state, count, exerted = false) {
  state.players.bot.inkwell = Array.from({ length: count }, (_, index) => instance(`ink-${index}`, card(), { exerted }));
}

function chooseLegal(state) {
  const before = structuredClone(state);
  const action = chooseBotAction(state);
  assert.equal(action.player, 'bot');
  assert.ok(getLegalActions(state, 'bot').some(candidate => JSON.stringify(candidate) === JSON.stringify(action)), `Not an engine legal action: ${JSON.stringify(action)}`);
  assert.deepEqual(state, before, 'Choosing must not mutate the caller state');
  return action;
}

test('takes immediate quest victory instead of developing the board', () => {
  const state = fixture();
  state.players.bot.lore = 19;
  state.players.bot.field = [instance('winner')];
  state.players.bot.hand = [instance('expensive', card({ cost: 6, strength: 8, willpower: 8, lore: 3 }))];
  ink(state, 6);
  const result = applyAction(state, chooseLegal(state));
  assert.equal(result.winner, 'bot');
});

test('rejects a human decision and a finished game without inventing a bot action', () => {
  const state = fixture();
  state.activePlayer = 'player';
  assert.throws(() => chooseBotAction(state), /bot|decision|turn/i);
  state.phase = 'finished';
  state.winner = 'player';
  assert.throws(() => chooseBotAction(state), /bot|decision|finished|legal/i);
});

test('identical public state and own hand give identical decisions across concealed information', () => {
  const state = fixture();
  state.players.bot.field = [instance('quester')];
  state.players.bot.hand = [instance('playable', card({ cost: 2, lore: 2 }))];
  state.players.player.hand = [instance('secret', card({ cost: 1 }))];
  ink(state, 3);
  const alternative = structuredClone(state);
  alternative.players.player.hand[0].card = card({ cost: 99, lore: 99, strength: 99 });
  alternative.players.player.deck.reverse();
  alternative.players.bot.deck.reverse();
  for (const player of Object.values(alternative.players)) {
    player.deck = player.deck.map((entry, index) => instance(`concealed-${index}`, card({ cost: 99, lore: 99 })));
  }
  assert.deepEqual(chooseLegal(state), chooseLegal(alternative));
});

test('never inspects hidden card objects, even when they would throw on access', () => {
  const state = fixture();
  state.players.bot.field = [instance('quester')];
  const hidden = new Proxy({}, { get() { throw new Error('Hidden card was read'); }, ownKeys() { throw new Error('Hidden card was enumerated'); } });
  state.players.player.hand = [{ iid: 'secret-hand', card: hidden }];
  state.players.player.deck = [hidden, hidden, hidden];
  state.players.bot.deck = [hidden, hidden, hidden];
  assert.equal(chooseBotAction(state).player, 'bot');
});

test('banishes an opponent quester to deny public next-turn lethal', () => {
  const state = fixture();
  state.players.player.lore = 18;
  state.players.player.field = [instance('lethal-quester', card({ lore: 2, strength: 1, willpower: 3 }), { exerted: true })];
  state.players.bot.field = [instance('defender', card({ strength: 3, willpower: 5, lore: 2 }))];
  const action = chooseLegal(state);
  const after = applyAction(state, action);
  assert.equal(after.players.player.field.length, 0, JSON.stringify(action));
  assert.equal(after.players.bot.field.length, 1);
});

test('accounts for persistent damage when finding a favorable trade', () => {
  const state = fixture();
  state.players.player.lore = 17;
  state.players.player.field = [instance('damaged-threat', card({ lore: 3, strength: 1, willpower: 8 }), { damage: 6, exerted: true })];
  state.players.bot.field = [instance('small-attacker', card({ strength: 2, willpower: 4 }))];
  const after = applyAction(state, chooseLegal(state));
  assert.equal(after.players.player.field.length, 0);
  assert.equal(after.players.bot.field[0].damage, 1);
});

test('inks an expensive spare to unlock a two-drop, then plays on curve', () => {
  const state = fixture();
  ink(state, 1);
  state.players.bot.hand = [instance('two-drop', card({ cost: 2, lore: 2 })), instance('spare', card({ cost: 8 }))];
  const first = applyAction(state, chooseLegal(state));
  assert.ok(first.players.bot.inkwell.some(entry => entry.iid === 'spare'));
  const second = applyAction(first, chooseLegal(first));
  assert.ok(second.players.bot.field.some(entry => entry.iid === 'two-drop'));
});

test('retains its last useful card when additional ink would not unlock anything', () => {
  const state = fixture();
  ink(state, 9, true);
  state.players.bot.hand = [instance('keep', card({ cost: 3, lore: 2 }))];
  const after = applyAction(state, chooseLegal(state));
  assert.ok(after.players.bot.hand.some(entry => entry.iid === 'keep'));
  assert.equal(after.players.bot.inkwell.length, 9);
});

test('quests with multiple characters to win within two decisions', () => {
  const state = fixture();
  state.players.bot.lore = 18;
  state.players.bot.field = [instance('first'), instance('second')];
  const after = applyAction(state, chooseLegal(state));
  const final = applyAction(after, chooseLegal(after));
  assert.equal(final.winner, 'bot');
});

test('deterministic ties do not depend on field array iteration order', () => {
  const state = fixture();
  state.players.bot.field = [instance('a', card({ id: 100 })), instance('z', card({ id: 100 }))];
  const reversed = structuredClone(state);
  reversed.players.bot.field.reverse();
  assert.deepEqual(chooseLegal(state), chooseLegal(reversed));
});

function withKeywords(definition, ...keywords) {
  definition.rules.keywords = keywords.map(keyword => typeof keyword === 'string' ? { keyword, sourceText: keyword } : { sourceText: keyword.keyword, ...keyword });
  return definition;
}

function actionCard(effects, overrides = {}) {
  const definition = card({ type: 'Action', cost: 2, strength: 0, willpower: 0, lore: 0, ...overrides });
  definition.rules.action = effects;
  return definition;
}

test('does not throw away a character in combat that Resist makes unwinnable', () => {
  const state = fixture();
  state.players.bot.field = [instance('small', card({ strength: 3, willpower: 2, lore: 2 }))];
  state.players.player.field = [instance('resistant', withKeywords(card({ strength: 4, willpower: 3, lore: 0 }), { keyword: 'Resist', value: 3 }), { exerted: true })];
  assert.equal(chooseLegal(state).type, 'quest');
});

test('uses Challenger and its own Resist for a favorable lethal-denying combat', () => {
  const state = fixture();
  state.players.player.lore = 18;
  state.players.bot.field = [instance('challenger', withKeywords(card({ strength: 1, willpower: 2 }), { keyword: 'Challenger', value: 3 }, { keyword: 'Resist', value: 3 }))];
  state.players.player.field = [instance('threat', card({ strength: 3, willpower: 4, lore: 2 }), { exerted: true })];
  const after = applyAction(state, chooseLegal(state));
  assert.equal(after.players.player.field.length, 0);
  assert.equal(after.players.bot.field[0].damage, 0);
});

test('uses two decisions to clear Bodyguard before the lethal quester', () => {
  const state = fixture();
  state.players.player.lore = 18;
  state.players.player.field = [instance('guard', withKeywords(card({ strength: 0, willpower: 2, lore: 0 }), 'Bodyguard'), { exerted: true }), instance('threat', card({ strength: 1, willpower: 3, lore: 2 }), { exerted: true })];
  state.players.bot.field = [instance('small', card({ strength: 2, willpower: 4 })), instance('large', card({ strength: 3, willpower: 4 }))];
  const action = chooseLegal(state);
  assert.equal(action.type, 'challenge');
  assert.equal(action.target, 'guard');
  assert.equal(action.iid, 'small', 'Preserve the stronger attacker for the quester');
  const after = applyAction(state, action);
  const final = applyAction(after, chooseLegal(after));
  assert.equal(final.players.player.field.length, 0);
});

test('uses the Evasive attacker for an Evasive threat', () => {
  const state = fixture();
  state.players.player.lore = 18;
  state.players.player.field = [instance('evasive-threat', withKeywords(card({ strength: 1, willpower: 3, lore: 2 }), 'Evasive'), { exerted: true })];
  state.players.bot.field = [instance('ground', card({ strength: 9, willpower: 9 })), instance('air', withKeywords(card({ strength: 3, willpower: 5 }), 'Evasive'))];
  const action = chooseLegal(state);
  assert.equal(action.type, 'challenge');
  assert.equal(action.iid, 'air');
});

test('plays targeted removal and then selects the quester that threatens lethal', () => {
  let state = fixture();
  state.players.player.lore = 18;
  state.players.player.field = [instance('high-body', card({ strength: 9, willpower: 9, lore: 0 })), instance('quester', card({ strength: 1, willpower: 2, lore: 2 }))];
  state.players.bot.hand = [instance('removal', actionCard([{ op: 'banish', target: { kind: 'chosen', owner: 'opponent', filter: { types: ['Character'] } } }]))];
  ink(state, 2);
  const action = chooseLegal(state);
  assert.equal(action.type, 'play');
  state = applyAction(state, action);
  assert.equal(state.pending.kind, 'targets');
  const chosen = chooseLegal(state);
  assert.deepEqual(chosen.optionIds, ['quester']);
});

test('chooses multiple damage targets and respects resistance while selecting', () => {
  let state = fixture();
  state.players.player.lore = 18;
  state.players.player.field = [instance('resistant', withKeywords(card({ willpower: 2, lore: 0 }), { keyword: 'Resist', value: 3 })), instance('a', card({ willpower: 2 })), instance('b', card({ willpower: 2 }))];
  state.players.bot.hand = [instance('blast', actionCard([{ op: 'damage', amount: 2, target: { kind: 'chosen', owner: 'opponent', filter: { types: ['Character'] }, min: 0, max: 2 } }]))];
  ink(state, 2);
  state = applyAction(state, getLegalActions(state, 'bot').find(action => action.type === 'play'));
  assert.deepEqual(chooseLegal(state).optionIds, ['a', 'b']);
});

test('accepts a beneficial optional effect and refuses a harmful one', () => {
  for (const [op, expected] of [['gainLore', ['yes']], ['loseLore', []]]) {
    let state = fixture();
    state.players.bot.lore = 10;
    state.players.bot.hand = [instance('optional', actionCard([{ op, amount: 2, optional: true, target: { kind: 'player', owner: 'you' } }]))];
    ink(state, 2);
    state = applyAction(state, getLegalActions(state, 'bot').find(action => action.type === 'play'));
    assert.deepEqual(chooseLegal(state).optionIds, expected);
  }
});

test('discards an unusable expensive card while preserving its near-term play', () => {
  let state = fixture();
  state.players.bot.hand = [instance('effect', actionCard([{ op: 'discard', amount: 1, target: { kind: 'player', owner: 'you' } }])), instance('keep', card({ cost: 2, lore: 2 })), instance('discard', card({ cost: 9, inkwell: false }))];
  ink(state, 2);
  state = applyAction(state, getLegalActions(state, 'bot').find(action => action.type === 'play' && action.iid === 'effect'));
  assert.deepEqual(chooseLegal(state).optionIds, ['discard']);
});

test('mulligans expensive dead cards, keeps an early curve, and ignores replacement order', () => {
  let state = createGame({ decks: { player: Array.from({ length: 40 }, () => card()), bot: Array.from({ length: 40 }, () => card()) }, seed: 11 });
  if (activeDecisionPlayer(state) === 'player') state = applyAction(state, { type: 'choose', player: 'player', optionIds: [] });
  state.players.bot.hand.forEach((entry, index) => { entry.card = card({ cost: [1, 2, 3, 8, 9, 10, 10][index], inkwell: index < 4 }); });
  // Mulligan option labels are presentation only; keep them consistent with fixtures.
  state.pending.options = state.players.bot.hand.map(entry => ({ id: entry.iid, iid: entry.iid, cardId: entry.card.id, label: entry.card.name }));
  const action = chooseLegal(state);
  assert.deepEqual(action.optionIds, state.players.bot.hand.slice(3).map(entry => entry.iid));
  const reversed = structuredClone(state);
  reversed.players.bot.deck.reverse();
  reversed.rng = 987654;
  assert.deepEqual(chooseLegal(reversed), action);
});

test('denies passive location lore before the next turn starts', () => {
  const state = fixture();
  state.players.player.lore = 19;
  state.players.player.field = [instance('location', card({ type: 'Location', strength: 0, willpower: 3, lore: 1 }))];
  state.players.bot.field = [instance('attacker', card({ strength: 3, willpower: 4 }))];
  const after = applyAction(state, chooseLegal(state));
  assert.equal(after.players.player.field.length, 0);
});

test('diagnostic: crowded board returns a deterministic legal decision within a bounded budget', t => {
  const state = fixture();
  state.players.bot.field = Array.from({ length: 10 }, (_, i) => instance(`bot-${i}`, card({ strength: 3 + i % 3, lore: 1 + i % 2 })));
  state.players.player.field = Array.from({ length: 10 }, (_, i) => instance(`enemy-${i}`, card({ strength: 1 + i % 3, lore: 1 + i % 2 }), { exerted: true }));
  state.players.bot.hand = Array.from({ length: 7 }, (_, i) => instance(`hand-${i}`, card({ cost: i + 1 })));
  ink(state, 6);
  const count = getLegalActions(state, 'bot').length;
  const start = performance.now();
  const action = chooseLegal(state);
  const elapsed = performance.now() - start;
  assert.deepEqual(chooseBotAction(state), action);
  assert.ok(elapsed < 2500, `Decision took ${elapsed.toFixed(1)}ms`);
  t.diagnostic(`${count} legal actions, ${elapsed.toFixed(1)}ms; implementation budget <= 24 root + 6 * 8 child simulations`);
});

test('keeps lethal-denying removal in the beam even when many quest actions look better immediately', () => {
  const state = fixture();
  state.players.player.lore = 18;
  state.players.player.field = [instance('quester', card({ lore: 2 }))];
  state.players.bot.field = Array.from({ length: 9 }, (_, i) => instance(`quest-${i}`));
  state.players.bot.hand = [instance('removal', actionCard([{ op: 'banish', target: { kind: 'chosen', owner: 'opponent', filter: { types: ['Character'] } } }]))];
  ink(state, 2);
  assert.equal(chooseLegal(state).type, 'play');
});

test('ends the turn instead of repeating an activation that changes nothing', () => {
  const state = fixture();
  const item = card({ type: 'Item', strength: 0, willpower: 0, lore: 0 });
  item.rules.activated = [{ cost: {}, effects: [{ op: 'ready', target: { kind: 'self', owner: 'you' } }], sourceText: 'Ready this item.' }];
  state.players.bot.field = [instance('item', item)];
  assert.equal(chooseLegal(state).type, 'endTurn');
});

test('includes visible quest triggers when detecting opponent next-turn lethal', () => {
  const state = fixture();
  state.players.player.lore = 18;
  const enemy = card({ strength: 1, willpower: 3, lore: 1 });
  enemy.rules.triggered = [{ trigger: 'selfQuest', effects: [{ op: 'gainLore', amount: 1, target: { kind: 'player', owner: 'you' } }], sourceText: 'Quest: gain 1 lore.' }];
  state.players.player.field = [instance('threat', enemy, { exerted: true })];
  state.players.bot.field = [instance('defender', card({ strength: 3, willpower: 5, lore: 3 }))];
  assert.equal(chooseLegal(state).type, 'challenge');
});

test('keeps a winning activation in a crowded candidate set', () => {
  const state = fixture();
  state.players.bot.lore = 19;
  const item = card({ type: 'Item', lore: 0, strength: 0, willpower: 0 });
  item.rules.activated = [{ cost: { exert: true }, effects: [{ op: 'gainLore', amount: 1, target: { kind: 'player', owner: 'you' } }], sourceText: 'Gain 1 lore.' }];
  state.players.bot.field = [instance('winning-item', item), ...Array.from({ length: 8 }, (_, i) => instance(`fighter-${i}`, card({ lore: 0 })))];
  state.players.player.field = Array.from({ length: 8 }, (_, i) => instance(`enemy-${i}`, card({ lore: 0 }), { exerted: true }));
  assert.equal(applyAction(state, chooseLegal(state)).winner, 'bot');
});

test('free draw on an empty deck cannot stall an unavoidable loss', () => {
  const state = fixture();
  state.players.bot.deck = [];
  const item = card({ type: 'Item', strength: 0, willpower: 0, lore: 0 });
  item.rules.activated = [{ cost: {}, effects: [{ op: 'draw', amount: 1, target: { kind: 'player', owner: 'you' } }], sourceText: 'Draw a card.' }];
  state.players.bot.field = [instance('empty-draw', item)];
  const action = chooseLegal(state);
  assert.equal(action.type, 'endTurn');
  assert.equal(applyAction(state, action).finishReason, 'emptyDeck');
});

test('zero-cost Boost on an empty deck cannot repeat forever', () => {
  const state = fixture();
  state.players.bot.deck = [];
  state.players.bot.field = [instance('empty-boost', withKeywords(card({ lore: 0 }), { keyword: 'Boost', value: 0 }), { exerted: true })];
  assert.ok(getLegalActions(state, 'bot').some(action => action.type === 'boost'));
  assert.equal(chooseLegal(state).type, 'endTurn');
});

test('a free optional ready prompt cannot stall by opening and declining forever', () => {
  const state = fixture();
  const item = card({ type: 'Item', strength: 0, willpower: 0, lore: 0 });
  item.rules.activated = [{ cost: {}, optional: true, effects: [{ op: 'ready', target: { kind: 'self', owner: 'you' } }], sourceText: 'You may ready this item.' }];
  state.players.bot.field = [instance('optional-ready', item)];
  assert.equal(chooseLegal(state).type, 'endTurn');
});

test('masks facedown Boost stacks even inside queued source snapshots', () => {
  const state = fixture();
  state.players.bot.field = [instance('quester')];
  const hidden = new Proxy({}, { get() { throw new Error('Facedown card read'); }, ownKeys() { throw new Error('Facedown card enumerated'); } });
  const underneath = instance('boosted-card', hidden, { faceDown: true });
  const parent = instance('boost-parent', card(), { stack: [underneath] });
  state.players.player.field = [parent];
  // A source snapshot retains its stack independently of the current field.
  state.bag = [{ id: 'pending-trigger', player: 'player', source: parent, label: 'Public trigger', optional: false, effects: [{ op: 'gainLore', amount: 1, target: { kind: 'player', owner: 'you' } }] }];
  assert.equal(chooseBotAction(state).player, 'bot');
});

test('draw scoring remains independent of the actual top cards of both decks', () => {
  const state = fixture();
  state.players.bot.hand = [instance('draw', actionCard([{ op: 'draw', amount: 2, target: { kind: 'player', owner: 'you' } }], { cost: 1 })), instance('body', card({ cost: 2 }))];
  ink(state, 2);
  const other = structuredClone(state);
  other.players.bot.deck.forEach(entry => { entry.card = card({ cost: 0, strength: 99, willpower: 99, lore: 99 }); });
  other.players.player.deck.reverse();
  other.rng = 999;
  assert.deepEqual(chooseLegal(state), chooseLegal(other));
});

test('two ink cannot pay for a three-cost uninkable card', () => {
  const state = fixture();
  ink(state, 2);
  state.players.bot.hand = [instance('unaffordable', card({ cost: 3, inkwell: false }))];
  const action = chooseLegal(state);
  assert.equal(action.type, 'endTurn');
  assert.throws(() => applyAction(state, { type: 'play', player: 'bot', iid: 'unaffordable' }), /illegal|ink|inválida/i);
});

test('hypothetical bounce cannot expose a facedown card identity or read its getter', () => {
  const state = fixture();
  state.players.player.lore = 18;
  const hidden = instance('hidden-underneath', card(), { faceDown: true });
  Object.defineProperty(hidden, 'card', { enumerable: true, get() { throw new Error('Hidden Boost getter read'); } });
  const stacked = instance('stacked-threat', card({ lore: 2 }), { stack: [instance('faceup-base', card(), { stack: [hidden] })] });
  state.players.player.field = [stacked];
  state.players.bot.hand = [instance('bounce', actionCard([{ op: 'returnHand', target: { kind: 'chosen', owner: 'opponent', filter: { types: ['Character'] } } }]))];
  ink(state, 2);
  // The second simulated decision bounces and flattens the recursively masked stack.
  assert.equal(chooseBotAction(state).type, 'play');
});

// Opt in to a SELECT-only integration audit with:
// node packages/game-core/tests/bot.test.mjs --catalog
// No credentials/config files, saved decks, accounts, or private records are read.
if (process.argv.includes('--catalog')) {
  test('catalog diagnostic: twelve complete bot-v-bot games conserve cards and never stall', t => {
    const ids = TRAINING_DECKS.map(deck => [...deck.cardIds]);
    assert.equal(ids.length, 2);
    assert.ok(ids.every(list => list.length === 15 && list.every(id => Number.isSafeInteger(id) && id > 0)));
    const sql = `SELECT JSON_OBJECT('id',source_id,'name',name_en,'fullName',full_name_en,'type',type_en,'cost',cost,'inkwell',inkwell,'strength',strength,'willpower',willpower,'lore',lore,'moveCost',move_cost,'subtypes',JSON_EXTRACT(subtypes_en_json,'$'),'image',image_full_url,'text',full_text_en,'original',JSON_OBJECT('name',name_en,'type',type_en,'full_text',full_text_en,'abilities',JSON_EXTRACT(abilities_en_json,'$'),'effects',JSON_EXTRACT(effects_en_json,'$'))) FROM lorcana_cards WHERE active=1 AND source_id IN (${ids.flat().join(',')}) ORDER BY source_id`;
    const output = execFileSync('C:/xampp/mysql/bin/mysql.exe', ['--no-defaults', '--user=root', '--host=127.0.0.1', '--database=jogartcg_db', '--default-character-set=utf8mb4', '--batch', '--skip-column-names', '--raw', '--execute', sql], { encoding: 'utf8', maxBuffer: 4_000_000 });
    const definitions = new Map(output.trim().split('\n').filter(Boolean).map(line => {
      const raw = JSON.parse(line);
      const rules = compileCardRules(raw);
      assert.equal(rules.supported, true, `${raw.id}: ${rules.unsupported.join('; ')}`);
      return [raw.id, { ...raw, cost: raw.cost ?? 0, strength: raw.strength ?? 0, willpower: raw.willpower ?? 0, lore: raw.lore ?? 0, moveCost: raw.moveCost ?? 0, inkwell: Boolean(raw.inkwell), subtypes: raw.subtypes ?? [], image: raw.image ?? '', text: raw.text ?? '', rules }];
    }));
    assert.equal(definitions.size, 30, 'All thirty public catalog definitions must be present');
    const decks = ids.map(list => list.flatMap(id => Array.from({ length: 4 }, () => definitions.get(id))));
    const timings = [];
    let totalDecisions = 0;
    const firstPlayers = new Set();
    const swap = value => value === 'bot' ? 'player' : value === 'player' ? 'bot' : value;
    const flatten = entry => [entry.iid, ...entry.stack.flatMap(flatten)];
    for (let seed = 1; seed <= 12; seed++) {
      let state = createGame({ decks: { player: decks[seed % 2], bot: decks[1 - seed % 2] }, seed });
      firstPlayers.add(state.firstPlayer);
      const originalCards = Object.values(state.players).flatMap(player => [...player.deck, ...player.hand]).map(entry => ({ iid: entry.iid, name: entry.card.fullName, id: entry.card.id }));
      const visited = new Set();
      let decisions = 0;
      while (state.phase !== 'finished' && decisions < 600) {
        const snapshot = JSON.stringify({ ...state, log: [], nextId: 0, rng: 0, pending: state.pending && { ...state.pending, id: '' } });
        assert.ok(!visited.has(snapshot), `Stalled game seed ${seed}, turn ${state.turn}, decision ${decisions}`);
        visited.add(snapshot);
        const actor = activeDecisionPlayer(state);
        let perspective = state;
        if (actor === 'player') {
          perspective = JSON.parse(JSON.stringify(state, (_key, value) => swap(value)));
          perspective.players = { bot: perspective.players.player, player: perspective.players.bot };
        }
        const start = performance.now();
        let action = chooseBotAction(perspective);
        timings.push(performance.now() - start);
        if (actor === 'player') action = JSON.parse(JSON.stringify(action, (_key, value) => swap(value)));
        const legal = getLegalActions(state, actor);
        const canonical = ({ label: _label, ...details }) => JSON.stringify(details);
        assert.ok(legal.some(candidate => canonical(candidate) === canonical(action)), `Illegal action at seed ${seed}: ${JSON.stringify(action)}`);
        state = applyAction(state, action);
        const cards = Object.values(state.players).flatMap(player => ['deck', 'hand', 'field', 'inkwell', 'discard'].flatMap(zone => player[zone].flatMap(flatten)));
        if (state.resolvingAction) cards.push(...flatten(state.resolvingAction.card));
        assert.equal(cards.length, 120, `Card conservation seed=${seed} turn=${state.turn} decision=${decisions} action=${JSON.stringify(action)} missing=${JSON.stringify(originalCards.filter(entry => !cards.includes(entry.iid)))}`);
        assert.equal(new Set(cards).size, 120, `Duplicate instances, seed ${seed}`);
        for (const player of Object.values(state.players)) assert.ok(player.lore >= 0 && Number.isFinite(player.lore));
        decisions++;
      }
      assert.equal(state.phase, 'finished', `Unfinished game seed ${seed} after ${decisions} decisions`);
      totalDecisions += decisions;
      t.diagnostic(`seed=${seed} first=${state.firstPlayer} decisions=${decisions} turns=${state.turn} winner=${state.winner} reason=${state.finishReason}`);
    }
    timings.sort((a, b) => a - b);
    assert.deepEqual([...firstPlayers].sort(), ['bot', 'player'], 'Exercise both human-first and bot-first games');
    t.diagnostic(`CATALOG_BOT_AUDIT games=12 decisions=${totalDecisions} cards=30 deckSize=60 p50=${timings[Math.floor(timings.length * .5)].toFixed(1)}ms p95=${timings[Math.floor(timings.length * .95)].toFixed(1)}ms max=${timings.at(-1).toFixed(1)}ms; local Node timings, not device measurements`);
  });
}
