import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { computeVolatility } from './utils/format';
import PriceChart from './components/PriceChart';
import RoundInfo from './components/RoundInfo';
import AgentPanel from './components/AgentPanel';
import InfoPanel from './components/InfoPanel';
import Leaderboard from './components/Leaderboard';
import EventFeed from './components/EventFeed';
import './App.css';

function App() {
  const {
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
  } = useWebSocket();

  const [showSplash, setShowSplash] = useState(false);
  const prevRoundRef = useRef(roundId);

  useEffect(() => {
    if (roundId !== prevRoundRef.current && state === 'ACTIVE') {
      setShowSplash(true);
      const timer = setTimeout(() => setShowSplash(false), 2000);
      prevRoundRef.current = roundId;
      return () => clearTimeout(timer);
    }
    prevRoundRef.current = roundId;
  }, [roundId, state]);

  const volatility = computeVolatility(priceHistory);

  return (
    <div className="app">
      {showSplash && (
        <div className="round-splash">
          <span>ROUND #{roundId}</span>
        </div>
      )}

      <RoundInfo
        roundId={roundId}
        tick={tick}
        price={price}
        state={state}
        seedHash={seedHash}
        seed={seed}
        connected={connected}
        volatility={volatility}
      />

      <div className="main-content">
        <div className="sidebar sidebar-left">
          <InfoPanel />
        </div>
        <div className="chart-section">
          <PriceChart priceHistory={priceHistory} bets={bets} tick={tick} />
        </div>
        <div className="sidebar sidebar-right">
          <AgentPanel bets={bets} currentPrice={price} agentFlavors={agentFlavors} roundSummary={state === 'COOLDOWN' ? roundSummary : null} roundId={roundId} />
        </div>
      </div>

      <div className="bottom-section">
        <Leaderboard rankings={leaderboard} />
        <EventFeed events={events} />
      </div>
    </div>
  );
}

export default App;
