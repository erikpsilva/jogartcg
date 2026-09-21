import { createServer } from 'node:http';

const port = Number.parseInt(process.env.GAME_SERVER_PORT || '8787', 10);

const server = createServer((request, response) => {
  if (request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ success: true, service: 'jogartcg-game-server' }));
    return;
  }

  response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ success: false, message: 'Rota não encontrada.' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Jogar TCG game server disponível em http://127.0.0.1:${port}`);
});
