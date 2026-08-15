# Ecosystem analysis and GO/NO-GO gate

Research date: 2026-08-15 (Asia/Shanghai)

## Decision

**GO** for an independent `dsh-prometheus` bundle focused on bounded, Prometheus-native DeepSeek Harness runtime metrics and a matching Grafana dashboard.

The ecosystem has partial observability implementations, including one host-health Prometheus endpoint, but no project found during this scan combines DSH agent/session/LLM/tool/approval/subagent/job metrics, a scrape endpoint, cardinality controls, lifecycle-safe teardown, and a Grafana dashboard. Current public Harness seams can provide those facts without changing upstream or importing private paths.

This decision is scoped to the evidence and versions below. DeepSeek Harness is in developer preview, so compatibility must be rechecked for every DSH release.

## Upstream baseline

The official repository was cloned from `https://github.com/deepseek-ai/deepseek-harness` and inspected at:

- Branch: `master`
- Commit: `47f943859bef60e4160492346772ded9b24f765a`
- Commit date: `2026-08-13T19:38:46+08:00`
- Commit subject: `Merge pull request #2519 from deepseek-harness/feat/npm-public`
- Source-tree root version: `0.1.0-rc.5`
- npm CLI version on 2026-08-15: `@deepseek-ai/dsh@0.1.0-rc.6`
- npm `next` versions inspected for the public packages used by this design: `0.1.0-rc.6`
- Node requirement: `^22.19.0 || >=24.0.0`
- pnpm declared by upstream: `11.7.0`
- Local research runtime: Node `v22.23.1`, npm `10.9.8`, pnpm `11.19.0`, Windows

The source manifest and npm registry are recorded separately because the registry had already published rc.6 while the latest public `master` manifest still read rc.5.

Official sources inspected include:

- `README.md`, `CONTRIBUTING.md`, and `AGENTS.md`
- `docs/architecture.md`
- `docs/capability-seams.md`
- `docs/event-producer-consumer.md`
- `docs/agent-lifecycle.md`
- `docs/tool-execution-pipeline.md`
- `docs/persistence-catalog.md`
- `docs/cookbook/extension-cookbook.md`
- `docs/cordis-primer.md`, `docs/defensive-patterns.md`, and the Cordis tutorial
- `docs/user/develop/basic/*`, especially `publish.md`
- `packages/core/session`, `packages/core/agent`, `packages/core/tools`, `packages/llm/llm`
- `packages/jobs/jobs`, `packages/jobs/jobs-local`
- `packages/subagent/subagent`, `packages/interaction/user-approval`
- `packages/session/session-telemetry` and `packages/session/session-telemetry-otel`
- `packages/host/webserver`, `packages/bundle/base`, and Loader composition tests/examples

Authoritative upstream links:

- Repository: https://github.com/deepseek-ai/deepseek-harness
- Architecture: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
- Capability seams: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md
- Event matrix: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/event-producer-consumer.md
- Persistence catalog: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/persistence-catalog.md
- Plugin publishing: https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md

## Telemetry versus metrics

Upstream already provides `ctx.sessionTelemetry` and the packages `@deepseek-ai/dsh-session-telemetry` and `@deepseek-ai/dsh-session-telemetry-otel`. They are a session-ledger logging seam and an OTel logs backend, not a Prometheus metrics provider:

- The coordinator projects session events into logical log records and hands them to one backend.
- The OTel backend emits logs through OTLP/HTTP; it does not expose Prometheus metrics.
- Uploading modes can carry complete event bodies, including prompts, assistant text, tool arguments/results, paths, and system prompts unless a deployment mounts redaction rules.
- Only one `SessionTelemetryBackend` may be mounted per Cordis context.

`dsh-prometheus` must therefore **not** implement or replace `SessionTelemetryBackend`. It will observe purpose-built public events and services, aggregate numeric state in-process, and never retain or expose event bodies. This avoids a backend conflict and establishes a much narrower privacy boundary.

## Public seam feasibility

