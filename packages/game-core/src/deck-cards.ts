import { compileCardRules, type CardRuleSource } from './cards.js';
import type { GameCard } from './engine.js';

/** Card payload produced by the PHP deck endpoints (`loadGameDeck`). */
export interface DeckCardSource extends CardRuleSource {
  name: string;
  full_name: string;
  cost: number | null;
  inkwell: boolean;
  strength: number | null;
  willpower: number | null;
  lore: number | null;
  move_cost?: number | null;
  image: { full: string | null; thumbnail: string | null };
  original: CardRuleSource['original'] & { full_name?: string | null; subtypes?: string[] | null };
  pt_br: { full_text: string | null };
}
export interface DeckEntrySource { quantity: number; card: DeckCardSource }
export type DisplayGameCard = GameCard & { fullName: string; displayName: string; textPt: string };

/**
 * Expands a saved deck into engine cards. Shared by the local bot table and the
 * multiplayer referee so both sides of a match are built by exactly the same rules.
 */
export function buildGameCards(entries: readonly DeckEntrySource[]): DisplayGameCard[] {
  return entries.flatMap(({ card, quantity }) => {
    const compiledRules = compileCardRules(card);
    const definition: DisplayGameCard = {
      id: card.id, name: card.original.name || card.name,
      fullName: card.original.full_name || card.full_name, displayName: card.full_name,
      type: card.original.type as GameCard['type'], cost: card.cost ?? 0, inkwell: card.inkwell,
      strength: card.strength ?? 0, willpower: card.willpower ?? 0, lore: card.lore ?? 0,
      moveCost: card.move_cost ?? 0, subtypes: card.original.subtypes ?? [],
      image: card.image.full || card.image.thumbnail || '',
      text: card.original.full_text || '', textPt: card.pt_br.full_text || card.original.full_text || '',
      // Keep every rule the compiler understood and treat only unrecognized clauses
      // as text without an automatic effect, so real saved decks can enter the table.
      rules: compiledRules.supported ? compiledRules : { ...compiledRules, supported: true, unsupported: [] },
    };
    return Array.from({ length: quantity }, () => definition);
  });
}
