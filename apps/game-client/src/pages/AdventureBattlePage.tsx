import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import type {GameAction} from '@jogartcg/game-core';
import type {SeatView} from '../services/room-api';
import {useAuth} from '../auth/AuthContext';
import {apiUrl} from '../config/api';
import {MatchTable} from '../components/MatchTable';
import {BattleOrientationGate,useBattleOrientationBlocked} from '../components/BattleOrientationGate';
import {chooseInkColorsFromColors} from '../game/bot-session';
import {botThinkingDelay} from '../game/bot-pacing';

type Battle={id:number;phase:number;revision:number;enemy:string;colors:string[];deck_name:string;view:SeatView;warnings:string[];result:null|{win:boolean;xp:number;gold:number;mission_xp:number}};
export async function adventureBattleRequest(path:string,token?:string,body?:unknown):Promise<Battle>{
 const response=await fetch(apiUrl('/adventure/battle/'+path),{method:body?'POST':'GET',credentials:'include',headers:{'Content-Type':'application/json',...(token?{'X-CSRF-Token':token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json();if(!response.ok||!data.success)throw new Error(data.message||'Falha na batalha.');return data.data;
}
export function AdventureBattlePage(){
 const {battleId}=useParams(),{csrfToken}=useAuth(),navigate=useNavigate();
 const blocked=useBattleOrientationBlocked();
 const [battle,setBattle]=useState<Battle|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const lock=useRef(false),active=useRef(true);
 const lastBotTurn=useRef<number|null>(null);
 useEffect(()=>{active.current=true;adventureBattleRequest(battleId!).then(b=>{if(active.current)setBattle(b);}).catch(e=>{if(active.current)setError(e.message);});return()=>{active.current=false;};},[battleId]);
 async function send(operation:string,action?:GameAction){
  if(!battle||lock.current)return false;lock.current=true;setBusy(true);setError('');
  try{const next=await adventureBattleRequest(operation,csrfToken,{id:battle.id,revision:battle.revision,...(action?{action}:{})});if(active.current){setBattle(next);if(next.result){window.dispatchEvent(new Event('wallet-updated'));window.dispatchEvent(new Event('rewards-updated'));}}return true;}
  catch(e){if(active.current){setError(e instanceof Error?e.message:'Não foi possível jogar.');try{setBattle(await adventureBattleRequest(String(battle.id)));}catch{}}return false;}
  finally{lock.current=false;if(active.current)setBusy(false);}
 }
 useEffect(()=>{if(!battle||blocked||busy||error||battle.view.decisionSeat!==2||battle.result)return;const timer=setTimeout(()=>{lastBotTurn.current=battle.view.state.turn;void send('bot');},botThinkingDelay(lastBotTurn.current!==battle.view.state.turn,!!battle.view.state.pending));return()=>clearTimeout(timer);},[battle,blocked,busy,error]);
 if(!battle)return <div className="page-container"><p role="status">{error||'Abrindo batalha…'}</p><Link to="/gameplay/first-chapter">Voltar ao castelo</Link></div>;
 if(blocked)return <BattleOrientationGate/>;
 const result=battle.result;
 return <MatchTable state={battle.view.state} legal={battle.view.legal} inkColors={chooseInkColorsFromColors([],battle.colors)} deckNames={{player:'Seu deck da aventura',bot:battle.deck_name}} opponentName={battle.enemy} opponentThinking={`${battle.enemy} pensando…`} opponentBanner={`VEZ DE ${battle.enemy.toUpperCase()}`} boardLabel={`Batalha contra ${battle.enemy}`} busy={busy} error={error} onDismissError={()=>setError('')} onAction={action=>send('action',action)}
 opponentBadge={battle.warnings.length>0?<details><summary>Beta · habilidades parciais</summary><p>Estas cartas possuem texto ainda sem automação completa: {battle.warnings.join(', ')}.</p></details>:undefined}
 finishedMessage={result?`${result.win?'Vitória!':'Derrota.'} +${result.xp} XP · +${result.gold} gold${result.mission_xp?` · Missão: +${result.mission_xp} XP`:''}. Recompensas salvas.`:undefined}
 exitDialog={(close,concede)=><><p>A partida fica salva no servidor. Volte pelo botão Enfrentar para continuar.</p><div className="match-actions"><button onClick={()=>navigate('/gameplay/first-chapter')}>Guardar e sair</button>{concede&&<button onClick={concede}>Desistir</button>}<button onClick={close}>Continuar</button></div></>}
 finishedActions={openLog=><><button onClick={()=>navigate('/gameplay/first-chapter')}>Voltar ao castelo</button><button onClick={openLog}>Ver histórico</button></>}/>;
}
