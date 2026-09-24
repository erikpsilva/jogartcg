'use strict';
/**
 * Bridge from the already-published client to native PHP pages.
 * Kept in public/ as well, so rebuilding the legacy client preserves navigation.
 * Does not rewrite compiled assets or require Node.
 */
(() => {
  const script = document.currentScript;
  const nativePage = new URL('../starter-decks/', script.src);
  function routeNativePage() {
    const route = location.hash.slice(1);
    if (!/^\/starter-decks(?:\?|$)/.test(route)) return;
    const params = new URLSearchParams(route.split('?')[1] || '');
    const id = params.get('deck');
    const target = new URL(nativePage);
    if (id && /^S\d+-\d+$/.test(id)) target.searchParams.set('deck', id);
    location.replace(target.href);
  }
  window.addEventListener('hashchange', routeNativePage);
  window.addEventListener('popstate', routeNativePage);
  // HashRouter uses History API for login redirects (no native hashchange event).
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      routeNativePage();
      return result;
    };
  }
  routeNativePage();
  function addMenuLinks() {
    document.querySelectorAll('.site-nav, .mobile-site-menu nav').forEach((nav) => {
      if (nav.querySelector('[data-native-starters]')) return;
      const link = document.createElement('a');
      link.href = nativePage.href;
      link.dataset.nativeStarters = 'true';
      link.textContent = 'Starter Deck';
      if (nav.closest('.mobile-site-menu')) {
        const description = document.createElement('small');
        description.textContent = 'Listas originais para sua coleção';
        link.append(description);
      }
      const adventure = nav.querySelector('a[href$="/gameplay"]');
      nav.insertBefore(link, adventure);
    });
  }
  function start() {
    addMenuLinks();
    const observer = new MutationObserver(addMenuLinks);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
