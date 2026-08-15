# Release readiness

## Recommendation

**GO for the public `0.1.0` release once the final GitHub Actions run is green.** The maintainer authorized GitHub/npm publication on 2026-08-15 and GitHub Private Vulnerability Reporting is enabled.

The ecosystem gate is GO: no mature, active, full Prometheus-native DSH plugin was found; the current public Session, Agent, LLM, Tool, Approval, Subagent, Job, Cordis lifecycle, and web-server seams are sufficient; and the implementation installs out of tree without modifying upstream. Full evidence is in [ecosystem-analysis.md](research/ecosystem-analysis.md).

## Completion and test status

- Implemented: private registry, bounded labels, public-event collectors, safe web-route/standalone endpoint, reversible lifecycle, Prometheus examples/alerts, and provisioned Grafana dashboard.
- Unit/integration/composition tested: 22 tests across six files on Windows with Node `24.18.0`; coverage thresholds are enforced.
- E2E tested: an npm tarball was installed with the official DSH `0.1.0-rc.6` CLI into a disposable profile, composed, started, scraped directly and by Prometheus, then removed.
- Manually verified: Prometheus `3.7.3` accepted the config and six alert rules and ingested a plugin metric; Grafana `12.3.1` provisioned one datasource and the overview dashboard.
- Public repository: [xxiaoxiong/dsh-prometheus](https://github.com/xxiaoxiong/dsh-prometheus). npm publication is performed after the final CI gate and verified separately.

## Compatibility and remaining unknowns

Verified runtime: DSH npm `0.1.0-rc.6`, upstream commit `47f943859bef60e4160492346772ded9b24f765a`, Node `24.18.0`, pnpm `11.19.0`, Windows. Linux and Node 22/24 CI are configured but remain unverified until a hosted run exists. See [compatibility.md](compatibility.md).

DSH is a Developer Preview. Public service/event shapes, bundle patch semantics, and web-server capability behavior may break in later release candidates. The plugin deliberately does not use private imports or session persistence and does not duplicate official OTLP session telemetry.

## Security risk

The endpoint intentionally has no authentication or TLS. It is loopback-only by default; remote binding requires `allowRemote: true`. Dynamic labels are length/character/vocabulary bounded and secret fixtures are asserted absent. Operators still need network controls and must regard aggregate operational metrics as sensitive. Security reports use GitHub Private Vulnerability Reporting.

## Names and version

- npm package: `dsh-prometheus` — exact-name lookup returned not found during the 2026-08-15 scan; recheck immediately before publication.
- proposed GitHub repository: `dsh-prometheus` — no exact repository was found during the scan; recheck before creation.
- recommended first version: `0.1.0`, clearly marked as compatible only with DSH `0.1.0-rc.6`.
- recommended topics: `dsh-plugin`, `deepseek-harness`, `prometheus`, `grafana`, `observability`, `ai-agents`.

## Suggested release notes

> First developer-preview release of `dsh-prometheus`. Exposes privacy-conscious operational metrics from public DeepSeek Harness seams, with bounded labels, loopback-safe defaults, Prometheus rules, and a provisioned Grafana overview dashboard. Verified against DSH `0.1.0-rc.6` on Node 24/Windows. DSH remains a Developer Preview; later release candidates are not yet supported.

## Publication blockers

1. Run the corrected Linux/Node 22 and Node 24 CI to green.
2. Reconfirm the npm name immediately before `npm publish`.
3. Publish from the exact tested commit, create tag `v0.1.0`, and verify a clean registry install.
