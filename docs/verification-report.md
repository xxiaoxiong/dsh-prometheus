# Verification report

Date: 2026-08-15 (Asia/Shanghai)  
Environment: Windows, Node `24.18.0`, pnpm `11.19.0`, DSH npm `0.1.0-rc.6`

## Automated verification

| Command | Exit | Result |
| --- | ---: | --- |
| `pnpm run typecheck` | 0 | Production and test TypeScript projects passed strict checking |
| `pnpm run lint` | 0 | oxlint passed |
| `pnpm run test` | 0 | 6 files, 22 tests passed |
| `pnpm run test:coverage` | 0 after thresholds were calibrated | 86.93% statements, 73.45% branches, 89.47% functions, 90.68% lines on the recorded run |
| `pnpm run build` | 0 | ESM JavaScript and declarations emitted |
| `pnpm run check:pack` | 0 | Manifest, bundle patch, built entrypoint, docs, examples, and dashboard consistency passed |
| `docker compose -f examples/docker-compose.yml config --quiet` | 0 | Compose configuration valid |
| `promtool check config /etc/prometheus/prometheus.yml` | 0 | Configuration valid; one rule file loaded |
| `promtool check rules /etc/prometheus/alerts.yml` | 0 | Six rules valid |

The final clean install/gate rerun should replace the coverage figures above if they differ; this file is release evidence, not a promise that unexecuted platforms passed.

## Packed-plugin E2E

Runtime-E2E artifact used: `dsh-prometheus-0.1.0.tgz` (built before documentation-only asset-path/report refinements)  
Packed size: 25,895 bytes; unpacked size: 94,233 bytes; 30 files  
SHA-1 reported by the packer: `38792f88b998213c606cb39b389dd52f056ab401`

1. Set a disposable `DSH_HOME` and ran `dsh plugin --profile e2e add <artifact>`: exit 0.
2. Ran `dsh --profile e2e --dump-config`: exit 0; output contained `# == dsh-prometheus` and `id: prometheus` / `name: dsh-prometheus`.
3. Started the real DSH executable with that profile and scraped `http://127.0.0.1:9464/metrics`: HTTP 200, Prometheus `text/plain; version=0.0.4`, 4,994 bytes, 32 metric families.
4. Checked the exposition against seeded prompt/credential/path/tool-payload fixture strings: none were present.
5. Started Prometheus `3.7.3`; query `dsh_process_start_time_seconds` returned one ingested series and `up{job="deepseek-harness"}` returned 1 during collection.
6. Started Grafana `12.3.1`; `/api/health` reported database `ok`; provisioning API reported datasource `Prometheus` (uid `prometheus`) and dashboard `DeepSeek Harness / Overview` (uid `dsh-prometheus-overview`) in folder `DeepSeek Harness`.
7. Ran `dsh plugin --profile e2e remove dsh-prometheus`: exit 0 after using the same pnpm user-store context as installation. A subsequent dump contained no plugin block. This changes the on-disk profile; it is not a hot-unload claim for an already-running DSH process.
8. Started that plugin-free profile again. It remained live for the 30-second smoke window while `127.0.0.1:9464/metrics` stayed closed; the four precisely identified temporary process-tree PIDs were then stopped.
9. Identified the original real-scrape DSH process by its exact `dsh ... --profile e2e` command line, stopped it, and removed the remaining temporary DSH homes and pre-final tarball directories.
10. Stopped the Compose stack and removed only its two temporary named volumes. No public service or production data was touched.

Listener teardown is additionally covered by standalone endpoint disposal tests and the real composition test's unmount/restart assertions. No claim is made that a package can be hot-removed from a running process by the CLI.

After the documentation/asset refinements, the final packaging candidate was packed with the required `grafana/dsh-overview.json` and `examples/prometheus.yml` paths. The pinned official CLI successfully installed it into a second fresh profile, and `--dump-config` contained both the bundle header and plugin row; removal then deleted that layer. Runtime files were unchanged from the artifact used for the real scrape.

## Grafana/dashboard consistency

The artifact test parses `grafana/dsh-overview.json`, walks every PromQL expression, and requires every referenced `dsh_*` metric to exist in the implemented metric catalog. The checked dashboard has 16 panels and the required overview signals.

## Not verified

- Hosted Linux CI on Node 22.19 and 24 (workflow prepared, repository not created).
- macOS.
- DSH versions other than npm `0.1.0-rc.6`.
- Authentication/TLS at `/metrics` (intentionally delegated to the deployment boundary).
- Public npm installation or public GitHub URLs (publication was not authorized).
