# ADR-079 — Controlled Candidate Pipeline

## Status

Accepted for the v0.5 implementation.

## Decision

A Proposal approved for candidate is only an experiment input. A candidate binds one profile, one repository identity, one full base SHA, one revision and an explicit path allowlist. Editing requires a separate human authorization and `--pode-fazer`; the default mode is `dry-run`.

Baseline and candidate are separate local worktrees derived from the same SHA. The main checkout is fingerprinted before and after each phase and is never an edit target. The candidate may create a local namespaced branch and immutable local snapshot, but the runtime has no fetch, pull, push, remote mutation, merge, rebase, cherry-pick, tag, PR or deploy capability.

Scope Guard includes tracked, untracked, renamed, deleted, symlink, binary, sensitive and lockfile changes. A snapshot is evaluated only after scope passes. Review and Impact Report are read-only/hash-bound artifacts; only a human can record `AcceptedForManualIntegration`, which never performs integration.

State is stored outside the repository and partitioned by profile. Cleanup resolves exact registered worktree paths, requires explicit confirmation, never uses force and preserves the branch and evidence by default.

## Consequences

- A candidate can be blocked by missing environment, base drift, scope expansion, hard regression or review findings without deleting evidence.
- The implementation proves local lifecycle and policy boundaries; it does not claim a complete sandbox, real Codex/MCP enforcement or model-quality measurement.
- Cross-repository candidates, memory promotion and external connector writes remain out of scope.
