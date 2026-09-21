import test from 'node:test';
import assert from 'node:assert/strict';
import { applySeatAction, createSeatedGame, matchSummary, viewForSeat } from '../dist/multiplayer.js';
import { activeDecisionPlayer } from '../dist/engine.js';

function vanilla(id, name) {
  return {
    id, name, full_name: `${name} - Teste`, cost: 1, inkwell: true, strength: 1, willpower: 2, lore: 1, move_cost: null,
    image: { full: `img-${id}.png`, thumbnail: null },
    original: { name, full_name: `${name} - Teste`, type: 'Character', full_text: '', abilities: [], effects: [], subtypes: [] },
    pt_br: { full_text: '' },
  };
}
const deck = (offset) => Array.from({ length: 15 }, (_, index) => ({ quantity: 4, card: vanilla(offset + index, `Carta ${offset + index}`) }));
const start = (seed = 7) => createSeatedGame({ 1: deck(100), 2: deck(200) }, seed);
const seatOf = (player) => (player === 'player' ? 1 : 2);

/** Both players keep their opening hands. */
function pastMulligan(state) {
  while (state.phase === 'mulligan') {
    state = applySeatAction(state, seatOf(activeDecisionPlayer(state)), { type: 'choose', optionIds: [] });
  }
  return state;
}

test('a vista de cada assento nunca expõe semente, deck ou mão do adversário', () => {
  const state = start();
  for (const seat of [1, 2]) {
    const view = viewForSeat(state, seat, { opponent: 'Rival' });
    const text = JSON.stringify(view);
    assert.equal(view.state.rng, 0);
    assert.equal(view.state.players.bot.hand.length, 7);
    assert.ok(view.state.players.bot.hand.every((card) => card.faceDown && card.card.id === 0));
    assert.ok(view.state.players.player.deck.every((card) => card.faceDown && card.card.id === 0));
    assert.ok(view.state.players.player.hand.every((card) => card.card.id > 0));
    // No real instance id of a hidden card may leak.
    const opponent = seat === 1 ? 'bot' : 'player';
    for (const card of [...state.players[opponent].hand, ...state.players.player.deck, ...state.players.bot.deck]) {
      assert.ok(!text.includes(`"${card.iid}"`), `iid oculto vazou: ${card.iid}`);
    }
  }
});

test('o assento 2 enxerga a si mesmo como "player"', () => {
  const state = start();
  const two = viewForSeat(state, 2, { opponent: 'Rival' });
  assert.deepEqual(two.state.players.player.hand.map((c) => c.iid), state.players.bot.hand.map((c) => c.iid));
  assert.equal(two.state.activePlayer, state.activePlayer === 'bot' ? 'player' : 'bot');
});

test('escolha pendente do adversário aparece sem as opções', () => {
  const state = start();
  const deciding = seatOf(activeDecisionPlayer(state));
  const waiting = deciding === 1 ? 2 : 1;
  assert.ok(viewForSeat(state, deciding, { opponent: 'Rival' }).state.pending.options.length > 0);
  const view = viewForSeat(state, waiting, { opponent: 'Rival' });
  assert.equal(view.state.pending.player, 'bot');
  assert.equal(view.state.pending.options.length, 0);
  assert.deepEqual(view.legal.map((a) => a.type), ['concede']);
});

test('ação fora da vez e jogador forjado são recusados', () => {
  const state = pastMulligan(start());
  const active = seatOf(state.activePlayer);
  const idle = active === 1 ? 2 : 1;
  const card = state.players[idle === 1 ? 'player' : 'bot'].hand[0];
  assert.throws(() => applySeatAction(state, idle, { type: 'ink', iid: card.iid }));
  // Forging "player" does not help: the seat always comes from the server.
  assert.throws(() => applySeatAction(state, idle, { type: 'ink', iid: card.iid, player: state.activePlayer }));
  assert.throws(() => applySeatAction(state, active, { type: 'hack' }), /Ação desconhecida/);
});

test('ação legal avança o estado e a desistência encerra com vencedor', () => {
  let state = pastMulligan(start());
  const active = seatOf(state.activePlayer);
  const own = state.players[state.activePlayer];
  state = applySeatAction(state, active, { type: 'ink', iid: own.hand[0].iid });
  assert.equal(state.players[active === 1 ? 'player' : 'bot'].inkwell.length, 1);
  state = applySeatAction(state, active, { type: 'concede' });
  const summary = matchSummary(state);
  assert.equal(summary.phase, 'finished');
  assert.equal(summary.winnerSeat, active === 1 ? 2 : 1);
});
