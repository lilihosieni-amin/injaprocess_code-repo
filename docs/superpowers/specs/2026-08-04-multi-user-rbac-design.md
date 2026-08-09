# Multi-User RBAC, Comments and Audit — Design

| | |
|---|---|
| **Date** | 2026-08-04, access model revised 2026-08-05 |
| **Status** | Approved design; `PRD.md` v0.6 and `ARD.md` v0.4 amended to match; implementation split across P0–P4, each needing its own plan |
| **Supersedes** | PRD §4 (multi-user non-goal), NFR-11, `2026-07-26-department-export-design.md` D25–D31 |
| **Companion** | `PRD.md`, `ARD.md` |

---

## 1. Summary

The system becomes multi-user. One login, one UI, one permission system. The
separate "export" surface — its own credential, its own cookie, its own login
page, its own permanent links — is retired and replaced by **reports** inside the
application, reachable according to what each user is allowed to see.

Four capabilities are added that the system has never had: **who is acting**
(every write attributed), **what each person may reach** (role- and
scope-based permissions), **what happened** (an audit log), and **what people are
telling the editor** (comments routed up a supervisor chain).

### 1.1 What this is not

This spec fixes architecture, data model and rules. It does **not** decide page
layouts, navigation structure, or which visual surface each role gets. That work
is a separate phase, run after `PRD.md` and `ARD.md` are amended (§11.6).

### 1.2 Scope decomposition

The work is too large for one implementation plan. Each row below gets its own
spec and plan.

| | Sub-project | Depends on |
|---|---|---|
| **P0** | Identity & access foundation — users, roles, grants, sessions, delegation, password self-service, capability-aware endpoints, attributed writes | — |
| **P1** | Content-visibility filter + confirmation fingerprints | P0 |
| **P2** | Reports unification, download permission, export-access retirement | P0, P1 |
| **P3** | Audit logging and activity reports | P0 |
| **P4** | Comments, approval chain, `comments` CLI | P0, P3 |

Frontend design and the responsive build run as their own track against these.

---

## 2. Architecture — where state lives

### D1 — Three stores, one job each

| Store | Holds | Written by |
|---|---|---|
| `data-repo` (git, unchanged) | Departments, processes, overviews, order, transcripts, runs | engine CLIs only |
| `app.db` (new, SQLite) | Users, roles, capabilities, user scopes, supervisor edges and `can_supervise`, sessions, visibility policy, confirmations, audit log | `ui-backend` only |
| `comments.db` (new, SQLite) | Comments and their approval workflow | `ui-backend` and the `comments` CLI |

`data-repo` remains the source of truth for **what the processes are**. It gains
no fields, no new files under `departments/`, and no schema changes. INV-1
through INV-6 survive untouched.

### D2 — ARD §13.1's "No ORM/database" is amended, deliberately and narrowly

Process content stays on the filesystem in git because it must be diffable,
reviewable and restorable. Sessions, audit events and a mutable user list are
none of those things. A page-view committed per row would destroy the history
that makes the first rule worth having.

The amendment covers operational state only. No process content moves into a
database.

### D3 — ARD §1's "the filesystem is the only point of connection" survives

`ui-backend` and `control-bot` still never call each other over the network. They
share a file, exactly as they already share `data-repo`. This is why the CLI
approach (D4) was chosen over exposing an HTTP endpoint for the runtime to call.

### D4 — The Telegram runtime reaches comments through a CLI, not the database

A new deterministic CLI, `comments`, is added to `engine/` and baked into the
`control-bot` image alongside the existing CLIs — outside `APPROVED_DIRECTORY`,
matching `deploy/control-bot.Dockerfile:24-26`. `comments.db` is mounted into
that container; `app.db` is not.

Verified preconditions: `engine/` is already `pip install`ed into the control-bot
image and on `PATH`; `data-repo/.claude/hooks/guard.py` blocks only writes outside
`data-repo` and Bash commands that *both* mutate and reference a protected path,
so a `comments` invocation passes; SQLite is already used in this stack
(`control-bot-state:/state`).

### D5 — Two database files, not one

`app.db` is never mounted into any container but `ui-backend`. The audit log is
therefore unreachable from the runtime by any means, rather than protected by a
convention.

This matters because "everything goes through the CLI" is not enforceable from
inside the container: the control-bot image is `FROM python:3.11-slim`, so
`python -c "import sqlite3; …"` reaches any mounted file directly, and `guard.py`'s
mutation heuristic does not match it. The repo's own doctrine already accepts
this — ARD §7 states the Bash guard is *"a deliberately conservative heuristic …
pattern matching on a shell string, not a filesystem-level lock"*, which is why
INV-1 is defended at the file level and not only by the sanctioned CLI.

