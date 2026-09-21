import { compileCardRules, TRAINING_DECKS } from '@jogartcg/game-core';
import type { CardDetail } from '../services/catalog-api';
import type { GameDeck } from '../services/game-api';

/** Read-only training lists; never inserts or changes the user's saved decks. */
export function trainingDecks(catalog: CardDetail[]): [GameDeck, GameDeck] {
  const byId = new Map(catalog.map((card) => [card.id, card]));
  return TRAINING_DECKS.map(({ name, colors, cardIds }): GameDeck => {
    const chosen = cardIds.map((id) => {
      const card = byId.get(id);
      if (!card || !card.allowed_in_formats?.Infinity?.allowed || !compileCardRules(card).supported) {
        throw new Error(`A carta ${id} desta lista de treino não está disponível com regras compatíveis no catálogo atual.`);
      }
      return card;
    });
    return {
      id: 0, name, format: 'infinity', status: 'valido', total_cards: 60, colors: [...colors],
      validation: { valid: true, issues: [] }, created_at: '', updated_at: '',
      cards: chosen.map((card) => ({ card, quantity: 4 })),
    };
  }) as [GameDeck, GameDeck];
}
