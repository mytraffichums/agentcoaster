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

    uint256 public constant FEE_BPS = 500;
    uint256 public constant BPS_SCALE = 10000;

    event RoundStarted(uint256 indexed roundId, bytes32 seedHash, uint256 startTime);
    event BetPlaced(uint256 indexed betId, address indexed agent, Direction direction, uint256 multiplier, uint256 wager, uint256 entryPrice, uint256 bustPrice);
    event BetClosed(uint256 indexed betId, int256 pnl, uint256 exitPrice);
    event BetLiquidated(uint256 indexed betId, uint256 bustPrice);
    event RoundEnded(uint256 indexed roundId, bytes32 seed, uint256 finalPrice);
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
            finalPrice: 0
        });
        emit RoundStarted(currentRound, seedHash, block.timestamp);
    }

    // Verify operator signed (roundId, tick, price) and place bet at that price
    function placeBet(uint8 direction, uint256 multiplier, uint256 price, uint256 tick, bytes calldata sig) external payable {
        require(direction <= 1, "Invalid direction");
        require(multiplier >= 1 && multiplier <= 100, "Multiplier must be 1-100");
        require(msg.value > 0, "Wager required");
        require(price > 0, "No price");

        Round storage round = rounds[currentRound];
        require(round.state == RoundState.ACTIVE, "Round not active");
        require(activeBet[msg.sender] == 0, "Already have active bet");

        // Verify operator signature over (roundId, tick, price)
        bytes32 hash = keccak256(abi.encodePacked(currentRound, tick, price));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        require(_recoverSigner(ethHash, sig) == operator, "Invalid price signature");

        uint256 bustPrice;
        if (Direction(direction) == Direction.UP) {
            bustPrice = price - (price / multiplier);
        } else {
            bustPrice = price + (price / multiplier);
        }

        nextBetId++;
        uint256 betId = nextBetId;

        bets[betId] = Bet({
            agent: msg.sender,
            roundId: currentRound,
            direction: Direction(direction),
            multiplier: multiplier,
            wager: msg.value,
            entryPrice: price,
            bustPrice: bustPrice,
            entryTick: tick,
            active: true
        });

        roundBetIds[currentRound].push(betId);
        activeBet[msg.sender] = betId;

        emit BetPlaced(betId, msg.sender, Direction(direction), multiplier, msg.value, price, bustPrice);
    }

    function cashOut(uint256 betId, uint256 price, uint256 tick, bytes calldata sig) external {
        Bet storage bet = bets[betId];
        require(bet.agent == msg.sender, "Not your bet");
        require(bet.active, "Bet not active");
        require(rounds[bet.roundId].state == RoundState.ACTIVE, "Round not active");

        // Verify operator signed this price
        bytes32 hash = keccak256(abi.encodePacked(currentRound, tick, price));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        require(_recoverSigner(ethHash, sig) == operator, "Invalid price signature");

        (uint256 payout, int256 pnl) = _calculatePayout(bet, price);

        bet.active = false;
        activeBet[msg.sender] = 0;

        if (pnl > 0) { leaderboard[msg.sender].wins++; }
        else { leaderboard[msg.sender].losses++; }
        leaderboard[msg.sender].totalPnL += pnl;

        if (payout > 0) {
            (bool sent,) = payable(msg.sender).call{value: payout}("");
            require(sent, "Transfer failed");
        }

        emit BetClosed(betId, pnl, price);
    }

    function liquidate(uint256 betId, uint256 price, uint256 tick, bytes calldata sig) external onlyOperator {
        Bet storage bet = bets[betId];
        require(bet.active, "Bet not active");

        // Verify signature so the price used for liquidation is authentic
        bytes32 hash = keccak256(abi.encodePacked(currentRound, tick, price));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        require(_recoverSigner(ethHash, sig) == operator, "Invalid price signature");

        if (bet.direction == Direction.UP) {
            require(price <= bet.bustPrice, "Not busted (UP)");
        } else {
            require(price >= bet.bustPrice, "Not busted (DOWN)");
        }

        bet.active = false;
        activeBet[bet.agent] = 0;

        leaderboard[bet.agent].losses++;
        leaderboard[bet.agent].totalPnL -= int256(bet.wager);

        emit BetLiquidated(betId, bet.bustPrice);
    }

    function endRound(bytes32 seed, uint256 finalPrice, uint256 finalTick, bytes calldata sig) external onlyOperator {
        Round storage round = rounds[currentRound];
        require(round.state == RoundState.ACTIVE, "Round not active");
        require(keccak256(abi.encodePacked(seed)) == round.seedHash, "Invalid seed");

        // Verify final price signature
        bytes32 hash = keccak256(abi.encodePacked(currentRound, finalTick, finalPrice));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        require(_recoverSigner(ethHash, sig) == operator, "Invalid price signature");

        round.seed = seed;
        round.state = RoundState.SETTLED;
        round.finalPrice = finalPrice;

        uint256[] storage betIds = roundBetIds[currentRound];
        for (uint256 i = 0; i < betIds.length; i++) {
            Bet storage bet = bets[betIds[i]];
            if (bet.active) {
                (uint256 payout, int256 pnl) = _calculatePayout(bet, finalPrice);
                bet.active = false;
                activeBet[bet.agent] = 0;

                if (pnl > 0) { leaderboard[bet.agent].wins++; }
                else { leaderboard[bet.agent].losses++; }
                leaderboard[bet.agent].totalPnL += pnl;

                if (payout > 0) {
                    (bool sent,) = payable(bet.agent).call{value: payout}("");
                    require(sent, "Transfer failed");
                }
                emit BetClosed(betIds[i], pnl, finalPrice);
            }
        }

        emit RoundEnded(currentRound, seed, finalPrice);
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

    function getRoundBetIds(uint256 roundId) external view returns (uint256[] memory) {
        return roundBetIds[roundId];
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    function _recoverSigner(bytes32 ethHash, bytes calldata sig) internal pure returns (address) {
        require(sig.length == 65, "Invalid sig length");
        bytes32 r; bytes32 s; uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(ethHash, v, r, s);
    }

    function _calculatePayout(Bet storage bet, uint256 price) internal view returns (uint256 payout, int256 pnl) {
        int256 priceDiff = bet.direction == Direction.UP
            ? int256(price) - int256(bet.entryPrice)
            : int256(bet.entryPrice) - int256(price);

        pnl = (int256(bet.wager) * int256(bet.multiplier) * priceDiff) / int256(bet.entryPrice);

        if (pnl > 0) {
            uint256 fee = uint256(pnl) * FEE_BPS / BPS_SCALE;
            payout = bet.wager + uint256(pnl) - fee;
        } else {
            int256 payoutSigned = int256(bet.wager) + pnl;
            payout = payoutSigned > 0 ? uint256(payoutSigned) : 0;
        }
    }

    receive() external payable {}
}