The split also keeps the high-frequency audit writer out of the one file that has
two cross-container writers.

**Accepted consequence:** in-flight and rejected comments live in `comments.db`,
which *is* mounted into the bot container. The CLI filters to approved-only
(D37), but that filter is a convention. The worst realistic case is a confused
agent surfacing a draft to an editor — who sits at the top of every chain and is
the authorised destination for approved comments anyway.

### D6 — SQLite, not a server database

Evaluated against MySQL/PostgreSQL and rejected on this host and this workload:
3.7 GB RAM and 2 CPUs already running the Telegram Bot API server, two bots (one
a full Claude Code runtime), FastAPI, and headless chromium peaking at 300–400 MB
per PDF render, with `ui-backend` capped at 1 GB for that reason. Nine
departments, dozens of users, a few hundred page views a day and a handful of
comments a week is a rounding error of SQLite's capacity in WAL mode.

A server database's real advantage is `GRANT`-level isolation — enforced by the
engine on every statement rather than by a compose file. That was weighed against
~400 MB, a container, and a mysqldump-plus-credential backup path, and declined.

**Revisit when:** `ui-backend` needs more than one worker process. It is
single-process `uvicorn` today and `storage.py`'s locks are already in-memory and
per-process, so SQLite costs nothing at present. If that changes, PostgreSQL is
preferred over MySQL for stricter typing, better JSON handling for grant and
anchor structures, and better constraint support.

### D7 — Sessions move server-side

The cookie today *is* the session: a signed `{"u": username}` blob with nothing
to revoke. That cannot support immediate access removal, "who is in the system
now", or presence measurement.

A session becomes a row: id, user, issued-at, last-seen, IP, user agent,
revoked-at. The cookie carries an opaque session id. Disabling a user or changing
their permissions takes effect on the next request.

### D8 — A new backup path is required

`git-push` covers `data-repo` twice daily and will not touch either SQLite file.
NFR-7 promises *"no change goes unrecorded"* and an off-site backup twice a day;
without a second mechanism that promise becomes false for users, permissions and
the entire audit log. Implemented as `sqlite3 .backup` of both files on the same
schedule, shipped alongside the existing push.

---

## 3. Identity, roles and access control

> **Revised 2026-08-05 (D9–D15 rewritten; D50–D54 added).** The first version of
> this section used five preset roles carrying a numeric `level` and a typical
> scope, plus per-user capability overrides. All three are withdrawn. A level is
> an ordinal *proxy* for "has less authority", maintained by hand, and it can
> disagree with the truth — which is why the first version needed `manage_peers`
> as a patch the moment an Overseer had to create an Overseer. Comparing
> capability sets computes the property directly, so it cannot drift. Scope moved
> off the role because a role that carries one folds two independent things into
> one column, and "head of two departments" was a special case as a result.
> Overrides are gone because they were a second, invisible permission system
> *and* because the subset comparison below is only well-defined when a user's
> capabilities come from exactly one place.
>
> Old → new: Overseer = **Admin** + `*`. Department head = **Reader** +
> `dept:x` + `can_supervise`. Department viewer = **Reader** + `dept:x`. Report
> reader = **Reader** + `dept:x/report:k`.

**Three independent axes. None is ever folded into another.**

1. **Role** = a set of capabilities. No scope, not even a default. No level.
2. **User** = one role + one or more scopes. Scope lives here and nowhere else.
3. **Supervisor** = an org-chart fact. It routes comments and grants nothing.

### D9 — Capabilities

Nine. Three of them carry `delegable: false`.

| Capability | Permits | Scope-aware | Delegable |
|---|---|:-:|:-:|
| `view` | See a department, its processes, flowcharts and reports within scope | ✅ | ✅ |
| `comment` | Create comments on a department, process or node within scope | ✅ | ✅ |
| `export_pdf` | Download a report as PDF or standalone single-file HTML | ✅ | ✅ |
| `manage_users` | Create, modify and disable users | ❌ | ✅ |
| `manage_peers` | Additionally create users whose capability set equals one's own | ❌ | ✅ |
| `view_audit` | Read the activity and logging reports, within scope | ✅ | ✅ |
| `edit` | Modify process content, department overview, process order | ✅ | ❌ |
| `confirm` | Confirm a flowchart or department overview | ✅ | ❌ |
| `set_visibility` | Change the global content-visibility policy | — | ❌ |

