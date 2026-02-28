import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
// Anvil default account #0
const DEPLOYER_KEY = process.env.DEPLOYER_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const OPERATOR_KEY = process.env.OPERATOR_KEY || DEPLOYER_KEY;
const FUND_AMOUNT = process.env.FUND_AMOUNT || '10';

async function deploy() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deployer = new ethers.Wallet(DEPLOYER_KEY, provider);
  const operatorWallet = new ethers.Wallet(OPERATOR_KEY, provider);

  console.log(`Deployer: ${deployer.address}`);
  console.log(`Operator: ${operatorWallet.address}`);

  // Read compiled contract
  const artifactPath = join(__dirname, '..', 'contracts', 'out', 'AgentCoaster.sol', 'AgentCoaster.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  console.log('Deploying AgentCoaster...');
  const contract = await factory.deploy(operatorWallet.address);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`AgentCoaster deployed at: ${address}`);

  // Fund the house
  const fundTx = await contract.fund({ value: ethers.parseEther(FUND_AMOUNT) });
  await fundTx.wait();
  console.log(`House funded with ${FUND_AMOUNT} ETH`);

  const balance = await contract.getContractBalance();
  console.log(`Contract balance: ${ethers.formatEther(balance)} ETH`);

  return address;
}

const address = await deploy();
console.log(`\nCONTRACT_ADDRESS=${address}`);
