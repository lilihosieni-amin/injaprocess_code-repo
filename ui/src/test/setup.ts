import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

import { installReactFlowMocks } from './reactflow-mock'
installReactFlowMocks()
