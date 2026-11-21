import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockInitEventListeners = vi.fn()

vi.mock('@taia/core/events', () => ({
  initEventListeners: () => mockInitEventListeners(),
}))

const mockEncryptStoredSecrets = vi.fn(async () => 0)

vi.mock('@taia/core/db/repositories/setting.repository', () => ({
  encryptStoredSecrets: () => mockEncryptStoredSecrets(),
}))

import { register } from '../instrumentation'

describe('instrumentation register', () => {
  const originalRuntime = process.env.NEXT_RUNTIME

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env.NEXT_RUNTIME = originalRuntime
  })

  it('registers the domain event listeners on the nodejs runtime', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'

    await register()

    expect(mockInitEventListeners).toHaveBeenCalledTimes(1)
  })

  it('does not register listeners on non-nodejs runtimes', async () => {
    process.env.NEXT_RUNTIME = 'edge'

    await register()

    expect(mockInitEventListeners).not.toHaveBeenCalled()
  })

  it('encrypts stored credentials on start and survives a failure', async () => {
    process.env.NEXT_RUNTIME = 'nodejs'
    mockEncryptStoredSecrets.mockRejectedValueOnce(new Error('db down'))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(register()).resolves.toBeUndefined()

    expect(mockEncryptStoredSecrets).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalled()
    error.mockRestore()
  })
})
