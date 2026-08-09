# Multi-User RBAC, Comments and Audit — Design

| | |
|---|---|
| **Date** | 2026-08-04 |
| **Status** | Approved. `PRD.md` v0.6 and `ARD.md` v0.4 state the same rules. |
| **Supersedes** | PRD §4's multi-user non-goal, NFR-11, FR-E8; `2026-07-26-department-export-design.md` D25–D31 |
| **Companion specs** | `2026-08-05-frontend-system-design.md` — tokens, shells, components, states |

---

## 1. Summary

The system is multi-user. One login, one application, one permission system.
Department documents are **reports** inside that application, reachable according
to what each person is allowed to see; there is no separate export surface with
its own credential.

Four things the system has never had: **who is acting** (every write attributed),
**what each person may reach** (roles and scopes), **what happened** (an activity
record), and **what people are telling the editor** (comments routed up a
supervisor chain).

### 1.1 What this spec does not decide

Layout, navigation structure, component design, tokens and visual states belong
to `2026-08-05-frontend-system-design.md`. This document fixes architecture, data
model and rules — including the frontend rules that are security-relevant (§9).

### 1.2 Decomposition

Too large for one plan. Each row is its own plan, and **each plan covers both the
backend and the frontend of its own slice** — a routing engine with no composer
is not a comment system, and the acceptance criteria in the PRD are end-to-end
statements that no backend-only plan can satisfy.

| | Sub-project | Depends on |
|---|---|---|
| **F** | Frontend system — tokens, the two shells, shared components, states | — |
| **P0** | Identity & access — users, roles, scopes, sessions, delegation, sign-in and user administration screens, capability-aware endpoints, attributed writes | F |
| **P1** | Content-visibility filter and confirmation fingerprints | P0 |
| **P2** | Reports, download permission, retirement of the export credential | P0, P1 |
| **P3** | Activity record and its reports | P0 |
| **P4** | Comments, approval chain, `comments` CLI | P0, P3 |

**F comes first** because P0 builds the sign-in screen and the user-administration
screens, and those need the tokens and shell decisions to exist.

---

## 2. Architecture — where state lives

### D1 — Three stores, one job each

| Store | Holds | Written by |
|---|---|---|
| `data-repo` (git) | Departments, processes, overviews, order, transcripts, runs | engine CLIs only |
| `app.db` (SQLite) | Users, roles, capabilities, user scopes, supervisor edges and `can_supervise`, sessions, visibility policy, confirmations, activity record | `ui-backend` only |
| `comments.db` (SQLite) | Comments and their approval workflow | `ui-backend` and the `comments` CLI |

`data-repo` is the source of truth for **what the processes are**. It gains no
fields, no new files under `departments/`, and no schema changes. INV-1 through
INV-6 hold as written.

### D2 — The database holds operational state only

Process content lives on the filesystem in git because it must be diffable,
reviewable and restorable. Sessions, activity events and a mutable user list are
none of those things, and a page-view committed per row would destroy the history
that makes the first rule worth having.

No process content is in a database. (ARD §13.1 records the same boundary.)

### D3 — The filesystem stays the only point of connection

`ui-backend` and `control-bot` never call each other over the network. They share
a file, exactly as they already share `data-repo`. This is why the runtime
reaches comments through a CLI (D4) rather than an HTTP endpoint.

### D4 — The Telegram runtime reaches comments through a CLI

A deterministic CLI, `comments`, lives in `engine/` and is baked into the
`control-bot` image alongside the existing CLIs — outside `APPROVED_DIRECTORY`,
matching `deploy/control-bot.Dockerfile:24-26`. `comments.db` is mounted into
that container; `app.db` is not.

Preconditions verified: `engine/` is already `pip install`ed into the control-bot
image and on `PATH`; `data-repo/.claude/hooks/guard.py` blocks only writes outside
`data-repo` and Bash commands that *both* mutate and reference a protected path,
so a `comments` invocation passes; SQLite is already in this stack
(`control-bot-state:/state`).

### D5 — Two database files, not one

`app.db` is never mounted into any container but `ui-backend`, so the activity
record is unreachable from the runtime by any means rather than by convention.

A convention would not hold. The control-bot image is `FROM python:3.11-slim`, so
`python -c "import sqlite3; …"` reaches any mounted file directly, and
`guard.py`'s mutation heuristic does not match it. This is the repo's own
doctrine: ARD §7 states the Bash guard is *"a deliberately conservative heuristic
… pattern matching on a shell string, not a filesystem-level lock"*, which is why
INV-1 is defended at the file level and not only by the sanctioned CLI.

The split also keeps the high-frequency activity writer out of the one file with
two cross-container writers.

**Accepted consequence:** in-flight and rejected comments live in `comments.db`,
which *is* mounted into the bot container. The CLI returns only `approved` and
`addressed` comments (D39), but that filter is a convention. The worst realistic case is a confused
agent surfacing a draft to an editor — who sits at the top of every chain and is
the authorised destination for approved comments anyway.

### D6 — SQLite, not a server database

The host is 3.7 GB and 2 CPUs, already running the Telegram Bot API server, two
bots (one a full Claude Code runtime), FastAPI, and headless chromium peaking at
300–400 MB per PDF render, with `ui-backend` capped at 1 GB for that reason. Nine
departments, dozens of users, a few hundred page views a day and a handful of
comments a week is a rounding error of SQLite's capacity in WAL mode.

A server database's real advantage is `GRANT`-level isolation, enforced by the
engine on every statement rather than by a compose file. Weighed against ~400 MB,
a container, and a dump-plus-credential backup path, and declined.

**Revisit when** `ui-backend` needs more than one worker process. It is
single-process `uvicorn` today and `storage.py`'s locks are already in-memory and
per-process, so SQLite costs nothing at present. PostgreSQL is then preferred
over MySQL for stricter typing, better JSON handling for scope and anchor
structures, and better constraint support.

### D7 — Sessions are server-side rows

A session is a row: id, user, issued-at, last-seen, IP, user agent, revoked-at.
The cookie carries an opaque session id and nothing else.

A signed blob carrying the username cannot be revoked, cannot answer "who is in
the system now", and cannot measure presence. Disabling a user or changing their
permissions takes effect on their next request.

**Lifetime is absolute, not sliding: 24 hours from `issued_at`** (the existing
`SESSION_TTL` default). Sliding expiry keyed on `last_seen` would mean a session
with an open tab never ends, and the heartbeat of D43 runs while a *tab* is open,
not while a person is present — so sliding would make "signed in" unbounded for
anyone who leaves the app open on a back-office screen.

**Changing a password revokes every other session of that user**, and an
administrator setting someone's password (D15) revokes **all** of theirs. Without
this, *"we think this account is compromised, change the password"* accomplishes
nothing, since the attacker's session outlives the credential it came from.

**`ip` is the client address, not the proxy's.** Caddy sits in front of
`ui-backend` (ARD §16), so the recorded value comes from `X-Forwarded-For` with
the proxy trusted. Recorded naively, every row in the failed-sign-in report —
D44's *"only detection surface there is"* — reads `172.18.0.1` and the report is
worthless.

### D8 — Both SQLite files need a backup path

`git-push` covers `data-repo` twice daily and touches neither file. NFR-7
promises that no change goes unrecorded and an off-site backup twice a day;
without a second mechanism that promise is false for users, permissions, comments
and the entire activity record. Implemented as `sqlite3 .backup` of both files on
the same schedule.

---

## 3. Identity, roles and access

**Three independent axes. None is folded into another.**

1. **Role** — a set of capabilities. No scope, not even a default. No rank.
2. **User** — one role plus one or more scopes. Scope lives here and nowhere else.
3. **Supervisor** — an org-chart fact. It routes comments and grants nothing.

### D9 — Capabilities

Nine. Three carry `delegable: false`.

| Capability | Permits | Scope-aware | Delegable |
|---|---|:-:|:-:|
| `view` | See a department, its processes, flowcharts and reports within scope | ✅ | ✅ |
| `comment` | Create comments on a department, process or node within scope | ✅ | ✅ |
| `export_pdf` | Download a report as PDF or standalone single-file HTML | ✅ | ✅ |
| `manage_users` | Create, modify and disable users | ❌ | ✅ |
| `manage_peers` | Additionally create users whose capability set equals one's own | ❌ | ✅ |
| `view_audit` | Read the activity reports, within scope | ✅ | ✅ |
| `edit` | Modify process content, department overview, process order | ✅ | ❌ |
| `confirm` | Confirm a flowchart or department overview | ✅ | ❌ |
| `set_visibility` | Change the global content-visibility policy | — | ❌ |

Approving a comment is **not** a capability — it is inherent to being someone's
supervisor. Nothing to grant, nothing to forget to grant.

