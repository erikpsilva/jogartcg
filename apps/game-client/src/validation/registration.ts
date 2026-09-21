/**
 * Regras de validacao do cadastro.
 *
 * Espelham config/validation.php para que o formulario avise durante a digitacao
 * sem ida ao servidor. O servidor revalida tudo: isto aqui e conveniencia, nao
 * garantia.
 */

export interface RegistrationValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  cpf: string;
  birthDate: string;
  password: string;
  passwordConfirmation: string;
  acceptedTerms: boolean;
}

export type RegistrationField = keyof RegistrationValues;

export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

export const REGISTRATION_FIELDS: RegistrationField[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'cpf',
  'birthDate',
  'password',
  'passwordConfirmation',
  'acceptedTerms'
];

const NAME_MIN = 2;
const NAME_MAX = 80;
const LAST_NAME_MAX = 120;
const EMAIL_MAX = 190;
const PASSWORD_MIN = 8;
// bcrypt so considera os primeiros 72 bytes.
const PASSWORD_MAX = 72;
const MIN_AGE = 13;
const MAX_AGE = 120;

const PERSON_NAME_PATTERN = /^\p{L}[\p{L}\s'’-]*$/u;

export const emptyRegistrationValues: RegistrationValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  cpf: '',
  birthDate: '',
  password: '',
  passwordConfirmation: '',
  acceptedTerms: false
};

export function onlyDigits(value: string): string {
  return value.replace(/\D+/g, '');
}

