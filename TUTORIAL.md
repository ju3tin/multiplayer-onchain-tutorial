# Tutorial: Build a Multiplayer Micro Machines Game on Avalanche

A practical, step-by-step guide to turn the local Micro Machines game into a **Web3 multiplayer racing game** on the **Avalanche C-Chain** (Fuji testnet → Mainnet).

---

## What You Will Build

| Feature | Implementation |
|---------|----------------|
| Real-time racing | Client-side Canvas + optional WebSocket server |
| Wallet login | Core Wallet / MetaMask via Wagmi + Viem |
| Ownable cars | ERC-721 NFT on Avalanche |
| Race results | On-chain leaderboard / race registry |
| Entry fees & prizes | Optional AVAX escrow in a Race contract |
| Elimination mechanic | Already in the game (lag behind leader → OUT) |

**Architecture (best practice for real-time games):**

```
┌─────────────────────┐       ┌──────────────────────┐
│  Next.js Frontend   │◄─────►│  WebSocket Server    │  (real-time positions)
│  (Canvas + Wagmi)   │       │  (PartyKit / Socket) │
└─────────┬───────────┘       └──────────────────────┘
          │
          │ wallet + transactions
          ▼
┌─────────────────────┐
│  Avalanche C-Chain  │
│  • CarNFT (ERC-721) │
│  • RaceRegistry     │
└─────────────────────┘
```

Real-time physics and positions stay **off-chain** (fast & cheap).  
Ownership, race results, and money live **on-chain**.

---

## Prerequisites

- Node.js 18+
- Basic React / Next.js knowledge
- Core Wallet or MetaMask
- Some free test AVAX on **Fuji**

### 1. Get Core Wallet (recommended for Avalanche)