**There is no `upload` or `run_pipeline`.** Sending voice notes and starting a
processing run happen in Telegram, where both bots authenticate by numeric
Telegram ID against a static allowlist (NFR-1) — no session, no user record, and
no route to `app.db`, which D5 mounts only into `ui-backend` on purpose. A
capability that appears in the permission UI and enforces nothing is worse than
one that does not exist. Adding them means first giving users a Telegram identity
and the bots a way to resolve it.

### D50 — Roles come from the seed. No API path creates, edits or deletes one.

The set of roles is fixed at deploy time. **Users are created through the
system; roles are not.** There is no role builder, no capability matrix on any
screen, and no endpoint that writes the role table.

A role can never be deleted, because every user holds exactly one and a deleted
role would leave them with no capability set at all.

**Four roles are seeded**, not three: Reader, Admin, Editor, and **Reader (no
download)** = `view` + `comment`. The fourth exists from day one because FR-E7
promises the ability to download *"may be withheld from a person who may still
read"*, and with no per-user overrides (D12) a role is the only way to express
it. A promise that requires a deploy before it can be kept is not kept.

Any further role is a change to the seed and a deploy, not a form someone fills
in.

**`delegable: false` stays on `edit`, `confirm` and `set_visibility`** even
though no API path creates roles at all, so the guard cannot be lost if role
editing is ever introduced. It is a property of the capability rather than a
check on an account, because an account check rots: add a second administrator,
rename a user in a migration, and the guarantee evaporates silently. As a data
property, *"no UI path can ever mint a role that edits content"* is an invariant
with a one-line test and no privileged username anywhere in the code.

Its price is that the seed is the only recovery path if every Editor account is
lost — a runbook item (§10).

### D10 — Scope grammar

Three shapes, strictly nested:

```
*  ⊃  dept:{code}  ⊃  dept:{code}/report:{kind}
```

`report:{kind}` names an entry in the report registry (D26). There is no
`process:{id}` scope: department- and report-level access covers the need, and
process-level would multiply the permission UI for a case that has not arisen.

**A user may hold several scopes.** A head of two departments is one user with
`dept:dining` and `dept:cashier` — not a special case.

- A scope covering `dept:x` **includes reports added later**.
- A scope covering `dept:x/report:k` **never widens**. A new report is invisible
  until granted.

### D11 — Roles

Rows in a table, not `if` statements — so a fourth is a seed change rather than
new code. Three exist (D50).

| Capability | Reader | Admin | Editor |
|---|:-:|:-:|:-:|
| `view` | ✅ | ✅ | ✅ |
| `comment` | ✅ | ✅ | ✅ |
| `export_pdf` | ✅ | ✅ | ✅ |
| `manage_users` | – | ✅ | ✅ |
| `manage_peers` | – | ✅ | ✅ |
| `view_audit` | – | ✅ | ✅ |
| `edit` | – | – | ✅ |
| `confirm` | – | – | ✅ |
| `set_visibility` | – | – | ✅ |

The deployment:

| Person | Role | Scope | `can_supervise` |
|---|---|---|:-:|
| The analyst | Editor | `*` | — |
| Deputy manager | Admin | `*` | — |
| Department head | **Reader** | `dept:dining` (+ others) | **✅** |
| Department viewer | Reader | `dept:dining` | – |
| Report reader | Reader | `dept:dining/report:steps` | – |

**A department head is a Reader carrying the supervisor tag.** They read,
comment, download and approve their branch's comments; they hold no
`manage_users` and no `view_audit`, so they create no users, see no
user-administration surface (D54), and read no activity report — not even for
their own branch. **All user administration is at `*` scope.**

Scoped Admins (`Admin` + `dept:dining`) are legal in the model and absent from
the deployment.

**The Editor holds `comment` and is offered no composer.** The roles are strictly
nested — Reader ⊂ Admin ⊂ Editor — and D13 requires a created user's capability
set to be a subset of the creator's. `comment` is in Reader and Admin, so an
Editor without it would satisfy `Reader ⊄ Editor` and `Admin ⊄ Editor` — and
**could no longer create a Reader or an Admin**, which is every user the system
actually has. (It could still create Editors, by `manage_peers` equality, which
makes the failure worse rather than better: the only account it could mint would
be another full Editor.) It is meaningless rather than forbidden anyway: routing (D34)
climbs to the first holder of `edit`, so an Editor's own comment would be
approved on creation and land in their own inbox. **No composer is offered to any
holder of `edit`** — a UI rule derived from the routing rule, not a permission,
recorded here so that tidying the capability table cannot silently break user
creation.

### D12 — Resolution

```
allows(user, capability, target)
  ⟺  user.role.capabilities ∋ capability
  ∧  ∃ s ∈ user.scopes : s contains target
```

That is the whole rule. **There are no per-user overrides** — no override table,
no per-user capability list, no deny list.

Two reasons. *"Why can this person download?"* must have one answer in one place;
and the subset comparison in D13 is only well-defined when a user's capabilities
come from exactly one source.

An exception is therefore a **new role in the seed** (D50), which means a deploy
rather than a form. Taking `export_pdf` from one person is assigning them a
`Reader (no download)` role that someone added at deploy time — not a switch on
their user record.

### D13 — Delegation

`manage_users` is required to create, modify or disable anyone. Beyond that, two
independent checks, both of which must pass:

1. **Capabilities** — the new user's set is a **strict subset** of the creator's,
   unless the creator holds `manage_peers`, which also permits **equality**.
2. **Scope** — every scope of the new user is **contained by** some scope of the
   creator. Containment, not membership: a creator holding `dept:dining` may
   create a user scoped `dept:dining/report:steps`.

| Creator | → Reader | → Admin | → Editor |
|---|:-:|:-:|:-:|
| Reader | – | – | – |
| Admin | ✅ | ✅ | – |
| Editor | ✅ | ✅ | ✅ |

A Reader's row is empty because they lack `manage_users` entirely, not because of
the subset rule. An Admin may create an Admin because `manage_peers` permits
equality; an Admin may never create an Editor because `Editor ⊄ Admin`.

**Modification** is bound by the same two checks against the **resulting** user,
so no one can escalate an existing account past their own.

**Nobody may edit their own record.** Changing one's own password from the
profile page is the only exception.

**Roles are not editable through the system at all** (D50), so delegation governs
only which existing role a user may be given. There is no path by which a holder
of `manage_users` changes what a role means for everyone holding it.

### D57 — The username is a mobile number

Every username is an Iranian mobile number in canonical form: **`^09\d{9}$`** —
`09123456789`, eleven digits, no separators. There is no other username.

Staff cannot forget it, it is naturally unique, and it is the identifier needed
anyway if credentials or approver notifications ever move to SMS or Telegram
(D40, §13).

**Input is normalised before storage and before comparison.** This is
Persian-language software, so the field receives Persian and Arabic-Indic digits
(`۰۹۱۲۳۴۵۶۷۸۹`, `٠٩١٢٣٤٥٦٧٨٩`) from ordinary keyboards. Normalisation folds those
to ASCII, strips spaces, dashes and parentheses, and rewrites a leading `+98`,
`0098` or bare `98` to `0`. Only the canonical form is persisted, so one person
cannot occupy two accounts written two ways.

**Usernames are unique across every account, including disabled ones.** A
disabled user keeps their number, so it cannot be handed to a new employee who
inherited the same line. Freeing a number means an administrator editing the
disabled account first — deliberate, because silently reassigning an identity
attaches one person's history to another.

**A phone number here is an identifier, not a verified channel.** Nothing sends
to it and nothing proves the person holds the line. Any future use of it for
delivering credentials or notifications needs verification built first.

Changing a username is an ordinary modification bound by D13, audited as
`user.modified`.

### D58 — Passwords: six characters, no other rule

Minimum length six. No complexity requirement, no character-class rule, no
expiry, no reuse check, no forced change on first sign-in.

The users are kitchen and floor staff, and every rule beyond a length floor
trades a real cost in passwords written down against a benefit the evidence has
not supported for a decade. The floor makes an empty or one-character password
impossible.

**What this costs, stated plainly:** `123456` is a legal password, usernames are
guessable by construction (D57 — anyone who knows a staff member's phone number
knows their username), and no rate limit or lockout exists on
`POST /api/auth/login`. Argon2 under the existing `CapacityLimiter(2)` bounds
online guessing to roughly thirty attempts a second, enough to walk a
common-password list. Failed attempts are recorded and reportable (D44), so
guessing is **visible**; nothing yet makes it **slow** (§13).

### D14 — Disabling never blocks and never cascades

Disabling is immediate and revokes the user's sessions at once. It does not
require reassigning their subordinates first — removing access quickly is the
point.

