'use client'

import { useState } from 'react'
import { Alert, Button, Input, Select } from '@/components/atoms'
import { Modal, ModalHeader, ModalBody, ModalFooter } from '@/components/molecules/modal'

export function AddAgentModal({
  onClose,
  onAdd,
}: {
  onClose: () => void
  onAdd: (agent: Record<string, unknown>) => void
}) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [avatar, setAvatar] = useState('🤖')
  const [type, setType] = useState('cron')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const res = await fetch('/api/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, role, avatar, type }),
    })

    const data = await res.json()
    if (data.ok) {
      onAdd(data.agent)
    } else {
      setError(data.error || 'Failed to create agent')
    }
  }

  return (
    <Modal open onClose={onClose}>
      <ModalHeader>
        <h2 className="text-lg font-semibold">Add Agent</h2>
      </ModalHeader>

      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted block mb-1">ID *</label>
              <Input
                value={id}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                placeholder="my-agent"
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted block mb-1">Avatar</label>
              <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} placeholder="🤖" />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Agent"
              required
            />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Role</label>
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Developer, Tester, etc."
            />
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">Type</label>
            <Select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="cron">Cron (scheduled)</option>
              <option value="api">API (on-demand)</option>
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
            Create
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  )
}
