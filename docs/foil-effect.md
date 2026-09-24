# Efeito foil preservado

A prévia foi retirada da Ariel a pedido do usuário. Não aplicar novamente ou em outras cartas automaticamente; o efeito será usado de outra forma, ainda a definir.

O código permanece disponível na propriedade opcional `foil` de `apps/game-client/src/components/CardGallery.tsx`, desativada por padrão. Inclui reflexo acompanhando o ponteiro, brilho holográfico e glitter animado. Os estilos estão em `client/site-shell.css` e na cópia `apps/game-client/public/site-shell.css`, nas classes `card-foil` e `card-foil__glitter`. Respeita a preferência por movimento reduzido.

Para uso futuro autorizado, passar `foil={true}` ao componente. A imagem original e os dados do banco não são modificados.
