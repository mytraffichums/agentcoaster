export function formatPrice(priceInt) {
  return (priceInt / 100).toFixed(2);
}

export function formatPnl(pnlWei) {
  const eth = Number(pnlWei) / 1e18;
  const sign = eth >= 0 ? '+' : '';
  return `${sign}${eth.toFixed(4)} MON`;
}

export function formatWager(wagerWei) {
  return `${(Number(wagerWei) / 1e18).toFixed(3)} MON`;
}

export function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function shortenAddress(addr) {
  if (!addr) return '';
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function directionLabel(dir) {
  return dir === 0 ? 'UP' : 'DOWN';
}

export function computeVolatility(priceHistory, lookback = 20) {
  if (!priceHistory || priceHistory.length < lookback + 1) return 'LOW';
  const recent = priceHistory.slice(-lookback - 1);
  const returns = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] === 0) continue;
    returns.push((recent[i] - recent[i - 1]) / recent[i - 1]);
  }
  if (returns.length === 0) return 'LOW';
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
  const stddev = Math.sqrt(variance);
  if (stddev > 0.01) return 'HIGH';
  if (stddev > 0.004) return 'MED';
  return 'LOW';
}
