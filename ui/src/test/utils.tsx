import type { ReactElement, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'
import type { SessionDescriptor } from '../auth/session'

// `retry: false` here and `retryQuery` in the real app (`main.tsx`), which is a
// difference worth stating rather than leaving to be discovered: it keeps an
// error case deterministic and instant instead of waiting out a backoff. It is
// also how the seven-second blank page hid — every screen test showed the
// refusal immediately, because the client under test retried nothing while the
// production client retried three times. The policy itself is therefore pinned
// on the function, in `src/api/client.test.ts`, where no client can be
// substituted for it.
//
// Router as well as QueryClient: a screen that navigates on success (SignIn) is
// rendered through this wrapper too, and useNavigate throws outside a Router.
// Safe for the renderHook callers — none of them provide a Router of their own,
// and react-router refuses to nest one inside another.
export function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
}

// Render `element` at route `path`, with the browser location at `initialUrl`.
//
// `session` seeds the ['session'] key useSession reads, which is how a screen
// under RequireAuth always finds it in the real app: the descriptor is already
// in cache before any screen mounts. Seeding rather than mocking GET
// /api/auth/me is deliberate — a screen whose edit controls depend on the
// session must not be asserted against while that request is still in flight,
// or "the button is absent" passes for the wrong reason. Omit it for a screen
// that renders no capability-dependent control; a screen that does renders none
// of them without it.
export function renderAt(path: string, element: ReactElement, initialUrl: string, session?: SessionDescriptor) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  if (session) client.setQueryData(['session'], session)
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