Subordinates keep pointing at the disabled supervisor in the record, because
rewriting history to claim someone always reported elsewhere is a lie. The user
administration screen surfaces *"N users report to a disabled supervisor"* with a
reassign action, so the gap is visible rather than found later.

Disabling does not cascade, and the disabled user's own in-flight comments
continue up the chain — a valid complaint does not become invalid because the
person who raised it left.

**Re-enabling exists and is bound by the same two checks as any modification
(D13).** Both verbs change a user's access, so an Admin can neither disable nor
re-enable an Editor — otherwise an Admin could restore capabilities they do not
hold, which is precisely the escalation D13 exists to prevent. Re-enabling
restores the account and nothing else: sessions revoked at disable stay revoked,
and the supervisor edge is whatever it was.

**At least one active Editor must always exist**, for the same reason D53 pins at
least one active `*` holder — and it needs its own guard, because D53 does not
imply it. An Admin scoped `*` satisfies D53 while the system has no `edit`,
`confirm` or `set_visibility` at all, and D50 makes the seed the only way back.
Disabling or re-roling the last Editor is therefore refused.

### D15 — Credentials and password setting

Usernames and passwords are created in-system by whoever creates the user.
Passwords are argon2-hashed (`argon2-cffi`) and stored in `app.db`. Every user
changes their own from their profile — the sole exception to the self-edit ban
(D13). There is no read-only mounted user file; self-service change requires a
writable store.

**A holder of `manage_users` sets another user's password directly**, choosing
the value, bound by the same two checks as any other modification. No token, no
expiring link, no round-trip: the administrator types the new password and tells
the person what it is.

The honest guarantee, recorded rather than dressed up:

- **The fact is always on record.** `password.set_by_admin` names the actor and
  the target (D42), so a password set by someone else is never invisible, and a
  sign-in shortly afterwards from the setter's address is a visible pattern.
- **Impersonation is detectable, not prevented.** Anyone holding `manage_users`
  can set a password and then sign in as that user. This is inherent to the
  workflow and is why `manage_users` sits only with Editors and `*`-scoped
  Admins (D11).

An out-of-band channel would close it — a Telegram identity per user, sharing
plumbing with D40's deferred approver notifications, and the natural moment to
revisit this (§13).

### D51 — Supervisor is an independent axis

Every user has a supervisor, **except users scoped `*`**, for whom it is
optional. The supervisor determines comment approval routing (D34) and nothing
else.

A separate boolean, **`can_supervise`**, marks a user as eligible to be chosen as
someone's supervisor. It is set by a holder of `manage_users` and **grants no
permissions**. It is asserted rather than derived because org position is a fact
about a person, not something their permissions imply. A Reader may supervise a
Reader.

### D52 — Supervisor eligibility

Eligible = **active**, **and** their scope covers the new user's scope, **and**
(`can_supervise` **or** scope `*`).

| New user's scope | Candidates |
|---|---|
| `dept:dining` | `can_supervise` users on dining, plus all `*` holders |
| `dept:dining/report:steps` | same |
| `dept:dining` + `dept:cashier` | anyone whose scopes cover **both** — in the current deployment that is `*` holders only, but a `can_supervise` user holding both departments qualifies by the same rule |
| `*` | `*` holders only |

Default to the creator when eligible. Reject self, disabled users, anyone whose
scope does not cover, and any choice creating a cycle.

Candidates are displayed **with their scope beside their name** — "Ali Rezaei —
dining", "Maryam Ahmadi — all departments". Past thirty users the reason someone
appears in the list is otherwise invisible.

### D53 — At least one active `*` holder always exists

The candidate list is never empty because at least one active `*`-scoped user
always survives — and that holds **only** because nobody may edit their own
record (D13), so the last actor standing cannot remove themselves, narrow their
own scope, or disable their own account.

Two rules that look unrelated, one holding the other up. It carries **its own
test**, so that a later "delete user" endpoint, or any relaxation of the
self-edit ban, fails a test rather than silently locking everyone out of user
administration.

### D54 — A Reader sees no user-administration surface

No user list, no user detail, no administration screens, no supervisor picker. A
Reader holds no `manage_users` and is served nothing about anyone else's account.

**The one exception, which is not one:** names inside a comment the Reader is
entitled to read. A department head approving their branch's comments necessarily
sees the author (D37), and everyone who could see a comment sees who resolved or
rejected it and why (D38). Without that the comment system is unreadable. The
boundary is the **administration surface**, not the appearance of a name in
content already routed to them.

---

## 4. Content visibility

### D16 — One global policy, guarded by `set_visibility`

What is shown of a process applies **identically to every non-editor**. It is not
a grant, not per-role, not per-department.

The reason is structural: if field visibility were an ordinary capability, anyone
holding `manage_users` could confer it, and internal content would leave the
system without an Editor deciding. `set_visibility` is `delegable: false` (D50),
so no role holding it can be created through any API path — stronger than
restricting the action to a privileged account, because it depends on no
account's identity.

What varies between users is *which departments and reports they can reach* —
never *which fields*.

### D17 — Policy fields and defaults

The policy governs **process content only**; the department overview is not
subject to it (D55). Defaults match what the export publishes, so nothing becomes
visible at migration that is not visible today.

| Field | Non-editor default | Switchable |
|---|:-:|:-:|
| Process name; edges and labels; subprocess links | visible | always |
| Node label | visible | always |
| Node description | visible | ✅ |
| Node actor | visible | ✅ |
| Process summary | **hidden** | ✅ |
| Process IDEF0 (ICOM) | **hidden** | ✅ |
| Process KPIs | **hidden** | ✅ |
| Node ICOM | **hidden** | ✅ |
| `source` / `created_by` / `touched_by` | **hidden** | ❌ never |
| `pending` (unresolved conflicts) | **hidden** | ❌ never |
| `created_at` / `updated_at` | **hidden** | ❌ never |
| Tombstoned processes | **excluded entirely** | ❌ never |

The bottom four are internal bookkeeping, not content. NFR-12 forbids them
leaving the system, and that governs every API response, not only reports.

**A node has no KPIs.** `$defs.activityNode` carries `id`, `type`, `label`,
`description`, `actor`, `icom`, `subprocess`, `position`, `layout`, `source` and
`removed` — nothing else. The two KPI fields in the data model are
`process.kpis[]` (structured `{name, definition?, target?, unit?}`, on the process
summary card) and `overview.personnel[].kpi[]` (plain strings, on the department
page, governed by D55). What a node carries is ICOM, which is IDEF0 information,
not a performance indicator. They are separate switches, so hiding a node's ICOM
while showing a process's KPIs is the default plus one toggle.

### D55 — The department information page is shown in full

The department overview — `description`, `sub_units`, and `personnel` with their
`duties` and `kpi` — is shown **in its entirety**, with no per-field switches.
There is no policy table for it and none is planned.

The overview is *about* a department rather than being the mechanics of a
process, and every part of it — what the department does, its sub-units, who
works there and what each role is measured on — is what a staff member should be
able to read.

Two gates still apply, and neither is field visibility:

- **Scope.** You must hold `view` on that department. A report reader scoped to
  `dept:x/report:steps` never reaches the page.
- **Confirmation.** An overview with no valid confirmation is invisible to every
  non-editor (D22), the same as an unconfirmed flowchart.

`overview.updated_at` is stripped like every other timestamp (D17) — bookkeeping,
not content.

If a reason to hide part of the overview appears — personnel KPIs being the
likely candidate — it becomes new rows in D17's table, not a new mechanism.

### D18 — One filter, applied server-side to every response

A single filter over every response the API sends, driven by the policy plus the
caller's capabilities. Reports, the flow canvas, the detail drawer and the
department overview all read through it. One implementation means one place to be
wrong and one place tests can pin.

The strip happens in the payload, not in CSS — a reader with dev tools finds
nothing hidden.

### D56 — Withheld data is never sent

D18 states this for **fields**. It is the rule for everything: **if a user may
not see it, it does not appear in any response to them.** Not sent and hidden,
not sent and collapsed, not sent and filtered by the client. The leaks that
matter are not fields, so the rule is broader than fields.

| Surface | Rule |
|---|---|
| **Whole records** | Unconfirmed processes (D22) and tombstoned ones (D17) are absent from the response body, filtered in the query. Never client-side. |
| **Derived signals** | No count, badge or flag that implies withheld content. A `pending` **count** on a node leaks the existence of unresolved proposals as surely as the proposals do, and `pending` is on the never-show list. |
| **Existence** | A resource outside the caller's scope answers **404, not 403**. A 403 teaches the caller that the thing exists. |
| **Whether an account exists** | Sign-in takes the same time and returns the same message whether or not the username exists. `authenticate()` must verify against a dummy hash on the miss path; returning instantly for an unknown username and after ~58 ms for a known one is a timing oracle, and with usernames being phone numbers (D57) it answers *"does this person work here?"* |
| **Comments** | D37's subtree rule is a query filter, not a post-filter — including the author and approver names carried with each comment. |
| **Downloads** | The download endpoint re-derives scope on every request. That the cached artifact exists (D27) is not authorisation to serve it. |
| **Search and lists** | Scope belongs in the query. A list endpoint never returns rows it then declines to render. |

