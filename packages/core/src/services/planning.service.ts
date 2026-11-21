// Planning service — AI-powered task decomposition.
//
// Takes a high-level goal and breaks it into structured tasks, using the
// active runtime adapter as the AI provider.

import { z } from 'zod'

const SYSTEM_PROMPT = `You are a task planning assistant for a software development team.
Given a goal, break it down into concrete, actionable tasks suitable for a Kanban board.

Return ONLY valid JSON with this exact structure:
{
  "tasks": [
    {
      "title": "Short imperative title (max 80 chars)",
      "description": "Detailed description of what needs to be done",
      "priority": "LOW" | "MEDIUM" | "HIGH" | "URGENT",
      "tags": ["tag1", "tag2"],
      "estimated_minutes": 60
    }
  ]
}

Guidelines:
- Generate 3-8 tasks depending on complexity
- Tasks should be ordered by execution sequence
- Each task should be independently completable
- Use imperative titles: "Implement X", "Add Y", "Configure Z"
- Priority: URGENT for blockers, HIGH for core features, MEDIUM for standard work, LOW for nice-to-have
- Include relevant tags (e.g., "backend", "frontend", "database", "testing", "docs")
- Estimate time realistically in minutes (30, 60, 120, 240, etc.)
- Do NOT include any text outside the JSON`

const PlanSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
      tags: z.array(z.string()).optional(),
      estimated_minutes: z.number().optional(),
    }),
  ),
})

export type PlanResult = z.infer<typeof PlanSchema>

export interface PlanGenerationTelemetry {
  provider: string
  session_key?: string
  run_id?: string
  transcript_text?: string
}

export interface PlanGenerationResult {
  plan: PlanResult
  telemetry: PlanGenerationTelemetry
}

export interface PlanRequest {
  goal: string
  context?: string
  agentCount?: number
}

/**
 * Generate a task plan from a high-level goal via the active runtime adapter.
 */
export async function generatePlan(request: PlanRequest): Promise<PlanResult> {
  const userMessage = request.context
    ? `Goal: ${request.goal}\n\nAdditional context: ${request.context}`
    : `Goal: ${request.goal}`

  return (await generateViaRuntime(userMessage)).plan
}

export async function generatePlanWithTelemetry(
  request: PlanRequest,
): Promise<PlanGenerationResult> {
  const userMessage = request.context
    ? `Goal: ${request.goal}\n\nAdditional context: ${request.context}`
    : `Goal: ${request.goal}`

  return generateViaRuntime(userMessage)
}

async function generateViaRuntime(userMessage: string): Promise<PlanGenerationResult> {
  const { getDefaultRuntimeAdapter } = await import('../runtime')
  const { RuntimeCapability, requireCapabilityMethod } = await import('@taia/runtime')
  const adapter = await getDefaultRuntimeAdapter()
  const provider = adapter.id
  const spawnSession = requireCapabilityMethod(adapter, RuntimeCapability.Sessions, 'spawnSession')
  const awaitSessionComplete = requireCapabilityMethod(
    adapter,
    RuntimeCapability.Sessions,
    'awaitSessionComplete',
  )
  const getSessionHistory = requireCapabilityMethod(
    adapter,
    RuntimeCapability.Transcripts,
    'getSessionHistory',
  )

  const prompt = `${SYSTEM_PROMPT}\n\n${userMessage}`
  const result = await spawnSession(prompt, {
    label: 'planning-wizard',
    runTimeoutSeconds: 60,
  })
  const sessionKey = result.sessionKey
  const runId = result.runId

  try {
    await awaitSessionComplete(
      { runId: result.runId, sessionKey },
      { timeoutMs: 60_000, fallbackPollIntervalMs: 5_000 },
    )
  } catch {
    throw new Error('Planning session timed out')
  }

  const messages = await getSessionHistory(sessionKey, { limit: 10 })
  const assistantMsg = messages.find((m) => m.role === 'assistant')
  if (!assistantMsg) throw new Error('Planning session timed out')

  const text = extractAssistantText(assistantMsg.content)
  if (!text) throw new Error('Planning session timed out')

  return {
    plan: parsePlanResponse(text),
    telemetry: {
      provider,
      session_key: sessionKey,
      run_id: runId,
      transcript_text: text,
    },
  }
}

function extractAssistantText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const textBlock = (content as Array<{ type?: string; text?: string }>).find(
      (b) => b.type === 'text' && b.text,
    )
    return textBlock?.text || ''
  }
  return (content as { text?: string })?.text || ''
}

function parsePlanResponse(text: string): PlanResult {
  let jsonStr = text.trim()
  const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    jsonStr = jsonMatch[1].trim()
  }

  const objectMatch = jsonStr.match(/\{[\s\S]*\}/)
  if (objectMatch) {
    jsonStr = objectMatch[0]
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    throw new Error('Failed to parse AI response as JSON')
  }

  const result = PlanSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`Invalid plan structure: ${result.error.message}`)
  }

  return result.data
}
