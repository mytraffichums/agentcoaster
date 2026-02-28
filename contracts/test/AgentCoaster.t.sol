// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/AgentCoaster.sol";

contract AgentCoasterTest is Test {
    AgentCoaster public game;
    address public owner = address(this);
    address public operator = address(0xBEEF);
    address public agent1 = address(0x1);
    address public agent2 = address(0x2);

    bytes32 public seed = keccak256("test-seed");
    bytes32 public seedHash;

    receive() external payable {}

    function setUp() public {
        game = new AgentCoaster(operator);
        game.fund{value: 100 ether}();
        vm.deal(agent1, 10 ether);
        vm.deal(agent2, 10 ether);
        seedHash = keccak256(abi.encodePacked(seed));
    }

    function test_StartRound() public {
        vm.prank(operator);
        game.startRound(seedHash);

        assertEq(game.currentRound(), 1);
        (bytes32 sh,,, AgentCoaster.RoundState state,,,) = game.rounds(1);
        assertEq(sh, seedHash);
        assertEq(uint8(state), uint8(AgentCoaster.RoundState.ACTIVE));
    }

    function test_SubmitTickPrice() public {
        vm.prank(operator);
        game.startRound(seedHash);

        vm.prank(operator);
        game.submitTickPrice(1, 1001_00);

        assertEq(game.tickPrices(1, 1), 1001_00);
    }

    function test_PlaceBetUP() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(1, 1000_00);

        vm.prank(agent1);
        game.placeBet{value: 1 ether}(0, 10); // UP x10

        (address agent, uint256 roundId, AgentCoaster.Direction dir, uint256 mult, uint256 wager, uint256 entry, uint256 bust, uint256 entryTick, bool active) = game.bets(1);
        assertEq(agent, agent1);
        assertEq(roundId, 1);
        assertEq(uint8(dir), 0);
        assertEq(mult, 10);
        assertEq(wager, 1 ether);
        assertEq(entry, 1000_00);
        assertEq(bust, 900_00);
        assertTrue(active);
    }

    function test_PlaceBetDOWN() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(1, 1000_00);

        vm.prank(agent1);
        game.placeBet{value: 1 ether}(1, 5); // DOWN x5

        (,,,,, uint256 entry, uint256 bust,,) = game.bets(1);
        assertEq(entry, 1000_00);
        assertEq(bust, 1200_00);
    }

    function test_RevertDoublebet() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(1, 1000_00);

        vm.prank(agent1);
        game.placeBet{value: 1 ether}(0, 10);

        vm.prank(agent1);
        vm.expectRevert("Already have active bet");
        game.placeBet{value: 1 ether}(0, 5);
    }

    function test_CashOutProfit() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(1, 1000_00);

        vm.prank(agent1);
        game.placeBet{value: 1 ether}(0, 10); // UP x10

        // Price goes up 5% to 1050.00
        vm.prank(operator);
        game.submitTickPrice(2, 1050_00);

        uint256 balBefore = agent1.balance;
        vm.prank(agent1);
        game.cashOut(1);

        // pnl = 1 ether * 10 * 50_00 / 1000_00 = 0.5 ether
        // fee = 0.5 * 500/10000 = 0.025 ether
        // payout = 1 + 0.5 - 0.025 = 1.475 ether
        uint256 balAfter = agent1.balance;
        assertEq(balAfter - balBefore, 1.475 ether);

        (,,,,,,,, bool active) = game.bets(1);
        assertFalse(active);
    }

    function test_CashOutLoss() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(1, 1000_00);

        vm.prank(agent1);
        game.placeBet{value: 1 ether}(0, 10); // UP x10

        // Price goes down 5%
        vm.prank(operator);
        game.submitTickPrice(2, 950_00);

        uint256 balBefore = agent1.balance;
        vm.prank(agent1);
        game.cashOut(1);

        // pnl = 1e18 * 10 * (-50_00) / 1000_00 = -0.5e18
        // payout = 1 - 0.5 = 0.5 ether
        uint256 balAfter = agent1.balance;
        assertEq(balAfter - balBefore, 0.5 ether);
    }

    function test_Liquidate() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(1, 1000_00);

        vm.prank(agent1);
        game.placeBet{value: 1 ether}(0, 10); // UP x10, bust at 900

        vm.prank(operator);
        game.submitTickPrice(2, 890_00);

        vm.prank(operator);
        game.liquidate(1, 890_00);

        (,,,,,,,, bool active) = game.bets(1);
        assertFalse(active);

        (int256 pnl,, uint256 losses) = game.leaderboard(agent1);
        assertEq(pnl, -1 ether);
        assertEq(losses, 1);
    }

    function test_LiquidateRevertIfNotBusted() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(1, 1000_00);

        vm.prank(agent1);
        game.placeBet{value: 1 ether}(0, 10);

        vm.prank(operator);
        game.submitTickPrice(2, 950_00);

        vm.prank(operator);
        vm.expectRevert("Not busted (UP)");
        game.liquidate(1, 950_00);
    }

    function test_EndRound() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(1, 1000_00);

        vm.prank(agent1);
        game.placeBet{value: 1 ether}(0, 10);

        vm.prank(operator);
        game.submitTickPrice(120, 1020_00);

        uint256 balBefore = agent1.balance;
        vm.prank(operator);
        game.endRound(seed);

        // pnl = 1e18 * 10 * 20_00 / 1000_00 = 0.2e18
        // fee = 0.2 * 500/10000 = 0.01e18
        // payout = 1 + 0.2 - 0.01 = 1.19e18
        uint256 balAfter = agent1.balance;
        assertEq(balAfter - balBefore, 1.19 ether);

        (, bytes32 revealedSeed,, AgentCoaster.RoundState state, uint256 finalPrice,,) = game.rounds(1);
        assertEq(revealedSeed, seed);
        assertEq(uint8(state), uint8(AgentCoaster.RoundState.SETTLED));
        assertEq(finalPrice, 1020_00);
    }

    function test_EndRoundInvalidSeed() public {
        vm.prank(operator);
        game.startRound(seedHash);

        vm.prank(operator);
        vm.expectRevert("Invalid seed");
        game.endRound(keccak256("wrong-seed"));
    }

    function test_MultipleBetsEndRound() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(1, 1000_00);

        vm.prank(agent1);
        game.placeBet{value: 1 ether}(0, 10);

        vm.prank(agent2);
        game.placeBet{value: 2 ether}(1, 5);

        vm.prank(operator);
        game.submitTickPrice(120, 1020_00);

        uint256 bal1Before = agent1.balance;
        uint256 bal2Before = agent2.balance;

        vm.prank(operator);
        game.endRound(seed);

        uint256 bal1After = agent1.balance;
        uint256 bal2After = agent2.balance;

        // agent1: UP x10, pnl = 1e18*10*20_00/1000_00 = 0.2e18
        assertEq(bal1After - bal1Before, 1.19 ether);

        // agent2: DOWN x5, pnl = 2e18*5*(-20_00)/1000_00 = -0.2e18
        assertEq(bal2After - bal2Before, 1.8 ether);
    }

    function test_FundAndWithdraw() public {
        uint256 balBefore = address(game).balance;
        game.fund{value: 5 ether}();
        assertEq(address(game).balance, balBefore + 5 ether);

        uint256 ownerBal = owner.balance;
        game.withdraw(3 ether);
        assertEq(owner.balance, ownerBal + 3 ether);
    }

    function test_MultipleRounds() public {
        vm.prank(operator);
        game.startRound(seedHash);
        vm.prank(operator);
        game.submitTickPrice(120, 1000_00);
        vm.prank(operator);
        game.endRound(seed);

        bytes32 seed2 = keccak256("test-seed-2");
        bytes32 seedHash2 = keccak256(abi.encodePacked(seed2));
        vm.prank(operator);
        game.startRound(seedHash2);
        assertEq(game.currentRound(), 2);

        vm.prank(operator);
        game.submitTickPrice(120, 1000_00);
        vm.prank(operator);
        game.endRound(seed2);

        (, bytes32 revealedSeed2,, AgentCoaster.RoundState state2,,,) = game.rounds(2);
        assertEq(revealedSeed2, seed2);
        assertEq(uint8(state2), uint8(AgentCoaster.RoundState.SETTLED));
    }

    function test_OnlyOperatorCanStartRound() public {
        vm.prank(agent1);
        vm.expectRevert("Not operator");
        game.startRound(seedHash);
    }

    function test_OnlyOwnerCanWithdraw() public {
        vm.prank(agent1);
        vm.expectRevert("Not owner");
        game.withdraw(1 ether);
    }
}
