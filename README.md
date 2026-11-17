# Micro Machines – Multiplayer Racing on Avalanche

A top-down Micro Machines-style racing game built with **Next.js + Canvas**, designed as the foundation for a **Web3 multiplayer game on Avalanche**.

## Features (current)

- Local multiplayer (2–4 players)
- Bigger track + camera that follows the race leader
- Elimination: fall too far behind the leader → you're OUT
- Last car standing or first to 3 laps wins
- Clean HUD + minimap

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000

### Controls

| Player | Color  | Keys        |
|--------|--------|-------------|
| 1      | Red    | Arrow keys  |
| 2      | Blue   | WASD        |
| 3 & 4  | AI     | —           |

## Avalanche Tutorial

**Full step-by-step tutorial** to turn this into a blockchain multiplayer game:

👉 **[TUTORIAL.md](./TUTORIAL.md)**

The tutorial covers:

1. Wallet connection (Wagmi + RainbowKit + Core Wallet)
2. Deploying Car NFT + Race Registry contracts on **Avalanche Fuji**
3. Recording race results on-chain
4. Optional entry fees & prizes
5. Adding real-time online multiplayer (PartyKit / Socket.io)

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- HTML5 Canvas
- Tailwind CSS
- (Tutorial) Wagmi, Viem, RainbowKit, Hardhat, OpenZeppelin, Avalanche C-Chain

## License

MIT
