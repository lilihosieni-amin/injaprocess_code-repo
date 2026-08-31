import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountsCard } from './AccountsCard'
import { bundleOf } from './fixture'
import type { FactBundle } from '../../api/types'

const resolve = vi.fn()
vi.mock('../../api/hooks', () => ({ useResolveFact: () => resolve() }))

const mutate = vi.fn()
beforeEach(() => {
  mutate.mockReset()
  resolve.mockReturnValue({ mutate, isPending: false, error: null })
})

/**
 * F-00030's two open accounts on `data/expr`, plus one on a second field so the
 * grouping has something to group — conformance note 4, which the design has no
 * shape for at all (`sfAccounts`, :5031, is a flat list with no `speaker_role`).
 */
const DISPUTED = (over: Partial<FactBundle> = {}): FactBundle => bundleOf('rule', {
  inputs: [], outputs: [],
}, {
  path_labels: {
    'data/expr': 'فرمول',
    'data/rows/prod_61__ing_1/grams': 'گرم — اینجا پیتزا — پنیر پیتزا',
  },
  ...over,
}, {
  status: 'disputed',
  accounts: [
    {
      id: 'd8379975', field: 'data/expr', status: 'open',
      statement: '=MINUS(SUM(F6,E6),G6)',
      value: 'declared_use = start + received - end',
      speaker_role: null,
      source: { type: 'sheet', ref: 'a/b/Gozaresh markazi.xlsx', sheet: 'پیتزا', cell: 'H6' },
    },
    {
      id: 'abbe139f', field: 'data/expr', status: 'open',
      statement: 'ببینید مصرف اعلامیشون در واقع تفاوت بین مانده اول شب و آخر شبشونه',
      speaker_role: 'سرپرست گزارش‌ها',
      source: { type: 'voice', ref: 'meetings/transcripts/cooking-1405-06-01.txt', lines: '40' },
    },
    {
      id: 'b7e5eadf', field: 'data/rows/prod_61__ing_1/grams', status: 'open',
      statement: 'پیتزای X = ۸۰۰ گرم پنیر', value: 800, speaker_role: null,
      source: { type: 'pdf', ref: 'x/kitchen-report.pdf', page: 15 },
    },
    // Settled, and therefore not drawn: `openAcc` filters on `status === 'open'`.
    {
      id: 'ccc', field: 'data/expr', status: 'rejected', statement: 'چیز دیگری',
      speaker_role: null,
    },
  ],
})

describe('the accounts card', () => {
  it('groups the accounts by disputed field, under the field’s `path_labels` label', () => {
    render(<AccountsCard bundle={DISPUTED()} />)
    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(2)
    // The group's accessible name IS the path label — a reviewer never reads
    // `data/rows/prod_61__ing_1/grams` (note 2, §17).
    expect(groups[0]).toHaveAccessibleName('فرمول')
    expect(groups[1]).toHaveAccessibleName('گرم — اینجا پیتزا — پنیر پیتزا')
    // …and the two accounts on `data/expr` are inside the first, not scattered.
    expect(within(groups[0]).getAllByRole('button', { name: 'انتخاب این روایت' })).toHaveLength(2)
  })

  it('shows `speaker_role` on the account that has one', () => {
    render(<AccountsCard bundle={DISPUTED()} />)
    // Drawn as «گوینده (نقش): …» — Appendix D's own label for the field, in
    // front of the role the account carries.
    expect(screen.getByText(/گوینده \(نقش\): سرپرست گزارش‌ها/)).toBeInTheDocument()
  })

  it('drops a settled account', () => {
    render(<AccountsCard bundle={DISPUTED()} />)
    expect(screen.queryByText('چیز دیگری')).toBeNull()
  })

  it('resolves behind the design’s own dialog, naming the field and the account', async () => {
    const user = userEvent.setup()
    render(<AccountsCard bundle={DISPUTED()} />)
    await user.click(screen.getAllByRole('button', { name: 'انتخاب این روایت' })[0])
    expect(screen.getByRole('dialog', { name: 'این روایت انتخاب شود؟' })).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'انتخاب می‌کنم' }))
    expect(mutate).toHaveBeenCalledWith(
      { field: 'data/expr', account: 'd8379975' }, expect.anything(),
    )
  })

  it('is not drawn at all when no account is open', () => {
    const { container } = render(<AccountsCard bundle={bundleOf('rule', { inputs: [], outputs: [] })} />)
    expect(container).toBeEmptyDOMElement()
  })
})
