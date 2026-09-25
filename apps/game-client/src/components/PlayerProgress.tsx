import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { request } from './Shop';
import { useAuth } from '../auth/AuthContext';

type Progress = { xp:number; gold:number; level:number; level_cap:number; level_xp:number; progress_xp:number; character:{id:string;name:string;image:string} };
export function PlayerProgress({ compact=false, assetBase='./' }: {compact?:boolean;assetBase?:string}) {
  const {user}=useAuth();
  const [data,setData]=useState<Progress|null>(null);
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;setData(null);setError('');
    const refresh=()=>{if(!user)return;request<Progress>('/profile').then(value=>{if(active){setData(value);setError('');}}).catch(()=>{if(active)setError('Não foi possível carregar o progresso.');});};
    refresh();window.addEventListener('wallet-updated',refresh);
    return()=>{active=false;window.removeEventListener('wallet-updated',refresh);};
  },[user?.id]);
  if(!user)return null;
  if(compact)return <a className="player-level-icon" href={`${assetBase}#/meus-dados`} aria-label={data?`Meu perfil, nível ${data.level}`:'Meu perfil'} title={data?`Meu perfil · Nível ${data.level}`:'Meu perfil'}><span aria-hidden="true">✦</span><strong>{data?.level??'–'}</strong></a>;
  if(!data)return <p role="status">{error||'Carregando seu progresso…'}</p>;
  const format=(value:number)=>value.toLocaleString('pt-BR');
  return <section className="player-profile-progress" aria-label="Seu progresso no jogo">
    <div className="player-profile-character"><img src={`${assetBase}${data.character.image}`} alt={data.character.name}/><strong>{data.character.name}</strong><small>Personagem selecionado</small></div>
    <div className="player-profile-stats"><span className="eyebrow">JOGADOR</span><h2>Nível {data.level} <small>/ {data.level_cap}</small></h2><p>{format(data.xp)} XP total · {format(data.gold)} gold</p><progress max={data.level_xp} value={data.progress_xp} aria-label="Progresso do nível"/><p>{data.level===data.level_cap?'Nível máximo alcançado':`${format(data.progress_xp)} / ${format(data.level_xp)} XP · Faltam ${format(data.level_xp-data.progress_xp)} XP para o próximo nível`}</p><Link to="/inventario">Ver meu inventário</Link></div>
  </section>;
}
