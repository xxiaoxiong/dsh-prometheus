# Troubleshooting

## The endpoint is not listening

Run `dsh --profile <name> --dump-config` and confirm the `prometheus` row exists and is enabled. In a minimal custom composition, the plugin remains PENDING until `sessions`, `agents`, `llm`, `tools`, `subagents`, and `jobs` are all present. This is deliberate: missing observations are not silently ignored.

For standalone mode, check whether another process owns the port. Use `port: 0` only for tests because the selected port is reported only in the runtime log.

## A Web profile uses a standalone endpoint

`auto` selects the WebServer only when it is already active and either loopback-bound or explicitly allowed with `allowRemote: true`. Bundle layers normally load before this plugin. If a custom loader mounts WebServer later, reload this plugin or use `mode: webserver` to fail loudly until the dependency is ready.

## Prometheus reports target down from Docker

Inside Docker, `127.0.0.1` is the Prometheus container, not the host. The example uses `host.docker.internal:9464` and a Linux `host-gateway` mapping. Confirm that DSH is running on the host and that local firewall rules permit the container-to-host connection.

## Labels collapse to `__other__`

Check `dsh_metrics_label_overflow_total{label="..."}`. A value is collapsed when it is empty, too long, contains characters outside the identifier policy, or exceeds `maxLabelValues`. Prefer fixing generated names over raising the cap.

## Counters dropped after a configuration change

Cordis hot-replaces a plugin when its config changes. The old registry is disposed and the new instance starts cleanly. Prometheus `rate()` and `increase()` handle counter resets.

## Grafana panels are empty

Verify the Prometheus datasource UID is `prometheus`, the target is up, and the dashboard time range includes recent activity. Quiet DSH processes legitimately have zero request/turn/tool rates.
