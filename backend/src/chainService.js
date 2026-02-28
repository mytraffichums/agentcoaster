import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import config from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const abi = JSON.parse(readFileSync(join(__dirname, 'abi.json'), 'utf-8'));

let provider;
let operatorWallet;
let contract;

export function init(contractAddress) {
  provider = new ethers.JsonRpcProvider(config.rpcUrl);
  operatorWallet = new ethers.Wallet(config.operatorKey, provider);
  const addr = contractAddress || config.contractAddress;
  contract = new ethers.Contract(addr, abi, operatorWallet);
  console.log(`[chain] Connected to ${config.rpcUrl}, operator=${operatorWallet.address}, contract=${addr}`);
  return { provider, operatorWallet, contract };
}

export function getContract() {
  return contract;
}

export function getProvider() {
  return provider;
}

export function getOperatorWallet() {
  return operatorWallet;
}

export async function startRound(seedHash) {
  const tx = await contract.startRound(seedHash);
  const receipt = await tx.wait();
  const roundId = await contract.currentRound();
  console.log(`[chain] Round ${roundId} started, tx=${receipt.hash}`);
  return { roundId: Number(roundId), txHash: receipt.hash };
}

export async function submitTickPrice(tick, price) {
  const tx = await contract.submitTickPrice(tick, price);
  await tx.wait();
}

export async function liquidate(betId, currentPrice) {
  try {
    const tx = await contract.liquidate(betId, currentPrice);
    const receipt = await tx.wait();
    console.log(`[chain] Bet ${betId} liquidated, tx=${receipt.hash}`);
    return receipt;
  } catch (err) {
    console.error(`[chain] Liquidation failed for bet ${betId}:`, err.message);
    return null;
  }
}

export async function endRound(seed) {
  const tx = await contract.endRound(seed);
  const receipt = await tx.wait();
  console.log(`[chain] Round ended, tx=${receipt.hash}`);
  return receipt;
}

export async function getContractBalance() {
  return await contract.getContractBalance();
}

export async function getRoundBetIds(roundId) {
  return await contract.getRoundBetIds(roundId);
}

export async function getBet(betId) {
  const b = await contract.bets(betId);
  return {
    agent: b[0],
    roundId: Number(b[1]),
    direction: Number(b[2]),
    multiplier: Number(b[3]),
    wager: b[4],
    entryPrice: Number(b[5]),
    bustPrice: Number(b[6]),
    entryTick: Number(b[7]),
    active: b[8],
  };
}

export function listenForBets(callback) {
  let lastBlock = 0;

  async function poll() {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (lastBlock === 0) { lastBlock = currentBlock; return; }
      if (currentBlock <= lastBlock) return;

      const [placed, closed, liquidated] = await Promise.all([
        contract.queryFilter(contract.filters.BetPlaced(), lastBlock + 1, currentBlock),
        contract.queryFilter(contract.filters.BetClosed(), lastBlock + 1, currentBlock),
        contract.queryFilter(contract.filters.BetLiquidated(), lastBlock + 1, currentBlock),
      ]);

      for (const e of placed) {
        callback({ type: 'betPlaced', betId: Number(e.args[0]), agent: e.args[1], direction: Number(e.args[2]), multiplier: Number(e.args[3]), wager: e.args[4].toString(), entryPrice: Number(e.args[5]), bustPrice: Number(e.args[6]) });
      }
      for (const e of closed) {
        callback({ type: 'betClosed', betId: Number(e.args[0]), pnl: e.args[1].toString(), exitPrice: Number(e.args[2]) });
      }
      for (const e of liquidated) {
        callback({ type: 'betLiquidated', betId: Number(e.args[0]), bustPrice: Number(e.args[1]) });
      }

      lastBlock = currentBlock;
    } catch (err) {
      console.error('[chain] Poll error:', err.message);
    }
  }

  setInterval(poll, 2000);
}

export async function getContractRoundState() {
  const roundId = await contract.currentRound();
  if (roundId === 0n) return { roundId: 0, state: 0 };
  const round = await contract.rounds(roundId);
  return { roundId: Number(roundId), state: Number(round[3]) }; // 0=IDLE,1=ACTIVE,2=SETTLED
}

export async function getLeaderboard(addresses) {
  const results = [];
  for (const addr of addresses) {
    const stats = await contract.leaderboard(addr);
    results.push({
      agent: addr,
      totalPnL: stats[0].toString(),
      wins: Number(stats[1]),
      losses: Number(stats[2]),
    });
  }
  return results.sort((a, b) => BigInt(b.totalPnL) > BigInt(a.totalPnL) ? 1 : -1);
}
