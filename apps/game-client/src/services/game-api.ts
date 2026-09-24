import { apiUrl } from '../config/api';
import type { CardDetail } from './catalog-api';
import type { SavedDeckSummary } from './deck-api';

export interface GameDeck extends SavedDeckSummary {
  cosmetics?: { playmat: string | null; sleeve: string | null };
  cards: Array<{ quantity: number; card: CardDetail }>;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(apiUrl(`/game${path}`), {
    credentials: 'include', headers: { Accept: 'application/json' }, signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || 'Não foi possível preparar a partida.');
  return body.data as T;
}

export const getGameDeck = (id: number, signal?: AbortSignal) => get<GameDeck>(`/decks/${id}`, signal);
export const getGameCatalog = (signal?: AbortSignal) => get<CardDetail[]>('/catalog', signal);
