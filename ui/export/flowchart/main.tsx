import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import '@fontsource-variable/vazirmatn'
import '../../src/index.css'
import './doc-base.css'
import '../print/print.css'
import { readPayload } from '../shared/payload'
import { createSeededClient } from '../shared/seed'
import { Document } from './Document'

const payload = readPayload()

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={createSeededClient(payload)}>
    <Document payload={payload} />
  </QueryClientProvider>,
)
