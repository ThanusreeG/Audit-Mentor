// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TrainingVault {
    IERC20 public asset;
    mapping(address => uint256) public balanceOf;

    constructor(address _asset) {
        asset = IERC20(_asset);
    }

    function deposit(uint256 amount) external {
        asset.transferFrom(msg.sender, address(this), amount);
        balanceOf[msg.sender] += amount;
    }

    function withdraw(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "low balance");

        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "eth transfer failed");

        balanceOf[msg.sender] -= amount;
    }

    receive() external payable {}
}
