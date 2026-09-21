# Continuação: salas multiplayer do Jogar TCG

Implemente a lógica real das salas multiplayer no projeto `C:\xampp\htdocs\jogartcg`, preservando o layout já criado em `PlayLobbyPage.tsx`. Não navegue pelas telas; o usuário fará o teste visual. Valide com `npm run typecheck` e `npm run mobile:sync`.

Requisitos: somente usuários autenticados; criar sala gera código numérico aleatório de 6 dígitos, único entre salas abertas; entrar exige esse código; cada jogador escolhe um de seus decks salvos e válido; ambos veem quem entrou e o estado do outro; cada um confirma em “Começar”; a partida só inicia após os dois confirmarem; mudança de deck cancela a confirmação; abandono/expiração fecha a sala com tratamento claro. O servidor deve ser autoritativo, nunca confiar em IDs, deck ou ações enviados pelo cliente. Um usuário só pode ocupar um assento da sala.

Crie tabelas/migrations para salas, participantes e estado/eventos da partida. Prefira comunicação em tempo quase real compatível com hospedagem PHP compartilhada (polling incremental/long polling), sem depender obrigatoriamente de WebSocket. Use transações e bloqueio para entrada simultânea, código único com índice, expiração e limpeza. Integre CSRF, sessão e APIs existentes. Nunca exponha dados privados do usuário nem credenciais.

Ao iniciar, produza o estado da partida no motor compartilhado usando os dois decks selecionados. Reutilize as regras, validações, orientação landscape e mesa atuais. Não implemente só uma simulação visual: sincronize turno, ações legais, escolhas pendentes, reconexão e resultado entre os dois clientes, com versão/revisão do estado para impedir ações duplicadas ou fora de ordem.

Inclua testes de API para: código inválido; sala lotada; tentativa de entrar duas vezes; deck de outro usuário; deck inválido; confirmação dos dois; troca de deck; ação fora do turno; revisão desatualizada; reconexão; expiração. Preserve todas as alterações existentes e não faça commit, push ou deploy sem pedido explícito.
