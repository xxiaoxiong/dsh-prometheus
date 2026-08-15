# Security policy

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Use [GitHub Private Vulnerability Reporting](https://github.com/xxiaoxiong/dsh-prometheus/security/advisories/new). Include the affected version, reproduction, impact, and a suggested mitigation when possible. Do not include production credentials or session content.

Private Vulnerability Reporting is enabled for the public repository and is the maintained private reporting channel for this project.

## Exposure model

The default standalone endpoint binds only `127.0.0.1`. Binding `0.0.0.0` requires both `host: 0.0.0.0` and `allowRemote: true`. `auto` does not attach to a remote-facing DSH WebServer unless `allowRemote` is true.

The endpoint has no built-in authentication or TLS. For remote scraping, use an authenticated reverse proxy, mutual TLS, a service mesh, or a network policy. Never expose the endpoint directly to the public internet.

## Data policy

The collector exports operational counts, durations, token counts, and bounded identifier-like labels. It never exports prompts, messages, tool arguments/results, error text, system prompts, paths, session/agent/call/job/run ids, or arbitrary metadata. Provider, model, tool, and job-kind names are still deployment metadata; operators should review whether those names are acceptable in their monitoring system.

If a metric output contains any forbidden data, treat that as a security bug.