Approving a comment is **not** a capability. It is inherent to being someone's
supervisor — nothing to grant, nothing to forget to grant.

**Deliberately absent: `upload` and `run_pipeline`.** Sending voice notes and
starting a processing run happen in Telegram, where both bots authenticate by
**numeric Telegram ID against a static allowlist** (NFR-1) — no session, no user
record, and no route to `app.db`, which D5 mounts only into `ui-backend` on
purpose. A capability that appears in the permission UI and enforces nothing is
worse than one that does not exist, so Telegram intake stays gated exactly as it
is today. Adding them later means first giving users a Telegram identity and the
bots a way to resolve it.

### D50 — `delegable: false` is a property of the capability row

Only the seed process may create a role holding a non-delegable capability. **No
API path creates one, for anyone, including an Editor.**

This deliberately replaces an earlier recommendation that role definitions be
"level-0 only". That was an identity check, and identity checks rot: add a second
administrator, rename a user in a migration, and the guarantee evaporates
silently. As a property of the capability, "no UI path can ever mint a role that
edits content" is a data invariant with a one-line test and no privileged
username anywhere in the code.

New roles may be freely composed from the six delegable capabilities. Two likely
additions, not built now: **Contributor** and **Reader (no download)** =
`view` + `comment`.

### D10 — Scope grammar

Three shapes, strictly nested:

```
*  ⊃  dept:{code}  ⊃  dept:{code}/report:{kind}
```

`report:{kind}` names an entry in the backend report registry (D26). There is
deliberately no `process:{id}` scope: department- and report-level access covers
the stated need, and process-level would multiply the permission UI for a case
that has not arisen.

**A user may hold several scopes.** A head of two departments is one user with
`dept:dining` and `dept:cashier` — not a special case.

**Propagation:**

- A grant on `dept:x` **includes reports added later**. Scope is the department.
- A grant on `dept:x/report:k` **never widens**. A new report is invisible until
  granted.

### D11 — Preset roles

Roles are rows in a table, not `if` statements. Three presets; a fourth is a form
fill.

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

The intended deployment:

| Person | Role | Scope | `can_supervise` |
|---|---|---|:-:|
| The analyst | Editor | `*` | — |
| Deputy manager | Admin | `*` | — |
| Department head | **Reader** | `dept:dining` (+ others) | **✅** |
| Department viewer | Reader | `dept:dining` | – |
| Report reader | Reader | `dept:dining/report:steps` | – |

**A department head is a Reader carrying the supervisor tag.** They read,
comment, download and approve their people's comments — and they create no users
and see no user-administration surface at all (D54). This reverses an earlier
requirement that department heads appoint their own subordinates: **all user
administration is centralised at `*` scope.** They also hold no `view_audit`, so
they cannot see activity reports even for their own branch.

Scoped Admins (`Admin` + `dept:dining`) are legal in the model and absent from
the intended deployment.

### D12 — Resolution

```
allows(user, capability, target)
  ⟺  user.role.capabilities ∋ capability
  ∧  ∃ s ∈ user.scopes : s contains target
```

That is the whole rule. **There are no per-user overrides** — no override table,
no per-user capability list, no deny list. An exception becomes a new role.

The cost is a handful more roles; the gain is that "why can Ali download?" has
exactly one answer in exactly one place, and that the subset comparison in D13 is
computable at all.

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
so nobody can escalate an existing account past their own.

**Nobody may edit their own record.** Changing one's own password from the
profile page is the only exception. Setting another user's password is a direct
action bound by the same two checks — see D15.

**Editing a role definition** is bound by the same subset rule as creating one,
and non-delegable capabilities can never be added (D50). A holder of
`manage_users` can therefore never raise a role above their own authority. They
*can* narrow a role held by users outside their scope — a downgrade with a blast
radius wider than their own reach. That is accepted and named rather than
designed around; the alternative is per-role ownership, which is machinery this
does not need.

### D51 — Supervisor is an independent axis

Every user has a supervisor, **except users scoped `*`**, for whom it is
optional. The supervisor determines comment approval routing (D34) and nothing
else.

A separate boolean, **`can_supervise`**, marks a user as eligible to be chosen as
someone's supervisor. It is set by a holder of `manage_users` and **grants no
permissions**. It exists because with the level concept gone there is nothing
left from which to infer that someone sits above their department — org position
is a fact asserted about a person, not something derivable from their
permissions. A Reader may supervise a Reader.

### D52 — Supervisor eligibility

