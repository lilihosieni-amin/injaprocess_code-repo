import { describe, it, expect } from 'vitest'
import { selectShell, type Capability } from './session'

const READER: Capability[] = ['view', 'comment', 'export_pdf']
const ADMIN: Capability[] = [...READER, 'manage_users', 'manage_peers', 'view_audit']
const EDITOR: Capability[] = [...ADMIN, 'edit', 'confirm', 'set_visibility']

describe('F2 — the shell is chosen by capability, not by role name', () => {
  it('gives the Reader shell to a reader', () => {
    expect(selectShell(READER)).toBe('reader')
  })

  it('gives the Reader shell to a reader without download', () => {
    expect(selectShell(['view', 'comment'])).toBe('reader')
  })

  it('gives the Panel shell to an admin and an editor', () => {
    expect(selectShell(ADMIN)).toBe('panel')
    expect(selectShell(EDITOR)).toBe('panel')
  })

  it('gives the Panel shell to an unnamed role holding a panel capability', () => {
    // The point of deriving from capabilities: a role seeded later, with a name
    // nothing in this file knows, still lands in the right shell.
    expect(selectShell(['view', 'view_audit'])).toBe('panel')
  })

  it('treats an empty capability set as a reader', () => {
    expect(selectShell([])).toBe('reader')
  })
})
