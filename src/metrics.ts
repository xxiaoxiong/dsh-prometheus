import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  type CounterConfiguration,
  type GaugeConfiguration,
  type HistogramConfiguration,
} from 'prom-client'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { GenerateOptions, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { SubagentRunEndInfo, SubagentRunInfo } from '@deepseek-ai/dsh-subagent'
import type { JobSnapshot } from '@deepseek-ai/dsh-jobs'
import type {} from '@deepseek-ai/dsh-user-approval'
import { CardinalityGuard, type DynamicLabel } from './cardinality.js'

const AGENT_BUCKETS = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600]
const LLM_BUCKETS = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600]
const TOOL_BUCKETS = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300]
const BACKGROUND_BUCKETS = [0.1, 0.5, 1, 2.5, 5, 10, 30, 60, 120, 300, 600, 1_800, 3_600]

type FaultReporter = (operation: string) => void

interface JobState {
  readonly kind: string
  readonly ownerSession: string | undefined
  active: boolean
}

/** Owns one isolated Prometheus registry and every bounded DSH instrument. */
export class HarnessMetrics {
  readonly registry = new Registry()
  private readonly guard: CardinalityGuard
  private readonly turnStarts = new WeakMap<Session, Map<number, number>>()
  private readonly stepStarts = new WeakMap<Session, Map<string, number>>()
  private readonly subagentStarts = new Map<string, number>()
  private readonly jobs = new Map<string, JobState>()

  private readonly sessionsActive = this.gauge({
    name: 'dsh_sessions_active',
    help: 'Sessions currently present in the public DSH session store.',
  })
  private readonly turnsTotal = this.counter({
    name: 'dsh_agent_turns_total',
    help: 'Agent turns observed at their durable terminal boundary.',
    labelNames: ['status'] as const,
  })
  private readonly stepsTotal = this.counter({
    name: 'dsh_agent_steps_total',
    help: 'Agent steps observed at their durable terminal boundary.',
  })
  private readonly agentErrorsTotal = this.counter({
    name: 'dsh_agent_errors_total',
    help: 'Live agent error notifications; error details are never inspected.',
  })
  private readonly turnDuration = this.histogram({
    name: 'dsh_agent_turn_duration_seconds',
    help: 'Wall time between observed agent turn start and end events.',
    labelNames: ['status'] as const,
    buckets: AGENT_BUCKETS,
  })
  private readonly stepDuration = this.histogram({
    name: 'dsh_agent_step_duration_seconds',
    help: 'Wall time between observed agent step start and end events.',
    buckets: AGENT_BUCKETS,
  })
  private readonly llmRequestsTotal = this.counter({
    name: 'dsh_llm_requests_total',
    help: 'LLM stream attempts observed at the public DSH waterfall.',
    labelNames: ['provider', 'model', 'purpose', 'status'] as const,
  })
  private readonly llmDuration = this.histogram({
    name: 'dsh_llm_request_duration_seconds',
    help: 'LLM stream attempt wall time.',
    labelNames: ['provider', 'model', 'purpose', 'status'] as const,
    buckets: LLM_BUCKETS,
  })
  private readonly llmInputTokens = this.tokenCounter('input', 'Uncached input tokens reported by LLM calls.')
  private readonly llmOutputTokens = this.tokenCounter('output', 'Output tokens reported by LLM calls.')
  private readonly llmReasoningTokens = this.tokenCounter('reasoning', 'Reasoning tokens reported by LLM calls.')
  private readonly llmCacheReadTokens = this.tokenCounter('cache_read', 'Cache-read tokens reported by LLM calls.')
  private readonly llmCacheWriteTokens = this.tokenCounter('cache_write', 'Cache-write tokens reported by LLM calls.')
  private readonly toolCallsTotal = this.counter({
    name: 'dsh_tool_calls_total',
    help: 'Tool dispatch attempts observed at the public DSH waterfall.',
    labelNames: ['tool', 'status'] as const,
  })
  private readonly toolDuration = this.histogram({
    name: 'dsh_tool_call_duration_seconds',
    help: 'Tool dispatch wall time.',
    labelNames: ['tool', 'status'] as const,
    buckets: TOOL_BUCKETS,
  })
  private readonly approvalRequests = this.simpleCounter('dsh_approval_requests_total', 'Approval questions asked.')
  private readonly approvalAllowed = this.simpleCounter('dsh_approval_allowed_total', 'Approval questions allowed once.')
  private readonly approvalDenied = this.simpleCounter('dsh_approval_denied_total', 'Approval questions explicitly rejected.')
  private readonly approvalCancelled = this.simpleCounter('dsh_approval_cancelled_total', 'Approval questions cancelled.')
  private readonly approvalUnavailable = this.simpleCounter('dsh_approval_unavailable_total', 'Approval questions that failed closed as unavailable.')
  private readonly subagentsStarted = this.counter({
    name: 'dsh_subagents_started_total',
    help: 'Published subagent runs.',
    labelNames: ['provider'] as const,
  })
  private readonly subagentsCompleted = this.counter({
    name: 'dsh_subagents_completed_total',
    help: 'Subagent runs ending normally.',
    labelNames: ['provider'] as const,
  })
  private readonly subagentsFailed = this.counter({
    name: 'dsh_subagents_failed_total',
    help: 'Subagent runs ending with a non-completed status.',
    labelNames: ['provider', 'status'] as const,
  })
  private readonly subagentDuration = this.histogram({
    name: 'dsh_subagent_duration_seconds',
    help: 'Wall time between observed subagent start and end events.',
    labelNames: ['provider', 'status'] as const,
    buckets: BACKGROUND_BUCKETS,
  })
  private readonly jobsActive = this.gauge({
    name: 'dsh_jobs_active',
    help: 'Jobs currently running or stopping.',
    labelNames: ['kind'] as const,
  })
  private readonly jobsStarted = this.jobCounter('started', 'Jobs first observed after plugin activation.')
  private readonly jobsCompleted = this.jobCounter('completed', 'Jobs ending completed.')
  private readonly jobsKilled = this.jobCounter('killed', 'Jobs ending killed.')
  private readonly jobsFailed = this.jobCounter('failed', 'Jobs ending failed.')
  private readonly jobDuration = this.histogram({
    name: 'dsh_job_duration_seconds',
    help: 'Terminal job duration calculated from public job timestamps.',
    labelNames: ['kind', 'status'] as const,
    buckets: BACKGROUND_BUCKETS,
  })
  private readonly labelOverflow = this.counter({
    name: 'dsh_metrics_label_overflow_total',
    help: 'Dynamic metric labels mapped to __other__ by the cardinality guard.',
    labelNames: ['label'] as const,
  })

