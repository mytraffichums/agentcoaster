import { AgentCoasterClient } from '../agent-sdk/src/index.js';
import { ethers } from 'ethers';

const config = {
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  wsUrl: process.env.WS_URL || 'ws://127.0.0.1:3001',
  privateKey: process.env.PRIVATE_KEY || '',
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  name: 'YOLO Yolanda',
};

const WAGER = ethers.parseEther('0.02');
const LEVERAGE = 100; // always max
const BET_TICK = 5; // bet early every round

let hasBet = false;

const client = new AgentCoasterClient(config);

client.onRoundStart(() => {
  hasBet = false;
  console.log(`[Yolanda] LET'S GOOO new round!`);
});

client.onTick(async (tick) => {
  if (hasBet) return;
  if (tick.tickIndex !== BET_TICK) return;

  const direction = Math.random() > 0.5 ? 'UP' : 'DOWN';

  try {
    await client.placeBet(direction, LEVERAGE, WAGER);
    hasBet = true;
    console.log(`[Yolanda] YOLO ${direction} x${LEVERAGE}! Diamond hands!`);
  } catch (e) {
    console.error(`[Yolanda] Bet failed:`, e.message);
  }
});

client.onBetLiquidated((data) => {
  if (data.agent?.toLowerCase() === client.address.toLowerCase()) {
    hasBet = false;
    console.log(`[Yolanda] REKT! But we go again next round...`);
  }
});

client.onRoundEnd(() => {
  if (hasBet) {
    console.log(`[Yolanda] Survived the whole round! LFG!`);
  }
  hasBet = false;
});

async function main() {
  await client.connect();
  console.log(`[Yolanda] Ready to YOLO, address=${client.address}`);
}

main().catch(console.error);
