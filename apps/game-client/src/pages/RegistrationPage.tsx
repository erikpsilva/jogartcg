import { type ChangeEvent, type FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { checkFieldAvailability, registerUser, type RegisteredUser } from '../services/auth-api';
import { useAuth } from '../auth/AuthContext';
import {
  emptyRegistrationValues,
  formatCpf,
  formatPhone,
  onlyDigits,
  passwordStrength,
  REGISTRATION_FIELDS,
  validateRegistration,
  validateRegistrationField,
  type RegistrationErrors,
  type RegistrationField,
  type RegistrationValues
} from '../validation/registration';

type TouchedMap = Partial<Record<RegistrationField, boolean>>;
type MaskedField = 'cpf' | 'phone';

/** Ordem usada para levar o foco ao primeiro campo com erro. */
const FIELD_ORDER = REGISTRATION_FIELDS;

export function RegistrationPage() {
  const { refresh } = useAuth();
  const [values, setValues] = useState<RegistrationValues>(emptyRegistrationValues);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [touched, setTouched] = useState<TouchedMap>({});
  const [checking, setChecking] = useState<{ email: boolean; cpf: boolean }>({
    email: false,
    cpf: false
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [createdUser, setCreatedUser] = useState<RegisteredUser | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState('');

  const formRef = useRef<HTMLFormElement>(null);
  const availabilityRequests = useRef<Partial<Record<'email' | 'cpf', AbortController>>>({});
  // Guarda sempre o ultimo estado para que blur logo apos digitar nao leia
  // valores de um render anterior.
  const valuesRef = useRef(values);
  valuesRef.current = values;
  // Posicao do cursor a restaurar depois que a mascara reescreve o campo.
  const caretRequest = useRef<{ field: MaskedField; digits: number } | null>(null);

  useEffect(() => {
    const requests = availabilityRequests.current;
    return () => {
      Object.values(requests).forEach((controller) => controller?.abort());
    };
  }, []);

  /**
   * A mascara reescreve o valor inteiro, o que jogaria o cursor para o fim se
   * a pessoa estivesse editando no meio do campo. Reposicionamos contando
   * quantos digitos existiam antes do cursor.
   */
  useLayoutEffect(() => {
    const request = caretRequest.current;
    if (!request) return;
    caretRequest.current = null;

    const input = formRef.current?.querySelector<HTMLInputElement>(`[name="${request.field}"]`);
    if (!input || document.activeElement !== input) return;

    let digitsSeen = 0;
    let index = 0;
    while (index < input.value.length && digitsSeen < request.digits) {
      if (/\d/.test(input.value.charAt(index))) digitsSeen += 1;
      index += 1;
    }
    input.setSelectionRange(index, index);
  });

  function focusField(field: RegistrationField) {
    const element = formRef.current?.querySelector<HTMLElement>(`[name="${field}"]`);
    element?.focus();
  }

  /**
   * Revalida um campo e guarda a mensagem. Enquanto o campo nao foi tocado nem
   * houve tentativa de envio, o erro fica guardado mas nao aparece na tela, para
   * nao acusar "campo obrigatorio" na primeira letra digitada.
   */
  function revalidate(field: RegistrationField, nextValues: RegistrationValues) {
    const message = validateRegistrationField(field, nextValues);

    setErrors((current) => {
      const next = { ...current };
      if (message) {
        next[field] = message;
      } else {
        delete next[field];
      }

      // A confirmacao depende da senha: acompanha as mudancas dela.
      if (field === 'password') {
        const confirmationMessage = validateRegistrationField('passwordConfirmation', nextValues);
        if (confirmationMessage && nextValues.passwordConfirmation !== '') {
          next.passwordConfirmation = confirmationMessage;
        } else if (!confirmationMessage) {
          delete next.passwordConfirmation;
        }
      }

      return next;
    });
  }

  function handleChange(field: RegistrationField, value: string | boolean) {
    const nextValues = { ...values, [field]: value } as RegistrationValues;
    setValues(nextValues);
    setFormError('');
    revalidate(field, nextValues);
  }

  /** Campos com mascara: formata o texto e preserva a posicao do cursor. */
  function handleMaskedChange(field: MaskedField, event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const caret = event.target.selectionStart ?? raw.length;
    caretRequest.current = { field, digits: onlyDigits(raw.slice(0, caret)).length };

    handleChange(field, field === 'cpf' ? formatCpf(raw) : formatPhone(raw));
  }

  /** Consulta o banco para e-mail e CPF, que sao chaves unicas. */
  async function runAvailabilityCheck(field: 'email' | 'cpf', nextValues: RegistrationValues) {
    if (validateRegistrationField(field, nextValues)) return;

    availabilityRequests.current[field]?.abort();
    const controller = new AbortController();
    availabilityRequests.current[field] = controller;

    setChecking((current) => ({ ...current, [field]: true }));
    try {
      const message = await checkFieldAvailability(field, nextValues[field], controller.signal);
      if (controller.signal.aborted) return;
      if (message) {
        setErrors((current) => ({ ...current, [field]: message }));
      }
    } catch {
      // Falha de rede na checagem nao bloqueia o formulario: o INSERT com chave
      // unica continua sendo a validacao definitiva no envio.
    } finally {
      if (!controller.signal.aborted) {
        setChecking((current) => ({ ...current, [field]: false }));
      }
    }
  }

  function handleBlur(field: RegistrationField) {
    const latest = valuesRef.current;
    setTouched((current) => ({ ...current, [field]: true }));
    revalidate(field, latest);

    if (field === 'email' || field === 'cpf') {
      void runAvailabilityCheck(field, latest);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const allTouched = FIELD_ORDER.reduce<TouchedMap>((accumulator, field) => {
      accumulator[field] = true;
      return accumulator;
    }, {});
    setTouched(allTouched);

    const localErrors = validateRegistration(values);
    setErrors(localErrors);

    const firstInvalid = FIELD_ORDER.find((field) => localErrors[field]);
    if (firstInvalid) {
      setFormError('Confira os campos destacados e tente novamente.');
      focusField(firstInvalid);
      return;
    }

    setSubmitting(true);
    setFormError('');
    try {
      const result = await registerUser(values, photo);

      if (result.success) {
        await refresh();
        setCreatedUser(result.data.user);
        return;
      }

      setErrors(result.errors);
      setPhotoError(result.errors.photo ?? '');
      setFormError(result.message);

      const firstServerError = FIELD_ORDER.find((field) => result.errors[field]);
      if (firstServerError) focusField(firstServerError);
    } catch {
      setFormError('Nao foi possivel falar com o servidor. Verifique sua conexao e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  }

  function errorFor(field: RegistrationField): string | undefined {
    return touched[field] ? errors[field] : undefined;
  }

  function fieldProps(field: RegistrationField) {
    const message = errorFor(field);
    return {
      name: field,
      id: `field-${field}`,
      'aria-invalid': message ? true : undefined,
      'aria-describedby': message ? `error-${field}` : undefined,
      onBlur: () => handleBlur(field)
    };
  }

  if (createdUser) {
    return (
      <div className="registration-page page-container">
        <header className="registration-heading">
          <span className="eyebrow">
            <i /> Conta criada
          </span>
          <h1>Bem-vindo, {createdUser.nome}.</h1>
          <p>
            Sua conta foi criada com o e-mail <strong>{createdUser.email}</strong>. Use ele para
            entrar e montar seus decks.
          </p>
        </header>

        <div className="registration-card registration-card--success">
          <div className="feedback feedback--success" role="status">
            Cadastro concluido, salvo e sua sessao ja esta ativa.
          </div>
          <div className="registration-actions">
            <Link to="/cartas">Ver o catalogo</Link>
            <Link className="button button--primary" to="/decks/novo">
              Montar meu primeiro deck
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const strength = passwordStrength(values.password);

  return (
    <div className="registration-page page-container">
      <header className="registration-heading">
        <span className="eyebrow">
          <i /> Novo jogador
        </span>
        <h1>Crie sua conta.</h1>
        <p>Tenha seus decks, importacoes e partidas disponiveis em qualquer dispositivo.</p>
      </header>

      <form className="registration-card" onSubmit={handleSubmit} noValidate ref={formRef}>
        <section className="profile-photo-field">
          <div className="profile-photo-field__preview">{photo ? <img src={URL.createObjectURL(photo)} alt="Previa da foto" /> : '+'}</div>
          <div>
            <strong>Foto de perfil</strong>
            <p>Opcional · JPG ou PNG · maximo de 5 MB</p>
            <label htmlFor="profile-photo">Escolher foto</label>
            <input id="profile-photo" type="file" accept="image/png,image/jpeg" onChange={(event) => {
              const file = event.target.files?.[0] ?? null;
              if (file && file.size > 5 * 1024 * 1024) { setPhoto(null); setPhotoError('A foto deve ter no maximo 5 MB.'); return; }
              setPhoto(file); setPhotoError('');
            }} />
            {photoError && <small className="field-error" role="alert">{photoError}</small>}
          </div>
        </section>

        <div className="registration-section-title">
          <span>01</span>
          <div>
            <strong>Dados pessoais</strong>
            <small>Conte um pouco sobre voce</small>
          </div>
        </div>

        <div className="registration-grid">
          <label className={errorFor('firstName') ? 'is-invalid' : undefined}>
            <span>Nome</span>
            <input
              {...fieldProps('firstName')}
              type="text"
              placeholder="Seu nome"
              autoComplete="given-name"
              maxLength={80}
              value={values.firstName}
              onChange={(event) => handleChange('firstName', event.target.value)}
            />
            {errorFor('firstName') && (
              <small className="field-error" id="error-firstName" role="alert">
                {errorFor('firstName')}
              </small>
            )}
          </label>

          <label className={errorFor('lastName') ? 'is-invalid' : undefined}>
            <span>Sobrenome</span>
            <input
              {...fieldProps('lastName')}
              type="text"
              placeholder="Seu sobrenome"
              autoComplete="family-name"
              maxLength={120}
              value={values.lastName}
              onChange={(event) => handleChange('lastName', event.target.value)}
            />
            {errorFor('lastName') && (
              <small className="field-error" id="error-lastName" role="alert">
                {errorFor('lastName')}
              </small>
            )}
          </label>

          <label className={`field-span-2 ${errorFor('email') ? 'is-invalid' : ''}`.trim()}>
            <span>
              E-mail
              {checking.email && <em className="field-checking">verificando…</em>}
            </span>
            <input
              {...fieldProps('email')}
              type="email"
              placeholder="voce@exemplo.com"
              autoComplete="email"
              maxLength={190}
              value={values.email}
              onChange={(event) => handleChange('email', event.target.value)}
            />
            {errorFor('email') && (
              <small className="field-error" id="error-email" role="alert">
                {errorFor('email')}
              </small>
            )}
          </label>

          <label className={errorFor('phone') ? 'is-invalid' : undefined}>
            <span>Telefone</span>
            <input
              {...fieldProps('phone')}
              type="tel"
              placeholder="(00) 00000-0000"
              autoComplete="tel"
              inputMode="numeric"
              value={values.phone}
              onChange={(event) => handleMaskedChange('phone', event)}
            />
            {errorFor('phone') && (
              <small className="field-error" id="error-phone" role="alert">
                {errorFor('phone')}
              </small>
            )}
          </label>

          <label className={errorFor('cpf') ? 'is-invalid' : undefined}>
            <span>
              CPF
              {checking.cpf && <em className="field-checking">verificando…</em>}
            </span>
            <input
              {...fieldProps('cpf')}
              type="text"
              placeholder="000.000.000-00"
              inputMode="numeric"
              value={values.cpf}
              onChange={(event) => handleMaskedChange('cpf', event)}
            />
            {errorFor('cpf') && (
              <small className="field-error" id="error-cpf" role="alert">
                {errorFor('cpf')}
              </small>
            )}
          </label>

          <label className={errorFor('birthDate') ? 'is-invalid' : undefined}>
            <span>Data de nascimento</span>
            <input
              {...fieldProps('birthDate')}
              type="date"
              autoComplete="bday"
              value={values.birthDate}
              onChange={(event) => handleChange('birthDate', event.target.value)}
            />
            {errorFor('birthDate') && (
              <small className="field-error" id="error-birthDate" role="alert">
                {errorFor('birthDate')}
              </small>
            )}
          </label>
        </div>

        <div className="registration-section-title">
          <span>02</span>
          <div>
            <strong>Seguranca</strong>
            <small>Defina seus dados de acesso</small>
          </div>
        </div>

        <div className="registration-grid">
          <label className={errorFor('password') ? 'is-invalid' : undefined}>
            <span>Senha</span>
            <input
              {...fieldProps('password')}
              type="password"
              placeholder="Crie uma senha"
              autoComplete="new-password"
              value={values.password}
              onChange={(event) => handleChange('password', event.target.value)}
            />
            {values.password && (
              <span className={`password-meter password-meter--${strength.score}`}>
                <i />
                <em>{strength.label}</em>
              </span>
            )}
            {errorFor('password') ? (
              <small className="field-error" id="error-password" role="alert">
                {errorFor('password')}
              </small>
            ) : (
              <small className="field-hint">
                Minimo de 8 caracteres com maiuscula, minuscula, numero e simbolo.
              </small>
            )}
          </label>

          <label className={errorFor('passwordConfirmation') ? 'is-invalid' : undefined}>
            <span>Confirmar senha</span>
            <input
              {...fieldProps('passwordConfirmation')}
              type="password"
              placeholder="Repita a senha"
              autoComplete="new-password"
              value={values.passwordConfirmation}
              onChange={(event) => handleChange('passwordConfirmation', event.target.value)}
            />
            {errorFor('passwordConfirmation') && (
              <small className="field-error" id="error-passwordConfirmation" role="alert">
                {errorFor('passwordConfirmation')}
              </small>
            )}
          </label>
        </div>

        <div className={`registration-consent-block ${errorFor('acceptedTerms') ? 'is-invalid' : ''}`.trim()}>
          <label className="registration-consent">
            <input
              {...fieldProps('acceptedTerms')}
              type="checkbox"
              checked={values.acceptedTerms}
              onChange={(event) => handleChange('acceptedTerms', event.target.checked)}
            />
            <span>Li e aceito os termos de uso e a politica de privacidade do Jogar TCG.</span>
          </label>
          {errorFor('acceptedTerms') && (
            <small className="field-error" id="error-acceptedTerms" role="alert">
              {errorFor('acceptedTerms')}
            </small>
          )}
        </div>

        {formError && (
          <div className="feedback feedback--error" role="alert">
            {formError}
          </div>
        )}

        <div className="registration-actions">
          <Link to="/entrar">Ja tenho uma conta</Link>
          <button className="button button--primary" type="submit" disabled={submitting}>
            {submitting ? 'Criando conta…' : 'Criar minha conta'}
          </button>
        </div>
      </form>
    </div>
  );
}