  constructor(
    options: { maxLabelValues: number; maxLabelValueLength: number },
    private readonly reportFault: FaultReporter,
  ) {
    this.guard = new CardinalityGuard({
      maxValues: options.maxLabelValues,
      maxValueLength: options.maxLabelValueLength,
      onOverflow: label => this.safe('label-overflow', () => { this.labelOverflow.inc({ label }) }),
    })
    this.gauge({
      name: 'dsh_process_start_time_seconds',
      help: 'Approximate Unix start time of the current Node process.',
    }).set(Date.now() / 1_000 - process.uptime())
  }

  seedSessions(count: number): void {
    this.safe('seed-sessions', () => { this.sessionsActive.set(count) })
  }

  sessionCreated(): void {
    this.safe('session-created', () => { this.sessionsActive.inc() })
  }

  sessionDisposed(session: Session): void {
    this.turnStarts.delete(session)
    this.stepStarts.delete(session)
    this.safe('session-disposed', () => { this.sessionsActive.dec() })
  }

  sessionEvent(session: Session, event: SessionEvent): void {
    this.safe('session-event', () => {
      switch (event.type) {
        case 'turn/start':
          this.mapFor(this.turnStarts, session).set(event.data.turn, event.time)
          return
        case 'turn/end': {
          const status = turnStatus(event.data.reason.kind)
          this.turnsTotal.inc({ status })
          const starts = this.turnStarts.get(session)
          const startedAt = starts?.get(event.data.turn)
          starts?.delete(event.data.turn)
          if (startedAt !== undefined) this.turnDuration.observe({ status }, elapsedSeconds(startedAt, event.time))
          return
        }
        case 'step/start':
          this.mapFor(this.stepStarts, session).set(stepKey(event.data.turn, event.data.step), event.time)
          return
        case 'step/end': {
          this.stepsTotal.inc()
          const key = stepKey(event.data.turn, event.data.step)
          const starts = this.stepStarts.get(session)
          const startedAt = starts?.get(key)
          starts?.delete(key)
          if (startedAt !== undefined) this.stepDuration.observe(elapsedSeconds(startedAt, event.time))
          return
        }
        case 'approval/asked':
          this.approvalRequests.inc()
          return
        case 'approval/decided':
          if (event.data.outcome === 'allowed-once') this.approvalAllowed.inc()
          else if (event.data.outcome === 'rejected') this.approvalDenied.inc()
          else if (event.data.outcome === 'cancelled') this.approvalCancelled.inc()
          else this.approvalUnavailable.inc()
          return
        default:
          return
      }
    })
  }

