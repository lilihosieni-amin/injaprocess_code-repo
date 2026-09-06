import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { useHistoryState } from './historyState'

/*
 * Two things this file learned the hard way, both worth keeping written down.
 *
 * `SAVED` is module state, so it OUTLIVES a test — and `MemoryRouter`'s very
 * first render reports `POP` with the fixed key `default`. A second test that
 * mounted at the same entry therefore restored the first test's value and typed
 * on top of it. Each test below uses its own slot name for that reason.
 *
 * And navigating to the SAME path does not remount the screen, so state survives
 * it whatever this hook does. A test written that way passes for a reason that
 * has nothing to do with the code under test.
 */

/** A listing that keeps one filter, and two ways off it. */
function Listing({ slot }: { slot: string }) {
  const [q, setQ] = useHistoryState(slot, '')
  const nav = useNavigate()
  return (
    <>
      <input aria-label="جست‌وجو" value={q} onChange={(e) => setQ(e.target.value)} />
      <button type="button" onClick={() => nav('/entry')}>باز کردن</button>
    </>
  )
}

function Entry({ slot }: { slot: string }) {
  const nav = useNavigate()
  return (
    <>
      <button type="button" onClick={() => nav(-1)}>بازگشت</button>
      {/* A brand-new listing entry rather than a return to the old one. */}
      <button type="button" onClick={() => nav(`/listing?slot=${slot}`)}>فهرست تازه</button>
    </>
  )
}

function app(slot: string, entries: string[] = ['/listing']) {
  return render(
    <MemoryRouter initialEntries={entries}>
      <Routes>
        <Route path="/listing" element={<Listing slot={slot} />} />
        <Route path="/entry" element={<Entry slot={slot} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('useHistoryState', () => {
  it('gives a filter back when you return to the entry that had it', async () => {
    // Owner report, 2026-09-06: *"any filters we had applied before should still
    // be in place."* Opening an entry unmounts the listing, so component state
    // cannot survive on its own — this is the half that brings it back.
    const user = userEvent.setup()
    app('t1')
    await user.type(screen.getByLabelText('جست‌وجو'), 'پنیر')
    await user.click(screen.getByRole('button', { name: 'باز کردن' }))
    await user.click(await screen.findByRole('button', { name: 'بازگشت' }))
    expect(await screen.findByLabelText('جست‌وجو')).toHaveValue('پنیر')
  })

  it('does not hand a NEW listing entry the filter an older one had', async () => {
    // The other half. `scroll.ts` records why `ProcessList`'s `sessionStorage`
    // copy was deleted — *"keyed by department it restored the same offset
    // whichever way you arrived"* — and a filter restored on a fresh arrival is
    // that bug with a search box: the person asks for the list and is handed one
    // that is silently hiding most of it.
    //
    // Both listings here are the same route with the same slot, so only the
    // history entry tells them apart.
    const user = userEvent.setup()
    app('t2')
    await user.type(screen.getByLabelText('جست‌وجو'), 'پنیر')
    await user.click(screen.getByRole('button', { name: 'باز کردن' }))
    await user.click(await screen.findByRole('button', { name: 'فهرست تازه' }))
    expect(await screen.findByLabelText('جست‌وجو')).toHaveValue('')
  })

  it('keeps two slots on one screen apart', async () => {
    // The facts list carries a search AND four dropdowns; one shared cell would
    // have them overwrite each other.
    function Two() {
      const [a, setA] = useHistoryState('t3-a', '')
      const [b, setB] = useHistoryState('t3-b', '')
      return (
        <>
          <input aria-label="الف" value={a} onChange={(e) => setA(e.target.value)} />
          <input aria-label="ب" value={b} onChange={(e) => setB(e.target.value)} />
        </>
      )
    }
    const user = userEvent.setup()
    render(<MemoryRouter><Two /></MemoryRouter>)
    await user.type(screen.getByLabelText('الف'), 'یک')
    await user.type(screen.getByLabelText('ب'), 'دو')
    expect(screen.getByLabelText('الف')).toHaveValue('یک')
    expect(screen.getByLabelText('ب')).toHaveValue('دو')
  })
})
