import { Navigate, type RouteObject } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { SignIn } from './screens/SignIn'
import { Departments } from './screens/Departments'
import { ProcessList } from './screens/ProcessList'
import { Overview } from './screens/Overview'
import { Summary } from './screens/Summary'
import { FlowScreen } from './flow/FlowScreen'
import { Visibility } from './screens/Visibility'

export const appRoutes: RouteObject[] = [
  { path: '/login', element: <SignIn /> },
  {
    // RequireAuth renders the shell itself, chosen from the descriptor
    // GET /api/auth/me returns, so there is no AppShell in the route tree to
    // hand a session to: the screens below are its direct children.
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/departments" replace /> },
      { path: '/departments', element: <Departments /> },
      { path: '/departments/:code', element: <ProcessList /> },
      { path: '/departments/:code/overview', element: <Overview /> },
      { path: '/processes/:pid', element: <Summary /> },
      { path: '/processes/:pid/flow', element: <FlowScreen /> },
      { path: '/visibility', element: <Visibility /> },
    ],
  },
  { path: '*', element: <Navigate to="/departments" replace /> },
]
