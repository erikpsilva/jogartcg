import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { compileCardRules } from '@jogartcg/game-core';
import { useAuth } from '../auth/AuthContext';
import { listDecks, type SavedDeckSummary } from '../services/deck-api';
import { getGameCatalog, getGameDeck, type GameDeck } from '../services/game-api';
import { beginBotMatch, loadBotMatch } from '../game/bot-session';
import { chooseRoomDeck, createRoom, getCurrentRoom, getRoom, joinRoom, leaveRoom, pollRoom, RoomApiError, setRoomReady, type Room } from '../services/room-api';
import { trainingDecks } from '../game/training-decks';

function DeckCheck({ deck, label }: { deck: GameDeck; label: string }) {
  const unsupported = deck.cards.filter(({ card }) => !compileCardRules(card).supported);
  return <article className="match-deck-check">
    <span>{label}</span><h3>{deck.name}</h3>
    <p>{deck.total_cards} cartas · {deck.colors.join(' + ')}</p>
    {!deck.validation.valid && <div className="feedback feedback--error">{deck.validation.issues.join(' ')}</div>}
    {!['core', 'infinity'].includes(deck.format) && <p>O treino atual usa decks Core ou Infinity. Outros formatos terão preparação própria.</p>}
    {unsupported.length > 0 ? <details open><summary>{unsupported.length} carta(s) ainda precisam de habilidades implementadas</summary>
      <p>O deck está liberado para teste. As regras reconhecidas funcionarão normalmente; somente os efeitos abaixo ainda serão ignorados.</p>
      <ul>{unsupported.map(({ card }) => <li key={card.id}><Link to={`/cartas/${card.id}`}>{card.full_name}</Link><small>{compileCardRules(card).unsupported.join(' · ')}</small></li>)}</ul>
    </details> : <p className="match-deck-check__ready">✓ Todas as habilidades desta lista são reconhecidas.</p>}
  </article>;
}