Eligible = **active**, **and** their scope covers the new user's scope, **and**
(`can_supervise` **or** scope `*`).

| New user's scope | Candidates |
|---|---|
| `dept:dining` | `can_supervise` users on dining, plus all `*` holders |
| `dept:dining/report:steps` | same |
| `dept:dining` + `dept:cashier` | `*` holders only — nobody else covers both |
| `*` | `*` holders only |

Default to the creator when eligible. Reject: self, disabled users, anyone whose
scope does not cover, and any choice creating a cycle.

Candidates are displayed **with their scope beside their name** — "Ali Rezaei —
dining", "Maryam Ahmadi — all departments". Past thirty users, the reason someone
appears in the list is otherwise invisible.

### D53 — At least one active `*` holder always exists

The candidate list is never empty because at least one active `*`-scoped user
always survives. That is true, but only *emergently*: it holds because **nobody
may edit their own record** (D13), so the last actor standing cannot remove
themselves, narrow their own scope, or disable their own account.

Two rules that look unrelated, one holding the other up. It is written here as an
**explicit invariant with its own test** so that a later "delete user" endpoint,
or any relaxation of the self-edit ban, fails a test rather than silently locking
everyone out of user administration.

### D54 — A Reader sees no user-administration surface

No user list, no user detail, no admin screens, no supervisor picker — a Reader
holds no `manage_users` and is served nothing about anyone else's account.

**The exception, which is not one:** names that appear *inside a comment the
Reader is entitled to read*. A department head approving their branch's comments
necessarily sees the author (D37), and everyone who could see a comment sees who
resolved or rejected it and why (D38). Without that the comment system is
unreadable. The boundary is the **user-administration surface**, not the
appearance of a name in content already routed to them.

### D14 — Disabling a user never blocks and never cascades

Disabling is immediate and revokes their sessions at once. It does not require
reassigning their subordinates first — being able to remove access quickly is the
point.

Subordinates keep pointing at the disabled supervisor in the record, because
rewriting history to claim someone always reported elsewhere is a lie. The user
admin screen surfaces *"N users report to a disabled supervisor"* with a reassign
action, so the gap is visible rather than discovered later.

Disabling does not cascade to subordinates, and the disabled user's own in-flight
comments continue up the chain — a valid complaint does not become invalid
because the person who raised it left.

### D15 — Credentials

Usernames and passwords are created in-system by whoever creates the user.
Passwords are argon2-hashed as today (`argon2-cffi`), stored in `app.db`, and
every user can change their own from their profile — the sole exception to the
self-edit ban (D13). The read-only-mounted `ui-users.json` is retired: it cannot
support self-service change.

**A holder of `manage_users` sets another user's password directly**, choosing
the value themselves, bound by the same two checks as any other modification
(D13). No token, no expiring link, no round-trip — the administrator types the
new password and tells the person what it is.

This was specified as a single-use token first, on the reasoning that an
administrator who knows a password can sign in as that user and leave the audit
log attributing their actions to that person. **Overruled deliberately, and the
reasoning did not survive contact with the deployment:** there is no out-of-band
delivery channel here — no email addresses on user records, no SMS, and Telegram
notification deferred (D40) — so the administrator issuing a token would be the
one handing it over, and could consume it themselves. The token bought
detection, not prevention, at the cost of a round-trip for a deputy manager
standing next to a waiter.

What remains is the honest guarantee, and it is recorded rather than dressed up:

- **The fact is always on record.** `password.set_by_admin` names the actor and
  the target (D42), so a password set by someone else is never invisible, and a
  sign-in shortly afterwards from the setter's own address is a visible pattern.
- **Impersonation is detectable, not prevented.** Anyone holding `manage_users`
  can set a password and then sign in as that user. That is inherent to the
  workflow chosen, and it is why `manage_users` is confined to Editors and
  Admins scoped `*` (D11).

Closing it properly would mean putting a Telegram id on the user record and
delivering credentials through the bot — which shares its plumbing with D40's
deferred approver notifications, and is the natural moment to revisit this
(§13).

---

## 4. Content visibility

### D16 — One global policy, editable only by `set_visibility`

What is shown of a process applies **identically to every non-editor**. It is not
a grant, not per-role, not per-department.

The reason is structural: if field visibility were an ordinary capability,
anyone holding `manage_users` could confer it, and internal content would leave
the system without an Editor ever deciding. Instead `set_visibility` is
`delegable: false` (D50), so no role holding it can be created through any API
path — a stronger guarantee than restricting the action to a privileged account,
because it depends on no account's identity.

