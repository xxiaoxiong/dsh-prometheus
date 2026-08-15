# Known limitations

- DeepSeek Harness is in developer preview. This version is tested against npm `0.1.0-rc.6`; every upstream release needs a compatibility pass.
- Counters and histograms are process-local and reset on process restart or plugin hot reload. Prometheus is responsible for durable time-series storage.
- Existing sessions and jobs seed active gauges only. Historical turns, requests, tokens, and completed jobs are intentionally not replayed into counters.
- A hot reload that occurs during an in-flight turn, step, or subagent run cannot reconstruct its start timestamp, so the terminal counter is recorded but that duration sample is skipped.
- `auto` chooses its endpoint adapter once at activation. If WebServer mounts later, the running standalone endpoint does not migrate until the plugin reloads.
- Provider, model, tool, and job-kind labels are bounded but still disclose those identifier names to Prometheus. They should not contain customer or secret data.
- The endpoint does not implement authentication, TLS, rate limiting, or multi-tenant authorization. Use network controls or a reverse proxy for remote scraping.
- The package does not estimate monetary cost because pricing is provider-, model-, region-, cache-, and date-dependent.
- Multi-process DSH deployments expose one registry per process. Prometheus aggregation must happen in queries or recording rules.
- Metrics cover public rc.6 seams only. A future upstream event may require a new metric or compatibility mapping.
