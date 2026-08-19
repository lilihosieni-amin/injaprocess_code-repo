import { Dropdown } from '../ui/Dropdown'
import { Icon } from '../ui/Icon'
import { SearchField } from '../ui/SearchField'
import { toFa } from '../lib/format'
import { NO_FILTERS, anyActive, filterOptions, type UserFilters } from './usersFilter'
import type { AdminUser } from '../api/users'

/**
 * §6.7's filter card: a four-column grid on `--tile-v2` inside a
 * `1px --line-filter` border at radius 14, whose legend and search each span
 * the whole row. Its own component because the screen below it is a table and
 * nothing else, and because the clear-filters link's rule («drawn only when
 * something is set») is the sort of thing that rots when it lives inside a
 * 200-line screen.
 *
 * **A detached card above the table, not the table's own filter bar.** Ledger
 * L-11 settles that they are two components: `DataTable`'s `filters` slot is
 * the in-table bar the audit and activity screens take, on `--tile-v4` inside
 * the shell; this one sits outside the shell on `--tile-v2`, which is why it is
 * passed as a sibling and not through that prop.
 *
 * At ≤760px the design drops it to two columns at `padding:10px`, each filter
 * full-width — which is the *only* change; nothing is hidden, because a filter
 * you cannot reach is a row you cannot find.
 *
 * **Where this differs from the deliverable, and why.** The design's triggers
 * carry no visible label (the control's own text is the label until something
 * is chosen), so `hideLabel` keeps the name for a screen reader and off the
 * screen. Its search field is `11px 40px` at radius 11 where `SearchField`'s
 * screen-level place is `13px 44px`: R8 gives one padding per role and this is
 * a screen-level search field, so it takes that role's numbers rather than
 * minting a fourth. And the design draws no count here at all — the line below
 * is the one the old screen carried, kept rather than dropped, in the shape
 * §6.10 gives it.
 */
export function UsersFilters({ q, onQ, filters, onFilters, users, names, count, total }: {
  q: string
  onQ: (v: string) => void
  filters: UserFilters
  onFilters: (f: UserFilters) => void
  users: AdminUser[]
  names: Record<string, string>
  count: number
  total: number
}) {
  const o = filterOptions(users, names)
  const set = <K extends keyof UserFilters>(k: K, v: UserFilters[K]) =>
    onFilters({ ...filters, [k]: v })

  return (
    <div role="group" aria-label="فیلتر کاربران"
      className="grid grid-cols-4 items-center gap-s4 mb-s8 border border-line-filter
                 rounded-tile px-s6 py-s5 bg-tile-v2 max760:grid-cols-2 max760:p-s5">
      <div className="col-span-full flex items-center gap-s4 mb-half">
        <span className="inline-flex items-center gap-s4 text-fs-xs font-bold text-violet">
          <Icon name="funnel" className="w-s7 h-s7" stroke={2.2} />
          فیلتر کاربران
        </span>
        {/* The count the old screen carried as a free-floating line, in the
            shape §6.10 gives it: pushed to the inline end, gone at ≤760px
            where the bar is already two rows tall. It counts the listing the
            server sent and nothing else — NFR-12's «12 of 40» defect is a
            count over rows the viewer may not reach, and this surface is
            `*`-gated, so everybody who reaches it reaches every row in it. */}
        <span className="ms-auto text-fs-sm font-semibold text-muted max760:hidden">
          {toFa(count)} از {toFa(total)}
        </span>
      </div>

      <div className="col-span-full mb-half">
        <SearchField label="جست‌وجوی کاربر" value={q} onChange={onQ}
          placeholder="جست‌وجوی نام یا نام کاربری…" />
      </div>

      <Dropdown label="نقش" hideLabel value={filters.role ?? undefined}
        onChange={(v) => set('role', v)} options={o.roles} placeholder="نقش" />
      <Dropdown label="سرپرست" hideLabel value={filters.supervisor ?? undefined}
        onChange={(v) => set('supervisor', v)} options={o.supervisors}
        placeholder="سرپرست" searchable searchPlaceholder="جست‌وجوی سرپرست…"
        noHit="سرپرستی با این نام نیست" />
      <Dropdown label="وضعیت" hideLabel value={filters.status ?? undefined}
        // Narrowed rather than cast: `Dropdown` hands back a `string`, and the
        // two options below are the only two this field has a meaning for.
        onChange={(v) => set('status', v === 'active' || v === 'disabled' ? v : null)}
        placeholder="وضعیت"
        options={[{ value: 'active', label: 'فعال' }, { value: 'disabled', label: 'غیرفعال' }]} />
      <Dropdown label="دپارتمان" hideLabel value={filters.dept ?? undefined}
        onChange={(v) => set('dept', v)} options={o.depts} placeholder="دپارتمان" />

      {/* R5 — absent, not disabled, until there is something to clear. L-06
          gives it `--violet-mid` rather than `--conflict`: clearing a filter
          destroys nothing. */}
      {anyActive(filters) && (
        <button type="button" onClick={() => onFilters(NO_FILTERS)}
          className="col-span-full justify-self-start border-0 bg-transparent p-s1
                     text-fs-sm2 font-bold text-violet-mid underline underline-offset-4
                     cursor-pointer min-h-touch">
          پاک کردن فیلترها
        </button>
      )}
    </div>
  )
}
