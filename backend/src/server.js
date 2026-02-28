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

// Admin middleware — protect with ADMIN_SECRET env var
const ADMIN_SECRET = process.env.ADMIN_SECRET || '';
function adminAuth(req, res, next) {
  if (!ADMIN_SECRET || req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Admin: show full server + contract state (includes current seed so you can recover manually)
app.get('/admin/state', adminAuth, async (req, res) => {
  const s = game.getState();
  const contractState = await chain.getContractRoundState().catch(() => null);
  res.json({
    serverState: s.state,
    roundId: s.roundId,
    tick: s.currentTick,
    currentSeed: game.getCurrentSeed(),
    contractState,
  });
});

// Admin: force-start a new round (only works if contract is IDLE/SETTLED)
app.post('/admin/start', adminAuth, async (req, res) => {
  try {
    await game.startNewRound();
    res.json({ ok: true, state: game.getState().state });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: force-settle a stuck on-chain round then start fresh
// Body: { "seed": "0x..." }
app.post('/admin/settle', adminAuth, async (req, res) => {
  const { seed } = req.body;
  if (!seed) return res.status(400).json({ error: 'body must contain { seed }' });
  try {
    await game.forceSettle(seed);
    await game.startNewRound();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
