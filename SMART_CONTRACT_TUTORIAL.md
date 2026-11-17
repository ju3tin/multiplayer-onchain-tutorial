# Smart Contract Tutorial  
## Micro Machines on Avalanche (Fuji → Mainnet)

This tutorial focuses **only on the smart contracts**.  
By the end you will have:

- A `MicroCarNFT` (ERC-721) that players own
- A `RaceRegistry` that records race results and can handle entry fees / prizes
- Both contracts deployed and verified on **Avalanche Fuji**
- Clear instructions to interact with them from the Next.js game later

---

## 1. Project Setup (Hardhat)

```bash
# From the micro-machines folder
mkdir contracts && cd contracts
npm init -y

# Install Hardhat + tools
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox typescript ts-node
npx hardhat init
# Choose: Create a TypeScript project

# OpenZeppelin (for ERC-721)
npm install @openzeppelin/contracts

# dotenv for private key
npm install dotenv
```

Your folder should look like:

```
contracts/
├── contracts/
│   ├── MicroCarNFT.sol
│   └── RaceRegistry.sol
├── scripts/
│   └── deploy.ts
├── hardhat.config.ts
├── package.json
└── .env
```

---

## 2. MicroCarNFT.sol

This is the car that players own.  
Each NFT = one car in the game.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MicroCarNFT
 * @notice ERC-721 cars for the Micro Machines game on Avalanche
 */
contract MicroCarNFT is ERC721, ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    // Optional: simple on-chain stats (can be expanded later)
    struct CarStats {
        uint8 topSpeed;   // 1-10
        uint8 handling;   // 1-10
        uint8 colorId;    // 0=red, 1=blue, 2=green, 3=yellow
    }

    mapping(uint256 => CarStats) public carStats;

    event CarMinted(address indexed to, uint256 indexed tokenId, uint8 colorId);

    constructor() ERC721("Micro Machines Car", "MMC") Ownable(msg.sender) {}

    /**
     * @notice Public mint – anyone can mint a car (you can add a fee later)
     */
    function mint(address to, uint8 colorId) external returns (uint256) {
        require(colorId < 4, "Invalid color");

        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);

        // Random-ish stats (for tutorial – replace with better randomness later)
        carStats[tokenId] = CarStats({
            topSpeed: uint8(5 + (tokenId % 6)),      // 5-10
            handling: uint8(5 + ((tokenId * 3) % 6)), // 5-10
            colorId: colorId
        });

        emit CarMinted(to, tokenId, colorId);
        return tokenId;
    }

    /**
     * @notice Owner can mint with custom stats (for special cars / rewards)
     */
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

    // Required overrides
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
```

---

## 3. RaceRegistry.sol

Records who raced and who won.  
Supports optional entry fees that go to the winner.

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RaceRegistry
 * @notice Records Micro Machines race results on Avalanche
 * @dev For production you should add signature verification or a trusted relay
 */
contract RaceRegistry {
    struct Race {
        address winner;
        address[] players;
        uint256 timestamp;
        uint256 prizePool;
        bool exists;
    }

    Race[] public races;

    // player => number of wins
    mapping(address => uint256) public wins;

    // player => total races participated
    mapping(address => uint256) public racesPlayed;

    event RaceCreated(
        uint256 indexed raceId,
        address indexed winner,
        address[] players,
        uint256 prizePool
    );

    /**
     * @notice Submit a finished race
     * @param players  Array of all players who participated
     * @param winner   Address of the winner (must be in players)
     *
     * msg.value is the prize pool (can be 0)
     */
    function submitRace(
        address[] calldata players,
        address winner
    ) external payable returns (uint256 raceId) {
        require(players.length >= 2, "Need at least 2 players");
        require(winner != address(0), "Invalid winner");

        bool winnerInRace = false;
        for (uint256 i = 0; i < players.length; i++) {
            require(players[i] != address(0), "Invalid player");
            if (players[i] == winner) {
                winnerInRace = true;
            }
            racesPlayed[players[i]] += 1;
        }
        require(winnerInRace, "Winner must be one of the players");

        raceId = races.length;

        races.push(Race({
            winner: winner,
            players: players,
            timestamp: block.timestamp,
            prizePool: msg.value,
            exists: true
        }));

        wins[winner] += 1;

        // Send the prize pool to the winner
        if (msg.value > 0) {
            (bool success, ) = winner.call{value: msg.value}("");
            require(success, "Prize transfer failed");
        }

        emit RaceCreated(raceId, winner, players, msg.value);
    }

    // ========== View helpers ==========

    function getRace(uint256 raceId) external view returns (Race memory) {
        require(races[raceId].exists, "Race does not exist");
        return races[raceId];
    }

    function getWins(address player) external view returns (uint256) {
        return wins[player];
    }

    function getRacesPlayed(address player) external view returns (uint256) {
        return racesPlayed[player];
    }

    function totalRaces() external view returns (uint256) {
        return races.length;
    }

    /**
     * @notice Simple leaderboard helper (returns top N by wins)
     * @dev Not gas-efficient for very large N – use a subgraph in production
     */
    function getTopPlayers(uint256 count)
        external
        view
        returns (address[] memory, uint256[] memory)
    {
        // This is a simplified version for the tutorial.
        // In production use The Graph or maintain an on-chain sorted list.
        revert("Use events + off-chain indexing for leaderboards");
    }
}
```

---

## 4. Hardhat Configuration

