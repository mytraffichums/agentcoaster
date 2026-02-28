import { ethers } from 'ethers';

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
// Anvil default account #0 (has 10000 ETH)
const FUNDER_KEY = process.env.FUNDER_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const FUND_PER_AGENT = process.env.FUND_PER_AGENT || '5';

// Deterministic agent keys (Anvil accounts #1-#5)
export const AGENT_KEYS = [
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // #1 Momentum Mike
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // #2 Mean Reversion Mary
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // #3 YOLO Yolanda
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // #4 Claude Cautious
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // #5 Claude Degen
];

export const AGENT_NAMES = [
  'Momentum Mike',
  'Mean Reversion Mary',
  'YOLO Yolanda',
  'Claude the Cautious',
  'Claude the Degen',
];

async function fundAgents() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const funder = new ethers.Wallet(FUNDER_KEY, provider);

  console.log(`Funder: ${funder.address} (balance: ${ethers.formatEther(await provider.getBalance(funder.address))} ETH)`);

  for (let i = 0; i < AGENT_KEYS.length; i++) {
    const wallet = new ethers.Wallet(AGENT_KEYS[i], provider);
    const balance = await provider.getBalance(wallet.address);

    if (balance < ethers.parseEther('1')) {
      const tx = await funder.sendTransaction({
        to: wallet.address,
        value: ethers.parseEther(FUND_PER_AGENT),
      });
      await tx.wait();
      console.log(`Funded ${AGENT_NAMES[i]} (${wallet.address}) with ${FUND_PER_AGENT} ETH`);
    } else {
      console.log(`${AGENT_NAMES[i]} (${wallet.address}) already has ${ethers.formatEther(balance)} ETH`);
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fundAgents().catch(console.error);
}

export { fundAgents };
