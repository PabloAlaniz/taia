import { describe, it, expect } from 'vitest'
import { approvalExtras, approvalPayload, approvalSubject } from '@/lib/approval-detail'

describe('approval detail', () => {
  it('names the target', () => {
    expect(approvalSubject({ command: 'pnpm test' })).toBe('pnpm test')
    expect(approvalSubject({ file_path: 'src/a.ts', content: 'x' })).toBe('src/a.ts')
    expect(approvalSubject(null)).toBeNull()
  })

  it("reads a Write's content and counts its lines", () => {
    expect(approvalPayload({ file_path: 'a', content: 'one\ntwo\nthree' })).toEqual({
      kind: 'write',
      text: 'one\ntwo\nthree',
      lines: 3,
    })
  })

  it("reads an Edit's and a MultiEdit's replacements", () => {
    expect(approvalPayload({ old_string: 'a', new_string: 'b\nc' })).toMatchObject({
      kind: 'edit',
      edits: [{ before: 'a', after: 'b\nc' }],
      lines: 3,
    })
    const multi = approvalPayload({
      edits: [
        { old_string: 'x', new_string: 'y' },
        { old_string: 'p', new_string: 'q' },
      ],
    })
    expect(multi?.kind === 'edit' && multi.edits).toHaveLength(2)
  })

  it('has no payload for a plain command, and keeps the other params', () => {
    expect(approvalPayload({ command: 'ls' })).toBeNull()
    expect(approvalExtras({ command: 'ls', timeout: 30 })).toEqual({ timeout: 30 })
    expect(approvalExtras({ command: 'ls' })).toBeNull()
  })
})
