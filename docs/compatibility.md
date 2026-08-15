# Compatibility

The project targets the exact public APIs verified below. DeepSeek Harness is a Developer Preview, so compatibility with later release candidates is not implied.

| DSH | Node | OS | Status | Evidence |
| --- | --- | --- | --- | --- |
| `0.1.0-rc.6` | `24.18.0` | Windows 11 / PowerShell | Verified | Unit/integration/composition suite, packed-plugin install, real DSH start and scrape, uninstall |
| `0.1.0-rc.6` | `22.19.x` | Linux (GitHub Actions) | Not verified locally | CI is configured; no hosted run exists before repository publication |
| `0.1.0-rc.6` | `24.x` | Linux (GitHub Actions) | Not verified locally | CI is configured; no hosted run exists before repository publication |

Research was performed against upstream `deepseek-ai/deepseek-harness` commit `47f943859bef60e4160492346772ded9b24f765a` (2026-08-13). That checkout reported source release-candidate metadata one revision behind the npm packages used for executable verification; therefore the plugin pins all DSH peer APIs to npm `0.1.0-rc.6` and records the distinction in the ecosystem report.

The package engine range is `^22.19.0 || >=24.0.0`, matching the current DSH runtime requirement. The package manager used for verification is pnpm `11.19.0`.

Before claiming support for another DSH release, run the complete suite, disposable-profile install/start/scrape/remove flow, and review every imported public type or service. See [known limitations](known-limitations.md) and the [release checklist](release-checklist.md).
