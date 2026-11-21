import { NextRequest, NextResponse } from 'next/server'
import { getAgentSessions, readTranscript } from '@taia/core/agent-runtime'

// Polling endpoint - client calls every 2-3 seconds
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> },
) {
  const { agentId } = await params
  const since = request.nextUrl.searchParams.get('since') // timestamp to get entries after

  try {
    const sessions = await getAgentSessions(agentId)
    const latestSession = sessions.sort((a, b) => b.updatedAt - a.updatedAt)[0]

    if (!latestSession) {
      return NextResponse.json({
        ok: false,
        error: 'No sessions found',
        status: 'offline',
      })
    }

    const now = Date.now()
    const timeSinceUpdate = now - latestSession.updatedAt

    // Determine status
    // live = activity in last 3 minutes (agents can take time between tool calls)
    // idle = activity in last 15 minutes
    // offline = no recent activity
    let status: 'live' | 'idle' | 'offline' = 'offline'
    if (timeSinceUpdate < 3 * 60 * 1000) status = 'live'
    else if (timeSinceUpdate < 15 * 60 * 1000) status = 'idle'

    // Read recent transcript entries via API
    const entries = await readTranscript(agentId, latestSession.sessionId, 30)

    // Filter by since timestamp if provided
    const sinceTs = since ? parseInt(since, 10) : 0
    type TranscriptEntry = {
      id?: string
      role?: string
      content?: unknown
      timestamp?: string
      model?: string
      stopReason?: string
    }
    type AssistantPart = {
      type?: string
      text?: string
      thinking?: string
      name?: string
      arguments?: unknown
    }
    const filteredEntries =
      sinceTs > 0
        ? (entries as TranscriptEntry[]).filter((e) => {
            const ts = e.timestamp ? new Date(e.timestamp).getTime() : 0
            return ts > sinceTs
          })
        : (entries as TranscriptEntry[])

    // Simplify entries
    const simplified = filteredEntries
      .map((entry) => {
        if (entry.role === 'user') {
          const text =
            typeof entry.content === 'string'
              ? entry.content
              : (entry.content as Array<{ text?: string }>)?.[0]?.text || ''
          return {
            id: entry.id,
            role: 'user',
            text: text.slice(0, 500) + (text.length > 500 ? '...' : ''),
            timestamp: entry.timestamp,
          }
        }

        if (entry.role === 'assistant') {
          const parts: Array<Record<string, unknown>> = []
          for (const part of (entry.content as AssistantPart[]) || []) {
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
                preview: JSON.stringify(part.arguments || {}).slice(0, 100),
              })
            }
          }
          return {
            id: entry.id,
            role: 'assistant',
            parts,
            model: entry.model,
            stopReason: entry.stopReason,
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
      label: latestSession.label,
      model: latestSession.model,
      status,
      lastActivity: latestSession.updatedAt,
      entries: simplified,
      entriesCount: simplified.length,
      serverTime: now,
    })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        status: 'offline',
      },
      { status: 500 },
    )
  }
}