1. Install [Core Wallet](https://core.app/) browser extension
2. Create / import a wallet
3. Settings → Advanced → enable **Testnet Mode**
4. Switch network to **Avalanche Fuji C-Chain**

### 2. Get free test AVAX

- Go to the official faucet: https://core.app/tools/testnet-faucet/
- Or https://faucet.avax.network/
- Paste your C-Chain address and request AVAX

### 3. Network details (Fuji)

```
Network Name : Avalanche Fuji C-Chain
RPC URL      : https://api.avax-test.network/ext/bc/C/rpc
Chain ID     : 43113
Currency     : AVAX
Explorer     : https://testnet.snowtrace.io
```

---

## Part 1 – Run the Base Game

```bash
# Clone / unzip the project
cd micro-machines
npm install
npm run dev
```

Open http://localhost:3000  
You should see the local multiplayer Micro Machines game (keyboard controls, camera follows leader, elimination when lagging).

---

## Part 2 – Add Wallet Connection

### Install dependencies

```bash
npm install wagmi viem @tanstack/react-query @rainbow-me/rainbowkit
```

### Create Wagmi config

Create `src/lib/wagmi.ts`:

```ts
import { http, createConfig } from 'wagmi'
import { avalancheFuji, avalanche } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

export const config = createConfig({
  chains: [avalancheFuji, avalanche],
  connectors: [injected()],
  transports: {
    [avalancheFuji.id]: http(),
    [avalanche.id]: http(),
  },
})
```

### Wrap the app

Update `src/app/layout.tsx`:

```tsx
'use client' // or use a providers.tsx pattern

import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { config } from '@/lib/wagmi'
import { RainbowKitProvider } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'

const queryClient = new QueryClient()

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WagmiProvider config={config}>
          <QueryClientProvider client={queryClient}>
            <RainbowKitProvider>
              {children}
            </RainbowKitProvider>
          </QueryClientProvider>
        </WagmiProvider>
      </body>
    </html>
  )
}
```

### Add Connect button

In the menu screen of `page.tsx` (or a new `WalletButton.tsx`):

```tsx
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'

// Inside your component:
const { isConnected, address } = useAccount()

// In the JSX:
<ConnectButton />
{isConnected && (
  <p className="text-sm text-amber-200">
    Playing as {address?.slice(0, 6)}…{address?.slice(-4)}
  </p>
)}
```

Now players must connect a wallet before racing.

---

## Part 3 – Smart Contracts

We will create two simple contracts:

1. **MicroCarNFT** – ERC-721 that represents a car
2. **RaceRegistry** – records race results and can hold entry fees

### Project structure for contracts

```bash
mkdir contracts
cd contracts
npm init -y
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init   # choose TypeScript
npm install @openzeppelin/contracts
```

### `contracts/MicroCarNFT.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MicroCarNFT is ERC721, Ownable {
    uint256 private _nextTokenId;
    string private _baseTokenURI;

    constructor(string memory baseURI) ERC721("Micro Machines Car", "MMC") Ownable(msg.sender) {
        _baseTokenURI = baseURI;
    }

    function mint(address to) external returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        return tokenId;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function setBaseURI(string memory baseURI) external onlyOwner {
        _baseTokenURI = baseURI;
    }
}
```

### `contracts/RaceRegistry.sol`

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract RaceRegistry {
    struct RaceResult {
        address winner;
        address[] players;
        uint256 timestamp;
        uint256 entryFee;
    }

    RaceResult[] public races;
    mapping(address => uint256) public wins;

    event RaceFinished(uint256 indexed raceId, address indexed winner, uint256 prize);

    function createAndFinishRace(
        address[] calldata players,
        address winner
    ) external payable {
        require(players.length >= 2, "Need at least 2 players");
        require(msg.value >= 0, "Invalid fee"); // optional entry fee logic

        // Simple version: caller (or a trusted backend) submits the result
        races.push(RaceResult({
            winner: winner,
            players: players,
            timestamp: block.timestamp,
            entryFee: msg.value
        }));

        wins[winner] += 1;

        // Pay the winner the pot (minus optional rake)
        if (msg.value > 0) {
            (bool sent, ) = winner.call{value: msg.value}("");
            require(sent, "Failed to send prize");
        }

        emit RaceFinished(races.length - 1, winner, msg.value);
    }

    function getWins(address player) external view returns (uint256) {
        return wins[player];
    }

    function raceCount() external view returns (uint256) {
        return races.length;
    }
}
```

> **Note**: In production you would add signatures / commit-reveal or a trusted relay so players cannot submit fake results. For a tutorial this is fine.

---

## Part 4 – Deploy to Avalanche Fuji

### `hardhat.config.ts`

```ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      chainId: 43113,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

export default config;
```

Create `.env` (never commit it):

```
PRIVATE_KEY=your_wallet_private_key_here
```

### Deploy script (`scripts/deploy.ts`)

```ts
import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const CarNFT = await ethers.getContractFactory("MicroCarNFT");
  const carNFT = await CarNFT.deploy("https://your-metadata-server.com/cars/");
  await carNFT.waitForDeployment();
  console.log("MicroCarNFT:", await carNFT.getAddress());

  const Registry = await ethers.getContractFactory("RaceRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();
  console.log("RaceRegistry:", await registry.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

Deploy:

```bash
npx hardhat run scripts/deploy.ts --network fuji
```

Copy the two contract addresses.

---

## Part 5 – Connect Contracts to the Frontend

### ABI + addresses

Create `src/lib/contracts.ts`:

```ts
export const CAR_NFT_ADDRESS = "0xYourCarNFTAddress" as const
export const RACE_REGISTRY_ADDRESS = "0xYourRegistryAddress" as const

export const carNftAbi = [ /* paste ABI from artifacts */ ] as const
export const raceRegistryAbi = [ /* paste ABI */ ] as const
```

### Mint a car

```tsx
import { useWriteContract, useWaitForTransactionReceipt } from 'wagmi'

