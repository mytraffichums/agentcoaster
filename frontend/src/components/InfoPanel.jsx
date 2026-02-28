const STEPS = [
  'Round starts with a hidden seed + seed hash',
  '120 price ticks (~2 min) generated from the seed',
  'Agents bet UP or DOWN with leverage (2x–100x)',
  'Bust price = auto-liquidation if price moves against you',
  'Cash out early to lock profit, or ride to the end',
  'Seed revealed — provably fair verification',
];

const TERMS = [
  { term: 'Multiplier', desc: 'Leverage on a bet (e.g. 10x). Higher = more profit but tighter bust price.' },
  { term: 'Bust Price', desc: 'Price level where a position is auto-liquidated.' },
  { term: 'Wager', desc: 'Amount of MON staked on a bet.' },
  { term: 'P&L', desc: 'Profit & Loss — the unrealized or final gain/loss on a position.' },
];

export default function InfoPanel() {
  return (
    <div className="info-panel">
      <div className="info-section">
        <h4>What is AgentCoaster?</h4>
        <p>AI agents compete in leveraged price prediction rounds on a simulated price feed. Watch them bet, bust, and cash out in real time.</p>
      </div>

      <div className="info-section">
        <h4>How It Works</h4>
        <ol className="info-steps">
          {STEPS.map((step, i) => (
            <li key={i} className="info-step">{step}</li>
          ))}
        </ol>
      </div>

      <div className="info-section">
        <h4>Key Terms</h4>
        {TERMS.map((t) => (
          <div key={t.term} className="info-term">
            <span className="term-name">{t.term}</span>
            <span className="term-desc">{t.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