export function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Formata progressivamente como 000.000.000-00. */
export function formatCpf(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Formata progressivamente como (00) 0000-0000 ou (00) 00000-0000. */
export function formatPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  const area = `(${digits.slice(0, 2)}) `;
  if (digits.length <= 6) return area + digits.slice(2);
  if (digits.length <= 10) return `${area}${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `${area}${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function validatePersonName(raw: string, label: string, max: number): string | null {
  const value = normalizeSpaces(raw);

  if (value === '') return `Informe seu ${label}.`;
  if (value.length < NAME_MIN) return `O ${label} precisa ter pelo menos ${NAME_MIN} letras.`;
  if (value.length > max) return `O ${label} pode ter no maximo ${max} caracteres.`;
  if (!PERSON_NAME_PATTERN.test(value)) {
    return `Use apenas letras, espaco, hifen ou apostrofo no ${label}.`;
  }

  return null;
}

export function validateEmail(raw: string): string | null {
  const value = raw.trim().toLowerCase();

  if (value === '') return 'Informe seu e-mail.';
  if (value.length > EMAIL_MAX) return `O e-mail pode ter no maximo ${EMAIL_MAX} caracteres.`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    return 'Digite um e-mail valido, como nome@dominio.com.';
  }

  return null;
}

export function validatePhone(raw: string): string | null {
  const digits = onlyDigits(raw);

  if (digits === '') return 'Informe seu telefone com DDD.';
  if (digits.length < 10 || digits.length > 11) {
    return 'O telefone precisa ter 10 ou 11 digitos com o DDD.';
  }
  if (Number(digits.slice(0, 2)) < 11) return 'DDD invalido. Use um DDD entre 11 e 99.';
  if (digits.length === 11 && digits[2] !== '9') {
    return 'Para celular com 11 digitos o numero deve comecar com 9 apos o DDD.';
  }
  if (digits.length === 10 && Number(digits[2]) < 2) {
    return 'Numero fixo invalido. Confira o telefone digitado.';
  }

  return null;
}

export function isCpfValid(digits: string): boolean {
  if (digits.length !== 11 || !/^\d{11}$/.test(digits)) return false;
  // Sequencias como 111.111.111-11 passam no calculo, mas nao existem.
  if (/^(\d)\1{10}$/.test(digits)) return false;

  for (let position = 9; position < 11; position += 1) {
    let sum = 0;
    for (let index = 0; index < position; index += 1) {
      sum += Number(digits[index]) * (position + 1 - index);
    }
    const checkDigit = ((10 * sum) % 11) % 10;
    if (Number(digits[position]) !== checkDigit) return false;
  }

  return true;
}

export function validateCpf(raw: string): string | null {
  const digits = onlyDigits(raw);

  if (digits === '') return 'Informe seu CPF.';
  if (digits.length !== 11) return 'O CPF precisa ter 11 digitos.';
  if (!isCpfValid(digits)) return 'CPF invalido. Confira os numeros digitados.';

  return null;
}

function validateBirthDate(raw: string): string | null {
  const value = raw.trim();

  if (value === '') return 'Informe sua data de nascimento.';

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return 'Data de nascimento invalida.';

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  // Rejeita datas que o Date "conserta" sozinho, como 31/02.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return 'Data de nascimento invalida.';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (date > today) return 'A data de nascimento nao pode estar no futuro.';

  let age = today.getFullYear() - year;
  const hadBirthdayThisYear =
    today.getMonth() > month - 1 || (today.getMonth() === month - 1 && today.getDate() >= day);
  if (!hadBirthdayThisYear) age -= 1;

  if (age < MIN_AGE) return `E preciso ter pelo menos ${MIN_AGE} anos para criar uma conta.`;
  if (age > MAX_AGE) return 'Confira o ano de nascimento digitado.';

  return null;
}

export function validatePassword(raw: string): string | null {
  if (raw === '') return 'Crie uma senha.';
  if (raw.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`;
  if (new TextEncoder().encode(raw).length > PASSWORD_MAX) {
    return `A senha pode ter no maximo ${PASSWORD_MAX} caracteres.`;
  }
  if (!/\p{Lu}/u.test(raw)) return 'A senha precisa ter pelo menos uma letra maiuscula.';
  if (!/\p{Ll}/u.test(raw)) return 'A senha precisa ter pelo menos uma letra minuscula.';
  if (!/\d/.test(raw)) return 'A senha precisa ter pelo menos um numero.';
  if (!/[^\p{L}\d]/u.test(raw)) return 'A senha precisa ter pelo menos um simbolo, como ! @ # $.';

  return null;
}

/** Forca da senha usada apenas no medidor visual. */
export function passwordStrength(raw: string): { score: number; label: string } {
  if (raw === '') return { score: 0, label: '' };

  let score = 0;
  if (raw.length >= PASSWORD_MIN) score += 1;
  if (raw.length >= 12) score += 1;
  if (/\p{Lu}/u.test(raw) && /\p{Ll}/u.test(raw)) score += 1;
  if (/\d/.test(raw)) score += 1;
  if (/[^\p{L}\d]/u.test(raw)) score += 1;

  if (score <= 2) return { score: 1, label: 'Fraca' };
  if (score === 3) return { score: 2, label: 'Media' };
  if (score === 4) return { score: 3, label: 'Boa' };
  return { score: 4, label: 'Forte' };
}

export function validateRegistrationField(
  field: RegistrationField,
  values: RegistrationValues
): string | null {
  switch (field) {
    case 'firstName':
      return validatePersonName(values.firstName, 'nome', NAME_MAX);
    case 'lastName':
      return validatePersonName(values.lastName, 'sobrenome', LAST_NAME_MAX);
    case 'email':
      return validateEmail(values.email);
    case 'phone':
      return validatePhone(values.phone);
    case 'cpf':
      return validateCpf(values.cpf);
    case 'birthDate':
      return validateBirthDate(values.birthDate);
    case 'password':
      return validatePassword(values.password);
    case 'passwordConfirmation':
      if (values.passwordConfirmation === '') return 'Repita a senha para confirmar.';
      if (values.passwordConfirmation !== values.password) return 'As senhas nao sao iguais.';
      return null;
    case 'acceptedTerms':
      return values.acceptedTerms ? null : 'E preciso aceitar os termos de uso para continuar.';
    default:
      return null;
  }
}

export function validateRegistration(values: RegistrationValues): RegistrationErrors {
  const errors: RegistrationErrors = {};

  for (const field of REGISTRATION_FIELDS) {
    const message = validateRegistrationField(field, values);
    if (message) errors[field] = message;
  }

  return errors;
}
