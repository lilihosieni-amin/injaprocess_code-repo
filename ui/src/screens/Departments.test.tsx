import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Departments } from './Departments'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

describe('Departments', () => {
  it('renders tiles with Persian counts from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([{ code: 'cooking', name: 'پخت', count: 12 }, { code: 'cashier', name: 'صندوق', count: 3 }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    renderAt('/departments', <Departments />, '/departments')
    expect(await screen.findByText('پخت')).toBeInTheDocument()
    expect(screen.getByText('۱۲ فرآیند')).toBeInTheDocument()
    expect(screen.getByText('۳ فرآیند')).toBeInTheDocument()
  })
})
