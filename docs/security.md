# Security and privacy model

`dsh-prometheus` is designed for operational metrics, not traces or session telemetry. It consumes only documented public DSH/Cordis services and events and owns a private `prom-client` registry.

## Collection boundary

The plugin records counts, durations, token totals, active-resource gauges, and a small set of bounded classifications. It does **not** collect or export prompts, responses, message bodies, tool arguments or results, approval details, session/request/turn/step identifiers, user identifiers, paths, environment variables, credentials, error messages, or stack traces.

Correlation identifiers may be used transiently in process memory to pair public start/end events. They are never labels and never appear in exposition output.

## Label policy

Allowed dynamic labels are limited to provider, model, tool, job kind, and subagent provider. Status, result, reason, and purpose values are selected by plugin code from finite vocabularies. Dynamic labels must match a conservative character pattern, have a configured maximum length, and share a per-label vocabulary budget. Rejected or excess values become `__other__`; `dsh_metric_label_overflow_total` makes that loss visible without exposing the rejected value.

Never add IDs, free-form errors, paths, payload fields, or other attacker-controlled strings as labels. A new label requires a privacy and cardinality review plus a secret-fixture test.

## Endpoint policy

The standalone server defaults to `127.0.0.1:9464`. Binding to a non-loopback address requires the explicit `allowRemote: true` acknowledgement. The response sets `Cache-Control: no-store`; only `GET` and `HEAD` are accepted. The endpoint has no built-in authentication or TLS, so remote deployments must use host firewalling, a private network, or an authenticated reverse proxy.

In `auto` mode, an available public DSH web-server route is preferred only when its exposure policy is safe. Otherwise the plugin falls back to the loopback listener or fails closed for an explicitly unsafe configuration.

## Threat model

The main risks are accidental payload disclosure, label-cardinality exhaustion, unintended network exposure, stale listeners after unload, and metric corruption caused by observer failure. Payload fields are never read for metric labels, cardinality is bounded, remote binding is opt-in, every route/listener/server is registered through Cordis lifecycle effects, and observer errors are contained so they do not alter agent execution.

Prometheus and Grafana remain separate systems with their own access-control, retention, and backup requirements. Operators should treat metric names and aggregate usage volumes as operationally sensitive.

Report suspected vulnerabilities using the private channel documented in [the repository security policy](../SECURITY.md). Do not include secrets or production session content in reports.
