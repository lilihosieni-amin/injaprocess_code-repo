import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '../auth/useSession'
import { administrationRefusal } from '../auth/can'
import { useDepartments } from '../api/hooks'
import { useUsers } from '../api/users'
import { refusalStatus } from '../api/client'
import { roleLabel, roleTone } from '../lib/roles'
import { scopesLabel } from '../lib/scopes'
import { Button } from '../ui/Button'
import { DataTable, type TemplatedColumn } from '../ui/DataTable'
import { Icon } from '../ui/Icon'
import { LoadFailedScreen, LoadingState } from '../ui/states'
import { NewUserDialog } from './NewUserDialog'
import { RefusalScreen } from './Refusal'
import { UsersFilters } from './UsersFilters'
import { NO_FILTERS, matches, type UserFilters } from './usersFilter'
import type { AdminUser } from '../api/users'

/** What D14 surfaces instead of repointing. Written once and used on both
 *  screens, so the row and the record cannot come to word it differently. */
export const SUPERVISOR_GONE = 'سرپرست این کاربر غیرفعال است'

/**
 * Every account in the installation, and the way into one of them (D13, D14).
 *
 * **Gated, and gated with the server's own partition.** `administrationRefusal`
 * answers 404 for a department-scoped caller and 403 for a `*`-scoped one who
 * lacks `manage_users`, because `access.requires` checks scope before capability
 * and the two codes say different things (D56). The nav entry in `PanelShell` is
 * the only link here, so the only way to this screen without the right is by
 * typing the path — exactly the case a gate that lives in the header alone does
 * not cover. Cosmetic either way: every endpoint re-derives both halves (D48).
 *
 * **Nothing below the gate is fetched above it.** FR-A11/AC-24 says a reader is
 * shown no user list at all, and NFR-12 says withheld data is never sent and
 * then hidden — so the refusal is not a render-time filter but an early return
 * over a query that never fires (`useUsers`'s `enabled`). The department
 * registry has the same rule and needs a component of its own to obey it:
 * hooks run before every early return, so a `useDepartments()` in this function
 * body would put an `/api/departments` in the network log of a caller the app
 * is about to answer «چیزی اینجا نیست». `UsersBody` is where it lives instead,
 * and it is mounted only past the gate.
 *
 * **The search is over what is on screen, and over the number as it is stored.**
 * Ordinary Persian keyboards emit ۰۹…, the stored username is ASCII (D57), and
 * an unfolded query matches nothing while looking exactly like "no such person".
 *
 * The order is the server's — by `username`, because display names are not
 * unique and ordering by one would leave ties to the query plan and move rows
 * between two identical requests. Nothing is re-sorted here.
 *
 * **The screen carries no subtitle**, and the empty slot is the design's own:
 * `Inja Panel.dc.html:1187` draws the «کاربران» title followed by an empty
 * `<div>` where every other panel screen carries a sentence. The copy does not
 * exist in the deliverable and cannot be inferred from it, so nothing is
 * invented here — it is referred to the owner, and it is why this screen has no
 * `DESIGN` row in `e2e/_harness.ts` (`ScreenDesign.body` is required).
 */
export function Users() {
  const session = useSession().data
  const refusal = administrationRefusal(session)
  const { data, error, isPending, refetch } = useUsers({
    enabled: !!session && refusal === undefined,
  })
  const [creating, setCreating] = useState(false)

  // Hooks first, then the early returns: an early return above them would change
  // hook order between renders the moment the session or the listing arrives.
  if (!session) return <div className="flex-1 bg-ink" />
  if (refusal) return <RefusalScreen status={refusal} />
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  // Before `data ?? []`, and that order is the whole fix: a failed read leaves
  // `data` undefined, and an empty array is indistinguishable from an
  // installation with no accounts in it. `refusalStatus` maps 403 and 404 only,
  // so every other failure — a 500 above all — fell through to the empty state
  // and told an administrator a fact about their installation that nothing on
  // this screen knew.
  if (error) {
    return <LoadFailedScreen message="فهرست کاربران بارگذاری نشد." error={error}
      onRetry={() => { void refetch() }} />
  }

  return (
    <div data-screen="users"
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div data-col className="max-w-list mx-auto">
        <div className="flex items-end justify-between gap-s8 flex-wrap mb-s10
                        max760:flex-col max760:items-stretch max760:gap-s6">
          <h1 data-h1 className="text-title font-extrabold text-role-title-on-field">کاربران</h1>
          {/* Coral, not violet. §5.2 gives coral to the new/primary-forward
              role and §6.7 names this button as one; the violet stays for the
              commit inside the dialog this opens (§6.14). One rule, applied
              from what the control *is* (R8). Below the gate, so a
              department-scoped caller is answered «چیزی اینجا نیست» above and
              never reaches a control the app put up a wall in front of. */}
          <Button variant="coral" className="px-s8 py-s5 text-fs-sm max760:self-start"
            onClick={() => setCreating(true)}>
            کاربر جدید
          </Button>
        </div>

        {/* Mounted only while it is open, so the roles and the candidate list
            are not three requests on every page view — and a second opening
            starts blank rather than on the last attempt's half-filled form. */}
        {creating && <NewUserDialog open onClose={() => setCreating(false)} />}

        <UsersBody users={data ?? []} isPending={isPending} />
      </div>
    </div>
  )
}

