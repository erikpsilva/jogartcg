# Jogar TCG

Plataforma web e mobile para catalogar cartas, montar decks e jogar Disney Lorcana TCG.

## Banco de dados

No ambiente local, a aplicacao usa por padrao o banco `jogartcg_db`, usuario `root` e senha vazia.

Em producao, configure as variaveis `APP_ENV=production`, `JOGARTCG_DB_HOST`, `JOGARTCG_DB_NAME`, `JOGARTCG_DB_USER` e `JOGARTCG_DB_PASS` no servidor. Como alternativa, copie `config/database.credentials.example.php` para `config/database.credentials.php` e preencha as credenciais diretamente no servidor. O arquivo real de credenciais e ignorado pelo Git.
