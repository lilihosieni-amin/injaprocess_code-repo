import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import '@fontsource-variable/vazirmatn'
import './index.css'
import { appRoutes } from './routes'
import { retryQuery } from './api/client'
import { ToastProvider } from './write/ToastProvider'

// `retry` is set here rather than per hook: a refusal must never be retried on
// any query, and a rule that has to be repeated in `useProcess`, `useProcesses`
// and `useOverview` is a rule the next hook will be written without. See
// `retryQuery` for what is retried and what is not.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: retryQuery } } })
const router = createBrowserRouter(appRoutes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
