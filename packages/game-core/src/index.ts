export type DeckImportSource = 'manual' | 'dreamborn' | 'text' | 'other';

export interface DeckCard {
  sourceId: number;
  quantity: number;
}

export interface Deck {
  id?: string;
  name: string;
  cards: DeckCard[];
  source: DeckImportSource;
  sourceUrl?: string;
}

export interface DeckValidationIssue {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  sourceId?: number;
}

export interface DeckValidationResult {
  valid: boolean;
  issues: DeckValidationIssue[];
}

export interface PlayerIdentity {
  id: string;
  displayName: string;
}

export type MatchStatus = 'waiting' | 'active' | 'finished' | 'cancelled';
