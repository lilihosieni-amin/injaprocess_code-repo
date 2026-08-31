import { Navigate, type RouteObject } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { SignIn } from './screens/SignIn'
import { Departments } from './screens/Departments'
import { ProcessList } from './screens/ProcessList'
import { Overview } from './screens/Overview'
import { Summary } from './screens/Summary'
import { Steps } from './screens/Steps'
import { FlowScreen } from './flow/FlowScreen'
import { Visibility } from './screens/Visibility'
import { Users } from './screens/Users'
import { UserDetail } from './screens/UserDetail'
import { Profile } from './screens/Profile'
import { FactsList } from './facts/FactsList'

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
      // «گام‌به‌گام» — a route rather than the deliverable's `flowView: 'steps'`
      // mode, for the three reasons `screens/Steps.tsx` records. A sibling of
      // `/flow` because it is the same document read another way, and because
      // `panelCrumbs` and `readerBack` can then answer both with one rule.
      { path: '/processes/:pid/steps', element: <Steps /> },
      // §14 — «داده‌های کمّی». Under `RequireAuth` with every other screen and
      // gated by nothing else here: all five facts routes answer the uniform
      // 404 to a caller holding no Panel capability, so the screen renders the
      // refusal the server gave rather than a predicate this tree re-derives.
      // It needs its own entry for the reason `/visibility` and `/users` do —
      // the catch-all below sends every unknown path to /departments, so a
      // missing route is a silent redirect and not a blank page.
      { path: '/facts', element: <FactsList /> },
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
