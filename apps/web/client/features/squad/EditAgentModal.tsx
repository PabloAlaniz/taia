'use client'

import { useState } from 'react'
import { Button, Input, Select } from '@/components/atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/organisms/modal'
import type { SquadMember } from './types'

export function EditAgentModal({
  agent,
  onClose,
  onSave,
}: {
  agent: SquadMember
  onClose: () => void
  onSave: () => void
}) {
  const [name, setName] = useState(agent.name)
  const [role, setRole] = useState(agent.role || '')
  const [avatar, setAvatar] = useState(agent.avatar || '🤖')
  const [type, setType] = useState(agent.type)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const res = await fetch(`/api/agents/${agent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, role, avatar, type }),
    })

    if (res.ok) {
      onSave()
    }
  }

  return (
    <Modal open onClose={onClose}>
      <ModalHeader>
        <h2 className="text-lg font-semibold">Edit Agent</h2>
        <code className="text-xs text-muted">{agent.id}</code>
      </ModalHeader>

      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted block mb-1">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Avatar</label>
              <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Role</label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Type</label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="cron">Cron</option>
              <option value="api">API</option>
              <option value="human">Human</option>
              <option value="orchestrator">Orchestrator</option>
            </Select>
          </div>
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="ghost" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="lg">
            Save
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