What varies between users is *which departments and reports they can reach* —
never *which fields*.

### D17 — Policy defaults reproduce today's export exactly

Derived from `exports.py` `PUBLIC_PROCESS_KEYS` and `_public_node`, so nothing
becomes visible on migration day that is not visible today.

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

The bottom four are internal bookkeeping, not content. NFR-12 already forbids
them leaving the system; that rule now governs every API response rather than
only exports.

### D18 — One filter, applied server-side to every response

The visibility strip moves out of `exports.py` and becomes a single filter over
every response the API sends, driven by the policy plus the caller's
capabilities. Reports, the flow canvas, the detail drawer and the department
overview all read through it.

One implementation means one place to be wrong and one place tests can pin. As
today, the strip happens in the payload, not in CSS — a reader with dev tools
finds nothing hidden.

### D19 — Every policy change is an audited event

`visibility.policy.changed`, with the actor, the field, and both values.

---

## 5. Confirmation

### D20 — A confirmation is a content fingerprint, not a boolean

Stored in `app.db` as `(target, fingerprint, confirmed_by, confirmed_at)` where
target is a process id or a department code. The target displays as confirmed
only while its *current* fingerprint matches the stored one.

A boolean field would have to be cleared correctly by all three write paths — the
UI's Save, a chat-edit via Telegram, and a pipeline `merge` run — and missing one
would leave the mark attesting to something stale, which is the exact failure the
mark exists to prevent. A fingerprint self-invalidates for every path, including
paths added later, with no change to `merge` and no field on `process.json`.

### D21 — The fingerprint is the whole document minus `updated_at`

Node positions count. Moving a node, or running the re-layout, un-confirms the
process — the diagram's appearance is part of the document. Nothing to enumerate
and nothing to argue about later.

### D22 — Unconfirmed content is invisible to non-editors

A process or department overview that carries no valid confirmation does not
appear for any user without `edit`. Reports render only confirmed processes.

### D23 — The system starts dark

No bulk confirmation at migration. All 85 existing processes (21 dining, 26
logistics, 38 cashier) start unconfirmed, so non-editors see an empty system
until each is reviewed and confirmed.

**Accepted consequence:** because a confirmation is invalidated by any edit, a
pipeline run makes a department head's flowcharts disappear until re-confirmed.
Every voice run therefore creates re-confirmation work.

---

## 6. Reports and the retirement of "export"

### D24 — "Export" as a separate system is retired

Removed: `EXPORT_USERNAME` / `EXPORT_PASSWORD_HASH`, the `inja_export_session`
cookie, `export_auth.py`, the server-rendered Persian login page, the `/exports`
route and its permanent per-department links.

This reverses **NFR-11** and export-design decisions **D25–D31**, which required
the separation to be structural rather than a check. That requirement existed
because export readers had no accounts. They now do, and one permission system
replaces two credential systems. Recorded in the ARD as a dated reversal in the
style §7 and PRD §4 already use.

### D25 — Downloads survive as a permission

`export_pdf` produces the PDF and the standalone single-file HTML, both of which
already exist and are tested. FR-E3 (opens with no server), FR-E5 (printable,
nothing cut across a page boundary) and FR-E9 (a downloaded copy opens forever)
remain true of the downloaded artifact.

### D26 — Reports come from a backend registry

Today `EXPORT_KINDS` in the backend and `KINDS` in `ExportMenu.tsx` are two lists
kept in sync by hand. They are replaced by one registry served to the frontend.
Adding a report is one registry entry plus its renderer, and it appears in the
permission UI automatically.

### D27 — Generated artifacts are a fingerprint-keyed cache

`EXPORT_DIR` remains, but as a cache keyed by `(department, report, content
fingerprint)` rather than a published permanent path. A chromium render happens
once per version and is reused until content changes.

This matters because a render takes tens of seconds and is serialised
process-wide by a module lock (D22 of the export spec); without caching, ten
simultaneous downloads is a ten-minute queue.

INV-6 still holds: derived, disposable, regenerable, never read back in.

### D28 — FR-E4's permanent link is withdrawn

There is no longer a stable public URL per department+kind. A report is reached
by navigating to it as a signed-in user, and downloaded on demand.

### D29 — One flowchart renderer

`ui/export/flowchart/parity.test.tsx` already fails the build on a forked node or
edge component. That guarantee extends to every surface a flowchart appears on.

---

## 7. Comments

### D30 — Anchors

| Kind | Target | Example |
|---|---|---|
| `department` | department code | `dining` — its general information |
| `process` | process id | `cashier-013` — the flowchart as a whole |
| `node` | node id | `cashier-013-n002` — one step or junction |

