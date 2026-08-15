# Contributing

DeepSeek Harness is currently a developer preview. Contributions must stay on public package exports and public capability seams; do not import `src/` paths or rely on private registries.

## Local workflow

Requirements: Node `^22.19.0 || >=24.0.0` and pnpm 11.

```sh
pnpm install
pnpm check
pnpm test:coverage
pnpm pack
```

Every behavior change needs a test. Changes to metric names, types, labels, histogram buckets, or outcome mapping also require updates to `docs/metrics.md`, both READMEs, alert rules, and the Grafana dashboard. A new dynamic label needs a privacy and cardinality justification.

Before proposing a release, run the temporary-profile pack/install/remove test described in `docs/release-checklist.md`. Do not publish to npm or create a public repository without maintainer authorization.
