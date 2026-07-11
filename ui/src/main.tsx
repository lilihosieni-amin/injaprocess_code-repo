import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import '@fontsource-variable/vazirmatn'
import './index.css'
import { appRoutes } from './routes'
import { ToastProvider } from './write/ToastProvider'

const queryClient = new QueryClient()
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
