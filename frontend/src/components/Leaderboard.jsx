import { getAgentName, getAgentColor } from '../utils/agents';

export default function Leaderboard({ rankings }) {
  if (!rankings.length) {
    return (
      <div className="leaderboard">
        <h3>Leaderboard</h3>
        <div className="no-data">No data yet</div>
      </div>
    );
  }

  return (
    <div className="leaderboard">
      <h3>Leaderboard</h3>
      <div className="leaderboard-grid">
        {rankings.map((r, i) => {
          const pnlEth = Number(r.totalPnL) / 1e18;
          const isProfitable = pnlEth >= 0;
          const color = getAgentColor(r.agent);

          return (
            <div key={r.agent} className="leaderboard-row" style={{ borderLeftColor: color }}>
              <span className="rank">{i === 0 ? '\u{1F451}' : `#${i + 1}`}</span>
              <span className="lb-agent" style={{ color }}>{getAgentName(r.agent)}</span>
              <span className={`lb-pnl ${isProfitable ? 'profit' : 'loss'}`}>
                {isProfitable ? '+' : ''}{pnlEth.toFixed(4)} MON
              </span>
              <span className="lb-record">{r.wins}W / {r.losses}L</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
