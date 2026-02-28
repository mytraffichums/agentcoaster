// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentCoaster {
    address public owner;
    address public operator;

    uint256 public currentRound;
    uint256 public nextBetId;

    enum Direction { UP, DOWN }
    enum RoundState { IDLE, ACTIVE, SETTLED }

    struct Round {
        bytes32 seedHash;
        bytes32 seed;
        uint256 startTime;
        RoundState state;
        uint256 finalPrice;
        uint256 currentTick;
        uint256 currentPrice;
    }

    struct Bet {
        address agent;
        uint256 roundId;
        Direction direction;
        uint256 multiplier;
        uint256 wager;
        uint256 entryPrice;
        uint256 bustPrice;
        uint256 entryTick;
        bool active;
    }

    struct AgentStats {
        int256 totalPnL;
        uint256 wins;
        uint256 losses;
    }

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => Bet) public bets;
    mapping(address => AgentStats) public leaderboard;
    mapping(uint256 => uint256[]) public roundBetIds;
    mapping(address => uint256) public activeBet;
    mapping(uint256 => mapping(uint256 => uint256)) public tickPrices;

    uint256 public constant PRICE_DECIMALS = 2;
    uint256 public constant PRICE_SCALE = 100;
    uint256 public constant FEE_BPS = 500; // 5% = 500 bps
    uint256 public constant BPS_SCALE = 10000;

    event RoundStarted(uint256 indexed roundId, bytes32 seedHash, uint256 startTime);
    event BetPlaced(uint256 indexed betId, address indexed agent, Direction direction, uint256 multiplier, uint256 wager, uint256 entryPrice, uint256 bustPrice);
    event BetClosed(uint256 indexed betId, int256 pnl, uint256 exitPrice);
    event BetLiquidated(uint256 indexed betId, uint256 bustPrice);
    event RoundEnded(uint256 indexed roundId, bytes32 seed, uint256 finalPrice);
    event TickPriceUpdated(uint256 indexed roundId, uint256 tick, uint256 price);
    event Funded(address indexed funder, uint256 amount);
    event Withdrawn(address indexed owner, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Not operator");
        _;
    }

    constructor(address _operator) {
        owner = msg.sender;
        operator = _operator;
    }

    function startRound(bytes32 seedHash) external onlyOperator {
        if (currentRound > 0) {
            require(rounds[currentRound].state == RoundState.SETTLED, "Previous round not settled");
        }
        currentRound++;
        rounds[currentRound] = Round({
            seedHash: seedHash,
            seed: bytes32(0),
            startTime: block.timestamp,
            state: RoundState.ACTIVE,
            finalPrice: 0,
            currentTick: 0,
            currentPrice: 1000_00 // 1000.00 with 2 decimals
        });
        emit RoundStarted(currentRound, seedHash, block.timestamp);
    }

    function submitTickPrice(uint256 tick, uint256 price) external onlyOperator {
        Round storage round = rounds[currentRound];
        require(round.state == RoundState.ACTIVE, "Round not active");
        require(tick > 0 && tick <= 120, "Invalid tick");

        round.currentTick = tick;
        round.currentPrice = price;
        tickPrices[currentRound][tick] = price;
        emit TickPriceUpdated(currentRound, tick, price);
    }

    function placeBet(uint8 direction, uint256 multiplier) external payable {
        require(direction <= 1, "Invalid direction");
        require(multiplier >= 1 && multiplier <= 100, "Multiplier must be 1-100");
        require(msg.value > 0, "Wager required");

        Round storage round = rounds[currentRound];
        require(round.state == RoundState.ACTIVE, "Round not active");
        require(activeBet[msg.sender] == 0, "Already have active bet");

        uint256 entryPrice = round.currentPrice;
        require(entryPrice > 0, "No price available");

        uint256 bustPrice;
        if (Direction(direction) == Direction.UP) {
            bustPrice = entryPrice - (entryPrice / multiplier);
        } else {
            bustPrice = entryPrice + (entryPrice / multiplier);
        }

        nextBetId++;
        uint256 betId = nextBetId;

        bets[betId] = Bet({
            agent: msg.sender,
            roundId: currentRound,
            direction: Direction(direction),
            multiplier: multiplier,
            wager: msg.value,
            entryPrice: entryPrice,
            bustPrice: bustPrice,
            entryTick: round.currentTick,
            active: true
        });

        roundBetIds[currentRound].push(betId);
        activeBet[msg.sender] = betId;

        emit BetPlaced(betId, msg.sender, Direction(direction), multiplier, msg.value, entryPrice, bustPrice);
    }

    function cashOut(uint256 betId) external {
        Bet storage bet = bets[betId];
        require(bet.agent == msg.sender, "Not your bet");
        require(bet.active, "Bet not active");

        Round storage round = rounds[bet.roundId];
        require(round.state == RoundState.ACTIVE, "Round not active");

        uint256 currentPrice = round.currentPrice;
        (uint256 payout, int256 pnl) = _calculatePayout(bet, currentPrice);

        bet.active = false;
        activeBet[msg.sender] = 0;

        if (pnl > 0) {
            leaderboard[msg.sender].wins++;
        } else {
            leaderboard[msg.sender].losses++;
        }
        leaderboard[msg.sender].totalPnL += pnl;

        if (payout > 0) {
            (bool sent,) = payable(msg.sender).call{value: payout}("");
            require(sent, "Transfer failed");
        }

        emit BetClosed(betId, pnl, currentPrice);
    }

    function liquidate(uint256 betId, uint256 currentPrice) external onlyOperator {
        Bet storage bet = bets[betId];
        require(bet.active, "Bet not active");

        if (bet.direction == Direction.UP) {
            require(currentPrice <= bet.bustPrice, "Not busted (UP)");
        } else {
            require(currentPrice >= bet.bustPrice, "Not busted (DOWN)");
        }

        bet.active = false;
        activeBet[bet.agent] = 0;

        leaderboard[bet.agent].losses++;
        leaderboard[bet.agent].totalPnL -= int256(bet.wager);

        emit BetLiquidated(betId, bet.bustPrice);
    }

    function endRound(bytes32 seed) external onlyOperator {
        Round storage round = rounds[currentRound];
        require(round.state == RoundState.ACTIVE, "Round not active");
        require(keccak256(abi.encodePacked(seed)) == round.seedHash, "Invalid seed");

        round.seed = seed;
        round.state = RoundState.SETTLED;
        round.finalPrice = round.currentPrice;

        // Settle all remaining active bets at final price
        uint256[] storage betIds = roundBetIds[currentRound];
        for (uint256 i = 0; i < betIds.length; i++) {
            Bet storage bet = bets[betIds[i]];
            if (bet.active) {
                (uint256 payout, int256 pnl) = _calculatePayout(bet, round.finalPrice);
                bet.active = false;
                activeBet[bet.agent] = 0;

                if (pnl > 0) {
                    leaderboard[bet.agent].wins++;
                } else {
                    leaderboard[bet.agent].losses++;
                }
                leaderboard[bet.agent].totalPnL += pnl;

                if (payout > 0) {
                    (bool sent,) = payable(bet.agent).call{value: payout}("");
                    require(sent, "Transfer failed");
                }

                emit BetClosed(betIds[i], pnl, round.finalPrice);
            }
        }

        emit RoundEnded(currentRound, seed, round.finalPrice);
    }

    function fund() external payable {
        require(msg.value > 0, "Must send value");
        emit Funded(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        (bool sent,) = payable(owner).call{value: amount}("");
        require(sent, "Transfer failed");
        emit Withdrawn(owner, amount);
    }

    function setOperator(address _operator) external onlyOwner {
        operator = _operator;
    }

    // View functions
    function getRoundBetIds(uint256 roundId) external view returns (uint256[] memory) {
        return roundBetIds[roundId];
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    // Internal
    function _calculatePayout(Bet storage bet, uint256 currentPrice) internal view returns (uint256 payout, int256 pnl) {
        int256 priceDiff;
        if (bet.direction == Direction.UP) {
            priceDiff = int256(currentPrice) - int256(bet.entryPrice);
        } else {
            priceDiff = int256(bet.entryPrice) - int256(currentPrice);
        }

        // pnl = wager * multiplier * priceDiff / entryPrice
        pnl = (int256(bet.wager) * int256(bet.multiplier) * priceDiff) / int256(bet.entryPrice);

        if (pnl > 0) {
            // 5% fee on profit
            uint256 fee = uint256(pnl) * FEE_BPS / BPS_SCALE;
            payout = bet.wager + uint256(pnl) - fee;
        } else {
            // No fee on loss
            int256 payoutSigned = int256(bet.wager) + pnl;
            payout = payoutSigned > 0 ? uint256(payoutSigned) : 0;
        }
    }

    receive() external payable {}
}
