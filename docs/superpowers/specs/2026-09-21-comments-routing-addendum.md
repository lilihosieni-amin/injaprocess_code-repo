# Comments — Routing, Visibility and Notes Addendum

| | |
|---|---|
| **Date** | 2026-09-21 |
| **Status** | Approved by lili, 2026-09-21 (routing and visibility; then notes, anchors and design resolutions in a second round the same day) |
| **Amends** | `2026-08-04-multi-user-rbac-design.md` — replaces D34, D35, D37 and D40; adjusts D30, D31, D33, D38, D42 and §1.2 |
| **Unchanged** | D32, D39, D59 and the rest of §7 (D36 adjusted by D73) |
| **Design** | `ui/design/Inja Reader.dc.html`, `ui/design/Inja Panel.dc.html` (at `3e5794e`), with the resolutions of §7 |

---

## 1. Why

The approved spec routes a comment up the supervisor tree until the next hop
would hold `edit`, and shows an Admin only their own branch. The organisation
works the other way: **Admins are the gate to the Editor**, they oversee every
comment in their scope, and a Reader supervisor is one step on the way rather
than an observer of their whole subtree.

Nobody rewrites anyone's words: an approver may add a **note** beside the
author's comment, never change it.

## 2. Who is an Admin

### D62 — "Admin" means `manage_users` without `edit`

The comment rules below name three kinds of person: **Reader** (no
`manage_users`), **Admin** (`manage_users` and not `edit`) and **Editor**
(`edit`).

A capability held only by Admins is not possible: roles are nested
(Reader ⊂ Admin ⊂ Editor) and D13 requires a created user's capabilities to be a
subset of the creator's, so an Editor lacking an Admin-only capability could no
longer create Admins. The classification is therefore derived from the
capabilities the roles already carry — no seed change, no new capability.

## 3. Routing

### D63 — Reader supervisors, then the Admin pool, then the Editors (replaces D34)

```
Reader ──► Reader supervisor(s), one at a time ──► Admin pool ──► Editors (inbox)
   │                                                   ▲
   └────────────── no supervisor ──────────────────────┘
```

1. **Reader stage.** A comment by a Reader climbs the author's supervisor edges
   one hop at a time, and only while the next hop is a **Reader**. At each hop
   only the named current approver may approve or reject (D69).
2. **Entering the pool.** The climb stops at the first hop that is not a Reader
   (an Admin or an Editor), or when the current user has no supervisor. The
   comment then enters the **Admin pool**. A Reader's supervisor being an Editor
   does not skip the pool.
3. **Admin pool.** Every **active** Admin whose scope covers the comment's
   department (D65) may approve or reject it. The first to act decides; the
   comment stores no named approver while in the pool. **Editors cannot act at
   this stage.**
4. **Approval.** An Admin's approval makes the comment `approved`: it is in the
   Editors' inbox and returned by the CLI (D39).
5. **An Admin author** skips the pool. Their comment is `approved` at
   submission — an Admin's word is already Admin-approved.
6. **No Admin available.** If, when a comment enters the pool, no active Admin
   covers its department, it becomes `approved` and the trail records *"Admin
   stage skipped — no Admin available"*. A comment already in the pool whose
   last covering Admin is disabled moves on the same way. Delivered beats stuck.
7. **Kept from D34.** A disabled Reader supervisor is skipped and recorded
   (*"hop skipped — supervisor disabled"*); comments sitting with a user who is
   disabled move on automatically. The next hop is computed live from the tree
   as it stands; approvals already given are never re-attributed. Routing tracks
   visited hops and, on revisiting one, sends the comment to the pool with
   *"chain broken — cycle"*.
8. **Rejection** returns the comment to the author with a required, non-empty
   reason. D36 governs what the author may then do.

The Editor still gets no composer (D11): an Editor is never an author.

### D64 — The trail records the pool as one hop

The approval trail names **who** acted at the pool stage (the Admin who
approved or rejected), not the pool's membership. Admins who could have acted
and did not leave no row. While the comment waits in the pool, the trail's
waiting hop reads **«ادمین‌ها»** with the state **«در انتظار تأیید یکی از
ادمین‌ها»**.

## 4. Notes instead of amendments

### D69 — Approve, approve with a note, or reject (replaces D35)

