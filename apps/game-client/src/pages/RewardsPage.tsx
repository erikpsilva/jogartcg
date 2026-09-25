import { createContext, useContext, useState, useRef, useEffect } from 'react';
import { LivingPlaymat } from '../components/LivingPlaymat';
import { request } from '../components/Shop';
import { useAuth } from '../auth/AuthContext';
type RewardState={days:{day:number;date:string;status:string;cost:number}[];season:{id:string;ends_on:string;xp:number;level:number;premium:boolean};claims:string[]};
import { RewardCollected } from '../components/RewardCollected';
const RewardAssetBase = createContext('./');

type Reward = { name: string; image?: string; kind: string; animated?: boolean };
const gold = (amount: number): Reward => ({ name: `${amount} gold`, image: './shop/gold-icon-v1.png', kind: 'Moeda' });
const xp = (amount: number): Reward => ({ name: `${amount} XP`, image: './shop/xp-icon-v1.png', kind: 'Experiência' });
const sleeve: Reward = { name: 'Magia de Ohana', image: './shop/sleeve-lilo-stitch.jpg', kind: 'Verso de carta' };
const mat: Reward = { name: 'Domínio de Hades', image: './shop/playmat-hades.jpg', kind: 'Playmat', animated: true };
const foil: Reward = { name: 'Carta foil surpresa', kind: 'Carta foil' };
const daily = [gold(100), xp(150), gold(200), sleeve, xp(300), gold(500), foil];
function RewardArt({ reward }: { reward: Reward }) {
 const assetBase=useContext(RewardAssetBase),dialog=useRef<HTMLDialogElement>(null);
 const [previewOpen,setPreviewOpen]=useState(false);
 const item=reward.kind!=='Moeda'&&reward.kind!=='Experiência';
 const art=<div className={`reward-art reward-art--${reward.image?'image':'foil'}`}>{reward.image?<img src={`${assetBase}${reward.image.slice(2)}`} alt="" loading="lazy"/>:<span aria-hidden="true">✦</span>}</div>;
 return <>{item?<button type="button" className="reward-inspect" aria-label={`Ampliar ${reward.name}`} aria-haspopup="dialog" onClick={()=>{dialog.current?.showModal();setPreviewOpen(true);}}>{art}<span className="reward-inspect-hint">Ampliar ⤢</span></button>:art}<small>{reward.kind}</small><strong>{reward.name}</strong>
 {item&&<dialog ref={dialog} className={`reward-item-preview ${reward.kind==='Playmat'?'reward-item-preview--wide':''}`} aria-label={reward.name} onClose={e=>{e.stopPropagation();setPreviewOpen(false);}} onCancel={e=>{e.stopPropagation();e.preventDefault();dialog.current?.close();}} onClick={e=>{e.stopPropagation();if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.current?.close();}}}>
 <button type="button" className="reward-item-close" aria-label="Fechar ampliação" onClick={()=>dialog.current?.close()} autoFocus>×</button><h2>{reward.name}</h2><p>{reward.kind}</p>{reward.image?<div className={reward.animated?"reward-item-living":"reward-item-static"}><img className="reward-item-image" src={`${assetBase}${reward.image.slice(2)}`} alt={reward.name}/>{reward.animated&&previewOpen&&<LivingPlaymat src={`${assetBase}${reward.image.slice(2)}`} className="reward-item-motion"/>}</div>:<><div className="reward-item-foil" aria-hidden="true">✦</div><p>Uma carta de The First Chapter será sorteada no resgate. Se já for foil, você recebe um token foil.</p></>}<small>Prévia do item · visualizar não resgata a recompensa.</small>
 </dialog>}</>;
}

