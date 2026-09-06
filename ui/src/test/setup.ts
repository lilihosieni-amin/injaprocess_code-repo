import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())

// The filters a screen keeps against its history entry are module state, and a
// `MemoryRouter` mounts every test on the same key — so one case's filter would
// be restored into the next. Cleared here for the same reason the DOM is.
import { resetHistoryState } from '../shell/historyState'
afterEach(() => resetHistoryState())

import { installReactFlowMocks } from './reactflow-mock'
installReactFlowMocks()
