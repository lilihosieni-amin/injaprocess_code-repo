/** The nine capabilities (spec D9). */
export type Capability =
  | 'view' | 'comment' | 'export_pdf'
  | 'manage_users' | 'manage_peers' | 'view_audit'
  | 'edit' | 'confirm' | 'set_visibility'

export type Scope = string        // '*' | 'dept:{code}' | 'dept:{code}/report:{kind}'
export type Shell = 'panel' | 'reader'

/** What `GET /api/auth/me` returns (spec D47). P0 builds the endpoint. */
export interface SessionDescriptor {
  username: string
  displayName: string
  role: string
  capabilities: Capability[]
  scopes: Scope[]
  supervisor: string | null
  canSupervise: boolean
  pendingApprovals: number
}

/** Capabilities that only the Panel surfaces (spec F2). */
const PANEL_CAPABILITIES: readonly Capability[] = [
  'edit', 'confirm', 'set_visibility', 'manage_users', 'view_audit',
]

/**
 * Derived from capabilities rather than from the role's name, so a role added to
 * the seed later (D50 — roles come from the seed, never from the UI) lands in the
 * right shell with nobody updating a list of names.
 */
export function selectShell(capabilities: Capability[]): Shell {
  return capabilities.some((c) => PANEL_CAPABILITIES.includes(c)) ? 'panel' : 'reader'
}

export function can(descriptor: SessionDescriptor, capability: Capability): boolean {
  return descriptor.capabilities.includes(capability)
}
