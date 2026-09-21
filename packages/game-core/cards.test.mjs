/** Run: node --test packages/game-core/cards.test.mjs (Node >= 22.18).
 * Optional read-only local catalog audit: node packages/game-core/cards.test.mjs --catalog
 * Add --unsupported to include every unsupported printed ID and exact source strings.
 * Audit reads only card rules/metadata and deck IDs/card IDs/quantities. No accounts/config.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { compileCardRules } from './src/cards.ts';

function source({ id = 1, name = 'Example', type = 'Character', abilities = [], effects = [], text } = {}) {
  return { id, original: { name, type, full_text: text ?? [...abilities.map(a => a.fullText), ...effects].join('\n'), abilities, effects } };
}
function ability(type, effect, extra = {}) {
  const a = { type, name: 'TEST', effect, ...extra };
  return { ...a, fullText: `${a.name ? `${a.name} ` : ''}${type === 'activated' ? `${a.costsText} — ` : ''}${effect}` };
}
function keyword(name, value, reminder) {
  const head = `${name}${value === undefined ? '' : ` ${value}`}`;
  return { type: 'keyword', keyword: name, fullText: reminder ? `${head} (${reminder})` : head,
    ...(value === undefined ? {} : { keywordValue: String(value), keywordValueNumber: Number(value) }), ...(reminder ? { reminderText: reminder } : {}) };
}
function action(text) { return compileCardRules(source({ type: 'Action', effects: [text] })); }
function onlyEffect(text) { const r = action(text); assert.equal(r.supported, true, JSON.stringify(r.unsupported)); assert.equal(r.action.length, 1); return r.action[0]; }
function freeze(value) { if (value && typeof value === 'object') { Object.freeze(value); for (const v of Object.values(value)) freeze(v); } return value; }

test('only verified empty EN rules are vanilla', () => {
  assert.equal(compileCardRules(source()).supported, true);
  assert.equal(compileCardRules(source({ abilities: [], effects: [], text: 'Unparsed arbitrary ability.' })).supported, false);
  const missing = source(); missing.original.full_text = null;
  assert.equal(compileCardRules(missing).supported, false);
  const nullArrays = source(); nullArrays.original.abilities = null; nullArrays.original.effects = null;
  assert.equal(compileCardRules(nullArrays).supported, true);
});

test('all fourteen official keywords; numeric values and same-name Shift retained', () => {
  for (const name of ['Alert', 'Bodyguard', 'Evasive', 'Reckless', 'Rush', 'Support', 'Vanish', 'Ward']) {
    const r = compileCardRules(source({ abilities: [keyword(name)] }));
    assert.equal(r.supported, true, name); assert.equal(r.keywords[0].keyword, name);
  }
  for (const [name, value] of [['Boost', 2], ['Challenger', '+3'], ['Resist', '+1'], ['Singer', 5], ['Shift', 4], ['Sing Together', 7]]) {
    const r = compileCardRules(source({ type: name === 'Sing Together' ? 'Action' : 'Character', abilities: [keyword(name, value)] }));
    assert.equal(r.supported, true, name); assert.equal(r.keywords[0].value, Number(value));
    if (name === 'Shift') assert.equal(r.keywords[0].shiftName, 'Example');
  }
});

test('keyword records fail closed for variants, missing/conflicting values, costs and unknown suffixes', () => {
  const invalid = [keyword('Flight'), keyword('Universal Shift', 4), keyword('Puppy Shift', 3), keyword('Duo Shift', 0),
    keyword('Shift'), keyword('Resist', 2), keyword('Rush', 2), { ...keyword('Singer', 5), keywordValueNumber: 6 },
    keyword('Shift', 4, 'You may discard a card to play this on top of one of your characters named Example.'),
    { ...keyword('Rush'), fullText: 'Rush. Draw a card.' },
    keyword('Rush', undefined, 'Draw a card.'), { ...keyword('Rush'), effect: 'Draw a card.' }];
  for (const a of invalid) {
    const r = compileCardRules(source({ abilities: [a] }));
    assert.equal(r.supported, false, JSON.stringify(a)); assert.deepEqual(r.keywords, []);
  }
});

test('ID-independent EN compilation; presentation and input immutability', () => {
  const c = source({ id: 197, type: 'Action', effects: ['Deal 2 damage to chosen character.'] });
  c.pt_br = { effects: ['Banir todos os personagens.'] };
  c.name = 'Traduzido'; const before = JSON.stringify(c); freeze(c);
  const a = compileCardRules(c); const b = compileCardRules(c);
  assert.deepEqual(a, b); assert.equal(JSON.stringify(c), before);
  assert.equal(a.action[0].op, 'damage');
  const alternateId = compileCardRules({ ...c, id: 987654 });
  assert.deepEqual({ ...alternateId, sourceId: 197 }, a);
});

test('exact source text accounting catches orphan clauses and structured/fullText disagreement', () => {
  const a = ability('triggered', 'When you play this character, draw a card.');
  for (const card of [source({ abilities: [a], text: `${a.fullText}\nGain 9 lore.` }),
    source({ abilities: [{ ...a, fullText: `${a.fullText} Gain 9 lore.` }] }),
    source({ abilities: [{ ...a, effect: 'When you play this character, gain 9 lore.' }] })]) {
    assert.equal(compileCardRules(card).supported, false);
  }
  const formatted = source({ abilities: [{ ...a, fullText: a.fullText.replace('draw a', 'draw\na') }] });
  assert.equal(compileCardRules(formatted).supported, true);
});

test('record compilation is atomic, including unknown tails, dependencies and random choices', () => {
  for (const text of ['Draw a card. Do something unrecognized.', 'Draw a card. If you do, gain 1 lore.',
    'Draw a card or gain 1 lore.', 'Banish chosen item of yours to draw a card.',
    'Draw 2 cards. Then, discard a card at random.', 'You may draw a card, then choose and discard a card.',
    'Draw a card. (Gain 9 lore.)', 'Put 1 damage counter on chosen character.',
    'Move 1 damage from this character to chosen character.',
    'Ready chosen character. They cannot quest this turn.']) {
    const r = action(text); assert.equal(r.supported, false, text); assert.deepEqual(r.action, [], text);
  }
  const partial = compileCardRules(source({ abilities: [keyword('Rush'), ability('static', 'Unrecognized ability.')] }));
  assert.equal(partial.supported, false); assert.equal(partial.keywords.length, 1);
  assert.equal(partial.unsupported.length, 1); // Diagnostics may retain OTHER fully understood records.
});

test('basic effects and independent sequences cover actual action wording', () => {
  assert.equal(onlyEffect('Draw 2 cards.').amount, 2);
  assert.equal(onlyEffect('Gain 2 lore.').op, 'gainLore');
  assert.equal(onlyEffect('Each opponent loses 1 lore.').target.owner, 'eachOpponent');
  assert.equal(onlyEffect('Each player draws 3 cards.').target.owner, 'any');
  assert.deepEqual(onlyEffect('Chosen player draws 5 cards.').target, { kind: 'chosen', owner: 'any' });
  const r = action('Draw 2 cards, then choose and discard a card.');
  assert.equal(r.supported, true); assert.deepEqual(r.action.map(e => e.op), ['draw', 'discard']);
  assert.deepEqual(action('Deal 2 damage to chosen character. Draw a card.').action.map(e => e.op), ['damage', 'draw']);
  assert.deepEqual(action('Draw a card and gain 1 lore.').action.map(e => e.op), ['draw', 'gainLore']);
});

test('target filters preserve owner, zone, type unions, subtype, damage, cost and strength limits', () => {
  assert.deepEqual(onlyEffect('Deal 2 damage to chosen damaged character.').target,
    { kind: 'chosen', owner: 'any', zone: 'play', filter: { damaged: true, types: ['Character'] }, min: 1, max: 1 });
  assert.deepEqual(onlyEffect('Deal 5 damage to chosen character or location.').target.filter.types, ['Character', 'Location']);
  assert.equal(onlyEffect('Exert chosen opposing character.').target.owner, 'opponent');
  assert.equal(onlyEffect('Banish chosen character with 2 ¤ or less.').target.filter.strengthAtMost, 2);
  assert.equal(onlyEffect("Return chosen character or item with cost 2 or less to their player's hand.").target.filter.costAtMost, 2);
  assert.deepEqual(onlyEffect('Remove up to 3 damage from chosen Princess character.').target.filter.subtypes, ['Princess']);
  assert.equal(onlyEffect('Remove up to 1 damage from another chosen character.').target.filter.excludeSelf, true);
  assert.equal(onlyEffect('Ready chosen character of yours.').target.owner, 'you');
  assert.equal(onlyEffect("Return all opposing exerted characters to their players' hands.").target.filter.exerted, true);
});

test('unknown qualifiers are never silently dropped', () => {
  for (const text of ['Banish chosen character with 5 ¤ or more.', 'Banish chosen character with Evasive.',
    'Banish chosen character who was challenged this turn.', 'Banish chosen Ruby character.',
    'Banish chosen character here.', 'Return chosen opposing character to your hand.',
    'Chosen character gets +1 ¤ this turn for each item you have in play.']) {
    const r = action(text); assert.equal(r.supported, false, text); assert.deepEqual(r.action, []);
  }
});

test('multi-target damage is per target; up-to target count differs from up-to heal amount', () => {
  const damage = onlyEffect('Deal 3 damage to up to 3 chosen characters and/or locations.');
  assert.equal(damage.amount, 3); assert.equal(damage.target.min, 0); assert.equal(damage.target.max, 3);
  assert.deepEqual(damage.target.filter.types, ['Character', 'Location']); assert.equal(damage.upTo, undefined);
  const heal = onlyEffect('Remove up to 3 damage from each of your characters.');
  assert.equal(heal.upTo, true); assert.equal(heal.target.kind, 'all'); assert.equal(heal.target.owner, 'you');
  const split = onlyEffect('Remove 1 damage each from up to 2 chosen characters.');
  assert.equal(split.target.max, 2); assert.equal(split.upTo, undefined);
});

test('optional effects retain sentence scope and printed order', () => {
  const r = action('You may banish chosen item. Draw a card.');
  assert.equal(r.supported, true); assert.equal(r.action[0].optional, true); assert.equal(r.action[1].optional, undefined);
  assert.equal(r.action[0].target.min, 1);
  assert.equal(action('Each player may draw a card.').supported, false); // chooser-specific optionality not encoded
});

test('recover/discard choose in the correct zone; discard remains affected-player choice', () => {
  const r = onlyEffect('Return an action card from your discard to your hand.');
  assert.equal(r.op, 'recover'); assert.equal(r.target.zone, 'discard'); assert.equal(r.target.owner, 'you');
  assert.deepEqual(r.target.filter.types, ['Action']);
  const multi = onlyEffect('Return up to 2 item cards from your discard into your hand.');
  assert.equal(multi.target.min, 0); assert.equal(multi.target.max, 2);
  assert.deepEqual(onlyEffect('Each opponent chooses and discards 2 cards.'), { op: 'discard', amount: 2, target: { kind: 'player', owner: 'eachOpponent' } });
});

test('temporary stats and ramp preserve exact durations and entry state', () => {
  for (const [suffix, duration] of [['this turn', 'thisTurn'], ['until the start of your next turn', 'untilStartOfYourNextTurn'], ['until the end of your next turn', 'untilEndOfYourNextTurn']]) {
    const e = onlyEffect(`Chosen character gets -2 ¤ ${suffix}.`);
    assert.equal(e.op, 'buff'); assert.equal(e.amount, -2); assert.equal(e.stat, 'strength'); assert.equal(e.duration, duration);
  }
  assert.equal(onlyEffect('Put the top card of your deck into your inkwell facedown and exerted.').entersExerted, true);
  assert.equal(onlyEffect('Put the top card of your deck into your inkwell facedown.').entersExerted, false);
});

test('self triggers, explicit turn scopes and resolution-time conditions', () => {
  for (const [text, trigger, turn] of [
    ['When you play this character, draw a card.', 'play'],
    ['Whenever this character quests, draw a card.', 'selfQuest'],
    ['When this character is banished, gain 2 lore.', 'selfBanished'],
    ['Whenever this character challenges, gain 1 lore.', 'challenge'],
    ['At the start of your turn, draw a card.', 'start', 'yours'],
    ["At the end of each opponent's turn, draw a card.", 'end', 'opponents'],
    ['At the end of each turn, draw a card.', 'end', 'any'],
  ]) {
    const r = compileCardRules(source({ abilities: [ability('triggered', text)] }));
    assert.equal(r.supported, true, text); assert.equal(r.triggered[0].trigger, trigger); assert.equal(r.triggered[0].turn, turn);
  }
  const a = ability('triggered', 'When you play this character, if you have 2 or more other characters in play, you may draw 2 cards.');
  const r = compileCardRules(source({ abilities: [a] }));
  assert.equal(r.supported, true); assert.deepEqual(r.triggered[0].condition,
    { kind: 'youHave', filter: { excludeSelf: true, types: ['Character'] }, countAtLeast: 2 });
  assert.equal(r.triggered[0].effects[0].optional, true);
  for (const effect of ['Whenever this character is challenged, draw a card.', 'Whenever you play a song, draw a card.',
    'When this character is banished in a challenge, draw a card.',
    'When you play this character, if you have an item in play, draw a card. Gain 1 lore.']) {
    assert.equal(compileCardRules(source({ abilities: [ability('triggered', effect)] })).supported, false, effect);
  }
});

test('activations validate the entire cost and never assume extra costs are free', () => {
  const r = compileCardRules(source({ type: 'Item', abilities: [ability('activated', 'Draw a card.', { costs: ['⟳', '4 ⬡', 'Banish this item'], costsText: '⟳, 4 ⬡, Banish this item' })] }));
  assert.equal(r.supported, true); assert.deepEqual(r.activated[0].cost, { exert: true, ink: 4, banish: true });
  for (const costs of [['⟳', 'Discard a card'], ['Banish one of your items'], ['⟳', '⟳'], ['1 ⬡', '2 ⬡'], ['Banish this character'], []]) {
    const a = ability('activated', 'Draw a card.', { costs, costsText: costs.join(', ') });
    const r = compileCardRules(source({ type: 'Item', abilities: [a] }));
    assert.equal(r.supported, false, String(costs)); assert.deepEqual(r.activated, []);
  }
});

test('static buffs, scaling, keyword grants, restrictions and payment reductions', () => {
  const compile = text => { const r = compileCardRules(source({ abilities: [ability('static', text)] })); assert.equal(r.supported, true, text); return r.static; };
  const scaling = compile('This character gets +1 ◊ for each other Villain character you have in play.')[0];
  assert.equal(scaling.stat, 'lore'); assert.deepEqual(scaling.per.filter, { excludeSelf: true, types: ['Character'], subtypes: ['Villain'] });
  assert.deepEqual(compile('Your Princess characters get +1 ¤ and +1 ⛉.').map(r => r.stat), ['strength', 'willpower']);
  assert.equal(compile('Your characters named Jetsam gain Rush.')[0].target.filter.name, 'Jetsam');
  assert.equal(compile("This character can't ⟳ to sing songs.")[0].restriction, 'cantSing');
  const reduction = compile('If you have a character named Gaston in play, you pay 1 ⬡ less to play this character.')[0];
  assert.equal(reduction.kind, 'costReduction'); assert.equal(reduction.target.kind, 'self');
  assert.equal(reduction.condition.filter.name, 'Gaston');
  assert.deepEqual(compile('You pay 1 ⬡ less to play Broom characters.')[0].target.filter.subtypes, ['Broom']);
  assert.deepEqual(compile('While this character has damage, he gets +3 ¤.')[0].condition, { kind: 'selfDamaged' });
});

test('static keyword reminder expansions consume every word and preserve compound grants', () => {
  const parse = effect => compileCardRules(source({ abilities: [ability('static', effect)] }));
  const r = parse("Your other characters gain Ward. (Opponents can't choose them except to challenge.)");
  assert.equal(r.supported, true); assert.equal(r.static[0].keyword, 'Ward'); assert.equal(r.static[0].target.filter.excludeSelf, true);
  const two = parse("While you have an item in play, this character gains Resist +1 and Ward. (Damage dealt to this character is reduced by 1. Opponents can't choose this character except to challenge.)");
  assert.equal(two.supported, true); assert.deepEqual(two.static.map(r => r.keyword), ['Resist', 'Ward']);
  assert.ok(two.static.every(r => r.condition.kind === 'youHave'));
  for (const effect of ["Your other characters gain Ward. (Draw a card.)", "Your other characters gain Ward. (Opponents can't choose them except to challenge. Draw a card.)",
    "Your other Emerald characters gain Ward. (Opponents can't choose them except to challenge.)", "Your characters gain Ward and Unrecognized.",
    "Your characters get +1 ¤. (Ignore damage.)", "During your turn, your characters gain Evasive. (They can challenge characters with Evasive.)"]) {
    const rejected = parse(effect); assert.equal(rejected.supported, false, effect); assert.deepEqual(rejected.static, []);
  }
  const recovery = onlyEffect('Return another item card from your discard to your hand.');
  assert.equal(recovery.target.filter.excludeSelf, true); assert.equal(recovery.target.max, 1);
});

test('standard song reminder is validated as intrinsic, not miscompiled as an aura', () => {
  const effect = 'A character with cost 3 or more can ⟳ to sing this song for free.';
  const reminder = { type: 'static', effect, fullText: `(${effect})` };
  const r = compileCardRules(source({ type: 'Action', abilities: [reminder], effects: ['Draw 2 cards.'] }));
  assert.equal(r.supported, true); assert.deepEqual(r.static, []); assert.equal(r.action[0].amount, 2);
  assert.equal(compileCardRules(source({ abilities: [reminder] })).supported, false);
  assert.equal(compileCardRules(source({ type: 'Action', abilities: [{ ...reminder, effect: effect + ' Gain 9 lore.', fullText: `(${effect} Gain 9 lore.)` }] })).supported, false);
});

test('malformed payloads are rejected, not treated as empty rules', () => {
  for (const value of [null, 0, {}, [], { type: 'unknown', fullText: 'Draw a card.' }]) {
    assert.equal(compileCardRules(source({ abilities: [value], text: '' })).supported, false);
  }
  for (const field of ['abilities', 'effects']) { const c = source(); c.original[field] = '[]'; assert.equal(compileCardRules(c).supported, false); }
  for (const id of [0, NaN, Infinity, 1.5]) assert.equal(compileCardRules(source({ id })).supported, false);
});

test('only exact verified deck-copy clauses are intrinsic, other abilities still compile or reject', () => {
  const puppy = ability('static', 'You may have up to 99 copies of Dalmatian Puppy - Tail Wagger in your deck.');
  const c = source({ id: 436, name: 'Dalmatian Puppy', abilities: [puppy] });
  const r = compileCardRules(c); assert.equal(r.supported, true); assert.deepEqual(r.static, []);
  assert.equal(compileCardRules({ ...c, id: 1702 }).supported, true);
  for (const effect of [puppy.effect.replace('99', '100'), puppy.effect.replace('Tail Wagger', 'Other Version'), puppy.effect + ' Draw a card.']) {
    assert.equal(compileCardRules(source({ name: 'Dalmatian Puppy', abilities: [ability('static', effect)] })).supported, false);
  }
  assert.equal(compileCardRules(source({ name: 'Different Card', abilities: [puppy] })).supported, false);
  const slipper = ability('static', 'You may only have 2 copies of The Glass Slipper in your deck.');
  assert.equal(compileCardRules(source({ type: 'Item', name: 'The Glass Slipper', abilities: [slipper] })).supported, true);
  assert.equal(compileCardRules(source({ type: 'Item', name: 'The Glass Slipper', abilities: [slipper, ability('activated', 'Search your deck for a card.', { costs: ['Banish this item'], costsText: 'Banish this item' })] })).supported, false);
});

test('names cannot swallow appended sentences in selectors or static costs', () => {
  assert.equal(compileCardRules(source({ abilities: [ability('static', 'You pay 1 ⬡ less to play characters named Bruno Madrigal. Unknown following instruction.')] })).supported, false);
  assert.equal(action("Banish chosen character named Dr. Facilier with Evasive.").supported, false);
});

if (process.argv.includes('--catalog')) {
  // --no-defaults avoids reading credentials/options files. Fixed local SELECT-only queries.
  const query = sql => execFileSync('C:/xampp/mysql/bin/mysql.exe', ['--no-defaults', '--user=root', '--host=127.0.0.1', '--database=jogartcg_db', '--default-character-set=utf8mb4', '--batch', '--skip-column-names', '--raw', '--execute', sql], { encoding: 'utf8', maxBuffer: 24_000_000 }).trim().split('\n').filter(Boolean).map(JSON.parse);
  const rows = query("SELECT JSON_OBJECT('id',source_id,'fullName',full_name_en,'color',color_en,'colors',JSON_EXTRACT(colors_json,'$'),'set',set_code,'cost',cost,'inkwell',inkwell,'original',JSON_OBJECT('name',name_en,'type',type_en,'full_text',full_text_en,'abilities',JSON_EXTRACT(abilities_en_json,'$'),'effects',JSON_EXTRACT(effects_en_json,'$'))) FROM lorcana_cards WHERE active=1 ORDER BY source_id");
  for (const c of rows) c.colors = Array.isArray(c.colors) ? c.colors : c.color.split('-');
  const compiled = new Map(rows.map(card => [card.id, compileCardRules(card)]));
  const byType = {}, byRecord = {}, unsupported = new Map(), supportedNames = new Set();
  let complete = 0, vanilla = 0;
  for (const c of rows) {
    const r = compiled.get(c.id), original = c.original;
    const entry = byType[original.type] ??= { total: 0, supported: 0 };
    entry.total++;
    if (r.supported) { complete++; entry.supported++; supportedNames.add(c.fullName); if (!original.full_text) vanilla++; }
    for (const raw of [...original.abilities ?? [], ...original.effects ?? []]) {
      const type = typeof raw === 'string' ? 'action' : raw.type;
      const record = typeof raw === 'string' ? source({ ...c, name: original.name, type: 'Action', effects: [raw] }) : source({ ...c, name: original.name, type: original.type, abilities: [raw] });
      const stat = byRecord[type] ??= { total: 0, supported: 0 };
      stat.total++; stat.supported += Number(compileCardRules(record).supported);
    }
    for (const text of r.unsupported) {
      const normalized = text.replace(/\s+/g, ' ');
      const info = unsupported.get(normalized) ?? { count: 0, ids: [] };
      info.count++; info.ids.push(c.id); unsupported.set(normalized, info);
    }
  }
  const deckRows = query("SELECT JSON_OBJECT('deckId',deck_id,'cardId',card_source_id,'quantity',quantidade) FROM deck_cards ORDER BY deck_id,card_source_id");
  const decks = new Map();
  for (const row of deckRows) {
    const d = decks.get(row.deckId) ?? { id: row.deckId, total: 0, supportedCopies: 0, supportedIds: [], unsupportedIds: [] };
    d.total += row.quantity;
    if (compiled.get(row.cardId)?.supported) { d.supportedCopies += row.quantity; d.supportedIds.push(row.cardId); } else d.unsupportedIds.push(row.cardId);
    decks.set(row.deckId, d);
  }
  console.log('CATALOG_COVERAGE', JSON.stringify({
    sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), total: rows.length, distinctNames: new Set(rows.map(c => c.fullName)).size,
    supported: complete, supportedDistinctNames: supportedNames.size, vanilla, byType, byRecord,
    ...(process.argv.includes('--unsupported') ? { unsupportedCards: rows.filter(c => !compiled.get(c.id).supported).map(c => ({ id: c.id, unsupported: compiled.get(c.id).unsupported })) } : {}),
    unsupportedExamples: [...unsupported].sort((a,b) => b[1].count - a[1].count || a[0].localeCompare(b[0])).slice(0,15).map(([text, stats]) => ({ text, ...stats })),
    decks: [...decks.values()],
    suggestedSupportedIds: Object.fromEntries(['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'].map(color => [color, rows.filter(c => compiled.get(c.id).supported && c.colors.length === 1 && c.colors[0] === color && c.id <= 204).map(c => ({ id: c.id, cost: c.cost, inkwell: c.inkwell, type: c.original.type }))])),
  }, null, 2));
  test('every active catalog card is deterministic, immutable and accounts for unknown rules', () => {
    for (const c of rows) {
      const before = JSON.stringify(c); freeze(c);
      const r = compiled.get(c.id);
      assert.deepEqual(compileCardRules(c), r, `card ${c.id}`);
      assert.equal(r.supported, r.unsupported.length === 0, `card ${c.id}`);
      assert.equal(JSON.stringify(c), before);
      const injected = structuredClone(c);
      injected.original.full_text += '\nAn unknown rule cannot be ignored.';
      assert.equal(compileCardRules(injected).supported, false, `orphan ${c.id}`);
    }
  });
  test('every supported catalog non-keyword record rejects an injected unknown clause atomically', () => {
    for (const c of rows) {
      for (const raw of c.original.abilities ?? []) {
        if (raw.type === 'keyword') continue;
        const isolated = source({ id: c.id, name: c.original.name, type: c.original.type, abilities: [raw] });
        if (!compileCardRules(isolated).supported) continue;
        const mutated = { ...raw, effect: raw.effect + ' Unknown following instruction.', fullText: raw.fullText + ' Unknown following instruction.' };
        const r = compileCardRules(source({ id: c.id, name: c.original.name, type: c.original.type, abilities: [mutated] }));
        assert.equal(r.supported, false, `ability ${c.id}`);
        assert.equal(r.static.length + r.triggered.length + r.activated.length, 0, `partial ability ${c.id}`);
      }
      for (const raw of c.original.effects ?? []) {
        if (!action(raw).supported) continue;
        const r = action(raw + ' Unknown following instruction.');
        assert.equal(r.supported, false, `action ${c.id}`); assert.deepEqual(r.action, [], `partial action ${c.id}`);
      }
    }
  });
}
