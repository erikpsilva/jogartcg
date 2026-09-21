# Jogar TCG

Plataforma web e mobile para catalogar cartas, montar decks e jogar Disney Lorcana TCG.

## Banco de dados

No ambiente local, a aplicacao usa por padrao o banco `jogartcg_db`, usuario `root` e senha vazia.

Em producao, a aplicacao procura as credenciais em `/config/database.credentials.php`, fora da pasta publica `/www`. Copie manualmente `config/database.credentials.example.php`, preencha os dados e envie o arquivo para a pasta `/config` na raiz da conta FTP. A publicacao padrao nunca cria, envia, altera ou remove esse arquivo.

Tambem e possivel usar as variaveis `APP_ENV=production`, `JOGARTCG_DB_HOST`, `JOGARTCG_DB_NAME`, `JOGARTCG_DB_USER`, `JOGARTCG_DB_PASS` e `JOGARTCG_DB_CONFIG` quando o servidor oferecer variaveis de ambiente.

## Publicacao por FTP

- `npm run deploy:check`: compila o cliente, monta `.deploy/release`, mostra a lista permitida e testa a conexao sem publicar.
- `npm run deploy`: compila e envia apenas `.htaccess`, `index.php`, `api/`, `client/` e os arquivos PHP publicaveis de `config/`.
- A credencial FTP fica somente em `.deploy/`, que e ignorada pelo Git. A credencial MySQL deve ser enviada manualmente para `/config`, fora de `/www`.
- O processo nao envia fontes React, `node_modules`, Git, ferramentas, backups, perfis de teste ou temporarios.
- O build bloqueia a publicacao se encontrar credenciais, segredos, chaves ou arquivos `.env` dentro da release.

O FTP atual da hospedagem nao apresentou um certificado FTPS valido nos testes. Por isso, a automacao usa FTP comum, como o acesso existente do FileZilla. Prefira migrar para SFTP ou FTPS quando a hospedagem disponibilizar uma dessas opcoes.
