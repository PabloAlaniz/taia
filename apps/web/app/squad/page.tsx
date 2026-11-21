'use client'

import { useState } from 'react'
import { Alert, Button } from '@/components/atoms'
import { PageHeader } from '@/components/molecules/page-header'
import { AddAgentModal } from '@/client/features/squad/AddAgentModal'
import { EditAgentModal } from '@/client/features/squad/EditAgentModal'
import { useResource } from '@/lib/use-resource'
import { SquadAgentCard } from '@/client/features/squad/SquadAgentCard'

interface SquadMember {
  id: string
  name: string
  role?: string
  avatar?: string
  model?: string
  type: string
  enabled: boolean
  cron?: {
    id: string
    enabled: boolean
    schedule: string
    nextRun?: string
    lastRun?: string
    lastStatus?: string
    lastError?: string
    lastDurationMs?: number
  }
  context?: {
    persona: boolean
    instructions: boolean
    workingNotes: boolean
    memoryFiles: string[]
  }
  tasks: {
    assigned: number
    inProgress: number
    review: number
    done: number
  }
}

async function loadSquad(): Promise<SquadMember[]> {
  try {
    const res = await fetch('/api/agents?detail=full')
    const data = (await res.json()) as { agents?: SquadMember[] }
    return data.agents ?? []
  } catch {
    throw new Error('Failed to load squad')
  }
}

export default function SquadPage() {
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useResource('/api/agents?detail=full', loadSquad, { refreshMs: 30_000 })
  const squad = data ?? []
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const error = deleteError ?? loadError
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    const agent = squad.find((a) => a.id === id)
    if (!confirm(`Delete agent "${agent?.name || id}"? This cannot be undone.`)) return

    try {
      const res = await fetch(`/api/agents/${id}`, { method: 'DELETE' })
      if (res.ok) reload()
    } catch {
      setDeleteError('Failed to delete agent')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Squad Dashboard" icon="🤖">
        <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
          + Add Agent
        </Button>
      </PageHeader>
      <div className="p-6 pt-8 max-w-[900px] mx-auto space-y-4">
        {error && (
          <Alert variant="error" className="mb-4">
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="text-muted p-10 text-center">Loading squad...</div>
        ) : (
          <div className="flex flex-col gap-3">
            {squad.map((member) => (
              <SquadAgentCard
                key={member.id}
                member={member as never}
                onUpdate={reload}
                onEdit={setEditingId}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {!loading && squad.length === 0 && (
          <div className="text-center text-muted py-16 px-5">
            <div className="text-5xl mb-4">🤖</div>
            <div className="text-lg mb-2">No agents yet</div>
            <div className="text-sm mb-6">Add your first agent to get started</div>
            <Button variant="primary" size="lg" onClick={() => setShowAdd(true)} className="px-5">
              + Add Agent
            </Button>
          </div>
        )}

        <div className="mt-8 p-4 bg-card rounded-lg border border-border text-mid text-muted">
          <strong>Legend:</strong> 📋 Assigned • 🔄 In Progress • 👀 In Review
        </div>

        {/* Add Agent Modal */}
        {showAdd && (
          <AddAgentModal
            onClose={() => setShowAdd(false)}
            onAdd={() => {
              reload()
              setShowAdd(false)
            }}
          />
        )}

        {/* Edit Agent Modal */}
        {editingId && (
          <EditAgentModal
            agent={squad.find((a) => a.id === editingId) as never}
            onClose={() => setEditingId(null)}
            onSave={() => {
              reload()
              setEditingId(null)
            }}
          />
        )}
      </div>
    </div>
  )
}
