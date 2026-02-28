import { AgentCoasterClient } from '../agent-sdk/src/index.js';
import { ethers } from 'ethers';
import readline from 'readline';
import dotenv from 'dotenv';
dotenv.config();

const WAGER_SMALL = ethers.parseEther('0.02');
const WAGER_MED   = ethers.parseEther('0.03');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

// ── Per-agent runtime state ───────────────────────────────────────────────────
const trading    = { dave: false, cecile: false, oracle: false, cautious: false, degen: false };
const hasBet     = { dave: false, cecile: false, oracle: false, cautious: false, degen: false };
const entryPrice = { dave: 0,     cecile: 0,     oracle: 0,     cautious: 0,     degen: 0     };
const lastDecisionTick = { cautious: 0, degen: 0 };

function cfg(envKey, name) {
  return {
    rpcUrl:          process.env.RPC_URL,
    wsUrl:           process.env.WS_URL,
    contractAddress: process.env.CONTRACT_ADDRESS,
    privateKey:      process.env[envKey],
    name,
  };
}

// ── Claude API helper ─────────────────────────────────────────────────────────
async function askClaude(systemPrompt, userPrompt, agentName) {
  if (!ANTHROPIC_API_KEY) return null;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{.*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch (e) {
    console.error(`[${agentName}] Claude API error:`, e.message);
    return null;
  }
}

// ── DEGEN DAVE ────────────────────────────────────────────────────────────────
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

// ── CLAUDE CAUTIOUS ───────────────────────────────────────────────────────────
const CAUTIOUS_SYSTEM = `You are a cautious AI trading agent. Price starts at 1000.00, runs 120 ticks.
Use low leverage (2-5x) only. Only bet on clear signals. Cash out early to lock profits.
Respond with exactly one of:
{"action":"BET","direction":"UP","multiplier":2}
{"action":"CASHOUT"}
{"action":"PASS"}`;

const cautious = new AgentCoasterClient(cfg('CLAUDE_CAUTIOUS_KEY', 'Claude Cautious'));

cautious.onRoundStart(() => {
  hasBet.cautious = false; lastDecisionTick.cautious = 0;
  if (trading.cautious) console.log('[Cautious] New round — analyzing carefully.');
});

cautious.onTick(async (tick) => {
  if (!trading.cautious) return;
  if (tick.tickIndex < 20) return;
  if (tick.tickIndex - lastDecisionTick.cautious < 15) return;
  lastDecisionTick.cautious = tick.tickIndex;

  const h = cautious.priceHistory;
  const recent = h.slice(-20).map(p => (p / 100).toFixed(2)).join(', ');
  const prompt = `Tick: ${tick.tickIndex}/120 | Price: ${(cautious.currentPrice / 100).toFixed(2)} | Start: 1000.00
Last 20 ticks: ${recent}
${hasBet.cautious ? 'You have an active bet.' : 'No active bet.'}`;

  let decision = await askClaude(CAUTIOUS_SYSTEM, prompt, 'Cautious');
  if (!decision) decision = { action: 'PASS' };

  try {
    if (decision.action === 'BET' && !hasBet.cautious) {
      const lev = Math.min(Math.max(decision.multiplier || 3, 2), 5);
      await cautious.placeBet(decision.direction, lev, WAGER_SMALL);
      hasBet.cautious = true;
      console.log(`[Cautious] Bet ${decision.direction} x${lev}`);
    } else if (decision.action === 'CASHOUT' && hasBet.cautious) {
      await cautious.cashOut();
      hasBet.cautious = false;
      console.log('[Cautious] Cashed out.');
    }
  } catch (e) { console.error('[Cautious] Action failed:', e.message); }
});

cautious.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() !== cautious.address.toLowerCase()) return;
  hasBet.cautious = false;
  console.log('[Cautious] Liquidated. Risk management lesson learned.');
});

cautious.onRoundEnd(() => { hasBet.cautious = false; });

// ── CLAUDE DEGEN ──────────────────────────────────────────────────────────────
const DEGEN_SYSTEM = `You are a degen AI trading agent. Price starts at 1000.00, runs 120 ticks.
Go high leverage (20-50x). Bet early. Diamond hands unless gain is massive (>30%).
Respond with exactly one of:
{"action":"BET","direction":"UP","multiplier":30}
{"action":"CASHOUT"}
{"action":"PASS"}`;