**hardhat.config.ts**

```ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Avalanche Fuji Testnet
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
    // Avalanche Mainnet (use later)
    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      chainId: 43114,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      avalancheFujiTestnet: process.env.SNOWTRACE_API_KEY || "",
      avalanche: process.env.SNOWTRACE_API_KEY || "",
    },
  },
};

export default config;
```

**.env** (never commit this file)

```env
PRIVATE_KEY=0xYourPrivateKeyHere
SNOWTRACE_API_KEY=   # optional, for verification
```

> How to get your private key from Core Wallet:  
> Core → Settings → Security & Privacy → Show Private Key

---

## 5. Deploy Script

**scripts/deploy.ts**

```ts
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);
  console.log(
    "Account balance:",
    ethers.formatEther(await ethers.provider.getBalance(deployer.address)),
    "AVAX"
  );

  // 1. Deploy MicroCarNFT
  const CarNFT = await ethers.getContractFactory("MicroCarNFT");
  const carNFT = await CarNFT.deploy();
  await carNFT.waitForDeployment();
  const carNFTAddress = await carNFT.getAddress();
  console.log("MicroCarNFT deployed to:", carNFTAddress);

  // 2. Deploy RaceRegistry
  const Registry = await ethers.getContractFactory("RaceRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("RaceRegistry deployed to:", registryAddress);

  console.log("\n=== Copy these into your Next.js app ===");
  console.log(`CAR_NFT_ADDRESS=${carNFTAddress}`);
  console.log(`RACE_REGISTRY_ADDRESS=${registryAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

---

## 6. Compile & Deploy to Fuji

```bash
# Compile
npx hardhat compile

# Deploy to Fuji
npx hardhat run scripts/deploy.ts --network fuji
```

You should see output similar to:

```
Deploying contracts with account: 0xYourAddress
Account balance: 2.5 AVAX
MicroCarNFT deployed to: 0x1234...
RaceRegistry deployed to: 0x5678...
```

**Save both addresses.**

---

## 7. Verify on Snowtrace (optional but recommended)

```bash
npx hardhat verify --network fuji 0xYourCarNFTAddress
npx hardhat verify --network fuji 0xYourRaceRegistryAddress
```

Then open:

- https://testnet.snowtrace.io/address/0xYourCarNFTAddress
- https://testnet.snowtrace.io/address/0xYourRaceRegistryAddress

---

## 8. Test the Contracts (Hardhat console or script)

Create `scripts/test-mint.ts`:

```ts
import { ethers } from "hardhat";

async function main() {
  const CAR_NFT = "0xYourCarNFTAddress";
  const [signer] = await ethers.getSigners();

  const carNFT = await ethers.getContractAt("MicroCarNFT", CAR_NFT);

  console.log("Minting car for", signer.address);
  const tx = await carNFT.mint(signer.address, 0); // color 0 = red
  await tx.wait();

  const balance = await carNFT.balanceOf(signer.address);
  console.log("Cars owned:", balance.toString());

  const stats = await carNFT.getStats(0);
  console.log("Car #0 stats:", {
    topSpeed: stats.topSpeed,
    handling: stats.handling,
    colorId: stats.colorId,
  });
}

main();
```

Run it:

```bash
npx hardhat run scripts/test-mint.ts --network fuji
```

---

## 9. How the Game Will Use These Contracts

| Action in Game              | Contract Call                          |
|----------------------------|----------------------------------------|
| Connect wallet + mint car  | `MicroCarNFT.mint(player, colorId)`    |
| Start of race (optional)   | Players send AVAX to a pot (or call a future `joinRace`) |
| Race finishes              | `RaceRegistry.submitRace(players[], winner)` |
| Show player wins           | `RaceRegistry.wins(address)`           |
| Show car performance       | `MicroCarNFT.getStats(tokenId)`        |

Later you can make the game read `topSpeed` and `handling` from the NFT and apply them to the Canvas car physics.

---

## 10. Security Notes (Important)

1. **Anyone can call `submitRace`**  
   In this tutorial version a malicious user could submit fake results.  
   For production you should either:
   - Use a trusted backend / relay that is the only one allowed to call `submitRace`
   - Add EIP-712 signatures from all players
   - Use a commit-reveal scheme

2. **No reentrancy guard needed** here because we follow the checks-effects-interactions pattern and only do one external call at the end.

3. **Mint is currently free**  
   You can easily add `msg.value` requirements or a whitelist later.

---

## 11. Next Steps

Once both contracts are deployed:

1. Copy the addresses into your Next.js app (`src/lib/contracts.ts`)
2. Add the ABIs (from `artifacts/contracts/...json`)
3. Use `wagmi` hooks (`useWriteContract`, `useReadContract`) to mint cars and submit races
4. (Optional) Create a simple subgraph or just listen to `RaceCreated` events for a live leaderboard

---

## Quick Reference – Avalanche Fuji

| Item            | Value                                      |
|-----------------|--------------------------------------------|
| RPC             | https://api.avax-test.network/ext/bc/C/rpc |
| Chain ID        | 43113                                      |
| Explorer        | https://testnet.snowtrace.io               |
| Faucet          | https://core.app/tools/testnet-faucet/     |
| Native token    | AVAX                                       |

---

You now have production-ready starter contracts focused specifically on the Micro Machines game.

When you're ready, we can write the frontend integration part (wagmi hooks + mint button + submit race on winner).
