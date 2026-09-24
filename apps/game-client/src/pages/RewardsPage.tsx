import { createContext, useContext, useState } from 'react';
const RewardAssetBase = createContext('./');

type Reward = { name: string; image?: string; kind: string };
const gold = (amount: number): Reward => ({ name: `${amount} gold`, image: './shop/gold-icon-v1.png', kind: 'Moeda' });
const xp = (amount: number): Reward => ({ name: `${amount} XP`, image: './shop/xp-icon-v1.png', kind: 'Experiência' });
const sleeve: Reward = { name: 'Magia de Ohana', image: './shop/sleeve-lilo-stitch.jpg', kind: 'Verso de carta' };
const mat: Reward = { name: 'Domínio de Hades', image: './shop/playmat-hades.jpg', kind: 'Playmat' };
const foil: Reward = { name: 'Carta foil surpresa', kind: 'Carta foil · Exemplo' };
const daily = [gold(100), xp(150), gold(200), sleeve, xp(300), gold(500), foil];
function RewardArt({ reward }: { reward: Reward }) {
  const assetBase = useContext(RewardAssetBase);
  return <><div className={`reward-art reward-art--${reward.image ? 'image' : 'foil'}`}>
    {reward.image ? <img src={`${assetBase}${reward.image.slice(2)}`} alt="" loading="lazy" /> : <span aria-hidden="true">✦</span>}
  </div><small>{reward.kind}</small><strong>{reward.name}</strong></>;
}
export function RewardsPage({ initialView = 'daily', compact = false, assetBase = './' }: { initialView?: 'daily' | 'pass'; compact?: boolean; assetBase?: string }) {
  const [view, setView] = useState<'daily' | 'pass'>(initialView);
  const [claimed, setClaimed] = useState(false);
  const [notice, setNotice] = useState('');
  return <RewardAssetBase.Provider value={assetBase}><div className={compact ? 'rewards-page rewards-page--compact' : 'page-container rewards-page'}>
    {!compact && <header className="rewards-heading"><span className="eyebrow">SUA JORNADA VALE RECOMPENSAS</span><h1>Volte. Jogue. Conquiste.</h1><p>Uma nova surpresa a cada dia. Uma temporada inteira para explorar.</p></header>}
    <p className="rewards-demo">PRÉVIA DE LAYOUT · Valores e itens ilustrativos. Nenhuma cobrança, XP ou prêmio real é aplicado.</p>
    {!compact && <div className="rewards-tabs" role="group" aria-label="Tipo de recompensa">
      <button className="button" aria-pressed={view === 'daily'} onClick={() => { setView('daily'); setNotice(''); }}>Login de 7 dias</button>
      <button className="button" aria-pressed={view === 'pass'} onClick={() => { setView('pass'); setNotice(''); }}>Passe de temporada</button>
    </div>}
    {view === 'daily' ? <section aria-label="Login de sete dias">
      <div className="rewards-section-title"><div><span className="eyebrow">SETE DIAS DE DESCOBERTAS</span><h2>Seu próximo tesouro está aqui</h2><p>Exemplo do primeiro dia de uma jornada de recompensas.</p></div><span className="reward-pill">Dia 1 de 7 · demonstração</span></div>
      <div className="daily-rewards">{daily.map((reward, index) => <article key={index} className={`reward-card ${index === 0 ? 'reward-card--current' : ''} ${index === 6 ? 'reward-card--special' : ''}`}>
        <span className="reward-day">DIA {index + 1}{index === 6 && ' · ESPECIAL'}</span><RewardArt reward={reward} />
        <span className="reward-state">{index === 0 ? claimed ? '✓ Resgate simulado' : 'Disponível na prévia' : '🔒 Próximo dia'}</span>
      </article>)}</div>
      <div className="rewards-claim"><button className="button button--primary" disabled={claimed} onClick={() => { setClaimed(true); setNotice('Resgate demonstrativo concluído. Seu saldo e inventário não foram alterados.'); }}>{claimed ? '✓ Resgate simulado' : 'Simular resgate do dia 1'}</button><p>As regras de calendário e resgate serão definidas antes da ativação.</p></div>
    </section> : <section aria-label="Passe de temporada">
      <div className="season-banner"><div><span className="eyebrow">PASSE DE TEMPORADA · 30 DIAS</span><h2>Uma jornada de tinta e magia</h2><p>Avance com XP de missões, partidas versus, aventuras e outras atividades do jogo.</p><div className="season-progress"><span>Nível 1 · exemplo</span><span>0 / 500 XP</span><progress max={500} value={0} aria-label="Progresso demonstrativo do passe" /></div></div>
        <aside><span className="reward-pill">✦ PREMIUM BLOQUEADO</span><strong className="season-price">R$ 4,99</strong><span>por temporada de 30 dias</span><button className="button button--primary" onClick={() => setNotice('A compra ainda não está disponível. Quando implementada, a trilha premium só será liberada após a confirmação do pagamento. Não houve cobrança.')}>Conhecer o premium</button><small>Inclui os prêmios grátis + premium.<br />Pagamento ainda não disponível.</small></aside>
      </div>
      <div className="rewards-section-title"><div><h2>Duas trilhas. Mais conquistas.</h2><p>30 níveis ilustrativos · navegue para os lados para ver os prêmios.</p></div></div>
      <div className="season-scroll" tabIndex={0} role="region" aria-label="Trilhas gratuita e premium, role horizontalmente">
        <div className="season-track"><div className="season-labels"><span>NÍVEL</span><strong>GRÁTIS<small>Para todos</small></strong><strong>✦ PREMIUM<small>🔒 Requer pagamento</small></strong></div>
          {Array.from({ length: 30 }, (_, index) => {
            const free = index === 29 ? foil : index % 5 === 4 ? sleeve : index % 2 ? xp(150) : gold(100);
            const premium = index === 29 ? foil : index % 5 === 4 ? mat : index % 3 === 2 ? sleeve : index % 2 ? xp(500) : gold(500);
            return <div className="season-level" key={index}><span className="season-level-number">{index + 1}</span><article className="reward-card"><RewardArt reward={free} /><span className="reward-state">{index === 0 ? 'Prévia' : '🔒 Ganhe XP'}</span></article><article className="reward-card reward-card--premium"><RewardArt reward={premium} /><span className="reward-state">🔒 Premium</span></article></div>;
          })}
        </div>
      </div><p className="rewards-footnote">Prêmios e metas de XP são exemplos de layout. O passe não está ativo. Carta foil ilustrativa: nenhuma carta foi escolhida ou desbloqueada.</p>
    </section>}
    <p role="status" className="rewards-notice">{notice}</p>
  </div></RewardAssetBase.Provider>;
}
