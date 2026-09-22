import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getCard, getCards, getFilters, getSets, withPrinting, type CardDetail, type CatalogCard, type CatalogFilters, type CatalogSet } from '../services/catalog-api';
import { downloadDeckExport, getDeck, getDeckExport, getDeckFormats, importDeck, saveDeck, type DeckFormat, type DeckFormatKey } from '../services/deck-api';
import { CardText } from '../components/CardText';
import { CardGallery } from '../components/CardGallery';
import { cardPrintingsOf } from '../components/CardTile';

type BuilderMode = 'cards' | 'import';
interface DeckEntry { card: CatalogCard; quantity: number; }

function detailLines(value: unknown[] | null): string[] {
  if (!value) return [];
  return value.map((item) => {
    if (typeof item === 'string') return item;
    if (item && typeof item === 'object') {
      const entry = item as Record<string, unknown>;
      return String(entry.fullText ?? entry.text ?? entry.effect ?? entry.name ?? JSON.stringify(item));
    }
    return String(item);
  });
}

/** Artes diferentes da mesma carta contam juntas no limite de copias. */
const groupOf = (card: CatalogCard): number => card.print_group_id ?? card.id;

/** Arte principal na lista; a arte que vai para o deck e escolhida no modal da carta. */
function BuilderCard({ card, quantity, limit, onOpen, onAdd }: { card: CatalogCard; quantity: number; limit: number | null; onOpen: () => void; onAdd: () => void }) {
  const printings = cardPrintingsOf(card);
  return <article className="builder-card">
    <div className="builder-card__media">
      <button className="builder-card__image" type="button" onClick={onOpen}>
        <img src={printings[0].image.thumbnail || printings[0].image.full || ''} alt={card.full_name} />
        {quantity > 0 && <span>{quantity}× no deck</span>}<em>{printings.length > 1 ? `Ampliar e escolher arte (${printings.length})` : 'Ampliar carta'}</em>
      </button>
      {printings.length > 1 && <span className="builder-card__arts">{printings.length} artes</span>}
    </div>
    <div className="builder-card__info"><div><small>{card.color} · {card.rarity}</small><strong>{card.name}</strong><span>{card.version || `Carta #${card.number}`}</span></div><button type="button" onClick={onAdd} disabled={limit !== null && quantity >= limit} aria-label={`Adicionar ${card.full_name} (arte principal)`}>+</button></div>
  </article>;
}

