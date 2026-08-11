import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCan } from './can'
import type { SessionDescriptor } from './session'

const READER: SessionDescriptor = {
  username: '09123456789', displayName: 'س', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

/** Differs from READER in `edit` and in nothing else — same scope, same everything
 *  else — so an assertion that separates the two can only be separating them on
 *  the capability it names. */
const EDITOR: SessionDescriptor = { ...READER, role: 'editor', capabilities: [...READER.capabilities, 'edit'] }

/** Differs from EDITOR in scope and in nothing else, for the mirror case. */
const OTHER_DEPT_EDITOR: SessionDescriptor = { ...EDITOR, scopes: ['dept:cashier'] }

const WILDCARD: SessionDescriptor = { ...EDITOR, scopes: ['*'] }

describe('useCan', () => {
  it('answers from capability and scope together', () => {
    const { result } = renderHook(() => useCan(READER))
    expect(result.current('view', 'dept:dining')).toBe(true)
    expect(result.current('view', 'dept:cashier')).toBe(false)
    expect(result.current('edit', 'dept:dining')).toBe(false)
  })

  it('treats a department scope as covering its reports', () => {
    const { result } = renderHook(() => useCan(READER))
    expect(result.current('view', 'dept:dining/report:steps')).toBe(true)
  })

  it('answers capability alone when no target is given', () => {
    const { result } = renderHook(() => useCan(READER))
    expect(result.current('comment')).toBe(true)
    expect(result.current('manage_users')).toBe(false)
  })

  it('separates the capability from the scope in both directions', () => {
    // Same scope, one capability apart: only `edit` can explain the difference.
    expect(renderHook(() => useCan(EDITOR)).result.current('edit', 'dept:dining')).toBe(true)
    expect(renderHook(() => useCan(READER)).result.current('edit', 'dept:dining')).toBe(false)
    // Same capabilities, one scope apart: only the scope can explain it.
    expect(renderHook(() => useCan(OTHER_DEPT_EDITOR)).result.current('edit', 'dept:dining')).toBe(false)
    expect(renderHook(() => useCan(OTHER_DEPT_EDITOR)).result.current('edit', 'dept:cashier')).toBe(true)
  })

  it('does not let a department swallow a differently-named one that shares its prefix', () => {
    // `dept:dining` must not cover `dept:dining-annex`: containment is
    // segment-wise, exactly as the server's scopes.contains has it.
    const { result } = renderHook(() => useCan(READER))
    expect(result.current('view', 'dept:dining-annex')).toBe(false)
  })

  it('lets the wildcard scope reach every department', () => {
    const { result } = renderHook(() => useCan(WILDCARD))
    expect(result.current('edit', 'dept:cashier')).toBe(true)
    expect(result.current('edit', 'dept:dining/report:steps')).toBe(true)
  })

  it('answers no while there is no session yet', () => {
    // useSession().data is undefined until GET /api/auth/me lands. Drawing
    // nothing in that window is the fail-closed answer, and the honest one:
    // nobody has said yet what this person may do.
    const { result } = renderHook(() => useCan(undefined))
    expect(result.current('view', 'dept:dining')).toBe(false)
    expect(result.current('view')).toBe(false)
  })
})
