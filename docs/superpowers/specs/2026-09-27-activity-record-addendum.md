# Activity Record — P3 Addendum

| | |
|---|---|
| **Date** | 2026-09-27 |
| **Status** | Design approved by lili section by section, 2026-09-27; this text awaits her review |
| **Amends** | `2026-08-04-multi-user-rbac-design.md` — adjusts **D8**, **D42**, **D43**, **D44**, **D60**; resolves D42's *"emitted on navigation"*; leaves D45's purge unbuilt |
| **Unchanged** | D41, D45's append-only rule, D59 (the outbox — already built in P4), and the whole of §3–§7 |
| **Builds on** | `2026-09-21-comments-routing-addendum.md` (D62–D75) and `2026-09-26-reports-reading-withdrawn-addendum.md` |
| **Architecture** | `ARD.md` §13.2, §16 and §19.7 are updated to match in the P3 plan |

---

## 1. Why

P3 is the last phase of the RBAC decomposition, and it is built after P4 although
the table puts it before. Most of the record already exists: P0 created
`audit_events` and writes every access and governance event, P2 writes
`report.downloaded`, P4 writes every `comment.*` event and built D59's outbox and
its drain. What is missing is **what people read, what changed the content, how
long people were present, and the reports that read it all back**.

Three things moved under the spec since it was approved: in-app report reading
was withdrawn (P2), amendments became notes (P4, D72), and quantitative facts
arrived with confirmations of their own. The data-repo also gained commit kinds
D60 never named. This addendum records how P3 meets each, plus three owner
decisions: facts are covered, failed sign-ins get their own tab, and backups stay
on the server.

## 2. The catalogue

### D76 — The catalogue as built (adjusts D42)

**Removed:** `report.viewed` — nothing can write it since reading was withdrawn.
`comment.amended` — replaced by `comment.noted` (D72).

**Added:**

| Event | Target | Written when |
|---|---|---|
| `department.edited` | department code | overview saved, order changed — in the app or by a commit |
| `fact.edited` | fact id (`F-00001`) | a fact is created, changed or removed — by the facts screen or by a commit |
| `projection.discontinuity` | — | the projection finds its marker is not an ancestor of `HEAD` (D79) |
| `login.throttled` | attempted username | already written by P0's sign-in throttle; recorded here so the catalogue is complete |

`process.edited`, `department.edited` and `fact.edited` carry
`detail.change` ∈ `created` · `updated` · `deleted`, so creation and deletion need
no events of their own.

A `fact.edited` event's department is the first department its `scope` names; a
universal fact names none and is therefore a `*`-only event under D44.

**Still not written, deliberately:** `session.expired` (D42 derives it) and
`role.created/changed/deleted` (D50).

### D77 — View events are written by the server (resolves D42)

D42 says view events are *"emitted on navigation"*. They are written by the
server, when it answers the request a screen makes, never reported by the
browser — a browser that skipped the report would make readership optional.

| Request | Event |
|---|---|
| `GET /api/processes/{pid}` | `process.viewed` |
| `GET /api/departments/{code}/processes` | `department.viewed` |
| `GET /api/departments/{code}/overview` | `department.viewed` |

**Once per session per target per 30 minutes**, checked against `audit_events`
itself (a new `(session_id, at)` index), so it survives a restart. The same
window absorbs fetches that are not navigation — the comment composer loading the
process already on screen, a refetch on window focus. Facts screens write no view
events: they are Panel-only, and readership is a question about readers.

### D78 — Edits made in the app are recorded (D48)

| Endpoint | Event |
|---|---|
| `POST /api/processes`, `PUT /{pid}`, `DELETE /{pid}`, `POST /{pid}/relayout`, `POST /{pid}/pending/{i}` | `process.edited` |
| `PUT /api/departments/{code}/overview`, `PUT /{code}/order` | `department.edited` |
| `POST /api/facts/{fid}/resolve` | `fact.edited` |

`ui-edit` commits gain an **`Acted-By: {username}`** trailer. ARD §13.2 already
says every write is attributed *"in the activity record and in the commit
trailer"*; neither was true for content writes until now.

**`session.revoked`** is written once per session ended by a password change, an
administrator setting a password, or disabling a user. D42 lists it; nothing
wrote it.