| Domain | Public seam | Feasible metrics | Notes |
| --- | --- | --- | --- |
| Runtime/session | `session/created`, `session/disposed`, `session/event` | process start, active sessions, turns, steps, turn duration | Turn/step boundaries and timestamps are durable facts. Session identity is used only as in-memory correlation, never as a label. |
| Agent | `agent/error`, `agent/status` | errors, active/running state if retained | `agent/error` supplies live operational failure without reading loop internals. |
| LLM | `llm/stream` waterfall and public `GenerateOptions`/`StreamChunk` | requests, duration, terminal status, input/output/reasoning/cache tokens | The extension cookbook explicitly names `llm/stream` as the model-call wrapper. A wrapper can observe terminal chunks and usage while delegating the stream unchanged. |
| Tools | `tools/execute` waterfall and `tools/result` | calls, duration, errors | Upstream explicitly identifies `tools/execute` as the around-dispatch seam for metrics and `tools/result` as final immutable observation. |
| Approval | durable `approval/asked` and `approval/decided` events on `session/event` | requests and closed outcomes | Request ids, call ids, reasons, and tool arguments are not labels. |
| Subagents | `subagent/start`, `subagent/end` | started, terminal outcomes, duration | Provider is bounded through a cardinality guard; run/session ids are correlation only. |
| Jobs | public `ctx.jobs.onJobsChanged`, `ctx.jobs.onJobDone`, and `ctx.jobs.list` | active, started, completed/killed/failed | The service contract intentionally exposes lifecycle observation without private registry access. Job ids and labels are never exported. |
| HTTP in Web profile | public `ctx.webServer.register()` | exact `/metrics` route | Preferred when the web-server service is part of the composition; registration returns a lifecycle disposer. |
| HTTP outside Web profile | Node `http` owned by a Cordis effect | standalone loopback endpoint | Permitted fallback for headless compositions; must close to quiescence and report bind conflicts clearly. |

No public metrics capability seam exists in the inspected upstream. The correct extension shape is therefore an out-of-tree observer/collector service using the public events above, with separate endpoint adapters. It must not import `agent-loop`, persistence implementations, or source/private subpaths.

## Ecosystem scan

### Sources and queries

The scan covered:

- GitHub topic `dsh-plugin`
- The current `awesome-dsh-plugin/awesome-dsh-plugin` catalog at commit `b89a72ceb896d502242203615cfe676d52ad62fa`
- `0xsline/awesome-deepseek-harness`
- `vvlife/awesome-deepseek-harness-plugins`
- indexed DeepSeek Harness Discussions/search results
- GitHub public repository search
- npm exact-name and keyword checks

Search terms: `prometheus`, `grafana`, `metrics`, `observability`, `monitoring`, `opentelemetry`, `otel`, and `telemetry`.

The broad `dsh-plugin` topic was noisy and contained many unrelated repositories, so the gate relies on targeted keyword searches plus source inspection of shortlisted projects rather than the topic count itself.

Targeted GitHub repository search results on 2026-08-15:

- `topic:dsh-plugin prometheus in:name,description,readme`: 2 results; only `woshi-Tom/dsh-status-plugin` was a relevant DSH Prometheus implementation.
- `topic:dsh-plugin grafana in:name,description,readme`: 0 results.
- Exact GitHub repository-name search for `dsh-prometheus`: 0 results.
- Exact GitHub repository-name search for `dsh-observability-prometheus`: 0 results.
- Neither inspected awesome catalog contained `Prometheus` or `Grafana` entries.

Discussion search returned no indexed Prometheus/Grafana proposal. GitHub's unauthenticated Discussions query page was not reliably machine-readable during the scan, so this is weaker evidence than the repository and catalog searches and is not presented as proof that no unindexed discussion exists.

### Shortlisted projects

