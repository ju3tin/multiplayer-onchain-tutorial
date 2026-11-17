// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MicroCarNFT is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    struct CarStats {
        uint8 topSpeed;   // 1-10
        uint8 handling;   // 1-10
        uint8 colorId;    // 0=red, 1=blue, 2=green, 3=yellow
    }

    mapping(uint256 => CarStats) public carStats;

    event CarMinted(address indexed to, uint256 indexed tokenId, uint8 colorId);

    constructor() ERC721("Micro Machines Car", "MMC") Ownable(msg.sender) {}

    function mint(address to, uint8 colorId) external returns (uint256) {
        require(colorId < 4, "Invalid color");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        carStats[tokenId] = CarStats({
            topSpeed: uint8(5 + (tokenId % 6)),
            handling: uint8(5 + ((tokenId * 3) % 6)),
            colorId: colorId
        });

        emit CarMinted(to, tokenId, colorId);
        return tokenId;
    }

    function mintWithStats(
        address to,
        uint8 colorId,
        uint8 topSpeed,
        uint8 handling
    ) external onlyOwner returns (uint256) {
        require(colorId < 4, "Invalid color");
        require(topSpeed >= 1 && topSpeed <= 10, "Invalid speed");
        require(handling >= 1 && handling <= 10, "Invalid handling");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        carStats[tokenId] = CarStats({
            topSpeed: topSpeed,
            handling: handling,
            colorId: colorId
        });

        emit CarMinted(to, tokenId, colorId);
        return tokenId;
    }

    function getStats(uint256 tokenId) external view returns (CarStats memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return carStats[tokenId];
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    function tokenURI(uint256 tokenId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (string memory)
    {
        return super.tokenURI(tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
