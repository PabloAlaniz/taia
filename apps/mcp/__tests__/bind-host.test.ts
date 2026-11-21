import { describe, expect, it } from 'vitest'
import { resolveBindHost } from '../src/bind-host'

describe('resolveBindHost', () => {
  it('listens on this machine only by default', () => {
    expect(resolveBindHost({})).toBe('127.0.0.1')
  })

  it('uses TAIA_BIND_HOST, as set by the Docker image', () => {
    expect(resolveBindHost({ TAIA_BIND_HOST: '0.0.0.0' })).toBe('0.0.0.0')
  })

  it('prefers MCP_HOST over TAIA_BIND_HOST', () => {
    expect(resolveBindHost({ MCP_HOST: '10.0.0.5', TAIA_BIND_HOST: '0.0.0.0' })).toBe('10.0.0.5')
  })

  it('ignores blank values', () => {
    expect(resolveBindHost({ MCP_HOST: '  ', TAIA_BIND_HOST: '' })).toBe('127.0.0.1')
  })
})