/**
 * The filter card and the table — everything on this screen that reads the
 * department registry.
 *
 * Its own component for one reason and it is not tidiness: `useDepartments` is
 * a hook, hooks run before `Users`'s early returns, and a caller who is about
 * to be refused must ask the server for nothing (NFR-12). Mounted here, the
 * request happens only for somebody the gate has already let through.
 */
function UsersBody({ users, isPending }: { users: AdminUser[]; isPending: boolean }) {
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<UserFilters>(NO_FILTERS)
  const navigate = useNavigate()
  const { data: departments } = useDepartments()
  const names = Object.fromEntries((departments ?? []).map((d) => [d.code, d.name]))
  const list = users.filter((u) => matches(u, q, filters))

  return (
    <>
      <UsersFilters q={q} onQ={setQ} filters={filters} onFilters={setFilters}
        users={users} names={names} count={list.length} total={users.length} />

      {isPending ? <LoadingState /> : (
        <DataTable
          label="کاربران"
          template="users"
          rows={list}
          rowKey={(u) => String(u.id)}
          rowLabel={(u) => u.displayName}
          onOpen={(u) => navigate(`/users/${u.id}`)}
          // §6.7 draws ONE empty line, because the design's own fixture is
          // never empty. `DataTable` takes a string the screen computes, so the
          // distinction the old screen made survives the rebuild: «nobody is
          // registered» and «your search matched nobody» are different facts,
          // and telling an administrator the first when the second is true is a
          // statement about their installation that this screen cannot know.
          empty={users.length === 0
            ? 'هنوز کاربری ثبت نشده است'
            : 'کاربری با این نام پیدا نشد'}
          headFill
          columns={COLUMNS(names)}
        />
      )}
    </>
  )
}

/**
 * The six columns of §6.7, in the order and at the sizes the design fixes them:
 * `16px 1.4fr 1fr 1.1fr 1fr 34px`, which is `--grid-users` and reaches the head
 * and every row through `template="users"` — the first consumer the three
 * minted templates have (R11).
 *
 * A function of the department registry rather than a constant, because the
 * department cell is the only one that needs anything the row does not carry —
 * `AdminUser` holds scopes, and «سالن» is a name the registry supplies.
 */
const COLUMNS = (names: Record<string, string>): TemplatedColumn<AdminUser>[] => [
  {
    key: 'state', head: '',
    cell: (u) => (
      // F11 — the state is a word to a screen reader and a colour to everybody
      // else, never a colour alone.
      <span data-testid="state-dot" data-state={u.disabled ? 'disabled' : 'active'}
        aria-label={u.disabled ? 'غیرفعال' : 'فعال'}
        className={`block w-dot h-dot rounded-round ${u.disabled ? 'bg-conflict' : 'bg-green'}`} />
    ),
  },
  {
    // §6.7's `1.4fr` column, and — once the row is a flex row at ≤760 — the one
    // that takes the leftover width (`Inja Panel.dc.html:61`). See `grow`.
    key: 'name', head: 'نام', grow: true,
    cell: (u) => (
      <span className="block truncate text-body font-bold text-ink">{u.displayName}</span>
    ),
  },
  {
    // `Inja Panel.dc.html:64` caps this at 42% of the ROW at ≤760, so a long
    // role name cannot push the chevron off a phone — see `cap`, and why the
    // number has to be written on the cell rather than on the pill inside it.
    key: 'role', head: 'نقش', cap: true,
    cell: (u) => (
      <span className={`inline-block truncate max-w-full px-s5 py-s1 rounded-control
                        text-fs-sm2 font-semibold ${roleTone(u.role)}`}>
        {roleLabel(u.role)}
      </span>
    ),
  },
  {
    key: 'supervisor', head: 'سرپرست', mobile: false,
    cell: (u) => (
      // D14 leaves a disabled supervisor in place rather than repointing the
      // people under them, so the colour is the whole warning: this person's
      // comment approvals route to an account that can no longer sign in. The
      // sentence itself is on the record (`SUPERVISOR_GONE`), where there is
      // room for it; the row says it in the one way a 12.5px cell can, and says
      // it in words to a screen reader as well rather than in colour alone.
      <span title={u.supervisor?.disabled ? SUPERVISOR_GONE : undefined}
        className={`block truncate text-fs-sm2
                    ${u.supervisor?.disabled ? 'text-conflict' : 'text-ink-current'}`}>
        {u.supervisor ? u.supervisor.displayName : '—'}
      </span>
    ),
  },
  {
    key: 'dept', head: 'دپارتمان', mobile: false,
    cell: (u) => (
      <span className="block truncate text-fs-sm2 text-muted">
        {scopesLabel(u.scopes, names)}
      </span>
    ),
  },
  {
    key: 'open', head: '',
    cell: () => (
      // `chevronEnd`, and the name is doing work: in a right-to-left reading
      // what you are going to lies to the LEFT, and `chevronStart` would render,
      // look deliberate and point back at the screen this row does not go to.
      <span aria-hidden className="flex items-center justify-center w-chev h-chev
                                   rounded-round bg-tile-v2 text-violet">
        <Icon name="chevronEnd" className="w-s7 h-s7" stroke={2.4} />
      </span>
    ),
  },
]
