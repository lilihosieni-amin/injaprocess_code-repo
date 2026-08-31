import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient } from '@tanstack/react-query'
import { useFacts, useFact, useFactBranches, useResolveFact } from './hooks'
import { createWrapper } from '../test/utils'
import { isRestricted } from './types'
import type { FactBundle, FactsListResponse } from './types'

afterEach(() => vi.restoreAllMocks())

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const ROW = {
  id: 'F-00042', kind: 'rule', key: 'deviation', title: 'انحراف', aliases: [],
  scope: { departments: ['cooking'], branches: [] }, status: 'confirmed',
  retired: false, stub: false, red_counts: { unknown: 2, disputed: 1 },
  fingerprint: 'a'.repeat(64), confirmed: false, updated_at: '2026-08-31T09:00:00Z',
}

const BUNDLE = {
  entry: {
    id: 'F-00042', kind: 'rule', key: 'deviation', title: 'انحراف', statement: '…',
    scope: { departments: ['cooking'] }, status: 'disputed', retired: false,
    updated_at: '2026-08-31T09:00:00Z', data: { inputs: [], outputs: [] },
  },
  confirmation: { confirmed: false, can_confirm: false, fingerprint: 'a'.repeat(64) },
  red_paths: { unknown: [], disputed: ['data/outputs/deviation/value'] },
  resolved: { 'F-00011': { kind: 'record', title: 'مانده شب' }, 'F-00099': { restricted: true } },
  row_titles: {}, path_labels: {},
  consumers: [{ id: 'F-00007', title: 'مصرف واقعی' }, { id: 'F-00099', restricted: true }],
  processes: [{ ref: 'cooking-003', restricted: true }],
}

describe('useFacts', () => {
  it('asks for the whole section once and carries the coverage count beside the rows', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(json({ entries: [ROW], coverage: { read: 19, total: 28 } }))
    const { result } = renderHook(() => useFacts(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith('/api/facts', expect.anything())
    const data = result.current.data as FactsListResponse
    expect(data.coverage).toEqual({ read: 19, total: 28 })
    // The row's second line is served, never derived: the client never holds
    // the entry these counts are over (conformance note 1).
    expect(data.entries[0].red_counts).toEqual({ unknown: 2, disputed: 1 })
  })
})

describe('useFact', () => {
  it('fetches one bundle by id', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(BUNDLE))
    const { result } = renderHook(() => useFact('F-00042'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchSpy).toHaveBeenCalledWith('/api/facts/F-00042', expect.anything())
  })

  it('asks for nothing when it has no id yet', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(BUNDLE))
    renderHook(() => useFact(''), { wrapper: createWrapper() })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('models a masked neighbour as a row with an id and no name', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(BUNDLE))
    const { result } = renderHook(() => useFact('F-00042'), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const bundle = result.current.data as FactBundle

    // The owner's ruling of 2026-08-31: keep the row, hide the name. The count
    // stays honest and the narrowing is what stops a title being read that was
    // never sent.
    expect(bundle.consumers).toHaveLength(2)
    const [open, masked] = bundle.consumers
    expect(isRestricted(open)).toBe(false)
    expect(isRestricted(masked)).toBe(true)
    if (!isRestricted(open)) expect(open.title).toBe('مصرف واقعی')
    expect(isRestricted(bundle.resolved['F-00099'])).toBe(true)
    expect(isRestricted(bundle.resolved['F-00011'])).toBe(false)
    // A masked process link keeps its ref and loses tombstoned/heir/missing_nodes.
    expect(Object.keys(bundle.processes[0]).sort()).toEqual(['ref', 'restricted'])
  })
})

describe('useFactBranches', () => {
  it('reads the branch registry, not the entries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValue(json([{ code: 'chalebagh', name: 'چاله‌باغ' }]))
    const { result } = renderHook(() => useFactBranches(), { wrapper: createWrapper() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchSpy).toHaveBeenCalledWith('/api/facts/branches', expect.anything())
    expect(result.current.data?.[0].name).toBe('چاله‌باغ')
  })
})

describe('useResolveFact', () => {
  it('posts the field and the account, and answers with the settled bundle', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(BUNDLE))
    const { result } = renderHook(() => useResolveFact('F-00042'), { wrapper: createWrapper() })
    result.current.mutate({ field: 'data/outputs/deviation/value', account: 'a1b2c3d4' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(fetchSpy).toHaveBeenCalledWith('/api/facts/F-00042/resolve', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ field: 'data/outputs/deviation/value', account: 'a1b2c3d4' }),
    }))
    expect(result.current.data?.entry.id).toBe('F-00042')
  })

  it('invalidates both the listing and the entry after a 200', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(BUNDLE))
    const { result } = renderHook(() => useResolveFact('F-00042'), { wrapper: createWrapper() })
    result.current.mutate({ field: 'data/outputs/deviation/value', account: 'a1b2c3d4' })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // Both, and `['facts']` is the half easy to forget: a resolve moves that
    // row's `red_counts`, its `status`, and — the entry having changed at all —
    // its `fingerprint`, so `confirmed` moves with it.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['facts'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fact', 'F-00042'] })
  })

  it('surfaces the engine’s own message on a refused precondition', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'account a1b2c3d4 is not on field …' }, 422))
    const { result } = renderHook(() => useResolveFact('F-00042'), { wrapper: createWrapper() })
    result.current.mutate({ field: 'data/outputs/x/value', account: 'a1b2c3d4' })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toContain('a1b2c3d4')
  })

  it('invalidates after a 422 too, because it settles on onSettled not onSuccess', async () => {
    const invalidateSpy = vi.spyOn(QueryClient.prototype, 'invalidateQueries')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ detail: 'account a1b2c3d4 is not on field …' }, 422))
    const { result } = renderHook(() => useResolveFact('F-00042'), { wrapper: createWrapper() })
    result.current.mutate({ field: 'data/outputs/x/value', account: 'a1b2c3d4' })
    await waitFor(() => expect(result.current.isError).toBe(true))

    // The whole reason for `onSettled`: the engine refuses (exit 2, nothing
    // written) precisely when the state on screen is the state that refused it,
    // and `onSuccess` would leave the reviewer choosing the same stale account
    // forever. Same rule, same shape as `hooks.order.test.tsx`'s 409 case.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['facts'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['fact', 'F-00042'] })
  })
})
