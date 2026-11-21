import { NextRequest } from 'next/server'
import { getAgentSessions, readTranscript } from '@taia/core/agent-runtime'
import { getRuntimeAdapterForAgent } from '@taia/core/runtime'
import { RuntimeCapability } from '@taia/runtime'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params

  // Find most recent session for this agent
  const sessions = await getAgentSessions(agentId)
  const latestSession = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]

  if (!latestSession) {
    return new Response(JSON.stringify({ error: 'No sessions found for agent' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'connected',
            agentId,
            sessionKey: latestSession.key,
            sessionId: latestSession.sessionId,
            model: latestSession.model,
          })}\n\n`,
        ),
      )

      const recentEntries = await readTranscript(agentId, latestSession.sessionId, 20)
      for (const entry of recentEntries) {
        const simplified = simplifyEntry(entry)
        if (simplified) {
          simplified.historical = true
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(simplified)}\n\n`))
        }
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'history_end' })}\n\n`))

      // Subscribe to runtime push events when supported. `agent` fires for
      // thinking / assistant / tool / lifecycle streams; `chat` fires for
      // token deltas with state: "delta" | "final".
      const unsubscribes: Array<() => void> = []
      try {
        const adapter = await getRuntimeAdapterForAgent(agentId)
        if (adapter.capabilities.has(RuntimeCapability.LiveEvents) && adapter.on) {
          unsubscribes.push(
            adapter.on('agent', (payload: unknown) => {
              const event = payload as Record<string, unknown>
              if (event.agentId === agentId || event.agent === agentId) {
                try {
                  controller.enqueue(
                    encoder.encode(
                      `data: ${JSON.stringify({
                        type: 'agent_event',
                        ...event,
                      })}\n\n`,
                    ),
                  )
                } catch {
                  // Controller may be closed
                }
              }
            }),
          )

          unsubscribes.push(
            adapter.on('chat', (payload: unknown) => {
              const event = payload as Record<string, unknown>
              if (event.sessionKey !== latestSession.key) return
              try {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({
                      type: 'chat_delta',
                      state: event.state,
                      message: event.message,
                      runId: event.runId,
                    })}\n\n`,
                  ),
                )
              } catch {
                // Controller may be closed
              }
            }),
          )
        }
      } catch {
        // Live events not available — the SSE stream still carries the history snapshot above.
      }

      request.signal.addEventListener('abort', () => {
        for (const unsub of unsubscribes) unsub()
        try {
          controller.close()
        } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

type StreamEntry = {
  role?: string
  content?: unknown
  timestamp?: string
  model?: string
  stopReason?: string
}
type StreamPart = {
  type?: string
  text?: string
  thinking?: string
  name?: string
  arguments?: unknown
}

function simplifyEntry(entry: StreamEntry): Record<string, unknown> | null {
  if (entry.role === 'tool') return null

  if (entry.role === 'user') {
    const text =
      typeof entry.content === 'string'
        ? entry.content
        : (entry.content as Array<{ text?: string }>)?.[0]?.text || ''

    return {
      type: 'user',
      text: text.slice(0, 500) + (text.length > 500 ? '...' : ''),
      timestamp: entry.timestamp,
    }
  }

  if (entry.role === 'assistant') {
    const content = (entry.content as StreamPart[]) || []
    const parts: Array<Record<string, unknown>> = []

    for (const part of content) {
      if (part.type === 'thinking') {
        const thinking = part.thinking ?? ''
        parts.push({
          type: 'thinking',
          text: thinking.slice(0, 300) + (thinking.length > 300 ? '...' : ''),
        })
      } else if (part.type === 'text') {
        const text = part.text ?? ''
        parts.push({
          type: 'text',
          text: text.slice(0, 500) + (text.length > 500 ? '...' : ''),
        })
      } else if (part.type === 'toolCall') {
        parts.push({
          type: 'tool',
          name: part.name,
          preview: JSON.stringify(part.arguments || {}).slice(0, 200),
        })
      }
    }

    if (parts.length === 0) return null

    return {
      type: 'assistant',
      parts,
      model: entry.model,
      stopReason: entry.stopReason,
      timestamp: entry.timestamp,
    }
  }

  return null
}
