/**
 * Arbitro pela linha de comando: le um JSON no stdin e escreve outro no stdout.
 * Usado quando o proprio servidor PHP pode executar o Node (proc_open liberado).
 * A logica fica em handler.ts, compartilhada com o servico HTTP.
 */
import { refereeResponse } from './handler.js';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

process.stdout.write(JSON.stringify(refereeResponse(await readStdin())));
