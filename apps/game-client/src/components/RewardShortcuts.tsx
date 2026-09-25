import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DailyMissions, MissionIcon } from './DailyMissions';
import { RewardsPage } from '../pages/RewardsPage';

export function RewardShortcuts({ assetBase = './' }: { assetBase?: string }) {
  const [selected, setSelected] = useState<'daily' | 'pass' | 'missions' | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!selected) return;
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [selected]);
  return <div className="reward-shortcuts">
    <button type="button" className="reward-shortcut reward-shortcut--daily" aria-haspopup="dialog" onClick={() => setSelected('daily')}><img src={`${assetBase}adventure/mickey-idle.gif`} alt="" /><span><small>SEU PRESENTE DIÁRIO</small><strong>Login de 7 dias</strong></span><i aria-hidden="true">7</i></button>
    <button type="button" className="reward-shortcut reward-shortcut--pass" aria-haspopup="dialog" onClick={() => setSelected('pass')}><img src={`${assetBase}shop/season-pass-icon-v1.png`} alt="" /><span><small>GRÁTIS + PREMIUM</small><strong>Passe de temporada</strong></span><i aria-hidden="true">✦</i></button>
    <button type="button" className="reward-shortcut reward-shortcut--missions" aria-haspopup="dialog" title="Missões diárias" onClick={()=>setSelected('missions')}><MissionIcon/><span><small>JOGUE E CONQUISTE</small><strong>Missões diárias</strong></span></button>
    {selected && createPortal(<dialog ref={dialog} className={`reward-modal reward-modal--${selected}`} aria-labelledby="reward-modal-title" onCancel={() => setSelected(null)} onClose={() => setSelected(null)} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setSelected(null);
    }}>
      <header className="reward-modal-heading">{selected==='missions'?<MissionIcon/>:<img src={`${assetBase}${selected === 'daily' ? 'adventure/mickey-idle.gif' : 'shop/season-pass-icon-v1.png'}`} alt="" />}<div><small>{selected==='missions'?'OBJETIVOS DO DIA':selected === 'daily' ? 'UM PRESENTE A CADA NOVO DIA' : '30 DIAS DE CONQUISTAS'}</small><h2 id="reward-modal-title">{selected==='missions'?'Missões diárias':selected === 'daily' ? 'Login de 7 dias' : 'Passe de temporada'}</h2></div><button type="button" autoFocus aria-label="Fechar" onClick={() => setSelected(null)}>×</button></header>
      {selected==='missions'?<DailyMissions/>:<RewardsPage key={selected} initialView={selected} compact assetBase={assetBase} />}
    </dialog>, document.body)}
  </div>;
}
