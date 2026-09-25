import { adventureBattleRequest } from './AdventureBattlePage';
import { AdventureLock } from '../components/AdventureLock';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { apiUrl } from '../config/api';
import { CastleShop } from '../components/CastleShop';
import { WalletIndicators } from '../components/Shop';
import type { GameDeck } from '../services/game-api';

type Castle = { enemies: {phase:number;name:string;starter_id:string;deck_name:string;colors:string[]}[]; starters: {id:string;name:string;colors:string[];cover:string}[]; portraits:(string|null)[]; journey:null|{starter_id:string;completed_stages:number;cards:GameDeck['cards']} };
const rooms=[['Moana','Salão das Marés',22,31],['Cruella','Galeria dos Retratos',42.5,32],['Mufasa','Salão dos Reis',59.5,33],['Aurora','Câmara dos Sonhos',81,33],['Donald','Biblioteca Encantada',21.5,58],['Aladdin','Tesouro Real',42,58],['Malévola','Laboratório dos Espelhos',59.5,58],['Elsa','Salão de Cristal',81,58],['Mickey','Sala do Trono',50.5,80]] as const;
export function CastlePage(){
 const navigate=useNavigate();const starting=useRef(false);
 async function fight(phase:number){if(starting.current)return;starting.current=true;setBusy(true);setError('');try{const battle=await adventureBattleRequest('start',csrfToken,{phase});navigate(`/gameplay/batalha/${battle.id}`);}catch(e){setError(e instanceof Error?e.message:'Falha ao iniciar batalha.');setPanel(null);}finally{starting.current=false;setBusy(false);}}

 const {user,loading,csrfToken}=useAuth();const [data,setData]=useState<Castle|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[panel,setPanel]=useState<string|null>(null),[choice,setChoice]=useState<string|null>(null);const modal=useRef<HTMLDialogElement>(null),viewport=useRef<HTMLDivElement>(null);

 const [paths,setPaths]=useState<string[]>([]),[heroPosition,setHeroPosition]=useState({x:0,y:0}),[moving,setMoving]=useState(false);
 const pathRefs=useRef<(SVGPathElement|null)[]>([]),currentStop=useRef(-1),frame=useRef(0),walking=useRef(false);
 useEffect(()=>{
   if(!data?.journey||!viewport.current)return;
   const map=viewport.current.querySelector<HTMLElement>('.castle-map')!;
   const measure=()=>{
     cancelAnimationFrame(frame.current);walking.current=false;setMoving(false);
     const rect=map.getBoundingClientRect();const scale=rect.width/map.offsetWidth;
     const stops=Array.from(map.querySelectorAll<HTMLElement>('.castle-room-landing')).map(el=>{const r=el.getBoundingClientRect();return {x:(r.left-rect.left+r.width/2)/scale,y:(r.top-rect.top+r.height/2)/scale};});
     const points=[{x:rect.width/scale*.11,y:rect.height/scale*.30},...stops];
     setPaths(points.slice(1).map((b,i)=>{const a=points[i];const middle=(a.y+b.y)/2;return Math.abs(a.y-b.y)>80?`M ${a.x} ${a.y} C ${a.x} ${middle}, ${b.x} ${middle}, ${b.x} ${b.y}`:`M ${a.x} ${a.y} C ${(a.x+b.x)/2} ${a.y}, ${(a.x+b.x)/2} ${b.y}, ${b.x} ${b.y}`;}));
     setHeroPosition(points[currentStop.current+1]??points[0]);
   };
   const observer=new ResizeObserver(measure);observer.observe(map);map.querySelectorAll('.castle-room').forEach(el=>observer.observe(el));measure();
   return()=>{observer.disconnect();cancelAnimationFrame(frame.current);walking.current=false;};
 },[!!data?.journey]);
 function visitRoom(index:number){
   if(walking.current)return;
   if(index>(data?.journey?.completed_stages??0)){setPanel(String(index));return;}
   if(index===currentStop.current){setPanel(String(index));return;}
   const forward=index>currentStop.current;
   const indices:number[]=[];
   if(forward){for(let i=currentStop.current+1;i<=index;i++)indices.push(i);}
   else{for(let i=currentStop.current;i>index;i--)indices.push(i);}
   const segments=indices.map(i=>pathRefs.current[i]).filter((p):p is SVGPathElement=>!!p);
   if(segments.length!==indices.length)return;
   const lengths=segments.map(p=>p.getTotalLength()),total=lengths.reduce((a,b)=>a+b,0);
   const finish=()=>{currentStop.current=index;walking.current=false;setMoving(false);setPanel(String(index));};
   const place=(distance:number)=>{
     let i=0;while(i<lengths.length-1&&distance>lengths[i])distance-=lengths[i++];
     const p=segments[i].getPointAtLength(forward?distance:lengths[i]-distance);setHeroPosition({x:p.x,y:p.y});
     const box=viewport.current;if(box){const map=box.querySelector<HTMLElement>('.castle-map')!;const scale=map.getBoundingClientRect().width/map.offsetWidth;box.scrollLeft=p.x*scale-box.clientWidth/2;box.scrollTop=p.y*scale-box.clientHeight/2;}
   };
   if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){place(total);finish();return;}
   walking.current=true;setMoving(true);const start=performance.now(),duration=Math.max(700,total/180*1000);
   const tick=(now:number)=>{const t=Math.min(1,(now-start)/duration);place(total*t);if(t<1)frame.current=requestAnimationFrame(tick);else finish();};
   frame.current=requestAnimationFrame(tick);
 }

 async function load(starter?:string){setBusy(true);setError('');try{const response=await fetch(apiUrl(`/adventure${starter?'/start':''}`),{method:starter?'POST':'GET',credentials:'include',headers:{'Content-Type':'application/json',...(starter?{'X-CSRF-Token':csrfToken}:{})},...(starter?{body:JSON.stringify({starter_id:starter})}:{})});const body=await response.json();if(!response.ok)throw Error(body.message);setData(body.data);setChoice(null);}catch(e){setError(e instanceof Error?e.message:'Falha ao carregar o castelo.');}finally{setBusy(false);}}
 useEffect(()=>{if(user)void load();},[user?.id]);
 useEffect(()=>{if(!data?.journey||!viewport.current)return;const box=viewport.current;const resize=()=>{const scale=matchMedia("(max-width:900px), (max-height:500px) and (pointer:coarse)").matches?.805:1;box.style.setProperty("--castle-map-width",`${Math.max(1100,box.clientWidth/scale,box.clientHeight/scale*1690/931)}px`);};resize();const observer=new ResizeObserver(resize);observer.observe(box);box.scrollTop=0;box.scrollLeft=0;return()=>observer.disconnect();},[!!data?.journey]);
 useEffect(()=>{if(!panel||!modal.current)return;const element=modal.current,overflow=document.body.style.overflow;element.showModal();document.body.style.overflow='hidden';return()=>{element.close();document.body.style.overflow=overflow;};},[panel]);
 if(loading)return <p>Verificando aventura…</p>;
 if(!user)return <Navigate to="/gameplay" replace/>;
 const selected=data?.starters.find(s=>s.id===data.journey?.starter_id);
 return <section className="castle-page"><header className="castle-toolbar"><Link to="/gameplay/mapa" className="castle-back" aria-label="Voltar ao mapa das ilhas"><span aria-hidden="true">←</span><span className="castle-back-label">Mapa das ilhas</span></Link><div className="castle-title"><small>THE FIRST CHAPTER</small><strong>O castelo das histórias</strong></div>{data?.journey&&<nav className="castle-header-menus" aria-label="Menus do castelo"><button onClick={()=>setPanel('deck')} aria-haspopup="dialog"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 7l15-3 5 23-15 3z" fill="#7855b4" stroke="#efcf7a"/><rect x="9" y="5" width="16" height="23" rx="3" fill="#192c52" stroke="#efcf7a"/><path d="M17 10l3 6-3 6-3-6z" fill="#ffe3a1"/></svg><span>Meu deck</span></button><button onClick={()=>setPanel('shop')} aria-haspopup="dialog"><svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 13h22v15H5z" fill="#734a27" stroke="#efcf7a"/><path d="M3 13l4-9h18l4 9z" fill="#b77a3b" stroke="#ffde87"/><path d="M12 4l-1 9m9-9l1 9" stroke="#ffe1a0" strokeWidth="3"/><path d="M13 28V18h7v10" fill="#17233c" stroke="#efcf7a"/></svg><span>Loja do castelo</span></button><small className="castle-progress">{data.journey.completed_stages}/9 fases</small></nav>}<WalletIndicators/></header>
 {error&&<p role="alert" className="castle-note">{error} <button onClick={()=>void load()}>Tentar novamente</button></p>}
 {!data?<p>Carregando castelo…</p>:!data.journey?<div className="castle-selection"><span className="eyebrow">SUA JORNADA COMEÇA AQUI</span><h1>Escolha seu companheiro de jornada.</h1><p>Um dos três starters será seu deck até o fim deste castelo. Futuramente, cartas de boosters da aventura poderão melhorá-lo. Seus decks do Versus não serão usados.</p><p className="castle-note">As três primeiras batalhas estão disponíveis em beta. Algumas habilidades ainda têm automação parcial. A escolha do starter é permanente.</p><div className="castle-starters">{data.starters.map(s=><button key={s.id} aria-pressed={choice===s.id} onClick={()=>setChoice(s.id)}><img src={s.cover} alt={s.name}/><strong>{s.name}</strong><small>{s.colors.join(' · ')} · 60 cartas</small><span>{choice===s.id?'✓ Selecionado':'Escolher starter'}</span></button>)}</div><button className="castle-primary" disabled={!choice||busy} onClick={()=>choice&&void load(choice)}>{busy?'Guardando…':'Confirmar starter e entrar no castelo'}</button></div>:<>

 <div className="castle-viewport" ref={viewport} tabIndex={0} role="region" aria-label="Interior do castelo, role para explorar as nove salas"><div className="castle-map">
 <img className="castle-background" src="./adventure/first-chapter-castle.png" alt="Castelo mágico com nove salas temáticas conectadas por pontes e uma loja" draggable={false}/>
 <svg className="castle-paths" aria-hidden="true"><defs><linearGradient id="castle-ink-rim" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d6edff"/><stop offset=".2" stopColor="#315acf"/><stop offset=".45" stopColor="#8bdfff"/><stop offset=".7" stopColor="#233a89"/><stop offset="1" stopColor="#b5dfff"/></linearGradient></defs>{paths.map((d,i)=><g key={i} className={i<=(data.journey!.completed_stages??0)?'is-open':'is-locked'}><path d={d} className="castle-path-edge"/><path d={d} className="castle-path-glints"/><path d={d} className="castle-path-ink" ref={el=>{pathRefs.current[i]=el;}}/><path d={d} className="castle-path-light"/></g>)}</svg>
 {rooms.map((r,i)=><button key={r[0]} className={`castle-room ${i===8?'castle-room--boss':''} ${i>data.journey!.completed_stages?'is-locked':''}`} style={{left:`${r[2]}%`,top:`${r[3]}%`}} onClick={()=>visitRoom(i)} disabled={moving} aria-label={`Fase ${i+1}: ${r[0]}${i>data.journey!.completed_stages?', bloqueada':''}`}><span>{i===8?'♛ CHEFE FINAL':`FASE ${i+1}`} {i>data.journey!.completed_stages?'🔒':''}</span>{data.portraits[i]?<span className="castle-portrait"><img src={data.portraits[i]!} alt={r[0]} draggable={false}/>{i>data.journey!.completed_stages&&<span className="castle-lock-overlay"><AdventureLock/><span>Bloqueada</span></span>}</span>:<b aria-hidden="true">✦</b>}<strong>{r[0]}</strong><small>{r[1]}</small><span className="castle-room-landing" aria-hidden="true"><span className="castle-ink-platform"/></span></button>)}<div className="castle-stop castle-start-platform" style={{left:"11%",top:"30%"}} aria-label="Plataforma inicial"><div className="castle-ink-platform" aria-hidden="true"/></div><div className="castle-stop is-current castle-traveler" style={{left:heroPosition.x,top:heroPosition.y}}><div className="castle-player"><img src="./adventure/mickey-idle.gif" alt="Seu personagem" draggable={false}/><span aria-live="polite">{moving?'A caminho…':'Você está aqui'}</span></div></div>
 <button className="castle-map-shop" onClick={()=>setPanel('shop')}>✦ Loja do castelo</button></div></div></>}
 {panel&&<dialog ref={modal} className="castle-dialog" onCancel={()=>setPanel(null)} onClick={e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)setPanel(null);}}}><button className="castle-close" aria-label="Fechar" onClick={()=>setPanel(null)}>×</button>{(panel==='deck'||panel==='shop')?<CastleShop initialTab={panel==='deck'?'deck':'shop'} onChanged={()=>void load()}/>:<><span className="eyebrow">FASE {Number(panel)+1}</span><h2>{rooms[Number(panel)][0]} · {rooms[Number(panel)][1]}</h2><p>{Number(panel)>=(data?.journey?.completed_stages??0)+1?'Vença a fase anterior para liberar esta sala.':'Esta é sua próxima batalha.'}</p>{data?.enemies?.find(e=>e.phase===Number(panel)+1)&&<p>Deck do adversário: <strong>{data.enemies.find(e=>e.phase===Number(panel)+1)!.deck_name}</strong> · 60 cartas</p>}<p>{Number(panel)<3?'Batalha beta com resultado salvo no servidor. Algumas habilidades dos starters ainda têm automação parcial; consulte a lista na mesa.':'O deck desta fase ainda não foi definido.'}</p><button disabled={busy||Number(panel)>=3||Number(panel)>(data?.journey?.completed_stages??0)} onClick={()=>void fight(Number(panel)+1)}>{busy?'Abrindo…':`Enfrentar ${rooms[Number(panel)][0]}`}</button></>}</dialog>}
 </section>;
}
