import { createRoot } from 'react-dom/client'
import '@fontsource-variable/vazirmatn'
import '../../src/index.css'
import { readPayload } from '../shared/payload'

const payload = readPayload()

createRoot(document.getElementById('root')!).render(
  <div className="p-10 font-sans text-ink">
    <h1 className="font-extrabold text-2xl">مستند فرآیندهای واحد {payload.dept.name}</h1>
    <p className="text-muted mt-2">{payload.processes.length} فرآیند</p>
  </div>,
)