Optionally narrowed to a named field. The node is the finest durably addressable
unit in the data model: node ids embed their process id, are never reused, and
are globally unique.

### D31 — Every anchor carries a snapshot

Captured at comment time: department name, process name, node label text.

This exists because **`merge restructure` mints brand-new process *and* node
ids**, tombstones the originals with `superseded_by`, and records no node-level
mapping between old and new. That path runs in production regularly. Without a
snapshot a comment decays into a dangling id; with one it still reads as a
coherent statement, and a comment on a tombstoned process surfaces as *"refers to
a process since replaced by cashier-028"* rather than vanishing.

Anchors are never repointed automatically. Orphaning is surfaced, not guessed at.

### D32 — Identity: `CMT-{n}`

A monotonic integer from `comments.db`, never reused. Same principle as INV-1 —
one deterministic source, never an LLM — with a different ledger, because
comments are not `data-repo` content. Short enough to quote in Telegram.

### D33 — Lifecycle

| State | Meaning |
|---|---|
| `draft` | not yet submitted |
| `awaiting` | sitting with one named approver |
| `approved` | cleared the chain; visible to every `edit` holder and to the CLI |
| `addressed` | closed by an editor or by the AI, optionally with a commit id |
| `rejected` | returned to the author with a reason |
| `withdrawn` | pulled back by the author before any approval |

Nothing is ever hard-deleted. `withdrawn` and `rejected` are states, not row
removals — the same doctrine as INV-4, and necessary because a supervisor
rejecting a complaint must leave a trace.

### D34 — Routing climbs the supervisor tree

The comment moves from the author up the supervisor edges. It becomes `approved`
the moment the next hop would be a user holding `edit` — an editor does not
approve their own inbox. If the chain reaches a root with no editor above it, it
becomes `approved` there and goes to all editors.

Disabled users are skipped, and the trail records *"hop skipped — supervisor
disabled"*. Comments already sitting with a disabled user move up automatically.
If every hop above is disabled the comment reaches the editors: a comment nobody
can approve is better delivered than stuck.

### D35 — An approver may approve, reject, or edit-then-approve

Approve-with-edit keeps both texts. The author's original words are never
overwritten; the edited version travels onward and the difference stays in the
record, because *"my supervisor changed what I said"* must be inspectable.

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

The escape hatch is that **any approver in the chain may reject**, returning it to
the author. Stopping an in-progress comment requires someone accountable to act
and leaves a record.

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
their in-flight comment stays in the chain and they simply stop seeing it.

### D38 — Resolution and rejection are visible to everyone who saw the comment

When a comment becomes `addressed`, its whole audience — author, every supervisor
in the chain, and editors — sees who closed it, when, the note, and the commit
link if the AI closed it. The author is badged. Rejections are equally visible,
with the rejecting supervisor's name and reason. If you can see the comment, you
can see what happened to it.

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

This makes the intended loop real: *«برو مشکل کامنت CMT-42 رو درست کن»* → the AI
reads the anchor, edits through `merge`, commits, and marks the comment addressed
with the commit id attached.

### D40 — Notification is in-app only

A badge for the approver, plus a **"waiting longest"** list on the approver's
screen and on the editor's, so a department head sitting on their branch for a
week is visible without any notification system. Telegram notification to
approvers is deliberately deferred; it would require a Telegram id on every user
record and a delivery path that does not exist.

---

## 8. Audit and activity reporting

### D41 — One append-only table

Columns: `at`, `actor`, `session`, `action`, `target`, `ip`, `user_agent`,
`outcome`. In `app.db`, never mounted elsewhere (D5).

### D42 — Event catalogue

**Access** — `login.success`, `login.failure` (with attempted username),
`logout`, `session.expired`, `session.revoked`, `password.changed`.

Today successful logins are never logged, and only *export* login failures are;
`docs/runbooks/02-secrets-and-auth.md` states it plainly: *"there is no line
marking the moment guessing stops being guessing."* That gap closes here.

**Content** — `department.viewed`, `process.viewed`, `report.viewed`,
`report.downloaded` (with format), `process.edited`, `process.confirmed`,
`confirmation.invalidated`.

**Governance** — `user.created`, `user.modified`, `user.disabled`,
`password.set_by_admin`, `role.assigned`, `role.created`, `role.changed`,
`scope.granted`, `scope.revoked`, `supervisor.changed`,
`supervisor_flag.changed`, `visibility.policy.changed`, `comment.created`,
`comment.approved`, `comment.rejected`, `comment.addressed`.

