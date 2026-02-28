import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import * as chain from './chainService.js';
import * as game from './gameManager.js';
import config from './config.js';

const app = express();
app.use(express.json());

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// REST API
app.get('/api/round', (req, res) => {
  const s = game.getState();
  res.json({
    roundId: s.roundId,
    state: s.state,
    tick: s.currentTick,
    price: s.currentPrice,
    timeRemaining: s.timeRemaining,
  });
});

app.get('/api/bets', (req, res) => {
  res.json(game.getActiveBets());
});

app.get('/api/bets/:agentId', async (req, res) => {
  const bets = game.getActiveBets();
  const agentBet = bets.find(b => b.agent.toLowerCase() === req.params.agentId.toLowerCase());
  res.json(agentBet || null);
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const agents = game.getKnownAgents();
    const lb = await chain.getLeaderboard(agents);
    res.json(lb);
  } catch (err) {
    res.json([]);
  }
});

app.get('/api/price-history', (req, res) => {
  const s = game.getState();
  res.json(s.priceHistory);
});

// HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[ws] Client connected (${clients.size} total)`);

  // Send current state on connect
  const s = game.getState();
  ws.send(JSON.stringify({
    type: 'state',
    ...s,
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] Client disconnected (${clients.size} total)`);
  });
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      ws.send(msg);
    }
  }
}

// Wire up game manager to broadcast
game.setBroadcast(broadcast);

// Start
export async function start(contractAddress) {
  chain.init(contractAddress);

  // Listen for on-chain events
  chain.listenForBets((event) => {
    if (event.type === 'betPlaced') {
      game.onBetPlaced(event);
      broadcast({ ...event, entryTick: game.getState().currentTick });
    } else if (event.type === 'betClosed') {
      game.onBetClosed(event);
      broadcast(event);
    } else if (event.type === 'betLiquidated') {
      game.onBetLiquidated(event);
      broadcast(event);
    }
  });

  server.listen(config.port, () => {
    console.log(`[server] HTTP + WS on port ${config.port}`);
  });

  // Start first round
  console.log('[server] Starting first round...');
  await game.startNewRound();
}

// If run directly
const contractAddr = process.argv[2] || config.contractAddress;
if (contractAddr) {
  start(contractAddr);
} else {
  console.error('Usage: node server.js <CONTRACT_ADDRESS>');
  process.exit(1);
}
