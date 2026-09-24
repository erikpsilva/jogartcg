/**
 * Referencia em JavaScript para o teste de equivalencia do motor em PHP.
 *
 *   node tests/game/support/replay.mjs entrada.json [passo]
 *
 * Le { decks, seed, actions }, joga a partida no motor original e escreve a
 * impressao digital do estado depois de cada jogada. Com o numero de um passo,
 * escreve tambem o estado inteiro daquele ponto, para mostrar onde divergiu.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { createGame, applyAction } = await import(pathToFileURL(resolve(root, 'packages/game-core/dist/engine.js')).href);

/** Mesma forma canonica usada no PHP: chaves ordenadas e objeto vazio igual a lista vazia. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    if (!keys.length) return [];
    const result = {};
    for (const key of keys) result[key] = canonical(value[key]);
    return result;
  }
  return value === undefined ? null : value;
}
const serialize = (value) => JSON.stringify(canonical(value));
const fingerprint = (value) => createHash('sha1').update(serialize(value)).digest('hex');

const input = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const wanted = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
const output = { hashes: [], error: null, state: null };

let state = createGame({ decks: input.decks, seed: input.seed });
output.hashes.push(fingerprint(state));
if (wanted === 0) output.state = canonical(state);

for (let step = 0; step < input.actions.length; step++) {
  try {
    state = applyAction(state, input.actions[step]);
  } catch (error) {
    output.error = { step: step + 1, message: String(error && error.message ? error.message : error) };
    break;
  }
  output.hashes.push(fingerprint(state));
  if (wanted === step + 1) output.state = canonical(state);
}

process.stdout.write(JSON.stringify(output));