`supervisor.changed` and `supervisor_flag.changed` are **separate events on
purpose**. Toggling `can_supervise` reshapes who is *eligible* to supervise —
altering the org chart — without any user's supervisor field changing, so a
single combined event would miss it entirely.

### D43 — Presence is measured as active time, not time since login

Derived from the session row's `last_seen`, refreshed by a lightweight heartbeat
while a tab is open, and accumulated as intervals of continuous activity with a
timeout. Closing a laptop lid ends an interval rather than recording eight hours
of presence. The reported figure is honest.

### D44 — The reports

All `GROUP BY` queries over the one table, filtered by `view_audit` scope:
activity by user (logins, active time, sessions, last seen); report readership
(who opened what, how often, who downloaded); department access; failed logins by
username and IP; permission history with the actor of every change; comment
throughput and where comments sit longest.

**`view_audit` follows content scope, not the supervisor tree** — unlike comment
visibility (D37). Comments are private communications that were deliberately
routed; audit is an operational record. An Admin scoped `*` therefore sees
activity across the whole company while being unable to read those people's
comments.

Note who does *not* hold it: `view_audit` is an Admin and Editor capability, so a
department head — a Reader (D11) — cannot see activity reports even for their own
branch.

### D45 — Audit rows cannot be deleted through the UI

No endpoint exists to delete them, for any role including Editor. Given that the
Editor is the only source of `edit`, `confirm` and `set_visibility`, this is the
only thing that makes the log mean anything.

Retention is indefinite by default — the volume is trivial at this scale — with a
configurable purge older than N months, because "who read what" is personal data
and keeping it forever should be a choice.

---

## 9. Frontend architecture

Layout, navigation and visual design are **out of scope for this spec** and are
decided in a later phase (§11.6). What is fixed here:

### D46 — One SPA, one login, one permission system

No second application and no second credential.

### D47 — `GET /api/auth/me` returns a session descriptor

User, role, capabilities, scopes, supervisor, `can_supervise`, and
pending-approval count. The client derives affordances from it. No level — there
isn't one (D11).

### D48 — The server enforces independently of the client

Client-side capability checks decide what to **draw** and nothing about what the
API **returns**. Every endpoint re-derives permission from the session row. A
hidden button is a nicety; the check behind it is the security.

Related: every write endpoint currently binds the session user to `_` and
discards it, and every commit is authored `ui-edit`. Writes become attributed.

### D49 — Responsive is a requirement

Recorded as an NFR. `ui/src` currently contains no `@media` query, no Tailwind
breakpoint prefix and no `matchMedia` call; every screen is rebuilt regardless of
which design direction is chosen.

---

## 10. Migration and rollout

**Seeding.** The seed process creates the three preset roles — including the
`Editor` role, which holds the three non-delegable capabilities and which **no
API path can ever recreate** (D50) — and makes the current analyst an Editor
scoped `*`. Any other `ui-users.json` entry becomes a user requiring a role,
scope and supervisor before it can sign in.

Because the seed is the only origin of `edit`, `confirm` and `set_visibility`, it
is also the only recovery path if every Editor account is lost. That is a
deliberate trade and belongs in the runbook.

**Export readers.** The shared export credential is removed; anyone reading
exports today needs an account.

**Confirmation.** Nothing is confirmed at start (D23).

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
2. **The delegation matrix (D13) in both directions** — every cell of the
   creator → creatable table asserted as permitted *and* every excluded
   combination asserted as refused. Plus: the scope-containment constraint, the
   strict-subset rule versus `manage_peers` equality, modification bound by the
   same checks against the resulting user, and self-edit rejection with
   own-password change as the sole exception.
3. **Supervisor candidate list (D52)** — one case per row of the eligibility
   table, plus cycle rejection, disabled-user exclusion, and the
   multi-department case resolving to `*` holders only.
4. **`delegable: false` (D50)** — **no API path creates a role holding `edit`,
   `confirm` or `set_visibility`**, asserted against every role-creating and
   role-editing endpoint, with the acting user an Editor. If this test can be
   made to pass by an Editor, the guarantee is gone.
5. **The `*`-holder invariant (D53)** — no sequence of disable, scope-narrowing
   or role-change operations can reduce the system to zero active `*`-scoped
   users, given that nobody may edit their own record.
6. **Negative tests per capability per endpoint** — a role lacking the capability
   gets 401/403, pinned in both directions. This rebuilds for capabilities the
   discipline the current suite applies to export-vs-admin session isolation (an
   export session getting 401 from `/api/departments`).
