import { describe, expect, it, vi } from 'vitest'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ToolDispatchExecution, ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import type { JobSnapshot } from '@deepseek-ai/dsh-jobs'
import type { SubagentRunEndInfo, SubagentRunInfo } from '@deepseek-ai/dsh-subagent'
import { HarnessMetrics } from '../src/metrics.js'

const SECRET_PROMPT = 'PROMPT_SHOULD_NEVER_APPEAR'
const SECRET_PATH = 'C:/private/customer-alpha/secrets.txt'

function collector(maxLabelValues = 64): HarnessMetrics {
  return new HarnessMetrics({ maxLabelValues, maxLabelValueLength: 80 }, () => {})
}

function fakeSession(): Session {
  return { id: 'session-private-id' } as unknown as Session
}

function event(value: unknown): SessionEvent {
  return value as SessionEvent
}

async function scrape(metrics: HarnessMetrics): Promise<string> {
  return metrics.registry.metrics()
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

describe('HarnessMetrics', () => {
  it('tracks session, turn, step, approval, and agent error facts without exporting payload data', async () => {
    const metrics = collector()
    const session = fakeSession()
    metrics.seedSessions(2)
    metrics.sessionCreated()
    metrics.sessionEvent(session, event({ type: 'turn/start', seq: 0, time: 1_000, data: { turn: 91 } }))
    metrics.sessionEvent(session, event({ type: 'step/start', seq: 1, time: 1_100, data: { turn: 91, step: 7 } }))
    metrics.sessionEvent(session, event({ type: 'approval/asked', seq: 2, time: 1_200, data: {
      id: 'approval-private-id', toolName: SECRET_PATH, reason: SECRET_PROMPT,
    } }))
    metrics.sessionEvent(session, event({ type: 'approval/decided', seq: 3, time: 1_300, data: {
      id: 'approval-private-id', outcome: 'rejected',
    } }))
    metrics.sessionEvent(session, event({ type: 'step/end', seq: 4, time: 1_600, data: { turn: 91, step: 7 } }))
    metrics.sessionEvent(session, event({ type: 'turn/end', seq: 5, time: 2_000, data: {
      turn: 91, reason: { kind: 'completed' },
    } }))
    metrics.agentError()
    metrics.sessionDisposed(session)

    const body = await scrape(metrics)
    expect(body).toContain('dsh_sessions_active 2')
    expect(body).toContain('dsh_agent_turns_total{status="completed"} 1')
    expect(body).toContain('dsh_agent_steps_total 1')
    expect(body).toContain('dsh_agent_errors_total 1')
    expect(body).toContain('dsh_approval_requests_total 1')
    expect(body).toContain('dsh_approval_denied_total 1')
    expect(body).not.toContain(SECRET_PROMPT)
    expect(body).not.toContain(SECRET_PATH)
    expect(body).not.toContain('session-private-id')
    expect(body).not.toContain('approval-private-id')
  })

  it('delegates an LLM stream exactly once, preserves chunks, and records only bounded metadata', async () => {
    const metrics = collector()
    const chunks: StreamChunk[] = [
      { type: 'text-delta', index: 0, text: SECRET_PROMPT },
      { type: 'usage', usage: {
        inputTokens: 12,
        outputTokens: 5,
        reasoningTokens: 2,
        cacheReadTokens: 3,
        cacheWriteTokens: 4,
      } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
    const next = vi.fn(() => (async function* () { yield* chunks })())
    const options = {
      provider: 'deepseek',
      model: 'deepseek-chat',
      sessionId: 'private-session',
      messages: [{ role: 'user', content: [{ type: 'text', text: SECRET_PROMPT }] }],
      system: SECRET_PATH,
    } as unknown as GenerateOptions

    expect(await collect(metrics.llmStream(options, next))).toEqual(chunks)
    expect(next).toHaveBeenCalledTimes(1)
    const body = await scrape(metrics)
    expect(body).toContain('dsh_llm_requests_total{provider="deepseek",model="deepseek-chat",purpose="agent",status="stop"} 1')
    expect(body).toContain('dsh_llm_input_tokens_total{provider="deepseek",model="deepseek-chat"} 12')
    expect(body).toContain('dsh_llm_cache_write_tokens_total{provider="deepseek",model="deepseek-chat"} 4')
    expect(body).not.toContain(SECRET_PROMPT)
    expect(body).not.toContain(SECRET_PATH)
    expect(body).not.toContain('private-session')
  })

  it('distinguishes thrown and consumer-cancelled LLM streams while preserving failures', async () => {
    const metrics = collector()
    const options = { provider: 'p', model: 'm', messages: [] } as unknown as GenerateOptions
    const failure = new Error(SECRET_PROMPT)
    const throwing = metrics.llmStream(options, () => ({
      [Symbol.asyncIterator]() {
        return { next: async (): Promise<IteratorResult<StreamChunk>> => Promise.reject(failure) }
      },
    }))
    await expect(collect(throwing)).rejects.toBe(failure)

    const cancelled = metrics.llmStream(options, () => (async function* () {
      yield { type: 'text-delta', index: 0, text: SECRET_PATH } as StreamChunk
      yield { type: 'finish', reason: { kind: 'stop' } } as StreamChunk
    })())
    for await (const _chunk of cancelled) break

    const body = await scrape(metrics)
    expect(body).toContain('status="thrown"')
    expect(body).toContain('status="consumer-cancelled"')
    expect(body).not.toContain(SECRET_PROMPT)
    expect(body).not.toContain(SECRET_PATH)
  })

  it('wraps tool dispatch exactly once and never exports arguments, results, or error text', async () => {
    const metrics = collector()
    const execution = {
      name: 'read_file',
      arguments: { path: SECRET_PATH, prompt: SECRET_PROMPT },
    } as unknown as ToolDispatchExecution
    const result = {
      isError: true,
      error: { name: 'PrivateError', code: 'PRIVATE', message: SECRET_PROMPT },
      content: [{ type: 'text', text: SECRET_PATH }],
    } as unknown as ToolExecutionResult
    const next = vi.fn(async () => result)

    await expect(metrics.toolExecution(execution, next)).resolves.toBe(result)
    expect(next).toHaveBeenCalledTimes(1)
    const body = await scrape(metrics)
    expect(body).toContain('dsh_tool_calls_total{tool="read_file",status="error"} 1')
    expect(body).not.toContain(SECRET_PROMPT)
    expect(body).not.toContain(SECRET_PATH)
    expect(body).not.toContain('PrivateError')
  })

  it('bounds dynamic series and maps invalid labels to __other__', async () => {
    const metrics = collector(1)
    const result = { isError: false, value: null, content: [] } as unknown as ToolExecutionResult
    for (const name of ['safe_tool', 'second_tool', SECRET_PROMPT]) {
      await metrics.toolExecution({ name } as unknown as ToolDispatchExecution, async () => result)
    }

    const body = await scrape(metrics)
    expect(body).toContain('tool="safe_tool"')
    expect(body).toContain('tool="__other__"')
    expect(body).toContain('dsh_metrics_label_overflow_total{label="tool"} 2')
    expect(body).not.toContain('second_tool')
    expect(body).not.toContain(SECRET_PROMPT)
  })

  it('tracks subagent and job lifecycles without exporting their ids or labels', async () => {
    const metrics = collector()
    const start = {
      runId: 'private-run-id', provider: 'in-process', id: 'private-child-id', local: true,
    } as unknown as SubagentRunInfo
    const end = {
      ...start, stopReason: 'error', lastAssistantMessage: [{ type: 'text', text: SECRET_PROMPT }],
    } as unknown as SubagentRunEndInfo
    metrics.subagentStarted(start)
    metrics.subagentEnded(end)

    const running = {
      id: 'bash-private-id', kind: 'bash', label: SECRET_PATH, status: 'running', startedAt: 1_000,
    } as unknown as JobSnapshot
    const done = { ...running, status: 'completed', finishedAt: 3_000, detail: SECRET_PROMPT } as unknown as JobSnapshot
    metrics.seedJobs([running])
    metrics.reconcileJobs([done], undefined)
    metrics.jobDone(done)

    const body = await scrape(metrics)
    expect(body).toContain('dsh_subagents_started_total{provider="in-process"} 1')
    expect(body).toContain('dsh_subagents_failed_total{provider="in-process",status="error"} 1')
    expect(body).toContain('dsh_jobs_active{kind="bash"} 0')
    expect(body).toContain('dsh_jobs_completed_total{kind="bash"} 1')
    expect(body).not.toContain('private-run-id')
    expect(body).not.toContain('private-child-id')
    expect(body).not.toContain('bash-private-id')
    expect(body).not.toContain(SECRET_PROMPT)
    expect(body).not.toContain(SECRET_PATH)
  })

  it('clears the private registry on disposal', async () => {
    const metrics = collector()
    expect(await scrape(metrics)).toContain('dsh_process_start_time_seconds')
    metrics.dispose()
    expect((await scrape(metrics)).trim()).toBe('')
  })
})
