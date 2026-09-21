import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { getUserProfile, updateUserProfile, type ProfileErrors, type ProfileValues, type UserProfile } from '../services/auth-api';
import { formatCpf, formatPhone, passwordStrength, validatePassword, validatePhone } from '../validation/registration';

const emptyValues: ProfileValues = {
  firstName: '', lastName: '', phone: '', birthDate: '', currentPassword: '', newPassword: '', passwordConfirmation: ''
};

export function ProfilePage() {
  const { csrfToken, refresh } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [values, setValues] = useState<ProfileValues>(emptyValues);
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const photoPreview = useMemo(() => photo ? URL.createObjectURL(photo) : '', [photo]);

  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview); }, [photoPreview]);

  useEffect(() => {
    getUserProfile().then((data) => {
      setProfile(data);
      setValues({ ...emptyValues, firstName: data.nome, lastName: data.sobrenome, phone: formatPhone(data.telefone ?? ""), birthDate: data.data_nascimento ?? "" });
    }).catch((reason: Error) => setNotice({ type: 'error', text: reason.message })).finally(() => setLoading(false));
  }, []);

  function change(field: keyof ProfileValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => { const next = { ...current }; delete next[field]; return next; });
    setNotice(null);
  }

  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (file && file.size > 5 * 1024 * 1024) {
      setPhoto(null); setErrors((current) => ({ ...current, photo: 'A foto deve ter no maximo 5 MB.' })); return;
    }
    setPhoto(file); setErrors((current) => { const next = { ...current }; delete next.photo; return next; });
  }

  function validate(): ProfileErrors {
    const next: ProfileErrors = {};
    if (values.firstName.trim().length < 2) next.firstName = 'Informe um nome valido.';
    if (values.lastName.trim().length < 2) next.lastName = 'Informe um sobrenome valido.';
    const phoneError = validatePhone(values.phone); if (phoneError) next.phone = phoneError;
    if (!values.birthDate) next.birthDate = 'Informe sua data de nascimento.';
    // A senha atual sozinha e ignorada: o navegador costuma auto-preenche-la.
    if (values.newPassword || values.passwordConfirmation) {
      if (!values.currentPassword) next.currentPassword = 'Informe sua senha atual.';
      const passwordError = validatePassword(values.newPassword); if (passwordError) next.newPassword = passwordError;
      if (values.passwordConfirmation !== values.newPassword) next.passwordConfirmation = 'As senhas nao sao iguais.';
    }
    return next;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const validation = validate(); setErrors(validation);
    if (Object.keys(validation).length) { setNotice({ type: 'error', text: 'Confira os campos destacados.' }); return; }
    setSaving(true); setNotice(null);
    try {
      const payload = values.newPassword ? values : { ...values, currentPassword: '' };
      const result = await updateUserProfile(payload, csrfToken, photo);
      setProfile(result.profile); setPhoto(null);
      setValues((current) => ({ ...current, currentPassword: '', newPassword: '', passwordConfirmation: '' }));
      await refresh(); setNotice({ type: 'success', text: 'Seus dados foram atualizados com sucesso.' });
    } catch (reason) {
      const error = reason as Error & { fields?: ProfileErrors };
      setErrors(error.fields ?? {}); setNotice({ type: 'error', text: error.message });
    } finally { setSaving(false); }
  }

  if (loading) return <div className="route-loading page-container">Carregando seus dados…</div>;
  if (!profile) return <div className="profile-page page-container">{notice && <div className="feedback feedback--error">{notice.text}</div>}</div>;
  const strength = passwordStrength(values.newPassword);

  return (
    <div className="profile-page page-container">
      <header className="registration-heading"><span className="eyebrow"><i /> Sua conta</span><h1>Meus dados.</h1><p>Atualize seus dados pessoais e sua senha de acesso.</p></header>
      <form className="registration-card" onSubmit={submit} noValidate>
        <section className="profile-photo-field">
          <div className="profile-photo-field__preview">{photoPreview ? <img src={photoPreview} alt="Nova foto" /> : profile.foto_perfil ? <img src={profile.foto_perfil} alt="Foto de perfil" /> : `${profile.nome.charAt(0)}${profile.sobrenome.charAt(0)}`}</div>
          <div><strong>Foto de perfil</strong><p>Opcional · JPG ou PNG · máximo de 5 MB</p><label htmlFor="profile-update-photo">Trocar foto</label><input id="profile-update-photo" type="file" accept="image/png,image/jpeg" onChange={choosePhoto} />{errors.photo && <small className="field-error">{errors.photo}</small>}</div>
        </section>

        <div className="registration-section-title"><span>01</span><div><strong>Dados pessoais</strong><small>E-mail e CPF não podem ser alterados</small></div></div>
        <div className="registration-grid">
          <label className={errors.firstName ? 'is-invalid' : ''}><span>Nome</span><input value={values.firstName} onChange={(event) => change('firstName', event.target.value)} maxLength={80} />{errors.firstName && <small className="field-error">{errors.firstName}</small>}</label>
          <label className={errors.lastName ? 'is-invalid' : ''}><span>Sobrenome</span><input value={values.lastName} onChange={(event) => change('lastName', event.target.value)} maxLength={120} />{errors.lastName && <small className="field-error">{errors.lastName}</small>}</label>
          <label className="field-span-2 profile-locked-field"><span>E-mail <em>não editável</em></span><input value={profile.email} disabled /></label>
          <label className="profile-locked-field"><span>CPF <em>não editável</em></span><input value={formatCpf(profile.cpf)} disabled /></label>
          <label className={errors.phone ? 'is-invalid' : ''}><span>Telefone</span><input type="tel" value={values.phone} onChange={(event) => change('phone', formatPhone(event.target.value))} />{errors.phone && <small className="field-error">{errors.phone}</small>}</label>
          <label className={errors.birthDate ? 'is-invalid' : ''}><span>Data de nascimento</span><input type="date" value={values.birthDate} onChange={(event) => change('birthDate', event.target.value)} />{errors.birthDate && <small className="field-error">{errors.birthDate}</small>}</label>
        </div>

        <div className="registration-section-title"><span>02</span><div><strong>Alterar senha</strong><small>Deixe em branco para manter a senha atual</small></div></div>
        <div className="registration-grid">
          <label className={`field-span-2 ${errors.currentPassword ? 'is-invalid' : ''}`}><span>Senha atual</span><input type="password" autoComplete="current-password" value={values.currentPassword} onChange={(event) => change('currentPassword', event.target.value)} />{errors.currentPassword && <small className="field-error">{errors.currentPassword}</small>}</label>
          <label className={errors.newPassword ? 'is-invalid' : ''}><span>Nova senha</span><input type="password" autoComplete="new-password" value={values.newPassword} onChange={(event) => change('newPassword', event.target.value)} />{values.newPassword && <span className={`password-meter password-meter--${strength.score}`}><i /><em>{strength.label}</em></span>}{errors.newPassword && <small className="field-error">{errors.newPassword}</small>}</label>
          <label className={errors.passwordConfirmation ? 'is-invalid' : ''}><span>Confirmar nova senha</span><input type="password" autoComplete="new-password" value={values.passwordConfirmation} onChange={(event) => change('passwordConfirmation', event.target.value)} />{errors.passwordConfirmation && <small className="field-error">{errors.passwordConfirmation}</small>}</label>
        </div>
        {notice && <div className={`feedback feedback--${notice.type}`} role="status">{notice.text}</div>}
        <div className="registration-actions"><button className="button button--primary" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button></div>
      </form>
    </div>
  );
}
