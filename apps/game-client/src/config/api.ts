import { Capacitor } from '@capacitor/core';

/**
 * Endereço da API (pasta `api`, sem a versão).
 * `VITE_API_BASE_URL` continua aceito, com ou sem `/v1` no fim.
 */
function getDefaultApiRoot(): string {
  if (Capacitor.isNativePlatform()) return 'https://www.jogartcg.com.br/api';
  if (window.location.port === '5173') return '/api';
  if (window.location.hostname === 'localhost') return `${window.location.origin}/jogartcg/api`;
  return `${window.location.origin}/api`;
}

const API_ROOT = (import.meta.env.VITE_API_BASE_URL || getDefaultApiRoot()).replace(/\/$/, '').replace(/\/v1$/, '');

/** Mantido para quem precisa só do endereço base (ex.: montar link para o suporte). */
export const API_BASE_URL = `${API_ROOT}/v1`;

/**
 * Monta a URL de uma rota da API.
 *
 * Chamamos o arquivo direto, com a rota no parâmetro `r`:
 *   /api/index.php?r=/v1/cards&lang=pt-BR
 *
 * Assim funciona em qualquer servidor, com ou sem regra de reescrita. O Nginx
 * ignora o .htaccess, e foi por isso que as rotas /api/v1/... pararam de responder
 * quando a hospedagem trocou de Apache para Nginx.
 */
export function apiUrl(path: string): string {
  const [pathname, query] = path.split('?');
  const route = `/v1${pathname.startsWith('/') ? '' : '/'}${pathname}`;
  return `${API_ROOT}/index.php?r=${encodeURIComponent(route)}${query ? `&${query}` : ''}`;
}
