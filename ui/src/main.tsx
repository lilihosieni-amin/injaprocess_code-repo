import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/vazirmatn'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="min-h-screen bg-bg text-ink font-sans grid place-items-center">
      در حال ساخت…
    </div>
  </StrictMode>,
)
