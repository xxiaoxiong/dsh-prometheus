# DeepSeek Harness community showcase draft

## What

`dsh-prometheus` is an out-of-tree DeepSeek Harness plugin that turns public runtime events into native Prometheus metrics and ships a provisioned Grafana overview dashboard.

## Why

DSH's official session telemetry is aimed at detailed OTLP event export. This plugin serves a different boundary: aggregate, scrape-based operational metrics suitable for alerting and capacity dashboards, without exporting conversation bodies.

## Architecture

The plugin observes the official public Session, Agent, LLM, Tool, Approval, Subagent, and Job seams, writes to an isolated `prom-client` registry, and exposes `/metrics` through the public web-server seam when safe or a lifecycle-managed loopback server otherwise. It does not modify Agent Loop or Harness source, read persistence files, monkey-patch runtime objects, or import private paths.

## Installation

```sh
dsh plugin --profile web add dsh-prometheus
dsh --profile web --dump-config
```

Until publication, install the locally produced `.tgz` in place of the package name. The endpoint defaults to `http://127.0.0.1:9464/metrics`; the repository includes a Prometheus/Grafana Compose example.

## Dashboard

The overview covers active sessions, turn and step rates, LLM rate/latency/tokens, tool success and errors, approvals, agent errors, subagents, and jobs. A screenshot can be added after the public repository has stable branding and URLs.

## Tested version and security model

The disposable-profile E2E was run on Windows/Node `24.18.0` against DSH npm `0.1.0-rc.6`. IDs, prompts, responses, tool payloads, paths, credentials, free-form errors, and stacks are not metrics or labels. Dynamic labels are sanitized and vocabulary-bounded; remote binding is explicit opt-in.

## Known limitations

DSH is a Developer Preview, Linux CI has not yet run in a hosted repository, metrics are process-local, and the endpoint does not implement authentication/TLS. Later DSH release candidates require explicit revalidation.

## Repository and npm

- Repository: not created yet
- npm: not published yet

Feedback is requested on metric naming, useful low-cardinality aggregations, public seam stability, and dashboard/alert defaults.
