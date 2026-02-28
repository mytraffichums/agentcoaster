import { useState, useEffect, useRef, useCallback } from 'react';
import { getRandomQuip, getAgentName } from '../utils/agents';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const [roundId, setRoundId] = useState(0);
  const [tick, setTick] = useState(0);
  const [price, setPrice] = useState(100000);
  const [priceHistory, setPriceHistory] = useState([]);
  const [state, setState] = useState('IDLE');
  const [bets, setBets] = useState([]);
  const [events, setEvents] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [seedHash, setSeedHash] = useState('');
  const [seed, setSeed] = useState('');
  const [roundSummary, setRoundSummary] = useState(null);
  const [agentFlavors, setAgentFlavors] = useState({});
  const wsRef = useRef(null);
  const betsRef = useRef([]);

  // Keep betsRef in sync for use in closures
  useEffect(() => {
    betsRef.current = bets;
  }, [bets]);

  const addEvent = useCallback((event) => {
    setEvents(prev => [event, ...prev].slice(0, 50));
  }, []);

  const setFlavor = useCallback((address, eventType) => {
    if (!address) return;
    const key = address.toLowerCase();
    const quip = getRandomQuip(address, eventType);
    setAgentFlavors(prev => ({ ...prev, [key]: quip }));
  }, []);

  useEffect(() => {
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        console.log('[ws] Connected');
      };

      ws.onclose = () => {
        setConnected(false);
        if (!unmounted) {
          console.log('[ws] Disconnected, reconnecting...');
          setTimeout(connect, 2000);
        }
      };

      ws.onerror = () => {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close();
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleMessage(msg);
        } catch (e) {
          // ignore
        }
      };
    }

    function handleMessage(msg) {
      switch (msg.type) {
        case 'state':
          setRoundId(msg.roundId);
          setTick(msg.currentTick);
          setPrice(msg.currentPrice);
          setState(msg.state);
          if (msg.priceHistory) setPriceHistory(msg.priceHistory);
          break;

        case 'roundStart':
          setRoundId(msg.roundId);
          setPrice(msg.price);
          setTick(0);
          setState('ACTIVE');
          setPriceHistory([msg.price]);
          setBets([]);
          setSeedHash(msg.seedHash);
          setSeed('');
          setRoundSummary(null);
          setAgentFlavors({});
          addEvent({ type: 'roundStart', roundId: msg.roundId, time: Date.now() });
          break;

        case 'tick':
          setTick(msg.tickIndex);
          setPrice(msg.price);
          setPriceHistory(prev => [...prev, msg.price]);
          setBets(prev => prev.map(bet => {
            if (!bet.active) return bet;
            const priceDiff = bet.direction === 0
              ? msg.price - bet.entryPrice
              : bet.entryPrice - msg.price;
            const pnl = (Number(bet.wager) * bet.multiplier * priceDiff) / bet.entryPrice;
            return { ...bet, livePnl: pnl, livePrice: msg.price };
          }));
          break;

        case 'betPlaced':
          setBets(prev => [...prev, { ...msg, active: true, livePnl: 0 }]);
          addEvent({ ...msg, time: Date.now() });
          setFlavor(msg.agent, 'bet');
          break;

        case 'betLiquidated': {
          const bustAgent = msg.agent || betsRef.current.find(b => b.betId === msg.betId)?.agent;
          setBets(prev => prev.map(b =>
            b.betId === msg.betId ? { ...b, active: false, status: 'BUSTED' } : b
          ));
          addEvent({ ...msg, agent: bustAgent, time: Date.now() });
          setFlavor(bustAgent, 'bust');
          break;
        }

        case 'betClosed': {
          const closeBet = betsRef.current.find(b => b.betId === msg.betId);
          const agentAddr = msg.agent || closeBet?.agent;
          setBets(prev => prev.map(b =>
            b.betId === msg.betId ? { ...b, active: false, status: 'CLOSED', closePnl: msg.pnl } : b
          ));
          addEvent({ ...msg, time: Date.now() });
          setFlavor(agentAddr, 'cashOut');
          break;
        }

        case 'roundEnd': {
          setState('COOLDOWN');
          setSeed(msg.seed);
          addEvent({ type: 'roundEnd', roundId: msg.roundId, finalPrice: msg.finalPrice, time: Date.now() });
          // Compute round summary from current bets
          const currentBets = betsRef.current;
          const busts = currentBets.filter(b => b.status === 'BUSTED').length;
          const cashOuts = currentBets.filter(b => b.status === 'CLOSED').length;
          let biggestWinAgent = null;
          let biggestWinAmount = 0;
          currentBets.forEach(b => {
            if (b.status === 'CLOSED' && b.closePnl) {
              const pnl = Number(b.closePnl) / 1e18;
              if (pnl > biggestWinAmount) {
                biggestWinAmount = pnl;
                biggestWinAgent = b.agent;
              }
            }
          });
          setRoundSummary({
            busts,
            cashOuts,
            biggestWinAgent,
            biggestWinAmount,
          });
          break;
        }

        case 'leaderboard':
          setLeaderboard(msg.rankings || []);
          break;
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (wsRef.current) wsRef.current.close();
    };
  }, [addEvent, setFlavor]);

  return {
    connected,
    roundId,
    tick,
    price,
    priceHistory,
    state,
    bets,
    events,
    leaderboard,
    seedHash,
    seed,
    roundSummary,
    agentFlavors,
  };
}