## 3. The git projection

### D79 — The projection as built (adjusts D60)

`ui-backend` walks `git log --no-merges {marker}..HEAD` in the data-repo, every
30 seconds in the loop that already drains the outbox, and before every
activity-report query. The event's time is the commit's.

**What a commit touched:**

| Path | Event, one per id per commit |
|---|---|
| `departments/{d}/processes/{pid}.json` | `process.edited` |
| `departments/{d}/overview.json`, `departments/{d}/order.json` | `department.edited` |
| `facts/{measurements,records,rules,notes}.json` | `fact.edited` — the file is compared before and after the commit, entry by entry, because facts share aggregate files |

**Who the actor is** — the subject prefix decides, since the server authors
`chat-edit` and `ui-edit` commits under the same git identity:

| Commit | Actor |
|---|---|
| `pipeline(…)` | `run:{dept}/{stamp}`, from the `runs/{dept}/{stamp}/` directory the commit touches — the subject carries no stamp |
| `quantify(…)` | `run:facts/{dept}/{stamp}`, from `runs/facts/{dept}/{stamp}/` |
| `chat-edit`, `restructure`, `audit-fix`, `edit-fact` | `agent:control-bot` |
| `ui-edit` | **no edit event** — the endpoint already wrote one with the real user (D78) |
| anything else | `git:{author name}` — a person's commit, e.g. a `reset` |

`--no-merges` walks the commits a merge brings in, each once, and never the merge
itself, whose diff against its first parent would count them twice.

**Discontinuity.** If the stored marker is not an ancestor of `HEAD`, the
projection writes one `projection.discontinuity`, re-seeds at `HEAD`, and emits
nothing for the gap (D60, unchanged; the event makes the gap visible).

**First start.** The marker is seeded at `HEAD`, so no history is projected.

### D80 — A confirmation going stale is checked at HEAD (adjusts D60)

Whenever `HEAD` has moved, the projection recomputes the fingerprint of **every**
confirmation row — processes and departments (`fingerprint`), facts
(`fact_fingerprint`); a few hundred rows at most — and compares it with the
stored one.

- A new mismatch writes **`confirmation.invalidated`**, credited to the newest
  commit in the batch that touched the target, and sets `emitted_for_sha` so the
  same transition is never announced twice.
- A match on a row carrying `emitted_for_sha` clears it silently: the content is
  back to what was vouched for, so the confirmation is valid again (D60).
- **`ui-edit` commits are included.** D60 skips them for edit events; skipping
  them here too would mean a save in the app never announces the confirmation it
  broke.
- **Seeding marks rows that are already stale** with the seed's `HEAD`, so the
  first pass does not announce old invalidations as new ones.

**Ceiling, accepted:** staleness is measured against the content at `HEAD`, not
at each commit, so when two commits land within one 30-second pass the event is
credited to the later. Per-commit fingerprints would mean reading every
confirmed document out of every commit.

## 4. Presence and backups

### D81 — Presence as built (D43)

A new `activity_intervals (session_id, started_at, ended_at)` table. **Every
signed-in request** extends its session's open interval when that interval ended
at most 5 minutes ago, and opens a new one otherwise — so an interval ends at its
last request by construction, which is D43's backdating.

The heartbeat is the session descriptor itself: the SPA refetches
`GET /api/auth/me` every **60 seconds**, and TanStack Query pauses that refetch
while the tab is hidden, which is the whole of D43's honesty rule. Active time is
`Σ(ended_at − started_at)`.

### D82 — Backups stay on the server (adjusts D8)

**Owner decision: a server folder only.** `ui-backend`'s background loop takes a
SQLite `.backup` of `app.db` and `comments.db` at the `git-push` times (11:00 and
23:00) into `/backups`, bind-mounted from `/opt/inja/backups` on the host. The
newest **14** of each are kept, mode `0600` — `app.db` is a file of password
hashes. Whether a slot is due is read from the newest file's name, so a restart
neither skips nor repeats one.

**Not a `state-backup` container**, although ARD §16 names one: a second
container would have to mount `app.db`, which D5 forbids and §11 test 20 asserts
against.

**This protects against a corrupted database or a bad deploy, not against losing
the host.** NFR-16's *off-site* half remains unmet for `app.db` and
`comments.db`; the runbooks keep the recipe for copying a backup off the server
by hand, and say so.

