// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentCoaster.sol";

contract AgentCoasterTest is Test {
    AgentCoaster public game;

    address public owner = address(this);
    uint256 public operatorKey = 0xBEEF1234BEEF1234BEEF1234BEEF1234BEEF1234BEEF1234BEEF1234BEEF1234;
    address public operator;
    address public agent1 = address(0x1);
    address public agent2 = address(0x2);

    bytes32 public seed = keccak256("test-seed");
    bytes32 public seedHash;

    receive() external payable {}

    function setUp() public {
        operator = vm.addr(operatorKey);
        game = new AgentCoaster(operator);
        game.fund{value: 100 ether}();
        vm.deal(agent1, 10 ether);
        vm.deal(agent2, 10 ether);
        seedHash = keccak256(abi.encodePacked(seed));
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _sign(uint256 roundId, uint256 tick, uint256 price) internal view returns (bytes memory) {
        bytes32 hash = keccak256(abi.encodePacked(roundId, tick, price));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorKey, ethHash);
        return abi.encodePacked(r, s, v);
    }

    function _startRound() internal {
        vm.prank(operator);
        game.startRound(seedHash);
    }

    function _placeBetUp(address agent, uint256 multiplier, uint256 price, uint256 tick) internal {
        bytes memory sig = _sign(game.currentRound(), tick, price);
        vm.prank(agent);
        game.placeBet{value: 1 ether}(0, multiplier, price, tick, sig);
    }

    function _placeBetDown(address agent, uint256 multiplier, uint256 price, uint256 tick) internal {
        bytes memory sig = _sign(game.currentRound(), tick, price);
        vm.prank(agent);
        game.placeBet{value: 1 ether}(1, multiplier, price, tick, sig);
    }

    // ── startRound ────────────────────────────────────────────────────────────

    function test_StartRound() public {
        _startRound();
        assertEq(game.currentRound(), 1);
        (bytes32 sh,,, AgentCoaster.RoundState state,) = game.rounds(1);
        assertEq(sh, seedHash);
        assertEq(uint8(state), uint8(AgentCoaster.RoundState.ACTIVE));
    }

    function test_OnlyOperatorCanStartRound() public {
        vm.prank(agent1);
        vm.expectRevert("Not operator");
        game.startRound(seedHash);
    }

    function test_CannotStartRoundWhileActive() public {
        _startRound();
        vm.prank(operator);
        vm.expectRevert("Previous round not settled");
        game.startRound(seedHash);
    }

    // ── placeBet ─────────────────────────────────────────────────────────────

    function test_PlaceBetUP() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1);

        (address agent,, AgentCoaster.Direction dir, uint256 mult, uint256 wager, uint256 entry, uint256 bust,, bool active) = game.bets(1);
        assertEq(agent, agent1);
        assertEq(uint8(dir), 0); // UP
        assertEq(mult, 10);
        assertEq(wager, 1 ether);
        assertEq(entry, 1000_00);
        assertEq(bust, 900_00); // 1000 - 1000/10
        assertTrue(active);
    }

    function test_PlaceBetDOWN() public {
        _startRound();
        _placeBetDown(agent1, 5, 1000_00, 1);

        (,,,,,uint256 entry, uint256 bust,,) = game.bets(1);
        assertEq(entry, 1000_00);
        assertEq(bust, 1200_00); // 1000 + 1000/5
    }

    function test_RevertDoubleBet() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1);

        bytes memory sig = _sign(1, 1, 1000_00);
        vm.prank(agent1);
        vm.expectRevert("Already have active bet");
        game.placeBet{value: 1 ether}(0, 5, 1000_00, 1, sig);
    }

    function test_RevertBadSignature() public {
        _startRound();
        // Sign with wrong key
        uint256 wrongKey = 0xDEAD1234DEAD1234DEAD1234DEAD1234DEAD1234DEAD1234DEAD1234DEAD1234;
        bytes32 hash = keccak256(abi.encodePacked(uint256(1), uint256(1), uint256(1000_00)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.prank(agent1);
        vm.expectRevert("Invalid price signature");
        game.placeBet{value: 1 ether}(0, 10, 1000_00, 1, badSig);
    }

    // ── cashOut ───────────────────────────────────────────────────────────────

    function test_CashOutProfit() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1);

        // Price rises 5%
        bytes memory sig = _sign(1, 2, 1050_00);
        uint256 balBefore = agent1.balance;
        vm.prank(agent1);
        game.cashOut(1, 1050_00, 2, sig);

        // pnl = 1e18 * 10 * 50_00 / 1000_00 = 0.5e18
        // fee = 0.5e18 * 500/10000 = 0.025e18
        // payout = 1 + 0.5 - 0.025 = 1.475 ether
        assertEq(agent1.balance - balBefore, 1.475 ether);
        (,,,,,,,, bool active) = game.bets(1);
        assertFalse(active);
    }

    function test_CashOutLoss() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1);

        // Price falls 5%
        bytes memory sig = _sign(1, 2, 950_00);
        uint256 balBefore = agent1.balance;
        vm.prank(agent1);
        game.cashOut(1, 950_00, 2, sig);

        // pnl = 1e18 * 10 * (-50_00) / 1000_00 = -0.5e18
        // payout = 1 - 0.5 = 0.5 ether
        assertEq(agent1.balance - balBefore, 0.5 ether);
    }

    function test_CashOutRevertWrongOwner() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1);

        bytes memory sig = _sign(1, 2, 1050_00);
        vm.prank(agent2);
        vm.expectRevert("Not your bet");
        game.cashOut(1, 1050_00, 2, sig);
    }

    // ── liquidate ─────────────────────────────────────────────────────────────

    function test_Liquidate() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1); // bust at 900_00

        bytes memory sig = _sign(1, 2, 890_00);
        vm.prank(operator);
        game.liquidate(1, 890_00, 2, sig);

        (,,,,,,,, bool active) = game.bets(1);
        assertFalse(active);

        (int256 pnl,, uint256 losses) = game.leaderboard(agent1);
        assertEq(pnl, -1 ether);
        assertEq(losses, 1);
    }

    function test_LiquidateRevertIfNotBusted() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1); // bust at 900_00

        bytes memory sig = _sign(1, 2, 950_00);
        vm.prank(operator);
        vm.expectRevert("Not busted (UP)");
        game.liquidate(1, 950_00, 2, sig);
    }

    function test_LiquidateDownBet() public {
        _startRound();
        _placeBetDown(agent1, 5, 1000_00, 1); // bust at 1200_00

        bytes memory sig = _sign(1, 2, 1210_00);
        vm.prank(operator);
        game.liquidate(1, 1210_00, 2, sig);

        (,,,,,,,, bool active) = game.bets(1);
        assertFalse(active);
    }

    // ── endRound ──────────────────────────────────────────────────────────────

    function test_EndRound() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1);

        uint256 finalPrice = 1020_00;
        bytes memory sig = _sign(1, 120, finalPrice);
        uint256 balBefore = agent1.balance;

        vm.prank(operator);
        game.endRound(seed, finalPrice, 120, sig);

        // pnl = 1e18 * 10 * 20_00 / 1000_00 = 0.2e18
        // fee = 0.2e18 * 500/10000 = 0.01e18
        // payout = 1.19 ether
        assertEq(agent1.balance - balBefore, 1.19 ether);

        (, bytes32 revealedSeed,, AgentCoaster.RoundState state, uint256 fp) = game.rounds(1);
        assertEq(revealedSeed, seed);
        assertEq(uint8(state), uint8(AgentCoaster.RoundState.SETTLED));
        assertEq(fp, finalPrice);
    }

    function test_EndRoundInvalidSeed() public {
        _startRound();
        bytes memory sig = _sign(1, 120, 1000_00);
        vm.prank(operator);
        vm.expectRevert("Invalid seed");
        game.endRound(keccak256("wrong-seed"), 1000_00, 120, sig);
    }

    function test_EndRoundInvalidPriceSig() public {
        _startRound();
        // Sign with wrong key
        uint256 wrongKey = 0xDEAD1234DEAD1234DEAD1234DEAD1234DEAD1234DEAD1234DEAD1234DEAD1234;
        bytes32 hash = keccak256(abi.encodePacked(uint256(1), uint256(120), uint256(1000_00)));
        bytes32 ethHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", hash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(wrongKey, ethHash);
        bytes memory badSig = abi.encodePacked(r, s, v);

        vm.prank(operator);
        vm.expectRevert("Invalid price signature");
        game.endRound(seed, 1000_00, 120, badSig);
    }

    function test_MultipleBetsEndRound() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1);
        _placeBetDown(agent2, 5, 1000_00, 1);

        bytes memory sig = _sign(1, 120, 1020_00);
        uint256 bal1Before = agent1.balance;
        uint256 bal2Before = agent2.balance;

        vm.prank(operator);
        game.endRound(seed, 1020_00, 120, sig);

        // agent1: UP x10, +2% → pnl = 1e18*10*2000/100000 = 0.2e18, fee=0.01e18 → payout=1.19e18
        assertEq(agent1.balance - bal1Before, 1.19 ether);
        // agent2: DOWN x5, price went UP 2% against them → pnl = 1e18*5*(-2000)/100000 = -0.1e18 → payout=0.9e18
        assertEq(agent2.balance - bal2Before, 0.9 ether);
    }

    // ── multi-round ───────────────────────────────────────────────────────────

    function test_MultipleRounds() public {
        _startRound();
        bytes memory sig1 = _sign(1, 120, 1000_00);
        vm.prank(operator);
        game.endRound(seed, 1000_00, 120, sig1);
        assertEq(game.currentRound(), 1);

        bytes32 seed2 = keccak256("test-seed-2");
        bytes32 seedHash2 = keccak256(abi.encodePacked(seed2));
        vm.prank(operator);
        game.startRound(seedHash2);
        assertEq(game.currentRound(), 2);

        bytes memory sig2 = _sign(2, 120, 1010_00);
        vm.prank(operator);
        game.endRound(seed2, 1010_00, 120, sig2);

        (, bytes32 revealedSeed2,, AgentCoaster.RoundState state2,) = game.rounds(2);
        assertEq(revealedSeed2, seed2);
        assertEq(uint8(state2), uint8(AgentCoaster.RoundState.SETTLED));
    }

    // ── fund / withdraw ───────────────────────────────────────────────────────

    function test_FundAndWithdraw() public {
        uint256 balBefore = address(game).balance;
        game.fund{value: 5 ether}();
        assertEq(address(game).balance, balBefore + 5 ether);

        uint256 ownerBal = owner.balance;
        game.withdraw(3 ether);
        assertEq(owner.balance, ownerBal + 3 ether);
    }

    function test_OnlyOwnerCanWithdraw() public {
        vm.prank(agent1);
        vm.expectRevert("Not owner");
        game.withdraw(1 ether);
    }

    // ── leaderboard ───────────────────────────────────────────────────────────

    function test_LeaderboardWin() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1);

        bytes memory sig = _sign(1, 2, 1050_00);
        vm.prank(agent1);
        game.cashOut(1, 1050_00, 2, sig);

        (int256 pnl, uint256 wins,) = game.leaderboard(agent1);
        assertEq(wins, 1);
        assertTrue(pnl > 0);
    }

    function test_LeaderboardLoss() public {
        _startRound();
        _placeBetUp(agent1, 10, 1000_00, 1); // bust at 900

        bytes memory sig = _sign(1, 2, 890_00);
        vm.prank(operator);
        game.liquidate(1, 890_00, 2, sig);

        (int256 pnl,, uint256 losses) = game.leaderboard(agent1);
        assertEq(losses, 1);
        assertEq(pnl, -1 ether);
    }
}
