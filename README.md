# word-game-.5

This repository now includes a deterministic `anchor/tests/solana_street_craps.spec.ts` suite for Solana Street Craps lifecycle validation, plus operational security and deployment guidance.

## Config freeze

Freeze mutable game configuration at deploy-time and only unfreeze through explicit governance:

- `ENABLE_TEST_ONLY_RANDOMNESS` must remain unset in production.
- Keep payout, bet-size, and treasury authority values immutable after activation unless a signed upgrade is approved.
- Freeze ID derivation (`gameId`) and account seed layouts before mainnet deployment to avoid account-address drift.

Recommended freeze process:

1. Build release artifact.
2. Verify deterministic hash of deployed binary.
3. Snapshot env vars and signer set.
4. Deploy and tag commit + artifact hash.

## Fairness verification

Fairness verification is split into two layers:

1. **Program state rules**: create/join/roll/retry/settle/claim/cancel/withdraw/forfeit transitions are deterministic and reject unauthorized actions.
2. **Randomness controls**: test-only deterministic RNG is feature-flagged and intentionally blocked in production builds.

Verification checklist:

- Re-run deterministic test vectors with a known seed.
- Confirm produced roll sequence is identical for the same seed.
- Ensure production build rejects test-only randomness flag.
- Confirm double-claim prevention remains active.

## Optional indexer

An indexer is optional for local development and analytics.

If enabled, index events for:

- game creation and join state
- roll outcomes and phase transitions
- settle + claim events
- cancel/withdraw/forfeit lifecycle records

Minimal indexer output suggestion:

- `games`
- `participants`
- `rolls`
- `claims`
- `refunds`

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `ENABLE_TEST_ONLY_RANDOMNESS` | test only | Must be `1` to enable deterministic RNG in tests. |
| `NODE_ENV` | yes | Set to `test` for deterministic tests; set to `production` for release builds. |
| `APP_ENV` | optional | Additional production guard (treated like `NODE_ENV=production`). |
| `ANCHOR_PROVIDER_URL` | for Anchor runs | Solana RPC URL used by Anchor test/deploy commands. |
| `ANCHOR_WALLET` | for Anchor runs | Signer keypair path. |

## Build and deploy commands

```bash
# compile Solidity contract
solc --bin --abi wordgame.sol -o build

# run deterministic Node test suite
node --test anchor/tests/solana_street_craps.spec.ts

# optional Anchor workflow (if Anchor.toml is present)
anchor build
anchor deploy
```

## End-to-end devnet test flow

1. Set environment:

```bash
export NODE_ENV=test
export ENABLE_TEST_ONLY_RANDOMNESS=1
export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com
export ANCHOR_WALLET=~/.config/solana/id.json
```

2. Run deterministic integration tests:

```bash
node --test anchor/tests/solana_street_craps.spec.ts
```

3. If using Anchor program deployment:

```bash
anchor build
anchor deploy --provider.cluster devnet
anchor test --skip-build --provider.cluster devnet
```

4. Validate post-deploy invariants:

- unauthorized claim fails
- duplicate claim fails
- cancel/withdraw refunds match stake amounts
- production config does not permit test-only randomness

## Security policy

See [`SECURITY.md`](./SECURITY.md) for invariants, known limitations, and disclosure process.
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
