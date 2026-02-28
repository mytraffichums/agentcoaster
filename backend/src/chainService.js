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
  contract.on('BetPlaced', (betId, agent, direction, multiplier, wager, entryPrice, bustPrice, event) => {
    callback({
      type: 'betPlaced',
      betId: Number(betId),
      agent,
      direction: Number(direction),
      multiplier: Number(multiplier),
      wager: wager.toString(),
      entryPrice: Number(entryPrice),
      bustPrice: Number(bustPrice),
    });
  });

  contract.on('BetClosed', (betId, pnl, exitPrice, event) => {
    callback({
      type: 'betClosed',
      betId: Number(betId),
      pnl: pnl.toString(),
      exitPrice: Number(exitPrice),
    });
  });

  contract.on('BetLiquidated', (betId, bustPrice, event) => {
    callback({
      type: 'betLiquidated',
      betId: Number(betId),
      bustPrice: Number(bustPrice),
    });
  });
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
