# Metric contract

All metric names are stable for the `0.1.x` line. Histograms use seconds. Counters reset when the plugin process or plugin fiber restarts.

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `dsh_process_start_time_seconds` | gauge | none | Approximate Unix start time of this Node process. |
| `dsh_sessions_active` | gauge | none | Sessions currently in the public session store. |
| `dsh_agent_turns_total` | counter | `status` | Observed turn ends by bounded Harness reason. |
| `dsh_agent_steps_total` | counter | none | Observed step ends. |
| `dsh_agent_errors_total` | counter | none | Live `agent/error` notifications. Error data is ignored. |
| `dsh_agent_turn_duration_seconds` | histogram | `status` | Wall time between observed turn start/end pairs. |
| `dsh_agent_step_duration_seconds` | histogram | none | Wall time between observed step start/end pairs. |
| `dsh_llm_requests_total` | counter | `provider`, `model`, `purpose`, `status` | Model stream attempts observed at the public waterfall. |
| `dsh_llm_request_duration_seconds` | histogram | same | Time until completion, throw, or consumer cancellation. |
| `dsh_llm_input_tokens_total` | counter | `provider`, `model` | Uncached input tokens from usage chunks. |
| `dsh_llm_output_tokens_total` | counter | `provider`, `model` | Output tokens. |
| `dsh_llm_reasoning_tokens_total` | counter | `provider`, `model` | Reasoning tokens when reported. |
| `dsh_llm_cache_read_tokens_total` | counter | `provider`, `model` | Cache-read tokens when reported. |
| `dsh_llm_cache_write_tokens_total` | counter | `provider`, `model` | Cache-write tokens when reported. |
| `dsh_tool_calls_total` | counter | `tool`, `status` | Tool dispatch attempts and normalized result status. |
| `dsh_tool_call_duration_seconds` | histogram | `tool`, `status` | Tool dispatch wall time. |
| `dsh_approval_requests_total` | counter | none | Approval questions asked. |
| `dsh_approval_allowed_total` | counter | none | `allowed-once` outcomes. |
| `dsh_approval_denied_total` | counter | none | Explicit `rejected` outcomes. |
| `dsh_approval_cancelled_total` | counter | none | Withdrawn approval questions. |
| `dsh_approval_unavailable_total` | counter | none | Fail-closed unavailable outcomes. |
| `dsh_subagents_started_total` | counter | `provider` | Published subagent runs. |
| `dsh_subagents_completed_total` | counter | `provider` | Runs ending `completed`. |
| `dsh_subagents_failed_total` | counter | `provider`, `status` | All non-completed terminal reasons. |
| `dsh_subagent_duration_seconds` | histogram | `provider`, `status` | Time between observed subagent start/end pairs. |
| `dsh_jobs_active` | gauge | `kind` | Currently running or stopping jobs. |
| `dsh_jobs_started_total` | counter | `kind` | Jobs first observed after activation. Pre-existing jobs seed only the gauge. |
| `dsh_jobs_completed_total` | counter | `kind` | Live completed-job notifications. |
| `dsh_jobs_killed_total` | counter | `kind` | Live killed-job notifications. |
| `dsh_jobs_failed_total` | counter | `kind` | Live failed-job notifications. |
| `dsh_job_duration_seconds` | histogram | `kind`, `status` | Terminal job duration from public timestamps. |
| `dsh_metrics_label_overflow_total` | counter | `label` | Dynamic label values mapped to `__other__`; `label` itself is a fixed internal vocabulary. |

Dynamic labels are limited to `provider`, `model`, `tool`, and `kind`. Their accepted values must be 1–80 characters by default and match `[A-Za-z0-9][A-Za-z0-9_.:/-]*`. Each label key accepts at most 64 distinct values per plugin instance by default. Everything else becomes `__other__`.

Fixed labels (`status`, `purpose`, and the internal overflow `label`) use closed code-owned vocabularies and do not consume the dynamic-label budget.
