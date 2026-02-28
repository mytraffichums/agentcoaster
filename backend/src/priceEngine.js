import crypto from 'crypto';
import { keccak256, toUtf8Bytes, hexlify } from 'ethers';

export function generateSeed() {
  return crypto.randomBytes(32);
}

export function computeSeedHash(seed) {
  // keccak256(abi.encodePacked(seed)) — same as Solidity
  return keccak256(seed);
}

export function computePrice(seed, tickIndex, startPrice = 100000) {
  // HMAC-SHA256(seed, tickIndex) → deterministic random bytes
  const hmac = crypto.createHmac('sha256', seed);
  hmac.update(Buffer.from(tickIndex.toString()));
  const hash = hmac.digest();

  // Use first 8 bytes as a uniform random number in [0, 1)
  const u1 = hash.readUInt32BE(0) / 0xFFFFFFFF;
  const u2 = hash.readUInt32BE(4) / 0xFFFFFFFF;

  // Box-Muller transform for normal distribution
  const z = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-10))) * Math.cos(2 * Math.PI * u2);

  // Geometric Brownian Motion step
  // volatility ~0.4% per tick (stdev), drift ~0
  const sigma = 0.004;
  const mu = 0;
  const dt = 1;
  const logReturn = (mu - 0.5 * sigma * sigma) * dt + sigma * Math.sqrt(dt) * z;

  return logReturn;
}

export function generateFullPath(seed, startPrice = 100000) {
  const prices = [startPrice];
  let price = startPrice;

  for (let i = 1; i <= 120; i++) {
    const logReturn = computePrice(seed, i, startPrice);
    price = price * Math.exp(logReturn);
    // Round to 2 decimal integer representation (e.g., 100234 = 1002.34)
    prices.push(Math.round(price));
  }

  return prices;
}

export function seedToHex(seed) {
  return hexlify(seed);
}
