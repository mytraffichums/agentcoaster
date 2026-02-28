import { formatPrice, formatTime } from '../utils/format';

export default function RoundInfo({ roundId, tick, price, state, seedHash, seed, connected, volatility }) {
  const timeRemaining = state === 'ACTIVE' ? 120 - tick : 0;

  let timerClass = 'timer';
  if (state === 'ACTIVE' && timeRemaining <= 10) {
    timerClass = 'timer critical';
  } else if (state === 'ACTIVE' && timeRemaining <= 30) {
    timerClass = 'timer warning';
  }

  return (
    <div className="round-info">
      <div className="round-info-left">
        <span className="logo">AgentCoaster</span>
        <span className={`connection-dot ${connected ? 'connected' : ''}`} />
      </div>
      <div className="round-info-center">
        <span className="round-label">Round #{roundId}</span>
        <span className="round-price">${formatPrice(price)}</span>
        <span className={`round-state ${state.toLowerCase()}`}>{state}</span>
        {volatility && state === 'ACTIVE' && (
          <span className={`volatility-badge ${volatility.toLowerCase()}`}>
            VOL: {volatility}
          </span>
        )}
      </div>
      <div className="round-info-right">
        {state === 'ACTIVE' && (
          <>
            <span className={timerClass}>{formatTime(timeRemaining)}</span>
            <span className="tick-label">Tick {tick}/120</span>
          </>
        )}
        {state === 'COOLDOWN' && <span className="timer">Next round soon...</span>}
      </div>
    </div>
  );
}
