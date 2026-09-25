import { useEffect, useMemo, useRef, useState } from 'react';
import { botThinkingDelay } from '../game/bot-pacing';
import { Link, useNavigate } from 'react-router-dom';
import { activeDecisionPlayer, applyAction, chooseBotAction, getLegalActions, type GameAction } from '@jogartcg/game-core';
import { useAuth } from '../auth/AuthContext';
import { BattleOrientationGate, useBattleOrientationBlocked } from '../components/BattleOrientationGate';
import { Dialog, MatchTable } from '../components/MatchTable';
import { loadBotMatch, saveBotMatch, type BotMatch } from '../game/bot-session';

/** Local training table: the engine runs in the browser and the bot plays the other side. */
export function BotGamePage() {
  const { user } = useAuth();
  const orientationBlocked = useBattleOrientationBlocked();
  const navigate = useNavigate();
  const [match, setMatch] = useState<BotMatch | null>(() => user ? loadBotMatch(user.id) : null);
  const [error, setError] = useState('');
  const [botError, setBotError] = useState('');
  const lastBotTurn = useRef<number | null>(null);
  const state = match?.state;
  const decisionPlayer = state ? activeDecisionPlayer(state) : null;
  const legal = useMemo(() => state ? getLegalActions(state, 'player') : [], [state]);

  useEffect(() => {
    if (match && user) {
      try { saveBotMatch(user.id, match); }
      catch { setError('O navegador não conseguiu guardar este treino. Mantenha a página aberta para continuar.'); }
    }
  }, [match, user]);
  useEffect(() => {
    if (!state || orientationBlocked || decisionPlayer !== 'bot' || state.phase === 'finished' || botError) return;
    const timer = window.setTimeout(() => {
      try {
        const action = chooseBotAction(state);
        const next = applyAction(state, action);
        lastBotTurn.current = state.turn;
        setMatch((current) => current && current.state === state ? { ...current, state: next } : current);
      } catch (reason) { setBotError(reason instanceof Error ? reason.message : 'O bot não conseguiu concluir a jogada.'); }
    }, botThinkingDelay(lastBotTurn.current !== state.turn, !!state.pending));
    return () => window.clearTimeout(timer);
  }, [state, decisionPlayer, botError, orientationBlocked]);

  if (!match || !state) return <div className="page-container play-lobby"><h1>Prepare sua partida.</h1><p>Escolha os dois decks para começar o treino.</p><Link className="button button--primary" to="/jogar">Escolher decks</Link></div>;
  if (orientationBlocked) return <BattleOrientationGate />;

  function dispatch(action: GameAction): boolean {
    if (!match) return false;
    try {
      const next = applyAction(match.state, action);
      setMatch({ ...match, state: next }); setError('');
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Essa ação não está disponível.');
      return false;
    }
  }

  return <MatchTable
    cosmetics={match.cosmetics}
    state={state} legal={legal} inkColors={match.inkColors} deckNames={match.deckNames}
    opponentName="Bot" opponentThinking="Bot pensando…" opponentBanner="O BOT ESTÁ JOGANDO"
    boardLabel="Mesa contra o bot" error={error} onDismissError={() => setError('')} onAction={dispatch}
    exitDialog={(close, concede) => <><p>Você pode voltar à arena e retomar este treino depois.</p><div className="match-actions"><button onClick={() => navigate('/jogar')}>Guardar e sair</button>{concede && <button onClick={concede}>Desistir da partida</button>}<button onClick={close}>Continuar jogando</button></div></>}
    finishedActions={(openLog) => <><button onClick={() => navigate('/jogar')}>Preparar nova partida</button><button onClick={openLog}>Ver histórico</button></>}
    overlay={botError && <Dialog title="O bot encontrou um problema"><p>{botError}</p><div className="match-actions"><button onClick={() => setBotError('')}>Tentar a jogada novamente</button><button onClick={() => navigate('/jogar')}>Voltar à arena</button></div></Dialog>}
  />;
}
