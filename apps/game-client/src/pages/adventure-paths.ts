// Coordinates in the 1536 x 1024 artwork, normalized to a 100 x 100 map.
export const islandPoints: Record<number, [number, number]> = {
  '-1': [10.5, 22], 0: [11, 60], 1: [29, 76], 2: [29, 39],
  3: [49, 60], 4: [49, 29], 5: [68, 24], 6: [87, 25],
  7: [72, 44], 8: [65, 81], 9: [89, 71],
};
// Only the connections painted on the map are traversable (both directions).
export const inkEdges = [
  { a: -1, b: 0, curve: 'M10.5 22 C10 28 14 28 11 35 S8 50 11 60' },
  { a: 0, b: 1, curve: 'M11 60 C10 69 14 75 20 73 S25 76 29 76' },
  { a: 0, b: 2, curve: 'M11 60 C11 48 15 40 23 41 S26 40 29 39' },
  { a: 1, b: 3, curve: 'M29 76 C37 76 44 68 49 60' },
  { a: 2, b: 4, curve: 'M29 39 C36 33 41 30 49 29' },
  { a: 3, b: 4, curve: 'M49 60 C47 51 42 44 49 29' },
  { a: 4, b: 5, curve: 'M49 29 C55 23 61 18 68 24' },
  { a: 5, b: 6, curve: 'M68 24 C75 18 80 21 87 25' },
  { a: 6, b: 7, curve: 'M87 25 C88 34 81 39 72 44' },
  { a: 3, b: 7, curve: 'M49 60 C58 58 62 50 72 44' },
  { a: 3, b: 8, curve: 'M49 60 C45 72 48 79 56 78 S62 79 65 81' },
  { a: 7, b: 9, curve: 'M72 44 C84 45 90 43 89 56 S89 65 89 71' },
  { a: 8, b: 9, curve: 'M65 81 C78 83 73 68 82 68 S86 70 89 71' },
];

export function findInkRoute(from: number, to: number): number[] {
  const queue = [[from]];
  const visited = new Set([from]);
  while (queue.length) {
    const route = queue.shift()!;
    const current = route[route.length - 1];
    if (current === to) return route;
    for (const edge of inkEdges) {
      const next = edge.a === current ? edge.b : edge.b === current ? edge.a : null;
      if (next !== null && !visited.has(next)) {
        visited.add(next);
        queue.push([...route, next]);
      }
    }
  }
  return [];
}
