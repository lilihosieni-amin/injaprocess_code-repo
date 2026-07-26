import { createRoot } from 'react-dom/client'
import '@fontsource-variable/vazirmatn'
import './steps-base.css'
import { readPayload } from '../shared/payload'
import { StepsApp } from './StepsApp'

createRoot(document.getElementById('root')!).render(<StepsApp payload={readPayload()} />)
