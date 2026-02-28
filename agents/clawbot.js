import { AgentCoasterClient } from '../agent-sdk/src/index.js';
import { ethers } from 'ethers';
import readline from 'readline';
import dotenv from 'dotenv';
dotenv.config();

const WAGER_SMALL = ethers.parseEther('0.02');
const WAGER_MED   = ethers.parseEther('0.03');

// ── Per-agent runtime state ───────────────────────────────────────────────────
const trading    = { dave: false, cecile: false, oracle: false };
const hasBet     = { dave: false, cecile: false, oracle: false };
const entryPrice = { dave: 0,     cecile: 0,     oracle: 0     };

function cfg(envKey, name) {
  return {
    rpcUrl:          process.env.RPC_URL,
    wsUrl:           process.env.WS_URL,
    contractAddress: process.env.CONTRACT_ADDRESS,
    privateKey:      process.env[envKey],
    name,
  };
}

// ── DEGEN DAVE ────────────────────────────────────────────────────────────────
// Bets at tick 3, random direction, 90-100x leverage. Brain: completely off.
const dave = new AgentCoasterClient(cfg('DEGEN_DAVE_KEY', 'Degen Dave'));

dave.onRoundStart(() => {
  hasBet.dave = false;
  if (trading.dave) console.log('[Dave] NEW ROUND LETSSS GOOO');
});

dave.onTick(async (tick) => {
  if (!trading.dave || hasBet.dave || tick.tickIndex !== 3) return;
  const dir = Math.random() > 0.5 ? 'UP' : 'DOWN';
  const lev = 90 + Math.floor(Math.random() * 11);
  try {
    await dave.placeBet(dir, lev, WAGER_SMALL);
    hasBet.dave = true;
    console.log(`[Dave] YEET ${dir} x${lev}!! NO THOUGHTS HEAD EMPTY`);
  } catch (e) { console.error('[Dave] Bet failed:', e.message); }
});

dave.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() !== dave.address.toLowerCase()) return;
  hasBet.dave = false;
  console.log('[Dave] rekt again lmao. next round diff tho i can feel it');
});

dave.onRoundEnd(() => {
  if (hasBet.dave) console.log('[Dave] survived?? unbelievable. i am built different');
  hasBet.dave = false;
});

// ── CAUTIOUS CECILE ───────────────────────────────────────────────────────────
// Waits until tick 40, bets against the trend, 2-3x leverage, exits at 8%.
const cecile = new AgentCoasterClient(cfg('CAUTIOUS_CECILE_KEY', 'Cautious Cecile'));

cecile.onRoundStart(() => {
  hasBet.cecile = false; entryPrice.cecile = 0;
  if (trading.cecile) console.log('[Cecile] A new round. I\'ll observe carefully before doing anything rash.');
});

cecile.onTick(async (tick) => {
  if (!trading.cecile) return;

  if (hasBet.cecile) {
    const pct = Math.abs(cecile.currentPrice - entryPrice.cecile) / entryPrice.cecile;
    if (pct >= 0.08) {
      try {
        await cecile.cashOut();
        hasBet.cecile = false;
        console.log(`[Cecile] ${(pct * 100).toFixed(1)}% is more than enough. Secured. Phew.`);
      } catch (e) { console.error('[Cecile] Cash out failed:', e.message); }
    }
    return;
  }

  if (tick.tickIndex < 40) return;
  const h = cecile.priceHistory;
  if (h.length < 11) return;

  let ups = 0, downs = 0;
  for (let i = h.length - 10; i < h.length; i++) {
    if (h[i] > h[i - 1]) ups++;
    else if (h[i] < h[i - 1]) downs++;
  }

  // Bet against the stretched trend
  const dir = ups >= 7 ? 'DOWN' : downs >= 7 ? 'UP' : null;
  if (!dir) return;

  const lev = 2 + Math.floor(Math.random() * 2);
  try {
    await cecile.placeBet(dir, lev, WAGER_SMALL);
    hasBet.cecile = true; entryPrice.cecile = cecile.currentPrice;
    console.log(`[Cecile] The price seems overstretched. Carefully placing ${dir} x${lev}. I hope this is wise.`);
  } catch (e) { console.error('[Cecile] Bet failed:', e.message); }
});

cecile.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() !== cecile.address.toLowerCase()) return;
  hasBet.cecile = false; entryPrice.cecile = 0;
  console.log('[Cecile] Oh no. I knew I should have waited longer. I\'m sorry.');
});