  agentError(): void {
    this.safe('agent-error', () => { this.agentErrorsTotal.inc() })
  }

  llmStream(options: GenerateOptions, next: () => AsyncIterable<StreamChunk>): AsyncIterable<StreamChunk> {
    const provider = this.dynamic('provider', options.provider)
    const model = this.dynamic('model', options.model)
    const purpose = llmPurpose(options)
    return this.instrumentLlmStream({ provider, model, purpose }, next)
  }

  async toolExecution(
    exec: ToolDispatchExecution,
    next: () => Promise<ToolExecutionResult>,
  ): Promise<ToolExecutionResult> {
    const startedAt = performance.now()
    const tool = this.dynamic('tool', exec.name)
    try {
      const result = await next()
      const status = result.isError ? 'error' : 'success'
      this.safe('tool-execute', () => {
        this.toolCallsTotal.inc({ tool, status })
        this.toolDuration.observe({ tool, status }, elapsedMonotonicSeconds(startedAt))
      })
      return result
    } catch (error: unknown) {
      this.safe('tool-execute', () => {
        this.toolCallsTotal.inc({ tool, status: 'thrown' })
        this.toolDuration.observe({ tool, status: 'thrown' }, elapsedMonotonicSeconds(startedAt))
      })
      throw error
    }
  }

  subagentStarted(info: SubagentRunInfo): void {
    this.safe('subagent-start', () => {
      const provider = this.dynamic('provider', info.provider)
      this.subagentsStarted.inc({ provider })
      this.subagentStarts.set(String(info.runId), performance.now())
    })
  }

  subagentEnded(info: SubagentRunEndInfo): void {
    this.safe('subagent-end', () => {
      const provider = this.dynamic('provider', info.provider)
      const status = subagentStatus(info.stopReason)
      if (status === 'completed') this.subagentsCompleted.inc({ provider })
      else this.subagentsFailed.inc({ provider, status })
      const startedAt = this.subagentStarts.get(String(info.runId))
      this.subagentStarts.delete(String(info.runId))
      if (startedAt !== undefined) {
        this.subagentDuration.observe({ provider, status }, elapsedMonotonicSeconds(startedAt))
      }
    })
  }

  seedJobs(snapshots: readonly JobSnapshot[]): void {
    this.safe('seed-jobs', () => {
      for (const snapshot of snapshots) this.adoptJob(snapshot, false)
    })
  }

  reconcileJobs(snapshots: readonly JobSnapshot[], ownerSession: string | undefined): void {
    this.safe('reconcile-jobs', () => {
      const visible = new Set(snapshots
        .filter(snapshot => jobOwner(snapshot) === ownerSession)
        .map(snapshot => String(snapshot.id)))
      for (const [id, state] of this.jobs) {
        if (state.ownerSession === ownerSession && !visible.has(id)) this.removeJob(id, state)
      }
      for (const snapshot of snapshots) {
        if (jobOwner(snapshot) === ownerSession) this.adoptJob(snapshot, true)
      }
    })
  }

  jobDone(snapshot: JobSnapshot): void {
    this.safe('job-done', () => {
      const kind = this.dynamic('kind', String(snapshot.kind))
      if (snapshot.status === 'completed') this.jobsCompleted.inc({ kind })
      else if (snapshot.status === 'killed') this.jobsKilled.inc({ kind })
      else if (snapshot.status === 'failed') this.jobsFailed.inc({ kind })
      if (snapshot.finishedAt !== undefined) {
        this.jobDuration.observe(
          { kind, status: jobStatus(snapshot.status) },
          elapsedSeconds(snapshot.startedAt, snapshot.finishedAt),
        )
      }
    })
  }

  dispose(): void {
    this.guard.clear()
    this.subagentStarts.clear()
    this.jobs.clear()
    this.registry.clear()
  }

  private observeUsage(labels: { provider: string; model: string }, usage: TokenUsage): void {
    this.llmInputTokens.inc(labels, nonNegative(usage.inputTokens))
    this.llmOutputTokens.inc(labels, nonNegative(usage.outputTokens))
    if (usage.reasoningTokens !== undefined) this.llmReasoningTokens.inc(labels, nonNegative(usage.reasoningTokens))
    if (usage.cacheReadTokens !== undefined) this.llmCacheReadTokens.inc(labels, nonNegative(usage.cacheReadTokens))
    if (usage.cacheWriteTokens !== undefined) this.llmCacheWriteTokens.inc(labels, nonNegative(usage.cacheWriteTokens))
  }