| Project | Observed state | Overlap | Gate assessment |
| --- | --- | --- | --- |
| `woshi-Tom/dsh-status-plugin` | Created 2026-08-14; 1 star; source `0.2.1`, npm `0.2.0`; latest source commit `d3fd274a13fba7b09823adb756201e706b30c6fd` | Prometheus text endpoint for host/process health gauges: CPU, memory, event-loop delay, uptime, API-key presence, and plugin counts | Partial protocol overlap only. It does not collect agent/session/LLM/tool/approval/subagent/job metrics and ships no Grafana dashboard. Complementary rather than a replacement. |
| `Small-tailqwq/dsh-tps` | Created 2026-08-13; 1 star; private package; 27 UI-focused tests; source `69dac729c6c8dd3cec37cc182e69d5a08c5685e2` | Running-turn TPS badge in DSH Web | Narrow UI metric, no Prometheus or Grafana. README describes a patched-slot installation constraint. |
| `disyli/dsh-tool-call-stats` | Created 2026-08-14; 0 stars; five files; no test files; not on npm; source `f1e956cdbb5b51fb9cd8dc9034fdaa61ac877769` | Per-process tool call/error/average duration report through a model tool | Overlaps three tool aggregates only. It intentionally exposes an in-agent tool rather than an operations endpoint. |
| `Cavan-Ou/dsh-observation-journal` | Created 2026-08-14; 2 stars; replay tests; not on npm; source `0fbbaf098d3cf462c4e315771b75d9a25b82ff10` | Human-readable local session journal and summary | File/journal product, no Prometheus endpoint or Grafana dashboard. |
| `vibeinging/dsh-trace` | Created 2026-08-11; 2 stars; private distribution; source `caadf1b831ae2643bd25a365cc1356c2100e7a05` | Local yiTrace trace database through the telemetry backend seam | Trace storage with potentially sensitive content; no Prometheus endpoint or Grafana dashboard. It replaces the OTel telemetry backend, unlike the proposed aggregate-only observer. |
| Official `session-telemetry-otel` | Upstream rc.5 source / rc.6 npm generation | OTLP logs for projected session records | Mature official logging seam, but not metrics and not Prometheus-native. |

Other catalog entries such as cost meters, usage dashboards, live TPS, failure loggers, and verification receipts remain user-facing or file-backed point solutions. None found supplied the proposed operations stack.

## Name availability

Both proposed names were unoccupied in the checks performed on 2026-08-15:

- npm `dsh-prometheus`: `E404 Not Found`
- npm `dsh-observability-prometheus`: `E404 Not Found`
- GitHub exact name search for each: 0 repositories

Selected working name: **`dsh-prometheus`**. It is shorter, names the integration directly, and leaves Grafana as a shipped consumer artifact rather than implying that all observability signals are implemented.

Availability is not a reservation. It must be checked again immediately before public repository creation or npm publication.

## GO criteria

1. **No mature, active, functionally complete Prometheus-native DSH plugin:** satisfied. The only relevant endpoint found is a newly created host-health plugin with a different metric domain and no Grafana dashboard.
2. **Current public seams are sufficient for metrics:** satisfied. Session, LLM, tools, approval, subagent, and jobs have documented public observation points; the web server has a public route registry.
3. **Out-of-tree implementation without upstream changes:** satisfied. The official bundle manifest and `dsh plugin add` flow support a package declaring `dsh.bundle.patch`; all selected APIs are package-root exports or Cordis declarations.

Result: **GO**.

## Constraints carried into implementation

- Use only public package exports and declared Cordis events/services.
- Do not mount a telemetry backend or consume telemetry record bodies.
- Never export session, request, turn, step, call, run, job, user, file, or workspace identity as a Prometheus label.
- Never retain or inspect prompts, assistant text, tool arguments/results, error stacks, credentials, paths, or feedback content.
- Bound every dynamic label vocabulary, including provider, model, tool, job kind, and subagent provider, and collapse excess values to a fixed overflow value.
- Use lifecycle effects for every listener, route, server, and registry; teardown must await standalone server closure.
- Prefer `ctx.webServer.register()` in Web compositions. Keep a separately configured loopback-only standalone endpoint for compositions without that service.
- Dashboards may reference only metrics that the shipped collectors actually register.
- Treat rc.6 as an exact verified compatibility target until broader versions are tested; do not claim compatibility with future DSH releases.

## Reproduction evidence

Representative commands used for this gate:

```text
git ls-remote https://github.com/deepseek-ai/deepseek-harness.git refs/heads/master
# 47f943859bef60e4160492346772ded9b24f765a refs/heads/master

git clone --depth 1 --branch master https://github.com/deepseek-ai/deepseek-harness.git <research-dir>
git -C <research-dir> rev-parse HEAD
# 47f943859bef60e4160492346772ded9b24f765a

npm view @deepseek-ai/dsh version dist-tags --json
# latest/next: 0.1.0-rc.6

npm view dsh-prometheus version --json
# E404 Not Found

npm view dsh-observability-prometheus version --json
# E404 Not Found
```

All successful commands above exited `0`; npm's two expected unavailable-name probes returned package-level `E404` results.
