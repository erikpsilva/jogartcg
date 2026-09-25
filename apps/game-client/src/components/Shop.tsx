import { useEffect, useRef, useState } from 'react';
import { LivingPlaymat } from './LivingPlaymat';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiUrl } from '../config/api';

type Item = { animation?: string; animation_intensity?: number; active?: boolean; description?: string; id: string; name: string; type: 'playmat' | 'sleeve'; image: string; gold: number | null; reais: number | null };
export type Shop = { items: Item[]; owned: string[]; ready: boolean; wallet: { xp: number; gold: number } };
export async function request<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(apiUrl('/shop' + path), { credentials: 'include', method: body ? (path.startsWith('/decks/') ? 'PUT' : 'POST') : 'GET', headers: { 'Content-Type': 'application/json', ...(token ? { 'X-CSRF-Token': token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const json = await response.json();
  if (!response.ok || !json.success) throw new Error(json.message || 'Não foi possível carregar a loja.');
  if (body && path === '/buy') window.dispatchEvent(new Event('wallet-updated'));
  return json.data;
}
const asset = (item: Item) => `./shop/${item.image}`;
const money = (value: number) => (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function WalletIndicators({ assetBase = './' }: { assetBase?: string } = {}) {
  const [shop, setShop] = useState<Shop | null>(null);
  useEffect(() => { let active=true; const refresh=()=>{request<Shop>('').then(data=>{if(active)setShop(data);}).catch(()=>{});}; refresh(); window.addEventListener('wallet-updated',refresh); return ()=>{active=false;window.removeEventListener('wallet-updated',refresh);}; }, []);
  return <div className="shop-wallet" aria-label="XP e gold"><span><img className="currency-icon currency-icon--xp" src={`${assetBase}shop/xp-icon-v1.png`} alt="" aria-hidden="true" /><small>XP</small><b>{(shop?.wallet.xp ?? 0).toLocaleString('pt-BR')}</b></span><span><img className="currency-icon" src={`${assetBase}shop/gold-icon-v1.png`} alt="" aria-hidden="true" /><small>Gold</small><b>{(shop?.wallet.gold ?? 0).toLocaleString('pt-BR')}</b></span></div>;
}
export function DeckCosmeticThumbs({ deckId }: { deckId: number }) {
  const [items,setItems]=useState<Item[]>([]);
  useEffect(()=>{let active=true;request<Shop>('').then(async shop=>{if(!shop.ready)return;const selected=await request<{playmat_id:string|null;sleeve_id:string|null}>(`/decks/${deckId}`);if(active)setItems([selected.playmat_id,selected.sleeve_id].flatMap(id=>shop.items.filter(item=>item.id===id)));}).catch(()=>{});return()=>{active=false;};},[deckId]);
  return items.length?<div className="deck-cosmetic-thumbs">{items.map(item=><img key={item.id} src={asset(item)} alt={`${item.type==='playmat'?'Playmat':'Verso'}: ${item.name}`} title={item.name}/>)}</div>:null;
}
export function ShopPage() {
  const { user, csrfToken } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Item | null>(null);
  const confirmRef = useRef<HTMLDialogElement>(null);
  const buyingRef = useRef(false);
  useEffect(() => {
    if (!confirm) return;
    const dialog = confirmRef.current;
    if (!dialog) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = previous; };
  }, [confirm]);
  const reload = () => request<Shop>('').then(setShop);
  useEffect(() => { reload().catch(e=>setNotice(e.message)); }, [user?.id]);
  async function buy() {
    if (!confirm || buyingRef.current) return;
    buyingRef.current = true;
    setBusy(true);setNotice('');
    try { const result = await request<{already_owned:boolean}>('/buy',csrfToken,{item_id:confirm.id}); setConfirm(null); setNotice(result.already_owned ? 'Você já possui este item. Nenhum gold foi descontado.' : 'Compra concluída! Gold descontado e item liberado no inventário.'); await reload().catch(()=>setNotice('Compra concluída. Atualize a página para consultar seu saldo e inventário.')); }
    catch(e) {setNotice(e instanceof Error?e.message:'Falha na compra.');} finally {setBusy(false);buyingRef.current=false;}
  }
  return <div className="shop-page page-container"><header className="builder-heading"><div><span className="eyebrow">Loja · Sua identidade na mesa</span><h1>Jogue do seu jeito.</h1><p>Playmats e versos de cartas para deixar cada deck com a sua cara.</p></div><WalletIndicators /></header>
    <div className="shop-demo">Prévia da loja · Preços ilustrativos. Pagamentos em reais indisponíveis. Compras por gold usam o saldo do inventário; recompensas da campanha ainda não estão implementadas.</div>
    {shop && !shop.ready && <p className="shop-notice">Inventário em preparação. A vitrine está disponível; compras e equipamentos aguardam a atualização do banco.</p>}
    <nav className="shop-tabs" aria-label="Categorias da loja">{[['all','Todos os itens'],['playmat','Playmats'],['sleeve','Versos de cartas']].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</nav>
    {notice && <p className="shop-notice" role="status">{notice}</p>}
    {confirm && <dialog ref={confirmRef} className="purchase-dialog" aria-labelledby="purchase-title" onCancel={e=>{e.preventDefault();if(!buyingRef.current)setConfirm(null);}} onClick={e=>{if(e.target===e.currentTarget&&!buyingRef.current){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setConfirm(null);}}}>
      <h2 id="purchase-title">Confirmar compra</h2><img className="purchase-art" src={asset(confirm)} alt={confirm.name}/><h3>{confirm.name}</h3>
      <dl><div><dt>Saldo atual</dt><dd>{(shop?.wallet.gold??0).toLocaleString('pt-BR')} gold</dd></div><div><dt>Preço</dt><dd>− {(confirm.gold??0).toLocaleString('pt-BR')} gold</dd></div><div><dt>Saldo após a compra</dt><dd>{Math.max(0,(shop?.wallet.gold??0)-(confirm.gold??0)).toLocaleString('pt-BR')} gold</dd></div></dl>
      <p>O item será liberado no seu inventário. O servidor confere seu saldo ao confirmar.</p>{notice&&<p role="status">{notice}</p>}
      <div className="purchase-actions"><button className="button button--primary" disabled={busy} onClick={()=>void buy()}>{busy?'Comprando…':'Confirmar compra'}</button><button className="button button--ghost" autoFocus disabled={busy} onClick={()=>setConfirm(null)}>Cancelar</button></div>
    </dialog>}
    {!shop ? <p>Carregando vitrine…</p> : <div className="shop-grid">{shop.items.filter(item=>item.active!==false&&(filter==='all'||item.type===filter)).map(item=><article className={`shop-item shop-item--${item.type}`} key={item.id}><div className="shop-item__art"><img src={asset(item)} alt={item.name} loading="lazy" />{item.animation==='hades'&&<LivingPlaymat src={asset(item)} intensity={Number(item.animation_intensity??.8)} className="shop-living-playmat" />}<span>{item.animation==='hades'?'Cenário Vivo':item.type==='playmat'?'Playmat':'Verso de carta'}</span></div><div className="shop-item__body"><h2>{item.name}</h2><p>{item.description || (item.type==='playmat'?'Uma nova arte para a sua metade do campo.':'Proteja suas histórias com um verso personalizado.')}</p><div className="shop-prices">{item.gold!==null&&<b><img className="currency-icon" src="./shop/gold-icon-v1.png" alt="Gold" /> {item.gold.toLocaleString('pt-BR')}</b>}{item.gold!==null&&item.reais!==null&&<small>ou</small>}{item.reais!==null&&<b>{money(item.reais)}</b>}</div>{shop.owned.includes(item.id)?<Link className="shop-cta" to="/inventario">✓ Ver no inventário</Link>:!user?<Link className="shop-cta" to="/entrar?redirect=%2Floja">Entre para adquirir</Link>:<div className="shop-item__actions">{item.gold!==null&&<button disabled={!shop.ready||busy||shop.wallet.gold<item.gold} onClick={()=>setConfirm(item)}>{shop.ready&&shop.wallet.gold<item.gold?'Gold insuficiente':'Comprar com gold'}</button>}{item.reais!==null&&<button disabled>Reais · Em breve</button>}</div>}</div></article>)}</div>}
  </div>;
}

export function DeckCosmetics({ deckId }: { deckId?: number }) {
  const { user, csrfToken } = useAuth();
  const [shop,setShop]=useState<Shop|null>(null);
  const [selection,setSelection]=useState<{playmat_id:string|null;sleeve_id:string|null}>({playmat_id:null,sleeve_id:null});
  const [notice,setNotice]=useState('');const [busy,setBusy]=useState(false);const [loaded,setLoaded]=useState(false);
  useEffect(()=>{let active=true;setLoaded(false);setNotice('');request<Shop>('').then(async data=>{if(!active)return;setShop(data);if(deckId&&data.ready){const equipped=await request<typeof selection>(`/decks/${deckId}`);if(active)setSelection(equipped);}if(active)setLoaded(true);}).catch(e=>{if(active)setNotice(e.message);});return()=>{active=false;};},[deckId]);
  async function save(){if(!deckId)return;setBusy(true);try{await request(`/decks/${deckId}`,csrfToken,selection);setNotice('Personalização salva para este deck.');}catch(e){setNotice(e instanceof Error?e.message:'Não foi possível salvar.');}finally{setBusy(false);}}
  return <section className="deck-cosmetics"><header><div><span className="eyebrow">Personalização por deck</span><h2>Sua mesa, seu estilo.</h2></div>{user?.shop_access && <Link to="/loja">Visitar loja →</Link>}</header><div className="deck-cosmetics__columns">{(['playmat','sleeve'] as const).map(type=>{const field=type==='playmat'?'playmat_id':'sleeve_id';const chosen=shop?.items.find(item=>item.id===selection[field]);return <label key={type}><span>{type==='playmat'?'Playmat':'Verso das cartas'}</span><div className={`cosmetic-preview cosmetic-preview--${type}`}>{chosen?<img src={asset(chosen)} alt={chosen.name}/>:<span>Visual padrão do jogo</span>}</div><select disabled={!loaded||!shop?.ready||!deckId||busy} value={selection[field]||''} onChange={e=>setSelection(current=>({...current,[field]:e.target.value||null}))}><option value="">Padrão do jogo</option>{shop?.items.filter(item=>item.type===type&&shop.owned.includes(item.id)).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;})}</div><p>{!deckId?'Salve o deck primeiro para equipar seus itens.':!shop?.ready?'Inventário em preparação.':'Somente itens do seu inventário podem ser equipados. A configuração é salva separadamente das cartas.'}</p><button disabled={!deckId||!loaded||!shop?.ready||busy} onClick={()=>void save()}>{busy?'Salvando…':'Salvar personalização'}</button>{notice&&<p role="status">{notice}</p>}</section>;
}
