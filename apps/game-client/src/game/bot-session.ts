import { compileCardRules, createGame, type GameCard, type GameState } from '@jogartcg/game-core';
import type { GameDeck } from '../services/game-api';

export type DisplayGameCard = GameCard & { fullName: string; displayName: string; textPt: string };
export type InkColor = 'amber' | 'amethyst' | 'emerald' | 'ruby' | 'sapphire' | 'steel';
export interface BotMatch {
  version: 1;
  playerName: string;
  deckNames: { player: string; bot: string };
  inkColors: { player: InkColor; bot: InkColor };
  state: GameState;
  updatedAt: string;
}
const sessionKey = (userId: number) => `jogartcg:bot:v1:${userId}`;
const colorAliases: Record<string, InkColor> = {
  amber: 'amber', ambar: 'amber', amethyst: 'amethyst', ametista: 'amethyst',
  emerald: 'emerald', esmeralda: 'emerald', ruby: 'ruby', rubi: 'ruby',
  sapphire: 'sapphire', safira: 'sapphire', steel: 'steel', aco: 'steel',
};
const inkFiles: Record<InkColor, string> = {
  amber: 'tinteiroAmbar.png', amethyst: 'tinteiroAmetista.png', emerald: 'tinteiroEsmeralda.png',
  ruby: 'tinteiroRubi.png', sapphire: 'tinteiroSafira.png', steel: 'tinteiroAco.png',
};

function deckInkColors(colors: readonly string[], fallback: InkColor): InkColor[] {
  const normalized = colors.map((color) => color.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim())
    .map((color) => colorAliases[color]).filter((color): color is InkColor => Boolean(color));
  return [...new Set(normalized.length ? normalized : [fallback])];
}

export function chooseInkColors(playerDeck: GameDeck, botDeck: GameDeck): BotMatch['inkColors'] {
  const player = deckInkColors(playerDeck.colors, 'sapphire');
  const bot = deckInkColors(botDeck.colors, 'amethyst');
  const playerExclusive = player.find((color) => !bot.includes(color));
  const botExclusive = bot.find((color) => !player.includes(color));
  if (playerExclusive && botExclusive) return { player: playerExclusive, bot: botExclusive };
  for (const playerColor of player) for (const botColor of bot) {
    if (playerColor !== botColor) return { player: playerColor, bot: botColor };
  }
  return { player: player[0], bot: bot[0] };
}

export function inkBottleAsset(color: InkColor): string {
  return `./brand/lorcana-items/${inkFiles[color]}`;
}

export function gameDeckCards(deck: GameDeck): DisplayGameCard[] {
  return deck.cards.flatMap(({ card, quantity }) => {
    const compiledRules = compileCardRules(card);
    const definition: DisplayGameCard = {
      id: card.id, name: card.original.name || card.name,
      fullName: card.original.full_name || card.full_name, displayName: card.full_name,
      type: card.original.type as GameCard['type'], cost: card.cost ?? 0, inkwell: card.inkwell,
      strength: card.strength ?? 0, willpower: card.willpower ?? 0, lore: card.lore ?? 0,
      moveCost: card.move_cost ?? 0, subtypes: card.original.subtypes ?? [],
      image: card.image.full || card.image.thumbnail || '',
      text: card.original.full_text || '', textPt: card.pt_br.full_text || card.original.full_text || '',
      // Bot matches are currently an explicit local test environment. Keep every
      // rule the compiler understood and treat only the unrecognized clauses as
      // text without an automatic effect, so real saved decks can enter the table.
      rules: compiledRules.supported ? compiledRules : { ...compiledRules, supported: true, unsupported: [] },
    };
    return Array.from({ length: quantity }, () => definition);
  });
}

export function beginBotMatch(userId: number, playerName: string, playerDeck: GameDeck, botDeck: GameDeck): BotMatch {
  const match: BotMatch = {
    version: 1, playerName, deckNames: { player: playerDeck.name, bot: botDeck.name }, inkColors: chooseInkColors(playerDeck, botDeck),
    state: createGame({ decks: { player: gameDeckCards(playerDeck), bot: gameDeckCards(botDeck) }, seed: crypto.getRandomValues(new Uint32Array(1))[0] }),
    updatedAt: new Date().toISOString(),
  };
  saveBotMatch(userId, match);
  return match;
}

export function saveBotMatch(userId: number, match: BotMatch): void {
  // Local training only. These snapshots must never be trusted by a multiplayer server.
  localStorage.setItem(sessionKey(userId), JSON.stringify({ ...match, updatedAt: new Date().toISOString() }));
}

export function loadBotMatch(userId: number): BotMatch | null {
  try {
    const value = localStorage.getItem(sessionKey(userId));
    if (!value) return null;
    const match = JSON.parse(value) as BotMatch;
    if (match.version !== 1 || !match.state?.players?.player || !match.state?.players?.bot) return null;
    const validColors = new Set<InkColor>(['amber','amethyst','emerald','ruby','sapphire','steel']);
    const inkColors = match.inkColors;
    return { ...match, inkColors: inkColors && validColors.has(inkColors.player) && validColors.has(inkColors.bot) ? inkColors : { player: 'sapphire', bot: 'amethyst' } };
  } catch { return null; }
}
