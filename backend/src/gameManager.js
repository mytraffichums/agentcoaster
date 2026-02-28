import { generateSeed, computeSeedHash, generateFullPath, seedToHex } from './priceEngine.js';
import * as chain from './chainService.js';
import config from './config.js';
import { writeFileSync, readFileSync, rmSync, existsSync } from 'fs';

const ROUND_STATE_FILE = './round-state.json';

function saveRoundState(seed, seedHash, id) {
  writeFileSync(ROUND_STATE_FILE, JSON.stringify({ seed, seedHash, roundId: id }));
}

function clearRoundState() {
  rmSync(ROUND_STATE_FILE, { force: true });
}

function loadRoundState() {
  if (!existsSync(ROUND_STATE_FILE)) return null;
  try { return JSON.parse(readFileSync(ROUND_STATE_FILE, 'utf-8')); } catch { return null; }
}

const State = {
  IDLE: 'IDLE',
  ACTIVE: 'ACTIVE',
  SETTLING: 'SETTLING',
  COOLDOWN: 'COOLDOWN',
};

let state = State.IDLE;
let roundId = 0;
let currentSeed = null;
let currentSeedHash = null;
let pricePath = [];
let currentTick = 0;
let tickTimer = null;
let activeBets = new Map(); // betId → bet info
let knownAgents = new Set();
let broadcast = () => {};

export function setBroadcast(fn) {
  broadcast = fn;
}

export function getState() {
  return {
    state,
    roundId,
    currentTick,
    currentPrice: pricePath[currentTick] || config.startPrice,
    timeRemaining: state === State.ACTIVE ? (config.roundTicks - currentTick) : 0,
    priceHistory: pricePath.slice(0, currentTick + 1),
  };
}

export function getActiveBets() {
  return Array.from(activeBets.values());
}

export function getKnownAgents() {
  return Array.from(knownAgents);
}

export async function startNewRound() {
  if (state !== State.IDLE) {
    console.log(`[game] Cannot start round, state=${state}`);
    return;
  }

  // Recover from a stuck active round caused by a previous server restart
  const contractState = await chain.getContractRoundState();
  if (contractState.state === 1 /* ACTIVE */) {
    const saved = loadRoundState();
    if (saved) {
      console.log(`[game] Recovering stuck round ${contractState.roundId} with saved seed...`);
      try {
        const savedSeedBytes = Buffer.from(saved.seed.replace('0x', ''), 'hex');
        const recoveryPath = generateFullPath(savedSeedBytes, config.startPrice);
        const finalPrice = recoveryPath[config.roundTicks];
        const finalTick = config.roundTicks;
        const finalSig = await chain.signPrice(contractState.roundId, finalTick, finalPrice);
        await chain.endRound(saved.seed, finalPrice, finalTick, finalSig);
        clearRoundState();
        console.log(`[game] Stuck round settled. Starting fresh.`);
      } catch (err) {
        console.error('[game] Failed to settle stuck round:', err.message);
        return;
      }
    } else {
      console.error('[game] Contract has an active round but no saved seed. Call POST /admin/settle with the seed, or redeploy the contract.');
      return;
    }
  }

  currentSeed = generateSeed();
  currentSeedHash = computeSeedHash(currentSeed);
  pricePath = generateFullPath(currentSeed, config.startPrice);
  currentTick = 0;
  activeBets.clear();

  console.log(`[game] Starting round, seed=${seedToHex(currentSeed)}, hash=${currentSeedHash}`);

  try {
    const result = await chain.startRound(currentSeedHash);
    roundId = result.roundId;
    saveRoundState(seedToHex(currentSeed), currentSeedHash, roundId);
  } catch (err) {
    console.error('[game] Failed to start round on-chain:', err.message);
    return;
  }

  state = State.ACTIVE;

  broadcast({
    type: 'roundStart',
    roundId,
    seedHash: currentSeedHash,
    startTime: Date.now(),
    price: pricePath[0],
  });

  // Start tick loop
  currentTick = 1;
  tickTimer = setInterval(() => onTick(), config.tickInterval);
}

