// @vitest-environment jsdom
/* eslint-disable no-restricted-syntax -- a bare DOM harness for the key handler */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, cleanup } from '@testing-library/react'
import { useDecisionKeys } from '@/lib/use-decision-keys'

function Harness({ onApprove, onReject }: { onApprove: () => void; onReject: () => void }) {
  useDecisionKeys()
  return (
    <>
      <div data-strip>
        <a href="#t" data-testid="link">
          task
        </a>
        <button type="button" data-decide="approve" onClick={onApprove}>
          ok
        </button>
        <button type="button" data-decide="reject" onClick={onReject}>
          no
        </button>
      </div>
      <input data-testid="field" />
    </>
  )
}

afterEach(cleanup)

describe('useDecisionKeys', () => {
  it('A approves and X rejects the focused strip', () => {
    const onApprove = vi.fn()
    const onReject = vi.fn()
    const { getByTestId } = render(<Harness onApprove={onApprove} onReject={onReject} />)
    fireEvent.keyDown(getByTestId('link'), { key: 'a' })
    expect(onApprove).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(getByTestId('link'), { key: 'X' })
    expect(onReject).toHaveBeenCalledTimes(1)
  })

  it('ignores typing in a field and modified keys', () => {
    const onApprove = vi.fn()
    const { getByTestId } = render(<Harness onApprove={onApprove} onReject={vi.fn()} />)
    fireEvent.keyDown(getByTestId('field'), { key: 'a' })
    fireEvent.keyDown(getByTestId('link'), { key: 'a', metaKey: true })
    expect(onApprove).not.toHaveBeenCalled()
  })
})
