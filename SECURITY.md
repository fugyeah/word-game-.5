# Security Policy

## Core invariants

The following invariants must hold across all game flows:

1. **Custody conservation**: Treasury balance must equal total escrowed stakes minus completed payouts/refunds.
2. **Single-winner finality**: A settled game has exactly one winner and one loser.
3. **No double-claim**: A winner can claim exactly once.
4. **Authorization checks**: Only valid participants can roll/claim/forfeit/withdraw, and only creator can cancel/close.
5. **Deterministic test path isolation**: Deterministic RNG is gated behind `ENABLE_TEST_ONLY_RANDOMNESS=1` and must reject production builds.
6. **State-machine safety**: Transitions outside allowed lifecycle phases are rejected.

## Known limitations

- Deterministic RNG included here is intentionally for test coverage and verification; it is not cryptographically secure randomness.
- The repository currently contains both Solidity and Solana-oriented test material; deployment orchestration must ensure environment-specific build pipelines are isolated.
- Real-world on-chain deployments should use audited randomness providers (VRF / oracle-backed flow) and program-level account constraints.

## Responsible disclosure

If you discover a vulnerability:

1. Do not disclose publicly before triage.
2. Send a report to **security@word-game.invalid** with:
   - impact summary
   - affected files/flows
   - reproducible steps
   - proof-of-concept (if available)
3. Expect acknowledgment within 3 business days.
4. Coordinated disclosure target is 30 days after confirmation, unless active exploitation requires accelerated response.
