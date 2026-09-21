import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { RegistrationPage } from './RegistrationPage';

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const formRef = useRef<HTMLFormElement>(null);
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const redirect = searchParams.get('redirect') || '/meus-decks';

  useEffect(() => { if (user) navigate(redirect, { replace: true }); }, [user, redirect, navigate]);
  useEffect(() => {
    const requested = Boolean((location.state as { scrollToLogin?: boolean } | null)?.scrollToLogin);
    if (!requested || !window.matchMedia('(max-width: 860px)').matches) return;
    window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [location.key, location.state]);
  if (searchParams.get('modo') === 'cadastro') return <RegistrationPage />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true); setError('');
    try { await login(email, password); navigate(redirect, { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Nao foi possivel entrar.'); }
    finally { setSubmitting(false); }
  }

  return (
    <div className="auth-page page-container">
      <section className="auth-intro"><span className="eyebrow">Sua conta Jogar TCG</span><h1>Entre para montar e salvar seus decks.</h1><p>Seus decks ficam ligados à sua conta para continuar em qualquer dispositivo.</p><ul><li>Salvar e editar decks</li><li>Importar listas de outros sites</li><li>Acessar pelo navegador, Android e iOS</li></ul><Link to="/cartas">Continuar consultando sem entrar →</Link></section>
      <form className="auth-card" ref={formRef} onSubmit={handleSubmit} noValidate>
        <div><span className="auth-card__eyebrow">Sua conta</span><h2>Entrar</h2><p>Use o e-mail e a senha cadastrados.</p></div>
        <label><span>E-mail</span><input type="email" name="email" placeholder="voce@exemplo.com" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>Senha</span><input type="password" name="password" placeholder="Sua senha" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <div className="auth-card__options"><label><input type="checkbox" name="remember" defaultChecked /> Manter conectado</label><button type="button" disabled title="Recuperacao de senha sera adicionada depois">Esqueci minha senha</button></div>
        {error && <div className="feedback feedback--error" role="alert">{error}</div>}
        <button className="button button--primary button--large" type="submit" disabled={submitting}>{submitting ? 'Entrando…' : 'Entrar na plataforma'}</button>
        <p className="auth-card__switch">Ainda não possui uma conta? <Link to="/cadastro">Criar conta</Link></p>
      </form>
    </div>
  );
}
