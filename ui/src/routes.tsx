import { Navigate, type RouteObject } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './shell/AppShell'
import { Login } from './screens/Login'
import { Departments } from './screens/Departments'
import { ProcessList } from './screens/ProcessList'
import { Overview } from './screens/Overview'
import { Summary } from './screens/Summary'
import { FlowScreen } from './flow/FlowScreen'

export const appRoutes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
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
