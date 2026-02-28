import dotenv from 'dotenv';
dotenv.config();

export default {
  port: parseInt(process.env.PORT || '3001'),
  wsPort: parseInt(process.env.WS_PORT || '3001'),
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
  operatorKey: process.env.OPERATOR_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Anvil default #0
  contractAddress: process.env.CONTRACT_ADDRESS || '',
  tickInterval: parseInt(process.env.TICK_INTERVAL || '1000'), // ms
  roundTicks: 120,
  priceSubmitInterval: parseInt(process.env.PRICE_SUBMIT_INTERVAL || '5'), // submit on-chain every N ticks
  cooldownMs: parseInt(process.env.COOLDOWN_MS || '10000'),
  startPrice: 100000, // 1000.00 with 2 decimals
};
