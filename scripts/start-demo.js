import { spawn, execSync } from 'child_process';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { AGENT_KEYS, AGENT_NAMES, fundAgents } from './fund-agents.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const WS_URL = process.env.WS_URL || 'ws://127.0.0.1:3001';
const DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const FUND_AMOUNT = '50';

const processes = [];

function cleanup() {
  console.log('\nShutting down...');
  processes.forEach(p => {
    try { p.kill('SIGTERM'); } catch (e) {}
  });
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

function launchProcess(name, command, args, env = {}) {
  const proc = spawn(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', (data) => {
    data.toString().trim().split('\n').forEach(line => {
      console.log(`[${name}] ${line}`);
    });
  });

  proc.stderr.on('data', (data) => {
    data.toString().trim().split('\n').forEach(line => {
      console.error(`[${name}] ${line}`);
    });
  });

  proc.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
  });

  processes.push(proc);
  return proc;
}

async function waitForAnvil() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  for (let i = 0; i < 30; i++) {
    try {
      await provider.getBlockNumber();
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  throw new Error('Anvil did not start in time');
}

async function deploy() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);

  const artifactPath = join(ROOT, 'contracts', 'out', 'AgentCoaster.sol', 'AgentCoaster.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  const contract = await factory.deploy(deployer.address); // deployer is also operator
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  const fundTx = await contract.fund({ value: ethers.parseEther(FUND_AMOUNT) });
  await fundTx.wait();

  return address;
}

async function main() {
  console.log('=== AgentCoaster Demo ===\n');

  // Step 1: Build contracts
  console.log('1. Building contracts...');
  execSync('forge build', { cwd: join(ROOT, 'contracts'), stdio: 'inherit' });

  // Step 2: Start Anvil
  console.log('\n2. Starting Anvil...');
  launchProcess('anvil', 'anvil', ['--block-time', '1'], {});
  await waitForAnvil();
  console.log('   Anvil ready!');

  // Step 3: Deploy contract
  console.log('\n3. Deploying contract...');
  const contractAddress = await deploy();
  console.log(`   Contract: ${contractAddress}`);

  // Step 4: Fund agents
  console.log('\n4. Funding agents...');
  await fundAgents();

  // Step 5: Start backend
  console.log('\n5. Starting backend...');
  launchProcess('backend', 'node', ['backend/src/server.js', contractAddress], {
    RPC_URL,
    OPERATOR_PRIVATE_KEY: DEPLOYER_KEY,
    CONTRACT_ADDRESS: contractAddress,
  });

  // Wait for backend to start
  await new Promise(r => setTimeout(r, 3000));

  // Step 6: Start agents
  console.log('\n6. Starting agents...');
  const agentFiles = [
    'agents/momentum-mike.js',
    'agents/mean-reversion-mary.js',
    'agents/yolo-yolanda.js',
    'agents/claude-cautious.js',
    'agents/claude-degen.js',
  ];

  for (let i = 0; i < agentFiles.length; i++) {
    launchProcess(AGENT_NAMES[i], 'node', [agentFiles[i]], {
      RPC_URL,
      WS_URL,
      PRIVATE_KEY: AGENT_KEYS[i],
      CONTRACT_ADDRESS: contractAddress,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    });
    await new Promise(r => setTimeout(r, 500)); // stagger starts
  }

  // Step 7: Start frontend
  console.log('\n7. Starting frontend...');
  launchProcess('frontend', 'npx', ['vite', '--host'], {
    VITE_WS_URL: WS_URL,
  });

  console.log('\n=== AgentCoaster is running! ===');
  console.log(`Contract: ${contractAddress}`);
  console.log(`Backend:  http://localhost:3001`);
  console.log(`Frontend: http://localhost:5173`);
  console.log(`\nPress Ctrl+C to stop all processes\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  cleanup();
});
