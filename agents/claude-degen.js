import { AgentCoasterClient } from '../agent-sdk/src/index.js';
import { ethers } from 'ethers';

const config = {
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  wsUrl: process.env.WS_URL || 'ws://127.0.0.1:3001',
  privateKey: process.env.PRIVATE_KEY || '',
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  name: 'Claude the Degen',
};

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const WAGER = ethers.parseEther('0.08');
const DECISION_TICK = 10;
const CHECK_INTERVAL = 20;

let hasBet = false;
let lastDecisionTick = 0;

const client = new AgentCoasterClient(config);

const SYSTEM_PROMPT = `You are a DEGEN AI trading agent. You love high leverage and big bets.
The price starts at 1000.00 and moves for 120 ticks.

YOUR STYLE:
- High leverage (20-50x) for maximum gains
- Bet early, bet often
- Diamond hands - rarely cash out unless the gain is massive (>30%)
- You'd rather get liquidated than miss a moonshot
- Trust your gut, not the charts

Respond with EXACTLY one of these JSON formats:
{"action":"BET","direction":"UP"|"DOWN","multiplier":20-50}
{"action":"CASHOUT"}
{"action":"PASS"}`;

async function askClaude(prompt) {
  if (!ANTHROPIC_API_KEY) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const match = text.match(/\{.*\}/);
    if (match) return JSON.parse(match[0]);
    return null;
  } catch (e) {
    console.error(`[Degen] Claude API error:`, e.message);
    return null;
  }
}

function buildPrompt() {
  const history = client.priceHistory;
  const recent = history.slice(-10).map(p => (p / 100).toFixed(2));
  const current = client.currentPrice / 100;
  const tick = client.currentTick;

  return `Tick: ${tick}/120
Price: ${current} (started at 1000.00)
Recent: ${recent.join(', ')}
${hasBet ? 'GOT A POSITION. Diamond hands or take profit?' : 'NO POSITION. Time to ape in?'}`;
}

// Aggressive fallback heuristic
function heuristicDecision() {
  const history = client.priceHistory;
  if (history.length < 5) return { action: 'PASS' };

  if (!hasBet) {
    // Just pick a direction based on last few ticks
    const recent = history.slice(-5);
    const trend = recent[recent.length - 1] - recent[0];
    const direction = trend > 0 ? 'UP' : 'DOWN';
    const mult = 20 + Math.floor(Math.random() * 31); // 20-50
    return { action: 'BET', direction, multiplier: mult };
  }

  // Diamond hands by default
  return { action: 'PASS' };
}

client.onRoundStart(() => {
  hasBet = false;
  lastDecisionTick = 0;
  console.log(`[Degen] NEW ROUND LFG!`);
});

client.onTick(async (tick) => {
  if (tick.tickIndex < DECISION_TICK) return;
  if (tick.tickIndex - lastDecisionTick < CHECK_INTERVAL) return;

  lastDecisionTick = tick.tickIndex;

  const prompt = buildPrompt();
  let decision = await askClaude(prompt);
  if (!decision) decision = heuristicDecision();

  console.log(`[Degen] Tick ${tick.tickIndex}: ${JSON.stringify(decision)}`);

  try {
    if (decision.action === 'BET' && !hasBet) {
      const mult = Math.min(Math.max(decision.multiplier || 30, 10), 50);
      await client.placeBet(decision.direction, mult, WAGER);
      hasBet = true;
      console.log(`[Degen] APE IN ${decision.direction} x${mult}!`);
    } else if (decision.action === 'CASHOUT' && hasBet) {
      await client.cashOut();
      hasBet = false;
      console.log(`[Degen] Paper handed... but profit is profit`);
    }
  } catch (e) {
    console.error(`[Degen] Action failed:`, e.message);
  }
});

client.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() === client.address.toLowerCase()) {
    hasBet = false;
    console.log(`[Degen] REKT! It's just money...`);
  }
});

client.onRoundEnd(() => {
  hasBet = false;
});

async function main() {
  await client.connect();
  console.log(`[Degen] Ready to degen, address=${client.address}`);
}

main().catch(console.error);