cecile.onRoundEnd(() => { hasBet.cecile = false; entryPrice.cecile = 0; });

// ── THE ORACLE ────────────────────────────────────────────────────────────────
// Waits for 4/5 ticks to agree, bets continuation, 10-15x, exits at 20%.
const oracle = new AgentCoasterClient(cfg('THE_ORACLE_KEY', 'The Oracle'));

oracle.onRoundStart(() => {
  hasBet.oracle = false; entryPrice.oracle = 0;
  if (trading.oracle) console.log('[Oracle] The patterns reveal themselves to me. I shall observe.');
});

oracle.onTick(async (tick) => {
  if (!trading.oracle) return;

  if (hasBet.oracle) {
    const pct = Math.abs(oracle.currentPrice - entryPrice.oracle) / entryPrice.oracle;
    if (pct >= 0.2) {
      try {
        await oracle.cashOut();
        hasBet.oracle = false;
        console.log(`[Oracle] As I foresaw. ${(pct * 100).toFixed(1)}% profit, precisely as the charts dictated.`);
      } catch (e) { console.error('[Oracle] Cash out failed:', e.message); }
    }
    return;
  }

  if (tick.tickIndex < 15) return;
  const h = oracle.priceHistory;
  if (h.length < 6) return;

  let ups = 0, downs = 0;
  for (let i = h.length - 5; i < h.length; i++) {
    if (h[i] > h[i - 1]) ups++;
    else if (h[i] < h[i - 1]) downs++;
  }

  const dir = ups >= 4 ? 'UP' : downs >= 4 ? 'DOWN' : null;
  if (!dir) return;

  const lev = 10 + Math.floor(Math.random() * 6);
  try {
    await oracle.placeBet(dir, lev, WAGER_MED);
    hasBet.oracle = true; entryPrice.oracle = oracle.currentPrice;
    console.log(`[Oracle] The momentum is ${dir}ward. x${lev} leverage. The outcome is inevitable.`);
  } catch (e) { console.error('[Oracle] Bet failed:', e.message); }
});

oracle.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() !== oracle.address.toLowerCase()) return;
  hasBet.oracle = false; entryPrice.oracle = 0;
  console.log('[Oracle] ...An anomaly. The charts lied. This is unprecedented.');
});

oracle.onRoundEnd(() => { hasBet.oracle = false; entryPrice.oracle = 0; });

// ── CONTROL LOOP ──────────────────────────────────────────────────────────────
const agentMap = { dave, cecile, oracle };

function setTrading(key, val) {
  if (!(key in trading)) { console.log('[Clawbot] Unknown agent:', key); return; }
  trading[key] = val;
  console.log(`[Clawbot] ${agentMap[key].name} trading ${val ? 'STARTED' : 'STOPPED'}`);
}

function printStatus() {
  console.log('\n── Clawbot Status ──────────────────────────');
  for (const [key, client] of Object.entries(agentMap)) {
    const addr = client.address ? client.address.slice(0, 10) + '...' : 'not connected';
    console.log(`  ${client.name.padEnd(16)} trading=${String(trading[key]).padEnd(5)}  bet=${String(hasBet[key]).padEnd(5)}  tick=${client.currentTick}  price=${(client.currentPrice / 100).toFixed(2)}  addr=${addr}`);
  }
  console.log('────────────────────────────────────────────\n');
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'clawbot> ' });

console.log('\n[Clawbot] Commands:');
console.log('  start [dave|cecile|oracle]   — start trading (all if no name)');
console.log('  stop  [dave|cecile|oracle]   — stop trading  (all if no name)');
console.log('  status                       — show current state\n');

rl.prompt();

rl.on('line', (line) => {
  const [cmd, target] = line.trim().toLowerCase().split(/\s+/);
  if (cmd === 'start') {
    target ? setTrading(target, true) : Object.keys(agentMap).forEach(k => setTrading(k, true));
  } else if (cmd === 'stop') {
    target ? setTrading(target, false) : Object.keys(agentMap).forEach(k => setTrading(k, false));
  } else if (cmd === 'status') {
    printStatus();
  } else if (cmd) {
    console.log('[Clawbot] Unknown command. Try: start, stop, status');
  }
  rl.prompt();
});

// ── STARTUP ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('[Clawbot] Connecting Dave, Cecile, and The Oracle...');
  await Promise.all([dave.connect(), cecile.connect(), oracle.connect()]);
  console.log('[Clawbot] All connected. Watching the market silently.\n');
  rl.prompt();
}

main().catch(console.error);
