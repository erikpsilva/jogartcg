import { type FormEvent, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getBugChallenge, sendBugReport } from '../services/bug-api';

export function BetaNotice() {
  const { user, csrfToken } = useAuth();
  const [open, setOpen] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [report, setReport] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);

  async function show() {
    setOpen(true); setFeedback('');
    if (user) try { setChallenge(await getBugChallenge()); } catch (error) { setFeedback(error instanceof Error ? error.message : 'Erro ao carregar validação.'); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setSending(true); setFeedback('');
    try { setFeedback(await sendBugReport(report, captcha, csrfToken)); setReport(''); setCaptcha(''); setChallenge(await getBugChallenge()); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Não foi possível enviar.'); }
    finally { setSending(false); }
  }

  return <>
    <section className="beta-notice" aria-label="Aviso de teste beta"><div><span>Teste beta</span><strong>O site e a gameplay ainda estão em testes.</strong><p>Encontrou algo errado? Seu relato ajuda a melhorar o Jogar TCG.</p></div><button type="button" onClick={show}>Relatar erro</button></section>
    {open && <div className="beta-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="bug-title"><button className="beta-modal__close" onClick={() => setOpen(false)} aria-label="Fechar">×</button><span className="eyebrow">Ajude no teste beta</span><h2 id="bug-title">Relatar um erro</h2>
      {!user ? <div className="beta-modal__login"><p>Para enviar um relato, você precisa entrar ou criar uma conta. Assim conseguimos identificar e acompanhar o problema com segurança.</p><div><Link className="button button--primary" to="/entrar?redirect=%2Fcartas">Entrar</Link><Link className="button" to="/cadastro">Criar cadastro</Link></div></div> : <form onSubmit={submit}><p>Você está enviando como <strong>{user.nome} {user.sobrenome}</strong>. Descreva o que aconteceu e, se possível, o que esperava que acontecesse.</p><label><span>Descrição do erro</span><textarea minLength={15} maxLength={4000} required value={report} onChange={(event) => setReport(event.target.value)} placeholder="Ex.: ao tentar jogar a carta..., aconteceu..." /></label><label><span>Validação: {challenge || 'carregando…'}</span><input inputMode="numeric" required value={captcha} onChange={(event) => setCaptcha(event.target.value.replace(/\D/g, ''))} /></label>{feedback && <div className="feedback" role="status">{feedback}</div>}<button className="button button--primary" disabled={sending || !challenge}>{sending ? 'Enviando…' : 'Enviar relato'}</button></form>}
    </section></div>}
  </>;
}
