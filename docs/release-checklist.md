# Release checklist

- [x] Re-run the ecosystem scan and confirm the project still fills a distinct gap (2026-08-15).
- [x] Pin the tested DSH/npm versions and upstream commit in `docs/research/ecosystem-analysis.md`.
- [ ] Run `pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm test:coverage` on Node 22 and 24.
- [x] Run `pnpm pack`; inspect the tarball file list and unpacked size.
- [x] Install the tarball into a temporary `DSH_HOME` profile with `dsh plugin --profile e2e add <tarball>`.
- [x] Verify `dsh --profile e2e --dump-config` includes the bundle layer and `prometheus` row.
- [x] Start DSH and scrape the endpoint directly and with Prometheus; validate the Prometheus config/rules and ingested series.
- [x] Remove with `dsh plugin --profile e2e remove dsh-prometheus`; verify the layer disappears. Route/server cleanup is integration-tested.
- [x] Validate the provisioned Grafana dashboard through the Grafana API without migration errors.
- [x] Review the full exposition for forbidden data using seeded secret fixtures.
- [ ] Confirm `SECURITY.md` has a real private reporting contact before public release.
- [ ] Update `CHANGELOG.md`, version, git tag, and provenance/SBOM as applicable.
- [ ] Obtain explicit authorization before creating a public repository or publishing to npm.