export function RewardsPage({ initialView = 'daily', compact = false, assetBase = './' }: { initialView?: 'daily' | 'pass'; compact?: boolean; assetBase?: string }) {
  const [view, setView] = useState<'daily' | 'pass'>(initialView);
  const {csrfToken}=useAuth();
  const [state,setState]=useState<RewardState|null>(null),[busy,setBusy]=useState(false);
  const claimLock=useRef(false);
  const [recoverDay,setRecoverDay]=useState<number|null>(null);
  const confirmation=useRef<HTMLDialogElement>(null);
  useEffect(()=>{let active=true;const reload=()=>request<RewardState>('/rewards').then(data=>{if(active)setState(data);}).catch(e=>{if(active)setNotice(e.message);});void reload();window.addEventListener('rewards-updated',reload);return()=>{active=false;window.removeEventListener('rewards-updated',reload);};},[]);
  useEffect(()=>{if(recoverDay!==null)confirmation.current?.showModal();},[recoverDay]);
  async function claim(track:string,day:number,recover=false){
    if(claimLock.current)return;claimLock.current=true;setBusy(true);setNotice('');
    try{setState(await request<RewardState>('/rewards/claim',csrfToken,{track,day,recover}));setRecoverDay(null);setNotice('Recompensa registrada na sua conta.');window.dispatchEvent(new Event('wallet-updated'));}
    catch(e){setNotice(e instanceof Error?e.message:'Falha no resgate.');}finally{claimLock.current=false;setBusy(false);}
  }
  const [notice, setNotice] = useState('');
  return <RewardAssetBase.Provider value={assetBase}><div className={compact ? 'rewards-page rewards-page--compact' : 'page-container rewards-page'}>
    {!compact && <header className="rewards-heading"><span className="eyebrow">SUA JORNADA VALE RECOMPENSAS</span><h1>Volte. Jogue. Conquiste.</h1><p>Uma nova surpresa a cada dia. Uma temporada inteira para explorar.</p></header>}
    <p className="rewards-demo">Recompensas ativas · Resgates salvos na sua conta. Pagamentos em reais indisponíveis.</p>
    {!compact && <div className="rewards-tabs" role="group" aria-label="Tipo de recompensa">
      <button className="button" aria-pressed={view === 'daily'} onClick={() => { setView('daily'); setNotice(''); }}>Login de 7 dias</button>
      <button className="button" aria-pressed={view === 'pass'} onClick={() => { setView('pass'); setNotice(''); }}>Passe de temporada</button>
    </div>}
    {view === 'daily' ? <section aria-label="Login de sete dias">
      <div className="rewards-section-title"><div><span className="eyebrow">SETE DIAS DE DESCOBERTAS</span><h2>Seu próximo tesouro está aqui</h2><p>Sete dias corridos. Faltou ao login? Recupere o prêmio daquele dia por 1.000 gold.</p></div><span className="reward-pill">Calendário de 7 dias</span></div>
      <div className="daily-rewards">{daily.map((reward, index) => <article key={index} className={`reward-card ${state?.days[index]?.status === 'available' ? 'reward-card--current' : ''} ${state?.days[index]?.status==='claimed'?'is-collected':''} ${index === 6 ? 'reward-card--special' : ''}`}>
        <span className="reward-day">DIA {index + 1}{index === 6 && ' · ESPECIAL'}</span><RewardArt reward={reward} />
        <span className="reward-state">{state?.days[index]?.date??'Carregando…'}</span>
        <button className={`reward-claim-button ${state?.days[index]?.status==='missed'?'reward-claim-button--recover':''}`} disabled={busy||!state?.days[index]||['claimed','future'].includes(state.days[index].status)} onClick={()=>state?.days[index]?.status==='missed'?setRecoverDay(index+1):void claim('daily',index+1)}>{state?.days[index]?.status==='claimed'?<RewardCollected/>:state?.days[index]?.status==='missed'?'Recuperar · 1.000 gold':state?.days[index]?.status==='available'?'Resgatar':'🔒 Próximo dia'}</button>
      </article>)}</div>
      <p>O login é registrado ao acessar o jogo. Dias em que você entrou podem ser resgatados depois, sem custo. Horário de Brasília.</p>
    </section> : <section aria-label="Passe de temporada">
      <div className="season-banner"><div><span className="eyebrow">PASSE DE TEMPORADA · 30 DIAS</span><h2>Uma jornada de tinta e magia</h2><p>Avance com XP de missões, partidas versus, aventuras e outras atividades do jogo.</p><div className="season-progress"><span>Nível {state?.season.level??0} / 30</span><span>{state?.season.xp??0} XP · 500 XP por nível</span><progress max={15000} value={Math.min(15000,state?.season.xp??0)} aria-label="Progresso do passe" /></div></div>
        <aside><span className="reward-pill">{state?.season.premium?'✦ PREMIUM ATIVO':'✦ PREMIUM BLOQUEADO'}</span><strong className="season-price">R$ 4,99</strong><span>por temporada de 30 dias</span><button className="button button--primary" onClick={() => setNotice('A compra ainda não está disponível. Quando implementada, a trilha premium só será liberada após a confirmação do pagamento. Não houve cobrança.')}>Conhecer o premium</button><small>Inclui os prêmios grátis + premium.<br />Pagamento ainda não disponível.</small></aside>
      </div>
      <div className="rewards-section-title"><div><h2>Duas trilhas. Mais conquistas.</h2><p>30 níveis · navegue para os lados para ver os prêmios.</p></div></div>
      <div className="season-scroll" tabIndex={0} role="region" aria-label="Trilhas gratuita e premium, role horizontalmente">
        <div className="season-track"><div className="season-labels"><span>NÍVEL</span><strong>GRÁTIS<small>Para todos</small></strong><strong>✦ PREMIUM<small>🔒 Requer pagamento</small></strong></div>
          {Array.from({ length: 30 }, (_, index) => {
            const free = index === 29 ? foil : index % 5 === 4 ? sleeve : index % 2 ? xp(150) : gold(100);
            const premium = index === 29 ? foil : index % 5 === 4 ? mat : index % 3 === 2 ? sleeve : index % 2 ? xp(500) : gold(500);
            const freeClaimed=!!state?.claims.includes(`season:${state.season.id}:free:${index+1}`);
            const premiumClaimed=!!state?.claims.includes(`season:${state.season.id}:premium:${index+1}`);
            return <div className="season-level" key={index}><span className="season-level-number">{index + 1}</span><article className={`reward-card ${freeClaimed?'is-collected':''}`}><RewardArt reward={free} /><span className="reward-state">{freeClaimed?<RewardCollected/>:<button className="reward-claim-button" disabled={busy||!state||state.season.level<index+1} onClick={()=>void claim('free',index+1)}>{state&&state.season.level>=index+1?'Resgatar':'🔒 Ganhe XP'}</button>}</span></article><article className={`reward-card reward-card--premium ${premiumClaimed?'is-collected':''}`}><RewardArt reward={premium} /><span className="reward-state">{premiumClaimed?<RewardCollected/>:<button className="reward-claim-button" disabled={busy||!state?.season.premium||state.season.level<index+1} onClick={()=>void claim('premium',index+1)}>{!state?.season.premium?'🔒 Premium':state.season.level<index+1?'🔒 Ganhe XP':'Resgatar'}</button>}</span></article></div>;
          })}
        </div>
      </div><p className="rewards-footnote">Temporada até {state?.season.ends_on??'…'} (Brasília). O XP ganho desde sua entrada nesta temporada conta para o passe, incluindo prêmios de XP. Cada prêmio pode ser resgatado uma vez; itens já possuídos não são duplicados.</p>
    </section>}
    {recoverDay!==null&&<dialog ref={confirmation} className="purchase-dialog" aria-label="Recuperar prêmio perdido" onCancel={e=>{e.stopPropagation();e.preventDefault();if(!claimLock.current)setRecoverDay(null);}} onClick={e=>e.stopPropagation()}><h2>Recuperar o dia {recoverDay}?</h2><p>Serão descontados 1.000 gold para receber este prêmio.</p><button disabled={busy} onClick={()=>void claim('daily',recoverDay,true)}>Confirmar · 1.000 gold</button><button autoFocus disabled={busy} onClick={()=>setRecoverDay(null)}>Cancelar</button>{notice&&<p role="status">{notice}</p>}</dialog>}
    <p role="status" className="rewards-notice">{notice}</p>
  </div></RewardAssetBase.Provider>;
}
