import { AgentCoasterClient } from '../agent-sdk/src/index.js';
import { ethers } from 'ethers';

const config = {
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  wsUrl: process.env.WS_URL || 'ws://127.0.0.1:3001',
  privateKey: process.env.PRIVATE_KEY || '',
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  name: 'Mean Reversion Mary',
};

const START_PRICE = 100000; // 1000.00
const DEVIATION_THRESHOLD = 0.02; // 2% away from start
const LEVERAGE_MIN = 2;
const LEVERAGE_MAX = 5;
const WAGER = ethers.parseEther('0.05');
const CASH_OUT_PROFIT_PCT = 0.08; // conservative: cash out at 8%
const MIN_TICK_TO_BET = 15;

let hasBet = false;
let entryPrice = 0;

const client = new AgentCoasterClient(config);

client.onRoundStart(() => {
  hasBet = false;
  entryPrice = 0;
  console.log(`[Mary] New round`);
});

client.onTick(async (tick) => {
  if (hasBet) {
    const price = client.currentPrice;
    if (entryPrice > 0) {
      const pctChange = Math.abs(price - entryPrice) / entryPrice;
      if (pctChange >= CASH_OUT_PROFIT_PCT) {
        try {
          await client.cashOut();
          hasBet = false;
          console.log(`[Mary] Cashed out at ${price / 100}`);
        } catch (e) {
          console.error(`[Mary] Cash out failed:`, e.message);
        }
      }
    }
    return;
  }

  if (tick.tickIndex < MIN_TICK_TO_BET) return;

  const price = client.currentPrice;
  const deviation = (price - START_PRICE) / START_PRICE;

  let direction = null;
  if (deviation > DEVIATION_THRESHOLD) {
    direction = 'DOWN'; // price too high, bet it reverts
  } else if (deviation < -DEVIATION_THRESHOLD) {
    direction = 'UP'; // price too low, bet it reverts
  }

  if (!direction) return;

  const leverage = LEVERAGE_MIN + Math.floor(Math.random() * (LEVERAGE_MAX - LEVERAGE_MIN + 1));

  try {
    await client.placeBet(direction, leverage, WAGER);
    hasBet = true;
    entryPrice = client.currentPrice;
    console.log(`[Mary] Bet ${direction} x${leverage} at ${entryPrice / 100} (deviation=${(deviation * 100).toFixed(1)}%)`);
  } catch (e) {
    console.error(`[Mary] Bet failed:`, e.message);
  }
});

client.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() === client.address.toLowerCase()) {
    hasBet = false;
    console.log(`[Mary] BUSTED!`);
  }
});

client.onRoundEnd(() => {
  hasBet = false;
});

async function main() {
  await client.connect();
  console.log(`[Mary] Ready, address=${client.address}`);
}

main().catch(console.error);
