import { API_BASE_URL } from '../config/api';

export interface CatalogImage {
  full: string | null;
  thumbnail: string | null;
  full_foil: string | null;
}

export interface CatalogCard {
  id: number;
  set_code: string;
  number: number | null;
  name: string;
  version: string | null;
  full_name: string;
  type: string | null;
  color: string | null;
  rarity: string | null;
  cost: number | null;
  inkwell: boolean;
  strength: number | null;
  willpower: number | null;
  lore: number | null;
  image: CatalogImage;
  translation_status: string;
  max_copies_in_deck: number;
}

export interface LocalizedCardText {
  name: string | null;
  version: string | null;
  full_name: string | null;
  type: string | null;
  color: string | null;
  rarity: string | null;
  story: string | null;
  subtypes: string[] | null;
  subtypes_text: string | null;
  full_text: string | null;
  flavor_text: string | null;
  abilities: Array<{ name?: string; effect?: string; fullText?: string; type?: string }> | null;
  effects: unknown[] | null;
  clarifications: unknown[] | null;
  errata: unknown[] | null;
}

export interface CardDetail extends CatalogCard {
  original: LocalizedCardText;
  pt_br: LocalizedCardText;
  artists: string[] | null;
  move_cost: number | null;
  foil_types: string[] | null;
  allowed_in_formats: Record<string, { allowed?: boolean }> | null;
  allowed_in_tournaments_from_date: string | null;
  translation_engine: string | null;
  translated_at: string | null;
}

export interface CatalogSet {
  code: string;
  number: number | null;
  name: string;
  name_original: string;
  type: string | null;
  release_date: string | null;
  has_all_cards: boolean;
  card_counts: { total?: number } | null;
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface CatalogFilters {
  colors: FilterOption[];
  types: FilterOption[];
  rarities: FilterOption[];
  costs: number[];
}

export interface Pagination {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface CardsResponse {
  success: boolean;
  language: string;
  pagination: Pagination;
  data: CatalogCard[];
}

interface DataResponse<T> {
  success: boolean;
  data: T;
}

async function requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const options: RequestInit = { headers: { Accept: 'application/json' } };
  if (signal) {
    options.signal = signal;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) {
    throw new Error(`API respondeu com HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getCards(search: URLSearchParams, signal?: AbortSignal): Promise<CardsResponse> {
  const query = new URLSearchParams(search);
  query.set('lang', 'pt-BR');
  query.set('per_page', '24');
  return requestJson<CardsResponse>(`/cards?${query.toString()}`, signal);
}

export function getCard(cardId: number, signal?: AbortSignal): Promise<DataResponse<CardDetail>> {
  return requestJson<DataResponse<CardDetail>>(`/cards/${cardId}?lang=pt-BR`, signal);
}

export function getSets(signal?: AbortSignal): Promise<DataResponse<CatalogSet[]>> {
  return requestJson<DataResponse<CatalogSet[]>>('/sets?lang=pt-BR', signal);
}

export function getFilters(signal?: AbortSignal): Promise<DataResponse<CatalogFilters>> {
  return requestJson<DataResponse<CatalogFilters>>('/filters?lang=pt-BR&schema=2', signal);
}
