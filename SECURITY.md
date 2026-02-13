# Security Policy

## Supported Versions

This project is pre-1.0 and tracks security fixes on the latest default branch only.

| Version | Supported |
| --- | --- |
| main | ✅ |
| older snapshots | ❌ |

## Reporting a Vulnerability

1. Do not open public issues for security vulnerabilities.
2. Email a private report that includes:
   - Affected commit hash.
   - Reproduction steps.
   - Expected impact.
   - Proof-of-concept payload or transaction where relevant.
3. You will receive an acknowledgment within 72 hours.
4. Confirmed vulnerabilities are triaged by severity using impact on user funds, private key handling, and transaction integrity.
5. Fixes are released with coordinated disclosure details.

## Security Controls in this Repository

- Runtime input validation for API routes and server actions using Zod.
- Explicit DOM-bound string sanitization for rendered account metadata.
- Structured error responses with bounded details.
- Devnet defaults enforced by environment schema.
- RPC-first lobby discovery without mandatory centralized service dependency.
- Optional indexer treated as additive and fail-open.
