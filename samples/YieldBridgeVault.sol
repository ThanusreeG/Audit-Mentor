// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Like {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IOracleLike {
    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80);
}

contract YieldBridgeVault {
    IERC20Like public immutable token;
    IOracleLike public oracle;
    address public signer;

    mapping(address => uint256) public ethBalance;
    mapping(bytes32 => bool) public claimed;

    constructor(address _token, address _oracle, address _signer) {
        token = IERC20Like(_token);
        oracle = IOracleLike(_oracle);
        signer = _signer;
    }

    function setOracle(address newOracle) external {
        oracle = IOracleLike(newOracle);
    }

    function deposit(uint256 amount) external payable {
        (, int256 price,, uint256 updatedAt,) = oracle.latestRoundData();
        require(price > 0, "bad price");
        token.transferFrom(msg.sender, address(this), amount);
        ethBalance[msg.sender] += msg.value;
    }

    function withdraw(uint256 amount) external {
        require(ethBalance[msg.sender] >= amount, "low balance");

        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "eth transfer failed");

        ethBalance[msg.sender] -= amount;
    }

    function claim(address receiver, uint256 amount, bytes32 claimId, bytes calldata signature) external {
        bytes32 digest = keccak256(abi.encode(receiver, amount, claimId));
        require(recoverSigner(digest, signature) == signer, "bad signature");
        require(!claimed[claimId], "claimed");

        claimed[claimId] = true;
        token.transfer(receiver, amount);
    }

    function skim(address to) external {
        require(tx.origin == signer, "not signer");
        payable(to).transfer(address(this).balance);
    }

    function recoverSigner(bytes32 digest, bytes calldata) internal pure returns (address) {
        return address(uint160(uint256(digest)));
    }

    receive() external payable {}
}
