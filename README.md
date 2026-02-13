# Solana Street Craps Monorepo Layout

This repository is structured for a Next.js 14 frontend, an Anchor program workspace, and an optional Node TypeScript indexer.

## Implemented Layout

```text
.
├── app/
│   ├── api/lobbies/route.ts
│   ├── features/lobby/actions/lobbies.ts
│   ├── features/lobby/components/LobbyListClient.tsx
│   ├── features/lobby/services/lobby-service.ts
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── ErrorPanel.tsx
├── lib/
│   └── solana/
│       ├── math.ts
│       ├── rpc.ts
│       ├── sanitize.ts
│       └── schemas.ts
├── styles/
│   └── globals.css
├── types/
│   └── domain.ts
├── anchor/
│   ├── Anchor.toml
│   ├── Cargo.lock
│   ├── Cargo.toml
│   └── programs/solana_street_craps/src/lib.rs
├── indexer/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── cache.ts
│       ├── server.ts
│       └── solana.ts
├── SECURITY.md
└── .env.example
```

## Architecture Decisions

- Lobby listing is RPC-native and independent of indexer availability. RPC account scans are the primary source, so lobby discovery works with no server dependency.
- The indexer is additive only. If indexer fetch fails or is absent, UI and API continue with `rpc_only` mode.
- Used Server Actions for initial page fetch and a typed API route for external consumers. This preserves strict type boundaries while keeping route-level interoperability.
- Business logic (math, RPC, sanitization, validation) is extracted to `lib/solana` and feature services, keeping UI components focused on rendering.

## Environment Defaults (Devnet)

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Key defaults:

- `NEXT_PUBLIC_SOLANA_CLUSTER=devnet`
- `NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com`
- `INDEXER_RPC_URL=https://api.devnet.solana.com`

Indexer can be enabled by setting `NEXT_PUBLIC_INDEXER_URL=http://localhost:8787`.

## Frontend Setup

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## Indexer Setup (Optional)

```bash
cd indexer
npm install
npm run dev
```

Endpoints:

- `GET /health`
- `GET /lobbies`

Failure mode behavior:

- Seed RPC failures degrade to fallback synthetic lobby payload.
- UI safely consumes empty or partial indexer payloads.

## Anchor Workspace Setup

From repo root:

```bash
cd anchor
cargo check --workspace
```

## Validation and Error Handling Guarantees

Every system boundary validates input with Zod:

- Query params in `app/api/lobbies/route.ts`.
- Server action payload in `app/features/lobby/actions/lobbies.ts`.
- Environment variables in `app/features/lobby/services/lobby-service.ts` and `indexer/src/server.ts`.
- Indexer payload validation in `lib/solana/rpc.ts`.

Error paths implemented for each external dependency:

- Non-200 RPC response.
- RPC JSON-RPC error envelope.
- Fetch/network exception.
- Decode/validation failures for malformed account data.
- Indexer unavailable/unreachable.

All errors return structured objects with stable `code` and user-friendly `message`.

## Security Notes

- Sanitization is applied to account-derived text before render.
- No `any` is used in TypeScript modules.
- UI avoids raw stack traces.
- No secrets are committed.

## API Contract

### `GET /api/lobbies?limit=25`

Response shape:

```json
{
  "lobbies": [
    {
      "publicKey": "string",
      "creator": "string",
      "createdAtIso": "ISO-8601",
      "playersLabel": "3/8",
      "buyInSol": "1.2",
      "payoutPotentialSol": "2.064",
      "state": "OPEN"
    }
  ],
  "source": "rpc_only",
  "errors": []
}
```

## Development Notes

- Stable sorting is applied on lobby `createdAt` descending.
- Math utility converts lamports safely with bigint precision.
- Payout calculation applies a fixed edge and odds weighting by point.
