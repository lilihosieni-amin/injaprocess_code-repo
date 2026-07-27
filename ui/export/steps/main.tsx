import { createRoot } from 'react-dom/client'
import '@fontsource-variable/vazirmatn'
import './steps-base.css'
import { readPayload } from '../shared/payload'
import { StepsApp } from './StepsApp'
import { PrintDoc } from './PrintDoc'

const payload = readPayload()

createRoot(document.getElementById('root')!).render(
  <>
    <div className="app-screen"><StepsApp payload={payload} /></div>
    <PrintDoc payload={payload} />
  </>,
)
