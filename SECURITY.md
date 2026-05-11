# Security Policy

## Supported versions

solcli is pre-1.0. Only the latest published version receives security fixes.

| Version | Supported |
|---------|-----------|
| 0.0.x   | ✅ |

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security reports.

Email: **security@zods.pro** (preferred)

Include:

- A description of the issue and its impact
- Reproduction steps and the affected versions
- Any proof-of-concept, exploit code or sample inputs
- Your name / handle for credit (or "anonymous")

We will acknowledge receipt within **3 business days** and aim to have a fix or mitigation
released within **30 days** for confirmed high-severity issues, faster for critical ones.

## Scope

In scope:

- Secret handling (keychain, encrypted-file fallback, log redaction)
- Code execution via untrusted RPC responses, config files or environment values
- Path traversal or symlink escapes from the config/cache/data directories
- TLS / certificate validation bypasses
- Supply-chain risks in our published artifact

Out of scope (please use regular GitHub issues for these):

- Bugs in dependencies that don't affect solcli; report upstream
- Issues that require local root or physical access
- Social-engineering, phishing or denial-of-service against the project's hosting

## Disclosure policy

We follow **coordinated disclosure**: once a fix is released, we publicly credit the reporter
(unless they prefer anonymity) and publish a GitHub Security Advisory describing the issue,
versions affected, and the fix.
