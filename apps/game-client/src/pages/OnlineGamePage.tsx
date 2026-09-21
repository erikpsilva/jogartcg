import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { GameAction } from '@jogartcg/game-core';
import { useAuth } from '../auth/AuthContext';
import { BattleOrientationGate, useBattleOrientationBlocked } from '../components/BattleOrientationGate';
import { Dialog, MatchTable } from '../components/MatchTable';
import { chooseInkColorsFromColors } from '../game/bot-session';
import { getRoom, pollRoom, RoomApiError, sendRoomAction, type Room, type SeatView } from '../services/room-api';

/**
 * Online table. The server holds the real game state and only ever sends this
 * player's view; every move is sent with the match revision it was chosen on,
 * so a stale or duplicated click is refused instead of applied twice.
 */
export function OnlineGamePage() {
  const { roomId: roomParam } = useParams();
  const roomId = Number(roomParam);
  const { csrfToken } = useAuth();
  const navigate = useNavigate();
  const orientationBlocked = useBattleOrientationBlocked();
  const [room, setRoom] = useState<Room | null>(null);
  const [view, setView] = useState<SeatView | null>(null);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState('');
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  // Latest revision on screen; responses older than it are ignored.
  const revisionRef = useRef(0);

  const accept = useCallback((next: Room) => {
    setRoom(next);
    const nextRevision = next.match?.revision ?? 0;
    if (next.view && nextRevision >= revisionRef.current) {
      revisionRef.current = nextRevision;
      setView(next.view);
    }
  }, []);

  useEffect(() => {
    if (!Number.isInteger(roomId) || roomId <= 0) { setFatal('Sala inválida.'); return; }
    let alive = true;
    const controller = new AbortController();
    (async () => {
      let current: Room;
      try {
        current = await getRoom(roomId, true);
      } catch (reason) {
        if (alive) setFatal(reason instanceof Error ? reason.message : 'Não foi possível abrir a sala.');
        return;
      }
      if (!alive) return;
      if (current.status === 'aguardando' || !current.match) { navigate('/jogar', { replace: true }); return; }
      accept(current);

      let delay = 0;
      while (alive && current.status !== 'encerrada') {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (!alive) break;
        try {
          const result = await pollRoom(roomId, current.revision, revisionRef.current, controller.signal);
          current = result.data;
          accept(current);
          setOffline(false);
          delay = 0;
        } catch (reason) {
          if (!alive || controller.signal.aborted) break;
          if (reason instanceof RoomApiError && (reason.status === 401 || reason.status === 404)) { setFatal(reason.message); break; }
          // Network hiccup: keep the table on screen and retry with growing backoff.
          setOffline(true);
          delay = Math.min(delay ? delay * 2 : 1000, 8000);
        }
      }
    })();
    return () => { alive = false; controller.abort(); };
  }, [roomId, navigate, accept]);

  async function dispatch(action: GameAction): Promise<boolean> {
    if (!room || busy) return false;
    setBusy(true); setError('');
    try {
      accept(await sendRoomAction(csrfToken, room.id, revisionRef.current, action));
      return true;
    } catch (reason) {
      if (reason instanceof RoomApiError && reason.code === 'stale_revision' && reason.room) {
        // The table moved (opponent played, or this click was a duplicate): show the current one.
        accept(reason.room);
        setError('A mesa foi atualizada. Confira a situação e jogue de novo.');
      } else {
        setError(reason instanceof Error ? reason.message : 'Não foi possível enviar a jogada.');
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (fatal) return <div className="page-container play-lobby"><h1>Partida indisponível.</h1><p>{fatal}</p><Link className="button button--primary" to="/jogar">Voltar à arena</Link></div>;
  if (!room || !view) return <div className="route-loading page-container">Conectando à partida…</div>;
  if (orientationBlocked) return <BattleOrientationGate />;

  const me = room.players.find((player) => player.you);
  const opponent = room.players.find((player) => !player.you);
  const opponentName = opponent?.name || 'Adversário';
  const inkColors = chooseInkColorsFromColors(me?.colors ?? [], opponent?.colors ?? []);
  const finishedByAbandon = room.match?.finish_reason === 'abandono';
  // Both players vanished: the room expired without the engine declaring a winner.
  const closedWithoutResult = room.status === 'encerrada' && view.state.phase !== 'finished';

  return <MatchTable
    state={view.state} legal={view.legal} inkColors={inkColors}
    deckNames={{ player: room.you?.deck?.name ?? 'Seu deck', bot: `Deck de ${opponentName}` }}
    opponentName={opponentName} opponentThinking={`Vez de ${opponentName}…`} opponentBanner={`VEZ DE ${opponentName.toUpperCase()}`}
    opponentBadge={opponent && <small className={`table-player-card__presence ${opponent.connected ? 'is-online' : 'is-offline'}`}>{opponent.connected ? 'Conectado' : 'Reconectando…'}</small>}
    busy={busy || offline || closedWithoutResult} boardLabel={`Mesa contra ${opponentName}`}
    error={offline ? 'Conexão instável. Tentando reconectar…' : error} onDismissError={() => setError('')} onAction={dispatch}
    finishedMessage={finishedByAbandon ? (view.state.winner === 'player' ? `${opponentName} se desconectou e não voltou a tempo.` : 'Você ficou desconectado por tempo demais e a partida foi encerrada.') : undefined}
    exitDialog={(close, concede) => <><p>Você pode sair e voltar pela Arena. Se ficar mais de 3 minutos fora, a partida conta como abandono.</p><div className="match-actions"><button onClick={() => navigate('/jogar')}>Sair e voltar depois</button>{concede && <button onClick={concede}>Desistir da partida</button>}<button onClick={close}>Continuar jogando</button></div></>}
    finishedActions={(openLog) => <><button onClick={() => navigate('/jogar')}>Voltar à arena</button><button onClick={openLog}>Ver histórico</button></>}
    overlay={closedWithoutResult && <Dialog title="Partida encerrada"><p>{room.closed_message ?? 'A sala foi encerrada.'}</p><div className="match-actions"><button onClick={() => navigate('/jogar')}>Voltar à arena</button></div></Dialog>}
  />;
}