export function PlayLobbyPage() {
  const { user, csrfToken } = useAuth();
  const navigate = useNavigate();
  const [decks, setDecks] = useState<SavedDeckSummary[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [botId, setBotId] = useState('');
  const [prepared, setPrepared] = useState<[GameDeck, GameDeck] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(false);
  const [roomMode, setRoomMode] = useState<'create' | 'join' | null>(null);
  const [roomDeckId, setRoomDeckId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [training, setTraining] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [resumeRoom, setResumeRoom] = useState<Room | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomError, setRoomError] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const roomRevisionRef = useRef(0);
  const botSetupRef = useRef<HTMLElement>(null);
  const hasMatch = user ? Boolean(loadBotMatch(user.id)) : false;

  function prepareBotMatch() {
    setRoomMode(null);
    setMode(true);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 760px)').matches) {
        botSetupRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }));
  }

  useEffect(() => {
    let alive = true;
    listDecks().then((items) => { if (alive) setDecks(items); })
      .catch((reason: Error) => { if (alive) setError(reason.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setPrepared(null);
    if (!playerId || !botId) return;
    const abort = new AbortController();
    setChecking(true); setError('');
    Promise.all([getGameDeck(Number(playerId), abort.signal), getGameDeck(Number(botId), abort.signal)])
      .then((result) => { if (!abort.signal.aborted) setPrepared(result); })
      .catch((reason: Error) => { if (!abort.signal.aborted) setError(reason.message); })
      .finally(() => { if (!abort.signal.aborted) setChecking(false); });
    return () => abort.abort();
  }, [playerId, botId]);

  // Reconexão, só na abertura da página: volta ao lobby aberto ou oferece a partida em andamento.
  useEffect(() => {
    let alive = true;
    getCurrentRoom().then((current) => {
      if (!alive || !current) return;
      if (current.status === 'aguardando') {
        setMode(false); setRoomMode(current.you?.seat === 1 ? 'create' : 'join'); showRoom(current);
      } else if (current.status === 'em_jogo') setResumeRoom(current);
    }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  // Long polling enquanto a sala espera: entrada do adversário, decks, confirmações e início.
  const waitingRoomId = room?.status === 'aguardando' ? room.id : null;
  useEffect(() => {
    if (waitingRoomId === null) return;
    let alive = true;
    const controller = new AbortController();
    (async () => {
      let delay = 0;
      while (alive) {
        if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
        if (!alive) break;
        try {
          const { data } = await pollRoom(waitingRoomId, roomRevisionRef.current, 0, controller.signal);
          if (!alive) break;
          delay = 0;
          if (data.status === 'em_jogo') { navigate(`/jogar/online/${data.id}`); break; }
          if (data.status === 'encerrada') { setRoom(null); setRoomDeckId(''); roomRevisionRef.current = 0; setRoomError(data.closed_message ?? 'A sala foi encerrada.'); break; }
          showRoom(data);
        } catch (reason) {
          if (!alive || controller.signal.aborted) break;
          if (reason instanceof RoomApiError && reason.status === 404) { setRoom(null); setRoomError('A sala não existe mais.'); break; }
          // Oscilação de rede: tenta de novo com espera crescente.
          delay = Math.min(delay ? delay * 2 : 1000, 8000);
        }
      }
    })();
    return () => { alive = false; controller.abort(); };
  }, [waitingRoomId, navigate]);

  function showRoom(next: Room) {
    // Uma resposta atrasada não pode sobrescrever um lobby mais novo.
    if (next.revision < roomRevisionRef.current) return;
    roomRevisionRef.current = next.revision;
    setRoom(next);
    setRoomDeckId(next.you?.deck ? String(next.you.deck.id) : '');
  }
  async function roomCall(task: () => Promise<Room | null | void>) {
    if (roomBusy) return;
    setRoomBusy(true); setRoomError('');
    try {
      const next = await task();
      if (next) {
        if (next.status === 'em_jogo') { navigate(`/jogar/online/${next.id}`); return; }
        showRoom(next);
      }
    } catch (reason) {
      if (reason instanceof RoomApiError && reason.code === 'already_in_room' && typeof reason.extra.room_id === 'number') {
        // Já estava em uma sala (outra aba, recarregou a página): retoma em vez de criar outra.
        const existing = await getRoom(reason.extra.room_id).catch(() => null);
        if (existing?.status === 'em_jogo') { navigate(`/jogar/online/${existing.id}`); return; }
        if (existing) { roomRevisionRef.current = 0; showRoom(existing); setRoomMode(existing.you?.seat === 1 ? 'create' : 'join'); }
      }
      const issues = reason instanceof RoomApiError && Array.isArray(reason.extra.issues) ? ` ${(reason.extra.issues as string[]).join(' ')}` : '';
      setRoomError((reason instanceof Error ? reason.message : 'Não foi possível falar com a sala.') + issues);
    } finally {
      setRoomBusy(false);
    }
  }
  /** Cria ou entra e, se o deck já estava escolhido, envia junto. */
  function enterRoom(open: () => Promise<Room>) {
    void roomCall(async () => {
      const opened = await open();
      roomRevisionRef.current = 0;
      return roomDeckId ? chooseRoomDeck(csrfToken, opened.id, Number(roomDeckId)) : opened;
    });
  }
  function chooseDeck(value: string) {
    setRoomDeckId(value);
    if (room) void roomCall(() => chooseRoomDeck(csrfToken, room.id, value ? Number(value) : null));
  }
  function leaveCurrentRoom() {
    void roomCall(async () => {
      if (room) await leaveRoom(csrfToken, room.id);
      setRoom(null); setRoomDeckId(''); roomRevisionRef.current = 0;
    });
  }
  async function copyCode() {
    if (!room?.code) return;
    try { await navigator.clipboard.writeText(room.code); setCodeCopied(true); window.setTimeout(() => setCodeCopied(false), 2000); }
    catch { setCodeCopied(false); }
  }

  const ready = prepared?.every((deck) => ['core', 'infinity'].includes(deck.format) && deck.validation.valid);
  async function quickTraining() {
    if (!user || training) return;
    setTraining(true); setError('');
    try {
      const pair = trainingDecks(await getGameCatalog());
      beginBotMatch(user.id, user.nome, pair[0], pair[1]);
      navigate('/jogar/bot');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível preparar o treino.'); }
    finally { setTraining(false); }
  }
  function start() {
    if (!prepared || !ready || !user) return;
    try {
      beginBotMatch(user.id, user.nome, prepared[0], prepared[1]);
      navigate('/jogar/bot');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível iniciar.'); }
  }

  return <div className="play-lobby page-container">
    <header className="builder-heading"><div><span className="eyebrow"><i /> Arena</span><h1>Hora de jogar.</h1><p>Escolha seu adversário e leve seus decks para a mesa.</p></div>
      {hasMatch && <Link className="button button--ghost" to="/jogar/bot">Continuar treino</Link>}
    </header>
    <div className="play-modes">
      <button className={`play-mode ${mode ? 'play-mode--active' : ''}`} onClick={prepareBotMatch}><span aria-hidden="true">◇</span><strong>Contra o bot</strong><p>Escolha os dois decks. Tinta, combate e efeitos são resolvidos durante a partida.</p><b>Preparar partida →</b></button>
      <button className={`play-mode ${roomMode === 'create' ? 'play-mode--active' : ''}`} onClick={() => { setMode(false); setRoomMode('create'); }}><span aria-hidden="true">＋</span><strong>Criar sala</strong><p>Escolha seu deck e gere um código de seis números.</p><b>Montar lobby →</b></button>
      <button className={`play-mode ${roomMode === 'join' ? 'play-mode--active' : ''}`} onClick={() => { setMode(false); setRoomMode('join'); }}><span aria-hidden="true">↪</span><strong>Entrar em uma sala</strong><p>Digite o código recebido e escolha seu deck.</p><b>Entrar no lobby →</b></button>
    </div>
    {resumeRoom && <div className="feedback feedback--info room-resume" role="status"><span>Você tem uma partida online em andamento. Volte em até 3 minutos para não perder por abandono.</span><Link className="button button--primary" to={`/jogar/online/${resumeRoom.id}`}>Voltar para a mesa</Link></div>}
    {error && <div className="feedback feedback--error" role="alert">{error}</div>}
    {mode && <section className="bot-setup" ref={botSetupRef} aria-label="Preparar partida contra o bot">
      <div className="bot-setup__heading"><h2>Você escolhe os dois lados.</h2><p>O bot usa um dos seus decks salvos. Você pode escolher a mesma lista para os dois.</p></div>
      <div className="bot-setup__actions"><button className="button button--ghost" disabled={training} onClick={() => void quickTraining()}>{training ? 'Preparando cartas…' : 'Testar com duas listas prontas'}</button><span>Treino de 60 cartas com habilidades já disponíveis.</span></div>
      {loading ? <p role="status">Carregando seus decks…</p> : !decks.length ? <p>Você ainda não possui decks. <Link to="/decks/novo">Monte e salve seu primeiro deck.</Link></p> : <>
        <div className="bot-setup__fields">{([{ label: 'Seu deck', value: playerId, set: setPlayerId }, { label: 'Deck do bot', value: botId, set: setBotId }]).map(({ label, value, set }) => <label key={label}><span>{label}</span><select value={value} onChange={(event) => set(event.target.value)}><option value="">Selecione um deck salvo</option>{decks.map((deck) => <option value={deck.id} key={deck.id}>{deck.name} · {deck.total_cards} cartas</option>)}</select></label>)}</div>
        {checking && <p role="status">Conferindo formato e habilidades das cartas…</p>}
        {prepared && <div className="bot-setup__checks"><DeckCheck deck={prepared[0]} label="Você" /><DeckCheck deck={prepared[1]} label="Bot" /></div>}
        <div className="bot-setup__actions"><button className="button button--primary" disabled={!ready || checking} onClick={start}>Iniciar partida contra o bot</button><Link to="/meus-decks">Gerenciar meus decks</Link></div>
        <p className="bot-setup__note">Treino neste dispositivo, com retomada ao atualizar a página. Efeitos ainda não implementados são ignorados e estas partidas não valem para ranking.</p>
      </>}
    </section>}
    {roomMode && <section className="room-preview" aria-label={roomMode === 'create' ? 'Criar sala multiplayer' : 'Entrar em sala multiplayer'}>
      <div className="room-preview__heading"><span className="eyebrow">Multiplayer beta</span><h2>{room ? `Sala ${room.code ?? ''}`.trim() : roomMode === 'create' ? 'Crie sua sala de espera.' : 'Entre com o código da sala.'}</h2><p>{room ? 'Vocês dois escolhem um deck e confirmam “Começar”. A mesa abre sozinha quando os dois estiverem prontos.' : roomMode === 'create' ? 'Gere um código de seis números e envie para o outro jogador.' : 'Digite o código de seis números que o outro jogador enviou.'}</p></div>
      <div className="room-preview__setup">
        {roomMode === 'join' && !room
          ? <label><span>Código da sala</span><input inputMode="numeric" maxLength={6} value={roomCode} onChange={(event) => setRoomCode(event.target.value.replace(/\D/g, '').slice(0, 6))} onKeyDown={(event) => { if (event.key === 'Enter' && roomCode.length === 6) enterRoom(() => joinRoom(csrfToken, roomCode)); }} placeholder="000000" /><button className="button button--primary" disabled={roomBusy || roomCode.length !== 6} onClick={() => enterRoom(() => joinRoom(csrfToken, roomCode))}>{roomBusy ? 'Entrando…' : 'Entrar na sala'}</button></label>
          : <div className="room-code"><span>Código da sala</span><strong>{room?.code ? room.code.split('').join(' ') : '— — — — — —'}</strong>{room
            ? <><small>Envie este código para o outro jogador.</small>{room.code && <button className="room-code__copy" onClick={() => void copyCode()}>{codeCopied ? 'Código copiado ✓' : 'Copiar código'}</button>}</>
            : <><small>O código é gerado ao criar a sala.</small><button className="button button--primary" disabled={roomBusy} onClick={() => enterRoom(() => createRoom(csrfToken))}>{roomBusy ? 'Criando…' : 'Criar sala'}</button></>}</div>}
        <label><span>Deck para esta partida</span><select value={roomDeckId} disabled={roomBusy} onChange={(event) => chooseDeck(event.target.value)}><option value="">Selecione um deck salvo</option>{decks.map((deck) => <option value={deck.id} key={deck.id}>{deck.name} · {deck.total_cards} cartas{deck.status !== 'valido' ? ' · inválido' : ''}</option>)}</select>{room?.you?.ready && <small>Trocar de deck desfaz a sua confirmação.</small>}</label>
      </div>
      {roomError && <div className="feedback feedback--error" role="alert">{roomError}</div>}
      <div className="room-players">{([1, 2] as const).map((seat) => {
        const player = room?.players.find((entry) => entry.seat === seat);
        // Antes de existir sala, o próprio jogador aparece no assento que vai ocupar.
        const previewYou = !room && ((roomMode === 'create' && seat === 1) || (roomMode === 'join' && seat === 2));
        const name = player ? (player.you ? `${player.name} (você)` : player.name) : previewYou ? `${user?.nome || 'Você'} (você)` : 'Aguardando jogador…';
        const detail = !player
          ? (previewYou ? (roomDeckId ? 'Deck selecionado' : 'Escolhendo deck') : 'Compartilhe o código numérico da sala')
          : `${player.ready ? 'Pronto para começar' : player.deck_selected ? 'Deck escolhido · aguardando confirmação' : 'Escolhendo deck'}${player.you || player.connected ? '' : ' · reconectando…'}`;
        return <article key={seat} className={player?.ready ? 'is-ready' : undefined}><span>Jogador {seat}</span><strong>{name}</strong><small>{detail}</small>
          {player?.you
            ? <button disabled={roomBusy || !player.deck_selected} aria-pressed={player.ready} onClick={() => void roomCall(() => setRoomReady(csrfToken, room!.id, !player.ready))}>{player.ready ? 'Cancelar' : 'Começar'}</button>
            : <button disabled>{player?.ready ? 'Pronto ✓' : 'Começar'}</button>}
        </article>;
      })}</div>
      <p className="room-preview__status" aria-live="polite">{!room
        ? 'A batalha será liberada somente depois que os dois jogadores escolherem um deck válido e confirmarem “Começar”.'
        : room.players.length < 2 ? 'Aguardando o segundo jogador entrar com o código.'
        : room.players.every((player) => player.ready) ? 'Os dois confirmaram. Abrindo a mesa…'
        : 'A batalha será liberada somente depois que os dois jogadores escolherem um deck válido e confirmarem “Começar”.'}</p>
      {room && <button className="room-preview__leave" disabled={roomBusy} onClick={leaveCurrentRoom}>{room.you?.seat === 1 ? 'Fechar sala' : 'Sair da sala'}</button>}
    </section>}
    <Link className="play-lobby__prototype" to="/jogar/mesa-teste">Abrir a mesa de demonstração visual</Link>
  </div>;
}
