import { formatPrice, directionLabel } from '../utils/format';
import { getAgentName, getAgentColor, getAgentEmoji } from '../utils/agents';

export default function AgentPanel({ bets, currentPrice, agentFlavors, roundSummary, roundId }) {
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

        let cardClass = 'agent-card';
        if (bet.status === 'BUSTED') {
          cardClass += ' busted shake';
        } else if (!bet.active) {
          cardClass += ' inactive';
        } else if (isProfitable && pnlEth > 0) {
          cardClass += ' glow-profit';
        } else if (!isProfitable) {
          cardClass += ' glow-loss';
        }

        const flavor = agentFlavors?.[bet.agent?.toLowerCase()];

        return (
          <div key={bet.betId} className={cardClass} style={{ borderLeftColor: color }}>
            <div className="agent-header">
              <span className="agent-icon">{getAgentEmoji(bet.agent)}</span>
              <span className="agent-name" style={{ color }}>{getAgentName(bet.agent)}</span>
              {bet.status === 'BUSTED' && <span className="status-badge busted">BUSTED</span>}
              {bet.status === 'CLOSED' && <span className="status-badge closed">CLOSED</span>}
            </div>
            <div className="agent-bet-info">
              <span className={`direction ${isUp ? 'up' : 'down'}`}>
                {isUp ? '\u25B2' : '\u25BC'} {directionLabel(bet.direction)}
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
                  <span>{isProfitable ? '+' : ''}{pnlEth.toFixed(4)} ({pnlPct.toFixed(1)}%)</span>
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
