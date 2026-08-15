# Architecture

## Purpose

`dsh-prometheus` is an out-of-tree Cordis plugin. It turns public DeepSeek Harness lifecycle facts into bounded Prometheus metrics. It does not replace Harness telemetry, persist session data, modify upstream, or import private source paths.

## Composition

The package has four internal layers:

1. `HarnessMetrics` owns one private `prom-client` registry and all metric instruments.
2. `CardinalityGuard` accepts only short identifier-like dynamic labels, caps distinct values per label key, and maps rejected or excess values to `__other__`.
3. The Cordis plugin subscribes to public session, agent, LLM, tool, subagent, approval, and jobs seams. All registrations are effects owned by the plugin fiber.
4. The endpoint adapter exposes the private registry. `auto` prefers `ctx.webServer.register()` when a loopback WebServer is already active; otherwise it opens a standalone Node HTTP server on `127.0.0.1:9464` by default.

No session id, agent id, turn id, step id, call id, job id, prompt, message, tool arguments, tool result, file path, working directory, system prompt, error text, provider request id, or arbitrary metadata becomes a metric label or sample value.

## Public upstream seams

| Concern | Public seam | Observation rule |
|---|---|---|
| Sessions and durable turn/step facts | `session/created`, `session/disposed`, `session/event` | Seed only the live-session gauge; never replay historical event logs into counters. |
| Operational agent faults | `agent/error` | Increment one unlabeled counter; never inspect or stringify the error. |
| LLM attempts, finish state, usage, duration | `llm/stream` waterfall | Call `next()` exactly once, pass chunks through unchanged, inspect only provider/model/purpose plus usage/finish chunks. |
| Tool attempts, status, duration | `tools/execute` waterfall | Call `next()` exactly once, inspect only tool name and normalized `isError`; never inspect arguments/content/value/error. |
| Approvals | durable `approval/asked` and `approval/decided` session events | Count fixed outcomes; do not use tool name as a label. |
| Subagents | `subagent/start`, `subagent/end` | Use guarded provider and fixed stop reason only. |
| Background jobs | `ctx.jobs.list`, `onJobsChanged`, `onJobDone` | Track opaque ids only in process memory for reconciliation; expose guarded kind and fixed terminal status only. |
| HTTP exposure | `ctx.webServer.register` or Node `http` | GET/HEAD only, no-store, Prometheus content type, deterministic teardown. |

## Lifecycle and reload

The metrics registry is instance-local, so hot reload never collides with process-global Prometheus collectors. Existing live sessions and jobs seed gauges only. Counters represent events observed since the current plugin instance activated. Turn and step duration maps are cleared at their terminal event, session disposal, and plugin disposal.

The Web route disposer unregisters the route. The standalone disposer stops accepting connections, closes idle/active HTTP connections, destroys remaining sockets, and awaits `server.close()`. Event listeners and job observers are registered through Cordis effects and unwind with the same fiber.

`auto` makes its transport decision once at activation. It does not migrate an existing standalone endpoint if a WebServer is mounted later. The standard DSH external-bundle order mounts profile layers before this patch, so a Web profile normally selects the route adapter.

## Failure containment

Metric update failures are contained and reported with a fixed log message that cannot contain observed payload data. Waterfall wrappers still delegate and preserve the original return, thrown error, cancellation, and stream chunks. Scrape failures return a generic HTTP 500 body and do not affect agent execution.

## Network boundary

Remote exposure is a two-part opt-in: configure `host: 0.0.0.0` (or use a WebServer already bound that way) and set `allowRemote: true`. Without both, an explicit remote configuration fails closed; `auto` falls back to its loopback standalone server when the available WebServer is remote-facing.

The endpoint intentionally has no built-in authentication. Production remote access should terminate at an authenticated reverse proxy or a network policy. Loopback scraping is the default.
