import { useState, useEffect, useRef } from 'react';
import { formatPrice, directionLabel } from '../utils/format';
import { getAgentName, getAgentColor, getAgentEmoji } from '../utils/agents';

// Smoothly counts a number toward a target value
function AnimatedPnl({ value, isProfitable }) {
  const [displayed, setDisplayed] = useState(value);
  const rafRef = useRef(null);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (Math.abs(to - from) < 1e-12) return;
    const start = performance.now();
    const duration = 250;

    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplayed(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = to;
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  const pnlEth = displayed / 1e18;
  const wagerRef = useRef(0);
  const pnlPct = wagerRef.current > 0 ? (pnlEth / wagerRef.current) * 100 : 0;

  return (
    <span className={isProfitable ? 'profit' : 'loss'}>
      {isProfitable ? '+' : ''}{pnlEth.toFixed(4)}
    </span>
  );
}

export default function AgentPanel({ bets, currentPrice, agentFlavors, roundSummary, roundId }) {
  // Track which betIds are brand new (for scan animation)
  const seenBetIds = useRef(new Set());
  // Track which betIds just closed (for flash animation)
  const [flashIds, setFlashIds] = useState(new Set());
  const prevBetsRef = useRef([]);

  useEffect(() => {
    const prev = prevBetsRef.current;
    const newFlash = new Set();

    bets.forEach(bet => {
      const wasActive = prev.find(b => b.betId === bet.betId)?.active;
      if (wasActive && bet.status === 'CLOSED') {
        newFlash.add(bet.betId);
      }
    });

    if (newFlash.size > 0) {
      setFlashIds(f => new Set([...f, ...newFlash]));
      setTimeout(() => {
        setFlashIds(f => {
          const next = new Set(f);
          newFlash.forEach(id => next.delete(id));
          return next;
        });
      }, 600);
    }

    prevBetsRef.current = bets;
  }, [bets]);

  if (!bets.length) {
    return (
      <div className="agent-panel">
        <h3>Agents</h3>
        <div className="no-bets">Waiting for bets...</div>
      </div>
    );
  }

  return (
    <div className="agent-panel">
      <h3>Agents</h3>
      {roundSummary && (
        <div className="round-recap">
          <h3>Round #{roundId} Recap</h3>
          <div className="recap-stats">
            <div className="recap-stat">
              <div className="label">Busts</div>
              <div className="value" style={{ color: '#ff5252' }}>{roundSummary.busts}</div>
            </div>
            <div className="recap-stat">
              <div className="label">Cash Outs</div>
              <div className="value" style={{ color: '#00e676' }}>{roundSummary.cashOuts}</div>
            </div>
          </div>
          {roundSummary.biggestWinAgent && (
            <div className="recap-winner">
              Biggest win: {getAgentName(roundSummary.biggestWinAgent)} +{roundSummary.biggestWinAmount.toFixed(4)} MON
            </div>
          )}
        </div>
      )}
      {bets.map((bet) => {
        const color = getAgentColor(bet.agent);
        const isUp = bet.direction === 0;
        const pnlWei = bet.livePnl || 0;
        const pnlEth = pnlWei / 1e18;
        const wagerEth = Number(bet.wager) / 1e18;
        const pnlPct = wagerEth > 0 ? (pnlEth / wagerEth) * 100 : 0;
        const isProfitable = pnlEth >= 0;

        const isNew = !seenBetIds.current.has(bet.betId);
        if (isNew) seenBetIds.current.add(bet.betId);

        let cardClass = 'agent-card';
        if (bet.status === 'BUSTED')       cardClass += ' busted shake';
        else if (!bet.active)              cardClass += ' inactive';
        else if (isProfitable && pnlEth > 0) cardClass += ' glow-profit';
        else if (!isProfitable)            cardClass += ' glow-loss';

        if (isNew)                         cardClass += ' card-scan';
        if (flashIds.has(bet.betId))       cardClass += ' flash-close';

        const flavor = agentFlavors?.[bet.agent?.toLowerCase()];

        return (
          <div key={bet.betId} className={cardClass}
            style={{ borderLeftColor: color, '--card-color': color }}>

            {bet.active && isProfitable && pnlEth > 0 && (
              <div className="particles">
                <div className="particle" style={{ '--color': color }} />
                <div className="particle" style={{ '--color': color }} />
                <div className="particle" style={{ '--color': color }} />
                <div className="particle" style={{ '--color': color }} />
                <div className="particle" style={{ '--color': color }} />
                <div className="particle" style={{ '--color': color }} />
              </div>
            )}
            {bet.status === 'BUSTED' && (
              <div className="bust-stamp">
                <div className="bust-stamp-text">BUSTED</div>
              </div>
            )}

            <div className="agent-header">
              <span className="agent-icon">{getAgentEmoji(bet.agent)}</span>
              <span className="agent-name" style={{ color }}>{getAgentName(bet.agent)}</span>
              {bet.status === 'BUSTED' && <span className="status-badge busted">BUSTED</span>}
              {bet.status === 'CLOSED' && <span className="status-badge closed">CLOSED</span>}
            </div>
            <div className="agent-bet-info">
              <span className={`direction ${isUp ? 'up' : 'down'}`}>
                {isUp ? '▲' : '▼'} {directionLabel(bet.direction)}
              </span>
              <span className="multiplier">x{bet.multiplier}</span>
            </div>
            <div className="agent-details">
              <div className="detail-row">
                <span>Entry</span>
                <span>${formatPrice(bet.entryPrice)}</span>
              </div>
              <div className="detail-row">
                <span>Bust</span>
                <span>${formatPrice(bet.bustPrice)}</span>
              </div>
              <div className="detail-row">
                <span>Wager</span>
                <span>{wagerEth.toFixed(3)} MON</span>
              </div>
              {bet.active && (
                <div className={`detail-row pnl ${isProfitable ? 'profit' : 'loss'}`}>
                  <span>P&L</span>
                  <span>
                    <AnimatedPnl value={pnlWei} isProfitable={isProfitable} />
                    {' '}({isProfitable ? '+' : ''}{pnlPct.toFixed(1)}%)
                  </span>
                </div>
              )}
            </div>
            {flavor && <div className="agent-flavor">"{flavor}"</div>}
          </div>
        );
      })}
    </div>
  );
}
