/**
 * Arbitro de regras: decide as jogadas das partidas online com o mesmo motor da
 * mesa local. Sem estado: recebe o estado atual e devolve o proximo.
 *
 *   { op: 'create', decks: { 1: DeckEntry[], 2: DeckEntry[] }, seed, names }
 *   { op: 'apply', state, seat, action, names }
 *
 * Resposta: `{ ok: true, state, summary, views: { 1, 2 } }` ou `{ ok: false, error }`.
 * `names[seat]` e como aquele assento aparece para o outro jogador.
 *
 * Usado de duas formas, conforme o servidor permite:
 *  - src/referee.ts   linha de comando (PHP chama o Node com proc_open)
 *  - src/index.ts     servico HTTP (PHP chama por HTTPS quando proc_open e proibido)
 */
import {
  applySeatAction, createSeatedGame, matchSummary, viewForSeat,
  type DeckEntrySource, type GameState, type Seat,
} from '@jogartcg/game-core';

export interface Names { 1: string; 2: string }
export type RefereeRequest =
  | { op: 'create'; decks: Record<Seat, DeckEntrySource[]>; seed: number; names: Names }
  | { op: 'apply'; state: GameState; seat: Seat; action: unknown; names: Names };

function reply(state: GameState, names: Names) {
  return {
    ok: true as const,
    state,
    summary: matchSummary(state),
    views: {
      1: viewForSeat(state, 1, { opponent: names[2] }),
      2: viewForSeat(state, 2, { opponent: names[1] }),
    },
  };
}

/** Lanca quando a jogada fere as regras; a mensagem e mostrada ao jogador. */
export function runReferee(request: RefereeRequest) {
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

/** Resultado pronto para devolver ao PHP, com o erro de regra embutido. */
export function refereeResponse(raw: string): { ok: boolean } & Record<string, unknown> {
  try {
    return runReferee(JSON.parse(raw) as RefereeRequest);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Falha ao processar a jogada.' };
  }
}