An approver — a Reader supervisor at their hop, or an Admin in the pool — may:

- **approve**: the comment moves on (D63);
- **approve with a note**: the same, and the approver's note is attached;
- **reject**: with a required reason; the comment returns to the author.

**There is no amendment.** The word *amend* (اصلاح کامنت / اصلاح متن) appears
nowhere in the UI, the API or the data. The author's text is never changed by
anyone but the author (D36).

A **note** is the approver's own words, shown **beside** the author's comment —
below it, headed «{name} اضافه کرد:». **Every approver on the way may add one,
and all notes are kept**, in the order they were added: a supervisor's note and
then an Admin's note both reach the Editor with the original. A note is capped
at 2,000 characters and must be non-empty after trimming, like a comment.

A rejected comment is closed (D73); notes given before the rejection stay in
the trail as history, attached to the
approvals they were given with.

## 5. Visibility

### D65 — A comment's department

Every anchor resolves to exactly one department: `department` carries it;
`node` and `process` take it from the process id, and from the snapshot (D31)
when the process has since been tombstoned. Admin scope and pool membership are
judged against it.

### D66 — Who sees what (replaces D37)

| You are… | You see |
|---|---|
| the author | your own comments, their full trail and outcome — even after losing access to the department (as D34 already required) |
| a Reader supervisor | a comment **only from the moment it waits with you**; once you have acted on it, you keep seeing its trail to the end |
| an Admin | **every comment whose department is in your scope, at every stage**; you act only at the pool stage |
| an Editor | **every comment, at every stage, read-only** until it is `approved`; from then it is in your inbox and you may address it |
| anyone else | nothing |

**This rule governs every surface, not only the inbox**: the comment count on a
flowchart node, the count chip on a step, the comment drawers of a step, a
process and a department, and the floating button's count all count and list
only comments the viewer may see under this table. A viewer who is not the
author and not on the path sees no badge and no comment.

A Reader supervisor who was skipped (disabled at the time) never received the
comment and does not see it.

This reverses D37's *"an Admin scoped `*` still reads only their own branch"*:
overseeing every comment in scope is what the Admin role is for.

### D67 — Everyone who saw a comment sees how it ended (adjusts D38)

D38 holds with the audience of D66: the author, every Reader supervisor who
acted on it, every Admin whose scope covers it, and the Editors.

## 6. Adjustments to the rest of §7

### D70 — Three anchor kinds (adjusts D30, D31)

`node`, `process` and `department`. **`process_list` is dropped**: the design
puts one floating comment button on the process list and the department page,
and both open the department's comments. *"A process is missing from this
list"* is a department comment. The `department` snapshot stays the department
name (D31).

### D71 — No per-anchor limit (adjusts D33)

D33's *"one open comment per anchor"* is removed. An author may write as many
comments as they like, on anything. D33's *"amendments do not chain"* is
replaced by D69. The 2,000-character cap and the non-empty rule stay, and apply
to notes, rejection reasons and the addressing note too.

### D72 — Events (adjusts D42)

`comment.amended` is replaced by **`comment.noted`**, written when an approval
carries a note (alongside `comment.approved`, which is written for every
approval). The rest of D42's comment events are unchanged.

### D68 — Badges only; no "waiting longest" list (replaces D40)

Still in-app only. The badge counts what the viewer can act on now:

