'use strict';
(() => {
  const base = document.body.dataset.base;
  const byId = (id) => document.getElementById(id);
  const detail = byId('detail');
  const content = byId('detail-content');
  const collected = new Map();
  const pending = new Set();
  let detailRequest = 0;

  async function api(path, options = {}) {
    const response = await fetch(`${base}/api/index.php?r=${encodeURIComponent('/v1' + path)}`, { credentials: 'same-origin', ...options });
    let payload;
    try { payload = await response.json(); } catch { throw new Error('O servidor não respondeu como esperado. Tente novamente.'); }
    if (!response.ok || !payload.success) {
      const error = new Error(payload.message || 'Não foi possível carregar os dados. Tente novamente.');
      error.status = response.status;
      throw error;
    }
    return payload.data;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function updateButtons(id) {
    document.querySelectorAll('[data-collect]').forEach((button) => {
      if (button.dataset.collect !== id) return;
      button.disabled = pending.has(id);
      button.textContent = pending.has(id) ? 'Salvando…' : collected.has(id) ? '✓ Ver em Meus Decks' : '+ Minha coleção';
    });
  }

  function notify(message, deckId) {
    const box = detail.open ? byId('detail-notice') : byId('notice');
    if (!box) return;
    box.replaceChildren(document.createTextNode(message));
    if (deckId) {
      const link = element('a', '', ' Abrir em Meus Decks →');
      link.href = `${base}/client/#/decks/${deckId}`;
      box.append(link);
    }
    box.hidden = false;
  }

  function askLogin(id) {
    const redirect = encodeURIComponent(`/starter-decks?deck=${id}`);
    byId('login-link').href = `${base}/client/#/entrar?redirect=${redirect}`;
    byId('register-link').href = `${base}/client/#/entrar?modo=cadastro&redirect=${redirect}`;
    if (!byId('login').open) byId('login').showModal();
  }

  async function collect(id) {
    if (pending.has(id)) return;
    if (collected.has(id)) { window.location.href = `${base}/client/#/decks/${collected.get(id)}`; return; }
    pending.add(id);
    updateButtons(id);
    try {
      const session = await api('/auth/me');
      if (!session.authenticated) { askLogin(id); return; }
      const result = await api(`/starter-decks/${id}/collect`, {
        method: 'POST', headers: { 'X-CSRF-Token': session.csrf_token, 'Content-Type': 'application/json' }, body: '{}',
      });
      collected.set(id, result.deck_id);
      notify(result.created ? 'Deck adicionado à sua coleção.' : 'Este starter já está na sua coleção.', result.deck_id);
    } catch (error) {
      if (error.status === 401) askLogin(id);
      else notify(error.message);
    } finally { pending.delete(id); updateButtons(id); }
  }

  function renderDeck(deck) {
    byId('detail-title').textContent = deck.name;
    byId('detail-set').textContent = deck.set;
    content.replaceChildren();
    const intro = element('div', 'detail-intro');
    const cover = element('img'); cover.src = `${base}/${deck.cover}`; cover.alt = `Embalagem de ${deck.name}`;
    const info = element('div');
    const inks = element('span', 'lorcana-inks');
    const inkNames = { Amber: 'Âmbar', Amethyst: 'Ametista', Emerald: 'Esmeralda', Ruby: 'Rubi', Sapphire: 'Safira', Steel: 'Aço' };
    for (const color of deck.colors) {
      if (!inkNames[color]) continue;
      const badge = element('span', 'lorcana-ink');
      const symbol = element('img'); symbol.src = `${base}/images/icons/${color.toLowerCase()}.webp`; symbol.alt = ''; symbol.width = 30; symbol.height = 34;
      badge.append(symbol, element('span', '', inkNames[color])); inks.append(badge);
    }
    info.append(inks);
    info.append(element('p', '', `${deck.total_cards} cartas · ${deck.cards.length} entradas na lista original`));
    info.append(element('p', 'muted', 'Uma cópia editável será salva em Meus Decks, no formato Pré-construído. A lista original permanece intacta. A presença aqui não garante compatibilidade com todas as habilidades do modo de jogo.'));
    if (deck.set_number === 12) info.append(element('p', 'muted', 'Este deck faz parte da caixa para dois jogadores. Cada lista é adicionada separadamente.'));
    if (deck.cover_language === 'de') info.append(element('p', 'muted', 'Capa da edição alemã. O conteúdo da lista é o mesmo.'));
    const actions = element('div', 'starter-actions');
    const add = element('button', '', '+ Minha coleção'); add.dataset.collect = deck.id;
    actions.append(add); info.append(actions); intro.append(cover, info); content.append(intro);
    const notice = element('div', 'notice'); notice.id = 'detail-notice'; notice.hidden = true; notice.setAttribute('role', 'status'); content.append(notice);
    if (!deck.available) {
      add.disabled = true;
      add.removeAttribute('data-collect');
      add.textContent = 'Catálogo incompleto';
      notify('A importação está indisponível até que todas as cartas deste starter estejam no catálogo.');
    }
    const grid = element('div', 'deck-cards');
    for (const entry of deck.cards) {
      const item = element('article', 'deck-card');
      if (!entry.card) {
        item.append(element('div', 'missing', `${entry.quantity}× Carta #${entry.card_id} — indisponível no catálogo`));
      } else {
        const card = entry.card;
        const fullImage = card.image.full || card.image.thumbnail;
        const button = element('button'); button.setAttribute('aria-label', `Ampliar ${card.full_name}`);
        const image = element('img'); image.src = fullImage; image.alt = card.full_name; image.loading = 'lazy';
        button.append(image, element('span', 'quantity', `${entry.quantity}×`));
        button.addEventListener('click', () => {
          byId('zoom-image').src = fullImage; byId('zoom-image').alt = card.full_name; byId('zoom').showModal();
        });
        item.append(button, element('h3', '', card.full_name), element('p', '', `${entry.quantity} cópia${entry.quantity > 1 ? 's' : ''}${entry.foil ? ' · Foil na embalagem' : ''}`));
      }
      grid.append(item);
    }
    content.append(grid);
    updateButtons(deck.id);
  }

  async function openDeck(id, updateUrl = true) {
    const request = ++detailRequest;
    if (updateUrl) {
      const url = new URL(location.href); url.searchParams.set('deck', id); history.pushState(null, '', url);
    }
    byId('detail-title').textContent = 'Carregando deck…'; byId('detail-set').textContent = 'Starter Deck';
    content.replaceChildren(element('p', 'loading', 'Buscando cartas e quantidades…'));
    if (!detail.open) detail.showModal();
    detail.scrollTop = 0;
    try {
      const deck = await api(`/starter-decks/${encodeURIComponent(id)}`);
      if (request === detailRequest && detail.open) renderDeck(deck);
    } catch (error) {
      if (request !== detailRequest || !detail.open) return;
      byId('detail-title').textContent = 'Não foi possível abrir o deck';
      const retry = element('button', 'secondary', 'Tentar novamente'); retry.addEventListener('click', () => openDeck(id, false));
      content.replaceChildren(element('p', 'error', error.message), retry);
    }
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('[data-detail]');
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey) { event.preventDefault(); openDeck(link.dataset.detail); }
    const add = event.target.closest('[data-collect]'); if (add) collect(add.dataset.collect);
    const close = event.target.closest('[data-close]'); if (close) byId(close.dataset.close).close();
  });
  detail.addEventListener('close', () => {
    ++detailRequest;
    const url = new URL(location.href); url.searchParams.delete('deck'); history.replaceState(null, '', url);
  });
  window.addEventListener('popstate', () => {
    const id = new URL(location.href).searchParams.get('deck');
    if (id) openDeck(id, false); else if (detail.open) detail.close();
  });
  const normalize = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  function filter() {
    let count = 0;
    const search = normalize(byId('search').value);
    document.querySelectorAll('.starter').forEach((card) => {
      card.hidden = !(normalize(card.dataset.name).includes(search) && (!byId('set').value || card.dataset.set === byId('set').value) && (!byId('color').value || card.dataset.colors.split(' ').includes(byId('color').value)));
      if (!card.hidden) count++;
    });
    byId('count').textContent = `${count} deck${count !== 1 ? 's' : ''} encontrado${count !== 1 ? 's' : ''}`;
    byId('empty').hidden = count !== 0;
  }
  ['search', 'set', 'color'].forEach((id) => byId(id).addEventListener('input', filter));
  document.querySelectorAll('[data-ink-filter]').forEach(button => button.addEventListener('click', () => {
    byId('color').value = button.dataset.inkFilter;
    document.querySelectorAll('[data-ink-filter]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    filter();
  }));
  const initial = new URL(location.href).searchParams.get('deck');
  if (initial) openDeck(initial, false);
})();