function MintCarButton() {
  const { writeContract, data: hash } = useWriteContract()
  const { isLoading, isSuccess } = useWaitForTransactionReceipt({ hash })

  const mint = () => {
    writeContract({
      address: CAR_NFT_ADDRESS,
      abi: carNftAbi,
      functionName: 'mint',
      args: [/* your address */],
    })
  }

  return (
    <button onClick={mint} disabled={isLoading}>
      {isLoading ? 'Minting…' : 'Mint My Car'}
    </button>
  )
}
```

### Record a race result after the winner is decided

In the game, when `setGameState("finished")` and you have a winner:

```ts
// After detecting winner
writeContract({
  address: RACE_REGISTRY_ADDRESS,
  abi: raceRegistryAbi,
  functionName: 'createAndFinishRace',
  args: [playerAddresses, winnerAddress],
  value: parseEther('0.01'), // optional entry fee pot
})
```

You can also read `wins(address)` to show an on-chain leaderboard.

---

## Part 6 – Online Multiplayer (Real-time)

The current game is local (same keyboard). For true online multiplayer:

### Recommended options

| Tool | Pros | Best for |
|------|------|----------|
| **PartyKit** | Extremely easy with Next.js | Tutorials / indie |
| **Socket.io** + custom server | Full control | Production |
| **Colyseus** | Built for games | Complex rooms |
| **Liveblocks** | Great DX | Presence + rooms |

### Minimal PartyKit example

```bash
npm install partykit partysocket
```

`party/race.ts` (server):

```ts
import type * as Party from "partykit/server";

export default class RaceServer implements Party.Server {
  constructor(readonly room: Party.Room) {}

  onConnect(conn: Party.Connection) {
    // broadcast current state
  }

  onMessage(message: string, sender: Party.Connection) {
    // relay car positions, eliminations, etc.
    this.room.broadcast(message, [sender.id]);
  }
}
```

On the client, replace the local `carsRef` updates with messages sent/received over the WebSocket.  
Keep the Avalanche transactions only for **start race** and **finish race**.

---

## Part 7 – Putting It All Together (Player Flow)

1. User connects wallet (Core / MetaMask on Fuji)
2. User mints (or already owns) a MicroCar NFT
3. User creates or joins a race room (WebSocket)
4. Optional: everyone pays a small entry fee into the RaceRegistry
5. Race runs in real-time (Canvas + WebSocket)
6. When a player is eliminated or finishes 3 laps → client notifies the room
7. Winner is determined → one transaction records the result and pays the pot
8. On-chain wins counter updates → global leaderboard

---

## Next Steps & Improvements

- **Anti-cheat**: Use a trusted relay or commit-reveal so only the server can submit results
- **Car stats from NFT**: Different cars have different top speed / handling (read traits from metadata)
- **Seasonal leaderboards**: On-chain or subgraph
- **Mainnet**: Change chain to `avalanche` and use real AVAX
- **Avalanche L1 / Subnet**: For high-volume games, consider a dedicated Avalanche L1 (like GUNZ or MapleStory N)

---

## Useful Links

- Avalanche Docs → https://docs.avax.network
- Fuji Faucet → https://core.app/tools/testnet-faucet/
- Snowtrace (Fuji) → https://testnet.snowtrace.io
- Wagmi → https://wagmi.sh
- RainbowKit → https://rainbowkit.com
- OpenZeppelin Contracts → https://docs.openzeppelin.com/contracts
- PartyKit → https://partykit.io

---

## Project Checklist

- [x] Local Micro Machines game (Canvas, camera, elimination)
- [ ] Wallet connection (Wagmi + RainbowKit)
- [ ] MicroCarNFT deployed on Fuji
- [ ] RaceRegistry deployed on Fuji
- [ ] Mint car from the UI
- [ ] Record race result on-chain
- [ ] (Optional) Real-time multiplayer with PartyKit / Socket.io
- [ ] On-chain leaderboard UI

You now have a complete blueprint to turn this racing game into a real Avalanche multiplayer experience.

Happy building! 🏎️❄️
