# Jogar TCG

Plataforma web e mobile para catalogar cartas, montar decks e jogar Disney Lorcana TCG.

## Banco de dados

No ambiente local, a aplicacao usa por padrao o banco `jogartcg_db`, usuario `root` e senha vazia.

Em producao, configure as variaveis `APP_ENV=production`, `JOGARTCG_DB_HOST`, `JOGARTCG_DB_NAME`, `JOGARTCG_DB_USER` e `JOGARTCG_DB_PASS` no servidor. Como alternativa, copie `config/database.credentials.example.php` para `config/database.credentials.php` e preencha as credenciais diretamente no servidor. O arquivo real de credenciais e ignorado pelo Git.

## Publicacao por FTP

- `npm run deploy:check`: compila o cliente, monta `.deploy/release`, mostra a lista permitida e testa a conexao sem publicar.
- `npm run deploy`: compila e envia apenas `.htaccess`, `index.php`, `api/`, `client/`, os arquivos PHP permitidos de `config/` e a credencial privada do banco.
- As credenciais FTP e MySQL ficam somente em `.deploy/`, que e ignorada pelo Git.
- O processo nao envia fontes React, `node_modules`, Git, ferramentas, backups, perfis de teste ou temporarios.

O FTP atual da hospedagem nao apresentou um certificado FTPS valido nos testes. Por isso, a automacao usa FTP comum, como o acesso existente do FileZilla. Prefira migrar para SFTP ou FTPS quando a hospedagem disponibilizar uma dessas opcoes.
