import { Navigate, type RouteObject } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './shell/AppShell'
import type { SessionDescriptor } from './auth/session'
import { Login } from './screens/Login'
import { Departments } from './screens/Departments'
import { ProcessList } from './screens/ProcessList'
import { Overview } from './screens/Overview'
import { Summary } from './screens/Summary'
import { FlowScreen } from './flow/FlowScreen'

// A stand-in until P0 builds GET /api/auth/me and RequireAuth can supply the real
// descriptor. Shaped exactly like SessionDescriptor so replacing it is a one-line
// change; the capabilities below make the panel shell render, which is what every
// existing screen expects.
const placeholderSession: SessionDescriptor = {
  username: '09120000000',
  displayName: 'کاربر موقت',
  role: 'placeholder',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers', 'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'],
  supervisor: null,
  canSupervise: false,
  pendingApprovals: 0,
}

export const appRoutes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell session={placeholderSession} />,
        children: [
          { path: '/', element: <Navigate to="/departments" replace /> },
          { path: '/departments', element: <Departments /> },
          { path: '/departments/:code', element: <ProcessList /> },
          { path: '/departments/:code/overview', element: <Overview /> },
          { path: '/processes/:pid', element: <Summary /> },
          { path: '/processes/:pid/flow', element: <FlowScreen /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/departments" replace /> },
]
