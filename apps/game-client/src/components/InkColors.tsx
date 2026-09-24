import { useEffect, useRef } from 'react';
import amber from '../../../../images/icons/amber.webp';
import amethyst from '../../../../images/icons/amethyst.webp';
import emerald from '../../../../images/icons/emerald.webp';
import ruby from '../../../../images/icons/ruby.webp';
import sapphire from '../../../../images/icons/sapphire.webp';
import steel from '../../../../images/icons/steel.webp';

const inks: Record<string, [string, string]> = {
  amber: [amber, 'Âmbar'], ambar: [amber, 'Âmbar'],
  amethyst: [amethyst, 'Ametista'], ametista: [amethyst, 'Ametista'],
  emerald: [emerald, 'Esmeralda'], esmeralda: [emerald, 'Esmeralda'],
  ruby: [ruby, 'Rubi'], rubi: [ruby, 'Rubi'],
  sapphire: [sapphire, 'Safira'], safira: [sapphire, 'Safira'],
  steel: [steel, 'Aço'], aco: [steel, 'Aço'],
};

export function InkColors({ colors }: { colors: string | string[] | null | undefined }) {
  const entries = [...new Set((Array.isArray(colors) ? colors : [colors || '']).flatMap(c => c.split(/\s*[-+/]\s*/)).filter(Boolean))];
  return <span className="lorcana-inks">{entries.length ? entries.map(color => {
    const ink = inks[color.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()];
    return <span className="lorcana-ink" key={color}>{ink && <img src={ink[0]} alt="" width="30" height="34" />}<span>{ink?.[1] || color}</span></span>;
  }) : <span>Sem cor</span>}</span>;
}

export function InkColorSelect({ value, options, onChange }: { value: string; options: { value: string; label: string }[]; onChange(value: string): void }) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) root.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  return <details className="ink-color-select" ref={root} onKeyDown={e => { if (e.key === 'Escape') { root.current?.removeAttribute('open'); root.current?.querySelector('summary')?.focus(); } }}>
    <summary aria-label="Filtrar por cor">{value ? <InkColors colors={value} /> : 'Todas as cores'}</summary>
    <div className="ink-color-options">{[{ value: '', label: 'Todas as cores' }, ...options].map(option => <button type="button" key={option.value} aria-pressed={option.value === value} onClick={() => { onChange(option.value); root.current?.removeAttribute('open'); root.current?.querySelector('summary')?.focus(); }}>{option.value ? <InkColors colors={option.value} /> : option.label}</button>)}</div>
  </details>;
}
