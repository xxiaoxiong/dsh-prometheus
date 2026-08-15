import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const documentedMetrics = new Set([
  'dsh_process_start_time_seconds',
  'dsh_sessions_active',
  'dsh_agent_turns_total',
  'dsh_agent_steps_total',
  'dsh_agent_errors_total',
  'dsh_agent_turn_duration_seconds',
  'dsh_agent_turn_duration_seconds_bucket',
  'dsh_agent_step_duration_seconds',
  'dsh_agent_step_duration_seconds_bucket',
  'dsh_llm_requests_total',
  'dsh_llm_request_duration_seconds',
  'dsh_llm_request_duration_seconds_bucket',
  'dsh_llm_input_tokens_total',
  'dsh_llm_output_tokens_total',
  'dsh_llm_reasoning_tokens_total',
  'dsh_llm_cache_read_tokens_total',
  'dsh_llm_cache_write_tokens_total',
  'dsh_tool_calls_total',
  'dsh_tool_call_duration_seconds',
  'dsh_tool_call_duration_seconds_bucket',
  'dsh_approval_requests_total',
  'dsh_approval_allowed_total',
  'dsh_approval_denied_total',
  'dsh_approval_unavailable_total',
  'dsh_subagents_started_total',
  'dsh_jobs_active',
  'dsh_jobs_failed_total',
  'dsh_metrics_label_overflow_total',
])

describe('shipped observability artifacts', () => {
  it('keeps the Grafana dashboard valid, provisionable, and aligned with the metric contract', async () => {
    const raw = await readFile('grafana/dsh-overview.json', 'utf8')
    const dashboard = JSON.parse(raw) as {
      uid: string
      title: string
      panels: Array<{ id: number; datasource?: { uid?: string }; targets?: Array<{ expr?: string }> }>
    }
    expect(dashboard.uid).toBe('dsh-prometheus-overview')
    expect(dashboard.title).toContain('DeepSeek Harness')
    expect(dashboard.panels.length).toBeGreaterThanOrEqual(12)
    expect(new Set(dashboard.panels.map(panel => panel.id)).size).toBe(dashboard.panels.length)
    for (const panel of dashboard.panels) expect(panel.datasource?.uid).toBe('prometheus')

    const expressions = dashboard.panels.flatMap(panel => panel.targets?.map(target => target.expr ?? '') ?? [])
    const referenced = new Set(expressions.flatMap(expression => expression.match(/dsh_[a-z_]+/g) ?? []))
    expect([...referenced].filter(metric => !documentedMetrics.has(metric))).toEqual([])
  })

  it('provisions the expected local target, datasource, and dashboard path', async () => {
    const prometheus = await readFile('examples/prometheus.yml', 'utf8')
    const datasource = await readFile('examples/grafana/provisioning/datasources/prometheus.yml', 'utf8')
    const dashboards = await readFile('examples/grafana/provisioning/dashboards/dashboards.yml', 'utf8')
    expect(prometheus).toContain('host.docker.internal:9464')
    expect(prometheus).toContain('metrics_path: /metrics')
    expect(datasource).toContain('uid: prometheus')
    expect(datasource).toContain('http://prometheus:9090')
    expect(dashboards).toContain('/var/lib/grafana/dashboards')
  })
})
