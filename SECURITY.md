# Security policy

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Until a public repository and private reporting channel exist, share the report directly with the package maintainer through the distribution channel from which you received this source. Include affected version, reproduction, impact, and a suggested mitigation when possible.

No public security contact is claimed in this release-preparation tree because no public repository has been created yet. Add a verified private-reporting address before publication.

## Exposure model

The default standalone endpoint binds only `127.0.0.1`. Binding `0.0.0.0` requires both `host: 0.0.0.0` and `allowRemote: true`. `auto` does not attach to a remote-facing DSH WebServer unless `allowRemote` is true.

The endpoint has no built-in authentication or TLS. For remote scraping, use an authenticated reverse proxy, mutual TLS, a service mesh, or a network policy. Never expose the endpoint directly to the public internet.

## Data policy

The collector exports operational counts, durations, token counts, and bounded identifier-like labels. It never exports prompts, messages, tool arguments/results, error text, system prompts, paths, session/agent/call/job/run ids, or arbitrary metadata. Provider, model, tool, and job-kind names are still deployment metadata; operators should review whether those names are acceptable in their monitoring system.

If a metric output contains any forbidden data, treat that as a security bug.
