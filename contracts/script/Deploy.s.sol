// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/AgentCoaster.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address operator = vm.envAddress("OPERATOR_ADDRESS");

        vm.startBroadcast(deployerKey);

        AgentCoaster game = new AgentCoaster(operator);

        // Fund the house with initial bankroll
        uint256 fundAmount = vm.envOr("FUND_AMOUNT", uint256(10 ether));
        if (fundAmount > 0) {
            game.fund{value: fundAmount}();
        }

        vm.stopBroadcast();

        console.log("AgentCoaster deployed at:", address(game));
        console.log("Operator:", operator);
        console.log("House bankroll:", fundAmount);
    }
}
