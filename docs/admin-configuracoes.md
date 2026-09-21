# Configurações do Jogar TCG

## Utilização

Acesse `/admin/configuracoes` com uma conta administrativa de nível `admin`.
No XAMPP/BrowserSync: `http://localhost:3000/jogartcg/admin/configuracoes`.
Marque ou desmarque **Ativar menu Jogar** e clique em **Salvar configurações**.
A conta administrativa é separada da conta de jogador.

- Ativado: mostra o menu e libera o lobby, treino contra bot e mesa demonstrativa.
- Desativado: oculta os links no cabeçalho/rodapé e apresenta indisponibilidade nas três rotas. A API `/api/v1/game/*` também recusa o carregamento autenticado.
- Catálogo, login, contas e edição dos decks permanecem disponíveis.
- Não apaga decks nem treinos locais. Uma arena já aberta é retirada da tela quando recebe a atualização; o cliente consulta a opção a cada 15 segundos enquanto visível, ao retornar à janela e ao trocar de rota.
- Sem conseguir consultar a disponibilidade, o cliente não libera a arena.

A opção é persistida em `site_settings` no banco de **cada ambiente**. Alterar no localhost não altera a produção. O valor inicial é ativado, preservando o comportamento anterior.

## Instalação e publicação

A primeira abertura autenticada das configurações cria a tabela e o valor inicial, sem alterar tabelas de cartas, usuários ou decks. Abrir novamente preserva a escolha salva.
Se o usuário do banco não tiver permissão de criação, aplique `database/migrations/2026-09-21-site-settings.sql` pelo painel do banco com as permissões necessárias.

`npm run release` agora compila e inclui o admin, suas fontes Montserrat locais e os ícones utilizados. Não publica por si só. A pasta de credenciais privada, dependências, testes e documentação continuam fora do pacote público. O arquivo `config/site_settings.php` contém somente código, nunca credenciais.

**Antes de publicar o painel, troque qualquer senha administrativa padrão em Meus dados.** Não copie senhas para documentação ou repositório.

## Proteções e limites

A gravação exige sessão administrativa, conferência atual do nível de acesso no banco, POST e token CSRF da sessão. O endpoint público `/api/v1/settings` é somente leitura, sem cache, e expõe apenas `play_enabled`.
Isto é um controle de disponibilidade da plataforma, não DRM: não impede executar uma cópia antiga do jogo local já baixada ou um cliente modificado. Partidas multiplayer ainda não fazem parte deste controle.

## Verificações locais

```powershell
npm run build:admin
npm run typecheck
C:\xampp\php\php.exe tests/php/site-settings.test.php
C:\xampp\php\php.exe tests/php/game-api.test.php
npm run test:game
npm run mobile:sync
```

Os testes PHP usam dados sintéticos em SQLite na memória e não modificam contas ou decks reais.
