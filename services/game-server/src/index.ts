/**
 * Arbitro de regras como servico HTTP.
 *
 * Hospedagem compartilhada costuma proibir proc_open, entao o PHP nao consegue
 * executar o Node na propria maquina. Neste modo o site chama este servico por
 * HTTPS; o servidor continua mandando nas regras, so que o motor roda aqui.
 *
 *   POST /referee   corpo = mesma requisicao do arbitro (create/apply)
 *   GET  /health    disponibilidade, sem segredo
 *
 * Toda chamada leva data/hora e assinatura HMAC-SHA256 do corpo com
 * JOGARTCG_REFEREE_SECRET. Sem o segredo correto, nada e processado.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { refereeResponse } from './handler.js';

/**
 * Segredo compartilhado com o site. Vem da variavel de ambiente ou, quando o
 * painel da hospedagem nao oferece variaveis, de um arquivo `referee.secret`
 * ao lado do programa (uma linha, so o segredo).
 */
function resolveSecret(): string {
  const fromEnv = process.env.JOGARTCG_REFEREE_SECRET;
  if (fromEnv) return fromEnv.trim();
  try {
    return readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'referee.secret'), 'utf8').trim();
  } catch {
    return '';
  }
}

/**
 * Porta: `PORT`/`GAME_SERVER_PORT` na maioria das hospedagens. A KingHost
 * publica a porta da aplicacao em `PORT_<nome-do-script>`, entao aceitamos
 * qualquer variavel com esse prefixo.
 */
function resolvePort(): number {
  const named = Object.entries(process.env).find(([key, value]) => key.startsWith('PORT_') && value);
  const raw = process.env.PORT || process.env.GAME_SERVER_PORT || named?.[1] || '8787';
  const port = Number.parseInt(raw, 10);
  return Number.isInteger(port) && port > 0 ? port : 8787;
}

const port = resolvePort();
const host = process.env.GAME_SERVER_HOST || '0.0.0.0';
const secret = resolveSecret();
// Um estado de partida chega perto de 150 KB; o limite corta abuso sem apertar o uso real.
const MAX_BODY_BYTES = 4 * 1024 * 1024;
const MAX_CLOCK_DRIFT_SECONDS = 300;

if (!secret) {
  console.error('Defina JOGARTCG_REFEREE_SECRET (ou crie o arquivo referee.secret) antes de iniciar o arbitro.');
  process.exit(1);
}

function signatureMatches(timestamp: string, body: string, provided: string): boolean {
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_CLOCK_DRIFT_SECONDS) return false;
  const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest();
  let received: Buffer;
  try { received = Buffer.from(provided, 'hex'); } catch { return false; }
  return received.length === expected.length && timingSafeEqual(received, expected);
}

const json = (response: import('node:http').ServerResponse, status: number, payload: unknown): void => {
  const body = JSON.stringify(payload);
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  response.end(body);
};

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    json(response, 200, { ok: true, service: 'jogartcg-referee' });
    return;
  }
  if (request.method !== 'POST' || (request.url !== '/referee' && request.url !== '/')) {
    json(response, 404, { ok: false, error: 'Rota não encontrada.' });
    return;
  }

  const chunks: Buffer[] = [];
  let size = 0;
  request.on('data', (chunk: Buffer) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) { json(response, 413, { ok: false, error: 'Requisição grande demais.' }); request.destroy(); return; }
    chunks.push(chunk);
  });
  request.on('end', () => {
    if (response.writableEnded) return;
    const body = Buffer.concat(chunks).toString('utf8');
    const timestamp = String(request.headers['x-jogartcg-timestamp'] ?? '');
    const provided = String(request.headers['x-jogartcg-signature'] ?? '');
    if (!signatureMatches(timestamp, body, provided)) {
      json(response, 401, { ok: false, error: 'Assinatura inválida.' });
      return;
    }
    try {
      json(response, 200, refereeResponse(body));
    } catch (error) {
      console.error('[arbitro] falha inesperada:', error);
      json(response, 500, { ok: false, error: 'Falha ao processar a jogada.' });
    }
  });
});

server.listen(port, host, () => {
  console.log(`Arbitro do Jogar TCG ouvindo em ${host}:${port}`);
});
