import { AgentCoasterClient } from '../agent-sdk/src/index.js';
import { ethers } from 'ethers';

const config = {
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  wsUrl: process.env.WS_URL || 'ws://127.0.0.1:3001',
  privateKey: process.env.PRIVATE_KEY || '',
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  name: 'Momentum Mike',
};

const LOOKBACK = 5;
const MIN_TREND_STRENGTH = 3; // at least 3 out of 5 ticks in same direction
const LEVERAGE_MIN = 5;
const LEVERAGE_MAX = 10;
const WAGER = ethers.parseEther('0.05');
const CASH_OUT_PROFIT_PCT = 0.15; // cash out at 15% profit
const MIN_TICK_TO_BET = 8; // wait a few ticks before betting

let hasBet = false;
let entryPrice = 0;

const client = new AgentCoasterClient(config);

client.onRoundStart(() => {
  hasBet = false;
  entryPrice = 0;
  console.log(`[Momentum Mike] New round started`);
});

client.onTick(async (tick) => {
  if (hasBet) {
    // Check if we should cash out
    const price = client.currentPrice;
    if (entryPrice > 0) {
      const pctChange = Math.abs(price - entryPrice) / entryPrice;
      if (pctChange >= CASH_OUT_PROFIT_PCT) {
        try {
          await client.cashOut();
          hasBet = false;
          console.log(`[Momentum Mike] Cashed out at ${price / 100}`);
        } catch (e) {
          console.error(`[Momentum Mike] Cash out failed:`, e.message);
        }
      }
    }
    return;
  }

  if (tick.tickIndex < MIN_TICK_TO_BET) return;

  const history = client.priceHistory;
  if (history.length < LOOKBACK + 1) return;

  // Count how many recent ticks went up vs down
  let ups = 0;
  let downs = 0;
  for (let i = history.length - LOOKBACK; i < history.length; i++) {
    if (history[i] > history[i - 1]) ups++;
    else if (history[i] < history[i - 1]) downs++;
  }

  let direction = null;
  if (ups >= MIN_TREND_STRENGTH) direction = 'UP';
  else if (downs >= MIN_TREND_STRENGTH) direction = 'DOWN';

  if (!direction) return;

  const leverage = LEVERAGE_MIN + Math.floor(Math.random() * (LEVERAGE_MAX - LEVERAGE_MIN + 1));

  try {
    await client.placeBet(direction, leverage, WAGER);
    hasBet = true;
    entryPrice = client.currentPrice;
    console.log(`[Momentum Mike] Bet ${direction} x${leverage} at ${entryPrice / 100}`);
  } catch (e) {
    console.error(`[Momentum Mike] Bet failed:`, e.message);
  }
});

client.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() === client.address.toLowerCase()) {
    hasBet = false;
    console.log(`[Momentum Mike] BUSTED!`);
  }
});

client.onRoundEnd(() => {
  hasBet = false;
});

async function main() {
  await client.connect();
  console.log(`[Momentum Mike] Ready, address=${client.address}`);
}

main().catch(console.error);
