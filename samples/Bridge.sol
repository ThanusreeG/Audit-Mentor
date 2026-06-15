// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract TrainingBridge {
    using ECDSA for bytes32;

    IERC20 public token;
    address public signer;
    mapping(bytes32 => bool) public claimed;

    constructor(address _token, address _signer) {
        token = IERC20(_token);
        signer = _signer;
    }

    function setSigner(address newSigner) external {
        signer = newSigner;
    }

    function claim(address receiver, uint256 amount, bytes32 claimId, bytes calldata signature) external {
        bytes32 message = keccak256(abi.encode(receiver, amount, claimId));
        require(message.toEthSignedMessageHash().recover(signature) == signer, "bad signature");
        require(!claimed[claimId], "already claimed");

        claimed[claimId] = true;
        token.transfer(receiver, amount);
    }
}
