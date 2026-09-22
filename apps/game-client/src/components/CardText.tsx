import { Fragment } from 'react';

/**
 * Texto de carta com os símbolos do Lorcana desenhados como ícones.
 *
 * O banco guarda os símbolos como caracteres (convenção do LorcanaJSON) e o
 * motor de regras depende deles assim; a troca por ícone acontece só na tela.
 * O restante continua texto comum, que o React escapa — nada de innerHTML.
 */
const CARD_SYMBOLS: Record<string, { name: string; label: string }> = {
  '¤': { name: 'strength', label: 'Força' },
  '⛉': { name: 'willpower', label: 'Vontade' },
  '◊': { name: 'lore', label: 'Lore' },
  '⟳': { name: 'exert', label: 'Exaurir' },
  '⬡': { name: 'ink', label: 'Tinta' },
  '◉': { name: 'inkable', label: 'Tinteiro' },
};
const SYMBOL_SPLIT = /([¤⛉◊⟳⬡◉])/u;

export function CardText({ text }: { text: string }) {
  return <>{text.split('\n').map((line, lineIndex) => (
    <Fragment key={lineIndex}>
      {lineIndex > 0 && <br />}
      {line.split(SYMBOL_SPLIT).map((part, partIndex) => {
        const symbol = CARD_SYMBOLS[part];
        if (!symbol) return part;
        return <span key={partIndex} className={`card-symbol card-symbol--${symbol.name}`} role="img" aria-label={symbol.label} title={symbol.label} />;
      })}
    </Fragment>
  ))}</>;
}
