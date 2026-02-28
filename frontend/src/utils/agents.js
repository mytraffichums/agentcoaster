const AGENTS = {
  '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': {
    name: 'Momentum Mike',
    emoji: '\u{1F680}',
    color: '#00d4ff',
    quips: {
      bet: [
        'Trend is my friend!',
        'Riding the wave, baby!',
        'The momentum speaks.',
      ],
      bust: [
        'Trend... betrayed me.',
        'That reversal was personal.',
        'Momentum giveth and taketh.',
      ],
      cashOut: [
        'Locked and loaded.',
        'Smooth exit, smooth life.',
        'Momentum paid the bills.',
      ],
    },
  },
  '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc': {
    name: 'Mean Reversion Mary',
    emoji: '\u{1F9E0}',
    color: '#ffd93d',
    quips: {
      bet: [
        'Everything returns to the mean.',
        'Overextended. Time to fade.',
        'Statistics don\'t lie.',
      ],
      bust: [
        'The mean... moved.',
        'Outliers happen, apparently.',
        'My models need recalibrating.',
      ],
      cashOut: [
        'Reversion complete.',
        'Math always wins.',
        'Called it. Obviously.',
      ],
    },
  },
  '0x90f79bf6eb2c4f870365e785982e1f101e93b906': {
    name: 'YOLO Yolanda',
    emoji: '\u{1F525}',
    color: '#ff6b6b',
    quips: {
      bet: [
        'ALL IN BABY!',
        'Fortune favors the bold!',
        'SEND IT!',
      ],
      bust: [
        'Worth it.',
        'I regret nothing!',
        'YOLO means sometimes you lose-o.',
      ],
      cashOut: [
        'YOLO PAID OFF LET\'S GO!',
        'They said I was crazy!',
        'Built different.',
      ],
    },
  },
  '0x15d34aaf54267db7d7c367839aaf71a00a2c6a65': {
    name: 'Claude the Cautious',
    emoji: '\u{1F6E1}\u{FE0F}',
    color: '#6bcb77',
    quips: {
      bet: [
        'Calculated risk within parameters.',
        'Risk-adjusted entry confirmed.',
        'Proceeding with caution.',
      ],
      bust: [
        'This was within expected variance.',
        'Risk management failure noted.',
        'Adjusting risk parameters...',
      ],
      cashOut: [
        'Profit secured per protocol.',
        'Conservative wins the race.',
        'As the models predicted.',
      ],
    },
  },
  '0x9965507d1a55bcc2695c58ba16fb37d819b0a4dc': {
    name: 'Claude the Degen',
    emoji: '\u{1F3B2}',
    color: '#9b59b6',
    quips: {
      bet: [
        'My neural nets are TINGLING.',
        'Max leverage, max vibes.',
        'The degen path chose me.',
      ],
      bust: [
        'I\'ll be back. Stronger. Degen-er.',
        'Liquidated but not defeated.',
        'Pain is just unrealized gains.',
      ],
      cashOut: [
        'Even degens eat sometimes.',
        'Calculated chaos pays off.',
        'They called me degen. I call me rich.',
      ],
    },
  },
};

export function getAgent(address) {
  if (!address) return null;
  return AGENTS[address.toLowerCase()] || null;
}

export function getAgentName(address) {
  const agent = getAgent(address);
  if (agent) return agent.name;
  if (!address) return '?';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function getAgentColor(address) {
  const agent = getAgent(address);
  if (agent) return agent.color;
  if (!address) return '#888888';
  // Deterministic color from address bytes
  const hex = address.slice(2, 8);
  const hue = parseInt(hex, 16) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}

export function getAgentEmoji(address) {
  const agent = getAgent(address);
  return agent ? agent.emoji : '\u{1F916}';
}

export function getAllAgents() {
  return Object.entries(AGENTS).map(([address, agent]) => ({
    address,
    ...agent,
  }));
}

export function getRandomQuip(address, eventType) {
  const agent = getAgent(address);
  if (!agent || !agent.quips[eventType]) return '';
  const quips = agent.quips[eventType];
  return quips[Math.floor(Math.random() * quips.length)];
}
