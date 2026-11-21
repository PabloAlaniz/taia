import { NextRequest, NextResponse } from 'next/server'
import { getAgentSessions, readTranscript } from '@taia/core/agent-runtime'

/**
 * Agent Transcript API
 *
 * Retrieves the most recent conversation transcript for an agent.
 * Used by TAIA's agent cards to show live activity.
 *
 * @endpoint GET /api/agents/[agentId]/transcript
 *
 * @example
 * GET /api/agents/agent-1/transcript
 *
 * Response:
 * {
 *   "ok": true,
 *   "agentId": "agent-1",
 *   "sessionId": "abc123",
 *   "sessionKey": "agent:agent-1:main",
 *   "model": "claude-sonnet-4",
 *   "entries": [
 *     { "role": "user", "text": "HEARTBEAT: ...", "timestamp": "..." },
 *     { "role": "assistant", "parts": [...], "timestamp": "..." }
 *   ]
 * }
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params

  try {
    // Find most recent session for this agent
    const sessions = await getAgentSessions(agentId)
    const latestSession = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]

    if (!latestSession) {
      return NextResponse.json({ error: 'No sessions found' }, { status: 404 })
    }

    // Read recent transcript entries via API
    const entries = await readTranscript(agentId, latestSession.sessionId, 20)

    type TranscriptEntry = {
      role?: string
      content?: unknown
      timestamp?: string
      model?: string
    }
    type TranscriptPart = {
      type?: string
      text?: string
      thinking?: string
      name?: string
    }

    // Simplify entries for display
    const simplified = (entries as TranscriptEntry[])
      .map((entry) => {
        if (entry.role === 'user') {
          const text =
            typeof entry.content === 'string'
              ? entry.content
              : (entry.content as Array<{ text?: string }>)?.[0]?.text || ''
          return {
            role: 'user',
            text: text.slice(0, 300) + (text.length > 300 ? '...' : ''),
            timestamp: entry.timestamp,
          }
        }

        if (entry.role === 'assistant') {
          const parts: Array<Record<string, unknown>> = []
          for (const part of (entry.content as TranscriptPart[]) || []) {
            if (part.type === 'thinking') {
              parts.push({ type: 'thinking', text: part.thinking?.slice(0, 200) + '...' })
            } else if (part.type === 'text') {
              parts.push({ type: 'text', text: part.text?.slice(0, 300) })
            } else if (part.type === 'toolCall') {
              parts.push({ type: 'tool', name: part.name })
            }
          }
          return {
            role: 'assistant',
            parts,
            model: entry.model,
            timestamp: entry.timestamp,
          }
        }

        return null
      })
      .filter(Boolean)

    return NextResponse.json({
      ok: true,
      agentId,
      sessionId: latestSession.sessionId,
      sessionKey: latestSession.key,
      model: latestSession.model,
      entries: simplified,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}