**403 is reserved for actions on resources the caller can already see** — a
Reader hitting an edit endpoint on their own department. Out-of-scope *resources*
are 404. The trade is a slightly worse message for a confused user against a
scope boundary that cannot be mapped by probing.

This is the discipline the export already follows: `_sign_in_page` is called
before the requested path is examined, because *"whether a given token exists is
not something to tell a stranger."* D56 generalises it to every endpoint.

**Consequence for the frontend.** Client-side capability checks decide what to
**draw** and nothing else (D48). If a Reader's response contains something the UI
declines to render, the bug is in the backend.

### D19 — Every policy change is audited

`visibility.policy.changed`, with the actor, the field, and both values.

---

## 5. Confirmation

### D20 — A confirmation is a content fingerprint, not a boolean

Stored in `app.db` as `(target, fingerprint, confirmed_by, confirmed_at)` where
target is a process id or a department code. The target displays as confirmed
only while its **current** fingerprint matches the stored one.

A boolean field would have to be cleared correctly by all three write paths — the
UI's Save, a chat edit via Telegram, and a pipeline `merge` run — and missing one
would leave the mark vouching for something stale, the exact failure the mark
exists to prevent. A fingerprint self-invalidates for every path, including paths
added later, with no change to `merge` and no field on `process.json`.

### D61 — Confirming and un-confirming are both actions

The `confirm` capability permits **setting** a confirmation and **withdrawing**
one. Withdrawing is deliberate and emits `confirmation.revoked`; it is not the
same as `confirmation.invalidated`, which is what happens when content changes
and the fingerprint stops matching (D60). Same visible outcome, different fact,
and the record must be able to tell them apart — *"the editor decided this was
wrong"* and *"a pipeline run touched it"* are not the same event.

Both apply to either target: a process id or a department code. The events are
therefore `confirmation.set` and `confirmation.revoked`, each naming its target
— **not** `process.confirmed`, which cannot describe confirming a department
overview (D20, D55).

### D21 — The fingerprint is a canonical form of what a reader can see

The fingerprint is a SHA-256 over the **canonical JSON serialisation** of the
process document — keys sorted, no insignificant whitespace, `ensure_ascii=false`
with Persian text NFC-normalised — with four fields excluded:

```
updated_at · source (including touched_by) · pending · tombstoned
```

Node positions **count**, so moving a node or running the re-layout un-confirms
the process: the diagram's appearance is part of the document.

**Why canonical rather than raw bytes.** Two writers produce these files —
`ui-backend`'s `storage.py` and the `merge` CLI in `engine/` — and any difference
in indent, key order or float formatting would silently un-confirm every process
the pipeline touches. Hashing bytes would make the confirmation depend on which
program last wrote the file.

