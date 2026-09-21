import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CardTile } from '../components/CardTile';
import {
  getCards,
  getFilters,
  getSets,
  type CardsResponse,
  type CatalogFilters,
  type CatalogSet
} from '../services/catalog-api';

const emptyFilters: CatalogFilters = { colors: [], types: [], rarities: [], costs: [] };

export function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchDraft, setSearchDraft] = useState(searchParams.get('q') || '');
  const [response, setResponse] = useState<CardsResponse | null>(null);
  const [sets, setSets] = useState<CatalogSet[]>([]);
  const [filters, setFilters] = useState<CatalogFilters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const queryKey = searchParams.toString();
  const activeQuery = searchParams.get('q') || '';

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([getSets(controller.signal), getFilters(controller.signal)])
      .then(([setsResponse, filtersResponse]) => {
        setSets(setsResponse.data);
        setFilters(filtersResponse.data);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os filtros.');
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getCards(searchParams, controller.signal)
      .then(setResponse)
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Não foi possível carregar as cartas.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [queryKey]);

  useEffect(() => {
    setSearchDraft(activeQuery);
  }, [activeQuery]);

  const setNames = useMemo(() => new Map(sets.map((set) => [set.code, set.name_original])), [sets]);
  const activeFilterCount = ['q', 'set', 'format', 'color', 'type', 'rarity', 'cost', 'inkwell']
    .filter((key) => searchParams.has(key)).length;

  function updateFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.delete('page');
    setSearchParams(next);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateFilter('q', searchDraft.trim());
  }

  function changePage(page: number) {
    const next = new URLSearchParams(searchParams);
    next.set('page', String(page));
    setSearchParams(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearFilters() {
    setSearchDraft('');
    setSearchParams(new URLSearchParams());
  }

  const pagination = response?.pagination;

  return (
    <div className="catalog-page page-container">
      <section className="catalog-hero">
        <div className="catalog-hero__copy">
          <span className="eyebrow"><i /> Catálogo Disney Lorcana</span>
          <h1>Encontre a carta certa. <strong>Domine o jogo.</strong></h1>
          <p>Consulte a imagem original e leia os dados traduzidos em português ao lado da carta.</p>
          <div className="catalog-hero__features" aria-label="Recursos da plataforma">
            <span><b>01</b> Explore</span>
            <span><b>02</b> Monte</span>
            <span><b>03</b> Jogue</span>
          </div>
        </div>
        <div className="catalog-hero__visual" aria-hidden="true">
          <div className="hero-card hero-card--back" />
          <div className="hero-card hero-card--middle" />
          <div className="hero-card hero-card--front">
            <img src="./brand/card-icon.png" alt="" />
          </div>
          <div className="catalog-hero__count">
            <strong>{response?.pagination.total.toLocaleString('pt-BR') || '—'}</strong>
            <span>cartas no catálogo</span>
          </div>
        </div>
      </section>

      <section className="catalog-tools" aria-label="Busca e filtros do catálogo">
        <div className="catalog-tools__heading">
          <div><span>Pesquisa avançada</span><strong>Encontre sua próxima carta</strong></div>
          <small>Use os filtros para refinar o catálogo</small>
        </div>
        <form className="search-box" onSubmit={submitSearch}>
          <label htmlFor="card-search">Buscar por nome ou texto</label>
          <div>
            <input
              id="card-search"
              type="search"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder="Ex.: HeiHei, apoio, personagem…"
            />
            <button className="button button--primary" type="submit">Buscar</button>
          </div>
        </form>

        <div className="filter-grid">
          <label>
            <span>Formato</span>
            <select value={searchParams.get('format') || ''} onChange={(event) => updateFilter('format', event.target.value)}>
              <option value="">Todas as cartas</option><option value="core">Legais em Core</option><option value="infinity">Legais em Infinity</option>
            </select>
          </label>
          <label>
            <span>Coleção</span>
            <select value={searchParams.get('set') || ''} onChange={(event) => updateFilter('set', event.target.value)}>
              <option value="">Todas as coleções</option>
              {sets.filter((set) => set.has_all_cards).map((set) => (
                <option value={set.code} key={set.code}>{set.name_original}</option>
              ))}
            </select>
          </label>

          <label>
            <span>Cor</span>
            <select value={searchParams.get('color') || ''} onChange={(event) => updateFilter('color', event.target.value)}>
              <option value="">Todas as cores</option>
              {filters.colors.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label>
            <span>Tipo</span>
            <select value={searchParams.get('type') || ''} onChange={(event) => updateFilter('type', event.target.value)}>
              <option value="">Todos os tipos</option>
              {filters.types.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label>
            <span>Raridade</span>
            <select value={searchParams.get('rarity') || ''} onChange={(event) => updateFilter('rarity', event.target.value)}>
              <option value="">Todas as raridades</option>
              {filters.rarities.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </select>
          </label>

          <label>
            <span>Custo</span>
            <select value={searchParams.get('cost') || ''} onChange={(event) => updateFilter('cost', event.target.value)}>
              <option value="">Qualquer custo</option>
              {filters.costs.map((cost) => <option value={cost} key={cost}>{cost}</option>)}
            </select>
          </label>

          <label>
            <span>Tinteiro</span>
            <select value={searchParams.get('inkwell') || ''} onChange={(event) => updateFilter('inkwell', event.target.value)}>
              <option value="">Todas</option>
              <option value="1">Pode ir ao tinteiro</option>
              <option value="0">Não pode ir ao tinteiro</option>
            </select>
          </label>
        </div>

        {activeFilterCount > 0 && (
          <button className="clear-filters" type="button" onClick={clearFilters}>
            Limpar {activeFilterCount} {activeFilterCount === 1 ? 'filtro' : 'filtros'}
          </button>
        )}
      </section>

      {error && <div className="feedback feedback--error">{error}</div>}

      {loading ? (
        <div className="card-grid" aria-label="Carregando cartas">
          {Array.from({ length: 8 }, (_, index) => <div className="card-skeleton" key={index} />)}
        </div>
      ) : response?.data.length ? (
        <>
          <div className="results-summary">
            <span>Mostrando {response.data.length} {response.data.length === 1 ? 'carta' : 'cartas'}</span>
            <span>Página {pagination?.page} de {pagination?.total_pages}</span>
          </div>
          <div className="card-grid">
            {response.data.map((card) => (
              <CardTile card={card} setName={setNames.get(card.set_code)} key={card.id} />
            ))}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <nav className="pagination" aria-label="Paginação das cartas">
              <button type="button" disabled={pagination.page <= 1} onClick={() => changePage(pagination.page - 1)}>
                Anterior
              </button>
              <span><strong>{pagination.page}</strong> de {pagination.total_pages}</span>
              <button type="button" disabled={pagination.page >= pagination.total_pages} onClick={() => changePage(pagination.page + 1)}>
                Próxima
              </button>
            </nav>
          )}
        </>
      ) : (
        <div className="empty-state">
          <h2>Nenhuma carta encontrada</h2>
          <p>Tente remover algum filtro ou buscar por outro termo.</p>
          <button className="button button--primary" type="button" onClick={clearFilters}>Limpar filtros</button>
        </div>
      )}
    </div>
  );
}