## 5. The reports

### D83 — Five tabs, and who sees them (adjusts D44)

All `GET /api/activity/…`, gated on `view_audit`; each drains the outbox and runs
the projection first.

| Tab | Row | Columns |
|---|---|---|
| «فعالیت هر کاربر» | a user | sign-ins · failures · sessions · active time · last seen — opens the one-user page |
| «مشاهده دپارتمان» | a department | readers · views · downloads · most-viewed process · last opened |
| «تاریخچهٔ مجوزها» | a governance event | date · actor · subject · field · before → after |
| «مسیر کامنت‌ها» | a comment | CMT · department · author · state · holder · days waiting |
| «ورود ناموفق» | a username × IP | attempts · first · last |

Plus the design's four count cards — active users, views, failed sign-ins,
comments awaiting — and the **one-user page**: its four stat cards and that
user's events, filtered by day, kind (access · content · governance) and outcome.

- **Views** are `department.viewed` + `process.viewed`; **readers** are distinct
  actors with either; **downloads** are `report.downloaded`.
- **Holder** follows D63 — the named Reader supervisor, the Admin pool, or the
  Editors once approved — in the hop wording the comment screens already use. **Days waiting** runs from the comment's latest
  routing event in `comment_events`. The tab never carries comment text — the
  record is operational, comments are private (D44).
- **Scope:** the users, permissions and failed-sign-in tabs and the one-user page
  are access and governance events, so they need `view_audit` at `*`; the
  department and comment tabs show only the departments the caller's
  `view_audit` scope covers. Moot today — every holder is `*` — and right for a
  scoped Admin.

### D84 — Design resolutions

1. **«ورود ناموفق» is a fifth tab.** The design defines its columns and filters
   but lists four tabs, leaving it unreachable; D44 makes it its own report, and
   it is the only detection surface there is. Owner decision.
2. **The department tab has no report-kind filter.** With reading withdrawn only
   downloads have a kind, so the filter would narrow one column. The
   «خوانده‌شده / اصلاً باز نشده» filter stays. Owner decision.
3. **Event labels attach to the names the code writes**, not the design's older
   names (`role.changed`, `grant.added`, `grant.revoked`, `process.confirmed`,
   `session.expired`). New events get Persian labels confirmed by the owner.
4. **Placement:** «گزارش فعالیت کاربران» joins the admin menu between «کاربران»
   and «سیاست نمایش محتوا», as the design places it, for any `view_audit`
   holder. Nothing already in the menu moves.
5. **Phone width:** the tables scroll horizontally inside their own container;
   the page never does.

### D85 — Not built

- **D45's purge job.** Retention is indefinite (D45, §13); a purge is a
  scheduled job to add when that decision is made, never a button.
- **The content-and-confirmation-history report** (§13). The events it needs
  now exist; the report does not.

## 6. Storage

One `app.db` migration:

- `activity_intervals (id, session_id, started_at, ended_at)`, indexed on
  `session_id`;
- index `audit_session ON audit_events (session_id, at)`;
- `confirmations.emitted_for_sha TEXT` (nullable);
- `projection_state` — one row holding the marker sha.

`comments.db` is unchanged.

## 7. Tests

The P3 items of spec §11, as they apply after this addendum:

- **16** every state-changing endpoint writes an event — now including D78's;
- **16b** each commit kind in D79 yields its actor; a second pass emits nothing;
  one `confirmation.invalidated` per transition, including after a `ui-edit`;
- **16c** every event in D76's catalogue has a writer;
- **16d, 16e** unchanged — P0's tests for them stay as they are;
- **19** no endpoint alters or deletes a record row, acting as an Editor;
- **20** `app.db` is mounted only into `ui-backend`, in both compose files;
- **27** a hidden tab stops accumulating; an interval ends at its last request;
- **28** D83's scope rule, both directions;
- **29** a backup restores to a readable copy of **both** files, and rotation
  keeps 14.

Added by this addendum: the D77 window (one event per session per target per 30
minutes, a second session counts separately); the `Acted-By` trailer; `fact.edited`
from a commit names exactly the changed entries; and §11 test 9's body scan
extended to every `/api/activity` endpoint.
