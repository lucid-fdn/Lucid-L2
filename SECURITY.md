# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Lucid Layer, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

### How to Report

Email **security@raijinlabs.io** with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### What to Expect

- **Acknowledgment** within 48 hours
- **Assessment** within 5 business days
- **Fix timeline** communicated once severity is determined
- **Credit** in the security advisory (unless you prefer anonymity)

### Scope

The following are in scope:

- Solana programs (`programs/`)
- EVM contracts (`contracts/`)
- Offchain engine (`offchain/packages/engine/`)
- Gateway API (`offchain/packages/gateway-lite/`)
- Cryptographic implementations (signing, hashing, MMR, receipts)
- Authentication and authorization logic
- Payment and escrow flows

The following are out of scope:

- Issues in third-party dependencies (report upstream)
- Social engineering attacks
- Denial of service via rate limiting (already mitigated)
- Issues requiring physical access

### Severity Levels

| Severity | Examples | Target Fix Time |
|----------|---------|----------------|
| **Critical** | Private key exposure, fund theft, receipt forgery | 24 hours |
| **High** | Auth bypass, unauthorized state transitions, payment replay | 3 days |
| **Medium** | Information disclosure, privilege escalation | 7 days |
| **Low** | Minor data leaks, non-exploitable edge cases | Next release |

### Safe Harbor

We consider security research conducted in good faith to be authorized. We will not pursue legal action against researchers who:

- Make a good faith effort to avoid privacy violations and data destruction
- Only interact with accounts they own or with explicit permission
- Report vulnerabilities promptly and do not exploit them beyond proof of concept

## Supported Versions

| Version | Supported |
|---------|-----------|
| `master` (latest) | Yes |
| Older commits | Best effort |

## On-Chain Programs

For vulnerabilities in deployed Solana programs or EVM contracts, include the program ID or contract address in your report. On-chain vulnerabilities are treated as Critical by default.
