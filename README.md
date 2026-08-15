# dsh-prometheus

English | [中文](README.zh.md)

Prometheus metrics and a ready-to-import Grafana dashboard for DeepSeek Harness. The plugin observes public DSH lifecycle seams, keeps metric series bounded, and avoids exporting conversation or tool payloads.

> Release status: `0.1.0` is the first developer-preview release, tested against DSH `0.1.0-rc.6`.

## What it monitors

- Active sessions; agent turns, steps, errors, and duration histograms
- LLM request rate, terminal status, latency, and disjoint input/output/reasoning/cache token counters
- Tool call rate, normalized success/error status, and latency
- Approval request and fixed outcome counters
- Subagent starts, outcomes, and duration
- Active/started/completed/killed/failed background jobs and duration
- Process start time and cardinality-overflow diagnostics

The exact names, labels, and meanings are in [docs/metrics.md](docs/metrics.md).

## Compatibility

| Component | Tested version |
|---|---|
| DeepSeek Harness npm packages | `0.1.0-rc.6` |
| Official source baseline | `47f943859bef60e4160492346772ded9b24f765a` (2026-08-13) |
| Cordis | `^4.0.1` |
| Node.js | `^22.19.0 || >=24.0.0` |
| prom-client | `15.1.3` |

DeepSeek Harness is a developer preview. Treat every DSH upgrade as a compatibility event and run the full test/release checklist.

## Install

Install the package into a DSH profile and verify its bundle layer:

```sh
dsh plugin --profile monitoring add dsh-prometheus
dsh --profile monitoring --dump-config
```

The bundle inserts one row with id `prometheus`. Verify the dump includes the `dsh-prometheus` layer before booting the profile.

## Endpoint selection

The default `mode: auto` makes one activation-time decision:

1. If a public DSH `webServer` is already active and safely bound, register the exact `/metrics` route on it.
2. Otherwise, start a standalone endpoint on `127.0.0.1:9464`.

For the bundled Docker example, force standalone mode so Prometheus has a stable target. Add this row to the profile's `cordis.patch.yml` (later layers replace the whole `config` value):

```yaml
- id: prometheus
  config:
    enabled: true
    mode: standalone
    host: 127.0.0.1
    port: 9464
    path: /metrics
    allowRemote: false
    maxLabelValues: 64
    maxLabelValueLength: 80
```

### Configuration

| Field | Default | Description |
|---|---:|---|
| `enabled` | `true` | Disable all collectors and endpoint without removing the row. |
| `mode` | `auto` | `auto`, `webserver`, or `standalone`. |
| `host` | `127.0.0.1` | Standalone bind address: loopback or `0.0.0.0`. |
| `port` | `9464` | Standalone TCP port; `0` is intended only for tests. |
| `path` | `/metrics` | Exact route, beginning with `/` and without a trailing slash. |
| `allowRemote` | `false` | Required acknowledgement for `0.0.0.0` or a remote-facing WebServer route. |
| `maxLabelValues` | `64` | Per-key dynamic-label vocabulary cap. |
| `maxLabelValueLength` | `80` | Maximum accepted dynamic-label length. |

Remote exposure has no built-in authentication or TLS. Read [SECURITY.md](SECURITY.md) before enabling it.

## Quick scrape

```sh
curl --fail --silent http://127.0.0.1:9464/metrics
```

The endpoint accepts GET and HEAD, returns `405` for other methods, disables caching, and uses the Prometheus/OpenMetrics-compatible `prom-client` content type.

## Prometheus and Grafana

The repository includes a full local stack:

```sh
docker compose -f examples/docker-compose.yml up -d
```

Then open Prometheus at `http://127.0.0.1:9090` and Grafana at `http://127.0.0.1:3000` (`admin` / `admin`; change it outside local development). The datasource and `DeepSeek Harness / Overview` dashboard are provisioned automatically.

The standalone assets are [`examples/prometheus.yml`](examples/prometheus.yml) and [`grafana/dsh-overview.json`](grafana/dsh-overview.json). Security, compatibility, and verification details live in [`docs/security.md`](docs/security.md), [`docs/compatibility.md`](docs/compatibility.md), and [`docs/verification-report.md`](docs/verification-report.md).

Useful queries:

```promql
# Turn throughput
sum(rate(dsh_agent_turns_total[5m]))

# Turn failure ratio
sum(rate(dsh_agent_turns_total{status=~"error|blocked|aborted"}[5m]))
/
clamp_min(sum(rate(dsh_agent_turns_total[5m])), 0.000001)

# P95 LLM latency by provider/model
histogram_quantile(0.95,
  sum by (le, provider, model) (rate(dsh_llm_request_duration_seconds_bucket[5m])))

# Tool errors by tool
sum by (tool) (rate(dsh_tool_calls_total{status!="success"}[5m]))
```

See [examples/prometheus/alerts.yml](examples/prometheus/alerts.yml) for starter alerts. Tune thresholds to the workload; quiet agent processes legitimately have zero throughput.

## Privacy and cardinality

The collector never exports prompts, user/assistant messages, system prompts, tool arguments or results, error text, file paths, working directories, arbitrary metadata, or session/agent/call/job/subagent ids.

Only four runtime-controlled label keys exist: `provider`, `model`, `tool`, and job `kind`. Values must match `[A-Za-z0-9][A-Za-z0-9_.:/-]*`, remain within the configured length, and fit the per-key vocabulary cap. Rejected or excess values become `__other__`; the event is counted by `dsh_metrics_label_overflow_total` without logging the original value.

Provider/model/tool/kind names are still operational metadata. Do not put customer identifiers or secrets in those names.

## Lifecycle behavior

All listeners, job observers, routes, sockets, and registries belong to the plugin's Cordis fiber. On hot reload or uninstall, the route is removed or the standalone server is closed and remaining sockets are destroyed. The registry is instance-local, so reload does not collide with process-global collectors.

Existing live sessions and jobs seed gauges only. Historical events are not replayed into counters. Counter resets across process restart/hot reload are normal Prometheus behavior.

## Upgrade, downgrade, remove

```sh
# Upgrade after obtaining a newer tarball/version
dsh plugin --profile monitoring add ./dsh-prometheus-NEW.tgz
dsh --profile monitoring --dump-config

# Remove the dependency and bundle layer
dsh plugin --profile monitoring remove dsh-prometheus
```

Before a downgrade, compare metric and config contracts in [CHANGELOG.md](CHANGELOG.md). Removing the plugin does not delete data already stored by Prometheus.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:coverage
pnpm pack
```

The suite covers config/cardinality, privacy, LLM/tool waterfalls, endpoint methods, remote-exposure gates, WebServer route teardown, standalone socket teardown, job/subagent lifecycles, and a real rc.6 AgentLoop turn. See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/architecture.md](docs/architecture.md), and [docs/release-checklist.md](docs/release-checklist.md).

## Troubleshooting and limitations

See [docs/troubleshooting.md](docs/troubleshooting.md) and [docs/known-limitations.md](docs/known-limitations.md).

## License

MIT
