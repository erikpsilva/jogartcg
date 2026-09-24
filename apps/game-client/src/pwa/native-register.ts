/** Local native-compiler adapter: the existing service worker still owns caching. */
export function registerSW({ immediate = false } = {}) {
  const register = () => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('./sw.js').catch(() => {});
  };
  if (immediate || document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
}
