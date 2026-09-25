import { useEffect, useRef, useState } from 'react';
import { LivingPlaymat } from '../components/LivingPlaymat';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { WalletIndicators, request, type Shop } from '../components/Shop';

export function InventoryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('characters');
  const [shop, setShop] = useState<Shop | null>(null);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Shop['items'][number] | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!preview) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, [preview]);
  useEffect(() => { let active = true; request<Shop>('').then(data => { if(active) setShop(data); }).catch(e => { if(active) setError(e.message); }); return () => { active=false; }; }, [user?.id]);
  const owned = shop?.items.filter(item => shop.owned.includes(item.id)) ?? [];
  const tabs = [['characters', 'Personagens', 1], ['playmat', 'Playmats', owned.filter(i=>i.type==='playmat').length], ['sleeve', 'Versos de cartas', owned.filter(i=>i.type==='sleeve').length]] as const;
  return <div className="page-container characters-page">
    <header className="builder-heading"><div><span className="eyebrow">Sua coleção</span><h1>Meu inventário.</h1><p>Seus personagens e os itens que tornam sua mesa única.</p></div><WalletIndicators /></header>
    <div className="shop-tabs" role="tablist" aria-label="Categorias do inventário">{tabs.map(([id,label,count],index)=><button key={id} id={`tab-${id}`} role="tab" aria-selected={tab===id} aria-pressed={tab===id} aria-controls="inventory-panel" tabIndex={tab===id?0:-1} onClick={()=>setTab(id)} onKeyDown={e=>{let n=index;if(e.key==='ArrowRight')n=(index+1)%3;else if(e.key==='ArrowLeft')n=(index+2)%3;else if(e.key==='Home')n=0;else if(e.key==='End')n=2;else return;e.preventDefault();setTab(tabs[n][0]);document.getElementById(`tab-${tabs[n][0]}`)?.focus();}}>{label} ({count})</button>)}</div>
    <section id="inventory-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
      {tab==='characters' ? <div className="inventory-characters"><article className="inventory-character inventory-character--selected"><span className="character-equipped">✓ Selecionado</span><img src="./adventure/mickey-idle.gif" alt="Mickey Knight" /><h2>Mickey Knight</h2><p>Personagem inicial · Equipado na aventura</p></article>{[1,2,3].map(slot=><div className="inventory-character inventory-character--empty" key={slot}><span aria-hidden="true">＋</span><strong>Novos personagens</strong><p>Espaço para expandir sua coleção</p><small>Em breve</small></div>)}</div> : error ? <p role="alert" className="shop-notice">{error}</p> : !shop ? <p>Carregando inventário…</p> : !shop.ready ? <p className="shop-notice">O inventário aguarda a atualização do banco de dados.</p> : owned.filter(i=>i.type===tab).length===0 ? <div className="shop-notice"><p>Você ainda não possui {tab==='playmat'?'playmats':'versos de cartas'} personalizados.</p>{user?.shop_access&&<Link to="/loja">Explorar a loja →</Link>}</div> : <div className="shop-grid">{owned.filter(i=>i.type===tab).map(item=><article className={`shop-item shop-item--${item.type}`} key={item.id}><button type="button" className="shop-item__art inventory-art" onClick={()=>setPreview(item)} aria-label={`Ampliar ${item.name}`}><img src={`./shop/${item.image}`} alt={item.name}/>{item.animation==='hades' && <LivingPlaymat src={`./shop/${item.image}`} intensity={Number(item.animation_intensity??.8)} className="shop-living-playmat" />}<span>Ampliar ↗</span></button><div className="shop-item__body"><h2>{item.name}</h2><p>✓ No inventário · A troca é feita ao montar seu deck.</p></div></article>)}</div>}
    </section>
    {preview && <dialog ref={dialogRef} className="inventory-preview" aria-labelledby="inventory-preview-title" onCancel={()=>setPreview(null)} onClick={e=>{if(e.target===e.currentTarget){const rect=e.currentTarget.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)setPreview(null);}}}>
      <header><h2 id="inventory-preview-title">{preview.name}</h2><button type="button" onClick={()=>setPreview(null)} aria-label="Fechar ampliação">×</button></header>
      {preview.animation==='hades' ? <div className="inventory-living-preview"><img src={`./shop/${preview.image}`} alt={preview.name} /><LivingPlaymat src={`./shop/${preview.image}`} intensity={Number(preview.animation_intensity??.8)} /></div> : <img src={`./shop/${preview.image}`} alt={preview.name} />}
    </dialog>}
  </div>;
}
