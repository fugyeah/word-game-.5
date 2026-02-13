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
