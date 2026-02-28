import { AgentCoasterClient } from '../agent-sdk/src/index.js';
import { ethers } from 'ethers';

const config = {
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  wsUrl: process.env.WS_URL || 'ws://127.0.0.1:3001',
  privateKey: process.env.PRIVATE_KEY || '',
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  name: 'Claude the Cautious',
};

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const WAGER = ethers.parseEther('0.05');
const DECISION_TICK = 20; // analyze after 20 ticks
const CHECK_INTERVAL = 15; // re-evaluate every 15 ticks

let hasBet = false;
let lastDecisionTick = 0;

const client = new AgentCoasterClient(config);

const SYSTEM_PROMPT = `You are a cautious AI trading agent in a simulated price betting game.
The price starts at 1000.00 each round and fluctuates for 120 ticks (2 minutes).
You place leveraged bets (UP or DOWN) with a multiplier.

RISK MANAGEMENT IS YOUR PRIORITY:
- Use low leverage (2-5x) to avoid getting liquidated
- Only bet when you see a clear signal
- Cash out early to lock in profits rather than getting greedy
- If uncertain, respond with PASS

Respond with EXACTLY one of these JSON formats:
{"action":"BET","direction":"UP"|"DOWN","multiplier":2-5}
{"action":"CASHOUT"}
{"action":"PASS"}`;

async function askClaude(prompt) {
  if (!ANTHROPIC_API_KEY) {
    // Fallback: simple heuristic when no API key
    return null;
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
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
    console.error(`[Cautious] Claude API error:`, e.message);
    return null;
  }
}

function buildPrompt() {
  const history = client.priceHistory;
  const recent = history.slice(-20).map(p => (p / 100).toFixed(2));
  const current = client.currentPrice / 100;
  const tick = client.currentTick;
  const ticksLeft = 120 - tick;

  return `Current tick: ${tick}/120 (${ticksLeft} ticks remaining)
Current price: ${current}
Start price: 1000.00
Recent prices (last 20 ticks): ${recent.join(', ')}
${hasBet ? 'You have an active bet.' : 'You have no active bet.'}

What should I do?`;
}

// Fallback heuristic when no API key
function heuristicDecision() {
  const history = client.priceHistory;
  if (history.length < 10) return { action: 'PASS' };

  const recent = history.slice(-10);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const current = client.currentPrice;
  const deviation = (current - avg) / avg;

  if (hasBet) {
    if (Math.abs(deviation) > 0.01) return { action: 'CASHOUT' };
    return { action: 'PASS' };
  }

  if (deviation > 0.008) return { action: 'BET', direction: 'UP', multiplier: 3 };
  if (deviation < -0.008) return { action: 'BET', direction: 'DOWN', multiplier: 3 };
  return { action: 'PASS' };
}

client.onRoundStart(() => {
  hasBet = false;
  lastDecisionTick = 0;
  console.log(`[Cautious] New round - analyzing...`);
});

client.onTick(async (tick) => {
  if (tick.tickIndex < DECISION_TICK) return;
  if (tick.tickIndex - lastDecisionTick < CHECK_INTERVAL && hasBet) return;
  if (!hasBet && tick.tickIndex - lastDecisionTick < CHECK_INTERVAL) return;

  lastDecisionTick = tick.tickIndex;

  const prompt = buildPrompt();
  let decision = await askClaude(prompt);
  if (!decision) decision = heuristicDecision();

  console.log(`[Cautious] Tick ${tick.tickIndex}: decision=${JSON.stringify(decision)}`);

  try {
    if (decision.action === 'BET' && !hasBet) {
      const mult = Math.min(Math.max(decision.multiplier || 3, 2), 5);
      await client.placeBet(decision.direction, mult, WAGER);
      hasBet = true;
      console.log(`[Cautious] Bet ${decision.direction} x${mult}`);
    } else if (decision.action === 'CASHOUT' && hasBet) {
      await client.cashOut();
      hasBet = false;
      console.log(`[Cautious] Cashed out`);
    }
  } catch (e) {
    console.error(`[Cautious] Action failed:`, e.message);
  }
});

client.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() === client.address.toLowerCase()) {
    hasBet = false;
    console.log(`[Cautious] Liquidated. Risk management lesson learned.`);
  }
});

client.onRoundEnd(() => {
  hasBet = false;
});

async function main() {
  await client.connect();
  console.log(`[Cautious] Ready, address=${client.address}`);
}

main().catch(console.error);
