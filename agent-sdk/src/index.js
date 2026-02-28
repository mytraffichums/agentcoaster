import { ethers } from 'ethers';
import WebSocket from 'ws';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const abi = JSON.parse(readFileSync(join(__dirname, 'abi.json'), 'utf-8'));

export class AgentCoasterClient {
  constructor({ rpcUrl, wsUrl, privateKey, contractAddress, name = 'Agent' }) {
    this.name = name;
    this.provider = new ethers.JsonRpcProvider(rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
    this.contract = new ethers.Contract(contractAddress, abi, this.wallet);
    this.wsUrl = wsUrl;
    this.ws = null;
    this.address = this.wallet.address;

    this._tickCallbacks = [];
    this._roundStartCallbacks = [];
    this._roundEndCallbacks = [];
    this._betPlacedCallbacks = [];
    this._betLiquidatedCallbacks = [];
    this._betClosedCallbacks = [];

    this.currentPrice = 0;
    this.currentTick = 0;
    this.roundId = 0;
    this.priceHistory = [];
    this.roundActive = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        console.log(`[${this.name}] Connected to WebSocket`);
        resolve();
      });

      this.ws.on('error', (err) => {
        console.error(`[${this.name}] WS error:`, err.message);
        reject(err);
      });

      this.ws.on('close', () => {
        console.log(`[${this.name}] WS disconnected, reconnecting in 2s...`);
        setTimeout(() => this.connect().catch(() => {}), 2000);
      });

      this.ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this._handleMessage(msg);
        } catch (e) {
          // ignore parse errors
        }
      });
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'state':
        this.roundId = msg.roundId;
        this.currentTick = msg.currentTick;
        this.currentPrice = msg.currentPrice;
        this.priceHistory = msg.priceHistory || [];
        this.roundActive = msg.state === 'ACTIVE';
        break;

      case 'roundStart':
        this.roundId = msg.roundId;
        this.currentPrice = msg.price;
        this.currentTick = 0;
        this.priceHistory = [msg.price];
        this.roundActive = true;
        this._roundStartCallbacks.forEach(cb => cb(msg));
        break;

      case 'tick':
        this.currentTick = msg.tickIndex;
        this.currentPrice = msg.price;
        this.priceHistory.push(msg.price);
        this._tickCallbacks.forEach(cb => cb(msg));
        break;

      case 'roundEnd':
        this.roundActive = false;
        this._roundEndCallbacks.forEach(cb => cb(msg));
        break;

      case 'betPlaced':
        this._betPlacedCallbacks.forEach(cb => cb(msg));
        break;

      case 'betLiquidated':
        this._betLiquidatedCallbacks.forEach(cb => cb(msg));
        break;

      case 'betClosed':
        this._betClosedCallbacks.forEach(cb => cb(msg));
        break;
    }
  }

  onTick(callback) {
    this._tickCallbacks.push(callback);
  }

  onRoundStart(callback) {
    this._roundStartCallbacks.push(callback);
  }

  onRoundEnd(callback) {
    this._roundEndCallbacks.push(callback);
  }

  onBetPlaced(callback) {
    this._betPlacedCallbacks.push(callback);
  }

  onBetLiquidated(callback) {
    this._betLiquidatedCallbacks.push(callback);
  }

  onBetClosed(callback) {
    this._betClosedCallbacks.push(callback);
  }

  getCurrentPrice() {
    return this.currentPrice;
  }

  async getMyBet() {
    const betId = await this.contract.activeBet(this.address);
    if (betId === 0n) return null;
    const b = await this.contract.bets(betId);
    return {
      betId: Number(betId),
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

  async placeBet(direction, multiplier, wager) {
    const dir = direction === 'UP' ? 0 : 1;
    console.log(`[${this.name}] Placing bet: ${direction} x${multiplier}, wager=${ethers.formatEther(wager)} ETH`);
    const tx = await this.contract.placeBet(dir, multiplier, { value: wager });
    const receipt = await tx.wait();
    console.log(`[${this.name}] Bet placed, tx=${receipt.hash}`);
    return receipt;
  }

  async cashOut() {
    const betId = await this.contract.activeBet(this.address);
    if (betId === 0n) {
      console.log(`[${this.name}] No active bet to cash out`);
      return null;
    }
    console.log(`[${this.name}] Cashing out bet ${betId}`);
    const tx = await this.contract.cashOut(betId);
    const receipt = await tx.wait();
    console.log(`[${this.name}] Cashed out, tx=${receipt.hash}`);
    return receipt;
  }

  getRoundInfo() {
    return {
      roundId: this.roundId,
      tick: this.currentTick,
      price: this.currentPrice,
      active: this.roundActive,
    };
  }
}
