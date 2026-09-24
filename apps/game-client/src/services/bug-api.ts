import { apiUrl } from '../config/api';

async function body(response: Response) { try { return await response.json() as { data?: { question?: string }; message?: string }; } catch { return {}; } }

export async function getBugChallenge(): Promise<string> {
  const response = await fetch(apiUrl('/bugs/challenge'), { credentials: 'include' });
  const result = await body(response);
  if (!response.ok) throw new Error(result.message || 'Não foi possível carregar a validação.');
  return result.data?.question || '';
}

export async function sendBugReport(report: string, captcha: string, csrfToken: string): Promise<string> {
  const response = await fetch(apiUrl('/bugs'), { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, body: JSON.stringify({ report, captcha, page: window.location.href }) });
  const result = await body(response);
  if (!response.ok) throw new Error(result.message || 'Não foi possível enviar o relato.');
  return result.message || 'Relato enviado com sucesso.';
}
