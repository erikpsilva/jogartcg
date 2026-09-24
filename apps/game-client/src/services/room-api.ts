import type { GameAction, GameState, LegalAction } from '@jogartcg/game-core';
import { apiUrl } from '../config/api';

export type RoomStatus = 'aguardando' | 'em_jogo' | 'encerrada';

export interface RoomPlayer {
  cosmetics?: { playmat: string | null; sleeve: string | null };
  seat: 1 | 2;
  name: string;
  avatar: string | null;
  deck_selected: boolean;
  ready: boolean;
  connected: boolean;
  you: boolean;
  /** Deck colors, revealed only after the match starts. */
  colors?: string[];
}

export interface SeatView {
  seat: 1 | 2;
  /** Oriented to you: 'player' is always you, 'bot' is always the opponent. */
  state: GameState;
  legal: LegalAction[];
  decisionSeat: 1 | 2 | null;
}

export interface Room {
  id: number;
  code: string | null;
  status: RoomStatus;
  revision: number;
  closed_reason: string | null;
  closed_message: string | null;
  expires_at: string | null;
  you: { seat: 1 | 2; deck: { id: number; name: string } | null; ready: boolean } | null;
  players: RoomPlayer[];
  match: {
    revision: number;
    status: 'em_andamento' | 'encerrada';
    decision_seat: 1 | 2 | null;
    winner_seat: 1 | 2 | null;
    finish_reason: string | null;
    action_deadline?: number;
    server_time?: number;
  } | null;
  view?: SeatView;
}

export class RoomApiError extends Error {
  constructor(message: string, readonly status: number, readonly code: string, readonly room?: Room, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

async function request<T>(path: string, options: RequestInit & { csrf?: string } = {}): Promise<T> {
  const { csrf, headers, ...rest } = options;
  const response = await fetch(apiUrl(`/rooms${path}`), {
    ...rest,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(rest.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      ...headers,
    },
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new RoomApiError(
      typeof body.message === 'string' ? body.message : `Erro HTTP ${response.status}`,
      response.status,
      typeof body.error === 'string' ? body.error : 'unknown',
      body.data as Room | undefined,
      body,
    );
  }
  return body as T;
}

const post = <T>(path: string, csrf: string, payload: unknown = {}) =>
  request<{ data: T }>(path, { method: 'POST', csrf, body: JSON.stringify(payload) }).then((body) => body.data);

export const createRoom = (csrf: string) => post<Room>('', csrf);
export const joinRoom = (csrf: string, code: string) => post<Room>('/join', csrf, { code });
export const chooseRoomDeck = (csrf: string, roomId: number, deckId: number | null) => post<Room>(`/${roomId}/deck`, csrf, { deckId: deckId ?? 0 });
export const setRoomReady = (csrf: string, roomId: number, ready: boolean) => post<Room>(`/${roomId}/ready`, csrf, { ready });
export const leaveRoom = (csrf: string, roomId: number) => request<unknown>(`/${roomId}/leave`, { method: 'POST', csrf, body: '{}' });

/** Sends a move. `revision` must be the match revision the move was chosen on. */
export const sendRoomAction = (csrf: string, roomId: number, revision: number, action: GameAction) => {
  const { label: _label, player: _player, ...details } = action;
  return post<Room>(`/${roomId}/action`, csrf, { revision, action: details });
};

export const getCurrentRoom = () => request<{ data: Room | null }>('/current').then((body) => body.data);
export const getRoom = (roomId: number, withView = false) =>
  request<{ data: Room }>(`/${roomId}${withView ? '?view=1' : ''}`).then((body) => body.data);

/**
 * Long poll: resolves as soon as the lobby or the match changes, or after the
 * server's wait window (then `changed` is false and only presence is refreshed).
 */
export const pollRoom = (roomId: number, roomRevision: number, matchRevision: number, signal: AbortSignal) =>
  request<{ changed: boolean; data: Room }>(`/${roomId}/poll?room_rev=${roomRevision}&match_rev=${matchRevision}`, { signal });
