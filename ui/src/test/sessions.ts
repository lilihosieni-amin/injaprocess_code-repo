import type { SessionDescriptor } from '../auth/session'

export const VIEWER: SessionDescriptor = { username: '09120000001', displayName: 'سمیرا احمدی', role: 'reader', capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:dining'], supervisor: '09120000002', canSupervise: false, pendingApprovals: 0 }
export const HEAD: SessionDescriptor = { ...VIEWER, username: '09120000002', displayName: 'حسین مازندرانی', supervisor: null, canSupervise: true, pendingApprovals: 2 }
export const ADMIN: SessionDescriptor = { username: '09120000003', displayName: 'مهدی رجبی', role: 'admin', capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers', 'view_audit'], scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 1 }
export const EDITOR: SessionDescriptor = { ...ADMIN, username: '09190000000', displayName: 'آرزو نیک‌پی', role: 'editor', capabilities: [...ADMIN.capabilities, 'edit', 'confirm', 'set_visibility'], pendingApprovals: 3 }
