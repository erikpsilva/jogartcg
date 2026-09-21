/**
 * Stateless rules referee for online matches.
 *
 * PHP owns sessions, rooms, locking and persistence; it calls this process with
 * one JSON request on stdin and reads one JSON response on stdout. Keeping the
 * referee stateless means the same engine that runs the local bot table decides
 * every online move, and it can later be served over HTTP without changing PHP's
 * contract.
 *
 *   { op: 'create', decks: { 1: DeckEntry[], 2: DeckEntry[] }, seed, names }
 *   { op: 'apply', state, seat, action, names }
 *
 * Both reply with `{ ok: true, state, summary, views: { 1, 2 } }` or `{ ok: false, error }`.
 * `names[seat]` is how that seat is shown to the other player.
 */
import {
  applySeatAction, createSeatedGame, matchSummary, viewForSeat,
  type DeckEntrySource, type GameState, type Seat,
} from '@jogartcg/game-core';

interface Names { 1: string; 2: string }
type Request =
  | { op: 'create'; decks: Record<Seat, DeckEntrySource[]>; seed: number; names: Names }
  | { op: 'apply'; state: GameState; seat: Seat; action: unknown; names: Names };

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function reply(state: GameState, names: Names) {
  return {
    ok: true,
    state,
    summary: matchSummary(state),
    views: {
      1: viewForSeat(state, 1, { opponent: names[2] }),
      2: viewForSeat(state, 2, { opponent: names[1] }),
    },
  };
}

function handle(request: Request) {
  if (request.op === 'create') {
    if (!Number.isSafeInteger(request.seed)) throw new Error('Semente inválida.');
    return reply(createSeatedGame(request.decks, request.seed), request.names);
  }
  if (request.op === 'apply') {
    if (request.seat !== 1 && request.seat !== 2) throw new Error('Assento inválido.');
    return reply(applySeatAction(request.state, request.seat, request.action), request.names);
  }
  throw new Error('Operação desconhecida.');
}

let output: unknown;
try {
  output = handle(JSON.parse(await readStdin()) as Request);
} catch (error) {
  // Engine errors are rule violations meant for the player (e.g. "Ação inválida").
  output = { ok: false, error: error instanceof Error ? error.message : 'Falha ao processar a jogada.' };
}
process.stdout.write(JSON.stringify(output));