  private async * instrumentLlmStream(
    baseLabels: { provider: string; model: string; purpose: string },
    next: () => AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    const startedAt = performance.now()
    let status = 'incomplete'
    let usage: TokenUsage | undefined
    let finished = false
    let drained = false
    try {
      const stream = next()
      for await (const chunk of stream) {
        if (chunk.type === 'usage') usage = chunk.usage
        if (chunk.type === 'finish') {
          status = finishStatus(chunk.reason.kind)
          finished = true
        }
        yield chunk
      }
      drained = true
    } catch (error: unknown) {
      status = 'thrown'
      throw error
    } finally {
      if (!finished && status !== 'thrown') status = drained ? 'incomplete' : 'consumer-cancelled'
      const labels = { ...baseLabels, status }
      this.safe('llm-stream', () => {
        this.llmRequestsTotal.inc(labels)
        this.llmDuration.observe(labels, elapsedMonotonicSeconds(startedAt))
        if (usage !== undefined) {
          this.observeUsage({ provider: baseLabels.provider, model: baseLabels.model }, usage)
        }
      })
    }
  }

  private adoptJob(snapshot: JobSnapshot, countStart: boolean): void {
    const id = String(snapshot.id)
    const active = snapshot.status === 'running' || snapshot.status === 'stopping'
    const existing = this.jobs.get(id)
    if (existing !== undefined) {
      if (existing.active !== active) {
        this.jobsActive.inc({ kind: existing.kind }, active ? 1 : -1)
        existing.active = active
      }
      return
    }
    const kind = this.dynamic('kind', String(snapshot.kind))
    this.jobs.set(id, {
      kind,
      ownerSession: snapshot.ownerSession === undefined ? undefined : String(snapshot.ownerSession),
      active,
    })
    if (active) this.jobsActive.inc({ kind })
    if (countStart && active) this.jobsStarted.inc({ kind })
  }

  private removeJob(id: string, state: JobState): void {
    if (state.active) this.jobsActive.dec({ kind: state.kind })
    this.jobs.delete(id)
  }

  private dynamic(label: DynamicLabel, value: string): string {
    return this.guard.value(label, value)
  }

  private safe(operation: string, action: () => void): void {
    try {
      action()
    } catch {
      this.reportFault(operation)
    }
  }

  private counter<T extends string>(config: CounterConfiguration<T>): Counter<T> {
    return new Counter({ ...config, registers: [this.registry] })
  }

  private gauge<T extends string>(config: GaugeConfiguration<T>): Gauge<T> {
    return new Gauge({ ...config, registers: [this.registry] })
  }

  private histogram<T extends string>(config: HistogramConfiguration<T>): Histogram<T> {
    return new Histogram({ ...config, registers: [this.registry] })
  }

  private simpleCounter(name: string, help: string): Counter<string> {
    return this.counter({ name, help })
  }

  private tokenCounter(bucket: string, help: string): Counter<'provider' | 'model'> {
    return this.counter({
      name: `dsh_llm_${bucket}_tokens_total`,
      help,
      labelNames: ['provider', 'model'] as const,
    })
  }

  private jobCounter(outcome: string, help: string): Counter<'kind'> {
    return this.counter({
      name: `dsh_jobs_${outcome}_total`,
      help,
      labelNames: ['kind'] as const,
    })
  }

  private mapFor<K>(store: WeakMap<Session, Map<K, number>>, session: Session): Map<K, number> {
    let map = store.get(session)
    if (map === undefined) {
      map = new Map<K, number>()
      store.set(session, map)
    }
    return map
  }
}

function stepKey(turn: number, step: number): string {
  return `${turn}:${step}`
}

function elapsedSeconds(startedAt: number, finishedAt: number): number {
  return Math.max(0, finishedAt - startedAt) / 1_000
}

function elapsedMonotonicSeconds(startedAt: number): number {
  return Math.max(0, performance.now() - startedAt) / 1_000
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0
}

function turnStatus(kind: string): string {
  return ['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted'].includes(kind)
    ? kind
    : 'other'
}

function finishStatus(kind: string): string {
  return ['stop', 'tool-calls', 'max-tokens', 'aborted', 'error'].includes(kind) ? kind : 'other'
}

function subagentStatus(reason: string): string {
  return ['completed', 'aborted', 'error', 'max-tokens', 'refusal'].includes(reason) ? reason : 'other'
}

function jobStatus(status: string): string {
  return ['completed', 'killed', 'failed'].includes(status) ? status : 'other'
}

function llmPurpose(options: GenerateOptions): string {
  if (options.purpose === 'compaction') return 'compaction'
  if (options.purpose === 'session-title') return 'session-title'
  return options.sessionId === undefined ? 'other' : 'agent'
}

function jobOwner(snapshot: JobSnapshot): string | undefined {
  return snapshot.ownerSession === undefined ? undefined : String(snapshot.ownerSession)
}
