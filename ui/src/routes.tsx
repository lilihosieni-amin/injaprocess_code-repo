import { Navigate, type RouteObject } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { SignIn } from './screens/SignIn'
import { Departments } from './screens/Departments'
import { ProcessList } from './screens/ProcessList'
import { Overview } from './screens/Overview'
import { Summary } from './screens/Summary'
import { FlowScreen } from './flow/FlowScreen'
import { Visibility } from './screens/Visibility'
import { Users } from './screens/Users'
import { UserDetail } from './screens/UserDetail'
import { Profile } from './screens/Profile'

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
      { path: '/users', element: <Users /> },
      // Before nothing and after nothing in particular: react-router matches by
      // specificity rather than by order, so `/users/:id` cannot swallow
      // `/users`. Both entries are needed all the same — the catch-all below
      // sends every unknown path to /departments, so a missing route here is a
      // silent redirect rather than a blank page, which looks exactly like a
      // working app.
      { path: '/users/:id', element: <UserDetail /> },
      // Under RequireAuth with every other screen and gated by nothing else:
      // the one act it offers changes the caller's own row and can change
      // nobody else's, so there is no capability that could be checked here.
      // It needs its own entry for the reason `/visibility` and `/users` do —
      // the catch-all below sends every unknown path to /departments, so a
      // missing route is a silent redirect and not a blank page.
      { path: '/profile', element: <Profile /> },
    ],
  },
  { path: '*', element: <Navigate to="/departments" replace /> },
]