7. **A Reader is served no user-administration surface (D54)** — user list,
   user detail and supervisor-picker endpoints all refuse, while comment
   payloads a Reader is entitled to still carry author and resolver names.
8. **Content filter** — no denylisted field ever appears in any response to a
   non-editor, asserted over every endpoint, not only reports.
9. **Comment routing** — disabled hops, all-disabled chains, rejection restart,
   freeze-on-first-approval, orphaned anchors after a simulated `restructure`.
10. **Fingerprints** — what does and does not invalidate a confirmation; position
    changes must invalidate (D21).
11. **Audit completeness** — every state-changing endpoint emits an event, with
    `supervisor.changed` and `supervisor_flag.changed` asserted separately.
12. **Route ordering** — the existing test pinning that the SPA catch-all mount
    cannot swallow API routes must be extended to any new prefix.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| `ui/export/` imports eight modules from `ui/src/`, and its output is verified page-by-page against signed-off PDFs plus tests asserting on CSS source text | Freeze the shared surface behind an adapter, or budget full PDF re-verification |
| `merge restructure` orphans comment anchors | Snapshots (D31) make orphans readable; they are surfaced, never silently repointed |
| Start-dark rollout means an empty system on day one | Deliberate (D23); 85 processes to confirm |
| Two SQLite files outside `git-push` | D8 backup path is not optional — without it NFR-7 is false |
| Host is 3.7 GB / 2 CPUs, already running a Claude Code runtime and chromium | D6 chooses SQLite partly for this reason |
| In-flight comments readable from the bot container | Accepted (D5); bounded blast radius |
| Losing every Editor account means `edit`, `confirm` and `set_visibility` cannot be recreated through any API path (D50) | Deliberate. Recovery is the seed process; it belongs in the runbook, and it is the price of a guarantee that depends on no account's identity |
| All user administration is centralised at `*` scope (D11), so every account for every department is created by two or three people | Accepted on instruction. The load is small at this size; if it stops being small, a scoped Admin role already exists in the model |

---

## 13. Open items

- **Telegram notification to approvers** — deferred (D40). Needs a Telegram id
  per user and a delivery path.
- **Password policy** — minimum length, forced change on first login, and lockout
  after repeated failures are unspecified. Note that no rate limiting exists
  today on any login endpoint (ARD §18).
- **Audit retention default** — indefinite is chosen now; a purge period should
  be set once real volume is known.
- **Report registry contents beyond `flowchart` and `steps`** — the mechanism is
  designed for more; none are specified.
- **`upload` and `run_pipeline` as capabilities** — dropped from v1 (D9). Adding
  them means giving users a Telegram identity and giving the bots a way to
  resolve it without breaking D5's mount boundary.
- **A content-and-confirmation-history report** — `process.edited`,
  `process.confirmed`, `confirmation.invalidated` and `password.changed` are
  recorded (D42) but no report in D44 surfaces them. The most useful missing
  question is *"which departments have flowcharts that went dark and have not
  been re-confirmed"*, since unconfirmed content is invisible to everyone (D22).

---

## 14. Document impact

All of the following are **applied** — `PRD.md` is at v0.6 and `ARD.md` at v0.4.

| Document | Change |
|---|---|
| **v0.6 / v0.4 — access model revision** | `PRD.md` §3 and §7.8 and AC-16 rewritten for roles-without-scope, no levels and no overrides; `ARD.md` §19.2 replaced; §14 and §17 updated |
| `PRD.md` §4 | Multi-user and role management move from Non-Goals to Goals, with a dated reversal note |
| `PRD.md` §3 | Users section rewritten: multiple roles, not one analyst |
| `PRD.md` §7 | New subsections for access control, comments, confirmation, and activity reporting; §7.7 rewritten from "export" to "reports" |
| `PRD.md` §9 | NFR-3 rewritten; NFR-11 withdrawn; new NFRs for audit, responsiveness and backup |
| `PRD.md` §10 | INV-1…INV-6 unchanged |
| `PRD.md` §11 | AC-8 and AC-14 rewritten; new criteria for delegation, comment routing and audit |
| `ARD.md` §13.1 | "No ORM/database" amended (D2) |
| `ARD.md` §13.5 | Export access section replaced by the report access model |
| `ARD.md` §14 | Security & Access rewritten around one credential system |
| `ARD.md` §16 | New volumes, new backup job, removed export env vars |
| `ARD.md` new §19 | Identity, RBAC, comments and audit — the architecture |
