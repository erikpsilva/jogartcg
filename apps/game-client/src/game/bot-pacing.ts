/** Presentation only: pacing must never affect the chosen move or game rules. */
export function botThinkingDelay(firstDecision: boolean, choosing: boolean): number {
  const minimum = firstDecision ? 2100 : choosing ? 1600 : 1900;
  return minimum + Math.floor(Math.random() * 701);
}