- a Reader supervisor — comments waiting with them by name;
- an Admin — every pool comment in their scope (the same comment counts on every
  covering Admin's badge until one acts);
- an Editor — `approved` comments not yet addressed.

**There is no "waiting longest" list in P4**; each inbox row shows its age, as
the design draws it. The design's «مسیر کامنت‌ها» audit tab is P3's.

## 7. Design resolutions

The UI reproduces the two design files exactly, with the existing token system
(`ui/src/styles/tokens.css`, `roles.css`), except where the design contradicts
the rules above. lili decided each contradiction:

1. **Pool wording.** The design's trail and composer name a single Admin. The
   markup is kept; the words follow D63/D64. The composer's path line names the
   real route — the author's supervisor if any, then «یکی از ادمین‌ها», then
   «ادیتور».
2. **Editor composer.** The Panel's `canComment: true` is not followed: the
   Editor keeps the floating button and the drawers to read comments, never
   «کامنت تازه» or «کامنت روی این گام».
3. **Editor sees in-flight.** The Panel's editor filter (approved/addressed only)
   is not followed. The editor's «همه» tab lists in-flight comments with the
   design's no-action box («در این سطح کاری لازم نیست»); «رسیده به شما» stays
   approved only.
4. **Visibility everywhere.** The design's «همه» tab for a Reader supervisor and
   its node badges, step chips and drawers for every reader are not followed;
   D66 governs them.
5. **Notes.** The Reader design's note model is the one: the approver writes
   into «اصلاح شما زیر کامنت او اضافه می‌شود…»'s textarea — reworded to
   «یادداشت شما کنار کامنت او اضافه می‌شود…» — and the note shows under the
   original as «{name} اضافه کرد:». The Panel's replace-the-text flow
   («اصلاح متن», «متن اصلاح‌شده توسط …», «ثبت اصلاح و تأیید») becomes the same
   note flow, drawn in the Panel's own styling: «افزودن یادداشت» and
   «ثبت یادداشت و تأیید». Flow drawers show the author's text, never a
   replacement.
6. **Anchors.** Three kinds (D70).
7. **No "waiting longest"** (D68).
8. **Limits and states the design does not draw.** The server enforces the
   2,000-character cap; the client shows it with the design's toast pattern
   («متن بیشتر از ۲۰۰۰ نویسه است»). No counter. Loading and error states use the
   app's shared states (`ui/states`).
9. **Mistakes in the design files**, corrected silently: the Panel's confirm
   modal has no bound copy — it takes the Reader's copy, plus a *resolve*
   variant; the facts table pasted inside the Panel's department drawer is
   ignored; the Reader's two composers are one (the §1.10 design, the fixed
   380px composer).

### D73 — A rejected comment is closed (adjusts D36)

`rejected` is final, like `addressed`: the author may neither edit nor withdraw
it — the design's rule («نه ویرایش، نه پس گرفتن؛ اگر لازم است کامنت تازه
بگذارد»). With no per-anchor limit (D71) a new comment costs the author
nothing. D36's table therefore reads: edit and withdraw only while `awaiting`
with no approvals. An edit restarts routing at hop one («اصلاح شد و زنجیره از
اول شروع شد»). The *revise and restart* path of D35 is gone.

### D74 — The server refuses an Editor author

Creating a comment as a holder of `edit` answers 403 (`access.denied`). The
hidden composer (§7.2) is the UI's half; D48 requires the server's.

### D75 — The «همه» tab pages by ten

Every inbox tab named «همه» / «همهٔ کامنت‌ها» is paged on the server, **ten
comments per page**, with the app's shared `Pager`. The other tabs (what waits
for the viewer, the viewer's own) and the per-process and per-department lists
behind the drawers and badges are not paged.

## 8. Decomposition (adjusts §1.2)

P4 no longer depends on P3. P0 already built `audit_events` and its writer,
which record every `comment.*` event of D42/D72. The outbox of D59 moves into
P4, since `comment.addressed` is its only consumer.

| | Sub-project | Depends on |
|---|---|---|
| **P4** | Comments, approval chain, `comments` CLI, the outbox and its drain | P0, P1 |

## 9. Testing additions

- A Reader whose supervisor is an Editor enters the pool, not the inbox.
- A Reader with no supervisor enters the pool.
- Any covering Admin may act on a pool comment; a non-covering Admin and an
  Editor are refused (403, `access.denied`).
- An Admin's own comment is `approved` at submission.
- With no active covering Admin, a comment entering the pool becomes `approved`
  with the skip recorded; disabling the last covering Admin moves a waiting
  comment the same way.
- A Reader supervisor does not see a subordinate's comment before it reaches
  them, and still sees it after they approved it and it moved on.
- A viewer who is neither author nor on the path gets zero on every count
  (node, step, process, department, floating button) and no comment in any
  list.
- A `dept:dining` Admin sees dining comments at every stage and no cashier
  comment.
- An Editor sees an in-flight comment and cannot approve, reject or address it
  until it is `approved`.
- A supervisor's note and then an Admin's note both reach the Editor, in order,
  beside the unchanged original; `comment.noted` is recorded for each.
- An author may hold several open comments on the same node.
- No endpoint, field or UI string contains an amendment.
