import { API_BASE_URL } from '../config/api';
import type { CatalogCard } from './catalog-api';

export type DeckFormatKey = 'core' | 'infinity' | 'preconstructed' | 'sealed' | 'draft' | 'pack_rush';
export interface DeckFormat {
  key: DeckFormatKey; label: string; description: string; minimum_cards: number; maximum_cards: number | null;
  maximum_colors: number | null; maximum_copies: number | null; uses_rotation: boolean;
  requires_card_pool: boolean; banned_cards: string[];
}
export interface DeckValidation { valid: boolean; issues: string[]; format?: DeckFormat; checked_at?: string; }
export interface SavedDeckSummary {
  id: number; name: string; format: DeckFormatKey; status: 'rascunho' | 'valido';
  total_cards: number; colors: string[]; validation: DeckValidation; created_at: string; updated_at: string;
}
export interface SavedDeck extends SavedDeckSummary { cards: Array<{ quantity: number; card: CatalogCard }>; }
export interface DeckPayload { name: string; format: DeckFormatKey; cards: Array<{ card_id: number; quantity: number }>; }
export interface ImportResult { cards: Array<{ quantity: number; card: CatalogCard }>; unmatched: string[]; }
export interface ExportResult { filename: string; mime_type: string; content: string; }

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, credentials: 'include', headers: { Accept: 'application/json', ...options.headers } });
  const body = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Erro HTTP ${response.status}`);
  return body as T;
}

export async function getDeckFormats(): Promise<{ formats: DeckFormat[]; updatedAt: string }> {
  const body = await apiRequest<{ data: DeckFormat[]; rules_updated_at: string }>('/decks/formats');
  return { formats: body.data, updatedAt: body.rules_updated_at };
}
export async function listDecks(): Promise<SavedDeckSummary[]> {
  const body = await apiRequest<{ data: SavedDeckSummary[] }>('/decks'); return body.data;
}
export async function getDeck(id: number): Promise<SavedDeck> {
  const body = await apiRequest<{ data: SavedDeck }>(`/decks/${id}`); return body.data;
}
export async function saveDeck(payload: DeckPayload, csrfToken: string, id?: number): Promise<{ message: string; data: SavedDeck }> {
  return apiRequest(id ? `/decks/${id}` : '/decks', { method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(payload) });
}
export async function deleteDeck(id: number, csrfToken: string): Promise<void> {
  await apiRequest(`/decks/${id}`, { method: 'DELETE', headers: { 'X-CSRF-Token': csrfToken } });
}
export async function duplicateDeck(id: number, csrfToken: string): Promise<SavedDeck> {
  const body = await apiRequest<{ data: SavedDeck }>(`/decks/${id}/duplicate`, { method: 'POST', headers: { 'X-CSRF-Token': csrfToken } });
  return body.data;
}
export async function importDeck(input: { content?: string; url?: string }, csrfToken: string): Promise<ImportResult> {
  const body = await apiRequest<{ data: ImportResult }>('/decks/import', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify(input) });
  return body.data;
}
export async function getDeckExport(id: number, type: 'txt' | 'csv' | 'json' | 'dek'): Promise<ExportResult> {
  const body = await apiRequest<{ data: ExportResult }>(`/decks/${id}/export?type=${type}`); return body.data;
}
export function downloadDeckExport(result: ExportResult): void {
  const blob = new Blob([result.content], { type: result.mime_type });
  const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
  anchor.href = url; anchor.download = result.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  URL.revokeObjectURL(url);
}