**Why those four exclusions, and not "everything but `updated_at`".** The line is
principled rather than arbitrary: **the fingerprint covers exactly what a
non-editor can see** (D17's never-shown list is the same four). Without it:

- ARD §5.3 adds a record to `source.touched_by` for processes a run decided were
  **unchanged**, so every pipeline run would un-confirm the entire department
  including the processes it deliberately left alone;
- accepting or rejecting a `pending` conflict would un-confirm a flowchart
  without changing one visible byte of it.

Both would be invisible to whoever was surprised by them. A confirmation vouches
for what a reader sees, so it is invalidated by changes a reader could notice.

### D22 — Unconfirmed content is invisible to non-editors

A process or department overview carrying no valid confirmation does not appear
for any user without `edit`, and reports render only confirmed processes.
Enforced server-side (D56), never by the client.

### D23 — The system starts dark

No bulk confirmation at migration. All 85 existing processes (21 dining, 26
logistics, 38 cashier) start unconfirmed, so non-editors see an empty system
until each is reviewed and confirmed.

**Accepted consequence:** because any edit invalidates a confirmation, a pipeline
run makes a department head's flowcharts disappear until re-confirmed. Every
voice run creates re-confirmation work.

---

## 6. Reports

### D24 — Reports are read in the application, under one permission system

There is no separate export credential, no `inja_export_session` cookie, no
`export_auth.py`, no server-rendered sign-in page, and no `/exports` route with
permanent per-department links.

That separation existed because report readers had no accounts and there was no
identity to attach a permission to. They have accounts now, and one permission
system replaces two credential systems. (This supersedes NFR-11 and D25–D31 of
`2026-07-26-department-export-design.md`, which the front matter records, because
those documents still describe the old surface.)

Retained from that design, because none of it was about the credential:

- **Route ordering is load-bearing.** The SPA catch-all mount at `/` swallows
  everything registered after it. Any new prefix registers **before** it, and the
  existing test pinning that ordering extends to cover them.
- **Serving parity.** Downloads need `FileResponse` with `Range` (206 — iOS
  Safari's PDF viewer depends on it), conditional revalidation (304), HEAD,
  `Cache-Control: private, no-cache`, and path containment catching both
  `ValueError` (embedded NUL) and `OSError` (`ENAMETOOLONG`).
- **A cost ceiling on sign-in.** `POST /api/auth/login` is the only
  unauthenticated endpoint and runs argon2 (~58 ms). It keeps the
  `anyio.CapacityLimiter(2)` passed to `to_thread.run_sync`, which *replaces* the
  default 40-thread limiter rather than nesting inside it, so password checks
  cannot starve everything else. The body is capped, Caddy caps it again at 1 MB,
  and failed sign-ins are logged with the username `%r`-quoted so a newline
  cannot forge a log line.

### D25 — Reading and downloading are different responses

**Reading** a report renders it in the application from a JSON payload, using the
same components as the download (D29 — one renderer, `parity.test.tsx`). It is
authorised by `view`.

**Downloading** returns the built single-file artifact — PDF or standalone HTML.
It is authorised by `export_pdf`.

They must not be the same response. The single-file build inlines the entire
department's data into one document (ARD §13.3), so serving it on the *read* path
hands a reader without `export_pdf` the complete artifact and a Ctrl-S — making
FR-E7's *"the ability to download may be withheld from a person who may still
read"* decorative, and passing every test that checks status codes rather than
bytes.

FR-E3 (opens with no server), FR-E5 (printable, nothing cut across a page
boundary) and FR-E9 (a downloaded copy opens forever) remain true of the
downloaded artifact.

### D26 — Reports come from a backend registry

One registry served to the frontend, replacing the two hand-synchronised lists
(`EXPORT_KINDS` in `exports.py`, `KINDS` in `ExportMenu.tsx`). Scopes reference
registry ids (`dept:{code}/report:{kind}`, D10), so adding a report is one
registry entry plus its renderer, and it appears in the permission UI
automatically.

### D27 — Generated artifacts are a fingerprint-keyed cache

```
EXPORT_DIR/{dept}/{kind}-{key}.html
EXPORT_DIR/{dept}/{kind}-{key}.pdf
```

A render happens once per version and is reused until something in the key
changes. A chromium render takes tens of seconds and is serialised process-wide
by a module lock; without the cache, ten simultaneous downloads is a ten-minute
queue.

**The key is not just the content.** It is a digest over three things:

1. the fingerprints (D21) of every **confirmed** process in the department, **in
   curated order** — order is part of the key because `order.json` is the
   document's table of contents and a reorder changes what the reader receives,
   while changing no process;
2. the department overview's fingerprint;
3. **the version of the content-visibility policy** (D16).

The third is not optional. The payload is built by the visibility filter (D18),
so an Editor switching off "node actor" must change what every cached artifact
contains. Keyed on content alone, every already-rendered report keeps serving the
actor field and AC-21's *"hides it from every non-editor at once"* is false — a
cache that survives a policy change is a content leak, not a stale page.

**The artifact is the same for every caller.** Reports render the non-editor view
(D17 defaults plus the policy), never a per-caller variant, so one cached file is
correct for everyone permitted to have it. Permission decides *whether* it is
served (D56), never *what* it contains.

Stale entries are pruned on write: after a successful render, sibling files for
the same `{dept}/{kind}` with a different key are removed, so the directory holds
one version per department and kind.

`EXPORT_DIR` is a Docker volume outside `data-repo` — build artifacts must not
appear in the working tree the control-bot agent operates in (INV-6). Being a
pure cache, it can be deleted at any time at the cost of regeneration.

### D28 — A report is always current; there is no permanent link

A report shows the department as it stands. There is no snapshot to refresh, no
archive, and no stable public URL per department — a stable public URL is exactly
what should not exist once access is per-person. A downloaded copy is a snapshot
by nature (D25). This supersedes FR-E4.

### D29 — One flowchart renderer

`ui/export/flowchart/parity.test.tsx` fails the build on a forked node or edge
component. That guarantee extends to every surface a flowchart appears on.

---

## 7. Comments

### D30 — Anchors

**Four kinds. No field narrowing.**

| Kind | Target | Reached from |
|---|---|---|
| `node` | node id | a step or junction — in the flowchart **or** in the step-by-step report |
| `process` | process id | the flowchart page **or** the step-by-step report |
| `process_list` | department code | the department's process list page |
| `department` | department code | the department information page |

**A node is the finest anchor there is.** No field-level narrowing: a comment is
prose written by someone who is not editing, and making them first choose which
field they mean is friction that buys nothing — an editor reading *"this step
names the wrong person"* can see which part it is about. It also keeps the anchor
set closed, so every comment points at something with an id. The
node is the finest durably addressable unit in the data model anyway: node ids
embed their process id, are never reused, and are globally unique.

**`process_list` and `department` carry the same target and are distinct kinds.**
Same department, different subject. *"A process is missing from this list"* and
*"this description is wrong"* must not arrive at the editor as the same kind of
thing, so they are separate kinds rather than one kind with a flag.

**Node anchoring works identically from both surfaces.** The step-by-step report
linearises a process into ordered steps, each derived from exactly one node. That
mapping lives in `ui/export/steps/linearize.ts` and must be carried through to
the rendered report, so a comment on step 4 anchors to **the node behind it** and
never to the step's ordinal — ordinals shift whenever a process changes, node ids
do not. This is the one piece of new plumbing the anchor model requires.

A step nested inside an XOR/AND branch is not a comment target; comments there go
to the process.

**Scope.** `process_list` and `department` anchors are reachable only at
department scope. A report reader scoped to `dept:x/report:steps` comments at
`node` and `process` level.

### D31 — Every anchor carries a snapshot

Captured at comment time, per kind:

| Kind | Snapshot |
|---|---|
| `node` | department name, process name, node label text |
| `process` | department name, process name |
| `process_list` | department name, and the ordered list of process ids and names as it stood |
| `department` | department name |

**`merge restructure` mints brand-new process *and* node ids**, tombstones the
originals with `superseded_by`, and records no node-level mapping between old and
new. That path runs in production regularly. Without a snapshot a comment decays
into a dangling id; with one it still reads as a coherent statement, and a
comment on a tombstoned process surfaces as *"refers to a process since replaced
by cashier-028"* rather than vanishing.

The `process_list` snapshot earns its place for the same reason in a different
way: *"the stock-check process is missing from this list"* is only checkable
against the list the author was looking at, and the department's process set
changes with every pipeline run.

Anchors are never repointed automatically. Orphaning is surfaced, not guessed at.

### D32 — Identity: `CMT-{n}`

A monotonic integer from `comments.db`, never reused. INV-1's principle on a
different ledger, because comments are not `data-repo` content. Short enough to
quote in Telegram.

### D33 — Lifecycle

| State | Meaning |
|---|---|
| `draft` | not yet submitted |
| `awaiting` | sitting with one named approver |
| `approved` | cleared the chain; visible to every `edit` holder and to the CLI |
| `addressed` | closed by an editor or by the AI, optionally with a commit id |
| `rejected` | returned to the author with a reason |
| `withdrawn` | pulled back by the author before any approval |

Nothing is hard-deleted. `withdrawn` and `rejected` are states, not row removals
— INV-4's doctrine, and necessary because a supervisor rejecting a complaint must
leave a trace.

**Drafts are not persisted.** A comment exists when it is submitted;
`comment.created` fires then. `draft` is the composer's local state, so there is
no half-written text sitting in the database and no separate submit event.

**The ordinary limits**, so two implementations do not differ:

- Comment text is **capped at 2,000 characters** and must be non-empty after
  trimming. It travels into a Telegram message via `comments show` and into an
  approval trail; unbounded prose serves nobody.
- An author may hold **one open comment per anchor** — a second attempt on a step
  they already have an `awaiting` comment on is refused, pointing at the existing
  one. Ten identical comments on the same node cost the editor, not the author.
- **A rejection reason is required** and non-empty; an amendment's text is
  required too.
- **Amendments do not chain.** A second amender replaces the first amendment, and
  the trail records both acts. The author's original is never touched by either —
  that is the invariant D35 protects, and it holds however many hops amend.

### D34 — Routing climbs the supervisor tree

A comment moves from the author up the supervisor edges. It becomes `approved`
the moment the next hop would be a user holding `edit` — an editor does not
approve their own inbox. If the chain reaches a root with no editor above it, it
becomes `approved` there and goes to all editors.

Disabled users are skipped and the trail records *"hop skipped — supervisor
disabled"*. Comments already sitting with a disabled user move up automatically.
If every hop above is disabled the comment reaches the editors: a comment nobody
can approve is better delivered than stuck.

**The next hop is computed at each hop, from the tree as it stands.** The comment
stores only its *current* approver, never a precomputed route. So a supervisor
reassigned mid-chain takes effect from the next approval onward, and the trail
records where the comment actually went rather than where it was once expected
to. Approvals already given are never re-attributed — they are snapshots (D31),
and the person who approved a comment approved it whatever the org chart does
afterwards.

Two consequences of computing live:

- **Approval is strictly sequential.** Only the named current approver may act,
  even though supervisors further up can see the comment at any stage (D37). A
  skip-level approval would leave a hop with no record of a decision it was
  supposed to make.
- **Routing is cycle-safe.** D52 rejects a cycle at assignment, but two
  independent edits can still create one (A→B checked before B→C existed, then
  C→A). Routing therefore tracks the hops it has visited and, on revisiting one,
  delivers to the editors and records *"chain broken — cycle"*. It never loops.

**An author who has lost sight of their comment still gets its outcome.** D37
says a report reader who loses a department stops seeing their in-flight comment;
the resolution or rejection notice (D38) is still delivered to them, because a
decision about something you said is owed to you regardless of what you can
currently browse.

### D35 — Approve, reject, or amend and approve

Amending keeps both texts. The author's original words are never overwritten; the
amended version travels onward and the difference stays in the record, because
*"my supervisor changed what I said"* must be inspectable.

Rejection returns the comment to the author with a reason. Revising restarts the
chain at hop one.

### D36 — The author controls the comment exactly while it carries no approvals

| State | Edit | Withdraw |
|---|:-:|:-:|
| `draft` | ✅ | ✅ |
| `awaiting`, no approvals yet | ✅ | ✅ |
| `rejected` | ✅ | ✅ |
| `awaiting`, one or more approvals | ❌ | ❌ |
| `approved` / `addressed` | ❌ | ❌ |

An approval attests to specific words. If the author could rewrite the text
afterwards, every signature above it would be worthless. Withdrawal is barred on
the same boundary and for the same reason: it would let an author erase a
supervisor's endorsement unilaterally, and make raise-then-retract untraceable.

The escape hatch is that **any approver may reject**, returning it to the author.
Stopping an in-progress comment requires someone accountable to act and leaves a
record.

### D37 — Comment visibility follows the tree, not content scope

| You are… | You see |
|---|---|
| the author | your own comments and their status |
| a supervisor | every comment authored anywhere in your subtree, at any stage |
| a holder of `edit` | every comment that completed the chain, regardless of subtree |
| anyone else | nothing |

An Admin scoped `*` still reads only their own branch's comments. Seeing every
department is not the same as reading every department's internal complaints.

A comment can outlive its author's access: if a report reader loses a department,
their in-flight comment stays in the chain and they stop seeing it.

### D38 — Everyone who saw a comment sees how it ended

When a comment becomes `addressed`, its whole audience — author, every supervisor
in the chain, and editors — sees who closed it, when, the note, and the commit
link if the AI closed it. The author is badged. Rejections are equally visible,
with the rejecting supervisor's name and reason.

### D39 — The `comments` CLI

```
comments list --department dining --status approved
comments show CMT-42
comments resolve CMT-42 --commit <sha> --note "…"
```

`show` returns the text, the anchor with its snapshot, the department, the author
and the full approval trail — from denormalised columns, so the CLI never reads a
users table and cannot enumerate people. It returns only `approved` and
`addressed` comments.

This makes the loop real: *«برو مشکل کامنت CMT-42 رو درست کن»* → the AI reads the
anchor, edits through `merge`, commits, and marks the comment addressed with the
commit id.

### D40 — Notification is in-app only

A badge for the approver, plus a **"waiting longest"** list on the approver's
screen and on the editor's, so a blocked chain is visible without a delivery path
that does not exist. Telegram notification would require a Telegram id on every
user record (§13).

---

## 8. The activity record

### D41 — One append-only table

Columns: `at`, `actor`, `session`, `action`, `target`, `ip`, `user_agent`,
`outcome`. In `app.db`, never mounted elsewhere (D5).

### D42 — Event catalogue

**Access** — `login.success`, `login.failure` (with attempted username and a
`reason` of `bad_password` / `no_such_user` / `disabled`), `logout`,
`session.revoked`, `password.changed`, `access.denied`.

**Content** — `department.viewed`, `process.viewed`, `report.viewed`,
`report.downloaded` (with format), `process.edited`, `confirmation.set`,
`confirmation.revoked`, `confirmation.invalidated`.

The three confirmation events each name their target, which may be a process id
**or** a department code (D20, D61). There is no `process.confirmed`: it could
not describe confirming a department overview, which is equally confirmable and
equally invisible until it is.

**View events are emitted on navigation and deduplicated per session per target
within 30 minutes.** The SPA uses TanStack Query, which refetches on window focus
and on remount, so an event per fetch would make D44's *"how often"* a measure of
tab-switching. A reader who opens the dining steps guide, alt-tabs six times and
comes back has opened it once. Serving a report from the cache still counts as a
view — the reader read it.

**Governance** — `user.created`, `user.modified`, `user.disabled`,
`user.enabled`, `password.set_by_admin`, `role.assigned`, `scope.granted`,
`scope.revoked`, `supervisor.changed`, `supervisor_flag.changed`,
`visibility.policy.changed`, `comment.created`, `comment.edited`,
`comment.withdrawn`, `comment.approved`, `comment.amended`, `comment.rejected`,
`comment.addressed`.

Four of these are worth their own justification:

- **`access.denied` is the highest-signal event in the catalogue.** Under D56 an
  out-of-scope *resource* answers 404, which is indistinguishable from a typo and
  would be pure noise if recorded. A **403** is different: it means someone acted
  on a resource they *can* see, through a control the UI never drew for them. It
  essentially cannot occur in normal use, so it is near-zero volume and near-pure
  signal. **404s are deliberately not recorded** — they would bury the 403s.
- **`confirmation.revoked` is not `confirmation.invalidated`.** The first is an
  editor deliberately withdrawing a confirmation (D61); the second is a
  fingerprint ceasing to match because content changed (D60). Same visible
  outcome, entirely different fact — *"the editor decided this was wrong"* and
  *"a pipeline run touched it"* must not arrive as the same row.
- **`comment.amended` is not `comment.approved`.** Changing someone else's words
  on their behalf is a distinct act from endorsing them, and D35 keeps both texts
  precisely so it stays inspectable.
- **`login.failure` carries a reason but the response does not.** A disabled
  user's valid credentials look exactly like a wrong password to the caller —
  D56 requires that — while the record distinguishes them, because an ex-employee
  trying to get back in is worth being able to see.

**There is no `session.expired`.** Nothing performs it: a session ends by the
passage of time, so a lazy check fires only if the user returns and a session
abandoned forever would silently have no ending. The session row carries
`issued_at`, `last_seen` and `revoked_at` (D7), and `SESSION_TTL` gives expiry, so
the report **derives** the ending. Deriving beats emitting for something nobody
does.

**There are no `role.created`, `role.changed` or `role.deleted` events**, because
no such actions exist (D50). Roles are seeded.

`supervisor.changed` and `supervisor_flag.changed` are **separate events on
purpose**. Toggling `can_supervise` reshapes who is *eligible* to supervise —
altering the org chart — without any user's supervisor field changing, so a
single combined event would miss it entirely.

**Not every event is written by an endpoint.** Three arrive by other routes, and
each needs a writer that exists:

| Event | Written by |
|---|---|
| `comment.addressed` | the `comments` CLI, via the outbox (D59) |
| `process.edited` from a pipeline run or chat edit | git projection (D60) |
| `confirmation.invalidated` | git projection (D60) — nothing else can notice it |

### D43 — Presence is active time, not time since sign-in

Presence is accumulated into **activity intervals** — a small table of
`(session, started_at, ended_at)` rows, because a single `last_seen` scalar
cannot reconstruct past intervals and the reports need them.

Concretely: **a heartbeat every 60 seconds while the tab is visible**, and an
interval closes after **5 minutes** with no heartbeat and no request. Backdated
to the last heartbeat, not to the moment the gap was noticed.

**The heartbeat pauses when the tab is hidden.** This is the whole mechanism: a
heartbeat that runs regardless of visibility would record a screen left open in a
back office as eight hours of presence, which is exactly the dishonesty D43
exists to prevent. Closing a laptop lid, switching tabs and walking away all stop
it; returning starts a new interval.

Interval rows are not audit events — one per user per working session, not one
per minute — so this does not disturb D45's volume estimate.

### D44 — The reports

`GROUP BY` queries over the one table, filtered by `view_audit` scope: activity
by user (sign-ins, active time, sessions, last seen); report readership (who
opened what, how often, who downloaded); department access; failed sign-ins by
username and IP; permission history with the actor of every change; comment
throughput and where comments sit longest.

**Failed sign-ins are their own report, not a section of a user's page.** An
attempt against a username that does not exist belongs to no user — and that is
the signal worth having, since someone trying `09120000000`, `09121111111` and
`09122222222` in turn produces nothing on any real account's history. It is also
the only detection surface there is: no rate limit and no lockout exist (§13).

**`view_audit` follows content scope, not the supervisor tree** — unlike comment
visibility (D37). Comments are private communications that were deliberately
routed; the activity record is an operational record. An Admin scoped `*`
therefore sees activity across the whole company while being unable to read those
people's comments.

**Events that belong to no department are visible only at `*` scope.** A content
event names a department and filters by it; `login.success`, `access.denied`,
`user.created` and `visibility.policy.changed` name no department, so scoping
them is meaningless. They are shown to `view_audit` holders scoped `*` and to
nobody else. Moot in the current deployment — every `view_audit` holder is
`*`-scoped — but the model permits a scoped Admin, and a rule that only works by
accident is not a rule.

Note who does *not* hold it: `view_audit` is an Admin and Editor capability, so a
department head — a Reader (D11) — sees no activity report even for their own
branch.

### D59 — Events that cross the container boundary use an outbox

`comments resolve` runs inside control-bot, which sees `comments.db` and never
`app.db` (D5). Without a bridge it changes a comment's state and records nothing
— so the loop D39 exists for, where the agent fixes a process and closes the
comment, would leave no trace in the activity record and make NFR-14 false for
the one path the system advertises most.

**Mechanism.** An append-only `outbox` table inside `comments.db` — the one file
both containers share. The CLI appends; `ui-backend` drains into the activity
record. The agent still never touches `app.db`, so D5 holds exactly.

Four rules decide whether it actually holds:

1. **The drain stamps the actor. It never reads one from the payload.** The
   outbox sits in a file the agent can write by other means — that is D5's own
   argument about `python -c "import sqlite3"`. A trusted `actor` field would let
   a confused or hostile agent write audit rows in the Editor's name, which is
   worse than the gap being fixed. The row carries kind, target and payload;
   `ui-backend` assigns `actor = agent:control-bot` unconditionally.
2. **Replay is a no-op.** Two SQLite files means insert-into-`app.db` and
   mark-drained-in-`comments.db` cannot be one transaction, so a crash between
   them re-drains. The outbox row's monotonic id is carried into the activity row
   as a unique key.
3. **The event keeps its own timestamp.** The drained row uses the outbox row's
   `at`, not the drain time — otherwise the record shows a comment resolved at
   whatever moment someone next opened the UI.
4. **Drained every 30 seconds and before any activity-report query**, so a report
   never reads a stale record and a comment closed by the agent shows as closed
   within a minute.

**The tempting wrong answer** is to move the activity table into `comments.db`,
since both containers see it. That destroys D5: the point of two files is that
the record is unreachable from the runtime. The outbox is right because it moves
*data the agent is allowed to write* across the boundary, never write access to
the record.

Its only consumer is `comment.addressed`, plus any future comment action the CLI
grows. Content events do not use it — see D60.

### D60 — Content events are projected from git, not emitted by the engine

`process.edited` is emitted by `ui-backend` on save, but a pipeline `merge` run
or a chat edit changes content with `ui-backend` uninvolved. Git records those
(ARD §15's three write paths, each with a distinct author and message), so NFR-7
holds — but FR-L1 lists edits among what the activity record carries, and the
record would be empty for every change the analyst makes through Telegram.

**Routing `merge` through the outbox is the wrong fix.** `merge` is a
deterministic engine CLI governed by INV-1 and INV-2, used by the pipeline, by
chat edits and indirectly by the UI. Giving it a dependency on `comments.db`
couples the data engine to the comment system for a reason that has nothing to do
with either.

Instead, `ui-backend` **projects** content events from the record that already
exists: it walks `git log` in `data-repo` from its last recorded sha and emits
one event **per process touched per commit** — a commit rewriting twelve
processes produces twelve rows, because the readership and edit reports count
processes, not commits. The timestamp is the commit's. Git stays the
authoritative record of *what* changed; the activity record gains *that it
changed, by whom, when*.

Four details, each of which an implementation gets wrong by default:

- **The projection skips `ui-edit` commits.** Those were already recorded by the
  endpoint that made them, with a real user attached; projecting them too would
  double every UI save.
- **The actor** for a `pipeline(…)` commit is `run:{department}/{stamp}`, and for
  `chat-edit(…)` it is `agent:control-bot` — the same actor D59 stamps, since it
  is the same agent. Neither is a person, and neither pretends to be.
- **The marker is seeded at `HEAD` during migration.** Unseeded, the first run
  would project months of existing history into the activity record, backdated,
  as though it had been watching all along.
- **The marker is a sha, and history is not always linear.** If the stored sha is
  not an ancestor of `HEAD` — after a revert, a rebase or a force-push — the
  projection does not guess: it records the discontinuity, re-seeds at `HEAD`,
  and emits nothing for the gap. A wrong guess would either duplicate or silently
  skip.

**This is also the only writer of `confirmation.invalidated`.** Nothing
"invalidates" a confirmation under D20 — the fingerprint simply stops matching,
and no code path notices. Since a commit touching a process is exactly what stops
it matching, the projection checks each touched process against its stored
confirmation and emits the event once.

**The event is a notification, not the state.** Whether something displays as
confirmed is always the live fingerprint comparison of D20, never a flag. The
projection records `emitted_for_sha` on the confirmation row purely so the same
transition is not announced twice; if the change is later reverted and the
fingerprint matches again, the confirmation **is valid again**, because it is
still vouching for exactly the document it vouched for. A stale boolean would
reintroduce the field D20 chose a fingerprint to avoid.

**This is also the only writer of `confirmation.invalidated`.** Nothing
"invalidates" a confirmation under D20 — the fingerprint simply stops matching,
and no code path notices. Since a commit touching a process is exactly what stops
it matching, the projection pass checks each touched process against its stored
confirmation and emits the event once, marking the confirmation row stale so it
cannot re-emit. Without this the event in D42 is unwritable, and the *"which
flowcharts went dark and were never re-confirmed"* report (§13) has nothing to
read.

### D45 — Rows cannot be deleted through the UI

No endpoint deletes or alters them, for any role including Editor. Given the
Editor is the only source of `edit`, `confirm` and `set_visibility`, this is the
only thing that makes the record mean anything.

Retention is indefinite by default with a configurable purge, since "who read
what" is information about people. Any purge is a **scheduled server job, never a
button** — a screen that clears old rows would undo this decision. Purging the
live database does not purge the backups (D8), so backup retention must match.

---

## 9. Frontend rules that are part of the contract

Layout, components, tokens and states are in
`2026-08-05-frontend-system-design.md`. These four are here because they are
security- or architecture-relevant.

### D46 — One application, one sign-in, one permission system

No second application and no second credential.

### D47 — `GET /api/auth/me` returns a session descriptor

User, role, capabilities, scopes, supervisor, `can_supervise`, and
pending-approval count. The client derives affordances from it.

### D48 — The server enforces independently of the client

Client-side capability checks decide what to **draw** and nothing about what the
API **returns**. Every endpoint re-derives permission from the session row. A
hidden button is a nicety; the check behind it is the security.

Every write endpoint records the acting user, in the activity record and in the
commit trailer.

### D49 — Responsive is a requirement

Recorded as an NFR. Every screen is rebuilt regardless of design direction, since
`ui/src` contains no `@media` query, no Tailwind breakpoint prefix and no
`matchMedia` call.

---

## 10. Migration and rollout

**Seeding.** The seed process creates the four roles (D50) — including `Editor`,
which holds the three non-delegable capabilities and which **no API path can
recreate** — and creates **one** user: the analyst, as Editor scoped `*`, with a
mobile number and password supplied to the seed as parameters.

**`ui-users.json` is not migrated.** Its entries are bare names (`analyst`,
`manager`) with argon2 hashes, and D57 admits no username that is not a mobile
number. Inventing placeholder numbers would permanently occupy real numbers in a
uniqueness space that spans disabled accounts, and carrying the old hashes would
silently preserve credentials chosen under a different regime. Every other user
is created through the UI, by a person, with a real number. There are two of
them; this is a five-minute task, not a migration.

This also avoids inventing a "provisioned but unusable" account state that the
model does not have — `allows()` dereferences a role, and every user has exactly
one.

Because the seed is the only origin of `edit`, `confirm` and `set_visibility`, it
is also the only recovery path if every Editor account is lost. That belongs in
`docs/runbooks/06-changing-users.md`.

**Export readers.** The shared export credential is removed; anyone reading
exports today needs an account.

**`EXPORT_DIR` is emptied at cutover.** Its current contents are
`{kind}-{token}.html` where the token is an HMAC — hex strings of the same shape
as the new cache keys, in the same directories. Left in place, a lookup written
as *"find the `{kind}-*.html` in this folder"* — which is what today's code in
that very file does — would serve a **pre-migration document**: built before
confirmation existed, before the visibility filter existed, containing every
unconfirmed process. It is a cache; emptying it costs one regeneration.

**Confirmation.** Nothing is confirmed at start (D23) — no process and no
department overview. On day one every report is therefore empty, and an empty
report renders the empty state (F12) rather than 404: the reader is permitted to
see the report, and there is genuinely nothing in it yet. The wording says
nothing about *why* it is empty, which would be a derived signal about withheld
content (D56).

**The projection marker** is seeded at `HEAD` (D60), so no historical commit is
projected into the activity record.

**`data-repo` is untouched.** No schema change, no field added to `process.json`,
no change to `merge`, `layout`, `order`, `validate` or `allocate-id`. The only
engine addition is the `comments` CLI.

**Rollback** is redeploying the previous image. The two SQLite files are additive
and the process data never diverged.

---

## 11. Testing

1. **Permission resolution** — table-driven over roles, scopes and scope
   containment (D12), including that `dept:x` covers `dept:x/report:k` and that
   `dept:x/report:k` covers neither the department nor a second report.
2. **The delegation matrix (D13) in both directions** — every cell asserted as
   permitted *and* every excluded combination asserted as refused. Plus scope
   containment, strict-subset versus `manage_peers` equality, modification bound
   by the same checks against the resulting user, and self-edit rejection with
   own-password change as the sole exception.
3. **Supervisor candidate list (D52)** — one case per row of the eligibility
   table, plus cycle rejection and disabled-user exclusion. The multi-department
   case asserts the **rule** — candidates are those whose scopes cover every one
   of the new user's — not the deployment's incidental answer that only `*`
   holders qualify; a `can_supervise` user holding both departments must appear.
3a. **Disable, re-enable and the last Editor (D14)** — disabling revokes the
   user's sessions immediately and does not cascade; an Admin can neither disable
   nor re-enable an Editor; and disabling or re-roling the **last active Editor**
   is refused, since D53's `*`-holder invariant does not imply one.
4. **`delegable: false` (D50)** — asserted at the **data layer**, not against
   endpoints: the role-writing function refuses a role containing `edit`,
   `confirm` or `set_visibility` unless invoked by the seed. Testing it against
   "every role-writing endpoint" would iterate an empty set (test 17) and pass
   unconditionally. The point is that the guard survives someone later adding
   such an endpoint.
5. **The `*`-holder invariant (D53)** — no sequence of disable, scope-narrowing
   or role-change operations reduces the system to zero active `*`-scoped users.
6. **Negative tests per capability per endpoint** — a role lacking the capability
   is refused, pinned in both directions, with the **status taken from D56**:
   403 for a refused action on a resource the caller can see, 404 for anything
   out of scope. Not "401/403" — 401 is the unauthenticated case and belongs to
   neither, and an alternation here invites exactly the confusion test 10 exists
   to prevent.
7. **A Reader is served no user-administration surface (D54)** — user list, user
   detail and supervisor-picker endpoints all refuse, while comment payloads a
   Reader is entitled to still carry author and resolver names.
8. **Content filter** — no denylisted field appears in any response to a
   non-editor, over every endpoint.
9. **Response-body scan (D56)** — the load-bearing one. For **each role**,
   exercise every endpoint and assert the serialised body contains **no
   denylisted key, no out-of-scope id, no unconfirmed process id, and no
   tombstoned process id — anywhere in the body, at any depth.** A scan rather
   than per-field assertions, because the next leak will be in a field nobody
   thought to assert on. Includes: no `pending` count reaches a non-editor.

   **One exemption, and it is deliberate: comment anchor snapshots (D31).** A
   comment legitimately carries the id and label of a process that has since been
   tombstoned — that is the entire point of the snapshot, and D31's worked
   example is *"refers to a process since replaced by cashier-028"*. It may also
   carry an id outside the reader's scope, since a supervisor sees comments from
   a subtree whose members may hold scopes they do not. The scan therefore
   exempts the snapshot fields specifically, and asserts the exemption is narrow:
   the snapshot carries the recorded name and id and never live content.
10. **404 versus 403 (D56)** — a resource outside scope returns **404**; a
    refused action on a visible resource returns **403**. Both pinned, because
    the natural implementation returns 403 for both.
11. **Constant-time sign-in (D56)** — an unknown username takes the same time and
    returns the same message as a wrong password.
12. **Username normalisation (D57)** — Persian and Arabic-Indic digits, `+98`,
    `0098` and separator forms all resolve to one canonical account; uniqueness
    holds against disabled accounts.
13. **Anchors (D30)** — all four kinds round-trip through create → approve →
    `comments show`; **a comment on step *n* of the step-by-step report resolves
    to the same node id as a comment on that node in the flowchart**; no API path
    accepts a field narrowing; `process_list` and `department` on the same
    department remain distinguishable.
14. **Comment routing** — disabled hops, all-disabled chains, rejection restart,
    freeze-on-first-approval, orphaned anchors after a simulated `restructure`.
15. **Fingerprints** — what does and does not invalidate a confirmation; position
    changes must invalidate (D21).
16. **Audit completeness** — every state-changing **path, endpoint or CLI**,
    emits an event. Endpoints and CLIs both, because the original phrasing said
    "endpoint" and `comments resolve` is not one, which is exactly how
    `comment.addressed` came to be unwritable. Named explicitly: **`comments
    resolve` produces a `comment.addressed` row in the activity record.** Plus
    `supervisor.changed` and `supervisor_flag.changed` asserted separately.
16a. **The outbox preserves D5 (D59)** — three assertions, the last being the one
    that matters:
    - the drain is **idempotent**: replaying an undrained batch after a simulated
      crash produces no duplicate activity rows;
    - the drained event carries the **outbox row's timestamp**, not the drain
      time;
    - **an `actor` supplied in an outbox payload is ignored** and the row is
      recorded as `agent:control-bot`. If this test can be made to fail, the
      runtime can write audit rows in the Editor's name and D5 is decorative.
16b. **Git projection (D60)** — a pipeline `merge` run and a chat edit each
    produce a content event with the actor taken from the commit; re-running the
    projection emits nothing further; and a commit touching a confirmed process
    emits exactly one `confirmation.invalidated`, not one per projection pass.
16c. **Every catalogued event has a writer (D42)** — the inverse of 16. Walk the
    catalogue and assert each event is produced by exercising some path. An event
    named in the spec that no code can emit is the failure this catches, and it
    has already occurred three times.
16d. **`access.denied` fires on 403 and never on 404 (D42, D56)** — a Reader
    hitting an edit endpoint on their own department records one; the same Reader
    requesting another department's process records nothing, because that is a
    404 and 404s would bury the signal.
16e. **`login.failure` carries a reason that the response does not** — wrong
    password, unknown number and disabled account produce three distinct
    `reason` values and one identical response.
17. **Roles are immutable through the API (D50)** — no endpoint creates, edits or
    deletes a role, asserted with the acting user an Editor. Combined with test 4,
    this is what makes the capability table a fixed artefact.
18. **Route ordering** — the existing test pinning that the SPA catch-all mount
    cannot swallow API routes extends to every new prefix.
19. **The activity record is append-only (D45, NFR-14)** — no endpoint deletes or
    alters a row, asserted with the acting user an **Editor**. D45 calls itself
    *"the only thing that makes the record mean anything"* and had no test; this
    is the same shape as tests 4 and 17.
20. **`app.db` is mounted only into `ui-backend` (D5)** — asserted against the
    compose files, both stacks. Test 16a covers what the outbox does with an
    actor; only this covers the boundary the outbox exists to preserve.
21. **Password floor and session revocation (D58, D7)** — five characters are
    refused, six accepted; changing a password revokes the user's other sessions;
    an admin setting a password revokes all of that user's sessions.
22. **The report cache key (D27)** — changing the visibility policy changes the
    key, so a cached artifact is never served under a policy it was not built
    under; reordering a department changes the key; confirming a process changes
    it. The first of these is a content leak if it fails, not a stale page.
23. **Reading is not downloading (D25)** — a role holding `view` without
    `export_pdf` receives the rendered payload and **never the single-file
    artifact's bytes**, asserted on the body rather than the status code.
24. **Amendment retention (D35)** — the author's original text survives an
    amendment, a second amendment replaces the first rather than chaining, and
    both acts appear in the trail.
25. **Comment limits (D33)** — 2,000-character cap, empty text refused, a second
    open comment on the same anchor by the same author refused, rejection without
    a reason refused.
26. **Live routing (D34)** — reassigning a supervisor mid-chain sends the next
    hop to the new one while approvals already given keep their original
    attribution; a cycle created by two independent edits delivers to the editors
    rather than looping.
27. **Presence honesty (D43)** — a hidden tab stops accumulating; an interval
    closes 5 minutes after the last heartbeat and is backdated to it, not to the
    moment the gap was noticed.
28. **Audit scope (D44)** — a scoped `view_audit` holder sees content events for
    their departments and **no** access or governance events; a `*` holder sees
    both.
29. **Backups cover both files (D8)** — the backup job produces a restorable copy
    of `app.db` **and** `comments.db`. Without it NFR-7 is false and nothing else
    would notice.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| `ui/export/` imports eight modules from `ui/src/`, and its output is verified page-by-page against signed-off PDFs plus tests asserting on CSS source text | Freeze the shared surface behind an adapter, or budget full PDF re-verification |
| `merge restructure` orphans comment anchors | Snapshots (D31) keep orphans readable; they are surfaced, never silently repointed |
| Start-dark rollout means an empty system on day one | Deliberate (D23); 85 processes to confirm |
| Two SQLite files outside `git-push` | D8's backup path is not optional — without it NFR-7 is false |
| Host is 3.7 GB / 2 CPUs, already running a Claude Code runtime and chromium | D6 chooses SQLite partly for this reason |
| In-flight comments readable from the bot container | Accepted (D5); bounded blast radius |
| Losing every Editor account means the three non-delegable capabilities cannot be recreated through any API path (D50) | Deliberate. Recovery is the seed process; a runbook item, and the price of a guarantee that depends on no account's identity |
| All user administration is at `*` scope (D11), so every account is created by two or three people | Accepted. The load is small at this size; a scoped Admin role already exists in the model if it stops being small |
| Six-character passwords, guessable usernames, no lockout (D58) | Guessing is visible via D44; making it slow is the open item in §13 |

---

## 13. Open items

- **Lock-out after repeated failed sign-ins.** A sign-in policy, not a password
  one, and it matters more than it did: usernames are guessable by construction
  (D57), the password floor is six characters with no complexity rule, and no
  rate limit or lockout exists (ARD §18). The `CapacityLimiter(2)` bounds the
  *cost* of guessing at roughly thirty attempts a second; it does not bound the
  *rate*. The cheapest fixes — a lockout after N failures per username, a
  throttle at the proxy, or a deny-list of the most common passwords — change
  nothing about what a user types.
- **Activity-record retention.** Indefinite is chosen now (D45). At roughly
  15,000 rows a month this is a decision about holding a behavioural record of
  staff, not about storage. A two-tier scheme — monthly aggregates kept, row
  detail purged after N months — preserves the management value without the
  residue, at the cost of a rollup job.
- **A content-and-confirmation-history report.** `process.edited`,
  `confirmation.set`, `confirmation.invalidated` and `password.changed` are
  recorded (D42) but no report in D44 surfaces them. The most useful missing
  question is *"which departments have flowcharts that went dark and have not
  been re-confirmed"*, since unconfirmed content is invisible to everyone (D22).
- **Telegram identity per user.** Would unblock three things at once: approver
  notification (D40), out-of-band credential delivery (D15), and `upload` /
  `run_pipeline` as real capabilities (D9). Needs verification of number
  ownership, which D57 explicitly does not provide.
- **Further report kinds.** The registry (D26) is built for more; none are
  specified.
