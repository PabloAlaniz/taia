import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetAgentSessions = vi.fn()
const mockReadTranscript = vi.fn()

// Capture the handlers passed to client.on() so tests can simulate push events.
const handlers: Record<string, Array<(payload: unknown) => void>> = { agent: [], chat: [] }
const mockClientOn = vi.fn((event: string, handler: (payload: unknown) => void) => {
  if (!handlers[event]) handlers[event] = []
  handlers[event].push(handler)
  return () => {
    handlers[event] = handlers[event].filter((h) => h !== handler)
  }
})

vi.mock('@taia/core/agent-runtime', () => ({
  getAgentSessions: (...args: unknown[]) => mockGetAgentSessions(...args),
  readTranscript: (...args: unknown[]) => mockReadTranscript(...args),
}))

vi.mock('@taia/core/runtime', () => ({
  getRuntimeAdapterForAgent: vi.fn(() =>
    Promise.resolve({
      id: 'openclaw',
      capabilities: { has: () => true, list: () => [] },
      on: mockClientOn,
    }),
  ),
}))

import { GET } from '@/app/api/agents/[agentId]/stream/route'

function makeParams(agentId: string) {
  return { params: Promise.resolve({ agentId }) }
}

function makeReq(agentId: string, abort?: AbortController) {
  return new NextRequest(`http://localhost/api/agents/${agentId}/stream`, {
    signal: abort?.signal,
  })
}

async function readSseChunks(body: ReadableStream<Uint8Array>, expected = 3): Promise<string[]> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  for (let i = 0; i < expected; i++) {
    const { value, done } = await reader.read()
    if (done) break
    chunks.push(decoder.decode(value))
  }
  reader.cancel()
  return chunks
}

beforeEach(() => {
  vi.clearAllMocks()
  handlers.agent = []
  handlers.chat = []
})

describe('GET /api/agents/[agentId]/stream', () => {
  it('returns 404 when the agent has no sessions', async () => {
    mockGetAgentSessions.mockResolvedValue([])
    const res = await GET(makeReq('agent-1'), makeParams('agent-1'))
    expect(res.status).toBe(404)
  })

  it('returns a text/event-stream with cache disabled', async () => {
    mockGetAgentSessions.mockResolvedValue([
      { key: 'sess-1', sessionId: 'sid-1', updatedAt: 100, model: 'claude-opus-4-7' },
    ])
    mockReadTranscript.mockResolvedValue([])

    const abort = new AbortController()
    const res = await GET(makeReq('agent-1', abort), makeParams('agent-1'))

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    abort.abort()
  })

  it('emits connected + history_end even when the transcript is empty', async () => {
    mockGetAgentSessions.mockResolvedValue([
      { key: 'sess-1', sessionId: 'sid-1', updatedAt: 100, model: 'claude-opus-4-7' },
    ])
    mockReadTranscript.mockResolvedValue([])

    const abort = new AbortController()
    const res = await GET(makeReq('agent-1', abort), makeParams('agent-1'))

    const chunks = await readSseChunks(res.body!, 2)
    const joined = chunks.join('')
    expect(joined).toContain('"type":"connected"')
    expect(joined).toContain('"sessionKey":"sess-1"')
    expect(joined).toContain('"type":"history_end"')
    abort.abort()
  })

  it('picks the most recently updated session when multiple exist', async () => {
    mockGetAgentSessions.mockResolvedValue([
      { key: 'old', sessionId: 'old-id', updatedAt: 100 },
      { key: 'new', sessionId: 'new-id', updatedAt: 500 },
      { key: 'mid', sessionId: 'mid-id', updatedAt: 200 },
    ])
    mockReadTranscript.mockResolvedValue([])

    const abort = new AbortController()
    const res = await GET(makeReq('agent-1', abort), makeParams('agent-1'))

    const [first] = await readSseChunks(res.body!, 1)
    expect(first).toContain('"sessionKey":"new"')
    abort.abort()
  })

  it('subscribes to both agent and chat events on the client', async () => {
    mockGetAgentSessions.mockResolvedValue([{ key: 'sess-1', sessionId: 'sid-1', updatedAt: 100 }])
    mockReadTranscript.mockResolvedValue([])

    const abort = new AbortController()
    const res = await GET(makeReq('agent-1', abort), makeParams('agent-1'))
    await readSseChunks(res.body!, 2) // wait until init finishes

    const subscribedEvents = mockClientOn.mock.calls.map((c: any[]) => c[0])
    expect(subscribedEvents).toContain('agent')
    expect(subscribedEvents).toContain('chat')
    abort.abort()
  })

  it('forwards chat deltas only when sessionKey matches the active session', async () => {
    mockGetAgentSessions.mockResolvedValue([{ key: 'sess-1', sessionId: 'sid-1', updatedAt: 100 }])
    mockReadTranscript.mockResolvedValue([])

    const abort = new AbortController()
    const res = await GET(makeReq('agent-1', abort), makeParams('agent-1'))
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    // Flush the initial connected + history_end frames.
    await reader.read()
    await reader.read()

    // Emit a mismatched chat event — should be dropped.
    handlers.chat[0]({ sessionKey: 'other-session', state: 'delta' })

    // Emit a matching one — should be forwarded.
    handlers.chat[0]({
      sessionKey: 'sess-1',
      state: 'delta',
      runId: 'r1',
      message: { content: 'hi' },
    })

    const { value } = await reader.read()
    const text = decoder.decode(value)
    expect(text).toContain('"type":"chat_delta"')
    expect(text).toContain('"runId":"r1"')
    reader.cancel()
    abort.abort()
  })

  it('forwards agent events for the matching agentId only', async () => {
    mockGetAgentSessions.mockResolvedValue([{ key: 'sess-1', sessionId: 'sid-1', updatedAt: 100 }])
    mockReadTranscript.mockResolvedValue([])

    const abort = new AbortController()
    const res = await GET(makeReq('agent-1', abort), makeParams('agent-1'))
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    await reader.read()
    await reader.read()

    // Mismatched agent — dropped.
    handlers.agent[0]({ agentId: 'other-agent', stream: 'assistant' })
    // Matching — forwarded.
    handlers.agent[0]({ agentId: 'agent-1', stream: 'assistant', data: { delta: 'tok' } })

    const { value } = await reader.read()
    const text = decoder.decode(value)
    expect(text).toContain('"type":"agent_event"')
    expect(text).toContain('"agentId":"agent-1"')
    reader.cancel()
    abort.abort()
  })
})
