import { describe, it, expect } from 'vitest'
import { mayManage, supervisorCandidatesPath, type AdminUser } from './users'
import { administrationRefusal } from '../auth/can'
import type { Capability, Scope, SessionDescriptor } from '../auth/session'

/**
 * `src/api/users.ts` had no test file at all, and one of `mayManage`'s four
 * clauses had no test anywhere: **deleting `if (!session.capabilities.includes(
 * 'manage_users')) return false` left the whole suite green.**
 *
 * It is unreachable through the screens, and deliberately so — `Users`,
 * `UserDetail` and `PanelShell` all consult `administrationRefusal` first, which
 * answers 403 to exactly the session this clause refuses, so no screen test can
 * arrange an input that separates the clause from its absence. A second lock
 * behind a first is not a redundant lock; it is the one that still holds when
 * somebody moves the first. `mayManage` is exported, is a pure function, and is
 * the client twin of `delegation.may_modify`, whose own first clause this is.
 *
 * So it is pinned here, directly, against the function rather than against a
 * screen. Owner ruling R33 deferred this to Task 25; this is it.
 */

const ACTOR: SessionDescriptor = {
  username: '09120000001',
  displayName: 'مدیر',
  role: 'ادیتور',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers',
    'view_audit', 'edit', 'confirm', 'set_visibility'],
  scopes: ['*'],
  supervisor: null,
  canSupervise: true,
  pendingApprovals: 0,
}

const TARGET: AdminUser = {
  id: 2,
  username: '09120000002',
  displayName: 'کارشناس',
  roleId: 3,
  role: 'خواننده',
  capabilities: ['view'],
  scopes: ['dept:dining'],
  supervisor: null,
  canSupervise: false,
  disabled: false,
  createdAt: 1_760_000_000,
}

const actor = (over: Partial<SessionDescriptor>): SessionDescriptor => ({ ...ACTOR, ...over })
const target = (over: Partial<AdminUser>): AdminUser => ({ ...TARGET, ...over })
const without = (c: Capability): Capability[] => ACTOR.capabilities.filter((x) => x !== c)

describe('mayManage — the client twin of delegation.may_modify (D48)', () => {
  it('is true for the fixture every other clause is measured against', () => {
    // The control. Without it every `false` below could be a false for the
    // wrong reason, or for no reason at all, and none of them would fail if
    // `mayManage` were replaced by `() => false`.
    expect(mayManage(ACTOR, TARGET)).toBe(true)
  })

  it('refuses a session without manage_users, which no screen can arrange', () => {
    // R33's clause. The session is otherwise perfect — `*`-scoped, holding
    // `manage_peers`, holding a strict superset of the target's one capability
    // — so this assertion turns on the missing capability and on nothing else.
    const noManage = actor({ capabilities: without('manage_users') })
    expect(mayManage(noManage, TARGET)).toBe(false)

    // …and here is why no screen test could have caught it. `administrationRefusal`
    // refuses this same session before any screen calls `mayManage`, so the
    // clause is a second lock behind a first — which is precisely the shape of
    // rule that rots unnoticed. If this line ever answers `undefined`, the first
    // lock has moved and this test has become the only one holding the door.
    expect(administrationRefusal(noManage)).toBe(403)
    expect(administrationRefusal(ACTOR)).toBeUndefined()
  })

  it('refuses the same session even when it would pass every other clause', () => {
    // The strongest form: a target with NO capabilities and no scopes at all, so
    // the subset clause and the scope clause are both vacuously satisfied. The
    // only thing left to say no is the capability check.
    const noManage = actor({ capabilities: without('manage_users') })
    expect(mayManage(noManage, target({ capabilities: [], scopes: [] }))).toBe(false)
    // …and the same target IS manageable by the same session with the capability
    // put back, so the pair isolates one line.
    expect(mayManage(ACTOR, target({ capabilities: [], scopes: [] }))).toBe(true)
  })

  it('refuses an absent session', () => {
    // The window before `GET /api/auth/me` resolves. Fail-closed, and asserted
    // rather than assumed: `undefined` reaching a `.includes` would throw, which
    // is a different bug with a different failure.
    expect(mayManage(undefined, TARGET)).toBe(false)
  })

  it('refuses your own record, by username (D13)', () => {
    expect(mayManage(ACTOR, target({ id: 1, username: ACTOR.username }))).toBe(false)
    // The identifier is the username and not the id: the descriptor carries no
    // id. A target with the actor's id and somebody else's number is somebody
    // else, and this says so.
    expect(mayManage(ACTOR, target({ id: 1 }))).toBe(true)
  })

  it('refuses a target holding a capability the actor does not', () => {
    const scoped = actor({ capabilities: ['view', 'manage_users', 'manage_peers'] })
    expect(mayManage(scoped, target({ capabilities: ['view', 'edit'] }))).toBe(false)
    expect(mayManage(scoped, target({ capabilities: ['view'] }))).toBe(true)
  })

  it('refuses an EQUAL set unless the actor holds manage_peers', () => {
    // `⊆` plus equal cardinality is equality — the one case the two readings of
    // the rule differ on, and the only case `manage_peers` decides.
    const peer = target({ capabilities: [...ACTOR.capabilities] })
    expect(mayManage(ACTOR, peer)).toBe(true)
    expect(mayManage(actor({ capabilities: without('manage_peers') }),
      target({ capabilities: without('manage_peers') }))).toBe(false)
  })

  it('refuses a scope the actor does not cover, in the (holder, wanted) order', () => {
    const dining = actor({ scopes: ['dept:dining'] as Scope[] })
    expect(mayManage(dining, target({ scopes: ['dept:dining/report:flow'] }))).toBe(true)
    // Reversed, a holder of one report would reach the whole department. This is
    // the assertion that fails if the two arguments are ever swapped.
    expect(mayManage(actor({ scopes: ['dept:dining/report:flow'] }),
      target({ scopes: ['dept:dining'] }))).toBe(false)
    // A scope stored in a shape the grammar refuses is covered by nothing, even
    // by `*`. `user_scopes.scope` is TEXT NOT NULL with no CHECK, so `''` is
    // storable today, and this is the one input that separates the scope clause
    // from its absence on a surface only a `*` holder reaches.
    expect(mayManage(ACTOR, target({ scopes: [''] }))).toBe(false)
  })
})

describe('supervisorCandidatesPath — one scope parameter per scope (D52)', () => {
  it('repeats the parameter rather than joining, because the server reads getlist', () => {
    // A head of two departments needs somebody who covers BOTH. Joining them
    // into one value asks a different question and gets back people who reach
    // half of what the account will.
    expect(supervisorCandidatesPath(['dept:dining', 'dept:kitchen'], undefined))
      .toBe('/api/users/supervisor-candidates?scope=dept%3Adining&scope=dept%3Akitchen')
  })

  it('carries exclude only when there is somebody to exclude', () => {
    // Absent on the create form; the user's own id on an edit form. Made
    // optional on the server side, a caller who forgets it gets a picker that
    // offers the user being edited as their own supervisor.
    expect(supervisorCandidatesPath(['*'], 7))
      .toBe('/api/users/supervisor-candidates?scope=*&exclude=7')
    expect(supervisorCandidatesPath(['*'], undefined))
      .toBe('/api/users/supervisor-candidates?scope=*')
    // `0` is a legal id nowhere and `undefined` is the absence — the check is
    // `!== undefined` and not a truthiness test, so this stays a real distinction.
    expect(supervisorCandidatesPath([], undefined)).toBe('/api/users/supervisor-candidates')
  })
})
