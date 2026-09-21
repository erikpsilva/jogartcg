import { API_BASE_URL } from '../config/api';
import type { RegistrationErrors, RegistrationValues } from '../validation/registration';
import { normalizeSpaces, onlyDigits } from '../validation/registration';

export interface AuthUser {
  id: number;
  nome: string;
  sobrenome: string;
  email: string;
  foto_perfil: string | null;
  beta_tester: boolean;
}

export type RegisteredUser = AuthUser;
export interface AuthSession { user: AuthUser; csrf_token: string; }

export interface UserProfile extends AuthUser {
  telefone: string | null;
  cpf: string;
  data_nascimento: string;
  created_at: string;
}

export interface ProfileValues {
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: string;
  currentPassword: string;
  newPassword: string;
  passwordConfirmation: string;
}

export type ProfileErrors = Partial<Record<keyof ProfileValues | 'photo', string>>;

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try { return (await response.json()) as Record<string, unknown>; } catch { return {}; }
}

export async function getSession(): Promise<{ authenticated: boolean; user: AuthUser | null; csrf_token: string }> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Nao foi possivel consultar a sessao.');
  const body = await response.json() as { data: { authenticated: boolean; user: AuthUser | null; csrf_token: string } };
  return body.data;
}

export async function loginUser(email: string, password: string): Promise<AuthSession> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password })
  });
  const body = await readJson(response);
  if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : 'Nao foi possivel entrar.');
  return body.data as unknown as AuthSession;
}

export async function logoutUser(csrfToken: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken }
  });
  if (!response.ok) throw new Error('Nao foi possivel encerrar a sessao.');
}

export async function getUserProfile(): Promise<UserProfile> {
  const response = await fetch(`${API_BASE_URL}/auth/profile`, { credentials: 'include', headers: { Accept: 'application/json' } });
  const body = await readJson(response);
  if (!response.ok) throw new Error(typeof body.message === 'string' ? body.message : 'Nao foi possivel carregar seus dados.');
  return body.data as unknown as UserProfile;
}

export async function updateUserProfile(values: ProfileValues, csrfToken: string, photo?: File | null): Promise<{ profile: UserProfile; user: AuthUser }> {
  const form = new FormData();
  Object.entries(values).forEach(([key, value]) => form.append(key, key === 'phone' ? onlyDigits(value) : value));
  if (photo) form.append('photo', photo);
  const response = await fetch(`${API_BASE_URL}/auth/profile`, {
    method: 'POST', credentials: 'include', headers: { Accept: 'application/json', 'X-CSRF-Token': csrfToken }, body: form
  });
  const body = await readJson(response);
  if (!response.ok) {
    const error = new Error(typeof body.message === 'string' ? body.message : 'Nao foi possivel salvar seus dados.') as Error & { fields?: ProfileErrors };
    error.fields = (body.errors ?? {}) as ProfileErrors;
    throw error;
  }
  return body.data as unknown as { profile: UserProfile; user: AuthUser };
}

export interface RegisterSuccess { success: true; message: string; data: AuthSession; }
export interface RegisterFailure { success: false; message: string; errors: RegistrationErrors & { photo?: string }; }
export type RegisterResult = RegisterSuccess | RegisterFailure;

export async function registerUser(values: RegistrationValues, photo?: File | null): Promise<RegisterResult> {
  const payload = {
    firstName: normalizeSpaces(values.firstName), lastName: normalizeSpaces(values.lastName),
    email: values.email.trim().toLowerCase(), phone: onlyDigits(values.phone), cpf: onlyDigits(values.cpf),
    birthDate: values.birthDate, password: values.password,
    passwordConfirmation: values.passwordConfirmation, acceptedTerms: values.acceptedTerms
  };
  const form = new FormData();
  Object.entries(payload).forEach(([key, value]) => form.append(key, String(value)));
  if (photo) form.append('photo', photo);
  const response = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST', credentials: 'include', headers: { Accept: 'application/json' }, body: form
  });
  const body = await readJson(response);
  if (response.ok && body.success && body.data) {
    return { success: true, message: typeof body.message === 'string' ? body.message : 'Conta criada.', data: body.data as unknown as AuthSession };
  }
  return {
    success: false,
    message: typeof body.message === 'string' ? body.message : 'Nao foi possivel criar sua conta agora.',
    errors: (body.errors ?? {}) as RegistrationErrors & { photo?: string }
  };
}

interface AvailabilityResponse { success: boolean; data: { checked: boolean; available: boolean | null; message: string | null } }
export async function checkFieldAvailability(field: 'email' | 'cpf', value: string, signal?: AbortSignal): Promise<string | null> {
  const normalized = field === 'email' ? value.trim().toLowerCase() : onlyDigits(value);
  const query = new URLSearchParams({ field, value: normalized });
  const options: RequestInit = { credentials: 'include', headers: { Accept: 'application/json' } };
  if (signal) options.signal = signal;
  const response = await fetch(`${API_BASE_URL}/auth/available?${query}`, options);
  if (!response.ok) return null;
  const body = await response.json() as AvailabilityResponse;
  return body.success && body.data.checked && body.data.available === false ? body.data.message : null;
}