async function onTick() {
  if (state !== State.ACTIVE) return;

  const price = pricePath[currentTick];

  // Sign price off-chain — agents use this signature when placing bets
  const sig = await chain.signPrice(roundId, currentTick, price);

  broadcast({
    type: 'tick',
    roundId,
    tickIndex: currentTick,
    price,
    sig,
    timestamp: Date.now(),
  });

  // Check busts
  await checkBusts(price, currentTick, sig);

  currentTick++;

  if (currentTick > config.roundTicks) {
    clearInterval(tickTimer);
    tickTimer = null;
    await endCurrentRound();
    return;
  }
}

async function checkBusts(price, tick, sig) {
  for (const [betId, bet] of activeBets) {
    let busted = false;
    if (bet.direction === 0 && price <= bet.bustPrice) busted = true;
    if (bet.direction === 1 && price >= bet.bustPrice) busted = true;

    if (busted) {
      console.log(`[game] Bet ${betId} BUSTED at price ${price}, bust=${bet.bustPrice}`);
      const receipt = await chain.liquidate(betId, price, tick, sig);
      if (receipt) {
        activeBets.delete(betId);
        broadcast({
          type: 'betLiquidated',
          betId,
          agent: bet.agent,
          bustPrice: bet.bustPrice,
        });
      }
    }
  }
}

async function endCurrentRound() {
  state = State.SETTLING;
  const finalPrice = pricePath[config.roundTicks];

  console.log(`[game] Ending round ${roundId}, final price=${finalPrice}`);

  try {
    const finalTick = config.roundTicks;
    const finalSig = await chain.signPrice(roundId, finalTick, finalPrice);
    await chain.endRound(seedToHex(currentSeed), finalPrice, finalTick, finalSig);
    clearRoundState();
  } catch (err) {
    console.error('[game] Failed to end round on-chain:', err.message);
  }

  broadcast({
    type: 'roundEnd',
    roundId,
    seed: seedToHex(currentSeed),
    finalPrice,
  });

  activeBets.clear();
  state = State.COOLDOWN;

  // Broadcast leaderboard
  try {
    const agents = Array.from(knownAgents);
    if (agents.length > 0) {
      const lb = await chain.getLeaderboard(agents);
      broadcast({ type: 'leaderboard', rankings: lb });
    }
  } catch (err) {
    console.error('[game] Failed to fetch leaderboard:', err.message);
  }

  console.log(`[game] Cooldown ${config.cooldownMs}ms...`);
  setTimeout(() => {
    state = State.IDLE;
    startNewRound();
  }, config.cooldownMs);
}

// Called when we detect a BetPlaced event from chain
export function onBetPlaced(data) {
  knownAgents.add(data.agent);
  activeBets.set(data.betId, {
    agent: data.agent,
    direction: data.direction,
    multiplier: data.multiplier,
    wager: data.wager,
    entryPrice: data.entryPrice,
    bustPrice: data.bustPrice,
    entryTick: currentTick,
  });
}

export function onBetClosed(data) {
  activeBets.delete(data.betId);
}

export function onBetLiquidated(data) {
  activeBets.delete(data.betId);
}

export function getCurrentPrice() {
  return pricePath[currentTick] || config.startPrice;
}

// Returns the current round seed (hex) while a round is active — useful for admin recovery
export function getCurrentSeed() {
  return currentSeed ? seedToHex(currentSeed) : null;
}

// Force-settle a stuck on-chain round using a known seed, then go back to IDLE
export async function forceSettle(seedHex) {
  const contractState = await chain.getContractRoundState();
  if (contractState.state !== 1) {
    throw new Error(`Contract not in ACTIVE state (state=${contractState.state})`);
  }
  const seedBytes = Buffer.from(seedHex.replace('0x', ''), 'hex');
  const path = generateFullPath(seedBytes, config.startPrice);
  const finalPrice = path[config.roundTicks];
  const finalTick = config.roundTicks;
  const finalSig = await chain.signPrice(contractState.roundId, finalTick, finalPrice);
  await chain.endRound(seedHex, finalPrice, finalTick, finalSig);
  clearRoundState();
  state = State.IDLE;
  console.log(`[game] Force-settled round ${contractState.roundId}`);
}