export function DeckBuilderPage() {
  const { deckId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCardHandled = useRef(false);
  const { user, csrfToken } = useAuth();
  const numericDeckId = deckId && /^\d+$/.test(deckId) ? Number(deckId) : undefined;
  const [currentId, setCurrentId] = useState<number | undefined>(numericDeckId);
  const [name, setName] = useState('Meu novo deck');
  const [format, setFormat] = useState<DeckFormatKey>('core');
  const [formats, setFormats] = useState<DeckFormat[]>([]);
  const [mode, setMode] = useState<BuilderMode>('cards');
  const [cards, setCards] = useState<CatalogCard[]>([]);
  const [sets, setSets] = useState<CatalogSet[]>([]);
  const [filters, setFilters] = useState<CatalogFilters | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState({ q: '', set: '', color: '', type: '' });
  const [deck, setDeck] = useState<Record<number, DeckEntry>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [noticeType, setNoticeType] = useState<'info' | 'error' | 'success'>('info');
  const [selectedCard, setSelectedCard] = useState<CatalogCard | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<CardDetail | null>(null);
  // Arte escolhida no modal; o botao de adicionar usa exatamente esta impressao.
  const [modalPrintingId, setModalPrintingId] = useState<number | null>(null);
  const [detailError, setDetailError] = useState('');
  const [importText, setImportText] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => { Promise.all([getSets(), getFilters(), getDeckFormats()]).then(([setResponse, filterResponse, formatResponse]) => { setSets(setResponse.data); setFilters(filterResponse.data); setFormats(formatResponse.formats); }).catch(() => undefined); }, []);
  useEffect(() => {
    if (!numericDeckId) return;
    getDeck(numericDeckId).then((saved) => {
      setName(saved.name); setFormat(saved.format); setDeck(Object.fromEntries(saved.cards.map((entry) => [entry.card.id, entry])));
    }).catch((reason: Error) => { setNoticeType('error'); setNotice(reason.message); });
  }, [numericDeckId]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => { if (value) params.set(key, value); });
    if (format === 'core' || format === 'infinity') params.set('format', format);
    setLoading(true);
    getCards(params, controller.signal).then((response) => setCards(response.data)).catch(() => undefined).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [query, format]);
  useEffect(() => {
    if (!selectedCard) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSelectedCard(null); };
    document.addEventListener('keydown', close); document.body.classList.add('modal-open');
    return () => { document.removeEventListener('keydown', close); document.body.classList.remove('modal-open'); };
  }, [selectedCard]);
  useEffect(() => {
    const cardId = Number(searchParams.get('carta'));
    if (initialCardHandled.current || !Number.isInteger(cardId) || cardId < 1) return;
    initialCardHandled.current = true;
    getCard(cardId).then((response) => addCard(response.data)).catch(() => { setNoticeType('error'); setNotice('Nao foi possivel adicionar a carta escolhida.'); });
  }, [searchParams]);
  useEffect(() => {
    setSelectedDetail(null); setDetailError(''); setModalPrintingId(selectedCard?.id ?? null);
    if (!selectedCard) return;
    const controller = new AbortController();
    getCard(selectedCard.id, controller.signal)
      .then((response) => setSelectedDetail(response.data))
      .catch((reason: unknown) => { if (!controller.signal.aborted) setDetailError(reason instanceof Error ? reason.message : 'Nao foi possivel carregar os detalhes.'); });
    return () => controller.abort();
  }, [selectedCard]);

  const entries = useMemo(() => Object.values(deck), [deck]);
  const totalCards = entries.reduce((total, entry) => total + entry.quantity, 0);
  const deckColors = Array.from(new Set(entries.flatMap((entry) => entry.card.color?.split(/\s*[-+]\s*/) ?? [])));
  const activeFormat = formats.find((item) => item.key === format);
  const minimumCards = activeFormat?.minimum_cards ?? 60;
  const validationIssues = [
    ...(totalCards < minimumCards ? [`Faltam ${minimumCards - totalCards} carta(s) para o minimo de ${minimumCards}.`] : []),
    ...(activeFormat?.maximum_cards !== null && activeFormat?.maximum_cards !== undefined && totalCards > activeFormat.maximum_cards ? [`O formato usa ${activeFormat.maximum_cards} cartas.`] : []),
    ...(activeFormat?.maximum_colors !== null && activeFormat?.maximum_colors !== undefined && deckColors.length > activeFormat.maximum_colors ? [`Escolha no maximo ${activeFormat.maximum_colors} cores de tinta.`] : [])
  ];

  function searchCards(event: FormEvent) { event.preventDefault(); setQuery((current) => ({ ...current, q: searchDraft.trim() })); }
  function addCard(card: CatalogCard) {
    const limit = activeFormat?.maximum_copies === null ? Number.POSITIVE_INFINITY : Math.max(activeFormat?.maximum_copies ?? 4, card.max_copies_in_deck || 4);
    setDeck((current) => {
      const existing = current[card.id];
      if (groupQuantityIn(current, groupOf(card)) >= limit) return current;
      return { ...current, [card.id]: { card, quantity: (existing?.quantity ?? 0) + 1 } };
    });
  }
  function groupQuantityIn(current: Record<number, DeckEntry>, group: number): number {
    return Object.values(current).reduce((total, entry) => total + (groupOf(entry.card) === group ? entry.quantity : 0), 0);
  }
  const groupQuantity = (card: CatalogCard): number => groupQuantityIn(deck, groupOf(card));
  function removeCard(cardId: number) {
    setDeck((current) => {
      const existing = current[cardId]; if (!existing) return current;
      if (existing.quantity > 1) return { ...current, [cardId]: { ...existing, quantity: existing.quantity - 1 } };
      const next = { ...current }; delete next[cardId]; return next;
    });
  }
  async function handleSave() {
    setSaving(true); setNotice('');
    try {
      const result = await saveDeck({ name, format, cards: entries.map(({ card, quantity }) => ({ card_id: card.id, quantity })) }, csrfToken, currentId);
      setCurrentId(result.data.id); setNoticeType('success');
      setNotice(result.data.validation.valid ? 'Deck salvo e validado para jogar.' : `Rascunho salvo. ${result.data.validation.issues.join(' ')}`);
      if (!currentId) navigate(`/decks/${result.data.id}`, { replace: true });
    } catch (reason) { setNoticeType('error'); setNotice(reason instanceof Error ? reason.message : 'Nao foi possivel salvar o deck.'); }
    finally { setSaving(false); }
  }
  async function analyzeImport() {
    if (!importText.trim() && !importUrl.trim()) { setNoticeType('error'); setNotice('Cole uma lista, escolha um arquivo ou informe um link primeiro.'); return; }
    setImporting(true); setNotice('');
    try {
      const result = await importDeck(importUrl.trim() ? { url: importUrl.trim() } : { content: importText }, csrfToken);
      setDeck(Object.fromEntries(result.cards.map((entry) => [entry.card.id, entry])));
      setMode('cards'); setNoticeType(result.unmatched.length ? 'info' : 'success');
      setNotice(result.unmatched.length ? `Lista importada. Nao encontramos: ${result.unmatched.join(', ')}` : 'Lista importada com sucesso. Revise e salve o deck.');
    } catch (reason) { setNoticeType('error'); setNotice(reason instanceof Error ? reason.message : 'Nao foi possivel importar.'); }
    finally { setImporting(false); }
  }
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; if (!file) return;
    if (file.size > 2 * 1024 * 1024) { setNoticeType('error'); setNotice('O arquivo deve ter no maximo 2 MB.'); return; }
    setImportText(await file.text());
  }
  async function exportCurrent(type: 'txt' | 'csv' | 'json' | 'dek') {
    if (!currentId) { setNoticeType('info'); setNotice('Salve o deck antes de exportar.'); return; }
    try { downloadDeckExport(await getDeckExport(currentId, type)); }
    catch (reason) { setNoticeType('error'); setNotice(reason instanceof Error ? reason.message : 'Nao foi possivel exportar o deck.'); }
  }

  // Ficha do modal com a arte escolhida (colecao, numero e raridade daquela impressao).
  const modalView = selectedDetail ? withPrinting(selectedDetail, cardPrintingsOf(selectedDetail).find((printing) => printing.id === modalPrintingId)) : null;

  return (
    <div className="deck-builder page-container">
      <header className="builder-heading"><div><span className="eyebrow"><i /> Deck Lab</span><h1>Monte seu deck.</h1><p>Explore, importe e salve sua lista. Rascunhos incompletos também ficam guardados.</p></div><div className="test-profile"><span className="test-profile__avatar">{user?.nome.charAt(0)}{user?.sobrenome.charAt(0)}</span><div><small>Conta conectada</small><strong>{user?.nome} {user?.sobrenome}</strong></div><Link to="/meus-decks">Meus decks</Link></div></header>
      <section className="deck-setup" aria-label="Configurações do deck">
        <label><span>Nome do deck</span><input type="text" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label><span>Formato</span><select value={format} onChange={(event) => setFormat(event.target.value as DeckFormatKey)}>{formats.map((item) => <option value={item.key} key={item.key}>{item.label} · mínimo {item.minimum_cards}</option>)}</select><small className="field-help">{activeFormat?.description}</small></label>
        <div className="deck-colors"><span>Cores escolhidas</span><div>{deckColors.length ? deckColors.map((color) => <b key={color}>{color}</b>) : <small>Adicione cartas para definir as cores</small>}</div></div>
        {activeFormat && <div className="format-rules"><strong>Regras do formato</strong><span>Mínimo: {activeFormat.minimum_cards} cartas</span><span>{activeFormat.maximum_copies === null ? 'Cópias: conforme o card pool' : `Cópias: até ${activeFormat.maximum_copies} por nome completo`}</span><span>{activeFormat.maximum_colors === null ? 'Tintas: sem limite' : `Tintas: até ${activeFormat.maximum_colors}`}</span><span>{activeFormat.uses_rotation ? 'Rotação vigente aplicada' : 'Sem rotação'}</span>{activeFormat.banned_cards.length > 0 && <span className="format-rules__ban">Banida: {activeFormat.banned_cards.join(', ')}</span>}{activeFormat.requires_card_pool && <small>A legalidade do card pool fornecido pelo evento deve ser conferida pelo organizador.</small>}</div>}
      </section>
      <div className="builder-tabs" role="tablist"><button className={mode === 'cards' ? 'active' : ''} onClick={() => setMode('cards')}>Explorar cartas</button><button className={mode === 'import' ? 'active' : ''} onClick={() => setMode('import')}>Importar arquivo ou lista</button></div>
      <div className="builder-layout">
        <section className="builder-workspace">
          {mode === 'cards' ? <>
            <form className="builder-search" onSubmit={searchCards}><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} type="search" placeholder="Buscar por nome ou texto da carta..." /><button className="button button--primary">Buscar</button></form>
            <div className="builder-filter-row">
              <select aria-label="Coleção" value={query.set} onChange={(event) => setQuery((current) => ({ ...current, set: event.target.value }))}><option value="">Todas as coleções</option>{sets.map((set) => <option key={set.code} value={set.code}>{set.name_original}</option>)}</select>
              <select aria-label="Cor" value={query.color} onChange={(event) => setQuery((current) => ({ ...current, color: event.target.value }))}><option value="">Todas as cores</option>{filters?.colors.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <select aria-label="Tipo" value={query.type} onChange={(event) => setQuery((current) => ({ ...current, type: event.target.value }))}><option value="">Todos os tipos</option>{filters?.types.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              <button type="button" onClick={() => { setSearchDraft(''); setQuery({ q: '', set: '', color: '', type: '' }); }}>Limpar filtros <span>×</span></button>
            </div>
            {loading ? <div className="builder-loading">Carregando cartas…</div> : <div className="builder-card-grid">{cards.map((card) => { const limit = activeFormat?.maximum_copies === null ? null : Math.max(activeFormat?.maximum_copies ?? 4, card.max_copies_in_deck || 4); return <BuilderCard key={card.id} card={card} quantity={groupQuantity(card)} limit={limit} onOpen={() => setSelectedCard(card)} onAdd={() => addCard(card)} />; })}</div>}
          </> : <div className="deck-import"><div className="deck-import__intro"><span>Importar deck</span><h2>Traga sua lista para o Jogar TCG</h2><p>Importe TXT, CSV, JSON, DEK, listas copiadas de outros sites ou um link público do Dreamborn.ink.</p></div><label className="deck-url-input"><span>Link público do Dreamborn.ink</span><input type="url" value={importUrl} onChange={(event) => setImportUrl(event.target.value)} placeholder="https://dreamborn.ink/decks/..." /></label><div className="import-divider"><span>ou escolha um arquivo</span></div><label className="file-drop" htmlFor="deck-file"><input id="deck-file" type="file" accept=".txt,.csv,.json,.dek" onChange={(event) => void readFile(event)} /><b>↑</b><strong>Escolher arquivo do dispositivo</strong><span>TXT, CSV, JSON ou DEK · até 2 MB</span></label><div className="import-divider"><span>ou cole sua lista</span></div><label className="deck-list-input"><span>Lista do deck</span><textarea rows={9} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder={'4 HeiHei - Boat Snack\n4 Ariel - Spectacular Singer'} /></label><button className="button button--primary" type="button" disabled={importing} onClick={() => void analyzeImport()}>{importing ? 'Analisando…' : 'Analisar lista'}</button></div>}
        </section>
        <aside className="deck-panel"><div className="deck-panel__header"><div><span>{activeFormat?.label || 'Seu deck'}</span><strong>{name || 'Sem nome'}</strong></div><b className={!validationIssues.length ? 'complete' : ''}>{totalCards}<small>/{minimumCards}</small></b></div><div className="deck-panel__progress"><i style={{ width: `${Math.min((totalCards / minimumCards) * 100, 100)}%` }} /></div>
          {entries.length ? <div className="deck-list">{entries.map(({ card, quantity }) => { const limit = activeFormat?.maximum_copies === null ? null : Math.max(activeFormat?.maximum_copies ?? 4, card.max_copies_in_deck || 4); return <div className="deck-list__item" key={card.id}><img src={card.image.thumbnail || card.image.full || ''} alt="" /><div><strong>{card.name}</strong><span>{card.cost ?? '—'} tinta · {card.rarity} · {limit === null ? 'sem limite de cópias' : `limite ${limit} somando as artes`}</span></div><div className="quantity-control"><button onClick={() => removeCard(card.id)}>−</button><b>{quantity}</b><button onClick={() => addCard(card)} disabled={limit !== null && groupQuantity(card) >= limit}>+</button></div></div>; })}</div> : <div className="deck-empty"><span>◇</span><strong>Seu deck está vazio</strong><p>Use o botão “+” nas cartas ou importe uma lista.</p></div>}
          <div className="deck-panel__summary"><span>Cartas diferentes <b>{entries.length}</b></span><span>Cores <b>{deckColors.length || '—'}</b></span></div><button className="button button--primary button--large" type="button" disabled={saving} onClick={() => void handleSave()}>{saving ? 'Salvando…' : currentId ? 'Salvar alterações' : 'Salvar deck'}</button>{currentId && <div className="deck-export"><span>Exportar</span>{(['txt', 'csv', 'json', 'dek'] as const).map((type) => <button type="button" key={type} onClick={() => void exportCurrent(type)}>{type.toUpperCase()}</button>)}</div>}{notice && <div className={`feedback feedback--${noticeType}`} role="status">{notice}</div>}</aside>
      </div>
      {selectedCard && (
        <div className="card-preview" onMouseDown={() => setSelectedCard(null)}>
          <section className="card-preview__dialog card-preview__dialog--complete" role="dialog" aria-modal="true" aria-label={`Detalhes de ${selectedCard.full_name}`} onMouseDown={(event) => event.stopPropagation()}>
            <button className="card-preview__close" type="button" onClick={() => setSelectedCard(null)} aria-label="Fechar detalhes">×</button>
            <div className="card-preview__visual">
              <CardGallery printings={cardPrintingsOf(selectedDetail ?? selectedCard)} alt={`Carta original ${selectedCard.full_name}`} selectedId={modalPrintingId ?? selectedCard.id} onSelect={(printing) => setModalPrintingId(printing.id)} />
              <small>{cardPrintingsOf(selectedDetail ?? selectedCard).length > 1 ? 'Escolha a arte que vai para o deck. ' : ''}A imagem permanece no idioma original.</small>
            </div>
            <div className="card-preview__content">
              {!selectedDetail && !detailError && <div className="detail-skeleton">Carregando tradução e ficha completa…</div>}
              {detailError && <div className="feedback feedback--error">{detailError}</div>}
              {selectedDetail && <>
                <span className="eyebrow"><i /> Coleção {modalView?.set_code} · Carta #{modalView?.number ?? '—'}</span>
                <h2>{selectedDetail.pt_br.full_name || selectedDetail.full_name}</h2>
                <p className="card-preview__original-name">Original: {selectedDetail.original.full_name}</p>
                <div className="detail-tags card-preview__tags">
                  <span>{selectedDetail.color}</span><span>{selectedDetail.type}</span><span>{modalView?.rarity}</span>
                  {selectedDetail.inkwell && <span>Tinteiro</span>}
                </div>
                <div className="card-preview__stats">
                  <span><small>Custo</small><b>{selectedDetail.cost ?? '—'}</b></span>
                  <span><small>Força</small><b>{selectedDetail.strength ?? '—'}</b></span>
                  <span><small>Vontade</small><b>{selectedDetail.willpower ?? '—'}</b></span>
                  <span><small>Lore</small><b>{selectedDetail.lore ?? '—'}</b></span>
                </div>
                <section className="card-preview__translation">
                  <span>Tradução PT-BR</span>
                  {selectedDetail.pt_br.story && <small>História: {selectedDetail.pt_br.story}</small>}
                  {selectedDetail.pt_br.subtypes_text && <strong>{selectedDetail.pt_br.subtypes_text}</strong>}
                  <p>{selectedDetail.pt_br.full_text ? <CardText text={selectedDetail.pt_br.full_text} /> : 'Esta carta não possui texto de regras.'}</p>
                  {selectedDetail.pt_br.flavor_text && <blockquote>{selectedDetail.pt_br.flavor_text}</blockquote>}
                  {detailLines(selectedDetail.pt_br.clarifications).map((line, index) => <p className="card-preview__note" key={`clarification-${index}`}><b>Esclarecimento:</b> <CardText text={line} /></p>)}
                  {detailLines(selectedDetail.pt_br.errata).map((line, index) => <p className="card-preview__note" key={`errata-${index}`}><b>Errata:</b> <CardText text={line} /></p>)}
                </section>
                <dl className="card-preview__meta">
                  <div><dt>Artista</dt><dd>{selectedDetail.artists?.join(', ') || 'Não informado'}</dd></div>
                  <div><dt>Limite no deck</dt><dd>{selectedDetail.max_copies_in_deck} cópia(s)</dd></div>
                  <div><dt>Formato Core</dt><dd>{selectedDetail.allowed_in_formats?.Core?.allowed ? 'Permitida' : 'Não permitida'}</dd></div>
                  <div><dt>Formato Infinity</dt><dd>{selectedDetail.allowed_in_formats?.Infinity?.allowed ? 'Permitida' : 'Não permitida'}</dd></div>
                </dl>
                <details className="card-preview__original">
                  <summary>Conferir texto original em inglês</summary>
                  {selectedDetail.original.subtypes_text && <strong>{selectedDetail.original.subtypes_text}</strong>}
                  <p>{selectedDetail.original.full_text ? <CardText text={selectedDetail.original.full_text} /> : 'This card has no rules text.'}</p>
                  {selectedDetail.original.flavor_text && <blockquote>{selectedDetail.original.flavor_text}</blockquote>}
                </details>
                {(() => {
                  const printings = cardPrintingsOf(selectedDetail);
                  const chosen = withPrinting(selectedDetail, printings.find((printing) => printing.id === modalPrintingId));
                  const limit = activeFormat?.maximum_copies === null ? Number.POSITIVE_INFINITY : Math.max(activeFormat?.maximum_copies ?? 4, selectedDetail.max_copies_in_deck || 4);
                  const inDeck = groupQuantity(selectedDetail);
                  const full = inDeck >= limit;
                  return <>
                    {inDeck > 0 && <p className="card-preview__in-deck">No deck: {inDeck} cópia(s) desta carta{printings.length > 1 ? `, ${deck[chosen.id]?.quantity ?? 0} com esta arte` : ''}.</p>}
                    <button className="button button--primary button--large" type="button" disabled={full} onClick={() => { addCard(chosen); setSelectedCard(null); }}>
                      {full ? `Limite de ${limit} cópia(s) somando as artes` : printings.length > 1 ? 'Adicionar esta arte ao deck' : 'Adicionar ao deck'}
                    </button>
                  </>;
                })()}
                <Link to={`/cartas/${modalView?.id ?? selectedDetail.id}`}>Abrir página pública da carta →</Link>
              </>}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