const degen = new AgentCoasterClient(cfg('CLAUDE_DEGEN_KEY', 'Claude Degen'));

degen.onRoundStart(() => {
  hasBet.degen = false; lastDecisionTick.degen = 0;
  if (trading.degen) console.log('[Degen] NEW ROUND LFG!');
});

degen.onTick(async (tick) => {
  if (!trading.degen) return;
  if (tick.tickIndex < 10) return;
  if (tick.tickIndex - lastDecisionTick.degen < 20) return;
  lastDecisionTick.degen = tick.tickIndex;

  const h = degen.priceHistory;
  const recent = h.slice(-10).map(p => (p / 100).toFixed(2)).join(', ');
  const prompt = `Tick: ${tick.tickIndex}/120 | Price: ${(degen.currentPrice / 100).toFixed(2)}
Last 10 ticks: ${recent}
${hasBet.degen ? 'GOT A POSITION. Diamond hands or take profit?' : 'NO POSITION. Time to ape in?'}`;

  let decision = await askClaude(DEGEN_SYSTEM, prompt, 'Degen');
  if (!decision) decision = { action: hasBet.degen ? 'PASS' : 'BET', direction: Math.random() > 0.5 ? 'UP' : 'DOWN', multiplier: 30 };

  try {
    if (decision.action === 'BET' && !hasBet.degen) {
      const lev = Math.min(Math.max(decision.multiplier || 30, 20), 50);
      await degen.placeBet(decision.direction, lev, WAGER_SMALL);
      hasBet.degen = true;
      console.log(`[Degen] APE IN ${decision.direction} x${lev}!`);
    } else if (decision.action === 'CASHOUT' && hasBet.degen) {
      await degen.cashOut();
      hasBet.degen = false;
      console.log('[Degen] Paper handed... but profit is profit');
    }
  } catch (e) { console.error('[Degen] Action failed:', e.message); }
});

degen.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() !== degen.address.toLowerCase()) return;
  hasBet.degen = false;
  console.log('[Degen] REKT! It\'s just money...');
});

degen.onRoundEnd(() => { hasBet.degen = false; });

// ── CONTROL LOOP ──────────────────────────────────────────────────────────────
const agentMap = { dave, cecile, oracle, cautious, degen };

function setTrading(key, val) {
  if (!(key in trading)) { console.log('[Clawbot] Unknown agent:', key); return; }
  trading[key] = val;
  console.log(`[Clawbot] ${agentMap[key].name} trading ${val ? 'STARTED' : 'STOPPED'}`);
}

function printStatus() {
  console.log('\n── Clawbot Status ──────────────────────────────────');
  for (const [key, client] of Object.entries(agentMap)) {
    const addr = client.address ? client.address.slice(0, 10) + '...' : 'not connected';
    console.log(`  ${client.name.padEnd(16)} trading=${String(trading[key]).padEnd(5)}  bet=${String(hasBet[key]).padEnd(5)}  tick=${client.currentTick}  price=${(client.currentPrice / 100).toFixed(2)}  ${addr}`);
  }
  console.log('────────────────────────────────────────────────────\n');
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'clawbot> ' });

console.log('\n[Clawbot] Commands:');
console.log('  start [dave|cecile|oracle|cautious|degen]  — start trading (all if no name)');
console.log('  stop  [dave|cecile|oracle|cautious|degen]  — stop trading  (all if no name)');
console.log('  status                                     — show current state\n');

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
  console.log('[Clawbot] Connecting all agents...');

  await Promise.all(Object.entries(agentMap).map(async ([key, client]) => {
    try {
      await client.connect();
      console.log(`[Clawbot] ${client.name} connected (${client.address})`);
    } catch (e) {
      console.error(`[Clawbot] ${client.name} failed to connect: ${e.message}`);
      console.error(`[Clawbot] Check that ${key.toUpperCase()}_KEY is set in .env and the WS_URL is reachable`);
    }
  }));

  console.log('[Clawbot] Ready. Watching silently.\n');
  rl.prompt();
}

main().catch(console.error);
